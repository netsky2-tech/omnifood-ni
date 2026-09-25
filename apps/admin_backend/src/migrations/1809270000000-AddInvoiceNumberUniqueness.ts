import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the database-level uniqueness tripwire on invoice numbers
 * (issue #526 AC-7, plan unit B0.4): a UNIQUE index on
 * `invoices (tenant_id, invoice_number)` named
 * `uq_invoices_tenant_invoice_number`.
 *
 * Why the tenant is part of the key: this is a multi-tenant RaaS platform and
 * DGI numbering sequences are per-establishment, not global — two tenants may
 * legitimately carry the same printed number, so only the pair must be
 * unique. The existing non-unique `idx_invoices_number` and
 * `idx_invoices_tenant` are left in place; this migration drops or renames
 * nothing.
 *
 * Fail closed, by design. The shipped migration NEVER deletes or UPDATEs any
 * invoice row, for two independent reasons:
 *
 * 1. `invoices` is append-only by trigger:
 *    `1782000000000-AddCreditNoteProvenance` raises
 *    `invoices are append-only: DELETE is forbidden` on any DELETE and
 *    rejects UPDATEs touching credit-note provenance. A dedupe-by-delete
 *    migration is not a business decision, it is a raised exception.
 * 2. Issue #526 AC-11: no criterion may be satisfied by deleting or editing
 *    an issued invoice.
 *
 * So when duplicates exist, up() throws naming the constraint, the group
 * count, up to 10 offenders, the explicit human-run dev/staging cleanup
 * script (`scripts/dev-cleanup-duplicate-invoice-numbers.sql`), and the
 * fiscal-incident path (Scenario D of
 * `docs/operations/pilot-terminal-incident-procedure.md`) for live tenants.
 * Duplicate detection is a guard, not a cleanup.
 *
 * FORCE ROW LEVEL SECURITY. `invoices` is ENABLE + FORCE RLS with tenant
 * policies (1782000000000). On a FORCE-enabled table the counting SELECT
 * below would be silently filtered to zero rows for a non-bypassing table
 * owner, making the fail-closed guard vacuous on exactly the table it
 * protects. Following the proven recipe of
 * `1809180000000-ReconcileEnumColumns`, when the table is FORCE-enabled this
 * migration issues `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` before the
 * guard and restores `FORCE` in a `finally`, so a throw can never leave the
 * table deniable. When the connecting role already bypasses RLS the guard
 * sees every row either way; the dance keeps the guard real for the roles
 * that cannot.
 *
 * up() is idempotent through `CREATE UNIQUE INDEX IF NOT EXISTS`, the
 * established form (`1766000000000-BohInventoryLedgerFoundation`): a re-run
 * on an already-migrated database issues the same guarded statement and
 * no-ops.
 *
 * down() reverses only this migration's effect: it drops exactly this index
 * with `DROP INDEX IF EXISTS`. It never touches data, never alters RLS
 * (neither ENABLE nor FORCE), and never drops tables.
 */
const TABLE = 'invoices';
const INDEX_NAME = 'uq_invoices_tenant_invoice_number';
const CLEANUP_SCRIPT = 'scripts/dev-cleanup-duplicate-invoice-numbers.sql';
const INCIDENT_PROCEDURE =
  'docs/operations/pilot-terminal-incident-procedure.md';
const MAX_OFFENDERS_LISTED = 10;

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class AddInvoiceNumberUniqueness1809270000000 implements MigrationInterface {
  name = 'AddInvoiceNumberUniqueness1809270000000';

  /** Whether the table is FORCE ROW LEVEL SECURITY (owner subject to RLS too). */
  private async isForceRowLevelSecurity(
    runner: QueryRunner,
    table: string,
  ): Promise<boolean> {
    const rows = (await runner.query(
      `SELECT c.relforcerowsecurity AS forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relname = $1`,
      [table],
    )) as Array<{ forced: boolean }>;

    return rows.length > 0 && rows[0].forced === true;
  }

  /**
   * Fails closed before the index when a duplicate (tenant_id, invoice_number)
   * group exists. The CREATE UNIQUE INDEX alone would also fail, but with a
   * bare constraint error that names neither the offending rows nor the
   * sanctioned way out.
   */
  private async assertNoDuplicateInvoiceNumbers(
    runner: QueryRunner,
  ): Promise<void> {
    const rows = (await runner.query(
      `SELECT tenant_id::text AS "tenantId", invoice_number AS "invoiceNumber", count(*)::int AS n
         FROM ${quoteIdentifier(TABLE)}
        GROUP BY tenant_id, invoice_number
       HAVING count(*) > 1
        ORDER BY tenant_id, invoice_number`,
    )) as Array<{ tenantId: string; invoiceNumber: string; n: number }>;

    if (rows.length === 0) {
      return;
    }

    const offenders = rows
      .slice(0, MAX_OFFENDERS_LISTED)
      .map(
        (row) =>
          `tenant_id=${row.tenantId} number=${row.invoiceNumber} rows=${row.n}`,
      )
      .join('; ');
    const overflow =
      rows.length > MAX_OFFENDERS_LISTED
        ? ` (and ${rows.length - MAX_OFFENDERS_LISTED} more group(s) not listed)`
        : '';

    throw new Error(
      `DUPLICATE_INVOICE_NUMBERS: cannot create ${INDEX_NAME} on ${TABLE}: ` +
        `${rows.length} duplicate (tenant_id, invoice_number) group(s) exist${overflow}. ` +
        `Offenders (at most ${MAX_OFFENDERS_LISTED}): ${offenders}. ` +
        `This migration never deletes or updates an invoice row, so it fails closed instead of cleaning up. ` +
        `For development or staging only, a human may run ${CLEANUP_SCRIPT} to reassign the later duplicates ` +
        `(it edits issued invoice numbers, which is why it lives outside every automated path). ` +
        `On a live tenant this is a fiscal incident: route it through Scenario D of ${INCIDENT_PROCEDURE} — ` +
        `it is not a cleanup to automate.`,
    );
  }

  async up(runner: QueryRunner): Promise<void> {
    const forcedRls = await this.isForceRowLevelSecurity(runner, TABLE);
    const tableId = quoteIdentifier(TABLE);

    if (forcedRls) {
      await runner.query(`ALTER TABLE ${tableId} NO FORCE ROW LEVEL SECURITY`);
    }

    try {
      await this.assertNoDuplicateInvoiceNumbers(runner);

      await runner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME} ON ${tableId} (tenant_id, invoice_number)`,
      );
    } finally {
      if (forcedRls) {
        await runner.query(`ALTER TABLE ${tableId} FORCE ROW LEVEL SECURITY`);
      }
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    // Drops ONLY this index. Never touches data, never alters RLS, never
    // drops tables — `invoices` stays append-only and tenant-isolated.
    await runner.query(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
  }
}
