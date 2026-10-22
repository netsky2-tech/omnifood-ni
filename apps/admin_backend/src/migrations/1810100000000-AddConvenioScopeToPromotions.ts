import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Convenio comercial: columnas de alcance de cliente para `promotions`.
 *
 * Adds the columns the CONVENIO promotion type needs:
 * - `code`             : short operational reference of the agreement
 *                        (e.g. "CONV-A"), UNIQUE per tenant, NULL when the
 *                        promotion has no code.
 * - `target_customer_id`: the Customer (company) the agreement belongs to.
 *                        NULL keeps the row a GLOBAL promotion, exactly like
 *                        `target_product_id` / `target_category_id` do in the
 *                        POS engine (promotions_engine.dart: `isGlobal`).
 * - `restriction_type` : 'global' | 'customer'.
 * - `used_count`       : counter of consumed uses (0 default).
 *
 * Why a composite tenant FK instead of a plain FK on the id: the codebase
 * convention (see 1809570000000-PromotionTargetCategoryIdToUuid) is that a
 * tenant-scoped attachment is impossible IN THE DATABASE, not only in the
 * service layer. A plain `FOREIGN KEY (target_customer_id) REFERENCES
 * customers(id)` would happily accept another tenant's customer id, because
 * `customers.id` is a global primary key. The composite
 * `(tenant_id, target_customer_id) REFERENCES customers (tenant_id, id)`
 * makes a cross-tenant agreement impossible at the storage layer.
 *
 * That composite FK requires UNIQUE (tenant_id, id) on `customers`, which
 * does not exist yet (customers has PK on id only). It is added here: the
 * pair is trivially unique because `id` is already the primary key, so the
 * constraint can never reject a row that already exists.
 *
 * FORCE ROW LEVEL SECURITY bracket: `promotions` and `customers` are both
 * relforcerowsecurity = true and the migration role is their table OWNER, so
 * no app.tenant_id is bound during a migration and the tenant predicate
 * evaluates to NULL. up() therefore issues `NO FORCE ROW LEVEL SECURITY` on
 * every table it reads or writes, records each table only after its NO FORCE
 * has actually run, and restores FORCE for precisely that lifted subset in a
 * `finally`. The lift runs INSIDE the try, so a throw — mid-lift included —
 * restores exactly the subset lifted so far.
 *
 * up() is idempotent: `ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF
 * NOT EXISTS` and a guarded `ADD CONSTRAINT` block, so a re-run against an
 * already-converged database is a clean no-op.
 *
 * down() reverses only this migration's effect: it drops the FK, the indexes
 * and the four columns. It never deletes or rewrites promotion rows: the
 * DGI rule that fiscal records are never destroyed applies to invoices, and
 * promotions are configuration — but dropping the columns DOES lose the
 * agreement bindings, so down() is documented as lossy for the agreement
 * scope while leaving every promotion row itself intact and active.
 */
const RLS_TABLES = ['promotions', 'customers'] as const;

const FK_NAME = 'fk_promotions_target_customer_tenant';
const CODE_INDEX_NAME = 'idx_promotions_tenant_code_unique';
const CUSTOMER_INDEX_NAME = 'idx_promotions_tenant_target_customer';
const CUSTOMERS_UNIQUE_NAME = 'uq_customers_tenant_id';

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class AddConvenioScopeToPromotions1810100000000 implements MigrationInterface {
  name = 'AddConvenioScopeToPromotions1810100000000';

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
    const lifted: string[] = [];
    try {
      await this.liftForceRowLevelSecurity(queryRunner, lifted);

      // The new promotion type must exist in the Postgres enum BEFORE any
      // row can carry it. Same pattern as
      // 1809920000000-AddValuationWritedownMovementType: the value is added
      // but never USED in this migration, because PostgreSQL cannot use a
      // value added in the same transaction (TypeORM runs migrations inside
      // one) — the write path is application code.
      await queryRunner.query(`
        DO $$ BEGIN
          IF to_regtype('promotions_type_enum') IS NOT NULL THEN
            EXECUTE 'ALTER TYPE promotions_type_enum ADD VALUE IF NOT EXISTS ''convenio''';
          END IF;
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END;
        $$;
      `);

      // The four columns. Nullable except used_count, which carries a NOT
      // NULL DEFAULT 0 so every existing promotion row stays valid and the
      // POS can count uses without a nullable branch.
      await queryRunner.query(`
        ALTER TABLE promotions
          ADD COLUMN IF NOT EXISTS code varchar,
          ADD COLUMN IF NOT EXISTS target_customer_id uuid,
          ADD COLUMN IF NOT EXISTS restriction_type varchar,
          ADD COLUMN IF NOT EXISTS used_count integer NOT NULL DEFAULT 0
      `);

      // UNIQUE (tenant_id, id) on customers: required by the composite FK
      // below. Idempotent and safe — `id` is already the primary key, so the
      // pair can never collide.
      await queryRunner.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM pg_constraint
              WHERE conname = '${CUSTOMERS_UNIQUE_NAME}'
                AND conrelid = 'customers'::regclass
           ) THEN
             ALTER TABLE customers
               ADD CONSTRAINT ${CUSTOMERS_UNIQUE_NAME}
               UNIQUE (tenant_id, id);
           END IF;
         END;
         $$`,
      );

      // The composite tenant FK: a cross-tenant agreement is impossible in
      // the database, not only in the service layer.
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
               FOREIGN KEY (tenant_id, target_customer_id)
               REFERENCES customers (tenant_id, id);
           END IF;
         END;
         $$`,
      );

      // UNIQUE (tenant_id, code): the code identifies an agreement WITHIN a
      // tenant. PostgreSQL lets NULL repeat in a unique index, so promotions
      // without a code are unaffected.
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${CODE_INDEX_NAME}
           ON promotions (tenant_id, code)`,
      );

      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS ${CUSTOMER_INDEX_NAME}
           ON promotions (tenant_id, target_customer_id)`,
      );
    } finally {
      await this.restoreForceRowLevelSecurity(queryRunner, lifted);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const lifted: string[] = [];
    try {
      await this.liftForceRowLevelSecurity(queryRunner, lifted);

      // Dropping the constraint and the indexes first, so the column drop
      // never trips over a dependency.
      await queryRunner.query(
        `ALTER TABLE promotions DROP CONSTRAINT IF EXISTS ${FK_NAME}`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS ${CODE_INDEX_NAME}`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS ${CUSTOMER_INDEX_NAME}`,
      );

      // The agreement scope is lost here (the columns carry it); the
      // promotion ROWS themselves are never deleted or deactivated.
      await queryRunner.query(`
        ALTER TABLE promotions
          DROP COLUMN IF EXISTS code,
          DROP COLUMN IF EXISTS target_customer_id,
          DROP COLUMN IF EXISTS restriction_type,
          DROP COLUMN IF EXISTS used_count
      `);

      // The customers unique constraint is intentionally KEPT: it is a
      // harmless superset (id is already the primary key) and other
      // tenant-scoped FKs may rely on it.
    } finally {
      await this.restoreForceRowLevelSecurity(queryRunner, lifted);
    }

    // The enum value 'convenio' is NOT removed: PostgreSQL cannot remove a
    // value from an enum type without recreating it and rewriting every
    // column that uses it, and a promotion row that still carries
    // 'convenio' must stay readable. The extra label is inert for every
    // other check — the same honest no-op down as
    // 1809920000000-AddValuationWritedownMovementType.
  }
}
