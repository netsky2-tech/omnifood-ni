import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import {
  ENTITLEMENTS_TTL_MS,
  emptyEntitlements,
  fetchEntitlements,
  type EntitlementsSnapshot,
} from "./entitlements-api";

export const ENTITLEMENTS_QUERY_KEY = ["entitlements"] as const;

/**
 * Access to the tenant entitlements snapshot (ENT-05b).
 *
 * Failure semantics are fail closed: any request failure (4xx refusal,
 * network error) or missing data resolves to the empty snapshot — "no
 * premium capabilities", never "everything allowed" (catalog §6.6).
 *
 * `query` is read defensively (optional chaining) because some suites stub
 * the react-query module with a `useQuery` that returns undefined.
 */
export function useEntitlements() {
  const query = useQuery({
    queryKey: ENTITLEMENTS_QUERY_KEY,
    queryFn: fetchEntitlements,
    // Tied to the snapshot contract's 24h TTL (entitlements-api.ts).
    staleTime: ENTITLEMENTS_TTL_MS,
    // 4xx refusals (CAPABILITY_REQUIRED / QUOTA_EXCEEDED / auth) are terminal
    // answers about the plan, not transient failures: never retry them.
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const snapshot: EntitlementsSnapshot = query?.data ?? emptyEntitlements();

  const has = (capability: string): boolean => snapshot.capabilities.includes(capability);

  /** `null` means unlimited, both for an explicit null and an unknown key. */
  const limit = (key: string): number | null => {
    const value = snapshot.limits[key];
    return value === undefined ? null : value;
  };

  return {
    planCode: snapshot.planCode,
    status: snapshot.status,
    capabilities: snapshot.capabilities,
    /** True while the snapshot request has not settled yet. */
    isPending: (query?.isPending ?? true) as boolean,
    /** True when the snapshot came from the fallback, not the backend. */
    isFallback: !query?.data,
    has,
    limit,
  };
}
