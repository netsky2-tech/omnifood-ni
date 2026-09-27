import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import { fetchSyncFreshness } from "./dashboard-api";

/**
 * PRD FR-SYNC-05: default dashboard auto-refresh cadence is every 5 minutes.
 * The threshold itself (FR-SYNC-03) stays server-configured; this is only the
 * shared polling interval, never hardcoded per widget.
 */
export const SYNC_FRESHNESS_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Sync-freshness read model for the owner dashboard badge (PRD §20). Data is
 * cached per tenant and re-fetched every 5 minutes; failures surface as an
 * absent freshness state so the badge falls back to technical metadata
 * without fabricating a completeness conclusion (FR-SYNC-04).
 */
export function useSyncFreshness() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["sync-freshness", tenantId],
    queryFn: ({ signal }) => fetchSyncFreshness({ signal }),
    refetchInterval: SYNC_FRESHNESS_REFETCH_INTERVAL_MS,
    staleTime: SYNC_FRESHNESS_REFETCH_INTERVAL_MS,
  });
}
