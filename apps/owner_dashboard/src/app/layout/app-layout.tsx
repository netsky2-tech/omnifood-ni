import { useEffect } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/auth-store";
import { useTenantContext } from "@/lib/tenant";
import { onAuthExpired } from "@/lib/api";
import { ErrorBoundary } from "@/app/error-boundary";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrated = useAuthStore((s) => s.hydrated);
  const logout = useAuthStore((s) => s.logout);
  const clearTenant = useTenantContext((s) => s.clear);
  const queryClient = useQueryClient();

  useEffect(() => {
    return onAuthExpired(async () => {
      logout();
      clearTenant();
      await queryClient.cancelQueries();
      queryClient.clear();
    });
  }, [logout, clearTenant, queryClient]);

  if (hydrated && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1440px] w-full">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
