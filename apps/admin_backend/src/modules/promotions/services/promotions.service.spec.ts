import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { PromotionsService } from './promotions.service';
import { Promotion, PromotionType } from '../entities/promotion.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { CATALOG_TYPE } from '../../catalog/catalog-type';

describe('PromotionsService', () => {
  let service: PromotionsService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  // T0.5'a: target_category_id is a uuid FK to catalog_values
  // (SALES_PRODUCT_CATEGORY); the service validates it inside the same
  // tenant-bound transaction, so the manager must hand out a distinct
  // catalog repository the tests can observe.
  let catalogRepo: { findOne: jest.Mock };
  // The tenant-bound transaction fake: the manager hands back the same
  // repository mock the pooled token provides, so the existing behavior
  // assertions keep working unchanged while the guard test below proves the
  // binding itself with isolated instrumented fakes.
  let transactionalManager: {
    query: jest.Mock;
    getRepository: jest.Mock;
  };
  let transactionalDataSource: { transaction: jest.Mock };

  const mockPromotion = (overrides: Partial<Promotion> = {}): Promotion =>
    ({
      id: 'promo-uuid-1',
      tenant_id: 'tenant-1',
      name: '2x1 Cerveza Toña',
      type: PromotionType.BUY_X_GET_Y_FREE,
      target_product_id: 'prod-beer',
      buy_quantity: 1,
      get_quantity: 1,
      discount_value: 0,
      min_order_amount: 0,
      priority: 10,
      is_stackable: true,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    }) as Promotion;

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([mockPromotion()]),
      findOne: jest.fn(),
      create: jest.fn((data: unknown) => data as Promotion),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };

    catalogRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    transactionalManager = {
      query: jest.fn(async () => []),
      getRepository: jest.fn((entity: unknown) =>
        entity === CatalogValue ? catalogRepo : repo,
      ),
    };
    transactionalDataSource = {
      transaction: jest.fn(
        async (work: (manager: unknown) => Promise<unknown>) =>
          work(transactionalManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionsService,
        {
          provide: getRepositoryToken(Promotion),
          useValue: repo,
        },
        { provide: DataSource, useValue: transactionalDataSource },
      ],
    }).compile();

    service = module.get<PromotionsService>(PromotionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should find all active promotions for a tenant', async () => {
    const list = await service.findAll('tenant-1');
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('2x1 Cerveza Toña');
    expect(repo.find).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-1', is_active: true },
      order: { priority: 'DESC', created_at: 'DESC' },
    });
  });

  it('should find promotion by id and tenant', async () => {
    repo.findOne.mockResolvedValue(mockPromotion());
    const promo = await service.findOne('tenant-1', 'promo-uuid-1');
    expect(promo.id).toBe('promo-uuid-1');
  });

  it('should throw NotFoundException when promotion not found', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne('tenant-1', 'non-existent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should create new promotion with tenant context', async () => {
    const dto = {
      name: '15% Descuento Bebidas',
      type: PromotionType.PERCENTAGE_DISCOUNT,
      target_category_id: '11111111-1111-4111-8111-111111111111',
      discount_value: 15,
      priority: 5,
    };
    catalogRepo.findOne.mockResolvedValueOnce({
      id: dto.target_category_id,
      tenant_id: 'tenant-1',
      catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
    });
    const created = await service.create('tenant-1', dto);
    expect(created.name).toBe('15% Descuento Bebidas');
    expect(created.tenant_id).toBe('tenant-1');
    expect(created.is_active).toBe(true);
    // T0.5'a: the target category was validated inside the SAME tenant-bound
    // transaction, tenant-scoped and restricted to SALES_PRODUCT_CATEGORY.
    expect(catalogRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: dto.target_category_id,
        tenant_id: 'tenant-1',
        catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
      },
    });
  });

  it('should update promotion', async () => {
    repo.findOne.mockResolvedValue(mockPromotion());
    const updated = await service.update('tenant-1', 'promo-uuid-1', {
      priority: 20,
    });
    expect(updated.priority).toBe(20);
  });

  it('should soft delete promotion (is_active = false)', async () => {
    const promo = mockPromotion();
    repo.findOne.mockResolvedValue(promo);
    await service.remove('tenant-1', 'promo-uuid-1');
    expect(promo.is_active).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(promo);
  });

  // T0.5'a: target_category_id is now a uuid referencing
  // catalog_values(tenant_id, id). The DTO accepts UUID strings only, and
  // the service must reject, with a 4xx (never a silent ignore): a
  // non-uuid value, and a uuid that is not a SALES_PRODUCT_CATEGORY row of
  // the caller's tenant (foreign tenant, other catalog type, or missing —
  // all one message, so the endpoint is not a cross-tenant existence
  // oracle).
  describe("target_category_id validation (T0.5'a)", () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';

    it('rejects a non-uuid target_category_id without querying the catalog', async () => {
      await expect(
        service.create('tenant-1', {
          name: 'Promo',
          type: PromotionType.PERCENTAGE_DISCOUNT,
          target_category_id: 'Bebidas',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(catalogRepo.findOne).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a uuid that is not a SALES_PRODUCT_CATEGORY row of the tenant', async () => {
      catalogRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.create('tenant-1', {
          name: 'Promo',
          type: PromotionType.PERCENTAGE_DISCOUNT,
          target_category_id: validUuid,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(catalogRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: validUuid,
          tenant_id: 'tenant-1',
          catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
        },
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('validates on update too', async () => {
      repo.findOne.mockResolvedValue(mockPromotion());
      catalogRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.update('tenant-1', 'promo-uuid-1', {
          target_category_id: validUuid,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('accepts a valid SALES_PRODUCT_CATEGORY row of the tenant on update', async () => {
      repo.findOne.mockResolvedValue(mockPromotion());
      catalogRepo.findOne.mockResolvedValueOnce({
        id: validUuid,
        tenant_id: 'tenant-1',
        catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
      });
      const updated = await service.update('tenant-1', 'promo-uuid-1', {
        target_category_id: validUuid,
      });
      expect(updated.target_category_id).toBe(validUuid);
    });

    it('never queries the catalog when target_category_id is absent', async () => {
      repo.findOne.mockResolvedValue(mockPromotion());
      await service.update('tenant-1', 'promo-uuid-1', { priority: 20 });
      expect(catalogRepo.findOne).not.toHaveBeenCalled();
    });
  });

  // T0.5'd: an explicit JSON null is a deliberate "no category target"
  // (global on create, clear on update) and must flow to the column, while
  // an empty string stays rejected — the blank-target trap T0.5'a guards.
  describe("target_category_id null contract (T0.5'd)", () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';

    it('accepts target_category_id null on create as a global promotion without querying the catalog', async () => {
      const created = await service.create('tenant-1', {
        name: 'Promo Global',
        type: PromotionType.PERCENTAGE_DISCOUNT,
        target_category_id: null,
      });
      expect(created.target_category_id).toBeNull();
      expect(catalogRepo.findOne).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('clears a previously set target_category_id on update with null', async () => {
      repo.findOne.mockResolvedValue(
        mockPromotion({ target_category_id: validUuid }),
      );
      const updated = await service.update('tenant-1', 'promo-uuid-1', {
        target_category_id: null,
      });
      expect(updated.target_category_id).toBeNull();
      expect(catalogRepo.findOne).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('still rejects an empty-string target_category_id on create', async () => {
      await expect(
        service.create('tenant-1', {
          name: 'Promo',
          type: PromotionType.PERCENTAGE_DISCOUNT,
          target_category_id: '',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(catalogRepo.findOne).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('still rejects an empty-string target_category_id on update', async () => {
      repo.findOne.mockResolvedValue(mockPromotion());
      await expect(
        service.update('tenant-1', 'promo-uuid-1', {
          target_category_id: '',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(catalogRepo.findOne).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  // Issue #512 T3 slice 6: the promotions table is now tenant-RLS
  // protected, so every promotions access must run inside a tenant-bound
  // transaction. This guard has RUNTIME teeth: it injects a fake DataSource
  // whose transaction() hands back a manager that records the set_config
  // binding and hands out instrumented repositories, while the pooled
  // repository stands beside it as a tripwire. If any bound access is
  // reverted to the pooled repository (while the constructor keeps
  // declaring dataSource), the pooled tripwire records a call and this
  // test fails at runtime, not at compile time.
  describe('tenant transaction binding', () => {
    it('binds the promotions access through the tenant transaction (issue #512 slice 6)', async () => {
      // Pooled tripwires: any call here means an access escaped the bound
      // transaction and would hit RLS on a connection with no tenant bound.
      const pooledPromotion = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      };

      // Bound instrumented repository handed out by the transaction manager.
      const boundPromotion = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(async (entity: unknown) => entity),
      };

      const setConfigCalls: Array<[string, string[]]> = [];
      const boundManager = {
        query: jest.fn(async (sql: string, params: string[]) => {
          setConfigCalls.push([sql, params]);
          return [];
        }),
        getRepository: jest.fn(() => boundPromotion),
      };
      const boundDataSource = {
        transaction: jest.fn(
          async (work: (manager: unknown) => Promise<unknown>) =>
            work(boundManager),
        ),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PromotionsService,
          {
            provide: getRepositoryToken(Promotion),
            useValue: pooledPromotion,
          },
          { provide: DataSource, useValue: boundDataSource },
        ],
      }).compile();
      const bound = module.get<PromotionsService>(PromotionsService);

      // Exercise every public method: the two read-only lookups plus the
      // three logical write units (create, update, remove), each of which
      // must be its own transaction.
      boundPromotion.find.mockResolvedValueOnce([]); // findAll
      await bound.findAll('tenant-1');

      boundPromotion.findOne.mockResolvedValueOnce(mockPromotion()); // findOne
      await bound.findOne('tenant-1', 'promo-uuid-1');

      boundPromotion.create.mockReturnValueOnce(
        mockPromotion({ id: 'promo-new' }),
      );
      await bound.create('tenant-1', {
        name: 'Nueva promo',
        type: PromotionType.FIXED_DISCOUNT,
      });

      boundPromotion.findOne.mockResolvedValueOnce(mockPromotion()); // update
      await bound.update('tenant-1', 'promo-uuid-1', { priority: 20 });

      boundPromotion.findOne.mockResolvedValueOnce(mockPromotion()); // remove
      await bound.remove('tenant-1', 'promo-uuid-1');

      // FIVE logical units, FIVE transactions, each binding the tenant
      // context exactly once with the production set_config SQL.
      expect(boundDataSource.transaction).toHaveBeenCalledTimes(5);
      expect(setConfigCalls).toHaveLength(5);
      for (const [sql, params] of setConfigCalls) {
        expect(sql).toBe(TENANT_CONTEXT_SET_CONFIG_SQL);
        expect(params).toEqual(['tenant-1']);
      }

      // Every access resolved through the bound manager's repository:
      // findAll's find, the three findOne lookups (public findOne plus the
      // update and remove units reusing the manager-based helper), create's
      // create, and the three saves (create + update + remove).
      expect(boundPromotion.find).toHaveBeenCalledTimes(1);
      expect(boundPromotion.findOne).toHaveBeenCalledTimes(3);
      expect(boundPromotion.create).toHaveBeenCalledTimes(1);
      expect(boundPromotion.save).toHaveBeenCalledTimes(3);
      // ...and the manager handed out only tenant-bound repositories.
      expect(boundManager.getRepository).toHaveBeenCalledTimes(8);

      // RUNTIME TEETH: the pooled tripwire stayed silent. A reverted access
      // lands here and fails this assertion — no compile error involved.
      expect(pooledPromotion.find).not.toHaveBeenCalled();
      expect(pooledPromotion.findOne).not.toHaveBeenCalled();
      expect(pooledPromotion.create).not.toHaveBeenCalled();
      expect(pooledPromotion.save).not.toHaveBeenCalled();
    });
  });
});
