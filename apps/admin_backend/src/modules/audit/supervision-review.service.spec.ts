import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../core/database/tenant-transaction';
import { AuditLog } from '../identity/entities/audit-log.entity';
import { User } from '../identity/entities/user.entity';
import { SupervisionReviewService } from './supervision-review.service';
import {
  SUPERVISION_REVIEW_ACTIONS,
} from '../supervision/contracts/supervision-policy.contract';

/**
 * The owner's REVIEW QUEUE for the tenant's supervision policy.
 *
 * Contract under test:
 * - every read rides the tenant-bound transaction (issue #512 pattern) and
 *   asks the store for EXACTLY the supervision action codes — the queue is
 *   not a generic ledger with a filter;
 * - the COUNTS cover the whole period while the ROWS are page-capped, and
 *   the response is honest about truncation;
 * - the two facts the review needs that are not columns (the flow and the
 *   self-authorization) are DERIVED from the action code — the metadata blob
 *   and the hash-chain columns NEVER travel to this surface;
 * - the credential method and the authorizer identity DO travel: they are
 *   columns, and they are the evidence the owner reviews.
 */
const TENANT_ID = 'tenant-review-123';

const makeQueryBuilder = (rows: AuditLog[], raw: unknown[] = []) => {
  const calls: Array<[string, unknown[]]> = [];
  const qb: Record<string, unknown> = {};
  for (const method of [
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'take',
    'select',
    'addSelect',
    'groupBy',
  ]) {
    qb[method] = jest.fn((...args: unknown[]) => {
      calls.push([method, args]);
      return qb;
    });
  }
  qb.getMany = jest.fn().mockResolvedValue(rows);
  qb.getRawMany = jest.fn().mockResolvedValue(raw);
  return { qb, calls };
};

describe('SupervisionReviewService', () => {
  const makeRow = (
    overrides: Partial<Record<keyof AuditLog, unknown>> = {},
  ): AuditLog =>
    ({
      id: 'log-1',
      tenant_id: TENANT_ID,
      user_id: 'user-uuid-1',
      user: { id: 'user-uuid-1', email: 'cajero@tenant.test' },
      action: 'SELF_AUTHORIZED_CLOSE_SESSION',
      target_type: null,
      target_id: null,
      device_id: 'POS-1',
      sequence_no: 7,
      timestamp: new Date('2026-09-01T11:58:00.000Z'),
      metodo_autorizacion: 'PIN',
      usuario_autorizador_id: 'user-uuid-1',
      // Forensic payload — must never leak through this read model.
      metadata: { justification: 'cambio de caja', policy: 'SELF_ALLOWED' },
      prev_hash: 'deadbeef-prev',
      entry_hash: 'deadbeef-entry',
      hash_version: 'v3',
      forensic_status: 'ACTIVE',
      ...overrides,
    }) as unknown as AuditLog;

  interface Harness {
    service: SupervisionReviewService;
    dataSource: { transaction: jest.Mock };
    setConfigCalls: Array<[string, string[]]>;
    setBound: (
      rows: AuditLog[],
      raw?: unknown[],
    ) => {
      count: ReturnType<typeof makeQueryBuilder>;
      page: ReturnType<typeof makeQueryBuilder>;
    };
    userFind: jest.Mock;
  }

  const makeHarness = (): Harness => {
    const pooledAuditLog = { find: jest.fn(), createQueryBuilder: jest.fn() };
    let countQb = makeQueryBuilder([], []);
    let pageQb = makeQueryBuilder([], []);
    let countCall = 0;
    const userFind = jest.fn().mockResolvedValue([]);
    const boundManager = {
      query: jest.fn(async (sql: string, params: string[]) => {
        harnessRef.value.setConfigCalls.push([sql, params]);
        return [];
      }),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === AuditLog) {
          return {
            createQueryBuilder: jest.fn(() => {
              countCall += 1;
              // The first builder is the COUNT read, the second the page.
              return countCall % 2 === 1 ? countQb.qb : pageQb.qb;
            }),
          };
        }
        if (entity === User) {
          return { find: userFind };
        }
        throw new Error('unexpected repository request');
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        async (work: (manager: unknown) => Promise<unknown>) =>
          work(boundManager),
      ),
    };
    const harnessRef: { value: Harness } = {
      value: undefined as unknown as Harness,
    };
    const harness: Harness = {
      service: undefined as unknown as SupervisionReviewService,
      dataSource,
      setConfigCalls: [],
      userFind,
      setBound: (rows, raw = []) => {
        countQb = makeQueryBuilder([], raw);
        pageQb = makeQueryBuilder(rows);
        return { count: countQb, page: pageQb };
      },
    };
    harnessRef.value = harness;
    harness.service = new SupervisionReviewService(
      pooledAuditLog as unknown as never,
      dataSource as unknown as never,
    );
    return harness;
  };

  it('asks the store for exactly the supervision action codes, inside the tenant transaction', async () => {
    const h = makeHarness();
    const built = h.setBound([], []);

    await h.service.getReview(TENANT_ID, {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });

    expect(h.setConfigCalls).toEqual([
      [TENANT_CONTEXT_SET_CONFIG_SQL, [TENANT_ID]],
    ]);
    // Both reads (the count and the page) ask for the same scoped set.
    for (const qb of [built.count, built.page]) {
      const whereArgs = qb.calls.filter(([m]) => m === 'where');
      expect(whereArgs).toEqual([
        ['where', ['audit.tenant_id = :tenantId', { tenantId: TENANT_ID }]],
      ]);
      const actionClause = qb.calls
        .filter(([m]) => m === 'andWhere')
        .find(([, args]) => String(args[0]).includes('action IN'));
      expect(actionClause?.[1]).toEqual([
        'audit.action IN (:...actions)',
        { actions: SUPERVISION_REVIEW_ACTIONS },
      ]);
      // The shared reporting-period parser: America/Managua half-open bounds.
      const bounds = qb.calls
        .filter(([m]) => m === 'andWhere')
        .map(([, args]) => args[0]);
      expect(bounds).toContain('audit.timestamp >= :startInclusiveUtc');
      expect(bounds).toContain('audit.timestamp < :endExclusiveUtc');
    }
    // The page is capped with one probe row, so truncation is provable.
    expect(built.page.calls.filter(([m]) => m === 'take')).toEqual([
      ['take', [51]],
    ]);
  });

  it('derives the flow and the self-authorization from the ACTION CODE, never from the metadata blob', async () => {
    const h = makeHarness();
    h.setBound(
      [
        makeRow({
          action: 'SELF_AUTHORIZED_CLOSE_SESSION',
          metodo_autorizacion: 'PIN',
          usuario_autorizador_id: 'user-uuid-1',
        }),
      ],
      [{ action: 'SELF_AUTHORIZED_CLOSE_SESSION', count: '1' }],
    );

    const result = await h.service.getReview(TENANT_ID, {});

    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry.flow).toBe('CLOSE_BOX');
    expect(entry.hadSupervisor).toBe(false);
    expect(entry.method).toBe('PIN');
    expect(entry.actorEmail).toBe('cajero@tenant.test');
    expect(entry.severity).toBe('CRITICAL');
    // The metadata blob never travels: it would leak the raw justification
    // and the internal policy sentinel.
    expect(JSON.stringify(result)).not.toContain('SELF_ALLOWED');
    expect(JSON.stringify(result)).not.toContain('deadbeef');
  });

  it('resolves WHO signed it, apart from who operated it', async () => {
    const h = makeHarness();
    h.setBound(
      [
        makeRow({
          action: 'SUPERVISOR_OVERRIDE_CLOSE_SESSION',
          user_id: 'cashier-uuid',
          user: { id: 'cashier-uuid', email: 'cajero@tenant.test' },
          metodo_autorizacion: 'PIN',
          usuario_autorizador_id: 'supervisor-uuid',
        }),
      ],
      [{ action: 'SUPERVISOR_OVERRIDE_CLOSE_SESSION', count: '1' }],
    );
    h.userFind.mockResolvedValue([
      { id: 'supervisor-uuid', email: 'gerente@tenant.test' },
    ]);

    const result = await h.service.getReview(TENANT_ID, {});

    expect(result.entries[0].actorEmail).toBe('cajero@tenant.test');
    expect(result.entries[0].authorizerEmail).toBe('gerente@tenant.test');
    expect(result.entries[0].hadSupervisor).toBe(true);
    expect(result.entries[0].flow).toBe('CLOSE_BOX');
  });

  it('counts the WHOLE period per flow, split by who signed, and reports an honest total', async () => {
    const h = makeHarness();
    h.setBound(
      [makeRow()],
      [
        { action: 'SELF_AUTHORIZED_CLOSE_SESSION', count: '3' },
        { action: 'SUPERVISOR_OVERRIDE_CLOSE_SESSION', count: '1' },
        { action: 'SELF_AUTHORIZED_MANUAL_DISCOUNT', count: '2' },
      ],
    );

    const result = await h.service.getReview(TENANT_ID, {});

    expect(result.total).toBe(6);
    expect(result.selfAuthorizedTotal).toBe(5);
    const byClass = Object.fromEntries(
      result.byClass.map((entry) => [entry.flow, entry]),
    );
    expect(byClass.CLOSE_BOX).toEqual({
      flow: 'CLOSE_BOX',
      supervised: 1,
      selfAuthorized: 3,
    });
    expect(byClass.MANUAL_DISCOUNT).toEqual({
      flow: 'MANUAL_DISCOUNT',
      supervised: 0,
      selfAuthorized: 2,
    });
    expect(byClass.CASH_DRAWER).toBeUndefined();
  });

  it('is honest about truncation: the page is capped and the flag says so', async () => {
    const h = makeHarness();
    h.setBound(
      [makeRow(), makeRow({ id: 'log-2' })],
      [{ action: 'SELF_AUTHORIZED_CLOSE_SESSION', count: '42' }],
    );

    const result = await h.service.getReview(TENANT_ID, { limitInput: 1 });

    expect(result.limit).toBe(1);
    expect(result.total).toBe(42);
    expect(result.truncated).toBe(true);
    expect(result.entries).toHaveLength(1);
  });
});
