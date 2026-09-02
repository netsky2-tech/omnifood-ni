import { useQuery } from "@tanstack/react-query";
import {
  fetchValuation,
  fetchCogs,
  fetchKardex,
  fetchAlerts,
} from "./inventory-api";
import type { KardexFilters } from "./types";

export function useValuation() {
  return useQuery({
    queryKey: ["inventory", "valuation"],
    queryFn: () => fetchValuation(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCogs(from?: string, to?: string) {
  return useQuery({
    queryKey: ["inventory", "cogs", from, to],
    queryFn: () => fetchCogs(from, to),
    staleTime: 5 * 60 * 1000,
  });
}

export function useKardex(filters: KardexFilters = {}) {
  return useQuery({
    queryKey: ["inventory", "kardex", filters],
    queryFn: () => fetchKardex(filters),
    staleTime: 2 * 60 * 1000,
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ["inventory", "alerts"],
    queryFn: () => fetchAlerts(),
    staleTime: 2 * 60 * 1000,
  });
}
