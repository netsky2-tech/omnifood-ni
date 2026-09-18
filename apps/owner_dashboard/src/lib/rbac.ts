import { useAuthStore } from "@/features/auth/auth-store";
import type { UserRole } from "@/types";

export type AppAction =
  | "promotions.write"
  | "catalog.write"
  | "products.write"
  | "recipes.write"
  | "customers.write"
  | "customers.export"
  | "users.manage"
  | "fiscal.export"
  | "settings.configure";

/**
 * Route access policy aligned with the authoritative NestJS backend guards:
 * - / (Dashboard): OWNER, MANAGER
 * - /sales: OWNER, MANAGER
 * - /inventory: OWNER, MANAGER, CASHIER (Kardex endpoint is open to CASHIER)
 * - /fiscal: OWNER, MANAGER
 * - /catalog: OWNER, MANAGER
 * - /products: OWNER, MANAGER
 * - /promotions: OWNER, MANAGER, CASHIER, WAITER (Read-only for staff)
 * - /recipes: OWNER, MANAGER
 * - /users: OWNER
 * - /customers: OWNER, MANAGER, CASHIER, WAITER
 * - /settings: OWNER, MANAGER
 */
export const ROUTE_ROLE_PERMISSIONS: Record<string, UserRole[]> = {
  "/": ["OWNER", "MANAGER"],
  "/sales": ["OWNER", "MANAGER"],
  "/inventory": ["OWNER", "MANAGER"],
  "/fiscal": ["OWNER", "MANAGER"],
  "/catalog": ["OWNER", "MANAGER"],
  "/products": ["OWNER", "MANAGER"],
  "/promotions": ["OWNER", "MANAGER", "CASHIER", "WAITER"],
  "/recipes": ["OWNER", "MANAGER"],
  "/users": ["OWNER"],
  "/customers": ["OWNER", "MANAGER", "CASHIER", "WAITER"],
  "/settings": ["OWNER", "MANAGER"],
};

export const ACTION_ROLE_PERMISSIONS: Record<AppAction, UserRole[]> = {
  "promotions.write": ["OWNER", "MANAGER"],
  "catalog.write": ["OWNER", "MANAGER"],
  "products.write": ["OWNER", "MANAGER"],
  "recipes.write": ["OWNER", "MANAGER"],
  "customers.write": ["OWNER", "MANAGER", "CASHIER"],
  "customers.export": ["OWNER", "MANAGER"],
  "users.manage": ["OWNER"],
  "fiscal.export": ["OWNER", "MANAGER"],
  "settings.configure": ["OWNER", "MANAGER"],
};

export function canAccessRoute(role: UserRole | undefined | null, path: string): boolean {
  const effectiveRole = role ?? "OWNER";
  // Normalize path (strip trailing slash)
  const normalized = path === "/" ? "/" : path.replace(/\/$/, "");
  const allowed = ROUTE_ROLE_PERMISSIONS[normalized];
  if (!allowed) return true; // Unspecified routes (e.g. 404) allowed
  return allowed.includes(effectiveRole);
}

export function canPerformAction(role: UserRole | undefined | null, action: AppAction): boolean {
  const effectiveRole = role ?? "OWNER";
  const allowed = ACTION_ROLE_PERMISSIONS[action];
  return allowed ? allowed.includes(effectiveRole) : false;
}

export function getDefaultRouteForRole(role: UserRole | undefined | null): string {
  if (!role) return "/login";
  if (role === "OWNER" || role === "MANAGER") return "/";
  if (role === "CASHIER") return "/promotions";
  if (role === "WAITER") return "/promotions";
  return "/login";
}

export function useRbac() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role;

  return {
    role,
    canAccessRoute: (path: string) => canAccessRoute(role, path),
    canPerformAction: (action: AppAction) => canPerformAction(role, action),
    hasRole: (...allowed: UserRole[]) => (role ? allowed.includes(role) : false),
    defaultRoute: getDefaultRouteForRole(role),
  };
}
