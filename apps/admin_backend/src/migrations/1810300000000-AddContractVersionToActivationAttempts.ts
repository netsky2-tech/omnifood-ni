import { type MigrationInterface, type QueryRunner } from 'typeorm';

const TABLE = 'onboarding_activation_attempts';

async function isForceRowLevelSecurity(
  runner: QueryRunner,
  table: string,
): Promise<boolean> {
  const rows = (await runner.query(
    `SELECT c.relforcerowsecurity AS forced
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relname = $1`,
    [table],
  )) as Array<{ forced: boolean }>;
  return rows.length > 0 && rows[0].forced === true;
}

/**
 * Issue #957 — stamps the activation evidence contract on every attempt.
 *
 * Legacy attempts are backfilled to V1: they were created under the
 * invoice-based contract and must keep finalizing with V1 evidence if they are
 * already in flight. New attempts get V2 as the column default, so the
 * invoice-free contract is the only one the finalizer will accept from now on.
 */
export class AddContractVersionToActivationAttempts1810300000000 implements MigrationInterface {
  name = 'AddContractVersionToActivationAttempts1810300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const wasForced = await isForceRowLevelSecurity(queryRunner, TABLE);
    try {
      if (wasForced) {
        await queryRunner.query(
          `ALTER TABLE "${TABLE}" NO FORCE ROW LEVEL SECURITY`,
        );
      }

      await queryRunner.query(
        `ALTER TABLE "${TABLE}" ADD COLUMN IF NOT EXISTS "contract_version" integer`,
      );

      // Every pre-existing attempt was started under the V1 contract.
      await queryRunner.query(
        `UPDATE "${TABLE}" SET "contract_version" = 1 WHERE "contract_version" IS NULL`,
      );

      await queryRunner.query(
        `ALTER TABLE "${TABLE}" ALTER COLUMN "contract_version" SET NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${TABLE}" ALTER COLUMN "contract_version" SET DEFAULT 2`,
      );
    } finally {
      if (wasForced) {
        await queryRunner.query(
          `ALTER TABLE "${TABLE}" FORCE ROW LEVEL SECURITY`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const wasForced = await isForceRowLevelSecurity(queryRunner, TABLE);
    try {
      if (wasForced) {
        await queryRunner.query(
          `ALTER TABLE "${TABLE}" NO FORCE ROW LEVEL SECURITY`,
        );
      }
      await queryRunner.query(
        `ALTER TABLE "${TABLE}" DROP COLUMN IF EXISTS "contract_version"`,
      );
    } finally {
      if (wasForced) {
        await queryRunner.query(
          `ALTER TABLE "${TABLE}" FORCE ROW LEVEL SECURITY`,
        );
      }
    }
  }
}
