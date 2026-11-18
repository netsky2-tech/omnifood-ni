import { useAuthStore } from "@/features/auth/auth-store";
import type { UserRole } from "@/types";

export type AppAction =
  | "promotions.write"
  | "modifiers.write"
  | "catalog.write"
  | "products.write"
  | "recipes.write"
  | "customers.write"
  | "customers.export"
  | "users.manage"
  | "fiscal.export"
  | "settings.configure"
  // Mirrors the backend permission 'sales:issue_credit_note'
  // (AppPermission.SALES_ISSUE_CREDIT_NOTE, B1c-2 slice A).
  | "creditNotes.issue"
  // Mirrors the backend @Roles(OWNER, MANAGER) on
  // POST /inventory/regularization/approve (batch 6 slice 6c).
  | "kardex.approve";

/**
 * Route access policy aligned with the authoritative NestJS backend guards:
 * - / (Dashboard): OWNER, MANAGER
 * - /sales: OWNER, MANAGER
 * - /cash: OWNER, MANAGER (cash-session oversight, mirrors backend
 *   CashShiftController list route roles)
 * - /audit: OWNER, MANAGER (audit event oversight, mirrors backend
 *   AuditSummaryController route roles)
 * - /inventory: OWNER, MANAGER, CASHIER (Kardex endpoint is open to CASHIER)
 * - /fiscal: OWNER, MANAGER
 * - /catalog: OWNER, MANAGER
 * - /products: OWNER, MANAGER
 * - /promotions: OWNER, MANAGER, CASHIER, WAITER (Read-only for staff)
 * - /modifiers: OWNER, MANAGER (management screen — pure configuration,
 *   every backend mutation requires OWNER or MANAGER and staff has no
 *   read-only job here, unlike /promotions)
 * - /recipes: OWNER, MANAGER
 * - /users: OWNER
 * - /customers: OWNER, MANAGER, CASHIER, WAITER
 * - /settings: OWNER, MANAGER
 * - /menu-qr: OWNER, MANAGER
 * - /kardex: OWNER, MANAGER (kardex regularization approval, mirrors backend
 *   RegularizationController pending/approve route roles)
 * - /devices: OWNER, MANAGER (B17-03 terminal fleet oversight, mirrors backend
 *   device-sync terminal listing route roles)
 */
export const ROUTE_ROLE_PERMISSIONS: Record<string, UserRole[]> = {
  "/": ["OWNER", "MANAGER"],
  "/sales": ["OWNER", "MANAGER"],
  "/cash": ["OWNER", "MANAGER"],
  "/audit": ["OWNER", "MANAGER"],
  "/inventory": ["OWNER", "MANAGER"],
  "/dish-margins": ["OWNER", "MANAGER"],
  "/fiscal": ["OWNER", "MANAGER"],
  "/catalog": ["OWNER", "MANAGER"],
  "/products": ["OWNER", "MANAGER"],
  "/promotions": ["OWNER", "MANAGER", "CASHIER", "WAITER"],
  "/modifiers": ["OWNER", "MANAGER"],
  "/recipes": ["OWNER", "MANAGER"],
  "/users": ["OWNER"],
  "/customers": ["OWNER", "MANAGER", "CASHIER", "WAITER"],
  "/loyalty": ["OWNER", "MANAGER"],
  "/settings": ["OWNER", "MANAGER"],
  "/menu-qr": ["OWNER", "MANAGER"],
  "/kardex": ["OWNER", "MANAGER"],
  "/devices": ["OWNER", "MANAGER"],
};

export const ACTION_ROLE_PERMISSIONS: Record<AppAction, UserRole[]> = {
  "promotions.write": ["OWNER", "MANAGER"],
  "modifiers.write": ["OWNER", "MANAGER"],
  "catalog.write": ["OWNER", "MANAGER"],
  "products.write": ["OWNER", "MANAGER"],
  "recipes.write": ["OWNER", "MANAGER"],
  "customers.write": ["OWNER", "MANAGER", "CASHIER"],
  "customers.export": ["OWNER", "MANAGER"],
  "users.manage": ["OWNER"],
  "fiscal.export": ["OWNER", "MANAGER"],
  "settings.configure": ["OWNER", "MANAGER"],
  "creditNotes.issue": ["OWNER", "MANAGER"],
  "kardex.approve": ["OWNER", "MANAGER"],
};

export function canAccessRoute(role: UserRole | undefined | null, path: string): boolean {
  const effectiveRole = role ?? "OWNER";
  // Normalize path (strip trailing slash)
  const normalized = normalizeRoutePath(path);
  const allowed = ROUTE_ROLE_PERMISSIONS[normalized];
  if (!allowed) return true; // Unspecified routes (e.g. 404) allowed
  return allowed.includes(effectiveRole);
}

export function normalizeRoutePath(path: string): string {
  return path === "/" ? "/" : path.replace(/\/$/, "");
}

/*
 * Premium route → capability keys (ENT-05b, issue #984).
 *
 * Authority: docs/plans/entitlements/catalogo_capacidades_v1.md §3/§9 and the
 * ENT-05 spec. COMPOSITION, NOT REPLACEMENT: the role check in
 * ROUTE_ROLE_PERMISSIONS always runs first (see evaluateRouteAccess); the
 * entitlement check only narrows access further for premium surfaces.
 *
 * ANY-of semantics: a route unlocks when the tenant holds at least one of the
 * listed capability keys. `core.*` keys are deliberately absent — catalog §7
 * forbids gating sales, invoices, cash shifts, customers, catalog, simple
 * inventory or dual-currency printing (rbac-premium.test.ts pins this).
 *
 * /inventory is intentionally NOT mapped: it hosts core tabs (insumos) plus
 * premium ones, so its premium tabs are gated per-surface through
 * SURFACE_PREMIUM_CAPABILITIES below.
 */
export const ROUTE_PREMIUM_CAPABILITIES: Record<string, string[]> = {
  "/promotions": ["promotions"],
  "/loyalty": ["loyalty"],
  "/recipes": ["inventory.cooking"],
  "/dish-margins": ["inventory.cooking"],
  "/kardex": ["inventory.retail"],
};

/*
 * Premium surfaces (tabs / form paths) that live inside routes which also
 * carry core functionality. Same contract as the route map; the UI renders a
 * PremiumLocked state for the surface when the tenant holds none of the keys.
 */
export const SURFACE_PREMIUM_CAPABILITIES: Record<string, string[]> = {
  "inventory.valuation": ["reports.margins"],
  "inventory.purchases": ["inventory.retail"],
  "inventory.suppliers": ["inventory.retail"],
  "promotions.convenio": ["promotions.convenio"],
};

export type RouteAccessResult =
  | { allowed: true }
  | { allowed: false; reason: "role" }
  | { allowed: false; reason: "entitlement"; capability: string };

export function isPremiumRoute(path: string): boolean {
  return normalizeRoutePath(path) in ROUTE_PREMIUM_CAPABILITIES;
}

/**
 * Composed access decision for a route: the ROLE check first (unchanged
 * RBAC), the ENTITLEMENT check second. A role denial must surface as the
 * existing unauthorized behavior; an entitlement denial carries the missing
 * capability so the UI can render the PremiumLocked upgrade copy.
 */
export function evaluateRouteAccess(
  role: UserRole | undefined | null,
  capabilities: readonly string[] | undefined | null,
  path: string,
): RouteAccessResult {
  if (!canAccessRoute(role, path)) {
    return { allowed: false, reason: "role" };
  }
  const required = ROUTE_PREMIUM_CAPABILITIES[normalizeRoutePath(path)];
  if (required && required.length > 0) {
    const held = capabilities ?? [];
    if (!required.some((key) => held.includes(key))) {
      return { allowed: false, reason: "entitlement", capability: required[0]! };
    }
  }
  return { allowed: true };
}

/** Boolean convenience over evaluateRouteAccess (role check runs first). */
export function canAccessPremiumRoute(
  role: UserRole | undefined | null,
  capabilities: readonly string[] | undefined | null,
  path: string,
): boolean {
  return evaluateRouteAccess(role, capabilities, path).allowed;
}

/**
 * Surface-level entitlement check for premium tabs/form paths inside core
 * routes. Unmapped surfaces are never gated; a missing capabilities list is
 * denied on mapped surfaces (fail closed, catalog §6.6).
 */
export function canAccessPremiumSurface(
  capabilities: readonly string[] | undefined | null,
  surface: string,
): boolean {
  const required = SURFACE_PREMIUM_CAPABILITIES[surface];
  if (!required) return true;
  const held = capabilities ?? [];
  return required.some((key) => held.includes(key));
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
