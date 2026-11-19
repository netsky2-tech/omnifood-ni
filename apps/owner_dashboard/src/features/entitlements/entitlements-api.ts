import { api } from "@/lib/api";

/**
 * Tenant entitlements snapshot — backend contract v1 (ENT-02):
 * GET /api/tenant/entitlements with a 24h TTL sealed in `expiresAt`
 * (docs/plans/entitlements/catalogo_capacidades_v1.md §9).
 */
export interface EntitlementsSnapshot {
  version: number;
  planCode: string;
  status: string;
  supportTier: string;
  capabilities: string[];
  limits: Record<string, number | null>;
  addOns: string[];
  issuedAt: string;
  expiresAt: string;
}

export const ENTITLEMENTS_ENDPOINT = "/tenant/entitlements";

/**
 * The backend seals the envelope with a 24h TTL; the React Query staleTime
 * mirrors it so the dashboard does not hammer the endpoint on every mount.
 */
export const ENTITLEMENTS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Explicit no-plan state (catalog §6.4): a tenant without a subscription
 * receives the core only — never "all capabilities".
 */
export const SIN_PLAN_STATUS = "sin_plan";

/**
 * Safe fallback when the snapshot is missing, refused or unreadable:
 * no premium capabilities at all (catalog §6.6 — fail closed, never
 * everything-allowed).
 */
export function emptyEntitlements(): EntitlementsSnapshot {
  const now = new Date().toISOString();
  return {
    version: 1,
    planCode: SIN_PLAN_STATUS,
    status: SIN_PLAN_STATUS,
    supportTier: "standard",
    capabilities: [],
    limits: {},
    addOns: [],
    issuedAt: now,
    expiresAt: now,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Defensive normalization: anything that does not carry a capabilities array
 * is not a snapshot and must be discarded (fail closed), never coerced into
 * "everything allowed".
 */
export function normalizeEntitlements(payload: unknown): EntitlementsSnapshot | null {
  if (!isRecord(payload)) return null;
  if (!Array.isArray(payload.capabilities)) return null;

  const capabilities = payload.capabilities.filter(
    (key): key is string => typeof key === "string" && key.trim().length > 0,
  );

  const limits: Record<string, number | null> = {};
  if (isRecord(payload.limits)) {
    for (const [key, value] of Object.entries(payload.limits)) {
      if (typeof key !== "string" || key.trim().length === 0) continue;
      if (value === null) {
        limits[key] = null; // unlimited (catalog §9)
      } else if (typeof value === "number" && Number.isFinite(value)) {
        limits[key] = value;
      }
      // Anything else is dropped: an unreadable limit is not a blocker.
    }
  }

  return {
    version: typeof payload.version === "number" ? payload.version : 1,
    planCode: typeof payload.planCode === "string" ? payload.planCode : SIN_PLAN_STATUS,
    status: typeof payload.status === "string" ? payload.status : SIN_PLAN_STATUS,
    supportTier: typeof payload.supportTier === "string" ? payload.supportTier : "standard",
    capabilities,
    limits,
    addOns: Array.isArray(payload.addOns)
      ? payload.addOns.filter((key): key is string => typeof key === "string")
      : [],
    issuedAt: typeof payload.issuedAt === "string" ? payload.issuedAt : "",
    expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : "",
  };
}

export async function fetchEntitlements(): Promise<EntitlementsSnapshot> {
  const raw = await api.get<unknown>(ENTITLEMENTS_ENDPOINT);
  // A malformed payload resolves to the safe empty snapshot; request failures
  // propagate to React Query so the hook can apply the same fallback.
  return normalizeEntitlements(raw) ?? emptyEntitlements();
}
