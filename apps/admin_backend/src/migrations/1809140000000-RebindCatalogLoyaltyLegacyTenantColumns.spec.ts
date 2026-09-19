import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { RebindCatalogLoyaltyLegacyTenantColumns1809140000000 } from './1809140000000-RebindCatalogLoyaltyLegacyTenantColumns';

/**
 * The authored catalog truth for slice C unit C.4: six tables, of which only
 * `catalog_values` carries tenant policies (exactly four, created by
 * 1768000000000-CreateCatalogValues.ts); the other five are column-only
 * targets with zero policies and never enabled RLS. This is deliberately an
 * independent copy of the migration's targets so the spec cannot pass by
 * construction. The rows were taken from `pg_policies`' structural columns
 * (never `qual`/`with_check`), and no non-tenant policy references any of
 * these six tables, so recreating the four cannot rewrite a foreign policy.
 *
 * The previous column types are measured, not uniform: four tables hold an
 * unbounded varchar, two hold varchar(128) (`length: '128'` at creation).
 * No view depends on any of these six `tenant_id` columns — the repository's
 * only view reads `sys_parametros_config` — so no target declares views.
 */
const REBOUND_TABLES = [
  'catalog_values',
  'customer_point_transactions',
  'customers',
  'legacy_import_integrity_reports',
  'legacy_onboarding_migration_receipts',
  'promotions',
] as const;

const POLICY_ROWS: Array<{
  table: string;
  policyName: string;
  cmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using: boolean;
  check: boolean;
}> = [
  {
    table: 'catalog_values',
    policyName: 'catalog_values_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'catalog_values',
    policyName: 'catalog_values_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'catalog_values',
    policyName: 'catalog_values_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'catalog_values',
    policyName: 'catalog_values_tenant_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
];

// Read from information_schema.columns on the scratch database: four columns
// are unbounded varchar and two are varchar(128), measured per table.
const PREVIOUS_TYPES: Record<string, string> = {
  catalog_values: 'character varying',
  customer_point_transactions: 'character varying',
  customers: 'character varying',
  legacy_import_integrity_reports: 'character varying(128)',
  legacy_onboarding_migration_receipts: 'character varying(128)',
  promotions: 'character varying',
};

// Per-table expected policy command sets: only catalog_values carries
// policies; the other five are column-only targets.
const EXPECTED_COMMANDS: Record<(typeof REBOUND_TABLES)[number], string[]> = {
  catalog_values: ['delete', 'insert', 'select', 'update'],
  customer_point_transactions: [],
  customers: [],
  legacy_import_integrity_reports: [],
  legacy_onboarding_migration_receipts: [],
  promotions: [],
};

describe('RebindCatalogLoyaltyLegacyTenantColumns1809140000000', () => {
  const migration = new RebindCatalogLoyaltyLegacyTenantColumns1809140000000();

  const createQueryRunner = (
    // Column type answered for information_schema lookups; `uuid` mirrors the
    // post-up state the down() rollback runs against.
    columnType: 'character varying' | 'uuid' = 'character varying',
  ) => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(
        (sql: string, params?: unknown[]): Promise<QueryResult> => {
          queries.push(sql);
          const result = new QueryResult();
          if (sql.includes('information_schema.columns')) {
            const table = (params?.[0] as string) ?? '';
            result.records = [
              {
                data_type: columnType,
                character_maximum_length:
                  columnType === 'character varying' &&
                  PREVIOUS_TYPES[table]?.endsWith('(128)')
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
      'RebindCatalogLoyaltyLegacyTenantColumns1809140000000',
    );
  });

  it('carries exactly 4 authored policy rows; five tables are column-only', () => {
    // Only catalog_values carries tenant policies on the scratch database;
    // the spec pins the count so a policy silently added here cannot pass.
    expect(POLICY_ROWS).toHaveLength(4);
    expect(POLICY_ROWS.every((row) => row.table === 'catalog_values')).toBe(
      true,
    );

    for (const table of REBOUND_TABLES) {
      const rows = POLICY_ROWS.filter((row) => row.table === table);
      expect(rows.map((row) => row.cmd.toLowerCase()).sort()).toEqual(
        EXPECTED_COMMANDS[table],
      );
      expect(rows.map((row) => row.policyName).sort()).toEqual(
        EXPECTED_COMMANDS[table].map((command) => `${table}_tenant_${command}`),
      );
    }
  });

  it('rebinds all six tables with the target uuid predicate in up()', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);

    // Six tables, all rebound to uuid with the column-side cast.
    for (const table of REBOUND_TABLES) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE uuid ` +
          'USING "tenant_id"::uuid',
      );
    }
    expect(
      queries.filter((q) => q.includes('ALTER COLUMN "tenant_id" TYPE uuid')),
    ).toHaveLength(REBOUND_TABLES.length);

    // Only catalog_values' four policies are dropped and recreated against
    // the target predicate; the five column-only tables emit none.
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
      // The asymmetric halves, asserted per row: SELECT/DELETE carry USING
      // only, INSERT carries WITH CHECK only, UPDATE carries both.
      expect(!!statement?.includes('USING (')).toBe(row.using);
      expect(!!statement?.includes('WITH CHECK (')).toBe(row.check);
    }
  });

  it('emits no view statement and does not touch the other slice C units’ tables', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const sql = queries.join('\n');

    // No view depends on any of these six tenant_id columns: the repository's
    // only view reads sys_parametros_config.
    expect(sql).not.toContain('DROP VIEW');
    expect(sql).not.toContain('CREATE VIEW');

    // The remaining slice C tables belong to units C.2/C.3/C.5.
    for (const table of [
      'tenant_capability_event',
      'tenant_topology_revisions',
      'tenant_fulfillment_records',
      'device_sync_credentials',
      'device_sync_credential_events',
      'audit_integrity_alerts',
      'forensic_alerts',
      'invoice_items',
    ]) {
      expect(sql).not.toContain(`"${table}"`);
    }
  });

  it('restores each distinct previous column type and the text predicate in down()', async () => {
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(PREVIOUS_TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(TENANT_RLS_PREDICATE);

    // Four tables restore the unbounded varchar; the two varchar(128)
    // tables restore their measured length.
    for (const [table, previousType] of Object.entries(PREVIOUS_TYPES)) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE ${previousType} ` +
          'USING "tenant_id"::text',
      );
    }
    expect(sql.match(/TYPE character varying\(/g)).toHaveLength(2);

    expect(sql.match(/DROP POLICY IF EXISTS/g)).toHaveLength(
      POLICY_ROWS.length,
    );
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(POLICY_ROWS.length);
  });
});
