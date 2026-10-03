import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * T0.5'a (extras/modifier-groups) — promotions.target_category_id becomes a
 * real uuid referencing catalog_values(tenant_id, id) instead of a free-text
 * string, and existing text values are migrated per tenant.
 *
 * Why: promotions and modifier groups must resolve "category" against ONE
 * identity (catalog_values, catalog_type = 'SALES_PRODUCT_CATEGORY', ODD
 * decision 4'/§20). The column was a bare varchar created by
 * 1790000000000-CreatePromotionsTable with no FK; the POS engine compares it
 * as a case-insensitive string. From here on it is the catalog row's id, so
 * renaming a category's label never breaks an attachment (the id does not
 * change; the code does).
 *
 * Blank and whitespace-only targets take the deactivate path too, BEFORE the
 * cast: `NULLIF(btrim(target_category_id), '')` would turn exactly those
 * values into NULL while is_active stays true — the global-promotion trap
 * through a second door. The `btrim(...) <> ''` filters in the per-tenant
 * scan are ONLY about text that can be canonicalized and resolved by code;
 * they never mean "blank values are fine".
 *
 * Scope of the fail-closed NULL+active guard: it refuses the conversion when
 * a row THIS MIGRATION WOULD CHANGE would end up NULL with is_active = true
 * (a NOT NULL blank target that survived the deactivate pass). A promotion
 * that was ALREADY NULL + active before the run is legitimately global
 * today; this migration does not touch it and the guard does not fail on it.
 *
 * THE NULL TRAP — the contract this migration exists to honour. In the POS
 * engine, target_category_id IS NULL means GLOBAL promotion: it discounts
 * every line in the cart (promotions_engine.dart:110 and :132,
 * `isGlobal = promo.targetProductId == null && promo.targetCategoryId ==
 * null`). Therefore a value that cannot be resolved must NEVER be left NULL
 * while the promotion stays active — that would silently turn a
 * category-scoped discount into a whole-menu discount. For every unresolvable
 * value, this migration sets target_category_id = NULL AND is_active = false
 * in the SAME statement, and logs the promotion name/id, the tenant and the
 * original text. Attach and deactivate are mutually exclusive; no row ends up
 * NULL + active because of this migration. Deactivation is not a live price
 * regression today (no category promotion can match in the terminal, whose
 * item.category is always null — inbound-sync does not send it), but the
 * declared state changes, and that is exactly what the log reports for owner
 * review. Reference scenario, measured in the development database: tenant
 * SOHO (bc3bd4dd-92bb-4cfe-883e-cb5ec97bfe94) holds 2 promotions, one active
 * with target_category_id = 'CAFÉ CALIENTE'; its catalog_values is empty
 * until T0.2's migration runs there, so that value is UNRESOLVABLE and this
 * migration deactivates it instead of leaving it global.
 *
 * Resolution rule, per tenant, never crossing tenants: canonicalize the free
 * text with the SAME mirrored rule used by 1809560000000-BackfillProductCategoryCodes
 * (trim, collapse internal whitespace to `_`, strip diacritics, uppercase,
 * drop characters outside A-Z0-9_), then resolve by `code` within that tenant
 * against catalog_type = 'SALES_PRODUCT_CATEGORY'. Resolve by code ONLY —
 * never fuzzy-match labels, never guess. Unlike the products backfill, an
 * empty canonical code is NOT skipped: skipping would leave the value NULL
 * with the promotion active, violating the trap contract — it takes the
 * deactivate path like any other unresolvable value.
 *
 * The FK alone does NOT restrict to product categories: catalog_values is
 * shared by four catalog types (UOM, INVENTORY_CATEGORY, INVENTORY_TYPE,
 * SALES_PRODUCT_CATEGORY, SALES_PRODUCT_TYPE), and the composite FK
 * (tenant_id, target_category_id) REFERENCES catalog_values(tenant_id, id)
 * only guarantees the row exists in the SAME TENANT. The catalog_type =
 * 'SALES_PRODUCT_CATEGORY' restriction belongs to the SERVICE layer
 * (promotions.service.ts validates it on create/update); this migration
 * resolves by code only within that type.
 *
 * Already-uuid-shaped values (e.g. a partially converged database) pass
 * through untouched: canonicalizing a uuid would strip the dashes and
 * uppercase the hex into a nonsense code that could accidentally match a
 * catalog row, so uuid-shaped values skip the code-resolution path entirely
 * and are left for the ALTER's cast. The uuid pass-through count is logged.
 * A uuid that references nothing makes the FK creation fail loudly — a
 * dangling uuid cannot be resolved by code, and inventing a resolution or
 * silently deactivating a reference to a real row are both owner decisions;
 * fail-closed is the honest default.
 *
 * Mechanics, in order:
 * 1. FORCE ROW LEVEL SECURITY bracket (see below) over exactly the tables
 *    this migration reads or writes.
 * 2. Column guard: read data_type. Already uuid → logged no-op (idempotent).
 *    Anything that is not character varying/text is refused by name.
 * 3. Data work, per tenant: canonicalize → resolve by code within
 *    SALES_PRODUCT_CATEGORY of that tenant → attach the resolved id
 *    (UPDATE guarded by the exact original text), or — same statement —
 *    NULL + is_active = false for unresolvable values, with the full report;
 *    then every NOT NULL blank/whitespace target is deactivated the same way
 *    (is_active = false, value kept, destined for NULL by the cast).
 * 4. Fail-closed guards, both before any DDL: (a) no row this migration
 *    changes may end up NULL + is_active = true — a NOT NULL blank target
 *    that survived the deactivate pass aborts the run; (b) any leftover
 *    value that is not uuid-shaped (or NULL) throws, naming up to 10
 *    offenders.
 * 5. `ALTER TABLE promotions ALTER COLUMN target_category_id TYPE uuid
 *    USING NULLIF(btrim(target_category_id), '')::uuid`, then the guarded
 *    composite FK
 *    fk_promotions_target_category_tenant
 *      FOREIGN KEY (tenant_id, target_category_id)
 *      REFERENCES catalog_values (tenant_id, id)
 *    (requires the UNIQUE (tenant_id, id) that 1809550000000-CreateModifierGroups
 *    adds to catalog_values — earlier in the ledger), then the tenant index
 *    the FK's referencing side deserves.
 *
 * FORCE ROW LEVEL SECURITY bracket. `promotions` and `catalog_values` are
 * both relforcerowsecurity = true (1809300000000-EnforcePromotionsRls and
 * 1809250000000-EnforceCatalogRls) and the migration role is their table
 * OWNER: per the precedent in 1809180000000-ReconcileEnumColumns, an owner is
 * subject to RLS too, and no app.tenant_id is bound during a migration, so
 * the tenant predicate evaluates to NULL and under FORCE the owner sees ZERO
 * rows — up() would log a clean no-op on exactly the databases it exists to
 * repair. up() issues `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` on every
 * table it reads or writes that currently has FORCE, records each table only
 * after its NO FORCE has actually run, and restores FORCE for precisely that
 * lifted subset in a `finally`. The lift runs INSIDE the try, so a throw —
 * mid-lift included — restores exactly the subset lifted so far. `products`
 * is NOT touched by this migration and therefore never lifted, even though
 * it shares the FORCE flag. NO FORCE lifts the row predicate only for the
 * table owner; non-owner app roles remain fully tenant-scoped throughout.
 *
 * down() is a real reverse, with one stated asymmetry. It renames the uuid
 * column aside, recreates the varchar column, maps every kept uuid back to
 * its resolved catalog row's CODE within the same tenant (the composite FK
 * guarantees the referenced row still exists, so the code resolution cannot
 * miss), drops the uuid column (the FK and the index go with it), and never
 * touches is_active — a promotion deactivated by up() stays deactivated;
 * silently re-activating would resurrect the global-promotion trap the
 * deactivation exists to prevent. The asymmetry that cannot be undone: the
 * ORIGINAL free text is not restored — the canonical code is written
 * instead, because up() was one-way on the string form (two originals could
 * fold onto one code).
 *
 * The canonicalization lives as a static member of the migration class (not
 * a module-level export) because TypeORM's glob-based migration loading
 * instantiates EVERY exported function in a migration file as if it were a
 * migration class — a free export here would crash every real
 * runMigrations(). See 1809560000000's header and ODD §17: the only export
 * of a migration file is the migration class.
 */
const RLS_TABLES = ['promotions', 'catalog_values'] as const;

const LOG_PREFIX = 'PromotionTargetCategoryIdToUuid1809570000000:';

const FK_NAME = 'fk_promotions_target_category_tenant';
const INDEX_NAME = 'idx_promotions_tenant_target_category';

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

interface ReturnedRow {
  id: string;
}

/**
 * Normalises an UPDATE..RETURNING result to its rows. TypeORM 0.3's postgres
 * driver returns a [rows, rowCount] tuple; other drivers and the fake used
 * in the spec return a flat row array.
 */
const asReturnedRows = (raw: unknown): ReturnedRow[] => {
  if (Array.isArray(raw) && Array.isArray(raw[0])) {
    return raw[0] as ReturnedRow[];
  }
  return Array.isArray(raw) ? (raw as ReturnedRow[]) : [];
};

interface ReturnedDeactivation {
  id: string;
  name: string;
}

interface ReturnedBlankDeactivation extends ReturnedDeactivation {
  tenant_id: string;
}

const asReturnedDeactivations = <T extends ReturnedDeactivation>(
  raw: unknown,
): T[] => {
  if (Array.isArray(raw) && Array.isArray(raw[0])) {
    return raw[0] as T[];
  }
  return Array.isArray(raw) ? (raw as T[]) : [];
};

export class PromotionTargetCategoryIdToUuid1809570000000 implements MigrationInterface {
  name = 'PromotionTargetCategoryIdToUuid1809570000000';

  /**
   * Canonical catalog code for a worksheet-derived menu category: trim,
   * collapse internal whitespace to `_`, strip accents/diacritics, uppercase,
   * then drop every character that is not A-Z, 0-9 or `_`.
   *
   * Mirrored source: `canonicalCategoryCode()` in
   * src/modules/onboarding/services/menu-import.service.ts, via the same
   * duplicate in 1809560000000-BackfillProductCategoryCodes — the three must
   * stay identical; the unit spec pins the shared examples.
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
   * run. A mid-lift throw leaves the array naming precisely the tables
   * currently un-forced, and the finally restores exactly that subset.
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

  /** The current data_type of promotions.target_category_id (null: absent). */
  private async getTargetCategoryDataType(
    runner: QueryRunner,
  ): Promise<string | null> {
    const rows = (await runner.query(
      `SELECT data_type
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'promotions'
          AND column_name = 'target_category_id'`,
    )) as Array<{ data_type: string }>;

    return rows.length > 0 ? rows[0].data_type : null;
  }

  /**
   * The data work shared by the varchar→uuid conversion: per tenant,
   * canonicalize each distinct non-empty text value, resolve it by code
   * within the tenant's SALES_PRODUCT_CATEGORY rows, attach the id — or, in
   * the same statement, NULL + is_active = false for the unresolvable ones.
   */
  private async migrateTextValues(runner: QueryRunner): Promise<void> {
    const tenantRows = (await runner.query(
      `SELECT DISTINCT tenant_id
         FROM promotions
        WHERE target_category_id IS NOT NULL
          AND btrim(target_category_id) <> ''
        ORDER BY tenant_id`,
    )) as Array<{ tenant_id: string }>;

    if (tenantRows.length === 0) {
      console.log(
        `${LOG_PREFIX} no-op: no promotion carries a target_category_id; ` +
          `nothing to resolve`,
      );
      return;
    }

    let totalAttached = 0;
    let totalDeactivated = 0;
    let totalUuidPassThrough = 0;

    for (const { tenant_id: tenantId } of tenantRows) {
      const originalRows = (await runner.query(
        `SELECT DISTINCT target_category_id AS original
           FROM promotions
          WHERE tenant_id = $1
            AND target_category_id IS NOT NULL
            AND btrim(target_category_id) <> ''
          ORDER BY target_category_id`,
        [tenantId],
      )) as Array<{ original: string }>;

      for (const { original } of originalRows) {
        // Already a uuid: skip the code path entirely (canonicalizing a uuid
        // would fabricate a nonsense code), let the ALTER cast it, and let
        // the FK validate it.
        if (UUID_PATTERN.test(original)) {
          totalUuidPassThrough += 1;
          console.log(
            `${LOG_PREFIX} tenant ${tenantId}: uuid-shaped ` +
              `target_category_id passed through untouched: '${original}'`,
          );
          continue;
        }

        const code =
          PromotionTargetCategoryIdToUuid1809570000000.canonicalCategoryCode(
            original,
          );
        // An empty canonical code is unresolvable like any other: leaving it
        // NULL with the promotion active would make it global in the POS
        // engine — the trap this migration exists to close.
        if (code === '') {
          const deactivated = await this.deactivateUnresolvable(
            runner,
            tenantId,
            original,
          );
          totalDeactivated += deactivated;
          continue;
        }

        const resolvedRows = (await runner.query(
          `SELECT id
             FROM catalog_values
            WHERE tenant_id = $1
              AND catalog_type = 'SALES_PRODUCT_CATEGORY'
              AND code = $2`,
          [tenantId, code],
        )) as Array<{ id: string }>;

        if (resolvedRows.length > 0) {
          const resolvedId = resolvedRows[0].id;
          const attached = asReturnedRows(
            await runner.query(
              `UPDATE promotions
                  SET target_category_id = $2, updated_at = now()
                WHERE tenant_id = $1
                  AND target_category_id = $3
                RETURNING id`,
              [tenantId, resolvedId, original],
            ),
          );
          totalAttached += attached.length;
          console.log(
            `${LOG_PREFIX} tenant ${tenantId}: attached ` +
              `${attached.length} promotion(s) to SALES_PRODUCT_CATEGORY ` +
              `'${code}' (resolved from '${original}')`,
          );
        } else {
          const deactivated = await this.deactivateUnresolvable(
            runner,
            tenantId,
            original,
          );
          totalDeactivated += deactivated;
        }
      }
    }

    console.log(
      `${LOG_PREFIX} summary: attached ${totalAttached} promotion(s), ` +
        `deactivated ${totalDeactivated} unresolvable promotion(s), ` +
        `${totalUuidPassThrough} uuid-shaped value(s) passed through ` +
        `across ${tenantRows.length} tenant(s)`,
    );
  }

  /**
   * THE NULL TRAP's enforcement point: NULL and is_active = false in the
   * SAME statement, so a promotion can never be left NULL + active by this
   * migration, and every deactivated promotion is logged with its id, name,
   * tenant and the original text it carried.
   */
  private async deactivateUnresolvable(
    runner: QueryRunner,
    tenantId: string,
    original: string,
  ): Promise<number> {
    const deactivated = asReturnedDeactivations(
      await runner.query(
        `UPDATE promotions
            SET target_category_id = NULL,
                is_active = false,
                updated_at = now()
          WHERE tenant_id = $1
            AND target_category_id = $2
          RETURNING id, name`,
        [tenantId, original],
      ),
    );
    for (const row of deactivated) {
      console.log(
        `${LOG_PREFIX} tenant ${tenantId}: deactivated ` +
          `(unresolvable target_category_id '${original}') promotion ` +
          `'${row.name}' id=${row.id} — was active with an unresolvable ` +
          `category; NULL would mean GLOBAL in the POS engine`,
      );
    }
    return deactivated.length;
  }

  /**
   * Blank/whitespace-only targets: deactivate in ONE statement (value kept,
   * destined for NULL by the ALTER's NULLIF) and log each one the same way
   * deactivateUnresolvable does. Runs after the per-tenant pass, whose
   * `<> ''` filters are only about text that can be resolved — never a
   * licence to leave blanks alone.
   */
  private async deactivateBlankTargets(runner: QueryRunner): Promise<void> {
    const deactivated = asReturnedDeactivations<ReturnedBlankDeactivation>(
      await runner.query(
        `UPDATE promotions
            SET is_active = false,
                updated_at = now()
          WHERE target_category_id IS NOT NULL
            AND btrim(target_category_id) = ''
          RETURNING id, name, tenant_id`,
      ),
    );
    for (const row of deactivated) {
      console.log(
        `${LOG_PREFIX} tenant ${row.tenant_id}: deactivated ` +
          `(blank target_category_id destined for NULL) promotion ` +
          `'${row.name}' id=${row.id} — the cast would leave it NULL and ` +
          `active, and NULL means GLOBAL in the POS engine`,
      );
    }
    console.log(
      `${LOG_PREFIX} summary: deactivated ${deactivated.length} ` +
        `blank-target promotion(s) before the uuid cast`,
    );
  }

  /**
   * Fail-closed guard: a NOT NULL blank target that survived
   * deactivateBlankTargets would be cast to NULL with is_active still on —
   * refuse before any DDL. A promotion ALREADY NULL + active before the run
   * is legitimately global today and must NOT fail this guard (see header).
   */
  private async assertNoRowWouldBecomeNullAndActive(
    runner: QueryRunner,
  ): Promise<void> {
    const offenders = (await runner.query(
      `SELECT id, name, tenant_id
         FROM promotions
        WHERE target_category_id IS NOT NULL
          AND btrim(target_category_id) = ''
          AND is_active = true
        ORDER BY id
        LIMIT 10`,
    )) as Array<{ id: string; name: string; tenant_id: string }>;

    if (offenders.length > 0) {
      const detail = offenders
        .map((row) => `${row.id} ('${row.name}', tenant ${row.tenant_id})`)
        .join('; ');
      throw new Error(
        `${LOG_PREFIX} refusing the uuid conversion: ` +
          `${offenders.length}+ ACTIVE promotion(s) hold a blank ` +
          `target_category_id the cast would turn into NULL — NULL means ` +
          `GLOBAL in the POS engine: ${detail}`,
      );
    }
  }

  /** Fail closed: leftovers that are neither NULL nor uuid-shaped abort the DDL. */
  private async assertNothingButUuidsLeft(runner: QueryRunner): Promise<void> {
    const leftovers = (await runner.query(
      `SELECT id, name, tenant_id, target_category_id
         FROM promotions
        WHERE target_category_id IS NOT NULL
          AND btrim(target_category_id) <> ''
          AND target_category_id !~ $1
        ORDER BY id
        LIMIT 10`,
      [UUID_PATTERN.source],
    )) as Array<{
      id: string;
      name: string;
      tenant_id: string;
      target_category_id: string;
    }>;

    if (leftovers.length > 0) {
      const detail = leftovers
        .map(
          (row) =>
            `${row.id} ('${row.name}', tenant ${row.tenant_id}, ` +
            `value '${row.target_category_id}')`,
        )
        .join('; ');
      throw new Error(
        `${LOG_PREFIX} refusing the uuid conversion: ` +
          `${leftovers.length}+ promotion(s) still hold non-uuid text in ` +
          `target_category_id: ${detail}`,
      );
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The lift is INSIDE the try so a mid-lift throw reaches the finally,
    // which restores exactly the already-lifted subset.
    const lifted: string[] = [];
    try {
      await this.liftForceRowLevelSecurity(queryRunner, lifted);

      const dataType = await this.getTargetCategoryDataType(queryRunner);
      if (dataType === 'uuid') {
        console.log(
          `${LOG_PREFIX} no-op: promotions.target_category_id is already ` +
            `uuid (database already converged)`,
        );
        return;
      }
      if (dataType !== 'character varying' && dataType !== 'text') {
        throw new Error(
          `${LOG_PREFIX} refusing to convert promotions.target_category_id: ` +
            `expected character varying/text, found ` +
            `${dataType ?? '<column missing>'}`,
        );
      }

      await this.migrateTextValues(queryRunner);
      await this.deactivateBlankTargets(queryRunner);
      await this.assertNoRowWouldBecomeNullAndActive(queryRunner);
      await this.assertNothingButUuidsLeft(queryRunner);

      // All remaining values are uuid-shaped or NULL: the cast is total.
      await queryRunner.query(
        `ALTER TABLE promotions
           ALTER COLUMN target_category_id TYPE uuid
           USING NULLIF(btrim(target_category_id), '')::uuid`,
      );

      // The composite tenant FK makes a cross-tenant attachment impossible
      // in the database. Guarded for re-application; requires the
      // UNIQUE (tenant_id, id) that 1809550000000-CreateModifierGroups adds
      // to catalog_values. The FK does NOT restrict the catalog_type —
      // catalog_values is shared by four types; the SALES_PRODUCT_CATEGORY
      // restriction lives in the service layer.
      await queryRunner.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM pg_constraint
              WHERE conname = '${FK_NAME}'
                AND conrelid = 'promotions'::regclass
           ) THEN
             ALTER TABLE promotions
               ADD CONSTRAINT ${FK_NAME}
               FOREIGN KEY (tenant_id, target_category_id)
               REFERENCES catalog_values (tenant_id, id);
           END IF;
         END;
         $$`,
      );

      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS ${INDEX_NAME}
           ON promotions (tenant_id, target_category_id)`,
      );
    } finally {
      await this.restoreForceRowLevelSecurity(queryRunner, lifted);
    }
  }

  /**
   * Real reverse — see the header for the one asymmetry (the original free
   * text is not restored; the resolved code is, and deactivation flags are
   * preserved, never silently re-activated).
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    // The no-op path runs no statements at all: the data_type probe reads
    // information_schema, not table rows, so the RLS bracket is only lifted
    // when there is real reverse work to do.
    const dataType = await this.getTargetCategoryDataType(queryRunner);
    if (dataType !== 'uuid') {
      console.log(
        `${LOG_PREFIX} no-op: promotions.target_category_id is not uuid ` +
          `(found ${dataType ?? '<column missing>'}); nothing to reverse`,
      );
      return;
    }

    const lifted: string[] = [];
    try {
      await this.liftForceRowLevelSecurity(queryRunner, lifted);

      // Keep the uuid values aside while the text column is rebuilt.
      await queryRunner.query(
        `ALTER TABLE promotions
           RENAME COLUMN target_category_id TO target_category_id_uuid`,
      );
      await queryRunner.query(
        `ALTER TABLE promotions ADD COLUMN target_category_id varchar`,
      );

      // Map every kept uuid back to its resolved row's code, within the
      // tenant. The composite FK guarantees the referenced row still exists,
      // so this resolution cannot miss unless the constraint was violated
      // behind its back.
      await queryRunner.query(
        `UPDATE promotions p
            SET target_category_id = cv.code
           FROM catalog_values cv
          WHERE cv.tenant_id = p.tenant_id
            AND cv.catalog_type = 'SALES_PRODUCT_CATEGORY'
            AND cv.id = p.target_category_id_uuid`,
      );

      // Log anything that could not be mapped (should be impossible under
      // the FK; loud is better than silent).
      const unmapped = (await queryRunner.query(
        `SELECT p.id, p.name, p.tenant_id
           FROM promotions p
          WHERE p.target_category_id_uuid IS NOT NULL
            AND p.target_category_id IS NULL`,
      )) as Array<{ id: string; name: string; tenant_id: string }>;
      for (const row of unmapped) {
        console.log(
          `${LOG_PREFIX} tenant ${row.tenant_id}: promotion '${row.name}' ` +
            `id=${row.id} kept a uuid whose catalog row is gone; restored ` +
            `as NULL — is_active is preserved as-is`,
        );
      }

      // Dropping the uuid column drops the FK and the index with it. The
      // varchar column is nullable with no default, exactly as created by
      // 1790000000000-CreatePromotionsTable.
      await queryRunner.query(
        `ALTER TABLE promotions DROP COLUMN target_category_id_uuid`,
      );
    } finally {
      await this.restoreForceRowLevelSecurity(queryRunner, lifted);
    }
  }
}
