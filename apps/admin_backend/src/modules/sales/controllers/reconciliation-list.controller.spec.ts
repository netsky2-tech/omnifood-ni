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
import { ValidationPipe } from '@nestjs/common';
import { ReconciliationListController } from './reconciliation-list.controller';
import { ReconciliationListService } from '../services/reconciliation-list.service';
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
 * Route: GET /sales/reports/reconciliations — paginated reconciliation
 * drill-down for the dashboard attention band. Guarded exactly like the
 * other dashboard-consumed report endpoints (browser AuthGuard chain,
 * OWNER/MANAGER, tenant from the verified JWT). The same ValidationPipe
 * configuration as main.ts (whitelist + transform) is registered so the
 * query DTO transforms page/limit to numbers exactly as production does.
 */
describe('ReconciliationListController', () => {
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
  let mockReconciliationListService: {
    getReconciliationList: jest.Mock;
  };

  const listResponse = {
    reconciliations: [
      {
        paymentId: 'pay-1',
        invoiceId: 'inv-1',
        invoiceNumber: 'PA-001',
        amount: 1500,
        amountNio: 1500,
        currency: 'NIO',
        method: 'card',
        voucherCode: 'VCH-1',
        reconciliationStatus: 'PENDIENTE',
        reconciledAt: null,
        reconciledByUserId: null,
        overrideSupervisorRef: null,
        createdAt: '2026-09-01T12:00:00.000Z',
      },
    ],
    pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
  };

  beforeAll(async () => {
    mockReconciliationListService = {
      getReconciliationList: jest.fn().mockResolvedValue(listResponse),
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
      controllers: [ReconciliationListController],
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
          provide: ReconciliationListService,
          useValue: mockReconciliationListService,
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
    // Mirror main.ts validation so query transforms behave like production.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
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
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ReconciliationListController),
    ).toEqual([AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard]);
    expect(
      Reflect.getMetadata(
        INTERCEPTORS_METADATA,
        ReconciliationListController,
      ),
    ).toEqual([TenantInterceptor]);
  });

  it('rejects unauthorized roles: 403 for CASHIER', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/reconciliations')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.CASHIER)}`)
      .expect(403);
  });

  it('rejects unauthorized roles: 403 for WAITER', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/reconciliations')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.WAITER)}`)
      .expect(403);
  });

  it('requires authentication', async () => {
    await request(getHttpServer())
      .get('/sales/reports/reconciliations')
      .expect(401);
  });

  it('returns the paginated reconciliation list for OWNER with tenant derived from the JWT', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get('/sales/reports/reconciliations')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(
      mockReconciliationListService.getReconciliationList,
    ).toHaveBeenCalledWith('tenant-1', {});
    expect(response.body).toEqual(listResponse);
    expect(response.body.reconciliations).toHaveLength(1);
    expect(response.body.pagination).toEqual({
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
    });
  });

  it('returns the paginated reconciliation list for MANAGER', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/reconciliations')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);
  });

  it('passes filters through: status, method, pagination and date range', async () => {
    const jwtService = app.get(JwtService);
    (
      mockReconciliationListService.getReconciliationList as jest.Mock
    ).mockClear();

    await request(getHttpServer())
      .get(
        '/sales/reports/reconciliations?status=MANUAL_OVERRIDE&method=card&page=2&limit=50&startDate=2026-09-01&endDate=2026-09-03',
      )
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
      .expect(200);

    expect(
      mockReconciliationListService.getReconciliationList,
    ).toHaveBeenCalledWith('tenant-1', {
      status: 'MANUAL_OVERRIDE',
      method: 'card',
      page: 2,
      limit: 50,
      startDate: '2026-09-01',
      endDate: '2026-09-03',
    });
  });

  it('rejects out-of-range pagination params (400)', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/reconciliations?limit=500')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
      .expect(400);
  });
});
