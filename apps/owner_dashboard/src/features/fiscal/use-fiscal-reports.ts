import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import {
  fetchMonthlyFiscalSummary,
  fetchVoidedInvoices,
  fetchSequenceAudit,
  fetchSalesBookExport,
  fetchZReportsExport,
} from "./fiscal-api";

export function useMonthlyFiscalSummary(year?: number, month?: number) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["fiscal", tenantId, "monthlySummary", year, month],
    queryFn: ({ signal }) => fetchMonthlyFiscalSummary(year, month, { signal }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useVoidedInvoices(startDate?: string, endDate?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["fiscal", tenantId, "voidedInvoices", startDate, endDate],
    queryFn: ({ signal }) => fetchVoidedInvoices(startDate, endDate, { signal }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSequenceAudit(startDate?: string, endDate?: string, terminalId?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["fiscal", tenantId, "sequenceAudit", startDate, endDate, terminalId],
    queryFn: ({ signal }) => fetchSequenceAudit(startDate, endDate, terminalId, { signal }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSalesBookExport(startDate?: string, endDate?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["fiscal", tenantId, "salesBookExport", startDate, endDate],
    queryFn: ({ signal }) => fetchSalesBookExport(startDate, endDate, undefined, { signal }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useZReportsExport(startDate?: string, endDate?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["fiscal", tenantId, "zReportsExport", startDate, endDate],
    queryFn: ({ signal }) => fetchZReportsExport(startDate, endDate, undefined, { signal }),
    staleTime: 2 * 60 * 1000,
  });
}
