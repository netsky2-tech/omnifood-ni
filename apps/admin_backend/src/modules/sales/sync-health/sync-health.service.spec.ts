import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { SyncHealthService } from './sync-health.service';
import { DeviceSyncCredential } from '../../identity/entities/device-sync-credential.entity';

/**
 * Issue #592 permanent rule: every read against RLS-forced tables must run
 * inside runInTenantTransaction with a transaction-local tenant binding.
 * inventory_sync_receipts, inventory_sync_outbox, and device_sync_credentials
 * are all RLS-forced, so the service must issue every query through the bound
 * transaction manager — never through a pooled repository.
 */

const TENANT_ID = 'tenant-test-123';

describe('SyncHealthService', () => {
  let service: SyncHealthService;
  let boundCredentialRepo: { find: jest.Mock };
  let sqlCalls: Array<{ sql: string; parameters?: unknown[] }>;
  let mockDataSource: { transaction: jest.Mock };

  const bootstrap = async (
    queryResponses: {
      receipts?: unknown[];
      rejectedAbove?: unknown[];
      outbox?: unknown[];
    },
    credentials: unknown[] = [],
  ) => {
    sqlCalls = [];
    boundCredentialRepo = { find: jest.fn().mockResolvedValue(credentials) };
    mockDataSource = {
      transaction: jest.fn(
        (
          operation: (manager: {
            query: jest.Mock;
            getRepository: jest.Mock;
          }) => Promise<unknown>,
        ) =>
          operation({
            query: jest.fn((sql: string, parameters?: unknown[]) => {
              sqlCalls.push({ sql, parameters });
              if (sql === TENANT_CONTEXT_SET_CONFIG_SQL) {
                return Promise.resolve([]);
              }
              if (sql.includes('rejectedAboveWatermark')) {
                return Promise.resolve(queryResponses.rejectedAbove ?? []);
              }
              if (sql.includes('inventory_sync_outbox')) {
                return Promise.resolve(queryResponses.outbox ?? []);
              }
              if (sql.includes('acceptedMax')) {
                return Promise.resolve(queryResponses.receipts ?? []);
              }
              throw new Error(`Unexpected SQL: ${sql}`);
            }),
            getRepository: jest.fn().mockImplementation((entity: unknown) => {
              if (entity === DeviceSyncCredential) return boundCredentialRepo;
              const entityName =
                typeof entity === 'function' && 'name' in entity
                  ? (entity as { name: string }).name
                  : 'unknown entity';
              throw new Error(`Unexpected repository request: ${entityName}`);
            }),
          }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncHealthService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<SyncHealthService>(SyncHealthService);
  };

  it('binds the tenant context and runs every query on the transaction manager', async () => {
    await bootstrap({}, []);
    const evaluatedAt = new Date('2026-09-01T12:00:00.000Z');

    await service.getFreshness(TENANT_ID, evaluatedAt);

    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    expect(sqlCalls.length).toBeGreaterThan(0);
    // The FIRST statement on the transaction must be the tenant binding.
    expect(sqlCalls[0].sql).toBe(TENANT_CONTEXT_SET_CONFIG_SQL);
    expect(sqlCalls[0].parameters).toEqual([TENANT_ID]);
    for (const call of sqlCalls) {
      expect(call.parameters).toEqual([TENANT_ID]);
    }
    // The credential read goes through the bound manager's repository, and
    // the set_config call precedes every data query.
    expect(boundCredentialRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
        relations: ['activationAttempt'],
      }),
    );
  });

  it('returns COMPLETE with the deliverable response shape when receipts are fresh', async () => {
    await bootstrap({
      receipts: [
        {
          deviceId: 'pos-01',
          flowType: 'sales',
          acceptedMax: '42',
          acceptedMin: '1',
          acceptedCount: '42',
          lastAcceptedAt: new Date('2026-09-01T11:58:00.000Z'),
        },
      ],
    });
    const evaluatedAt = new Date('2026-09-01T12:00:00.000Z');

    const result = await service.getFreshness(TENANT_ID, evaluatedAt);

    expect(result).toEqual({
      state: 'COMPLETE',
      thresholdMinutes: 5,
      lastCompleteAt: '2026-09-01T11:58:00.000Z',
      perTerminal: [
        {
          terminalId: 'pos-01',
          label: null,
          state: 'COMPLETE',
          acceptedThroughSequence: 42,
          lastReceiptAt: '2026-09-01T11:58:00.000Z',
        },
      ],
      evaluatedAt: '2026-09-01T12:00:00.000Z',
    });
  });

  it('labels terminals from the active credential canonical identity and excludes revoked/retired devices', async () => {
    await bootstrap(
      {
        receipts: [
          {
            deviceId: 'pos-01',
            flowType: 'sales',
            acceptedMax: '10',
            acceptedMin: '1',
            acceptedCount: '10',
            lastAcceptedAt: new Date('2026-09-01T11:58:00.000Z'),
          },
          {
            deviceId: 'pos-revoked',
            flowType: 'sales',
            acceptedMax: '5',
            acceptedMin: '1',
            acceptedCount: '5',
            lastAcceptedAt: new Date('2026-08-01T11:58:00.000Z'),
          },
        ],
      },
      [
        {
          tenantId: TENANT_ID,
          version: 1,
          status: 'ACTIVE',
          activationAttempt: {
            trustedTerminalId: 'pos-01',
            candidateTerminalId: 'pos-01-candidate',
          },
        },
        {
          tenantId: TENANT_ID,
          version: 3,
          status: 'REVOKED',
          activationAttempt: {
            trustedTerminalId: 'pos-revoked',
            candidateTerminalId: 'pos-revoked',
          },
        },
      ],
    );
    const evaluatedAt = new Date('2026-09-01T12:00:00.000Z');

    const result = await service.getFreshness(TENANT_ID, evaluatedAt);

    // §17.2: an explicitly revoked device is excluded from the participating
    // set — its old receipts must not block tenant freshness.
    expect(result.perTerminal.map((t) => t.terminalId)).toEqual(['pos-01']);
    expect(result.perTerminal[0].label).toBe('pos-01');
    expect(result.state).toBe('COMPLETE');
  });

  it('founder policy (a) — a provisioned device that never synced shows as PENDING and does not hold the tenant back', async () => {
    await bootstrap(
      {
        receipts: [
          {
            deviceId: 'pos-01',
            flowType: 'sales',
            acceptedMax: '10',
            acceptedMin: '1',
            acceptedCount: '10',
            lastAcceptedAt: new Date('2026-09-01T11:58:00.000Z'),
          },
        ],
      },
      [
        {
          tenantId: TENANT_ID,
          version: 1,
          status: 'ACTIVE',
          activationAttempt: { trustedTerminalId: 'pos-01' },
        },
        {
          tenantId: TENANT_ID,
          version: 1,
          status: 'ACTIVE',
          activationAttempt: { trustedTerminalId: 'pos-02' },
        },
      ],
    );

    const result = await service.getFreshness(
      TENANT_ID,
      new Date('2026-09-01T12:00:00.000Z'),
    );

    // Never-handshaked device: display-only PENDING, excluded from rollup.
    expect(result.perTerminal.find((t) => t.terminalId === 'pos-02')).toEqual(
      expect.objectContaining({
        state: 'PENDING',
        label: 'pos-02',
        acceptedThroughSequence: null,
        lastReceiptAt: null,
      }),
    );
    expect(result.state).toBe('COMPLETE');
    expect(result.lastCompleteAt).toBe('2026-09-01T11:58:00.000Z');
  });

  it('includes a newly provisioned PENDING-credential device with no receipts in the evidence list (PENDING)', async () => {
    await bootstrap(
      {
        receipts: [
          {
            deviceId: 'pos-01',
            flowType: 'sales',
            acceptedMax: '10',
            acceptedMin: '1',
            acceptedCount: '10',
            lastAcceptedAt: new Date('2026-09-01T11:58:00.000Z'),
          },
        ],
      },
      [
        {
          tenantId: TENANT_ID,
          version: 1,
          status: 'ACTIVE',
          activationAttempt: { trustedTerminalId: 'pos-01' },
        },
        {
          tenantId: TENANT_ID,
          version: 1,
          status: 'PENDING',
          activationAttempt: { trustedTerminalId: 'pos-new' },
        },
      ],
    );

    const result = await service.getFreshness(
      TENANT_ID,
      new Date('2026-09-01T12:00:00.000Z'),
    );

    // Non-excluded credentials (PENDING/ACTIVE) participate in the evidence
    // list even with zero receipts; they resolve to display-only PENDING.
    expect(result.perTerminal.find((t) => t.terminalId === 'pos-new')).toEqual(
      expect.objectContaining({
        state: 'PENDING',
        acceptedThroughSequence: null,
      }),
    );
    expect(result.state).toBe('COMPLETE');
  });

  it('founder policy (b) — after its first accepted receipt, a silent post-checkpoint device rolls the tenant to STALE', async () => {
    await bootstrap({
      receipts: [
        {
          deviceId: 'pos-01',
          flowType: 'sales',
          acceptedMax: '10',
          acceptedMin: '1',
          acceptedCount: '10',
          lastAcceptedAt: new Date('2026-09-01T11:58:00.000Z'),
        },
        {
          deviceId: 'pos-02',
          flowType: 'sales',
          acceptedMax: '7',
          acceptedMin: '1',
          acceptedCount: '7',
          lastAcceptedAt: new Date('2026-09-01T10:00:00.000Z'),
        },
      ],
    });

    const result = await service.getFreshness(
      TENANT_ID,
      new Date('2026-09-01T12:00:00.000Z'),
    );

    // Strict posture forever once the first checkpoint was reached.
    expect(result.perTerminal.find((t) => t.terminalId === 'pos-02')).toEqual(
      expect.objectContaining({ state: 'STALE', acceptedThroughSequence: 7 }),
    );
    expect(result.state).toBe('STALE');
  });

  it('founder policy (c) — an all-PENDING tenant rolls up to UNKNOWN', async () => {
    await bootstrap({}, [
      {
        tenantId: TENANT_ID,
        version: 1,
        status: 'ACTIVE',
        activationAttempt: { trustedTerminalId: 'pos-01' },
      },
      {
        tenantId: TENANT_ID,
        version: 1,
        status: 'PENDING',
        activationAttempt: { trustedTerminalId: 'pos-02' },
      },
    ]);

    const result = await service.getFreshness(
      TENANT_ID,
      new Date('2026-09-01T12:00:00.000Z'),
    );

    expect(result.perTerminal.map((t) => t.state)).toEqual([
      'PENDING',
      'PENDING',
    ]);
    expect(result.state).toBe('UNKNOWN');
    expect(result.lastCompleteAt).toBeNull();
  });

  it('treats STAGED_FUTURE outbox rows above the watermark as gap evidence (PARTIAL)', async () => {
    await bootstrap({
      receipts: [
        {
          deviceId: 'pos-01',
          flowType: 'sales',
          acceptedMax: '42',
          acceptedMin: '1',
          acceptedCount: '42',
          lastAcceptedAt: new Date('2026-09-01T11:58:00.000Z'),
        },
      ],
      outbox: [
        { deviceId: 'pos-01', flowType: 'sales', pendingAboveWatermark: 2 },
      ],
    });

    const result = await service.getFreshness(
      TENANT_ID,
      new Date('2026-09-01T12:00:00.000Z'),
    );

    expect(result.state).toBe('PARTIAL');
    expect(result.perTerminal[0].state).toBe('PARTIAL');
  });

  it('feeds non-accepted receipts above the watermark as gap evidence (PARTIAL)', async () => {
    await bootstrap({
      receipts: [
        {
          deviceId: 'pos-01',
          flowType: 'sales',
          acceptedMax: '42',
          acceptedMin: '1',
          acceptedCount: '42',
          lastAcceptedAt: new Date('2026-09-01T11:58:00.000Z'),
        },
      ],
      rejectedAbove: [
        { deviceId: 'pos-01', flowType: 'sales', rejectedAboveWatermark: 1 },
      ],
    });

    const result = await service.getFreshness(
      TENANT_ID,
      new Date('2026-09-01T12:00:00.000Z'),
    );

    expect(result.state).toBe('PARTIAL');
  });

  it('reports UNKNOWN for a tenant with no credentials and no receipts', async () => {
    await bootstrap({}, []);

    const result = await service.getFreshness(
      TENANT_ID,
      new Date('2026-09-01T12:00:00.000Z'),
    );

    expect(result.state).toBe('UNKNOWN');
    expect(result.perTerminal).toEqual([]);
    expect(result.lastCompleteAt).toBeNull();
  });

  it('uses the weakest stream when a terminal has several flows (min watermark, oldest receipt, any gap)', async () => {
    await bootstrap({
      receipts: [
        {
          deviceId: 'pos-01',
          flowType: 'sales',
          acceptedMax: '42',
          acceptedMin: '1',
          acceptedCount: '42',
          lastAcceptedAt: new Date('2026-09-01T11:58:00.000Z'),
        },
        {
          deviceId: 'pos-01',
          flowType: 'inventory',
          acceptedMax: '7',
          acceptedMin: '1',
          acceptedCount: '7',
          lastAcceptedAt: new Date('2026-09-01T11:40:00.000Z'),
        },
      ],
    });

    const result = await service.getFreshness(
      TENANT_ID,
      new Date('2026-09-01T12:00:00.000Z'),
    );

    expect(result.perTerminal[0]).toMatchObject({
      terminalId: 'pos-01',
      acceptedThroughSequence: 7,
      lastReceiptAt: '2026-09-01T11:40:00.000Z',
    });
  });
});
