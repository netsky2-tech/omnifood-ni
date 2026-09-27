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
 * - Template suggestions the operator REJECTED. Discarding a suggestion is
 *   the operator's own "not prepared" answer about that product; promoting
 *   it anyway would manufacture a COMPOUND product with no live recipe —
 *   the mirror image of the defect this migration repairs. CONFIRMED
 *   (published) suggestions still promote: a published template recipe on
 *   a SIMPLE product is exactly the inert state being fixed.
 * - Template-suggested recipes with zero recipe items. Nothing proves the
 *   item is prepared.
 * - Products already COMPOUND, PREPARED or VARIANT_PARENT: only SIMPLE rows
 *   match, so the other members are never rewritten.
 *
 * Databases with zero candidates — most of them, including SOHO, never
 * applied a template — are a logged no-op, not an error.
 *
 * Idempotency: the only write is guarded by `product_type = 'SIMPLE'`, so a
 * converged database re-runs up() matching zero rows.
 *
 * down() reverses COMPOUND -> SIMPLE only for rows still matching the same
 * criterion whose template suggestion is still SUGGESTED. If the operator
 * has published (suggestion_state CONFIRMED) or discarded (REJECTED) the
 * suggestion since, that row is no longer ours to revert and is left alone:
 * a blind reversal would silently re-orphan a recipe the operator made live
 * under the SIMPLE type #612's guard then rejects. A REJECTED-suggestion
 * product never needs reverting: up() does not promote it in the first
 * place, so it never reaches COMPOUND through this migration.
 *
 * Invariants: no invoice, no fiscal_* table, no recipe row and no authority
 * table is touched — products are mutable entities in this domain. The
 * update is bounded by the join, never by a hardcoded tenant id. updated_at
 * moves honestly (the row did change; the entity declares it
 * @UpdateDateColumn).
 *
 * What the spec proves vs what real execution proves: the mock-QueryRunner
 * spec proves the emitted SQL, the guards, and the reporting logic; it is
 * structurally unable to reproduce driver result shapes. Real-clone
 * execution of this migration found exactly such a defect — TypeORM 0.3's
 * postgres driver wraps UPDATE..RETURNING in a [rows, rowCount] tuple, so
 * a raw `.length` on the query result reported a fabricated 2 in every
 * database. asReturnedRows() normalises both shapes and is the only place
 * that knows about the envelope; the reported counts are always the number
 * of rows the statement actually touched.
 */
const CRITERION = `
        EXISTS (
          SELECT 1
            FROM recipe_versions AS rv
           WHERE rv.tenant_id = p.tenant_id
             AND rv.product_id = p.id
             AND rv.origin = 'INDUSTRY_TEMPLATE'
             -- A discarded suggestion is the operator's own "not prepared"
             -- answer; promoting on it would manufacture a COMPOUND product
             -- with no live recipe. CONFIRMED (published) still promotes.
             AND rv.suggestion_state <> 'REJECTED'
             AND EXISTS (
               SELECT 1
                 FROM recipe_details AS rd
                WHERE rd.recipe_version_id = rv.id
             )
        )`;

const LOG_PREFIX = 'BackfillTemplateProductTypes1809510000000:';

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

  public async up(queryRunner: QueryRunner): Promise<void> {
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The suggestion_state guard is what makes this revert safe: publishing
    // or discarding a suggestion moves it off SUGGESTED, and such a row is
    // no longer this migration's to undo.
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
        `was published or discarded since are intentionally left untouched`,
    );
  }
}
