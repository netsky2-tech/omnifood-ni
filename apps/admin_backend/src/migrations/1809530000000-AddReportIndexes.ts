import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Go-live unit B0.5 — report indexes for the owner-facing time-window
 * reports. The two hot report queries filter by tenant and a time range,
 * then order descending on the same timestamp column:
 *
 *   - invoices:        WHERE tenant_id = $1 AND created_at  BETWEEN ... ORDER BY created_at  DESC
 *   - inventory_kardex: WHERE tenant_id = $1 AND occurred_at BETWEEN ... ORDER BY occurred_at DESC
 *
 * Composite (tenant_id, <timestamp>) indexes let the planner serve both the
 * range filter and the ordering from a single index scan. Note the kardex
 * column is the physical `occurred_at` (timestamptz); the TypeORM entity
 * property is named `timestamp`, but DDL must target the real column.
 *
 * Additive and idempotent; `down` removes only the indexes.
 */
export class AddReportIndexes1809530000000 implements MigrationInterface {
  name = 'AddReportIndexes1809530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_tenant_created_at
      ON invoices (tenant_id, created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_kardex_tenant_occurred_at
      ON inventory_kardex (tenant_id, occurred_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_invoices_tenant_created_at
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_inventory_kardex_tenant_occurred_at
    `);
  }
}
