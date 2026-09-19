import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { RebindInvoiceItemsTenantColumn1809150000000 } from './1809150000000-RebindInvoiceItemsTenantColumn';

/**
 * The authored catalog truth for `invoice_items`, the final code unit of
 * Phase 2 slice C: one table, 4 policies, all of them policy-carrying. This
 * is deliberately an independent copy of the migration's target so the spec
 * cannot pass by construction. The rows were taken from `pg_policies`'
 * structural columns (never `qual`/`with_check`) on the scratch database
 * `omnifood_schema_build_test`.
 *
 * The policy names carry the `credit_note_` prefix: all four were created by
 * `1782000000000-AddCreditNoteProvenance`, which is type-aware (slice A) and
 * already in `partial_ledger_names`, so this unit owns the rebind and the
 * provenance migration needs no edit. `1809060000000` owns `invoices` only
 * and its spec asserts it never mentions `invoice_items`, so this unit owns
 * all four rows and must not double-handle any.
 *
 * No view depends on `invoice_items.tenant_id` — the repository's only view
 * reads `sys_parametros_config` — so the target declares no views.
 */
const REBOUND_TABLES = ['invoice_items'] as const;

const POLICY_ROWS: Array<{
  table: string;
  policyName: string;
  cmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using: boolean;
  check: boolean;
}> = [
  {
    table: 'invoice_items',
    policyName: 'credit_note_invoice_items_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'invoice_items',
    policyName: 'credit_note_invoice_items_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'invoice_items',
    policyName: 'credit_note_invoice_items_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'invoice_items',
    policyName: 'credit_note_invoice_items_tenant_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
];

// Read from information_schema.columns on the scratch database: the column
// was added by 1770000000000 as a bare `tenant_id varchar`, so its
// character_maximum_length is NULL and the type carries no width.
const PREVIOUS_TYPES: Record<string, string> = {
  invoice_items: 'character varying',
};

describe('RebindInvoiceItemsTenantColumn1809150000000', () => {
  const migration = new RebindInvoiceItemsTenantColumn1809150000000();

  const createQueryRunner = (
    // Column type answered for information_schema lookups; `uuid` mirrors the
    // post-up state the down() rollback runs against.
    columnType: 'character varying' | 'uuid' = 'character varying',
  ) => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        const result = new QueryResult();
        if (sql.includes('information_schema.columns')) {
          result.records = [
            {
              data_type: columnType,
              character_maximum_length: null,
            },
          ];
        }
        return Promise.resolve(result);
      }),
    } as unknown as QueryRunner;

    return { queryRunner, queries };
  };

  it('reports the migration name required by the migrations ledger', () => {
    expect(migration.name).toBe('RebindInvoiceItemsTenantColumn1809150000000');
  });

  it('carries exactly 4 authored policy rows matching the catalog convention', () => {
    // The catalog on the scratch database holds exactly these 4 rows for the
    // one table 1782000000000 created policies on; the spec pins the count so
    // a target silently added or dropped here cannot pass.
    expect(POLICY_ROWS).toHaveLength(4);

    // Every row names invoice_items, carries the credit_note_ prefix, and
    // declares its command and using/check halves explicitly.
    const expectedRows: Record<
      (typeof REBOUND_TABLES)[number],
      Array<{
        table: string;
        policyName: string;
        cmd: string;
        using: boolean;
        check: boolean;
      }>
    > = {
      invoice_items: [
        {
          table: 'invoice_items',
          policyName: 'credit_note_invoice_items_tenant_select',
          cmd: 'SELECT',
          using: true,
          check: false,
        },
        {
          table: 'invoice_items',
          policyName: 'credit_note_invoice_items_tenant_insert',
          cmd: 'INSERT',
          using: false,
          check: true,
        },
        {
          table: 'invoice_items',
          policyName: 'credit_note_invoice_items_tenant_update',
          cmd: 'UPDATE',
          using: true,
          check: true,
        },
        {
          table: 'invoice_items',
          policyName: 'credit_note_invoice_items_tenant_delete',
          cmd: 'DELETE',
          using: true,
          check: false,
        },
      ],
    };

    for (const table of REBOUND_TABLES) {
      const rows = POLICY_ROWS.filter((row) => row.table === table);
      expect(rows).toEqual(expectedRows[table]);
      // All four are tenant policies on the tenant_id column; none is a
      // non-tenant policy, so recreating all of them cannot rewrite one.
      for (const row of rows) {
        expect(row.policyName).toMatch(/^credit_note_invoice_items_tenant_/);
      }
    }
  });

  it('rebinds invoice_items with the target uuid predicate in up()', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);

    // One table, rebound to uuid with the column-side cast.
    expect(sql).toContain(
      'ALTER TABLE "invoice_items" ALTER COLUMN "tenant_id" TYPE uuid ' +
        'USING "tenant_id"::uuid',
    );
    expect(
      queries.filter((q) => q.includes('ALTER COLUMN "tenant_id" TYPE uuid')),
    ).toHaveLength(1);

    // 4 policies dropped and recreated against the target predicate: 5
    // predicate occurrences (select 1, insert 1, update 2, delete 1).
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

  it('emits no view statement and does not touch sibling slice C tables', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const sql = queries.join('\n');

    // No view depends on invoice_items.tenant_id: the repository's only view
    // reads sys_parametros_config. No statement in this migration may create
    // or drop a view.
    expect(sql).not.toContain('DROP VIEW');
    expect(sql).not.toContain('CREATE VIEW');

    // The other slice C tables belong to units C.2/C.3/C.4.
    for (const table of [
      'tenant_capability_event',
      'tenant_topology_revisions',
      'tenant_fulfillment_records',
      'device_sync_credentials',
      'device_sync_credential_events',
      'catalog_values',
      'audit_integrity_alerts',
      'forensic_alerts',
      'promotions',
      'customers',
      'customer_point_transactions',
      'legacy_import_integrity_reports',
      'legacy_onboarding_migration_receipts',
    ]) {
      expect(sql).not.toContain(`"${table}"`);
    }
  });

  it('restores the previous column type and text predicate in down()', async () => {
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(PREVIOUS_TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(TENANT_RLS_PREDICATE);

    // Bare varchar: no width in the restored type, no length on the stub.
    for (const [table, previousType] of Object.entries(PREVIOUS_TYPES)) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE ${previousType} ` +
          'USING "tenant_id"::text',
      );
    }

    expect(sql.match(/DROP POLICY IF EXISTS/g)).toHaveLength(
      POLICY_ROWS.length,
    );
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(POLICY_ROWS.length);
  });
});
