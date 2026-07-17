import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  JwtService,
  type JwtSignOptions,
  type JwtVerifyOptions,
} from '@nestjs/jwt';
import { DataSource, type EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User, UserRole } from '../entities/user.entity';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../config/identity-jwt.config';
import { JWT_TOKEN_TYPES } from '../security/jwt-token.types';
import * as refreshTokenVerifier from '../security/refresh-token-verifier';

const jwtConfig: IdentityJwtConfig = {
  secret: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  issuer: 'omnifood-admin-test',
  audience: 'omnifood-pos-test',
  accessTokenTtlSeconds: 60 * 60,
  refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
  clockToleranceSeconds: 5,
  algorithm: 'HS256',
};

const realJwtService = new JwtService();
const anyString = expect.any(String) as unknown as string;

const createRefreshJwt = (
  subject: string,
  overrides: Record<string, unknown> = {},
  options: {
    secret?: string;
    algorithm?: 'HS256' | 'HS384';
    issuer?: string;
    audience?: string;
    expiresIn?: number;
    jwtid?: string;
    includeJti?: boolean;
  } = {},
) =>
  realJwtService.signAsync(
    {
      sub: subject,
      token_type: JWT_TOKEN_TYPES.REFRESH,
      ...overrides,
    },
    {
      secret: options.secret ?? jwtConfig.secret,
      algorithm: options.algorithm ?? jwtConfig.algorithm,
      issuer: options.issuer ?? jwtConfig.issuer,
      audience: options.audience ?? jwtConfig.audience,
      ...(options.includeJti === false
        ? {}
        : { jwtid: options.jwtid ?? 'test-refresh-jti' }),
      ...(options.expiresIn === undefined
        ? {}
        : { expiresIn: options.expiresIn }),
    },
  );

const createLockedRepository = (overrides: Record<string, unknown>) => ({
  findOne: jest.fn().mockResolvedValue({
    id: 'refresh-user',
    email: 'refresh@omnifood.ni',
    tenant_id: 'tenant-1',
    role: UserRole.MANAGER,
    is_active: true,
    security_version: 1,
    hashed_refresh_token: 'active-hash',
    refresh_token_family_id: 'family-active',
    refresh_token_revoked_at: null,
    ...overrides,
  }),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
});

type TransactionCallback = (manager: EntityManager) => unknown;

describe('AuthService', () => {
  let service: AuthService;
  let mockUserRepository: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let mockJwtService: {
    signAsync: jest.Mock;
    verifyAsync: jest.Mock;
  };
  let mockDataSource: {
    transaction: jest.Mock<unknown, [TransactionCallback]>;
  };
  const useLockedRepository = (
    repository: ReturnType<typeof createLockedRepository>,
  ) =>
    mockDataSource.transaction.mockImplementation((callback) =>
      callback({
        getRepository: jest.fn().mockReturnValue(repository),
      } as unknown as EntityManager),
    );

  beforeEach(async () => {
    mockUserRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    mockJwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };
    mockDataSource = {
      transaction: jest.fn<unknown, [TransactionCallback]>(),
    };
    mockDataSource.transaction.mockImplementation((callback) =>
      callback({
        getRepository: jest.fn().mockReturnValue(mockUserRepository),
      } as unknown as EntityManager),
    );

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
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: IDENTITY_JWT_CONFIG,
          useValue: jwtConfig,
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
      permissions: [],
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
    )) as unknown as Array<{
      security_profile: Record<string, unknown> | null;
    }>;

    expect(qb.addSelect).not.toHaveBeenCalledWith('security_profile.pin_hash');
    expect(result[0].security_profile).toMatchObject({
      user_id: 'u-2',
      pin_hash: null,
      totp_secret_seed: null,
      is_totp_enabled: true,
      is_pin_enabled: true,
    });
    expect(result[0]).toMatchObject({
      permissions: [],
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
    const scopedResult = result as unknown as {
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
    expect(scopedResult.staff[1]).toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      permissions: expect.arrayContaining(['inventory.boh.shell']),
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
    )) as unknown as Array<{
      security_profile: Record<string, unknown> | null;
    }>;

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
    )) as unknown as Array<{
      security_profile: Record<string, unknown> | null;
    }>;

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
    const scopedResult = result as unknown as {
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
    )) as unknown as Array<{
      security_profile: Record<string, unknown> | null;
    }>;

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
      is_active: true,
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
    expect(mockUserRepository.update).toHaveBeenCalled();
    expect(mockJwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      {
        sub: 'user-1',
        email: 'cashier@omnifood.ni',
        tenant_id: 'tenant-1',
        role: UserRole.CASHIER,
        is_active: true,
        token_type: JWT_TOKEN_TYPES.ACCESS,
        security_version: 1,
      },
      {
        expiresIn: 60 * 60,
        algorithm: 'HS256',
        issuer: 'omnifood-admin-test',
        audience: 'omnifood-pos-test',
      },
    );
    expect(mockJwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sub: 'user-1',
        email: 'cashier@omnifood.ni',
        tenant_id: 'tenant-1',
        role: UserRole.CASHIER,
        is_active: true,
        token_type: JWT_TOKEN_TYPES.REFRESH,
      }),
      {
        expiresIn: 7 * 24 * 60 * 60,
        algorithm: 'HS256',
        issuer: 'omnifood-admin-test',
        audience: 'omnifood-pos-test',
        jwtid: anyString,
      },
    );
  });

  it('routes login refresh persistence through the canonical verifier', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'verifier-login-user',
      email: 'verifier-login@omnifood.ni',
      name: 'Verifier Login',
      password_hash: 'stored-password-hash',
      role: UserRole.CASHIER,
      tenant_id: 'tenant-1',
      is_active: true,
      security_version: 3,
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    const hash = jest
      .spyOn(refreshTokenVerifier, 'hashRefreshTokenVerifier')
      .mockResolvedValue('canonical-refresh-verifier');
    mockJwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('login-refresh-token');

    await service.login('verifier-login@omnifood.ni', 'Password123!');

    expect(hash).toHaveBeenCalledWith('login-refresh-token');
    expect(mockUserRepository.update).toHaveBeenCalledWith(
      'verifier-login-user',
      expect.objectContaining({
        hashed_refresh_token: 'canonical-refresh-verifier',
      }),
    );
  });

  it('rejects login when password compare fails', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-2',
      email: 'waiter@omnifood.ni',
      password_hash: 'stored-hash',
      role: UserRole.WAITER,
      tenant_id: 'tenant-1',
      is_active: true,
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    await expect(service.login('waiter@omnifood.ni', 'wrong')).rejects.toThrow(
      'Credenciales inválidas',
    );
  });

  const useRealJwtVerification = () => {
    mockJwtService.verifyAsync.mockImplementation(
      (token: string, options?: JwtVerifyOptions) =>
        realJwtService.verifyAsync<Record<string, unknown>>(token, options),
    );
  };

  const useRealJwtSigning = () => {
    const sign = (payload: Record<string, unknown>, options?: JwtSignOptions) =>
      realJwtService.signAsync(payload, {
        ...options,
        secret: jwtConfig.secret,
      });
    mockJwtService.signAsync.mockImplementation(sign);
  };

  it('issues distinct registered refresh jti values in the same second without changing access claims', async () => {
    jest
      .useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
      .setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    try {
      useRealJwtSigning();

      const first = await service.getTokens(
        'same-second-user',
        'same-second@omnifood.ni',
        'tenant-1',
        UserRole.MANAGER,
        true,
        9,
        'family-same-second',
      );
      const second = await service.getTokens(
        'same-second-user',
        'same-second@omnifood.ni',
        'tenant-1',
        UserRole.MANAGER,
        true,
        9,
        'family-same-second',
      );

      const firstRefresh = await realJwtService.verifyAsync<
        Record<string, unknown>
      >(first.refresh_token, {
        secret: jwtConfig.secret,
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
      });
      const secondRefresh = await realJwtService.verifyAsync<
        Record<string, unknown>
      >(second.refresh_token, {
        secret: jwtConfig.secret,
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
      });
      const access = await realJwtService.verifyAsync<Record<string, unknown>>(
        first.access_token,
        {
          secret: jwtConfig.secret,
          issuer: jwtConfig.issuer,
          audience: jwtConfig.audience,
        },
      );

      expect(first.refresh_token).not.toBe(second.refresh_token);
      expect(firstRefresh.jti).toEqual(expect.any(String));
      expect(firstRefresh.jti).not.toBe('');
      expect(firstRefresh.jti).not.toBe(secondRefresh.jti);
      expect(access).toMatchObject({
        token_type: JWT_TOKEN_TYPES.ACCESS,
        security_version: 9,
        iss: jwtConfig.issuer,
        aud: jwtConfig.audience,
      });
      expect(access.jti).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['empty', () => createRefreshJwt('user-3', {}, { jwtid: '' })],
    ['whitespace', () => createRefreshJwt('user-3', {}, { jwtid: '   ' })],
    [
      'non-string',
      () =>
        realJwtService.signAsync(
          { sub: 'user-3', token_type: JWT_TOKEN_TYPES.REFRESH, jti: 4 },
          {
            secret: jwtConfig.secret,
            algorithm: jwtConfig.algorithm,
            issuer: jwtConfig.issuer,
            audience: jwtConfig.audience,
          },
        ),
    ],
  ])(
    'rejects %s refresh jti before repository, bcrypt, signing, or persistence',
    async (_caseName, createToken) => {
      useRealJwtVerification();
      const compare = jest.spyOn(bcrypt, 'compare');
      const token = await createToken();

      await expect(service.refreshTokens('user-3', token)).rejects.toThrow(
        'Acceso denegado',
      );

      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
      expect(compare).not.toHaveBeenCalled();
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['malformed token', () => Promise.resolve('not-a-jwt')],
    [
      'invalid signature',
      () => createRefreshJwt('user-3', {}, { secret: 'different-test-secret' }),
    ],
    [
      'expired token beyond the configured clock tolerance',
      () => createRefreshJwt('user-3', {}, { expiresIn: -6 }),
    ],
    [
      'wrong issuer',
      () => createRefreshJwt('user-3', {}, { issuer: 'other-issuer' }),
    ],
    [
      'wrong audience',
      () => createRefreshJwt('user-3', {}, { audience: 'other-audience' }),
    ],
    [
      'non-HS256 algorithm',
      () => createRefreshJwt('user-3', {}, { algorithm: 'HS384' }),
    ],
  ])(
    'rejects %s before repository, bcrypt, signing, or persistence',
    async (_caseName, createToken) => {
      useRealJwtVerification();
      const compare = jest.spyOn(bcrypt, 'compare');
      const token = await createToken();

      await expect(service.refreshTokens('user-3', token)).rejects.toThrow(
        'Acceso denegado',
      );

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
        token,
        expect.objectContaining({
          secret: jwtConfig.secret,
          algorithms: ['HS256'],
          issuer: jwtConfig.issuer,
          audience: jwtConfig.audience,
          clockTolerance: jwtConfig.clockToleranceSeconds,
        }),
      );
      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
      expect(compare).not.toHaveBeenCalled();
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'access type',
      () => createRefreshJwt('user-3', { token_type: JWT_TOKEN_TYPES.ACCESS }),
    ],
    ['typeless', () => createRefreshJwt('user-3', { token_type: undefined })],
    ['empty subject', () => createRefreshJwt('')],
    ['mismatched subject', () => createRefreshJwt('other-user')],
  ])(
    'rejects %s refresh payload before repository, bcrypt, signing, or persistence',
    async (_caseName, createToken) => {
      useRealJwtVerification();
      const compare = jest.spyOn(bcrypt, 'compare');
      const token = await createToken();

      await expect(service.refreshTokens('user-3', token)).rejects.toThrow(
        'Acceso denegado',
      );

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
        token,
        expect.objectContaining({ secret: jwtConfig.secret }),
      );
      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
      expect(compare).not.toHaveBeenCalled();
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    },
  );

  it('refreshes tokens when a verified refresh JWT subject and refresh hash match', async () => {
    useRealJwtVerification();
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-3',
      email: 'manager@omnifood.ni',
      tenant_id: 'tenant-1',
      role: UserRole.MANAGER,
      is_active: true,
      hashed_refresh_token: 'stored-refresh',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-hash' as never);
    mockJwtService.signAsync
      .mockResolvedValueOnce('new-access')
      .mockResolvedValueOnce('new-refresh');

    const refreshToken = await createRefreshJwt('user-3');
    const tokens = await service.refreshTokens('user-3', refreshToken);

    expect(tokens).toMatchObject({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
    });
    expect(mockUserRepository.update).toHaveBeenCalledWith(
      'user-3',
      expect.objectContaining({
        hashed_refresh_token: 'new-hash',
      }),
    );
  });

  it('routes modern rotation comparison and successor persistence through the canonical verifier', async () => {
    useRealJwtVerification();
    const lockedRepository = createLockedRepository({ id: 'modern-user' });
    useLockedRepository(lockedRepository);
    const compare = jest
      .spyOn(refreshTokenVerifier, 'compareRefreshTokenVerifier')
      .mockResolvedValue(true);
    const hash = jest
      .spyOn(refreshTokenVerifier, 'hashRefreshTokenVerifier')
      .mockResolvedValue('modern-successor-verifier');
    mockJwtService.signAsync
      .mockResolvedValueOnce('modern-access-token')
      .mockResolvedValueOnce('modern-successor-token');
    const refreshToken = await createRefreshJwt('modern-user', {
      refresh_token_family_id: 'family-active',
    });

    await expect(
      service.refreshTokens('modern-user', refreshToken),
    ).resolves.toEqual({
      access_token: 'modern-access-token',
      refresh_token: 'modern-successor-token',
    });

    expect(compare).toHaveBeenCalledWith(refreshToken, 'active-hash');
    expect(hash).toHaveBeenCalledWith('modern-successor-token');
    expect(lockedRepository.update).toHaveBeenCalledWith(
      'modern-user',
      expect.objectContaining({
        hashed_refresh_token: 'modern-successor-verifier',
      }),
    );
  });

  it('migrates a matching pre-jti bearer into the stable persisted refresh family', async () => {
    useRealJwtVerification();
    const lockedRepository = createLockedRepository({
      id: 'legacy-user',
      security_version: 8,
      hashed_refresh_token: 'legacy-hash',
      refresh_token_family_id: 'family-active',
    });
    useLockedRepository(lockedRepository);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('upgraded-hash' as never);
    mockJwtService.signAsync
      .mockResolvedValueOnce('upgraded-access')
      .mockResolvedValueOnce('upgraded-refresh');

    await expect(
      service.refreshTokens(
        'legacy-user',
        await createRefreshJwt(
          'legacy-user',
          { refresh_token_family_id: 'family-active' },
          { includeJti: false },
        ),
      ),
    ).resolves.toEqual({
      access_token: 'upgraded-access',
      refresh_token: 'upgraded-refresh',
    });
    expect(mockJwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ security_version: 8 }),
      expect.any(Object),
    );
    const refreshClaims = (
      Reflect.get(mockJwtService.signAsync.mock, 'calls') as [
        unknown,
        [{ refresh_token_family_id: string }],
      ]
    )[1][0];
    const update = (
      Reflect.get(lockedRepository.update.mock, 'calls') as [
        [unknown, { refresh_token_family_id: string }],
      ]
    )[0][1];
    expect(refreshClaims.refresh_token_family_id).toBe(
      update.refresh_token_family_id,
    );
    expect(update.refresh_token_family_id).toBe('family-active');
  });

  it('routes pre-jti bridge comparison and successor persistence through the canonical verifier', async () => {
    useRealJwtVerification();
    const lockedRepository = createLockedRepository({
      id: 'legacy-verifier-user',
    });
    useLockedRepository(lockedRepository);
    const compare = jest
      .spyOn(refreshTokenVerifier, 'compareRefreshTokenVerifier')
      .mockResolvedValue(true);
    const hash = jest
      .spyOn(refreshTokenVerifier, 'hashRefreshTokenVerifier')
      .mockResolvedValue('legacy-successor-verifier');
    mockJwtService.signAsync
      .mockResolvedValueOnce('legacy-access-token')
      .mockResolvedValueOnce('legacy-successor-token');
    const refreshToken = await createRefreshJwt(
      'legacy-verifier-user',
      { refresh_token_family_id: 'family-active' },
      { includeJti: false },
    );

    await service.refreshTokens('legacy-verifier-user', refreshToken);

    expect(compare).toHaveBeenCalledWith(refreshToken, 'active-hash');
    expect(hash).toHaveBeenCalledWith('legacy-successor-token');
  });

  it('rejects a family-less pre-jti token without rotating an active stored family', async () => {
    useRealJwtVerification();
    const lockedRepository = createLockedRepository({ id: 'isolated-user' });
    useLockedRepository(lockedRepository);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    await expect(
      service.refreshTokens(
        'isolated-user',
        await createRefreshJwt('isolated-user', {}, { includeJti: false }),
      ),
    ).rejects.toThrow('Acceso denegado');

    expect(lockedRepository.update).not.toHaveBeenCalled();
    expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    const activeUser = (await lockedRepository.findOne()) as {
      refresh_token_family_id: string;
    };
    expect(activeUser.refresh_token_family_id).toBe('family-active');
  });

  it('does not rotate a hash match when its signed family is foreign', async () => {
    useRealJwtVerification();
    const lockedRepository = createLockedRepository({ id: 'bound-user' });
    useLockedRepository(lockedRepository);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    await expect(
      service.refreshTokens(
        'bound-user',
        await createRefreshJwt('bound-user', {
          refresh_token_family_id: 'family-foreign',
        }),
      ),
    ).rejects.toThrow('Acceso denegado');

    expect(lockedRepository.update).not.toHaveBeenCalled();
    expect(mockJwtService.signAsync).not.toHaveBeenCalled();
  });

  it('serializes one pre-jti winner and revokes its replaying loser', async () => {
    useRealJwtVerification();
    useRealJwtSigning();
    let committed = false;
    const consumed = await createRefreshJwt(
      'retry-user',
      { refresh_token_family_id: 'family-active' },
      { includeJti: false },
    );
    const lockedRepository = createLockedRepository({
      id: 'retry-user',
      security_version: 7,
      hashed_refresh_token:
        await refreshTokenVerifier.hashRefreshTokenVerifier(consumed),
    });
    let state = (await lockedRepository.findOne()) as Record<string, unknown>;
    lockedRepository.findOne.mockImplementation(() => Promise.resolve(state));
    mockDataSource.transaction.mockImplementation(async (callback) => {
      const before = { ...state };
      const staged = { ...state };
      lockedRepository.update.mockImplementation((_id, update) =>
        Promise.resolve(Object.assign(staged, update)),
      );
      try {
        const outcome = await callback({
          getRepository: jest.fn().mockReturnValue(lockedRepository),
        } as unknown as EntityManager);
        state = staged;
        committed = true;
        return outcome;
      } catch (error: unknown) {
        state = before;
        throw error;
      }
    });
    await service.refreshTokens('retry-user', consumed);
    expect(lockedRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(mockJwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ security_version: 7 }),
      expect.any(Object),
    );
    committed = false;
    await expect(service.refreshTokens('retry-user', consumed)).rejects.toThrow(
      'Acceso denegado',
    );
    expect(committed).toBe(true);
    expect(mockJwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ refresh_token_family_id: 'family-active' }),
      expect.objectContaining({ jwtid: anyString }),
    );
    expect(state).toMatchObject({
      hashed_refresh_token: null,
      refresh_token_family_id: null,
    });
    expect(state.refresh_token_revoked_at).toBeInstanceOf(Date);
  });

  it('rejects refresh when no stored refresh hash exists', async () => {
    useRealJwtVerification();
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-4',
      email: 'owner@omnifood.ni',
      tenant_id: 'tenant-1',
      role: UserRole.OWNER,
      is_active: true,
      hashed_refresh_token: null,
    });

    const compare = jest.spyOn(bcrypt, 'compare');
    const refreshToken = await createRefreshJwt('user-4');

    await expect(service.refreshTokens('user-4', refreshToken)).rejects.toThrow(
      'Acceso denegado',
    );

    expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
      refreshToken,
      expect.objectContaining({ secret: jwtConfig.secret }),
    );
    expect(mockUserRepository.findOne).toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
    expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    expect(mockUserRepository.update).not.toHaveBeenCalled();
  });

  it('rejects inactive users before comparing, signing, or rotating refresh tokens', async () => {
    useRealJwtVerification();
    mockUserRepository.findOne.mockResolvedValue({
      id: 'inactive-user',
      email: 'inactive@omnifood.ni',
      tenant_id: 'tenant-1',
      role: UserRole.CASHIER,
      is_active: false,
      hashed_refresh_token: 'stored-refresh',
    });
    const compare = jest.spyOn(bcrypt, 'compare');

    const refreshToken = await createRefreshJwt('inactive-user');

    await expect(
      service.refreshTokens('inactive-user', refreshToken),
    ).rejects.toThrow('Acceso denegado');

    expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
      refreshToken,
      expect.objectContaining({ secret: jwtConfig.secret }),
    );
    expect(mockUserRepository.findOne).toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
    expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    expect(mockUserRepository.update).not.toHaveBeenCalled();
  });

  it('rejects a verified refresh token with a mismatched hash without an oracle or downstream update', async () => {
    useRealJwtVerification();
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-5',
      email: 'manager@omnifood.ni',
      tenant_id: 'tenant-1',
      role: UserRole.MANAGER,
      is_active: true,
      hashed_refresh_token: 'stored-refresh',
    });
    const compare = jest
      .spyOn(refreshTokenVerifier, 'compareRefreshTokenVerifier')
      .mockResolvedValue(false);
    const refreshToken = await createRefreshJwt('user-5');

    await expect(service.refreshTokens('user-5', refreshToken)).rejects.toThrow(
      'Acceso denegado',
    );

    expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
      refreshToken,
      expect.objectContaining({ secret: jwtConfig.secret }),
    );
    expect(mockUserRepository.findOne).toHaveBeenCalled();
    expect(compare).toHaveBeenCalledWith(refreshToken, 'stored-refresh');
    expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    expect(mockUserRepository.update).not.toHaveBeenCalled();
  });

  it('rejects inactive users before issuing login tokens', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'inactive-user',
      email: 'inactive@omnifood.ni',
      password_hash: 'stored-hash',
      role: UserRole.CASHIER,
      tenant_id: 'tenant-1',
      is_active: false,
    });

    await expect(
      service.login('inactive@omnifood.ni', 'Password123!'),
    ).rejects.toThrow('Credenciales inválidas');
    expect(mockJwtService.signAsync).not.toHaveBeenCalled();
  });
});
