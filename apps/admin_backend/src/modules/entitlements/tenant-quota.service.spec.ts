/**
 * ENT-03b — unit rules for the tenant seat/account quota (issue #984).
 *
 * The quota is a COUNT, not a capability gate (catalog §6.2): a terminal
 * occupies a seat while its credential is not revoked/retired AND it had
 * activity inside the 30-day window; an owner account is counted while
 * active. This spec pins the decision rules against a stubbed transaction
 * runner; the real-database contract (RLS, stored rows, tenant isolation)
 * lives in `tenant-quota.db.spec.ts`.
 */
import { HttpException, UnauthorizedException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../core/database/tenant-transaction';
import { EntitlementsService } from './entitlements.service';
import {
  ACTIVE_OWNER_ACCOUNTS_SQL,
  OCCUPIED_TERMINAL_SEATS_SQL,
  TENANT_SEAT_ACTIVITY_WINDOW_MS,
  TenantQuotaService,
  ownerQuotaExceededMessage,
  terminalQuotaExceededMessage,
} from './tenant-quota.service';

interface RunnerStub {
  connect: jest.Mock;
  query: jest.Mock;
  startTransaction: jest.Mock;
  commitTransaction: jest.Mock;
  rollbackTransaction: jest.Mock;
  release: jest.Mock;
}

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function createRunnerStub(countResults: unknown[]): RunnerStub {
  const query = jest.fn((sql: string) => {
    if (sql.includes('set_config')) {
      return Promise.resolve(undefined);
    }
    const result = countResults.shift();
    return Promise.resolve(result ?? []);
  });
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    query: query,
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
}

function createService(
  limits: Record<string, number | null>,
  countResults: unknown[],
): {
  service: TenantQuotaService;
  runner: RunnerStub;
  snapshot: jest.Mock;
} {
  const runner = createRunnerStub(countResults);
  const dataSource = {
    createQueryRunner: () => runner,
  } as unknown as DataSource;
  const snapshot = jest.fn().mockResolvedValue({ limits });
  const entitlements = { snapshot } as unknown as EntitlementsService;
  return {
    service: new TenantQuotaService(dataSource, entitlements),
    runner,
    snapshot,
  };
}

describe('TenantQuotaService (ENT-03b, catalog §6.2)', () => {
  describe('assertCanEnrollTerminal', () => {
    it('a null limit means unlimited: passes without counting any seat', async () => {
      const { service, runner, snapshot } = createService(
        { 'limits.terminals': null },
        [],
      );

      await expect(service.assertCanEnrollTerminal(TENANT_ID)).resolves.toBe(
        undefined,
      );

      expect(snapshot).toHaveBeenCalledWith(TENANT_ID);
      // No counting transaction was ever opened.
      expect(runner.startTransaction).not.toHaveBeenCalled();
      expect(runner.query).not.toHaveBeenCalled();
    });

    it('passes when the occupied seats are under the limit, inside a tenant-bound transaction', async () => {
      const { service, runner } = createService({ 'limits.terminals': 2 }, [
        [{ occupied_seats: 1 }],
      ]);

      await expect(
        service.assertCanEnrollTerminal(TENANT_ID),
      ).resolves.toBeUndefined();

      // The counting query runs tenant-bound: set_config first, then the count.
      expect(runner.query).toHaveBeenNthCalledWith(
        1,
        TENANT_CONTEXT_SET_CONFIG_SQL,
        [TENANT_ID],
      );
      const [sql, params] = runner.query.mock.calls[1];
      expect(sql).toBe(OCCUPIED_TERMINAL_SEATS_SQL);
      expect(params[0]).toBe(TENANT_ID);
      expect(runner.commitTransaction).toHaveBeenCalled();
    });

    it('excludes the seat the same attempt already holds (idempotent replay)', async () => {
      // Provisioning is idempotent: an ACTIVE credential for the attempt is
      // returned untouched. A replay must therefore not be denied by the very
      // seat it already occupies.
      const { service, runner } = createService({ 'limits.terminals': 1 }, [
        [{ occupied_seats: 0 }],
      ]);
      const attemptId = '11111111-1111-1111-1111-111111111111';

      await expect(
        service.assertCanEnrollTerminal(TENANT_ID, new Date(), {
          idempotentAttemptId: attemptId,
        }),
      ).resolves.toBeUndefined();

      const [sql, params] = runner.query.mock.calls[1];
      expect(params[2]).toBe(attemptId);
      expect(sql).toContain('activation_attempt_id IS DISTINCT FROM $3::uuid');
    });

    it('counts every seat when there is no attempt to exclude', async () => {
      const { service, runner } = createService({ 'limits.terminals': 2 }, [
        [{ occupied_seats: 1 }],
      ]);

      await service.assertCanEnrollTerminal(TENANT_ID);

      const [, params] = runner.query.mock.calls[1];
      // A bootstrap enrolment has no attempt; passing NULL keeps every seat
      // in the count (and `IS DISTINCT FROM` avoids the `<> NULL` trap).
      expect(params[2]).toBeNull();
    });

    it('blocks at the limit with 409 and the exact Spanish upgrade message', async () => {
      const { service } = createService({ 'limits.terminals': 2 }, [
        [{ occupied_seats: 2 }],
      ]);

      await expect(service.assertCanEnrollTerminal(TENANT_ID)).rejects.toThrow(
        new HttpException(terminalQuotaExceededMessage(2), 409),
      );
    });

    it('blocks a single-seat plan with the singular wording', async () => {
      const { service } = createService({ 'limits.terminals': 1 }, [
        [{ occupied_seats: 1 }],
      ]);

      await expect(service.assertCanEnrollTerminal(TENANT_ID)).rejects.toThrow(
        new HttpException(terminalQuotaExceededMessage(1), 409),
      );
      expect(terminalQuotaExceededMessage(1)).toBe(
        'Su plan permite 1 terminal y ya está ocupado por equipos activos en los últimos 30 días. Dé de baja un equipo e intente de nuevo, o adquiera un terminal adicional.',
      );
    });

    it('the activity window is max(issued_at, rotated_at) within the last 30 days', async () => {
      const now = new Date('2026-11-17T15:00:00.000Z');
      const { service, runner } = createService({ 'limits.terminals': 1 }, [
        [{ occupied_seats: 0 }],
      ]);

      await service.assertCanEnrollTerminal(TENANT_ID, now);

      const [sql, params] = runner.query.mock.calls[1];
      // The freshness of a seat is the latest renewal: rotated_at is
      // refreshed on every token renewal, so a live POS keeps its seat while
      // a dead one stops counting 30 days after its last renewal.
      expect(sql).toContain('GREATEST(issued_at, rotated_at)');
      expect(sql).toContain('revoked_at IS NULL');
      expect(sql).toContain("status NOT IN ('REVOKED', 'RETIRED')");
      const cutoff = params[1] as Date;
      expect(cutoff.getTime()).toBe(
        now.getTime() - TENANT_SEAT_ACTIVITY_WINDOW_MS,
      );
      expect(TENANT_SEAT_ACTIVITY_WINDOW_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('rejects a blank tenant before any query', async () => {
      const { service } = createService({ 'limits.terminals': 1 }, []);

      await expect(service.assertCanEnrollTerminal('   ')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('assertCanAddOwnerAccount', () => {
    it('only acts on the OWNER role: any other role passes without reading the snapshot', async () => {
      const { service, snapshot } = createService(
        { 'limits.owner_accounts': 0 },
        [],
      );

      await expect(
        service.assertCanAddOwnerAccount(TENANT_ID, 'MANAGER'),
      ).resolves.toBeUndefined();
      await expect(
        service.assertCanAddOwnerAccount(TENANT_ID, 'CASHIER'),
      ).resolves.toBeUndefined();

      expect(snapshot).not.toHaveBeenCalled();
    });

    it('passes when the active owner accounts are under the limit', async () => {
      const { service, runner } = createService(
        { 'limits.owner_accounts': 2 },
        [[{ active_owner_accounts: 1 }]],
      );

      await expect(
        service.assertCanAddOwnerAccount(TENANT_ID, 'OWNER'),
      ).resolves.toBeUndefined();

      expect(runner.query).toHaveBeenNthCalledWith(
        1,
        TENANT_CONTEXT_SET_CONFIG_SQL,
        [TENANT_ID],
      );
      const [sql, params] = runner.query.mock.calls[1];
      expect(sql).toBe(ACTIVE_OWNER_ACCOUNTS_SQL);
      // Only ACTIVE OWNER accounts are seats: an account is a person and is
      // revocable immediately, so there is no grace window here.
      expect(sql).toContain("role = 'OWNER'");
      expect(sql).toContain('is_active = TRUE');
      expect(params[0]).toBe(TENANT_ID);
    });

    it('blocks at the limit with 409, naming the included owner accounts and the upgrade add-on', async () => {
      const { service } = createService({ 'limits.owner_accounts': 2 }, [
        [{ active_owner_accounts: 2 }],
      ]);

      await expect(
        service.assertCanAddOwnerAccount(TENANT_ID, 'OWNER'),
      ).rejects.toThrow(new HttpException(ownerQuotaExceededMessage(2), 409));
      expect(ownerQuotaExceededMessage(2)).toBe(
        'Su plan permite 2 cuentas de propietario y ya están ocupadas por las cuentas owner incluidas. Desactive una cuenta de propietario e intente de nuevo, o adquiera el complemento owner.account.extra para agregar más.',
      );
    });

    it('a null owner limit means unlimited: passes without counting', async () => {
      const { service, runner } = createService(
        { 'limits.owner_accounts': null },
        [],
      );

      await expect(
        service.assertCanAddOwnerAccount(TENANT_ID, 'OWNER'),
      ).resolves.toBeUndefined();
      expect(runner.query).not.toHaveBeenCalled();
    });
  });
});
