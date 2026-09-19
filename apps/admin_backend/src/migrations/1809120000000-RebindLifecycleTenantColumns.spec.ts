import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { RebindLifecycleTenantColumns1809120000000 } from './1809120000000-RebindLifecycleTenantColumns';

/**
 * The authored catalog truth for the tenant lifecycle domain, slice C unit 2:
 * three tables, 10 policies, every one of them policy-carrying. This is
 * deliberately an independent copy of the migration's targets so the spec
 * cannot pass by construction. The rows were taken from `pg_policies`'
 * structural columns (never `qual`/`with_check`) on the scratch database
 * `omnifood_schema_build_test`, which holds all 102 policies.
 *
 * The previousType values come from the CREATE TABLE DDL, not from any
 * entity-derived default: `tenant_capability_event.tenant_id` and
 * `tenant_topology_revisions.tenant_id` are unbounded varchar (DDL
 * `tenant_id varchar NOT NULL`, so `character_maximum_length` is NULL and the
 * emitter's canonicalColumnType reports `character varying` with no width),
 * while `tenant_fulfillment_records.tenant_id` is `varchar(64) NOT NULL`.
 *
 * Note the naming break: `tenant_capability_event`'s policy names OMIT the
 * `_tenant_` infix the other tables use. No view depends on any of these
 * three columns, and every policy on these tables is a tenant policy.
 */
const REBOUND_TABLES = [
  'tenant_capability_event',
  'tenant_topology_revisions',
  'tenant_fulfillment_records',
] as const;

const POLICY_ROWS: Array<{
  table: string;
  policyName: string;
  cmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using: boolean;
  check: boolean;
}> = [
  {
    table: 'tenant_capability_event',
    policyName: 'tenant_capability_event_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'tenant_capability_event',
    policyName: 'tenant_capability_event_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'tenant_capability_event',
    policyName: 'tenant_capability_event_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'tenant_capability_event',
    policyName: 'tenant_capability_event_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
  {
    table: 'tenant_topology_revisions',
    policyName: 'tenant_topology_revisions_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'tenant_topology_revisions',
    policyName: 'tenant_topology_revisions_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'tenant_fulfillment_records',
    policyName: 'tenant_fulfillment_records_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'tenant_fulfillment_records',
    policyName: 'tenant_fulfillment_records_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'tenant_fulfillment_records',
    policyName: 'tenant_fulfillment_records_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: false,
  },
  {
    table: 'tenant_fulfillment_records',
    policyName: 'tenant_fulfillment_records_tenant_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
];

// Read from information_schema.columns (via the DDL that created each column):
// the previous types are NOT uniform — two unbounded varchars and one
// varchar(64) — and down() must restore each distinct value.
const PREVIOUS_TYPES: Record<string, string> = {
  tenant_capability_event: 'character varying',
  tenant_topology_revisions: 'character varying',
  tenant_fulfillment_records: 'character varying(64)',
};

describe('RebindLifecycleTenantColumns1809120000000', () => {
  const migration = new RebindLifecycleTenantColumns1809120000000();

  const createQueryRunner = (
    // Column state answered for information_schema lookups. `uuid` mirrors
    // the post-up state the down() rollback runs against; the default
    // mirrors the pre-up state (each table's own measured previous type).
    state: 'previous' | 'uuid' = 'previous',
  ) => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        const result = new QueryResult();
        if (sql.includes('information_schema.columns')) {
          // The table name is bound as $1; extract it to answer per table,
          // because the three previous types are not uniform.
          const match = sql.match(/'([^']+)'$/) ?? [];
          const table = state === 'uuid' ? match[1] : (match[1] ?? '');
          const previous = PREVIOUS_TYPES[table];
          const bounded = previous === 'character varying(64)';
          result.records = [
            state === 'uuid'
              ? { data_type: 'uuid', character_maximum_length: null }
              : {
                  data_type: 'character varying',
                  character_maximum_length: bounded ? 64 : null,
                },
          ];
        }
        return Promise.resolve(result);
      }),
    } as unknown as QueryRunner;

    return { queryRunner, queries };
  };

  it('reports the migration name required by the migrations ledger', () => {
    expect(migration.name).toBe('RebindLifecycleTenantColumns1809120000000');
  });

  it('carries exactly 10 authored policy rows matching the catalog census', () => {
    // The catalog holds exactly these 10 rows for the three tables; the spec
    // pins the count so a target silently added or dropped here cannot pass.
    expect(POLICY_ROWS).toHaveLength(10);

    // Per-table command sets, with explicit expected names: the capability
    // event table's policy names OMIT the `_tenant_` infix, so the names
    // cannot be derived from a shared convention.
    const expectedPolicies: Record<(typeof REBOUND_TABLES)[number], string[]> =
      {
        tenant_capability_event: [
          'tenant_capability_event_select',
          'tenant_capability_event_insert',
          'tenant_capability_event_update',
          'tenant_capability_event_delete',
        ],
        tenant_topology_revisions: [
          'tenant_topology_revisions_tenant_select',
          'tenant_topology_revisions_tenant_insert',
        ],
        tenant_fulfillment_records: [
          'tenant_fulfillment_records_tenant_select',
          'tenant_fulfillment_records_tenant_insert',
          'tenant_fulfillment_records_tenant_update',
          'tenant_fulfillment_records_tenant_delete',
        ],
      };

    for (const table of REBOUND_TABLES) {
      const rows = POLICY_ROWS.filter((row) => row.table === table);
      expect(rows.map((row) => row.policyName).sort()).toEqual(
        expectedPolicies[table].sort(),
      );
      expect(rows.map((row) => row.cmd).sort()).toEqual(
        expectedPolicies[table]
          .map((name) => name.slice(name.lastIndexOf('_') + 1).toUpperCase())
          .sort(),
      );
    }
  });

  it('rebinds all three tables with the target uuid predicate in up()', async () => {
    const { queryRunner, queries } = createQueryRunner('previous');

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);

    // Three tables, each rebound to uuid with the column-side cast.
    for (const table of REBOUND_TABLES) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE uuid ` +
          'USING "tenant_id"::uuid',
      );
    }
    expect(
      queries.filter((q) => q.includes('ALTER COLUMN "tenant_id" TYPE uuid')),
    ).toHaveLength(REBOUND_TABLES.length);

    // 10 policies dropped and recreated against the target predicate.
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

    // The asymmetric update halves are pinned individually:
    // tenant_capability_event's UPDATE carries BOTH halves (using+check),
    // tenant_fulfillment_records' UPDATE carries USING only.
    const capabilityUpdate = queries.find((q) =>
      q.includes('CREATE POLICY "tenant_capability_event_update"'),
    );
    expect(capabilityUpdate).toContain('FOR UPDATE');
    expect(capabilityUpdate).toContain('USING (');
    expect(capabilityUpdate).toContain('WITH CHECK (');
    const fulfillmentUpdate = queries.find((q) =>
      q.includes('CREATE POLICY "tenant_fulfillment_records_tenant_update"'),
    );
    expect(fulfillmentUpdate).toContain('FOR UPDATE');
    expect(fulfillmentUpdate).toContain('USING (');
    expect(fulfillmentUpdate).not.toContain('WITH CHECK (');
  });

  it('emits no view statement and does not touch tables outside the unit', async () => {
    const { queryRunner, queries } = createQueryRunner('previous');

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const sql = queries.join('\n');

    // No view depends on any of these three columns; no statement in this
    // migration may create or drop a view.
    expect(sql).not.toContain('DROP VIEW');
    expect(sql).not.toContain('CREATE VIEW');

    // The other slice C tables belong to units C.3-C.5.
    for (const table of [
      'device_sync_credentials',
      'device_sync_credential_events',
      'catalog_values',
      'invoice_items',
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

  it('restores each distinct previous column type and the text predicate in down()', async () => {
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(PREVIOUS_TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(TENANT_RLS_PREDICATE);

    // The previous types are NOT uniform: two unbounded varchars and one
    // varchar(64). Count each shape so a table restored with the wrong width
    // cannot pass.
    const unboundedRestores = queries.filter((q) =>
      q.includes(
        'ALTER TABLE "tenant_capability_event" ALTER COLUMN "tenant_id" ' +
          'TYPE character varying USING "tenant_id"::text',
      ),
    );
    expect(unboundedRestores).toHaveLength(1);
    expect(
      queries.filter((q) =>
        q.includes(
          'ALTER TABLE "tenant_topology_revisions" ALTER COLUMN ' +
            '"tenant_id" TYPE character varying USING "tenant_id"::text',
        ),
      ),
    ).toHaveLength(1);
    expect(
      queries.filter((q) =>
        q.includes(
          'ALTER TABLE "tenant_fulfillment_records" ALTER COLUMN ' +
            '"tenant_id" TYPE character varying(64) USING "tenant_id"::text',
        ),
      ),
    ).toHaveLength(1);
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
