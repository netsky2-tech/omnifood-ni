import { randomUUID } from 'crypto';
import { readdirSync } from 'fs';
import { resolve } from 'path';
import { DataSource, type QueryRunner } from 'typeorm';

/**
 * DB acceptance for issue #425. The schema under test is built exclusively by
 * the real migration set (TypeORM migrations ledger included) inside a fresh
 * scratch database, exactly like a migrated production environment:
 *
 *   - running the migrations up to 1809070000000 leaves the
 *     enforce_inventory_kardex_running_balance() function hashing the uuid
 *     tenant_id (no hashtext(uuid) overload), so every INSERT fails;
 *   - running the full set including 1809210000000-FixInventoryKardexRunningBalanceTenantHash
 *     must restore INSERTs without weakening the running-balance invariant.
 *
 * A scratch database (not a search_path schema) is required: migrations using
 * TypeORM's structured table API resolve existence against the connection's
 * schema, so schema-isolated runs are not faithful to a migrated database.
 */
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

const adminConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

/**
 * Collects the migration files TypeORM would register through the
 * data-source glob, optionally capped at a timestamp so a test can rebuild
 * the exact broken pre-fix state (<= 1809070000000) instead of the fixed one.
 */
function collectMigrationPaths(maxTimestamp: number | null): string[] {
  return readdirSync(__dirname)
    .filter(
      (file) =>
        /^\d{13}-[A-Za-z0-9]+\.ts$/.test(file) && !file.includes('.spec.'),
    )
    .filter(
      (file) =>
        maxTimestamp === null || Number(file.split('-')[0]) <= maxTimestamp,
    )
    .sort()
    .map((file) => resolve(__dirname, file));
}

async function withMigrationBuiltDatabase(
  databasePrefix: string,
  maxMigrationTimestamp: number | null,
  assertion: (queryRunner: QueryRunner) => Promise<void>,
): Promise<void> {
  const database = `${databasePrefix}_${randomUUID().replace(/-/g, '')}`;
  const admin = new DataSource({ type: 'postgres', ...adminConnection });
  const adminQueryRunner = admin.createQueryRunner();
  let adminInitialized = false;

  try {
    await admin.initialize();
    adminInitialized = true;
    await adminQueryRunner.connect();
    await adminQueryRunner.query(`CREATE DATABASE "${database}"`);

    const dataSource = new DataSource({
      type: 'postgres',
      host: adminConnection.host,
      port: adminConnection.port,
      username: adminConnection.username,
      password: adminConnection.password,
      database,
      migrations: collectMigrationPaths(maxMigrationTimestamp),
    });

    await dataSource.initialize();
    await dataSource.runMigrations();

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await assertion(queryRunner);
    } finally {
      if (queryRunner.isReleased === false) {
        await queryRunner.release();
      }
      await dataSource.destroy();
    }
  } finally {
    try {
      if (adminQueryRunner.isReleased === false) {
        await adminQueryRunner.release();
      }
    } catch {
      // no-op: best-effort cleanup
    }

    try {
      if (adminInitialized) {
        const cleanupRunner = admin.createQueryRunner();
        await cleanupRunner.connect();
        await cleanupRunner.query(
          `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`,
        );
        await cleanupRunner.release();
      }
    } catch {
      // no-op: best-effort cleanup
    }

    if (adminInitialized) {
      await admin.destroy();
    }
  }
}

const TENANT_UUID = '11111111-1111-1111-1111-111111111111';
const INSUMO_UUID = '00000000-0000-0000-0000-000000000001';

async function insertKardexMovement(
  queryRunner: QueryRunner,
  overrides: {
    quantity?: string;
    stockBefore?: string;
    stockAfter?: string;
    sourceDocumentId?: string;
  } = {},
): Promise<unknown> {
  return queryRunner.query(
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
        '${TENANT_UUID}',
        '${INSUMO_UUID}',
        'PURCHASE',
        ${overrides.quantity ?? '5.0000'},
        10.0000,
        50.0000,
        ${overrides.stockBefore ?? '0.0000'},
        ${overrides.stockAfter ?? '5.0000'},
        'PURCHASE_INVOICE',
        '${overrides.sourceDocumentId ?? 'invoice-1'}'
      )
    `,
  );
}

describe('FixInventoryKardexRunningBalanceTenantHash1809210000000 (db)', () => {
  const TEST_TIMEOUT_MS = 180000;
  const isDbTest = Boolean(process.env.DB_PASSWORD);
  const itDb = isDbTest ? it : it.skip;

  itDb(
    'reproduces the migrated-state insert failure while the function still hashes the uuid tenant_id',
    async () => {
      await withMigrationBuiltDatabase(
        'kardex_tenant_hash_broken',
        // Rebind applied, tenant-hash fix not: the exact broken migrated state.
        1809070000000,
        async (queryRunner) => {
          await expect(insertKardexMovement(queryRunner)).rejects.toThrow(
            /hashtext.*uuid|uuid.*hashtext/s,
          );
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'accepts a real inventory_kardex INSERT on the fully migration-built uuid tenant schema',
    async () => {
      await withMigrationBuiltDatabase(
        'kardex_tenant_hash_fixed',
        null,
        async (queryRunner) => {
          await expect(
            insertKardexMovement(queryRunner),
          ).resolves.toBeDefined();

          const rowsResult: unknown = await queryRunner.query(`
            SELECT stock_after
            FROM inventory_kardex
            WHERE tenant_id = '${TENANT_UUID}'
          `);

          expect(rowsResult).toHaveLength(1);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'keeps enforcing the running balance and rejects an invalid next transition after the fix',
    async () => {
      await withMigrationBuiltDatabase(
        'kardex_tenant_hash_invariant',
        null,
        async (queryRunner) => {
          await insertKardexMovement(queryRunner);

          await expect(
            insertKardexMovement(queryRunner, {
              quantity: '2.0000',
              stockBefore: '5.0000',
              stockAfter: '8.0000',
              sourceDocumentId: 'invoice-2',
            }),
          ).rejects.toThrow('balance invariant violated');

          const countResult: unknown = await queryRunner.query(
            `SELECT COUNT(*)::int AS total FROM inventory_kardex`,
          );

          expect(countResult).toEqual([{ total: 1 }]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
