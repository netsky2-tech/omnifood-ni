import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BcnFxRate } from './entities/bcn-fx-rate.entity';
import { FxRateResolver } from './inventory-purchase.service';

const BCN_ENDPOINT = 'https://servicios.bcn.gob.ni/Tc_Servicio/ServicioTC.asmx';
const BCN_NAMESPACE = 'http://servicios.bcn.gob.ni/';
const DEFAULT_BCN_TIMEOUT_SECONDS = 5;
const SCALE_4 = 4;

interface ParsedBcnMonthlyRate {
  effectiveDate: string;
  rateNio: number;
}

interface BcnTransportConfig {
  endpointUrl: string;
  timeoutMs: number;
  usesProxy: boolean;
}

export interface BcnFxRateLookup {
  invoiceDate: string;
  effectiveDate: string;
  rateNio: number;
}

@Injectable()
export class FxRateResolverService implements FxRateResolver {
  private readonly logger = new Logger(FxRateResolverService.name);

  constructor(
    @InjectRepository(BcnFxRate)
    private readonly bcnFxRateRepository: Repository<BcnFxRate>,
    private readonly configService: ConfigService,
  ) {}

  async getBcnRateByInvoiceDate(invoiceDate: string): Promise<BcnFxRateLookup> {
    const canonicalInvoiceDate = this.normalizeInvoiceDateInput(invoiceDate);
    const rate = await this.findPersistedRate(canonicalInvoiceDate);

    if (rate) {
      return {
        invoiceDate: canonicalInvoiceDate,
        effectiveDate: rate.effective_date,
        rateNio: Number(rate.rate_nio),
      };
    }

    const fetchedRate = await this.fetchAndPersistMonthlyRate(
      canonicalInvoiceDate,
    );

    if (fetchedRate) {
      return fetchedRate;
    }

    throw new NotFoundException(
      `No official BCN FX rate found for invoiceDate ${canonicalInvoiceDate}`,
    );
  }

  async resolveBcnRateByDate(invoiceDate: string): Promise<number> {
    const rate = await this.getBcnRateByInvoiceDate(invoiceDate);
    return rate.rateNio;
  }

  private async findPersistedRate(
    invoiceDate: string,
  ): Promise<BcnFxRate | null> {
    return this.bcnFxRateRepository.findOne({
      where: { effective_date: invoiceDate },
    });
  }

  private async fetchAndPersistMonthlyRate(
    invoiceDate: string,
  ): Promise<BcnFxRateLookup | null> {
    try {
      const monthlyRates = this.parseMonthlyResponse(
        await this.fetchMonthlyRates(invoiceDate),
      );
      const exactDateRate = monthlyRates.find(
        (rate) => rate.effectiveDate === invoiceDate,
      );

      if (!exactDateRate) {
        return null;
      }

      await this.bcnFxRateRepository.upsert(
        {
          effective_date: exactDateRate.effectiveDate,
          rate_nio: exactDateRate.rateNio,
        },
        ['effective_date'],
      );

      return {
        invoiceDate,
        effectiveDate: exactDateRate.effectiveDate,
        rateNio: exactDateRate.rateNio,
      };
    } catch (error) {
      this.logger.warn(
        `BCN FX lookup failed for invoiceDate ${invoiceDate}: ${this.describeError(error)}`,
      );
      return null;
    }
  }

  private async fetchMonthlyRates(invoiceDate: string): Promise<string> {
    const { endpointUrl, timeoutMs } = this.getTransportConfig();
    const { month, year } = this.getMonthParts(invoiceDate);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `${BCN_NAMESPACE}RecuperaTC_Mes`,
        },
        body: this.buildMonthlySoapEnvelope(month, year),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`BCN transport returned HTTP ${response.status}`);
      }

      return response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  getTransportConfig(): BcnTransportConfig {
    const proxyUrl = this.configService.get<string>('BCN_PROXY_URL')?.trim();

    return {
      endpointUrl: proxyUrl || BCN_ENDPOINT,
      timeoutMs: this.getTimeoutMs(),
      usesProxy: Boolean(proxyUrl),
    };
  }

  parseMonthlyResponse(responseXml: string): ParsedBcnMonthlyRate[] {
    const directRates = this.parseRateItems(responseXml);

    if (directRates.length > 0) {
      return directRates;
    }

    const innerXml = this.extractAnyWrappedXml(responseXml);
    return innerXml ? this.parseRateItems(innerXml) : [];
  }

  private getTimeoutMs(): number {
    const configuredTimeout = Number(
      this.configService.get<string | number>('BCN_TIMEOUT'),
    );
    const timeoutSeconds =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_BCN_TIMEOUT_SECONDS;

    return timeoutSeconds * 1000;
  }

  private buildMonthlySoapEnvelope(month: number, year: number): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RecuperaTC_Mes xmlns="${BCN_NAMESPACE}">
      <Mes>${month}</Mes>
      <Ano>${year}</Ano>
    </RecuperaTC_Mes>
  </soap:Body>
</soap:Envelope>`;
  }

  private getMonthParts(invoiceDate: string): { month: number; year: number } {
    const [year, month] = invoiceDate.split('-').map(Number);
    return { month, year };
  }

  private normalizeInvoiceDateInput(invoiceDate: string): string {
    const trimmedInvoiceDate = invoiceDate.trim();
    const isoDate = trimmedInvoiceDate.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);

    return isoDate ? isoDate[1] : trimmedInvoiceDate;
  }

  private parseRateItems(xml: string): ParsedBcnMonthlyRate[] {
    const tcNodes = [
      ...xml.matchAll(/<(?:\w+:)?Tc\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Tc>/gi),
    ];

    return tcNodes
      .map((node) => this.parseRateItem(node[1]))
      .filter((rate): rate is ParsedBcnMonthlyRate => rate !== null);
  }

  private parseRateItem(itemXml: string): ParsedBcnMonthlyRate | null {
    const dateValue = this.extractTagValue(itemXml, 'Fecha');
    const rateValue =
      this.extractTagValue(itemXml, 'Valor') ??
      this.extractTagValue(itemXml, 'Tasa') ??
      this.extractTagValue(itemXml, 'TipoCambio');

    if (!dateValue || !rateValue) {
      return null;
    }

    const effectiveDate = this.normalizeBcnDate(dateValue);
    const rateNio = Number(rateValue.replace(/,/g, ''));

    if (!effectiveDate || !Number.isFinite(rateNio) || rateNio <= 0) {
      return null;
    }

    return {
      effectiveDate,
      rateNio: Number(rateNio.toFixed(SCALE_4)),
    };
  }

  private extractAnyWrappedXml(responseXml: string): string | null {
    const anyNode = responseXml.match(
      /<(?:\w+:)?any\b[^>]*>([\s\S]*?)<\/(?:\w+:)?any>/i,
    );

    return anyNode ? this.decodeXmlEntities(anyNode[1]) : null;
  }

  private extractTagValue(xml: string, tagName: string): string | null {
    const tagExpression = new RegExp(
      `<(?:\\w+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tagName}>`,
      'i',
    );
    const match = xml.match(tagExpression);

    return match ? this.decodeXmlEntities(match[1]).trim() : null;
  }

  private normalizeBcnDate(value: string): string | null {
    const trimmedValue = value.trim();
    const isoDate = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (isoDate) {
      return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
    }

    const dayFirstDate = trimmedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (!dayFirstDate) {
      return null;
    }

    const [, day, month, year] = dayFirstDate;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  private decodeXmlEntities(value: string): string {
    return value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  private describeError(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown BCN transport error';
  }
}
