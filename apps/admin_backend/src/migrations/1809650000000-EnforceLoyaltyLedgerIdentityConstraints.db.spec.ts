import { randomUUID } from 'crypto';
import { readdirSync } from 'fs';
import { resolve } from 'path';
import { DataSource, type QueryRunner } from 'typeorm';
import { EnforceLoyaltyLedgerIdentityConstraints1809650000000 } from './1809650000000-EnforceLoyaltyLedgerIdentityConstraints';

/**
 * DB acceptance for T2b. The schema under test is built exclusively by the
 * real migration set (TypeORM migrations ledger included) inside a fresh
 * scratch database, exactly like a migrated production environment — same
 * recipe as 1809210000000's db spec (a scratch DATABASE, not a search_path
 * schema, because structured-API migrations resolve existence against the
 * connection's schema).
 *
 *   - Full set incl. 1809650000000: each of the four spec-named ledger
 *     identities rejects a duplicate with a unique violation, while
 *     tenant-scoping (same key, other tenant) still inserts. The
 *     EARN/REDEEM/REVERSAL identities cover ALL rows: legacy_imported is a
 *     classification marker only and grants no exemption.
 *   - Full set: ck_loyalty_tx_type_semantics rejects NULL-keyed
 *     EARN/REDEEM/REVERSAL rows, EARN rows with NULL loyalty_program_id, and
 *     rows with NULL transaction_type (fail closed), for legacy-classified
 *     and non-legacy rows alike.
 *   - Full set: the legacy_imported normalization (NULL backfill + NOT NULL
 *     DEFAULT false) closes the NULL evasion path for newly written rows.
 *   - Set capped at 1809210000000 (pre-constraint migrated shape) seeded
 *     with a duplicate: running 1809650000000's up() fails closed with the
 *     readable identity-naming error and leaves every row intact.
 *   - Set capped at 1809210000000 seeded with type-semantics violations
 *     (NULL-keyed EARN and NULL transaction_type): up() fails closed naming
 *     ck_loyalty_tx_type_semantics and each violated rule, rows untouched.
 *   - Set capped at 1809210000000 holding a same-named drifted index: up()
 *     detects the definition drift and rolls back closed instead of letting
 *     CREATE UNIQUE INDEX IF NOT EXISTS silently no-op over it.
 *   - Drift false-negative class 1: a same-named index on a DIFFERENT
 *     relation (index names are schema-unique) is detected as drift.
 *   - down() removes the CHECK and the indexes (a duplicate inserts again),
 *     restores nullable legacy_imported, and a re-run of up() restores
 *     enforcement idempotently.
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
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const CUSTOMER = '33333333-3333-3333-3333-333333333333';
const PROGRAM = '44444444-4444-4444-4444-444444444444';

interface TxRow {
  tenantId: string;
  transactionType: string | null;
  units: number;
  ticketId?: string | null;
  loyaltyProgramId?: string | null;
  reversalOf?: string | null;
  idempotencyKey?: string | null;
  legacyImported?: boolean | null;
}

const lit = (value: string | boolean | undefined | null): string =>
  value === undefined || value === null ? 'NULL' : `'${value}'`;

/** Renders legacy_imported: undefined -> false default, null -> SQL NULL. */
const legacyImportedLiteral = (value: boolean | null | undefined): string =>
  value === undefined ? 'false' : value === null ? 'NULL' : String(value);

/** Inserts one ledger row through the migrated table's real column shape. */
async function insertTx(
  queryRunner: QueryRunner,
  row: TxRow,
): Promise<{ id: string }> {
  const result = (await queryRunner.query(
    `INSERT INTO customer_point_transactions (
       tenant_id, customer_id, transaction_type, units,
       ticket_id, loyalty_program_id, reversal_of_transaction_id,
       idempotency_key, legacy_imported
     ) VALUES (
       '${row.tenantId}',
       '${CUSTOMER}',
       ${lit(row.transactionType ?? null)},
       ${row.units},
       ${lit(row.ticketId ?? null)},
       ${lit(row.loyaltyProgramId ?? null)},
       ${lit(row.reversalOf ?? null)},
       ${lit(row.idempotencyKey ?? null)},
       ${legacyImportedLiteral(row.legacyImported)}
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

async function indexExists(
  queryRunner: QueryRunner,
  name: string,
): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = '${name}'`,
  )) as unknown[];

  return rows.length > 0;
}

const IDENTITY_COLUMNS = [
  'uq_loyalty_tx_idempotency',
  'uq_loyalty_earn_ticket_program',
  'uq_loyalty_redeem_ticket',
  'uq_loyalty_reversal_original',
] as const;

describe('EnforceLoyaltyLedgerIdentityConstraints1809650000000 (db)', () => {
  const TEST_TIMEOUT_MS = 180000;
  const isDbTest = Boolean(process.env.DB_PASSWORD);
  const itDb = isDbTest ? it : it.skip;

  itDb(
    'rejects a duplicate of each of the four ledger identities after migration',
    async () => {
      await withMigrationBuiltDatabase(
        'loyalty_identity_enforced',
        null,
        async (queryRunner) => {
          for (const indexName of IDENTITY_COLUMNS) {
            expect(await indexExists(queryRunner, indexName)).toBe(true);
          }

          await insertTx(queryRunner, {
            tenantId: TENANT_A,
            transactionType: 'earn',
            units: 10,
            ticketId: 'ticket-1',
            loyaltyProgramId: PROGRAM,
            idempotencyKey: 'idem-1',
          });
          const reversalTarget = await insertTx(queryRunner, {
            tenantId: TENANT_A,
            transactionType: 'redeem',
            units: -5,
            ticketId: 'ticket-2',
            idempotencyKey: 'idem-2',
          });
          const firstReversal = await insertTx(queryRunner, {
            tenantId: TENANT_A,
            transactionType: 'reversal',
            units: -10,
            reversalOf: reversalTarget.id,
            idempotencyKey: 'idem-rev-1',
          });
          expect(firstReversal.id).toBeDefined();

          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: 'earn',
              units: 10,
              ticketId: 'ticket-1',
              loyaltyProgramId: PROGRAM,
              idempotencyKey: 'idem-dup-idem',
            }),
          ).rejects.toThrow(/uq_loyalty_earn_ticket_program/);

          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: 'earn',
              units: 4,
              ticketId: 'ticket-3',
              loyaltyProgramId: PROGRAM,
              idempotencyKey: 'idem-1',
            }),
          ).rejects.toThrow(/uq_loyalty_tx_idempotency/);

          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: 'redeem',
              units: -1,
              ticketId: 'ticket-2',
              idempotencyKey: 'idem-dup-redeem',
            }),
          ).rejects.toThrow(/uq_loyalty_redeem_ticket/);

          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: 'reversal',
              units: -10,
              reversalOf: reversalTarget.id,
              idempotencyKey: 'idem-dup-reversal',
            }),
          ).rejects.toThrow(/uq_loyalty_reversal_original/);

          // Tenant-scoped identity: the same idempotency key under another
          // tenant must still insert, and rows in conflict with no identity
          // (different ticket, non-legacy) keep inserting.
          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_B,
              transactionType: 'earn',
              units: 10,
              ticketId: 'ticket-1',
              loyaltyProgramId: PROGRAM,
              idempotencyKey: 'idem-1',
            }),
          ).resolves.toBeDefined();

          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: 'earn',
              units: 1,
              ticketId: 'ticket-4',
              loyaltyProgramId: PROGRAM,
              reversalOf: reversalTarget.id,
              idempotencyKey: 'idem-distinct',
            }),
          ).resolves.toBeDefined();
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'CHECK rejects NULL-keyed EARN, REDEEM and REVERSAL rows, NULL EARN program, and NULL transaction_type',
    async () => {
      await withMigrationBuiltDatabase(
        'loyalty_identity_check_semantics',
        null,
        async (queryRunner) => {
          // EARN without ticket_id must be rejected by
          // ck_loyalty_tx_type_semantics.
          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: 'earn',
              units: 5,
              ticketId: null,
              loyaltyProgramId: PROGRAM,
              idempotencyKey: 'idem-check-earn',
            }),
          ).rejects.toThrow(/ck_loyalty_tx_type_semantics/);

          // EARN with a ticket but NULL loyalty_program_id is equally
          // rejected: the EARN identity needs both key parts.
          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: 'earn',
              units: 5,
              ticketId: 'ticket-no-program',
              loyaltyProgramId: null,
              idempotencyKey: 'idem-check-earn-program',
            }),
          ).rejects.toThrow(/ck_loyalty_tx_type_semantics/);

          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: 'redeem',
              units: -5,
              ticketId: null,
              idempotencyKey: 'idem-check-redeem',
            }),
          ).rejects.toThrow(/ck_loyalty_tx_type_semantics/);

          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: 'reversal',
              units: -5,
              ticketId: 'ticket-rev',
              reversalOf: null,
              idempotencyKey: 'idem-check-reversal',
            }),
          ).rejects.toThrow(/ck_loyalty_tx_type_semantics/);

          // NULL transaction_type fails the CHECK (fail closed), even when
          // the row carries every other V1 key.
          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: null,
              units: 5,
              ticketId: 'ticket-null-type',
              loyaltyProgramId: PROGRAM,
              idempotencyKey: 'idem-check-null-type',
            }),
          ).rejects.toThrow(/ck_loyalty_tx_type_semantics/);

          expect(await ledgerRowCount(queryRunner)).toBe(0);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'legacy_imported normalization closes the NULL path; legacy classification grants no exemption',
    async () => {
      await withMigrationBuiltDatabase(
        'loyalty_identity_legacy_normalized',
        null,
        async (queryRunner) => {
          // Normalization outcome: no NULL row survived the backfill and the
          // column is NOT NULL, so a newly written row can no longer evade
          // the three identities by omitting legacy_imported.
          const nullRows = (await queryRunner.query(
            'SELECT count(*)::int AS total FROM customer_point_transactions WHERE legacy_imported IS NULL',
          )) as Array<{ total: number }>;
          expect(nullRows[0].total).toBe(0);

          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: 'earn',
              units: 5,
              ticketId: 'ticket-evade',
              loyaltyProgramId: PROGRAM,
              idempotencyKey: 'idem-evade-1',
              legacyImported: null,
            }),
          ).rejects.toThrow(/legacy_imported/);

          // With the column forced to its non-null semantics, a duplicate
          // EARN identity is rejected even when the writer never mentions
          // legacy_imported (both rows take the false default).
          await insertTx(queryRunner, {
            tenantId: TENANT_A,
            transactionType: 'earn',
            units: 10,
            ticketId: 'ticket-enforced',
            loyaltyProgramId: PROGRAM,
            idempotencyKey: 'idem-enforced-1',
          });

          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: 'earn',
              units: 10,
              ticketId: 'ticket-enforced',
              loyaltyProgramId: PROGRAM,
              idempotencyKey: 'idem-enforced-2',
            }),
          ).rejects.toThrow(/uq_loyalty_earn_ticket_program/);

          // NO legacy exemption: the same duplicate shaped as a
          // legacy-classified row (legacy_imported = true, the value
          // LegacyClassificationService sets) is rejected by the same
          // identity — the user decision removed the §9.3 escape hatch.
          await expect(
            insertTx(queryRunner, {
              tenantId: TENANT_A,
              transactionType: 'earn',
              units: 10,
              ticketId: 'ticket-enforced',
              loyaltyProgramId: PROGRAM,
              idempotencyKey: 'idem-legacy-dup',
              legacyImported: true,
            }),
          ).rejects.toThrow(/uq_loyalty_earn_ticket_program/);

          expect(await ledgerRowCount(queryRunner)).toBe(1);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'fails closed on a pre-existing duplicate and leaves every row untouched',
    async () => {
      await withMigrationBuiltDatabase(
        'loyalty_identity_legacy_duplicate',
        // Rebind and enum convergence applied, identity constraints not yet:
        // the exact pre-T2b migrated shape.
        1809210000000,
        async (queryRunner) => {
          const first = await insertTx(queryRunner, {
            tenantId: TENANT_A,
            transactionType: 'earn',
            units: 10,
            ticketId: 'ticket-legacy',
            loyaltyProgramId: PROGRAM,
            idempotencyKey: 'idem-legacy-1',
          });
          const second = await insertTx(queryRunner, {
            tenantId: TENANT_A,
            transactionType: 'earn',
            units: 10,
            ticketId: 'ticket-legacy',
            loyaltyProgramId: PROGRAM,
            idempotencyKey: 'idem-legacy-2',
          });

          const migration =
            new EnforceLoyaltyLedgerIdentityConstraints1809650000000();

          await expect(migration.up(queryRunner)).rejects.toThrow(
            /LOYALTY_LEDGER_DUPLICATE_IDENTITY[\s\S]*uq_loyalty_earn_ticket_program[\s\S]*1 conflicting key group\(s\), 2 row\(s\)[\s\S]*sample row ids/,
          );

          // Never delete or rewrite: both duplicate rows survive with their
          // original ids, and the failed identity's index does not exist.
          const ids = (await queryRunner.query(
            'SELECT id FROM customer_point_transactions ORDER BY id',
          )) as Array<{ id: string }>;

          expect(await ledgerRowCount(queryRunner)).toBe(2);
          expect(ids.map((row) => row.id).sort()).toEqual(
            [first.id, second.id].sort(),
          );
          expect(
            await indexExists(queryRunner, 'uq_loyalty_earn_ticket_program'),
          ).toBe(false);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'fails closed on pre-existing type-semantics violations and leaves every row untouched',
    async () => {
      await withMigrationBuiltDatabase(
        'loyalty_identity_semantics_violation',
        1809210000000,
        async (queryRunner) => {
          const violating = await insertTx(queryRunner, {
            tenantId: TENANT_A,
            transactionType: 'earn',
            units: 10,
            ticketId: null,
            loyaltyProgramId: PROGRAM,
            idempotencyKey: 'idem-no-ticket',
          });
          // A second violated rule kind: NULL transaction_type.
          const nullType = await insertTx(queryRunner, {
            tenantId: TENANT_A,
            transactionType: null,
            units: 10,
            ticketId: 'ticket-null-type',
            loyaltyProgramId: PROGRAM,
            idempotencyKey: 'idem-null-type',
          });

          const migration =
            new EnforceLoyaltyLedgerIdentityConstraints1809650000000();

          await expect(migration.up(queryRunner)).rejects.toThrow(
            /LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION[\s\S]*ck_loyalty_tx_type_semantics[\s\S]*NULL: 1 row\(s\)[\s\S]*transaction_type must be non-null[\s\S]*earn: 1 row\(s\)/,
          );

          // The violating rows are untouched, no CHECK was added, and no
          // identity index exists.
          const ids = (await queryRunner.query(
            'SELECT id FROM customer_point_transactions ORDER BY id',
          )) as Array<{ id: string }>;
          expect(ids.map((row) => row.id).sort()).toEqual(
            [violating.id, nullType.id].sort(),
          );

          const constraint = (await queryRunner.query(
            `SELECT 1 FROM pg_constraint WHERE conname = 'ck_loyalty_tx_type_semantics'`,
          )) as unknown[];
          expect(constraint).toHaveLength(0);

          for (const indexName of IDENTITY_COLUMNS) {
            expect(await indexExists(queryRunner, indexName)).toBe(false);
          }
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'detects a same-named drifted index and rolls back closed instead of silently accepting it',
    async () => {
      await withMigrationBuiltDatabase(
        'loyalty_identity_index_drift',
        1809210000000,
        async (queryRunner) => {
          const seeded = await insertTx(queryRunner, {
            tenantId: TENANT_A,
            transactionType: 'earn',
            units: 10,
            ticketId: 'ticket-drift',
            loyaltyProgramId: PROGRAM,
            idempotencyKey: 'idem-drift-1',
          });

          // A drifted schema (e.g. synchronize-built) holds a same-named
          // index with a different definition.
          await queryRunner.query(
            `CREATE UNIQUE INDEX uq_loyalty_redeem_ticket
               ON customer_point_transactions (tenant_id, idempotency_key)
               WHERE idempotency_key IS NOT NULL`,
          );

          const migration =
            new EnforceLoyaltyLedgerIdentityConstraints1809650000000();

          await queryRunner.startTransaction();
          await expect(migration.up(queryRunner)).rejects.toThrow(
            /LOYALTY_LEDGER_INDEX_DRIFT[\s\S]*uq_loyalty_redeem_ticket[\s\S]*\(tenant_id, idempotency_key\)/,
          );
          await queryRunner.rollbackTransaction();

          // The drift was not silently accepted: the drifted index keeps its
          // wrong definition, and nothing the migration started building
          // (backfill effects aside — none here) survived the rollback.
          const definitions = (await queryRunner.query(
            `SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_loyalty_redeem_ticket'`,
          )) as Array<{ indexdef: string }>;
          expect(definitions).toHaveLength(1);
          expect(definitions[0].indexdef).toContain(
            '(tenant_id, idempotency_key)',
          );

          for (const indexName of IDENTITY_COLUMNS) {
            expect(await indexExists(queryRunner, indexName)).toBe(
              indexName === 'uq_loyalty_redeem_ticket',
            );
          }

          const ids = (await queryRunner.query(
            'SELECT id FROM customer_point_transactions',
          )) as Array<{ id: string }>;
          expect(ids.map((row) => row.id)).toEqual([seeded.id]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'detects a same-named index on ANOTHER relation (drift false-negative class 1)',
    async () => {
      await withMigrationBuiltDatabase(
        'loyalty_identity_index_drift_other_relation',
        1809210000000,
        async (queryRunner) => {
          const seeded = await insertTx(queryRunner, {
            tenantId: TENANT_A,
            transactionType: 'earn',
            units: 10,
            ticketId: 'ticket-drift-other',
            loyaltyProgramId: PROGRAM,
            idempotencyKey: 'idem-drift-other-1',
          });

          // Index names are schema-unique: a same-named index on a different
          // relation makes CREATE ... IF NOT EXISTS silently no-op, so it
          // must be reported as drift.
          await queryRunner.query(
            'CREATE TABLE loyalty_drift_other (id uuid PRIMARY KEY)',
          );
          await queryRunner.query(
            `CREATE UNIQUE INDEX uq_loyalty_redeem_ticket ON loyalty_drift_other (id)`,
          );

          const migration =
            new EnforceLoyaltyLedgerIdentityConstraints1809650000000();

          await queryRunner.startTransaction();
          await expect(migration.up(queryRunner)).rejects.toThrow(
            /LOYALTY_LEDGER_INDEX_DRIFT[\s\S]*uq_loyalty_redeem_ticket[\s\S]*'loyalty_drift_other'[\s\S]*schema-unique/,
          );
          await queryRunner.rollbackTransaction();

          // The ledger table itself gained no redeem identity (the migration
          // aborted before creating it), and the seeded row is untouched.
          const onLedger = (await queryRunner.query(
            `SELECT 1 FROM pg_indexes
              WHERE tablename = 'customer_point_transactions'
                AND indexname = 'uq_loyalty_redeem_ticket'`,
          )) as unknown[];
          expect(onLedger).toHaveLength(0);

          const ids = (await queryRunner.query(
            'SELECT id FROM customer_point_transactions',
          )) as Array<{ id: string }>;
          expect(ids.map((row) => row.id)).toEqual([seeded.id]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  itDb(
    'down() drops the CHECK and indexes, restores nullability, and up() re-enforces',
    async () => {
      await withMigrationBuiltDatabase(
        'loyalty_identity_rollback',
        null,
        async (queryRunner) => {
          const migration =
            new EnforceLoyaltyLedgerIdentityConstraints1809650000000();
          const duplicatedRow = (idempotencyKey: string) => ({
            tenantId: TENANT_A,
            transactionType: 'earn' as const,
            units: 10,
            ticketId: 'ticket-rollback',
            loyaltyProgramId: PROGRAM,
            idempotencyKey,
          });

          await migration.down(queryRunner);

          for (const indexName of IDENTITY_COLUMNS) {
            expect(await indexExists(queryRunner, indexName)).toBe(false);
          }

          const constraint = (await queryRunner.query(
            `SELECT 1 FROM pg_constraint WHERE conname = 'ck_loyalty_tx_type_semantics'`,
          )) as unknown[];
          expect(constraint).toHaveLength(0);

          // Without the indexes a duplicate EARN identity inserts again
          // (distinct idempotency keys, so only the earn identity conflicts).
          await insertTx(queryRunner, duplicatedRow('idem-rollback-1'));
          await expect(
            insertTx(queryRunner, duplicatedRow('idem-rollback-2')),
          ).resolves.toBeDefined();

          // ...and re-running up() is idempotent and re-enforces identity.
          await expect(migration.up(queryRunner)).rejects.toThrow(
            /LOYALTY_LEDGER_DUPLICATE_IDENTITY[\s\S]*uq_loyalty_earn_ticket_program/,
          );

          expect(await ledgerRowCount(queryRunner)).toBe(2);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
