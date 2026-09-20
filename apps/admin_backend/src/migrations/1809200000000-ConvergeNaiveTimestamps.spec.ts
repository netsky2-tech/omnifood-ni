import { QueryResult, type QueryRunner } from 'typeorm';
import { ConvergeNaiveTimestamps1809200000000 } from './1809200000000-ConvergeNaiveTimestamps';

const NAIVE = 'timestamp without time zone';
const AWARE = 'timestamp with time zone';

interface Harness {
  /** ALTER statements only, in order. */
  alters: string[];
  /** Every statement including the answered reads, in order. */
  all: string[];
}

/**
 * The migration reads each target column's type from information_schema before
 * it writes. This runner answers that read per table.column and records every
 * statement it does not answer, so a test can assert both the decision and the
 * emitted SQL without a database.
 */
const makeRunner = (options?: {
  states?: Record<string, string | null>;
}): { runner: QueryRunner; captured: Harness } => {
  const captured: Harness = { alters: [], all: [] };
  const states = new Map(Object.entries(options?.states ?? {}));

  const runner = {
    query: jest.fn((sql: string, parameters?: unknown[]): Promise<unknown> => {
      captured.all.push(sql);
      if (sql.includes('information_schema.columns')) {
        const [table, column] = parameters as [string, string];
        const state = states.get(`${table}.${column}`);
        return Promise.resolve(
          state === undefined || state === null ? [] : [{ data_type: state }],
        );
      }
      captured.alters.push(sql);
      return Promise.resolve(new QueryResult());
    }),
  } as unknown as QueryRunner;

  return { runner, captured };
};

const TARGETS = [
  'invoice_payments.reconciled_at',
  'invoices.created_at',
  'production_batch_history.created_at',
  'production_batch_history.operation_date',
  'security_profiles.created_at',
  'security_profiles.updated_at',
  'tenants.created_at',
  'tenants.updated_at',
  'users.created_at',
  'users.updated_at',
];

const naiveEverywhere = (): Record<string, string> =>
  Object.fromEntries(TARGETS.map((key) => [key, NAIVE]));

describe('ConvergeNaiveTimestamps1809200000000', () => {
  const migration = new ConvergeNaiveTimestamps1809200000000();

  it('converts every naive timestamp column with AT TIME ZONE UTC interpreting the stored value as UTC', async () => {
    const { runner, captured } = makeRunner({ states: naiveEverywhere() });

    await migration.up(runner);

    expect(captured.alters).toHaveLength(TARGETS.length);
    for (const [table, column] of TARGETS.map((key) => key.split('.'))) {
      const alter = captured.alters.find((sql) =>
        sql.includes(`ALTER TABLE "${table}" ALTER COLUMN "${column}"`),
      );
      expect(alter).toBeDefined();
      expect(alter).toBe(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE timestamptz USING "${column}" AT TIME ZONE 'UTC'`,
      );
    }
  });

  it('no-ops on columns that are already timestamptz', async () => {
    const states = Object.fromEntries(
      TARGETS.map((key) => [key, AWARE]),
    ) as Record<string, string>;
    const { runner, captured } = makeRunner({ states });

    await migration.up(runner);

    expect(captured.alters).toEqual([]);
  });

  it('no-ops when the table or column is absent', async () => {
    const { runner, captured } = makeRunner({ states: {} });

    await migration.up(runner);

    expect(captured.alters).toEqual([]);
  });

  it('throws naming the type when a column is neither naive timestamp nor timestamptz, and converts nothing', async () => {
    // The offending target is the FIRST in the migration's list, so the
    // refusal fires before any ALTER is issued at all.
    const states = {
      ...naiveEverywhere(),
      'invoice_payments.reconciled_at': 'date',
    };
    const { runner, captured } = makeRunner({ states });

    await expect(migration.up(runner)).rejects.toThrow(
      /UNEXPECTED_TIMESTAMP_COLUMN_TYPE: invoice_payments\.reconciled_at is 'date'/,
    );
    await expect(migration.up(runner)).rejects.toThrow(
      /neither 'timestamp without time zone' nor 'timestamp with time zone'/,
    );

    // The refusal happens before any ALTER for that target; no statement was
    // emitted at all because the offending target sorts mid-list.
    expect(captured.alters).toEqual([]);
  });

  it('is idempotent: a second up() over converged columns emits nothing', async () => {
    const states = Object.fromEntries(
      TARGETS.map((key) => [key, AWARE]),
    ) as Record<string, string>;
    const { runner, captured } = makeRunner({ states });

    await migration.up(runner);
    await migration.up(runner);

    expect(captured.alters).toEqual([]);
  });

  it('down() reverses each converted column to timestamp without time zone with the same UTC interpretation', async () => {
    const states = Object.fromEntries(
      TARGETS.map((key) => [key, AWARE]),
    ) as Record<string, string>;
    const { runner, captured } = makeRunner({ states });

    await migration.down(runner);

    expect(captured.alters).toHaveLength(TARGETS.length);
    for (const [table, column] of TARGETS.map((key) => key.split('.'))) {
      const alter = captured.alters.find((sql) =>
        sql.includes(`ALTER TABLE "${table}" ALTER COLUMN "${column}"`),
      );
      expect(alter).toBe(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE timestamp without time zone USING "${column}" AT TIME ZONE 'UTC'`,
      );
    }
  });

  it('down() no-ops on naive or absent columns and refuses unexpected types symmetrically', async () => {
    const naiveRunner = makeRunner({ states: naiveEverywhere() });
    await new ConvergeNaiveTimestamps1809200000000().down(naiveRunner.runner);
    expect(naiveRunner.captured.alters).toEqual([]);

    const absentRunner = makeRunner({ states: {} });
    await new ConvergeNaiveTimestamps1809200000000().down(absentRunner.runner);
    expect(absentRunner.captured.alters).toEqual([]);

    const unexpectedRunner = makeRunner({
      states: { 'tenants.updated_at': 'character varying' },
    });
    await expect(
      new ConvergeNaiveTimestamps1809200000000().down(unexpectedRunner.runner),
    ).rejects.toThrow(
      /UNEXPECTED_TIMESTAMP_COLUMN_TYPE: tenants\.updated_at is 'character varying'/,
    );
    expect(unexpectedRunner.captured.alters).toEqual([]);
  });
});
