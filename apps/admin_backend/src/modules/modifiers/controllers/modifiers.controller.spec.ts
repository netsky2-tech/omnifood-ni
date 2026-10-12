import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ModifiersController } from './modifiers.controller';
import { ModifiersService } from '../services/modifiers.service';
import { ModifierGroup } from '../entities/modifier-group.entity';
import { ModifierOption } from '../entities/modifier-option.entity';
import { CreateModifierOptionDto } from '../dto/create-modifier-option.dto';
import { UpdateModifierOptionDto } from '../dto/update-modifier-option.dto';
import { CreateModifierGroupDto } from '../dto/create-modifier-group.dto';
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
    getEffectiveGroups: jest.Mock;
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
      getEffectiveGroups: jest.fn().mockResolvedValue([]),
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

  it('passes the status query parameter through to the service filters', async () => {
    await controller.findAll('tenant-1', undefined, undefined, 'inactive');
    expect(service.findAll).toHaveBeenCalledWith('tenant-1', {
      category_id: undefined,
      product_id: undefined,
      status: 'inactive',
    });
  });

  it('omits status from the filters when the query parameter is absent', async () => {
    await controller.findAll('tenant-1', undefined, undefined, undefined);
    expect(service.findAll).toHaveBeenCalledWith('tenant-1', {
      category_id: undefined,
      product_id: undefined,
      status: undefined,
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

  it('maps getEffectiveGroups to the service', async () => {
    const result = await controller.getEffective('prod-uuid-1', 'tenant-1');
    expect(result).toEqual([]);
    expect(service.getEffectiveGroups).toHaveBeenCalledWith(
      'tenant-1',
      'prod-uuid-1',
    );
  });

  describe('decimal response contract (price_delta as JSON number)', () => {
    // node-postgres hands `numeric` back as a string while the entity
    // declares `price_delta: number`; the controller owns the boundary that
    // restores the declared type, so every response path carries a number.
    const optionWithStringDelta = (over: Record<string, unknown> = {}) =>
      ({
        id: 'option-1',
        tenant_id: 'tenant-1',
        group_id: 'group-1',
        name: 'Entera',
        price_delta: '0.00',
        is_default: false,
        sort_order: 0,
        is_active: true,
        ...over,
      }) as unknown as ModifierOption;

    it('serializes option price deltas in the group listing (findAll)', async () => {
      service.findAll.mockResolvedValue([
        { ...mockGroup(), options: [optionWithStringDelta()] },
      ]);

      const [group] = await controller.findAll('tenant-1');

      expect(Array.isArray(group.options)).toBe(true);
      expect(typeof group.options[0]!.price_delta).toBe('number');
      expect(group.options[0]!.price_delta).toBe(0);
    });

    it('serializes option price deltas in findOne', async () => {
      service.findOne.mockResolvedValue({
        ...mockGroup(),
        options: [optionWithStringDelta()],
      });

      const group = await controller.findOne('group-1', 'tenant-1');

      expect(typeof group.options[0]!.price_delta).toBe('number');
      expect(group.options[0]!.price_delta).toBe(0);
    });

    it('serializes the created option response (createOption)', async () => {
      service.createOption.mockResolvedValue(optionWithStringDelta());

      const option = await controller.createOption(
        'group-1',
        { name: 'Entera' },
        'tenant-1',
      );

      expect(typeof option.price_delta).toBe('number');
      expect(option.price_delta).toBe(0);
    });

    it('serializes the updated option response (updateOption)', async () => {
      service.updateOption.mockResolvedValue(
        optionWithStringDelta({ price_delta: '15.25' }),
      );

      const option = await controller.updateOption(
        'group-1',
        'option-1',
        { name: 'Entera' },
        'tenant-1',
      );

      expect(typeof option.price_delta).toBe('number');
      expect(option.price_delta).toBe(15.25);
    });

    it('serializes price deltas of the effective-group resolution', async () => {
      service.getEffectiveGroups.mockResolvedValue([
        {
          group_id: 'group-1',
          name: 'Leche',
          min_selected: 1,
          max_selected: 3,
          allow_quantities: true,
          source: 'category',
          options: [optionWithStringDelta()],
        },
      ]);

      const [group] = await controller.getEffective('prod-uuid-1', 'tenant-1');

      expect(typeof group.options[0]!.price_delta).toBe('number');
      expect(group.options[0]!.price_delta).toBe(0);
    });

    it('keeps group create/update responses working (no decimal fields)', async () => {
      const created = await controller.createGroup(
        { name: 'Leche' } as any,
        'tenant-1',
      );
      expect(created.id).toBe('group-1');
      // The wired response shape carries the (possibly empty) options list.
      expect((created as unknown as { options: unknown }).options).toEqual([]);
    });
  });

  describe('numeric-string DTO tolerance', () => {
    // A client that read a Postgres decimal and echoed the same value back
    // must not be rejected for echoing it: the transform coerces
    // numerically-valid strings before validation and genuinely non-numeric
    // input still fails @IsNumber/@IsInt.
    const validateDto = async <T extends object>(
      dtoClass: new (...args: never[]) => T,
      payload: Record<string, unknown>,
    ) => {
      const instance = plainToInstance(dtoClass, payload);
      const errors = await validate(instance);
      // The intersection keeps the property reads type-safe without
      // repeating each DTO class in the assertions.
      return { instance: instance as T & Record<string, unknown>, errors };
    };

    it('accepts a Postgres decimal echoed back as a string on create', async () => {
      const { instance, errors } = await validateDto(CreateModifierOptionDto, {
        name: 'Entera',
        price_delta: '0.00',
      });

      expect(errors).toHaveLength(0);
      expect(instance.price_delta).toBe(0);
      expect(typeof instance.price_delta).toBe('number');
    });

    it('accepts a Postgres decimal echoed back as a string on update', async () => {
      const { instance, errors } = await validateDto(UpdateModifierOptionDto, {
        price_delta: '15.25',
      });

      expect(errors).toHaveLength(0);
      expect(instance.price_delta).toBe(15.25);
    });

    it('still rejects genuinely non-numeric price deltas', async () => {
      const { errors } = await validateDto(CreateModifierOptionDto, {
        name: 'Entera',
        price_delta: 'abc',
      });

      expect(errors.some((e) => e.property === 'price_delta')).toBe(true);
    });

    it('coerces integer group fields sent as strings', async () => {
      const { instance, errors } = await validateDto(CreateModifierGroupDto, {
        name: 'Leche',
        min_selected: '1',
        max_selected: '3',
        sort_order: '2',
      });

      expect(errors).toHaveLength(0);
      expect(instance.min_selected).toBe(1);
      expect(instance.max_selected).toBe(3);
      expect(instance.sort_order).toBe(2);
    });

    it('still rejects non-integer strings for integer fields', async () => {
      const { errors } = await validateDto(CreateModifierGroupDto, {
        name: 'Leche',
        min_selected: '1.5',
      });

      expect(errors.some((e) => e.property === 'min_selected')).toBe(true);
    });
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
      for (const method of ['findAll', 'findOne', 'getEffective']) {
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
