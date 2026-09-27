import { type QueryRunner } from 'typeorm';
import { BackfillTemplateProductTypes1809510000000 } from './1809510000000-BackfillTemplateProductTypes';

/**
 * Contract spec for #610 Part A: promote products.product_type from SIMPLE
 * to COMPOUND only where an INDUSTRY_TEMPLATE-origin recipe version carries
 * at least one recipe item (recipe_details row) — the same signal
 * `resolveTemplateProductType` uses at apply time.
 *
 * The harness follows 1809500000000-AddProductTypeToTemplateProducts.spec.ts:
 * a recording mock QueryRunner whose canned responses let the spec drive the
 * migration through candidate and no-candidate states, asserting on the
 * exact SQL the migration issues and the counts it reports.
 */

type ResponseKey = 'AS candidates' | 'RETURNING' | 'relforcerowsecurity';

const createQueryRunner = (
  responses: Partial<Record<ResponseKey, unknown>>,
  throwOn?: string,
) => {
  const queries: string[] = [];
  const queryRunner = {
    query: jest.fn((sql: string): Promise<unknown> => {
      queries.push(sql);
      if (throwOn !== undefined && sql.includes(throwOn)) {
        return Promise.reject(new Error('BOOM: mock failure'));
      }
      const key = (Object.keys(responses) as ResponseKey[]).find((k) =>
        sql.includes(k),
      );
      return Promise.resolve(key ? responses[key] : []);
    }),
  } as unknown as QueryRunner;

  return { queryRunner, queries };
};

const forcedRlsResponse = () => [{ forced: true }];

const countResponse = (n: number) => [{ candidates: n }];
const returningIds = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
  }));

// The shape TypeORM 0.3's postgres driver actually returns for
// UPDATE..RETURNING: a [rows, rowCount] tuple, not a flat row array. A
// population whose size is NOT 2 is what makes the reported-count guard
// meaningful — any 2-row mock is indistinguishable from the tuple bug.
const returningTuple = (n: number): unknown => [returningIds(n), n];

const productTypeUpdates = (queries: string[]): string[] =>
  queries.filter((sql) => sql.includes('SET product_type'));

const noForceStatements = (queries: string[]): string[] =>
  queries.filter((sql) => sql.includes('NO FORCE ROW LEVEL SECURITY'));

const forceRestores = (queries: string[]): string[] =>
  queries.filter(
    (sql) =>
      sql.includes('FORCE ROW LEVEL SECURITY') &&
      !sql.includes('NO FORCE ROW LEVEL SECURITY'),
  );

const RLS_TABLES = ['products', 'recipe_versions', 'recipe_details'];

describe('BackfillTemplateProductTypes1809510000000', () => {
  const migration = new BackfillTemplateProductTypes1809510000000();

  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('promotes only SIMPLE products proven by a template-authored recipe with items', async () => {
    // The mock returns the REAL driver shape: a tuple whose element 1 is the
    // row count, for 10 promoted rows. The reported count must be the row
    // count (10), never the tuple length (2) — the exact defect real-clone
    // execution exposed and the old code committed.
    const { queryRunner, queries } = createQueryRunner({
      'AS candidates': countResponse(10),
      RETURNING: returningTuple(10),
    });

    await migration.up(queryRunner);

    const updates = productTypeUpdates(queries);
    expect(updates).toHaveLength(1);

    const sql = updates.join('\n');
    expect(sql).toContain("SET product_type = 'COMPOUND'");
    expect(sql).toContain("p.product_type = 'SIMPLE'");
    // Multi-tenant safety: bounded by the join, never by a tenant id.
    expect(sql).toContain('rv.tenant_id = p.tenant_id');
    expect(sql).not.toMatch(/tenant_id\s*=\s*'[0-9a-f-]{36}'/i);
    // The criterion is the template-authored recipe carrying items.
    expect(sql).toContain("rv.origin = 'INDUSTRY_TEMPLATE'");
    expect(sql).toContain('rd.recipe_version_id = rv.id');
    // Honest bookkeeping: the row did change (@UpdateDateColumn semantics).
    expect(sql).toContain('updated_at = now()');
    expect(sql).toContain('RETURNING p.id');

    // up() reports what it did; the pilot population is 10 rows.
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('promoted 10'));
  });

  it('never touches MANUAL-origin recipes (issue #611 is an operator decision)', async () => {
    const { queryRunner, queries } = createQueryRunner({
      'AS candidates': countResponse(1),
      RETURNING: returningIds(1),
    });

    await migration.up(queryRunner);

    const sql = productTypeUpdates(queries).join('\n');
    // The single UPDATE path requires an INDUSTRY_TEMPLATE-origin version;
    // there is no branch that could reach a MANUAL-origin recipe.
    expect(sql).toContain("rv.origin = 'INDUSTRY_TEMPLATE'");
    expect(sql).not.toContain('MANUAL');
  });

  it('does not promote a product whose only template recipe was REJECTED by the operator', async () => {
    const { queryRunner, queries } = createQueryRunner({
      'AS candidates': countResponse(1),
      RETURNING: returningIds(1),
    });

    await migration.up(queryRunner);

    const sql = productTypeUpdates(queries).join('\n');
    // A discarded suggestion is the operator's own "not prepared" answer;
    // promoting on it would manufacture a COMPOUND product with no live
    // recipe — the mirror image of the defect this migration repairs.
    expect(sql).toContain("rv.suggestion_state <> 'REJECTED'");
  });

  it('still promotes a product whose template recipe was CONFIRMED (published)', async () => {
    const { queryRunner, queries } = createQueryRunner({
      'AS candidates': countResponse(1),
      RETURNING: returningIds(1),
    });

    await migration.up(queryRunner);

    const sql = productTypeUpdates(queries).join('\n');
    // The operator's answer for a published recipe is CONFIRMED, and a
    // published template recipe on a SIMPLE product is exactly the inert
    // state being repaired. The exclusion must be the single REJECTED
    // member, never a SUGGESTED-only whitelist.
    expect(sql).toContain("rv.suggestion_state <> 'REJECTED'");
    expect(sql).not.toContain("rv.suggestion_state = 'SUGGESTED'");
  });

  it('reports the true count when the driver returns a flat row array too', async () => {
    const { queryRunner } = createQueryRunner({
      'AS candidates': countResponse(3),
      RETURNING: returningIds(3),
    });

    await migration.up(queryRunner);

    // The normalisation must not be coupled to one driver quirk: the flat
    // shape keeps reporting the row count as well.
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('promoted 3'));
  });

  it('requires recipe items: a zero-item template recipe is not proof', async () => {
    const { queryRunner, queries } = createQueryRunner({
      'AS candidates': countResponse(1),
      RETURNING: returningIds(1),
    });

    await migration.up(queryRunner);

    const sql = productTypeUpdates(queries).join('\n');
    // The EXISTS subquery on recipe_details is what separates "the template
    // authored a bill of materials" from "the template suggested an empty
    // recipe", so a zero-item version can never make a product a candidate.
    expect(sql).toMatch(
      /EXISTS\s*\(\s*SELECT 1\s+FROM recipe_details AS rd\s+WHERE rd\.recipe_version_id = rv\.id\s*\)/,
    );
  });

  it('never coerces COMPOUND, PREPARED or VARIANT_PARENT rows', async () => {
    const { queryRunner, queries } = createQueryRunner({
      'AS candidates': countResponse(1),
      RETURNING: returningIds(1),
    });

    await migration.up(queryRunner);

    const sql = productTypeUpdates(queries).join('\n');
    // SIMPLE is the only source value; the other members are not named
    // anywhere, so no branch can rewrite them.
    expect(sql).toContain("p.product_type = 'SIMPLE'");
    expect(sql).not.toContain('PREPARED');
    expect(sql).not.toContain('VARIANT_PARENT');
    expect(sql).not.toContain('product_type IN');
  });

  it('is a clean no-op on a database with zero candidates', async () => {
    const { queryRunner, queries } = createQueryRunner({
      'AS candidates': countResponse(0),
    });

    await migration.up(queryRunner);

    // Most databases never applied a template: only the candidate count was
    // read, no UPDATE was issued, and the no-op is reported, not thrown.
    expect(productTypeUpdates(queries)).toHaveLength(0);
    expect(queries.some((sql) => sql.includes('UPDATE products'))).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('0'));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('no candidate'),
    );
  });

  it('is idempotent: a converged database re-runs up() as a no-op', async () => {
    const first = createQueryRunner({
      'AS candidates': countResponse(1),
      RETURNING: returningIds(1),
    });
    await migration.up(first.queryRunner);
    expect(productTypeUpdates(first.queries)).toHaveLength(1);

    // After the first pass every candidate is COMPOUND, so the second run
    // counts zero candidates and issues no UPDATE.
    const second = createQueryRunner({
      'AS candidates': countResponse(0),
    });
    await migration.up(second.queryRunner);
    expect(productTypeUpdates(second.queries)).toHaveLength(0);
    expect(second.queries.some((sql) => sql.includes('UPDATE products'))).toBe(
      false,
    );

    // The no-op is guaranteed by the same reviewed guard, not by luck: the
    // UPDATE only ever matches SIMPLE rows matching the criterion.
    expect(productTypeUpdates(first.queries).join('\n')).toContain(
      "p.product_type = 'SIMPLE'",
    );
  });

  it('brackets up() with NO FORCE / FORCE RLS on all three tables before the count', async () => {
    // products, recipe_versions and recipe_details are all relforcerowsecurity
    // = true: the migration role is the table OWNER and no app.tenant_id is
    // bound during a migration, so under FORCE the criterion would silently
    // see ZERO rows and up() would log a no-op on exactly the databases it
    // exists to repair.
    const { queryRunner, queries } = createQueryRunner({
      relforcerowsecurity: forcedRlsResponse(),
      'AS candidates': countResponse(1),
      RETURNING: returningTuple(1),
    });

    await migration.up(queryRunner);

    const countIdx = queries.findIndex((sql) => sql.includes('AS candidates'));
    expect(countIdx).toBeGreaterThan(-1);
    for (const table of RLS_TABLES) {
      const lifted = noForceStatements(queries).filter((sql) =>
        sql.includes(table),
      );
      expect(lifted).toHaveLength(1);
      expect(queries.indexOf(lifted[0])).toBeLessThan(countIdx);

      const restored = forceRestores(queries).filter((sql) =>
        sql.includes(table),
      );
      expect(restored).toHaveLength(1);
      expect(queries.indexOf(restored[0])).toBeGreaterThan(countIdx);
    }
  });

  it('restores FORCE RLS on all three tables even when the up() UPDATE throws', async () => {
    const { queryRunner, queries } = createQueryRunner(
      {
        relforcerowsecurity: forcedRlsResponse(),
        'AS candidates': countResponse(1),
        RETURNING: returningTuple(1),
      },
      'UPDATE products',
    );

    await expect(migration.up(queryRunner)).rejects.toThrow('BOOM');

    for (const table of RLS_TABLES) {
      expect(
        forceRestores(queries).filter((sql) => sql.includes(table)),
      ).toHaveLength(1);
    }
  });

  it('brackets down() with NO FORCE / FORCE RLS before its UPDATE', async () => {
    const { queryRunner, queries } = createQueryRunner({
      relforcerowsecurity: forcedRlsResponse(),
      RETURNING: returningTuple(5),
    });

    await migration.down(queryRunner);

    const updateIdx = queries.findIndex((sql) =>
      sql.includes('SET product_type'),
    );
    expect(updateIdx).toBeGreaterThan(-1);
    for (const table of RLS_TABLES) {
      const lifted = noForceStatements(queries).filter((sql) =>
        sql.includes(table),
      );
      expect(lifted).toHaveLength(1);
      expect(queries.indexOf(lifted[0])).toBeLessThan(updateIdx);

      const restored = forceRestores(queries).filter((sql) =>
        sql.includes(table),
      );
      expect(restored).toHaveLength(1);
      expect(queries.indexOf(restored[0])).toBeGreaterThan(updateIdx);
    }
  });

  it('restores FORCE RLS on all three tables even when the down() UPDATE throws', async () => {
    const { queryRunner, queries } = createQueryRunner(
      {
        relforcerowsecurity: forcedRlsResponse(),
        RETURNING: returningTuple(5),
      },
      'UPDATE products',
    );

    await expect(migration.down(queryRunner)).rejects.toThrow('BOOM');

    for (const table of RLS_TABLES) {
      expect(
        forceRestores(queries).filter((sql) => sql.includes(table)),
      ).toHaveLength(1);
    }
  });

  it('down() matches every criterion COMPOUND row, including ones up() never promoted', async () => {
    const { queryRunner, queries } = createQueryRunner({
      RETURNING: returningTuple(5),
    });

    await migration.down(queryRunner);

    // Pinned over-revert, not hidden: the application itself creates COMPOUND
    // products with a SUGGESTED suggestion (the post-#609 code path) that this
    // migration never promoted, and down()'s criterion-inverse statement
    // matches them too because no provenance ledger exists to exclude them
    // (audit_logs is the business/DGI-adjacent trail, not a migration
    // scratchpad). The over-revert is transient — a subsequent up()
    // re-promotes anything down() wrongly downgraded — so the exposure is the
    // window between revert and re-run. If this statement ever gains a
    // provenance filter, this test should be rewritten, not silently kept.
    const sql = productTypeUpdates(queries).join('\n');
    expect(sql).toContain("p.product_type = 'COMPOUND'");
    expect(sql).toContain("rv.suggestion_state = 'SUGGESTED'");
    expect(sql).not.toMatch(/audit|provenance/i);
  });

  it('down() reverts only rows still matching the criterion with the suggestion still SUGGESTED', async () => {
    // Tuple driver shape, 5 rows: the revert log must say 5, never the tuple
    // length 2.
    const { queryRunner, queries } = createQueryRunner({
      RETURNING: returningTuple(5),
    });

    await migration.down(queryRunner);

    const sql = productTypeUpdates(queries).join('\n');
    expect(sql).toContain("SET product_type = 'SIMPLE'");
    expect(sql).toContain("p.product_type = 'COMPOUND'");
    expect(sql).toContain("rv.origin = 'INDUSTRY_TEMPLATE'");
    expect(sql).toContain('rd.recipe_version_id = rv.id');
    // Revert only what is still untouched: the operator has not confirmed
    // or rejected the suggestion.
    expect(sql).toContain("rv.suggestion_state = 'SUGGESTED'");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('reverted 5'));
  });

  it('down() leaves a since-published or discarded suggestion alone', async () => {
    const { queryRunner, queries } = createQueryRunner({
      RETURNING: returningIds(1),
    });

    await migration.down(queryRunner);

    const sql = productTypeUpdates(queries).join('\n');
    // Publishing sets suggestion_state = CONFIRMED (recipe.service.ts); no
    // discard endpoint exists today, so REJECTED is written by no current
    // path. Neither value can match the only revert path, so a recipe the
    // operator made live is never re-orphaned.
    expect(sql).toContain("rv.suggestion_state = 'SUGGESTED'");
    expect(sql).not.toContain('suggestion_state IN');
    // down() reverts, it never destroys: no recipe, invoice or document rows.
    expect(queries.join('\n')).not.toContain('DELETE');
    expect(queries.join('\n')).not.toContain('UPDATE recipe_versions');
  });
});
