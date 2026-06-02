import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNegativeStockPolicyToInsumos1767000000000 implements MigrationInterface {
  name = 'AddNegativeStockPolicyToInsumos1767000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE insumos
      ADD COLUMN IF NOT EXISTS negative_stock_policy varchar NOT NULL DEFAULT 'RESTRICT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE insumos
      DROP COLUMN IF EXISTS negative_stock_policy
    `);
  }
}
