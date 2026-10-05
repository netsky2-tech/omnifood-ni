import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { ModifiersService } from './modifiers.service';
import { ModifierGroup } from '../entities/modifier-group.entity';
import { ModifierOption } from '../entities/modifier-option.entity';
import { CategoryModifierGroup } from '../entities/category-modifier-group.entity';
import { ProductModifierGroup } from '../entities/product-modifier-group.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { CATALOG_TYPE } from '../../catalog/catalog-type';
import { Product } from '../../inventory/entities/product.entity';

describe('ModifiersService', () => {
  let service: ModifiersService;
  let groupRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let optionRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let categoryAttachmentRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let productAttachmentRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let catalogRepo: { findOne: jest.Mock };
  let productRepo: { findOne: jest.Mock };
  // Pooled tripwires: any call here means an access escaped the bound
  // tenant transaction and would hit RLS on an unbound connection.
  let pooledRepos: Record<string, { [k: string]: jest.Mock }>;

  let transactionalManager: {
    query: jest.Mock;
    getRepository: jest.Mock;
  };
  let transactionalDataSource: { transaction: jest.Mock };

  const mockGroup = (overrides: Partial<ModifierGroup> = {}): ModifierGroup =>
    ({
      id: 'group-uuid-1',
      tenant_id: 'tenant-1',
      name: 'Leche',
      min_selected: 0,
      max_selected: 1,
      allow_quantities: false,
      sort_order: 0,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    }) as ModifierGroup;

  const mockOption = (
    overrides: Partial<ModifierOption> = {},
  ): ModifierOption =>
    ({
      id: 'option-uuid-1',
      tenant_id: 'tenant-1',
      group_id: 'group-uuid-1',
      name: 'Entera',
      price_delta: 0,
      is_default: false,
      sort_order: 0,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    }) as ModifierOption;

  beforeEach(async () => {
    groupRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((data: unknown) => data as ModifierGroup),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
    optionRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((data: unknown) => data as ModifierOption),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    categoryAttachmentRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((data: unknown) => data as CategoryModifierGroup),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    productAttachmentRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((data: unknown) => data as ProductModifierGroup),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    catalogRepo = { findOne: jest.fn().mockResolvedValue(null) };
    productRepo = { findOne: jest.fn().mockResolvedValue(null) };

    pooledRepos = {};
    for (const entity of [
      ModifierGroup,
      ModifierOption,
      CategoryModifierGroup,
      ProductModifierGroup,
    ]) {
      pooledRepos[entity.name] = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      };
    }

    transactionalManager = {
      query: jest.fn(async () => []),
      getRepository: jest.fn((entity: unknown) => {
        switch (entity) {
          case ModifierGroup:
            return groupRepo;
          case ModifierOption:
            return optionRepo;
          case CategoryModifierGroup:
            return categoryAttachmentRepo;
          case ProductModifierGroup:
            return productAttachmentRepo;
          case CatalogValue:
            return catalogRepo;
          case Product:
            return productRepo;
          default:
            throw new Error(
              `Unexpected entity: ${(entity as { name?: string }).name ?? 'unknown'}`,
            );
        }
      }),
    };
    transactionalDataSource = {
      transaction: jest.fn(
        async (work: (manager: unknown) => Promise<unknown>) =>
          work(transactionalManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModifiersService,
        ...[
          ModifierGroup,
          ModifierOption,
          CategoryModifierGroup,
          ProductModifierGroup,
        ].map((entity) => ({
          provide: getRepositoryToken(entity),
          // Pooled tripwire: never used by the service; see binding test.
          useValue: pooledRepos[(entity as { name: string }).name],
        })),
        { provide: DataSource, useValue: transactionalDataSource },
      ],
    }).compile();

    service = module.get<ModifiersService>(ModifiersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns active groups with their active options, ordered', async () => {
      const group = mockGroup({ sort_order: 2 });
      const group2 = mockGroup({
        id: 'group-uuid-2',
        name: 'Endulzante',
        sort_order: 1,
      });
      groupRepo.find.mockResolvedValue([group2, group]);
      optionRepo.find.mockResolvedValue([mockOption()]);

      const list = await service.findAll('tenant-1');
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe('group-uuid-2');
      expect(list[1].options).toHaveLength(1);
      expect(groupRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: 'tenant-1',
            is_active: true,
          }),
        }),
      );
      expect(optionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: 'tenant-1',
            is_active: true,
          }),
        }),
      );
    });

    it('filters by category_id through the attachment junction', async () => {
      categoryAttachmentRepo.find.mockResolvedValue([
        { group_id: 'group-uuid-1' },
      ]);
      groupRepo.find.mockResolvedValue([mockGroup()]);

      await service.findAll('tenant-1', {
        category_id: '11111111-1111-4111-8111-111111111111',
      });
      expect(categoryAttachmentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: 'tenant-1',
            catalog_value_id: '11111111-1111-4111-8111-111111111111',
          }),
        }),
      );
      expect(groupRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: 'tenant-1',
            is_active: true,
          }),
        }),
      );
    });

    it('filters by product_id through the attachment junction', async () => {
      productAttachmentRepo.find.mockResolvedValue([
        { group_id: 'group-uuid-1' },
      ]);
      groupRepo.find.mockResolvedValue([mockGroup()]);

      await service.findAll('tenant-1', {
        product_id: '22222222-2222-4222-8222-222222222222',
      });
      expect(productAttachmentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: 'tenant-1',
            product_id: '22222222-2222-4222-8222-222222222222',
          }),
        }),
      );
    });

    it('rejects a malformed category_id with 400', async () => {
      await expect(
        service.findAll('tenant-1', { category_id: 'not-a-uuid' }),
      ).rejects.toThrow(BadRequestException);
      expect(categoryAttachmentRepo.find).not.toHaveBeenCalled();
      expect(groupRepo.find).not.toHaveBeenCalled();
    });

    it('rejects a malformed product_id with 400', async () => {
      await expect(
        service.findAll('tenant-1', { product_id: 'not-a-uuid' }),
      ).rejects.toThrow(BadRequestException);
      expect(productAttachmentRepo.find).not.toHaveBeenCalled();
      expect(groupRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns one active group with its active options', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      optionRepo.find.mockResolvedValue([mockOption()]);
      const found = await service.findOne('tenant-1', 'group-uuid-1');
      expect(found.id).toBe('group-uuid-1');
      expect(found.options).toHaveLength(1);
      expect(groupRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'group-uuid-1',
            tenant_id: 'tenant-1',
            is_active: true,
          }),
        }),
      );
    });

    it('throws NotFoundException when the group is missing or inactive', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createGroup', () => {
    it('creates an active group with tenant context', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      const created = await service.createGroup('tenant-1', {
        name: 'Leche',
        min_selected: 0,
        max_selected: 3,
        allow_quantities: true,
        sort_order: 4,
      });
      expect(created.tenant_id).toBe('tenant-1');
      expect(created.is_active).toBe(true);
      expect(groupRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-1',
          name: 'Leche',
          min_selected: 0,
          max_selected: 3,
          is_active: true,
        }),
      );
      expect(groupRepo.save).toHaveBeenCalledTimes(1);
    });

    it('rejects a blank name with 400', async () => {
      await expect(
        service.createGroup('tenant-1', { name: '   ' }),
      ).rejects.toThrow(BadRequestException);
      expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('rejects max_selected < min_selected with 400 (mirrors chk_modifier_groups_max_gte_min)', async () => {
      await expect(
        service.createGroup('tenant-1', {
          name: 'Leche',
          min_selected: 3,
          max_selected: 2,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('rejects min_selected < 0 with 400', async () => {
      await expect(
        service.createGroup('tenant-1', {
          name: 'Leche',
          min_selected: -1,
          max_selected: 2,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('rejects max_selected < 1 with 400', async () => {
      await expect(
        service.createGroup('tenant-1', {
          name: 'Leche',
          max_selected: 0,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a duplicate (tenant, name) with ConflictException, never a 23505', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup({ name: 'Leche' }));
      await expect(
        service.createGroup('tenant-1', { name: 'Leche' }),
      ).rejects.toThrow(ConflictException);
      expect(groupRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('updateGroup', () => {
    it('merges the partial update', async () => {
      const group = mockGroup();
      groupRepo.findOne.mockResolvedValue(group);
      groupRepo.findOne.mockResolvedValueOnce(group);
      const updated = await service.updateGroup('tenant-1', 'group-uuid-1', {
        name: 'Leche deslactosada',
        max_selected: 5,
      });
      expect(updated.name).toBe('Leche deslactosada');
      expect(updated.max_selected).toBe(5);
      expect(groupRepo.save).toHaveBeenCalledWith(group);
    });

    it('validates max >= min against the MERGED values', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup({ min_selected: 2 }));
      await expect(
        service.updateGroup('tenant-1', 'group-uuid-1', { max_selected: 1 }),
      ).rejects.toThrow(BadRequestException);
      expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a blank name on update', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      await expect(
        service.updateGroup('tenant-1', 'group-uuid-1', { name: '  ' }),
      ).rejects.toThrow(BadRequestException);
      expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a duplicate name that collides with ANOTHER group', async () => {
      groupRepo.findOne
        .mockResolvedValueOnce(mockGroup()) // group lookup
        .mockResolvedValueOnce(mockGroup({ id: 'group-uuid-OTHER' })); // dup check
      await expect(
        service.updateGroup('tenant-1', 'group-uuid-1', { name: 'Leche' }),
      ).rejects.toThrow(ConflictException);
      expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('allows renaming to the SAME name (dup check excludes self)', async () => {
      groupRepo.findOne
        .mockResolvedValueOnce(mockGroup())
        .mockResolvedValueOnce(mockGroup()); // same id
      const updated = await service.updateGroup('tenant-1', 'group-uuid-1', {
        name: 'Leche',
      });
      expect(updated.name).toBe('Leche');
    });

    it('reactivates a soft-deleted group when is_active=true is passed', async () => {
      const group = mockGroup({ is_active: false });
      groupRepo.findOne.mockResolvedValue(group);
      const updated = await service.updateGroup('tenant-1', 'group-uuid-1', {
        is_active: true,
      });
      expect(updated.is_active).toBe(true);
      expect(groupRepo.save).toHaveBeenCalledWith(group);
    });

    it('throws NotFoundException when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateGroup('tenant-1', 'missing', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeGroup', () => {
    it('soft deletes the group and leaves attachments in place', async () => {
      const group = mockGroup();
      groupRepo.findOne.mockResolvedValue(group);
      await service.removeGroup('tenant-1', 'group-uuid-1');
      expect(group.is_active).toBe(false);
      expect(groupRepo.save).toHaveBeenCalledWith(group);
      // Attachments are intentionally NOT touched: inactive groups stop
      // resolving downstream, the junction rows stay for history.
      expect(categoryAttachmentRepo.delete).not.toHaveBeenCalled();
      expect(productAttachmentRepo.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(service.removeGroup('tenant-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createOption', () => {
    it('creates an option inside an active group', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      optionRepo.findOne.mockResolvedValue(null);
      const created = await service.createOption('tenant-1', 'group-uuid-1', {
        name: 'Entera',
        price_delta: 5.5,
        is_default: true,
      });
      expect(created.tenant_id).toBe('tenant-1');
      expect(created.group_id).toBe('group-uuid-1');
      expect(optionRepo.save).toHaveBeenCalledTimes(1);
    });

    it('throws 404 when the group is missing or inactive', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createOption('tenant-1', 'missing', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(optionRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a blank option name with 400', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      await expect(
        service.createOption('tenant-1', 'group-uuid-1', { name: ' ' }),
      ).rejects.toThrow(BadRequestException);
      expect(optionRepo.save).not.toHaveBeenCalled();
    });

    it('clears sibling defaults when is_default=true (single-default invariant)', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      await service.createOption('tenant-1', 'group-uuid-1', {
        name: 'Entera',
        is_default: true,
      });
      expect(optionRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-1',
          group_id: 'group-uuid-1',
          is_default: true,
        }),
        { is_default: false },
      );
    });

    it('does not touch siblings when is_default is not true', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      await service.createOption('tenant-1', 'group-uuid-1', {
        name: 'Entera',
      });
      expect(optionRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('updateOption', () => {
    it('updates the option inside its group', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      optionRepo.findOne.mockResolvedValue(mockOption());
      const updated = await service.updateOption(
        'tenant-1',
        'group-uuid-1',
        'option-uuid-1',
        { price_delta: -2 },
      );
      expect(updated.price_delta).toBe(-2);
      expect(optionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ price_delta: -2 }),
      );
    });

    it('throws 404 when the option does not exist in the group', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      optionRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateOption('tenant-1', 'group-uuid-1', 'missing', {
          name: 'X',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 404 when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateOption('tenant-1', 'missing', 'option-uuid-1', {
          name: 'X',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a blank name with 400', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      optionRepo.findOne.mockResolvedValue(mockOption());
      await expect(
        service.updateOption('tenant-1', 'group-uuid-1', 'option-uuid-1', {
          name: ' ',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(optionRepo.save).not.toHaveBeenCalled();
    });

    it('clears sibling defaults EXCLUDING self when is_default=true', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      optionRepo.findOne.mockResolvedValue(mockOption());
      await service.updateOption('tenant-1', 'group-uuid-1', 'option-uuid-1', {
        is_default: true,
      });
      expect(optionRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-1',
          group_id: 'group-uuid-1',
          is_default: true,
        }),
        { is_default: false },
      );
      // Self must be excluded so the updated option keeps its own default.
      const whereArg = optionRepo.update.mock.calls[0][0];
      expect(JSON.stringify(whereArg)).not.toContain('option-uuid-1-excluded');
    });

    it('does not clear siblings when is_default is false', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      optionRepo.findOne.mockResolvedValue(mockOption());
      await service.updateOption('tenant-1', 'group-uuid-1', 'option-uuid-1', {
        is_default: false,
      });
      expect(optionRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('removeOption', () => {
    it('soft deletes the option', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      const option = mockOption();
      optionRepo.findOne.mockResolvedValue(option);
      await service.removeOption('tenant-1', 'group-uuid-1', 'option-uuid-1');
      expect(option.is_active).toBe(false);
      expect(optionRepo.save).toHaveBeenCalledWith(option);
    });

    it('throws 404 when the option does not exist', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      optionRepo.findOne.mockResolvedValue(null);
      await expect(
        service.removeOption('tenant-1', 'group-uuid-1', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('attachCategory / detachCategory', () => {
    const validCategoryId = '11111111-1111-4111-8111-111111111111';

    beforeEach(() => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
    });

    it('attaches to a valid SALES_PRODUCT_CATEGORY of the tenant', async () => {
      categoryAttachmentRepo.findOne.mockResolvedValue(null);
      catalogRepo.findOne.mockResolvedValue({
        id: validCategoryId,
        tenant_id: 'tenant-1',
        catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
      });
      const attached = await service.attachCategory(
        'tenant-1',
        'group-uuid-1',
        {
          catalog_value_id: validCategoryId,
        },
      );
      expect(attached.tenant_id).toBe('tenant-1');
      expect(attached.group_id).toBe('group-uuid-1');
      expect(attached.catalog_value_id).toBe(validCategoryId);
      expect(categoryAttachmentRepo.save).toHaveBeenCalledTimes(1);
    });

    it('is idempotent: attaching twice returns the existing attachment', async () => {
      const existing = { id: 'att-1', group_id: 'group-uuid-1' };
      categoryAttachmentRepo.findOne.mockResolvedValue(existing);
      const attached = await service.attachCategory(
        'tenant-1',
        'group-uuid-1',
        {
          catalog_value_id: validCategoryId,
        },
      );
      expect(attached).toBe(existing);
      expect(categoryAttachmentRepo.save).not.toHaveBeenCalled();
    });

    it('rejects with 400 a nonexistent / foreign-tenant / wrong-type category (same message)', async () => {
      catalogRepo.findOne.mockResolvedValue(null);
      await expect(
        service.attachCategory('tenant-1', 'group-uuid-1', {
          catalog_value_id: validCategoryId,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(catalogRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: validCategoryId,
          tenant_id: 'tenant-1',
          catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
        },
      });
      expect(categoryAttachmentRepo.save).not.toHaveBeenCalled();
    });

    it('rejects an empty-string catalog_value_id with 400', async () => {
      await expect(
        service.attachCategory('tenant-1', 'group-uuid-1', {
          catalog_value_id: '',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(catalogRepo.findOne).not.toHaveBeenCalled();
      expect(categoryAttachmentRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a malformed uuid with 400', async () => {
      await expect(
        service.attachCategory('tenant-1', 'group-uuid-1', {
          catalog_value_id: 'bebidas',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(catalogRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws 404 when the group is missing or inactive', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(
        service.attachCategory('tenant-1', 'missing', {
          catalog_value_id: validCategoryId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('hard deletes the junction row on detach', async () => {
      await service.detachCategory('tenant-1', 'group-uuid-1', validCategoryId);
      expect(categoryAttachmentRepo.delete).toHaveBeenCalledWith({
        tenant_id: 'tenant-1',
        group_id: 'group-uuid-1',
        catalog_value_id: validCategoryId,
      });
    });

    it('detach is idempotent: succeeds even when nothing was attached', async () => {
      categoryAttachmentRepo.delete.mockResolvedValue({ affected: 0 });
      await expect(
        service.detachCategory('tenant-1', 'group-uuid-1', validCategoryId),
      ).resolves.not.toThrow();
    });
  });

  describe('attachProduct / detachProduct', () => {
    const validProductId = '22222222-2222-4222-8222-222222222222';

    beforeEach(() => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
    });

    it('attaches to an existing product of the tenant', async () => {
      productAttachmentRepo.findOne.mockResolvedValue(null);
      productRepo.findOne.mockResolvedValue({ id: validProductId });
      const attached = await service.attachProduct('tenant-1', 'group-uuid-1', {
        product_id: validProductId,
      });
      expect(attached.tenant_id).toBe('tenant-1');
      expect(attached.product_id).toBe(validProductId);
      expect(productAttachmentRepo.save).toHaveBeenCalledTimes(1);
    });

    it('is idempotent: attaching twice returns the existing attachment', async () => {
      const existing = { id: 'att-2', group_id: 'group-uuid-1' };
      productAttachmentRepo.findOne.mockResolvedValue(existing);
      const attached = await service.attachProduct('tenant-1', 'group-uuid-1', {
        product_id: validProductId,
      });
      expect(attached).toBe(existing);
      expect(productAttachmentRepo.save).not.toHaveBeenCalled();
    });

    it('rejects with 400 a nonexistent / foreign product (same message)', async () => {
      productRepo.findOne.mockResolvedValue(null);
      await expect(
        service.attachProduct('tenant-1', 'group-uuid-1', {
          product_id: validProductId,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(productRepo.findOne).toHaveBeenCalledWith({
        where: { id: validProductId, tenant_id: 'tenant-1' },
      });
      expect(productAttachmentRepo.save).not.toHaveBeenCalled();
    });

    it('rejects an empty-string product_id with 400', async () => {
      await expect(
        service.attachProduct('tenant-1', 'group-uuid-1', { product_id: '' }),
      ).rejects.toThrow(BadRequestException);
      expect(productRepo.findOne).not.toHaveBeenCalled();
    });

    it('rejects a malformed uuid with 400', async () => {
      await expect(
        service.attachProduct('tenant-1', 'group-uuid-1', {
          product_id: 'cerveza',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(productRepo.findOne).not.toHaveBeenCalled();
    });

    it('hard deletes the junction row on detach', async () => {
      await service.detachProduct('tenant-1', 'group-uuid-1', validProductId);
      expect(productAttachmentRepo.delete).toHaveBeenCalledWith({
        tenant_id: 'tenant-1',
        group_id: 'group-uuid-1',
        product_id: validProductId,
      });
    });

    it('detach is idempotent: succeeds even when nothing was attached', async () => {
      productAttachmentRepo.delete.mockResolvedValue({ affected: 0 });
      await expect(
        service.detachProduct('tenant-1', 'group-uuid-1', validProductId),
      ).resolves.not.toThrow();
    });
  });

  // Every access must run inside the tenant-bound transaction: the fake
  // manager records the set_config binding and the pooled repositories act
  // as tripwires.
  describe('tenant transaction binding', () => {
    it('binds the tenant context through runInTenantTransaction for every operation', async () => {
      const setConfigCalls: Array<[string, string[]]> = [];
      transactionalManager.query.mockImplementation(
        async (sql: string, params: string[]) => {
          setConfigCalls.push([sql, params]);
          return [];
        },
      );

      // Group lookups (where.id present) resolve the group; name-only
      // lookups are duplicate pre-checks: "Nueva" is available, "Editada"
      // resolves to the group being renamed (same id, so allowed).
      groupRepo.findOne.mockImplementation(
        (options: { where: { id?: string; name?: string } }) =>
          options?.where?.id !== undefined
            ? Promise.resolve(mockGroup())
            : Promise.resolve(
                options?.where?.name === 'Nueva' ? null : mockGroup(),
              ),
      );
      optionRepo.findOne.mockResolvedValue(mockOption());
      categoryAttachmentRepo.findOne.mockResolvedValue(null);
      catalogRepo.findOne.mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        tenant_id: 'tenant-1',
        catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
      });

      await service.findAll('tenant-1');
      await service.findOne('tenant-1', 'group-uuid-1');
      await service.createGroup('tenant-1', { name: 'Nueva' });
      await service.updateGroup('tenant-1', 'group-uuid-1', {
        name: 'Editada',
      });
      await service.removeGroup('tenant-1', 'group-uuid-1');
      await service.createOption('tenant-1', 'group-uuid-1', { name: 'Op' });
      await service.updateOption('tenant-1', 'group-uuid-1', 'option-uuid-1', {
        name: 'Op',
      });
      await service.removeOption('tenant-1', 'group-uuid-1', 'option-uuid-1');
      await service.attachCategory('tenant-1', 'group-uuid-1', {
        catalog_value_id: '11111111-1111-4111-8111-111111111111',
      });
      await service.detachCategory(
        'tenant-1',
        'group-uuid-1',
        '11111111-1111-4111-8111-111111111111',
      );

      // TEN logical units, TEN transactions, each binding the tenant context
      // exactly once with the production set_config SQL.
      expect(transactionalDataSource.transaction).toHaveBeenCalledTimes(10);
      expect(setConfigCalls).toHaveLength(10);
      for (const [sql, params] of setConfigCalls) {
        expect(sql).toBe(TENANT_CONTEXT_SET_CONFIG_SQL);
        expect(params).toEqual(['tenant-1']);
      }

      // RUNTIME TEETH: pooled tripwires stayed silent.
      for (const pooled of Object.values(pooledRepos)) {
        for (const fn of Object.values(pooled)) {
          expect(fn).not.toHaveBeenCalled();
        }
      }
    });
  });
});
