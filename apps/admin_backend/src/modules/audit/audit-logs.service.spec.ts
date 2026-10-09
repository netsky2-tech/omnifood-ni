import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../core/database/tenant-transaction';
import { AuditLog } from '../identity/entities/audit-log.entity';
import { AuditIntegrityAlert } from '../identity/entities/audit-integrity-alert.entity';
import { AuditLogsService } from './audit-logs.service';

/**
 * POS forensic audit ledger read service (S4a): projects the hash-chained
 * `audit_logs` store (written by POST /identity/audit) into the owner
 * dashboard — a SECOND, correct source beside the change_log stream, never a
 * replacement for it.
 *
 * Contract under test:
 * - every read rides the tenant-bound transaction (issue #512 pattern): the
 *   pooled repositories stay declared as tripwires and any access that
 *   escapes the bound transaction fails here instead of in production;
 * - the response carries identity evidence (actor), the action code, the
 *   entity reference, the device and the timestamp — NEVER the metadata
 *   blob and NEVER the hash columns (prev_hash / entry_hash / hash_version),
 *   mirroring the AuditEventsDto discipline;
 * - the page cap is bounded (default 50, max 100) and the response is
 *   honest about truncation (`truncated`), never implying completeness;
 * - the nightly integrity alerts (audit_integrity_alerts) surface read-only,
 *   without the signature column (hash-derived forensic dedupe key).
 */
const TENANT_ID = 'tenant-test-123';

/** Minimal chainable QueryBuilder mock recording the built predicate shape. */
const makeQueryBuilder = (rows: AuditLog[]) => {
  const calls: Array<[string, unknown[]]> = [];
  const qb: Record<string, unknown> = {};
  for (const method of [
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'take',
  ]) {
    qb[method] = jest.fn((...args: unknown[]) => {
      calls.push([method, args]);
      return qb;
    });
  }
  const getMany = jest.fn().mockResolvedValue(rows);
  qb.getMany = getMany;
  return { qb, calls, getMany };
};

describe('AuditLogsService', () => {
  interface Harness {
    service: AuditLogsService;
    pooledAuditLog: { find: jest.Mock; createQueryBuilder: jest.Mock };
    pooledAlert: { find: jest.Mock; createQueryBuilder: jest.Mock };
    boundManager: { query: jest.Mock; getRepository: jest.Mock },
    alertFind: jest.Mock;
    dataSource: { transaction: jest.Mock };
    setConfigCalls: Array<[string, string[]]>;
    setBoundQb: (rows: AuditLog[]) => ReturnType<typeof makeQueryBuilder>;
  }

  const makeHarness = (): Harness => {
    // Pooled tripwires: any call here means an access escaped the bound
    // transaction and would be unbound in production.
    const pooledAuditLog = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const pooledAlert = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    let boundQbFactory = () => makeQueryBuilder([]);
    const alertFind = jest.fn().mockResolvedValue([]);
    const boundManager = {
      query: jest.fn(async (sql: string, params: string[]) => {
        (harnessRef.value as Harness).setConfigCalls.push([sql, params]);
        return [];
      }),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === AuditLog) {
          return { createQueryBuilder: jest.fn(() => boundQbFactory().qb) };
        }
        if (entity === AuditIntegrityAlert) {
          return { find: alertFind };
        }
        throw new Error(`unexpected repository request for ${String(entity)}`);
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        async (work: (manager: unknown) => Promise<unknown>) =>
          work(boundManager),
      ),
    };

    const harnessRef: { value: Harness | undefined } = { value: undefined };
    const harness: Harness = {
      service: undefined as unknown as AuditLogsService,
      pooledAuditLog,
      pooledAlert,
      boundManager,
      alertFind,
      dataSource,
      setConfigCalls: [],
      setBoundQb: (rows) => {
        const built = makeQueryBuilder(rows);
        boundQbFactory = () => built;
        return built;
      },
    };
    harnessRef.value = harness;
    harness.service = new AuditLogsService(
      pooledAuditLog as unknown as never,
      pooledAlert as unknown as never,
      dataSource as unknown as never,
    );
    return harness;
  };

  const makeRow = (
    overrides: Partial<Record<keyof AuditLog, unknown>> = {},
  ): AuditLog =>
    ({
      id: 'log-1',
      tenant_id: TENANT_ID,
      user_id: 'user-uuid-1',
      user: { id: 'user-uuid-1', email: 'cashier@tenant.test' },
      action: 'SALE_VOIDED',
      target_type: 'invoice',
      target_id: 'inv-001',
      device_id: 'POS-1',
      sequence_no: 7,
      timestamp: new Date('2026-09-01T11:58:00.000Z'),
      // Forensic payload — must never leak through the read model.
      metadata: { reason: 'void reason', total: '875.00' },
      prev_hash: 'deadbeef-prev',
      entry_hash: 'deadbeef-entry',
      hash_version: 'v3',
      forensic_status: 'ACTIVE',
      ...overrides,
    }) as unknown as AuditLog;

  describe('getLedger (GET /operations/audit/ledger read model)', () => {
    it('binds the read through a tenant transaction and uses the shared reporting bounds with the default limit', async () => {
      const h = makeHarness();
      const built = h.setBoundQb([]);

      await h.service.getLedger(TENANT_ID, {
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      });

      expect(h.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(h.setConfigCalls).toEqual([
        [TENANT_CONTEXT_SET_CONFIG_SQL, [TENANT_ID]],
      ]);
      // Pooled tripwires stay untouched: no read escapes the bound transaction.
      expect(h.pooledAuditLog.find).not.toHaveBeenCalled();
      expect(h.pooledAuditLog.createQueryBuilder).not.toHaveBeenCalled();

      const takeArgs = built.calls.filter(([m]) => m === 'take');
      // limit + 1 probe row for the honest truncation flag.
      expect(takeArgs).toEqual([['take', [51]]]);
      const whereArgs = built.calls.filter(([m]) => m === 'where');
      expect(whereArgs).toEqual([
        ['where', ['audit.tenant_id = :tenantId', { tenantId: TENANT_ID }]],
      ]);
      // America/Managua half-open bounds, same shared parser as /events.
      const andWhere = built.calls.filter(([m]) => m === 'andWhere');
      expect(andWhere).toEqual([
        [
          'andWhere',
          [
            'audit.timestamp >= :startInclusiveUtc',
            { startInclusiveUtc: new Date('2026-08-01T06:00:00.000Z') },
          ],
        ],
        [
          'andWhere',
          [
            'audit.timestamp < :endExclusiveUtc',
            { endExclusiveUtc: new Date('2026-09-01T06:00:00.000Z') },
          ],
        ],
      ]);
    });

    it('exposes identity evidence, action, entity reference, device and sequence — never metadata, never hash columns', async () => {
      const h = makeHarness();
      h.setBoundQb([
        makeRow(),
        makeRow({
          id: 'log-2',
          action: 'CREDIT_NOTE_CREATED',
          target_type: 'credit_note',
          target_id: 'cn-9',
          user: undefined, // no joined user row -> null actor email
        }),
        makeRow({
          id: 'log-3',
          action: 'BRAND_NEW_POS_CODE', // unknown code -> INFO fallback
        }),
      ]);

      const result = await h.service.getLedger(TENANT_ID, {});

      expect(result.entries).toHaveLength(3);
      expect(result.entries[0]).toEqual({
        id: 'log-1',
        occurredAt: '2026-09-01T11:58:00.000Z',
        actorEmail: 'cashier@tenant.test',
        actorUserId: 'user-uuid-1',
        action: 'SALE_VOIDED',
        // Derived from the action through the SINGLE AuditRiskClassifier —
        // the same map ChangeLogService persists at ingestion.
        severity: 'CRITICAL',
        targetType: 'invoice',
        targetId: 'inv-001',
        deviceId: 'POS-1',
        sequenceNo: 7,
      });
      expect(result.entries[1].actorEmail).toBeNull();
      expect(result.entries[1].severity).toBe('CRITICAL');

      const allowedKeys = [
        'action',
        'actorEmail',
        'actorUserId',
        'deviceId',
        'id',
        'occurredAt',
        'sequenceNo',
        'severity',
        'targetId',
        'targetType',
      ];
      for (const entry of result.entries) {
        expect(Object.keys(entry).sort()).toEqual(allowedKeys);
      }
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('metadata');
      expect(serialized).not.toContain('prev_hash');
      expect(serialized).not.toContain('entry_hash');
      expect(serialized).not.toContain('hash_version');
      expect(serialized).not.toContain('deadbeef');
      expect(serialized).not.toContain('void reason');
    });

    it('resolves an unknown POS action code to the documented INFO fallback', async () => {
      const h = makeHarness();
      h.setBoundQb([makeRow({ id: 'log-9', action: 'BRAND_NEW_POS_CODE' })]);

      const result = await h.service.getLedger(TENANT_ID, {});
      expect(result.entries[0].severity).toBe('INFO');
    });

    it('reports truncation honestly when the cap was hit, and not otherwise', async () => {
      const h = makeHarness();
      h.setBoundQb(Array.from({ length: 51 }, (_, i) => makeRow({ id: `log-${i}` })));
      const hit = await h.service.getLedger(TENANT_ID, {});
      expect(hit.entries).toHaveLength(50);
      expect(hit.truncated).toBe(true);

      const h2 = makeHarness();
      h2.setBoundQb(Array.from({ length: 50 }, (_, i) => makeRow({ id: `log-${i}` })));
      const exact = await h2.service.getLedger(TENANT_ID, {});
      expect(exact.entries).toHaveLength(50);
      expect(exact.truncated).toBe(false);
    });

    it('clamps the page cap to the documented maximum and forwards every optional filter', async () => {
      const h = makeHarness();
      const built = h.setBoundQb([]);

      await h.service.getLedger(TENANT_ID, {
        actorUserId: 'user-uuid-2',
        targetType: 'invoice',
        targetId: 'inv-42',
        action: 'SALE_VOIDED',
        limitInput: 250,
      });

      const takeArgs = built.calls.filter(([m]) => m === 'take');
      expect(takeArgs).toEqual([['take', [101]]]);

      const andWhere = built.calls
        .filter(([m]) => m === 'andWhere')
        .map(([, args]) => args);
      expect(andWhere).toEqual([
        ['audit.user_id = :actorUserId', { actorUserId: 'user-uuid-2' }],
        ['audit.target_type = :targetType', { targetType: 'invoice' }],
        ['audit.target_id = :targetId', { targetId: 'inv-42' }],
        ['audit.action = :action', { action: 'SALE_VOIDED' }],
      ]);
    });

    it('omits the optional filter predicates when they are not supplied', async () => {
      const h = makeHarness();
      const built = h.setBoundQb([]);

      await h.service.getLedger(TENANT_ID, {});

      const andWhere = built.calls.filter(([m]) => m === 'andWhere');
      expect(andWhere).toEqual([]);
    });
  });

  describe('getIntegrityAlerts (GET /operations/audit/integrity read model)', () => {
    const makeAlert = (
      overrides: Partial<Record<keyof AuditIntegrityAlert, unknown>> = {},
    ): AuditIntegrityAlert =>
      ({
        id: 'alert-1',
        tenant_id: TENANT_ID,
        device_id: 'POS-1',
        user_id: 'user-uuid-1',
        gap_start: 41,
        gap_end: 44,
        signature: 'sha256-signature-blob',
        first_detected_at: new Date('2026-09-01T08:00:00.000Z'),
        last_seen_at: new Date('2026-09-02T08:00:00.000Z'),
        ...overrides,
      }) as unknown as AuditIntegrityAlert;

    it('binds the read through a tenant transaction, filters by tenant and orders most recent first', async () => {
      const h = makeHarness();
      h.alertFind.mockResolvedValue([]);

      await h.service.getIntegrityAlerts(TENANT_ID);

      expect(h.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(h.setConfigCalls).toEqual([
        [TENANT_CONTEXT_SET_CONFIG_SQL, [TENANT_ID]],
      ]);
      expect(h.pooledAlert.find).not.toHaveBeenCalled();
      expect(h.alertFind).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        order: { last_seen_at: 'DESC' },
      });
    });

    it('surfaces the nightly gap state without the signature forensic column', async () => {
      const h = makeHarness();
      h.alertFind.mockResolvedValue([makeAlert()]);

      const result = await h.service.getIntegrityAlerts(TENANT_ID);

      expect(result.alerts).toEqual([
        {
          id: 'alert-1',
          deviceId: 'POS-1',
          actorUserId: 'user-uuid-1',
          gapStart: 41,
          gapEnd: 44,
          firstDetectedAt: '2026-09-01T08:00:00.000Z',
          lastSeenAt: '2026-09-02T08:00:00.000Z',
        },
      ]);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('signature');
      expect(serialized).not.toContain('sha256-signature-blob');
    });
  });
});
