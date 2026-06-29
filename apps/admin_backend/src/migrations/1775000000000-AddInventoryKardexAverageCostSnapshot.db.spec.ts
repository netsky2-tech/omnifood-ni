import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { BohInventoryLedgerFoundation1766000000000 } from './1766000000000-BohInventoryLedgerFoundation';
import { EnforceInventoryKardexImmutability1773000000000 } from './1773000000000-EnforceInventoryKardexImmutability';
import { EnforceInventoryKardexRunningBalance1774000000000 } from './1774000000000-EnforceInventoryKardexRunningBalance';
import { AddInventoryKardexAverageCostSnapshot1775000000000 } from './1775000000000-AddInventoryKardexAverageCostSnapshot';

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

describe('AddInventoryKardexAverageCostSnapshot1775000000000 (db)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'keeps append-only and running-balance slices compatible while freezing average cost per insert',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const immutability =
        new EnforceInventoryKardexImmutability1773000000000();
      const runningBalance =
        new EnforceInventoryKardexRunningBalance1774000000000();
      const migration =
        new AddInventoryKardexAverageCostSnapshot1775000000000();

      await withIsolatedSchema(
        'inventory_kardex_average_cost_snapshot',
        async (queryRunner) => {
          await foundation.up(queryRunner);
          await immutability.up(queryRunner);
          await runningBalance.up(queryRunner);
          await migration.up(queryRunner);

          await queryRunner.query(`
            INSERT INTO inventory_kardex (
              tenant_id,
              insumo_id,
              movement_type,
              quantity,
              unit_cost_nio,
              total_cost_nio,
              stock_before,
              stock_after,
              average_cost_after_nio,
              source_document_type,
              source_document_id
            ) VALUES (
              'tenant-a',
              '00000000-0000-0000-0000-000000000001',
              'PURCHASE',
              5.0000,
              10.0000,
              50.0000,
              0.0000,
              5.0000,
              10.0000,
              'PURCHASE_INVOICE',
              'invoice-1'
            )
          `);

          await queryRunner.query(`
            INSERT INTO inventory_kardex (
              tenant_id,
              insumo_id,
              movement_type,
              quantity,
              unit_cost_nio,
              total_cost_nio,
              stock_before,
              stock_after,
              average_cost_after_nio,
              source_document_type,
              source_document_id
            ) VALUES (
              'tenant-a',
              '00000000-0000-0000-0000-000000000001',
              'SALE',
              -2.0000,
              10.0000,
              20.0000,
              5.0000,
              3.0000,
              10.0000,
              'SALE',
              'sale-1'
            )
          `);

          await expect(
            queryRunner.query(`
              UPDATE inventory_kardex
              SET average_cost_after_nio = 99.0000
              WHERE source_document_id = 'invoice-1'
            `),
          ).rejects.toThrow('append-only');

          const rowsResult: unknown = await queryRunner.query(`
            SELECT source_document_id, stock_after, average_cost_after_nio
            FROM inventory_kardex
            ORDER BY id
          `);

          const rows = rowsResult as Array<{
            source_document_id: string;
            stock_after: string;
            average_cost_after_nio: string;
          }>;

          expect(rows).toEqual([
            {
              source_document_id: 'invoice-1',
              stock_after: '5.0000',
              average_cost_after_nio: '10.0000',
            },
            {
              source_document_id: 'sale-1',
              stock_after: '3.0000',
              average_cost_after_nio: '10.0000',
            },
          ]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
