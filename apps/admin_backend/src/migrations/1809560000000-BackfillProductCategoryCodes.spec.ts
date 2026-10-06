import { type QueryRunner } from 'typeorm';
import { BackfillProductCategoryCodes1809560000000 } from './1809560000000-BackfillProductCategoryCodes';

/**
 * Contract spec for T0.2' (extras/modifier-groups): repair existing
 * products.category_code free-text values against catalog_values
 * (SALES_PRODUCT_CATEGORY), per tenant, using the same canonicalization rule
 * as canonicalCategoryCode() in menu-import.service.ts (duplicated inside the
 * migration on purpose — see the migration header).
 *
 * The harness follows 1809510000000-BackfillTemplateProductTypes.spec.ts but
 * goes one step further: instead of only canned responses, it keeps a small
 * in-memory products/catalog state that the mock QueryRunner reads and
 * writes, so reuse-vs-insert, fold-on-collision, only-differ updates and
 * NULL/empty exclusion are asserted as behaviour, not just as emitted SQL.
 * The mock mirrors the real TypeORM 0.3 postgres driver shape for
 * UPDATE..RETURNING (a [rows, rowCount] tuple) so the reported-count guard is
 * meaningful. Like the precedent, this harness cannot reproduce real driver
 * result envelopes beyond the tuple, nor role/RLS behaviour —
 * 1809560000000-BackfillProductCategoryCodes.db.spec.ts covers those against
 * a real Postgres, including the FORCE RLS owner trap.
 */

interface FakeProduct {
  tenant_id: string;
  category_code: string | null;
}

interface FakeCatalogRow {
  id: string;
  tenant_id: string;
  catalog_type: string;
  code: string;
  label: string;
  is_active: boolean;
  sort_order: number;
}

interface FakeState {
  products: FakeProduct[];
  catalog: FakeCatalogRow[];
  forceRls: boolean;
  nextId: number;
  /** Make the Nth NO FORCE statement fail (mid-lift throw path). */
  failOnLift?: number;
  /** Make the products UPDATE fail (mid-data-work throw path). */
  failOnData?: boolean;
}

const TENANT_SOHO = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const freshState = (): FakeState => ({
  products: [],
  catalog: [],
  forceRls: true,
  nextId: 1,
});

const addProduct = (
  state: FakeState,
  tenantId: string,
  categoryCode: string | null,
): void => {
  state.products.push({ tenant_id: tenantId, category_code: categoryCode });
};

const addCatalogRow = (
  state: FakeState,
  tenantId: string,
  code: string,
  label: string,
  sortOrder: number,
): void => {
  state.catalog.push({
    id: `cat-${state.nextId++}`,
    tenant_id: tenantId,
    catalog_type: 'SALES_PRODUCT_CATEGORY',
    code,
    label,
    is_active: true,
    sort_order: sortOrder,
  });
};

/**
 * Recording, stateful fake QueryRunner. Dispatch order matters: the most
 * specific SQL fragments are matched first (GROUP BY before FROM
 * catalog_values, INSERT before UPDATE, NO FORCE before FORCE).
 */
const createQueryRunner = (state: FakeState) => {
  const queries: string[] = [];
  const noForceStatements: string[] = [];
  const forceRestores: string[] = [];

  const queryRunner = {
    query: jest.fn((sql: string, parameters?: unknown[]): Promise<unknown> => {
      queries.push(sql);
      const params = parameters ?? [];

      // RLS probe (the isForceRowLevelSecurity read).
      if (sql.includes('pg_class')) {
        return Promise.resolve([{ forced: state.forceRls }]);
      }
      // Lift: record, and optionally fail (configured via state.failOnLift).
      if (sql.includes('NO FORCE ROW LEVEL SECURITY')) {
        noForceStatements.push(sql);
        if (
          state.failOnLift !== undefined &&
          noForceStatements.length === state.failOnLift
        ) {
          return Promise.reject(new Error('BOOM: mock failure'));
        }
        return Promise.resolve([]);
      }
      // Restore FORCE.
      if (sql.includes('FORCE ROW LEVEL SECURITY')) {
        forceRestores.push(sql);
        return Promise.resolve([]);
      }
      // Tenant list: tenants with at least one non-empty category_code.
      if (/DISTINCT tenant_id\s+FROM products/.test(sql)) {
        const tenants = [
          ...new Set(
            state.products
              .filter(
                (p) =>
                  p.category_code !== null && p.category_code.trim() !== '',
              )
              .map((p) => p.tenant_id),
          ),
        ].sort();
        return Promise.resolve(tenants.map((tenant_id) => ({ tenant_id })));
      }
      // Per-tenant distinct originals (the migration emits DISTINCT, not
      // GROUP BY; it derives counts itself by folding originals).
      if (sql.includes('SELECT DISTINCT category_code AS original')) {
        const tenantId = params[0] as string;
        const originals = [
          ...new Set(
            state.products
              .filter(
                (p) =>
                  p.tenant_id === tenantId &&
                  p.category_code !== null &&
                  p.category_code !== '',
              )
              .map((p) => p.category_code),
          ),
        ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        return Promise.resolve(originals.map((original) => ({ original })));
      }
      if (sql.includes('INSERT INTO catalog_values')) {
        // Migration binds [tenant_id, catalog_type, code, label, sort_order].
        const [tenantId, catalogType, code, label, sortOrder] = params as [
          string,
          string,
          string,
          string,
          number,
        ];
        state.catalog.push({
          id: `cat-${state.nextId++}`,
          tenant_id: tenantId,
          catalog_type: catalogType,
          code,
          label,
          is_active: true,
          sort_order: sortOrder,
        });
        return Promise.resolve([]);
      }
      if (/UPDATE products\s+SET category_code/.test(sql)) {
        if (state.failOnData) {
          return Promise.reject(new Error('BOOM: mock failure'));
        }
        // The migration updates one original at a time (scalar $3), guarded
        // by the only-differ predicate category_code = $3 AND <> $2.
        const [tenantId, canonical, original] = params as [
          string,
          string,
          string,
        ];
        const touched: Array<{ id: string }> = [];
        state.products.forEach((p, index) => {
          if (
            p.tenant_id === tenantId &&
            p.category_code === original &&
            p.category_code !== canonical
          ) {
            p.category_code = canonical;
            touched.push({ id: `product-${index}` });
          }
        });
        // Real TypeORM 0.3 postgres driver shape: [rows, rowCount] tuple.
        return Promise.resolve([touched, touched.length]);
      }
      // The tenant's current maximum sort_order (a separate probe the
      // migration runs before the existing-codes read).
      if (sql.includes('MAX(sort_order)')) {
        const tenantId = params[0] as string;
        const max = state.catalog
          .filter(
            (r) =>
              r.tenant_id === tenantId &&
              r.catalog_type === 'SALES_PRODUCT_CATEGORY',
          )
          .reduce((acc, r) => Math.max(acc, r.sort_order), 0);
        return Promise.resolve([{ max_sort: max }]);
      }
      // Existing SALES_PRODUCT_CATEGORY rows for the tenant.
      if (sql.includes('FROM catalog_values')) {
        const tenantId = params[0] as string;
        return Promise.resolve(
          state.catalog
            .filter(
              (r) =>
                r.tenant_id === tenantId &&
                r.catalog_type === 'SALES_PRODUCT_CATEGORY',
            )
            .map((r) => ({
              code: r.code,
              label: r.label,
              sort_order: r.sort_order,
            })),
        );
      }
      if (sql.includes('AS untouched')) {
        const tenantId = params[0] as string;
        const count = state.products.filter(
          (p) =>
            p.tenant_id === tenantId &&
            (p.category_code === null || p.category_code.trim() === ''),
        ).length;
        return Promise.resolve([{ untouched: count }]);
      }

      return Promise.resolve([]);
    }),
  } as unknown as QueryRunner;

  return { queryRunner, queries, noForceStatements, forceRestores };
};

const RLS_TABLES = ['products', 'catalog_values'];

const catalogUpdates = (queries: string[]): string[] =>
  queries.filter((sql) => sql.includes('UPDATE catalog_values'));

describe('canonicalCategoryCode (static mirror of the menu-import service rule)', () => {
  const canonicalCategoryCode =
    BackfillProductCategoryCodes1809560000000.canonicalCategoryCode;

  it('matches the service rule on the measured SOHO values', () => {
    expect(canonicalCategoryCode('Café caliente')).toBe('CAFE_CALIENTE');
    expect(canonicalCategoryCode('CAFÉ HELADO')).toBe('CAFE_HELADO');
    expect(canonicalCategoryCode('BEBIDAS')).toBe('BEBIDAS');
    expect(canonicalCategoryCode('DESAYUNOS')).toBe('DESAYUNOS');
  });

  it('collapses internal whitespace, strips punctuation and folds diacritics', () => {
    expect(canonicalCategoryCode('  cafe   caliente ')).toBe('CAFE_CALIENTE');
    expect(canonicalCategoryCode('Bebidas!! Frías?')).toBe('BEBIDAS_FRIAS');
  });

  it('produces an empty code for values with no letters or digits', () => {
    expect(canonicalCategoryCode('***')).toBe('');
    expect(canonicalCategoryCode('   ')).toBe('');
  });
});

describe('BackfillProductCategoryCodes1809560000000', () => {
  const migration = new BackfillProductCategoryCodes1809560000000();

  let logSpy: jest.SpyInstance;
  let logs: string[];

  beforeEach(() => {
    logs = [];
    logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation((message: string) => {
        logs.push(message);
      });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('creates missing catalog rows with the original value as label and updates the products', async () => {
    const state = freshState();
    addProduct(state, TENANT_SOHO, 'CAFÉ CALIENTE');
    addProduct(state, TENANT_SOHO, 'CAFÉ CALIENTE');
    addProduct(state, TENANT_SOHO, 'CAFÉ HELADO');
    addProduct(state, TENANT_SOHO, 'BEBIDAS');

    const { queryRunner } = createQueryRunner(state);
    await migration.up(queryRunner);

    const sohoRows = state.catalog.filter((r) => r.tenant_id === TENANT_SOHO);
    expect(sohoRows.map((r) => r.code).sort()).toEqual([
      'BEBIDAS',
      'CAFE_CALIENTE',
      'CAFE_HELADO',
    ]);
    const caliente = sohoRows.find((r) => r.code === 'CAFE_CALIENTE');
    expect(caliente?.label).toBe('CAFÉ CALIENTE');
    expect(caliente?.is_active).toBe(true);
    // Deterministic sort_order continues after the tenant's existing maximum.
    expect(sohoRows.map((r) => r.sort_order).sort((a, b) => a - b)).toEqual([
      1, 2, 3,
    ]);

    // Every non-empty product now points at the canonical code.
    expect(state.products.map((p) => p.category_code).sort()).toEqual([
      'BEBIDAS',
      'CAFE_CALIENTE',
      'CAFE_CALIENTE',
      'CAFE_HELADO',
    ]);

    expect(
      logs.some((l) =>
        l.includes(
          `created SALES_PRODUCT_CATEGORY 'CAFE_CALIENTE' label='CAFÉ CALIENTE'`,
        ),
      ),
    ).toBe(true);
    expect(
      logs.some((l) => l.includes('summary: created 3 catalog row(s)')),
    ).toBe(true);
  });

  it('reuses an existing catalog row for its code and never modifies its label', async () => {
    const state = freshState();
    addCatalogRow(
      state,
      TENANT_SOHO,
      'BEBIDAS',
      'Bebidas del menú original',
      5,
    );
    addProduct(state, TENANT_SOHO, 'BEBIDAS');

    const { queryRunner, queries } = createQueryRunner(state);
    await migration.up(queryRunner);

    // The pre-existing row survived untouched: same label, same sort_order,
    // and no UPDATE statement against catalog_values exists at all.
    const row = state.catalog.find((r) => r.code === 'BEBIDAS');
    expect(row?.label).toBe('Bebidas del menú original');
    expect(row?.sort_order).toBe(5);
    expect(catalogUpdates(queries)).toHaveLength(0);
    expect(
      queries.some((sql) => sql.includes('INSERT INTO catalog_values')),
    ).toBe(false);

    expect(
      logs.some((l) =>
        l.includes(
          `reused existing SALES_PRODUCT_CATEGORY 'BEBIDAS' (label left untouched)`,
        ),
      ),
    ).toBe(true);
    expect(
      logs.some((l) =>
        l.includes(
          'summary: created 0 catalog row(s), reused 1 existing catalog row(s)',
        ),
      ),
    ).toBe(true);
  });

  it('emits only-differ updates: a product already on its canonical code is not rewritten', async () => {
    const state = freshState();
    addCatalogRow(state, TENANT_SOHO, 'BEBIDAS', 'Bebidas', 1);
    addProduct(state, TENANT_SOHO, 'BEBIDAS');

    const { queryRunner, queries } = createQueryRunner(state);
    await migration.up(queryRunner);

    // The only-differ guard is up front: the original equal to its
    // canonical code never reaches an UPDATE statement.
    const updateSql = queries.find((sql) =>
      /UPDATE products\s+SET category_code/.test(sql),
    );
    expect(updateSql).toBeUndefined();
    expect(state.products[0].category_code).toBe('BEBIDAS');
    expect(logs.some((l) => l.includes('updated 0 product(s)'))).toBe(true);
  });

  it('folds a colliding pair onto one canonical row and reports the merge', async () => {
    const state = freshState();
    addProduct(state, TENANT_SOHO, 'CAFÉ CALIENTE');
    addProduct(state, TENANT_SOHO, 'CAFE CALIENTE');

    const { queryRunner } = createQueryRunner(state);
    await migration.up(queryRunner);

    // Convergence: exactly one catalog row, and both products on it.
    const rows = state.catalog.filter(
      (r) => r.tenant_id === TENANT_SOHO && r.code === 'CAFE_CALIENTE',
    );
    expect(rows).toHaveLength(1);
    expect(
      state.products.every((p) => p.category_code === 'CAFE_CALIENTE'),
    ).toBe(true);

    // The merge is reported, never hidden: tenant, canonical code and the
    // folded originals are all named.
    const mergeLog = logs.find((l) =>
      l.includes("merged 2 original value(s) onto 'CAFE_CALIENTE'"),
    );
    expect(mergeLog).toBeDefined();
    expect(mergeLog).toContain('CAFÉ CALIENTE');
    expect(mergeLog).toContain('CAFE CALIENTE');
  });

  it('skips a value that normalizes to an empty code entirely and reports it', async () => {
    const state = freshState();
    addProduct(state, TENANT_SOHO, '***');
    addProduct(state, TENANT_SOHO, 'BEBIDAS');

    const { queryRunner } = createQueryRunner(state);
    await migration.up(queryRunner);

    // No catalog row beyond the valid one, no update: the skipped product
    // keeps its original value.
    expect(state.catalog).toHaveLength(1);
    expect(state.catalog[0].code).toBe('BEBIDAS');
    expect(state.products.find((p) => p.category_code === '***')).toBeDefined();

    const skipLog = logs.find((l) => l.includes("skipped category_code '***'"));
    expect(skipLog).toBeDefined();
    expect(skipLog).toContain(TENANT_SOHO);
    expect(skipLog).toContain('empty code');
  });

  it('leaves NULL and empty-string category_code products untouched and reports their count', async () => {
    const state = freshState();
    addProduct(state, TENANT_SOHO, null);
    addProduct(state, TENANT_SOHO, '');
    addProduct(state, TENANT_SOHO, 'BEBIDAS');

    const { queryRunner, queries } = createQueryRunner(state);
    await migration.up(queryRunner);

    expect(state.products[0].category_code).toBeNull();
    expect(state.products[1].category_code).toBe('');

    // Reported, not silently dropped: the tenant report counts them, the
    // summary carries the updated count, and the SQL criterion excludes
    // them from the source query as well.
    expect(
      logs.some((l) =>
        l.includes(
          `tenant ${TENANT_SOHO}: left 2 product(s) with NULL/empty category_code (no category invented)`,
        ),
      ),
    ).toBe(true);
    // 'BEBIDAS' is already canonical: it creates its missing catalog row but
    // never reaches an UPDATE. The summary reports 0 updated products.
    expect(logs.some((l) => l.includes('updated 0 product(s)'))).toBe(true);
    expect(queries.join('\n')).toContain("btrim(category_code) <> ''");
  });

  it('is tenant-scoped: identical values in two tenants create independent catalog rows', async () => {
    const state = freshState();
    addProduct(state, TENANT_SOHO, 'BEBIDAS');
    addProduct(state, TENANT_B, 'BEBIDAS');

    const { queryRunner } = createQueryRunner(state);
    await migration.up(queryRunner);

    // Two separate rows, one per tenant — never one shared row.
    const bebidasRows = state.catalog.filter((r) => r.code === 'BEBIDAS');
    expect(bebidasRows).toHaveLength(2);
    expect(new Set(bebidasRows.map((r) => r.tenant_id))).toEqual(
      new Set([TENANT_SOHO, TENANT_B]),
    );
    // Each tenant's sort_order restarts at its own existing maximum.
    expect(bebidasRows.map((r) => r.sort_order).sort((a, b) => a - b)).toEqual([
      1, 1,
    ]);
  });

  it('never embeds a literal tenant id in any statement', async () => {
    const state = freshState();
    addProduct(state, TENANT_SOHO, 'BEBIDAS');
    addProduct(state, TENANT_B, 'CAFÉ CALIENTE');

    const { queryRunner, queries } = createQueryRunner(state);
    await migration.up(queryRunner);

    expect(queries.join('\n')).not.toMatch(/tenant_id\s*=\s*'[0-9a-f-]{36}'/i);
  });

  it('is a clean no-op on a database where no product carries a category_code', async () => {
    const state = freshState();
    addProduct(state, TENANT_SOHO, null);
    addProduct(state, TENANT_SOHO, '');

    const { queryRunner, queries } = createQueryRunner(state);
    await migration.up(queryRunner);

    expect(
      queries.some((sql) => /UPDATE products\s+SET category_code/.test(sql)),
    ).toBe(false);
    expect(
      queries.some((sql) => sql.includes('INSERT INTO catalog_values')),
    ).toBe(false);
    expect(
      logs.some((l) =>
        l.includes('no-op: no product carries a category_code; nothing to do'),
      ),
    ).toBe(true);
  });

  it('is idempotent: a converged database re-runs up() with zero creates and zero updates', async () => {
    const state = freshState();
    addProduct(state, TENANT_SOHO, 'CAFÉ CALIENTE');
    addProduct(state, TENANT_SOHO, 'BEBIDAS');

    const first = createQueryRunner(state);
    await migration.up(first.queryRunner);
    expect(
      logs.some((l) => l.includes('summary: created 2 catalog row(s)')),
    ).toBe(true);

    const catalogSnapshot = JSON.stringify(state.catalog);
    const productSnapshot = JSON.stringify(state.products);

    const second = createQueryRunner(state);
    await migration.up(second.queryRunner);

    // Nothing was created, nothing rewritten: the canonical values are now
    // the originals, every code exists, and the dirty-original filter sends
    // no UPDATE at all.
    expect(state.catalog.length).toBe(2);
    expect(JSON.stringify(state.catalog)).toBe(catalogSnapshot);
    expect(JSON.stringify(state.products)).toBe(productSnapshot);
    expect(
      logs.some((l) =>
        l.includes(
          'no-op: nothing to create or update (database already converged)',
        ),
      ),
    ).toBe(true);
  });

  it('reports the true row count when the driver returns the [rows, rowCount] tuple', async () => {
    const state = freshState();
    // Two identical originals: the single UPDATE touches two rows, and the
    // tuple's element 1 is 2, not the misleading constant tuple length.
    addProduct(state, TENANT_SOHO, 'CAFÉ CALIENTE');
    addProduct(state, TENANT_SOHO, 'CAFÉ CALIENTE');

    const { queryRunner } = createQueryRunner(state);
    await migration.up(queryRunner);

    expect(logs.some((l) => l.includes('updated 2 product(s)'))).toBe(true);
  });

  it('brackets up() with NO FORCE / FORCE RLS on both tables around the data work', async () => {
    const state = freshState();
    addProduct(state, TENANT_SOHO, 'BEBIDAS');

    const { queryRunner, queries, noForceStatements, forceRestores } =
      createQueryRunner(state);
    await migration.up(queryRunner);

    const firstDataQuery = queries.findIndex((sql) =>
      /DISTINCT tenant_id\s+FROM products/.test(sql),
    );
    expect(firstDataQuery).toBeGreaterThan(-1);
    for (const table of RLS_TABLES) {
      const lifted = noForceStatements.filter((sql) => sql.includes(table));
      expect(lifted).toHaveLength(1);
      expect(queries.indexOf(lifted[0])).toBeLessThan(firstDataQuery);

      const restored = forceRestores.filter((sql) => sql.includes(table));
      expect(restored).toHaveLength(1);
      expect(queries.indexOf(restored[0])).toBeGreaterThan(firstDataQuery);
    }
    expect(queries[queries.length - 1]).toContain('FORCE ROW LEVEL SECURITY');
  });

  it('restores FORCE RLS on both tables even when the data work throws', async () => {
    const state = freshState();
    state.failOnData = true;
    // A non-canonical original is required so the UPDATE path (the throw
    // site) is actually reached.
    addProduct(state, TENANT_SOHO, 'Café caliente');

    const { queryRunner, noForceStatements, forceRestores } =
      createQueryRunner(state);
    await expect(migration.up(queryRunner)).rejects.toThrow('BOOM');

    for (const table of RLS_TABLES) {
      expect(forceRestores.filter((sql) => sql.includes(table))).toHaveLength(
        1,
      );
    }
    expect(noForceStatements).toHaveLength(2);
  });

  it('restores the already-lifted subset when the lift itself throws mid-way', async () => {
    // A throw on the SECOND NO FORCE must still let the finally restore the
    // first table's FORCE: the lift is inside the try and the finally
    // iterates exactly the tables lifted so far — never the constant list,
    // which would re-FORCE a table the migration never lifted.
    const state = freshState();
    state.failOnLift = 2;
    addProduct(state, TENANT_SOHO, 'BEBIDAS');

    const { queryRunner, noForceStatements, forceRestores } =
      createQueryRunner(state);
    await expect(migration.up(queryRunner)).rejects.toThrow('BOOM');

    // Two NO FORCE statements were ATTEMPTED (the second one is what threw);
    // what matters is the restore: only the table whose NO FORCE actually
    // succeeded (products) is re-forced, catalog_values is not.
    expect(noForceStatements).toHaveLength(2);
    expect(
      forceRestores.filter((sql) => sql.includes('products')),
    ).toHaveLength(1);
    expect(
      forceRestores.filter((sql) => sql.includes('catalog_values')),
    ).toHaveLength(0);
  });

  it('neither lifts nor restores a table whose FORCE flag is already off', async () => {
    const state = freshState();
    state.forceRls = false;
    addProduct(state, TENANT_SOHO, 'BEBIDAS');

    const { queryRunner, noForceStatements, forceRestores } =
      createQueryRunner(state);
    await migration.up(queryRunner);

    expect(noForceStatements).toHaveLength(0);
    expect(forceRestores).toHaveLength(0);
    // The data work itself still ran.
    expect(state.products[0].category_code).toBe('BEBIDAS');
  });

  it('down() is a deliberate no-op that runs no statements at all', async () => {
    // The rewrite is many-to-one (two originals can fold into one code), so
    // the original strings of merged products cannot be reconstructed. The
    // migration refuses to fake a reverse map: down() executes nothing and
    // takes no runner at all.
    const state = freshState();
    addProduct(state, TENANT_SOHO, 'BEBIDAS');
    const { queries, noForceStatements, forceRestores } =
      createQueryRunner(state);

    await migration.down();

    expect(queries).toHaveLength(0);
    expect(noForceStatements).toHaveLength(0);
    expect(forceRestores).toHaveLength(0);
  });
});
