import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';

import { CreateProductionBatchHistory1781000000000 } from '../../migrations/1781000000000-CreateProductionBatchHistory';
import { CreateOnboardingCoreTables1796000000000 } from '../../migrations/1796000000000-CreateOnboardingCoreTables';
import { TENANT_RLS_PREDICATE } from './tenant-rls-policy';
import {
  evaluateTenantRlsCoverage,
  parseManifestText,
  type ParsedTenantRlsManifest,
  type TenantRlsCatalogTable,
} from './tenant-rls-coverage';

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

interface IsolatedDatabaseContext {
  queryRunner: QueryRunner;
  schema: string;
}

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (context: IsolatedDatabaseContext) => Promise<void>,
): Promise<void> {
  const suffix = randomUUID().replace(/-/g, '');
  const schema = `${schemaPrefix}_${suffix}`;
  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
    // Bind TypeORM's own table API (used by API-style migrations) to the
    // scratch schema, so hasTable/createTable cannot see same-named tables in
    // the dev database's public schema. Raw SQL keeps resolving through the
    // search_path set below, which points at the same scratch schema.
    schema,
  });
  const queryRunner = dataSource.createQueryRunner();
  let isInitialized = false;

  try {
    await dataSource.initialize();
    isInitialized = true;
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);

    await assertion({ queryRunner, schema });
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

/**
 * Build the fixture tables the way production builds them: by running the
 * actual migration classes, never by synchronizing an entity model.
 */
async function runFixtureMigrations(queryRunner: QueryRunner): Promise<void> {
  await new CreateOnboardingCoreTables1796000000000().up(queryRunner);
  await new CreateProductionBatchHistory1781000000000().up(queryRunner);
}

/**
 * Collect the coverage gate's input for the CURRENT schema (this spec always
 * inspects its own random scratch schema, never a hard-coded public), using
 * the same structural facts the shell verifier collects for public.
 */
async function collectCatalogTables(
  queryRunner: QueryRunner,
): Promise<TenantRlsCatalogTable[]> {
  const rows = (await queryRunner.query(`
    SELECT
      c.relname AS name,
      EXISTS (
        SELECT 1
        FROM information_schema.columns col
        WHERE col.table_schema = current_schema()
          AND col.table_name = c.relname
          AND col.column_name = 'tenant_id'
      ) AS has_tenant_id_column,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced,
      (
        SELECT count(*)
        FROM pg_policies p
        WHERE p.schemaname = current_schema()
          AND p.tablename = c.relname
      ) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relkind = 'r'
    ORDER BY c.relname
  `)) as Array<{
    name: string;
    has_tenant_id_column: boolean;
    rls_enabled: boolean;
    rls_forced: boolean;
    policy_count: string;
  }>;

  return rows.map((row) => ({
    name: row.name,
    hasTenantIdColumn: row.has_tenant_id_column === true,
    rlsEnabled: row.rls_enabled === true,
    rlsForced: row.rls_forced === true,
    policyCount: Number(row.policy_count),
  }));
}

/**
 * The classification manifest under test. Every migration-built fixture table
 * is classified: the two onboarding tables currently carry tenant isolation
 * debt (tenant_id present, no ENABLE/FORCE/policies), so they are explicit
 * temporary `debt` ratchet entries; production_batch_history is `direct`.
 */
function fixtureManifest(): ParsedTenantRlsManifest {
  return parseManifestText(
    [
      '# reviewed fixture manifest',
      'production_batch_history|direct',
      'onboarding_sessions|debt',
      'onboarding_idempotency_records|debt',
    ].join('\n'),
  );
}

describe('tenant RLS coverage gate (migration-built schema)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'classifies every migration-built fixture table with no gate failures',
    async () => {
      await withIsolatedSchema('rls_coverage_gate', async ({ queryRunner }) => {
        await runFixtureMigrations(queryRunner);

        const tables = await collectCatalogTables(queryRunner);
        const fixtureTableNames = tables.map((table) => table.name).sort();

        // The migrations built exactly these fixture tables plus nothing else.
        expect(fixtureTableNames).toEqual([
          'onboarding_idempotency_records',
          'onboarding_sessions',
          'production_batch_history',
        ]);

        const result = evaluateTenantRlsCoverage(fixtureManifest(), tables);

        expect(result.failures).toEqual([]);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rejects a synthetic unclassified tenant table by name',
    async () => {
      await withIsolatedSchema(
        'rls_cov_unclassified',
        async ({ queryRunner }) => {
          await queryRunner.query(`
          CREATE TABLE smuggled_tenant_table (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL
          )
        `);

          const tables = await collectCatalogTables(queryRunner);
          const result = evaluateTenantRlsCoverage(
            parseManifestText(''),
            tables,
          );

          expect(result.failures).toEqual([
            {
              kind: 'unclassified-table',
              table: 'smuggled_tenant_table',
              detail: 'public base table has no classification entry',
            },
          ]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'accepts an approved synthetic global table and rejects tenant-bearing exceptions',
    async () => {
      await withIsolatedSchema('rls_cov_global', async ({ queryRunner }) => {
        await queryRunner.query(`
          CREATE TABLE platform_registry (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL
          )
        `);
        await queryRunner.query(`
          CREATE TABLE misclassified_global (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL
          )
        `);

        const tables = await collectCatalogTables(queryRunner);
        const result = evaluateTenantRlsCoverage(
          parseManifestText(
            ['platform_registry|global', 'misclassified_global|global'].join(
              '\n',
            ),
          ),
          tables,
        );

        expect(result.failures).toEqual([
          {
            kind: 'tenant-bearing-global',
            table: 'misclassified_global',
            detail:
              'declares tenant_id but is classified global; global tables must be pre-tenant or platform infrastructure',
          },
        ]);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rejects a tenant-bearing table classified parent-owned and a direct table without a tenant column',
    async () => {
      await withIsolatedSchema('rls_cov_parent', async ({ queryRunner }) => {
        await queryRunner.query(`
          CREATE TABLE misclassified_parent_owned (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL
          )
        `);
        await queryRunner.query(`
          CREATE TABLE direct_without_tenant (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            payload text NOT NULL
          )
        `);

        const tables = await collectCatalogTables(queryRunner);
        const result = evaluateTenantRlsCoverage(
          parseManifestText(
            [
              'misclassified_parent_owned|parent-owned',
              'direct_without_tenant|direct',
            ].join('\n'),
          ),
          tables,
        );

        expect(result.failures).toEqual([
          {
            kind: 'direct-without-tenant-column',
            table: 'direct_without_tenant',
            detail:
              'classified direct but declares no tenant_id column; use parent-owned or global with a reviewed reason',
          },
          {
            kind: 'tenant-bearing-parent-owned',
            table: 'misclassified_parent_owned',
            detail:
              'declares tenant_id but is classified parent-owned; parent-owned tables must have no direct tenant column',
          },
        ]);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rejects a stale debt entry once the table becomes fully tenant-protected',
    async () => {
      await withIsolatedSchema(
        'rls_cov_stale_debt',
        async ({ queryRunner }) => {
          await queryRunner.query(`
          CREATE TABLE promoted_debt_table (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL
          )
        `);
          await queryRunner.query(
            'ALTER TABLE promoted_debt_table ENABLE ROW LEVEL SECURITY',
          );
          await queryRunner.query(
            'ALTER TABLE promoted_debt_table FORCE ROW LEVEL SECURITY',
          );
          await queryRunner.query(`
          CREATE POLICY promoted_debt_table_tenant_isolation
            ON promoted_debt_table
            USING (${TENANT_RLS_PREDICATE})
            WITH CHECK (${TENANT_RLS_PREDICATE})
        `);

          const tables = await collectCatalogTables(queryRunner);
          expect(
            tables.find((table) => table.name === 'promoted_debt_table'),
          ).toEqual({
            name: 'promoted_debt_table',
            hasTenantIdColumn: true,
            rlsEnabled: true,
            rlsForced: true,
            policyCount: 1,
          });

          const result = evaluateTenantRlsCoverage(
            parseManifestText('promoted_debt_table|debt'),
            tables,
          );

          expect(result.failures).toEqual([
            {
              kind: 'debt-fully-protected-stale',
              table: 'promoted_debt_table',
              detail:
                'debt entry is now fully tenant-protected (tenant_id, ENABLE, FORCE, and at least one policy); promote it to direct and delete the debt entry',
            },
          ]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
