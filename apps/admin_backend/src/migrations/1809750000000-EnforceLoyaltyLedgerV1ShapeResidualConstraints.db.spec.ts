import { randomUUID } from 'crypto';
import { readdirSync } from 'fs';
import { resolve } from 'path';
import { DataSource, type QueryRunner } from 'typeorm';
import { EnforceLoyaltyLedgerV1ShapeResidualConstraints1809750000000 } from './1809750000000-EnforceLoyaltyLedgerV1ShapeResidualConstraints';

/**
 * DB acceptance for the residual §9.3 shape clauses (owner option A, issue
 * #892 — the dedicated db spec the 1809750000000 header deferred). Same
 * recipe as 1809650000000's db spec: a fresh scratch DATABASE built by the
 * real migration set, exactly like a migrated production environment.
 *
 *   - Full set incl. 1809750000000: ck_loyalty_tx_v1_shape_residual rejects
 *     every shipped-contract residual violation — EARN with zero/negative
 *     units, REDEEM with non-negative units, ADJUST with zero units,
 *     REVERSAL claiming a zero delta, and a declared row without an
 *     idempotency key — while every conforming shape still inserts,
 *     including the REVERSAL with NULL units (the legitimate legacy mirror
 *     of a pre-V1 original) and an ADJUST with a blank reason rejected via
 *     actor/reason clause.
 *   - Set capped at 1809650000000 (pre-residual) seeded with an offending
 *     row (declared EARN, units 0): running 1809750000000's up() fails
 *     closed with LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION naming the
 *     earn_units clause and the sample row id, rows untouched.
 *   - down() drops the CHECK (an offending row inserts again); a re-run of
 *     up() restores enforcement idempotently.
 */
function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for DB-backed migration tests`);
  }

  return value;
}

const adminConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? '5432'),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

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
  maxTimestamp: number | null,
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
      migrations: collectMigrationPaths(maxTimestamp),
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
const CUSTOMER = '33333333-3333-3333-3333-333333333333';
const PROGRAM = '44444444-4444-4444-4444-444444444444';
const ACTOR = '55555555-5555-5555-5555-555555555555';

interface TxRow {
  transactionType: string | null;
  units: number | null;
  ticketId?: string | null;
  loyaltyProgramId?: string | null;
  reversalOf?: string | null;
  idempotencyKey?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
}

const lit = (value: string | undefined | null): string =>
  value === undefined || value === null ? 'NULL' : `'${value}'`;

const num = (value: number | null): string =>
  value === null ? 'NULL' : String(value);

async function insertTx(
  queryRunner: QueryRunner,
  row: TxRow,
): Promise<{ id: string }> {
  const result = (await queryRunner.query(
    `INSERT INTO customer_point_transactions (
       tenant_id, customer_id, transaction_type, units,
       ticket_id, loyalty_program_id, reversal_of_transaction_id,
       idempotency_key, actor_user_id, reason
     ) VALUES (
       '${TENANT_A}',
       '${CUSTOMER}',
       ${lit(row.transactionType)},
       ${num(row.units)},
       ${lit(row.ticketId ?? null)},
       ${lit(row.loyaltyProgramId ?? null)},
       ${lit(row.reversalOf ?? null)},
       ${lit(row.idempotencyKey ?? null)},
       ${lit(row.actorUserId ?? null)},
       ${lit(row.reason ?? null)}
     ) RETURNING id`,
  )) as Array<{ id: string }>;

  return result[0];
}

async function ledgerRowCount(queryRunner: QueryRunner): Promise<number> {
  const rows = (await queryRunner.query(
    'SELECT count(*)::int AS total FROM customer_point_transactions',
  )) as Array<{ total: number }>;

  return rows[0].total;
}

async function checkExists(
  queryRunner: QueryRunner,
  name: string,
): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM pg_constraint
      WHERE conname = '${name}'
        AND conrelid = 'customer_point_transactions'::regclass`,
  )) as unknown[];

  return rows.length > 0;
}

describe('EnforceLoyaltyLedgerV1ShapeResidualConstraints1809750000000 (db)', () => {
  const TEST_TIMEOUT_MS = 180000;
  const isDbTest = Boolean(process.env.DB_PASSWORD);
  const itDb = isDbTest ? it : it.skip;

  itDb(
    'rejects every residual shape violation and accepts every conforming shape',
    async () => {
      await withMigrationBuiltDatabase(
        'loyalty_residual_enforced',
        null,
        async (queryRunner) => {
          expect(
            await checkExists(queryRunner, 'ck_loyalty_tx_v1_shape_residual'),
          ).toBe(true);

          // Conforming shapes insert.
          await insertTx(queryRunner, {
            transactionType: 'earn',
            units: 10,
            ticketId: 'ticket-1',
            loyaltyProgramId: PROGRAM,
            idempotencyKey: 'idem-1',
          });
          await insertTx(queryRunner, {
            transactionType: 'redeem',
            units: -5,
            ticketId: 'ticket-2',
            idempotencyKey: 'idem-2',
          });
          const original = await insertTx(queryRunner, {
            transactionType: 'redeem',
            units: -3,
            ticketId: 'ticket-3',
            idempotencyKey: 'idem-3',
          });
          await insertTx(queryRunner, {
            transactionType: 'reversal',
            units: -3,
            reversalOf: original.id,
            idempotencyKey: 'idem-4',
          });
          // The legacy mirror: reversing a pre-V1 original with no units.
          // A different original: the reversal identity allows exactly one
          // reversal per reversed movement.
          const legacyOriginal = await insertTx(queryRunner, {
            transactionType: 'redeem',
            units: -2,
            ticketId: 'ticket-4',
            idempotencyKey: 'idem-5',
          });
          await insertTx(queryRunner, {
            transactionType: 'reversal',
            units: null,
            reversalOf: legacyOriginal.id,
            idempotencyKey: 'idem-6',
          });
          await insertTx(queryRunner, {
            transactionType: 'adjust',
            units: 7,
            actorUserId: ACTOR,
            reason: 'manual adjustment',
            idempotencyKey: 'idem-7',
          });
          expect(await ledgerRowCount(queryRunner)).toBe(7);

          // EARN: zero and negative units rejected.
          await expect(
            insertTx(queryRunner, {
              transactionType: 'earn',
              units: 0,
              ticketId: 'ticket-9',
              loyaltyProgramId: PROGRAM,
              idempotencyKey: 'idem-bad-1',
            }),
          ).rejects.toThrow(/ck_loyalty_tx_v1_shape_residual/);
          await expect(
            insertTx(queryRunner, {
              transactionType: 'earn',
              units: -5,
              ticketId: 'ticket-9',
              loyaltyProgramId: PROGRAM,
              idempotencyKey: 'idem-bad-2',
            }),
          ).rejects.toThrow(/ck_loyalty_tx_v1_shape_residual/);

          // REDEEM: zero and positive units rejected.
          await expect(
            insertTx(queryRunner, {
              transactionType: 'redeem',
              units: 0,
              ticketId: 'ticket-9',
              idempotencyKey: 'idem-bad-3',
            }),
          ).rejects.toThrow(/ck_loyalty_tx_v1_shape_residual/);
          await expect(
            insertTx(queryRunner, {
              transactionType: 'redeem',
              units: 5,
              ticketId: 'ticket-9',
              idempotencyKey: 'idem-bad-4',
            }),
          ).rejects.toThrow(/ck_loyalty_tx_v1_shape_residual/);

          // ADJUST: zero units rejected; blank reason rejected.
          await expect(
            insertTx(queryRunner, {
              transactionType: 'adjust',
              units: 0,
              actorUserId: ACTOR,
              reason: 'manual adjustment',
              idempotencyKey: 'idem-bad-5',
            }),
          ).rejects.toThrow(/ck_loyalty_tx_v1_shape_residual/);
          await expect(
            insertTx(queryRunner, {
              transactionType: 'adjust',
              units: 3,
              actorUserId: ACTOR,
              reason: '   ',
              idempotencyKey: 'idem-bad-6',
            }),
          ).rejects.toThrow(/ck_loyalty_tx_v1_shape_residual/);

          // REVERSAL claiming a zero delta rejected (NULL mirror accepted
          // above).
          await expect(
            insertTx(queryRunner, {
              transactionType: 'reversal',
              units: 0,
              reversalOf: original.id,
              idempotencyKey: 'idem-bad-7',
            }),
          ).rejects.toThrow(/ck_loyalty_tx_v1_shape_residual/);

          // A declared row without an idempotency key rejected.
          await expect(
            insertTx(queryRunner, {
              transactionType: 'earn',
              units: 10,
              ticketId: 'ticket-9',
              loyaltyProgramId: PROGRAM,
            }),
          ).rejects.toThrow(/ck_loyalty_tx_v1_shape_residual/);

          // Fail closed never mutated the ledger.
          expect(await ledgerRowCount(queryRunner)).toBe(7);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'pre-residual set: up() fails closed naming the violated clause and sample id',
    async () => {
      await withMigrationBuiltDatabase(
        'loyalty_residual_prescan',
        1809650000000,
        async (queryRunner) => {
          await insertTx(queryRunner, {
            transactionType: 'earn',
            units: 0,
            ticketId: 'ticket-bad',
            loyaltyProgramId: PROGRAM,
            idempotencyKey: 'idem-bad-pre',
          });

          const migration =
            new EnforceLoyaltyLedgerV1ShapeResidualConstraints1809750000000();
          await expect(migration.up(queryRunner)).rejects.toThrow(
            /LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION[\s\S]*earn_units[\s\S]*sample row ids/,
          );

          // Fail closed: rows untouched, CHECK absent.
          expect(
            await checkExists(queryRunner, 'ck_loyalty_tx_v1_shape_residual'),
          ).toBe(false);
          expect(await ledgerRowCount(queryRunner)).toBe(1);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'down() drops the CHECK and a re-run of up() restores enforcement',
    async () => {
      await withMigrationBuiltDatabase(
        'loyalty_residual_down',
        null,
        async (queryRunner) => {
          const migration =
            new EnforceLoyaltyLedgerV1ShapeResidualConstraints1809750000000();

          await migration.down(queryRunner);
          expect(
            await checkExists(queryRunner, 'ck_loyalty_tx_v1_shape_residual'),
          ).toBe(false);

          // With the CHECK dropped, a residual-violating row inserts.
          await insertTx(queryRunner, {
            transactionType: 'earn',
            units: 0,
            ticketId: 'ticket-1',
            loyaltyProgramId: PROGRAM,
            idempotencyKey: 'idem-down',
          });

          // Re-running up() restores enforcement — but only after the
          // offending row is remediated (fail closed: it aborts while the
          // violation exists). Backend-side remediation FIXES the data: the
          // NULL-legacy re-classification from the POS runbook is impossible
          // here (1809650000000 requires a non-null transaction_type on
          // every row, no legacy exemption).
          await expect(migration.up(queryRunner)).rejects.toThrow(
            /LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION/,
          );
          await queryRunner.query(
            `UPDATE customer_point_transactions
                SET units = 10
              WHERE idempotency_key = 'idem-down'`,
          );
          await migration.up(queryRunner);
          expect(
            await checkExists(queryRunner, 'ck_loyalty_tx_v1_shape_residual'),
          ).toBe(true);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
