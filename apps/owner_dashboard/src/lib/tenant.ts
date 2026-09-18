import { create } from "zustand";
import { useAuthStore } from "@/features/auth/auth-store";
import type { Tenant } from "@/types";

interface TenantContextStore {
  tenant: Tenant | null;
  resolvedFrom: "login" | "slug" | null;
  resolveFromLogin: (tenant: Tenant) => void;
  resolveFromSlug: (tenant: Tenant) => void;
  clear: () => void;
}

export const useTenantContext = create<TenantContextStore>((set) => ({
  tenant: null,
  resolvedFrom: null,
  resolveFromLogin: (tenant) => set({ tenant, resolvedFrom: "login" }),
  resolveFromSlug: (tenant) => set({ tenant, resolvedFrom: "slug" }),
  clear: () => set({ tenant: null, resolvedFrom: null }),
}));

/**
 * Derives tenant context from the auth store or tenant context.
 */
export function getActiveTenant(): Tenant | null {
  return useAuthStore.getState().tenant ?? useTenantContext.getState().tenant;
}

export function getActiveTenantId(): string {
  return getActiveTenant()?.id ?? "";
}

/**
 * Hook to retrieve active tenant ID for reactive partitioning of query keys.
 */
export function useTenantId(): string {
  const authTenant = useAuthStore((s) => s.tenant);
  const contextTenant = useTenantContext((s) => s.tenant);
  return authTenant?.id ?? contextTenant?.id ?? "";
}
