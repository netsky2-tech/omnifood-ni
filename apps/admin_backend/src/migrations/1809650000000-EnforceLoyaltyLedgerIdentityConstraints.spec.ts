import { type QueryRunner } from 'typeorm';
import { EnforceLoyaltyLedgerIdentityConstraints1809650000000 } from './1809650000000-EnforceLoyaltyLedgerIdentityConstraints';

/**
 * Unit acceptance for T2b: the up() SQL must add the spec-named
 * ck_loyalty_tx_type_semantics CHECK (enforced for EVERY row — no legacy
 * exemption), normalize legacy_imported to the final NOT NULL DEFAULT false
 * classification-marker semantics, and create exactly the four partial
 * unique identities named in docs/loyalty/loyalty_architecture_spec.md §9.3,
 * each guarded by fail-closed pre-detection (identity duplicates, CHECK
 * violations, index-definition drift) that never rewrites ledger rows beyond
 * the documented legacy_imported NULL backfill. down() must only drop what
 * up() added. Predicate case follows the migrated schema: 1809180000000
 * converted transaction_type to the lowercase enum members, so the spec's
 * 'EARN'/'REDEEM'/'REVERSAL' textual forms are 'earn'/'redeem'/'reversal' in
 * PostgreSQL.
 */

const INDEX_DDL: Array<{ name: string; columns: string; predicate: string }> = [
  {
    name: 'uq_loyalty_tx_idempotency',
    columns: '(tenant_id, idempotency_key)',
    predicate: 'idempotency_key IS NOT NULL',
  },
  {
    name: 'uq_loyalty_earn_ticket_program',
    columns: '(tenant_id, ticket_id, loyalty_program_id)',
    predicate: "transaction_type = 'earn'",
  },
  {
    name: 'uq_loyalty_redeem_ticket',
    columns: '(tenant_id, ticket_id)',
    predicate: "transaction_type = 'redeem'",
  },
  {
    name: 'uq_loyalty_reversal_original',
    columns: '(tenant_id, reversal_of_transaction_id)',
    predicate: "transaction_type = 'reversal'",
  },
];

const GUARD_TABLE = 'customer_point_transactions';
const LEGACY_COLUMN = 'legacy_imported';
const CHECK_NAME = 'ck_loyalty_tx_type_semantics';

const isIdentityGuard = (sql: string): boolean => sql.includes('PARTITION BY');

const isSemanticScan = (sql: string): boolean =>
  sql.includes('ticket_id IS NULL');

const isDriftCheck = (sql: string): boolean => sql.includes('pg_index');

/** Mock routing that answers every fail-closed scan as clean. */
const cleanQueryMock = (): jest.Mock =>
  jest.fn().mockImplementation((sql: string) => {
    if (isDriftCheck(sql)) {
      return Promise.resolve([]); // no same-named index exists
    }
    return Promise.resolve([]);
  });

const callOrder = (query: jest.Mock, marker: (sql: string) => boolean): number =>
  query.mock.calls.findIndex(([sql]) => typeof sql === 'string' && marker(sql));

describe('EnforceLoyaltyLedgerIdentityConstraints1809650000000 (unit)', () => {
  const migration = new EnforceLoyaltyLedgerIdentityConstraints1809650000000();

  it('reports the migration name required by the migrations ledger', () => {
    expect(migration.name).toBe(
      'EnforceLoyaltyLedgerIdentityConstraints1809650000000',
    );
  });

  it('normalizes legacy_imported before any guard or index runs', async () => {
    const query = cleanQueryMock();
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const backfill = callOrder(
      query,
      (sql) => sql.includes(`UPDATE ${GUARD_TABLE}`) && sql.includes(`SET ${LEGACY_COLUMN} = false`),
    );
    const setNotNull = callOrder(query, (sql) => sql.includes('SET NOT NULL'));
    const setDefault = callOrder(query, (sql) => sql.includes('SET DEFAULT false'));
    const firstIdentityGuard = callOrder(query, isIdentityGuard);
    const firstCreate = callOrder(query, (sql) => sql.includes('CREATE UNIQUE INDEX'));

    expect(backfill).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeLessThan(firstIdentityGuard);
    expect(backfill).toBeLessThan(firstCreate);
    expect(setNotNull).toBeGreaterThan(backfill);
    expect(setDefault).toBeGreaterThan(setNotNull);

    const backfillSql = query.mock.calls[backfill][0] as string;
    expect(backfillSql).toContain('WHERE legacy_imported IS NULL');
    expect(backfillSql).toContain('normalization, not a history rewrite');
  });

  it('fails closed when any row violates the type-semantics CHECK keys', async () => {
    const query = cleanQueryMock();
    const queryRunner = { query } as unknown as QueryRunner;
    // Re-route only the semantic scan to report an offending earn row.
    query.mockImplementation((sql: string) => {
      if (isSemanticScan(sql)) {
        return Promise.resolve([
          { kind: 'earn', occurrences: 1, sample_ids: ['cccccccc-...1'] },
        ]);
      }
      if (isDriftCheck(sql)) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    await expect(migration.up(queryRunner)).rejects.toThrow(
      /LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION[\s\S]*ck_loyalty_tx_type_semantics[\s\S]*earn: 1 row\(s\)[\s\S]*cccccccc-\.\.\.1/,
    );

    expect(
      query.mock.calls.some(
        ([sql]) => typeof sql === 'string' && sql.includes('ADD CONSTRAINT'),
      ),
    ).toBe(false);
    expect(
      query.mock.calls.some(
        ([sql]) => typeof sql === 'string' && sql.includes('CREATE UNIQUE INDEX'),
      ),
    ).toBe(false);
  });

  it('fails closed on NULL transaction_type rows, naming the violated rule', async () => {
    const query = cleanQueryMock();
    const queryRunner = { query } as unknown as QueryRunner;
    query.mockImplementation((sql: string) => {
      if (isSemanticScan(sql)) {
        return Promise.resolve([
          { kind: 'NULL', occurrences: 2, sample_ids: ['dddddddd-...1', 'dddddddd-...2'] },
        ]);
      }
      if (isDriftCheck(sql)) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    await expect(migration.up(queryRunner)).rejects.toThrow(
      /LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION[\s\S]*NULL: 2 row\(s\)[\s\S]*transaction_type must be non-null[\s\S]*dddddddd-\.\.\.1/,
    );

    // Fail closed: no CHECK and no index may follow the violation.
    expect(
      query.mock.calls.some(
        ([sql]) => typeof sql === 'string' && sql.includes('ADD CONSTRAINT'),
      ),
    ).toBe(false);
    expect(
      query.mock.calls.some(
        ([sql]) => typeof sql === 'string' && sql.includes('CREATE UNIQUE INDEX'),
      ),
    ).toBe(false);
  });

  it('adds ck_loyalty_tx_type_semantics covering every row with no legacy exemption', async () => {
    const query = cleanQueryMock();
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const addConstraint = query.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes(`ADD CONSTRAINT ${CHECK_NAME}`),
    );
    expect(addConstraint).toHaveLength(1);

    const sql = addConstraint[0][0] as string;
    // transaction_type must be non-null (NULL rows fail closed).
    expect(sql).toContain('transaction_type IS NOT NULL');
    // EARN needs ticket_id AND loyalty_program_id.
    expect(sql).toContain("transaction_type <> 'earn'");
    expect(sql).toContain('ticket_id IS NOT NULL AND loyalty_program_id IS NOT NULL');
    // REDEEM needs ticket_id; REVERSAL needs reversal_of_transaction_id.
    expect(sql).toContain("transaction_type <> 'redeem' OR ticket_id IS NOT NULL");
    expect(sql).toContain(
      "transaction_type <> 'reversal' OR reversal_of_transaction_id IS NOT NULL",
    );
    // No legacy escape hatch: the CHECK never references legacy_imported.
    expect(sql).not.toContain(LEGACY_COLUMN);

    // Guard ordering: the semantic scan precedes the ADD CONSTRAINT.
    const scan = callOrder(query, isSemanticScan);
    expect(scan).toBeGreaterThanOrEqual(0);
    expect(scan).toBeLessThan(callOrder(query, (s) => s.includes('ADD CONSTRAINT')));
  });

  it('skips the CHECK when a same-named constraint already exists (idempotent re-run)', async () => {
    const query = cleanQueryMock();
    const queryRunner = { query } as unknown as QueryRunner;
    query.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('pg_constraint') ? [[1]] : []),
    );

    await migration.up(queryRunner);

    expect(
      query.mock.calls.some(
        ([sql]) => typeof sql === 'string' && sql.includes('ADD CONSTRAINT'),
      ),
    ).toBe(false);
  });

  it('scans every identity for duplicates before creating any index, fail-closed', async () => {
    const query = cleanQueryMock();
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const guardCalls = query.mock.calls.filter(([sql]) => isIdentityGuard(sql as string));

    expect(guardCalls).toHaveLength(INDEX_DDL.length);

    for (const [index, identity] of INDEX_DDL.entries()) {
      const sql = guardCalls[index][0] as string;
      expect(sql).toContain(`FROM ${GUARD_TABLE}`);
      expect(sql).toContain(identity.predicate);
      expect(sql).toContain('group_size > 1');
      expect(sql).toContain(`/* ${identity.name} duplicate scan */`);
      // Mirrors NULL-distinct unique index semantics.
      expect(sql).toContain('IS NOT NULL');
    }
  });

  it('creates identities whose EARN/REDEEM/REVERSAL predicates cover all rows (no legacy clause)', async () => {
    const query = cleanQueryMock();
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const createCalls = query.mock.calls.filter(
      ([sql]) =>
        typeof sql === 'string' && sql.includes('CREATE UNIQUE INDEX'),
    );

    expect(createCalls).toHaveLength(INDEX_DDL.length);

    for (const [index, identity] of INDEX_DDL.entries()) {
      const sql = createCalls[index][0] as string;
      expect(sql).toContain(`IF NOT EXISTS ${identity.name}`);
      expect(sql).toContain(`ON ${GUARD_TABLE} ${identity.columns}`);
      expect(sql).toContain(`WHERE ${identity.predicate}`);
      // No predicate may exempt any row via the classification marker.
      expect(sql).not.toContain(LEGACY_COLUMN);
    }
    // Only the spec-defined nullable-key identity stays partial on a key.
    const earn = createCalls[1][0] as string;
    expect(earn).toBe(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_earn_ticket_program\n` +
        `  ON ${GUARD_TABLE} (tenant_id, ticket_id, loyalty_program_id)\n` +
        `  WHERE transaction_type = 'earn'`,
    );
  });

  it('never deletes or inserts rows; the only row write is the legacy_imported backfill', async () => {
    const query = cleanQueryMock();
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const mutatingCalls = query.mock.calls.filter(([sql]) => {
      const text = sql as string;
      return /\bDELETE\b|\bINSERT\b|\bUPDATE\b/i.test(text);
    });

    expect(mutatingCalls).toHaveLength(1);
    const text = mutatingCalls[0][0] as string;
    expect(text).toContain('UPDATE');
    expect(text).toContain('SET legacy_imported = false');
    expect(text).toContain('WHERE legacy_imported IS NULL');
    expect(text).not.toContain('DROP');
  });

  it('aborts naming the identity, offending counts and sample ids when duplicates exist', async () => {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (isIdentityGuard(sql)) {
        // Guards emit in IDENTITIES order; only the earn identity (second
        // guard, keyed by ticket_id + loyalty_program_id) finds offenders.
        return Promise.resolve(
          sql.includes('ticket_id, loyalty_program_id')
            ? [
                {
                  occurrences: 2,
                  offender_count: 1,
                  sample_ids: ['aaaaaaaa-...1', 'aaaaaaaa-...2'],
                },
              ]
            : [],
        );
      }
      if (isDriftCheck(sql)) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    const queryRunner = { query } as unknown as QueryRunner;

    await expect(migration.up(queryRunner)).rejects.toThrow(
      /uq_loyalty_earn_ticket_program[\s\S]*2 row\(s\)[\s\S]*aaaaaaaa-\.\.\.1/,
    );

    // Fail closed: no CREATE UNIQUE INDEX may follow a failed guard.
    const createdAfterThrow = query.mock.calls.filter(
      ([sql]) =>
        typeof sql === 'string' && sql.includes('CREATE UNIQUE INDEX'),
    );
    expect(createdAfterThrow).toHaveLength(1); // only idempotency, before the failure
  });

  it('detects a drifted same-named index on this table instead of silently accepting it', async () => {
    const query = cleanQueryMock();
    const queryRunner = { query } as unknown as QueryRunner;
    // The redeem identity's catalog lookup returns a same-named index on the
    // ledger table with a different definition (wrong columns, no
    // predicate), e.g. built by synchronize on a drifted schema.
    query.mockImplementation((sql: string) => {
      if (isDriftCheck(sql) && sql.includes('uq_loyalty_redeem_ticket')) {
        return Promise.resolve([
          {
            relation: GUARD_TABLE,
            indisvalid: true,
            indisunique: true,
            predicate: null,
            columns: ['tenant_id', 'idempotency_key'],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    await expect(migration.up(queryRunner)).rejects.toThrow(
      /LOYALTY_LEDGER_INDEX_DRIFT[\s\S]*uq_loyalty_redeem_ticket[\s\S]*\(tenant_id, idempotency_key\)/,
    );

    // Fail closed: no CREATE for the drifted identity.
    const createdRedeem = query.mock.calls.some(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('CREATE UNIQUE INDEX uq_loyalty_redeem_ticket'),
    );
    expect(createdRedeem).toBe(false);
  });

  it('detects a same-named index on another relation (drift false-negative class 1)', async () => {
    const query = cleanQueryMock();
    const queryRunner = { query } as unknown as QueryRunner;
    // Index names are schema-unique: a same-named index on a DIFFERENT
    // relation would still make CREATE ... IF NOT EXISTS silently no-op.
    query.mockImplementation((sql: string) => {
      if (isDriftCheck(sql) && sql.includes('uq_loyalty_redeem_ticket')) {
        return Promise.resolve([
          {
            relation: 'some_other_table',
            indisvalid: true,
            indisunique: true,
            predicate: 'id IS NOT NULL',
            columns: ['id'],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    await expect(migration.up(queryRunner)).rejects.toThrow(
      /LOYALTY_LEDGER_INDEX_DRIFT[\s\S]*uq_loyalty_redeem_ticket[\s\S]*'some_other_table'[\s\S]*schema-unique/,
    );

    const createdRedeem = query.mock.calls.some(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('CREATE UNIQUE INDEX uq_loyalty_redeem_ticket'),
    );
    expect(createdRedeem).toBe(false);
  });

  it('treats a definitionally matching but INVALID index as drift (drift false-negative class 2)', async () => {
    const query = cleanQueryMock();
    const queryRunner = { query } as unknown as QueryRunner;
    // The catalog returns the exact authored definition, but the index is
    // INVALID (e.g. left by a failed CREATE INDEX CONCURRENTLY): it enforces
    // nothing, and CREATE ... IF NOT EXISTS would silently skip it.
    query.mockImplementation((sql: string) => {
      if (isDriftCheck(sql) && sql.includes('uq_loyalty_redeem_ticket')) {
        return Promise.resolve([
          {
            relation: GUARD_TABLE,
            indisvalid: false,
            indisunique: true,
            predicate: "transaction_type = 'redeem'",
            columns: ['tenant_id', 'ticket_id'],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    await expect(migration.up(queryRunner)).rejects.toThrow(
      /LOYALTY_LEDGER_INDEX_DRIFT[\s\S]*uq_loyalty_redeem_ticket[\s\S]*VALID=false[\s\S]*INVALID/,
    );

    const createdRedeem = query.mock.calls.some(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('CREATE UNIQUE INDEX uq_loyalty_redeem_ticket'),
    );
    expect(createdRedeem).toBe(false);
  });

  it('down() drops the CHECK and the four indexes and restores column nullability', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledTimes(INDEX_DDL.length + 2);

    expect(query.mock.calls[0][0]).toBe(
      `ALTER TABLE ${GUARD_TABLE} DROP CONSTRAINT IF EXISTS ${CHECK_NAME}`,
    );
    for (const [index, identity] of INDEX_DDL.entries()) {
      expect(query.mock.calls[index + 1][0]).toBe(
        `DROP INDEX IF EXISTS ${identity.name}`,
      );
    }
    expect(query.mock.calls[INDEX_DDL.length + 1][0]).toBe(
      `ALTER TABLE ${GUARD_TABLE} ALTER COLUMN ${LEGACY_COLUMN} DROP NOT NULL`,
    );
  });
});
