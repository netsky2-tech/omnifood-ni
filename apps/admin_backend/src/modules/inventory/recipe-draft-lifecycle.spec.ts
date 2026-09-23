import { Repository } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../core/database/tenant-transaction';
import { RecipeService } from './recipe.service';
import {
  RecipeVersion,
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
} from './entities/recipe-version.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';
import { UomConversionCalculator } from './uom-conversion-calculator';

describe('Recipe Draft Lifecycle & BOM Protection (TDD / ONB1.3E / AC-45)', () => {
  let service: RecipeService;
  let recipeVersionRepo: jest.Mocked<Partial<Repository<RecipeVersion>>>;
  let recipeDetailRepo: jest.Mocked<Partial<Repository<RecipeDetail>>>;
  let uomCalculator: UomConversionCalculator;
  // Issue #512 slice 2 part A: exposed so the binding guards can assert the
  // protected reads ride the tenant-bound transaction (not the pooled repos).
  let txManager: {
    query: jest.Mock;
    getRepository: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    recipeVersionRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) => Promise.resolve(e)) as any,
    };
    recipeDetailRepo = {
      find: jest.fn(),
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) => Promise.resolve(e)) as any,
    };
    uomCalculator = new UomConversionCalculator();

    // Issue #512 slice 2 part A: RecipeService resolves recipe repositories
    // from the tenant-bound transaction manager, so the fixture's dataSource
    // runs the callback against a manager that exposes the mocked repos.
    const txManagerLocal = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === RecipeVersion) return recipeVersionRepo;
        if (entity === RecipeDetail) return recipeDetailRepo;
        return null;
      }),
    };
    txManager = txManagerLocal;
    const dataSourceLocal = {
      transaction: jest.fn(
        <T>(cb: (m: typeof txManagerLocal) => Promise<T>): Promise<T> =>
          cb(txManagerLocal),
      ),
    };
    dataSource = dataSourceLocal;

    service = new RecipeService(
      recipeVersionRepo as any,
      recipeDetailRepo as any,
      uomCalculator,
      dataSourceLocal as any, // dataSource
    );
  });

  it('ignores DRAFT / SUGGESTED recipe versions in findActiveVersion', async () => {
    // When the repo findOne with where clause { is_active: true, publication_state: 'PUBLISHED' } is called
    recipeVersionRepo.findOne = jest
      .fn()
      .mockImplementation(({ where }: any) => {
        // If the query asks for publication_state PUBLISHED, and the row is DRAFT, it should not match
        if (
          where.publication_state === RecipePublicationState.PUBLISHED &&
          where.is_active === true
        ) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          id: 'draft-rv-1',
          tenant_id: 'tenant-1',
          product_id: 'prod-1',
          publication_state: RecipePublicationState.DRAFT,
          suggestion_state: RecipeSuggestionState.SUGGESTED,
          is_active: false,
        } as any);
      });

    const active = await service.findActiveVersion('tenant-1', 'prod-1');

    expect(active).toBeNull();
    expect(recipeVersionRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: 'tenant-1',
          product_id: 'prod-1',
          is_active: true,
          publication_state: RecipePublicationState.PUBLISHED,
        }),
      }),
    );
  });

  it('publishes a draft version explicitly via publishDraftVersion', async () => {
    const draftRv: RecipeVersion = {
      id: 'draft-rv-1',
      tenant_id: 'tenant-1',
      product_id: 'prod-1',
      version_number: 1,
      is_active: false,
      origin: RecipeOrigin.INDUSTRY_TEMPLATE,
      publication_state: RecipePublicationState.DRAFT,
      suggestion_state: RecipeSuggestionState.SUGGESTED,
      product_name: 'Capuchino 8oz',
      yield_quantity: 1,
      technical_shrink_pct: 0,
      version_note: null,
      published_at: null,
      pos_created_at: null,
      fecha_inicio_vigencia: new Date(),
      fecha_fin_vigencia: null,
      pos_document_id: null,
      tenant: null,
      product: null,
      created_at: new Date(),
    };

    recipeVersionRepo.findOne = jest
      .fn()
      .mockImplementation(({ where }: any) => {
        if (where.id === 'draft-rv-1') return Promise.resolve(draftRv);
        if (where.is_active === true) return Promise.resolve(null);
        return Promise.resolve(null);
      });

    const published = await service.publishDraftVersion(
      'tenant-1',
      'draft-rv-1',
    );

    expect(published.is_active).toBe(true);
    expect(published.publication_state).toBe(RecipePublicationState.PUBLISHED);
    expect(published.suggestion_state).toBe(RecipeSuggestionState.CONFIRMED);
    expect(published.published_at).toBeDefined();
    expect(recipeVersionRepo.save).toHaveBeenCalled();
  });

  // Issue #512 slice 2 part A binding guards: reverting findActiveVersion or
  // publishDraftVersion to the pooled `this.recipeVersionRepo` would skip
  // runInTenantTransaction entirely — no transaction opens and no
  // transaction-local set_config binding runs — so the dataSource.transaction
  // and set_config assertions below would fail, and the read would silently
  // return zero rows under FORCE RLS instead of failing loudly.
  it('routes the findActiveVersion read through the tenant-bound transaction (issue #512)', async () => {
    recipeVersionRepo.findOne = jest.fn().mockResolvedValue(null);

    await service.findActiveVersion('tenant-1', 'prod-1');

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(txManager.getRepository).toHaveBeenCalledWith(RecipeVersion);
    expect(txManager.query).toHaveBeenCalledWith(
      TENANT_CONTEXT_SET_CONFIG_SQL,
      ['tenant-1'],
    );
    // The binding precedes the first protected access.
    expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
      recipeVersionRepo.findOne.mock.invocationCallOrder[0],
    );
  });

  it('routes the publishDraftVersion lifecycle through the tenant-bound transaction (issue #512)', async () => {
    const publishedDraft = {
      id: 'draft-rv-1',
      tenant_id: 'tenant-1',
      product_id: 'prod-1',
      version_number: 1,
      is_active: true,
      publication_state: RecipePublicationState.PUBLISHED,
      suggestion_state: RecipeSuggestionState.CONFIRMED,
    } as RecipeVersion;
    recipeVersionRepo.findOne = jest.fn().mockResolvedValue(publishedDraft);

    const result = await service.publishDraftVersion('tenant-1', 'draft-rv-1');

    expect(result.is_active).toBe(true);
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(txManager.getRepository).toHaveBeenCalledWith(RecipeVersion);
    expect(txManager.query).toHaveBeenCalledWith(
      TENANT_CONTEXT_SET_CONFIG_SQL,
      ['tenant-1'],
    );
    expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
      recipeVersionRepo.findOne.mock.invocationCallOrder[0],
    );
  });
});
