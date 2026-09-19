import { QueryResult, type QueryRunner } from 'typeorm';
import { ExplicitChangeLogActor1809170000000 } from './1809170000000-ExplicitChangeLogActor';

const COLUMN_STATE_SQL = 'information_schema.columns';
const CONSTRAINT_SQL = 'pg_constraint';

interface Harness {
  sql: string[];
  params: unknown[][];
}

interface RunnerState {
  /** information_schema row for user_id, or null when the table is absent. */
  userColumn: { dataType: string } | null;
  /** Rows returned for the oversized-actor guard. */
  oversized?: Array<{ value: string; occurrences: string }>;
  /** Rows returned for the pg_constraint lookup. */
  constraintRows?: unknown[];
}

/**
 * The migration reads before it writes: the user_id column's type, the rows
 * that would not fit actor_ref, and whether the CHECK already exists. This
 * runner answers those reads and records every other statement, so a test can
 * assert both the decision and the emitted SQL.
 */
const makeRunner = (
  state: RunnerState,
): { runner: QueryRunner; captured: Harness } => {
  const captured: Harness = { sql: [], params: [] };

  const runner = {
    query: jest.fn((sql: string, params?: unknown[]): Promise<unknown> => {
      if (sql.includes(COLUMN_STATE_SQL)) {
        return Promise.resolve(
          state.userColumn === null ? [] : [state.userColumn],
        );
      }
      if (sql.includes(CONSTRAINT_SQL)) {
        return Promise.resolve(state.constraintRows ?? []);
      }
      if (sql.includes('length(') && sql.includes('> $2')) {
        return Promise.resolve(state.oversized ?? []);
      }
      captured.sql.push(sql);
      captured.params.push(params ?? []);
      return Promise.resolve(new QueryResult());
    }),
  } as unknown as QueryRunner;

  return { runner, captured };
};

const emitted = (captured: Harness): string => captured.sql.join('\n');

describe('ExplicitChangeLogActor1809170000000', () => {
  const migration = new ExplicitChangeLogActor1809170000000();

  describe('up()', () => {
    it('adds actor_ref, drops NOT NULL, converges drifted rows, then adds the CHECK, in that order', async () => {
      const { runner, captured } = makeRunner({
        userColumn: { dataType: 'character varying' },
      });

      await migration.up(runner);
      const sql = emitted(captured);

      expect(sql).toContain(
        'ADD COLUMN IF NOT EXISTS "actor_ref" varchar(64) NULL',
      );
      expect(sql).toContain('ALTER COLUMN "user_id" DROP NOT NULL');
      expect(sql).toContain('SET "actor_ref" = "user_id"::text');
      expect(sql).toContain('ADD CONSTRAINT "change_log_actor_exactly_one"');
      expect(sql).toContain(
        'CHECK (("user_id" IS NULL) <> ("actor_ref" IS NULL))',
      );

      expect(sql.indexOf('ADD COLUMN IF NOT EXISTS')).toBeLessThan(
        sql.indexOf('DROP NOT NULL'),
      );
      expect(sql.indexOf('DROP NOT NULL')).toBeLessThan(sql.indexOf('UPDATE'));
      expect(sql.indexOf('UPDATE')).toBeLessThan(sql.indexOf('ADD CONSTRAINT'));
    });

    it('moves only non-uuid user_id values into actor_ref', async () => {
      const { runner, captured } = makeRunner({
        userColumn: { dataType: 'character varying' },
      });

      await migration.up(runner);

      const update = captured.sql.find((s) => s.includes('UPDATE'));
      expect(update).toBeDefined();
      expect(captured.params.find((p) => p.length > 0)).toEqual([
        '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$',
      ]);
      expect(update).toContain('WHERE "user_id" IS NOT NULL');
      expect(update).toContain('!~ $1');
    });

    it('does not converge on a migration-built database whose user_id is already uuid', async () => {
      const { runner, captured } = makeRunner({
        userColumn: { dataType: 'uuid' },
      });

      await migration.up(runner);
      const sql = emitted(captured);

      expect(sql).not.toContain('UPDATE');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
      expect(sql).toContain('DROP NOT NULL');
      expect(sql).toContain('ADD CONSTRAINT');
    });

    it('is a no-op when the schema has no change_log table', async () => {
      const { runner, captured } = makeRunner({ userColumn: null });

      await migration.up(runner);

      expect(captured.sql).toHaveLength(0);
    });

    it('checks pg_constraint before adding the CHECK, so re-application is a no-op', async () => {
      const { runner, captured } = makeRunner({
        userColumn: { dataType: 'uuid' },
        constraintRows: [1],
      });

      await migration.up(runner);
      const sql = emitted(captured);

      expect(sql).not.toContain('ADD CONSTRAINT');
    });

    it('fails closed, naming the offenders, when a drifted value cannot fit actor_ref', async () => {
      const { runner, captured } = makeRunner({
        userColumn: { dataType: 'character varying' },
        oversized: [{ value: 'x'.repeat(80), occurrences: '2' }],
      });

      await expect(migration.up(runner)).rejects.toThrow(
        /CHANGE_LOG_ACTOR_REF_TOO_LONG/,
      );

      const sql = emitted(captured);
      expect(sql).not.toContain('UPDATE');
      expect(sql).not.toContain('ADD CONSTRAINT');
    });
  });

  describe('down()', () => {
    it('fails closed when any row carries actor identity', async () => {
      const { runner, captured } = makeRunner({
        userColumn: { dataType: 'uuid' },
        constraintRows: [1],
      });
      jest
        .spyOn(
          migration as unknown as {
            countActorRefs: (r: QueryRunner) => Promise<string>;
          },
          'countActorRefs',
        )
        .mockResolvedValue('3');

      await expect(migration.down(runner)).rejects.toThrow(
        /CHANGE_LOG_ACTOR_REF_NOT_EMPTY/,
      );
      expect(emitted(captured)).not.toContain('DROP COLUMN');
      expect(emitted(captured)).not.toContain('SET NOT NULL');
    });

    it('restores the previous shape only when actor_ref is unused everywhere', async () => {
      const { runner, captured } = makeRunner({
        userColumn: { dataType: 'uuid' },
        constraintRows: [1],
      });
      jest
        .spyOn(
          migration as unknown as {
            countActorRefs: (r: QueryRunner) => Promise<string>;
          },
          'countActorRefs',
        )
        .mockResolvedValue('0');

      await migration.down(runner);
      const sql = emitted(captured);

      expect(sql).toContain('DROP CONSTRAINT IF EXISTS');
      expect(sql).toContain('DROP COLUMN IF EXISTS "actor_ref"');
      expect(sql).toContain('ALTER COLUMN "user_id" SET NOT NULL');
      expect(sql.indexOf('DROP CONSTRAINT')).toBeLessThan(
        sql.indexOf('DROP COLUMN'),
      );
      expect(sql.indexOf('DROP COLUMN')).toBeLessThan(
        sql.indexOf('SET NOT NULL'),
      );
    });

    it('is a no-op when the migration never ran here', async () => {
      const { runner, captured } = makeRunner({ userColumn: null });

      await migration.down(runner);

      expect(captured.sql).toHaveLength(0);
    });
  });
});
