import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T4 residual follow-up (owner option A): enforce the §9.3 shape clauses that
 * match the SHIPPED ledger contract, deferring only the version/snapshot
 * clauses that the shipped writers legitimately do not carry (T4 writes
 * reward-less REDEEM rows and snapshot-less EARN rows by the fail-safe design
 * approved in #882; the spec's stricter REDEEM/EARN clauses are documented as
 * deferred in odd/tasks/loyalty-s93-residual-checks.md, not silently dropped).
 *
 * Adds `ck_loyalty_tx_v1_shape_residual` on customer_point_transactions, for
 * EVERY row (1809650000000 already made `transaction_type` NOT NULL, so this
 * CHECK only ever sees declared V1 rows):
 *
 *   - EARN:    units NOT NULL AND units > 0
 *   - REDEEM:  units NOT NULL AND units < 0
 *   - ADJUST:  units NOT NULL AND units <> 0
 *              AND actor_user_id NOT NULL AND btrim(reason) <> ''
 *   - REVERSAL: units IS NULL OR units <> 0
 *              (units NULL is the legitimate legacy-mirror case: reversing a
 *              pre-V1 row whose original carried no units; what a reversal
 *              must never do is claim a zero delta)
 *   - every row: idempotency_key NOT NULL (the writers always mint or carry
 *     one; this closes the "declared row without a dedupe identity" hole)
 *   - `occurred_at` stays deliberately UNENFORCED here: the POS local rows do
 *     not persist occurred_at (the §13.4 sender derives it from created_at on
 *     the wire), so a NOT NULL CHECK would abort legitimate ingest rows.
 *
 * Fail-closed pre-detection: before the ALTER, one scan per clause reports
 * the violated clause kind, offending counts and up to 10 sample row ids.
 * Ledger rows are never deleted, rewritten, or skipped.
 *
 * Rollback: down() drops the CHECK. No data or other schema element is
 * touched.
 */

const TABLE = 'customer_point_transactions';
const CHECK_NAME = 'ck_loyalty_tx_v1_shape_residual';

interface ResidualRule {
  kind: string;
  predicate: string;
  ruleText: string;
}

const RESIDUAL_RULES: readonly ResidualRule[] = [
  {
    kind: 'earn_units',
    predicate: "transaction_type = 'earn' AND (units IS NULL OR units <= 0)",
    ruleText: 'declared EARN requires units > 0',
  },
  {
    kind: 'redeem_units',
    predicate: "transaction_type = 'redeem' AND (units IS NULL OR units >= 0)",
    ruleText: 'declared REDEEM requires units < 0',
  },
  {
    kind: 'adjust_units',
    predicate: "transaction_type = 'adjust' AND (units IS NULL OR units = 0)",
    ruleText: 'declared ADJUST requires non-zero units',
  },
  {
    kind: 'reversal_units',
    predicate: "transaction_type = 'reversal' AND units = 0",
    ruleText:
      'declared REVERSAL requires non-zero units (NULL mirrors a legacy original)',
  },
  {
    kind: 'declared_key',
    predicate: 'idempotency_key IS NULL',
    ruleText: 'every declared row requires a non-null idempotency_key',
  },
  {
    kind: 'adjust_actor_reason',
    predicate:
      "transaction_type = 'adjust' AND (actor_user_id IS NULL OR btrim(COALESCE(reason, '')) = '')",
    ruleText: 'declared ADJUST requires an actor and a non-blank reason',
  },
];

export class EnforceLoyaltyLedgerV1ShapeResidualConstraints1809750000000 implements MigrationInterface {
  name = 'EnforceLoyaltyLedgerV1ShapeResidualConstraints1809750000000';

  /** Fails closed when existing rows would violate the residual clauses. */
  private async assertResidualRulesHold(runner: QueryRunner): Promise<void> {
    const violations: string[] = [];
    for (const rule of RESIDUAL_RULES) {
      const rows = (await runner.query(
        `/* ${CHECK_NAME} pre-detection scan: ${rule.kind} */
         SELECT COUNT(*) AS occurrences,
                (SELECT array_agg(id ORDER BY id) FROM (
                   SELECT id FROM ${TABLE}
                    WHERE ${rule.predicate}
                    ORDER BY id
                    LIMIT 10
                 ) AS offending) AS sample_ids
           FROM ${TABLE}
          WHERE ${rule.predicate}`,
      )) as Array<{
        occurrences: string | number;
        sample_ids: string[] | null;
      }>;
      const occurrences = Number(rows[0].occurrences);
      if (occurrences === 0) {
        continue;
      }
      violations.push(
        `${rule.kind}: ${occurrences} row(s) — ${rule.ruleText}; ` +
          `sample row ids: ${(rows[0].sample_ids ?? []).join(', ')}`,
      );
    }
    if (violations.length > 0) {
      throw new Error(
        `LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION: cannot add ${CHECK_NAME} on ${TABLE}. ` +
          `${violations.length} violated residual rule kind(s); offending rows are: ` +
          `${violations.join('; ')}. Resolve these rows (fix their units sign, ` +
          `complete their idempotency key, or re-classify them per ` +
          `docs/loyalty/loyalty_legacy_remediation_runbook_v1.0.md) before ` +
          `retrying; this migration will not delete, rewrite, or skip them.`,
      );
    }
  }

  /** Adds the CHECK unless a same-named constraint already exists (idempotent re-run). */
  private async addResidualConstraint(runner: QueryRunner): Promise<void> {
    const existing = (await runner.query(
      `/* ${CHECK_NAME} existence check */
       SELECT 1 FROM pg_constraint
        WHERE conname = '${CHECK_NAME}'
          AND conrelid = '${TABLE}'::regclass`,
    )) as unknown[];
    if (existing.length > 0) {
      return;
    }

    // Enforced for every row: 1809650000000 has already made
    // transaction_type NOT NULL, so every row here is a declared V1 row.
    await runner.query(
      `ALTER TABLE ${TABLE} ADD CONSTRAINT ${CHECK_NAME} CHECK (
         (transaction_type <> 'earn' OR (units IS NOT NULL AND units > 0))
         AND (transaction_type <> 'redeem' OR (units IS NOT NULL AND units < 0))
         AND (transaction_type <> 'adjust'
              OR (units IS NOT NULL AND units <> 0
                  AND actor_user_id IS NOT NULL
                  AND btrim(COALESCE(reason, '')) <> ''))
         AND (transaction_type <> 'reversal' OR units IS DISTINCT FROM 0)
         AND idempotency_key IS NOT NULL
       )`,
    );
  }

  async up(runner: QueryRunner): Promise<void> {
    await this.assertResidualRulesHold(runner);
    await this.addResidualConstraint(runner);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${CHECK_NAME}`,
    );
  }
}
