import { QueryResult, type QueryRunner } from 'typeorm';
import { AddTenantSlug1809350000000 } from './1809350000000-AddTenantSlug';

/**
 * Unit contract for the OD-03 tenant slug migration (issue #556 slice 11,
 * founder design): tenants gains a NOT NULL, globally unique, server-resolved
 * slug backfilled from `name` with the canonical normalization rule.
 *
 * The slug is stable provisioning CONTEXT (resolved server-side, never
 * authority), so the migration must be:
 *
 * - Idempotent in the partial-ledger scenario: ADD COLUMN IF NOT EXISTS,
 *   backfill only NULL rows, CREATE UNIQUE INDEX IF NOT EXISTS, SET NOT NULL.
 * - Collision-safe: same normalized name resolves deterministically with
 *   -2, -3, ... suffixes through the shared tenant-slug vocabulary.
 * - Reversible as derived data: down() drops exactly the index and the
 *   column; up() re-derives identical slugs from `name`.
 * - Parameterized: backfill values travel as bound parameters, never as
 *   interpolated SQL text.
 */

const isBackfillRowsQuery = (sql: string): boolean =>
  sql.includes('SELECT id, name FROM tenants WHERE slug IS NULL');

const isTakenSlugsQuery = (sql: string): boolean =>
  sql.includes('SELECT slug FROM tenants WHERE slug IS NOT NULL');

interface QueryCall {
  sql: string;
  parameters?: unknown[];
}

describe('AddTenantSlug1809350000000', () => {
  const migration = new AddTenantSlug1809350000000();

  const collectSql = async (
    direction: 'up' | 'down',
    rows: Array<{ id: string; name: string }> = [],
    takenSlugs: string[] = [],
  ): Promise<QueryCall[]> => {
    const calls: QueryCall[] = [];
    const queryRunner = {
      query: jest.fn((sql: string, parameters?: unknown[]) => {
        calls.push({ sql, parameters });
        if (isBackfillRowsQuery(sql)) {
          return Promise.resolve(rows.map((row) => ({ ...row })));
        }
        if (isTakenSlugsQuery(sql)) {
          return Promise.resolve(takenSlugs.map((slug) => ({ slug })));
        }
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;
    await migration[direction](queryRunner);
    return calls;
  };

  it('adds the slug column guarded for the partial-ledger re-run', async () => {
    const calls = await collectSql('up');
    expect(
      calls.some(
        ({ sql }) =>
          sql.includes('ALTER TABLE') &&
          sql.includes('ADD COLUMN IF NOT EXISTS slug'),
      ),
    ).toBe(true);
  });

  it('creates the unique index guarded and sets NOT NULL after the backfill', async () => {
    const calls = await collectSql('up');
    const backfillIndex = calls.findIndex(({ sql }) =>
      sql.includes('UPDATE tenants SET slug'),
    );
    const indexCall = calls.findIndex(
      ({ sql }) =>
        sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_slug') &&
        !sql.includes('DROP'),
    );
    const notNullCall = calls.findIndex(({ sql }) =>
      sql.includes('ALTER COLUMN slug SET NOT NULL'),
    );
    expect(indexCall).toBeGreaterThan(-1);
    expect(notNullCall).toBeGreaterThan(indexCall);
    expect(notNullCall).toBeGreaterThan(backfillIndex);
  });

  it('backfills NULL rows through the shared normalization with bound parameters', async () => {
    const calls = await collectSql('up', [
      { id: 't-1', name: 'Mi Negocio' },
      { id: 't-2', name: 'Café El Nica!' },
    ]);

    const updates = calls.filter(({ sql }) =>
      sql.includes('UPDATE tenants SET slug'),
    );
    expect(updates).toHaveLength(2);
    expect(updates[0].parameters).toEqual(['mi-negocio', 't-1']);
    expect(updates[1].parameters).toEqual(['caf-el-nica', 't-2']);
  });

  it('resolves backfill collisions with -2 suffixes deterministically', async () => {
    const calls = await collectSql('up', [
      { id: 't-1', name: 'Mi Negocio' },
      { id: 't-2', name: 'MI   NEGOCIO' },
    ]);

    const updates = calls.filter(({ sql }) =>
      sql.includes('UPDATE tenants SET slug'),
    );
    expect(updates[0].parameters).toEqual(['mi-negocio', 't-1']);
    expect(updates[1].parameters).toEqual(['mi-negocio-2', 't-2']);
  });

  it('never rewrites an existing slug on the partial-ledger re-run', async () => {
    // On a re-run every row already carries its slug, so the NULL backfill
    // read returns no rows even though non-derived slugs exist.
    const calls = await collectSql('up', [], ['legacy-slug']);

    expect(calls.some(({ sql }) => isBackfillRowsQuery(sql))).toBe(true);
    expect(
      calls.filter(({ sql }) => sql.includes('UPDATE tenants SET slug')),
    ).toHaveLength(0);
  });

  it('down() drops exactly the index and the derived column', async () => {
    const calls = await collectSql('down');
    const sql = calls.map(({ sql: s }) => s).join('\n');
    expect(sql).toContain('DROP INDEX IF EXISTS uq_tenants_slug');
    expect(sql).toContain('DROP COLUMN IF EXISTS slug');
    expect(sql).not.toContain('DROP TABLE');
  });
});
