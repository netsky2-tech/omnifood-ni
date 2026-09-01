import { create } from "zustand";
import type { Tenant, User } from "@/types";

interface AuthStore {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  setUser: (user: User) => void;
  setTenant: (tenant: Tenant) => void;
  login: (user: User, tenant: Tenant) => void;
  initialize: (user: User, tenant: Tenant) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  tenant: null,
  isAuthenticated: false,
  hydrated: false,
  setUser: (user) => set({ user }),
  setTenant: (tenant) => set({ tenant }),
  login: (user, tenant) => set({ user, tenant, isAuthenticated: true }),
  initialize: (user, tenant) =>
    set({ user, tenant, isAuthenticated: true, hydrated: true }),
  logout: () =>
    set({
      user: null,
      tenant: null,
      isAuthenticated: false,
      hydrated: true,
    }),
}));
