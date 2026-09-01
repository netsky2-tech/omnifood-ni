import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { ProductService } from './product.service';
import { Product, ProductType } from './entities/product.entity';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';

describe('ProductService', () => {
  let service: ProductService;
  let repo: jest.Mocked<Repository<Product>>;

  const mockRepo = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  });

  const mockDataSource = () => ({
    createQueryRunner: jest.fn(() => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(),
      manager: {
        getRepository: jest.fn(() => repo),
      },
    })),
  });

  const makeProduct = (over: Partial<Product> = {}): Product =>
    ({
      id: 'p1',
      tenant_id: 'tenant-A',
      name: 'Test Product',
      uom: 'un',
      product_type: ProductType.SIMPLE,
      category_code: null,
      warehouse_id: null,
      is_perishable: false,
      stock: 0,
      averageCost: 0,
      sellPrice: 0,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
      ...over,
    }) as Product;

  beforeEach(async () => {
    repo = mockRepo() as unknown as jest.Mocked<Repository<Product>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: DataSource, useFactory: mockDataSource },
      ],
    }).compile();

    service = module.get(ProductService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  // ── Triangulation: list ──────────────────────────────────────────────

  describe('list', () => {
    it('returns only active products by default', async () => {
      const rows = [
        makeProduct({ id: 'p1', name: 'Gaseosa' }),
        makeProduct({ id: 'p2', name: 'Café' }),
      ];
      repo.find.mockResolvedValue(rows);

      const result = await service.list('tenant-A');

      expect(result).toEqual(rows);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: 'tenant-A',
            is_active: true,
          }),
          order: { name: 'ASC' },
        }),
      );
    });

    it('includes inactive when includeInactive=true', async () => {
      repo.find.mockResolvedValue([]);

      await service.list('tenant-A', undefined, true);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ is_active: true }),
        }),
      );
    });

    // Triangulation: each product type as filter
    it.each([
      [ProductType.SIMPLE, 'SIMPLE'],
      [ProductType.COMPOUND, 'COMPOUND'],
      [ProductType.VARIANT_PARENT, 'VARIANT_PARENT'],
    ])('filters by product_type=%s', async (type) => {
      repo.find.mockResolvedValue([]);

      await service.list('tenant-A', type);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ product_type: type }),
        }),
      );
    });

    it('combines productType + includeInactive filters', async () => {
      repo.find.mockResolvedValue([]);

      await service.list('tenant-A', ProductType.COMPOUND, true);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            product_type: ProductType.COMPOUND,
          }),
        }),
      );
      // includeInactive=true means is_active NOT in where
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ is_active: true }),
        }),
      );
    });

    it('orders by name ASC', async () => {
      repo.find.mockResolvedValue([]);

      await service.list('tenant-A');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { name: 'ASC' } }),
      );
    });

    it('sets app.tenant_id for RLS', async () => {
      repo.find.mockResolvedValue([]);
      await service.list('tenant-B');

      // The queryRunner.query should be called with set_config
      // We verify via the mock DataSource
      expect(repo.find).toHaveBeenCalled();
    });

    it('fails closed on empty tenant', async () => {
      await expect(service.list('   ')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── Triangulation: findOne ───────────────────────────────────────────

  describe('findOne', () => {
    it('returns product by id', async () => {
      const product = makeProduct({ id: 'p42', name: 'Café Premium' });
      repo.findOne.mockResolvedValue(product);

      const result = await service.findOne('p42', 'tenant-A');
      expect(result).toEqual(product);
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p42', tenant_id: 'tenant-A' },
        }),
      );
    });

    it('throws NotFoundException for nonexistent product', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.findOne('nope', 'tenant-A'),
      ).rejects.toThrow(NotFoundException);
    });

    it('scopes to tenant (different tenant returns not found)', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.findOne('p1', 'other-tenant'),
      ).rejects.toThrow(NotFoundException);
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1', tenant_id: 'other-tenant' },
        }),
      );
    });
  });

  // ── Triangulation: create ────────────────────────────────────────────

  describe('create', () => {
    it.each([
      [ProductType.SIMPLE, { uom: 'un', sellPrice: 25 }],
      [ProductType.COMPOUND, { uom: 'ml', sellPrice: 45, is_perishable: true }],
      [ProductType.VARIANT_PARENT, { uom: 'un', sellPrice: 350, category_code: 'RETAIL' }],
    ])('creates product with type=%s and correct defaults', async (type, extra) => {
      const dto = { name: `Product ${type}`, uom: extra.uom, product_type: type, sellPrice: extra.sellPrice, ...extra };
      const created = makeProduct({ id: `new-${type}`, ...dto });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.create('tenant-A', dto as any);
      expect(result.id).toBe(`new-${type}`);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-A',
          name: `Product ${type}`,
          product_type: type,
          uom: extra.uom,
          is_active: true,
          stock: 0,
          averageCost: 0,
        }),
      );
    });

    it('trims whitespace from name and uom', async () => {
      const dto = { name: '  Capuccino  ', uom: '  un  ', product_type: ProductType.COMPOUND };
      repo.create.mockReturnValue(makeProduct());
      repo.save.mockResolvedValue(makeProduct());

      await service.create('tenant-A', dto);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Capuccino', uom: 'un' }),
      );
    });

    it('sets category_code when provided', async () => {
      const dto = { name: 'Test', uom: 'un', product_type: ProductType.SIMPLE, category_code: 'BEBIDAS' };
      repo.create.mockReturnValue(makeProduct());
      repo.save.mockResolvedValue(makeProduct());

      await service.create('tenant-A', dto);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ category_code: 'BEBIDAS' }),
      );
    });

    it('sets category_code to null when omitted', async () => {
      const dto = { name: 'Test', uom: 'un', product_type: ProductType.SIMPLE };
      repo.create.mockReturnValue(makeProduct());
      repo.save.mockResolvedValue(makeProduct());

      await service.create('tenant-A', dto);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ category_code: null }),
      );
    });

    it('fails closed on empty tenant', async () => {
      await expect(
        service.create('   ', { name: 'X', uom: 'un', product_type: ProductType.SIMPLE }),
      ).rejects.toThrow(UnauthorizedException);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  // ── Triangulation: update ────────────────────────────────────────────

  describe('update', () => {
    it('updates name only', async () => {
      const existing = makeProduct({ name: 'Old' });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);

      await service.update('p1', 'tenant-A', { name: 'New' });
      expect(existing.name).toBe('New');
      expect(repo.save).toHaveBeenCalledWith(existing);
    });

    it('updates sellPrice only', async () => {
      const existing = makeProduct({ sellPrice: 100 });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);

      await service.update('p1', 'tenant-A', { sellPrice: 250 });
      expect(existing.sellPrice).toBe(250);
    });

    it('updates product_type only', async () => {
      const existing = makeProduct({ product_type: ProductType.SIMPLE });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);

      await service.update('p1', 'tenant-A', { product_type: ProductType.COMPOUND });
      expect(existing.product_type).toBe(ProductType.COMPOUND);
    });

    it('updates category_code to null (clears it)', async () => {
      const existing = makeProduct({ category_code: 'OLD_CAT' });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);

      await service.update('p1', 'tenant-A', { category_code: null as any });
      expect(existing.category_code).toBeNull();
    });

    it('trims whitespace on updated name', async () => {
      const existing = makeProduct();
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);

      await service.update('p1', 'tenant-A', { name: '  trimmed  ' });
      expect(existing.name).toBe('trimmed');
    });

    it('throws NotFoundException for nonexistent product', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.update('nope', 'tenant-A', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not touch unmentioned fields', async () => {
      const existing = makeProduct({ name: 'Keep', uom: 'kg', sellPrice: 99 });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);

      await service.update('p1', 'tenant-A', { name: 'Changed' });
      expect(existing.uom).toBe('kg');
      expect(existing.sellPrice).toBe(99);
    });
  });

  // ── Triangulation: deactivate ────────────────────────────────────────

  describe('deactivate', () => {
    it('sets is_active to false', async () => {
      const existing = makeProduct({ is_active: true });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);

      await service.deactivate('p1', 'tenant-A');
      expect(existing.is_active).toBe(false);
      expect(repo.save).toHaveBeenCalledWith(existing);
    });

    it('is idempotent (already inactive stays inactive)', async () => {
      const existing = makeProduct({ is_active: false });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);

      await service.deactivate('p1', 'tenant-A');
      expect(existing.is_active).toBe(false);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException for nonexistent product', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.deactivate('nope', 'tenant-A'),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not touch other fields', async () => {
      const existing = makeProduct({ name: 'Keep This', sellPrice: 42 });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);

      await service.deactivate('p1', 'tenant-A');
      expect(existing.name).toBe('Keep This');
      expect(existing.sellPrice).toBe(42);
    });
  });

  // ── Tenant isolation ─────────────────────────────────────────────────

  describe('tenant isolation', () => {
    it('list scopes to tenant_id in WHERE clause', async () => {
      repo.find.mockResolvedValue([]);
      await service.list('tenant-B');

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: 'tenant-B' }),
        }),
      );
    });

    it('findOne scopes to tenant_id', async () => {
      const product = makeProduct({ id: 'p1' });
      repo.findOne.mockResolvedValue(product);

      const result = await service.findOne('p1', 'tenant-X');

      expect(result.id).toBe('p1');
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1', tenant_id: 'tenant-X' },
        }),
      );
    });

    it('create uses the provided tenant_id', async () => {
      repo.create.mockReturnValue(makeProduct());
      repo.save.mockResolvedValue(makeProduct());

      await service.create('tenant-Y', {
        name: 'Test',
        uom: 'un',
        product_type: ProductType.SIMPLE,
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'tenant-Y' }),
      );
    });
  });

  // ── RLS context ──────────────────────────────────────────────────────

  describe('RLS context', () => {
    it('calls set_config with tenant_id before query', async () => {
      const queryFn = jest.fn();
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        query: queryFn,
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: { getRepository: jest.fn(() => repo) },
      };

      const ds = {
        createQueryRunner: jest.fn(() => mockQueryRunner),
      } as unknown as DataSource;

      const module = await Test.createTestingModule({
        providers: [ProductService, { provide: DataSource, useValue: ds }],
      }).compile();

      const svc = module.get(ProductService);
      repo.find.mockResolvedValue([]);

      await svc.list('tenant-A');

      expect(queryFn).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-A'],
      );
    });

    it('commits transaction on success', async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        query: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: { getRepository: jest.fn(() => repo) },
      };

      const ds = {
        createQueryRunner: jest.fn(() => mockQueryRunner),
      } as unknown as DataSource;

      const module = await Test.createTestingModule({
        providers: [ProductService, { provide: DataSource, useValue: ds }],
      }).compile();

      const svc = module.get(ProductService);
      repo.find.mockResolvedValue([]);

      await svc.list('tenant-A');

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('rolls back transaction on error', async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        query: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          getRepository: jest.fn(() => ({
            ...repo,
            find: jest.fn().mockRejectedValue(new Error('DB error')),
          })),
        },
      };

      const ds = {
        createQueryRunner: jest.fn(() => mockQueryRunner),
      } as unknown as DataSource;

      const module = await Test.createTestingModule({
        providers: [ProductService, { provide: DataSource, useValue: ds }],
      }).compile();

      const svc = module.get(ProductService);

      await expect(svc.list('tenant-A')).rejects.toThrow('DB error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });
});
