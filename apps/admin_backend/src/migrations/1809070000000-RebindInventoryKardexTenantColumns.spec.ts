import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { RebindInventoryKardexTenantColumns1809070000000 } from './1809070000000-RebindInventoryKardexTenantColumns';

/**
 * The authored catalog truth for the Inventory & Kardex domain: ten tables,
 * 27 policies, two tables without any. This is deliberately an independent
 * copy of the migration's targets so the spec cannot pass by construction.
 */
const TABLES_WITHOUT_POLICIES = [
  'product_import_sessions',
  'staging_importacion_productos',
] as const;

const POLICY_ROWS: Array<{
  table: string;
  policyName: string;
  cmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using: boolean;
  check: boolean;
}> = [
  {
    table: 'inventory_kardex',
    policyName: 'credit_note_inventory_kardex_tenant_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
  {
    table: 'inventory_kardex',
    policyName: 'credit_note_inventory_kardex_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'inventory_kardex',
    policyName: 'credit_note_inventory_kardex_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'inventory_kardex',
    policyName: 'credit_note_inventory_kardex_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'inventory_kardex',
    policyName: 'sync_ledger_inventory_kardex_append_only_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
  {
    table: 'inventory_kardex',
    policyName: 'sync_ledger_inventory_kardex_append_only_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'inventory_kardex',
    policyName: 'sync_ledger_inventory_kardex_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'inventory_kardex',
    policyName: 'sync_ledger_inventory_kardex_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'inventory_purchase_documents',
    policyName: 'inventory_purchase_documents_tenant_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
  {
    table: 'inventory_purchase_documents',
    policyName: 'inventory_purchase_documents_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'inventory_purchase_documents',
    policyName: 'inventory_purchase_documents_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'inventory_purchase_documents',
    policyName: 'inventory_purchase_documents_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'inventory_remediation_receipts',
    policyName: 'remediation_receipts_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'inventory_remediation_receipts',
    policyName: 'remediation_receipts_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'inventory_sync_outbox',
    policyName: 'sync_ledger_inventory_sync_outbox_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'inventory_sync_outbox',
    policyName: 'sync_ledger_inventory_sync_outbox_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'inventory_sync_outbox',
    policyName: 'sync_ledger_inventory_sync_outbox_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'inventory_sync_receipts',
    policyName: 'sync_ledger_inventory_sync_receipts_append_only_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
  {
    table: 'inventory_sync_receipts',
    policyName: 'sync_ledger_inventory_sync_receipts_append_only_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'inventory_sync_receipts',
    policyName: 'sync_ledger_inventory_sync_receipts_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'inventory_sync_receipts',
    policyName: 'sync_ledger_inventory_sync_receipts_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'kardex_correction',
    policyName: 'kardex_correction_tenant_isolation',
    cmd: 'ALL',
    using: true,
    check: true,
  },
  {
    table: 'kardex_recalculate_queue',
    policyName: 'kardex_queue_tenant_isolation',
    cmd: 'ALL',
    using: true,
    check: true,
  },
  {
    table: 'production_batch_history',
    policyName: 'production_batch_history_tenant_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
  {
    table: 'production_batch_history',
    policyName: 'production_batch_history_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'production_batch_history',
    policyName: 'production_batch_history_tenant_isolation',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'production_batch_history',
    policyName: 'production_batch_history_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
];

const REBOUND_TABLES = [
  ...new Set(POLICY_ROWS.map((row) => row.table)),
  ...TABLES_WITHOUT_POLICIES,
];

const PREVIOUS_TYPES: Record<string, string> = {
  inventory_kardex: 'character varying',
  inventory_purchase_documents: 'character varying',
  inventory_remediation_receipts: 'character varying(128)',
  inventory_sync_outbox: 'character varying',
  inventory_sync_receipts: 'character varying',
  kardex_correction: 'character varying',
  kardex_recalculate_queue: 'character varying',
  production_batch_history: 'character varying',
  product_import_sessions: 'character varying(128)',
  staging_importacion_productos: 'character varying(128)',
};

describe('RebindInventoryKardexTenantColumns1809070000000', () => {
  const migration = new RebindInventoryKardexTenantColumns1809070000000();

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
    expect(migration.name).toBe(
      'RebindInventoryKardexTenantColumns1809070000000',
    );
  });

  it('rebinds all ten tables with the target uuid predicate in up()', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);

    // Ten tables, all rebound to uuid with the column-side cast.
    for (const table of REBOUND_TABLES) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE uuid ` +
          'USING "tenant_id"::uuid',
      );
    }
    expect(
      queries.filter((q) => q.includes('ALTER COLUMN "tenant_id" TYPE uuid')),
    ).toHaveLength(REBOUND_TABLES.length);

    // 27 policies dropped and recreated against the target predicate.
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

  it('recreates the two policy-less tables with the column change only', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    for (const table of TABLES_WITHOUT_POLICIES) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE uuid ` +
          'USING "tenant_id"::uuid',
      );
    }
    // The only statements touching the policy-less tables are their ALTERs.
    // No policy statement may touch the policy-less tables.
    const policyStatementsOnPolicyless = queries.filter(
      (q) =>
        (q.includes('DROP POLICY') || q.includes('CREATE POLICY')) &&
        TABLES_WITHOUT_POLICIES.some((table) => q.includes(`ON "${table}"`)),
    );
    expect(policyStatementsOnPolicyless).toHaveLength(0);
  });

  it('restores the previous column types and text predicate in down()', async () => {
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(PREVIOUS_TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(TENANT_RLS_PREDICATE);

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
