import { IsOptional, IsString, IsIn } from 'class-validator';

export type ExportFormat = 'csv' | 'json' | 'xlsx' | 'pdf';

export class ExportSalesBookQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsIn(['csv', 'json', 'xlsx', 'pdf'])
  format?: ExportFormat;
}

export class ExportZReportsQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsIn(['csv', 'json', 'xlsx', 'pdf'])
  format?: ExportFormat;
}

export interface SalesBookRowDto {
  date: string;
  invoiceNumber: string;
  documentType: string;
  customerName: string;
  exemptSubtotalNio: number;
  taxableSubtotalNio: number;
  taxAmountNio: number;
  discountNio: number;
  /** Σ of this invoice's line discounts attributed to a manual origin (S1c-3c, same rule as the dashboard). */
  manualDiscountNio: number;
  /** Σ of this invoice's line discounts attributed to a promotion origin (S1c-3c). */
  promotionDiscountNio: number;
  /** Σ of this invoice's line discounts attributed to a loyalty redemption origin (S1c-3c). */
  loyaltyDiscountNio: number;
  /**
   * This invoice's line discounts with NO usable provenance: NULL/absent
   * breakdowns (legacy/unknown — never a fabricated zero) plus any residual
   * of a partial breakdown. Can be negative only when stored data
   * contradicts itself. S1c-3c identity per row:
   * manual + promotion + loyalty + unattributed === discountNio EXACTLY.
   */
  discountOriginUnattributedNio: number;
  totalNio: number;
  totalUsd: number;
  status: string;
  isCanceled: boolean;
}

export interface SalesBookExportDto {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  totalRecords: number;
  totalGrossNio: number;
  totalTaxNio: number;
  totalExemptNio: number;
  records: SalesBookRowDto[];
}

export interface ZReportRowDto {
  shiftId: string;
  closedAt: string;
  openedAt: string;
  terminalId: string;
  zSequence: number | null;
  cashierName: string;
  initialFloatNio: number;
  initialFloatUsd: number;
  expectedCashNio: number;
  expectedCashUsd: number;
  finalCountedNio: number | null;
  finalCountedUsd: number | null;
  differenceNio: number | null;
  differenceUsd: number | null;
  status: string;
  notes: string | null;
}

export interface ZReportsExportDto {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  totalRecords: number;
  records: ZReportRowDto[];
}

export interface ExportResult<T> {
  format: ExportFormat;
  filename: string;
  contentType: string;
  buffer?: Buffer;
  content?: string;
  data: T;
}
