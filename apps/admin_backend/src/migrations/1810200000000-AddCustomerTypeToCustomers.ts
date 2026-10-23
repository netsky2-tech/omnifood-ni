import { type MigrationInterface, type QueryRunner } from 'typeorm';

const RLS_TABLES = ['customers'] as const;

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

async function liftForceRowLevelSecurity(
  runner: QueryRunner,
  lifted: string[],
): Promise<void> {
  for (const table of RLS_TABLES) {
    if (await isForceRowLevelSecurity(runner, table)) {
      await runner.query(
        `ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`,
      );
      lifted.push(table);
    }
  }
}

async function restoreForceRowLevelSecurity(
  runner: QueryRunner,
  lifted: string[],
): Promise<void> {
  for (const table of lifted) {
    await runner.query(
      `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
    );
  }
}

export class AddCustomerTypeToCustomers1810200000000 implements MigrationInterface {
  name = 'AddCustomerTypeToCustomers1810200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const lifted: string[] = [];
    try {
      await liftForceRowLevelSecurity(queryRunner, lifted);

      // Add the column. Nullable initially; the app will treat null as PERSONA.
      await queryRunner.query(
        `ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_type" varchar`,
      );

      // Backfill existing rows: set to 'PERSONA' so the default is safe.
      await queryRunner.query(
        `UPDATE "customers" SET "customer_type" = 'PERSONA' WHERE "customer_type" IS NULL`,
      );
    } finally {
      await restoreForceRowLevelSecurity(queryRunner, lifted);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const lifted: string[] = [];
    try {
      await liftForceRowLevelSecurity(queryRunner, lifted);

      // Drop the column
      await queryRunner.query(
        `ALTER TABLE "customers" DROP COLUMN IF EXISTS "customer_type"`,
      );
    } finally {
      await restoreForceRowLevelSecurity(queryRunner, lifted);
    }
  }
}