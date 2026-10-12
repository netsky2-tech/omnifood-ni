import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T2b: database-enforced Loyalty ledger identity constraints.
 *
 * Applies the V1 identity rules of docs/loyalty/loyalty_architecture_spec.md
 * §9.3 to customer_point_transactions with NO legacy exemption (user decision:
 * the §9.3 `legacy_imported` escape hatch is deliberately not reproduced).
 * On customer_point_transactions it now:
 *
 *   1. Normalizes `legacy_imported` (1795000000000 created it nullable while
 *      the entity declares a non-null default): NULL rows are backfilled to
 *      false and the column becomes NOT NULL DEFAULT false. The backfill is a
 *      NULL-value NORMALIZATION of column shape, not a history rewrite: no
 *      timestamp, amount, or classification a legacy row already carries is
 *      altered. `legacy_imported` remains purely a classification marker
 *      (true = imported by the legacy Batch 14.3 import); it exempts no row
 *      from any identity or CHECK below. Because no index predicate
 *      references this column, the backfill cannot expose or hide any
 *      duplicate: identity membership is independent of the marker.
 *   2. Adds `ck_loyalty_tx_type_semantics` (the §9.3 key-semantics CHECK,
 *      including the EARN `loyalty_program_id` clause the spec states in
 *      ck_loyalty_tx_v1_shape) with a fail-closed pre-detection scan. The
 *      CHECK requires, for EVERY row (legacy-classified or not): a non-null
 *      `transaction_type`; EARN rows to carry non-null `ticket_id` AND
 *      `loyalty_program_id`; REDEEM rows non-null `ticket_id`; REVERSAL rows
 *      non-null `reversal_of_transaction_id`. NULL `transaction_type` rows
 *      fail the CHECK (fail closed). The remaining §9.3 units/version/
 *      snapshot clauses are a tracked follow-up, not silently dropped.
 *   3. Creates the four spec-named partial unique identities covering ALL
 *      rows:
 *
 *        uq_loyalty_tx_idempotency         (tenant_id, idempotency_key)
 *                                          WHERE idempotency_key IS NOT NULL
 *        uq_loyalty_earn_ticket_program    (tenant_id, ticket_id, loyalty_program_id)
 *                                          WHERE transaction_type = 'earn'
 *        uq_loyalty_redeem_ticket          (tenant_id, ticket_id)
 *                                          WHERE transaction_type = 'redeem'
 *        uq_loyalty_reversal_original      (tenant_id, reversal_of_transaction_id)
 *                                          WHERE transaction_type = 'reversal'
 *
 *      Only the idempotency identity is partial on a nullable key, exactly as
 *      §9.3 defines that identity. The EARN/REDEEM/REVERSAL predicates need
 *      no NULL guards on their key columns: ck_loyalty_tx_type_semantics has
 *      already made those key parts non-null for the rows the predicates
 *      select, and PostgreSQL unique indexes treat NULL key parts as distinct
 *      regardless. Because no predicate references `legacy_imported`, no
 *      `true`-classified, NULL, or otherwise marked row evades an identity.
 *      Predicate case follows the migrated schema: 1809180000000 converted
 *      transaction_type to `customer_point_transactions_transaction_type_enum`
 *      whose members are the LOWERCASE forms the ledger writer persists; the
 *      spec's 'EARN'/'REDEEM'/'REVERSAL' are its SQLite textual forms.
 *   4. Detects index-definition drift before each CREATE. Index names are
 *      schema-unique, so the lookup is by index name against ANY relation in
 *      the current schema, not only this table: a same-named index on a
 *      different relation would make `CREATE UNIQUE INDEX IF NOT EXISTS`
 *      silently no-op and leave this table without the identity. A
 *      definitionally matching but INVALID index (indisvalid = false, e.g.
 *      left by a failed CREATE INDEX CONCURRENTLY) is drift too: it would be
 *      silently skipped while enforcing nothing.
 *
 * FAIL-CLOSED DUPLICATE/VIOLATION DETECTION: before each CREATE (and before
 * the CHECK), a scan counts the rows that would violate the rule and aborts
 * with a readable error naming the violated rule, the offending group/row
 * counts and sample row ids. Rows that violate the V1 shape — including
 * legacy-classified rows — abort the migration for operator resolution; that
 * is the accepted procedure. This migration never deletes, rewrites, or
 * silently skips ledger rows; the only row write it performs is the
 * documented `legacy_imported` NULL backfill.
 *
 * TRANSACTION BOUNDARY (precise): when executed through the TypeORM
 * migrator, migrations run inside a transaction, so a throw rolls both the
 * schema changes and the backfill back. When up() is invoked directly on a
 * query runner (as the db specs do for pre-seeded failure scenarios) there
 * is no implicit transaction: statements issued before the throw persist
 * unless the caller wraps them. The migration therefore orders every guard
 * strictly before the mutation it protects and never relies on rollback to
 * undo its own partial state.
 *
 * Tracked follow-ups (deliberately NOT fixed here): `tenant_id` is uuid in
 * the database since 1809140000000 but the entity still declares varchar —
 * entity/db type parity is a tracked follow-up, and the identity indexes are
 * unaffected because they compare column values, not column types.
 *
 * Rollback: down() drops the CHECK and the four indexes and restores the
 * pre-migration nullable `legacy_imported` shape. The backfilled false
 * values remain (a normalization cannot be un-applied); no row is ever
 * deleted or rewritten on the way down. down() restores no exemption,
 * because up() created none: while they existed the identities covered all
 * rows.
 */

const TABLE = 'customer_point_transactions';
const LEGACY_COLUMN = 'legacy_imported';
const CHECK_NAME = 'ck_loyalty_tx_type_semantics';
const MAX_SAMPLE_IDS = 10;

interface LedgerIdentity {
  name: string;
  columns: readonly string[];
  predicate: string;
}

const IDENTITIES: readonly LedgerIdentity[] = [
  {
    name: 'uq_loyalty_tx_idempotency',
    columns: ['tenant_id', 'idempotency_key'],
    predicate: 'idempotency_key IS NOT NULL',
  },
  {
    name: 'uq_loyalty_earn_ticket_program',
    columns: ['tenant_id', 'ticket_id', 'loyalty_program_id'],
    predicate: "transaction_type = 'earn'",
  },
  {
    name: 'uq_loyalty_redeem_ticket',
    columns: ['tenant_id', 'ticket_id'],
    predicate: "transaction_type = 'redeem'",
  },
  {
    name: 'uq_loyalty_reversal_original',
    columns: ['tenant_id', 'reversal_of_transaction_id'],
    predicate: "transaction_type = 'reversal'",
  },
];

/** Readable rule text per offending kind reported by the semantics scan. */
const SEMANTICS_RULE_BY_KIND: Record<string, string> = {
  NULL: 'transaction_type must be non-null',
  earn: 'EARN requires non-null ticket_id and loyalty_program_id',
  redeem: 'REDEEM requires non-null ticket_id',
  reversal: 'REVERSAL requires non-null reversal_of_transaction_id',
};

interface ConflictStats {
  occurrences: number;
  offender_count: number;
  sample_ids: string[];
}

/**
 * TypeORM hands pg array values through as raw Postgres literals
 * ("{a,b}"), so accept both a real array and its literal text form. Column
 * names here are plain identifiers, so a literal parse is exact; anything
 * unexpected fails the drift comparison closed.
 */
const parseColumnList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === 'string') {
    return value
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((entry) => entry.trim().replace(/^"|"$/g, ''))
      .filter((entry) => entry.length > 0);
  }
  return [];
};

/**
 * Canonicalizes a stored predicate expression (pg_get_expr renders enum
 * literals with an explicit cast, e.g. 'earn'::<enum type>) so authored and
 * stored forms compare equal when they mean the same thing.
 */
const normalizePredicate = (sql: string): string =>
  sql
    .replace(/::[a-zA-Z_][a-zA-Z_0-9]*/g, '')
    .replace(/[\s()]/g, '')
    .toLowerCase();

export class EnforceLoyaltyLedgerIdentityConstraints1809650000000 implements MigrationInterface {
  name = 'EnforceLoyaltyLedgerIdentityConstraints1809650000000';

  /**
   * Shared conflict scan. PostgreSQL unique indexes treat NULL as distinct,
   * so the scan excludes NULL keyed rows and counts exactly the conflicts
   * the CREATE would reject. The scan never mutates rows.
   */
  private async findIdentityConflicts(
    runner: QueryRunner,
    identity: LedgerIdentity,
  ): Promise<ConflictStats | null> {
    const keyList = identity.columns.join(', ');
    const nullGuards = identity.columns
      .map((column) => ` AND ${column} IS NOT NULL`)
      .join('');

    const rows = (await runner.query(
      // The leading comment carries the identity name so the guard is
      // traceable in logs, pg_stat_activity, and slow-query captures.
      `/* ${identity.name} duplicate scan */
       WITH per_key AS (
         SELECT id, ${keyList},
                count(*) OVER (PARTITION BY ${keyList}) AS group_size
           FROM ${TABLE}
          WHERE ${identity.predicate}${nullGuards}
       )
       SELECT (SELECT count(*)::int FROM per_key WHERE group_size > 1) AS occurrences,
              (SELECT count(*)::int FROM (
                 SELECT DISTINCT ${keyList} FROM per_key WHERE group_size > 1
               ) AS conflicting_groups) AS offender_count,
              (SELECT (array_agg(id ORDER BY id))[1:${MAX_SAMPLE_IDS}]
                 FROM per_key WHERE group_size > 1) AS sample_ids`,
    )) as ConflictStats[];

    if (rows.length === 0 || rows[0].occurrences === 0) {
      return null;
    }

    return rows[0];
  }

  /** Fails closed when pre-existing rows would violate the identity. */
  private async assertNoIdentityConflicts(
    runner: QueryRunner,
    identity: LedgerIdentity,
  ): Promise<void> {
    const conflict = await this.findIdentityConflicts(runner, identity);

    if (conflict === null) {
      return;
    }

    const {
      offender_count: offenderCount,
      occurrences,
      sample_ids: sampleIds,
    } = conflict;

    throw new Error(
      `LOYALTY_LEDGER_DUPLICATE_IDENTITY: cannot create ${identity.name} on ${TABLE}. ` +
        `${offenderCount} conflicting key group(s), ${occurrences} row(s) in conflict; ` +
        `sample row ids: ${sampleIds.join(', ')}. Resolve these duplicate ledger rows ` +
        `(deduplicate or re-key them) before retrying; every row is covered by this identity — ` +
        `${LEGACY_COLUMN} grants no exemption — and this migration will not delete, rewrite, or skip them.`,
    );
  }

  /**
   * Normalizes `legacy_imported` before any guard or index runs, so the
   * guards and index predicates operate on the final column semantics. The
   * backfill is a normalization of a nullable pre-1795 column, not a history
   * rewrite (see the module docblock). No pre-scan is needed: no identity or
   * CHECK predicate below references `legacy_imported`, so the backfill
   * cannot expose, hide, or create any violation.
   */
  private async normalizeLegacyImported(runner: QueryRunner): Promise<void> {
    await runner.query(
      `/* ${LEGACY_COLUMN} null backfill: NULL-value normalization, not a history rewrite */\n` +
        `UPDATE ${TABLE} SET ${LEGACY_COLUMN} = false WHERE ${LEGACY_COLUMN} IS NULL`,
    );
    await runner.query(
      `ALTER TABLE ${TABLE} ALTER COLUMN ${LEGACY_COLUMN} SET NOT NULL`,
    );
    await runner.query(
      `ALTER TABLE ${TABLE} ALTER COLUMN ${LEGACY_COLUMN} SET DEFAULT false`,
    );
  }

  /**
   * Fails closed when any row (legacy-classified or not) violates the §9.3
   * key semantics, reporting one line per violated rule with counts and
   * sample row ids.
   */
  private async assertTypeSemanticsHold(runner: QueryRunner): Promise<void> {
    const rows = (await runner.query(
      `/* ${CHECK_NAME} pre-detection scan */
       SELECT coalesce(transaction_type::text, 'NULL') AS kind,
              count(*)::int AS occurrences,
              (array_agg(id ORDER BY id))[1:${MAX_SAMPLE_IDS}] AS sample_ids
         FROM ${TABLE}
        WHERE transaction_type IS NULL
           OR (transaction_type = 'earn'
               AND (ticket_id IS NULL OR loyalty_program_id IS NULL))
           OR (transaction_type = 'redeem' AND ticket_id IS NULL)
           OR (transaction_type = 'reversal' AND reversal_of_transaction_id IS NULL)
        GROUP BY transaction_type
        ORDER BY coalesce(transaction_type::text, 'NULL') COLLATE "C"`,
    )) as Array<{ kind: string; occurrences: number; sample_ids: string[] }>;

    if (rows.length === 0) {
      return;
    }

    const detail = rows
      .map((row) => {
        const rule =
          SEMANTICS_RULE_BY_KIND[row.kind] ?? 'unknown violation kind';
        return `${row.kind}: ${row.occurrences} row(s) — ${rule}; sample row ids: ${row.sample_ids.join(', ')}`;
      })
      .join('; ');

    throw new Error(
      `LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION: cannot add ${CHECK_NAME} on ${TABLE}. ` +
        `${rows.length} violated rule kind(s); rows are missing the identity keys the CHECK enforces ` +
        `(transaction_type NOT NULL; EARN needs ticket_id AND loyalty_program_id; REDEEM needs ticket_id; ` +
        `REVERSAL needs reversal_of_transaction_id): ${detail}. Resolve these rows (complete their ` +
        `identity keys or re-classify them) before retrying; every row is covered — ${LEGACY_COLUMN} ` +
        `grants no exemption — and this migration will not delete, rewrite, or skip them.`,
    );
  }

  /** Adds the CHECK unless a same-named constraint already exists (idempotent re-run). */
  private async addTypeSemanticsConstraint(runner: QueryRunner): Promise<void> {
    const existing = (await runner.query(
      `SELECT 1 FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.conname = '${CHECK_NAME}'
          AND t.relname = '${TABLE}'
          AND n.nspname = current_schema()`,
    )) as unknown[];

    if (existing.length > 0) {
      return;
    }

    // Enforced for every row: NULL transaction_type fails the first clause
    // (fail closed), and legacy_imported grants no exemption.
    await runner.query(
      `ALTER TABLE ${TABLE} ADD CONSTRAINT ${CHECK_NAME} CHECK (
         transaction_type IS NOT NULL
         AND (transaction_type <> 'earn'
              OR (ticket_id IS NOT NULL AND loyalty_program_id IS NOT NULL))
         AND (transaction_type <> 'redeem' OR ticket_id IS NOT NULL)
         AND (transaction_type <> 'reversal' OR reversal_of_transaction_id IS NOT NULL)
       )`,
    );
  }

  /**
   * Fails closed when a same-named index already exists anywhere in the
   * current schema with anything other than the authored, valid definition:
   * index names are schema-unique, so `CREATE UNIQUE INDEX IF NOT EXISTS`
   * would silently no-op over a synchronize-built drift, a same-named index
   * on a different relation, or an INVALID (non-enforcing) index.
   */
  private async assertIndexDefinitionMatches(
    runner: QueryRunner,
    identity: LedgerIdentity,
  ): Promise<void> {
    const rows = (await runner.query(
      `/* ${identity.name} definition check */
       SELECT tc.relname AS relation,
              i.indisvalid,
              i.indisunique,
              pg_get_expr(i.indpred, i.indrelid) AS predicate,
              (SELECT array_agg(a.attname ORDER BY k.ord)
                 FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a
                   ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS columns
         FROM pg_index i
         JOIN pg_class ic ON ic.oid = i.indexrelid
         JOIN pg_namespace n ON n.oid = ic.relnamespace
         JOIN pg_class tc ON tc.oid = i.indrelid
        WHERE ic.relname = '${identity.name}'
          AND n.nspname = current_schema()`,
    )) as Array<{
      relation: string;
      indisvalid: boolean;
      indisunique: boolean;
      predicate: string | null;
      columns: unknown;
    }>;

    if (rows.length === 0) {
      return;
    }

    const found = rows[0];

    if (found.relation !== TABLE) {
      throw new Error(
        `LOYALTY_LEDGER_INDEX_DRIFT: an index named ${identity.name} already exists on relation ` +
          `'${found.relation}' in the current schema, not on ${TABLE} (index names are schema-unique). ` +
          `CREATE UNIQUE INDEX IF NOT EXISTS would silently no-op over it and leave ${TABLE} without ` +
          `this identity; drop or rename the other index first.`,
      );
    }

    const foundColumns = parseColumnList(found.columns);
    const expectedColumns = identity.columns.join(', ');
    const definitionMatches =
      found.indisunique === true &&
      foundColumns.length === identity.columns.length &&
      identity.columns.every(
        (column, position) => foundColumns[position] === column,
      ) &&
      found.predicate !== null &&
      normalizePredicate(found.predicate) ===
        normalizePredicate(identity.predicate);

    if (definitionMatches && found.indisvalid === true) {
      return;
    }

    throw new Error(
      `LOYALTY_LEDGER_INDEX_DRIFT: an index named ${identity.name} already exists on ${TABLE} ` +
        `with a different or invalid definition than the authored one (expected UNIQUE (${expectedColumns}) ` +
        `WHERE ${identity.predicate}; found UNIQUE=${found.indisunique}, VALID=${found.indisvalid}, ` +
        `columns=(${foundColumns.join(', ') || 'none'}), predicate=${found.predicate ?? 'none'}). ` +
        `CREATE UNIQUE INDEX IF NOT EXISTS would silently no-op over this drift` +
        (found.indisvalid === false
          ? ` and the existing index is INVALID (enforces nothing; typical of a failed CREATE INDEX CONCURRENTLY)`
          : '') +
        `; reconcile or rename the drifted index first.`,
    );
  }

  async up(runner: QueryRunner): Promise<void> {
    await this.normalizeLegacyImported(runner);
    await this.assertTypeSemanticsHold(runner);
    await this.addTypeSemanticsConstraint(runner);

    for (const identity of IDENTITIES) {
      await this.assertNoIdentityConflicts(runner, identity);
      await this.assertIndexDefinitionMatches(runner, identity);
      await runner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${identity.name}\n` +
          `  ON ${TABLE} (${identity.columns.join(', ')})\n` +
          `  WHERE ${identity.predicate}`,
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${CHECK_NAME}`,
    );

    for (const identity of IDENTITIES) {
      await runner.query(`DROP INDEX IF EXISTS ${identity.name}`);
    }

    // Restores the pre-migration nullable column shape; the backfilled false
    // values remain by design (a normalization cannot be un-applied).
    await runner.query(
      `ALTER TABLE ${TABLE} ALTER COLUMN ${LEGACY_COLUMN} DROP NOT NULL`,
    );
  }
}
