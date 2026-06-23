import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { EnforceAuditLogImmutability1764000000000 } from './1764000000000-EnforceAuditLogImmutability';

describe('EnforceAuditLogImmutability1764000000000', () => {
  const TEST_TIMEOUT_MS = 30000;
  const dbPassword = process.env.DB_PASSWORD?.trim();
  if (!dbPassword) {
    throw new Error('DB_PASSWORD is required');
  }

  const postgresConnection = {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '5432'),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: dbPassword,
    database: process.env.DB_DATABASE ?? 'omnifood',
  };

  async function withIsolatedSchema(
    schemaPrefix: string,
    assertion: (queryRunner: QueryRunner) => Promise<void>,
  ): Promise<void> {
    const dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
    });

    const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
    const queryRunner = dataSource.createQueryRunner();
    let isInitialized = false;

    try {
      await dataSource.initialize();
      isInitialized = true;
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
        // no-op: cleanup best effort when connection/bootstrap fails
      }

      try {
        await queryRunner.release();
      } catch {
        // no-op: query runner may not be connected on bootstrap errors
      }

      if (isInitialized) {
        await dataSource.destroy();
      }
    }
  }

  it(
    'adds immutability trigger in Postgres and rejects UPDATE/DELETE while preserving row',
    async () => {
      const migration = new EnforceAuditLogImmutability1764000000000();

      await withIsolatedSchema('audit_immutability', async (queryRunner) => {
        await queryRunner.query(`
        CREATE TABLE audit_logs (
          id text PRIMARY KEY,
          action text NOT NULL
        )
      `);

        await migration.up(queryRunner);

        await queryRunner.query(
          `INSERT INTO audit_logs (id, action) VALUES ('audit-1', 'DRAWER_OPEN')`,
        );

        await expect(
          queryRunner.query(
            `UPDATE audit_logs SET action = 'TAMPERED' WHERE id = 'audit-1'`,
          ),
        ).rejects.toThrow('append-only');

        await expect(
          queryRunner.query(`DELETE FROM audit_logs WHERE id = 'audit-1'`),
        ).rejects.toThrow('append-only');

        const rowsResult: unknown = await queryRunner.query(
          `SELECT id, action FROM audit_logs WHERE id = 'audit-1'`,
        );
        const rows = rowsResult as Array<{ id: string; action: string }>;
        expect(rows).toEqual([{ id: 'audit-1', action: 'DRAWER_OPEN' }]);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'keeps INSERT ingest-compatible with immutability trigger installed',
    async () => {
      const migration = new EnforceAuditLogImmutability1764000000000();

      await withIsolatedSchema('audit_insert', async (queryRunner) => {
        await queryRunner.query(`
        CREATE TABLE audit_logs (
          id text PRIMARY KEY,
          action text NOT NULL
        )
      `);

        await migration.up(queryRunner);

        await queryRunner.query(
          `INSERT INTO audit_logs (id, action) VALUES ('audit-1', 'DRAWER_OPEN')`,
        );
        await queryRunner.query(
          `INSERT INTO audit_logs (id, action) VALUES ('audit-2', 'DRAWER_CLOSE')`,
        );

        const countRowsResult: unknown = await queryRunner.query(
          `SELECT COUNT(*)::int AS total FROM audit_logs`,
        );
        const countRows = countRowsResult as Array<{ total: number }>;
        expect(countRows).toEqual([{ total: 2 }]);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it('drops trigger and function on rollback', async () => {
    const query = jest.fn();
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new EnforceAuditLogImmutability1764000000000();

    await migration.down(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs',
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'DROP FUNCTION IF EXISTS reject_audit_logs_mutation()',
    );
  });
});
