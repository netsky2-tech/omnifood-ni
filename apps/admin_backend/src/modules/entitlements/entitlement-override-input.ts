/**
 * ENT-06 of issue #984 — the gate every override must pass before it is
 * written (catalog §6.3: an override is an audited exception with `actor`,
 * `motivo` and `expires_at` mandatory).
 *
 * Pure and clock-injected on purpose: the same rules must be provable in a
 * unit test, and the CLI that grants exceptions must not be able to weaken
 * them. Nothing here touches the database.
 *
 * Why fail closed on nucleus keys: catalog §7 forbids any plan rule from
 * touching the sale, the fiscal document or the cash shift. An override is a
 * plan rule with a person's name on it, so it is refused by the same reason —
 * not by convention, but by the registry's `gated` flag.
 */
import { findCapability } from './capability-registry';

/** Rejection codes, stable strings callers branch on. */
export const OVERRIDE_REJECTION_CODES = {
  CAPABILITY_KEY_NOT_REGISTERED: 'CAPABILITY_KEY_NOT_REGISTERED',
  OVERRIDE_TARGET_NOT_GATEABLE: 'OVERRIDE_TARGET_NOT_GATEABLE',
  OVERRIDE_VALUE_INVALID: 'OVERRIDE_VALUE_INVALID',
  OVERRIDE_ACTOR_REQUIRED: 'OVERRIDE_ACTOR_REQUIRED',
  OVERRIDE_REASON_REQUIRED: 'OVERRIDE_REASON_REQUIRED',
  OVERRIDE_EXPIRATION_REQUIRED: 'OVERRIDE_EXPIRATION_REQUIRED',
  OVERRIDE_ALREADY_ACTIVE: 'OVERRIDE_ALREADY_ACTIVE',
  OVERRIDE_NOT_ACTIVE: 'OVERRIDE_NOT_ACTIVE',
  OVERRIDE_WOULD_BREAK_SNAPSHOT: 'OVERRIDE_WOULD_BREAK_SNAPSHOT',
} as const;

export type OverrideRejectionCode =
  (typeof OVERRIDE_REJECTION_CODES)[keyof typeof OVERRIDE_REJECTION_CODES];

export class OverrideRejectedError extends Error {
  constructor(
    readonly code: OverrideRejectionCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'OverrideRejectedError';
  }
}

export interface OverrideGrantInput {
  readonly capabilityKey: string;
  readonly valueJson: Record<string, unknown>;
  readonly actor: string;
  readonly reason: string;
  readonly expiresAt: Date;
  /** Injected so callers and tests agree on what "future" means. */
  readonly now: Date;
}

export interface NormalizedOverrideGrant {
  readonly capabilityKey: string;
  readonly valueJson: Record<string, unknown>;
  readonly actor: string;
  readonly reason: string;
  readonly expiresAt: Date;
}

const reject = (code: OverrideRejectionCode, detail: string): never => {
  throw new OverrideRejectedError(code, detail);
};

const readFlagValue = (
  capabilityKey: string,
  valueJson: Record<string, unknown>,
): Record<string, unknown> => {
  if (typeof valueJson.included !== 'boolean') {
    reject(
      OVERRIDE_REJECTION_CODES.OVERRIDE_VALUE_INVALID,
      `the flag "${capabilityKey}" needs {"included": boolean}, got ${JSON.stringify(valueJson)}`,
    );
  }
  return { included: valueJson.included };
};

const readLimitValue = (
  capabilityKey: string,
  valueJson: Record<string, unknown>,
): Record<string, unknown> => {
  const limit = valueJson.limit;
  if (limit === null) return { limit: null };
  if (typeof limit === 'number' && Number.isInteger(limit) && limit >= 0) {
    return { limit };
  }
  return reject(
    OVERRIDE_REJECTION_CODES.OVERRIDE_VALUE_INVALID,
    `the quota "${capabilityKey}" needs {"limit": non-negative integer | null}, got ${JSON.stringify(valueJson)}`,
  );
};

/**
 * Validates and normalizes one grant. Throws `OverrideRejectedError` with a
 * stable code; never returns a partially valid grant.
 */
export function normalizeOverrideGrant(
  input: OverrideGrantInput,
): NormalizedOverrideGrant {
  const capabilityKey = input.capabilityKey?.trim() ?? '';
  const definition = capabilityKey ? findCapability(capabilityKey) : null;
  if (!definition) {
    reject(
      OVERRIDE_REJECTION_CODES.CAPABILITY_KEY_NOT_REGISTERED,
      `"${input.capabilityKey}" is not in the capability registry`,
    );
  }
  if (!definition.gated) {
    // `definition` is narrowed below by the reject() above returning never.
    reject(
      OVERRIDE_REJECTION_CODES.OVERRIDE_TARGET_NOT_GATEABLE,
      `"${capabilityKey}" is a nucleus key: no plan rule may touch it (catalog §7)`,
    );
  }

  const valueJson =
    definition.type === 'limit'
      ? readLimitValue(capabilityKey, input.valueJson ?? {})
      : readFlagValue(capabilityKey, input.valueJson ?? {});

  const actor = input.actor?.trim() ?? '';
  if (!actor) {
    reject(
      OVERRIDE_REJECTION_CODES.OVERRIDE_ACTOR_REQUIRED,
      'an override must name who authorized it (catalog §6.3)',
    );
  }

  const reason = input.reason?.trim() ?? '';
  if (!reason) {
    reject(
      OVERRIDE_REJECTION_CODES.OVERRIDE_REASON_REQUIRED,
      'an override must state why it was granted (catalog §6.3)',
    );
  }

  const expiresAt = input.expiresAt;
  if (
    !(expiresAt instanceof Date) ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= input.now.getTime()
  ) {
    reject(
      OVERRIDE_REJECTION_CODES.OVERRIDE_EXPIRATION_REQUIRED,
      `expires_at must be a valid instant in the future, got ${String(expiresAt)}`,
    );
  }

  return { capabilityKey, valueJson, actor, reason, expiresAt };
}
