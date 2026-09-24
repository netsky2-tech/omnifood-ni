import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Forces tenant row level security on the inventory tables `warehouses`,
 * `suppliers`, `shrinkages` and `production_orders` (issue #512 T3 slice 3).
 *
 * - All four `tenant_id` columns are uuid NOT NULL with an FK to
 *   tenants(id), created by 1759000000002-CreateBootstrapInventorySalesTables
 *   (warehouses:128, suppliers:144, shrinkages:324,
 *   production_orders:352).
 * - ENABLE + FORCE RLS so neither the application role nor the table owner
 *   can bypass tenant isolation.
 * - One policy per command (select/insert/update/delete) named
 *   `{table}_tenant_{command}`, following the existing project convention.
 * - The predicate is resolved per table (never one shared across tables)
 *   through the shared type-aware resolver `resolveTenantRlsPredicate`,
 *   which reads each tenant_id column's real type from information_schema:
 *   a uuid column gets the uuid-cast setting form (index-friendly), and a
 *   varchar/text column keeps the text comparison. All four columns are uuid
 *   (1759000000002), but a partial-ledger re-run must still emit the form
 *   that matches the column AS IT IS. A missing setting resolves to NULL
 *   and an empty setting never equals a real tenant_id, so both deny
 *   access. A missing column or an unsupported type fails closed naming
 *   the table.
 * - up() is idempotent: deterministic policy names with DROP POLICY IF EXISTS
 *   before CREATE; ENABLE/FORCE are already idempotent. This matters for the
 *   repository's scenario-2 partial-ledger contract, where the schema build
 *   harness re-runs the migration set against a partially populated ledger.
 * - down() reverses only this migration's effect: it drops exactly the
 *   sixteen policies created here and removes FORCE while leaving ENABLE in
 *   place. It never drops tables, truncates, or deletes rows.
 * - All four command policies exist on every table, including the two
 *   tables with no production repository path today: `shrinkages`
 *   (ShrinkageService records SHRINKAGE rows in inventory_movements, never
 *   Shrinkage rows) and `production_orders` (production.service.ts writes
 *   the already-protected `production_batch_history`). Their policies are
 *   inert-but-declared under the uniform per-command contract (T3's ratchet
 *   slice narrows declared sets explicitly, never by omission).
 * - `shrinkage_details` and `production_order_lines` carry no tenant_id of
 *   their own: they are parent-owned through their `shrinkage_id` /
 *   `production_order_id` FKs and stay out of scope here (issue #493 T3,
 *   slice 8).
 * - No standalone service binding belongs to this migration: the only
 *   unbound production access among the four tables is the suppliers
 *   readiness count in onboarding/adapters/operations-readiness.adapter.ts,
 *   and the binding fix shipped in this same PR moves it inside the
 *   tenant-bound transaction — that is what makes these policies observable
 *   instead of silently breaking a pooled read. `warehouses` is already
 *   read through the bound manager (inventory-readiness.adapter.ts), and
 *   the other two supplier reads were already tenant-bound before this slice
 *   (inventory/purchase.service.ts, inventory/inventory-purchase.service.ts).
 */
const TABLES = [
  'warehouses',
  'suppliers',
  'shrinkages',
  'production_orders',
] as const;

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class EnforceInventoryRls1809270000000 implements MigrationInterface {
  name = 'EnforceInventoryRls1809270000000';

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
