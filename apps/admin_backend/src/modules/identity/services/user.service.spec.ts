import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { User, UserRole } from '../entities/user.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { SecurityProfile } from '../entities/security-profile.entity';

describe('UserService', () => {
  let service: UserService;

  const userRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const auditRepository = {
    save: jest.fn(),
  };

  const securityProfileRepository = {
    create: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(AuditLog), useValue: auditRepository },
        {
          provide: getRepositoryToken(SecurityProfile),
          useValue: securityProfileRepository,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('does not persist legacy user.pin_hash during create', async () => {
    userRepository.findOne.mockResolvedValue(null);

    userRepository.save
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'cashier@omnifood.ni',
        name: 'Cashier',
        role: UserRole.CASHIER,
        tenant_id: 'tenant-1',
        is_active: true,
      })
      .mockResolvedValueOnce({ id: 'audit-1' });

    securityProfileRepository.create.mockReturnValue({
      user_id: 'user-1',
      pin_hash: 'hashed-pin',
      is_pin_enabled: true,
    });
    securityProfileRepository.save.mockResolvedValue({ id: 'profile-1' });
    auditRepository.save.mockResolvedValue({ id: 'audit-1' });

    await service.create(
      {
        email: 'cashier@omnifood.ni',
        name: 'Cashier',
        role: UserRole.CASHIER,
        password: 'Password123!',
        pin: '123456',
      },
      'tenant-1',
      'admin-1',
    );

    const saveCalls = userRepository.save.mock.calls as Array<
      [Record<string, unknown>]
    >;
    const savedUserPayload = saveCalls[0][0];
    expect(savedUserPayload).not.toHaveProperty('pin_hash');
    expect(securityProfileRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        is_pin_enabled: true,
      }),
    );
  });

  it('updates PIN only through security profile', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'cashier@omnifood.ni',
      name: 'Cashier',
      role: UserRole.CASHIER,
      tenant_id: 'tenant-1',
      is_active: true,
    });
    userRepository.save
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'cashier@omnifood.ni',
        name: 'Cashier',
        role: UserRole.CASHIER,
        tenant_id: 'tenant-1',
        is_active: true,
      })
      .mockResolvedValueOnce({ id: 'audit-2' });

    securityProfileRepository.findOne.mockResolvedValue({
      user_id: 'user-1',
      pin_hash: 'old-hash',
      is_pin_enabled: true,
    });
    securityProfileRepository.save.mockResolvedValue({ id: 'profile-1' });
    auditRepository.save.mockResolvedValue({ id: 'audit-2' });

    await service.update(
      'user-1',
      {
        pin: '654321',
      },
      'tenant-1',
      'admin-1',
    );

    const saveCalls = userRepository.save.mock.calls as Array<
      [Record<string, unknown>]
    >;
    const updatedUserPayload = saveCalls[0][0];
    expect(updatedUserPayload).not.toHaveProperty('pin_hash');
    expect(securityProfileRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        is_pin_enabled: true,
      }),
    );
  });

  describe('Permissions Matrix & Custom Permissions', () => {
    it('returns system permissions matrix with role defaults', () => {
      const matrix = service.getPermissionsMatrix();
      expect(matrix.role_defaults).toBeDefined();
      expect(matrix.role_defaults[UserRole.OWNER].length).toBe(8);
      expect(matrix.all_permissions.length).toBe(8);
    });

    it('resolves user effective permissions including custom overrides', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-cashier',
        role: UserRole.CASHIER,
        tenant_id: 'tenant-1',
        is_active: true,
      });

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: 'user-cashier',
        custom_permissions: ['sales:void_invoice'],
      });

      const effective = await service.getUserEffectivePermissions(
        'user-cashier',
        'tenant-1',
      );

      expect(effective.user_id).toBe('user-cashier');
      expect(effective.role).toBe(UserRole.CASHIER);
      expect(effective.role_permissions).toEqual([]);
      expect(effective.custom_permissions).toEqual(['sales:void_invoice']);
      expect(effective.effective_permissions).toEqual(['sales:void_invoice']);
    });

    it('sets custom permissions on security profile and audits action', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-cashier',
        role: UserRole.CASHIER,
        tenant_id: 'tenant-1',
        is_active: true,
      });

      const existingProfile = {
        user_id: 'user-cashier',
        custom_permissions: [],
      };
      securityProfileRepository.findOne.mockResolvedValue(existingProfile);
      securityProfileRepository.save.mockImplementation(
        async (p: unknown) => p,
      );
      auditRepository.save.mockResolvedValue({ id: 'audit-3' });

      const updated = await service.setCustomPermissions(
        'user-cashier',
        ['sales:void_invoice' as any, 'cash:manual_drawer_open' as any],
        'tenant-1',
        'admin-1',
      );

      expect(existingProfile.custom_permissions).toEqual([
        'sales:void_invoice',
        'cash:manual_drawer_open',
      ]);
      expect(securityProfileRepository.save).toHaveBeenCalled();
      expect(auditRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_PERMISSIONS_UPDATED',
          target_id: 'user-cashier',
          tenant_id: 'tenant-1',
          user_id: 'admin-1',
        }),
      );
      expect(updated.effective_permissions).toEqual([
        'sales:void_invoice',
        'cash:manual_drawer_open',
      ]);
    });
  });
});
