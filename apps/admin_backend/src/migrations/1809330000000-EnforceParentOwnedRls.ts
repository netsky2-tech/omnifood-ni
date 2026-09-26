import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Forces tenant row level security on the five `parent-owned` child tables
 * (issue #512 T3 slice 9):
 *
 *   invoice_item_modifiers  -> invoice_items -> invoices   (two-hop)
 *   invoice_payments        -> invoices                    (one-hop)
 *   production_order_lines  -> production_orders           (one-hop)
 *   security_profiles       -> users                       (one-hop)
 *   shrinkage_details       -> shrinkages                  (one-hop)
 *
 * - These tables have NO tenant_id column, which is exactly why the RLS
 *   coverage manifest classifies them `parent-owned` (the gate's only check
 *   for the class is the absence of a tenant_id column,
 *   src/core/database/tenant-rls-coverage.ts). The manifest entries STAY
 *   `parent-owned`: policies are additive and gate-silent. Isolation flows
 *   through the tenant-bearing parent FK instead, so every policy predicate
 *   is a parent-walking EXISTS that compares the PARENT's tenant_id against
 *   the transaction-local `app.tenant_id` setting.
 * - The uuid-cast setting form (`current_setting('app.tenant_id',
 *   true)::uuid`) is hardcoded deliberately, unlike the type-aware resolver
 *   the direct-table slices use: there is no tenant_id column on the child
 *   to resolve, and every parent column read here (invoices,
 *   production_orders, users, shrinkages) was born `uuid NOT NULL` in the
 *   bootstrap migrations (1759000000001/1759000000002) and has never been
 *   rebound, so no partial-ledger re-run can meet a different type. A
 *   missing setting resolves to NULL and NULL never satisfies the
 *   comparison, so an unbound context denies every row.
 * - The two-hop case is deliberate: `invoice_item_modifiers` hangs off
 *   `invoice_items`, which is itself tenant-bearing, but the modifier's
 *   canonical tenant root is the invoice — walking through invoice_items to
 *   invoices keeps the modifier bound to the document the tenant owns even
 *   if the item-level column were ever inconsistent with its invoice.
 * - `security_profiles` reads `users.tenant_id` directly. `users` remains
 *   classified `debt` in the coverage manifest (founder decision, issue
 *   #512 T3 slice 8) and carries no RLS of its own; the predicate here does
 *   not depend on users having policies, only on the column's value, so the
 *   debt stays contained while the profiles table stops being readable
 *   across tenants.
 * - One policy per command (select/insert/update/delete) named
 *   `{table}_tenant_{command}`, following the existing project convention.
 *   SELECT/UPDATE/DELETE carry USING; INSERT carries WITH CHECK; UPDATE
 *   carries both — mirroring the parent tables' policy sets.
 * - ENABLE + FORCE RLS so neither the application role nor the table owner
 *   can bypass tenant isolation.
 * - up() is idempotent: deterministic policy names with DROP POLICY IF
 *   EXISTS before CREATE, each CREATE guarded on the pg_policies catalog.
 *   ENABLE/FORCE are already idempotent. This matters for the repository's
 *   scenario-2 partial-ledger contract, where the schema build harness
 *   re-runs the migration set against a partially populated ledger.
 * - down() reverses only this migration's effect: it drops exactly the
 *   twenty policies created here (in exact reverse order) and removes FORCE
 *   while leaving ENABLE in place. It never drops tables, truncates, or
 *   deletes rows.
 */
interface ParentOwnedTable {
  table: string;
  /** The parent-walking tenant predicate every policy of this table embeds. */
  predicate: string;
}

const UUID_TENANT_SETTING = "current_setting('app.tenant_id', true)::uuid";

const PARENT_OWNED_TABLES: readonly ParentOwnedTable[] = [
  {
    table: 'invoice_item_modifiers',
    predicate: `EXISTS (
        SELECT 1
          FROM invoice_items ii
          JOIN invoices i ON i.id = ii.invoice_id
         WHERE ii.id = invoice_item_modifiers.invoice_item_id
           AND i.tenant_id = ${UUID_TENANT_SETTING}
      )`,
  },
  {
    table: 'invoice_payments',
    predicate: `EXISTS (
        SELECT 1 FROM invoices
         WHERE invoices.id = invoice_payments.invoice_id
           AND invoices.tenant_id = ${UUID_TENANT_SETTING}
      )`,
  },
  {
    table: 'production_order_lines',
    predicate: `EXISTS (
        SELECT 1 FROM production_orders
         WHERE production_orders.id = production_order_lines.production_order_id
           AND production_orders.tenant_id = ${UUID_TENANT_SETTING}
      )`,
  },
  {
    table: 'security_profiles',
    predicate: `EXISTS (
        SELECT 1 FROM users
         WHERE users.id = security_profiles.user_id
           AND users.tenant_id = ${UUID_TENANT_SETTING}
      )`,
  },
  {
    table: 'shrinkage_details',
    predicate: `EXISTS (
        SELECT 1 FROM shrinkages
         WHERE shrinkages.id = shrinkage_details.shrinkage_id
           AND shrinkages.tenant_id = ${UUID_TENANT_SETTING}
      )`,
  },
];

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class EnforceParentOwnedRls1809330000000 implements MigrationInterface {
  name = 'EnforceParentOwnedRls1809330000000';

  /**
   * The per-table predicate vocabulary, exposed for the unit spec and for
   * review: one canonical string per table, embedded verbatim in every
   * policy half. Keyed by table name so a spec can never assert against a
   * predicate that silently moved to another table.
   */
  static readonly PREDICATES: Record<string, string> = Object.fromEntries(
    PARENT_OWNED_TABLES.map(({ table, predicate }) => [table, predicate]),
  );

  private policyName(table: string, command: string): string {
    return `${table}_tenant_${command}`;
  }

  async up(runner: QueryRunner): Promise<void> {
    for (const { table, predicate } of PARENT_OWNED_TABLES) {
      const tableId = quoteIdentifier(table);

      await runner.query(`ALTER TABLE ${tableId} ENABLE ROW LEVEL SECURITY`);
      await runner.query(`ALTER TABLE ${tableId} FORCE ROW LEVEL SECURITY`);

      const policies = [
        {
          command: 'select',
          expression: `FOR SELECT
      USING (${predicate})`,
        },
        {
          command: 'insert',
          expression: `FOR INSERT
      WITH CHECK (${predicate})`,
        },
        {
          command: 'update',
          expression: `FOR UPDATE
      USING (${predicate})
      WITH CHECK (${predicate})`,
        },
        {
          command: 'delete',
          expression: `FOR DELETE
      USING (${predicate})`,
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
    // Exact reverse of up(): last table first, and within each table the
    // policies in reverse command order, then NO FORCE keeping ENABLE.
    for (const { table } of [...PARENT_OWNED_TABLES].reverse()) {
      const tableId = quoteIdentifier(table);

      for (const command of ['delete', 'update', 'insert', 'select']) {
        await runner.query(
          `DROP POLICY IF EXISTS ${quoteIdentifier(this.policyName(table, command))} ON ${tableId}`,
        );
      }

      // Keep RLS enabled; only remove the FORCE applied by this migration.
      await runner.query(`ALTER TABLE ${tableId} NO FORCE ROW LEVEL SECURITY`);
    }
  }
}
