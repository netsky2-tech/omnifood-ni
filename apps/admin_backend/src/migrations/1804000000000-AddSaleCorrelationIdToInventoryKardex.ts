import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSaleCorrelationIdToInventoryKardex1804000000000 implements MigrationInterface {
  name = 'AddSaleCorrelationIdToInventoryKardex1804000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_kardex
        ADD COLUMN IF NOT EXISTS sale_correlation_id varchar;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_kardex_sale_correlation
        ON inventory_kardex (tenant_id, sale_correlation_id)
        WHERE sale_correlation_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM inventory_kardex WHERE sale_correlation_id IS NOT NULL LIMIT 1) THEN
          RAISE EXCEPTION 'down migration forbidden: historical sale correlation evidence exists';
        END IF;
      END $$;

      DROP INDEX IF EXISTS uq_inventory_kardex_sale_correlation;
      ALTER TABLE inventory_kardex DROP COLUMN IF EXISTS sale_correlation_id;
    `);
  }
}
