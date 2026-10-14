import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Company identity parity P1 (odd/tasks/identidad-empresa-paridad.md): adds
 * nullable `phone`, `email` and `address` varchar columns to `tenants` so the
 * cloud becomes the owner of the business identity that fiscal snapshots,
 * reports and tickets print — closing the gap where the web DTO declared
 * phone/address but the service silently dropped them (and email did not
 * exist at all).
 *
 * Nullable BY DESIGN (S3 — absence discipline): a value the tenant never
 * configured stays NULL and is declared as null downstream, never defaulted
 * to an empty string. Safe additive change on an already-classified table
 * (no new RLS coverage needed); idempotent via IF NOT EXISTS / IF EXISTS.
 */
export class AddCompanyIdentityFieldsToTenants1809970000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone varchar NULL',
    );
    await queryRunner.query(
      'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email varchar NULL',
    );
    await queryRunner.query(
      'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address varchar NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE tenants DROP COLUMN IF EXISTS address',
    );
    await queryRunner.query('ALTER TABLE tenants DROP COLUMN IF EXISTS email');
    await queryRunner.query('ALTER TABLE tenants DROP COLUMN IF EXISTS phone');
  }
}
