import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Forces tenant row level security on the onboarding import/integrity
 * tables (issue #493 T2.S3b): `legacy_import_integrity_reports`,
 * `product_import_sessions` and `staging_importacion_productos`.
 *
 * - ENABLE + FORCE RLS so neither the application role nor the table owner
 *   can bypass tenant isolation.
 * - One policy per command (select/insert/update/delete) named
 *   `{table}_tenant_{command}`, following the existing project convention.
 * - The predicate is resolved per table (never one shared across tables)
 *   through the shared type-aware resolver `resolveTenantRlsPredicate`,
 *   which reads each tenant_id column's real type from information_schema:
 *   a uuid column gets the uuid-cast setting form (index-friendly), and a
 *   varchar/text column keeps the text comparison. All three columns are
 *   uuid after the rebind migrations (1809070000000, 1809140000000), but a
 *   partial-ledger re-run must still emit the form that matches the column
 *   AS IT IS. A missing setting resolves to NULL and an empty setting never
 *   equals a real tenant_id, so both deny access. A missing column or an
 *   unsupported type fails closed naming the table.
 * - up() is idempotent: deterministic policy names with DROP POLICY IF EXISTS
 *   before a catalog-guarded CREATE; ENABLE/FORCE are already idempotent.
 *   This matters for the repository's scenario-2 partial-ledger contract,
 *   where the schema build harness removes this migration's ledger row and
 *   re-runs it against a partially populated ledger.
 * - down() reverses only this migration's effect: it drops exactly the
 *   twelve policies created here and removes FORCE while leaving ENABLE in
 *   place. It never drops tables, truncates, or deletes rows.
 * - No service binding belongs to this slice (T2.S3b is policies only);
 *   S4 binds the production flows that read and write these tables.
 */
const TABLES = [
  'legacy_import_integrity_reports',
  'product_import_sessions',
  'staging_importacion_productos',
] as const;

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class EnforceOnboardingImportRls1809240000000 implements MigrationInterface {
  name = 'EnforceOnboardingImportRls1809240000000';

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
