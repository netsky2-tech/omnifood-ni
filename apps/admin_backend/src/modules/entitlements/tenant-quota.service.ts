/**
 * ENT-03b — tenant seat and account quotas (issue #984).
 *
 * The quota is a COUNT, not a capability gate (catalog §6.2, decision #3):
 * `limits.terminals` blocks the ENROLMENT of a new terminal and
 * `limits.owner_accounts` blocks CREATING or PROMOTING another owner, but
 * neither rule ever touches token renewal, sync, revocation (baja), sales or
 * any fiscal path. An existing terminal in operation is never revoked by
 * quota: a dead business is worse than unbilled income.
 *
 * Seat semantics (product owner decision, 2026-11-17):
 * - A terminal OCCUPIES A SEAT while its `device_sync_credentials` row is
 *   NOT revoked/retired (`revoked_at IS NULL`, status not REVOKED/RETIRED)
 *   AND it had activity inside the 30-day window. Activity is
 *   `max(issued_at, rotated_at)`: `rotated_at` is refreshed on every token
 *   renewal (`device-sync-credential.service.ts`), so a live POS renews and
 *   keeps its seat while a dead one stops counting 30 days after its last
 *   renewal. The explicit revocation endpoint frees the seat immediately.
 * - Owner accounts have NO grace window: an account is a person, active and
 *   immediately revocable, so only `role = 'OWNER' AND is_active` counts.
 *
 * Counting always runs inside a tenant-bound transaction
 * (`bindTenantContext`, same pattern as `EntitlementsService`): the explicit
 * `tenant_id` filter is the first line of defence and the RLS policies are
 * the last one. A `null` limit means unlimited and never blocks.
 */
import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { bindTenantContext } from '../../core/database/tenant-transaction';
import type { UserRole } from '../identity/security/user-role.enum';
import { EntitlementsService } from './entitlements.service';

/**
 * The seat activity window of catalog §6.2: a terminal keeps its seat while
 * it had activity (`max(issued_at, rotated_at)`) inside the last 30 days.
 * The window exists for the device that died and nobody deregistered — it
 * frees itself; the explicit `POST identity/device-sync/credentials/:id/revoke`
 * baja frees the seat immediately and is the normal replacement path.
 */
export const TENANT_SEAT_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Catalog key of the terminal quota (frozen registry, capability-registry.ts). */
export const LIMIT_TERMINALS_KEY = 'limits.terminals';

/** Catalog key of the owner account quota (frozen registry). */
export const LIMIT_OWNER_ACCOUNTS_KEY = 'limits.owner_accounts';

/**
 * Occupied terminal seats: one single query, explicitly filtered by
 * `tenant_id` AND executed inside the tenant-bound transaction, so the FORCE
 * RLS policies of `device_sync_credentials` back the filter. Seat freshness
 * is `GREATEST(issued_at, rotated_at)`; PostgreSQL ignores the NULL
 * `rotated_at` of a never-rotated credential, falling back to `issued_at`.
 */
export const OCCUPIED_TERMINAL_SEATS_SQL = `
  SELECT COUNT(*)::int AS occupied_seats
    FROM device_sync_credentials
   WHERE tenant_id = $1
     AND revoked_at IS NULL
     AND status NOT IN ('REVOKED', 'RETIRED')
     AND GREATEST(issued_at, rotated_at) >= $2
     AND ($3::uuid IS NULL OR activation_attempt_id IS DISTINCT FROM $3::uuid)
`;

/**
 * Enrolment context. `idempotentAttemptId` excludes the seat the SAME
 * activation attempt already holds: provisioning is idempotent (an ACTIVE
 * credential returns a no-op), so a legitimate replay of the request must not
 * be denied by the seat it already occupies. `IS DISTINCT FROM` is required
 * instead of `<>` because bootstrap credentials carry a NULL
 * `activation_attempt_id`, and `<>` with NULL would silently drop them from
 * the count.
 */
export interface EnrolmentOptions {
  readonly idempotentAttemptId?: string;
}

/**
 * Active owner accounts: one single query, tenant-filtered and tenant-bound
 * (the `users` table is FORCE-RLS-protected). No grace window (catalog §6.2).
 */
export const ACTIVE_OWNER_ACCOUNTS_SQL = `
  SELECT COUNT(*)::int AS active_owner_accounts
    FROM users
   WHERE tenant_id = $1
     AND role = 'OWNER'
     AND is_active = TRUE
`;

/**
 * The user-facing 409 copy for the terminal quota, with the formal "usted"
 * register (ODD S6: mensaje de upgrade, never cryptic).
 */
export const terminalQuotaExceededMessage = (limit: number): string =>
  limit === 1
    ? 'Su plan permite 1 terminal y ya está ocupado por equipos activos en los últimos 30 días. Dé de baja un equipo e intente de nuevo, o adquiera un terminal adicional.'
    : `Su plan permite ${limit} terminales y ya están ocupados por equipos activos en los últimos 30 días. Dé de baja un equipo e intente de nuevo, o adquiera un terminal adicional.`;

/**
 * The user-facing 409 copy for the owner account quota: it names the
 * included owner accounts and the upgrade add-on (`owner.account.extra`,
 * catalog §5).
 */
export const ownerQuotaExceededMessage = (limit: number): string =>
  limit === 1
    ? 'Su plan permite 1 cuenta de propietario y ya está ocupada por las cuentas owner incluidas. Desactive una cuenta de propietario e intente de nuevo, o adquiera el complemento owner.account.extra para agregar más.'
    : `Su plan permite ${limit} cuentas de propietario y ya están ocupadas por las cuentas owner incluidas. Desactive una cuenta de propietario e intente de nuevo, o adquiera el complemento owner.account.extra para agregar más.`;

@Injectable()
export class TenantQuotaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  /**
   * Throws 409 when the tenant has no free terminal seat. Called ONLY at the
   * enrolment entry points — never from token renewal, sync, revocation or
   * any sale path (catalog §6.2).
   */
  async assertCanEnrollTerminal(
    tenantId: string,
    now: Date = new Date(),
    options: EnrolmentOptions = {},
  ): Promise<void> {
    const limit = await this.readLimit(tenantId, LIMIT_TERMINALS_KEY);
    if (limit === null) {
      return;
    }
    const occupied = await this.countOccupiedTerminalSeats(
      tenantId,
      now,
      options,
    );
    if (occupied >= limit) {
      throw new HttpException(
        terminalQuotaExceededMessage(limit),
        HttpStatus.CONFLICT,
      );
    }
  }

  /**
   * Throws 409 when the tenant has no free owner account. Only acts on the
   * OWNER role: creating another owner or promoting an existing user to
   * OWNER is blocked; creating or demoting any other role never consults
   * the quota.
   */
  async assertCanAddOwnerAccount(
    tenantId: string,
    nextRole: UserRole | string,
  ): Promise<void> {
    if (nextRole !== 'OWNER') {
      return;
    }
    const limit = await this.readLimit(tenantId, LIMIT_OWNER_ACCOUNTS_KEY);
    if (limit === null) {
      return;
    }
    const activeOwners = await this.countActiveOwnerAccounts(tenantId);
    if (activeOwners >= limit) {
      throw new HttpException(
        ownerQuotaExceededMessage(limit),
        HttpStatus.CONFLICT,
      );
    }
  }

  /**
   * Occupied terminal seats for one tenant. Public so the real-database
   * spec can pin the counting contract (fresh vs. rotated vs. revoked rows).
   */
  async countOccupiedTerminalSeats(
    tenantId: string,
    now: Date = new Date(),
    options: EnrolmentOptions = {},
  ): Promise<number> {
    const cutoff = new Date(now.getTime() - TENANT_SEAT_ACTIVITY_WINDOW_MS);
    const rows = (await this.inTenantTransaction(tenantId, (runner) =>
      runner.query(OCCUPIED_TERMINAL_SEATS_SQL, [
        tenantId,
        cutoff,
        options.idempotentAttemptId ?? null,
      ]),
    )) as Array<{ occupied_seats: number }>;
    return Number(rows[0]?.occupied_seats ?? 0);
  }

  /**
   * Active owner accounts for one tenant. Public for the same reason.
   */
  async countActiveOwnerAccounts(tenantId: string): Promise<number> {
    const rows = (await this.inTenantTransaction(tenantId, (runner) =>
      runner.query(ACTIVE_OWNER_ACCOUNTS_SQL, [tenantId]),
    )) as Array<{ active_owner_accounts: number }>;
    return Number(rows[0]?.active_owner_accounts ?? 0);
  }

  /**
   * The tenant's quota limit from the resolved snapshot
   * (`EntitlementsService.snapshot`, ENT-02). A missing or `null` limit is
   * unlimited and never blocks (catalog §9).
   */
  private async readLimit(
    tenantId: string,
    limitKey: string,
  ): Promise<number | null> {
    const snapshot = await this.entitlementsService.snapshot(tenantId);
    return snapshot.limits[limitKey] ?? null;
  }

  /**
   * Opens a transaction with `app.tenant_id` bound before any query — the
   * binding is mandatory, not decorative: FORCE RLS on `users` and
   * `device_sync_credentials` denies anything the filter forgot.
   */
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
