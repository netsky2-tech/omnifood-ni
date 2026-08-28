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
