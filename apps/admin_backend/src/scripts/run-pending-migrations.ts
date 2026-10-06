import type { DataSource, Migration } from 'typeorm';

/**
 * Result of applying the pending migrations for the local dev database.
 *
 * The runner reuses the exact `DataSource` exported by `src/data-source.ts`
 * (CLI-style, uninitialized, `synchronize: false`, migrations globbed from
 * `src/migrations`) so the dev CLI path and this programmatic path can never
 * drift apart in connection config or migration list.
 */
export interface PendingMigrationsRunResult {
  /** Class names of the migrations that were applied in this run. */
  applied: string[];
  /** Convenience count of `applied`. */
  count: number;
}

/**
 * Core of the dev migration runner, extracted so it can be unit-tested with
 * fakes and never touches a real database from the test suite.
 *
 * `ds.runMigrations()` returns the TypeORM `Migration[]` records it applied;
 * only their names are surfaced to the machine-readable output.
 */
export async function runPendingMigrations(
  ds: Pick<DataSource, 'initialize' | 'runMigrations' | 'destroy'>,
): Promise<PendingMigrationsRunResult> {
  try {
    await ds.initialize();
    const migrations: Migration[] = await ds.runMigrations();
    const applied = migrations.map((migration) => migration.name);
    const result: PendingMigrationsRunResult = {
      applied,
      count: applied.length,
    };
    // Intentionally the only output: machine-readable handoff, house style.
    console.log(JSON.stringify({ kind: 'PENDING_MIGRATIONS_RUN', ...result }));
    return result;
  } finally {
    // destroy runs even when initialize/runMigrations reject; the original
    // error still propagates to the `require.main` wrapper.
    await ds.destroy();
  }
}

async function main(): Promise<void> {
  // Lazy import: constructing the CLI-style DataSource has module-load side
  // effects (dotenv, connection resolution) that must not run in unit tests.
  const dataSource = (await import('../data-source')).default;
  await runPendingMigrations(dataSource);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
