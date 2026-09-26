import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AG-07 — persisted audit severity (Owner Dashboard V2, architecture spec
 * v0.3 §16.2).
 *
 * Adds a nullable `severity` column to `change_log` plus the aggregation
 * index the summary endpoint reads. New events classify at ingestion
 * through the single `AuditRiskClassifier` (src/modules/audit); historical
 * rows keep NULL and surface as INFO at read time — there is deliberately
 * NO backfill and history is never mutated.
 *
 * `down` drops the index and the column: severity is derived data,
 * re-computable from `action` at any time, so no fiscal or forensic fact is
 * destroyed.
 */
export class AddChangeLogSeverity1809450000000 implements MigrationInterface {
  name = 'AddChangeLogSeverity1809450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE change_log
      ADD COLUMN IF NOT EXISTS severity varchar(16)
    `);
    // Indexable aggregation (AG-07 rationale): counts by severity and the
    // latest high-severity item read through (tenant_id, severity,
    // created_at) with the RLS tenant predicate on the leading column.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_change_log_tenant_severity_created
      ON change_log (tenant_id, severity, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_change_log_tenant_severity_created
    `);
    await queryRunner.query(`
      ALTER TABLE change_log
      DROP COLUMN IF EXISTS severity
    `);
  }
}
