import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Converges the last ten naive `timestamp` columns to `timestamptz`.
 *
 * Issue #409. Before this migration the schema mixed two timestamp
 * conventions: 166 of 176 timestamp columns are `timestamptz`, while the
 * columns listed in TARGETS were created as bare `timestamp without time
 * zone` — almost entirely an accident of which migration happened to create
 * the column and whether the creating migration spelled the type out. The
 * split runs through single tables (`invoices.created_at` was naive while
 * `invoices.updated_at` was aware), so it is not a convention anyone chose.
 * The user decision taken for this issue: converge everything to
 * `timestamptz`.
 *
 * The UTC interpretation. Every target column was populated by `now()` into a
 * `timestamp without time zone` column, so the stored value is the insert
 * session's wall-clock time. Interpreting it as UTC — `USING col AT TIME ZONE
 * 'UTC'` — is correct only because the deployment ran with the database
 * server (and therefore `now()`) in UTC. That assumption is the foundation of
 * this migration and is recorded here so a future reader knows what the
 * conversion assumed rather than discovering it by reading the SQL. If any
 * environment ever ran these columns on a non-UTC server, the pre-existing
 * values would need a different offset and this migration must not be run
 * there unmodified.
 *
 * Unlike #408, there is no fail-closed value guard, and that is deliberate:
 * `timestamp without time zone` -> `timestamptz` is total on every possible
 * input (an ALTER TABLE type rewrite preserves all rows), so there is no
 * unrecognized value to refuse. The obligation that replaces it — row counts
 * must be preserved — is asserted by the DB-backed spec, not by runtime
 * counting that an ALTER TABLE could not act on anyway.
 *
 * Per target the migration reads the column type first and:
 *   - no-ops when the column is already `timestamptz` (idempotent re-run),
 *   - no-ops when the table or column is absent (partial environments),
 *   - throws naming the actual type when it is neither naive timestamp nor
 *     timestamptz — never guesses.
 *
 * down() reverses each converted column with the same UTC interpretation in
 * the other direction: `timestamptz AT TIME ZONE 'UTC'` yields the naive wall
 * clock of the UTC instant, restoring exactly the pre-up representation.
 */
interface Target {
  table: string;
  column: string;
}

const TARGETS: Target[] = [
  { table: 'invoice_payments', column: 'reconciled_at' },
  { table: 'invoices', column: 'created_at' },
  { table: 'production_batch_history', column: 'created_at' },
  { table: 'production_batch_history', column: 'operation_date' },
  { table: 'security_profiles', column: 'created_at' },
  { table: 'security_profiles', column: 'updated_at' },
  { table: 'tenants', column: 'created_at' },
  { table: 'tenants', column: 'updated_at' },
  { table: 'users', column: 'created_at' },
  { table: 'users', column: 'updated_at' },
];

const NAIVE = 'timestamp without time zone';
const AWARE = 'timestamp with time zone';

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class ConvergeNaiveTimestamps1809200000000 implements MigrationInterface {
  name = 'ConvergeNaiveTimestamps1809200000000';

  private async readDataType(
    runner: QueryRunner,
    target: Target,
  ): Promise<string | null> {
    const rows = (await runner.query(
      `SELECT data_type
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2`,
      [target.table, target.column],
    )) as Array<{ data_type: string }>;

    return rows.length > 0 ? rows[0].data_type : null;
  }

  private async convert(
    runner: QueryRunner,
    target: Target,
    fromType: typeof NAIVE | typeof AWARE,
  ): Promise<void> {
    const quotedTable = quoteIdentifier(target.table);
    const quotedColumn = quoteIdentifier(target.column);
    await runner.query(
      `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedColumn} TYPE ${fromType === NAIVE ? 'timestamptz' : 'timestamp without time zone'} USING ${quotedColumn} AT TIME ZONE 'UTC'`,
    );
  }

  async up(runner: QueryRunner): Promise<void> {
    for (const target of TARGETS) {
      const dataType = await this.readDataType(runner, target);

      if (dataType === null || dataType === AWARE) {
        // Absent column (partial environment) or already canonical: nothing
        // to reconcile, and altering anything is not this migration's job.
        continue;
      }

      if (dataType !== NAIVE) {
        throw new Error(
          `UNEXPECTED_TIMESTAMP_COLUMN_TYPE: ${target.table}.${target.column} is '${dataType}', which is neither ` +
            `'${NAIVE}' nor '${AWARE}'. This migration only converges the two timestamp ` +
            `conventions and refuses to guess how to reach timestamptz from anything else.`,
        );
      }

      await this.convert(runner, target, NAIVE);
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    for (const target of TARGETS) {
      const dataType = await this.readDataType(runner, target);

      if (dataType === null || dataType === NAIVE) {
        continue;
      }

      if (dataType !== AWARE) {
        throw new Error(
          `UNEXPECTED_TIMESTAMP_COLUMN_TYPE: ${target.table}.${target.column} is '${dataType}', which is neither ` +
            `'${NAIVE}' nor '${AWARE}'. This migration only reverses the timestamp ` +
            `convergence and refuses to guess how to reach a naive timestamp from anything else.`,
        );
      }

      await this.convert(runner, target, AWARE);
    }
  }
}
