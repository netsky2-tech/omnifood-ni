import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogHashChainingColumns1792000000000
  implements MigrationInterface
{
  name = 'AddAuditLogHashChainingColumns1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS prev_hash VARCHAR NOT NULL DEFAULT 'GENESIS'
    `);
    await queryRunner.query(`
      ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS entry_hash VARCHAR NOT NULL DEFAULT 'GENESIS'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE audit_logs DROP COLUMN IF EXISTS entry_hash',
    );
    await queryRunner.query(
      'ALTER TABLE audit_logs DROP COLUMN IF EXISTS prev_hash',
    );
  }
}
