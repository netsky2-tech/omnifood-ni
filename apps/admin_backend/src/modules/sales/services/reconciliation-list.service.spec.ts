import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { ReconciliationListService } from './reconciliation-list.service';
import { ReconciliationListQueryDto } from '../dto/reconciliation-list-query.dto';

/**
 * Unit spec for the reconciliation drill-down list service (dashboard
 * attention band → reconciliation list).
 *
 * Issue #592 permanent rule (same as card-reconciliation-summary):
 * invoice_payments is RLS-protected (parent-owned through invoices), so the
 * read runs inside runInTenantTransaction with a transaction-local tenant
 * binding and a tenant-parameterized query through the parent join. There
 * are NO pooled repository reads.
 */
const TENANT_ID = 'tenant-test-123';

describe('ReconciliationListService', () => {
  let service: ReconciliationListService;
  let sqlCalls: Array<{ sql: string; parameters?: unknown[] }>;
  let mockDataSource: { transaction: jest.Mock };

  const bootstrap = (options: {
    countRow?: Record<string, unknown>;
    dataRows?: Array<Record<string, unknown>>;
  } = {}) => {
    sqlCalls = [];
    mockDataSource = {
      transaction: jest.fn(
        (operation: (manager: { query: jest.Mock }) => Promise<unknown>) =>
          operation({
            query: jest.fn((sql: string, parameters?: unknown[]) => {
              sqlCalls.push({ sql, parameters });
              if (sql === TENANT_CONTEXT_SET_CONFIG_SQL) {
                return Promise.resolve([]);
              }
              if (sql.includes('COUNT')) {
                return Promise.resolve([options.countRow ?? { total: 0 }]);
              }
              if (sql.includes('invoice_payments')) {
                return Promise.resolve(options.dataRows ?? []);
              }
              throw new Error(`Unexpected SQL: ${sql}`);
            }),
          }),
      ),
    };

    service = new ReconciliationListService(
      mockDataSource as unknown as DataSource,
    );
  };

  it('binds the tenant context as the FIRST statement and tenant-parameterizes the queries', async () => {
    bootstrap();

    await service.getReconciliationList(TENANT_ID, new ReconciliationListQueryDto());

    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    expect(sqlCalls.length).toBeGreaterThan(0);
    expect(sqlCalls[0].sql).toBe(TENANT_CONTEXT_SET_CONFIG_SQL);
    expect(sqlCalls[0].parameters).toEqual([TENANT_ID]);
    // Every data/count statement pins the tenant as $1.
    const statementCalls = sqlCalls.slice(1);
    expect(statementCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of statementCalls) {
      expect(call.parameters?.[0]).toBe(TENANT_ID);
    }
  });

  it('never opens a pooled-repository read (issue #592 tripwire by construction)', async () => {
    bootstrap();

    await service.getReconciliationList(TENANT_ID, new ReconciliationListQueryDto());

    // The service's DataSource surface is transaction-only.
    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    expect(Object.keys(mockDataSource)).toEqual(['transaction']);
  });

  it('returns the paginated contract shape with defaults (page 1, limit 25) when no filters are given', async () => {
    bootstrap({ countRow: { total: 0 } });

    const result = await service.getReconciliationList(
      TENANT_ID,
      new ReconciliationListQueryDto(),
    );

    expect(result).toEqual({
      reconciliations: [],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
    });
  });

  it('applies pagination: OFFSET = (page - 1) * limit and totalPages = ceil(total / limit)', async () => {
    bootstrap({
      countRow: { total: 60 },
      dataRows: [
        {
          paymentId: 'pay-1',
          invoiceId: 'inv-1',
          invoiceNumber: 'PA-001',
          amount: 1500,
          amountNio: 1500,
          currency: 'NIO',
          method: 'card',
          voucherCode: 'VCH-1',
          reconciliationStatus: 'PENDIENTE',
          reconciledAt: null,
          reconciledByUserId: null,
          overrideSupervisorRef: null,
          createdAt: new Date('2026-09-01T12:00:00.000Z'),
        },
      ],
    });

    const result = await service.getReconciliationList(TENANT_ID, {
      page: 3,
      limit: 25,
    } as ReconciliationListQueryDto);

    const dataCall = sqlCalls.find((c) => c.sql.includes('ORDER BY'))!;
    // The last two bound parameters are LIMIT then OFFSET.
    const params = dataCall.parameters as unknown[];
    expect(params[params.length - 2]).toBe(25); // limit
    expect(params[params.length - 1]).toBe(50); // offset for page 3
    expect(dataCall.sql).toMatch(/LIMIT\s+\$\d+[\s\S]*OFFSET\s+\$\d+/);
    expect(dataCall.sql).toContain('ORDER BY p.created_at DESC');

    expect(result.pagination).toEqual({
      page: 3,
      limit: 25,
      total: 60,
      totalPages: 3, // ceil(60 / 25)
    });
    expect(result.reconciliations).toHaveLength(1);
    expect(result.reconciliations[0].createdAt).toBe('2026-09-01T12:00:00.000Z');
  });

  it('filters by reconciliation status when provided (PENDIENTE vs MANUAL_OVERRIDE are distinct binds)', async () => {
    bootstrap({ countRow: { total: 2 } });

    await service.getReconciliationList(TENANT_ID, {
      status: 'MANUAL_OVERRIDE',
    } as ReconciliationListQueryDto);

    const dataCall = sqlCalls.find((c) => c.sql.includes('ORDER BY'))!;
    expect(dataCall.sql).toContain('p.reconciliation_status = $2');
    expect(dataCall.parameters).toContain('MANUAL_OVERRIDE');
    // The count query carries the same WHERE clause so total reflects the filter.
    const countCall = sqlCalls.find((c) => c.sql.includes('COUNT'))!;
    expect(countCall.sql).toContain('p.reconciliation_status = $2');
    expect(countCall.parameters).toContain('MANUAL_OVERRIDE');
  });

  it('filters by payment method when provided', async () => {
    bootstrap({ countRow: { total: 1 } });

    await service.getReconciliationList(TENANT_ID, {
      method: 'card',
    } as ReconciliationListQueryDto);

    const dataCall = sqlCalls.find((c) => c.sql.includes('ORDER BY'))!;
    expect(dataCall.sql).toContain('p.method = $2');
    expect(dataCall.parameters).toContain('card');
  });

  it('filters by reconciliation date range using midnight-bounded timestamps', async () => {
    bootstrap({ countRow: { total: 5 } });

    await service.getReconciliationList(TENANT_ID, {
      startDate: '2026-09-01',
      endDate: '2026-09-03',
    } as ReconciliationListQueryDto);

    const dataCall = sqlCalls.find((c) => c.sql.includes('ORDER BY'))!;
    expect(dataCall.sql).toContain('p.reconciled_at >= $2');
    expect(dataCall.sql).toContain('p.reconciled_at <= $3');
    const params = dataCall.parameters as unknown[];
    // startDate → midnight of that day; endDate → inclusive end of that day.
    expect(new Date(params[1] as string).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
    expect(new Date(params[2] as string).toISOString()).toBe(
      '2026-09-03T23:59:59.999Z',
    );
  });

  it('scopes the row set exactly: parent tenant, non-canceled invoice, non-zero amount, voucher-bearing rows', async () => {
    bootstrap();

    await service.getReconciliationList(TENANT_ID, new ReconciliationListQueryDto());

    const sql = sqlCalls[1].sql;
    expect(sql).toContain('i.tenant_id = $1');
    expect(sql).toContain('i.is_canceled = false');
    expect(sql).toContain('p.amount != 0');
    expect(sql).toContain('p.voucher_code IS NOT NULL');
    // Parent-owned isolation: the read joins the tenant-bearing parent.
    expect(sql).toContain('JOIN invoices i ON i.id = p.invoice_id');
    // Sensitive card payload is never selected: no last4 / brand / bank_pos.
    expect(sql).not.toMatch(/last4|card_brand|card_type|bank_pos/i);
  });

  it('resolves terminalId through a LEFT join on the invoice shift and operatorName from users.name', async () => {
    bootstrap();

    await service.getReconciliationList(TENANT_ID, new ReconciliationListQueryDto());

    const dataCall = sqlCalls.find((c) => c.sql.includes('ORDER BY'))!;
    // Both provenance joins are LEFT: rows survive a missing shift or an
    // unresolvable operator (honest nulls for legacy data).
    expect(dataCall.sql).toContain('LEFT JOIN cash_shift_sessions s');
    expect(dataCall.sql).toContain('ON s.id = i.shift_id AND s.tenant_id = $1');
    expect(dataCall.sql).toContain('LEFT JOIN users u');
    expect(dataCall.sql).toContain('ON u.id::text = p.reconciled_by_user_id AND u.tenant_id = $1');
    // Defense in depth: the joined tables carry the same tenant bind as the
    // parent join (mirrors the transaction-local RLS binding).
    expect(dataCall.sql).toContain('s.tenant_id = $1');
    expect(dataCall.sql).toContain('u.tenant_id = $1');
    // The selected provenance columns use the DTO property names.
    expect(dataCall.sql).toContain('s.terminal_id AS "terminalId"');
    expect(dataCall.sql).toContain('u.name AS "operatorName"');
  });

  it('exposes only the user display name — never email or any sensitive user column', async () => {
    bootstrap();

    await service.getReconciliationList(TENANT_ID, new ReconciliationListQueryDto());

    const dataCall = sqlCalls.find((c) => c.sql.includes('ORDER BY'))!;
    expect(dataCall.sql).not.toMatch(
      /email|password|pin_hash|hashed_refresh_token|security_version/i,
    );
  });

  it('keeps the count query join-free so the LEFT JOINs can never overcount the total', async () => {
    bootstrap({ countRow: { total: 3 } });

    const result = await service.getReconciliationList(TENANT_ID, new ReconciliationListQueryDto());

    const countCall = sqlCalls.find((c) => c.sql.includes('COUNT'))!;
    // Same FROM/WHERE shape over the parent join; the provenance joins are
    // not needed because they can neither filter nor multiply rows.
    expect(countCall.sql).toContain('FROM invoice_payments p');
    expect(countCall.sql).toContain('JOIN invoices i ON i.id = p.invoice_id');
    expect(countCall.sql).not.toContain('cash_shift_sessions');
    expect(countCall.sql).not.toContain('users');
    expect(result.pagination.total).toBe(3);
  });

  it('maps terminalId/operatorName into the DTO and nulls unresolvable provenance', async () => {
    const baseRow = {
      paymentId: 'pay-1',
      invoiceId: 'inv-1',
      invoiceNumber: 'PA-001',
      amount: '1500.00',
      amountNio: '1500.00',
      currency: 'NIO',
      method: 'card',
      voucherCode: 'VCH-1',
      reconciliationStatus: 'MANUAL_OVERRIDE',
      reconciledAt: new Date('2026-09-02T15:30:00.000Z'),
      reconciledByUserId: 'user-1',
      overrideSupervisorRef: 'sup-ref-42',
      createdAt: new Date('2026-09-01T12:00:00.000Z'),
    };
    bootstrap({
      countRow: { total: 2 },
      dataRows: [
        { ...baseRow, paymentId: 'pay-resolved', terminalId: 'TERMINAL-01', operatorName: 'Ana Operador' },
        // Legacy MANUAL_OVERRIDE row: no matching shift/user → honest nulls.
        { ...baseRow, paymentId: 'pay-legacy', terminalId: null, operatorName: null },
      ],
    });

    const result = await service.getReconciliationList(TENANT_ID, new ReconciliationListQueryDto());

    expect(result.reconciliations[0].terminalId).toBe('TERMINAL-01');
    expect(result.reconciliations[0].operatorName).toBe('Ana Operador');
    expect(result.reconciliations[1].terminalId).toBeNull();
    expect(result.reconciliations[1].operatorName).toBeNull();
  });

  it('maps persisted rows into the DTO contract (ISO 8601 dates, numeric amounts)', async () => {
    bootstrap({
      countRow: { total: 1 },
      dataRows: [
        {
          paymentId: 'pay-1',
          invoiceId: 'inv-1',
          invoiceNumber: 'PA-001',
          amount: '1500.00',
          amountNio: '1500.00',
          currency: 'NIO',
          method: 'card',
          voucherCode: 'VCH-1',
          reconciliationStatus: 'MANUAL_OVERRIDE',
          reconciledAt: new Date('2026-09-02T15:30:00.000Z'),
          reconciledByUserId: 'user-1',
          overrideSupervisorRef: 'sup-ref-42',
          createdAt: new Date('2026-09-01T12:00:00.000Z'),
        },
      ],
    });

    const result = await service.getReconciliationList(TENANT_ID, new ReconciliationListQueryDto());

    expect(result.reconciliations).toEqual([
      {
        paymentId: 'pay-1',
        invoiceId: 'inv-1',
        invoiceNumber: 'PA-001',
        amount: 1500,
        amountNio: 1500,
        currency: 'NIO',
        method: 'card',
        voucherCode: 'VCH-1',
        reconciliationStatus: 'MANUAL_OVERRIDE',
        reconciledAt: '2026-09-02T15:30:00.000Z',
        reconciledByUserId: 'user-1',
        overrideSupervisorRef: 'sup-ref-42',
        terminalId: null,
        operatorName: null,
        createdAt: '2026-09-01T12:00:00.000Z',
      },
    ]);
  });
});
