import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { BohInventoryLedgerFoundation1766000000000 } from './1766000000000-BohInventoryLedgerFoundation';
import { EnforceInventoryKardexImmutability1773000000000 } from './1773000000000-EnforceInventoryKardexImmutability';
import { EnforceInventoryKardexRunningBalance1774000000000 } from './1774000000000-EnforceInventoryKardexRunningBalance';

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

interface IsolatedSchemaContext {
  dataSource: DataSource;
  queryRunner: QueryRunner;
  schema: string;
}

async function createScopedQueryRunner(
  dataSource: DataSource,
  schema: string,
): Promise<QueryRunner> {
  const queryRunner = dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.query(`SET search_path TO "${schema}"`);
  await queryRunner.query(`SET statement_timeout TO '15000ms'`);

  return queryRunner;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (context: IsolatedSchemaContext) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });

  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let queryRunner: QueryRunner | null = null;
  let isInitialized = false;

  try {
    await dataSource.initialize();
    isInitialized = true;
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);

    await assertion({ dataSource, queryRunner, schema });
  } finally {
    try {
      if (queryRunner) {
        await queryRunner.query('SET search_path TO public');
        await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    } catch {
      // no-op: cleanup is best effort when bootstrap fails
    }

    try {
      if (queryRunner) {
        await queryRunner.release();
      }
    } catch {
      // no-op: query runner may not be connected on bootstrap errors
    }

    if (isInitialized) {
      await dataSource.destroy();
    }
  }
}

describe('EnforceInventoryKardexRunningBalance1774000000000 (db)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'accepts coherent sequences and keeps stock_after aligned with the historical running balance per insumo',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const migration = new EnforceInventoryKardexRunningBalance1774000000000();

      await withIsolatedSchema(
        'inventory_kardex_balance_ok',
        async ({ queryRunner }) => {
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
            2.5000,
            12.0000,
            30.0000,
            4.0000,
            6.5000,
            'PURCHASE_INVOICE',
            'invoice-2'
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
            source_document_type,
            source_document_id
          ) VALUES (
            'tenant-a',
            '00000000-0000-0000-0000-000000000002',
            'PURCHASE',
            3.0000,
            8.0000,
            24.0000,
            0.0000,
            3.0000,
            'PURCHASE_INVOICE',
            'invoice-3'
          )
        `);

          const rowsResult: unknown = await queryRunner.query(`
          SELECT
            source_document_id,
            stock_after,
            SUM(quantity) OVER (
              PARTITION BY tenant_id, insumo_id
              ORDER BY id
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS running_balance
          FROM inventory_kardex
          WHERE tenant_id = 'tenant-a'
          ORDER BY id
        `);

          const rows = rowsResult as Array<{
            source_document_id: string;
            stock_after: string;
            running_balance: string;
          }>;

          expect(rows).toEqual([
            {
              source_document_id: 'invoice-1',
              stock_after: '5.0000',
              running_balance: '5.0000',
            },
            {
              source_document_id: 'count-1',
              stock_after: '4.0000',
              running_balance: '4.0000',
            },
            {
              source_document_id: 'invoice-2',
              stock_after: '6.5000',
              running_balance: '6.5000',
            },
            {
              source_document_id: 'invoice-3',
              stock_after: '3.0000',
              running_balance: '3.0000',
            },
          ]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'fails migration when existing kardex history already contains a broken running balance',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const migration = new EnforceInventoryKardexRunningBalance1774000000000();

      await withIsolatedSchema(
        'inventory_kardex_balance_dirty_history',
        async ({ queryRunner }) => {
          await foundation.up(queryRunner);

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
                99.0000,
                'COUNT_SESSION',
                'count-1'
              )
          `);

          await expect(migration.up(queryRunner)).rejects.toThrow(
            'Cannot install inventory_kardex running balance invariant',
          );
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rejects inserts whose stock_before diverges from the latest persisted stock_after',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const migration = new EnforceInventoryKardexRunningBalance1774000000000();

      await withIsolatedSchema(
        'inventory_kardex_balance_rejects_stock_before',
        async ({ queryRunner }) => {
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
                2.0000,
                10.0000,
                20.0000,
                4.0000,
                6.0000,
                'PURCHASE_INVOICE',
                'invoice-2'
              )
            `),
          ).rejects.toThrow('stock_before');
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rejects inserts whose stored post-movement balance diverges from the running balance',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const migration = new EnforceInventoryKardexRunningBalance1774000000000();

      await withIsolatedSchema(
        'inventory_kardex_balance_rejects',
        async ({ queryRunner }) => {
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
                2.0000,
                10.0000,
                20.0000,
                5.0000,
                8.0000,
                'PURCHASE_INVOICE',
                'invoice-2'
              )
            `),
          ).rejects.toThrow('balance invariant violated');

          const countRowsResult: unknown = await queryRunner.query(`
            SELECT COUNT(*)::int AS total
            FROM inventory_kardex
          `);

          const countRows = countRowsResult as Array<{ total: number }>;
          expect(countRows).toEqual([{ total: 1 }]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'preserves append-only UPDATE/DELETE rejection when the balance trigger is installed',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const immutability =
        new EnforceInventoryKardexImmutability1773000000000();
      const balance = new EnforceInventoryKardexRunningBalance1774000000000();

      await withIsolatedSchema(
        'inventory_kardex_balance_append_only',
        async ({ queryRunner }) => {
          await foundation.up(queryRunner);
          await immutability.up(queryRunner);
          await balance.up(queryRunner);

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

          await expect(
            queryRunner.query(`
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
                'ADJUSTMENT',
                -1.0000,
                10.0000,
                -10.0000,
                5.0000,
                4.0000,
                'COUNT_SESSION',
                'count-1'
              )
            `),
          ).resolves.toBeDefined();
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'serializes concurrent inserts for the same tenant and insumo so stale baselines cannot bypass the invariant',
    async () => {
      const foundation = new BohInventoryLedgerFoundation1766000000000();
      const migration = new EnforceInventoryKardexRunningBalance1774000000000();

      await withIsolatedSchema(
        'inventory_kardex_balance_concurrent',
        async ({ dataSource, queryRunner, schema }) => {
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

          const writerA = await createScopedQueryRunner(dataSource, schema);
          const writerB = await createScopedQueryRunner(dataSource, schema);

          try {
            await writerA.startTransaction();
            await writerB.startTransaction();

            await writerA.query(`
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

            const staleInsert = writerB
              .query(
                `
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
                2.0000,
                10.0000,
                20.0000,
                5.0000,
                7.0000,
                'PURCHASE_INVOICE',
                'invoice-2'
              )
            `,
              )
              .then(
                () => ({ status: 'resolved' as const }),
                (error: Error) => ({ status: 'rejected' as const, error }),
              );

            await wait(250);
            const pendingState = await Promise.race([
              staleInsert.then(() => 'settled' as const),
              wait(50).then(() => 'pending' as const),
            ]);
            expect(pendingState).toBe('pending');

            await writerA.commitTransaction();

            const staleResult = await staleInsert;
            expect(staleResult.status).toBe('rejected');
            if (staleResult.status === 'rejected') {
              expect(String(staleResult.error.message)).toContain(
                'balance invariant violated',
              );
            }

            await expect(
              writerB.rollbackTransaction(),
            ).resolves.toBeUndefined();

            const rowsResult: unknown = await queryRunner.query(`
              SELECT source_document_id, stock_after
              FROM inventory_kardex
              ORDER BY id
            `);

            const rows = rowsResult as Array<{
              source_document_id: string;
              stock_after: string;
            }>;

            expect(rows).toEqual([
              { source_document_id: 'invoice-1', stock_after: '5.0000' },
              { source_document_id: 'count-1', stock_after: '4.0000' },
            ]);
          } finally {
            try {
              if (writerA.isTransactionActive) {
                await writerA.rollbackTransaction();
              }
            } catch {
              // no-op: cleanup safety for failed assertions
            }

            try {
              if (writerB.isTransactionActive) {
                await writerB.rollbackTransaction();
              }
            } catch {
              // no-op: cleanup safety for failed assertions
            }

            await writerA.release();
            await writerB.release();
          }
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
