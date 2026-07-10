import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateProductionBatchHistory1781000000000 } from './1781000000000-CreateProductionBatchHistory';

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
  tenantRole: string;
}

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (context: IsolatedDatabaseContext) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });

  const suffix = randomUUID().replace(/-/g, '');
  const schema = `${schemaPrefix}_${suffix}`;
  const tenantRole = `${schemaPrefix}_role_${suffix}`;
  const queryRunner = dataSource.createQueryRunner();
  let isInitialized = false;

  try {
    await dataSource.initialize();
    isInitialized = true;
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`CREATE ROLE "${tenantRole}" NOLOGIN`);
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);

    await assertion({ queryRunner, schema, tenantRole });
  } finally {
    try {
      await queryRunner.query('RESET ROLE');
      await queryRunner.query('SET search_path TO public');
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await queryRunner.query(`DROP ROLE IF EXISTS "${tenantRole}"`);
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

async function grantTenantRoleAccess(
  queryRunner: QueryRunner,
  schema: string,
  tenantRole: string,
): Promise<void> {
  await queryRunner.query(
    `GRANT USAGE ON SCHEMA "${schema}" TO "${tenantRole}"`,
  );
  await queryRunner.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON production_batch_history TO "${tenantRole}"`,
  );
}

async function insertProductionHistory(
  queryRunner: QueryRunner,
  productionDocumentId: string,
  tenantId = 'tenant-a',
): Promise<void> {
  await queryRunner.query(
    `
      INSERT INTO production_batch_history (
        id,
        tenant_id,
        production_document_id,
        recipe_version_id,
        produced_insumo_id,
        produced_batch_number,
        produced_expiration_date,
        planned_quantity,
        actual_quantity,
        outcome,
        failure_reason,
        terminal_id,
        source_sequence,
        idempotency_key,
        payload_hash,
        total_consumed_cost_nio,
        produced_unit_cost_nio,
        movement_references,
        operation_date
      ) VALUES (
        gen_random_uuid(),
        $1,
        $2,
        'recipe-v1',
        'insumo-produced',
        'batch-001',
        '2026-07-10',
        10.0000,
        10.0000,
        'COMPLETED',
        NULL,
        'terminal-1',
        1001,
        $3,
        'hash-001',
        250.0000,
        25.0000,
        ARRAY['kardex-1'],
        '2026-07-10T10:00:00.000Z'
      )
    `,
    [tenantId, productionDocumentId, `key-${productionDocumentId}`],
  );
}

describe('CreateProductionBatchHistory1781000000000 (db)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'creates production_batch_history with RLS policies, indexes, and immutability trigger installed',
    async () => {
      const migration = new CreateProductionBatchHistory1781000000000();

      await withIsolatedSchema(
        'production_batch_history_shape',
        async ({ queryRunner }) => {
          await migration.up(queryRunner);

          const tableRows = (await queryRunner.query(`
            SELECT relrowsecurity, relforcerowsecurity
            FROM pg_class
            WHERE oid = 'production_batch_history'::regclass
          `)) as Array<{
            relrowsecurity: boolean;
            relforcerowsecurity: boolean;
          }>;

          expect(tableRows).toEqual([
            { relrowsecurity: true, relforcerowsecurity: true },
          ]);

          const policies = (await queryRunner.query(`
            SELECT policyname, cmd
            FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename = 'production_batch_history'
            ORDER BY policyname
          `)) as Array<{ policyname: string; cmd: string }>;

          expect(policies).toEqual([
            {
              policyname: 'production_batch_history_tenant_delete',
              cmd: 'DELETE',
            },
            {
              policyname: 'production_batch_history_tenant_insert',
              cmd: 'INSERT',
            },
            {
              policyname: 'production_batch_history_tenant_isolation',
              cmd: 'SELECT',
            },
            {
              policyname: 'production_batch_history_tenant_update',
              cmd: 'UPDATE',
            },
          ]);

          const indexes = (await queryRunner.query(`
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND tablename = 'production_batch_history'
            ORDER BY indexname
          `)) as Array<{ indexname: string }>;

          expect(indexes).toEqual([
            { indexname: 'idx_production_batch_history_tenant_operation' },
            { indexname: 'production_batch_history_pkey' },
            { indexname: 'uq_production_batch_history_document' },
            { indexname: 'uq_production_batch_history_source_sequence' },
          ]);

          const triggers = (await queryRunner.query(`
            SELECT tgname
            FROM pg_trigger
            WHERE tgrelid = 'production_batch_history'::regclass
              AND NOT tgisinternal
          `)) as Array<{ tgname: string }>;

          expect(triggers).toEqual([
            { tgname: 'trg_production_batch_history_immutable' },
          ]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'requires transaction-local app.tenant_id for tenant-scoped inserts and reads',
    async () => {
      const migration = new CreateProductionBatchHistory1781000000000();

      await withIsolatedSchema(
        'production_batch_history_rls',
        async ({ queryRunner, schema, tenantRole }) => {
          await migration.up(queryRunner);
          await grantTenantRoleAccess(queryRunner, schema, tenantRole);
          await queryRunner.startTransaction();

          try {
            await queryRunner.query(`SET LOCAL ROLE "${tenantRole}"`);
            await queryRunner.query(
              "SELECT set_config('app.tenant_id', $1, true)",
              ['tenant-a'],
            );

            await insertProductionHistory(queryRunner, 'document-a');

            await queryRunner.query('SAVEPOINT wrong_tenant_insert');
            await expect(
              insertProductionHistory(queryRunner, 'document-b', 'tenant-b'),
            ).rejects.toThrow(/row-level security|seguridad de registros/);
            await queryRunner.query(
              'ROLLBACK TO SAVEPOINT wrong_tenant_insert',
            );
            await queryRunner.query('RELEASE SAVEPOINT wrong_tenant_insert');

            const visibleRows = (await queryRunner.query(`
              SELECT tenant_id, production_document_id
              FROM production_batch_history
            `)) as Array<{
              tenant_id: string;
              production_document_id: string;
            }>;

            expect(visibleRows).toEqual([
              { tenant_id: 'tenant-a', production_document_id: 'document-a' },
            ]);

            await queryRunner.commitTransaction();
          } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
          }
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rejects UPDATE and DELETE through the immutability trigger for tenant-visible rows',
    async () => {
      const migration = new CreateProductionBatchHistory1781000000000();

      await withIsolatedSchema(
        'production_batch_history_immutable',
        async ({ queryRunner, schema, tenantRole }) => {
          await migration.up(queryRunner);
          await grantTenantRoleAccess(queryRunner, schema, tenantRole);
          await queryRunner.startTransaction();

          try {
            await queryRunner.query(`SET LOCAL ROLE "${tenantRole}"`);
            await queryRunner.query(
              "SELECT set_config('app.tenant_id', $1, true)",
              ['tenant-a'],
            );
            await insertProductionHistory(queryRunner, 'document-a');

            await queryRunner.query('SAVEPOINT update_attempt');
            await expect(
              queryRunner.query(`
                UPDATE production_batch_history
                SET produced_unit_cost_nio = 999.0000
                WHERE production_document_id = 'document-a'
              `),
            ).rejects.toThrow(
              'production_batch_history is immutable: UPDATE/DELETE are forbidden',
            );
            await queryRunner.query('ROLLBACK TO SAVEPOINT update_attempt');
            await queryRunner.query('RELEASE SAVEPOINT update_attempt');

            await queryRunner.query('SAVEPOINT delete_attempt');
            await expect(
              queryRunner.query(`
                DELETE FROM production_batch_history
                WHERE production_document_id = 'document-a'
              `),
            ).rejects.toThrow(
              'production_batch_history is immutable: UPDATE/DELETE are forbidden',
            );
            await queryRunner.query('ROLLBACK TO SAVEPOINT delete_attempt');
            await queryRunner.query('RELEASE SAVEPOINT delete_attempt');

            const rows = (await queryRunner.query(`
              SELECT production_document_id, produced_unit_cost_nio
              FROM production_batch_history
            `)) as Array<{
              production_document_id: string;
              produced_unit_cost_nio: string;
            }>;

            expect(rows).toEqual([
              {
                production_document_id: 'document-a',
                produced_unit_cost_nio: '25.0000',
              },
            ]);

            await queryRunner.commitTransaction();
          } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
          }
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'preserves audit rows and protections after down migration',
    async () => {
      const migration = new CreateProductionBatchHistory1781000000000();

      await withIsolatedSchema(
        'production_batch_history_down',
        async ({ queryRunner, schema, tenantRole }) => {
          await migration.up(queryRunner);
          await grantTenantRoleAccess(queryRunner, schema, tenantRole);
          await insertProductionHistory(queryRunner, 'document-a');

          await migration.down(queryRunner);

          const preservedRows = (await queryRunner.query(`
            SELECT production_document_id, produced_unit_cost_nio
            FROM production_batch_history
          `)) as Array<{
            production_document_id: string;
            produced_unit_cost_nio: string;
          }>;

          expect(preservedRows).toEqual([
            {
              production_document_id: 'document-a',
              produced_unit_cost_nio: '25.0000',
            },
          ]);

          await queryRunner.startTransaction();

          try {
            await queryRunner.query(`SET LOCAL ROLE "${tenantRole}"`);
            await queryRunner.query(
              "SELECT set_config('app.tenant_id', $1, true)",
              ['tenant-a'],
            );

            await queryRunner.query('SAVEPOINT down_update_attempt');
            await expect(
              queryRunner.query(`
                UPDATE production_batch_history
                SET produced_unit_cost_nio = 999.0000
                WHERE production_document_id = 'document-a'
              `),
            ).rejects.toThrow(
              'production_batch_history is immutable: UPDATE/DELETE are forbidden',
            );
            await queryRunner.query(
              'ROLLBACK TO SAVEPOINT down_update_attempt',
            );
            await queryRunner.query('RELEASE SAVEPOINT down_update_attempt');

            await queryRunner.commitTransaction();
          } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
          }
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
