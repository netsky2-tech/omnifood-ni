import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { CardReconciliationSummaryService } from './card-reconciliation-summary.service';

/**
 * Issue #592 permanent rule: invoice_payments is RLS-protected
 * (parent-owned through invoices), so every
 * CardReconciliationSummaryService read must run inside
 * runInTenantTransaction with a transaction-local tenant binding and a
 * tenant-parameterized query through the parent join.
 */
const TENANT_ID = 'tenant-test-123';

describe('CardReconciliationSummaryService', () => {
  let service: CardReconciliationSummaryService;
  let sqlCalls: Array<{ sql: string; parameters?: unknown[] }>;
  let mockDataSource: { transaction: jest.Mock };

  const bootstrap = (aggregateRow?: Record<string, unknown>) => {
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
              if (sql.includes('invoice_payments')) {
                return Promise.resolve(aggregateRow ? [aggregateRow] : []);
              }
              throw new Error(`Unexpected SQL: ${sql}`);
            }),
          }),
      ),
    };

    service = new CardReconciliationSummaryService(
      mockDataSource as unknown as DataSource,
    );
  };

  it('binds the tenant context as the FIRST statement and tenant-parameterizes the query', async () => {
    bootstrap();

    await service.getCardReconciliationSummary(TENANT_ID);

    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    expect(sqlCalls.length).toBeGreaterThan(0);
    expect(sqlCalls[0].sql).toBe(TENANT_CONTEXT_SET_CONFIG_SQL);
    expect(sqlCalls[0].parameters).toEqual([TENANT_ID]);
    expect(sqlCalls[1].parameters).toEqual([TENANT_ID]);
  });

  it('returns the spec §15 contract shape for pending rows', async () => {
    bootstrap({
      pendingCount: 4,
      pendingAmountNio: 1520.5,
      oldestPendingAt: new Date('2026-08-30T15:30:00.000Z'),
      manualOverrideCount: 2,
      manualOverrideAmountNio: 310,
    });
    const generatedAt = new Date('2026-09-01T12:00:00.000Z');

    const result = await service.getCardReconciliationSummary(
      TENANT_ID,
      generatedAt,
    );

    expect(result).toEqual({
      pendingCount: 4,
      pendingAmountNio: 1520.5,
      oldestPendingAt: '2026-08-30T15:30:00.000Z',
      manualOverrideCount: 2,
      manualOverrideAmountNio: 310,
      generatedAt: '2026-09-01T12:00:00.000Z',
    });
  });

  it('returns zeroed outstanding state (oldestPendingAt null) when nothing is pending', async () => {
    bootstrap({
      pendingCount: 0,
      pendingAmountNio: 0,
      oldestPendingAt: null,
      manualOverrideCount: 0,
      manualOverrideAmountNio: 0,
    });

    const result = await service.getCardReconciliationSummary(TENANT_ID);

    expect(result).toEqual({
      pendingCount: 0,
      pendingAmountNio: 0,
      oldestPendingAt: null,
      manualOverrideCount: 0,
      manualOverrideAmountNio: 0,
      generatedAt: expect.any(String),
    });
  });

  it('returns zeroed outstanding state when the tenant has no rows at all', async () => {
    bootstrap();

    const result = await service.getCardReconciliationSummary(TENANT_ID);

    expect(result).toEqual({
      pendingCount: 0,
      pendingAmountNio: 0,
      oldestPendingAt: null,
      manualOverrideCount: 0,
      manualOverrideAmountNio: 0,
      generatedAt: expect.any(String),
    });
  });

  it('scopes the outstanding definition exactly: parent tenant, non-canceled invoice, card methods', async () => {
    bootstrap();

    await service.getCardReconciliationSummary(TENANT_ID);

    const sql = sqlCalls[1].sql;
    expect(sql).toContain('i.tenant_id = $1');
    expect(sql).toContain('i.is_canceled = false');
    expect(sql).toContain(
      "UPPER(p.method) IN ('CARD', 'TARJETA', 'BAC', 'BANPRO')",
    );
    // Single-pass conditional aggregation: the WHERE clause no longer pins
    // reconciliation_status; both PENDIENTE and MANUAL_OVERRIDE aggregates
    // come from the same query.
    expect(sql).toContain(
      "p.reconciliation_status = 'PENDIENTE' THEN",
    );
    expect(sql).toContain(
      "p.reconciliation_status = 'MANUAL_OVERRIDE' THEN",
    );
    expect(sql).toContain('AS "manualOverrideCount"');
    expect(sql).toContain('AS "manualOverrideAmountNio"');
    // The WHERE scope must be tenant + lifecycle + method only: no status
    // row filter (which would hide MANUAL_OVERRIDE rows from the scan).
    const whereClause = sql.slice(sql.indexOf('WHERE'));
    expect(whereClause).not.toContain('reconciliation_status');
    // Parent-owned isolation: the read joins the tenant-bearing parent.
    expect(sql).toContain('JOIN invoices i ON i.id = p.invoice_id');
    // Spec §15.2: no sensitive payment payload in the executive aggregate.
    expect(sql).not.toMatch(/last4|voucher_code|card_brand|bank_pos/i);
  });

  it('still treats reconciliation_status as the marker: no WHERE-status filter means conditional CASE only', async () => {
    bootstrap();

    await service.getCardReconciliationSummary(TENANT_ID);

    const sql = sqlCalls[1].sql;
    // The status markers appear only inside conditional aggregation:
    // PENDIENTE 3x (COUNT, SUM, MIN), MANUAL_OVERRIDE 2x (COUNT, SUM).
    expect(sql.match(/p\.reconciliation_status = 'PENDIENTE'/g)?.length).toBe(
      3,
    );
    expect(
      sql.match(/p\.reconciliation_status = 'MANUAL_OVERRIDE'/g)?.length,
    ).toBe(2);
  });

  it('never opens a pooled-repository read (issue #592 tripwire by construction)', async () => {
    bootstrap();

    await service.getCardReconciliationSummary(TENANT_ID);

    // The service's DataSource surface is transaction-only.
    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    expect(Object.keys(mockDataSource)).toEqual(['transaction']);
  });
});
