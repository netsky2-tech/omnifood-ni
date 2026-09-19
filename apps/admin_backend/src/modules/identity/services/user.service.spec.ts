import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { User, UserRole } from '../entities/user.entity';
import {
  ALL_APP_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from '../security/permissions.enum';
import { AuditLog } from '../entities/audit-log.entity';
import { SecurityProfile } from '../entities/security-profile.entity';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';

describe('UserService', () => {
  let service: UserService;

  const userRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const auditRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const securityProfileRepository = {
    create: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const manager = {
    getRepository: jest.fn(),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  const authService = {
    revokeRefreshSessionForUser: jest.fn(),
  };

  beforeEach(async () => {
    // resetAllMocks (not clearAllMocks): unconsumed mockResolvedValueOnce
    // values would otherwise leak into later tests.
    jest.resetAllMocks();

    // Per-test implementations on these mocks must not leak between tests.
    manager.query.mockReset();
    manager.query.mockResolvedValue([]);
    manager.getRepository.mockReset();
    manager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === User) return userRepository;
      if (entity === AuditLog) return auditRepository;
      if (entity === SecurityProfile) return securityProfileRepository;
      if (entity instanceof Function) {
        throw new Error(`Unexpected repository request: ${entity.name}`);
      }
      throw new Error('Unexpected repository request');
    });
    dataSource.transaction.mockReset();
    dataSource.transaction.mockImplementation(
      (operation: (transactionManager: typeof manager) => Promise<unknown>) =>
        operation(manager),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(AuditLog), useValue: auditRepository },
        {
          provide: getRepositoryToken(SecurityProfile),
          useValue: securityProfileRepository,
        },
        { provide: DataSource, useValue: dataSource },
        { provide: AuthService, useValue: authService },
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
      expect(matrix.role_defaults[UserRole.OWNER].length).toBe(
        DEFAULT_ROLE_PERMISSIONS[UserRole.OWNER].length,
      );
      expect(matrix.all_permissions.length).toBe(ALL_APP_PERMISSIONS.length);
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

  it('rejects password hashing failures before opening a transaction', async () => {
    const hash = jest
      .spyOn(bcrypt, 'hash')
      .mockRejectedValueOnce(new Error('hash failed') as never);

    await expect(
      service.update(
        'user-1',
        { password: 'Password123!' },
        'tenant-1',
        'admin-1',
      ),
    ).rejects.toThrow('hash failed');

    expect(dataSource.transaction).not.toHaveBeenCalled();
    hash.mockRestore();
  });

  it('enters the sensitive boundary for role and password changes', async () => {
    const lockedUsers = {
      findOne: jest.fn().mockImplementation(() =>
        Promise.resolve({
          id: 'user-1',
          tenant_id: 'tenant-1',
          name: 'Cashier',
          role: UserRole.CASHIER,
          security_version: 7,
        }),
      ),
      save: jest
        .fn()
        .mockImplementation((user: Record<string, unknown>) =>
          Promise.resolve(user),
        ),
    };
    const lockedAudit = { findOne: jest.fn(), save: jest.fn() };
    manager.getRepository.mockImplementation((entity: unknown) =>
      entity === User ? lockedUsers : lockedAudit,
    );
    dataSource.transaction.mockImplementation(
      (operation: (transactionManager: typeof manager) => Promise<unknown>) =>
        operation(manager),
    );

    for (const dto of [
      { role: UserRole.MANAGER },
      { password: 'Password123!' },
    ]) {
      await service.update('user-1', dto, 'tenant-1', 'admin-1');
    }

    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(lockedUsers.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1', tenant_id: 'tenant-1' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(lockedUsers.save).toHaveBeenCalledWith(
      expect.objectContaining({ security_version: 8 }),
    );
    expect(authService.revokeRefreshSessionForUser).toHaveBeenCalledTimes(2);
    expect(lockedAudit.save).toHaveBeenCalledTimes(2);
  });

  it('treats each repeated deactivation as a sensitive revocation and audit boundary', async () => {
    const lockedUsers = {
      findOne: jest.fn().mockImplementation(() =>
        Promise.resolve({
          id: 'user-1',
          tenant_id: 'tenant-1',
          is_active: false,
          security_version: 7,
        }),
      ),
      save: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };
    const lockedAudit = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    manager.getRepository.mockImplementation((entity: unknown) =>
      entity === User ? lockedUsers : lockedAudit,
    );
    dataSource.transaction.mockImplementation(
      (operation: (transactionManager: typeof manager) => Promise<unknown>) =>
        operation(manager),
    );

    await service.deactivate('user-1', 'tenant-1', 'admin-1');
    await service.deactivate('user-1', 'tenant-1', 'admin-1');

    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(authService.revokeRefreshSessionForUser).toHaveBeenCalledTimes(2);
    expect(lockedAudit.save).toHaveBeenCalledTimes(2);
  });

  describe('publication marking and transaction boundaries', () => {
    const SET_CONFIG = "set_config('app.tenant_id'";
    const MARKER = 'human_auth_tenant_publication_state';
    const CREATE_ORDER = [
      'tx:start',
      'bind',
      'save-user',
      'save-profile',
      'audit',
      'mark',
      'tx:end',
    ];
    const REVOKING_ORDER = [
      'tx:start',
      'bind',
      'load-user',
      'save-user',
      'revoke',
      'audit',
      'mark',
      'tx:end',
    ];

    function queryCalls(): string[] {
      return (manager.query.mock.calls as Array<[string]>).map(([sql]) => sql);
    }
    const bindCount = () =>
      queryCalls().filter((sql) => sql.includes(SET_CONFIG)).length;
    const markCount = () =>
      queryCalls().filter((sql) => sql.includes(MARKER)).length;

    let order: string[];

    // Records the whole statement order of a mutating path — transaction
    // boundaries, RLS binding, publication marking, and every repository
    // write — so each test only supplies its fixture and assertions.
    async function recordTransactionOrder(): Promise<string[]> {
      order = [];
      dataSource.transaction.mockImplementation(
        async (
          operation: (transactionManager: typeof manager) => Promise<unknown>,
        ) => {
          order.push('tx:start');
          const result = await operation(manager);
          order.push('tx:end');
          return result;
        },
      );
      manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes(SET_CONFIG)) order.push('bind');
        if (sql.includes(MARKER)) order.push('mark');
        return [];
      });
      userRepository.save.mockImplementation(
        async (user: Record<string, unknown>) => {
          order.push('save-user');
          return user;
        },
      );
      securityProfileRepository.save.mockImplementation(
        async (profile: Record<string, unknown>) => {
          order.push('save-profile');
          return profile;
        },
      );
      auditRepository.save.mockImplementation(async () => {
        order.push('audit');
        return { id: 'audit-x' };
      });
      authService.revokeRefreshSessionForUser.mockImplementation(async () => {
        order.push('revoke');
      });
      return order;
    }

    function mockLockedUser(extra: Record<string, unknown>) {
      userRepository.findOne.mockImplementation(async () => {
        order.push('load-user');
        return {
          id: 'user-1',
          tenant_id: 'tenant-1',
          security_version: 7,
          ...extra,
        };
      });
    }

    function expectBoundAndMarkedOnce() {
      expect(bindCount()).toBe(1);
      expect(markCount()).toBe(1);
    }

    it('creates a user in one transaction: binds first, marks exactly once before returning', async () => {
      await recordTransactionOrder();
      userRepository.findOne.mockResolvedValue(null);
      securityProfileRepository.create.mockImplementation(
        (input: Record<string, unknown>) => ({ ...input }),
      );

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

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(order).toEqual(CREATE_ORDER);
      expectBoundAndMarkedOnce();
    });

    it('keeps name and PIN changes inside one marked transaction but outside refresh revocation', async () => {
      await recordTransactionOrder();
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        tenant_id: 'tenant-1',
        name: 'Cashier',
        role: UserRole.CASHIER,
        security_version: 7,
      });
      securityProfileRepository.findOne.mockResolvedValue({
        user_id: 'user-1',
      });

      await service.update(
        'user-1',
        { name: 'Renamed', pin: '654321' },
        'tenant-1',
        'admin-1',
      );

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(order).toEqual(CREATE_ORDER);
      expectBoundAndMarkedOnce();
      expect(authService.revokeRefreshSessionForUser).not.toHaveBeenCalled();
    });

    it.each([
      [
        'the sensitive update path',
        (s: UserService) =>
          s.update('user-1', { role: UserRole.MANAGER }, 'tenant-1', 'admin-1'),
      ],
      [
        'deactivate',
        (s: UserService) => s.deactivate('user-1', 'tenant-1', 'admin-1'),
      ],
    ])(
      'keeps %s in its existing transaction: bind, locked load, mutate, revoke, audit, mark',
      async (_name, run) => {
        await recordTransactionOrder();
        mockLockedUser({ name: 'Cashier', role: UserRole.CASHIER });

        await run(service);

        expect(dataSource.transaction).toHaveBeenCalledTimes(1);
        expect(order).toEqual(REVOKING_ORDER);
        expectBoundAndMarkedOnce();
      },
    );

    it('runs setCustomPermissions in one transaction and builds the DTO from in-transaction values', async () => {
      await recordTransactionOrder();
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        tenant_id: 'tenant-1',
        role: UserRole.CASHIER,
        is_active: true,
      });
      securityProfileRepository.findOne.mockResolvedValue(null);
      securityProfileRepository.create.mockImplementation(
        (input: Record<string, unknown>) => ({ ...input }),
      );

      const result = await service.setCustomPermissions(
        'user-1',
        ['sales:void_invoice' as any],
        'tenant-1',
        'admin-1',
      );

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(order).toEqual([
        'tx:start',
        'bind',
        'save-profile',
        'audit',
        'mark',
        'tx:end',
      ]);
      expectBoundAndMarkedOnce();
      expect(result).toEqual({
        user_id: 'user-1',
        role: UserRole.CASHIER,
        role_permissions: [],
        custom_permissions: ['sales:void_invoice'],
        effective_permissions: ['sales:void_invoice'],
      });
    });

    it('rolls the mutation back when the RLS tenant binding fails', async () => {
      order = [];
      manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes(SET_CONFIG)) throw new Error('binding failed');
        return [];
      });
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        tenant_id: 'tenant-1',
        role: UserRole.CASHIER,
        is_active: true,
      });
      userRepository.save.mockResolvedValue({ id: 'user-1' });

      await expect(
        service.setCustomPermissions(
          'user-1',
          ['sales:void_invoice' as any],
          'tenant-1',
          'admin-1',
        ),
      ).rejects.toThrow('binding failed');

      expect(userRepository.findOne).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(markCount()).toBe(0);
    });

    it('rolls the mutation back when publication marking fails', async () => {
      await recordTransactionOrder();
      manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes(MARKER)) throw new Error('marking failed');
        return [];
      });
      mockLockedUser({ name: 'Cashier', role: UserRole.CASHIER });

      await expect(
        service.update(
          'user-1',
          { password: 'Password123!' },
          'tenant-1',
          'admin-1',
        ),
      ).rejects.toThrow('marking failed');

      expect(bindCount()).toBe(1);
      expect(markCount()).toBe(1);
    });

    it('never marks publication dirty from read paths', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        tenant_id: 'tenant-1',
        role: UserRole.CASHIER,
        is_active: true,
      });
      securityProfileRepository.findOne.mockResolvedValue({
        user_id: 'user-1',
        custom_permissions: [],
      });

      await service.getUserEffectivePermissions('user-1', 'tenant-1');
      await service.findById('user-1');

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(bindCount()).toBe(0);
      expect(markCount()).toBe(0);
    });

    it('findByTenant requests is_active along with other core fields', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'admin@test.com',
          name: 'Admin',
          role: UserRole.OWNER,
          created_at: new Date(),
          is_active: true,
        },
      ];
      userRepository.find.mockResolvedValue(mockUsers);

      const result = await service.findByTenant('tenant-1');
      expect(result).toEqual(mockUsers);
      expect(userRepository.find).toHaveBeenCalledWith({
        where: { tenant_id: 'tenant-1', is_active: true },
        select: ['id', 'email', 'name', 'role', 'created_at', 'is_active'],
      });
    });

    it('logAction chains sequence_no and entry_hash from latest active log', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        tenant_id: 'tenant-1',
        name: 'Old Name',
        role: UserRole.CASHIER,
        security_version: 1,
      });
      userRepository.save.mockImplementation((u: unknown) => Promise.resolve(u));
      auditRepository.findOne.mockResolvedValue({
        sequence_no: 5,
        entry_hash: 'hash-of-entry-5',
      });
      auditRepository.save.mockImplementation((log: unknown) => Promise.resolve(log));

      await service.update('user-1', { name: 'New Name' }, 'tenant-1', 'admin-1');

      expect(auditRepository.findOne).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-1',
          device_id: 'WEB_ADMIN',
          user_id: 'admin-1',
          forensic_status: 'ACTIVE',
        },
        order: { sequence_no: 'DESC' },
      });
      expect(auditRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_UPDATED',
          sequence_no: 6,
          prev_hash: 'hash-of-entry-5',
          device_id: 'WEB_ADMIN',
          user_id: 'admin-1',
          forensic_status: 'ACTIVE',
        }),
      );
    });
  });
});
