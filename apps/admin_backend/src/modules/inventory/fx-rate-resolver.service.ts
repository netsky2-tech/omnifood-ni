import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { BcnFxRate } from './entities/bcn-fx-rate.entity';
import { FxRateResolver } from './inventory-purchase.service';

export interface BcnFxRateLookup {
  invoiceDate: string;
  effectiveDate: string;
  rateNio: number;
}

@Injectable()
export class FxRateResolverService implements FxRateResolver {
  constructor(
    @InjectRepository(BcnFxRate)
    private readonly bcnFxRateRepository: Repository<BcnFxRate>,
  ) {}

  async getBcnRateByInvoiceDate(invoiceDate: string): Promise<BcnFxRateLookup> {
    const rate = await this.bcnFxRateRepository.findOne({
      where: { effective_date: invoiceDate },
    });

    if (!rate) {
      throw new NotFoundException(
        `No official BCN FX rate found for invoiceDate ${invoiceDate}`,
      );
    }

    return {
      invoiceDate,
      effectiveDate: rate.effective_date,
      rateNio: Number(rate.rate_nio),
    };
  }

  async resolveBcnRateByDate(invoiceDate: string): Promise<number> {
    const rate = await this.getBcnRateByInvoiceDate(invoiceDate);
    return rate.rateNio;
  }
}
