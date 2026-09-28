import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import { approveCorrection, fetchPendingCorrections } from "./kardex-api";

/**
 * Feature-scoped query key (`kardex` family, tenant-partitioned). Kardex
 * truth depends on POS synchronization, so a 60s staleTime keeps the
 * approval queue fresh without hammering the backend on every navigation.
 */
export function useKardexQueue() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["kardex", tenantId, "pending-corrections"],
    queryFn: ({ signal }) => fetchPendingCorrections({ signal }),
    staleTime: 60 * 1000,
  });
}

export function useApproveCorrection() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (input: { queueId: string }) => approveCorrection(input),
    // The queue is the single source of pending items; after a successful
    // approval the backend marked the row COMPLETED (and the pending route
    // excludes COMPLETED), so refetch instead of surgically editing cache.
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["kardex", tenantId, "pending-corrections"],
      });
    },
  });
}
