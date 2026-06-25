import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `tenant_id` column to `invoice_items` so per-line rows are
 * tenant-isolated like their parent `invoices`.
 *
 * Motivation: the POS sync payload controls the item `id` (a client UUID),
 * and `InvoicesService.syncInvoices` upserts on `['id']`. Without a
 * `tenant_id` on the line, a colliding id submitted by a different tenant
 * would overwrite another tenant's item through the upsert. Adding and
 * indexing `tenant_id` (plus a pre-upsert ownership check in the service)
 * prevents cross-tenant item-id overwrite.
 *
 * The column is backfilled from the parent invoice's `tenant_id` and then
 * made NOT NULL so every line is bound to a tenant. A composite index on
 * (tenant_id, invoice_id) supports the common tenant-scoped item lookups.
 */
export class AddTenantIdToInvoiceItems1770000000000 implements MigrationInterface {
  name = 'AddTenantIdToInvoiceItems1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS tenant_id varchar
    `);

    // Backfill from the parent invoice so existing rows are bound to a
    // tenant before the NOT NULL constraint is applied.
    await queryRunner.query(`
      UPDATE invoice_items
      SET tenant_id = i.tenant_id
      FROM invoices i
      WHERE invoice_items.invoice_id = i.id
        AND invoice_items.tenant_id IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE invoice_items
      ALTER COLUMN tenant_id SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_invoice_items_tenant_id"
      ON "invoice_items" ("tenant_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_invoice_items_tenant_invoice"
      ON "invoice_items" ("tenant_id", "invoice_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_invoice_items_tenant_invoice"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_invoice_items_tenant_id"
    `);
    await queryRunner.query(`
      ALTER TABLE invoice_items
      DROP COLUMN IF EXISTS tenant_id
    `);
  }
}
