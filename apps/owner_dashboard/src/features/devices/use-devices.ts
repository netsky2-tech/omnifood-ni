import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import { fetchDevices } from "./devices-api";

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
