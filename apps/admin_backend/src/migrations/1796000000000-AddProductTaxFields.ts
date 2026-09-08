import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductTaxFields1796000000000 implements MigrationInterface {
  name = 'AddProductTaxFields1796000000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE products ADD COLUMN tax_rate decimal(5,4) NOT NULL DEFAULT 0.15`,
    );
    await runner.query(
      `ALTER TABLE products ADD COLUMN is_tax_exempt boolean NOT NULL DEFAULT false`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE products DROP COLUMN is_tax_exempt`);
    await runner.query(`ALTER TABLE products DROP COLUMN tax_rate`);
  }
}
