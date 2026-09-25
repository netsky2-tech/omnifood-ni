import { randomUUID } from 'crypto';
import { readdirSync } from 'fs';
import { resolve } from 'path';
import { DataSource, type QueryRunner } from 'typeorm';
import { AddInvoiceNumberUniqueness1809270000000 } from './1809270000000-AddInvoiceNumberUniqueness';

/**
 * DB acceptance for issue #526 AC-7. The schema under test is built
 * exclusively by the real migration set (TypeORM migrations ledger included)
 * inside a fresh scratch database, exactly like a migrated production
 * environment:
 *
 *   - on the fully migrated schema, a second invoice with the same
 *     (tenant_id, invoice_number) must fail with unique-violation 23505;
 *   - the same invoice_number under two DIFFERENT tenants must stay legal
 *     (multi-tenant RaaS: the tenant is part of the key by design);
 *   - on the pre-migration schema (everything except
 *     1809270000000-AddInvoiceNumberUniqueness), a seeded duplicate must make
 *     the new migration's up() fail closed — and both duplicate rows must
 *     still be present afterwards, proving the guard does not silently fix
 *     anything.
 *
 * A scratch database (not a search_path schema) is required: migrations using
 * TypeORM's structured table APIs resolve existence against the connection's
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
 * the exact pre-migration state (<= 1809260000000) instead of the guarded
 * one.
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

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER_UUID = '00000000-0000-0000-0000-0000000000ab';
const SHARED_NUMBER = '001-001-01-00000001';

async function insertTenant(
  queryRunner: QueryRunner,
  tenantId: string,
): Promise<void> {
  // Schema-aware: frozen legacy databases (e.g. the fail-closed guard test
  // at 1809260000000) predate the tenants.slug column added by main's
  // login-slug work (1809350000000). Probe, then insert the slug only when
  // the column exists.
  const slugColumn = await queryRunner.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tenants' AND column_name = 'slug'`,
  );
  const withSlug = Array.isArray(slugColumn) && slugColumn.length > 0;
  await queryRunner.query(
    withSlug
      ? `INSERT INTO tenants (id, name, slug) VALUES ('${tenantId}', 'tenant-${tenantId}', 'tenant-${tenantId}')`
      : `INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'tenant-${tenantId}')`,
  );
}

async function bindTenantContext(
  queryRunner: QueryRunner,
  tenantId: string,
): Promise<void> {
  // The invoices RLS policies hardened by #512's slices are enforced for this
  // job's connection role (it does not bypass RLS), so every invoice INSERT
  // must run with the tenant bound or the WITH CHECK clause rejects the row.
  await queryRunner.query("SELECT set_config('app.tenant_id', $1, 'false')", [
    tenantId,
  ]);
}

async function insertInvoice(
  queryRunner: QueryRunner,
  tenantId: string,
  invoiceNumber: string,
): Promise<void> {
  // Bind per-invoice (not per-tenant setup): session-scoped binding means
  // the LAST bind wins, so interleaved multi-tenant inserts would otherwise
  // run under the wrong tenant's WITH CHECK clause.
  await bindTenantContext(queryRunner, tenantId);
  await queryRunner.query(`
    INSERT INTO invoices (
      tenant_id, invoice_number, created_at, user_id,
      subtotal, total_tax, total, type
    ) VALUES (
      '${tenantId}',
      '${invoiceNumber}',
      now(),
      '${USER_UUID}',
      100.00,
      0.00,
      100.00,
      'regular'
    )
  `);
}

async function countInvoices(
  queryRunner: QueryRunner,
  tenantId: string,
  invoiceNumber: string,
): Promise<number> {
  const rows = (await queryRunner.query(
    `SELECT count(*)::int AS n FROM invoices
      WHERE tenant_id = '${tenantId}' AND invoice_number = '${invoiceNumber}'`,
  )) as Array<{ n: number }>;

  return rows[0].n;
}

describe('AddInvoiceNumberUniqueness1809270000000 (db)', () => {
  const TEST_TIMEOUT_MS = 240000;
  const isDbTest = Boolean(process.env.DB_PASSWORD);
  const itDb = isDbTest ? it : it.skip;

  itDb(
    'rejects a second invoice with the same tenant and invoice_number with unique violation 23505',
    async () => {
      await withMigrationBuiltDatabase(
        'invoice_number_unique_blocked',
        null,
        async (queryRunner) => {
          await insertTenant(queryRunner, TENANT_A);
          await insertInvoice(queryRunner, TENANT_A, SHARED_NUMBER);

          let violationCode: string | undefined;
          try {
            await insertInvoice(queryRunner, TENANT_A, SHARED_NUMBER);
          } catch (error) {
            violationCode = (error as { code?: string }).code;
          }

          expect(violationCode).toBe('23505');
          await expect(
            countInvoices(queryRunner, TENANT_A, SHARED_NUMBER),
          ).resolves.toBe(1);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'keeps the same invoice_number legal across two different tenants',
    async () => {
      await withMigrationBuiltDatabase(
        'invoice_number_cross_tenant',
        null,
        async (queryRunner) => {
          await insertTenant(queryRunner, TENANT_A);
          await insertTenant(queryRunner, TENANT_B);

          await insertInvoice(queryRunner, TENANT_A, SHARED_NUMBER);
          await insertInvoice(queryRunner, TENANT_B, SHARED_NUMBER);

          // Cross-tenant collision must stay legal: both rows exist.
          await expect(
            countInvoices(queryRunner, TENANT_A, SHARED_NUMBER),
          ).resolves.toBe(1);
          await expect(
            countInvoices(queryRunner, TENANT_B, SHARED_NUMBER),
          ).resolves.toBe(1);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'fails closed on a pre-existing duplicate and leaves both duplicate rows in place',
    async () => {
      await withMigrationBuiltDatabase(
        'invoice_number_guard_fail_closed',
        // Everything except the uniqueness tripwire: the exact pre-migration
        // state in which the dev duplicates exist today.
        1809260000000,
        async (queryRunner) => {
          await insertTenant(queryRunner, TENANT_A);
          await insertInvoice(queryRunner, TENANT_A, SHARED_NUMBER);
          await insertInvoice(queryRunner, TENANT_A, SHARED_NUMBER);

          await expect(
            new AddInvoiceNumberUniqueness1809270000000().up(queryRunner),
          ).rejects.toThrow(/DUPLICATE_INVOICE_NUMBERS/);

          // Fail-closed proof: the guard reports, it does not silently fix.
          // Both rows must still be there, untouched.
          await expect(
            countInvoices(queryRunner, TENANT_A, SHARED_NUMBER),
          ).resolves.toBe(2);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
