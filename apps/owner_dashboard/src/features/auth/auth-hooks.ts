import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, clearTokens, hasStoredRefreshToken, refreshAccessToken, setTokens } from "@/lib/api";
import { useAuthStore } from "@/features/auth/auth-store";
import { useTenantContext } from "@/lib/tenant";
import type { LoginRequest, LoginResponse } from "@/types";

export function useLogin() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const resolveFromLogin = useTenantContext((s) => s.resolveFromLogin);

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const response = await api.post<LoginResponse>("/identity/login", credentials);
      setTokens({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      login(response.user, response.tenant);
      resolveFromLogin(response.tenant);
      return response;
    },
    onSuccess: () => {
      navigate("/");
    },
  });
}

export function useLogout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const clearTenant = useTenantContext((s) => s.clear);

  return () => {
    clearTokens();
    logout();
    clearTenant();
    navigate("/login");
  };
}

export function useAuthInitialization() {
  const { initialize, logout, hydrated } = useAuthStore();
  const resolveFromLogin = useTenantContext((s) => s.resolveFromLogin);

  return useQuery({
    queryKey: ["auth", "initialize"],
    queryFn: async () => {
      if (!hasStoredRefreshToken()) {
        logout();
        return null;
      }

      try {
        await refreshAccessToken();
        const response = await api.get<{
          user: NonNullable<ReturnType<typeof useAuthStore.getState>["user"]>;
          tenant: NonNullable<ReturnType<typeof useAuthStore.getState>["tenant"]>;
        }>("/identity/me");

        if (response.user && response.tenant) {
          initialize(response.user, response.tenant);
          resolveFromLogin(response.tenant);
          return response;
        }

        logout();
        return null;
      } catch {
        logout();
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled: !hydrated,
  });
}

export function useTenants() {
  return useQuery({
    queryKey: ["tenants"],
    queryFn: () => api.get<{ id: string; name: string; slug: string }[]>("/tenant"),
    staleTime: 30 * 60 * 1000,
  });
}

export function useInvalidateAuth() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["auth"] });
}
