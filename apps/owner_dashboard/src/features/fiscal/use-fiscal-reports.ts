import { useQuery } from "@tanstack/react-query";
import {
  fetchMonthlyFiscalSummary,
  fetchVoidedInvoices,
  fetchSequenceAudit,
  fetchSalesBookExport,
  fetchZReportsExport,
} from "./fiscal-api";

export function useMonthlyFiscalSummary(year?: number, month?: number) {
  return useQuery({
    queryKey: ["fiscal", "monthlySummary", year, month],
    queryFn: () => fetchMonthlyFiscalSummary(year, month),
    staleTime: 2 * 60 * 1000,
  });
}

export function useVoidedInvoices(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["fiscal", "voidedInvoices", startDate, endDate],
    queryFn: () => fetchVoidedInvoices(startDate, endDate),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSequenceAudit(startDate?: string, endDate?: string, terminalId?: string) {
  return useQuery({
    queryKey: ["fiscal", "sequenceAudit", startDate, endDate, terminalId],
    queryFn: () => fetchSequenceAudit(startDate, endDate, terminalId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSalesBookExport(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["fiscal", "salesBookExport", startDate, endDate],
    queryFn: () => fetchSalesBookExport(startDate, endDate),
    staleTime: 2 * 60 * 1000,
  });
}

export function useZReportsExport(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["fiscal", "zReportsExport", startDate, endDate],
    queryFn: () => fetchZReportsExport(startDate, endDate),
    staleTime: 2 * 60 * 1000,
  });
}
