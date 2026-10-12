import { randomUUID } from 'crypto';
import { readdirSync } from 'fs';
import { resolve } from 'path';
import { DataSource, type QueryRunner } from 'typeorm';
import { AddCustomerSnapshotToInvoices1809590000000 } from './1809590000000-AddCustomerSnapshotToInvoices';

/**
 * DB acceptance for the factura-con-nombre customer snapshot columns.
 * The schema under test is built exclusively by the REAL migration set
 * inside a fresh scratch database, exactly like a migrated production
 * environment (same harness as 1809530000000-AddReportIndexes.db.spec.ts).
 *
 * Proven:
 *   1. `customer_name` / `customer_tax_id` exist on `invoices` after `up`.
 *   2. A second `up` is a guarded no-op (ADD COLUMN IF NOT EXISTS).
 *   3. Pre-existing rows keep NULL — the migration performs NO backfill.
 *   4. `down` deliberately PRESERVES the columns: dropping them would
 *      destroy fiscal issuance evidence (DGI DT 09-2007, invoices are never
 *      destroyed). This no-op `down` is the documented repository
 *      convention mirrored by 1809400000000-AddShiftIdAndLocalIssueDateToInvoices.ts.
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

/** Collects the migration files TypeORM would register through the data-source glob. */
function collectMigrationPaths(): string[] {
  const migrationsDir = resolve(__dirname);

  return readdirSync(migrationsDir)
    .filter(
      (file) =>
        /^\d{13}-[A-Za-z0-9]+\.ts$/.test(file) && !file.includes('.spec.'),
    )
    .sort()
    .map((file) => resolve(migrationsDir, file));
}

async function withMigrationBuiltDatabase(
  databasePrefix: string,
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
      migrations: collectMigrationPaths(),
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

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

const snapshotColumns = async (
  queryRunner: QueryRunner,
): Promise<ColumnRow[]> => {
  const rows = (await queryRunner.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_name = 'invoices'
        AND column_name IN ('customer_name', 'customer_tax_id')
      ORDER BY column_name`,
  )) as ColumnRow[];
  return rows;
};

describe('AddCustomerSnapshotToInvoices1809590000000 (db)', () => {
  const TEST_TIMEOUT_MS = 60000;

  it(
    'adds nullable customer_name / customer_tax_id to invoices and a second up is a guarded no-op',
    async () => {
      await withMigrationBuiltDatabase(
        'cust_snapshot_cols',
        async (queryRunner) => {
          // 1. Both columns exist after the real migration set ran `up`.
          const columns = await snapshotColumns(queryRunner);
          expect(columns).toEqual([
            { column_name: 'customer_name', data_type: 'character varying', is_nullable: 'YES' },
            { column_name: 'customer_tax_id', data_type: 'character varying', is_nullable: 'YES' },
          ]);

          // 2. Second `up` is a no-op (guarded idempotency): no throw, and
          // the column shape is unchanged afterwards.
          const migration = new AddCustomerSnapshotToInvoices1809590000000();
          await expect(migration.up(queryRunner)).resolves.not.toThrow();
          expect(await snapshotColumns(queryRunner)).toEqual(columns);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'performs NO backfill: rows that pre-date the migration keep NULL',
    async () => {
      await withMigrationBuiltDatabase(
        'cust_snapshot_backfill',
        async (queryRunner) => {
          const tenantId = '11111111-1111-4111-8111-111111111111';

          await queryRunner.query(
            `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`,
            [tenantId, 'cust-snapshot-backfill-tenant', 'cust-snapshot-backfill'],
          );
          // Simulate the PRE-MIGRATION state: drop both columns, then insert
          // a legacy-style invoice row (anonymous sale) so the row genuinely
          // existed before `up` runs.
          await queryRunner.query(
            `ALTER TABLE invoices
               DROP COLUMN IF EXISTS customer_name,
               DROP COLUMN IF EXISTS customer_tax_id`,
          );
          await queryRunner.query(
            `INSERT INTO invoices (
               id, tenant_id, invoice_number, created_at, user_id,
               subtotal, total_tax, total
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8
             )`,
            [
              '22222222-2222-4222-8222-222222222222',
              tenantId,
              '001-001-01-00000001',
              new Date('2026-01-15T12:00:00.000Z'),
              '33333333-3333-4333-8333-333333333333',
              100,
              15,
              115,
            ],
          );

          const migration = new AddCustomerSnapshotToInvoices1809590000000();
          await migration.up(queryRunner);

          const columns = await snapshotColumns(queryRunner);
          expect(columns).toHaveLength(2);

          // The pre-existing row keeps NULL: no backfill, ever.
          const rows = (await queryRunner.query(
            `SELECT customer_name, customer_tax_id
               FROM invoices
              WHERE id = $1`,
            ['22222222-2222-4222-8222-222222222222'],
          )) as Array<{ customer_name: string | null; customer_tax_id: string | null }>;
          expect(rows).toHaveLength(1);
          expect(rows[0].customer_name).toBeNull();
          expect(rows[0].customer_tax_id).toBeNull();

          // Re-running `up` again over the populated table stays a no-op.
          await expect(migration.up(queryRunner)).resolves.not.toThrow();
          expect(await snapshotColumns(queryRunner)).toEqual(columns);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'down deliberately PRESERVES the columns (DGI: rollback never destroys fiscal issuance evidence)',
    async () => {
      await withMigrationBuiltDatabase(
        'cust_snapshot_down',
        async (queryRunner) => {
          const before = await snapshotColumns(queryRunner);
          expect(before).toHaveLength(2);

          const migration = new AddCustomerSnapshotToInvoices1809590000000();
          await migration.down(queryRunner);

          // The no-op down is the documented repository convention (mirrors
          // 1809400000000-AddShiftIdAndLocalIssueDateToInvoices.ts): the
          // columns and any snapshot data survive the rollback.
          const after = await snapshotColumns(queryRunner);
          expect(after).toEqual(before);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
