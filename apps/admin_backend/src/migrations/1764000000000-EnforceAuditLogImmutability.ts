import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceAuditLogImmutability1764000000000 implements MigrationInterface {
  name = 'EnforceAuditLogImmutability1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reject_audit_logs_mutation()
      RETURNS trigger
      AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only: UPDATE/DELETE are forbidden';
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_audit_logs_immutable
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION reject_audit_logs_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS reject_audit_logs_mutation()',
    );
  }
}
