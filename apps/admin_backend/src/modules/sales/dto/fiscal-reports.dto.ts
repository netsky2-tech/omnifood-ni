import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class MonthlyFiscalSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(12)
  month?: number;
}

export class VoidedInvoicesQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class SequenceAuditQueryDto {
  @IsOptional()
  @IsString()
  terminalId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export interface MonthlyFiscalSummaryReportDto {
  year: number;
  month: number;
  totalGrossSales: number;
  totalTaxableSales: number;
  totalExemptSales: number;
  totalTaxCollected: number;
  totalCreditNotes: number;
  totalCreditNotesTax: number;
  netTaxableSales: number;
  netTaxPayable: number;
  invoiceCount: number;
  creditNoteCount: number;
  generatedAt: string;
}

export interface VoidedInvoiceItemDto {
  id: string;
  number: string;
  total: number;
  subtotal: number;
  totalTax: number;
  voidReason: string;
  canceledAt: string;
  userId: string;
  cashierName: string;
}

export interface VoidedInvoicesReportDto {
  startDate?: string;
  endDate?: string;
  totalVoidedCount: number;
  totalVoidedAmount: number;
  generatedAt: string;
  invoices: VoidedInvoiceItemDto[];
}

export interface SequenceAuditSeriesDto {
  seriesPrefix: string;
  startSequence: number;
  endSequence: number;
  expectedCount: number;
  actualCount: number;
  missingSequences: number[];
  duplicateSequences: number[];
  hasGaps: boolean;
}

export interface FiscalSequenceAuditReportDto {
  terminalId?: string;
  startDate?: string;
  endDate?: string;
  startSequence: number;
  endSequence: number;
  expectedCount: number;
  actualCount: number;
  missingSequences: number[];
  duplicateSequences: number[];
  hasGaps: boolean;
  series: SequenceAuditSeriesDto[];
  generatedAt: string;
}
