import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchaseFiscalAuthorizationCode1778000000000 implements MigrationInterface {
  name = 'AddPurchaseFiscalAuthorizationCode1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_purchase_documents
      ADD COLUMN IF NOT EXISTS fiscal_authorization_code varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Preserve provider fiscal identity metadata during rollback. Dropping this
    // column could destroy CAE/authorization evidence needed for audit trails.
    await queryRunner.query('SELECT 1');
  }
}
