import type { DataSource, Migration } from 'typeorm';
import { runPendingMigrations } from './run-pending-migrations';

function fakeMigration(name: string): Migration {
  return { id: undefined, timestamp: 0, name };
}

interface FakeDs {
  initialize: jest.Mock<Promise<DataSource>, []>;
  runMigrations: jest.Mock<Promise<Migration[]>, []>;
  destroy: jest.Mock<Promise<void>, []>;
}

function makeFakeDs(applied: Migration[]): FakeDs {
  const ds: FakeDs = {
    initialize: jest.fn<Promise<DataSource>, []>(),
    runMigrations: jest
      .fn<Promise<Migration[]>, []>()
      .mockResolvedValue(applied),
    destroy: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  };
  ds.initialize.mockResolvedValue(ds as unknown as DataSource);
  return ds;
}

describe('runPendingMigrations', () => {
  it('initializes, runs migrations and destroys in order', async () => {
    const ds = makeFakeDs([fakeMigration('Init1700000000000')]);
    const calls: string[] = [];
    ds.initialize.mockImplementation(async () => {
      calls.push('initialize');
      return ds as unknown as DataSource;
    });
    ds.runMigrations.mockImplementation(async () => {
      calls.push('runMigrations');
      return [fakeMigration('Init1700000000000')];
    });
    ds.destroy.mockImplementation(async () => {
      calls.push('destroy');
    });

    await runPendingMigrations(ds);

    expect(calls).toEqual(['initialize', 'runMigrations', 'destroy']);
  });

  it('returns and prints the applied migration names with a count', async () => {
    const applied = [
      fakeMigration('Init1700000000000'),
      fakeMigration('ModifierGroups1700000001000'),
    ];
    const ds = makeFakeDs(applied);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const result = await runPendingMigrations(ds);

      expect(result.applied).toEqual([
        'Init1700000000000',
        'ModifierGroups1700000001000',
      ]);
      expect(result.count).toBe(2);

      expect(logSpy).toHaveBeenCalledTimes(1);
      const printed = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<
        string,
        unknown
      >;
      expect(printed).toEqual({
        kind: 'PENDING_MIGRATIONS_RUN',
        applied: ['Init1700000000000', 'ModifierGroups1700000001000'],
        count: 2,
      });
    } finally {
      logSpy.mockRestore();
    }
  });

  it('destroys the data source and rethrows when runMigrations fails', async () => {
    const ds = makeFakeDs([]);
    ds.runMigrations.mockRejectedValue(new Error('migration boom'));
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await expect(runPendingMigrations(ds)).rejects.toThrow('migration boom');
      expect(ds.initialize).toHaveBeenCalledTimes(1);
      expect(ds.runMigrations).toHaveBeenCalledTimes(1);
      expect(ds.destroy).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it('treats an empty applied list as a valid outcome (count 0)', async () => {
    const ds = makeFakeDs([]);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const result = await runPendingMigrations(ds);

      expect(result.applied).toEqual([]);
      expect(result.count).toBe(0);

      const printed = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<
        string,
        unknown
      >;
      expect(printed).toEqual({
        kind: 'PENDING_MIGRATIONS_RUN',
        applied: [],
        count: 0,
      });
    } finally {
      logSpy.mockRestore();
    }
  });
});
