import { Repository } from 'typeorm';
import { RecipeService } from './recipe.service';
import { RecipeVersion, RecipeOrigin, RecipePublicationState, RecipeSuggestionState } from './entities/recipe-version.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';
import { Product } from './entities/product.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { UomConversionCalculator } from './uom-conversion-calculator';
import { Insumo } from './entities/insumo.entity';

describe('Recipe Draft Lifecycle & BOM Protection (TDD / ONB1.3E / AC-45)', () => {
  let service: RecipeService;
  let recipeVersionRepo: jest.Mocked<Partial<Repository<RecipeVersion>>>;
  let recipeDetailRepo: jest.Mocked<Partial<Repository<RecipeDetail>>>;
  let productRepo: jest.Mocked<Partial<Repository<Product>>>;
  let uomConversionRepo: jest.Mocked<Partial<Repository<UomConversion>>>;
  let uomCalculator: UomConversionCalculator;

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
    productRepo = {
      findOne: jest.fn(),
    };
    uomConversionRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    uomCalculator = new UomConversionCalculator();

    service = new RecipeService(
      recipeVersionRepo as any,
      recipeDetailRepo as any,
      {} as any, // insumoRepo
      productRepo as any,
      uomConversionRepo as any,
      uomCalculator,
      {} as any, // dataSource
    );
  });

  it('ignores DRAFT / SUGGESTED recipe versions in findActiveVersion', async () => {
    // When the repo findOne with where clause { is_active: true, publication_state: 'PUBLISHED' } is called
    recipeVersionRepo.findOne = jest.fn().mockImplementation(({ where }: any) => {
      // If the query asks for publication_state PUBLISHED, and the row is DRAFT, it should not match
      if (where.publication_state === RecipePublicationState.PUBLISHED && where.is_active === true) {
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
      tenant: null as any,
      product: null as any,
      created_at: new Date(),
    };

    recipeVersionRepo.findOne = jest.fn().mockImplementation(({ where }: any) => {
      if (where.id === 'draft-rv-1') return Promise.resolve(draftRv);
      if (where.is_active === true) return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const published = await service.publishDraftVersion('tenant-1', 'draft-rv-1');

    expect(published.is_active).toBe(true);
    expect(published.publication_state).toBe(RecipePublicationState.PUBLISHED);
    expect(published.suggestion_state).toBe(RecipeSuggestionState.CONFIRMED);
    expect(published.published_at).toBeDefined();
    expect(recipeVersionRepo.save).toHaveBeenCalled();
  });
});
