import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #518 + #935 (DEC-8):
 * Adds `products.inventory_policy` ('NOT_TRACKED' | 'DIRECT_STOCK', default 'NOT_TRACKED'),
 * backfills 'DIRECT_STOCK' for SIMPLE products with an active ProductInventoryMappingVersion,
 * and adds `insumos.catalog_kind` ('RAW_MATERIAL' | 'PRODUCT_RESALE', default 'RAW_MATERIAL')
 * + `insumos.managed_product_id` (nullable FK to products(id) ON DELETE SET NULL) with
 * partial unique index per (tenant_id, managed_product_id).
 *
 * Idempotent for fresh builds and Scenario-2 partial-ledger replays in verify-schema-build.sh.
 */
export class AddDirectStockPolicyAndManagedResaleInsumo1811400000000 implements MigrationInterface {
  name = 'AddDirectStockPolicyAndManagedResaleInsumo1811400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS inventory_policy varchar(24) NOT NULL DEFAULT 'NOT_TRACKED'
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          WHERE c.conrelid = to_regclass('products')
            AND c.conname = 'chk_products_inventory_policy'
        ) THEN
          ALTER TABLE products
          ADD CONSTRAINT chk_products_inventory_policy
          CHECK (inventory_policy IN ('NOT_TRACKED', 'DIRECT_STOCK'));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF to_regclass('product_inventory_mapping_versions') IS NOT NULL THEN
          UPDATE products p
          SET inventory_policy = 'DIRECT_STOCK'
          WHERE p.product_type = 'SIMPLE'
            AND p.inventory_policy = 'NOT_TRACKED'
            AND EXISTS (
              SELECT 1
              FROM product_inventory_mapping_versions m
              WHERE m.tenant_id = p.tenant_id
                AND m.product_id = p.id
                AND m.superseded_at IS NULL
            );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE insumos
      ADD COLUMN IF NOT EXISTS catalog_kind varchar(24) NOT NULL DEFAULT 'RAW_MATERIAL',
      ADD COLUMN IF NOT EXISTS managed_product_id uuid NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          WHERE c.conrelid = to_regclass('insumos')
            AND c.conname = 'chk_insumos_catalog_kind'
        ) THEN
          ALTER TABLE insumos
          ADD CONSTRAINT chk_insumos_catalog_kind
          CHECK (catalog_kind IN ('RAW_MATERIAL', 'PRODUCT_RESALE'));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          WHERE c.conrelid = to_regclass('insumos')
            AND c.conname = 'fk_insumos_managed_product_id'
        ) THEN
          ALTER TABLE insumos
          ADD CONSTRAINT fk_insumos_managed_product_id
          FOREIGN KEY (managed_product_id) REFERENCES products(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_insumos_managed_product
      ON insumos (tenant_id, managed_product_id)
      WHERE managed_product_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_insumos_tenant_catalog_kind
      ON insumos (tenant_id, catalog_kind)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_insumos_tenant_catalog_kind
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_insumos_managed_product
    `);

    await queryRunner.query(`
      ALTER TABLE insumos
      DROP CONSTRAINT IF EXISTS fk_insumos_managed_product_id
    `);

    await queryRunner.query(`
      ALTER TABLE insumos
      DROP CONSTRAINT IF EXISTS chk_insumos_catalog_kind
    `);

    await queryRunner.query(`
      ALTER TABLE insumos
      DROP COLUMN IF EXISTS managed_product_id,
      DROP COLUMN IF EXISTS catalog_kind
    `);

    await queryRunner.query(`
      ALTER TABLE products
      DROP CONSTRAINT IF EXISTS chk_products_inventory_policy
    `);

    await queryRunner.query(`
      ALTER TABLE products
      DROP COLUMN IF EXISTS inventory_policy
    `);
  }
}
