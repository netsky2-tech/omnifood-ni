import {
  buildSohoModifierPlan,
  computeModifierSeedActions,
  DEFAULT_CATEGORY_CODE,
  main,
  parseApplyArg,
  resolveCategoryFromRows,
  resolveTenantFromRows,
  seedSohoModifierGroups,
  SOHO_TENANT_NAME,
} from './seed-soho-modifier-groups';
import { ModifierGroup } from '../modules/modifiers/entities/modifier-group.entity';
import { ModifierOption } from '../modules/modifiers/entities/modifier-option.entity';
import { CategoryModifierGroup } from '../modules/modifiers/entities/category-modifier-group.entity';
import { CatalogValue } from '../modules/catalog/entities/catalog-value.entity';
import { Tenant } from '../modules/tenant/entities/tenant.entity';
import { Product } from '../modules/inventory/entities/product.entity';

jest.mock('@nestjs/core', () => ({
  NestFactory: { createApplicationContext: jest.fn() },
}));

const TENANT_ID = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
const CATEGORY_ID = 'c1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

type EntityClass =
  | typeof Tenant
  | typeof CatalogValue
  | typeof ModifierGroup
  | typeof ModifierOption
  | typeof CategoryModifierGroup
  | typeof Product;

interface FakeManager {
  find: jest.Mock;
  count: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  query: jest.Mock;
}

interface FakeDataSource {
  manager: FakeManager;
  transaction: jest.Mock;
}

let uuidCounter: number;
const nextUuid = (): string =>
  `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`;

function makeFakeManager(
  existing: Partial<Record<string, unknown[]>> = {},
): FakeManager {
  uuidCounter = 0;
  const manager: FakeManager = {
    find: jest.fn(
      async (entityClass: EntityClass) => existing[entityClass.name] ?? [],
    ),
    count: jest.fn(
      async (entityClass: EntityClass) =>
        existing[entityClass.name]?.length ?? 0,
    ),
    create: jest.fn((_entityClass: EntityClass, partial: object) => ({
      ...partial,
    })),
    query: jest.fn(async () => []),
    save: jest.fn(async (_entityClass: EntityClass, entity: object) => {
      // TypeORM mutates and returns the saved entity with a generated id.
      const savedEntity = entity as { id?: string };
      savedEntity.id = nextUuid();
      return savedEntity;
    }),
  };
  return manager;
}

function makeFakeDataSource(manager: FakeManager): FakeDataSource {
  return {
    manager,
    // Mirrors runInTenantTransaction: binds the tenant context, then runs
    // the work callback with the transactional manager.
    transaction: jest.fn(async (work: (m: FakeManager) => Promise<unknown>) =>
      work(manager),
    ),
  };
}

// ---- Plan fixture (task T4.3, transcribed literally) --------------------

describe('buildSohoModifierPlan (exact plan transcription)', () => {
  const plan = buildSohoModifierPlan();

  it('defines exactly three groups in attachment order Leche, Endulzante, Extras', () => {
    expect(plan.groups.map((group) => group.name)).toEqual([
      'Leche',
      'Endulzante',
      'Extras',
    ]);
  });

  it('defines Leche as a required single choice (min 1, max 1, no quantities, sort 1)', () => {
    expect(plan.groups[0]).toMatchObject({
      name: 'Leche',
      minSelected: 1,
      maxSelected: 1,
      allowQuantities: false,
      sortOrder: 1,
    });
  });

  it('defines Endulzante as optional with up to 2 picks (min 0, max 2, sort 2)', () => {
    expect(plan.groups[1]).toMatchObject({
      name: 'Endulzante',
      minSelected: 0,
      maxSelected: 2,
      allowQuantities: false,
      sortOrder: 2,
    });
  });

  it('defines Extras as optional with quantities and up to 3 picks (min 0, max 3, sort 3)', () => {
    expect(plan.groups[2]).toMatchObject({
      name: 'Extras',
      minSelected: 0,
      maxSelected: 3,
      allowQuantities: true,
      sortOrder: 3,
    });
  });

  it('defines the exact Leche options with exact córdoba price deltas', () => {
    expect(plan.groups[0].options).toEqual([
      { name: 'Entera', priceDelta: 0, sortOrder: 1 },
      { name: 'Descremada', priceDelta: 0, sortOrder: 2 },
      { name: 'Almendras', priceDelta: 20, sortOrder: 3 },
      { name: 'Soya', priceDelta: 20, sortOrder: 4 },
    ]);
  });

  it('defines the exact Endulzante options', () => {
    expect(plan.groups[1].options).toEqual([
      { name: 'Normal', priceDelta: 0, sortOrder: 1 },
      { name: 'Sin azúcar', priceDelta: 0, sortOrder: 2 },
      { name: 'Stevia', priceDelta: 0, sortOrder: 3 },
    ]);
  });

  it('defines the exact Extras options', () => {
    expect(plan.groups[2].options).toEqual([
      { name: 'Extra shot', priceDelta: 15, sortOrder: 1 },
      { name: 'Leche extra', priceDelta: 10, sortOrder: 2 },
      { name: 'Vainilla', priceDelta: 15, sortOrder: 3 },
      { name: 'Canela', priceDelta: 5, sortOrder: 4 },
    ]);
  });

  it('never carries is_default on any group or option (operators choose explicitly)', () => {
    for (const group of plan.groups) {
      expect(group).not.toHaveProperty('isDefault');
      expect(group).not.toHaveProperty('is_default');
      for (const option of group.options) {
        expect(option).not.toHaveProperty('isDefault');
        expect(option).not.toHaveProperty('is_default');
      }
    }
  });
});

// ---- Fail-closed resolution rules ---------------------------------------

describe('resolveTenantFromRows (fail-closed tenant resolution)', () => {
  const rows = [
    { id: TENANT_ID, name: 'SOHO', slug: 'soho' },
    { id: 't2', name: 'Other Café', slug: 'other-cafe' },
  ];

  it('resolves by tenant name SOHO when no slug override is set', () => {
    expect(resolveTenantFromRows(rows, {}).id).toBe(TENANT_ID);
    expect(SOHO_TENANT_NAME).toBe('SOHO');
  });

  it('honors the SEED_SOHO_TENANT_SLUG override', () => {
    expect(
      resolveTenantFromRows(rows, { SEED_SOHO_TENANT_SLUG: 'other-cafe' }).id,
    ).toBe('t2');
  });

  it('aborts listing available tenants and slugs when the SOHO name is absent', () => {
    expect(() => resolveTenantFromRows([rows[1]], {})).toThrow(/other-cafe/);
  });

  it('aborts listing available tenants when the slug override matches nothing', () => {
    expect(() =>
      resolveTenantFromRows(rows, { SEED_SOHO_TENANT_SLUG: 'nope' }),
    ).toThrow(/soho/);
  });

  it('aborts when more than one tenant matches, listing the ambiguity', () => {
    expect(() =>
      resolveTenantFromRows(
        [...rows, { id: 't3', name: 'SOHO', slug: 'soho-2' }],
        {},
      ),
    ).toThrow(/soho-2/);
  });
});

describe('resolveCategoryFromRows (fail-closed category resolution)', () => {
  const rows = [
    { id: CATEGORY_ID, code: 'CAFE_CALIENTE', name: 'Café Caliente' },
    { id: 'c2', code: 'BEBIDAS', name: 'Bebidas' },
    { id: 'c3', code: 'POSTRES', name: 'Postres' },
  ];

  it('defaults to the CAFE_CALIENTE candidate code', () => {
    expect(DEFAULT_CATEGORY_CODE).toBe('CAFE_CALIENTE');
    expect(resolveCategoryFromRows(rows, 'CAFE_CALIENTE').id).toBe(CATEGORY_ID);
  });

  it('aborts listing the tenant available category codes when the candidate is absent', () => {
    expect(() => resolveCategoryFromRows(rows, 'COMIDAS')).toThrow(/BEBIDAS/);
    expect(() => resolveCategoryFromRows(rows, 'COMIDAS')).toThrow(/POSTRES/);
  });
});

// ---- Idempotency decision function ---------------------------------------

const existingIdenticalRows = () => {
  const groupIds = ['g1', 'g2', 'g3'];
  const plan = buildSohoModifierPlan();
  const groups = plan.groups.map((group, index) => ({
    id: groupIds[index],
    name: group.name,
    min_selected: group.minSelected,
    max_selected: group.maxSelected,
    allow_quantities: group.allowQuantities,
    sort_order: group.sortOrder,
    is_active: true,
  }));
  const options = plan.groups.flatMap((group, index) =>
    group.options.map((option) => ({
      id: nextUuid(),
      group_id: groupIds[index],
      name: option.name,
      price_delta: option.priceDelta,
      is_default: false,
      sort_order: option.sortOrder,
    })),
  );
  const attachments = [
    { id: 'att1', catalog_value_id: CATEGORY_ID, group_id: 'g1' },
    { id: 'att2', catalog_value_id: CATEGORY_ID, group_id: 'g2' },
    { id: 'att3', catalog_value_id: CATEGORY_ID, group_id: 'g3' },
  ];
  return { groupIds, groups, options, attachments };
};

describe('computeModifierSeedActions (idempotency decisions)', () => {
  const plan = buildSohoModifierPlan();

  it('creates everything on an empty tenant (3 groups, 11 options, 3 attachments)', () => {
    const actions = computeModifierSeedActions({
      plan,
      existingGroups: [],
      existingOptions: [],
      existingAttachments: [],
      catalogValueId: CATEGORY_ID,
    });

    expect(actions.conflicts).toEqual([]);
    expect(actions.groupsToCreate.map((group) => group.name)).toEqual([
      'Leche',
      'Endulzante',
      'Extras',
    ]);
    expect(actions.optionsToCreate).toHaveLength(11);
    expect(actions.attachmentsToCreate).toHaveLength(3);
    expect(actions.attachmentsToCreate.map((a) => a.groupName)).toEqual([
      'Leche',
      'Endulzante',
      'Extras',
    ]);
    expect(actions.reusedGroups).toHaveLength(0);
    expect(actions.reusedOptions).toHaveLength(0);
    expect(actions.attachmentsSkipped).toBe(0);
  });

  it('reuses existing identical groups, options and attachments instead of duplicating', () => {
    const existing = existingIdenticalRows();
    const actions = computeModifierSeedActions({
      plan,
      existingGroups: existing.groups,
      existingOptions: existing.options,
      existingAttachments: existing.attachments,
      catalogValueId: CATEGORY_ID,
    });

    expect(actions.conflicts).toEqual([]);
    expect(actions.groupsToCreate).toHaveLength(0);
    expect(actions.reusedGroups.map((g) => g.id)).toEqual(existing.groupIds);
    expect(actions.optionsToCreate).toHaveLength(0);
    expect(actions.reusedOptions).toHaveLength(11);
    expect(actions.attachmentsToCreate).toHaveLength(0);
    expect(actions.attachmentsSkipped).toBe(3);
  });

  it('reuses a partially seeded group while creating its missing options and attachment', () => {
    const existing = existingIdenticalRows();
    const actions = computeModifierSeedActions({
      plan,
      existingGroups: [existing.groups[0]],
      existingOptions: existing.options.filter(
        (option) => option.group_id === 'g1',
      ),
      existingAttachments: [],
      catalogValueId: CATEGORY_ID,
    });

    expect(actions.conflicts).toEqual([]);
    expect(actions.reusedGroups.map((g) => g.name)).toEqual(['Leche']);
    expect(actions.groupsToCreate.map((g) => g.name)).toEqual([
      'Endulzante',
      'Extras',
    ]);
    // 4 Leche options reused; 3 + 4 remaining options created.
    expect(actions.optionsToCreate).toHaveLength(7);
    expect(actions.reusedOptions).toHaveLength(4);
    expect(actions.attachmentsToCreate).toHaveLength(3);
  });

  it('aborts naming the conflict when an existing group breaks the fixture (Leche max 3)', () => {
    const existing = existingIdenticalRows();
    existing.groups[0].max_selected = 3;

    const actions = computeModifierSeedActions({
      plan,
      existingGroups: existing.groups,
      existingOptions: existing.options,
      existingAttachments: existing.attachments,
      catalogValueId: CATEGORY_ID,
    });

    expect(actions.conflicts).toHaveLength(1);
    expect(actions.conflicts[0]).toMatch(/Leche/);
    expect(actions.conflicts[0]).toMatch(/max_selected/);
  });

  it('aborts naming the conflict when an existing option price differs (Almendras 25)', () => {
    const existing = existingIdenticalRows();
    const almendras = existing.options.find(
      (option) => option.name === 'Almendras',
    );
    expect(almendras).toBeDefined();
    almendras.price_delta = 25;

    const actions = computeModifierSeedActions({
      plan,
      existingGroups: existing.groups,
      existingOptions: existing.options,
      existingAttachments: existing.attachments,
      catalogValueId: CATEGORY_ID,
    });

    expect(actions.conflicts).toHaveLength(1);
    expect(actions.conflicts[0]).toMatch(/Almendras/);
    expect(actions.conflicts[0]).toMatch(/price/);
  });
});

describe('computeModifierSeedActions idempotency simulation (converges, no db-spec harness exists)', () => {
  it('applying twice creates everything once: the second pass reuses and creates nothing', () => {
    const plan = buildSohoModifierPlan();
    let groups = [];
    let options = [];
    let attachments = [];

    // First pass (empty tenant).
    const first = computeModifierSeedActions({
      plan,
      existingGroups: groups,
      existingOptions: options,
      existingAttachments: attachments,
      catalogValueId: CATEGORY_ID,
    });
    expect(first.conflicts).toEqual([]);

    // Simulate apply: materialize the created rows in memory.
    groups = first.groupsToCreate.map((group, index) => ({
      id: `g${index + 1}`,
      name: group.name,
      min_selected: group.minSelected,
      max_selected: group.maxSelected,
      allow_quantities: group.allowQuantities,
      sort_order: group.sortOrder,
      is_active: true,
    }));
    options = first.optionsToCreate.map((entry, index) => ({
      id: `o${index + 1}`,
      group_id: groups.find((g) => g.name === entry.groupName).id,
      name: entry.option.name,
      price_delta: entry.option.priceDelta,
      is_default: false,
      sort_order: entry.option.sortOrder,
    }));
    attachments = first.attachmentsToCreate.map((entry, index) => ({
      id: `att${index + 1}`,
      catalog_value_id: CATEGORY_ID,
      group_id: groups.find((g) => g.name === entry.groupName).id,
    }));

    // Second pass (re-run): must converge with zero new rows.
    const second = computeModifierSeedActions({
      plan,
      existingGroups: groups,
      existingOptions: options,
      existingAttachments: attachments,
      catalogValueId: CATEGORY_ID,
    });
    expect(second.conflicts).toEqual([]);
    expect(second.groupsToCreate).toHaveLength(0);
    expect(second.optionsToCreate).toHaveLength(0);
    expect(second.attachmentsToCreate).toHaveLength(0);
    expect(second.reusedGroups).toHaveLength(3);
    expect(second.reusedOptions).toHaveLength(11);
    expect(second.attachmentsSkipped).toBe(3);
  });
});

// ---- CLI / orchestration --------------------------------------------------

describe('parseApplyArg (dry-run by default)', () => {
  it('defaults to dry run without any flag', () => {
    expect(parseApplyArg([], {})).toBe(false);
  });

  it('enables apply via the --apply argv flag', () => {
    expect(parseApplyArg(['--apply'], {})).toBe(true);
  });

  it('enables apply via SEED_SOHO_APPLY=1', () => {
    expect(parseApplyArg([], { SEED_SOHO_APPLY: '1' })).toBe(true);
    expect(parseApplyArg([], { SEED_SOHO_APPLY: '0' })).toBe(false);
  });
});

describe('seedSohoModifierGroups', () => {
  const env = { SEED_SOHO_TENANT_SLUG: 'soho' };
  const tenantRow = { id: TENANT_ID, name: 'SOHO', slug: 'soho' };
  const categoryRows = [
    { id: CATEGORY_ID, code: 'CAFE_CALIENTE', name: 'Café Caliente' },
  ];

  it('dry run (default) resolves tenant and category but writes NOTHING', async () => {
    const manager = makeFakeManager({
      Tenant: [tenantRow],
      CatalogValue: categoryRows,
      Product: [],
    });
    const dataSource = makeFakeDataSource(manager);

    const result = await seedSohoModifierGroups(dataSource as never, {
      apply: false,
      env,
    });

    expect(manager.save).not.toHaveBeenCalled();
    expect(result.kind).toBe('SOHO_MODIFIER_SEED');
    expect(result.mode).toBe('dry-run');
    expect(result.tenant).toEqual({ id: TENANT_ID, name: 'SOHO' });
    expect(result.category).toEqual({ id: CATEGORY_ID, code: 'CAFE_CALIENTE' });
    expect(result.created).toEqual({ groups: 3, options: 11, attachments: 3 });
    expect(result.reused).toEqual({ groups: 0, options: 0, attachments: 0 });
    expect(result.conflicts).toEqual([]);
  });

  it('warns (without aborting) when no product uses the chosen category', async () => {
    const manager = makeFakeManager({
      Tenant: [tenantRow],
      CatalogValue: categoryRows,
      Product: [],
    });
    const dataSource = makeFakeDataSource(manager);

    const result = await seedSohoModifierGroups(dataSource as never, {
      apply: false,
      env,
    });

    expect(result.warnings.some((w) => /CAFE_CALIENTE/.test(w))).toBe(true);
  });

  it('applies inside one transaction when --apply, creating groups, options and attachments', async () => {
    const manager = makeFakeManager({
      Tenant: [tenantRow],
      CatalogValue: categoryRows,
      Product: [{ id: 'p1' }],
    });
    const dataSource = makeFakeDataSource(manager);

    const result = await seedSohoModifierGroups(dataSource as never, {
      apply: true,
      env,
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe('applied');
    expect(result.created).toEqual({ groups: 3, options: 11, attachments: 3 });

    const savedGroups = manager.save.mock.calls.filter(
      (call) => call[0] === ModifierGroup,
    );
    expect(savedGroups).toHaveLength(3);
    const leche = savedGroups
      .map((call) => call[1])
      .find((group) => group.name === 'Leche');
    expect(leche).toMatchObject({
      tenant_id: TENANT_ID,
      min_selected: 1,
      max_selected: 1,
      allow_quantities: false,
      sort_order: 1,
      is_active: true,
    });

    const savedOptions = manager.save.mock.calls.filter(
      (call) => call[0] === ModifierOption,
    );
    expect(savedOptions).toHaveLength(11);
    const extraShot = savedOptions
      .map((call) => call[1])
      .find((option) => option.name === 'Extra shot');
    expect(extraShot).toMatchObject({
      tenant_id: TENANT_ID,
      price_delta: 15,
      is_default: false,
      sort_order: 1,
    });

    const savedAttachments = manager.save.mock.calls.filter(
      (call) => call[0] === CategoryModifierGroup,
    );
    expect(savedAttachments).toHaveLength(3);
    expect(savedAttachments.map((call) => call[1].group_id)).toHaveLength(3);
  });

  it('abort the apply when the fixture conflicts with existing rows (no writes)', async () => {
    const existing = existingIdenticalRows();
    existing.groups[0].max_selected = 3;
    const manager = makeFakeManager({
      Tenant: [tenantRow],
      CatalogValue: categoryRows,
      Product: [{ id: 'p1' }],
      ModifierGroup: existing.groups,
      ModifierOption: existing.options,
      CategoryModifierGroup: existing.attachments,
    });
    const dataSource = makeFakeDataSource(manager);

    await expect(
      seedSohoModifierGroups(dataSource as never, { apply: true, env }),
    ).rejects.toThrow(/Leche/);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('reuses existing identical rows on apply (idempotent, no duplicates)', async () => {
    const existing = existingIdenticalRows();
    const manager = makeFakeManager({
      Tenant: [tenantRow],
      CatalogValue: categoryRows,
      Product: [{ id: 'p1' }],
      ModifierGroup: existing.groups,
      ModifierOption: existing.options,
      CategoryModifierGroup: existing.attachments,
    });
    const dataSource = makeFakeDataSource(manager);

    const result = await seedSohoModifierGroups(dataSource as never, {
      apply: true,
      env,
    });

    expect(manager.save).not.toHaveBeenCalled();
    expect(result.mode).toBe('applied');
    expect(result.created).toEqual({ groups: 0, options: 0, attachments: 0 });
    expect(result.reused).toEqual({ groups: 3, options: 11, attachments: 3 });
  });

  it('main() prints the machine-readable JSON contract and stays dry by default', async () => {
    const manager = makeFakeManager({
      Tenant: [tenantRow],
      CatalogValue: categoryRows,
      Product: [],
    });
    const { NestFactory } = await import('@nestjs/core');
    (NestFactory.createApplicationContext as jest.Mock).mockResolvedValue({
      get: () => dataSource,
      close: jest.fn(),
    });
    const dataSource = makeFakeDataSource(manager);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await main([]);
      const logged = logSpy.mock.calls.map((call) => call[0]).join('\n');
      const payload = JSON.parse(logged);
      expect(payload.kind).toBe('SOHO_MODIFIER_SEED');
      expect(payload.mode).toBe('dry-run');
      expect(payload.tenant.id).toBe(TENANT_ID);
      expect(payload.category.code).toBe('CAFE_CALIENTE');
      expect(payload.created.groups).toBe(3);
      expect(manager.save).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });
});
