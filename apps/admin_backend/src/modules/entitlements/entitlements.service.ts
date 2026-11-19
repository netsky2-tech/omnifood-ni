/**
 * ENT-02 — serves the effective entitlements of one tenant.
 *
 * The service owns exactly two things: reading the contract rows under the
 * tenant's RLS context, and stamping the snapshot envelope. Every decision
 * about *what* a tenant may use lives in `entitlement-resolution.ts`, which is
 * pure and tested without a database.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { bindTenantContext } from '../../core/database/tenant-transaction';
import type { EntitlementSnapshotDto } from './dto/entitlement-snapshot.dto';
import {
  ENTITLEMENT_CONTRACT_VERSION,
  ENTITLEMENT_SNAPSHOT_TTL_MS,
  resolveEffectiveCapabilities,
  type OverrideInput,
  type SubscriptionInput,
} from './entitlement-resolution';

@Injectable()
export class EntitlementsService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Resolves the snapshot for one tenant.
   *
   * Reads run inside a transaction with `app.tenant_id` bound, so the RLS
   * policies of 1810400000000-CreateEntitlementsTables are the last line of
   * defence: even a query that forgot its filter cannot see another tenant.
   */
  async snapshot(
    tenantId: string,
    now: Date = new Date(),
  ): Promise<EntitlementSnapshotDto> {
    const resolved = await this.inTenantTransaction(
      tenantId,
      async (runner) => {
        const subscription = await this.readSubscription(runner, now);
        const overrides = await this.readOverrides(runner, now);
        return resolveEffectiveCapabilities({ subscription, overrides, now });
      },
    );

    return {
      version: ENTITLEMENT_CONTRACT_VERSION,
      planCode: resolved.planCode,
      status: resolved.status,
      supportTier: resolved.supportTier,
      capabilities: resolved.capabilities,
      limits: resolved.limits,
      addOns: resolved.addOns,
      issuedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + ENTITLEMENT_SNAPSHOT_TTL_MS,
      ).toISOString(),
    };
  }

  /**
   * The contract in effect: the most recent subscription that has already
   * started. A future-dated renewal does not count yet; a missing one yields
   * `null` and, downstream, the explicit `sin_plan` state (catalog §6.4).
   */
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

  /** Overrides still in force. Expired rows stay in the table for audit. */
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
