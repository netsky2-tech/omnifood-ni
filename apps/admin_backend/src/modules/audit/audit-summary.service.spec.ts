import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../core/database/tenant-transaction';
import { ReportingPeriodValidationError } from '../../core/reporting/reporting-period';
import { AuditSummaryService } from './audit-summary.service';

/**
 * Issue #592 permanent rule: change_log is tenant-RLS forced (direct:SIUD),
 * so every AuditSummaryService read must run inside runInTenantTransaction
 * with a transaction-local tenant binding. These specs have runtime teeth:
 * the first statement on the transaction must be the set_config tenant
 * binding and every data query must be tenant-parameterized.
 */
const TENANT_ID = 'tenant-test-123';

describe('AuditSummaryService', () => {
  let service: AuditSummaryService;
  let sqlCalls: Array<{ sql: string; parameters?: unknown[] }>;
  let mockDataSource: { transaction: jest.Mock };

  const bootstrap = (queryResponses: {
    severityCounts?: unknown[];
    latestHigh?: unknown[];
  }) => {
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
              if (sql.includes('COALESCE(c.severity')) {
                return Promise.resolve(queryResponses.severityCounts ?? []);
              }
              if (sql.includes('ORDER BY c.created_at DESC')) {
                return Promise.resolve(queryResponses.latestHigh ?? []);
              }
              throw new Error(`Unexpected SQL: ${sql}`);
            }),
          }),
      ),
    };

    const moduleRef = {
      providers: [
        AuditSummaryService,
        { provide: DataSource, useValue: mockDataSource },
      ],
    };
    // Minimal DI: the summary read only needs the bound DataSource (the
    // slice 6b event list has its own AuditEventsService spec).
    service = new AuditSummaryService(mockDataSource as unknown as DataSource);
    void moduleRef;
  };

  it('binds the tenant context as the FIRST statement and tenant-parameterizes every query', async () => {
    bootstrap({});

    await service.getExecutiveSummary(TENANT_ID);

    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    expect(sqlCalls.length).toBeGreaterThan(0);
    expect(sqlCalls[0].sql).toBe(TENANT_CONTEXT_SET_CONFIG_SQL);
    expect(sqlCalls[0].parameters).toEqual([TENANT_ID]);
    for (const call of sqlCalls.slice(1)) {
      expect(call.parameters?.[0]).toBe(TENANT_ID);
    }
  });

  it('returns the spec §16 contract shape with NULL severity aggregated as INFO', async () => {
    bootstrap({
      severityCounts: [
        { severity: 'CRITICAL', count: 2 },
        { severity: 'WARNING', count: 5 },
        { severity: 'INFO', count: 7 },
        { severity: null, count: 3 }, // historical rows (backfill-free rule)
        { severity: 'SEVERE', count: 1 }, // unknown stored value -> INFO
      ],
      latestHigh: [
        {
          id: 'log-1',
          category: 'ONBOARDING_ACTIVATION_CHECK_FAILED',
          severity: 'CRITICAL',
          occurredAt: new Date('2026-09-01T11:58:00.000Z'),
        },
      ],
    });
    const generatedAt = new Date('2026-09-01T12:00:00.000Z');

    const result = await service.getExecutiveSummary(
      TENANT_ID,
      undefined,
      undefined,
      generatedAt,
    );

    expect(result).toEqual({
      criticalCount: 2,
      warningCount: 5,
      infoCount: 11, // 7 INFO + 3 historical NULL + 1 unknown value
      latestHighSeverity: {
        id: 'log-1',
        category: 'ONBOARDING_ACTIVATION_CHECK_FAILED',
        severity: 'CRITICAL',
        occurredAt: '2026-09-01T11:58:00.000Z',
      },
      generatedAt: '2026-09-01T12:00:00.000Z',
    });
  });

  it('returns zeroed counts and null latestHighSeverity for an empty window', async () => {
    bootstrap({});

    const result = await service.getExecutiveSummary(
      TENANT_ID,
      undefined,
      undefined,
      new Date('2026-09-01T12:00:00.000Z'),
    );

    expect(result).toEqual({
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0,
      latestHighSeverity: null,
      generatedAt: '2026-09-01T12:00:00.000Z',
    });
  });

  it('passes the shared reporting-period bounds as half-open timestamptz parameters (spec §6.2/§16.3)', async () => {
    bootstrap({});

    await service.getExecutiveSummary(
      TENANT_ID,
      '2026-08-01',
      '2026-08-31',
      new Date('2026-09-01T12:00:00.000Z'),
    );

    const countsCall = sqlCalls.find((call) =>
      call.sql.includes('COALESCE(c.severity'),
    );
    // America/Managua fixed offset: 2026-08-01T00:00:00-06:00 and the first
    // instant after 2026-08-31 local.
    expect(countsCall?.parameters?.[1]).toEqual(
      new Date('2026-08-01T06:00:00.000Z'),
    );
    expect(countsCall?.parameters?.[2]).toEqual(
      new Date('2026-09-01T06:00:00.000Z'),
    );
  });

  it('propagates the shared period validation error for an inverted range', async () => {
    bootstrap({});

    await expect(
      service.getExecutiveSummary(TENANT_ID, '2026-09-01', '2026-08-01'),
    ).rejects.toThrowError(ReportingPeriodValidationError);
  });

  it('never returns raw forensic payload fields in the latest high-severity item (spec §16.1)', async () => {
    bootstrap({
      latestHigh: [
        {
          id: 'log-2',
          category: 'DEACTIVATE',
          severity: 'WARNING',
          occurredAt: new Date('2026-09-01T10:00:00.000Z'),
        },
      ],
    });

    const result = await service.getExecutiveSummary(TENANT_ID);

    expect(result.latestHighSeverity).toEqual({
      id: 'log-2',
      category: 'DEACTIVATE',
      severity: 'WARNING',
      occurredAt: '2026-09-01T10:00:00.000Z',
    });
    expect(Object.keys(result.latestHighSeverity ?? {}).sort()).toEqual([
      'category',
      'id',
      'occurredAt',
      'severity',
    ]);
  });
});
