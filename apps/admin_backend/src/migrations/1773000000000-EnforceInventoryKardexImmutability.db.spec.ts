import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { BohInventoryLedgerFoundation1766000000000 } from './1766000000000-BohInventoryLedgerFoundation';
import { EnforceInventoryKardexImmutability1773000000000 } from './1773000000000-EnforceInventoryKardexImmutability';

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

describe('EnforceInventoryKardexImmutability1773000000000 (db)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'rejects UPDATE and DELETE on inventory_kardex while preserving the original row',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const migration = new EnforceInventoryKardexImmutability1773000000000();

      await withIsolatedSchema(
        'inventory_kardex_immutability',
        async (queryRunner) => {
          await foundation.up(queryRunner);
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
              'PURCHASE_INVOICE',
              'invoice-1'
            )
          `);

          await expect(
            queryRunner.query(`
              UPDATE inventory_kardex
              SET stock_after = 999.0000
              WHERE source_document_id = 'invoice-1'
            `),
          ).rejects.toThrow('append-only');

          await expect(
            queryRunner.query(`
              DELETE FROM inventory_kardex
              WHERE source_document_id = 'invoice-1'
            `),
          ).rejects.toThrow('append-only');

          const rowsResult: unknown = await queryRunner.query(`
            SELECT source_document_id, stock_after
            FROM inventory_kardex
            WHERE source_document_id = 'invoice-1'
          `);

          const rows = rowsResult as Array<{
            source_document_id: string;
            stock_after: string;
          }>;

          expect(rows).toEqual([
            { source_document_id: 'invoice-1', stock_after: '5.0000' },
          ]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'keeps INSERT append-compatible with the inventory_kardex immutability trigger installed',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const migration = new EnforceInventoryKardexImmutability1773000000000();

      await withIsolatedSchema(
        'inventory_kardex_insert',
        async (queryRunner) => {
          await foundation.up(queryRunner);
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
            source_document_type,
            source_document_id
          ) VALUES
          (
            'tenant-a',
            '00000000-0000-0000-0000-000000000001',
            'PURCHASE',
            5.0000,
            10.0000,
            50.0000,
            0.0000,
            5.0000,
            'PURCHASE_INVOICE',
            'invoice-1'
          ),
          (
            'tenant-a',
            '00000000-0000-0000-0000-000000000001',
            'ADJUSTMENT',
            -1.0000,
            10.0000,
            -10.0000,
            5.0000,
            4.0000,
            'COUNT_SESSION',
            'count-1'
          )
        `);

          const countRowsResult: unknown = await queryRunner.query(`
          SELECT COUNT(*)::int AS total
          FROM inventory_kardex
        `);

          const countRows = countRowsResult as Array<{ total: number }>;
          expect(countRows).toEqual([{ total: 2 }]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
