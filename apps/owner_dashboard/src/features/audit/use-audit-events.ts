import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import { fetchAuditSummary } from "@/features/dashboard/dashboard-api";
import { fetchUsers } from "@/features/users/users-api";
import {
  fetchAuditEvents,
  fetchAuditIntegrity,
  fetchAuditLedger,
} from "./audit-api";
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

export function useAuditEvents(
  filters: AuditEventFilters,
  limit: number,
  enabled = true,
) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["audit", tenantId, "events", filters, limit],
    queryFn: ({ signal }) => fetchAuditEvents({ ...filters, limit }, { signal }),
    staleTime: 60 * 1000,
    enabled,
  });
}

/**
 * Executive summary strip (counts + generatedAt). Reuses the existing
 * dashboard client — the same GET /operations/audit/summary the attention
 * band reads; never a duplicated call surface.
 */
export function useAuditSummary(
  startDate?: string,
  endDate?: string,
  enabled = true,
) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["audit", tenantId, "summary", startDate, endDate],
    queryFn: ({ signal }) => fetchAuditSummary(startDate ?? "", endDate ?? "", { signal }),
    staleTime: 60 * 1000,
    enabled,
  });
}

/**
 * S4b — POS counter ledger (GET /operations/audit/ledger). A separate read
 * model from the change_log event stream above: both stay available, the
 * view picks which source to show. Only fetched while the ledger view is
 * active, so the platform view never pays for it.
 */
export interface AuditLedgerFilters {
  startDate?: string;
  endDate?: string;
  actorUserId?: string;
  targetType?: string;
}

export function useAuditLedger(
  filters: AuditLedgerFilters,
  limit: number,
  enabled = true,
) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["audit", tenantId, "ledger", filters, limit],
    queryFn: ({ signal }) => fetchAuditLedger({ ...filters, limit }, { signal }),
    staleTime: 60 * 1000,
    enabled,
  });
}

/**
 * S4b — nightly integrity report (GET /operations/audit/integrity). Only
 * fetched while the ledger view is active: a sequence gap is a POS-chain
 * signal, and the view must distinguish "no alerts" from "could not load".
 */
export function useAuditIntegrity(enabled = true) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["audit", tenantId, "integrity"],
    queryFn: ({ signal }) => fetchAuditIntegrity({ signal }),
    staleTime: 60 * 1000,
    enabled,
  });
}

/**
 * S4b — actor filter options for the ledger. Reuses the same users read the
 * settings module uses (shared query key + cache); disabled on the platform
 * view so the existing page surface is untouched. A failed read degrades to
 * "actor filter unavailable", never to a fabricated list.
 */
export function useAuditActors(enabled: boolean) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["users", tenantId],
    queryFn: ({ signal }) => fetchUsers({ signal }),
    staleTime: 60 * 1000,
    enabled,
  });
}
