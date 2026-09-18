import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import {
  fetchValuation,
  fetchCogs,
  fetchKardex,
  fetchAlerts,
} from "./inventory-api";
import type { KardexFilters } from "./types";

export function useValuation() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["inventory", tenantId, "valuation"],
    queryFn: ({ signal }) => fetchValuation({ signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCogs(from?: string, to?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["inventory", tenantId, "cogs", from, to],
    queryFn: ({ signal }) => fetchCogs(from, to, { signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useKardex(filters: KardexFilters = {}) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["inventory", tenantId, "kardex", filters],
    queryFn: ({ signal }) => fetchKardex(filters, { signal }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useAlerts() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["inventory", tenantId, "alerts"],
    queryFn: ({ signal }) => fetchAlerts({ signal }),
    staleTime: 2 * 60 * 1000,
  });
}
