import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { EnforceAuditLogImmutability1764000000000 } from './1764000000000-EnforceAuditLogImmutability';

describe('EnforceAuditLogImmutability1764000000000', () => {
  const postgresConnection = {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '5432'),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'admin',
    database: process.env.DB_DATABASE ?? 'omnifood',
  };

  it('adds immutability trigger in Postgres and rejects UPDATE/DELETE while preserving row', async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
    });
    await dataSource.initialize();

    const schema = `audit_immutability_${randomUUID().replace(/-/g, '')}`;
    const queryRunner = dataSource.createQueryRunner();
    const migration = new EnforceAuditLogImmutability1764000000000();

    try {
      await queryRunner.connect();
      await queryRunner.query(`CREATE SCHEMA "${schema}"`);
      await queryRunner.query(`SET search_path TO "${schema}"`);
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
    } finally {
      try {
        await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } catch {
        // no-op: cleanup best effort when connection/bootstrap fails
      }
      await queryRunner.release();
      await dataSource.destroy();
    }
  });

  it('keeps INSERT ingest-compatible with immutability trigger installed', async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
    });
    await dataSource.initialize();

    const schema = `audit_insert_${randomUUID().replace(/-/g, '')}`;
    const queryRunner = dataSource.createQueryRunner();
    const migration = new EnforceAuditLogImmutability1764000000000();

    try {
      await queryRunner.connect();
      await queryRunner.query(`CREATE SCHEMA "${schema}"`);
      await queryRunner.query(`SET search_path TO "${schema}"`);
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
    } finally {
      try {
        await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } catch {
        // no-op: cleanup best effort when connection/bootstrap fails
      }
      await queryRunner.release();
      await dataSource.destroy();
    }
  });

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
