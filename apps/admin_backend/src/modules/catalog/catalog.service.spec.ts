import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CatalogService, DEFAULT_CATALOG_SEED } from './catalog.service';
import { CatalogValue } from './entities/catalog-value.entity';
import { CATALOG_TYPE } from './catalog-type';

describe('CatalogService', () => {
  let service: CatalogService;
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    query: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: { getRepository: jest.Mock };
  };

  const makeRow = (over: Partial<CatalogValue> = {}): CatalogValue =>
    ({
      id: 'cat-1',
      tenant_id: 'tenant-A',
      catalog_type: CATALOG_TYPE.UOM,
      code: 'kg',
      name: 'Kilogramo',
      is_active: true,
      sort_order: 0,
      ...over,
    }) as CatalogValue;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((data: unknown) => data as CatalogValue),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: { getRepository: jest.fn().mockReturnValue(repo) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        {
          provide: DataSource,
          useValue: { createQueryRunner: jest.fn().mockReturnValue(queryRunner) },
        },
      ],
    }).compile();

    service = module.get(CatalogService);
  });

  describe('list', () => {
    it('returns only active values by default, ordered', async () => {
      const rows = [makeRow({ code: 'kg' }), makeRow({ id: 'cat-2', code: 'g' })];
      repo.find.mockResolvedValue(rows);

      const result = await service.list(CATALOG_TYPE.UOM, 'tenant-A');

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: 'tenant-A',
            catalog_type: CATALOG_TYPE.UOM,
            is_active: true,
          }),
        }),
      );
      expect(result).toEqual(rows);
      expect(queryRunner.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-A'],
      );
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('includes inactive values when requested', async () => {
      repo.find.mockResolvedValue([]);
      await service.list(CATALOG_TYPE.UOM, 'tenant-A', true);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ is_active: expect.any(Boolean) }),
        }),
      );
    });
  });

  describe('create', () => {
    it('fails closed when tenant context is missing', async () => {
      await expect(
        service.create(CATALOG_TYPE.UOM, '   ', {
          code: 'kg',
          name: 'Kilogramo',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(queryRunner.query).not.toHaveBeenCalled();
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('creates a new catalog value', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.create(CATALOG_TYPE.UOM, 'tenant-A', {
        code: 'kg',
        name: 'Kilogramo',
      });

      expect(result.code).toBe('kg');
      expect(repo.save).toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate (tenant, type, code)', async () => {
      repo.findOne.mockResolvedValue(makeRow());
      await expect(
        service.create(CATALOG_TYPE.UOM, 'tenant-A', {
          code: 'kg',
          name: 'Kilogramo',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the value does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.update(CATALOG_TYPE.UOM, 'missing', 'tenant-A', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates editable fields but never the code', async () => {
      const row = makeRow();
      repo.findOne.mockResolvedValue(row);
      await service.update(CATALOG_TYPE.UOM, 'cat-1', 'tenant-A', {
        name: 'Kilo',
        is_active: false,
        sort_order: 5,
      });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Kilo', is_active: false, sort_order: 5, code: 'kg' }),
      );
    });
  });

  describe('deactivate', () => {
    it('soft-deactivates instead of deleting', async () => {
      const row = makeRow({ is_active: true });
      repo.findOne.mockResolvedValue(row);
      await service.deactivate(CATALOG_TYPE.UOM, 'cat-1', 'tenant-A');
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false }),
      );
    });
  });

  describe('seedDefaults', () => {
    it('inserts missing defaults and skips existing codes (idempotent)', async () => {
      // Tenant already has "kg" for UOM; seed should skip it and insert the rest.
      repo.find.mockResolvedValue([makeRow({ code: 'kg' })]);

      const inserted = await service.seedDefaults('tenant-A');

      // UOM defaults (14) - 1 existing = 13, plus all other catalogs unchanged.
      const expectedUom = DEFAULT_CATALOG_SEED.UOM.length - 1;
      const expectedOther =
        DEFAULT_CATALOG_SEED.INVENTORY_CATEGORY.length +
        DEFAULT_CATALOG_SEED.INVENTORY_TYPE.length +
        DEFAULT_CATALOG_SEED.SALES_PRODUCT_CATEGORY.length +
        DEFAULT_CATALOG_SEED.SALES_PRODUCT_TYPE.length;
      expect(inserted).toBe(expectedUom + expectedOther);
      expect(repo.save).toHaveBeenCalled();
    });

    it('inserts nothing when everything already exists', async () => {
      const allCodes: CatalogValue[] = [];
      for (const type of Object.keys(DEFAULT_CATALOG_SEED) as Array<
        keyof typeof DEFAULT_CATALOG_SEED
      >) {
        for (const d of DEFAULT_CATALOG_SEED[type]) {
          allCodes.push(
            makeRow({ catalog_type: type, code: d.code, name: d.name }),
          );
        }
      }
      repo.find.mockResolvedValue(allCodes);
      expect(await service.seedDefaults('tenant-A')).toBe(0);
    });
  });

  describe('resolveType', () => {
    it('returns the type for a known catalog type', () => {
      expect(CatalogService.resolveType('UOM')).toBe(CATALOG_TYPE.UOM);
    });

    it('throws NotFoundException for an unknown type', () => {
      expect(() => CatalogService.resolveType('NOPE')).toThrow(NotFoundException);
    });
  });
});
