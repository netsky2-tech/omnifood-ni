import { api } from "@/lib/api";
import type {
  MonthlyFiscalSummary,
  VoidedInvoicesReport,
  SequenceAuditReport,
  SalesBookExport,
  ZReportsExport,
} from "./types";

function toQueryParams(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export function fetchMonthlyFiscalSummary(year?: number, month?: number) {
  return api.get<MonthlyFiscalSummary>(
    `/sales/reports/fiscal/monthly-summary${toQueryParams({ year, month })}`,
  );
}

export function fetchVoidedInvoices(startDate?: string, endDate?: string) {
  return api.get<VoidedInvoicesReport>(
    `/sales/reports/fiscal/voided-invoices${toQueryParams({ startDate, endDate })}`,
  );
}

export function fetchSequenceAudit(startDate?: string, endDate?: string, terminalId?: string) {
  return api.get<SequenceAuditReport>(
    `/sales/reports/fiscal/sequence-audit${toQueryParams({ startDate, endDate, terminalId })}`,
  );
}

export function fetchSalesBookExport(startDate?: string, endDate?: string, format?: string) {
  return api.get<SalesBookExport>(
    `/sales/reports/export/sales-book${toQueryParams({ startDate, endDate, format })}`,
  );
}

export function fetchZReportsExport(startDate?: string, endDate?: string, format?: string) {
  return api.get<ZReportsExport>(
    `/sales/reports/export/z-reports${toQueryParams({ startDate, endDate, format })}`,
  );
}
