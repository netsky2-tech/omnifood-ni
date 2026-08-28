import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogHashVersion1784000000000 implements MigrationInterface {
  name = 'AddAuditLogHashVersion1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit_logs
      ALTER COLUMN metadata DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS hash_version VARCHAR
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit_logs
      ALTER COLUMN metadata SET NOT NULL
    `);
    await queryRunner.query(
      'ALTER TABLE audit_logs DROP COLUMN IF EXISTS hash_version',
    );
  }
}
