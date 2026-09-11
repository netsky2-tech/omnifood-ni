import { useAuthStore } from "@/features/auth/auth-store";
import {
  type AppPermission,
  hasEffectivePermission,
} from "./types";

/**
 * Checks whether the currently authenticated user in the auth store
 * has the requested permission, taking into account role defaults
 * and custom per-user permission overrides.
 */
export function useHasPermission(permission: AppPermission | string): boolean {
  const user = useAuthStore((s) => s.user);
  return hasEffectivePermission(user, permission);
}
