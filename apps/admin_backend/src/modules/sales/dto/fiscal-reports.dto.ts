import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ZReportRowDto } from './sales-export.dto';

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

/**
 * G1 (issue #522 Finding 1) — Corte X query.
 *
 * RULING (roadmap D3/AC4, sales_cash_roadmap.md:16,:102): aggregation is
 * keyed on the SHIFT (cash_shift_sessions), not on a "fiscal day" — the
 * product has no fiscal-day concept (open question P8 in
 * docs/operations/preguntas-contadora-round-2.md). A shift is the unit;
 * there is deliberately no date-range filtering on X.
 *
 * All fields are optional: reports.controller.spec.ts installs no
 * ValidationPipe while test/sales/sales-reports.e2e-spec.ts installs
 * ValidationPipe({ whitelist, forbidNonWhitelisted, transform }) — every
 * field must survive both setups.
 */
export class XReportQueryDto {
  /** Narrow the reading to one specific shift (must belong to the tenant). */
  @IsOptional()
  @IsString()
  shiftId?: string;

  /** When absent, the tenant's open shift(s) are returned; narrows by terminal. */
  @IsOptional()
  @IsString()
  terminalId?: string;
}

/**
 * G1 (issue #522 Finding 1) — Corte Z query.
 *
 * RULING (roadmap D3/AC5, sales_cash_roadmap.md:16,:103): Z is the
 * definitive close view for CLOSED shifts, mirroring export/z-reports: a
 * date range filters `opened_at`, an optional shiftId narrows to one shift.
 * All fields optional — same ValidationPipe reasoning as XReportQueryDto.
 */
export class ZReportQueryDto {
  @IsOptional()
  @IsString()
  shiftId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

/** Per-type cash movement totals for the X reading (NIO + USD + count). */
export interface XReportCashMovementTypeTotalsDto {
  nio: number;
  usd: number;
  count: number;
}

/** Cash movement totals keyed by CashMovementType (X reading). */
export interface XReportCashMovementsDto {
  CASH_IN: XReportCashMovementTypeTotalsDto;
  CASH_OUT: XReportCashMovementTypeTotalsDto;
  PETTY_CASH: XReportCashMovementTypeTotalsDto;
  SAFE_DROP: XReportCashMovementTypeTotalsDto;
}

/**
 * Sales-by-method totals for the X reading (NIO, change-netted like the
 * dashboard's AG-08 reporting net). Key names mirror the dashboard's
 * PaymentMethodsBreakdownDto vocabulary (cashNio/cardNio/...).
 */
export interface XReportSalesByMethodDto {
  cashNio: number;
  cardNio: number;
  qrNio: number;
  pointsNio: number;
  otherNio: number;
}

/** One open shift's partial (non-closing) reading — the Corte X. */
export interface XReportShiftDto {
  shiftId: string;
  terminalId: string;
  cashier: string;
  openedAt: string;
  status: string;
  /**
   * Explicit non-closing marker (roadmap AC4): the X reading NEVER closes
   * the shift. Reporting is not closing — the hard close lives in
   * CashShiftService.closeShiftWithZReport, out of G1 scope.
   */
  closesShift: false;
  initialFloatNio: number;
  initialFloatUsd: number;
  cashMovements: XReportCashMovementsDto;
  salesByMethod: XReportSalesByMethodDto;
  expectedCashNio: number;
  expectedCashUsd: number;
}

/**
 * Corte X response (roadmap D3 :16, AC4 :102): partial sales and expected
 * cash WITHOUT closing the shift. Mirrors the POS precedent
 * (x_report_dialog.dart / formatCorteXText "AUDITORIA INTERNA - NO FISCAL").
 */
export interface XReportDto {
  generatedAt: string;
  closesShift: false;
  shifts: XReportShiftDto[];
}

/** Fiscal totals for one closed shift's invoices (G1 Corte Z).
 *  Key names reuse the sales-book (totalGrossNio/totalTaxNio/totalExemptNio)
 *  and monthly-summary (totalTaxableNio) vocabulary. */
export interface ZReportFiscalTotalsDto {
  totalGrossNio: number;
  totalTaxableNio: number;
  totalExemptNio: number;
  totalTaxNio: number;
}

/**
 * One CLOSED shift's definitive close view — the existing Z row shape
 * (ZReportRowDto) enriched with the supervisor, the shift's fiscal invoice
 * totals, and the DEC-04 reconciliation blocker SIGNAL (roadmap D4 :17,
 * DEC-04 :28). G1 reports the blocker; it never hard-fails: the hard block
 * belongs to the close action (CashShiftService.closeShiftWithZReport).
 */
export interface ZReportRecordDto extends ZReportRowDto {
  supervisorId: string | null;
  fiscalTotals: ZReportFiscalTotalsDto;
  blockedByUnreconciledPayments: boolean;
  unreconciledPaymentCount: number;
}

/**
 * Corte Z response (roadmap D3 :16, AC5 :103, DEC-04 :28). Mirrors the POS
 * precedent (z_report_dialog.dart / formatCorteXText "CIERRE FISCAL (CORTE
 * Z)", "SECUENCIA Z: #N").
 */
export interface ZReportDto {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  totalRecords: number;
  records: ZReportRecordDto[];
}
