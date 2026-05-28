import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User, UserRole } from '../entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let mockUserRepository: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let mockJwtService: {
    signAsync: jest.Mock;
  };

  beforeEach(async () => {
    mockUserRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    mockJwtService = {
      signAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns staff sync payload with security profile but no top-level credential fields', async () => {
    const getMany = jest.fn().mockResolvedValue([
      {
        id: 'u-1',
        name: 'Cashier One',
        role: UserRole.CASHIER,
        is_active: true,
        email: 'cashier@omnifood.ni',
        tenant_id: 'tenant-1',
        security_profile: {
          user_id: 'u-1',
          pin_hash: '$2b$10$hash',
          totp_secret_seed: 'seed-1',
          is_totp_enabled: true,
          is_pin_enabled: true,
        },
      },
    ]);

    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany,
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getStaffForSync('tenant-1', UserRole.OWNER);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'u-1',
      role: UserRole.CASHIER,
      security_profile: {
        user_id: 'u-1',
        pin_hash: '$2b$10$hash',
        totp_secret_seed: 'seed-1',
        is_totp_enabled: true,
        is_pin_enabled: true,
      },
    });
    expect((result[0] as Record<string, unknown>).pin_hash).toBeUndefined();
  });

  it('hides security secrets when requester role is not privileged', async () => {
    const getMany = jest.fn().mockResolvedValue([
      {
        id: 'u-2',
        name: 'Waiter Two',
        role: UserRole.WAITER,
        is_active: true,
        email: 'waiter@omnifood.ni',
        tenant_id: 'tenant-1',
        security_profile: {
          user_id: 'u-2',
          pin_hash: '$2b$10$secret',
          totp_secret_seed: 'seed-secret',
          is_totp_enabled: true,
          is_pin_enabled: true,
        },
      },
    ]);

    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany,
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(qb);

    const result = (await service.getStaffForSync(
      'tenant-1',
      UserRole.CASHIER,
    )) as Array<{ security_profile: Record<string, unknown> | null }>;

    expect(qb.addSelect).not.toHaveBeenCalledWith('security_profile.pin_hash');
    expect(result[0].security_profile).toMatchObject({
      user_id: 'u-2',
      pin_hash: null,
      totp_secret_seed: null,
      is_totp_enabled: true,
      is_pin_enabled: true,
    });
  });

  it('returns scoped sensitive profiles for offline continuity sync', async () => {
    const getMany = jest.fn().mockResolvedValue([
      {
        id: 'cashier-1',
        name: 'Cashier One',
        role: UserRole.CASHIER,
        is_active: true,
        email: 'cashier@omnifood.ni',
        tenant_id: 'tenant-1',
        security_profile: {
          user_id: 'cashier-1',
          pin_hash: '$2b$10$cashier',
          totp_secret_seed: 'seed-cashier',
          is_totp_enabled: true,
          is_pin_enabled: true,
        },
      },
      {
        id: 'supervisor-1',
        name: 'Supervisor One',
        role: UserRole.MANAGER,
        is_active: true,
        email: 'manager@omnifood.ni',
        tenant_id: 'tenant-1',
        security_profile: {
          user_id: 'supervisor-1',
          pin_hash: '$2b$10$manager',
          totp_secret_seed: 'seed-manager',
          is_totp_enabled: true,
          is_pin_enabled: true,
        },
      },
    ]);

    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany,
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getStaffForSync(
      'tenant-1',
      UserRole.CASHIER,
      'cashier-1',
      'pos-auth-continuity',
    );
    const scopedResult = result as {
      staff: Array<{ security_profile: Record<string, unknown> | null }>;
    };

    expect(scopedResult.staff).toHaveLength(2);
    expect(scopedResult.staff[0].security_profile).toMatchObject({
      user_id: 'cashier-1',
      pin_hash: '$2b$10$cashier',
      totp_secret_seed: null,
    });
    expect(scopedResult.staff[1].security_profile).toMatchObject({
      user_id: 'supervisor-1',
      pin_hash: '$2b$10$manager',
      totp_secret_seed: 'seed-manager',
    });
  });

  it('keeps security_profile secrets masked for invalid requester role values', async () => {
    const getMany = jest.fn().mockResolvedValue([
      {
        id: 'u-3',
        name: 'Waiter Three',
        role: UserRole.WAITER,
        is_active: true,
        email: 'waiter3@omnifood.ni',
        tenant_id: 'tenant-1',
        security_profile: {
          user_id: 'u-3',
          pin_hash: '$2b$10$secret',
          totp_secret_seed: 'seed-secret',
          is_totp_enabled: true,
          is_pin_enabled: true,
        },
      },
    ]);

    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany,
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(qb);

    const result = (await service.getStaffForSync(
      'tenant-1',
      'SUPERVISOR',
    )) as Array<{ security_profile: Record<string, unknown> | null }>;

    expect(qb.addSelect).not.toHaveBeenCalledWith('security_profile.pin_hash');
    expect(result[0].security_profile).toMatchObject({
      user_id: 'u-3',
      pin_hash: null,
      totp_secret_seed: null,
      is_totp_enabled: true,
      is_pin_enabled: true,
      scope: 'masked',
    });
  });

  it('does not enable continuity scope for unknown scope values', async () => {
    const getMany = jest.fn().mockResolvedValue([
      {
        id: 'u-4',
        name: 'Cashier Four',
        role: UserRole.CASHIER,
        is_active: true,
        email: 'cashier4@omnifood.ni',
        tenant_id: 'tenant-1',
        security_profile: {
          user_id: 'u-4',
          pin_hash: '$2b$10$secret',
          totp_secret_seed: 'seed-secret',
          is_totp_enabled: true,
          is_pin_enabled: true,
        },
      },
    ]);

    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany,
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(qb);

    const result = (await service.getStaffForSync(
      'tenant-1',
      UserRole.CASHIER,
      'u-4',
      'all-users',
    )) as Array<{ security_profile: Record<string, unknown> | null }>;

    expect(qb.addSelect).not.toHaveBeenCalledWith('security_profile.pin_hash');
    expect(result[0].security_profile).toMatchObject({
      pin_hash: null,
      totp_secret_seed: null,
      scope: 'masked',
    });
  });

  it('masks peer cashier secrets during continuity scope while preserving self and authorizer data', async () => {
    const getMany = jest.fn().mockResolvedValue([
      {
        id: 'cashier-self',
        name: 'Cashier Self',
        role: UserRole.CASHIER,
        is_active: true,
        email: 'self@omnifood.ni',
        tenant_id: 'tenant-1',
        security_profile: {
          user_id: 'cashier-self',
          pin_hash: '$2b$10$self',
          totp_secret_seed: 'seed-self',
          is_totp_enabled: true,
          is_pin_enabled: true,
        },
      },
      {
        id: 'cashier-peer',
        name: 'Cashier Peer',
        role: UserRole.CASHIER,
        is_active: true,
        email: 'peer@omnifood.ni',
        tenant_id: 'tenant-1',
        security_profile: {
          user_id: 'cashier-peer',
          pin_hash: '$2b$10$peer',
          totp_secret_seed: 'seed-peer',
          is_totp_enabled: true,
          is_pin_enabled: true,
        },
      },
      {
        id: 'manager-1',
        name: 'Manager One',
        role: UserRole.MANAGER,
        is_active: true,
        email: 'manager@omnifood.ni',
        tenant_id: 'tenant-1',
        security_profile: {
          user_id: 'manager-1',
          pin_hash: '$2b$10$manager',
          totp_secret_seed: 'seed-manager',
          is_totp_enabled: true,
          is_pin_enabled: true,
        },
      },
    ]);

    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany,
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getStaffForSync(
      'tenant-1',
      UserRole.CASHIER,
      'cashier-self',
      'pos-auth-continuity',
    );
    const scopedResult = result as {
      staff: Array<{ security_profile: Record<string, unknown> | null }>;
    };

    expect(scopedResult.staff).toHaveLength(3);
    expect(scopedResult.staff[0].security_profile).toMatchObject({
      pin_hash: '$2b$10$self',
      totp_secret_seed: null,
      scope: 'self',
    });
    expect(scopedResult.staff[1].security_profile).toMatchObject({
      pin_hash: null,
      totp_secret_seed: null,
      scope: 'masked',
    });
    expect(scopedResult.staff[2].security_profile).toMatchObject({
      pin_hash: '$2b$10$manager',
      totp_secret_seed: 'seed-manager',
      scope: 'authorizer',
    });
  });

  it('returns continuity wrapper with metadata when pos-auth-continuity scope is requested', async () => {
    const staffRows = [
      {
        id: 'cashier-1',
        name: 'Cashier One',
        role: UserRole.CASHIER,
        is_active: true,
        email: 'cashier@omnifood.ni',
        tenant_id: 'tenant-1',
        security_profile: null,
      },
    ];

    const getMany = jest.fn().mockResolvedValue(staffRows);
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany,
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(qb);

    const result = (await service.getStaffForSync(
      'tenant-1',
      UserRole.CASHIER,
      'cashier-1',
      'pos-auth-continuity',
    )) as {
      staff: Array<{ id: string; name: string }>;
      metadata: { snapshot_timestamp: string };
    };

    expect(result.staff).toMatchObject([
      {
        id: 'cashier-1',
        name: 'Cashier One',
      },
    ]);
    expect(typeof result.metadata.snapshot_timestamp).toBe('string');
  });

  it('returns raw staff array when continuity scope is not requested', async () => {
    const staffRows = [
      {
        id: 'cashier-2',
        name: 'Cashier Two',
        role: UserRole.CASHIER,
        is_active: true,
        email: 'cashier2@omnifood.ni',
        tenant_id: 'tenant-1',
        security_profile: null,
      },
    ];

    const getMany = jest.fn().mockResolvedValue(staffRows);
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany,
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getStaffForSync('tenant-1', UserRole.CASHIER);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect((result as Array<{ id: string }>)[0].id).toBe('cashier-2');
  });

  it('returns null security_profile when user has no profile relation', async () => {
    const getMany = jest.fn().mockResolvedValue([
      {
        id: 'u-5',
        name: 'No Profile User',
        role: UserRole.CASHIER,
        is_active: true,
        email: 'noprof@omnifood.ni',
        tenant_id: 'tenant-1',
        security_profile: null,
      },
    ]);

    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany,
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(qb);

    const result = (await service.getStaffForSync(
      'tenant-1',
      UserRole.MANAGER,
    )) as Array<{ security_profile: Record<string, unknown> | null }>;

    expect(result[0].security_profile).toBeNull();
  });

  it('logs in successfully with valid credentials and persists refresh hash', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'cashier@omnifood.ni',
      name: 'Cashier',
      password_hash: 'stored-hash',
      role: UserRole.CASHIER,
      tenant_id: 'tenant-1',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-refresh' as never);
    mockJwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await service.login('cashier@omnifood.ni', 'Password123!');

    expect(result.access_token).toBe('access-token');
    expect(result.refresh_token).toBe('refresh-token');
    expect(result.user).toMatchObject({
      id: 'user-1',
      role: UserRole.CASHIER,
      tenant_id: 'tenant-1',
    });
    expect(mockUserRepository.update).toHaveBeenCalledWith('user-1', {
      hashed_refresh_token: 'hashed-refresh',
    });
  });

  it('rejects login when password compare fails', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-2',
      email: 'waiter@omnifood.ni',
      password_hash: 'stored-hash',
      role: UserRole.WAITER,
      tenant_id: 'tenant-1',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    await expect(service.login('waiter@omnifood.ni', 'wrong')).rejects.toThrow(
      'Credenciales inválidas',
    );
  });

  it('refreshes tokens when refresh token hash matches', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-3',
      email: 'manager@omnifood.ni',
      tenant_id: 'tenant-1',
      role: UserRole.MANAGER,
      hashed_refresh_token: 'stored-refresh',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-hash' as never);
    mockJwtService.signAsync
      .mockResolvedValueOnce('new-access')
      .mockResolvedValueOnce('new-refresh');

    const tokens = await service.refreshTokens('user-3', 'refresh-plain');

    expect(tokens).toMatchObject({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
    });
    expect(mockUserRepository.update).toHaveBeenCalledWith('user-3', {
      hashed_refresh_token: 'new-hash',
    });
  });

  it('rejects refresh when no stored refresh hash exists', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-4',
      email: 'owner@omnifood.ni',
      tenant_id: 'tenant-1',
      role: UserRole.OWNER,
      hashed_refresh_token: null,
    });

    await expect(service.refreshTokens('user-4', 'refresh')).rejects.toThrow(
      'Acceso denegado',
    );
  });
});
