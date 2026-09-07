import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive, tenant-owned mapping history. Down refuses to remove evidence. */
export class CreateProductInventoryMappingVersions1802000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Extend products_product_type_enum if it exists in PostgreSQL
    await queryRunner.query(`
      DO $$ BEGIN
        IF to_regtype('products_product_type_enum') IS NOT NULL THEN
          EXECUTE 'ALTER TYPE products_product_type_enum ADD VALUE IF NOT EXISTS ''PREPARED''';
        END IF;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 2. Supporting composite uniqueness on parent tables
    await queryRunner.query(`
      ALTER TABLE products ADD CONSTRAINT uq_products_tenant_product_id UNIQUE (tenant_id, id);
      ALTER TABLE insumos ADD CONSTRAINT uq_insumos_tenant_insumo_id UNIQUE (tenant_id, id);
    `);

    // 3. Create mapping versions table with composite tenant foreign keys
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS product_inventory_mapping_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        product_id uuid NOT NULL,
        insumo_id uuid NOT NULL,
        effective_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        superseded_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_mapping_version_interval CHECK (superseded_at IS NULL OR superseded_at > effective_at),
        CONSTRAINT fk_mapping_version_product_tenant FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
        CONSTRAINT fk_mapping_version_insumo_tenant FOREIGN KEY (tenant_id, insumo_id) REFERENCES insumos(tenant_id, id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_product_inventory_active_mapping ON product_inventory_mapping_versions (tenant_id, product_id) WHERE superseded_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_mapping_versions_effective_lookup ON product_inventory_mapping_versions (tenant_id, product_id, effective_at DESC);
      CREATE INDEX IF NOT EXISTS idx_mapping_versions_created_at ON product_inventory_mapping_versions (tenant_id, created_at DESC);
    `);

    // 4. Force Row Level Security (RLS) with explicit SELECT, INSERT and UPDATE policies
    await queryRunner.query(`
      ALTER TABLE product_inventory_mapping_versions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE product_inventory_mapping_versions FORCE ROW LEVEL SECURITY;
      CREATE POLICY mapping_version_select ON product_inventory_mapping_versions FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
      CREATE POLICY mapping_version_insert ON product_inventory_mapping_versions FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
      CREATE POLICY mapping_version_update ON product_inventory_mapping_versions FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
      CREATE POLICY mapping_version_delete ON product_inventory_mapping_versions FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true));
    `);

    // 5. Trigger guarding historical immutability: protects id, created_at, tenant, product, insumo, effective_at, and closed rows
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION guard_mapping_version_history() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'mapping version history is append-only';
        END IF;
        IF OLD.id <> NEW.id OR OLD.created_at <> NEW.created_at OR OLD.tenant_id <> NEW.tenant_id OR OLD.product_id <> NEW.product_id OR OLD.insumo_id <> NEW.insumo_id OR OLD.effective_at <> NEW.effective_at THEN
          RAISE EXCEPTION 'immutable mapping fields cannot be changed';
        END IF;
        IF OLD.superseded_at IS NOT NULL THEN
          RAISE EXCEPTION 'closed mapping history cannot be changed';
        END IF;
        IF NEW.superseded_at IS NULL THEN
          RAISE EXCEPTION 'mapping updates may only set superseded_at to close an active version';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS product_inventory_mapping_history_guard ON product_inventory_mapping_versions;
      CREATE TRIGGER product_inventory_mapping_history_guard
      BEFORE UPDATE OR DELETE ON product_inventory_mapping_versions
      FOR EACH ROW EXECUTE FUNCTION guard_mapping_version_history();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Down guard under FORCE RLS: disable RLS locally to inspect true row count before drop
    await queryRunner.query(`
      ALTER TABLE product_inventory_mapping_versions NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE product_inventory_mapping_versions DISABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM product_inventory_mapping_versions LIMIT 1) THEN
          ALTER TABLE product_inventory_mapping_versions ENABLE ROW LEVEL SECURITY;
          ALTER TABLE product_inventory_mapping_versions FORCE ROW LEVEL SECURITY;
          RAISE EXCEPTION 'refusing to remove product mapping history';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS product_inventory_mapping_versions;
      ALTER TABLE products DROP CONSTRAINT IF EXISTS uq_products_tenant_product_id;
      ALTER TABLE insumos DROP CONSTRAINT IF EXISTS uq_insumos_tenant_insumo_id;
    `);
  }
}
