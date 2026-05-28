import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditIntegrityAlerts1765000000000 implements MigrationInterface {
  name = 'CreateAuditIntegrityAlerts1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_integrity_alerts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        device_id varchar NOT NULL,
        user_id varchar NOT NULL,
        gap_start integer NOT NULL,
        gap_end integer NOT NULL,
        signature varchar NOT NULL,
        first_detected_at timestamptz NOT NULL,
        last_seen_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_integrity_alert_signature
      ON audit_integrity_alerts (tenant_id, device_id, user_id, signature)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_audit_integrity_alert_signature',
    );
    await queryRunner.query('DROP TABLE IF EXISTS audit_integrity_alerts');
  }
}
