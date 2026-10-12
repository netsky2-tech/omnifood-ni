import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aligns the four `invoices` tenant RLS policies with the uuid tenant_id column.
 *
 * - Issue #286 converges every tenant_id column on uuid. `invoices.tenant_id`
 *   is ALREADY uuid, but its four policies were created with a text predicate
 *   (`tenant_id::text = current_setting('app.tenant_id', true)`) by the
 *   credit-note provenance migration. On a uuid column that predicate makes
 *   PostgreSQL evaluate the tenant check as a Filter instead of an Index Cond,
 *   so the index on `invoices.tenant_id` stops restricting rows.
 * - The target predicate compares the uuid column directly against the cast
 *   setting: `tenant_id = current_setting('app.tenant_id', true)::uuid`.
 *   That string is only valid on a uuid column; on a varchar column PostgreSQL
 *   rejects the policy with `operator does not exist: character varying = uuid`.
 *   up() therefore begins with a fail-closed type guard that turns that opaque
 *   failure into an exception naming the table, the column, the type actually
 *   found, and the reason.
 * - `invoice_items` and `inventory_kardex` keep their text predicate on
 *   purpose: their tenant_id columns are still varchar and belong to a later
 *   unit. This migration touches ONLY the four `invoices` policies.
 * - Idempotent, following the project convention for policy migrations:
 *   `DROP POLICY IF EXISTS` before a catalog-guarded `CREATE POLICY`.
 * - down() restores exactly the previous text predicate and nothing else. It
 *   never enables, forces, or disables row level security, never drops tables,
 *   truncates, or deletes rows.
 * - `1782000000000-AddCreditNoteProvenance` has also been corrected so that a
 *   re-run of it no longer reverts this predicate: its per-table RLS mapping
 *   now emits this same uuid predicate for `invoices`. This forward migration
 *   nevertheless remains necessary, because databases that already applied
 *   `1782000000000` will never re-run it — their migration ledger row is
 *   present — so only this migration corrects their already-created text-form
 *   policies.
 */
const TABLE = 'invoices';

const TARGET_PREDICATE =
  "tenant_id = current_setting('app.tenant_id', true)::uuid";

const PREVIOUS_PREDICATE =
  "tenant_id::text = current_setting('app.tenant_id', true)";

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

const POLICIES = [
  {
    name: 'credit_note_invoices_tenant_select',
    expression: (predicate: string) => `FOR SELECT
      USING (${predicate})`,
  },
  {
    name: 'credit_note_invoices_tenant_insert',
    expression: (predicate: string) => `FOR INSERT
      WITH CHECK (${predicate})`,
  },
  {
    name: 'credit_note_invoices_tenant_update',
    expression: (predicate: string) => `FOR UPDATE
      USING (${predicate})
      WITH CHECK (${predicate})`,
  },
  {
    name: 'credit_note_invoices_tenant_delete',
    expression: (predicate: string) => `FOR DELETE
      USING (${predicate})`,
  },
] as const;

export class AlignInvoiceTenantPolicyPredicate1809060000000 implements MigrationInterface {
  name = 'AlignInvoiceTenantPolicyPredicate1809060000000';

  async up(runner: QueryRunner): Promise<void> {
    // Fail-closed type guard: the target predicate casts the setting to uuid,
    // so it is only valid on a uuid column. On a varchar column PostgreSQL
    // would reject the policy with `operator does not exist:
    // character varying = uuid`; this guard turns that opaque failure into a
    // message naming the table, the column, the type actually found, and the
    // reason. A missing column is also treated as a failure (fail closed).
    await runner.query(`
      DO $$
      DECLARE
        actual_type text;
      BEGIN
        SELECT data_type INTO actual_type
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'invoices'
          AND column_name = 'tenant_id';
        IF actual_type IS DISTINCT FROM 'uuid' THEN
          RAISE EXCEPTION
            'invoices.tenant_id must be uuid before applying the uuid tenant policy predicate, but the column type is %; the target predicate tenant_id = current_setting(''app.tenant_id'', true)::uuid is only valid on a uuid column, because on a varchar column PostgreSQL rejects the policy with operator does not exist: character varying = uuid',
            COALESCE(actual_type, '<missing>');
        END IF;
      END
      $$;
    `);

    await this.recreatePolicies(runner, TARGET_PREDICATE);
  }

  async down(runner: QueryRunner): Promise<void> {
    await this.recreatePolicies(runner, PREVIOUS_PREDICATE);
  }

  private async recreatePolicies(
    runner: QueryRunner,
    predicate: string,
  ): Promise<void> {
    const tableId = quoteIdentifier(TABLE);

    for (const policy of POLICIES) {
      await runner.query(
        `DROP POLICY IF EXISTS ${quoteIdentifier(policy.name)} ON ${tableId}`,
      );
      // PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, so guard on the catalog.
      await runner.query(
        `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = '${TABLE}'
          AND policyname = '${policy.name}'
      ) THEN
        CREATE POLICY ${quoteIdentifier(policy.name)} ON ${tableId}
      ${policy.expression(predicate)};
      END IF;
      END $$;`,
      );
    }
  }
}
