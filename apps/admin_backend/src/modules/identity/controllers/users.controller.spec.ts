import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UserService } from '../services/user.service';
import { UserRole } from '../entities/user.entity';
import { AppPermission } from '../security/permissions.enum';
import { AuthGuard } from '../guards/auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

import { AuthoritativeCurrentUserGuard } from '../guards/authoritative-current-user.guard';

describe('UsersController (Slice 10.1)', () => {
  let controller: UsersController;
  let userService: jest.Mocked<Partial<UserService>>;

  beforeEach(async () => {
    userService = {
      findByTenant: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
      getPermissionsMatrix: jest.fn(),
      getUserEffectivePermissions: jest.fn(),
      setCustomPermissions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UserService,
          useValue: userService,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthoritativeCurrentUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPermissionsMatrix', () => {
    it('returns the permissions matrix from UserService', async () => {
      const mockMatrix = {
        role_defaults: {
          [UserRole.OWNER]: [AppPermission.SALES_VOID_INVOICE],
        } as Record<string, AppPermission[]>,
        all_permissions: [AppPermission.SALES_VOID_INVOICE],
      };
      userService.getPermissionsMatrix = jest.fn().mockReturnValue(mockMatrix);

      const result = await controller.getPermissionsMatrix();
      expect(result).toEqual(mockMatrix);
      expect(userService.getPermissionsMatrix).toHaveBeenCalled();
    });
  });

  describe('getUserPermissions', () => {
    it('returns user effective permissions from UserService', async () => {
      const mockUserPerms = {
        user_id: 'user-1',
        role: UserRole.CASHIER,
        role_permissions: [],
        custom_permissions: [AppPermission.SALES_VOID_INVOICE],
        effective_permissions: [AppPermission.SALES_VOID_INVOICE],
      };
      userService.getUserEffectivePermissions = jest
        .fn()
        .mockResolvedValue(mockUserPerms);

      const result = await controller.getUserPermissions('user-1', 'tenant-1');
      expect(result).toEqual(mockUserPerms);
      expect(userService.getUserEffectivePermissions).toHaveBeenCalledWith(
        'user-1',
        'tenant-1',
      );
    });
  });

  describe('updateUserPermissions', () => {
    it('updates custom permissions via UserService', async () => {
      const mockUpdated = {
        user_id: 'user-1',
        role: UserRole.CASHIER,
        role_permissions: [],
        custom_permissions: [
          AppPermission.SALES_VOID_INVOICE,
          AppPermission.CASH_MANUAL_DRAWER_OPEN,
        ],
        effective_permissions: [
          AppPermission.SALES_VOID_INVOICE,
          AppPermission.CASH_MANUAL_DRAWER_OPEN,
        ],
      };
      userService.setCustomPermissions = jest
        .fn()
        .mockResolvedValue(mockUpdated);

      const req = {
        user: {
          sub: 'admin-1',
          email: 'admin@omnifood.ni',
          tenant_id: 'tenant-1',
          role: UserRole.OWNER,
        },
      } as unknown as Request & {
        user: {
          sub: string;
          email: string;
          tenant_id: string;
          role: UserRole;
        };
      };

      const result = await controller.updateUserPermissions(
        'user-1',
        'tenant-1',
        {
          custom_permissions: [
            AppPermission.SALES_VOID_INVOICE,
            AppPermission.CASH_MANUAL_DRAWER_OPEN,
          ],
        },
        req,
      );

      expect(result).toEqual(mockUpdated);
      expect(userService.setCustomPermissions).toHaveBeenCalledWith(
        'user-1',
        [
          AppPermission.SALES_VOID_INVOICE,
          AppPermission.CASH_MANUAL_DRAWER_OPEN,
        ],
        'tenant-1',
        'admin-1',
      );
    });
  });

  describe('list, create, update, delete', () => {
    const req = {
      user: {
        sub: 'admin-1',
        email: 'admin@omnifood.ni',
        tenant_id: 'tenant-1',
        role: UserRole.OWNER,
      },
    } as unknown as Request & {
      user: {
        sub: string;
        email: string;
        tenant_id: string;
        role: UserRole;
      };
    };

    it('delegates list to userService', async () => {
      userService.findByTenant = jest.fn().mockResolvedValue([]);
      await controller.list('tenant-1');
      expect(userService.findByTenant).toHaveBeenCalledWith('tenant-1');
    });

    it('delegates create to userService', async () => {
      const dto = {
        email: 'test@omnifood.ni',
        name: 'Test',
        role: UserRole.CASHIER,
      };
      userService.create = jest
        .fn()
        .mockResolvedValue({ id: 'user-1', ...dto });
      await controller.create('tenant-1', dto, req);
      expect(userService.create).toHaveBeenCalledWith(
        dto,
        'tenant-1',
        'admin-1',
      );
    });

    it('delegates update to userService', async () => {
      const dto = { name: 'Updated' };
      userService.update = jest
        .fn()
        .mockResolvedValue({ id: 'user-1', ...dto });
      await controller.update('user-1', 'tenant-1', dto, req);
      expect(userService.update).toHaveBeenCalledWith(
        'user-1',
        dto,
        'tenant-1',
        'admin-1',
      );
    });

    it('delegates delete to userService', async () => {
      userService.deactivate = jest.fn().mockResolvedValue(undefined);
      await controller.delete('user-1', 'tenant-1', req);
      expect(userService.deactivate).toHaveBeenCalledWith(
        'user-1',
        'tenant-1',
        'admin-1',
      );
    });
  });
});
