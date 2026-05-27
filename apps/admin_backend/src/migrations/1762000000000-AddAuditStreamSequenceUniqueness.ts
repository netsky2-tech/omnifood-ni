import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditStreamSequenceUniqueness1762000000000 implements MigrationInterface {
  name = 'AddAuditStreamSequenceUniqueness1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS forensic_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
    `);

    await queryRunner.query(`
      -- Non-destructive forensic remediation:
      -- preserve all historical rows and quarantine duplicate stream sequence rows.
      -- Rule: earliest authoritative row per stream key stays ACTIVE
      -- (timestamp ASC, id ASC tie-breaker); later duplicates become QUARANTINED.
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY tenant_id, device_id, user_id, sequence_no
            ORDER BY timestamp ASC, id ASC
          ) AS rn
        FROM audit_logs
      )
      UPDATE audit_logs a
      SET forensic_status = 'QUARANTINED'
      FROM ranked r
      WHERE a.id = r.id
        AND r.rn > 1
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_audit_stream_sequence
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_stream_sequence_active
      ON audit_logs (tenant_id, device_id, user_id, sequence_no)
      WHERE forensic_status = 'ACTIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_audit_stream_sequence_active',
    );
    await queryRunner.query('DROP INDEX IF EXISTS uq_audit_stream_sequence');
    await queryRunner.query(
      'ALTER TABLE audit_logs DROP COLUMN IF EXISTS forensic_status',
    );
  }
}
