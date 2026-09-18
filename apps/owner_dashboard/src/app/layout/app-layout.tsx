import { useEffect, useRef } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
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
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Reset any browser window scroll (e.g. from mobile keyboard on login) and main container scroll
  useEffect(() => {
    window.scrollTo(0, 0);
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

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
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full h-[100dvh] overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col h-full min-w-0 overflow-hidden">
        <Header />
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-8"
        >
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
