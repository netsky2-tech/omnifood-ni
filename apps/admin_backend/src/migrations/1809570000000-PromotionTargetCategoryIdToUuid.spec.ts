import { type QueryRunner } from 'typeorm';
import { PromotionTargetCategoryIdToUuid1809570000000 } from './1809570000000-PromotionTargetCategoryIdToUuid';

/**
 * Contract spec for T0.5'a (extras/modifier-groups): convert
 * promotions.target_category_id from free-text varchar to a uuid with a
 * composite tenant FK to catalog_values(tenant_id, id), migrating existing
 * text values per tenant.
 *
 * The harness follows 1809560000000-BackfillProductCategoryCodes.spec.ts and
 * keeps a small in-memory promotions/catalog state that the fake QueryRunner
 * reads and writes, so resolve-vs-deactivate is asserted as behaviour, not
 * just as emitted SQL. The NULL trap of ODD §20 drives the central invariant:
 * in the POS engine, target_category_id IS NULL means GLOBAL promotion
 * (promotions_engine.dart:110/132), so a value that cannot be resolved must
 * never be left NULL while the promotion stays active — attach and
 * deactivate are mutually exclusive, and the invariant is asserted on the
 * state, not trusted from the code path. Like the precedent, this harness
 * cannot reproduce real driver result envelopes beyond the [rows, rowCount]
 * tuple on UPDATE..RETURNING, nor role/RLS behaviour — the .db.spec.ts
 * covers those against a real Postgres 16 as a NOBYPASSRLS table owner.
 */

interface FakePromotion {
  id: string;
  tenant_id: string;
  name: string;
  target_category_id: string | null;
  /** Only populated while down() has renamed the uuid column aside. */
  target_category_id_uuid?: string | null;
  is_active: boolean;
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
  promotions: FakePromotion[];
  catalog: FakeCatalogRow[];
  /** The information_schema data_type the migration probes. */
  columnType: string;
  forceRls: boolean;
  nextPromoId: number;
  nextCatId: number;
  /** Make the Nth NO FORCE statement fail (mid-lift throw path). */
  failOnLift?: number;
  /** Make the first data UPDATE fail (mid-data-work throw path). */
  failOnData?: boolean;
  /** Make the blank-target deactivation no-op (guard-trip path). */
  skipBlankDeactivate?: boolean;
}

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const TENANT_C = '33333333-3333-4333-8333-333333333333';

const freshState = (): FakeState => ({
  promotions: [],
  catalog: [],
  columnType: 'character varying',
  forceRls: true,
  nextPromoId: 1,
  nextCatId: 1,
});

const addPromotion = (
  state: FakeState,
  overrides: Partial<FakePromotion> = {},
): FakePromotion => {
  const promotion: FakePromotion = {
    id: `promo-${state.nextPromoId++}`,
    tenant_id: TENANT_A,
    name: 'Promo',
    target_category_id: null,
    is_active: true,
    ...overrides,
  };
  state.promotions.push(promotion);
  return promotion;
};

const addCatalogRow = (
  state: FakeState,
  overrides: Partial<FakeCatalogRow> = {},
): FakeCatalogRow => {
  const row: FakeCatalogRow = {
    // Uuid-shaped: the migration's fail-closed guard refuses to cast a
    // column that still holds non-uuid text, so a fake id like 'cat-1'
    // would (correctly) abort every attach scenario.
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(state.nextCatId++).padStart(12, '0')}`,
    tenant_id: TENANT_A,
    catalog_type: 'SALES_PRODUCT_CATEGORY',
    code: 'CAFE_CALIENTE',
    label: 'Café Caliente',
    is_active: true,
    sort_order: 1,
    ...overrides,
  };
  state.catalog.push(row);
  return row;
};

/**
 * The invariant of ODD §20, asserted on state: every promotion that carried
 * a non-null target_category_id before the run (resolvable, unresolvable or
 * blank) must end up either attached to a resolved uuid or deactivated —
 * never NULL and still active. Promotions that were already NULL (global by
 * design) are untouched.
 */
const expectNoTouchedRowLeftNullAndActive = (
  state: FakeState,
  preRun: FakePromotion[],
): void => {
  for (const before of preRun) {
    const after: FakePromotion | undefined = state.promotions.find(
      (p) => p.id === before.id,
    );
    if (!after) {
      throw new Error(`promotion ${before.id} vanished during the run`);
    }
    if (before.target_category_id !== null) {
      const attached = after.target_category_id !== null;
      const deactivated = after.is_active === false;
      // Attach and deactivate are mutually exclusive, and one of them happened.
      expect(attached).toBe(!deactivated);
      expect(attached || deactivated).toBe(true);
    } else {
      // Pre-existing global rows are not the migration's business.
      expect(after.target_category_id).toBeNull();
      expect(after.is_active).toBe(before.is_active);
    }
  }
};

/**
 * Recording, stateful fake QueryRunner. Dispatch order matters: the most
 * specific SQL fragments are matched first (the down() catalog_values join
 * before the resolve read, is_active = false before the plain UPDATE,
 * ALTER/DDL before the generic fallthrough).
 */
const createQueryRunner = (state: FakeState) => {
  const queries: string[] = [];
  const noForceStatements: string[] = [];
  const forceRestores: string[] = [];

  const queryRunner = {
    query: jest.fn((sql: string, parameters?: unknown[]): Promise<unknown> => {
      queries.push(sql);
      const params = parameters ?? [];

      // Column-type probe (information_schema).
      if (sql.includes('information_schema.columns')) {
        return Promise.resolve([{ data_type: state.columnType }]);
      }
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

      // ---- down() mechanics -------------------------------------------
      if (sql.includes('RENAME COLUMN target_category_id')) {
        for (const p of state.promotions) {
          p.target_category_id_uuid = p.target_category_id;
          p.target_category_id = null;
        }
        return Promise.resolve([]);
      }
      // down()'s rebuild: the new varchar column is visible to
      // information_schema immediately.
      if (sql.includes('ADD COLUMN target_category_id varchar')) {
        state.columnType = 'character varying';
        return Promise.resolve([]);
      }
      if (sql.includes('UPDATE promotions p')) {
        // down(): map the kept uuid back to the resolved row's code.
        for (const p of state.promotions) {
          const resolved = state.catalog.find(
            (r) =>
              r.tenant_id === p.tenant_id &&
              r.catalog_type === 'SALES_PRODUCT_CATEGORY' &&
              r.id === p.target_category_id_uuid,
          );
          p.target_category_id = resolved ? resolved.code : null;
        }
        return Promise.resolve([]);
      }
      if (sql.includes('p.target_category_id_uuid IS NOT NULL')) {
        return Promise.resolve(
          state.promotions
            .filter(
              (p) =>
                p.target_category_id_uuid !== null &&
                p.target_category_id_uuid !== undefined &&
                p.target_category_id === null,
            )
            .map((p) => ({ id: p.id, name: p.name, tenant_id: p.tenant_id })),
        );
      }
      if (sql.includes('DROP COLUMN target_category_id_uuid')) {
        for (const p of state.promotions) {
          delete p.target_category_id_uuid;
        }
        return Promise.resolve([]);
      }

      // ---- up() data work ----------------------------------------------
      // Fail-closed NULL+active guard: NOT NULL blank targets still active
      // would be cast to NULL with the flag on. Pre-existing NULL rows
      // never appear here (the query filters IS NOT NULL).
      if (
        sql.includes("btrim(target_category_id) = ''") &&
        sql.includes('is_active = true')
      ) {
        return Promise.resolve(
          state.promotions
            .filter(
              (p) =>
                p.target_category_id !== null &&
                p.target_category_id.trim() === '' &&
                p.is_active,
            )
            .map((p) => ({ id: p.id, name: p.name, tenant_id: p.tenant_id })),
        );
      }
      // Blank-target deactivation: one statement, value kept for the cast.
      if (sql.includes("btrim(target_category_id) = ''")) {
        if (state.failOnData) {
          return Promise.reject(new Error('BOOM: mock failure'));
        }
        if (state.skipBlankDeactivate) {
          return Promise.resolve([[], 0]);
        }
        const touched: Array<{ id: string; name: string; tenant_id: string }> =
          [];
        for (const p of state.promotions) {
          if (
            p.target_category_id !== null &&
            p.target_category_id.trim() === ''
          ) {
            p.is_active = false;
            touched.push({ id: p.id, name: p.name, tenant_id: p.tenant_id });
          }
        }
        return Promise.resolve([touched, touched.length]);
      }
      if (/DISTINCT tenant_id\s+FROM promotions/.test(sql)) {
        const tenants = [
          ...new Set(
            state.promotions
              .filter(
                (p) =>
                  p.target_category_id !== null &&
                  p.target_category_id.trim() !== '',
              )
              .map((p) => p.tenant_id),
          ),
        ].sort();
        return Promise.resolve(tenants.map((tenant_id) => ({ tenant_id })));
      }
      if (sql.includes('SELECT DISTINCT target_category_id AS original')) {
        const tenantId = params[0] as string;
        const originals = [
          ...new Set(
            state.promotions
              .filter(
                (p) =>
                  p.tenant_id === tenantId &&
                  p.target_category_id !== null &&
                  p.target_category_id.trim() !== '',
              )
              .map((p) => p.target_category_id),
          ),
        ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        return Promise.resolve(originals.map((original) => ({ original })));
      }
      // down()'s unresolvable logging and up()'s resolve read both hit
      // catalog_values; the resolve read is the one filtering by code.
      if (sql.includes('FROM catalog_values') && sql.includes('code = $2')) {
        const [tenantId, code] = params as [string, string];
        return Promise.resolve(
          state.catalog
            .filter(
              (r) =>
                r.tenant_id === tenantId &&
                r.catalog_type === 'SALES_PRODUCT_CATEGORY' &&
                r.code === code,
            )
            .map((r) => ({ id: r.id })),
        );
      }
      if (sql.includes('is_active = false')) {
        if (state.failOnData) {
          return Promise.reject(new Error('BOOM: mock failure'));
        }
        // Deactivate + NULL in the SAME statement, guarded by the original
        // text; the log needs every promotion the statement deactivated.
        const [tenantId, original] = params as [string, string];
        const touched: Array<{ id: string; name: string }> = [];
        for (const p of state.promotions) {
          if (p.tenant_id === tenantId && p.target_category_id === original) {
            p.target_category_id = null;
            p.is_active = false;
            touched.push({ id: p.id, name: p.name });
          }
        }
        // Real TypeORM 0.3 postgres driver shape: [rows, rowCount] tuple.
        return Promise.resolve([touched, touched.length]);
      }
      if (/UPDATE promotions\s+SET target_category_id = \$2/.test(sql)) {
        if (state.failOnData) {
          return Promise.reject(new Error('BOOM: mock failure'));
        }
        // Attach the resolved id, guarded by the original text.
        const [tenantId, resolvedId, original] = params as [
          string,
          string,
          string,
        ];
        const touched: Array<{ id: string }> = [];
        for (const p of state.promotions) {
          if (p.tenant_id === tenantId && p.target_category_id === original) {
            p.target_category_id = resolvedId;
            touched.push({ id: p.id });
          }
        }
        return Promise.resolve([touched, touched.length]);
      }
      // Fail-closed guard before the ALTER: leftovers that are not
      // uuid-shaped.
      if (sql.includes('!~')) {
        const uuidPattern =
          /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        return Promise.resolve(
          state.promotions
            .filter(
              (p) =>
                p.target_category_id !== null &&
                p.target_category_id.trim() !== '' &&
                !uuidPattern.test(p.target_category_id),
            )
            .map((p) => ({
              id: p.id,
              name: p.name,
              tenant_id: p.tenant_id,
              target_category_id: p.target_category_id,
            })),
        );
      }

      // ---- DDL ----------------------------------------------------------
      if (sql.includes('ALTER COLUMN target_category_id TYPE uuid')) {
        state.columnType = 'uuid';
        // The real USING NULLIF(btrim(...), '') nulls the blank values the
        // deactivate pass left in place.
        for (const p of state.promotions) {
          if (
            p.target_category_id !== null &&
            p.target_category_id.trim() === ''
          ) {
            p.target_category_id = null;
          }
        }
        return Promise.resolve([]);
      }
      if (sql.includes('ADD CONSTRAINT fk_promotions_target_category_tenant')) {
        return Promise.resolve([]);
      }
      if (sql.includes('CREATE INDEX')) {
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    }),
  } as unknown as QueryRunner;

  return { queryRunner, queries, noForceStatements, forceRestores };
};

const RLS_TABLES = ['promotions', 'catalog_values'];

describe('canonicalCategoryCode (static mirror of the menu-import service rule)', () => {
  const canonicalCategoryCode =
    PromotionTargetCategoryIdToUuid1809570000000.canonicalCategoryCode;

  it('matches the service rule on the measured SOHO values', () => {
    expect(canonicalCategoryCode('CAFÉ CALIENTE')).toBe('CAFE_CALIENTE');
    expect(canonicalCategoryCode('BEBIDAS')).toBe('BEBIDAS');
    expect(canonicalCategoryCode('Café Helado')).toBe('CAFE_HELADO');
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

describe('PromotionTargetCategoryIdToUuid1809570000000 up()', () => {
  const migration = new PromotionTargetCategoryIdToUuid1809570000000();

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

  it('attaches a resolvable text value to the tenant SALES_PRODUCT_CATEGORY row id', async () => {
    const state = freshState();
    const row = addCatalogRow(state, { code: 'CAFE_CALIENTE' });
    addPromotion(state, {
      name: 'Café del día',
      target_category_id: 'CAFÉ CALIENTE',
    });

    const preRun = JSON.parse(
      JSON.stringify(state.promotions),
    ) as FakePromotion[];
    const { queryRunner } = createQueryRunner(state);
    await migration.up(queryRunner);

    expect(state.columnType).toBe('uuid');
    const promotion = state.promotions[0];
    expect(promotion.target_category_id).toBe(row.id);
    expect(promotion.is_active).toBe(true);

    expect(
      logs.some((l) =>
        l.includes(
          `tenant ${TENANT_A}: attached 1 promotion(s) to SALES_PRODUCT_CATEGORY 'CAFE_CALIENTE'`,
        ),
      ),
    ).toBe(true);

    expectNoTouchedRowLeftNullAndActive(state, preRun);
  });

  it('deactivates an unresolvable text value: NULL and is_active = false in the same statement, logged', async () => {
    const state = freshState();
    // No catalog rows at all: the measured SOHO reference scenario.
    addPromotion(state, {
      name: 'Promo huérfana',
      target_category_id: 'CAFÉ CALIENTE',
    });

    const preRun = JSON.parse(
      JSON.stringify(state.promotions),
    ) as FakePromotion[];
    const { queryRunner } = createQueryRunner(state);
    await migration.up(queryRunner);

    const promotion = state.promotions[0];
    expect(promotion.target_category_id).toBeNull();
    expect(promotion.is_active).toBe(false);

    // The report names the promotion, its id, the tenant and the original
    // text, so the owner can decide what to do with it.
    const deactivateLog = logs.find((l) =>
      l.includes(
        "deactivated (unresolvable target_category_id 'CAFÉ CALIENTE')",
      ),
    );
    expect(deactivateLog).toBeDefined();
    expect(deactivateLog).toContain('Promo huérfana');
    expect(deactivateLog).toContain(promotion.id);
    expect(deactivateLog).toContain(TENANT_A);

    expectNoTouchedRowLeftNullAndActive(state, preRun);
  });

  it('never leaves a touched promotion NULL and active (the ODD §20 invariant)', async () => {
    const state = freshState();
    addCatalogRow(state, { code: 'CAFE_CALIENTE' });
    addPromotion(state, {
      name: 'Resolvable',
      target_category_id: 'CAFÉ CALIENTE',
    });
    addPromotion(state, {
      name: 'Orphan',
      target_category_id: 'POSTRES',
    });
    addPromotion(state, {
      name: 'Global by design',
      target_category_id: null,
    });
    addPromotion(state, {
      name: 'Empty text',
      target_category_id: '',
    });

    const preRun = JSON.parse(
      JSON.stringify(state.promotions),
    ) as FakePromotion[];
    const { queryRunner } = createQueryRunner(state);
    await migration.up(queryRunner);

    expectNoTouchedRowLeftNullAndActive(state, preRun);
  });

  it('deactivates active promotions with blank or whitespace-only targets instead of letting the cast NULL them into global promotions', async () => {
    const state = freshState();
    addCatalogRow(state, { code: 'CAFE_CALIENTE' });
    const empty = addPromotion(state, {
      name: 'Empty target',
      target_category_id: '',
    });
    const blank = addPromotion(state, {
      name: 'Whitespace target',
      target_category_id: '   ',
    });
    // A row that was ALREADY NULL + active before the run is legitimately
    // global today; it must not trip the guard nor be touched.
    addPromotion(state, { name: 'Global by design', target_category_id: null });

    const { queryRunner } = createQueryRunner(state);
    await migration.up(queryRunner);

    for (const promotion of [empty, blank]) {
      expect(promotion.target_category_id).toBeNull();
      expect(promotion.is_active).toBe(false);
    }
    const global = state.promotions.find((p) => p.name === 'Global by design');
    expect(global?.target_category_id).toBeNull();
    expect(global?.is_active).toBe(true);
    // Each blank-target deactivation is reported, not silent.
    expect(logs.some((l) => l.includes('blank target_category_id'))).toBe(true);
  });

  it('aborts before the ALTER when the run would still create a NULL + active promotion (the blank guard trips)', async () => {
    const state = freshState();
    // Simulate the deactivate pass missing its rows: the guard — not the
    // cast — is what must stop the conversion.
    state.skipBlankDeactivate = true;
    addPromotion(state, {
      name: 'Would become global',
      target_category_id: '',
    });

    const { queryRunner } = createQueryRunner(state);
    await expect(migration.up(queryRunner)).rejects.toThrow(
      /refusing the uuid conversion: 1\+ ACTIVE promotion\(s\) hold a blank/,
    );
    // No DDL happened: the conversion was refused before the ALTER.
    expect(state.columnType).toBe('character varying');
  });

  it('does NOT trip the blank guard for a promotion that was already NULL + active before the run', async () => {
    const state = freshState();
    addCatalogRow(state, { code: 'CAFE_CALIENTE' });
    // Legitimately global today: untouched, and the guard stays silent.
    addPromotion(state, { name: 'Already global', target_category_id: null });
    addPromotion(state, {
      name: 'Resolvable',
      target_category_id: 'CAFÉ CALIENTE',
    });

    const { queryRunner } = createQueryRunner(state);
    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    const global = state.promotions.find((p) => p.name === 'Already global');
    expect(global?.target_category_id).toBeNull();
    expect(global?.is_active).toBe(true);
  });

  it('passes already-uuid-shaped values through untouched, without canonicalizing them', async () => {
    const state = freshState();
    addCatalogRow(state, { code: 'CAFE_CALIENTE' });
    addPromotion(state, {
      name: 'Already an id',
      // A uuid-shaped value: canonicalizing it would strip the dashes and
      // uppercase the hex into a nonsense code that could accidentally
      // match a catalog row. It must skip the code-resolution path.
      target_category_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    });

    const preRun = JSON.parse(
      JSON.stringify(state.promotions),
    ) as FakePromotion[];
    const { queryRunner, queries } = createQueryRunner(state);
    await migration.up(queryRunner);

    const promotion = state.promotions[0];
    expect(promotion.target_category_id).toBe(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    );
    expect(promotion.is_active).toBe(true);
    // No data UPDATE ever named it.
    expect(queries.join('\n')).not.toContain(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    );
    // It is reported, not silent.
    expect(
      logs.some((l) =>
        l.includes('uuid-shaped target_category_id passed through'),
      ),
    ).toBe(true);

    expectNoTouchedRowLeftNullAndActive(state, preRun);
  });

  it('resolves by code within the tenant AND the SALES_PRODUCT_CATEGORY type only', async () => {
    const state = freshState();
    // The same code exists for TENANT_A as a UOM row — a different catalog
    // type. It must NOT resolve.
    addCatalogRow(state, {
      catalog_type: 'UOM',
      code: 'CAFE_CALIENTE',
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    });
    addPromotion(state, {
      tenant_id: TENANT_A,
      name: 'Wrong type',
      target_category_id: 'CAFE_CALIENTE',
    });
    addPromotion(state, {
      tenant_id: TENANT_B,
      name: 'Wrong tenant, resolvable there? no',
      target_category_id: 'CAFE_CALIENTE',
    });

    const preRun = JSON.parse(
      JSON.stringify(state.promotions),
    ) as FakePromotion[];
    const { queryRunner } = createQueryRunner(state);
    await migration.up(queryRunner);

    for (const promotion of state.promotions) {
      expect(promotion.target_category_id).toBeNull();
      expect(promotion.is_active).toBe(false);
    }

    expectNoTouchedRowLeftNullAndActive(state, preRun);
  });

  it('is tenant-scoped: the same text resolves independently per tenant', async () => {
    const state = freshState();
    const rowA = addCatalogRow(state, {
      tenant_id: TENANT_A,
      code: 'BEBIDAS',
      id: 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa',
    });
    const rowB = addCatalogRow(state, {
      tenant_id: TENANT_B,
      code: 'BEBIDAS',
      id: 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa',
    });
    addPromotion(state, {
      tenant_id: TENANT_A,
      name: 'A',
      target_category_id: 'BEBIDAS',
    });
    addPromotion(state, {
      tenant_id: TENANT_B,
      name: 'B',
      target_category_id: 'BEBIDAS',
    });

    const preRun = JSON.parse(
      JSON.stringify(state.promotions),
    ) as FakePromotion[];
    const { queryRunner } = createQueryRunner(state);
    await migration.up(queryRunner);

    expect(state.promotions[0].target_category_id).toBe(rowA.id);
    expect(state.promotions[1].target_category_id).toBe(rowB.id);

    expectNoTouchedRowLeftNullAndActive(state, preRun);
  });

  it('never embeds a literal tenant id in any statement', async () => {
    const state = freshState();
    addCatalogRow(state, { code: 'BEBIDAS' });
    addPromotion(state, { target_category_id: 'BEBIDAS' });
    addPromotion(state, {
      tenant_id: TENANT_C,
      target_category_id: 'POSTRES',
    });

    const { queryRunner, queries } = createQueryRunner(state);
    await migration.up(queryRunner);

    expect(queries.join('\n')).not.toMatch(/tenant_id\s*=\s*'[0-9a-f-]{36}'/i);
  });

  it('is idempotent: a converged (already uuid) column re-runs up() as a logged no-op', async () => {
    const state = freshState();
    addCatalogRow(state, { code: 'CAFE_CALIENTE' });
    addPromotion(state, { target_category_id: 'CAFÉ CALIENTE' });

    const first = createQueryRunner(state);
    await migration.up(first.queryRunner);
    expect(state.columnType).toBe('uuid');
    const snapshot = JSON.stringify(state.promotions);

    logs.length = 0;
    const second = createQueryRunner(state);
    await migration.up(second.queryRunner);

    expect(
      logs.some((l) =>
        l.includes(
          'no-op: promotions.target_category_id is already uuid (database already converged)',
        ),
      ),
    ).toBe(true);
    expect(JSON.stringify(state.promotions)).toBe(snapshot);
    // No data statements at all on the converged run.
    expect(
      second.queries.some((sql) => sql.includes('UPDATE promotions')),
    ).toBe(false);
  });

  it('brackets up() with NO FORCE / work / FORCE ordering on both tables', async () => {
    const state = freshState();
    addCatalogRow(state, { code: 'BEBIDAS' });
    addPromotion(state, { target_category_id: 'BEBIDAS' });

    const { queryRunner, queries, noForceStatements, forceRestores } =
      createQueryRunner(state);
    await migration.up(queryRunner);

    const firstDataQuery = queries.findIndex((sql) =>
      /DISTINCT tenant_id\s+FROM promotions/.test(sql),
    );
    expect(firstDataQuery).toBeGreaterThan(-1);
    const alterQuery = queries.findIndex((sql) =>
      sql.includes('ALTER COLUMN target_category_id TYPE uuid'),
    );
    expect(alterQuery).toBeGreaterThan(firstDataQuery);

    for (const table of RLS_TABLES) {
      const lifted = noForceStatements.filter((sql) => sql.includes(table));
      expect(lifted).toHaveLength(1);
      expect(queries.indexOf(lifted[0])).toBeLessThan(firstDataQuery);

      const restored = forceRestores.filter((sql) => sql.includes(table));
      expect(restored).toHaveLength(1);
      expect(queries.indexOf(restored[0])).toBeGreaterThan(alterQuery);
    }
    expect(queries[queries.length - 1]).toContain('FORCE ROW LEVEL SECURITY');
  });

  it('restores FORCE RLS on both tables even when the data work throws', async () => {
    const state = freshState();
    state.failOnData = true;
    addPromotion(state, { target_category_id: 'CAFÉ CALIENTE' });

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
    addPromotion(state, { target_category_id: 'BEBIDAS' });

    const { queryRunner, noForceStatements, forceRestores } =
      createQueryRunner(state);
    await expect(migration.up(queryRunner)).rejects.toThrow('BOOM');

    expect(noForceStatements).toHaveLength(2);
    expect(
      forceRestores.filter((sql) => sql.includes('promotions')),
    ).toHaveLength(1);
    expect(
      forceRestores.filter((sql) => sql.includes('catalog_values')),
    ).toHaveLength(0);
  });

  it('neither lifts nor restores a table whose FORCE flag is already off', async () => {
    const state = freshState();
    state.forceRls = false;
    addCatalogRow(state, { code: 'BEBIDAS' });
    addPromotion(state, { target_category_id: 'BEBIDAS' });

    const { queryRunner, noForceStatements, forceRestores } =
      createQueryRunner(state);
    await migration.up(queryRunner);

    expect(noForceStatements).toHaveLength(0);
    expect(forceRestores).toHaveLength(0);
    expect(state.columnType).toBe('uuid');
    expect(state.promotions[0].is_active).toBe(true);
  });
});

describe('PromotionTargetCategoryIdToUuid1809570000000 down()', () => {
  const migration = new PromotionTargetCategoryIdToUuid1809570000000();

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

  it('recreates the text column from the resolved rows’ codes and preserves deactivation', async () => {
    const state = freshState();
    const row = addCatalogRow(state, { code: 'CAFE_CALIENTE' });
    // Simulate the post-up() converged state: uuid column with the
    // attached id, plus a promotion deactivated by up() that no longer
    // carries an id, plus a never-touched global promotion.
    state.columnType = 'uuid';
    addPromotion(state, {
      name: 'Attached',
      target_category_id: row.id,
      is_active: true,
    });
    addPromotion(state, {
      name: 'Deactivated by up()',
      target_category_id: null,
      is_active: false,
    });
    addPromotion(state, {
      name: 'Global by design',
      target_category_id: null,
      is_active: true,
    });

    const { queryRunner } = createQueryRunner(state);
    await migration.down(queryRunner);

    expect(state.columnType).toBe('character varying');
    const [attached, deactivated, global] = state.promotions;
    // The code is restored from the catalog row — the canonical code, not
    // the original free text (up() was one-way on the string form).
    expect(attached.target_category_id).toBe('CAFE_CALIENTE');
    // The deactivation flag is preserved, never silently re-activated.
    expect(deactivated.target_category_id).toBeNull();
    expect(deactivated.is_active).toBe(false);
    expect(global.target_category_id).toBeNull();
    expect(global.is_active).toBe(true);
  });

  it('is a no-op when the column is not uuid (down() ran on a text column)', async () => {
    const state = freshState();
    state.columnType = 'character varying';
    addPromotion(state, { target_category_id: 'CAFÉ CALIENTE' });

    const { queryRunner, queries, noForceStatements, forceRestores } =
      createQueryRunner(state);
    await migration.down(queryRunner);

    expect(
      logs.some((l) =>
        l.includes('no-op: promotions.target_category_id is not uuid'),
      ),
    ).toBe(true);
    expect(queries.some((sql) => sql.includes('RENAME COLUMN'))).toBe(false);
    expect(noForceStatements).toHaveLength(0);
    expect(forceRestores).toHaveLength(0);
    expect(state.promotions[0].target_category_id).toBe('CAFÉ CALIENTE');
  });

  it('brackets down() with the same NO FORCE / work / FORCE discipline', async () => {
    const state = freshState();
    state.columnType = 'uuid';
    const row = addCatalogRow(state, { code: 'CAFE_CALIENTE' });
    addPromotion(state, { target_category_id: row.id });

    const { queryRunner, queries, noForceStatements, forceRestores } =
      createQueryRunner(state);
    await migration.down(queryRunner);

    const firstDataQuery = queries.findIndex((sql) =>
      sql.includes('UPDATE promotions p'),
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
});
