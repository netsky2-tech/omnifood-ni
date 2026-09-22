import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { ConflictException, BadRequestException } from '@nestjs/common';
import {
  OnboardingIdempotencyRecord,
  OnboardingIdempotencyStatus,
} from '../entities/onboarding-idempotency.entity';
import {
  OnboardingIdempotencyCoordinator,
} from './onboarding-idempotency.coordinator';
import {
  TENANT_CONTEXT_SET_CONFIG_SQL,
  TenantContextRequiredError,
} from '../../../core/database/tenant-transaction';

/**
 * Issue #493 T2.S2b unit proofs: every protected operation binds
 * `app.tenant_id` (transaction-local, parameterized) BEFORE its first
 * repository access, resolves the repository from the exact transaction
 * manager (never the pooled repository), reuses a caller-supplied manager
 * without opening a nested transaction, and fails fast when the tenant
 * context, the binding, or the transaction cannot be established.
 */

describe('OnboardingIdempotencyCoordinator (Unit — tenant-bound access)', () => {
  let coordinator: OnboardingIdempotencyCoordinator;

  // The pooled repository: only a DI-stable handle to the DataSource. Every
  // protected access must go through the transaction manager's repository.
  let pooledRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    manager: { connection: { transaction: jest.Mock } };
  };

  // The transaction manager and the repository it resolves.
  let txManager: { query: jest.Mock; getRepository: jest.Mock };
  let txRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  const leaseParams = {
    tenantId: 'tenant-1',
    idempotencyKey: 'key-1',
    commandType: 'ConfigureFiscal',
    payload: { businessName: 'Café Managua' },
  };

  const existingRecord = (
    overrides: Partial<OnboardingIdempotencyRecord> = {},
  ): OnboardingIdempotencyRecord =>
    ({
      id: 'record-uuid-2',
      tenantId: 'tenant-1',
      idempotencyKey: 'key-1',
      commandType: 'ConfigureFiscal',
      payloadHash: 'hash-abc',
      status: OnboardingIdempotencyStatus.IN_PROGRESS,
      leaseOwner: null,
      leaseAcquiredAt: null,
      leaseExpiresAt: null,
      attemptCount: 1,
      resultRef: null,
      lastErrorCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      ...overrides,
    }) as OnboardingIdempotencyRecord;

  beforeEach(async () => {
    txRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    txManager = {
      // bindTenantContext issues set_config through manager.query.
      query: jest.fn().mockResolvedValue({}),
      getRepository: jest.fn().mockReturnValue(txRepo),
    };
    pooledRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      manager: {
        connection: {
          transaction: jest.fn(async (cb: (m: unknown) => unknown) =>
            cb(txManager),
          ),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingIdempotencyCoordinator,
        {
          provide: getRepositoryToken(OnboardingIdempotencyRecord),
          useValue: pooledRepo as unknown as Repository<OnboardingIdempotencyRecord>,
        },
      ],
    }).compile();

    coordinator = module.get<OnboardingIdempotencyCoordinator>(
      OnboardingIdempotencyCoordinator,
    );
  });

  const expectBoundBefore = (
    firstAccess: jest.Mock,
    accessIndex = 0,
  ): void => {
    const bindOrder = txManager.query.mock.invocationCallOrder[0];
    const accessOrder = firstAccess.mock.invocationCallOrder[accessIndex];
    expect(bindOrder).toBeLessThan(accessOrder);
    expect(txManager.query).toHaveBeenCalledWith(
      TENANT_CONTEXT_SET_CONFIG_SQL,
      ['tenant-1'],
    );
  };

  describe('acquireLease — bind-before-access ordering and transaction path', () => {
    it('binds the tenant context before the first repository access and uses the transaction manager repository', async () => {
      txRepo.findOne.mockResolvedValue(null);
      txRepo.save.mockImplementation(async (entity: any) => ({
        id: 'record-uuid-1',
        ...entity,
      }));

      const lease = await coordinator.acquireLease({
        ...leaseParams,
        leaseOwner: 'worker-1',
      });

      expect(lease.state).toBe('ACQUIRED');
      expect(lease.record.status).toBe(OnboardingIdempotencyStatus.IN_PROGRESS);
      expect(lease.record.leaseOwner).toBe('worker-1');
      expect(lease.record.payloadHash).toBeDefined();

      expect(pooledRepo.manager.connection.transaction).toHaveBeenCalledTimes(
        1,
      );
      expect(txManager.getRepository).toHaveBeenCalledWith(
        OnboardingIdempotencyRecord,
      );
      expectBoundBefore(txRepo.findOne);
      // The pooled repository is never touched for protected access.
      expect(pooledRepo.findOne).not.toHaveBeenCalled();
      expect(pooledRepo.save).not.toHaveBeenCalled();
      expect(pooledRepo.create).not.toHaveBeenCalled();
    });

    it('never opens or uses a repository when the tenant context cannot be bound inside the transaction', async () => {
      txManager.query.mockRejectedValueOnce(new Error('set_config failed'));

      await expect(coordinator.acquireLease(leaseParams)).rejects.toThrow(
        'set_config failed',
      );
      expect(txRepo.findOne).not.toHaveBeenCalled();
      expect(txRepo.save).not.toHaveBeenCalled();
      expect(pooledRepo.findOne).not.toHaveBeenCalled();
    });

    it('propagates a transaction-open failure without any repository access', async () => {
      pooledRepo.manager.connection.transaction.mockRejectedValueOnce(
        new Error('connection pool exhausted'),
      );

      await expect(coordinator.acquireLease(leaseParams)).rejects.toThrow(
        'connection pool exhausted',
      );
      expect(txManager.query).not.toHaveBeenCalled();
      expect(txRepo.findOne).not.toHaveBeenCalled();
      expect(pooledRepo.findOne).not.toHaveBeenCalled();
    });

    it('fails fast on a blank tenant before opening any transaction or SQL', async () => {
      for (const blank of ['', '   ']) {
        await expect(
          coordinator.acquireLease({ ...leaseParams, tenantId: blank }),
        ).rejects.toThrow(TenantContextRequiredError);
      }
      expect(pooledRepo.manager.connection.transaction).not.toHaveBeenCalled();
      expect(txManager.query).not.toHaveBeenCalled();
      expect(txRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('acquireLease — preserved idempotency semantics', () => {
    it('returns ALREADY_COMPLETED with the cached result when already SUCCEEDED with same payload', async () => {
      const payloadHash = coordinator.computePayloadHash(leaseParams.payload);
      txRepo.findOne.mockResolvedValue(
        existingRecord({
          payloadHash,
          status: OnboardingIdempotencyStatus.SUCCEEDED,
          resultRef: { success: true, configId: 42 },
        }),
      );

      const lease = await coordinator.acquireLease(leaseParams);

      expect(lease.state).toBe('ALREADY_COMPLETED');
      if (lease.state === 'ALREADY_COMPLETED') {
        expect(lease.result).toEqual({ success: true, configId: 42 });
      }
      expect(txRepo.save).not.toHaveBeenCalled();
    });

    it('throws INTEGRITY_CONFLICT when the same key is reused with a different payload', async () => {
      txRepo.findOne.mockResolvedValue(
        existingRecord({ payloadHash: 'hash-abc' }),
      );

      await expect(coordinator.acquireLease(leaseParams)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws COMMAND_IN_PROGRESS while an active lease is held', async () => {
      const payloadHash = coordinator.computePayloadHash(leaseParams.payload);
      txRepo.findOne.mockResolvedValue(
        existingRecord({
          payloadHash,
          leaseOwner: 'worker-busy',
          leaseExpiresAt: new Date(Date.now() + 60000),
        }),
      );

      await expect(coordinator.acquireLease(leaseParams)).rejects.toThrow(
        ConflictException,
      );
    });

    it('reclaims an expired lease and increments the attempt count', async () => {
      const payloadHash = coordinator.computePayloadHash(leaseParams.payload);
      txRepo.findOne.mockResolvedValue(
        existingRecord({
          payloadHash,
          leaseOwner: 'worker-dead',
          leaseExpiresAt: new Date(Date.now() - 10000),
        }),
      );
      txRepo.save.mockImplementation(async (entity: any) => entity);

      const lease = await coordinator.acquireLease({
        ...leaseParams,
        leaseOwner: 'worker-recover',
      });

      expect(lease.state).toBe('ACQUIRED');
      expect(lease.record.leaseOwner).toBe('worker-recover');
      expect(lease.record.attemptCount).toBe(2);
    });

    it('retries a FAILED_RETRYABLE record back into IN_PROGRESS', async () => {
      const payloadHash = coordinator.computePayloadHash(leaseParams.payload);
      txRepo.findOne.mockResolvedValue(
        existingRecord({
          payloadHash,
          status: OnboardingIdempotencyStatus.FAILED_RETRYABLE,
        }),
      );
      txRepo.save.mockImplementation(async (entity: any) => entity);

      const lease = await coordinator.acquireLease({
        ...leaseParams,
        leaseOwner: 'worker-retry',
      });

      expect(lease.state).toBe('ACQUIRED');
      expect(lease.record.status).toBe(OnboardingIdempotencyStatus.IN_PROGRESS);
      expect(lease.record.attemptCount).toBe(2);
    });

    it('rejects a FAILED_FINAL record permanently', async () => {
      const payloadHash = coordinator.computePayloadHash(leaseParams.payload);
      txRepo.findOne.mockResolvedValue(
        existingRecord({
          payloadHash,
          status: OnboardingIdempotencyStatus.FAILED_FINAL,
        }),
      );

      await expect(coordinator.acquireLease(leaseParams)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('completeSuccess / completeFailure — manager-scoped binding', () => {
    it('binds the provided manager before access, uses its repository, and never opens a nested transaction', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue({}),
        getRepository: jest.fn().mockReturnValue(txRepo),
      } as unknown as EntityManager;
      txRepo.findOne.mockResolvedValue(existingRecord({ id: 'record-uuid-9' }));
      txRepo.save.mockResolvedValue(undefined);

      await coordinator.completeSuccess(
        'record-uuid-9',
        { ok: 1 },
        manager,
        'tenant-1',
      );

      expect(pooledRepo.manager.connection.transaction).not.toHaveBeenCalled();
      expect(manager.getRepository).toHaveBeenCalledWith(
        OnboardingIdempotencyRecord,
      );
      expect(txRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'record-uuid-9',
          status: OnboardingIdempotencyStatus.SUCCEEDED,
          resultRef: { ok: 1 },
        }),
      );
      // Binding happened on the provided manager before the first access.
      expect(manager.query).toHaveBeenCalledWith(TENANT_CONTEXT_SET_CONFIG_SQL, [
        'tenant-1',
      ]);
      const bindOrder = (manager.query as jest.Mock).mock.invocationCallOrder[0];
      expect(bindOrder).toBeLessThan(txRepo.findOne.mock.invocationCallOrder[0]);
      expect(pooledRepo.findOne).not.toHaveBeenCalled();
      expect(pooledRepo.save).not.toHaveBeenCalled();
    });

    it('reuses a provided manager without an explicit tenant by discovering the record owner through it, then rebinding', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue({}),
        getRepository: jest.fn().mockReturnValue(txRepo),
      } as unknown as EntityManager;
      txRepo.findOne.mockResolvedValue(
        existingRecord({ id: 'record-uuid-9', tenantId: 'tenant-1' }),
      );

      await coordinator.completeSuccess(
        'record-uuid-9',
        { ok: 1 },
        manager,
      );

      expect(pooledRepo.manager.connection.transaction).not.toHaveBeenCalled();
      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(manager.query).toHaveBeenCalledWith(
        TENANT_CONTEXT_SET_CONFIG_SQL,
        ['tenant-1'],
      );
      const bindOrder = (manager.query as jest.Mock).mock.invocationCallOrder[0];
      expect(bindOrder).toBeLessThan(txRepo.save.mock.invocationCallOrder[0]);
    });

    it('fails closed without mutating when the completion target is not visible through the provided manager', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue({}),
        getRepository: jest.fn().mockReturnValue(txRepo),
      } as unknown as EntityManager;
      txRepo.findOne.mockResolvedValue(null);

      await expect(
        coordinator.completeSuccess('foreign-id', { forged: true }, manager),
      ).rejects.toThrow(ConflictException);
      expect(txRepo.save).not.toHaveBeenCalled();
      expect(txRepo.update).not.toHaveBeenCalled();
    });

    it('fails fast on a blank tenant id before any manager query or repository access', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue({}),
        getRepository: jest.fn().mockReturnValue(txRepo),
      } as unknown as EntityManager;

      await expect(
        coordinator.completeSuccess('record-uuid-9', { ok: 1 }, manager, '  '),
      ).rejects.toThrow(TenantContextRequiredError);
      await expect(
        coordinator.completeFailure(
          'record-uuid-9',
          { message: 'x', isRetryable: true },
          manager,
          '',
        ),
      ).rejects.toThrow(TenantContextRequiredError);
      expect(manager.query).not.toHaveBeenCalled();
      expect(txRepo.findOne).not.toHaveBeenCalled();
      expect(txRepo.save).not.toHaveBeenCalled();
    });

    it('opens exactly one canonical tenant transaction when no manager is supplied and binds before access', async () => {
      txRepo.findOne.mockResolvedValue(existingRecord({ id: 'record-uuid-7' }));
      txRepo.update.mockResolvedValue({ affected: 1 });

      await coordinator.completeFailure(
        'record-uuid-7',
        { message: 'IMPORT_STAGING_EMPTY', isRetryable: true },
        undefined,
        'tenant-1',
      );

      expect(pooledRepo.manager.connection.transaction).toHaveBeenCalledTimes(
        1,
      );
      expect(txRepo.update).toHaveBeenCalledWith(
        'record-uuid-7',
        expect.objectContaining({
          status: OnboardingIdempotencyStatus.FAILED_RETRYABLE,
          lastErrorCode: 'IMPORT_STAGING_EMPTY',
        }),
      );
      expectBoundBefore(txRepo.findOne);
      expect(pooledRepo.findOne).not.toHaveBeenCalled();
      expect(pooledRepo.update).not.toHaveBeenCalled();
    });

    it('fails closed when no manager is supplied and the pooled discovery cannot see the record', async () => {
      pooledRepo.findOne.mockResolvedValue(null);

      await expect(
        coordinator.completeSuccess('hidden-id', { ok: 1 }),
      ).rejects.toThrow(ConflictException);
      expect(pooledRepo.manager.connection.transaction).not.toHaveBeenCalled();
      expect(txRepo.findOne).not.toHaveBeenCalled();
      expect(txRepo.save).not.toHaveBeenCalled();
    });

    it('fails closed when the pooled discovery read errors (e.g. RLS cast on an unbound connection) instead of mutating blind', async () => {
      pooledRepo.findOne.mockRejectedValue(
        new Error('invalid input syntax for type uuid: ""'),
      );

      await expect(
        coordinator.completeSuccess('poisoned-id', { ok: 1 }),
      ).rejects.toThrow(ConflictException);
      expect(pooledRepo.manager.connection.transaction).not.toHaveBeenCalled();
      expect(txRepo.findOne).not.toHaveBeenCalled();
      expect(txRepo.save).not.toHaveBeenCalled();
    });
  });
});
