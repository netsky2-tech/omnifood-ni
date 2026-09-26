import { BadRequestException } from '@nestjs/common';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../core/database/tenant-transaction';
import { RecipeService } from './recipe.service';
import { Product, ProductType } from './entities/product.entity';
import {
  RecipeVersion,
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
} from './entities/recipe-version.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';
import { UomConversionCalculator } from './uom-conversion-calculator';

/**
 * #611 — Server-side guard: a recipe version must never become live on a
 * product no consumption branch reads.
 *
 * The cloud recipe branch in sale-inventory-outcome.service.ts only consumes
 * recipes for products typed PREPARED | COMPOUND (SIMPLE yields noImpact
 * without an explicit insumo mapping), so createNewVersion and
 * publishDraftVersion must reject any other product type.
 *
 * Path B (ingestPosVersion / createFreshVersion) is deliberately NOT guarded:
 * rejecting POS ingestion would fail the POS push (#551, #519 U4 lessons).
 */

const TENANT_ID = 'tenant-1';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000001';
const PRODUCT_NAME = 'Espresso Doble';

describe('Recipe product-type guard (#611)', () => {
  let service: RecipeService;

  const productRepo = { findOne: jest.fn() };
  const recipeVersionRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ ...value, id: (value.id as string) ?? 'rv-new' }),
    ),
  };
  const recipeDetailRepo = {
    find: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(() => Promise.resolve([])),
  };

  const txManager = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Product) return productRepo;
      if (entity === RecipeVersion) return recipeVersionRepo;
      if (entity === RecipeDetail) return recipeDetailRepo;
      return null;
    }),
  };
  const dataSource = {
    transaction: jest.fn(
      <T>(cb: (m: typeof txManager) => Promise<T>): Promise<T> => cb(txManager),
    ),
  };

  const mockProduct = (productType: ProductType | null): void => {
    productRepo.findOne.mockResolvedValue(
      productType === null
        ? null
        : {
            id: PRODUCT_ID,
            tenant_id: TENANT_ID,
            name: PRODUCT_NAME,
            product_type: productType,
          },
    );
  };

  const createVersionInput = {
    tenantId: TENANT_ID,
    productId: PRODUCT_ID,
    components: [
      { insumoId: 'ins-1', grossQuantity: 9, technicalShrinkPct: 0 },
    ],
    yieldQuantity: 1,
    technicalShrinkPct: 0,
  };

  const buildDraft = (): RecipeVersion => ({
    id: 'draft-rv-1',
    tenant_id: TENANT_ID,
    product_id: PRODUCT_ID,
    version_number: 1,
    is_active: false,
    origin: RecipeOrigin.INDUSTRY_TEMPLATE,
    publication_state: RecipePublicationState.DRAFT,
    suggestion_state: RecipeSuggestionState.SUGGESTED,
    product_name: PRODUCT_NAME,
    yield_quantity: 1,
    technical_shrink_pct: 0,
    version_note: null,
    published_at: null,
    pos_created_at: null,
    fecha_inicio_vigencia: new Date('2026-01-01T00:00:00.000Z'),
    fecha_fin_vigencia: null,
    pos_document_id: null,
    tenant: null,
    product: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    txManager.query.mockResolvedValue(undefined);
    recipeVersionRepo.findOne.mockReset();
    recipeVersionRepo.save.mockImplementation(
      (value: Record<string, unknown>) =>
        Promise.resolve({ ...value, id: (value.id as string) ?? 'rv-new' }),
    );
    productRepo.findOne.mockReset();
    service = new RecipeService(
      recipeVersionRepo as never,
      recipeDetailRepo as never,
      new UomConversionCalculator(),
      dataSource as never,
    );
  });

  describe('createNewVersion', () => {
    it('rejects a SIMPLE product with an operator-actionable message (#611)', async () => {
      mockProduct(ProductType.SIMPLE);

      await expect(
        service.createNewVersion(createVersionInput),
      ).rejects.toThrow(BadRequestException);
      // The recipe version is never written.
      expect(recipeVersionRepo.save).not.toHaveBeenCalled();
      expect(recipeDetailRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a VARIANT_PARENT product (only COMPOUND | PREPARED admit recipes)', async () => {
      mockProduct(ProductType.VARIANT_PARENT);

      await expect(
        service.createNewVersion(createVersionInput),
      ).rejects.toThrow(BadRequestException);
      expect(recipeVersionRepo.save).not.toHaveBeenCalled();
    });

    it('still creates a version for a COMPOUND product (guard is not over-broad)', async () => {
      mockProduct(ProductType.COMPOUND);
      recipeVersionRepo.findOne.mockResolvedValue(null); // no prior active

      const version = await service.createNewVersion(createVersionInput);

      expect(version).toMatchObject({
        product_id: PRODUCT_ID,
        is_active: true,
      });
      expect(recipeVersionRepo.save).toHaveBeenCalled();
    });

    it('still creates a version for a PREPARED product', async () => {
      mockProduct(ProductType.PREPARED);
      recipeVersionRepo.findOne.mockResolvedValue(null);

      const version = await service.createNewVersion(createVersionInput);

      expect(version).toMatchObject({
        product_id: PRODUCT_ID,
        is_active: true,
      });
    });

    it('preserves existing behaviour when the product row does not exist (no type error)', async () => {
      mockProduct(null);
      recipeVersionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createNewVersion(createVersionInput),
      ).resolves.toMatchObject({ product_id: PRODUCT_ID, is_active: true });
      expect(productRepo.findOne).toHaveBeenCalled();
    });

    it('reads the product inside the tenant-bound transaction, before any write', async () => {
      mockProduct(ProductType.SIMPLE);

      await expect(
        service.createNewVersion(createVersionInput),
      ).rejects.toThrow(BadRequestException);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(txManager.getRepository).toHaveBeenCalledWith(Product);
      // The tenant binding precedes the product read (no unbound query).
      expect(txManager.query).toHaveBeenCalledWith(
        TENANT_CONTEXT_SET_CONFIG_SQL,
        [TENANT_ID],
      );
      expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
        productRepo.findOne.mock.invocationCallOrder[0],
      );
    });
  });

  describe('publishDraftVersion', () => {
    const publishDraft = (): Promise<RecipeVersion> =>
      service.publishDraftVersion(TENANT_ID, 'draft-rv-1');

    beforeEach(() => {
      // Draft lookup: the draft exists; no prior active version.
      recipeVersionRepo.findOne.mockImplementation(({ where }: never) => {
        const query = where as { id?: string; is_active?: boolean };
        if (query.id === 'draft-rv-1') return Promise.resolve(buildDraft());
        return Promise.resolve(null);
      });
    });

    it('rejects publishing a draft on a SIMPLE product (#611)', async () => {
      mockProduct(ProductType.SIMPLE);

      await expect(publishDraft()).rejects.toThrow(BadRequestException);
      // The draft is never mutated into PUBLISHED.
      expect(recipeVersionRepo.save).not.toHaveBeenCalled();
    });

    it('still publishes a draft for a COMPOUND product (guard is not over-broad)', async () => {
      mockProduct(ProductType.COMPOUND);

      const published = await publishDraft();

      expect(published.is_active).toBe(true);
      expect(published.publication_state).toBe(
        RecipePublicationState.PUBLISHED,
      );
      expect(published.suggestion_state).toBe(RecipeSuggestionState.CONFIRMED);
    });

    it('still publishes a draft for a PREPARED product', async () => {
      mockProduct(ProductType.PREPARED);

      const published = await publishDraft();

      expect(published.publication_state).toBe(
        RecipePublicationState.PUBLISHED,
      );
    });

    it('preserves existing behaviour when the product row does not exist (no type error)', async () => {
      mockProduct(null);

      const published = await publishDraft();

      expect(published.is_active).toBe(true);
      expect(published.publication_state).toBe(
        RecipePublicationState.PUBLISHED,
      );
      expect(productRepo.findOne).toHaveBeenCalled();
    });

    it('reads the product inside the tenant-bound transaction, before any write', async () => {
      mockProduct(ProductType.SIMPLE);

      await expect(publishDraft()).rejects.toThrow(BadRequestException);

      expect(txManager.getRepository).toHaveBeenCalledWith(Product);
      expect(txManager.query).toHaveBeenCalledWith(
        TENANT_CONTEXT_SET_CONFIG_SQL,
        [TENANT_ID],
      );
      expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
        productRepo.findOne.mock.invocationCallOrder[0],
      );
      // No prior-active deactivation write may happen before the rejection.
      expect(recipeVersionRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('rejection message', () => {
    it('names the product and states the fix location in neutral Spanish (#611)', async () => {
      mockProduct(ProductType.SIMPLE);
      recipeVersionRepo.findOne.mockResolvedValue(null);

      const error = await service
        .createNewVersion(createVersionInput)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      const message = (error as BadRequestException).message;
      // The product is named, so the operator knows which row to fix.
      expect(message).toContain(PRODUCT_NAME);
      // Neutral Spanish (usted), names the allowed types and the fix location.
      expect(message).toContain('Compuesto o Preparado');
      expect(message).toContain('Catálogo');
    });

    it('names the product when publishing a draft on a SIMPLE product', async () => {
      recipeVersionRepo.findOne.mockImplementation(({ where }: never) => {
        const query = where as { id?: string };
        if (query.id === 'draft-rv-1') return Promise.resolve(buildDraft());
        return Promise.resolve(null);
      });
      mockProduct(ProductType.SIMPLE);

      const error = await service
        .publishDraftVersion(TENANT_ID, 'draft-rv-1')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain(PRODUCT_NAME);
    });
  });
});
