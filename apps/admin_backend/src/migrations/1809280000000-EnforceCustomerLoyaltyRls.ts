import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Forces tenant row level security on the customer/loyalty tables
 * `customer_loyalty_account_projection`, `customer_point_transactions`,
 * `customers`, `loyalty_programs` and `loyalty_rewards` (issue #512 T3
 * slice 4 part B).
 *
 * - Why each table needs the policy: every one of the five carries a
 *   tenant_id column holding tenant-owned business data (customer
 *   identities, loyalty program and reward catalogs, per-customer point
 *   ledgers and the recomputed account-balance projection), so an unbound
 *   or cross-tenant read through any of them would leak across tenants.
 *   None of the five had a policy before this slice:
 *   `loyalty_programs`, `loyalty_rewards` and
 *   `customer_loyalty_account_projection` carried none from their creation,
 *   and the rebind migration 1809140000000 recorded `policies: []` for
 *   `customers` and `customer_point_transactions`. None of the five is
 *   referenced by a `parent-owned` manifest entry, so nothing here is a
 *   child-policy prerequisite.
 * - Column-type facts: `loyalty_programs`, `loyalty_rewards` and
 *   `customer_loyalty_account_projection` were created `uuid` by
 *   1759000000004-CreateBootstrapLoyaltyTables. `customers` (created by
 *   1789000000000-CreateCustomersTable) and
 *   `customer_point_transactions` (created by
 *   1791000000000-CreateCustomerPointTransactionsTable) were created
 *   `character varying` and were rebound to `uuid` by
 *   1809140000000-RebindCatalogLoyaltyLegacyTenantColumns. So in a
 *   migrations-built schema all five columns are `uuid` today: 5 tables x 5
 *   USING/WITH CHECK halves = 25 uuid halves and 0 text halves in the
 *   default up() run — but the predicate is still resolved per table at
 *   run time, never assumed.
 * - ENABLE + FORCE RLS so neither the application role nor the table owner
 *   can bypass tenant isolation. FORCE is safe here: the application-level
 *   tenant bindings that make the tables reachable without leaking already
 *   landed in commit c42bec4d (slice 4 part A).
 * - One policy per command (select/insert/update/delete) named
 *   `{table}_tenant_{command}`, following the existing project convention.
 * - The predicate is resolved per table (never one shared across tables)
 *   through the shared type-aware resolver `resolveTenantRlsPredicate`,
 *   which reads each tenant_id column's real type from information_schema:
 *   a uuid column gets the uuid-cast setting form (index-friendly), and a
 *   varchar/text column keeps the text comparison. All five columns are
 *   uuid in a migrations-built schema, but a partial-ledger re-run must
 *   still emit the form that matches the column AS IT IS. A missing setting
 *   resolves to NULL and an empty setting never equals a real tenant_id, so
 *   both deny access. A missing column or an unsupported type fails closed
 *   naming the table.
 * - up() is idempotent: deterministic policy names with DROP POLICY IF EXISTS
 *   before CREATE, and each CREATE guarded on the pg_policies catalog
 *   (PostgreSQL has no `CREATE POLICY IF NOT EXISTS`); ENABLE/FORCE are
 *   already idempotent. This matters for the repository's scenario-2
 *   partial-ledger contract, where the schema build harness re-runs the
 *   migration set against a partially populated ledger, so a partial
 *   re-run can neither duplicate nor fail on policies this migration
 *   already created.
 * - down() reverses only this migration's effect: it drops exactly the
 *   twenty policies created here and removes FORCE while leaving ENABLE in
 *   place. It never drops tables, never truncates, never deletes rows, and
 *   never issues DISABLE ROW LEVEL SECURITY — keeping ENABLE preserves the
 *   deny-by-default posture of the tables even without this migration's
 *   policies.
 */
const TABLES = [
  'customer_loyalty_account_projection',
  'customer_point_transactions',
  'customers',
  'loyalty_programs',
  'loyalty_rewards',
] as const;

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class EnforceCustomerLoyaltyRls1809280000000 implements MigrationInterface {
  name = 'EnforceCustomerLoyaltyRls1809280000000';

  private policyName(table: string, command: string): string {
    return `${table}_tenant_${command}`;
  }

  async up(runner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      const tableId = quoteIdentifier(table);

      await runner.query(`ALTER TABLE ${tableId} ENABLE ROW LEVEL SECURITY`);
      await runner.query(`ALTER TABLE ${tableId} FORCE ROW LEVEL SECURITY`);

      // One resolution per table, never one shared across tables: each
      // table's tenant_id column can sit at a different point of the
      // varchar -> uuid rebind, so the predicate must match the column type
      // as it is right now, not as it was when this migration was written.
      const tenantPredicate = await resolveTenantRlsPredicate(runner, table);

      const policies = [
        {
          command: 'select',
          expression: `FOR SELECT
      USING (${tenantPredicate})`,
        },
        {
          command: 'insert',
          expression: `FOR INSERT
      WITH CHECK (${tenantPredicate})`,
        },
        {
          command: 'update',
          expression: `FOR UPDATE
      USING (${tenantPredicate})
      WITH CHECK (${tenantPredicate})`,
        },
        {
          command: 'delete',
          expression: `FOR DELETE
      USING (${tenantPredicate})`,
        },
      ];

      for (const policy of policies) {
        await runner.query(
          `DROP POLICY IF EXISTS ${quoteIdentifier(this.policyName(table, policy.command))} ON ${tableId}`,
        );
        // PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, so guard on the catalog.
        await runner.query(
          `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = '${table}'
          AND policyname = '${this.policyName(table, policy.command)}'
      ) THEN
        CREATE POLICY ${quoteIdentifier(this.policyName(table, policy.command))} ON ${tableId}
      ${policy.expression};
      END IF;
      END $$;`,
        );
      }
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      const tableId = quoteIdentifier(table);

      for (const command of ['select', 'insert', 'update', 'delete']) {
        await runner.query(
          `DROP POLICY IF EXISTS ${quoteIdentifier(this.policyName(table, command))} ON ${tableId}`,
        );
      }

      // Keep RLS enabled; only remove the FORCE applied by this migration.
      await runner.query(`ALTER TABLE ${tableId} NO FORCE ROW LEVEL SECURITY`);
    }
  }
}
