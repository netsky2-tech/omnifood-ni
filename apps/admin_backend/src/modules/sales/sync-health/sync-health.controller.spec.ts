import { INestApplication } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SyncHealthController } from './sync-health.controller';
import { SyncHealthService } from './sync-health.service';
import { SyncFreshnessDto } from './sync-freshness.dto';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { CurrentUserAuthorizationService } from '../../identity/services/current-user-authorization.service';
import { UserRole } from '../../identity/entities/user.entity';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../../identity/config/identity-jwt.config';

/**
 * Route per architecture spec v0.3 §17.12: owner-facing operational
 * freshness read at GET /operations/sync/freshness, guarded exactly like
 * other dashboard-consumed endpoints (browser AuthGuard chain, OWNER/MANAGER,
 * tenant derived from the verified JWT).
 */
describe('SyncHealthController', () => {
  const jwtEnvironment = {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
    JWT_ISSUER: 'omnifood-admin-test',
    JWT_AUDIENCE: 'omnifood-pos-test',
    JWT_ACCESS_TTL_SECONDS: '3600',
    JWT_REFRESH_TTL_SECONDS: '604800',
    JWT_CLOCK_TOLERANCE_SECONDS: '5',
    JWT_ALGORITHM: 'HS256',
  } as const;
  const identityJwtConfig: IdentityJwtConfig = {
    secret: jwtEnvironment.JWT_SECRET,
    issuer: jwtEnvironment.JWT_ISSUER,
    audience: jwtEnvironment.JWT_AUDIENCE,
    accessTokenTtlSeconds: Number(jwtEnvironment.JWT_ACCESS_TTL_SECONDS),
    refreshTokenTtlSeconds: Number(jwtEnvironment.JWT_REFRESH_TTL_SECONDS),
    clockToleranceSeconds: Number(jwtEnvironment.JWT_CLOCK_TOLERANCE_SECONDS),
    algorithm: jwtEnvironment.JWT_ALGORITHM,
  };

  let app: INestApplication;
  let mockSyncHealthService: { getFreshness: jest.Mock };

  const freshnessResponse: SyncFreshnessDto = {
    state: 'COMPLETE',
    thresholdMinutes: 5,
    lastCompleteAt: '2026-09-01T11:58:00.000Z',
    hasDeclaredGaps: false,
    perTerminal: [
      {
        terminalId: 'pos-01',
        label: 'pos-01',
        state: 'COMPLETE',
        acceptedThroughSequence: 42,
        lastReceiptAt: '2026-09-01T11:58:00.000Z',
        hasDeclaredGaps: false,
      },
    ],
    evaluatedAt: '2026-09-01T12:00:00.000Z',
  };

  beforeAll(async () => {
    mockSyncHealthService = {
      getFreshness: jest.fn().mockResolvedValue(freshnessResponse),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: jwtEnvironment.JWT_SECRET,
          signOptions: {
            algorithm: jwtEnvironment.JWT_ALGORITHM,
            issuer: jwtEnvironment.JWT_ISSUER,
            audience: jwtEnvironment.JWT_AUDIENCE,
          },
        }),
      ],
      controllers: [SyncHealthController],
      providers: [
        Reflector,
        RolesGuard,
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn((token: unknown) => token) },
        },
        {
          provide: SyncHealthService,
          useValue: mockSyncHealthService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: keyof typeof jwtEnvironment) => jwtEnvironment[key],
          },
        },
        {
          provide: IDENTITY_JWT_CONFIG,
          useValue: identityJwtConfig,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const signToken = (jwtService: JwtService, role: UserRole) =>
    jwtService.sign({
      sub: 'user-1',
      email: 'owner@example.com',
      role,
      tenant_id: 'tenant-1',
      is_active: true,
      token_type: 'access',
      security_version: 1,
    });

  const getHttpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  it('is guarded by the same guard chain as other dashboard endpoints', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SyncHealthController)).toEqual([
      AuthGuard,
      AuthoritativeCurrentUserGuard,
      RolesGuard,
    ]);
    expect(
      Reflect.getMetadata(INTERCEPTORS_METADATA, SyncHealthController),
    ).toEqual([TenantInterceptor]);
  });

  it('returns 403 for CASHIER role', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/operations/sync/freshness')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.CASHIER)}`)
      .expect(403);
  });

  it('returns 403 for WAITER role', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/operations/sync/freshness')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.WAITER)}`)
      .expect(403);
  });

  it('requires authentication', async () => {
    await request(getHttpServer())
      .get('/operations/sync/freshness')
      .expect(401);
  });

  it('returns the freshness report for OWNER with tenant derived from the JWT', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get('/operations/sync/freshness')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(mockSyncHealthService.getFreshness).toHaveBeenCalledWith('tenant-1');
    expect(response.body).toEqual(freshnessResponse);
  });

  it('returns the freshness report for MANAGER', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/operations/sync/freshness')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);
  });
});
