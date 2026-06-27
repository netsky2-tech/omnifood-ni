import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceInventoryKardexImmutability1773000000000 implements MigrationInterface {
  name = 'EnforceInventoryKardexImmutability1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reject_inventory_kardex_mutation()
      RETURNS trigger
      AS $$
      BEGIN
        RAISE EXCEPTION 'inventory_kardex is append-only: UPDATE/DELETE are forbidden';
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_inventory_kardex_immutable ON inventory_kardex
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_inventory_kardex_immutable
      BEFORE UPDATE OR DELETE ON inventory_kardex
      FOR EACH ROW
      EXECUTE FUNCTION reject_inventory_kardex_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_inventory_kardex_immutable ON inventory_kardex',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS reject_inventory_kardex_mutation()',
    );
  }
}
