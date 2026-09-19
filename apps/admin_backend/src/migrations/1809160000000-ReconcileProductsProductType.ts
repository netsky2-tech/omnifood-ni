import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reconciles `products.product_type` with the enum the entity and the
 * migrations already agree on.
 *
 * Issue #286: the same entity produces two different column types depending on
 * how a database was provisioned. `Product` declares
 * `@Column({ type: 'enum', enum: ProductType })`, and
 * `1759000000002-CreateBootstrapInventorySalesTables` creates
 * `products_product_type_enum` with the same four members, so the enum is
 * canonical and nothing is left to decide. What is left is convergence: a
 * database provisioned before the entity declared the enum keeps `text` or
 * `character varying` here, and because the migration ledger is keyed by
 * migration NAME, such a database never re-runs `1759000000002`, so no
 * existing migration corrects it. Measured on one: `varchar`, 33 rows, every
 * value already a valid member.
 *
 * Why this is a new migration rather than a correction to the old one. Editing
 * `1759000000002` would change nothing on any database that already recorded
 * it, which is every database that has the drift. Only a new migration runs
 * there.
 *
 * The conversion is reviewed rather than assumed. up() reads the column's
 * current type first and returns untouched when the enum is already in place,
 * so a re-run is a no-op. When the column still holds text it counts the rows
 * whose value is not one of the members and fails closed naming them, so a
 * database holding unexpected data stops with an actionable message instead of
 * PostgreSQL's bare `invalid input value for enum`. A guard, not a coercion:
 * this migration never rewrites a value, because guessing what an unrecognised
 * product type was meant to be is a product decision, not a migration's.
 *
 * down() restores the previous type and default. It never drops or recreates
 * the table, never deletes rows, and never touches the tenant policies.
 */
const TABLE = 'products';
const COLUMN = 'product_type';
const ENUM_TYPE = 'products_product_type_enum';
const MEMBERS = ['SIMPLE', 'COMPOUND', 'PREPARED', 'VARIANT_PARENT'] as const;
const STRING_TYPES = ['character varying', 'text'];
const DEFAULT_MEMBER = 'SIMPLE';

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

/** Literal list for the membership guard, built only from the frozen member list. */
const memberLiterals = (): string =>
  MEMBERS.map((member) => `'${member.replace(/'/g, "''")}'`).join(', ');

interface ColumnState {
  dataType: string;
  udtName: string;
}

export class ReconcileProductsProductType1809160000000 implements MigrationInterface {
  name = 'ReconcileProductsProductType1809160000000';

  private async readColumn(runner: QueryRunner): Promise<ColumnState | null> {
    const rows = (await runner.query(
      `SELECT data_type AS "dataType", udt_name AS "udtName"
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2`,
      [TABLE, COLUMN],
    )) as ColumnState[];

    return rows.length > 0 ? rows[0] : null;
  }

  /** Creates the enum when a database never created it, so the ALTER below has a target. */
  private async ensureEnumType(runner: QueryRunner): Promise<void> {
    await runner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = current_schema() AND t.typname = '${ENUM_TYPE}'
      ) THEN
        CREATE TYPE ${quoteIdentifier(ENUM_TYPE)} AS ENUM (${memberLiterals()});
      END IF;
    END $$;`);
  }

  /**
   * Fails closed before the ALTER when a value is not a member. The ALTER alone
   * would also fail, but with a message that names neither the table nor the
   * offending values.
   */
  private async assertEveryValueIsAMember(runner: QueryRunner): Promise<void> {
    const rows = (await runner.query(
      `SELECT ${quoteIdentifier(COLUMN)} AS value, count(*) AS occurrences
         FROM ${quoteIdentifier(TABLE)}
        WHERE ${quoteIdentifier(COLUMN)} IS NOT NULL
          AND ${quoteIdentifier(COLUMN)}::text NOT IN (${memberLiterals()})
        GROUP BY ${quoteIdentifier(COLUMN)}
        ORDER BY count(*) DESC
        LIMIT 10`,
    )) as Array<{ value: string; occurrences: string }>;

    if (rows.length === 0) {
      return;
    }

    const offenders = rows
      .map((row) => `'${row.value}' (${row.occurrences} row(s))`)
      .join(', ');

    throw new Error(
      `PRODUCT_TYPE_VALUE_NOT_A_MEMBER: ${TABLE}.${COLUMN} holds values that are not members of ` +
        `${ENUM_TYPE}, so it cannot be converted without deciding what they mean: ${offenders}. ` +
        `Members are: ${MEMBERS.join(', ')}. Correct the data first, or extend the enum deliberately; ` +
        `this migration will not rewrite a value on its own.`,
    );
  }

  async up(runner: QueryRunner): Promise<void> {
    const before = await this.readColumn(runner);

    if (before === null) {
      // No products table in this schema: nothing to reconcile, and creating one
      // is not this migration's job.
      return;
    }

    if (before.udtName === ENUM_TYPE) {
      return; // already canonical
    }

    if (!STRING_TYPES.includes(before.dataType)) {
      throw new Error(
        `UNEXPECTED_PRODUCT_TYPE_COLUMN: ${TABLE}.${COLUMN} is '${before.dataType}', which is neither ` +
          `the target enum ${ENUM_TYPE} nor a text type this migration can convert. Refusing to guess.`,
      );
    }

    await this.ensureEnumType(runner);
    await this.assertEveryValueIsAMember(runner);

    const tableId = quoteIdentifier(TABLE);
    const columnId = quoteIdentifier(COLUMN);

    await runner.query(
      `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} DROP DEFAULT`,
    );
    await runner.query(
      `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} TYPE ${quoteIdentifier(ENUM_TYPE)} ` +
        `USING ${columnId}::text::${quoteIdentifier(ENUM_TYPE)}`,
    );
    await runner.query(
      `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} SET DEFAULT '${DEFAULT_MEMBER}'::${quoteIdentifier(ENUM_TYPE)}`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    const before = await this.readColumn(runner);

    if (before === null || before.udtName !== ENUM_TYPE) {
      return; // not on the enum: nothing to undo
    }

    const tableId = quoteIdentifier(TABLE);
    const columnId = quoteIdentifier(COLUMN);

    await runner.query(
      `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} DROP DEFAULT`,
    );
    await runner.query(
      `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} TYPE character varying ` +
        `USING ${columnId}::text`,
    );
    await runner.query(
      `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} SET DEFAULT '${DEFAULT_MEMBER}'::character varying`,
    );
  }
}
