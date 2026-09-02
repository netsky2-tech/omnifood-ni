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
 * Derives tenant context from the auth store.
 * When OD-03 lands, this will also check URL slug resolution.
 */
export function getActiveTenant(): Tenant | null {
  return useAuthStore.getState().tenant ?? useTenantContext.getState().tenant;
}
