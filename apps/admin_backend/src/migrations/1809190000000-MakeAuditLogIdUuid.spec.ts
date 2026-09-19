import { QueryResult, type QueryRunner } from 'typeorm';
import { MakeAuditLogIdUuid1809190000000 } from './1809190000000-MakeAuditLogIdUuid';

const COLUMN_STATE_SQL = 'information_schema.columns';

interface Harness {
  sql: string[];
  offenders: { value: string; occurrences: string }[];
}

/**
 * The migration reads two things before it writes: the column's current type
 * and the rows whose id is not a uuid-shaped string. This runner answers those
 * reads and records everything else, so a test can assert both the decision
 * and the emitted SQL.
 */
const makeRunner = (
  state: { dataType: string; udtName: string } | null,
  offenders: { value: string; occurrences: string }[] = [],
): { runner: QueryRunner; captured: Harness } => {
  const captured: Harness = { sql: [], offenders };

  const runner = {
    query: jest.fn((sql: string): Promise<unknown> => {
      if (sql.includes(COLUMN_STATE_SQL)) {
        return Promise.resolve(state === null ? [] : [state]);
      }
      if (sql.includes('::text !~')) {
        return Promise.resolve(captured.offenders);
      }
      captured.sql.push(sql);
      return Promise.resolve(new QueryResult());
    }),
  } as unknown as QueryRunner;

  return { runner, captured };
};

const emitted = (captured: Harness): string => captured.sql.join('\n');

describe('MakeAuditLogIdUuid1809190000000', () => {
  const migration = new MakeAuditLogIdUuid1809190000000();

  describe('up()', () => {
    it('drops the default, converts to uuid, then sets the cast-free default, in that order', async () => {
      const { runner, captured } = makeRunner({
        dataType: 'character varying',
        udtName: 'varchar',
      });

      await migration.up(runner);
      const sql = emitted(captured);

      expect(sql).toContain('DROP DEFAULT');
      expect(sql).toContain(
        'ALTER TABLE "audit_logs" ALTER COLUMN "id" TYPE uuid',
      );
      expect(sql).toContain('USING "id"::uuid');
      expect(sql).toContain('SET DEFAULT gen_random_uuid()');
      // The default must not reintroduce the ::varchar cast that caused #410.
      expect(sql).not.toContain('gen_random_uuid()::varchar');

      // DROP DEFAULT must precede the type change, or the old varchar default
      // cannot be cast and PostgreSQL rejects the ALTER.
      expect(sql.indexOf('DROP DEFAULT')).toBeLessThan(
        sql.indexOf('TYPE uuid'),
      );
      expect(sql.indexOf('TYPE uuid')).toBeLessThan(
        sql.indexOf('SET DEFAULT gen_random_uuid()'),
      );
    });

    it('is a no-op when the column is already uuid', async () => {
      const { runner, captured } = makeRunner({
        dataType: 'uuid',
        udtName: 'uuid',
      });

      await migration.up(runner);

      expect(captured.sql).toHaveLength(0);
    });

    it('is a no-op when the schema has no audit_logs table', async () => {
      const { runner, captured } = makeRunner(null);

      await migration.up(runner);

      expect(captured.sql).toHaveLength(0);
    });

    it('refuses a type it cannot convert instead of guessing, naming the type', async () => {
      const { runner, captured } = makeRunner({
        dataType: 'integer',
        udtName: 'int4',
      });

      await expect(migration.up(runner)).rejects.toThrow(
        /UNEXPECTED_AUDIT_LOG_ID_COLUMN.*integer/s,
      );
      expect(captured.sql.join('\n')).not.toContain('ALTER COLUMN');
    });

    it('fails closed before any ALTER when an id is not uuid-shaped', async () => {
      const { runner, captured } = makeRunner(
        { dataType: 'character varying', udtName: 'varchar' },
        [{ value: '1', occurrences: '2' }],
      );

      await expect(migration.up(runner)).rejects.toThrow(
        /AUDIT_LOG_ID_NOT_A_UUID/,
      );

      expect(captured.sql.join('\n')).not.toContain('ALTER COLUMN');
    });

    it('names the offending ids, their row counts, and why it will not rewrite them', async () => {
      const { runner } = makeRunner(
        { dataType: 'character varying', udtName: 'varchar' },
        [
          { value: '1', occurrences: '2' },
          { value: '42', occurrences: '1' },
        ],
      );

      await expect(migration.up(runner)).rejects.toThrow(
        /'1' \(2 row\(s\)\), '42' \(1 row\(s\)\)/,
      );
      await expect(migration.up(runner)).rejects.toThrow(/append-only/);
    });

    it('never rewrites a value, whatever it does emit', async () => {
      const { runner, captured } = makeRunner({
        dataType: 'character varying',
        udtName: 'varchar',
      });

      await migration.up(runner);

      expect(emitted(captured)).not.toMatch(/UPDATE\s+"?audit_logs/i);
      expect(emitted(captured)).not.toMatch(/INSERT INTO/i);
      expect(emitted(captured)).not.toMatch(/DELETE FROM/i);
    });
  });

  describe('down()', () => {
    it('restores exactly the shape the misnamed migration left behind', async () => {
      const { runner, captured } = makeRunner({
        dataType: 'uuid',
        udtName: 'uuid',
      });

      await migration.down(runner);
      const sql = emitted(captured);

      expect(sql).toContain(
        'ALTER TABLE "audit_logs" ALTER COLUMN "id" TYPE character varying',
      );
      expect(sql).toContain('USING "id"::varchar');
      expect(sql).toContain('SET DEFAULT gen_random_uuid()::varchar');
      expect(sql).not.toContain('DROP TABLE');
    });

    it('is a no-op when the column is not uuid', async () => {
      const { runner, captured } = makeRunner({
        dataType: 'character varying',
        udtName: 'varchar',
      });

      await migration.down(runner);

      expect(captured.sql).toHaveLength(0);
    });
  });
});
