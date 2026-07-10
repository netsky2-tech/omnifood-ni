import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateInventoryPurchaseDocuments1776000000000 } from './1776000000000-CreateInventoryPurchaseDocuments';

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

describe('CreateInventoryPurchaseDocuments1776000000000 (db)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'enforces tenant-scoped uniqueness for supplier invoice numbers',
    async () => {
      const migration = new CreateInventoryPurchaseDocuments1776000000000();

      await withIsolatedSchema(
        'inventory_purchase_documents',
        async (queryRunner) => {
          await migration.up(queryRunner);
          await queryRunner.startTransaction();

          try {
            await queryRunner.query(
              "SELECT set_config('app.tenant_id', $1, true)",
              ['tenant-a'],
            );
            await queryRunner.query(`
              INSERT INTO inventory_purchase_documents (
                id,
                tenant_id,
                insumo_id,
                supplier_id,
                invoice_number,
                invoice_date,
                entry_date,
                entry_timestamp,
                quantity,
                unit_cost,
                currency,
                bcn_rate,
                unit_cost_nio,
                projected_cpp_nio
              ) VALUES (
                'purchase-a-1',
                'tenant-a',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-0000000000a1',
                'INV-1001',
                '2026-01-10',
                '2026-01-10',
                '2026-01-10T08:00:00.000Z',
                2.0000,
                10.0000,
                'USD',
                36.5000,
                365.0000,
                365.0000
              )
            `);

            await queryRunner.query('SAVEPOINT duplicate_invoice_attempt');
            await expect(
              queryRunner.query(`
                INSERT INTO inventory_purchase_documents (
                  id,
                  tenant_id,
                  insumo_id,
                  supplier_id,
                  invoice_number,
                  invoice_date,
                  entry_date,
                  entry_timestamp,
                  quantity,
                  unit_cost,
                  currency,
                  bcn_rate,
                  unit_cost_nio,
                  projected_cpp_nio
                ) VALUES (
                  'purchase-a-2',
                  'tenant-a',
                  '00000000-0000-0000-0000-000000000001',
                  '00000000-0000-0000-0000-0000000000a1',
                  'INV-1001',
                  '2026-01-10',
                  '2026-01-10',
                  '2026-01-10T09:00:00.000Z',
                  3.0000,
                  10.0000,
                  'USD',
                  36.5000,
                  365.0000,
                  365.0000
                )
              `),
            ).rejects.toThrow(
              'uq_inventory_purchase_documents_tenant_supplier_invoice',
            );
            await queryRunner.query(
              'ROLLBACK TO SAVEPOINT duplicate_invoice_attempt',
            );
            await queryRunner.query(
              'RELEASE SAVEPOINT duplicate_invoice_attempt',
            );

            const tenantARows = (await queryRunner.query(`
              SELECT tenant_id, invoice_number
              FROM inventory_purchase_documents
              ORDER BY tenant_id
            `)) as Array<{ tenant_id: string; invoice_number: string }>;

            expect(tenantARows).toEqual([
              { tenant_id: 'tenant-a', invoice_number: 'INV-1001' },
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
});
