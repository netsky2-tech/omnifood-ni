/**
 * ENT-02 — effective capability resolution, catalog §6 of issue #984.
 *
 * Pure and synchronous on purpose: the rules that decide what a tenant may
 * use are the most consequential code in this feature, so they are testable
 * without a database, a clock or a Nest context. The service reads rows and
 * hands them here; this module never queries.
 *
 * Every failure mode is fail-closed: an unknown plan, an unknown add-on, an
 * override pointing at a key no guard may touch, or a malformed override all
 * throw instead of degrading into "everything allowed" (ODD S1/S4).
 */
import {
  ADD_ON_CODES,
  NUCLEUS_CAPABILITY_KEYS,
  findCapability,
  findPlan,
  getPlanInclusions,
  type SupportTier,
} from './capability-registry';

/** Version of the snapshot contract served by `GET /api/tenant/entitlements`. */
export const ENTITLEMENT_CONTRACT_VERSION = 1;

/**
 * Snapshot lifetime. Short enough that a downgrade takes effect the same day,
 * long enough that an offline POS keeps working through a full shift plus
 * closing (catalog §6.6: the sale never depends on it).
 */
export const ENTITLEMENT_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * `sin_plan` is not a plan: it is the explicit state of a tenant with no
 * subscription at all, and it NEVER means "all capabilities" (catalog §6.4).
 */
export type EntitlementStatus = 'active' | 'suspended' | 'expired' | 'sin_plan';

/** The subscription row as the resolver needs it, without TypeORM noise. */
export interface SubscriptionInput {
  plan_code: string;
  status: string;
  starts_at: Date;
  ends_at: Date | null;
  add_ons: string[];
  support_tier: string;
}

/** An override row as the resolver needs it. */
export interface OverrideInput {
  capability_key: string;
  value_json: Record<string, unknown>;
  expires_at: Date;
}

export interface EntitlementResolutionInput {
  /** The subscription in effect, or `null` when the tenant has none. */
  subscription: SubscriptionInput | null;
  /** Candidate overrides; the resolver keeps only the ones still in force. */
  overrides: OverrideInput[];
  now?: Date;
}

export interface ResolvedEntitlements {
  status: EntitlementStatus;
  /** `null` only when there is no subscription at all. */
  planCode: string | null;
  supportTier: SupportTier;
  /** Effective keys: nucleus always, plus whatever the contract grants. */
  capabilities: string[];
  /** Every registered limit key, resolved. */
  limits: Record<string, number | null>;
  /** Add-on codes actually applied, in catalog order. */
  addOns: string[];
}

/** Hardware floor for a tenant with no subscription: never more than ESENCIAL. */
const SIN_PLAN_LIMITS: Record<string, number | null> = {
  'limits.terminals': 1,
  'limits.owner_accounts': 2,
};

const NUCLEUS_LIMITS: Record<string, number | null> = {
  'core.pos_users': null,
};

/**
 * A subscription is "in force" when it is active and its window contains now.
 * `ends_at` in the past wins over a stale `status` column, because the row is
 * historical data and the clock is the truth.
 */
const isInForce = (subscription: SubscriptionInput, now: Date): boolean =>
  subscription.status === 'active' &&
  subscription.starts_at.getTime() <= now.getTime() &&
  (subscription.ends_at === null ||
    subscription.ends_at.getTime() > now.getTime());

const deriveStatus = (
  subscription: SubscriptionInput,
  now: Date,
): EntitlementStatus => {
  if (subscription.status === 'suspended') return 'suspended';
  if (
    subscription.status === 'expired' ||
    (subscription.ends_at !== null &&
      subscription.ends_at.getTime() <= now.getTime())
  ) {
    return 'expired';
  }
  // A contract that has not started yet grants nothing premium either.
  return isInForce(subscription, now) ? 'active' : 'expired';
};

/** Reads an override value, rejecting shapes nobody defined. */
const readFlagOverride = (
  capabilityKey: string,
  valueJson: Record<string, unknown>,
): boolean => {
  const included = valueJson.included;
  if (typeof included !== 'boolean') {
    throw new Error(
      `OVERRIDE_VALUE_INVALID: override for gated flag "${capabilityKey}" needs {"included": boolean}, got ${JSON.stringify(valueJson)}`,
    );
  }
  return included;
};

const readLimitOverride = (
  limitKey: string,
  valueJson: Record<string, unknown>,
): number | null => {
  const limit = valueJson.limit;
  if (limit === null) return null;
  if (typeof limit === 'number' && Number.isInteger(limit) && limit >= 0) {
    return limit;
  }
  throw new Error(
    `OVERRIDE_VALUE_INVALID: override for limit "${limitKey}" needs {"limit": non-negative integer | null}, got ${JSON.stringify(valueJson)}`,
  );
};

/**
 * Resolves what a tenant may actually use:
 *
 *   effective = base(plan) ∪ add-ons ∪ overrides in force      (catalog §6)
 *
 * Order matters and is the whole business rule: the plan grants, add-ons add,
 * overrides have the last word in both directions.
 */
export function resolveEffectiveCapabilities(
  input: EntitlementResolutionInput,
): ResolvedEntitlements {
  const now = input.now ?? new Date();
  const { subscription } = input;

  const inForce = input.overrides.filter(
    (row) => row.expires_at.getTime() > now.getTime(),
  );

  // Every override must target a registered, gateable key. This is what makes
  // catalog §7 structural instead of a code-review promise: a row that would
  // gate the fiscal path cannot even be resolved.
  for (const row of inForce) {
    const capability = findCapability(row.capability_key);
    if (!capability) {
      throw new Error(
        `CAPABILITY_KEY_NOT_REGISTERED: override targets "${row.capability_key}", which is not in the frozen catalog registry`,
      );
    }
    if (!capability.gated) {
      throw new Error(
        `OVERRIDE_TARGET_NOT_GATEABLE: override targets "${row.capability_key}", which no guard may touch (catalog §7)`,
      );
    }
  }

  if (!subscription) {
    return {
      status: 'sin_plan',
      planCode: null,
      supportTier: 'standard',
      capabilities: [...NUCLEUS_CAPABILITY_KEYS],
      limits: { ...NUCLEUS_LIMITS, ...SIN_PLAN_LIMITS },
      addOns: [],
    };
  }

  const status = deriveStatus(subscription, now);
  const plan = findPlan(subscription.plan_code);
  if (!plan) {
    throw new Error(
      `PLAN_CODE_NOT_IN_CATALOG: "${subscription.plan_code}" is not in the automatic catalog (ENTERPRISE is quoted manually, catalog §11)`,
    );
  }
  const inclusions = getPlanInclusions(plan.planCode);

  // Add-ons: unknown codes are rejected, never ignored — a typo in a contract
  // must surface as an error, not as a silently smaller tenant.
  const appliedAddOns: string[] = [];
  for (const code of subscription.add_ons) {
    if (!ADD_ON_CODES.some((addOn) => addOn.code === code)) {
      throw new Error(
        `ADD_ON_NOT_IN_CATALOG: "${code}" is not an add-on code of the frozen catalog (catalogo_capacidades_v1 §5)`,
      );
    }
    appliedAddOns.push(code);
  }

  const capabilities = new Set<string>(NUCLEUS_CAPABILITY_KEYS);
  const limits: Record<string, number | null> = {
    ...NUCLEUS_LIMITS,
    ...inclusions.limits,
  };

  if (status === 'active') {
    for (const key of inclusions.capabilities) capabilities.add(key);

    for (const code of appliedAddOns) {
      const addOn = ADD_ON_CODES.find((candidate) => candidate.code === code);
      if (addOn.effect.kind === 'capability') {
        capabilities.add(addOn.effect.capabilityKey);
        continue;
      }
      const current = limits[addOn.effect.limitKey];
      limits[addOn.effect.limitKey] =
        (typeof current === 'number' ? current : 0) + addOn.effect.increment;
    }
  }
  // Not in force: the only thing left is the nucleus, and the limits stay as
  // contracted (decision ENT-02: a payment slip must not strand hardware).

  for (const row of inForce) {
    const capability = findCapability(row.capability_key);
    if (capability.type === 'flag') {
      if (readFlagOverride(capability.key, row.value_json)) {
        capabilities.add(capability.key);
      } else {
        capabilities.delete(capability.key);
      }
      continue;
    }
    limits[capability.key] = readLimitOverride(capability.key, row.value_json);
  }

  return {
    status,
    planCode: plan.planCode,
    supportTier: inclusions.supportTier,
    capabilities: [...capabilities],
    limits,
    addOns: appliedAddOns,
  };
}
