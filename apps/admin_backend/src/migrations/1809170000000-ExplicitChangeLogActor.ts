import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the change_log actor explicit: a human user (user_id) or a logical
 * actor (actor_ref), never both, never neither.
 *
 * Issue #412. `CreateChangeLogTable1794000000000` creates `user_id UUID NOT
 * NULL`, and the entity declared it as a bare `@Column()` (varchar), so the
 * DB specs built their schema with `synchronize: true` and never saw the lie.
 * At 13 call sites the "user id" is not always a uuid — 'SYSTEM',
 * 'SYSTEM_FINALIZER', 'SYSTEM_RECONCILER', 'SUPPORT_OPERATOR' and one
 * terminal id — so every one of those inserts aborted with
 * `invalid input syntax for type uuid` on a migration-built database.
 *
 * The model is not invented here: docs/onboarding/onboarding_architecture_spec.md
 * already specifies the audit metadata as `actorUserId / SYSTEM_RECONCILER`,
 * a union of a human actor and a logical actor. This migration encodes it:
 *
 *   - `user_id` becomes nullable (the migration's own truth, now also the
 *     entity's declaration),
 *   - `actor_ref varchar(64)` holds the logical actor when no human performed
 *     the change,
 *   - the CHECK `change_log_actor_exactly_one` enforces
 *     `(user_id IS NULL) <> (actor_ref IS NULL)`,
 *   - and drifted rows converge: on a database provisioned by
 *     `synchronize: true`, `user_id` is varchar holding values like 'SYSTEM'.
 *     Those values move to `actor_ref` and `user_id` is set to NULL, so the
 *     standard #286/#404 rule holds — a migration converges environments that
 *     already drifted instead of blocking on them.
 *
 * Every step is guarded so re-application is a no-op: `IF NOT EXISTS` on the
 * column, an idempotent `DROP NOT NULL`, a convergence UPDATE that only
 * touches non-uuid values, and a pg_constraint lookup before the CHECK is
 * added. CreateChangeLogTable1794000000000 is not re-run on databases that
 * already recorded it, so only this migration can converge them.
 *
 * down() fails closed when any row carries an actor_ref: restoring
 * `user_id NOT NULL` while actor identity exists would silently destroy who
 * or what performed the change. It restores the previous shape only when
 * actor_ref is unused everywhere.
 */
const TABLE = 'change_log';
const ACTOR_COLUMN = 'actor_ref';
const USER_COLUMN = 'user_id';
const CONSTRAINT = 'change_log_actor_exactly_one';
const ACTOR_REF_MAX_LENGTH = 64;

/** PostgreSQL uuid textual shape: 8-4-4-4-12 hex digits. */
const UUID_TEXT_PATTERN =
  '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$';

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

interface ColumnState {
  dataType: string;
}

export class ExplicitChangeLogActor1809170000000 implements MigrationInterface {
  name = 'ExplicitChangeLogActor1809170000000';

  private async readColumnState(
    runner: QueryRunner,
    column: string,
  ): Promise<ColumnState | null> {
    const rows = (await runner.query(
      `SELECT data_type AS "dataType"
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2`,
      [TABLE, column],
    )) as ColumnState[];

    return rows.length > 0 ? rows[0] : null;
  }

  private async constraintExists(runner: QueryRunner): Promise<boolean> {
    const rows = (await runner.query(
      `SELECT 1
         FROM pg_constraint
        WHERE conname = $1
          AND conrelid = 'change_log'::regclass
        LIMIT 1`,
      [CONSTRAINT],
    )) as unknown[];

    return rows.length > 0;
  }

  private async countActorRefs(runner: QueryRunner): Promise<string> {
    const rows = (await runner.query(
      `SELECT count(*) AS occurrences
         FROM ${quoteIdentifier(TABLE)}
        WHERE ${quoteIdentifier(ACTOR_COLUMN)} IS NOT NULL`,
    )) as Array<{ occurrences: string }>;

    return rows[0].occurrences;
  }

  async up(runner: QueryRunner): Promise<void> {
    const userColumn = await this.readColumnState(runner, USER_COLUMN);

    if (userColumn === null) {
      // No change_log table in this schema: nothing to converge, and creating
      // one is not this migration's job.
      return;
    }

    const tableId = quoteIdentifier(TABLE);
    const userId = quoteIdentifier(USER_COLUMN);
    const actorId = quoteIdentifier(ACTOR_COLUMN);

    // 1. The logical-actor column. IF NOT EXISTS keeps re-application a no-op.
    await runner.query(
      `ALTER TABLE ${tableId} ADD COLUMN IF NOT EXISTS ${actorId} varchar(${ACTOR_REF_MAX_LENGTH}) NULL`,
    );

    // 2. A human actor is now optional; the CHECK below makes "neither" illegal.
    await runner.query(
      `ALTER TABLE ${tableId} ALTER COLUMN ${userId} DROP NOT NULL`,
    );

    // 3. Converge drifted rows: any user_id whose text is not uuid-shaped was
    // written before the column's declared type was the truth. It moves to
    // actor_ref verbatim and user_id becomes NULL.
    if (userColumn.dataType !== 'uuid') {
      const oversized = (await runner.query(
        `SELECT ${userId}::text AS value, count(*) AS occurrences
           FROM ${tableId}
          WHERE ${userId} IS NOT NULL
            AND ${userId}::text !~ $1
            AND length(${userId}::text) > $2
          GROUP BY ${userId}::text
          ORDER BY count(*) DESC
          LIMIT 10`,
        [UUID_TEXT_PATTERN, ACTOR_REF_MAX_LENGTH],
      )) as Array<{ value: string; occurrences: string }>;

      if (oversized.length > 0) {
        const offenders = oversized
          .map((row) => `'${row.value}' (${row.occurrences} row(s))`)
          .join(', ');

        throw new Error(
          `CHANGE_LOG_ACTOR_REF_TOO_LONG: ${TABLE}.${USER_COLUMN} holds non-uuid actor values longer ` +
            `than ${ACTOR_REF_MAX_LENGTH} characters, so they cannot move to ${ACTOR_COLUMN} without ` +
            `truncating who performed the change: ${offenders}. Correct the data first; this migration ` +
            `will not truncate actor identity on its own.`,
        );
      }

      await runner.query(
        `UPDATE ${tableId}
            SET ${actorId} = ${userId}::text,
                ${userId} = NULL
          WHERE ${userId} IS NOT NULL
            AND ${userId}::text !~ $1`,
        [UUID_TEXT_PATTERN],
      );
    }

    // 4. Exactly one of the two, guarded so re-application is a no-op.
    if (!(await this.constraintExists(runner))) {
      await runner.query(
        `ALTER TABLE ${tableId} ADD CONSTRAINT ${quoteIdentifier(CONSTRAINT)} ` +
          `CHECK ((${userId} IS NULL) <> (${actorId} IS NULL))`,
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    const actorColumn = await this.readColumnState(runner, ACTOR_COLUMN);

    if (actorColumn === null) {
      return; // never applied here: nothing to undo
    }

    const occurrences = await this.countActorRefs(runner);
    if (occurrences !== '0') {
      throw new Error(
        `CHANGE_LOG_ACTOR_REF_NOT_EMPTY: ${TABLE}.${ACTOR_COLUMN} still holds ${occurrences} row(s) of ` +
          `actor identity, so restoring ${USER_COLUMN} NOT NULL would silently destroy who or what ` +
          `performed those changes. Resolve the rows first; this migration will not delete or rewrite them.`,
      );
    }

    const tableId = quoteIdentifier(TABLE);
    const userId = quoteIdentifier(USER_COLUMN);
    const actorId = quoteIdentifier(ACTOR_COLUMN);

    if (await this.constraintExists(runner)) {
      await runner.query(
        `ALTER TABLE ${tableId} DROP CONSTRAINT IF EXISTS ${quoteIdentifier(CONSTRAINT)}`,
      );
    }
    await runner.query(
      `ALTER TABLE ${tableId} DROP COLUMN IF EXISTS ${actorId}`,
    );
    await runner.query(
      `ALTER TABLE ${tableId} ALTER COLUMN ${userId} SET NOT NULL`,
    );
  }
}
