export interface MonthlyFiscalSummary {
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

export interface VoidedInvoiceItem {
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

export interface VoidedInvoicesReport {
  startDate?: string;
  endDate?: string;
  totalVoidedCount: number;
  totalVoidedAmount: number;
  generatedAt: string;
  invoices: VoidedInvoiceItem[];
}

export interface SequenceAuditSeries {
  seriesPrefix: string;
  startSequence: number;
  endSequence: number;
  expectedCount: number;
  actualCount: number;
  missingSequences: number[];
  duplicateSequences: number[];
  hasGaps: boolean;
}

export interface SequenceAuditReport {
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
  series: SequenceAuditSeries[];
  generatedAt: string;
}

export interface SalesBookRow {
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

export interface SalesBookExport {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  totalRecords: number;
  totalGrossNio: number;
  totalTaxNio: number;
  totalExemptNio: number;
  records: SalesBookRow[];
}

export interface ZReportRow {
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

export interface ZReportsExport {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  totalRecords: number;
  records: ZReportRow[];
}
