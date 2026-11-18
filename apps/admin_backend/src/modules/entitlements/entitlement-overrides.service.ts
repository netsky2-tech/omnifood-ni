/**
 * ENT-06 of issue #984 — written exceptions over the frozen catalog, and the
 * audit trail that makes them defensible.
 *
 * Catalog §6.3: overrides win over plan and add-ons, carry `actor`, `motivo`
 * and `expires_at`, and stop applying when they expire **without being
 * deleted**. Catalog §7: no exception can target a nucleus key. Both rules are
 * enforced here and in `entitlement-override-input.ts`, not in the caller.
 *
 * There is deliberately NO HTTP write path (owner decision, 2026-11-18): the
 * backend has no platform role, so an `OWNER`-guarded endpoint would let every
 * tenant grant itself Pro. Writes come from the internal CLI
 * (`src/scripts/entitlement-override.ts`), which goes through this service;
 * the tenant can still *read* its exceptions through the API.
 *
 * Two invariants this service owns:
 *   1. A grant and its audit row are written in the SAME transaction, so an
 *      exception can never exist without a stated actor and reason.
 *   2. A grant that would make the tenant's snapshot unresolvable is rolled
 *      back: support cannot brick a tenant's entitlements by granting a
 *      capability whose prerequisite the contract does not include.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { bindTenantContext } from '../../core/database/tenant-transaction';
import {
  OVERRIDE_REJECTION_CODES,
  OverrideRejectedError,
  normalizeOverrideGrant,
  type OverrideGrantInput,
} from './entitlement-override-input';
import {
  resolveEffectiveCapabilities,
  type OverrideInput,
  type SubscriptionInput,
} from './entitlement-resolution';

const HISTORY_DEFAULT_LIMIT = 50;
const HISTORY_MAX_LIMIT = 200;

export interface GrantOverrideInput extends OverrideGrantInput {
  readonly tenantId: string;
}

export interface RevokeOverrideInput {
  readonly tenantId: string;
  /** Revoke by id, or by key when the operator does not have the id at hand. */
  readonly overrideId?: string;
  readonly capabilityKey?: string;
  readonly actor: string;
  readonly reason: string;
  readonly now?: Date;
}

export interface GrantedOverride {
  readonly overrideId: string;
  readonly capabilityKey: string;
  readonly valueJson: Record<string, unknown>;
  readonly actor: string;
  readonly reason: string;
  readonly expiresAt: Date;
}

export interface RevokedOverride {
  readonly overrideId: string;
  readonly capabilityKey: string;
  readonly revokedAt: Date;
}

export interface OverrideRow {
  readonly id: string;
  readonly capabilityKey: string;
  readonly valueJson: Record<string, unknown>;
  readonly actor: string;
  readonly reason: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly isActive: boolean;
}

export interface OverrideHistoryRow {
  readonly id: string;
  readonly changeType: string;
  readonly overrideId: string | null;
  readonly capabilityKey: string | null;
  readonly previousValueJson: Record<string, unknown> | null;
  readonly newValueJson: Record<string, unknown>;
  readonly actor: string;
  readonly reason: string;
  readonly occurredAt: Date;
}

/** Written into history when an exception is ended. */
const REVOKED_MARKER = { revoked: true } as const;

@Injectable()
export class EntitlementOverridesService {
  constructor(private readonly dataSource: DataSource) {}

  /** Grants one audited exception. Refuses anything the catalog forbids. */
  async grant(input: GrantOverrideInput): Promise<GrantedOverride> {
    const normalized = normalizeOverrideGrant(input);

    return this.inTenantTransaction(input.tenantId, async (runner) => {
      const active = (await runner.query(
        `SELECT id
           FROM tenant_entitlement_override
          WHERE capability_key = $1
            AND expires_at > $2
          LIMIT 1`,
        [normalized.capabilityKey, input.now],
      )) as Array<{ id: string }>;

      if (active.length > 0) {
        throw new OverrideRejectedError(
          OVERRIDE_REJECTION_CODES.OVERRIDE_ALREADY_ACTIVE,
          `"${normalized.capabilityKey}" already has an exception in force (${active[0].id}); revoke it first so each change keeps its own reason`,
        );
      }

      const inserted = (await runner.query(
        `INSERT INTO tenant_entitlement_override
           (tenant_id, capability_key, value_json, actor, reason, expires_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6)
         RETURNING id`,
        [
          input.tenantId,
          normalized.capabilityKey,
          JSON.stringify(normalized.valueJson),
          normalized.actor,
          normalized.reason,
          normalized.expiresAt,
        ],
      )) as Array<{ id: string }>;
      const overrideId = inserted[0].id;

      await this.appendHistory(runner, {
        tenantId: input.tenantId,
        overrideId,
        capabilityKey: normalized.capabilityKey,
        previousValueJson: null,
        newValueJson: normalized.valueJson,
        actor: normalized.actor,
        reason: normalized.reason,
        occurredAt: input.now,
      });

      await this.assertSnapshotResolves(
        runner,
        input.tenantId,
        input.now,
        normalized.capabilityKey,
      );

      return {
        overrideId,
        capabilityKey: normalized.capabilityKey,
        valueJson: normalized.valueJson,
        actor: normalized.actor,
        reason: normalized.reason,
        expiresAt: normalized.expiresAt,
      };
    });
  }

  /**
   * Ends an exception by setting `expires_at` to the revoke instant: it stops
   * applying at once (the resolver uses a strict `>`), the row stays for
   * audit, and a second audited row records who ended it and why.
   */
  async revoke(input: RevokeOverrideInput): Promise<RevokedOverride> {
    const now = input.now ?? new Date();
    const actor = input.actor?.trim() ?? '';
    const reason = input.reason?.trim() ?? '';
    if (!actor) {
      throw new OverrideRejectedError(
        OVERRIDE_REJECTION_CODES.OVERRIDE_ACTOR_REQUIRED,
        'a revoke must name who authorized it (catalog §6.3)',
      );
    }
    if (!reason) {
      throw new OverrideRejectedError(
        OVERRIDE_REJECTION_CODES.OVERRIDE_REASON_REQUIRED,
        'a revoke must state why it was done (catalog §6.3)',
      );
    }

    return this.inTenantTransaction(input.tenantId, async (runner) => {
      const rows = (await runner.query(
        `SELECT id, capability_key, value_json
           FROM tenant_entitlement_override
          WHERE expires_at > $1
            AND ($2::uuid IS NULL OR id = $2::uuid)
            AND ($3::text IS NULL OR capability_key = $3::text)
          ORDER BY created_at DESC
          LIMIT 1`,
        [now, input.overrideId ?? null, input.capabilityKey ?? null],
      )) as Array<{
        id: string;
        capability_key: string;
        value_json: Record<string, unknown>;
      }>;

      if (rows.length === 0) {
        throw new OverrideRejectedError(
          OVERRIDE_REJECTION_CODES.OVERRIDE_NOT_ACTIVE,
          `no exception in force matches ${input.overrideId ?? input.capabilityKey ?? '(nothing)'}`,
        );
      }

      const target = rows[0];
      await runner.query(
        `UPDATE tenant_entitlement_override
            SET expires_at = $1, updated_at = now()
          WHERE id = $2`,
        [now, target.id],
      );

      await this.appendHistory(runner, {
        tenantId: input.tenantId,
        overrideId: target.id,
        capabilityKey: target.capability_key,
        previousValueJson: target.value_json,
        newValueJson: { ...REVOKED_MARKER },
        actor,
        reason,
        occurredAt: now,
      });

      return {
        overrideId: target.id,
        capabilityKey: target.capability_key,
        revokedAt: now,
      };
    });
  }

  /** Every exception of the tenant, active or expired, for the audit view. */
  async list(input: { tenantId: string; now?: Date }): Promise<OverrideRow[]> {
    const now = input.now ?? new Date();
    return this.inTenantTransaction(input.tenantId, async (runner) => {
      const rows = (await runner.query(
        `SELECT id, capability_key, value_json, actor, reason, expires_at,
                created_at, (expires_at > $1) AS is_active
           FROM tenant_entitlement_override
          ORDER BY created_at DESC`,
        [now],
      )) as Array<{
        id: string;
        capability_key: string;
        value_json: Record<string, unknown>;
        actor: string;
        reason: string;
        expires_at: Date;
        created_at: Date;
        is_active: boolean;
      }>;

      return rows.map((row) => ({
        id: row.id,
        capabilityKey: row.capability_key,
        valueJson: row.value_json,
        actor: row.actor,
        reason: row.reason,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        isActive: row.is_active,
      }));
    });
  }

  /** The append-only trail of override grants and revokes. */
  async history(input: {
    tenantId: string;
    limit?: number;
  }): Promise<OverrideHistoryRow[]> {
    const limit = Math.min(
      Math.max(input.limit ?? HISTORY_DEFAULT_LIMIT, 1),
      HISTORY_MAX_LIMIT,
    );
    return this.inTenantTransaction(input.tenantId, async (runner) => {
      const rows = (await runner.query(
        `SELECT id, change_type, override_id, capability_key,
                previous_value_json, new_value_json, actor, reason, occurred_at
           FROM tenant_entitlement_change_history
          WHERE change_type = 'override'
          ORDER BY occurred_at DESC, id DESC
          LIMIT $1`,
        [limit],
      )) as Array<{
        id: string;
        change_type: string;
        override_id: string | null;
        capability_key: string | null;
        previous_value_json: Record<string, unknown> | null;
        new_value_json: Record<string, unknown>;
        actor: string;
        reason: string;
        occurred_at: Date;
      }>;

      return rows.map((row) => ({
        id: row.id,
        changeType: row.change_type,
        overrideId: row.override_id,
        capabilityKey: row.capability_key,
        previousValueJson: row.previous_value_json,
        newValueJson: row.new_value_json,
        actor: row.actor,
        reason: row.reason,
        occurredAt: row.occurred_at,
      }));
    });
  }

  private async appendHistory(
    runner: QueryRunner,
    row: {
      tenantId: string;
      overrideId: string;
      capabilityKey: string;
      previousValueJson: Record<string, unknown> | null;
      newValueJson: Record<string, unknown>;
      actor: string;
      reason: string;
      occurredAt: Date;
    },
  ): Promise<void> {
    await runner.query(
      `INSERT INTO tenant_entitlement_change_history
         (tenant_id, change_type, override_id, capability_key,
          previous_value_json, new_value_json, actor, reason, occurred_at)
       VALUES ($1, 'override', $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)`,
      [
        row.tenantId,
        row.overrideId,
        row.capabilityKey,
        row.previousValueJson === null
          ? null
          : JSON.stringify(row.previousValueJson),
        JSON.stringify(row.newValueJson),
        row.actor,
        row.reason,
        row.occurredAt,
      ],
    );
  }

  /**
   * Post-condition of a grant: the tenant's snapshot must still resolve with
   * the new exception in place. Throwing here rolls the whole transaction
   * back, so a contradictory exception never reaches the table.
   */
  private async assertSnapshotResolves(
    runner: QueryRunner,
    tenantId: string,
    now: Date,
    capabilityKey: string,
  ): Promise<void> {
    try {
      const subscription = await this.readSubscription(runner, now);
      const overrides = await this.readOverrides(runner, now);
      resolveEffectiveCapabilities({ subscription, overrides, now });
    } catch (error) {
      throw new OverrideRejectedError(
        OVERRIDE_REJECTION_CODES.OVERRIDE_WOULD_BREAK_SNAPSHOT,
        `"${capabilityKey}" would leave this tenant's entitlements unresolvable, so nothing was written: ${(error as Error).message}`,
      );
    }
  }

  // The two readers below deliberately mirror EntitlementsService: they must
  // read exactly what the snapshot reads, and the DB spec proves both agree by
  // observing the snapshot change right after a grant.
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
