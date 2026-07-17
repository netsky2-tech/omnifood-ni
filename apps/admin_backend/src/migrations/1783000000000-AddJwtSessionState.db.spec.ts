import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { AddJwtSessionState1783000000000 } from './1783000000000-AddJwtSessionState';

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'admin',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

async function withJwtSchema(
  assertion: (queryRunner: QueryRunner) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });
  const queryRunner = dataSource.createQueryRunner();
  const schema = `jwt_migration_${randomUUID().replace(/-/g, '')}`;
  try {
    await dataSource.initialize();
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query('CREATE TABLE users (email text PRIMARY KEY)');
    await assertion(queryRunner);
  } finally {
    try {
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await queryRunner.release();
    } finally {
      if (dataSource.isInitialized) await dataSource.destroy();
    }
  }
}

describe('AddJwtSessionState1783000000000 (db)', () => {
  it('runs up, down, and up again in an isolated PostgreSQL schema', async () => {
    await withJwtSchema(async (queryRunner) => {
      const migration = new AddJwtSessionState1783000000000();
      await migration.up(queryRunner);

      const created = (await queryRunner.query(
        `SELECT column_name, column_default, is_nullable
         FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'users'
         ORDER BY column_name`,
      )) as Array<{
        column_name: string;
        column_default: string | null;
        is_nullable: string;
      }>;
      expect(created).toEqual(
        expect.arrayContaining([
          {
            column_name: 'refresh_token_family_id',
            column_default: null,
            is_nullable: 'YES',
          },
          {
            column_name: 'refresh_token_revoked_at',
            column_default: null,
            is_nullable: 'YES',
          },
          {
            column_name: 'security_version',
            column_default: '1',
            is_nullable: 'NO',
          },
        ]),
      );
      await expect(
        queryRunner.query(
          `INSERT INTO users (email, security_version) VALUES ('bad', 0)`,
        ),
      ).rejects.toThrow(/chk_users_security_version_positive/);

      await migration.down(queryRunner);
      await migration.up(queryRunner);
      const defaults = (await queryRunner.query(
        `INSERT INTO users (email) VALUES ('after-cycle')
         RETURNING security_version, refresh_token_family_id, refresh_token_revoked_at`,
      )) as Array<{
        security_version: number;
        refresh_token_family_id: string | null;
        refresh_token_revoked_at: Date | null;
      }>;
      expect(defaults).toEqual([
        {
          security_version: 1,
          refresh_token_family_id: null,
          refresh_token_revoked_at: null,
        },
      ]);
    });
  });

  it('fails closed on a pre-existing invalid security version without adding session columns', async () => {
    await withJwtSchema(async (queryRunner) => {
      await queryRunner.query(
        'ALTER TABLE users ADD COLUMN security_version integer NOT NULL DEFAULT 1',
      );
      await queryRunner.query(
        `INSERT INTO users (email, security_version) VALUES ('drift', 0)`,
      );

      await expect(
        new AddJwtSessionState1783000000000().up(queryRunner),
      ).rejects.toThrow(/chk_users_security_version_positive/);
      const sessionColumns = (await queryRunner.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'users'
           AND column_name LIKE 'refresh_token_%'`,
      )) as Array<{ column_name: string }>;
      expect(sessionColumns).toEqual([]);
    });
  });
});
