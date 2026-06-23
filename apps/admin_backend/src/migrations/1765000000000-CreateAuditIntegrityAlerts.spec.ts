import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateAuditIntegrityAlerts1765000000000 } from './1765000000000-CreateAuditIntegrityAlerts';

type AlertStorageState = {
  tableExists: boolean;
  uniqueIndexExists: boolean;
};

type ExistsRow = {
  exists: boolean;
};

function readExistsValue(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length === 0) {
    return false;
  }

  const firstRow: unknown = rows[0];
  if (
    typeof firstRow === 'object' &&
    firstRow !== null &&
    'exists' in firstRow &&
    typeof (firstRow as ExistsRow).exists === 'boolean'
  ) {
    return (firstRow as ExistsRow).exists;
  }

  return false;
}

const maybeDescribe = process.env.DB_PASSWORD?.trim()
  ? describe
  : describe.skip;

maybeDescribe('CreateAuditIntegrityAlerts1765000000000', () => {
  const dbPassword = process.env.DB_PASSWORD?.trim() ?? '';

  const postgresConnection = {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '5432'),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: dbPassword,
    database: process.env.DB_DATABASE ?? 'omnifood',
  };

  const migration = new CreateAuditIntegrityAlerts1765000000000();

  async function readAlertStorageState(
    queryRunner: QueryRunner,
  ): Promise<AlertStorageState> {
    const tableRows: unknown = await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'audit_integrity_alerts'
      ) AS "exists"`,
    );

    const indexRows: unknown = await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'audit_integrity_alerts'
          AND indexname = 'uq_audit_integrity_alert_signature'
      ) AS "exists"`,
    );

    return {
      tableExists: readExistsValue(tableRows),
      uniqueIndexExists: readExistsValue(indexRows),
    };
  }

  async function withIsolatedSchema(
    assertion: (queryRunner: QueryRunner) => Promise<void>,
  ): Promise<void> {
    const dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
    });
    await dataSource.initialize();

    const schema = `audit_integrity_${randomUUID().replace(/-/g, '')}`;
    const queryRunner = dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.query(`CREATE SCHEMA "${schema}"`);
      await queryRunner.query(`SET search_path TO "${schema}"`);
      await queryRunner.query(`SET statement_timeout TO '15000ms'`);

      await assertion(queryRunner);
    } finally {
      try {
        await queryRunner.query('SET search_path TO public');
        await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } catch {
        // best effort cleanup
      }
      await queryRunner.release();
      await dataSource.destroy();
    }
  }

  it('creates alert table and unique index on up', async () => {
    await withIsolatedSchema(async (queryRunner) => {
      await migration.up(queryRunner);

      const state = await readAlertStorageState(queryRunner);
      expect(state).toEqual({ tableExists: true, uniqueIndexExists: true });
    });
  }, 20000);

  it('removes alert table and unique index on down', async () => {
    await withIsolatedSchema(async (queryRunner) => {
      await migration.up(queryRunner);
      await migration.down(queryRunner);

      const state = await readAlertStorageState(queryRunner);
      expect(state).toEqual({ tableExists: false, uniqueIndexExists: false });
    });
  }, 20000);

  it('is deterministic across up -> down -> up cycles', async () => {
    await withIsolatedSchema(async (queryRunner) => {
      await migration.up(queryRunner);
      const firstUpState = await readAlertStorageState(queryRunner);

      await migration.down(queryRunner);
      const afterDownState = await readAlertStorageState(queryRunner);

      await migration.up(queryRunner);
      const secondUpState = await readAlertStorageState(queryRunner);

      expect(firstUpState).toEqual({
        tableExists: true,
        uniqueIndexExists: true,
      });
      expect(afterDownState).toEqual({
        tableExists: false,
        uniqueIndexExists: false,
      });
      expect(secondUpState).toEqual(firstUpState);
    });
  }, 20000);
});
