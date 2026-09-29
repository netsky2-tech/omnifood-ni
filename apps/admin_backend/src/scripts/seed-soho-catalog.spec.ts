import { EntityManager } from 'typeorm';
import {
  TENANT_CONTEXT_SET_CONFIG_SQL,
} from '../core/database/tenant-transaction';
import { Insumo } from '../modules/inventory/entities/insumo.entity';
import { Product } from '../modules/inventory/entities/product.entity';
import {
  RecipeDetail,
} from '../modules/inventory/entities/recipe-detail.entity';
import {
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
  RecipeVersion,
} from '../modules/inventory/entities/recipe-version.entity';
import {
  buildSohoCatalogPlan,
  main,
  parseTenantIdArg,
  seedSohoCatalog,
} from './seed-soho-catalog';

jest.mock('@nestjs/core', () => ({
  NestFactory: { createApplicationContext: jest.fn() },
}));

const TENANT_ID = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

type EntityClass =
  | typeof Insumo
  | typeof Product
  | typeof RecipeVersion
  | typeof RecipeDetail;

interface FakeManager {
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  query: jest.Mock;
}

interface FakeDataSource {
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
    find: jest.fn(async (entityClass: EntityClass) =>
      existing[entityClass.name] ?? [],
    ),
    create: jest.fn((_entityClass: EntityClass, partial: object) => ({
      ...partial,
    })),
    save: jest.fn(async (_entityClass: EntityClass, entity: object) => {
      // TypeORM mutates and returns the saved entity with a generated id.
      const savedEntity = entity as { id?: string };
      savedEntity.id = nextUuid();
      return savedEntity;
    }),
    query: jest.fn(async () => []),
  };
  return manager;
}

function makeFakeDataSource(manager: FakeManager): FakeDataSource {
  return {
    // Mirrors runInTenantTransaction: binds the tenant context, then runs
    // the work callback with the transactional manager.
    transaction: jest.fn(async (work: (m: FakeManager) => Promise<unknown>) =>
      work(manager),
    ),
  };
}

const savedVersionIdByName = (
  manager: FakeManager,
  productName: string,
): string | undefined => {
  const saved = manager.save.mock.calls.find(
    (call) =>
      call[0] === RecipeVersion &&
      (call[1] as { product_name?: string }).product_name === productName,
  );
  return saved ? (saved[1] as { id: string }).id : undefined;
};

const savedNames = (
  manager: FakeManager,
  entityClass: EntityClass,
): string[] =>
  manager.save.mock.calls
    .filter((call) => call[0] === entityClass)
    .map((call) => (call[1] as { name?: string }).name as string);

describe('parseTenantIdArg (fail-closed CLI contract)', () => {
  it('rejects a missing --tenant-id', () => {
    expect(() => parseTenantIdArg([])).toThrow(/--tenant-id/);
  });

  it('rejects a blank --tenant-id', () => {
    expect(() => parseTenantIdArg(['--tenant-id', '   '])).toThrow(
      /Invalid --tenant-id/,
    );
  });

  it('rejects a non-UUID --tenant-id', () => {
    expect(() => parseTenantIdArg(['--tenant-id', 'soho'])).toThrow(
      /Invalid --tenant-id/,
    );
  });

  it('accepts a trimmed explicit UUID (space and =-forms)', () => {
    expect(parseTenantIdArg(['--tenant-id', ` ${TENANT_ID} `])).toBe(TENANT_ID);
    expect(parseTenantIdArg([`--tenant-id=${TENANT_ID}`])).toBe(TENANT_ID);
  });

  it('fails closed before any DataSource/Nest bootstrap when the id is invalid', async () => {
    const { NestFactory } = await import('@nestjs/core');
    await expect(main(['--tenant-id', 'not-a-uuid'])).rejects.toThrow(
      /Invalid --tenant-id/,
    );
    expect(NestFactory.createApplicationContext).not.toHaveBeenCalled();
  });
});

describe('seedSohoCatalog', () => {
  it('binds the tenant context before every write (runInTenantTransaction)', async () => {
    const manager = makeFakeManager();
    const dataSource = makeFakeDataSource(manager);

    await seedSohoCatalog(dataSource as never, TENANT_ID);

    // The only query issued on the manager is the transaction-local
    // set_config binding with the exact tenant id: every write below it is
    // RLS-authorized for this tenant.
    expect(manager.query).toHaveBeenCalledWith(TENANT_CONTEXT_SET_CONFIG_SQL, [
      TENANT_ID,
    ]);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('creates the full SOHO catalog on a clean tenant', async () => {
    const manager = makeFakeManager();
    const dataSource = makeFakeDataSource(manager);
    const plan = buildSohoCatalogPlan();

    const counts = await seedSohoCatalog(
      dataSource as never,
      TENANT_ID,
      plan,
    );

    expect(counts.insumosCreated).toBe(30);
    expect(counts.insumosSkipped).toBe(0);
    // FASE 3 lists 36 products (7 brunch, 5 postres, 9 caliente,
    // 9 helado, 6 especiales).
    expect(counts.productsCreated).toBe(36);
    expect(counts.productsSkipped).toBe(0);
    // 32 COMPOUND products get recipes; the 4 SIMPLE galletas do not.
    expect(counts.recipesCreated).toBe(32);
    expect(counts.recipesSkipped).toBe(0);
    // Every insumo in the plan has purchaseUom != consumptionUom.
    expect(counts.uomConversionsCreated).toBe(30);

    const productsSaved = savedNames(manager, Product);
    expect(productsSaved).toContain('Café Americano 12oz');
    expect(productsSaved).toContain('Desayuno Americano');

    // SIMPLE products never get a RecipeVersion.
    const versionsSaved = manager.save.mock.calls.filter(
      (call) => call[0] === RecipeVersion,
    );
    const versionProductIds = new Set(
      versionsSaved.map((call) => (call[1] as { product_id: string }).product_id),
    );
    const savedProducts = manager.save.mock.calls
      .filter((call) => call[0] === Product)
      .map((call) => call[1] as { name: string; id: string });
    const galletaSimple = savedProducts.find(
      (product) => product.name === 'Galleta Crumb',
    );
    expect(galletaSimple).toBeDefined();
    expect(versionProductIds.has(galletaSimple.id)).toBe(false);
  });

  it('creates a draft suggested MANUAL version for Café Americano 12oz with the exact plan quantity', async () => {
    const manager = makeFakeManager();
    const dataSource = makeFakeDataSource(manager);

    await seedSohoCatalog(dataSource as never, TENANT_ID);

    const versionCalls = manager.create.mock.calls.filter(
      (call) => call[0] === RecipeVersion,
    );
    const americano12 = versionCalls.find(
      (call) => (call[1] as { product_name: string }).product_name === 'Café Americano 12oz',
    );
    expect(americano12).toBeDefined();
    expect(americano12?.[1]).toMatchObject({
      tenant_id: TENANT_ID,
      version_number: 1,
      is_active: false,
      yield_quantity: 1,
      technical_shrink_pct: 0,
      origin: RecipeOrigin.MANUAL,
      publication_state: RecipePublicationState.DRAFT,
      suggestion_state: RecipeSuggestionState.SUGGESTED,
    });
    const versionId = savedVersionIdByName(manager, 'Café Americano 12oz');
    expect(versionId).toBeDefined();

    // Café Americano 12oz: 18 g of café molido, nothing else.
    const details = manager.create.mock.calls.filter(
      (call) =>
        call[0] === RecipeDetail &&
        (call[1] as { recipe_version_id: string }).recipe_version_id ===
          versionId,
    );
    expect(details).toHaveLength(1);
    expect(details[0][1]).toMatchObject({
      quantity: 18,
      gross_quantity: 18,
      technical_shrink_pct: 0,
      ingredient_name: 'Café molido',
      ingredient_type: 'INSUMO',
      component_uom: 'gramos',
    });
  });

  it('creates the exact Desayuno Americano BOM from FASE 2.1', async () => {
    const manager = makeFakeManager();
    const dataSource = makeFakeDataSource(manager);

    await seedSohoCatalog(dataSource as never, TENANT_ID);

    const versionCalls = manager.create.mock.calls.filter(
      (call) => call[0] === RecipeVersion,
    );
    const desayuno = versionCalls.find(
      (call) => (call[1] as { product_name: string }).product_name === 'Desayuno Americano',
    );
    expect(desayuno).toBeDefined();
    const versionId = savedVersionIdByName(manager, 'Desayuno Americano');
    expect(versionId).toBeDefined();

    const details = manager.create.mock.calls
      .filter(
        (call) =>
          call[0] === RecipeDetail &&
          (call[1] as { recipe_version_id: string }).recipe_version_id ===
            versionId,
      )
      .map((call) => call[1] as Record<string, unknown>);

    expect(details).toEqual([
      expect.objectContaining({ ingredient_name: 'Huevos (bandeja)', quantity: 2, component_uom: 'unidades' }),
      expect.objectContaining({ ingredient_name: 'Bacon (paquete)', quantity: 2, component_uom: 'tiras' }),
      expect.objectContaining({ ingredient_name: 'Pancakes (preparados)', quantity: 2, component_uom: 'unidades' }),
      expect.objectContaining({ ingredient_name: 'Mantequilla', quantity: 1, component_uom: 'porciones' }),
      expect.objectContaining({ ingredient_name: 'Miel', quantity: 1, component_uom: 'porciones' }),
      expect.objectContaining({ ingredient_name: 'Pan de masa madre', quantity: 1, component_uom: 'rebanadas' }),
    ]);
  });

  it('skips existing insumos, products and recipes on re-run without overwriting them', async () => {
    const existingInsumo = { id: nextUuid(), tenant_id: TENANT_ID, name: 'huevos (BANDEJA) ' } as Insumo;
    const existingAmericano = { id: nextUuid(), tenant_id: TENANT_ID, name: 'café americano 12oz' } as Product;
    const existingDesayuno = { id: nextUuid(), tenant_id: TENANT_ID, name: 'Desayuno Americano' } as Product;
    const existingVersion = {
      id: nextUuid(),
      tenant_id: TENANT_ID,
      product_id: existingDesayuno.id,
      publication_state: 'PUBLISHED',
    } as RecipeVersion;

    const manager = makeFakeManager({
      [Insumo.name]: [existingInsumo],
      [Product.name]: [existingAmericano, existingDesayuno],
      [RecipeVersion.name]: [existingVersion],
    });
    const dataSource = makeFakeDataSource(manager);

    const counts = await seedSohoCatalog(dataSource as never, TENANT_ID);

    expect(counts.insumosCreated).toBe(29);
    expect(counts.insumosSkipped).toBe(1);
    expect(counts.productsCreated).toBe(34);
    expect(counts.productsSkipped).toBe(2);
    expect(counts.recipesCreated).toBe(31);
    expect(counts.recipesSkipped).toBe(1);

    // No overwrite: the existing rows were never saved again.
    expect(savedNames(manager, Insumo)).not.toContain('Huevos (bandeja)');
    expect(savedNames(manager, Product)).not.toContain('café americano 12oz');
    expect(savedNames(manager, Product)).not.toContain('Desayuno Americano');
    const versionProductIds = manager.save.mock.calls
      .filter((call) => call[0] === RecipeVersion)
      .map((call) => (call[1] as { product_id: string }).product_id);
    expect(versionProductIds).not.toContain(existingDesayuno.id);
    // The authoritative existing version keeps its is_active/published state.
    expect(existingVersion.publication_state).toBe('PUBLISHED');
  });

  it('surfaces plan data warnings instead of inventing missing values', async () => {
    const manager = makeFakeManager();
    const dataSource = makeFakeDataSource(manager);

    const counts = await seedSohoCatalog(dataSource as never, TENANT_ID);

    const warningText = counts.warnings.join('\n');
    // Non-numeric plan factors defaulted to 1 must be visible.
    expect(warningText).toMatch(/I-05 Miel/);
    expect(warningText).toMatch(/I-30 Pastel de Chocolate/);
    // Matcha Fresa ice line has no quantity in the plan.
    expect(warningText).toMatch(/Matcha Fresa/);
  });
});
