import { Repository } from 'typeorm';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../core/database/tenant-transaction';
import { RecipeService } from './recipe.service';
import { RecipeController } from './recipe.controller';
import { AuthGuard } from '../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
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

  // #523 T2/T4 — publishDraftVersion is the tested confirmation step but had
  // zero production callers and no route: a suggestion could not be listed,
  // selected, or accepted. These specs pin the pure wiring on the existing
  // controller/service, never a second publish implementation.
  describe('RecipeController publish & suggestions wiring (#523 T2/T4)', () => {
    let controller: RecipeController;
    let recipeService: {
      publishDraftVersion: jest.Mock;
      getSnapshot: jest.Mock;
      listPendingTemplateSuggestions: jest.Mock;
    };

    beforeEach(() => {
      recipeService = {
        publishDraftVersion: jest.fn(),
        getSnapshot: jest.fn(),
        listPendingTemplateSuggestions: jest.fn(),
      };
      controller = new RecipeController(
        recipeService as unknown as RecipeService,
      );
    });

    it('exposes POST :recipeVersionId/publish bound to the existing publishDraftVersion (T2)', async () => {
      const handler = Object.getOwnPropertyDescriptor(
        RecipeController.prototype,
        'publishRecipeVersion',
      )?.value;
      expect(typeof handler).toBe('function');

      // Route metadata: POST /recipes/:recipeVersionId/publish.
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
        ':recipeVersionId/publish',
      );
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
      // Same human mutation idiom as the sibling POST that creates versions.
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
      ]);

      const published = {
        id: 'rv-1',
        tenant_id: 'tenant-1',
        product_id: 'prod-1',
        version_number: 2,
        is_active: true,
        publication_state: RecipePublicationState.PUBLISHED,
      };
      recipeService.publishDraftVersion.mockResolvedValueOnce(published);
      recipeService.getSnapshot.mockResolvedValueOnce({
        recipeVersion: published,
        components: [],
      });

      const result = await controller.publishRecipeVersion('rv-1', 'tenant-1');

      // The route is a caller of the tested service method, nothing more.
      expect(recipeService.publishDraftVersion).toHaveBeenCalledWith(
        'tenant-1',
        'rv-1',
      );
      // Returns the existing sibling snapshot response shape.
      expect(result).toEqual({
        recipeVersion: expect.objectContaining({ id: 'rv-1' }),
        components: [],
      });
    });

    it('fails closed when the publish route lacks a tenant context (T2)', async () => {
      await expect(
        controller.publishRecipeVersion('rv-1', undefined),
      ).rejects.toThrow('Tenant context is required');
      expect(recipeService.publishDraftVersion).not.toHaveBeenCalled();
    });

    it('exposes GET suggestions delegating to the tenant-scoped list (T4)', async () => {
      const handler = Object.getOwnPropertyDescriptor(
        RecipeController.prototype,
        'listPendingSuggestions',
      )?.value;
      expect(typeof handler).toBe('function');

      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('suggestions');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );

      const suggestions = [
        {
          recipeVersionId: 'rv-1',
          productId: 'prod-1',
          productName: 'Capuchino 8oz',
          versionNumber: 1,
          componentCount: 2,
          hasActivePublishedVersion: false,
        },
      ];
      recipeService.listPendingTemplateSuggestions.mockResolvedValueOnce(
        suggestions,
      );

      const result = await controller.listPendingSuggestions('tenant-1');

      expect(result).toEqual(suggestions);
      expect(recipeService.listPendingTemplateSuggestions).toHaveBeenCalledWith(
        'tenant-1',
      );
    });
  });
});
