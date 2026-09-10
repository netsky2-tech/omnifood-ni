import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { BohInventoryLedgerFoundation1766000000000 } from './1766000000000-BohInventoryLedgerFoundation';
import { AddSaleCorrelationIdToInventoryKardex1804000000000 } from './1804000000000-AddSaleCorrelationIdToInventoryKardex';

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
    throw new Error('DB_PORT must be a valid integer for DB-backed migration tests');
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
    await queryRunner.query(`SET search_path TO "${schema}", public`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);

    await assertion(queryRunner);
  } finally {
    try {
      await queryRunner.query('SET search_path TO public');
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch {
      // no-op: best-effort cleanup
    }

    if (queryRunner.isReleased === false) {
      await queryRunner.release();
    }
    if (isInitialized && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

describe('AddSaleCorrelationIdToInventoryKardex1804000000000 (db)', () => {
  const TEST_TIMEOUT_MS = 30000;
  const isDbTest = Boolean(process.env.DB_PASSWORD);
  const itDb = isDbTest ? it : it.skip;

  itDb(
    'creates column and index, rejects duplicate within tenant, allows across tenants and multiple nulls, and guards down migration',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const migration = new AddSaleCorrelationIdToInventoryKardex1804000000000();

      await withIsolatedSchema('kardex_sale_correlation', async (queryRunner) => {
        await foundation.up(queryRunner);
        await migration.up(queryRunner);

        // 1. Column and index verification
        const columnCheck: unknown = await queryRunner.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = 'inventory_kardex' AND column_name = 'sale_correlation_id'
        `);
        const columns = columnCheck as Array<{ column_name: string; data_type: string; is_nullable: string }>;
        expect(columns).toHaveLength(1);
        expect(columns[0].column_name).toBe('sale_correlation_id');
        expect(columns[0].is_nullable).toBe('YES');

        const indexCheck: unknown = await queryRunner.query(`
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE tablename = 'inventory_kardex' AND indexname = 'uq_inventory_kardex_sale_correlation'
        `);
        const indexes = indexCheck as Array<{ indexname: string; indexdef: string }>;
        expect(indexes).toHaveLength(1);
        expect(indexes[0].indexdef).toContain('WHERE (sale_correlation_id IS NOT NULL)');

        // 2. Insert valid correlated row for tenant-a
        await queryRunner.query(`
          INSERT INTO inventory_kardex (
            tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
            total_cost_nio, stock_before, stock_after, source_document_type,
            source_document_id, sale_correlation_id
          ) VALUES (
            'tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE', -1.0000, 10.0000,
            10.0000, 10.0000, 9.0000, 'INVOICE', 'inv-1', 'corr-alpha-001'
          )
        `);

        // 3. Duplicate correlation within tenant-a must fail
        await expect(
          queryRunner.query(`
            INSERT INTO inventory_kardex (
              tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
              total_cost_nio, stock_before, stock_after, source_document_type,
              source_document_id, sale_correlation_id
            ) VALUES (
              'tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE', -2.0000, 10.0000,
              20.0000, 9.0000, 7.0000, 'INVOICE', 'inv-2', 'corr-alpha-001'
            )
          `),
        ).rejects.toThrow(/duplicate key value violates unique constraint/i);

        // 4. Same correlation for tenant-b must succeed
        await queryRunner.query(`
          INSERT INTO inventory_kardex (
            tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
            total_cost_nio, stock_before, stock_after, source_document_type,
            source_document_id, sale_correlation_id
          ) VALUES (
            'tenant-b', '00000000-0000-0000-0000-000000000001', 'SALE', -1.0000, 10.0000,
            10.0000, 10.0000, 9.0000, 'INVOICE', 'inv-1b', 'corr-alpha-001'
          )
        `);

        // 5. Multiple null correlation rows in same tenant must succeed
        await queryRunner.query(`
          INSERT INTO inventory_kardex (
            tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
            total_cost_nio, stock_before, stock_after, source_document_type,
            source_document_id, sale_correlation_id
          ) VALUES
          ('tenant-a', '00000000-0000-0000-0000-000000000001', 'PURCHASE', 5.0000, 10.0000, 50.0000, 0.0000, 5.0000, 'PURCHASE', 'p-1', NULL),
          ('tenant-a', '00000000-0000-0000-0000-000000000001', 'PURCHASE', 3.0000, 10.0000, 30.0000, 5.0000, 8.0000, 'PURCHASE', 'p-2', NULL)
        `);

        // 6. Down migration refuses to remove evidence when correlated rows exist
        await expect(migration.down(queryRunner)).rejects.toThrow(
          'down migration forbidden: historical sale correlation evidence exists',
        );
      });
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'allows clean down migration when no historical correlation evidence exists',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const migration = new AddSaleCorrelationIdToInventoryKardex1804000000000();

      await withIsolatedSchema('kardex_sale_clean_down', async (queryRunner) => {
        await foundation.up(queryRunner);
        await migration.up(queryRunner);

        // Insert legacy rows with only null correlation
        await queryRunner.query(`
          INSERT INTO inventory_kardex (
            tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
            total_cost_nio, stock_before, stock_after, source_document_type,
            source_document_id, sale_correlation_id
          ) VALUES (
            'tenant-a', '00000000-0000-0000-0000-000000000001', 'PURCHASE', 5.0000, 10.0000,
            50.0000, 0.0000, 5.0000, 'PURCHASE', 'p-1', NULL
          )
        `);

        // Clean down migration must succeed because no non-null correlation exists
        await migration.down(queryRunner);

        const columnCheck: unknown = await queryRunner.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'inventory_kardex' AND column_name = 'sale_correlation_id'
        `);
        expect(columnCheck as unknown[]).toHaveLength(0);

        const indexCheck: unknown = await queryRunner.query(`
          SELECT indexname
          FROM pg_indexes
          WHERE tablename = 'inventory_kardex' AND indexname = 'uq_inventory_kardex_sale_correlation'
        `);
        expect(indexCheck as unknown[]).toHaveLength(0);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
