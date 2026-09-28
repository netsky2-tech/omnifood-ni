import { ChangeLog } from './entities/change-log.entity';
import {
  AuditActorRequiredError,
  AuditActor,
  ChangeLogService,
} from './change-log.service';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../core/database/tenant-transaction';

/** Minimal chainable QueryBuilder mock recording the built predicate shape. */
const makeQueryBuilder = (rows: ChangeLog[]) => {
  const qb: Record<string, unknown> = {};
  for (const method of [
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'take',
  ]) {
    qb[method] = jest.fn(() => qb);
  }
  const getMany = jest.fn().mockResolvedValue(rows);
  qb.getMany = getMany;
  return { qb, getMany };
};

/**
 * Issue #512 T3 slice 7: change_log is tenant-RLS protected, so every
 * ChangeLogService access must run on a tenant-bound transaction manager.
 * These specs have runtime teeth: the pooled repository stands beside the
 * transaction fake as a tripwire, so any access that escapes the bound
 * transaction records a call on the pooled tripwire and fails here instead
 * of failing against RLS in production.
 */
describe('ChangeLogService', () => {
  const baseParams = (actor: AuditActor) => ({
    tenantId: 'tenant-1',
    actor,
    action: 'UPDATE',
    targetType: 'product',
    targetId: 'target-1',
  });

  interface Harness {
    service: ChangeLogService;
    pooled: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
    boundRepo: {
      create: jest.Mock;
      save: jest.Mock;
      find: jest.Mock;
      createQueryBuilder: jest.Mock;
    };
    boundManager: { query: jest.Mock; getRepository: jest.Mock };
    dataSource: { transaction: jest.Mock };
    setConfigCalls: Array<[string, string[]]>;
  }

  const makeHarness = (): Harness => {
    // Pooled tripwires: any call here means an access escaped the bound
    // transaction and would hit RLS on a connection with no tenant bound.
    const pooled = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    // Bound instrumented repository handed out by the transaction manager.
    const boundRepo = {
      create: jest.fn((data: unknown) => data as ChangeLog),
      save: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(),
    };

    const setConfigCalls: Array<[string, string[]]> = [];
    const boundManager = {
      query: jest.fn(async (sql: string, params: string[]) => {
        setConfigCalls.push([sql, params]);
        return [];
      }),
      getRepository: jest.fn(() => boundRepo),
    };
    const dataSource = {
      transaction: jest.fn(
        async (work: (manager: unknown) => Promise<unknown>) =>
          work(boundManager),
      ),
    };

    const service = new ChangeLogService(
      pooled as unknown as never,
      dataSource as unknown as never,
    );
    return {
      service,
      pooled,
      boundRepo,
      boundManager,
      dataSource,
      setConfigCalls,
    };
  };

  describe('tenant transaction binding', () => {
    it('binds a write through a tenant transaction when no manager is supplied (issue #512 slice 7)', async () => {
      const h = makeHarness();

      await h.service.log(baseParams({ userId: 'user-uuid' }));

      expect(h.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(h.setConfigCalls).toEqual([
        [TENANT_CONTEXT_SET_CONFIG_SQL, ['tenant-1']],
      ]);
      expect(h.boundRepo.save).toHaveBeenCalledTimes(1);
      expect(h.pooled.create).not.toHaveBeenCalled();
      expect(h.pooled.save).not.toHaveBeenCalled();
    });

    it('binds a read through a tenant transaction when no manager is supplied', async () => {
      const h = makeHarness();

      await h.service.findByTarget('tenant-1', 'product', 'target-1');

      expect(h.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(h.setConfigCalls).toEqual([
        [TENANT_CONTEXT_SET_CONFIG_SQL, ['tenant-1']],
      ]);
      expect(h.boundRepo.find).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-1',
          target_type: 'product',
          target_id: 'target-1',
        },
        order: { created_at: 'ASC' },
      });
      expect(h.pooled.find).not.toHaveBeenCalled();
    });

    it('binds a tenant-wide read through a tenant transaction when no manager is supplied', async () => {
      const h = makeHarness();

      await h.service.findByTenant('tenant-1');

      expect(h.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(h.setConfigCalls).toEqual([
        [TENANT_CONTEXT_SET_CONFIG_SQL, ['tenant-1']],
      ]);
      expect(h.boundRepo.find).toHaveBeenCalledWith({
        where: { tenant_id: 'tenant-1' },
        order: { created_at: 'DESC' },
      });
      expect(h.pooled.find).not.toHaveBeenCalled();
    });

    it('rides a supplied manager without opening another transaction (callers already inside a tenant-bound transaction)', async () => {
      const h = makeHarness();
      const suppliedRepo = {
        create: jest.fn((data: unknown) => data as ChangeLog),
        save: jest.fn().mockResolvedValue(undefined),
      };
      const manager = {
        getRepository: jest.fn(() => suppliedRepo),
      };

      await h.service.log(
        baseParams({ userId: 'user-uuid' }),
        manager as unknown as never,
      );

      expect(h.dataSource.transaction).not.toHaveBeenCalled();
      expect(manager.getRepository).toHaveBeenCalledWith(ChangeLog);
      expect(suppliedRepo.save).toHaveBeenCalledTimes(1);
      expect(h.boundManager.query).not.toHaveBeenCalled();
      expect(h.pooled.create).not.toHaveBeenCalled();
      expect(h.pooled.save).not.toHaveBeenCalled();
    });

    it('rides a supplied manager for reads without opening another transaction', async () => {
      const h = makeHarness();
      const suppliedRepo = {
        find: jest.fn().mockResolvedValue([]),
      };
      const manager = {
        getRepository: jest.fn(() => suppliedRepo),
      };

      await h.service.findByTarget(
        'tenant-1',
        'ActivationAttempt',
        'attempt-1',
        manager as unknown as never,
      );

      expect(h.dataSource.transaction).not.toHaveBeenCalled();
      expect(h.boundManager.query).not.toHaveBeenCalled();
      expect(suppliedRepo.find).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-1',
          target_type: 'ActivationAttempt',
          target_id: 'attempt-1',
        },
        order: { created_at: 'ASC' },
      });
      expect(h.pooled.find).not.toHaveBeenCalled();
    });
  });

  describe('actor resolution (unchanged contract, now behind the bound path)', () => {
    it('writes user_id, and never actor_ref, for a human actor', async () => {
      const h = makeHarness();

      await h.service.log(baseParams({ userId: ' user-uuid ' }));

      expect(h.boundRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-uuid',
          actor_ref: null,
        }),
      );
      expect(h.boundRepo.save).toHaveBeenCalledTimes(1);
    });

    it('writes actor_ref, and never user_id, for a logical actor', async () => {
      const h = makeHarness();

      await h.service.log(baseParams({ ref: ' SYSTEM_RECONCILER ' }));

      expect(h.boundRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: null,
          actor_ref: 'SYSTEM_RECONCILER',
        }),
      );
      expect(h.boundRepo.save).toHaveBeenCalledTimes(1);
    });

    it('trims the actor value but only at the edges', async () => {
      const h = makeHarness();

      await h.service.log(baseParams({ userId: '  user-uuid  ' }));

      expect(h.boundRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-uuid' }),
      );
    });

    it.each([
      ['blank userId', { userId: '   ' }],
      ['blank ref', { ref: '' }],
      ['missing actor', undefined as unknown as AuditActor],
      ['null actor', null],
    ])('rejects a %s before any SQL or transaction', async (_name, actor) => {
      const h = makeHarness();

      await expect(h.service.log(baseParams(actor))).rejects.toThrowError(
        AuditActorRequiredError,
      );

      expect(h.dataSource.transaction).not.toHaveBeenCalled();
      expect(h.boundRepo.create).not.toHaveBeenCalled();
      expect(h.boundRepo.save).not.toHaveBeenCalled();
      expect(h.pooled.create).not.toHaveBeenCalled();
    });
  });

  describe('AG-07 severity classification at ingestion', () => {
    it.each([
      ['ONBOARDING_ACTIVATION_CHECK_FAILED', 'CRITICAL'],
      ['ONBOARDING_ACTIVATION_SUPPORT_OVERRIDE', 'CRITICAL'],
      ['ONBOARDING_ACTIVATION_FINALIZED', 'WARNING'],
      ['ONBOARDING_ACTIVATION_FOLLOW_UP_OPENED', 'WARNING'],
      ['DEACTIVATE', 'WARNING'],
      ['ONBOARDING_ACTIVATION_ATTEMPT_STARTED', 'INFO'],
      ['ONBOARDING_ACTIVATION_FOLLOW_UP_CLOSED', 'INFO'],
      ['CREATE', 'INFO'],
      ['UPDATE', 'INFO'],
      ['SOME_FUTURE_ACTION', 'INFO'],
    ])(
      'persists severity %s for action %s on new events',
      async (action, severity) => {
        const h = makeHarness();

        await h.service.log({ ...baseParams({ userId: 'user-uuid' }), action });

        expect(h.boundRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({ action, severity }),
        );
      },
    );

    it('classifies severity identically when riding a supplied manager (same ingestion path)', async () => {
      const h = makeHarness();
      const suppliedRepo = {
        create: jest.fn((data: unknown) => data as ChangeLog),
        save: jest.fn().mockResolvedValue(undefined),
      };
      const manager = { getRepository: jest.fn(() => suppliedRepo) };

      await h.service.log(
        {
          ...baseParams({ userId: 'user-uuid' }),
          action: 'ONBOARDING_ACTIVATION_CHECK_FAILED',
        },
        manager as unknown as never,
      );

      expect(suppliedRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'CRITICAL' }),
      );
    });
  });

  describe('findEvents (slice 6b — GET /operations/audit/events)', () => {
    it('binds a filtered read through a tenant transaction when no manager is supplied', async () => {
      const h = makeHarness();
      const { qb, getMany } = makeQueryBuilder([]);
      h.boundRepo.createQueryBuilder = jest.fn(() => qb);

      await h.service.findEvents('tenant-1', {
        startInclusiveUtc: new Date('2026-08-01T06:00:00.000Z'),
        endExclusiveUtc: new Date('2026-09-01T06:00:00.000Z'),
        severity: 'CRITICAL',
        limit: 50,
      });

      expect(h.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(h.setConfigCalls).toEqual([
        [TENANT_CONTEXT_SET_CONFIG_SQL, ['tenant-1']],
      ]);
      expect(h.pooled.find).not.toHaveBeenCalled();
      expect(h.boundRepo.find).not.toHaveBeenCalled();
      expect(h.boundRepo.createQueryBuilder).toHaveBeenCalledWith('c');
      expect(getMany).toHaveBeenCalledTimes(1);
      expect(qb.where).toHaveBeenCalledWith('c.tenant_id = :tenantId', {
        tenantId: 'tenant-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('c.created_at >= :startInclusiveUtc', {
        startInclusiveUtc: new Date('2026-08-01T06:00:00.000Z'),
      });
      expect(qb.andWhere).toHaveBeenCalledWith('c.created_at < :endExclusiveUtc', {
        endExclusiveUtc: new Date('2026-09-01T06:00:00.000Z'),
      });
      expect(qb.andWhere).toHaveBeenCalledWith('c.severity = :severity', {
        severity: 'CRITICAL',
      });
      expect(qb.orderBy).toHaveBeenCalledWith('c.created_at', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('c.id', 'DESC');
      expect(qb.take).toHaveBeenCalledWith(50);
    });

    it('includes historical NULL-severity rows when filtering by INFO (backfill-free rule)', async () => {
      const h = makeHarness();
      const { qb } = makeQueryBuilder([]);
      h.boundRepo.createQueryBuilder = jest.fn(() => qb);

      await h.service.findEvents('tenant-1', { severity: 'INFO', limit: 10 });

      expect(qb.andWhere).toHaveBeenCalledWith(
        '(c.severity = :severity OR c.severity IS NULL)',
        { severity: 'INFO' },
      );
      expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('applies no severity predicate when the filter is absent', async () => {
      const h = makeHarness();
      const { qb } = makeQueryBuilder([]);
      h.boundRepo.createQueryBuilder = jest.fn(() => qb);

      await h.service.findEvents('tenant-1', { limit: 25 });

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('rides a supplied manager without opening another transaction', async () => {
      const h = makeHarness();
      const { qb, getMany } = makeQueryBuilder([]);
      const suppliedRepo = { createQueryBuilder: jest.fn(() => qb) };
      const manager = { getRepository: jest.fn(() => suppliedRepo) };

      await h.service.findEvents(
        'tenant-1',
        { limit: 5 },
        manager as unknown as never,
      );

      expect(h.dataSource.transaction).not.toHaveBeenCalled();
      expect(suppliedRepo.createQueryBuilder).toHaveBeenCalledWith('c');
      expect(getMany).toHaveBeenCalledTimes(1);
    });
  });
});
