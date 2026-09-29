import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import { fetchCashSessions } from "./cash-api";
import type { CashShiftStatus } from "./types";

/**
 * Feature-scoped query key (`cash` family, tenant-partitioned). Cash data
 * depends on POS synchronization, so 60s staleTime keeps remote-verification
 * views fresh without hammering the backend on every navigation.
 */
export function useCashSessions(status?: CashShiftStatus, limit?: number) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["cash", tenantId, "sessions", status, limit],
    queryFn: ({ signal }) => fetchCashSessions(status, limit, { signal }),
    staleTime: 60 * 1000,
  });
}
