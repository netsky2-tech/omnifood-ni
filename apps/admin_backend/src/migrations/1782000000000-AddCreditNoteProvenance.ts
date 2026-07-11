import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreditNoteProvenance1782000000000
  implements MigrationInterface
{
  name = 'AddCreditNoteProvenance1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.captureRlsBaseline(queryRunner);
    await queryRunner.query(`
      ALTER TABLE invoices
        ADD COLUMN IF NOT EXISTS origin_invoice_id varchar,
        ADD COLUMN IF NOT EXISTS refund_reason_code varchar,
        ADD COLUMN IF NOT EXISTS refund_reason_policy varchar;
      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS origin_invoice_item_id varchar;
      ALTER TABLE inventory_kardex
        ADD COLUMN IF NOT EXISTS origin_movement_id bigint,
        ADD COLUMN IF NOT EXISTS origin_invoice_item_id varchar,
        ADD COLUMN IF NOT EXISTS refund_reason_policy varchar;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_tenant_origin_invoice
        ON invoices (tenant_id, origin_invoice_id)
        WHERE origin_invoice_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_invoice_items_tenant_origin_item
        ON invoice_items (tenant_id, origin_invoice_item_id)
        WHERE origin_invoice_item_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_inventory_kardex_tenant_origin_movement
        ON inventory_kardex (tenant_id, origin_movement_id)
        WHERE origin_movement_id IS NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE invoices
        DROP CONSTRAINT IF EXISTS chk_invoices_credit_note_origin_policy;
      ALTER TABLE invoices
        ADD CONSTRAINT chk_invoices_credit_note_origin_policy
        CHECK (
          (
            type = 'creditNote'
            AND origin_invoice_id IS NOT NULL
            AND refund_reason_policy IS NOT NULL
            AND refund_reason_policy IN (
              'RESTOCK_ORIGINAL_BOM', 'FINANCIAL_ONLY',
              'WASTE_NO_RESTOCK', 'MANAGER_REVIEW_HOLD'
            )
          )
          OR (
            type <> 'creditNote'
            AND origin_invoice_id IS NULL
            AND refund_reason_code IS NULL
            AND refund_reason_policy IS NULL
          )
        );
      ALTER TABLE invoice_items
        DROP CONSTRAINT IF EXISTS chk_invoice_items_credit_note_origin;
      ALTER TABLE invoice_items
        ADD CONSTRAINT chk_invoice_items_credit_note_origin
        CHECK (origin_invoice_item_id IS NULL OR length(origin_invoice_item_id) > 0);
      ALTER TABLE inventory_kardex
        DROP CONSTRAINT IF EXISTS chk_inventory_kardex_refund_reason_policy;
      ALTER TABLE inventory_kardex
        ADD CONSTRAINT chk_inventory_kardex_refund_reason_policy
        CHECK (
          (
            source_document_type = 'CREDIT_NOTE'
            AND refund_reason_policy IS NOT NULL
            AND refund_reason_policy IN (
              'RESTOCK_ORIGINAL_BOM', 'FINANCIAL_ONLY',
              'WASTE_NO_RESTOCK', 'MANAGER_REVIEW_HOLD'
            )
            AND origin_movement_id IS NOT NULL
            AND origin_invoice_item_id IS NOT NULL
          )
          OR (
            source_document_type <> 'CREDIT_NOTE'
            AND origin_movement_id IS NULL
            AND origin_invoice_item_id IS NULL
            AND refund_reason_policy IS NULL
          )
        );
    `);

    for (const tableName of ['invoices', 'invoice_items', 'inventory_kardex']) {
      await this.enableTenantRls(queryRunner, tableName);
    }
    await this.createOriginTenantGuard(queryRunner);
    await this.createAppendOnlyGuard(queryRunner, 'invoices');
    await this.createAppendOnlyGuard(queryRunner, 'invoice_items');
    await this.createAppendOnlyGuard(queryRunner, 'inventory_kardex');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_invoices_credit_note_provenance_immutable ON invoices;
      DROP TRIGGER IF EXISTS trg_invoice_items_credit_note_provenance_immutable ON invoice_items;
      DROP TRIGGER IF EXISTS trg_inventory_kardex_credit_note_provenance_immutable ON inventory_kardex;
      DROP TRIGGER IF EXISTS trg_invoices_credit_note_origin_tenant ON invoices;
      DROP TRIGGER IF EXISTS trg_invoice_items_credit_note_origin_tenant ON invoice_items;
      DROP TRIGGER IF EXISTS trg_inventory_kardex_credit_note_origin_tenant ON inventory_kardex;
      DROP FUNCTION IF EXISTS reject_credit_note_invoice_provenance_mutation();
      DROP FUNCTION IF EXISTS reject_credit_note_item_provenance_mutation();
      DROP FUNCTION IF EXISTS reject_credit_note_kardex_provenance_mutation();
      DROP FUNCTION IF EXISTS validate_credit_note_invoice_origin_tenant();
      DROP FUNCTION IF EXISTS validate_credit_note_item_origin_tenant();
      DROP FUNCTION IF EXISTS validate_credit_note_kardex_origin_tenant();
      DROP FUNCTION IF EXISTS reject_credit_note_provenance_mutation();
      DROP FUNCTION IF EXISTS validate_credit_note_origin_tenant();

      DROP POLICY IF EXISTS credit_note_invoices_tenant_select ON invoices;
      DROP POLICY IF EXISTS credit_note_invoices_tenant_insert ON invoices;
      DROP POLICY IF EXISTS credit_note_invoices_tenant_update ON invoices;
      DROP POLICY IF EXISTS credit_note_invoices_tenant_delete ON invoices;
      DROP POLICY IF EXISTS credit_note_invoice_items_tenant_select ON invoice_items;
      DROP POLICY IF EXISTS credit_note_invoice_items_tenant_insert ON invoice_items;
      DROP POLICY IF EXISTS credit_note_invoice_items_tenant_update ON invoice_items;
      DROP POLICY IF EXISTS credit_note_invoice_items_tenant_delete ON invoice_items;
      DROP POLICY IF EXISTS credit_note_inventory_kardex_tenant_select ON inventory_kardex;
      DROP POLICY IF EXISTS credit_note_inventory_kardex_tenant_insert ON inventory_kardex;
      DROP POLICY IF EXISTS credit_note_inventory_kardex_tenant_update ON inventory_kardex;
      DROP POLICY IF EXISTS credit_note_inventory_kardex_tenant_delete ON inventory_kardex;

      ALTER TABLE inventory_kardex
        DROP CONSTRAINT IF EXISTS chk_inventory_kardex_refund_reason_policy;
      ALTER TABLE invoice_items
        DROP CONSTRAINT IF EXISTS chk_invoice_items_credit_note_origin;
      ALTER TABLE invoices
        DROP CONSTRAINT IF EXISTS chk_invoices_credit_note_origin_policy;

      DROP INDEX IF EXISTS idx_inventory_kardex_tenant_origin_movement;
      DROP INDEX IF EXISTS idx_invoice_items_tenant_origin_item;
      DROP INDEX IF EXISTS idx_invoices_tenant_origin_invoice;

      ALTER TABLE inventory_kardex
        DROP COLUMN IF EXISTS refund_reason_policy,
        DROP COLUMN IF EXISTS origin_invoice_item_id,
        DROP COLUMN IF EXISTS origin_movement_id;
      ALTER TABLE invoice_items
        DROP COLUMN IF EXISTS origin_invoice_item_id;
      ALTER TABLE invoices
        DROP COLUMN IF EXISTS refund_reason_policy,
        DROP COLUMN IF EXISTS refund_reason_code,
        DROP COLUMN IF EXISTS origin_invoice_id;

    `);
    for (const tableName of ['invoices', 'invoice_items', 'inventory_kardex']) {
      await this.restoreRlsStateAfterPolicyRemoval(queryRunner, tableName);
    }
    await queryRunner.query('DROP TABLE IF EXISTS credit_note_provenance_rls_baseline');
  }

  private async captureRlsBaseline(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS credit_note_provenance_rls_baseline (
        table_name varchar PRIMARY KEY,
        relrowsecurity boolean NOT NULL,
        relforcerowsecurity boolean NOT NULL
      );
      INSERT INTO credit_note_provenance_rls_baseline (
        table_name, relrowsecurity, relforcerowsecurity
      )
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      WHERE relname IN ('invoices', 'invoice_items', 'inventory_kardex')
        AND nspname = current_schema()
      ON CONFLICT (table_name) DO UPDATE SET
        relrowsecurity = EXCLUDED.relrowsecurity,
        relforcerowsecurity = EXCLUDED.relforcerowsecurity;
    `);
  }

  private async enableTenantRls(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<void> {
    const predicate = "tenant_id = current_setting('app.tenant_id', true)";
    await queryRunner.query(`
      ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS credit_note_${tableName}_tenant_select ON ${tableName};
      DROP POLICY IF EXISTS credit_note_${tableName}_tenant_insert ON ${tableName};
      DROP POLICY IF EXISTS credit_note_${tableName}_tenant_update ON ${tableName};
      DROP POLICY IF EXISTS credit_note_${tableName}_tenant_delete ON ${tableName};
      CREATE POLICY credit_note_${tableName}_tenant_select
        ON ${tableName} FOR SELECT USING (${predicate});
      CREATE POLICY credit_note_${tableName}_tenant_insert
        ON ${tableName} FOR INSERT WITH CHECK (${predicate});
      CREATE POLICY credit_note_${tableName}_tenant_update
        ON ${tableName} FOR UPDATE USING (${predicate}) WITH CHECK (${predicate});
      CREATE POLICY credit_note_${tableName}_tenant_delete
        ON ${tableName} FOR DELETE USING (${predicate});
    `);
  }

  private async restoreRlsStateAfterPolicyRemoval(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<void> {
    const baseline = (await queryRunner.query(
      `
      SELECT relrowsecurity, relforcerowsecurity
      FROM credit_note_provenance_rls_baseline
      WHERE table_name = $1
    `,
      [tableName],
    )) as Array<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>;
    const prior = baseline[0] ?? {
      relrowsecurity: false,
      relforcerowsecurity: false,
    };

    await queryRunner.query(
      `ALTER TABLE ${tableName} ${prior.relrowsecurity ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE ${tableName} ${prior.relforcerowsecurity ? 'FORCE' : 'NO FORCE'} ROW LEVEL SECURITY`,
    );
  }

  private async createOriginTenantGuard(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION validate_credit_note_invoice_origin_tenant()
      RETURNS trigger AS $$
      DECLARE origin RECORD;
        BEGIN
          IF NEW.type <> 'creditNote'
             AND (NEW.origin_invoice_id IS NOT NULL
                  OR NEW.refund_reason_code IS NOT NULL
                  OR NEW.refund_reason_policy IS NOT NULL) THEN
            RAISE EXCEPTION 'non-credit invoice provenance fields must be null';
          END IF;
          IF NEW.type = 'creditNote' THEN
            SELECT tenant_id, type INTO origin FROM invoices WHERE id = NEW.origin_invoice_id;
          IF origin.tenant_id IS NULL THEN
            RAISE EXCEPTION 'credit-note origin invoice was not found';
          END IF;
          IF origin.tenant_id <> NEW.tenant_id THEN
            RAISE EXCEPTION 'credit-note origin invoice belongs to another tenant';
          END IF;
          IF origin.type = 'creditNote' THEN
            RAISE EXCEPTION 'credit-note origin invoice must be a regular sale invoice';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION validate_credit_note_item_origin_tenant()
      RETURNS trigger AS $$
      DECLARE origin RECORD;
      DECLARE parent_invoice RECORD;
      BEGIN
        SELECT tenant_id, type, origin_invoice_id INTO parent_invoice
        FROM invoices WHERE id = NEW.invoice_id;
        IF parent_invoice.tenant_id IS NULL THEN
          RAISE EXCEPTION 'invoice item parent invoice was not found';
        END IF;
        IF parent_invoice.tenant_id <> NEW.tenant_id THEN
          RAISE EXCEPTION 'invoice item parent invoice belongs to another tenant';
        END IF;
        IF parent_invoice.type = 'creditNote'
           AND (NEW.origin_invoice_item_id IS NULL OR length(NEW.origin_invoice_item_id) = 0) THEN
          RAISE EXCEPTION 'credit-note invoice item requires origin invoice item';
        END IF;
        IF parent_invoice.type <> 'creditNote' AND NEW.origin_invoice_item_id IS NOT NULL THEN
          RAISE EXCEPTION 'non-credit invoice item cannot reference an origin invoice item';
        END IF;
        IF NEW.origin_invoice_item_id IS NOT NULL THEN
          SELECT tenant_id, invoice_id INTO origin
          FROM invoice_items WHERE id = NEW.origin_invoice_item_id;
          IF origin.tenant_id IS NULL THEN
            RAISE EXCEPTION 'credit-note origin invoice item was not found';
          END IF;
          IF origin.tenant_id <> NEW.tenant_id THEN
            RAISE EXCEPTION 'credit-note origin invoice item belongs to another tenant';
          END IF;
          IF parent_invoice.type = 'creditNote'
             AND origin.invoice_id <> parent_invoice.origin_invoice_id THEN
            RAISE EXCEPTION 'credit-note origin invoice item must belong to the credit-note origin invoice';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION validate_credit_note_kardex_origin_tenant()
      RETURNS trigger AS $$
      DECLARE origin_movement RECORD;
      DECLARE origin_item RECORD;
      DECLARE credit_note_invoice RECORD;
        BEGIN
          IF NEW.source_document_type <> 'CREDIT_NOTE'
             AND (NEW.origin_movement_id IS NOT NULL
                  OR NEW.origin_invoice_item_id IS NOT NULL
                  OR NEW.refund_reason_policy IS NOT NULL) THEN
            RAISE EXCEPTION 'non-credit kardex provenance fields must be null';
          END IF;
          IF NEW.source_document_type = 'CREDIT_NOTE' THEN
          IF NEW.refund_reason_policy IS NULL THEN
            RAISE EXCEPTION 'credit-note kardex row requires refund reason policy';
          END IF;
          IF NEW.refund_reason_policy NOT IN (
            'RESTOCK_ORIGINAL_BOM', 'FINANCIAL_ONLY',
            'WASTE_NO_RESTOCK', 'MANAGER_REVIEW_HOLD'
          ) THEN
            RAISE EXCEPTION 'credit-note kardex row has invalid refund reason policy';
          END IF;
          IF NEW.origin_movement_id IS NULL THEN
            RAISE EXCEPTION 'credit-note kardex row requires origin movement';
          END IF;
          IF NEW.origin_invoice_item_id IS NULL OR length(NEW.origin_invoice_item_id) = 0 THEN
            RAISE EXCEPTION 'credit-note kardex row requires origin invoice item';
          END IF;
          SELECT tenant_id, type, origin_invoice_id, refund_reason_policy INTO credit_note_invoice
          FROM invoices WHERE id = NEW.source_document_id;
          IF credit_note_invoice.tenant_id IS NULL OR credit_note_invoice.type <> 'creditNote' THEN
            RAISE EXCEPTION 'credit-note kardex source invoice must be a credit note';
          END IF;
          IF credit_note_invoice.tenant_id <> NEW.tenant_id THEN
            RAISE EXCEPTION 'credit-note kardex source invoice belongs to another tenant';
          END IF;
          IF credit_note_invoice.refund_reason_policy <> NEW.refund_reason_policy THEN
            RAISE EXCEPTION 'credit-note kardex refund reason policy must match the credit-note invoice';
          END IF;
        END IF;
        IF NEW.origin_movement_id IS NOT NULL THEN
          SELECT tenant_id, source_document_id, source_document_type INTO origin_movement
          FROM inventory_kardex WHERE id = NEW.origin_movement_id;
          IF origin_movement.tenant_id IS NULL THEN
            RAISE EXCEPTION 'credit-note origin movement was not found';
          END IF;
          IF origin_movement.tenant_id <> NEW.tenant_id THEN
            RAISE EXCEPTION 'credit-note origin movement belongs to another tenant';
          END IF;
          IF NEW.source_document_type = 'CREDIT_NOTE'
             AND origin_movement.source_document_id <> credit_note_invoice.origin_invoice_id THEN
            RAISE EXCEPTION 'credit-note origin movement must belong to the credit-note origin invoice';
          END IF;
          IF NEW.source_document_type = 'CREDIT_NOTE'
             AND origin_movement.source_document_type <> 'SALE' THEN
            RAISE EXCEPTION 'credit-note origin movement must be a SALE movement';
          END IF;
        END IF;
        IF NEW.origin_invoice_item_id IS NOT NULL THEN
          SELECT tenant_id, invoice_id INTO origin_item
          FROM invoice_items WHERE id = NEW.origin_invoice_item_id;
          IF origin_item.tenant_id IS NULL THEN
            RAISE EXCEPTION 'credit-note origin invoice item was not found';
          END IF;
          IF origin_item.tenant_id <> NEW.tenant_id THEN
            RAISE EXCEPTION 'credit-note origin invoice item belongs to another tenant';
          END IF;
          IF NEW.source_document_type = 'CREDIT_NOTE'
             AND origin_item.invoice_id <> credit_note_invoice.origin_invoice_id THEN
            RAISE EXCEPTION 'credit-note origin invoice item must belong to the credit-note origin invoice';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_invoices_credit_note_origin_tenant ON invoices;
      CREATE TRIGGER trg_invoices_credit_note_origin_tenant
        BEFORE INSERT ON invoices
        FOR EACH ROW EXECUTE FUNCTION validate_credit_note_invoice_origin_tenant();
      DROP TRIGGER IF EXISTS trg_invoice_items_credit_note_origin_tenant ON invoice_items;
      CREATE TRIGGER trg_invoice_items_credit_note_origin_tenant
        BEFORE INSERT OR UPDATE ON invoice_items
        FOR EACH ROW EXECUTE FUNCTION validate_credit_note_item_origin_tenant();
      DROP TRIGGER IF EXISTS trg_inventory_kardex_credit_note_origin_tenant ON inventory_kardex;
      CREATE TRIGGER trg_inventory_kardex_credit_note_origin_tenant
        BEFORE INSERT OR UPDATE ON inventory_kardex
        FOR EACH ROW EXECUTE FUNCTION validate_credit_note_kardex_origin_tenant();
    `);
  }

  private async createAppendOnlyGuard(
    queryRunner: QueryRunner,
    tableName: 'invoices' | 'invoice_items' | 'inventory_kardex',
  ): Promise<void> {
    if (tableName === 'invoices') {
      await queryRunner.query(`
        CREATE OR REPLACE FUNCTION reject_credit_note_invoice_provenance_mutation()
        RETURNS trigger AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'invoices are append-only: DELETE is forbidden';
          END IF;
          IF OLD.type = 'creditNote' OR NEW.type = 'creditNote'
             OR OLD.origin_invoice_id IS NOT NULL OR NEW.origin_invoice_id IS NOT NULL THEN
            RAISE EXCEPTION 'credit-note invoice provenance is append-only';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS trg_invoices_credit_note_provenance_immutable
          ON invoices;
        CREATE TRIGGER trg_invoices_credit_note_provenance_immutable
          BEFORE UPDATE OR DELETE ON invoices
          FOR EACH ROW EXECUTE FUNCTION reject_credit_note_invoice_provenance_mutation();
      `);
      return;
    }

    if (tableName === 'invoice_items') {
      await queryRunner.query(`
        CREATE OR REPLACE FUNCTION reject_credit_note_item_provenance_mutation()
        RETURNS trigger AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'invoice_items are append-only: DELETE is forbidden';
          END IF;
          IF OLD.origin_invoice_item_id IS NOT NULL OR NEW.origin_invoice_item_id IS NOT NULL THEN
            RAISE EXCEPTION 'credit-note item provenance is append-only';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS trg_invoice_items_credit_note_provenance_immutable
          ON invoice_items;
        CREATE TRIGGER trg_invoice_items_credit_note_provenance_immutable
          BEFORE UPDATE OR DELETE ON invoice_items
          FOR EACH ROW EXECUTE FUNCTION reject_credit_note_item_provenance_mutation();
      `);
      return;
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reject_credit_note_kardex_provenance_mutation()
      RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'inventory_kardex rows are append-only: DELETE is forbidden';
        END IF;
        IF OLD.origin_movement_id IS NOT NULL OR NEW.origin_movement_id IS NOT NULL
           OR OLD.origin_invoice_item_id IS NOT NULL OR NEW.origin_invoice_item_id IS NOT NULL THEN
          RAISE EXCEPTION 'credit-note kardex provenance is append-only';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS trg_${tableName}_credit_note_provenance_immutable
        ON ${tableName};
      CREATE TRIGGER trg_${tableName}_credit_note_provenance_immutable
        BEFORE UPDATE OR DELETE ON ${tableName}
        FOR EACH ROW EXECUTE FUNCTION reject_credit_note_kardex_provenance_mutation();
    `);
  }
}
