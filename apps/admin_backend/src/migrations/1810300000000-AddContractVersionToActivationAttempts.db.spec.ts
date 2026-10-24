import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { AddContractVersionToActivationAttempts1810300000000 } from './1810300000000-AddContractVersionToActivationAttempts';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for DB-backed migration tests`);
  }

  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);

  if (!Number.isInteger(port)) {
    throw new Error(
      'DB_PORT must be a valid integer for DB-backed migration tests',
    );
  }

  return port;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
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
      // no-op: cleanup is best effort when bootstrap fails
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

describe('AddContractVersionToActivationAttempts1810300000000 (db)', () => {
  const TEST_TIMEOUT_MS = 30000;

  const seedLegacyAttemptTable = async (
    queryRunner: QueryRunner,
  ): Promise<void> => {
    await queryRunner.query(`
      CREATE TABLE onboarding_activation_attempts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        onboarding_session_id uuid NOT NULL,
        candidate_terminal_id varchar(128) NOT NULL,
        status varchar(64) NOT NULL DEFAULT 'CREATED',
        started_by_user_id varchar(128) NOT NULL,
        started_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Two attempts created BEFORE #957: they were started under the
    // invoice-based (V1) contract.
    await queryRunner.query(`
      INSERT INTO onboarding_activation_attempts
        (tenant_id, onboarding_session_id, candidate_terminal_id, started_by_user_id)
      VALUES
        ('tenant-a', gen_random_uuid(), 'pos-a', 'user-1'),
        ('tenant-b', gen_random_uuid(), 'pos-b', 'user-1')
    `);

    await queryRunner.query(
      `ALTER TABLE onboarding_activation_attempts ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE onboarding_activation_attempts FORCE ROW LEVEL SECURITY`,
    );
  };

  const isForced = async (queryRunner: QueryRunner): Promise<boolean> => {
    const rows = (await queryRunner.query(
      `SELECT c.relforcerowsecurity AS forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relname = 'onboarding_activation_attempts'`,
    )) as Array<{ forced: boolean }>;
    return rows.length > 0 && rows[0].forced === true;
  };

  it(
    'backfills in-flight attempts to V1, defaults new attempts to V2, and keeps FORCE RLS',
    async () => {
      await withIsolatedSchema('actver_up', async (queryRunner) => {
        await seedLegacyAttemptTable(queryRunner);
        expect(await isForced(queryRunner)).toBe(true);

        await new AddContractVersionToActivationAttempts1810300000000().up(
          queryRunner,
        );

        const legacy = (await queryRunner.query(
          `SELECT DISTINCT contract_version FROM onboarding_activation_attempts`,
        )) as Array<{ contract_version: number }>;
        expect(legacy).toHaveLength(1);
        expect(legacy[0].contract_version).toBe(1);

        // A new attempt (no explicit version) is invoice-free by default.
        await queryRunner.query(`
          INSERT INTO onboarding_activation_attempts
            (tenant_id, onboarding_session_id, candidate_terminal_id, started_by_user_id)
          VALUES ('tenant-c', gen_random_uuid(), 'pos-c', 'user-1')
        `);
        const fresh = (await queryRunner.query(
          `SELECT contract_version FROM onboarding_activation_attempts WHERE tenant_id = 'tenant-c'`,
        )) as Array<{ contract_version: number }>;
        expect(fresh[0].contract_version).toBe(2);

        // The migration must not leave the table unprotected.
        expect(await isForced(queryRunner)).toBe(true);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'down removes the column and restores FORCE RLS',
    async () => {
      await withIsolatedSchema('actver_down', async (queryRunner) => {
        await seedLegacyAttemptTable(queryRunner);
        const migration =
          new AddContractVersionToActivationAttempts1810300000000();
        await migration.up(queryRunner);
        await migration.down(queryRunner);

        const columns = (await queryRunner.query(
          `SELECT column_name
             FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'onboarding_activation_attempts'
              AND column_name = 'contract_version'`,
        )) as Array<{ column_name: string }>;
        expect(columns).toHaveLength(0);
        expect(await isForced(queryRunner)).toBe(true);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
