import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryKardexAverageCostSnapshot1775000000000 implements MigrationInterface {
  name = 'AddInventoryKardexAverageCostSnapshot1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_kardex
      ADD COLUMN IF NOT EXISTS average_cost_after_nio NUMERIC(14,4)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE inventory_kardex DROP COLUMN IF EXISTS average_cost_after_nio',
    );
  }
}
