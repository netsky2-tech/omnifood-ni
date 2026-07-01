import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventoryBcnFxRates1777000000000 implements MigrationInterface {
  name = 'CreateInventoryBcnFxRates1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory_bcn_fx_rates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        effective_date date NOT NULL,
        rate_nio NUMERIC(14,4) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_bcn_fx_rates_effective_date
      ON inventory_bcn_fx_rates (effective_date)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_inventory_bcn_fx_rates_effective_date',
    );
    await queryRunner.query('DROP TABLE IF EXISTS inventory_bcn_fx_rates');
  }
}
