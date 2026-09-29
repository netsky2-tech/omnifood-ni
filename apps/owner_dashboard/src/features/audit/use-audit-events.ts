import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import { fetchAuditSummary } from "@/features/dashboard/dashboard-api";
import { fetchAuditEvents } from "./audit-api";
import type { AuditSeverity } from "./types";

/**
 * Feature-scoped query keys (`audit` family, tenant-partitioned). Audit
 * events are written synchronously by the backend during ingestion, so a
 * 60s staleTime keeps the oversight view fresh without hammering the
 * backend on every navigation.
 */

export interface AuditEventFilters {
  startDate?: string;
  endDate?: string;
  severity?: AuditSeverity;
}

export function useAuditEvents(filters: AuditEventFilters, limit: number) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["audit", tenantId, "events", filters, limit],
    queryFn: ({ signal }) => fetchAuditEvents({ ...filters, limit }, { signal }),
    staleTime: 60 * 1000,
  });
}

/**
 * Executive summary strip (counts + generatedAt). Reuses the existing
 * dashboard client — the same GET /operations/audit/summary the attention
 * band reads; never a duplicated call surface.
 */
export function useAuditSummary(startDate?: string, endDate?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["audit", tenantId, "summary", startDate, endDate],
    queryFn: ({ signal }) => fetchAuditSummary(startDate ?? "", endDate ?? "", { signal }),
    staleTime: 60 * 1000,
  });
}
