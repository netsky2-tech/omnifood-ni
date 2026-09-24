import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Forces tenant row level security on the `datafonos_equipos` table
 * (issue #512 T3 slice 8).
 *
 * - `datafonos_equipos.tenant_id` is uuid NOT NULL: born uuid in
 *   1759000000005-CreateBootstrapSalesTables (tenant_id:10), matching the
 *   entity declaration `src/modules/sales/entities/datafono-equipo.entity.ts`
 *   (`@Column({ name: 'tenant_id', type: 'uuid' })`). The table carries a
 *   unique `(tenant_id, terminal_id_banco)` index
 *   (uq_datafonos_equipos_tenant_terminal). The migration is therefore pure
 *   policy work: no ADD COLUMN, no backfill, no data change.
 * - The measured access surface is EMPTY of production consumers: the entity
 *   is registered in TypeORM modules (app.module / sales.module forFeature)
 *   but no repository, service, controller, or raw SQL reads or writes the
 *   table. This is a policy-only promotion with NO binding work — enforcing
 *   RLS here deny-all's only the unbound paths that do not exist, and the
 *   future POS equipment-sync receiver must bind to the tenant transaction
 *   from its first line.
 * - `users` is deliberately OUT of scope (founder decision): it stays
 *   classified as `debt` in the RLS coverage manifest — see the deferral
 *   notes there.
 * - ENABLE + FORCE RLS so neither the application role nor the table owner
 *   can bypass tenant isolation.
 * - One policy per command (select/insert/update/delete) named
 *   `{table}_tenant_{command}`, following the existing project convention.
 * - The predicate is resolved through the shared type-aware resolver
 *   `resolveTenantRlsPredicate`, which reads the tenant_id column's real
 *   type from information_schema: a uuid column gets the uuid-cast setting
 *   form (index-friendly). A missing setting resolves to NULL and an empty
 *   setting never equals a real tenant_id, so both deny access. A missing
 *   column or an unsupported type fails closed naming the table.
 * - up() is idempotent: deterministic policy names with DROP POLICY IF EXISTS
 *   before CREATE; ENABLE/FORCE are already idempotent. This matters for the
 *   repository's scenario-2 partial-ledger contract, where the schema build
 *   harness re-runs the migration set against a partially populated ledger.
 * - down() reverses only this migration's effect: it drops exactly the four
 *   policies created here and removes FORCE while leaving ENABLE in place.
 *   It never drops tables, truncates, or deletes rows.
 */
const TABLES = ['datafonos_equipos'] as const;

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class EnforceDatafonosRls1809320000000 implements MigrationInterface {
  name = 'EnforceDatafonosRls1809320000000';

  private policyName(table: string, command: string): string {
    return `${table}_tenant_${command}`;
  }

  async up(runner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      const tableId = quoteIdentifier(table);

      await runner.query(`ALTER TABLE ${tableId} ENABLE ROW LEVEL SECURITY`);
      await runner.query(`ALTER TABLE ${tableId} FORCE ROW LEVEL SECURITY`);

      // One resolution for the table: the predicate must match the tenant_id
      // column's type AS IT IS right now, not as it was when this migration
      // was written.
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
