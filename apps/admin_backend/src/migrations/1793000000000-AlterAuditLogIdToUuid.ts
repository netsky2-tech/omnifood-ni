import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterAuditLogIdToUuid1793000000000 implements MigrationInterface {
  name = 'AlterAuditLogIdToUuid1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit_logs ALTER COLUMN id DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE audit_logs ALTER COLUMN id TYPE varchar USING id::varchar
    `);
    await queryRunner.query(`
      ALTER TABLE audit_logs ALTER COLUMN id SET DEFAULT gen_random_uuid()::varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit_logs ALTER COLUMN id DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE audit_logs ALTER COLUMN id TYPE bigint USING id::bigint
    `);
  }
}
