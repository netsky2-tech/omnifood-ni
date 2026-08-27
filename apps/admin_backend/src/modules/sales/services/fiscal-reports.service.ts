import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { User } from '../../identity/entities/user.entity';
import {
  FiscalSequenceAuditReportDto,
  MonthlyFiscalSummaryQueryDto,
  MonthlyFiscalSummaryReportDto,
  SequenceAuditQueryDto,
  SequenceAuditSeriesDto,
  VoidedInvoiceItemDto,
  VoidedInvoicesQueryDto,
  VoidedInvoicesReportDto,
} from '../dto/fiscal-reports.dto';

const round2 = (value: number): number =>
  Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));

@Injectable()
export class FiscalReportsService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getMonthlySummary(
    tenantId: string,
    query?: MonthlyFiscalSummaryQueryDto,
  ): Promise<MonthlyFiscalSummaryReportDto> {
    const { year, month, start, end } = this.resolveMonthBounds(
      query?.year,
      query?.month,
    );

    const invoices = await this.invoiceRepo.find({
      where: {
        tenant_id: tenantId,
        isCanceled: false,
        created_at: Between(start, end),
      },
      relations: ['items'],
      order: { created_at: 'ASC' },
    });

    let totalGrossSales = 0;
    let totalTaxableSales = 0;
    let totalExemptSales = 0;
    let totalTaxCollected = 0;

    let totalCreditNotes = 0;
    let totalCreditNotesTax = 0;

    let invoiceCount = 0;
    let creditNoteCount = 0;

    for (const inv of invoices) {
      const isCreditNote = inv.type === 'creditNote';

      if (isCreditNote) {
        creditNoteCount += 1;
        totalCreditNotes = round2(totalCreditNotes + Number(inv.total ?? 0));
        totalCreditNotesTax = round2(
          totalCreditNotesTax + Number(inv.totalTax ?? 0),
        );
      } else {
        invoiceCount += 1;
        totalGrossSales = round2(totalGrossSales + Number(inv.total ?? 0));
        totalTaxCollected = round2(
          totalTaxCollected + Number(inv.totalTax ?? 0),
        );

        if (inv.items && inv.items.length > 0) {
          for (const item of inv.items) {
            const itemTaxRate = Number(
              item.appliedTaxRate ?? item.originalTaxRate ?? 0,
            );
            const itemTaxAmount = Number(item.taxAmount ?? 0);
            const itemDiscount = Number(item.discount ?? 0);
            const itemBase = round2(
              Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0) -
                itemDiscount,
            );

            if (itemTaxRate > 0 || itemTaxAmount > 0) {
              totalTaxableSales = round2(totalTaxableSales + itemBase);
            } else {
              totalExemptSales = round2(totalExemptSales + itemBase);
            }
          }
        } else {
          const invTax = Number(inv.totalTax ?? 0);
          const invSubtotal = Number(inv.subtotal ?? 0);
          if (invTax > 0) {
            totalTaxableSales = round2(totalTaxableSales + invSubtotal);
          } else {
            totalExemptSales = round2(totalExemptSales + invSubtotal);
          }
        }
      }
    }

    const netTaxableSales = round2(
      totalTaxableSales - (totalCreditNotes - totalCreditNotesTax),
    );
    const netTaxPayable = round2(totalTaxCollected - totalCreditNotesTax);

    return {
      year,
      month,
      totalGrossSales: round2(totalGrossSales),
      totalTaxableSales: round2(totalTaxableSales),
      totalExemptSales: round2(totalExemptSales),
      totalTaxCollected: round2(totalTaxCollected),
      totalCreditNotes: round2(totalCreditNotes),
      totalCreditNotesTax: round2(totalCreditNotesTax),
      netTaxableSales: Math.max(0, netTaxableSales),
      netTaxPayable: Math.max(0, netTaxPayable),
      invoiceCount,
      creditNoteCount,
      generatedAt: new Date().toISOString(),
    };
  }

  async getVoidedInvoices(
    tenantId: string,
    query?: VoidedInvoicesQueryDto,
  ): Promise<VoidedInvoicesReportDto> {
    const { start, end } = this.parseDateBounds(
      query?.startDate,
      query?.endDate,
    );
    const whereClause: FindOptionsWhere<Invoice> = {
      tenant_id: tenantId,
      isCanceled: true,
    };

    if (start && end) {
      whereClause.created_at = Between(start, end);
    } else if (start) {
      whereClause.created_at = MoreThanOrEqual(start);
    } else if (end) {
      whereClause.created_at = LessThanOrEqual(end);
    }

    const invoices = await this.invoiceRepo.find({
      where: whereClause,
      order: { created_at: 'DESC' },
    });

    const users = await this.userRepo.find({
      where: { tenant_id: tenantId },
    });
    const userMap = new Map<string, string>();
    for (const u of users) {
      userMap.set(u.id, u.name);
    }

    let totalVoidedAmount = 0;
    const voidedList: VoidedInvoiceItemDto[] = invoices.map((inv) => {
      const total = Number(inv.total ?? 0);
      totalVoidedAmount = round2(totalVoidedAmount + total);
      const cashierName =
        userMap.get(inv.userId) || (inv.userId ? inv.userId : 'Desconocido');

      return {
        id: inv.id,
        number: inv.number,
        total: round2(total),
        subtotal: round2(Number(inv.subtotal ?? 0)),
        totalTax: round2(Number(inv.totalTax ?? 0)),
        voidReason: inv.voidReason || 'Sin motivo especificado',
        canceledAt: (inv.updated_at || inv.created_at).toISOString(),
        userId: inv.userId || 'unknown',
        cashierName,
      };
    });

    return {
      startDate: query?.startDate,
      endDate: query?.endDate,
      totalVoidedCount: voidedList.length,
      totalVoidedAmount: round2(totalVoidedAmount),
      generatedAt: new Date().toISOString(),
      invoices: voidedList,
    };
  }

  async getSequenceAudit(
    tenantId: string,
    query?: SequenceAuditQueryDto,
  ): Promise<FiscalSequenceAuditReportDto> {
    const { start, end } = this.parseDateBounds(
      query?.startDate,
      query?.endDate,
    );
    const whereClause: FindOptionsWhere<Invoice> = {
      tenant_id: tenantId,
    };

    if (start && end) {
      whereClause.created_at = Between(start, end);
    } else if (start) {
      whereClause.created_at = MoreThanOrEqual(start);
    } else if (end) {
      whereClause.created_at = LessThanOrEqual(end);
    }

    const invoices = await this.invoiceRepo.find({
      where: whereClause,
      order: { created_at: 'ASC' },
    });

    const seriesMap = new Map<string, number[]>();

    for (const inv of invoices) {
      if (!inv.number) continue;
      const { prefix, sequence } = this.parseInvoiceSequence(inv.number);

      if (query?.terminalId && !prefix.includes(query.terminalId)) {
        continue;
      }

      if (!seriesMap.has(prefix)) {
        seriesMap.set(prefix, []);
      }
      seriesMap.get(prefix).push(sequence);
    }

    const series: SequenceAuditSeriesDto[] = [];
    let globalStartSequence = 0;
    let globalEndSequence = 0;
    let globalExpectedCount = 0;
    let globalActualCount = 0;
    const globalMissingSequences: number[] = [];
    const globalDuplicateSequences: number[] = [];

    for (const [prefix, rawSequences] of seriesMap.entries()) {
      rawSequences.sort((a, b) => a - b);
      const startSequence = rawSequences.length > 0 ? rawSequences[0] : 0;
      const endSequence =
        rawSequences.length > 0 ? rawSequences[rawSequences.length - 1] : 0;
      const expectedCount =
        rawSequences.length > 0 ? endSequence - startSequence + 1 : 0;
      const actualCount = rawSequences.length;

      const seqCountMap = new Map<number, number>();
      for (const seq of rawSequences) {
        seqCountMap.set(seq, (seqCountMap.get(seq) ?? 0) + 1);
      }

      const duplicateSequences: number[] = [];
      for (const [seq, count] of seqCountMap.entries()) {
        if (count > 1) {
          duplicateSequences.push(seq);
        }
      }

      const missingSequences: number[] = [];
      if (rawSequences.length > 0) {
        for (let s = startSequence; s <= endSequence; s++) {
          if (!seqCountMap.has(s)) {
            missingSequences.push(s);
          }
        }
      }

      const hasGaps = missingSequences.length > 0;

      series.push({
        seriesPrefix: prefix,
        startSequence,
        endSequence,
        expectedCount,
        actualCount,
        missingSequences,
        duplicateSequences,
        hasGaps,
      });

      if (globalStartSequence === 0 || startSequence < globalStartSequence) {
        globalStartSequence = startSequence;
      }
      if (endSequence > globalEndSequence) {
        globalEndSequence = endSequence;
      }
      globalExpectedCount += expectedCount;
      globalActualCount += actualCount;
      globalMissingSequences.push(...missingSequences);
      globalDuplicateSequences.push(...duplicateSequences);
    }

    const hasGaps = globalMissingSequences.length > 0;

    return {
      terminalId: query?.terminalId,
      startDate: query?.startDate,
      endDate: query?.endDate,
      startSequence: globalStartSequence,
      endSequence: globalEndSequence,
      expectedCount: globalExpectedCount,
      actualCount: globalActualCount,
      missingSequences: globalMissingSequences,
      duplicateSequences: globalDuplicateSequences,
      hasGaps,
      series,
      generatedAt: new Date().toISOString(),
    };
  }

  private resolveMonthBounds(
    yearParam?: number,
    monthParam?: number,
  ): { year: number; month: number; start: Date; end: Date } {
    const now = new Date();
    const year =
      yearParam != null && yearParam >= 2000 ? yearParam : now.getUTCFullYear();
    const month =
      monthParam != null && monthParam >= 1 && monthParam <= 12
        ? monthParam
        : now.getUTCMonth() + 1;

    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    return { year, month, start, end };
  }

  private parseDateBounds(
    startDateStr?: string,
    endDateStr?: string,
  ): { start?: Date; end?: Date } {
    let start: Date | undefined;
    let end: Date | undefined;

    if (startDateStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
        start = new Date(`${startDateStr}T00:00:00.000Z`);
      } else {
        start = new Date(startDateStr);
      }
    }

    if (endDateStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
        end = new Date(`${endDateStr}T23:59:59.999Z`);
      } else {
        end = new Date(endDateStr);
      }
    }

    return { start, end };
  }

  private parseInvoiceSequence(invoiceNumber: string): {
    prefix: string;
    sequence: number;
  } {
    const trimmed = invoiceNumber.trim();
    const match = /^(.*?)(\d+)$/.exec(trimmed);
    if (match) {
      return {
        prefix: match[1] || 'DEFAULT',
        sequence: parseInt(match[2], 10),
      };
    }
    return {
      prefix: 'UNKNOWN',
      sequence: 0,
    };
  }
}
