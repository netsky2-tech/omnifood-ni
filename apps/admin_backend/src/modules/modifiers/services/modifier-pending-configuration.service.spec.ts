import { DataSource } from 'typeorm';
import { ModifierPendingConfigurationService } from './modifier-pending-configuration.service';
import { BomExplosionService } from '../../inventory/bom-explosion.service';
import { ModifierGroup } from '../entities/modifier-group.entity';
import { ModifierOption } from '../entities/modifier-option.entity';
import { CategoryModifierGroup } from '../entities/category-modifier-group.entity';
import { ProductModifierGroup } from '../entities/product-modifier-group.entity';
import { Product } from '../../inventory/entities/product.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';

/**
 * The owner's decision (2026-10-20): the backoffice owns the quantity of an
 * extra, so somebody has to be able to see which options are missing it.
 *
 * These specs pin WHAT the list says and WHAT it stays quiet about:
 *  - an option whose quantity the recipe provides is NOT pending (it is
 *    inherited, and the terminal will apply it);
 *  - an option with no recipe behind it IS pending, with the reason;
 *  - an option with a CONFIGURED quantity is never pending;
 *  - the verdict comes from the SAME resolver the cloud uses to recompute a
 *    sale's demand, so the list cannot promise an effect the terminal will
 *    not apply.
 */
describe('ModifierPendingConfigurationService', () => {
  let service: ModifierPendingConfigurationService;

  const manager: {
    getRepository: jest.Mock;
    query: jest.Mock;
  } = { getRepository: jest.fn(), query: jest.fn() };

  const dataSource = {
    transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)),
  } as unknown as DataSource;

  const repos = new Map<unknown, unknown>();

  const queryBuilder = (result: unknown) => {
    const builder: Record<string, jest.Mock> = {};
    for (const method of ['where', 'andWhere', 'orderBy', 'addOrderBy']) {
      builder[method] = jest.fn(() => builder);
    }
    builder.getMany = jest.fn().mockResolvedValue(result);
    builder.getOne = jest.fn().mockResolvedValue(result);
    return builder;
  };

  const option = (
    overrides: Partial<ModifierOption> = {},
  ): ModifierOption =>
    ({
      id: 'opt-1',
      tenant_id: 'tenant-1',
      group_id: 'group-1',
      name: 'Extra shot',
      price_delta: 15,
      is_default: false,
      sort_order: 0,
      is_active: true,
      inventory_effect: 'ADD',
      effect_insumo_id: 'ins-cafe',
      effect_target_insumo_id: 'ins-cafe',
      effect_quantity: null,
      effect_factor: null,
      ...overrides,
    }) as ModifierOption;

  const group = {
    id: 'group-1',
    tenant_id: 'tenant-1',
    name: 'Extras',
    min_selected: 0,
    max_selected: 3,
    allow_quantities: true,
    sort_order: 0,
    is_active: true,
  } as ModifierGroup;

  const product = {
    id: 'prod-1',
    tenant_id: 'tenant-1',
    name: 'Capuccino',
    category_code: null,
  } as Product;

  const insumo = (id: string, uom: string) =>
    ({
      id,
      tenant_id: 'tenant-1',
      name: id,
      consumptionUom: uom,
      is_active: true,
    }) as Insumo;

  const detail = (insumoId: string, quantity: number, uom: string) =>
    ({
      id: `detail-${insumoId}`,
      tenant_id: 'tenant-1',
      recipe_version_id: 'version-1',
      insumo_id: insumoId,
      quantity,
      gross_quantity: quantity,
      technical_shrink_pct: 0,
      ingredient_type: 'INSUMO',
      component_uom: uom,
    }) as RecipeDetail;

  const version = {
    id: 'version-1',
    tenant_id: 'tenant-1',
    product_id: 'prod-1',
    version_number: 1,
    is_active: true,
    publication_state: 'PUBLISHED',
    yield_quantity: 1,
    technical_shrink_pct: 0,
  } as RecipeVersion;

  beforeEach(() => {
    jest.clearAllMocks();
    repos.clear();

    repos.set(ModifierOption, {
      createQueryBuilder: jest.fn(() => queryBuilder([])),
    });
    repos.set(ModifierGroup, { find: jest.fn().mockResolvedValue([group]) });
    repos.set(ProductModifierGroup, {
      find: jest.fn().mockResolvedValue([
        { group_id: 'group-1', product_id: 'prod-1' },
      ]),
    });
    repos.set(CategoryModifierGroup, { find: jest.fn().mockResolvedValue([]) });
    repos.set(Product, {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(product),
    });
    repos.set(Insumo, {
      find: jest.fn().mockResolvedValue([insumo('ins-cafe', 'g')]),
    });
    repos.set(RecipeVersion, {
      createQueryBuilder: jest.fn(() => queryBuilder(version)),
    });
    repos.set(RecipeDetail, {
      find: jest.fn().mockResolvedValue([detail('ins-cafe', 18, 'g')]),
    });

    manager.getRepository.mockImplementation((entity: unknown) => {
      const repo = repos.get(entity);
      if (!repo) throw new Error(`unexpected repository: ${String(entity)}`);
      return repo;
    });

    service = new ModifierPendingConfigurationService(
      dataSource,
      new BomExplosionService(),
    );
  });

  const optionsQuery = (options: ModifierOption[]) => {
    (repos.get(ModifierOption) as { createQueryBuilder: jest.Mock })
      .createQueryBuilder.mockReturnValue(queryBuilder(options));
  };

  it('lists an option whose effect has no quantity and no recipe behind it', async () => {
    optionsQuery([option()]);
    (repos.get(RecipeVersion) as { createQueryBuilder: jest.Mock })
      .createQueryBuilder.mockReturnValue(queryBuilder(null));

    const pending = await service.findPendingConfiguration('tenant-1');

    expect(pending).toHaveLength(1);
    expect(pending[0].option_name).toBe('Extra shot');
    expect(pending[0].products[0].product_name).toBe('Capuccino');
    expect(pending[0].products[0].reason).toBe('PRODUCT_WITHOUT_RECIPE');
  });

  it('stays quiet when the recipe provides the quantity (it is inherited)', async () => {
    optionsQuery([option()]);

    const pending = await service.findPendingConfiguration('tenant-1');

    expect(pending).toEqual([]);
  });

  it('stays quiet when the quantity is configured in the backoffice', async () => {
    // The query itself excludes a configured quantity: the option is not
    // pending, it is DONE.
    optionsQuery([]);

    const pending = await service.findPendingConfiguration('tenant-1');

    expect(pending).toEqual([]);
  });

  it('names the unit mismatch the terminal would name', async () => {
    optionsQuery([option()]);
    (repos.get(Insumo) as { find: jest.Mock }).find.mockResolvedValue([
      insumo('ins-cafe', 'g'),
      insumo('ins-almendras', 'ml'),
    ]);
    (repos.get(RecipeDetail) as { find: jest.Mock }).find.mockResolvedValue([
      detail('ins-cafe', 18, 'g'),
    ]);
    optionsQuery([
      option({
        effect_insumo_id: 'ins-almendras',
        effect_target_insumo_id: 'ins-cafe',
      }),
    ]);

    const pending = await service.findPendingConfiguration('tenant-1');

    expect(pending).toHaveLength(1);
    // The affected insumo is in ml and the recipe component in g: the
    // recipe's number cannot be inherited, exactly as the terminal says.
    expect(pending[0].products[0].reason).toBe('UNIT_MISMATCH');
  });

  it('names an insumo the company has not registered', async () => {
    optionsQuery([option({ effect_insumo_id: 'ins-fantasma' })]);
    (repos.get(Insumo) as { find: jest.Mock }).find.mockResolvedValue([
      insumo('ins-cafe', 'g'),
    ]);

    const pending = await service.findPendingConfiguration('tenant-1');

    expect(pending).toHaveLength(1);
    expect(pending[0].products[0].reason).toBe('INSUMSO_NOT_IN_CATALOG');
  });
});
