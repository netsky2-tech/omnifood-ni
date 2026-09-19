import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes `audit_logs.id` the uuid the entity has always declared.
 *
 * Issue #410: `AuditLog` declares `@PrimaryGeneratedColumn('uuid')`, but the
 * shipped column is `character varying` with default
 * `gen_random_uuid()::character varying`. The cause is
 * `1793000000000-AlterAuditLogIdToUuid`, whose name records the intent while
 * its body casts the column to `varchar` instead of `uuid`. The default it
 * chose already generates a uuid, so this is a mistake in that migration, not
 * a decision in the domain — and editing that migration now would fix nothing:
 * every database that already recorded it never re-runs it. Only a new
 * migration runs there.
 *
 * What this migration deliberately does NOT do. Audit rows are append-only
 * (`trg_audit_logs_immutable` forbids UPDATE and DELETE), so ids can never be
 * rewritten. `1793000000000` converted `bigint` ids with `USING id::varchar`,
 * which yields numeric strings (`'1'`, `'2'`, ...). A database that already
 * held audit rows when it ran can hold such ids today, and `id::uuid` cannot
 * convert them. Rather than guess, up() counts those rows first and fails
 * closed naming up to 10 offenders, stating they predate `1793000000000` and
 * that this migration will not rewrite append-only rows. Resolving them is a
 * separate, deliberate data decision.
 *
 * The conversion itself is a plain column rewrite (`ALTER COLUMN id TYPE uuid
 * USING id::uuid`). PostgreSQL table rewrites do not fire per-row triggers, so
 * `trg_audit_logs_immutable` neither blocks the conversion nor is removed by
 * it; the DB-backed spec proves both sides of that assumption: the conversion
 * succeeds with the trigger present, and a manual UPDATE is still rejected
 * afterwards.
 *
 * down() restores exactly the shape `1793000000000` left behind — varchar with
 * the `::varchar`-cast default. It reverses this migration; it does not
 * endorse that shape. Note, without fixing: `1793000000000`'s own down()
 * restores `bigint`, which would fail on any uuid value now stored; that is a
 * defect of the old migration and is out of scope here.
 */
const TABLE = 'audit_logs';
const COLUMN = 'id';
const STRING_TYPES = ['character varying', 'text'];
const UUID_PATTERN =
  '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$';
const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

interface ColumnState {
  dataType: string;
  udtName: string;
}

export class MakeAuditLogIdUuid1809190000000 implements MigrationInterface {
  name = 'MakeAuditLogIdUuid1809190000000';

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

  /**
   * Fails closed before the ALTER when an id is not already a uuid string.
   * The ALTER alone would also fail on such a row, but with a message that
   * names neither the ids nor the fact that they cannot be rewritten.
   */
  private async assertEveryIdIsUuidShaped(runner: QueryRunner): Promise<void> {
    const rows = (await runner.query(
      `SELECT ${quoteIdentifier(COLUMN)}::text AS value, count(*) AS occurrences
         FROM ${quoteIdentifier(TABLE)}
        WHERE ${quoteIdentifier(COLUMN)}::text !~ $1
        GROUP BY ${quoteIdentifier(COLUMN)}::text
        ORDER BY count(*) DESC
        LIMIT 10`,
      [UUID_PATTERN],
    )) as Array<{ value: string; occurrences: string }>;

    if (rows.length === 0) {
      return;
    }

    const offenders = rows
      .map((row) => `'${row.value}' (${row.occurrences} row(s))`)
      .join(', ');

    throw new Error(
      `AUDIT_LOG_ID_NOT_A_UUID: ${TABLE}.${COLUMN} holds values that are not uuid strings, ` +
        `so it cannot be converted to uuid: ${offenders}. These ids predate ` +
        `1793000000000-AlterAuditLogIdToUuid, which cast bigint ids with ` +
        `id::varchar instead of id::uuid. Audit rows are append-only ` +
        `(trg_audit_logs_immutable forbids UPDATE and DELETE), so this migration ` +
        `will not rewrite them. Resolving those ids is a separate, deliberate data decision.`,
    );
  }

  async up(runner: QueryRunner): Promise<void> {
    const before = await this.readColumn(runner);

    if (before === null) {
      // No audit_logs table in this schema: nothing to reconcile, and creating
      // one is not this migration's job.
      return;
    }

    if (before.dataType === 'uuid') {
      return; // already canonical
    }

    if (!STRING_TYPES.includes(before.dataType)) {
      throw new Error(
        `UNEXPECTED_AUDIT_LOG_ID_COLUMN: ${TABLE}.${COLUMN} is '${before.dataType}', which is neither ` +
          `uuid nor a string type this migration can convert to uuid. Refusing to guess.`,
      );
    }

    await this.assertEveryIdIsUuidShaped(runner);

    await runner.query(
      `ALTER TABLE ${quoteIdentifier(TABLE)} ALTER COLUMN ${quoteIdentifier(COLUMN)} DROP DEFAULT`,
    );
    await runner.query(
      `ALTER TABLE ${quoteIdentifier(TABLE)} ALTER COLUMN ${quoteIdentifier(COLUMN)} TYPE uuid USING ${quoteIdentifier(COLUMN)}::uuid`,
    );
    await runner.query(
      `ALTER TABLE ${quoteIdentifier(TABLE)} ALTER COLUMN ${quoteIdentifier(COLUMN)} SET DEFAULT gen_random_uuid()`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    const before = await this.readColumn(runner);

    if (before === null || before.dataType !== 'uuid') {
      return; // not on uuid: nothing to undo
    }

    // Restores exactly what the misnamed migration left: varchar plus the
    // ::varchar-cast default. This reverses THIS migration; it does not
    // endorse the shape it produces.
    await runner.query(
      `ALTER TABLE ${quoteIdentifier(TABLE)} ALTER COLUMN ${quoteIdentifier(COLUMN)} DROP DEFAULT`,
    );
    await runner.query(
      `ALTER TABLE ${quoteIdentifier(TABLE)} ALTER COLUMN ${quoteIdentifier(COLUMN)} TYPE character varying USING ${quoteIdentifier(COLUMN)}::varchar`,
    );
    await runner.query(
      `ALTER TABLE ${quoteIdentifier(TABLE)} ALTER COLUMN ${quoteIdentifier(COLUMN)} SET DEFAULT gen_random_uuid()::varchar`,
    );
  }
}
