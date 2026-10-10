/**
 * Frontend permission gating (Dashboard V2 Batch 6b — AG-06 / PRD AC-17).
 *
 * AG-06 gate finding: the backend `AppPermission` enum has no cost permission
 * yet, `PermissionsGuard` is not applied to the inventory report routes, and
 * `/identity/me` does not yet include a permissions array. Until that chain
 * lands server-side, this gate fails CLOSED: only OWNER has full cost
 * visibility; any other role must carry an explicit `inventory:cost_view`
 * grant to see COGS / Gross Margin figures.
 */
import { useAuthStore } from "./auth-store";
import type { User } from "@/types";

/** Canonical backend permission name (AppPermission-style `module:action`). */
export const INVENTORY_COST_VIEW = "inventory:cost_view";

/** Canonical backend permission to revoke a terminal device credential (B17-04). */
export const DEVICE_SYNC_REVOKE = "device_sync:revoke";

/** User shape once `/identity/me` starts carrying the permissions array. */
export type UserWithPermissions = User & { permissions?: string[] };

/**
 * Pure role/permission check so the gate is unit-testable without the store.
 * OWNER is always granted; every other role needs an explicit grant (either
 * the canonical lowercase form or the backend-enum-style upper case).
 */
export function canViewInventoryCost(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "OWNER") return true;
  const permissions = (user as UserWithPermissions).permissions;
  if (!Array.isArray(permissions)) return false;
  return (
    permissions.includes(INVENTORY_COST_VIEW) ||
    permissions.includes("INVENTORY_COST_VIEW")
  );
}

/**
 * Device revocation gate (B17-04): same fail-closed policy as the cost gate.
 * OWNER is always granted; every other role needs an explicit
 * `device_sync:revoke` grant (lowercase canonical or uppercase enum form).
 */
export function canRevokeDevice(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "OWNER") return true;
  const permissions = (user as UserWithPermissions).permissions;
  if (!Array.isArray(permissions)) return false;
  return (
    permissions.includes(DEVICE_SYNC_REVOKE) ||
    permissions.includes("DEVICE_SYNC_REVOKE")
  );
}

export function useCanViewInventoryCost(): boolean {
  const user = useAuthStore((s) => s.user);
  return canViewInventoryCost(user);
}

export function useCanRevokeDevice(): boolean {
  const user = useAuthStore((s) => s.user);
  return canRevokeDevice(user);
}
