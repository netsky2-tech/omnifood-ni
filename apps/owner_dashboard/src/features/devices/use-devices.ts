import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import { fetchDevices, revokeDevice } from "./devices-api";

/**
 * Terminal device credentials + sync-health snapshot (B17-03). Polled every
 * 30s so the oversight view tracks credential status and receipt freshness
 * without manual refresh; 15s staleTime avoids duplicate fetches on
 * navigation within the poll window.
 */
export function useDevices() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["devices", tenantId],
    queryFn: ({ signal }) => fetchDevices({ signal }),
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

/**
 * Revoke a terminal device credential (B17-04). Invalidates the tenant-scoped
 * devices snapshot so the oversight view reflects the REVOKED status without a
 * manual refresh.
 */
export function useRevokeDevice() {
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ credentialId, reason }: { credentialId: string; reason: string }) =>
      revokeDevice(credentialId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices", tenantId] });
    },
  });
}
