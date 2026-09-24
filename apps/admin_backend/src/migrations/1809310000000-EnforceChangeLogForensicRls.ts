import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Forces tenant row level security on the `change_log` and `forensic_alerts`
 * tables (issue #512 T3 slice 7).
 *
 * - Both `tenant_id` columns are uuid NOT NULL. `change_log` was born uuid
 *   in 1794000000000-CreateChangeLogTable (tenant_id:11, with a FK to
 *   tenants(id)); `forensic_alerts` was born varchar in
 *   1766000000000-BohInventoryLedgerFoundation and was rebound to uuid by
 *   1809130000000-RebindDeviceAndAlertTenantColumns (forensic_alerts:92).
 *   The migration is therefore pure policy work: no ADD COLUMN, no backfill,
 *   no data change.
 * - The access surface was bound to the tenant transaction first (issue #512
 *   T3 slice 7): every ChangeLogService read/write and every forensic-alert
 *   write now runs inside `runInTenantTransaction` or on a caller-supplied
 *   bound manager, so enforcing RLS here deny-all's only the unbound paths
 *   that must not exist.
 * - `audit_integrity_alerts` and `audit_logs` are deliberately OUT of scope
 *   (founder decision): both stay classified as `debt` in the RLS coverage
 *   manifest — see the deferral notes there.
 * - ENABLE + FORCE RLS so neither the application role nor the table owner
 *   can bypass tenant isolation.
 * - One policy per command (select/insert/update/delete) named
 *   `{table}_tenant_{command}`, following the existing project convention.
 * - The predicate is resolved per table (never one shared across tables)
 *   through the shared type-aware resolver `resolveTenantRlsPredicate`,
 *   which reads each tenant_id column's real type from information_schema:
 *   a uuid column gets the uuid-cast setting form (index-friendly), and a
 *   varchar/text column keeps the text comparison. Both columns are uuid
 *   today, but a partial-ledger re-run must still emit the form that matches
 *   the column AS IT IS. A missing setting resolves to NULL and an empty
 *   setting never equals a real tenant_id, so both deny access. A missing
 *   column or an unsupported type fails closed naming the table.
 * - up() is idempotent: deterministic policy names with DROP POLICY IF EXISTS
 *   before CREATE; ENABLE/FORCE are already idempotent. This matters for the
 *   repository's scenario-2 partial-ledger contract, where the schema build
 *   harness re-runs the migration set against a partially populated ledger.
 * - down() reverses only this migration's effect: it drops exactly the eight
 *   policies created here and removes FORCE while leaving ENABLE in place.
 *   It never drops tables, truncates, or deletes rows.
 */
const TABLES = ['change_log', 'forensic_alerts'] as const;

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class EnforceChangeLogForensicRls1809310000000 implements MigrationInterface {
  name = 'EnforceChangeLogForensicRls1809310000000';

  private policyName(table: string, command: string): string {
    return `${table}_tenant_${command}`;
  }

  async up(runner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      const tableId = quoteIdentifier(table);

      await runner.query(`ALTER TABLE ${tableId} ENABLE ROW LEVEL SECURITY`);
      await runner.query(`ALTER TABLE ${tableId} FORCE ROW LEVEL SECURITY`);

      // One resolution for the table, never one shared across tables: the
      // tenant_id column can sit at a different point of the varchar ->
      // uuid rebind, so the predicate must match the column type as it is
      // right now, not as it was when this migration was written.
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
