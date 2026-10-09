import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the per-line `discount_origin` categorical column to `invoice_items`
 * (D-A2): records WHY a line's `discount` amount exists (manual, promotion
 * or loyalty redemption) so the cloud can report discount provenance.
 *
 * NO BACKFILL and NO DEFAULT, on purpose: NULL means legacy/unknown — rows
 * written before this column existed, lines with no discount at all — and no
 * origin may ever be fabricated for them. This is the same no-backfill rule
 * as `shift_id` (D-9) and `recipe_version_id`
 * (1769000000000-AddRecipeVersionIdToInvoiceItems).
 *
 * CONSTRAINT STYLE follows the end state that
 * `1809180000000-ReconcileEnumColumns` establishes as this schema's canonical
 * shape for categorical columns: a real PostgreSQL ENUM type named
 * `invoice_items_discount_origin_enum` — the `<table>_<column>_enum` naming
 * every existing enum in this schema uses, and the name TypeORM derives when
 * an entity enum column sets no `enumName` — created with a guard on
 * `pg_type` + `current_schema()` so a re-run never re-creates it. Because
 * this is a NEW column there are no legacy values to convert, so the
 * reconcile recipe's membership guard / case-fold handling does not apply;
 * the database itself rejects any non-member with 22P02 (proven by
 * invoices.service.db.spec.ts). `invoice_items` is FORCE ROW LEVEL SECURITY,
 * but adding a nullable column touches no rows and reads none, so no
 * `NO FORCE ROW LEVEL SECURITY` handling is needed, and the tenant RLS
 * policies are table-level tenant predicates: a new column needs NO policy
 * change.
 *
 * down() drops the column and the type. Dropping the column loses only the
 * origin labels (the discount amounts themselves are untouched, and DGI
 * non-deletion rules apply to invoices, not to this provenance attribute);
 * the type is dropped because this migration is its only user.
 */
const ENUM_TYPE = 'invoice_items_discount_origin_enum';
const MEMBERS = ['manual', 'promotion', 'loyalty'] as const;

export class AddDiscountOriginToInvoiceItems1809620000000 implements MigrationInterface {
  name = 'AddDiscountOriginToInvoiceItems1809620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Guarded CREATE TYPE, schema-resolved via current_schema() (never
    // hardcoded to public), so scratch-schema test fixtures and provisioned
    // databases both behave.
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = current_schema() AND t.typname = '${ENUM_TYPE}'
      ) THEN
        CREATE TYPE ${ENUM_TYPE} AS ENUM (${MEMBERS.map(
          (member) => `'${member}'`,
        ).join(', ')});
      END IF;
    END $$;`);

    const existing = (await queryRunner.query(
      `SELECT udt_name AS "udtName"
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'invoice_items'
          AND column_name = 'discount_origin'`,
    )) as Array<{ udtName: string }>;

    if (existing.length === 0) {
      await queryRunner.query(`
        ALTER TABLE invoice_items
        ADD COLUMN discount_origin ${ENUM_TYPE}
      `);
    } else if (existing[0].udtName !== ENUM_TYPE) {
      // The column exists but is not the enum this migration owns (e.g. a
      // varchar created by some other path). Refusing keeps this migration
      // from silently papering over a type it does not understand.
      throw new Error(
        `UNEXPECTED_DISCOUNT_ORIGIN_COLUMN_TYPE: invoice_items.discount_origin exists as ` +
          `'${existing[0].udtName}', which is neither absent nor ${ENUM_TYPE}. ` +
          `Refusing to guess; reconcile the column deliberately first.`,
      );
    }
    // existing[0].udtName === ENUM_TYPE: already canonical, re-run is a no-op.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_items
      DROP COLUMN IF EXISTS discount_origin
    `);

    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = current_schema() AND t.typname = '${ENUM_TYPE}'
      ) THEN
        DROP TYPE ${ENUM_TYPE};
      END IF;
    END $$;`);
  }
}
