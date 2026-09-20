import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { ConvergeNaiveTimestamps1809200000000 } from './1809200000000-ConvergeNaiveTimestamps';

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

const NAIVE_VALUE = '2026-01-15 10:00:00';
const NAIVE_VALUE_UTC = '2026-01-15 10:00:00+00';

/**
 * Minimal per-table shapes carrying exactly the ten target columns in their
 * pre-migration state: bare `timestamp without time zone`, populated by
 * `now()` defaults — the shape the converging issue found. Auxiliary columns
 * the migration does not touch are omitted.
 */
const TABLE_SHAPES: Record<string, string> = {
  invoice_payments: `"reconciled_at" timestamp`,
  invoices: `created_at timestamp NOT NULL DEFAULT now()`,
  production_batch_history: `created_at timestamp NOT NULL DEFAULT now(), operation_date timestamp NOT NULL DEFAULT now()`,
  security_profiles: `created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()`,
  tenants: `created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()`,
  users: `created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()`,
};

const ALL_TABLES = Object.keys(TABLE_SHAPES);

async function withScratchSchema(
  schemaPrefix: string,
  tables: string[],
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
    // The UTC interpretation assumes the deployment ran UTC; pin the session
    // so the text rendering of timestamptz values is deterministic (+00).
    await queryRunner.query(`SET TIME ZONE 'UTC'`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);
    for (const table of tables) {
      await queryRunner.query(
        `CREATE TABLE ${table} (id serial PRIMARY KEY, ${TABLE_SHAPES[table]});`,
      );
    }

    await assertion(queryRunner);
  } finally {
    try {
      if (isInitialized) {
        await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
      if (queryRunner.isTransactionActive)
        await queryRunner.rollbackTransaction();
    } finally {
      if (isInitialized) await queryRunner.release();
      if (dataSource.isInitialized) await dataSource.destroy();
    }
  }
}

const readDataType = async (
  queryRunner: QueryRunner,
  table: string,
  column: string,
): Promise<string | null> => {
  const rows = (await queryRunner.query(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1 AND column_name = $2`,
    [table, column],
  )) as Array<{ data_type: string }>;

  return rows.length > 0 ? rows[0].data_type : null;
};

const TARGET_COLUMNS: Array<[string, string]> = [
  ['invoice_payments', 'reconciled_at'],
  ['invoices', 'created_at'],
  ['production_batch_history', 'created_at'],
  ['production_batch_history', 'operation_date'],
  ['security_profiles', 'created_at'],
  ['security_profiles', 'updated_at'],
  ['tenants', 'created_at'],
  ['tenants', 'updated_at'],
  ['users', 'created_at'],
  ['users', 'updated_at'],
];

describe('ConvergeNaiveTimestamps1809200000000 — real PostgreSQL', () => {
  const migration = new ConvergeNaiveTimestamps1809200000000();

  it('converts all ten columns, reads a naive value back as its UTC instant, and preserves every row count', async () => {
    await withScratchSchema('ts_converge_full', ALL_TABLES, async (qr) => {
      // Seed every table with rows written the way production wrote them:
      // naive wall-clock values into a naive column. invoice_payments also
      // carries a NULL reconciled_at, which must survive as NULL.
      for (const table of ALL_TABLES) {
        for (let i = 0; i < 3; i += 1) {
          await qr.query(`INSERT INTO ${table} (id) VALUES (DEFAULT)`);
        }
      }
      await qr.query(
        `INSERT INTO invoices (created_at) VALUES ('${NAIVE_VALUE}')`,
      );
      await qr.query(
        `INSERT INTO production_batch_history (operation_date) VALUES ('${NAIVE_VALUE}')`,
      );
      await qr.query(
        `INSERT INTO invoice_payments (reconciled_at) VALUES ('${NAIVE_VALUE}')`,
      );

      const countsBefore = (await qr.query(
        `SELECT '${ALL_TABLES[0]}' AS t, count(*)::int AS n FROM ${ALL_TABLES[0]}
          UNION ALL SELECT '${ALL_TABLES[1]}', count(*)::int FROM ${ALL_TABLES[1]}
          UNION ALL SELECT '${ALL_TABLES[2]}', count(*)::int FROM ${ALL_TABLES[2]}
          UNION ALL SELECT '${ALL_TABLES[3]}', count(*)::int FROM ${ALL_TABLES[3]}
          UNION ALL SELECT '${ALL_TABLES[4]}', count(*)::int FROM ${ALL_TABLES[4]}
          UNION ALL SELECT '${ALL_TABLES[5]}', count(*)::int FROM ${ALL_TABLES[5]}
          ORDER BY t`,
      )) as Array<{ t: string; n: number }>;

      await migration.up(qr);

      // Every target column is now timestamptz.
      for (const [table, column] of TARGET_COLUMNS) {
        expect(await readDataType(qr, table, column)).toBe(
          'timestamp with time zone',
        );
      }

      // THE UTC INTERPRETATION, demonstrated: the naive wall clock
      // '2026-01-15 10:00:00' reads back as the UTC instant
      // '2026-01-15 10:00:00+00', not as a shifted local time.
      const invoiceValue = (await qr.query(
        `SELECT created_at::text AS v FROM invoices ORDER BY id DESC LIMIT 1`,
      )) as Array<{ v: string }>;
      expect(invoiceValue[0].v).toBe(NAIVE_VALUE_UTC);

      const batchValue = (await qr.query(
        `SELECT operation_date::text AS v FROM production_batch_history ORDER BY id DESC LIMIT 1`,
      )) as Array<{ v: string }>;
      expect(batchValue[0].v).toBe(NAIVE_VALUE_UTC);

      // A naive reconciled_at becomes the same UTC instant, and the rows
      // seeded with NULL reconciled_at survive as NULL.
      const paymentValue = (await qr.query(
        `SELECT reconciled_at::text AS v FROM invoice_payments ORDER BY id DESC LIMIT 1`,
      )) as Array<{ v: string }>;
      expect(paymentValue[0].v).toBe(NAIVE_VALUE_UTC);

      const nullPayment = (await qr.query(
        `SELECT count(*)::int AS n FROM invoice_payments WHERE reconciled_at IS NULL`,
      )) as Array<{ n: number }>;
      expect(nullPayment[0].n).toBe(3);

      // Row counts are preserved for every converted table: the ALTER TABLE
      // rewrite must not drop or duplicate a single row.
      const countsAfter = (await qr.query(
        `SELECT '${ALL_TABLES[0]}' AS t, count(*)::int AS n FROM ${ALL_TABLES[0]}
          UNION ALL SELECT '${ALL_TABLES[1]}', count(*)::int FROM ${ALL_TABLES[1]}
          UNION ALL SELECT '${ALL_TABLES[2]}', count(*)::int FROM ${ALL_TABLES[2]}
          UNION ALL SELECT '${ALL_TABLES[3]}', count(*)::int FROM ${ALL_TABLES[3]}
          UNION ALL SELECT '${ALL_TABLES[4]}', count(*)::int FROM ${ALL_TABLES[4]}
          UNION ALL SELECT '${ALL_TABLES[5]}', count(*)::int FROM ${ALL_TABLES[5]}
          ORDER BY t`,
      )) as Array<{ t: string; n: number }>;
      expect(countsAfter).toEqual(countsBefore);
    });
  });

  it('is idempotent: a second up() is a no-op over converged columns', async () => {
    await withScratchSchema('ts_converge_idem', ALL_TABLES, async (qr) => {
      await qr.query(
        `INSERT INTO invoices (created_at) VALUES ('${NAIVE_VALUE}')`,
      );

      await migration.up(qr);
      await expect(migration.up(qr)).resolves.toBeUndefined();

      expect(await readDataType(qr, 'users', 'created_at')).toBe(
        'timestamp with time zone',
      );

      // The stored instant did not move during the re-run.
      const value = (await qr.query(
        `SELECT created_at::text AS v FROM invoices`,
      )) as Array<{ v: string }>;
      expect(value[0].v).toBe(NAIVE_VALUE_UTC);
    });
  });

  it('down() restores timestamp without time zone with the same value read back naive', async () => {
    await withScratchSchema('ts_converge_down', ALL_TABLES, async (qr) => {
      await qr.query(
        `INSERT INTO invoices (created_at) VALUES ('${NAIVE_VALUE}')`,
      );
      await qr.query(
        `INSERT INTO users (created_at, updated_at) VALUES ('${NAIVE_VALUE}', '${NAIVE_VALUE}')`,
      );

      await migration.up(qr);
      await migration.down(qr);

      for (const [table, column] of TARGET_COLUMNS) {
        expect(await readDataType(qr, table, column)).toBe(
          'timestamp without time zone',
        );
      }

      // The round trip restored the exact pre-up representation: the same
      // naive wall clock, with no offset and no shift.
      const invoiceValue = (await qr.query(
        `SELECT created_at::text AS v FROM invoices`,
      )) as Array<{ v: string }>;
      expect(invoiceValue[0].v).toBe(NAIVE_VALUE);

      const userValue = (await qr.query(
        `SELECT created_at::text AS c, updated_at::text AS u FROM users`,
      )) as Array<{ c: string; u: string }>;
      expect(userValue[0].c).toBe(NAIVE_VALUE);
      expect(userValue[0].u).toBe(NAIVE_VALUE);
    });
  });

  it('no-ops on tables that are absent, converting only what exists', async () => {
    await withScratchSchema('ts_converge_partial', ['users'], async (qr) => {
      // Only users exists; the other nine targets are missing entirely.
      await expect(migration.up(qr)).resolves.toBeUndefined();

      expect(await readDataType(qr, 'users', 'created_at')).toBe(
        'timestamp with time zone',
      );
      expect(await readDataType(qr, 'users', 'updated_at')).toBe(
        'timestamp with time zone',
      );
    });
  });

  it('throws naming the type when a target is neither naive timestamp nor timestamptz, and converts nothing', async () => {
    await withScratchSchema('ts_converge_refuse', ALL_TABLES, async (qr) => {
      // The offending target is the FIRST in the migration's list, so the
      // refusal fires before any ALTER is issued at all.
      await qr.query(
        `ALTER TABLE invoice_payments ALTER COLUMN reconciled_at TYPE date`,
      );

      await expect(migration.up(qr)).rejects.toThrow(
        /UNEXPECTED_TIMESTAMP_COLUMN_TYPE: invoice_payments\.reconciled_at is 'date'/,
      );

      // Nothing was converted: the refusal fires before any ALTER is issued
      // for that target, and no other target may be silently half-done.
      expect(await readDataType(qr, 'invoices', 'created_at')).toBe(
        'timestamp without time zone',
      );
    });
  });
});
