import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/features/auth/auth-store";
import {
  getDefaultRouteForRole,
  evaluateRouteAccess,
  isPremiumRoute,
} from "@/lib/rbac";
import { useEntitlements } from "@/features/entitlements/use-entitlements";
import { PremiumLocked } from "@/features/entitlements/premium-locked";
import type { UserRole } from "@/types";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
}

function GateSpinner({ testId }: { testId?: string }) {
  return (
    <div
      className="flex min-h-[400px] items-center justify-center"
      data-testid={testId}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

/**
 * ENT-05b premium gate: composes the entitlement check AFTER the role RBAC
 * (never replaces it). Mounted only on premium routes; while the snapshot is
 * in flight it shows a loading state instead of a premature denial, and a
 * failed request resolves to no-premium (fail closed, catalog §6.6).
 */
function PremiumRouteGate({ path, children }: { path: string; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const { capabilities, isPending } = useEntitlements();

  if (isPending) {
    return <GateSpinner testId="premium-gate-loading" />;
  }

  const access = evaluateRouteAccess(user?.role, capabilities, path);
  if (!access.allowed) {
    // Role denial keeps the existing unauthorized behavior (redirect to the
    // role's default route) — never the upgrade copy.
    if (access.reason === "role") {
      return <Navigate to={getDefaultRouteForRole(user?.role)} replace />;
    }
    return <PremiumLocked capability={access.capability} />;
  }

  return <>{children}</>;
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!hydrated) {
    return <GateSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && user && !requiredRoles.includes(user.role)) {
    const target = getDefaultRouteForRole(user.role);
    return <Navigate to={target} replace />;
  }

  // ENT-05b: direct navigation to a premium route renders the upgrade state
  // instead of the page. Unmapped (core) routes are untouched.
  if (isPremiumRoute(location.pathname)) {
    return <PremiumRouteGate path={location.pathname}>{children}</PremiumRouteGate>;
  }

  return <>{children}</>;
}
