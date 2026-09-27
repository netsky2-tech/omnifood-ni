import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #610 Part A — backfill product_type for products created from an industry
 * template before #523 T1 made the application path type-aware.
 *
 * The code path is already correct: applying a template creates its products
 * with `product_type = resolveTemplateProductType(source)`, which returns
 * COMPOUND when the template row carries recipe items. What is left is data:
 * products created by an earlier application sit at the entity default
 * SIMPLE while their template-suggested recipe carries a bill of materials.
 * Because #612's publish guard rejects a live recipe on a SIMPLE product,
 * those suggestions exist and cannot be published — the exact stuck state
 * #523 was built to avoid.
 *
 * The criterion is the same signal the application uses: an
 * INDUSTRY_TEMPLATE-origin recipe version carrying at least one recipe item
 * (a recipe_details row). A template-authored bill of materials is the
 * definition of COMPOUND in this platform; it is not a guess about the
 * business.
 *
 * Deliberately excluded:
 * - MANUAL-origin recipes. Those products are issue #611's operator
 *   decision; a human typed them, and #611's sold invoice lines make the
 *   business fact consequential. This migration never reads a MANUAL row.
 * - Template suggestions in state REJECTED. No discard endpoint exists today
 *   (the write paths only ever set SUGGESTED at template creation and
 *   CONFIRMED at publish), so this filter is forward-defence for the discard
 *   path #523 T3 will build, not a present-day guard. Its semantics once
 *   that path exists: a discarded suggestion is the operator's "not
 *   prepared" answer about the product, and promoting it anyway would
 *   manufacture a COMPOUND product with no live recipe — the mirror image
 *   of the defect this migration repairs. CONFIRMED (published) suggestions
 *   still promote: a published template recipe on a SIMPLE product is
 *   exactly the inert state being fixed.
 * - Template-suggested recipes with zero recipe items. Nothing proves the
 *   item is prepared.
 * - Products already COMPOUND, PREPARED or VARIANT_PARENT: only SIMPLE rows
 *   match, so the other members are never rewritten.
 *
 * Unknown suggestion_state values: the column is varchar(64) with no CHECK
 * constraint, so a value outside the three known members is possible in
 * principle. up() would promote such a row (the filter is a blacklist of
 * REJECTED only) and down() would never revert it. A whitelist of the known
 * members would be worse: a future legitimate state would then be silently
 * skipped. No code guards against this; the risk is accepted and named.
 *
 * Databases with zero candidates — most of them, including SOHO, never
 * applied a template — are a logged no-op, not an error.
 *
 * Idempotency: the only write is guarded by `product_type = 'SIMPLE'`, so a
 * converged database re-runs up() matching zero rows.
 *
 * down() reverses COMPOUND -> SIMPLE only for rows still matching the same
 * criterion whose template suggestion is still SUGGESTED. If the operator
 * has published (suggestion_state CONFIRMED) the suggestion since, that row
 * is no longer ours to revert and is left alone: a blind reversal would
 * silently re-orphan a recipe the operator made live under the SIMPLE type
 * #612's guard then rejects. Two asymmetries are deliberate and named:
 * - up() accepts SUGGESTED or CONFIRMED; down() reverts only SUGGESTED. A
 *   CONFIRMED promotion is therefore not revertible by design — the
 *   operator confirmed the recipe, and it is live.
 * - down() matches EVERY COMPOUND row meeting the criterion with a
 *   SUGGESTED suggestion, including products the application itself created
 *   as COMPOUND with a suggested recipe after #609 — rows up() never
 *   promoted. No provenance ledger exists to exclude them (audit_logs is
 *   the business/DGI-adjacent trail, not a migration scratchpad), so the
 *   over-revert is accepted: it is transient, because a subsequent up()
 *   re-promotes anything down() wrongly downgraded, and the exposure is the
 *   window between revert and re-run.
 *
 * FORCE ROW LEVEL SECURITY bracket. products, recipe_versions and
 * recipe_details are all relforcerowsecurity = true, and the migration role
 * is their table OWNER: per the precedent in
 * 1809180000000-ReconcileEnumColumns, an owner is subject to RLS too, and
 * no app.tenant_id is bound during a migration, so the tenant predicate
 * evaluates to NULL and under FORCE the criterion silently sees ZERO rows —
 * up() would log a no-op on exactly the databases it exists to repair, and
 * down() would revert nothing. Both directions therefore issue
 * `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` on all three tables before
 * their data work and restore `FORCE` in a `finally`, so a throw can never
 * leave a table deniable. NO FORCE lifts the row predicate only for the
 * table owner (the migration role); non-owner app roles remain fully
 * tenant-scoped by their policies throughout. Unlike the precedent, this
 * migration cannot lean on an ACCESS EXCLUSIVE lock argument — its UPDATE
 * takes ROW EXCLUSIVE — so the window is stated on its own terms: for the
 * duration of this migration's own transaction the owner's reads and writes
 * on these three tables are not filtered by the (otherwise NULL-evaluating)
 * tenant predicate, and the bracket restores FORCE before the transaction
 * can commit. TypeORM runs each migration inside a transaction, so a throw
 * restores FORCE in-transaction and a crash rolls the transaction back.
 *
 * What the spec proves vs what real execution proves: the mock-QueryRunner
 * spec proves the emitted SQL, the guards, the reporting logic and the
 * bracket ordering; it is structurally unable to reproduce driver result
 * shapes or role/RLS behaviour. Real-clone execution found one defect of
 * each kind — TypeORM 0.3's postgres driver wraps UPDATE..RETURNING in a
 * [rows, rowCount] tuple, so a raw `.length` reported a fabricated 2 in
 * every database (asReturnedRows() normalises both shapes and is the only
 * place that knows about the envelope; the reported counts are always the
 * number of rows the statement actually touched) — and the clone run itself
 * connected as a bypassing superuser, so it proved SQL execution and the
 * promotion predicate against real rows but did NOT prove the
 * production-role path: under FORCE RLS the real migration role sees zero
 * candidates. The NO FORCE / restore-FORCE bracket above is what closes
 * that gap, and the production-position experiment (non-superuser owner,
 * NOBYPASSRLS) is what demonstrated it.
 */
const RLS_TABLES = ['products', 'recipe_versions', 'recipe_details'] as const;

const CRITERION = `
        EXISTS (
          SELECT 1
            FROM recipe_versions AS rv
           WHERE rv.tenant_id = p.tenant_id
             AND rv.product_id = p.id
             AND rv.origin = 'INDUSTRY_TEMPLATE'
             -- Forward-defence for the discard path #523 T3 will build (no
             -- discard endpoint exists today): once it does, promoting a
             -- REJECTED suggestion would manufacture a COMPOUND product with
             -- no live recipe. CONFIRMED (published) still promotes.
             AND rv.suggestion_state <> 'REJECTED'
             AND EXISTS (
               SELECT 1
                 FROM recipe_details AS rd
                WHERE rd.recipe_version_id = rv.id
             )
        )`;

const LOG_PREFIX = 'BackfillTemplateProductTypes1809510000000:';

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

interface ReturnedRow {
  id: string;
}

/**
 * Normalises an UPDATE..RETURNING result to its rows. TypeORM 0.3's postgres
 * driver returns a [rows, rowCount] tuple; other drivers and the mock used
 * in the spec return a flat row array. Trusting `.length` on the raw result
 * reported the tuple length (always 2) instead of the row count — a defect
 * real-clone execution exposed. This helper is the single place that decodes
 * the envelope, shared by up() and down().
 */
const asReturnedRows = (raw: unknown): ReturnedRow[] => {
  if (Array.isArray(raw) && Array.isArray(raw[0])) {
    return raw[0] as ReturnedRow[];
  }
  return Array.isArray(raw) ? (raw as ReturnedRow[]) : [];
};

export class BackfillTemplateProductTypes1809510000000 implements MigrationInterface {
  name = 'BackfillTemplateProductTypes1809510000000';

  /**
   * Reads relforcerowsecurity for one table: when true, the table owner (the
   * migration role) is subject to RLS and, with no app.tenant_id bound,
   * sees zero rows — the same trap 1809180000000-ReconcileEnumColumns
   * documented.
   */
  private async isForceRowLevelSecurity(
    runner: QueryRunner,
    table: string,
  ): Promise<boolean> {
    const rows = (await runner.query(
      `SELECT c.relforcerowsecurity AS forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relname = $1`,
      [table],
    )) as Array<{ forced: boolean }>;

    return rows.length > 0 && rows[0].forced === true;
  }

  /**
   * Lifts FORCE RLS on every table that has it and returns the list lifted,
   * so restoreForceRowLevelSecurity() re-forces exactly those tables. See
   * the header: without this, the owner's criterion silently sees zero rows.
   */
  private async liftForceRowLevelSecurity(
    runner: QueryRunner,
  ): Promise<string[]> {
    const lifted: string[] = [];
    for (const table of RLS_TABLES) {
      if (await this.isForceRowLevelSecurity(runner, table)) {
        await runner.query(
          `ALTER TABLE ${quoteIdentifier(table)} NO FORCE ROW LEVEL SECURITY`,
        );
        lifted.push(table);
      }
    }
    return lifted;
  }

  private async restoreForceRowLevelSecurity(
    runner: QueryRunner,
    lifted: readonly string[],
  ): Promise<void> {
    for (const table of lifted) {
      await runner.query(
        `ALTER TABLE ${quoteIdentifier(table)} FORCE ROW LEVEL SECURITY`,
      );
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const lifted = await this.liftForceRowLevelSecurity(queryRunner);
    try {
      const candidateRows = (await queryRunner.query(`
        SELECT count(*)::int AS candidates
          FROM products AS p
         WHERE p.product_type = 'SIMPLE'
           AND ${CRITERION}
      `)) as Array<{ candidates: number }>;

      const candidates = Number(candidateRows[0]?.candidates ?? 0);
      if (candidates === 0) {
        // Most databases never applied an industry template: nothing to
        // converge, and erroring would block every unrelated migration.
        console.log(
          `${LOG_PREFIX} no candidate products (SIMPLE products with an ` +
            `INDUSTRY_TEMPLATE-origin recipe carrying recipe items); nothing to do`,
        );
        return;
      }

      const promoted = asReturnedRows(
        await queryRunner.query(`
        UPDATE products AS p
           SET product_type = 'COMPOUND',
               updated_at = now()
         WHERE p.product_type = 'SIMPLE'
           AND ${CRITERION}
        RETURNING p.id
      `),
      );

      console.log(
        `${LOG_PREFIX} promoted ${promoted.length} product(s) from SIMPLE to ` +
          `COMPOUND (template-authored recipe with recipe items)`,
      );
    } finally {
      await this.restoreForceRowLevelSecurity(queryRunner, lifted);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The suggestion_state guard bounds this revert: publishing a suggestion
    // moves it off SUGGESTED, and such a row is no longer this migration's
    // to undo. The header documents the accepted over-revert of app-created
    // COMPOUND products and the SUGGESTED/CONFIRMED asymmetry.
    const lifted = await this.liftForceRowLevelSecurity(queryRunner);
    try {
      const reverted = asReturnedRows(
        await queryRunner.query(`
        UPDATE products AS p
           SET product_type = 'SIMPLE',
               updated_at = now()
         WHERE p.product_type = 'COMPOUND'
           AND EXISTS (
             SELECT 1
               FROM recipe_versions AS rv
              WHERE rv.tenant_id = p.tenant_id
                AND rv.product_id = p.id
                AND rv.origin = 'INDUSTRY_TEMPLATE'
                AND rv.suggestion_state = 'SUGGESTED'
                AND EXISTS (
                  SELECT 1
                    FROM recipe_details AS rd
                   WHERE rd.recipe_version_id = rv.id
                )
           )
        RETURNING p.id
      `),
      );

      console.log(
        `${LOG_PREFIX} reverted ${reverted.length} product(s) from COMPOUND to ` +
          `SIMPLE (template suggestion still SUGGESTED); rows whose suggestion ` +
          `was published since are intentionally left untouched`,
      );
    } finally {
      await this.restoreForceRowLevelSecurity(queryRunner, lifted);
    }
  }
}
