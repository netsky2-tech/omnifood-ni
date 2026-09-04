import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, BadRequestException } from '@nestjs/common';
import {
  OnboardingIdempotencyRecord,
  OnboardingIdempotencyStatus,
} from '../entities/onboarding-idempotency.entity';
import { OnboardingIdempotencyCoordinator } from './onboarding-idempotency.coordinator';

describe('OnboardingIdempotencyCoordinator (Unit)', () => {
  let coordinator: OnboardingIdempotencyCoordinator;
  let repo: jest.Mocked<Repository<OnboardingIdempotencyRecord>>;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<OnboardingIdempotencyRecord>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingIdempotencyCoordinator,
        {
          provide: getRepositoryToken(OnboardingIdempotencyRecord),
          useValue: repo,
        },
      ],
    }).compile();

    coordinator = module.get<OnboardingIdempotencyCoordinator>(
      OnboardingIdempotencyCoordinator,
    );
  });

  it('acquires a fresh lease when key does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.save.mockImplementation(async (entity: any) => ({
      id: 'record-uuid-1',
      ...entity,
    }));

    const lease = await coordinator.acquireLease({
      tenantId: 'tenant-1',
      idempotencyKey: 'key-1',
      commandType: 'ConfigureFiscal',
      payload: { businessName: 'Café Managua' },
      leaseOwner: 'worker-1',
    });

    expect(lease.state).toBe('ACQUIRED');
    expect(lease.record.status).toBe(OnboardingIdempotencyStatus.IN_PROGRESS);
    expect(lease.record.leaseOwner).toBe('worker-1');
    expect(lease.record.payloadHash).toBeDefined();
    expect(repo.save).toHaveBeenCalled();
  });

  it('returns ALREADY_COMPLETED with cached result when already SUCCEEDED with same payload', async () => {
    const payload = { businessName: 'Café Managua' };
    const payloadHash = coordinator.computePayloadHash(payload);

    const existing: OnboardingIdempotencyRecord = {
      id: 'record-uuid-2',
      tenantId: 'tenant-1',
      idempotencyKey: 'key-1',
      commandType: 'ConfigureFiscal',
      payloadHash,
      status: OnboardingIdempotencyStatus.SUCCEEDED,
      leaseOwner: null,
      leaseAcquiredAt: null,
      leaseExpiresAt: null,
      attemptCount: 1,
      resultRef: { success: true, configId: 42 },
      lastErrorCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
    };

    repo.findOne.mockResolvedValue(existing);

    const lease = await coordinator.acquireLease({
      tenantId: 'tenant-1',
      idempotencyKey: 'key-1',
      commandType: 'ConfigureFiscal',
      payload,
    });

    expect(lease.state).toBe('ALREADY_COMPLETED');
    if (lease.state === 'ALREADY_COMPLETED') {
      expect(lease.result).toEqual({ success: true, configId: 42 });
    }
  });

  it('throws INTEGRITY_CONFLICT when same idempotency key is reused with different payload', async () => {
    const existing: OnboardingIdempotencyRecord = {
      id: 'record-uuid-3',
      tenantId: 'tenant-1',
      idempotencyKey: 'key-1',
      commandType: 'ConfigureFiscal',
      payloadHash: 'hash-abc',
      status: OnboardingIdempotencyStatus.SUCCEEDED,
      leaseOwner: null,
      leaseAcquiredAt: null,
      leaseExpiresAt: null,
      attemptCount: 1,
      resultRef: null,
      lastErrorCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
    };

    repo.findOne.mockResolvedValue(existing);

    await expect(
      coordinator.acquireLease({
        tenantId: 'tenant-1',
        idempotencyKey: 'key-1',
        commandType: 'ConfigureFiscal',
        payload: { businessName: 'Different Payload Value' },
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws COMMAND_IN_PROGRESS when active lease is not expired', async () => {
    const payload = { test: 123 };
    const payloadHash = coordinator.computePayloadHash(payload);

    const existing: OnboardingIdempotencyRecord = {
      id: 'record-uuid-4',
      tenantId: 'tenant-1',
      idempotencyKey: 'key-1',
      commandType: 'ConfigureFiscal',
      payloadHash,
      status: OnboardingIdempotencyStatus.IN_PROGRESS,
      leaseOwner: 'worker-busy',
      leaseAcquiredAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + 60000), // active lease!
      attemptCount: 1,
      resultRef: null,
      lastErrorCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    };

    repo.findOne.mockResolvedValue(existing);

    await expect(
      coordinator.acquireLease({
        tenantId: 'tenant-1',
        idempotencyKey: 'key-1',
        commandType: 'ConfigureFiscal',
        payload,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('reclaims expired lease on timeout and increments attemptCount', async () => {
    const payload = { test: 123 };
    const payloadHash = coordinator.computePayloadHash(payload);

    const existing: OnboardingIdempotencyRecord = {
      id: 'record-uuid-5',
      tenantId: 'tenant-1',
      idempotencyKey: 'key-1',
      commandType: 'ConfigureFiscal',
      payloadHash,
      status: OnboardingIdempotencyStatus.IN_PROGRESS,
      leaseOwner: 'worker-dead',
      leaseAcquiredAt: new Date(Date.now() - 60000),
      leaseExpiresAt: new Date(Date.now() - 10000), // expired!
      attemptCount: 1,
      resultRef: null,
      lastErrorCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    };

    repo.findOne.mockResolvedValue(existing);
    repo.save.mockImplementation(async (entity: any) => entity);

    const lease = await coordinator.acquireLease({
      tenantId: 'tenant-1',
      idempotencyKey: 'key-1',
      commandType: 'ConfigureFiscal',
      payload,
      leaseOwner: 'worker-recover',
    });

    expect(lease.state).toBe('ACQUIRED');
    expect(lease.record.leaseOwner).toBe('worker-recover');
    expect(lease.record.attemptCount).toBe(2);
  });
});
