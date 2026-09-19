import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { RebindDeviceAndAlertTenantColumns1809130000000 } from './1809130000000-RebindDeviceAndAlertTenantColumns';

/**
 * The authored catalog truth for unit C.3 of slice C (issue #286): four
 * tables, six policies, carried only by the two device tables. This is
 * deliberately an independent copy of the migration's targets so the spec
 * cannot pass by construction. The rows were taken from `pg_policies`'
 * structural columns (never `qual`/`with_check`); the abbreviated
 * `device_sync_cred_events_tenant_*` naming is verbatim from the creating
 * migration 1807000000000 and must not be "regularized".
 *
 * `audit_integrity_alerts` and `forensic_alerts` carry zero tenant policies:
 * they are column-only rebinds. No view depends on any of these four columns
 * (the repository's only view reads `sys_parametros_config`), so no target
 * declares views.
 */
const REBOUND_TABLES = [
  'device_sync_credentials',
  'device_sync_credential_events',
  'audit_integrity_alerts',
  'forensic_alerts',
] as const;

const POLICY_ROWS: Array<{
  table: string;
  policyName: string;
  cmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using: boolean;
  check: boolean;
}> = [
  {
    table: 'device_sync_credentials',
    policyName: 'device_sync_credentials_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'device_sync_credentials',
    policyName: 'device_sync_credentials_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'device_sync_credentials',
    policyName: 'device_sync_credentials_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'device_sync_credentials',
    policyName: 'device_sync_credentials_tenant_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
  {
    table: 'device_sync_credential_events',
    policyName: 'device_sync_cred_events_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'device_sync_credential_events',
    policyName: 'device_sync_cred_events_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
];

// Read from the creating migrations' DDL, per table. The device tables'
// columns are varchar(128) (1807000000000:11 and :104); the two alert tables
// carry unbounded varchar (1765000000000:10 and 1766000000000:88). Each is
// measured, not assumed — the two distinct shapes are exactly why down() must
// restore per-target previous types.
const PREVIOUS_TYPES: Record<(typeof REBOUND_TABLES)[number], string> = {
  device_sync_credentials: 'character varying(128)',
  device_sync_credential_events: 'character varying(128)',
  audit_integrity_alerts: 'character varying',
  forensic_alerts: 'character varying',
};

describe('RebindDeviceAndAlertTenantColumns1809130000000', () => {
  const migration = new RebindDeviceAndAlertTenantColumns1809130000000();

  const createQueryRunner = (
    // Column type answered for information_schema lookups; `uuid` mirrors the
    // post-up state the down() rollback runs against.
    columnType: 'character varying' | 'uuid' = 'character varying',
  ) => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(
        (sql: string, parameters?: unknown[]): Promise<QueryResult> => {
          queries.push(sql);
          const result = new QueryResult();
          if (sql.includes('information_schema.columns')) {
            const first = parameters?.[0];
            const table = typeof first === 'string' ? first : '';
            result.records = [
              {
                data_type: columnType,
                // The device tables carry a 128-length bound; the alert
                // tables and the rebound uuid state are unbounded.
                character_maximum_length:
                  columnType === 'character varying' &&
                  (table === 'device_sync_credentials' ||
                    table === 'device_sync_credential_events')
                    ? 128
                    : null,
              },
            ];
          }
          return Promise.resolve(result);
        },
      ),
    } as unknown as QueryRunner;

    return { queryRunner, queries };
  };

  it('reports the migration name required by the migrations ledger', () => {
    expect(migration.name).toBe(
      'RebindDeviceAndAlertTenantColumns1809130000000',
    );
  });

  it('carries exactly 6 authored policy rows matching the catalog convention', () => {
    // The catalog holds exactly these 6 rows for the two device tables
    // 1807000000000 created policies on; the spec pins the count so a target
    // silently added or dropped here cannot pass.
    expect(POLICY_ROWS).toHaveLength(6);

    // Per-table command sets: the credentials table carries the full
    // select/insert/update/delete set; the events table is append-only with
    // select+insert. The two alert tables carry ZERO policies — the filter
    // below must come back empty for both. The policy names are authored
    // verbatim: the events table uses the abbreviated
    // `device_sync_cred_events_tenant_*` naming, so the names cannot be
    // derived from `${table}_tenant_${cmd}` uniformly.
    const expectedPolicies: Record<(typeof REBOUND_TABLES)[number], string[]> =
      {
        device_sync_credentials: [
          'device_sync_credentials_tenant_select',
          'device_sync_credentials_tenant_insert',
          'device_sync_credentials_tenant_update',
          'device_sync_credentials_tenant_delete',
        ],
        device_sync_credential_events: [
          'device_sync_cred_events_tenant_select',
          'device_sync_cred_events_tenant_insert',
        ],
        audit_integrity_alerts: [],
        forensic_alerts: [],
      };

    for (const table of REBOUND_TABLES) {
      const rows = POLICY_ROWS.filter((row) => row.table === table);
      expect(rows.map((row) => row.policyName).sort()).toEqual(
        [...expectedPolicies[table]].sort(),
      );
    }
  });

  it('rebinds all four tables with the target uuid predicate in up()', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);

    // Four tables, all rebound to uuid with the column-side cast.
    for (const table of REBOUND_TABLES) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE uuid ` +
          'USING "tenant_id"::uuid',
      );
    }
    expect(
      queries.filter((q) => q.includes('ALTER COLUMN "tenant_id" TYPE uuid')),
    ).toHaveLength(REBOUND_TABLES.length);

    // 6 policies dropped and recreated against the target predicate; the two
    // zero-policy alert tables contribute no DROP and no CREATE.
    expect(sql.match(/DROP POLICY IF EXISTS/g)).toHaveLength(
      POLICY_ROWS.length,
    );
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(POLICY_ROWS.length);
    expect(
      sql.match(
        new RegExp(
          TENANT_RLS_PREDICATE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'g',
        ),
      ),
    ).toHaveLength(
      POLICY_ROWS.reduce(
        (sum, row) => sum + (row.using ? 1 : 0) + (row.check ? 1 : 0),
        0,
      ),
    );

    for (const row of POLICY_ROWS) {
      const statement = queries.find((q) =>
        q.includes(`CREATE POLICY "${row.policyName}"`),
      );
      expect(statement).toBeDefined();
      expect(statement).toContain(`ON "${row.table}"`);
      expect(statement).toContain(`FOR ${row.cmd}`);
      expect(!!statement?.includes('USING (')).toBe(row.using);
      expect(!!statement?.includes('WITH CHECK (')).toBe(row.check);
    }
  });

  it('emits no view statement and does not touch tables outside unit C.3', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const sql = queries.join('\n');

    // The repository has exactly one view and it reads
    // `sys_parametros_config`; no statement in this migration may create or
    // drop a view.
    expect(sql).not.toContain('DROP VIEW');
    expect(sql).not.toContain('CREATE VIEW');

    // Slice C tables owned by other units must not appear here.
    for (const table of [
      'tenant_capability_event',
      'tenant_topology_revisions',
      'tenant_fulfillment_records',
      'catalog_values',
      'invoice_items',
      'promotions',
      'customers',
      'customer_point_transactions',
      'legacy_import_integrity_reports',
      'legacy_onboarding_migration_receipts',
    ]) {
      expect(sql).not.toContain(`"${table}"`);
    }
  });

  it('restores each table’s own previous column type and text predicate in down()', async () => {
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(PREVIOUS_TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(TENANT_RLS_PREDICATE);

    // The previous types are NOT uniform: the two device tables were
    // varchar(128), the two alert tables unbounded varchar. Each down()
    // ALTER must restore its own measured shape.
    for (const [table, previousType] of Object.entries(PREVIOUS_TYPES)) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE ${previousType} ` +
          'USING "tenant_id"::text',
      );
    }
    expect(
      queries.filter((q) =>
        q.includes('ALTER COLUMN "tenant_id" TYPE character varying'),
      ),
    ).toHaveLength(REBOUND_TABLES.length);

    expect(sql.match(/DROP POLICY IF EXISTS/g)).toHaveLength(
      POLICY_ROWS.length,
    );
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(POLICY_ROWS.length);
  });
});
