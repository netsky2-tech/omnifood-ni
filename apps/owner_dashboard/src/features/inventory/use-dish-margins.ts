import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import { fetchDishMargins } from "./dish-margins";

/**
 * R28 / M5 — the per-dish cost surface, with the period of the SECOND
 * figure ("what the dish actually cost when it was sold").
 *
 * The period is part of the cache key: two periods are two different
 * questions, and the figures must never be mixed.
 */
export function useDishMargins(period?: { from?: string; to?: string }) {
  const tenantId = useTenantId();
  const from = period?.from ?? null;
  const to = period?.to ?? null;
  return useQuery({
    queryKey: ["inventory", tenantId, "dish-margins", from, to],
    queryFn: ({ signal }) => fetchDishMargins({ from: from ?? undefined, to: to ?? undefined }, { signal }),
    staleTime: 5 * 60 * 1000,
  });
}
