import { randomUUID } from 'crypto';
import { readdirSync } from 'fs';
import { resolve } from 'path';
import { DataSource, type QueryRunner } from 'typeorm';

/**
 * DB acceptance for go-live unit B0.5 (report indexes). The schema under test
 * is built exclusively by the real migration set inside a fresh scratch
 * database, exactly like a migrated production environment:
 *
 *   1. Catalog proof: both indexes exist on the expected tables (pg_indexes).
 *   2. Planner proof: with enable_seqscan disabled inside the test
 *      transaction, EXPLAIN (FORMAT JSON) for the production report query
 *      shapes must consume the new composite indexes:
 *
 *        invoices:         WHERE tenant_id = $1 AND created_at  BETWEEN $2 AND $3 ORDER BY created_at  DESC
 *        inventory_kardex: WHERE tenant_id = $1 AND occurred_at BETWEEN $2 AND $3 ORDER BY occurred_at DESC
 *
 * Rows are seeded for the target tenant AND a foreign tenant so the index
 * choice is exercised against a multi-tenant table, not an empty one. A
 * freshly built scratch database with a handful of rows would otherwise
 * default to Seq Scan under the planner's defaults, which says nothing about
 * production index usage.
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
 * data-source glob.
 */
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

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER_UUID = '00000000-0000-0000-0000-0000000000ab';

/** Walks a plan tree collecting every node as a flat list. */
function flattenPlanNodes(node: unknown): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];

  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }

    if (current === null || typeof current !== 'object') {
      return;
    }

    const record = current as Record<string, unknown>;
    nodes.push(record);

    // FORMAT JSON wraps the root in { Plan: ... }; child nodes live in Plans[].
    if (record.Plan !== undefined) {
      visit(record.Plan);
    }

    if (Array.isArray(record.Plans)) {
      visit(record.Plans);
    }
  };

  visit(node);
  return nodes;
}

/**
 * Runs EXPLAIN (FORMAT JSON) inside a transaction with sequential scans
 * disabled, and returns the flattened plan nodes. SET LOCAL (and therefore
 * the seqscan suppression) is scoped to the transaction and rolled back, so
 * the connection is never left in a non-default planning state.
 */
async function explainWithSeqscanOff(
  queryRunner: QueryRunner,
  sql: string,
  parameters: unknown[],
): Promise<Array<Record<string, unknown>>> {
  await queryRunner.query('BEGIN');
  try {
    await queryRunner.query('SET LOCAL enable_seqscan = off');
    const rows = (await queryRunner.query(
      `EXPLAIN (FORMAT JSON) ${sql}`,
      parameters,
    )) as Array<{ 'QUERY PLAN': unknown }>;

    const rawPlan = rows[0]?.['QUERY PLAN'];
    const plan = typeof rawPlan === 'string' ? JSON.parse(rawPlan) : rawPlan;

    return flattenPlanNodes(plan);
  } finally {
    await queryRunner.query('ROLLBACK');
  }
}

async function insertTenant(
  queryRunner: QueryRunner,
  tenantId: string,
): Promise<void> {
  // Schema-aware: probe, then insert the slug only when the column exists
  // (mirrors the established DB spec pattern for frozen legacy schemas).
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
  // RLS is FORCE on both tables and enforced for this job's connection role
  // (it does not bypass RLS), so every INSERT must run with the tenant bound
  // or the WITH CHECK clause rejects the row. Per-statement binding (not
  // session-scoped) means interleaved multi-tenant inserts always run under
  // the right tenant's WITH CHECK clause.
  await queryRunner.query("SELECT set_config('app.tenant_id', $1, 't')", [
    tenantId,
  ]);
}

async function insertInvoice(
  queryRunner: QueryRunner,
  tenantId: string,
  invoiceNumber: string,
  createdAt: string,
): Promise<void> {
  await bindTenantContext(queryRunner, tenantId);
  await queryRunner.query(
    `
    INSERT INTO invoices (
      tenant_id, invoice_number, created_at, user_id,
      subtotal, total_tax, total, type
    ) VALUES (
      $1, $2, $3::timestamptz, $4, 100.00, 0.00, 100.00, 'regular'
    )
  `,
    [tenantId, invoiceNumber, createdAt, USER_UUID],
  );
}

async function insertKardexRow(
  queryRunner: QueryRunner,
  tenantId: string,
  insumoId: string,
  occurredAt: string,
): Promise<void> {
  await bindTenantContext(queryRunner, tenantId);
  // One distinct insumo per row keeps the running-balance trigger trivially
  // satisfied (first row per insumo starts from stock_before = 0).
  await queryRunner.query(
    `
    INSERT INTO inventory_kardex (
      tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
      total_cost_nio, stock_before, stock_after,
      source_document_type, source_document_id, occurred_at
    ) VALUES (
      $1, $2, 'ADJUSTMENT', 1, 10.0000,
      10.0000, 0.0000, 1.0000,
      'manual', $3, $4::timestamptz
    )
  `,
    [tenantId, insumoId, `manual-${randomUUID()}`, occurredAt],
  );
}

describe('AddReportIndexes1809530000000 (db)', () => {
  const TEST_TIMEOUT_MS = 240000;
  const isDbTest = Boolean(process.env.DB_PASSWORD);
  const itDb = isDbTest ? it : it.skip;

  itDb(
    'creates both composite report indexes in the catalog on the expected tables',
    async () => {
      await withMigrationBuiltDatabase(
        'report_indexes_catalog',
        async (queryRunner) => {
          const rows = (await queryRunner.query(
            `SELECT tablename, indexname FROM pg_indexes
              WHERE indexname IN (
                'idx_invoices_tenant_created_at',
                'idx_inventory_kardex_tenant_occurred_at'
              )`,
          )) as Array<{ tablename: string; indexname: string }>;

          // Key-order independent: Postgres column order in the wire result
          // is an implementation detail.
          const found = new Map(rows.map((r) => [r.indexname, r.tablename]));
          expect(found.size).toBe(2);
          expect(found.get('idx_invoices_tenant_created_at')).toBe('invoices');
          expect(found.get('idx_inventory_kardex_tenant_occurred_at')).toBe(
            'inventory_kardex',
          );
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'serves the invoices report query through idx_invoices_tenant_created_at',
    async () => {
      await withMigrationBuiltDatabase(
        'report_indexes_invoices_explain',
        async (queryRunner) => {
          await insertTenant(queryRunner, TENANT_A);
          await insertTenant(queryRunner, TENANT_B);

          for (let day = 1; day <= 6; day += 1) {
            await insertInvoice(
              queryRunner,
              TENANT_A,
              `001-001-01-0000000${day}`,
              `2026-02-0${day}T12:00:00Z`,
            );
          }
          await insertInvoice(
            queryRunner,
            TENANT_B,
            '001-001-01-00000099',
            '2026-02-03T12:00:00Z',
          );

          const nodes = await explainWithSeqscanOff(
            queryRunner,
            `SELECT id, invoice_number, total
               FROM invoices
              WHERE tenant_id = $1
                AND created_at BETWEEN $2 AND $3
              ORDER BY created_at DESC`,
            [TENANT_A, '2026-02-01T00:00:00Z', '2026-02-28T23:59:59Z'],
          );

          const indexNodes = nodes.filter(
            (node) =>
              typeof node['Node Type'] === 'string' &&
              node['Node Type'].includes('Index Scan') &&
              node['Index Name'] === 'idx_invoices_tenant_created_at',
          );
          expect(indexNodes.length).toBeGreaterThan(0);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'serves the inventory_kardex report query through idx_inventory_kardex_tenant_occurred_at',
    async () => {
      await withMigrationBuiltDatabase(
        'report_indexes_kardex_explain',
        async (queryRunner) => {
          await insertTenant(queryRunner, TENANT_A);
          await insertTenant(queryRunner, TENANT_B);

          for (let day = 1; day <= 6; day += 1) {
            await insertKardexRow(
              queryRunner,
              TENANT_A,
              '33333333-3333-3333-3333-33333333330' + String(day),
              `2026-02-0${day}T12:00:00Z`,
            );
          }
          await insertKardexRow(
            queryRunner,
            TENANT_B,
            '33333333-3333-3333-3333-333333333399',
            '2026-02-03T12:00:00Z',
          );

          const nodes = await explainWithSeqscanOff(
            queryRunner,
            `SELECT id, movement_type, quantity
               FROM inventory_kardex
              WHERE tenant_id = $1
                AND occurred_at BETWEEN $2 AND $3
              ORDER BY occurred_at DESC`,
            [TENANT_A, '2026-02-01T00:00:00Z', '2026-02-28T23:59:59Z'],
          );

          const indexNodes = nodes.filter(
            (node) =>
              typeof node['Node Type'] === 'string' &&
              node['Node Type'].includes('Index Scan') &&
              node['Index Name'] === 'idx_inventory_kardex_tenant_occurred_at',
          );
          expect(indexNodes.length).toBeGreaterThan(0);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
