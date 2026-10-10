import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the per-line `discount_origin` categorical column (added by
 * `1809620000000-AddDiscountOriginToInvoiceItems`, D-A2) with a nullable
 * `jsonb` AMOUNTS BREAKDOWN under the same name, e.g.
 * `{"manual": 5, "promotion": 10}`: a line can be discounted by MORE THAN
 * ONE origin at once (a promotion on the item plus a manual discount on the
 * order), and the owner must be able to see how much came from each — a
 * single categorical origin per line cannot express that.
 *
 * NO DATA MIGRATION, on purpose, because there is nothing to migrate:
 * nothing is deployed — production runs the old main without this column —
 * and the only database carrying the categorical column is the local
 * mirror, whose rows are throwaway. No backfill and NO DEFAULT: NULL still
 * means legacy/unknown, and no origin or amount is ever fabricated
 * (same rule as `shift_id`/D-9 and `recipe_version_id`/1769000000000).
 *
 * A jsonb column was chosen over a child table ON PURPOSE: a new table
 * would have to be classified in this schema's RLS coverage ratchet
 * (`apps/admin_backend/scripts/schema-rls-coverage-manifest.txt`) with its
 * own policies and immutability wiring — a lot of new surface for three
 * fixed amounts. The DB-level validation the enum type used to give is
 * recovered with a CHECK constraint instead
 * (`chk_invoice_items_discount_origin_breakdown`): the keys must be a
 * subset of the known origins (the jsonb `- text[]` difference against the
 * `DiscountOrigin` members must be empty), the values must be positive
 * numbers (a jsonpath "exists no value that is not a positive number"
 * predicate), and an EMPTY object is refused (`<> '{}'::jsonb`): an empty
 * key set would otherwise slip through the subset rule and create a third
 * state between NULL (nothing recorded — legacy/undiscounted lines) and a
 * populated breakdown. The explicit inequality is the clearest clause that
 * needs no subquery (CHECK constraints reject subqueries) and no helper
 * function, and it matches the pipe's `@IsNotEmptyObject` exactly, so the
 * two legal states are the same on both sides of the API.
 * CONSTRAINT STYLE follows the repository's `chk_` convention —
 * `chk_invoices_credit_note_origin_policy` /
 * `chk_invoice_items_credit_note_origin` (1782000000000) and
 * `chk_users_security_version_positive` (1783000000000): a named
 * table-scoped constraint, added with `DROP CONSTRAINT IF EXISTS` followed
 * by `ADD CONSTRAINT` so the migration is re-runnable. PostgreSQL CHECK
 * constraints reject subqueries but accept IMMUTABLE function calls, so the
 * whitelist/positivity logic uses the jsonb operators and
 * `jsonb_path_exists` inline. `invoice_items` is FORCE ROW LEVEL SECURITY,
 * but replacing a nullable column touches no rows, and the tenant RLS
 * policies are table-level tenant predicates: no policy change is needed.
 *
 * down() is honest about what it can and cannot restore: it drops the CHECK
 * constraint and the jsonb column — so the per-origin AMOUNTS are lost,
 * they cannot be re-derived into a single categorical value — then
 * recreates the enum type (guarded on `pg_type` + `current_schema()`, the
 * same guarded shape `1809620000000` used) and the nullable categorical
 * column. It restores the SCHEMA of 1809620000000's end state, not the
 * breakdown data.
 */

const ENUM_TYPE = 'invoice_items_discount_origin_enum';
const CHECK_NAME = 'chk_invoice_items_discount_origin_breakdown';

const CHECK_SQL = `
        CHECK (
          discount_origin IS NULL
          OR (
            jsonb_typeof(discount_origin) = 'object'
            AND discount_origin <> '{}'::jsonb
            AND (
              discount_origin
                - ARRAY['manual','promotion','loyalty']::text[]
            ) = '{}'::jsonb
            AND NOT jsonb_path_exists(
              discount_origin,
              '$.keyvalue() ? (!(@.value.type() == "number") || @.value <= 0)'
            )
          )
        )`;

export class ReplaceDiscountOriginWithBreakdown1809630000000 implements MigrationInterface {
  name = 'ReplaceDiscountOriginWithBreakdown1809630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Schema-resolved via current_schema() (never hardcoded to public), so
    // scratch-schema test fixtures and provisioned databases both behave.
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
        ADD COLUMN discount_origin jsonb
      `);
    } else if (existing[0].udtName === 'jsonb') {
      // Already replaced (idempotent re-run): the column swap is a no-op,
      // the constraint below is still (re-)ensured.
    } else if (existing[0].udtName === ENUM_TYPE) {
      // The categorical column this migration replaces. Drop BEFORE adding
      // the jsonb column: the replacement keeps the same column name. No
      // USING conversion and no data migration: nothing is deployed, there
      // is no data to migrate (see the header), and a cast from the enum to
      // jsonb would be a fabricated breakdown anyway.
      await queryRunner.query(`
        ALTER TABLE invoice_items
        DROP COLUMN IF EXISTS discount_origin
      `);
      await queryRunner.query(`
        ALTER TABLE invoice_items
        ADD COLUMN discount_origin jsonb
      `);
    } else {
      // The column exists but is neither the enum this migration replaces
      // nor the jsonb it creates. Refusing keeps this migration from
      // silently papering over a type it does not understand.
      throw new Error(
        `UNEXPECTED_DISCOUNT_ORIGIN_COLUMN_TYPE: invoice_items.discount_origin exists as ` +
          `'${existing[0].udtName}', which is neither ${ENUM_TYPE} nor jsonb nor absent. ` +
          `Refusing to guess; reconcile the column deliberately first.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE invoice_items
        DROP CONSTRAINT IF EXISTS ${CHECK_NAME};
      ALTER TABLE invoice_items
        ADD CONSTRAINT ${CHECK_NAME}
        ${CHECK_SQL};
    `);

    // The enum type has no columns left after the swap; drop it through the
    // same schema-resolved pg_type guard 1809620000000 used, because this
    // schema's bootstrap migrations also hardcode a guarded CREATE TYPE and
    // the local mirror may still carry the type in `public`.
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_items
        DROP CONSTRAINT IF EXISTS ${CHECK_NAME};
      ALTER TABLE invoice_items
        DROP COLUMN IF EXISTS discount_origin
    `);

    // Guarded CREATE TYPE, schema-resolved via current_schema() — the same
    // shape 1809620000000 used.
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = current_schema() AND t.typname = '${ENUM_TYPE}'
      ) THEN
        CREATE TYPE ${ENUM_TYPE} AS ENUM ('manual', 'promotion', 'loyalty');
      END IF;
    END $$;`);

    // Restores the categorical SCHEMA, not the breakdown amounts: per-origin
    // amounts cannot be re-derived into a single categorical origin, so down()
    // deliberately does not attempt any data reconstruction.
    await queryRunner.query(`
      ALTER TABLE invoice_items
      ADD COLUMN discount_origin ${ENUM_TYPE}
    `);
  }
}
