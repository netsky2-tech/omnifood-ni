import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { User, UserRole } from '../entities/user.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { SecurityProfile } from '../entities/security-profile.entity';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';

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

  const manager = {
    getRepository: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  const authService = {
    revokeRefreshSessionForUser: jest.fn(),
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
    const lockedAudit = { save: jest.fn() };
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

  it('keeps name and PIN changes outside refresh revocation', async () => {
    const user = {
      id: 'user-1',
      tenant_id: 'tenant-1',
      name: 'Cashier',
      role: UserRole.CASHIER,
      security_version: 7,
    };
    userRepository.findOne.mockResolvedValue(user);
    userRepository.save.mockResolvedValue(user);
    securityProfileRepository.findOne.mockResolvedValue({ user_id: 'user-1' });
    securityProfileRepository.save.mockResolvedValue({ id: 'profile-1' });
    auditRepository.save.mockResolvedValue({ id: 'audit-1' });

    await service.update(
      'user-1',
      { name: 'Renamed', pin: '654321' },
      'tenant-1',
      'admin-1',
    );

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(authService.revokeRefreshSessionForUser).not.toHaveBeenCalled();
    expect(user.security_version).toBe(7);
  });
});
