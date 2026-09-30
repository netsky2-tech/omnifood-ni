import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import {
  fetchValuation,
  fetchCogs,
  fetchKardex,
  fetchAlerts,
  fetchPurchases,
  fetchSuppliers,
  createSupplier,
  createManualPurchase,
} from "./inventory-api";
import type {
  KardexFilters,
  PurchaseFilters,
  CreateSupplierInput,
  ManualPurchaseInput,
} from "./types";

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

export function usePurchases(filters: PurchaseFilters = {}) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["inventory", tenantId, "purchases", filters],
    queryFn: ({ signal }) => fetchPurchases(filters, { signal }),
    staleTime: 2 * 60 * 1000,
  });
}

// --- SOHO purchases: manual web entry (human transport) ---

export function useSuppliers() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["inventory", tenantId, "suppliers"],
    queryFn: ({ signal }) => fetchSuppliers({ signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: (input: CreateSupplierInput) => createSupplier(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["inventory", tenantId, "suppliers"],
      });
    },
  });
}

export function useCreateManualPurchase() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: (input: ManualPurchaseInput) => createManualPurchase(input),
    onSuccess: () => {
      // Invalidate every purchases read (any filter set) so the new row
      // appears in the history tab without a manual reload.
      queryClient.invalidateQueries({
        queryKey: ["inventory", tenantId, "purchases"],
      });
    },
  });
}
