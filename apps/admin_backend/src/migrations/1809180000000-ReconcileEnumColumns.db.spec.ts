import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { ReconcileEnumColumns1809180000000 } from './1809180000000-ReconcileEnumColumns';

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

/**
 * Minimal per-table shapes mirroring what the migration needs: the target
 * columns with their real nullability and defaults (verified against the built
 * schema). The RLS probe tables additionally carry tenant_id and the tenant
 * predicate policy, because a policy on a column the table lacks would not
 * evaluate.
 */
const TABLE_DDL: Record<string, string> = {
  customer_point_transactions: `
    CREATE TABLE customer_point_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_type varchar,
      origin varchar,
      type varchar NOT NULL DEFAULT 'earn'
    )`,
  inventory_kardex: `
    CREATE TABLE inventory_kardex (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      movement_type varchar NOT NULL
    )`,
  kardex_recalculate_queue: `
    CREATE TABLE kardex_recalculate_queue (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      status varchar NOT NULL DEFAULT 'PENDING'
    )`,
  promotions: `
    CREATE TABLE promotions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      type varchar NOT NULL DEFAULT 'buyXGetYFree'
    )`,
};

const RLS_TABLE_DDL: Record<string, string> = {
  inventory_kardex: `
    CREATE TABLE inventory_kardex (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tenant_id uuid NOT NULL,
      movement_type varchar NOT NULL
    )`,
  kardex_recalculate_queue: `
    CREATE TABLE kardex_recalculate_queue (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      status varchar NOT NULL DEFAULT 'PENDING'
    )`,
};

interface SchemaHarness {
  queryRunner: QueryRunner;
  schema: string;
  /** Non-superuser, NOBYPASSRLS role the RLS-affected tables are owned by. */
  role: string;
}

/**
 * Builds an isolated scratch schema with a restricted probe role and hands the
 * schema's query runner to the assertion. The role mirrors the migration role
 * of scripts/verify-schema-build.sh: the tables it must convert are owned by a
 * non-superuser with NOBYPASSRLS, so FORCE ROW LEVEL SECURITY actually applies
 * to it. The superuser connection is used only for provisioning and cleanup.
 */
async function withReconcileEnumSchema(
  schemaPrefix: string,
  assertion: (harness: SchemaHarness) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });

  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  const role = `${schemaPrefix}_role_${randomUUID().replace(/-/g, '')}`;
  const queryRunner = dataSource.createQueryRunner();
  let isInitialized = false;

  try {
    await dataSource.initialize();
    isInitialized = true;
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);
    await queryRunner.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD 'rls-probe-only' ` +
        `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
    await queryRunner.query(
      `GRANT USAGE, CREATE ON SCHEMA "${schema}" TO "${role}"`,
    );

    await assertion({ queryRunner, schema, role });
  } finally {
    try {
      await queryRunner.query('RESET ROLE');
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch {
      // best-effort cleanup
    }
    try {
      await queryRunner.query(`DROP ROLE IF EXISTS "${role}"`);
    } catch {
      // best-effort cleanup
    }

    if (queryRunner.isReleased === false) {
      await queryRunner.release();
    }
    if (isInitialized && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

/**
 * Creates one target table. When `forceRls` is set the table is ENABLE+FORCE
 * row level security with the same tenant predicate the real schema uses, and
 * is owned by the probe role, so a count under FORCE returns zero rows to it.
 */
async function createTargetTable(
  queryRunner: QueryRunner,
  table: string,
  role: string,
  forceRls = false,
): Promise<void> {
  await queryRunner.query(forceRls ? RLS_TABLE_DDL[table] : TABLE_DDL[table]);

  if (forceRls) {
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON ${table}
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    `);
    await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
  }

  await queryRunner.query(`ALTER TABLE ${table} OWNER TO "${role}"`);
}

async function columnState(
  queryRunner: QueryRunner,
  table: string,
  column: string,
): Promise<{ udtName: string; dataType: string; default: string | null }> {
  const rows = (await queryRunner.query(
    `SELECT udt_name AS "udtName", data_type AS "dataType", column_default AS "default"
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2`,
    [table, column],
  )) as Array<{ udtName: string; dataType: string; default: string | null }>;

  expect(rows).toHaveLength(1);

  return rows[0];
}

async function isForceRowLevelSecurity(
  queryRunner: QueryRunner,
  table: string,
): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT c.relforcerowsecurity AS forced
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relname = $1`,
    [table],
  )) as Array<{ forced: boolean }>;

  expect(rows).toHaveLength(1);

  return rows[0].forced === true;
}

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('ReconcileEnumColumns1809180000000 (db)', () => {
  const migration = new ReconcileEnumColumns1809180000000();

  describe('FORCE ROW LEVEL SECURITY tables: the guard must see the rows RLS would hide', () => {
    it('inventory_kardex: a row hidden from its own owner under FORCE is counted and converted, and FORCE is restored', async () => {
      await withReconcileEnumSchema(
        'mig_1818_kardex_rls',
        async ({ queryRunner, role }) => {
          await createTargetTable(queryRunner, 'inventory_kardex', role, true);
          await queryRunner.query(
            `INSERT INTO inventory_kardex (tenant_id, movement_type) VALUES ($1, 'SALE')`,
            [TENANT_ID],
          );

          // As the table-owning probe role, the row is invisible: FORCE RLS
          // subjects the owner, no app.tenant_id is bound, the predicate is
          // NULL. A naive counting guard would see zero rows here.
          await queryRunner.query(`SET ROLE "${role}"`);
          expect(
            (await queryRunner.query('SELECT current_user'))[0].current_user,
          ).toBe(role);
          const hidden = (await queryRunner.query(
            'SELECT count(*)::int AS n FROM inventory_kardex',
          )) as Array<{ n: number }>;
          expect(hidden[0].n).toBe(0);

          // The migration drops FORCE, counts the row, converts the column.
          await expect(migration.up(queryRunner)).resolves.not.toThrow();
          await queryRunner.query('RESET ROLE');

          // FORCE restored, column converted, the row survived with its value.
          expect(
            await isForceRowLevelSecurity(queryRunner, 'inventory_kardex'),
          ).toBe(true);
          const state = await columnState(
            queryRunner,
            'inventory_kardex',
            'movement_type',
          );
          expect(state.udtName).toBe('inventory_kardex_movement_type_enum');
          const converted = (await queryRunner.query(
            'SELECT count(*)::int AS n, movement_type::text AS value FROM inventory_kardex GROUP BY movement_type',
          )) as Array<{ n: number; value: string }>;
          expect(converted[0]).toEqual({ n: 1, value: 'SALE' });

          // Re-applying is a no-op.
          await expect(migration.up(queryRunner)).resolves.not.toThrow();
          expect(
            (
              await columnState(
                queryRunner,
                'inventory_kardex',
                'movement_type',
              )
            ).udtName,
          ).toBe('inventory_kardex_movement_type_enum');
        },
      );
    });

    it('kardex_recalculate_queue: same FORCE treatment, default restored, down() returns varchar + default', async () => {
      await withReconcileEnumSchema(
        'mig_1818_queue_rls',
        async ({ queryRunner, role }) => {
          await createTargetTable(
            queryRunner,
            'kardex_recalculate_queue',
            role,
            true,
          );
          await queryRunner.query(
            `INSERT INTO kardex_recalculate_queue (tenant_id) VALUES ($1)`,
            [TENANT_ID],
          );

          await queryRunner.query(`SET ROLE "${role}"`);
          const hidden = (await queryRunner.query(
            'SELECT count(*)::int AS n FROM kardex_recalculate_queue',
          )) as Array<{ n: number }>;
          expect(hidden[0].n).toBe(0);

          await expect(migration.up(queryRunner)).resolves.not.toThrow();
          await queryRunner.query('RESET ROLE');

          expect(
            await isForceRowLevelSecurity(
              queryRunner,
              'kardex_recalculate_queue',
            ),
          ).toBe(true);
          const state = await columnState(
            queryRunner,
            'kardex_recalculate_queue',
            'status',
          );
          expect(state.udtName).toBe('kardex_recalculate_queue_status_enum');
          expect(state.default).toBe(
            `'PENDING'::kardex_recalculate_queue_status_enum`,
          );

          await expect(migration.up(queryRunner)).resolves.not.toThrow();

          await expect(migration.down(queryRunner)).resolves.not.toThrow();
          const reverted = await columnState(
            queryRunner,
            'kardex_recalculate_queue',
            'status',
          );
          expect(reverted.udtName).toBe('varchar');
          expect(reverted.default).toBe(`'PENDING'::character varying`);
          expect(
            await isForceRowLevelSecurity(
              queryRunner,
              'kardex_recalculate_queue',
            ),
          ).toBe(true);
        },
      );
    });

    it('restores FORCE even when the guard throws on a non-member value', async () => {
      await withReconcileEnumSchema(
        'mig_1818_kardex_throw',
        async ({ queryRunner, role }) => {
          await createTargetTable(queryRunner, 'inventory_kardex', role, true);
          await queryRunner.query(
            `INSERT INTO inventory_kardex (tenant_id, movement_type) VALUES ($1, 'MYSTERY')`,
            [TENANT_ID],
          );

          await queryRunner.query(`SET ROLE "${role}"`);
          await expect(migration.up(queryRunner)).rejects.toThrow(
            /'MYSTERY' \(1 row\(s\)\)/,
          );
          await queryRunner.query('RESET ROLE');

          // The finally restored FORCE: the table was not left deniable.
          expect(
            await isForceRowLevelSecurity(queryRunner, 'inventory_kardex'),
          ).toBe(true);
          expect(
            (
              await columnState(
                queryRunner,
                'inventory_kardex',
                'movement_type',
              )
            ).udtName,
          ).toBe('varchar');
        },
      );
    });
  });

  describe('the fail-closed guard names the offender for each of the six targets', () => {
    const cases: Array<{
      table: string;
      column: string;
      insert: string;
      params: unknown[];
      offender: string;
    }> = [
      {
        table: 'customer_point_transactions',
        column: 'transaction_type',
        insert: `INSERT INTO customer_point_transactions (type, transaction_type) VALUES ('earn', 'REFUND')`,
        params: [],
        offender: 'REFUND',
      },
      {
        table: 'customer_point_transactions',
        column: 'origin',
        insert: `INSERT INTO customer_point_transactions (type, origin) VALUES ('earn', 'WEB')`,
        params: [],
        offender: 'WEB',
      },
      {
        table: 'customer_point_transactions',
        column: 'type',
        insert: `INSERT INTO customer_point_transactions (type) VALUES ('TRANSFER')`,
        params: [],
        offender: 'TRANSFER',
      },
      {
        table: 'inventory_kardex',
        column: 'movement_type',
        insert: `INSERT INTO inventory_kardex (movement_type) VALUES ('MYSTERY')`,
        params: [],
        offender: 'MYSTERY',
      },
      {
        table: 'kardex_recalculate_queue',
        column: 'status',
        insert: `INSERT INTO kardex_recalculate_queue (status) VALUES ('QUEUED')`,
        params: [],
        offender: 'QUEUED',
      },
      {
        table: 'promotions',
        column: 'type',
        insert: `INSERT INTO promotions (type) VALUES ('flashSale')`,
        params: [],
        offender: 'flashSale',
      },
    ];

    for (const target of cases) {
      it(`throws naming the offender for ${target.table}.${target.column} and converts nothing`, async () => {
        await withReconcileEnumSchema(
          'mig_1818_guard',
          async ({ queryRunner, role }) => {
            await createTargetTable(queryRunner, target.table, role);
            await queryRunner.query(target.insert, target.params);

            await expect(migration.up(queryRunner)).rejects.toThrow(
              `${target.table}.${target.column} holds values that are not members`,
            );
            await expect(migration.up(queryRunner)).rejects.toThrow(
              `'${target.offender}' (1 row(s))`,
            );

            expect(
              (await columnState(queryRunner, target.table, target.column))
                .udtName,
            ).toBe('varchar');
          },
        );
      });
    }
  });

  describe('the case-fold path for transaction_type', () => {
    it('converges an uppercase member to its lowercase enum member', async () => {
      await withReconcileEnumSchema(
        'mig_1818_casefold',
        async ({ queryRunner, role }) => {
          await createTargetTable(
            queryRunner,
            'customer_point_transactions',
            role,
          );
          await queryRunner.query(
            `INSERT INTO customer_point_transactions (transaction_type, origin, type) VALUES ('EARN', 'POS', 'earn')`,
          );

          await expect(migration.up(queryRunner)).resolves.not.toThrow();

          const rows = (await queryRunner.query(
            `SELECT transaction_type::text AS txn, origin::text AS org, type::text AS typ
               FROM customer_point_transactions`,
          )) as Array<{ txn: string; org: string; typ: string }>;
          expect(rows[0]).toEqual({ txn: 'earn', org: 'POS', typ: 'earn' });

          expect(
            (
              await columnState(
                queryRunner,
                'customer_point_transactions',
                'transaction_type',
              )
            ).udtName,
          ).toBe('customer_point_transactions_transaction_type_enum');
        },
      );
    });

    it('still fails closed for a value that is a member in no case', async () => {
      await withReconcileEnumSchema(
        'mig_1818_casefold_bad',
        async ({ queryRunner, role }) => {
          await createTargetTable(
            queryRunner,
            'customer_point_transactions',
            role,
          );
          await queryRunner.query(
            `INSERT INTO customer_point_transactions (transaction_type, type) VALUES ('refund', 'earn')`,
          );

          await expect(migration.up(queryRunner)).rejects.toThrow(
            /'refund' \(1 row\(s\)\)/,
          );
          expect(
            (
              await columnState(
                queryRunner,
                'customer_point_transactions',
                'transaction_type',
              )
            ).udtName,
          ).toBe('varchar');
        },
      );
    });
  });

  describe('INITIAL_STOCK is a member of the kardex enum', () => {
    it('converts a movement_type row holding INITIAL_STOCK', async () => {
      await withReconcileEnumSchema(
        'mig_1818_initial',
        async ({ queryRunner, role }) => {
          await createTargetTable(queryRunner, 'inventory_kardex', role);
          await queryRunner.query(
            `INSERT INTO inventory_kardex (movement_type) VALUES ('INITIAL_STOCK')`,
          );

          await expect(migration.up(queryRunner)).resolves.not.toThrow();

          const rows = (await queryRunner.query(
            'SELECT movement_type::text AS value FROM inventory_kardex',
          )) as Array<{ value: string }>;
          expect(rows[0].value).toBe('INITIAL_STOCK');
          expect(
            (
              await columnState(
                queryRunner,
                'inventory_kardex',
                'movement_type',
              )
            ).udtName,
          ).toBe('inventory_kardex_movement_type_enum');
        },
      );
    });
  });
});
