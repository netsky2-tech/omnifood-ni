import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, FindManyOptions } from 'typeorm';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { DeviceLinkingController } from '../../src/modules/onboarding/controllers/device-linking.controller';
import { DeviceLinkingService } from '../../src/modules/onboarding/services/device-linking.service';
import {
  DeviceLinkingCode,
  DeviceLinkingCodeStatus,
} from '../../src/modules/onboarding/entities/device-linking-code.entity';
import { DeviceLinkingRateLimiter } from '../../src/modules/onboarding/utils/linking-rate-limiter';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { PermissionsGuard } from '../../src/modules/identity/guards/permissions.guard';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { JWT_TOKEN_TYPES } from '../../src/modules/identity/security/jwt-token.types';
import { createIdentityJwtConfigProvider } from '../support/identity-jwt-test.fixture';

const API_PREFIX = '/api/onboarding/activation';

describe('DeviceLinking linking-codes listing (E2E)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  // In-memory simulated DB table for device_linking_codes.
  let dbLinkingCodes: DeviceLinkingCode[] = [];

  const linkingCodeRepo = {
    find: jest.fn(async (options: FindManyOptions<DeviceLinkingCode>) => {
      const where = options.where as { tenantId?: string } | undefined;
      const matching = dbLinkingCodes.filter(
        (row) => !where?.tenantId || row.tenantId === where.tenantId,
      );
      return matching
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(
          0,
          typeof options.take === 'number' ? options.take : matching.length,
        );
    }),
    insert: jest.fn(async () => undefined),
  };

  const dataSource = {
    transaction: jest.fn(async (cb: (manager: unknown) => Promise<unknown>) =>
      cb({
        query: jest.fn(async () => []),
        getRepository: () => linkingCodeRepo,
      }),
    ),
    getRepository: jest.fn(() => linkingCodeRepo),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET =
      'test-only-jwt-secret-with-at-least-thirty-two-bytes';
    process.env.JWT_ISSUER = 'omnifood-admin';
    process.env.JWT_AUDIENCE = 'omnifood-pos';
    process.env.JWT_ACCESS_TTL_SECONDS = '3600';
    process.env.JWT_REFRESH_TTL_SECONDS = '604800';
    process.env.JWT_CLOCK_TOLERANCE_SECONDS = '5';
    process.env.JWT_ALGORITHM = 'HS256';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [DeviceLinkingController],
      providers: [
        DeviceLinkingService,
        DeviceLinkingRateLimiter,
        createIdentityJwtConfigProvider(),
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        TenantInterceptor,
        AuthGuard,
        RolesGuard,
        PermissionsGuard,
        Reflector,
        JwtService,
        createIdentityJwtConfigProvider(),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = moduleFixture.get(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    dbLinkingCodes = [
      {
        id: 'code-newest',
        tenantId: 'tenant-A',
        codeHash: '$2b$10$hash-two',
        status: DeviceLinkingCodeStatus.CLAIMED,
        deviceId: 'POS-01',
        createdByUserId: 'user-1',
        expiresAt: new Date('2026-01-01T00:15:00Z'),
        claimedAt: new Date('2026-01-01T00:05:00Z'),
        createdAt: new Date('2026-01-01T00:03:00Z'),
        updatedAt: new Date('2026-01-01T00:05:00Z'),
      },
      {
        id: 'code-older',
        tenantId: 'tenant-A',
        codeHash: '$2b$10$hash-one',
        status: DeviceLinkingCodeStatus.ACTIVE,
        deviceId: null,
        createdByUserId: 'user-1',
        expiresAt: new Date('2026-01-01T00:10:00Z'),
        claimedAt: null,
        createdAt: new Date('2026-01-01T00:01:00Z'),
        updatedAt: new Date('2026-01-01T00:01:00Z'),
      },
      {
        id: 'code-other-tenant',
        tenantId: 'tenant-B',
        codeHash: '$2b$10$hash-three',
        status: DeviceLinkingCodeStatus.ACTIVE,
        deviceId: null,
        createdByUserId: 'user-2',
        expiresAt: new Date('2026-01-01T00:20:00Z'),
        claimedAt: null,
        createdAt: new Date('2026-01-01T00:09:00Z'),
        updatedAt: new Date('2026-01-01T00:09:00Z'),
      },
    ] as DeviceLinkingCode[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const signToken = (
    overrides: Partial<{
      sub: string;
      email: string;
      role: UserRole;
      tenant_id: string;
      custom_permissions?: string[];
    }> = {},
  ): string =>
    jwtService.sign(
      {
        sub: overrides.sub ?? 'user-1',
        email: overrides.email ?? 'owner@example.com',
        role: overrides.role ?? UserRole.OWNER,
        tenant_id:
          overrides.tenant_id !== undefined ? overrides.tenant_id : 'tenant-A',
        custom_permissions: overrides.custom_permissions,
        is_active: true,
        token_type: JWT_TOKEN_TYPES.ACCESS,
        security_version: 1,
      },
      {
        secret: process.env.JWT_SECRET,
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        expiresIn: '1h',
      },
    );

  it('returns 401 when unauthenticated', async () => {
    await request(app.getHttpServer())
      .get(`${API_PREFIX}/linking-codes`)
      .expect(401);
  });

  it('returns 403 when the user lacks ONBOARDING_ACTIVATION_MANAGE', async () => {
    const token = signToken({ role: UserRole.CASHIER });

    await request(app.getHttpServer())
      .get(`${API_PREFIX}/linking-codes`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 401 when the token lacks tenant context', async () => {
    const token = signToken({ tenant_id: '' });

    await request(app.getHttpServer())
      .get(`${API_PREFIX}/linking-codes`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('returns only the caller-tenant codes ordered by createdAt DESC without codeHash or tenantId', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .get(`${API_PREFIX}/linking-codes`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual([
      {
        id: 'code-newest',
        status: DeviceLinkingCodeStatus.CLAIMED,
        deviceId: 'POS-01',
        expiresAt: '2026-01-01T00:15:00.000Z',
        claimedAt: '2026-01-01T00:05:00.000Z',
        createdAt: '2026-01-01T00:03:00.000Z',
      },
      {
        id: 'code-older',
        status: DeviceLinkingCodeStatus.ACTIVE,
        deviceId: null,
        expiresAt: '2026-01-01T00:10:00.000Z',
        claimedAt: null,
        createdAt: '2026-01-01T00:01:00.000Z',
      },
    ]);
    for (const item of response.body) {
      expect(item).not.toHaveProperty('codeHash');
      expect(item).not.toHaveProperty('tenantId');
    }
  });
});
