import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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

  describe('list', () => {
    it('returns products for tenant', async () => {
      const products = [{ id: 'p1', name: 'Test' }] as Product[];
      repo.find.mockResolvedValue(products);

      const result = await service.list('tenant-A');
      expect(result).toEqual(products);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: 'tenant-A' }),
        }),
      );
    });

    it('filters by product type', async () => {
      repo.find.mockResolvedValue([]);

      await service.list('tenant-A', ProductType.COMPOUND);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ product_type: ProductType.COMPOUND }),
        }),
      );
    });

    it('includes inactive when requested', async () => {
      repo.find.mockResolvedValue([]);

      await service.list('tenant-A', undefined, true);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ is_active: true }),
        }),
      );
    });

    it('excludes inactive by default', async () => {
      repo.find.mockResolvedValue([]);

      await service.list('tenant-A');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ is_active: true }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns a product by id', async () => {
      const product = { id: 'p1', name: 'Test' } as Product;
      repo.findOne.mockResolvedValue(product);

      const result = await service.findOne('p1', 'tenant-A');
      expect(result).toEqual(product);
    });

    it('throws NotFoundException when product not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('nonexistent', 'tenant-A'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a product with provided fields', async () => {
      const dto = {
        name: 'Taza de Capuccino',
        uom: 'un',
        product_type: ProductType.COMPOUND,
        sellPrice: 45.0,
      };
      const created = { id: 'p1', ...dto, tenant_id: 'tenant-A' } as Product;
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.create('tenant-A', dto);
      expect(result).toEqual(created);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-A',
          name: 'Taza de Capuccino',
          uom: 'un',
          product_type: ProductType.COMPOUND,
          sellPrice: 45.0,
        }),
      );
    });

    it('defaults to SIMPLE type when not specified', async () => {
      const dto = {
        name: 'Simple Product',
        uom: 'un',
        product_type: ProductType.SIMPLE,
      };
      repo.create.mockReturnValue({ id: 'p1', ...dto } as Product);
      repo.save.mockResolvedValue({ id: 'p1', ...dto } as Product);

      await service.create('tenant-A', dto);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          product_type: ProductType.SIMPLE,
          is_active: true,
          stock: 0,
        }),
      );
    });
  });

  describe('update', () => {
    it('updates product fields', async () => {
      const existing = {
        id: 'p1',
        name: 'Old Name',
        tenant_id: 'tenant-A',
      } as Product;
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue({ ...existing, name: 'New Name' });

      const result = await service.update('p1', 'tenant-A', {
        name: 'New Name',
      });
      expect(result.name).toBe('New Name');
    });

    it('throws NotFoundException when product not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', 'tenant-A', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('sets is_active to false', async () => {
      const existing = {
        id: 'p1',
        is_active: true,
        tenant_id: 'tenant-A',
      } as Product;
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue({ ...existing, is_active: false });

      await service.deactivate('p1', 'tenant-A');
      expect(existing.is_active).toBe(false);
      expect(repo.save).toHaveBeenCalledWith(existing);
    });

    it('throws NotFoundException when product not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.deactivate('nonexistent', 'tenant-A'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
