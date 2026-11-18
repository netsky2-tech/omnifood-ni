/**
 * ENT-07 of issue #984 — plan changes and add-ons as an audited service
 * (ODD S10–S13), instead of the manual SQL of runbook §4.
 *
 * A plan change is a commercial decision that moves what the tenant may use,
 * so it gets the same construction as the audited exceptions of ENT-06:
 *
 *   1. Pure validation FIRST, with stable rejection codes, before any SQL.
 *   2. One tenant-bound transaction that inserts the new `tenant_subscription`
 *      row (supersession: the previous contract is never edited or deleted),
 *      appends the `tenant_entitlement_change_history` row
 *      (`change_type = 'plan'`, `subscription_id`, previous and new contract),
 *      and finally resolves the resulting snapshot INSIDE the same
 *      transaction, rolling back with `SUBSCRIPTION_WOULD_BREAK_SNAPSHOT` if
 *      the resolution fails.
 *
 * There is deliberately NO HTTP write path (same owner decision as the
 * exceptions, ODD S14): the backend has no platform role, so an OWNER-guarded
 * endpoint would let every tenant grant itself the top plan. Writes come from
 * the internal CLI (`src/scripts/entitlement-subscription.ts`). No rule here
 * ever touches a nucleus key: the plan matrix only rows over gated keys
 * (`capability-registry.ts`), and the spec pins that structurally.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { bindTenantContext } from '../../core/database/tenant-transaction';
import {
  ADD_ON_CODES_LIST,
  findPlan,
  type PlanCode,
  type SupportTier,
} from './capability-registry';
import {
  resolveEffectiveCapabilities,
  type OverrideInput,
  type SubscriptionInput,
} from './entitlement-resolution';

/** Rejection codes, stable strings callers branch on. */
export const SUBSCRIPTION_REJECTION_CODES = {
  PLAN_CODE_NOT_REGISTERED: 'PLAN_CODE_NOT_REGISTERED',
  ADD_ON_NOT_REGISTERED: 'ADD_ON_NOT_REGISTERED',
  SUBSCRIPTION_STATUS_INVALID: 'SUBSCRIPTION_STATUS_INVALID',
  SUBSCRIPTION_SUPPORT_TIER_INVALID: 'SUBSCRIPTION_SUPPORT_TIER_INVALID',
  SUBSCRIPTION_STARTS_AT_INVALID: 'SUBSCRIPTION_STARTS_AT_INVALID',
  SUBSCRIPTION_ENDS_AT_INVALID: 'SUBSCRIPTION_ENDS_AT_INVALID',
  SUBSCRIPTION_ACTOR_REQUIRED: 'SUBSCRIPTION_ACTOR_REQUIRED',
  SUBSCRIPTION_REASON_REQUIRED: 'SUBSCRIPTION_REASON_REQUIRED',
  SUBSCRIPTION_WOULD_BREAK_SNAPSHOT: 'SUBSCRIPTION_WOULD_BREAK_SNAPSHOT',
} as const;

export type SubscriptionRejectionCode =
  (typeof SUBSCRIPTION_REJECTION_CODES)[keyof typeof SUBSCRIPTION_REJECTION_CODES];

export class SubscriptionRejectedError extends Error {
  constructor(
    readonly code: SubscriptionRejectionCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'SubscriptionRejectedError';
  }
}

/** The only states a subscription row may carry (catalog §6). */
export const SUBSCRIPTION_STATUSES = [
  'active',
  'suspended',
  'expired',
] as const;

/** The only `support_tier` values the contract accepts (catalog §3). */
export const SUPPORT_TIERS = ['standard', 'priority'] as const;

export interface PlanChangeInput {
  readonly tenantId: string;
  readonly planCode: string;
  /** Defaults to `active`; `suspended` and `expired` are the only others. */
  readonly status?: string;
  /** When the new contract takes effect; defaults to `now` at the service. */
  readonly startsAt: Date;
  readonly endsAt?: Date | null;
  /** Purchased add-on codes (catalog §5); defaults to none. */
  readonly addOns?: readonly string[];
  /** Defaults to `standard`. */
  readonly supportTier?: string;
  readonly actor: string;
  readonly reason: string;
  readonly now?: Date;
}

export interface NormalizedPlanChange {
  readonly planCode: PlanCode;
  readonly status: (typeof SUBSCRIPTION_STATUSES)[number];
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly addOns: string[];
  readonly supportTier: SupportTier;
  readonly actor: string;
  readonly reason: string;
}

export interface PlanChangeTrailRow {
  readonly id: string;
  readonly changeType: string;
  readonly subscriptionId: string | null;
  readonly previousValueJson: Record<string, unknown> | null;
  readonly newValueJson: Record<string, unknown>;
  readonly actor: string;
  readonly reason: string;
  readonly occurredAt: Date;
}

export interface ChangedPlan {
  readonly subscriptionId: string;
  readonly planCode: PlanCode;
  readonly status: string;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly addOns: string[];
  readonly supportTier: SupportTier;
}

const reject = (code: SubscriptionRejectionCode, detail: string): never => {
  throw new SubscriptionRejectedError(code, detail);
};

/**
 * Validates and normalizes one plan change. Pure, clock-free and database-free
 * on purpose: the same gate the service runs first is pinned by a unit test.
 * Throws `SubscriptionRejectedError` with a stable code; never returns a
 * partially valid change.
 */
export function normalizePlanChange(
  input: Pick<
    PlanChangeInput,
    | 'planCode'
    | 'status'
    | 'startsAt'
    | 'endsAt'
    | 'addOns'
    | 'supportTier'
    | 'actor'
    | 'reason'
  >,
): NormalizedPlanChange {
  const planCode = input.planCode?.trim() ?? '';
  const plan = planCode ? findPlan(planCode) : null;
  if (!plan) {
    reject(
      SUBSCRIPTION_REJECTION_CODES.PLAN_CODE_NOT_REGISTERED,
      `"${input.planCode}" is not one of the automatic catalog plans (ESENCIAL, OPERACION, PRO; ENTERPRISE is quoted manually)`,
    );
  }

  const status = (input.status ?? 'active').trim();
  if (
    !SUBSCRIPTION_STATUSES.includes(
      status as (typeof SUBSCRIPTION_STATUSES)[number],
    )
  ) {
    reject(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_STATUS_INVALID,
      `status must be one of ${SUBSCRIPTION_STATUSES.join(', ')}, got "${input.status}"`,
    );
  }

  const addOns = (input.addOns ?? [])
    .map((code) => code.trim())
    .filter(Boolean);
  for (const code of addOns) {
    if (!ADD_ON_CODES_LIST.includes(code)) {
      reject(
        SUBSCRIPTION_REJECTION_CODES.ADD_ON_NOT_REGISTERED,
        `"${code}" is not an add-on code of the frozen catalog (catalogo_capacidades_v1 §5)`,
      );
    }
  }

  const supportTier = (input.supportTier ?? 'standard').trim();
  if (!SUPPORT_TIERS.includes(supportTier as SupportTier)) {
    reject(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_SUPPORT_TIER_INVALID,
      `support_tier must be one of ${SUPPORT_TIERS.join(', ')}, got "${input.supportTier}"`,
    );
  }

  const startsAt = input.startsAt;
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    reject(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_STARTS_AT_INVALID,
      `starts_at must be a valid instant, got ${String(input.startsAt)}`,
    );
  }

  const endsAt = input.endsAt ?? null;
  if (
    endsAt !== null &&
    (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime()))
  ) {
    reject(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_ENDS_AT_INVALID,
      `ends_at must be null or a valid instant, got ${String(input.endsAt)}`,
    );
  }

  const actor = input.actor?.trim() ?? '';
  if (!actor) {
    reject(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_ACTOR_REQUIRED,
      'a plan change must name who authorized it (catalog §6.3)',
    );
  }

  const reason = input.reason?.trim() ?? '';
  if (!reason) {
    reject(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_REASON_REQUIRED,
      'a plan change must state why it was done (catalog §6.3)',
    );
  }

  return {
    planCode: plan.planCode,
    status: status as (typeof SUBSCRIPTION_STATUSES)[number],
    startsAt,
    endsAt,
    addOns,
    supportTier: supportTier as SupportTier,
    actor,
    reason,
  };
}

/**
 * The contract as the audit trail stores it: the same fields the resolver
 * reads, in snake_case so the jsonb matches the table's vocabulary and the
 * runbook examples.
 */
const contractJson = (
  contract: SubscriptionInput,
): Record<string, unknown> => ({
  plan_code: contract.plan_code,
  status: contract.status,
  starts_at: contract.starts_at.toISOString(),
  ends_at: contract.ends_at === null ? null : contract.ends_at.toISOString(),
  add_ons: contract.add_ons,
  support_tier: contract.support_tier,
});

const HISTORY_DEFAULT_LIMIT = 50;
const HISTORY_MAX_LIMIT = 200;

@Injectable()
export class TenantSubscriptionService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Writes one plan change: the new contract, its audit row and the snapshot
   * post-condition, all in the same tenant-bound transaction (ODD S10/S13).
   */
  async changePlan(input: PlanChangeInput): Promise<ChangedPlan> {
    const normalized = normalizePlanChange(input);
    const now = input.now ?? new Date();

    return this.inTenantTransaction(input.tenantId, async (runner) => {
      const previous = await this.readSubscription(runner, now);

      const inserted = (await runner.query(
        `INSERT INTO tenant_subscription
           (tenant_id, plan_code, status, starts_at, ends_at, add_ons, support_tier)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         RETURNING id`,
        [
          input.tenantId,
          normalized.planCode,
          normalized.status,
          normalized.startsAt,
          normalized.endsAt,
          JSON.stringify(normalized.addOns),
          normalized.supportTier,
        ],
      )) as Array<{ id: string }>;
      const subscriptionId = inserted[0].id;

      const newContract: SubscriptionInput = {
        plan_code: normalized.planCode,
        status: normalized.status,
        starts_at: normalized.startsAt,
        ends_at: normalized.endsAt,
        add_ons: normalized.addOns,
        support_tier: normalized.supportTier,
      };

      await runner.query(
        `INSERT INTO tenant_entitlement_change_history
           (tenant_id, change_type, subscription_id, capability_key,
            previous_value_json, new_value_json, actor, reason, occurred_at)
         VALUES ($1, 'plan', $2, NULL, $3::jsonb, $4::jsonb, $5, $6, $7)`,
        [
          input.tenantId,
          subscriptionId,
          previous === null ? null : JSON.stringify(contractJson(previous)),
          JSON.stringify(contractJson(newContract)),
          normalized.actor,
          normalized.reason,
          now,
        ],
      );

      await this.assertSnapshotResolves(
        runner,
        input.tenantId,
        now,
        normalized,
      );

      return {
        subscriptionId,
        planCode: normalized.planCode,
        status: normalized.status,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        addOns: normalized.addOns,
        supportTier: normalized.supportTier,
      };
    });
  }

  /**
   * The append-only trail of plan changes (ODD S15: this is what the CLI's
   * `--list` consults). The latest row's `new_value_json` IS the contract in
   * force, so the operator never needs raw SQL to answer "what does this
   * tenant have?".
   */
  async list(input: {
    tenantId: string;
    limit?: number;
    now?: Date;
  }): Promise<PlanChangeTrailRow[]> {
    const limit = Math.min(
      Math.max(input.limit ?? HISTORY_DEFAULT_LIMIT, 1),
      HISTORY_MAX_LIMIT,
    );
    return this.inTenantTransaction(input.tenantId, async (runner) => {
      const rows = (await runner.query(
        `SELECT id, change_type, subscription_id,
                previous_value_json, new_value_json, actor, reason, occurred_at
           FROM tenant_entitlement_change_history
          WHERE change_type = 'plan'
          ORDER BY occurred_at DESC, id DESC
          LIMIT $1`,
        [limit],
      )) as Array<{
        id: string;
        change_type: string;
        subscription_id: string | null;
        previous_value_json: Record<string, unknown> | null;
        new_value_json: Record<string, unknown>;
        actor: string;
        reason: string;
        occurred_at: Date;
      }>;

      return rows.map((row) => ({
        id: row.id,
        changeType: row.change_type,
        subscriptionId: row.subscription_id,
        previousValueJson: row.previous_value_json,
        newValueJson: row.new_value_json,
        actor: row.actor,
        reason: row.reason,
        occurredAt: row.occurred_at,
      }));
    });
  }

  /**
   * Post-condition of a plan change: the tenant's snapshot must still resolve
   * with the new contract in place. Throwing here rolls the whole transaction
   * back, so a contradictory contract (e.g. buying `bundle.convenio` without
   * `promotions`) never reaches the table (ODD S13).
   *
   * The resolution instant is `max(now, starts_at)`: a future-dated renewal
   * must be checked against the moment it takes effect, not against now,
   * where it would still be invisible to the "most recent started row" rule.
   */
  private async assertSnapshotResolves(
    runner: QueryRunner,
    tenantId: string,
    now: Date,
    change: NormalizedPlanChange,
  ): Promise<void> {
    const resolveAt =
      change.startsAt.getTime() > now.getTime() ? change.startsAt : now;
    try {
      const subscription = await this.readSubscription(runner, resolveAt);
      const overrides = await this.readOverrides(runner, resolveAt);
      resolveEffectiveCapabilities({ subscription, overrides, now: resolveAt });
    } catch (error) {
      throw new SubscriptionRejectedError(
        SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_WOULD_BREAK_SNAPSHOT,
        `the contract for "${tenantId}" (${change.planCode}, add-ons [${change.addOns.join(', ')}]) would leave this tenant's entitlements unresolvable, so nothing was written: ${(error as Error).message}`,
      );
    }
  }

  // The two readers below deliberately mirror EntitlementsService (and the
  // overrides service): they must read exactly what the snapshot reads, and
  // the DB spec proves both agree by observing the snapshot change right
  // after a plan change.
  private async readSubscription(
    runner: QueryRunner,
    now: Date,
  ): Promise<SubscriptionInput | null> {
    const rows = (await runner.query(
      `SELECT plan_code, status, starts_at, ends_at, add_ons, support_tier
         FROM tenant_subscription
        WHERE starts_at <= $1
        ORDER BY starts_at DESC, created_at DESC
        LIMIT 1`,
      [now],
    )) as Array<{
      plan_code: string;
      status: string;
      starts_at: Date;
      ends_at: Date | null;
      add_ons: string[];
      support_tier: string;
    }>;
    return rows[0] ?? null;
  }

  private async readOverrides(
    runner: QueryRunner,
    now: Date,
  ): Promise<OverrideInput[]> {
    return (await runner.query(
      `SELECT capability_key, value_json, expires_at
         FROM tenant_entitlement_override
        WHERE expires_at > $1
        ORDER BY created_at ASC`,
      [now],
    )) as OverrideInput[];
  }

  /** Same transaction shape as EntitlementsService (RLS context bound first). */
  private async inTenantTransaction<T>(
    tenantId: string,
    action: (runner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    if (!tenantId?.trim())
      throw new UnauthorizedException('Tenant context is required');
    const runner = this.dataSource.createQueryRunner();
    let transactionActive = false;
    try {
      await runner.connect();
      await runner.startTransaction();
      transactionActive = true;
      await bindTenantContext(runner, tenantId);
      const result = await action(runner);
      await runner.commitTransaction();
      transactionActive = false;
      return result;
    } catch (error) {
      if (transactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}
