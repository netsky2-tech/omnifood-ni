import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

export class CreateInventoryPurchaseDocuments1776000000000 implements MigrationInterface {
  name = 'CreateInventoryPurchaseDocuments1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory_purchase_documents (
        id varchar PRIMARY KEY,
        tenant_id varchar NOT NULL,
        insumo_id uuid NOT NULL,
        supplier_id uuid NOT NULL,
        invoice_number varchar NOT NULL,
        fiscal_authorization_code varchar,
        invoice_date date NOT NULL,
        entry_date date NOT NULL,
        entry_timestamp timestamptz NOT NULL,
        quantity NUMERIC(14,4) NOT NULL,
        unit_cost NUMERIC(14,4) NOT NULL,
        currency varchar NOT NULL,
        bcn_rate NUMERIC(14,4) NOT NULL,
        unit_cost_nio NUMERIC(14,4) NOT NULL,
        projected_cpp_nio NUMERIC(14,4) NOT NULL,
        lot_code varchar,
        received_date date,
        expiration_date date,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_purchase_documents_tenant_supplier_invoice
      ON inventory_purchase_documents (tenant_id, supplier_id, invoice_number)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_purchase_documents_tenant_invoice_date
      ON inventory_purchase_documents (tenant_id, invoice_date)
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_purchase_documents ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_purchase_documents FORCE ROW LEVEL SECURITY
    `);

    // The predicate form must match the tenant_id column's CURRENT type: a
    // partial-ledger re-run happens after later slices converted the column
    // to uuid, and a hardcoded bare compare would fail with
    // "operator does not exist: uuid = text". The shared resolver reads the
    // catalog once and returns the valid, index-friendly form.
    const tenantPredicate = await resolveTenantRlsPredicate(
      queryRunner,
      'inventory_purchase_documents',
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'inventory_purchase_documents'
            AND policyname = 'inventory_purchase_documents_tenant_select'
        ) THEN
          CREATE POLICY inventory_purchase_documents_tenant_select ON inventory_purchase_documents
          FOR SELECT
          USING (${tenantPredicate});
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'inventory_purchase_documents'
            AND policyname = 'inventory_purchase_documents_tenant_insert'
        ) THEN
          CREATE POLICY inventory_purchase_documents_tenant_insert ON inventory_purchase_documents
          FOR INSERT
          WITH CHECK (${tenantPredicate});
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'inventory_purchase_documents'
            AND policyname = 'inventory_purchase_documents_tenant_update'
        ) THEN
          CREATE POLICY inventory_purchase_documents_tenant_update ON inventory_purchase_documents
          FOR UPDATE
          USING (${tenantPredicate})
          WITH CHECK (${tenantPredicate});
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'inventory_purchase_documents'
            AND policyname = 'inventory_purchase_documents_tenant_delete'
        ) THEN
          CREATE POLICY inventory_purchase_documents_tenant_delete ON inventory_purchase_documents
          FOR DELETE
          USING (${tenantPredicate});
        END IF;
      END;
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP POLICY IF EXISTS inventory_purchase_documents_tenant_delete ON inventory_purchase_documents',
    );
    await queryRunner.query(
      'DROP POLICY IF EXISTS inventory_purchase_documents_tenant_update ON inventory_purchase_documents',
    );
    await queryRunner.query(
      'DROP POLICY IF EXISTS inventory_purchase_documents_tenant_insert ON inventory_purchase_documents',
    );
    await queryRunner.query(
      'DROP POLICY IF EXISTS inventory_purchase_documents_tenant_select ON inventory_purchase_documents',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_inventory_purchase_documents_tenant_invoice_date',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_inventory_purchase_documents_tenant_supplier_invoice',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS inventory_purchase_documents',
    );
  }
}
