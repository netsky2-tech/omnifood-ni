import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import { ModifiersController } from './modifiers.controller';
import { ModifiersService } from '../services/modifiers.service';
import { ModifierGroup } from '../entities/modifier-group.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { UserRole } from '../../identity/entities/user.entity';
import { ROLES_KEY } from '../../../core/decorators/roles.decorator';

describe('ModifiersController', () => {
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';
  let controller: ModifiersController;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    createGroup: jest.Mock;
    updateGroup: jest.Mock;
    removeGroup: jest.Mock;
    createOption: jest.Mock;
    updateOption: jest.Mock;
    removeOption: jest.Mock;
    attachCategory: jest.Mock;
    detachCategory: jest.Mock;
    attachProduct: jest.Mock;
    detachProduct: jest.Mock;
  };

  const mockGroup = (overrides: Partial<ModifierGroup> = {}): ModifierGroup =>
    ({
      id: 'group-1',
      tenant_id: 'tenant-1',
      name: 'Leche',
      min_selected: 0,
      max_selected: 1,
      allow_quantities: false,
      sort_order: 0,
      is_active: true,
      options: [],
      ...overrides,
    }) as ModifierGroup;

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([mockGroup()]),
      findOne: jest.fn().mockResolvedValue(mockGroup()),
      createGroup: jest.fn().mockResolvedValue(mockGroup()),
      updateGroup: jest.fn().mockResolvedValue(mockGroup({ name: 'Editada' })),
      removeGroup: jest.fn().mockResolvedValue(undefined),
      createOption: jest.fn().mockResolvedValue({ id: 'option-1' }),
      updateOption: jest
        .fn()
        .mockResolvedValue({ id: 'option-1', name: 'Editada' }),
      removeOption: jest.fn().mockResolvedValue(undefined),
      attachCategory: jest.fn().mockResolvedValue({ id: 'att-1' }),
      detachCategory: jest.fn().mockResolvedValue(undefined),
      attachProduct: jest.fn().mockResolvedValue({ id: 'att-2' }),
      detachProduct: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      controllers: [ModifiersController],
      providers: [
        Reflector,
        {
          provide: ModifiersService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ModifiersController>(ModifiersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('maps findAll with optional filters to the service', async () => {
    const list = await controller.findAll('tenant-1', 'cat-uuid', 'prod-uuid');
    expect(list).toHaveLength(1);
    expect(service.findAll).toHaveBeenCalledWith('tenant-1', {
      category_id: 'cat-uuid',
      product_id: 'prod-uuid',
    });
  });

  it('maps findAll without filters', async () => {
    await controller.findAll('tenant-1', undefined, undefined);
    expect(service.findAll).toHaveBeenCalledWith('tenant-1', {
      category_id: undefined,
      product_id: undefined,
    });
  });

  it('maps findOne to the service', async () => {
    const group = await controller.findOne('group-1', 'tenant-1');
    expect(group.id).toBe('group-1');
    expect(service.findOne).toHaveBeenCalledWith('tenant-1', 'group-1');
  });

  it('maps createGroup to the service', async () => {
    const dto = { name: 'Leche', max_selected: 2 };
    await controller.createGroup(dto, 'tenant-1');
    expect(service.createGroup).toHaveBeenCalledWith('tenant-1', dto);
  });

  it('maps updateGroup to the service', async () => {
    const dto = { name: 'Editada' };
    await controller.updateGroup('group-1', dto, 'tenant-1');
    expect(service.updateGroup).toHaveBeenCalledWith(
      'tenant-1',
      'group-1',
      dto,
    );
  });

  it('maps removeGroup to the service and returns success', async () => {
    const res = await controller.removeGroup('group-1', 'tenant-1');
    expect(res.success).toBe(true);
    expect(service.removeGroup).toHaveBeenCalledWith('tenant-1', 'group-1');
  });

  it('maps createOption to the service', async () => {
    const dto = { name: 'Entera' };
    await controller.createOption('group-1', dto, 'tenant-1');
    expect(service.createOption).toHaveBeenCalledWith(
      'tenant-1',
      'group-1',
      dto,
    );
  });

  it('maps updateOption to the service', async () => {
    const dto = { name: 'Deslactosada' };
    await controller.updateOption('group-1', 'option-1', dto, 'tenant-1');
    expect(service.updateOption).toHaveBeenCalledWith(
      'tenant-1',
      'group-1',
      'option-1',
      dto,
    );
  });

  it('maps removeOption to the service and returns success', async () => {
    const res = await controller.removeOption(
      'group-1',
      'option-1',
      'tenant-1',
    );
    expect(res.success).toBe(true);
    expect(service.removeOption).toHaveBeenCalledWith(
      'tenant-1',
      'group-1',
      'option-1',
    );
  });

  it('maps attachCategory to the service', async () => {
    const dto = { catalog_value_id: 'cat-uuid' };
    const attached = await controller.attachCategory(
      'group-1',
      dto,
      'tenant-1',
    );
    expect(attached).toBeDefined();
    expect(service.attachCategory).toHaveBeenCalledWith(
      'tenant-1',
      'group-1',
      dto,
    );
  });

  it('maps detachCategory to the service and returns success', async () => {
    const res = await controller.detachCategory(
      'group-1',
      'cat-uuid',
      'tenant-1',
    );
    expect(res.success).toBe(true);
    expect(service.detachCategory).toHaveBeenCalledWith(
      'tenant-1',
      'group-1',
      'cat-uuid',
    );
  });

  it('maps attachProduct to the service', async () => {
    const dto = { product_id: 'prod-uuid' };
    const attached = await controller.attachProduct('group-1', dto, 'tenant-1');
    expect(attached).toBeDefined();
    expect(service.attachProduct).toHaveBeenCalledWith(
      'tenant-1',
      'group-1',
      dto,
    );
  });

  it('maps detachProduct to the service and returns success', async () => {
    const res = await controller.detachProduct(
      'group-1',
      'prod-uuid',
      'tenant-1',
    );
    expect(res.success).toBe(true);
    expect(service.detachProduct).toHaveBeenCalledWith(
      'tenant-1',
      'group-1',
      'prod-uuid',
    );
  });

  describe('requireTenant', () => {
    it('throws UnauthorizedException without tenant context', async () => {
      await expect(
        controller.findAll(undefined, undefined, undefined),
      ).rejects.toThrow(UnauthorizedException);
      expect(service.findAll).not.toHaveBeenCalled();
    });
  });

  describe('role decorators', () => {
    // Reads the @Roles metadata straight off the prototype methods: reads
    // allow the whole staff, mutations restrict to OWNER/MANAGER.
    const rolesOf = (method: string): UserRole[] | undefined => {
      const reflector = new Reflector();
      const handler = controller[method] as unknown as () => void;
      return reflector.get(ROLES_KEY, handler);
    };

    it('allows reads for OWNER, MANAGER, CASHIER and WAITER', () => {
      for (const method of ['findAll', 'findOne']) {
        expect(rolesOf(method)).toEqual([
          UserRole.OWNER,
          UserRole.MANAGER,
          UserRole.CASHIER,
          UserRole.WAITER,
        ]);
      }
    });

    it('restricts mutations to OWNER and MANAGER', () => {
      for (const method of [
        'createGroup',
        'updateGroup',
        'removeGroup',
        'createOption',
        'updateOption',
        'removeOption',
        'attachCategory',
        'detachCategory',
        'attachProduct',
        'detachProduct',
      ]) {
        expect(rolesOf(method)).toEqual([UserRole.OWNER, UserRole.MANAGER]);
      }
    });
  });
});
