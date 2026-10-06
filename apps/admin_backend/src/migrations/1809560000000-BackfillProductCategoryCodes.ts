import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * T0.2' (extras/modifier-groups) — repair existing `products.category_code`
 * values against `catalog_values` (`SALES_PRODUCT_CATEGORY`), per tenant.
 *
 * The code path is already correct: menu-import.service.ts now upserts the
 * worksheet category against `catalog_values` and writes the canonical code
 * (its `canonicalCategoryCode()`), which is the forward fix. What is left is
 * data: products imported before that fix carry the raw worksheet name in
 * `category_code` (menu-import.service.ts:609 wrote it verbatim), so a
 * modifier group attached "by category" has no `catalog_values` row to
 * attach to. Measured in the development database, tenant SOHO had 58
 * products across 7 distinct free-text values (`CAFÉ CALIENTE`, `BEBIDAS`,
 * `CAFÉ HELADO`, `COMIDA`, `DESAYUNOS`, `BATIDOS`, `POSTRES`) and zero
 * `SALES_PRODUCT_CATEGORY` rows. Production was NOT inspected, so this
 * migration is written for arbitrary tenant data, not tuned to that list.
 *
 * For each tenant, independently (never cross tenants):
 * 1. Read the distinct non-empty `products.category_code` values.
 * 2. Canonicalize each with the same rule as the service (see the mirrored
 *    helper below): trim, collapse internal whitespace to `_`, strip
 *    diacritics, uppercase, drop characters outside A-Z0-9_.
 * 3. If a `SALES_PRODUCT_CATEGORY` row with that code exists, reuse it and
 *    never modify its label — the label belongs to the owner (they rename it
 *    in /catalogs). If it does not exist, insert it with `label` = the
 *    original free-text value it was derived from, `is_active = true` and a
 *    deterministic `sort_order` continuing after the tenant's existing
 *    maximum (an empty catalog starts at 1).
 * 4. Rewrite `products.category_code` from each original to its canonical
 *    code, only where they differ: an original equal to its canonical code
 *    never reaches an UPDATE statement. NULL, empty-string and
 *    whitespace-only values are untouched — a product with no category is a
 *    legitimate state, and inventing one is not. Their count is reported.
 * 5. A value that normalizes to the empty string (e.g. punctuation only) is
 *    skipped entirely — no catalog row, no update — and reported with the
 *    tenant and the original value.
 * 6. Collisions are reported, not hidden: two distinct originals can fold
 *    into one code (`CAFÉ CALIENTE` and `CAFE CALIENTE`), which merges what
 *    the owner may consider two categories. The migration still converges
 *    both to the single canonical row — leaving them apart would keep the
 *    data inconsistent — and logs every merge with tenant, code and the
 *    folded originals. Unifying concepts remains the owner's decision in
 *    /catalogs; no fuzzy matching against the seeded codes
 *    (BEBIDA_CALIENTE et al.) is ever attempted.
 *
 * Mirrored rule, deliberately not imported and deliberately NOT a free
 * export: the canonicalization below is a character-for-character duplicate
 * of `canonicalCategoryCode()` in
 * src/modules/onboarding/services/menu-import.service.ts. A migration must
 * stay valid forever even if the service helper evolves, and importing a
 * feature module into the migration ledger is the wrong direction of
 * dependency. It lives as a static member of the migration class (not a
 * module-level export) because TypeORM's glob-based migration loading
 * (data-source.ts passes '!(*.spec).{ts,js}') instantiates EVERY exported
 * function in a migration file as if it were a migration class — a free
 * export here would crash every real `runMigrations()` with "Cannot read
 * properties of undefined (reading 'trim')". If the rule ever changes in
 * the service, change it here too — the unit spec pins the shared examples
 * so a silent divergence is caught.
 *
 * FORCE ROW LEVEL SECURITY bracket. `products` and `catalog_values` are both
 * relforcerowsecurity = true (1809250000000-EnforceCatalogRls and
 * 1768000000000-CreateCatalogValues), and the migration role is their table
 * OWNER: per the precedent in 1809180000000-ReconcileEnumColumns, an owner
 * is subject to RLS too, and no app.tenant_id is bound during a migration,
 * so the tenant predicate evaluates to NULL and under FORCE the owner sees
 * ZERO rows — up() would log a clean no-op on exactly the databases it
 * exists to repair. up() therefore issues
 * `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` on every table it reads or
 * writes that currently has FORCE, records each table only after its
 * NO FORCE has actually run, and restores FORCE for precisely that lifted
 * subset in a `finally`. The lift runs INSIDE the try, so a throw —
 * mid-lift included — restores exactly the subset lifted so far and never
 * re-forces a table the migration did not lift; transaction rollback is the
 * independent second net covering an aborted statement. NO FORCE lifts the
 * row predicate only for the table owner (the migration role); non-owner
 * app roles remain fully tenant-scoped by their policies throughout. The
 * bracket's own ALTER TABLE statements take ACCESS EXCLUSIVE on the two
 * tables for the window, the same exposure the accepted precedent carries.
 *
 * What the spec proves vs what real execution proves: the mock-QueryRunner
 * spec proves the emitted SQL, the tenant bounds, the canonicalization
 * examples, the guard logic (as real behaviour against in-memory fake
 * state), the reporting and the bracket ordering; it reproduces the TypeORM
 * 0.3 [rows, rowCount] tuple on UPDATE..RETURNING but is structurally unable
 * to reproduce full driver result shapes or role/RLS behaviour.
 * 1809560000000-BackfillProductCategoryCodes.db.spec.ts executes against a
 * real Postgres built by the migration set, connected as a non-superuser
 * table owner with NOBYPASSRLS — the production-shaped position a superuser
 * clone run cannot prove — and demonstrates that the bracket is what makes
 * the repair visible to the owner role.
 *
 * Idempotency: a converged database (products already canonical, catalog
 * rows present) re-runs up() with zero creates and zero updates and logs a
 * no-op, not an error.
 *
 * down() is a deliberate no-op. The rewrite is many-to-one: two originals
 * can fold into one canonical code, so the original free-text strings of
 * merged products cannot be reconstructed after the fact — faking a reverse
 * map would fabricate data. The created `catalog_values` rows are left in
 * place on purpose: they are valid catalog entries the owner may rename or
 * deactivate in /catalogs, and deleting them would orphan the very products
 * this migration repaired (their category_code would point at nothing).
 */
const RLS_TABLES = ['products', 'catalog_values'] as const;

const LOG_PREFIX = 'BackfillProductCategoryCodes1809560000000:';

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

interface ReturnedRow {
  id: string;
}

/**
 * Normalises an UPDATE..RETURNING result to its rows. TypeORM 0.3's postgres
 * driver returns a [rows, rowCount] tuple; other drivers and the fake used
 * in the spec return a flat row array. Trusting `.length` on the raw result
 * reported the tuple length (always 2) instead of the row count in the
 * precedent migration — this helper is the single place that decodes the
 * envelope, so the reported counts are always the number of rows the
 * statement actually touched.
 */
const asReturnedRows = (raw: unknown): ReturnedRow[] => {
  if (Array.isArray(raw) && Array.isArray(raw[0])) {
    return raw[0] as ReturnedRow[];
  }
  return Array.isArray(raw) ? (raw as ReturnedRow[]) : [];
};

/** The distinct originals folded under one canonical code (sorted order).
 *  Deterministic code-unit sort: no locale, no database collation. */
const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

export class BackfillProductCategoryCodes1809560000000 implements MigrationInterface {
  name = 'BackfillProductCategoryCodes1809560000000';

  /**
   * Canonical catalog code for a worksheet-derived menu category: trim,
   * collapse internal whitespace to `_`, strip accents/diacritics, uppercase,
   * then drop every character that is not A-Z, 0-9 or `_`.
   *
   * Mirrored source: `canonicalCategoryCode()` in
   * src/modules/onboarding/services/menu-import.service.ts (the forward fix).
   * Duplicated on purpose and exposed as a static (not a module-level
   * function export) so the unit spec can pin the shared examples against
   * the service's own contract without breaking TypeORM's glob loader —
   * see the header.
   */
  static canonicalCategoryCode(raw: string): string {
    return raw
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '');
  }

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
   * Lifts FORCE RLS on every table that has it, recording each table in the
   * caller-owned `lifted` array immediately after its NO FORCE has actually
   * run. Because the array is mutated in place, a mid-lift throw leaves it
   * naming precisely the tables currently un-forced — the finally restores
   * that subset and never the constant table list. See the header: without
   * this lift, the owner's queries silently see zero rows.
   */
  private async liftForceRowLevelSecurity(
    runner: QueryRunner,
    lifted: string[],
  ): Promise<void> {
    for (const table of RLS_TABLES) {
      if (await this.isForceRowLevelSecurity(runner, table)) {
        await runner.query(
          `ALTER TABLE ${quoteIdentifier(table)} NO FORCE ROW LEVEL SECURITY`,
        );
        lifted.push(table);
      }
    }
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
    // The lift is INSIDE the try so a mid-lift throw reaches the finally,
    // which restores exactly the already-lifted subset. Transaction rollback
    // is the independent second net covering an aborted statement; the
    // finally alone is not the whole guarantee (see header).
    const lifted: string[] = [];
    try {
      await this.liftForceRowLevelSecurity(queryRunner, lifted);

      const tenantRows = (await queryRunner.query(
        `SELECT DISTINCT tenant_id
           FROM products
          WHERE category_code IS NOT NULL
            AND btrim(category_code) <> ''
          ORDER BY tenant_id`,
      )) as Array<{ tenant_id: string }>;

      if (tenantRows.length === 0) {
        // Databases with no categorized products at all are a logged no-op,
        // not an error: erroring would block every unrelated migration.
        console.log(
          `${LOG_PREFIX} no-op: no product carries a category_code; ` +
            `nothing to do`,
        );
        return;
      }

      let totalCreated = 0;
      let totalReused = 0;
      let totalMerged = 0;
      let totalSkipped = 0;
      let totalUpdated = 0;
      let totalUntouched = 0;

      for (const { tenant_id: tenantId } of tenantRows) {
        const originalRows = (await queryRunner.query(
          `SELECT DISTINCT category_code AS original
             FROM products
            WHERE tenant_id = $1
              AND category_code IS NOT NULL
              AND btrim(category_code) <> ''
            ORDER BY category_code`,
          [tenantId],
        )) as Array<{ original: string }>;

        let tenantCreated = 0;
        let tenantReused = 0;
        let tenantMerged = 0;
        let tenantSkipped = 0;
        let tenantUpdated = 0;

        // Fold the originals under their canonical code. Sorting is done
        // here by code unit, never trusting the database collation, so the
        // chosen label and the sort_order assignment are deterministic.
        const groups = new Map<string, string[]>();
        for (const original of originalRows
          .map((row) => row.original)
          .sort(byCodeUnit)) {
          const code =
            BackfillProductCategoryCodes1809560000000.canonicalCategoryCode(
              original,
            );
          if (code === '') {
            // A punctuation-only value has no canonical meaning: no row, no
            // update, and the skip is named so the owner can decide.
            console.log(
              `${LOG_PREFIX} tenant ${tenantId}: skipped category_code ` +
                `'${original}': normalizes to an empty code; left as-is`,
            );
            tenantSkipped += 1;
            continue;
          }
          const bucket = groups.get(code);
          if (bucket === undefined) {
            groups.set(code, [original]);
          } else {
            bucket.push(original);
          }
        }

        const existingRows = (await queryRunner.query(
          `SELECT code
             FROM catalog_values
            WHERE tenant_id = $1
              AND catalog_type = 'SALES_PRODUCT_CATEGORY'`,
          [tenantId],
        )) as Array<{ code: string }>;
        const existingCodes = new Set(existingRows.map((row) => row.code));

        const maxSortRows = (await queryRunner.query(
          `SELECT COALESCE(MAX(sort_order), 0)::int AS max_sort
             FROM catalog_values
            WHERE tenant_id = $1
              AND catalog_type = 'SALES_PRODUCT_CATEGORY'`,
          [tenantId],
        )) as Array<{ max_sort: number }>;
        // Deterministic continuation of the tenant's own numbering: an
        // empty catalog starts at 1, an existing maximum continues after
        // itself.
        let nextSortOrder = Number(maxSortRows[0]?.max_sort ?? 0) + 1;

        for (const [code, originals] of groups) {
          if (originals.length > 1) {
            // Collision, reported loudly: distinct originals converge into
            // one code. The first original (deterministic code-unit order)
            // becomes the label of a created row; an existing row's label is
            // never touched either way.
            tenantMerged += originals.length - 1;
            console.log(
              `${LOG_PREFIX} tenant ${tenantId}: merged ` +
                `${originals.length} original value(s) onto '${code}': ` +
                originals.map((o) => `'${o}'`).join(', '),
            );
          }

          if (existingCodes.has(code)) {
            tenantReused += 1;
            console.log(
              `${LOG_PREFIX} tenant ${tenantId}: reused existing ` +
                `SALES_PRODUCT_CATEGORY '${code}' (label left untouched)`,
            );
          } else {
            const label = originals[0];
            await queryRunner.query(
              `INSERT INTO catalog_values
                 (tenant_id, catalog_type, code, label, is_active, sort_order)
               VALUES ($1, $2, $3, $4, true, $5)`,
              [tenantId, 'SALES_PRODUCT_CATEGORY', code, label, nextSortOrder],
            );
            tenantCreated += 1;
            console.log(
              `${LOG_PREFIX} tenant ${tenantId}: created ` +
                `SALES_PRODUCT_CATEGORY '${code}' label='${label}' ` +
                `sort_order=${nextSortOrder}`,
            );
            nextSortOrder += 1;
          }

          // Only-differ, decided up front: an original equal to its
          // canonical code never reaches an UPDATE statement.
          for (const original of originals) {
            if (original === code) {
              continue;
            }
            const updated = asReturnedRows(
              await queryRunner.query(
                `UPDATE products
                    SET category_code = $2, updated_at = now()
                  WHERE tenant_id = $1
                    AND category_code = $3
                    AND category_code <> $2
                 RETURNING id`,
                [tenantId, code, original],
              ),
            );
            tenantUpdated += updated.length;
          }
        }

        const untouchedRows = (await queryRunner.query(
          `SELECT COUNT(*)::int AS untouched
             FROM products
            WHERE tenant_id = $1
              AND (category_code IS NULL OR btrim(category_code) = '')`,
          [tenantId],
        )) as Array<{ untouched: number }>;
        const untouched = Number(untouchedRows[0]?.untouched ?? 0);

        console.log(
          `${LOG_PREFIX} tenant ${tenantId}: left ${untouched} product(s) ` +
            `with NULL/empty category_code (no category invented)`,
        );

        totalCreated += tenantCreated;
        totalReused += tenantReused;
        totalMerged += tenantMerged;
        totalSkipped += tenantSkipped;
        totalUpdated += tenantUpdated;
        totalUntouched += untouched;
      }

      console.log(
        `${LOG_PREFIX} summary: created ${totalCreated} catalog row(s), ` +
          `reused ${totalReused} existing catalog row(s), merged ` +
          `${totalMerged} original value(s) via collision, skipped ` +
          `${totalSkipped} value(s) with an empty code, updated ` +
          `${totalUpdated} product(s), left ${totalUntouched} product(s) ` +
          `with NULL/empty category_code across ${tenantRows.length} tenant(s)`,
      );
      if (
        totalCreated === 0 &&
        totalUpdated === 0 &&
        totalMerged === 0 &&
        totalSkipped === 0
      ) {
        console.log(
          `${LOG_PREFIX} no-op: nothing to create or update ` +
            `(database already converged)`,
        );
      }
    } finally {
      await this.restoreForceRowLevelSecurity(queryRunner, lifted);
    }
  }

  /**
   * Deliberate no-op — see the header comment. The rewrite is many-to-one
   * (two originals can fold into one canonical code), so the original
   * strings of merged products cannot be reconstructed after the fact; the
   * created catalog rows are valid entries the owner may rename or
   * deactivate in /catalogs, and deleting them would orphan the repaired
   * products again. Runs no statements at all.
   */
  public down(): Promise<void> {
    return Promise.resolve();
  }
}
