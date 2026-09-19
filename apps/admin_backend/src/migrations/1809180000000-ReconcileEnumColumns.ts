import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Converts six columns that their entities declare as real PostgreSQL enums
 * but that the migrations created as unbounded `character varying`:
 *
 *   customer_point_transactions.transaction_type
 *   customer_point_transactions.origin
 *   customer_point_transactions.type
 *   inventory_kardex.movement_type
 *   kardex_recalculate_queue.status
 *   promotions.type
 *
 * This follows the proven recipe of
 * `1809160000000-ReconcileProductsProductType` (issue #286): read the column,
 * no-op when absent or already the enum type, refuse a non-text column,
 * `CREATE TYPE` guarded on `pg_type` + `current_schema()`, count the rows
 * whose value is not a member and throw naming up to 10 offenders, then
 * `DROP DEFAULT` / `ALTER ... TYPE ... USING` / `SET DEFAULT`. The guard never
 * rewrites a value. Three things do NOT fit the recipe, and each is handled
 * explicitly below.
 *
 * 1. Defaults. The recipe hard-codes a default member; here the default is
 *    part of the descriptor (`defaultMember`). Verified against the built
 *    schema: `transaction_type`, `origin` and `movement_type` have NO default
 *    today, so restoring a constant for them would invent a default that never
 *    existed. A default is set only when the descriptor carries one.
 *
 * 2. FORCE ROW LEVEL SECURITY. `inventory_kardex` and
 *    `kardex_recalculate_queue` are `relforcerowsecurity = true`: the table
 *    owner (the migration role) is subject to RLS too, and no `app.tenant_id`
 *    is bound during a migration, so the tenant predicate evaluates to NULL
 *    and the recipe's plain counting SELECT sees ZERO rows. The fail-closed
 *    guard would be vacuous on exactly the two tables that need it most, and
 *    the failure would downgrade to PostgreSQL's bare enum error with no
 *    names. For such a table this migration issues
 *    `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` before the count and the
 *    conversion, and restores `FORCE` in a `finally`, so a throw can never
 *    leave the table deniable. This adds no exposure beyond the conversion
 *    itself, which takes an ACCESS EXCLUSIVE lock on the same table.
 *
 * 3. Case. `transaction_type` stores UPPERCASE while `PointTransactionType`'s
 *    members are lowercase, because the ledger writer persisted the raw DTO
 *    value while the sibling `type` column went through the legacy mapping
 *    (fixed in the same slice: the writer now maps both). The migration
 *    normalizes case NARROWLY when the descriptor sets `caseFold`: a value
 *    whose case-folded form `lower(col::text)` IS a member is accepted and
 *    converted with `USING lower(col)::text::<enum>`; anything that is not a
 *    member in any case still fails closed naming the offender. This touches
 *    case only, and only when the value is already a member.
 *
 * Additionally, `INITIAL_STOCK` was added to `MovementType` (TypeScript and
 * PostgreSQL members) because the seed script legitimately writes it; since
 * the PG type does not exist yet it is simply part of the `CREATE TYPE`, so no
 * `ALTER TYPE ... ADD VALUE` (restricted in-transaction) is needed.
 *
 * The enum names are `<table>_<column>_enum`, the naming every existing enum
 * type in this schema uses (`users_role_enum`, `products_product_type_enum`,
 * ...); no entity sets `enumName`, so TypeORM derives exactly this name. The
 * member lists are read from the TypeScript enums, which are canonical.
 *
 * down() restores `character varying` plus the pre-existing default per
 * descriptor. It never drops a type, never deletes rows, never touches the
 * tenant policies.
 */
interface EnumColumnTarget {
  table: string;
  column: string;
  enumType: string;
  members: readonly string[];
  /** Member restored as the column default, or null when the column has none. */
  defaultMember: string | null;
  /** Accept and lowercase a value whose case-folded form is a member. */
  caseFold: boolean;
}

const TARGETS: readonly EnumColumnTarget[] = [
  {
    table: 'customer_point_transactions',
    column: 'transaction_type',
    enumType: 'customer_point_transactions_transaction_type_enum',
    members: ['earn', 'redeem', 'adjust', 'reversal'],
    defaultMember: null,
    caseFold: true,
  },
  {
    table: 'customer_point_transactions',
    column: 'origin',
    enumType: 'customer_point_transactions_origin_enum',
    members: ['POS', 'CLOUD'],
    defaultMember: null,
    caseFold: false,
  },
  {
    table: 'customer_point_transactions',
    column: 'type',
    enumType: 'customer_point_transactions_type_enum',
    members: ['earn', 'redeem', 'adjust', 'reversal'],
    defaultMember: 'earn',
    caseFold: false,
  },
  {
    table: 'inventory_kardex',
    column: 'movement_type',
    enumType: 'inventory_kardex_movement_type_enum',
    members: [
      'SALE',
      'SALE_CANCEL',
      'PURCHASE',
      'ENTRADA_COMPRA',
      'SHRINKAGE',
      'PRODUCTION',
      'CREDIT_NOTE_RESTOCK',
      'ADJUSTMENT',
      'REVERSAL',
      'INITIAL_STOCK',
    ],
    defaultMember: null,
    caseFold: false,
  },
  {
    table: 'kardex_recalculate_queue',
    column: 'status',
    enumType: 'kardex_recalculate_queue_status_enum',
    members: ['PENDING', 'PROCESSING', 'COMPLETED', 'BLOCKED', 'FAILED'],
    defaultMember: 'PENDING',
    caseFold: false,
  },
  {
    table: 'promotions',
    column: 'type',
    enumType: 'promotions_type_enum',
    members: [
      'buyXGetYFree',
      'percentageDiscount',
      'fixedDiscount',
      'comboPackage',
    ],
    defaultMember: 'buyXGetYFree',
    caseFold: false,
  },
];

const STRING_TYPES = ['character varying', 'text'];

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

const quoteLiteral = (literal: string): string =>
  `'${literal.replace(/'/g, "''")}'`;

/** Literal list for the membership guard, built only from the frozen member list. */
const memberLiterals = (members: readonly string[]): string =>
  members.map((member) => quoteLiteral(member)).join(', ');

/** The expression the membership guard and the USING clause compare/cast. */
const valueExpression = (target: EnumColumnTarget): string => {
  const column = quoteIdentifier(target.column);
  return target.caseFold ? `lower(${column}::text)` : `${column}::text`;
};

interface ColumnState {
  dataType: string;
  udtName: string;
}

export class ReconcileEnumColumns1809180000000 implements MigrationInterface {
  name = 'ReconcileEnumColumns1809180000000';

  private async readColumn(
    runner: QueryRunner,
    table: string,
    column: string,
  ): Promise<ColumnState | null> {
    const rows = (await runner.query(
      `SELECT data_type AS "dataType", udt_name AS "udtName"
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2`,
      [table, column],
    )) as ColumnState[];

    return rows.length > 0 ? rows[0] : null;
  }

  /** Whether the table is FORCE ROW LEVEL SECURITY (owner subject to RLS too). */
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

  /** Creates the enum when a database never created it, so the ALTER below has a target. */
  private async ensureEnumType(
    runner: QueryRunner,
    target: EnumColumnTarget,
  ): Promise<void> {
    await runner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = current_schema() AND t.typname = '${target.enumType}'
      ) THEN
        CREATE TYPE ${quoteIdentifier(target.enumType)} AS ENUM (${memberLiterals(target.members)});
      END IF;
    END $$;`);
  }

  /**
   * Fails closed before the ALTER when a value is not a member. The ALTER alone
   * would also fail, but with a message that names neither the table nor the
   * offending values. With `caseFold`, a value whose case-folded form is a
   * member is accepted; anything else is still an offender.
   */
  private async assertEveryValueIsAMember(
    runner: QueryRunner,
    target: EnumColumnTarget,
  ): Promise<void> {
    const tableId = quoteIdentifier(target.table);
    const columnId = quoteIdentifier(target.column);

    const rows = (await runner.query(
      `SELECT ${columnId}::text AS value, count(*) AS occurrences
         FROM ${tableId}
        WHERE ${columnId} IS NOT NULL
          AND ${valueExpression(target)} NOT IN (${memberLiterals(target.members)})
        GROUP BY ${columnId}::text
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
      `ENUM_COLUMN_VALUE_NOT_A_MEMBER: ${target.table}.${target.column} holds values that are not members of ` +
        `${target.enumType}, so it cannot be converted without deciding what they mean: ${offenders}. ` +
        `Members are: ${target.members.join(', ')}. Correct the data first, or extend the enum deliberately; ` +
        `this migration will not rewrite a value on its own${target.caseFold ? ' beyond case-folding a member' : ''}.`,
    );
  }

  async up(runner: QueryRunner): Promise<void> {
    for (const target of TARGETS) {
      const before = await this.readColumn(runner, target.table, target.column);

      if (before === null) {
        // No such table in this schema: nothing to reconcile, and creating one
        // is not this migration's job.
        continue;
      }

      if (before.udtName === target.enumType) {
        continue; // already canonical, re-run is a no-op
      }

      if (!STRING_TYPES.includes(before.dataType)) {
        throw new Error(
          `UNEXPECTED_ENUM_COLUMN_TYPE: ${target.table}.${target.column} is '${before.dataType}', which is neither ` +
            `the target enum ${target.enumType} nor a text type this migration can convert. Refusing to guess.`,
        );
      }

      await this.ensureEnumType(runner, target);

      // See the header, point 2: on a FORCE RLS table the counting SELECT below
      // would be silently filtered to zero rows for the migration role, making
      // the fail-closed guard vacuous. Temporarily drop FORCE so the owner sees
      // the rows again, and restore it in a finally so a throw cannot leave the
      // table deniable.
      const forcedRls = await this.isForceRowLevelSecurity(
        runner,
        target.table,
      );
      const tableId = quoteIdentifier(target.table);
      const columnId = quoteIdentifier(target.column);

      if (forcedRls) {
        await runner.query(
          `ALTER TABLE ${tableId} NO FORCE ROW LEVEL SECURITY`,
        );
      }

      try {
        await this.assertEveryValueIsAMember(runner, target);

        // DROP DEFAULT precedes the type change, or a varchar default cannot be
        // cast and PostgreSQL rejects the ALTER. The pre-existing default is
        // restored afterwards only when the descriptor carries one.
        await runner.query(
          `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} DROP DEFAULT`,
        );
        await runner.query(
          `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} TYPE ${quoteIdentifier(target.enumType)} ` +
            `USING ${valueExpression(target)}::${quoteIdentifier(target.enumType)}`,
        );
        if (target.defaultMember !== null) {
          await runner.query(
            `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} SET DEFAULT ` +
              `${quoteLiteral(target.defaultMember)}::${quoteIdentifier(target.enumType)}`,
          );
        }
      } finally {
        if (forcedRls) {
          await runner.query(`ALTER TABLE ${tableId} FORCE ROW LEVEL SECURITY`);
        }
      }
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    for (const target of TARGETS) {
      const before = await this.readColumn(runner, target.table, target.column);

      if (before === null || before.udtName !== target.enumType) {
        continue; // not on the enum: nothing to undo
      }

      const tableId = quoteIdentifier(target.table);
      const columnId = quoteIdentifier(target.column);

      await runner.query(
        `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} DROP DEFAULT`,
      );
      await runner.query(
        `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} TYPE character varying ` +
          `USING ${columnId}::text`,
      );
      if (target.defaultMember !== null) {
        await runner.query(
          `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} SET DEFAULT ` +
            `${quoteLiteral(target.defaultMember)}::character varying`,
        );
      }
    }
  }
}
