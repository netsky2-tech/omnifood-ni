import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { BohInventoryLedgerFoundation1766000000000 } from './1766000000000-BohInventoryLedgerFoundation';
import { AddDeterministicSyncSequencing1780000000000 } from './1780000000000-AddDeterministicSyncSequencing';

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
      // Best-effort cleanup when bootstrap fails.
    }

    try {
      await queryRunner.release();
    } catch {
      // Query runner may not be connected on bootstrap errors.
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
  await queryRunner.query(`
    GRANT SELECT, INSERT, UPDATE ON inventory_sync_outbox TO "${tenantRole}"
  `);
  await queryRunner.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_sync_receipts TO "${tenantRole}"
  `);
  await queryRunner.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_kardex TO "${tenantRole}"
  `);
  await queryRunner.query(
    `GRANT USAGE, SELECT ON SEQUENCE inventory_kardex_id_seq TO "${tenantRole}"`,
  );
}

async function expectMutationDenied(
  queryRunner: QueryRunner,
  sql: string,
): Promise<void> {
  await expect(queryRunner.query(sql)).rejects.toThrow(
    /append-only|row-level security|seguridad de registros|permission denied|permiso denegado/,
  );
}

describe('AddDeterministicSyncSequencing1780000000000 (db)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'requires app.tenant_id for tenant-scoped sync and ledger inserts and reads',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const migration = new AddDeterministicSyncSequencing1780000000000();

      await withIsolatedSchema(
        'sync_ledger_rls',
        async ({ queryRunner, schema, tenantRole }) => {
          await foundation.up(queryRunner);
          await migration.up(queryRunner);
          await grantTenantRoleAccess(queryRunner, schema, tenantRole);

          await queryRunner.startTransaction();
          try {
            await queryRunner.query(`SET LOCAL ROLE "${tenantRole}"`);
            await queryRunner.query(
              "SELECT set_config('app.tenant_id', $1, true)",
              ['tenant-a'],
            );

            await queryRunner.query(`
              INSERT INTO inventory_sync_outbox (
                tenant_id, idempotency_key, source_device_id, source_sequence,
                document_type, payload, flow_type, payload_hash
              ) VALUES (
                'tenant-a', 'outbox-a', 'terminal-a', 1,
                'PRODUCTION_CLOSE', '{"id":"outbox-a"}'::jsonb,
                'production', 'hash-a'
              )
            `);
            await queryRunner.query(`
              INSERT INTO inventory_sync_receipts (
                tenant_id, idempotency_key, source_device_id, source_sequence,
                payload_hash, flow_type
              ) VALUES (
                'tenant-a', 'receipt-a', 'terminal-a', 1, 'hash-a', 'production'
              )
            `);
            await queryRunner.query(`
              INSERT INTO inventory_kardex (
                tenant_id, insumo_id, movement_type, quantity,
                unit_cost_nio, total_cost_nio, stock_before, stock_after,
                source_document_type, source_document_id
              ) VALUES (
                'tenant-a', '00000000-0000-0000-0000-000000000001',
                'PRODUCTION', 1.0000, 10.0000, 10.0000, 0.0000, 1.0000,
                'PRODUCTION_CLOSE', 'document-a'
              )
            `);

            await queryRunner.query('SAVEPOINT wrong_tenant_insert');
            await expect(
              queryRunner.query(`
                INSERT INTO inventory_sync_receipts (
                  tenant_id, idempotency_key, source_device_id, source_sequence,
                  payload_hash, flow_type
                ) VALUES (
                  'tenant-b', 'receipt-b', 'terminal-b', 1, 'hash-b', 'production'
                )
              `),
            ).rejects.toThrow(/row-level security|seguridad de registros/);
            await queryRunner.query(
              'ROLLBACK TO SAVEPOINT wrong_tenant_insert',
            );
            await queryRunner.query('RELEASE SAVEPOINT wrong_tenant_insert');

            await queryRunner.query('RESET ROLE');
            await queryRunner.query(`SET LOCAL ROLE "${tenantRole}"`);
            await queryRunner.query(
              "SELECT set_config('app.tenant_id', $1, true)",
              ['tenant-b'],
            );

            const invisibleRows = (await queryRunner.query(`
              SELECT id FROM inventory_kardex
            `)) as Array<{ id: string }>;
            expect(invisibleRows).toEqual([]);

            await queryRunner.query(
              "SELECT set_config('app.tenant_id', $1, true)",
              ['tenant-a'],
            );
            const visibleRows = (await queryRunner.query(`
              SELECT source_document_id FROM inventory_kardex
            `)) as Array<{ source_document_id: string }>;
            expect(visibleRows).toEqual([{ source_document_id: 'document-a' }]);

            await queryRunner.query('SAVEPOINT receipt_update_denied');
            await expectMutationDenied(
              queryRunner,
              `UPDATE inventory_sync_receipts
               SET payload_hash = 'mutated'
               WHERE idempotency_key = 'receipt-a'`,
            );
            await queryRunner.query(
              'ROLLBACK TO SAVEPOINT receipt_update_denied',
            );
            await queryRunner.query('RELEASE SAVEPOINT receipt_update_denied');

            await queryRunner.query('SAVEPOINT receipt_delete_denied');
            await expectMutationDenied(
              queryRunner,
              `DELETE FROM inventory_sync_receipts
               WHERE idempotency_key = 'receipt-a'`,
            );
            await queryRunner.query(
              'ROLLBACK TO SAVEPOINT receipt_delete_denied',
            );
            await queryRunner.query('RELEASE SAVEPOINT receipt_delete_denied');

            await queryRunner.query('SAVEPOINT kardex_update_denied');
            await expectMutationDenied(
              queryRunner,
              `UPDATE inventory_kardex
               SET quantity = 2.0000
               WHERE source_document_id = 'document-a'`,
            );
            await queryRunner.query(
              'ROLLBACK TO SAVEPOINT kardex_update_denied',
            );
            await queryRunner.query('RELEASE SAVEPOINT kardex_update_denied');

            await queryRunner.query('SAVEPOINT kardex_delete_denied');
            await expectMutationDenied(
              queryRunner,
              `DELETE FROM inventory_kardex
               WHERE source_document_id = 'document-a'`,
            );
            await queryRunner.query(
              'ROLLBACK TO SAVEPOINT kardex_delete_denied',
            );
            await queryRunner.query('RELEASE SAVEPOINT kardex_delete_denied');

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
    'blocks owner-level UPDATE and DELETE on append-only replay tables',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const migration = new AddDeterministicSyncSequencing1780000000000();

      await withIsolatedSchema(
        'sync_ledger_append_only',
        async ({ queryRunner }) => {
          await foundation.up(queryRunner);
          await migration.up(queryRunner);

          await queryRunner.query(`
            INSERT INTO inventory_sync_receipts (
              tenant_id, idempotency_key, source_device_id, source_sequence,
              payload_hash, flow_type
            ) VALUES (
              'tenant-a', 'receipt-owner', 'terminal-a', 1, 'hash-a', 'production'
            )
          `);
          await queryRunner.query(`
            INSERT INTO inventory_kardex (
              tenant_id, insumo_id, movement_type, quantity,
              unit_cost_nio, total_cost_nio, stock_before, stock_after,
              source_document_type, source_document_id
            ) VALUES (
              'tenant-a', '00000000-0000-0000-0000-000000000001',
              'PRODUCTION', 1.0000, 10.0000, 10.0000, 0.0000, 1.0000,
              'PRODUCTION_CLOSE', 'document-owner'
            )
          `);

          await expectMutationDenied(
            queryRunner,
            `UPDATE inventory_sync_receipts
             SET payload_hash = 'mutated'
             WHERE idempotency_key = 'receipt-owner'`,
          );
          await expectMutationDenied(
            queryRunner,
            `DELETE FROM inventory_sync_receipts
             WHERE idempotency_key = 'receipt-owner'`,
          );
          await expectMutationDenied(
            queryRunner,
            `UPDATE inventory_kardex
             SET quantity = 2.0000
             WHERE source_document_id = 'document-owner'`,
          );
          await expectMutationDenied(
            queryRunner,
            `DELETE FROM inventory_kardex
             WHERE source_document_id = 'document-owner'`,
          );
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
