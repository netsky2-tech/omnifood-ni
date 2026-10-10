import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuditSummaryController } from './audit-summary.controller';
import { AuditSummaryService } from './audit-summary.service';
import { AuditEventsService } from './audit-events.service';
import { AuditLogsService } from './audit-logs.service';
import { AuthGuard } from '../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { CurrentUserAuthorizationService } from '../identity/services/current-user-authorization.service';
import { UserRole } from '../identity/entities/user.entity';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../identity/config/identity-jwt.config';

/**
 * Route per architecture spec v0.3 §16 (route name per module conventions):
 * GET /operations/audit/summary, guarded exactly like the other
 * dashboard-consumed endpoints and the existing audit-view policy
 * (browser AuthGuard chain, OWNER/MANAGER, tenant from the verified JWT).
 */
describe('AuditSummaryController', () => {
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
  let mockAuditSummaryService: { getExecutiveSummary: jest.Mock };
  let mockAuditEventsService: { getEvents: jest.Mock };
  let mockAuditLogsService: { getLedger: jest.Mock; getIntegrityAlerts: jest.Mock };

  const summaryResponse = {
    criticalCount: 1,
    warningCount: 2,
    infoCount: 3,
    latestHighSeverity: {
      id: 'log-1',
      category: 'ONBOARDING_ACTIVATION_CHECK_FAILED',
      severity: 'CRITICAL',
      occurredAt: '2026-09-01T11:58:00.000Z',
    },
    generatedAt: '2026-09-01T12:00:00.000Z',
  };

  beforeAll(async () => {
    mockAuditSummaryService = {
      getExecutiveSummary: jest.fn().mockResolvedValue(summaryResponse),
    };
    mockAuditEventsService = {
      getEvents: jest.fn().mockResolvedValue({ events: [], generatedAt: '2026-09-01T12:00:00.000Z' }),
    };
    mockAuditLogsService = {
      getLedger: jest.fn().mockResolvedValue({
        entries: [],
        limit: 50,
        truncated: false,
        generatedAt: '2026-09-01T12:00:00.000Z',
      }),
      getIntegrityAlerts: jest.fn().mockResolvedValue({
        alerts: [],
        generatedAt: '2026-09-01T12:00:00.000Z',
      }),
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
      controllers: [AuditSummaryController],
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
          provide: AuditSummaryService,
          useValue: mockAuditSummaryService,
        },
        {
          provide: AuditEventsService,
          useValue: mockAuditEventsService,
        },
        {
          provide: AuditLogsService,
          useValue: mockAuditLogsService,
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
    // Mirror main.ts: the query-param DTO contract (severity taxonomy, page
    // cap) is enforced by the global ValidationPipe in production.
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
      Reflect.getMetadata(GUARDS_METADATA, AuditSummaryController),
    ).toEqual([AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard]);
    expect(
      Reflect.getMetadata(INTERCEPTORS_METADATA, AuditSummaryController),
    ).toEqual([TenantInterceptor]);
  });

  it('returns 403 for CASHIER role', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/operations/audit/summary')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.CASHIER)}`)
      .expect(403);
  });

  it('returns 403 for WAITER role', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/operations/audit/summary')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.WAITER)}`)
      .expect(403);
  });

  it('requires authentication', async () => {
    await request(getHttpServer()).get('/operations/audit/summary').expect(401);
  });

  it('returns the executive summary for OWNER with tenant derived from the JWT', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get('/operations/audit/summary')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(mockAuditSummaryService.getExecutiveSummary).toHaveBeenCalledWith(
      'tenant-1',
      undefined,
      undefined,
    );
    expect(response.body).toEqual(summaryResponse);
  });

  it('returns the executive summary for MANAGER', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/operations/audit/summary')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);
  });

  it('forwards the selected reporting period (spec §16.3)', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/operations/audit/summary')
      .query({ startDate: '2026-08-01', endDate: '2026-08-31' })
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
      .expect(200);

    expect(
      mockAuditSummaryService.getExecutiveSummary,
    ).toHaveBeenLastCalledWith('tenant-1', '2026-08-01', '2026-08-31');
  });

  // Slice 6b (finding H6): GET /operations/audit/events backs the dashboard
  // audit page on the SAME controller, guard chain, roles and JWT-derived
  // tenant as the summary route.
  describe('GET /operations/audit/events', () => {
    const eventsResponse = {
      events: [
        {
          id: 'log-1',
          occurredAt: '2026-09-01T11:58:00.000Z',
          actorEmail: 'owner@example.com',
          actorRef: null,
          action: 'ONBOARDING_ACTIVATION_CHECK_FAILED',
          severity: 'CRITICAL',
          targetType: 'ActivationAttempt',
          targetId: 'attempt-1',
        },
      ],
      generatedAt: '2026-09-01T12:00:00.000Z',
    };

    beforeEach(() => {
      mockAuditEventsService.getEvents.mockClear();
      mockAuditEventsService.getEvents.mockResolvedValue(eventsResponse);
    });

    it('requires authentication', async () => {
      await request(getHttpServer()).get('/operations/audit/events').expect(401);
    });

    it('returns 403 for CASHIER role', async () => {
      const jwtService = app.get(JwtService);
      await request(getHttpServer())
        .get('/operations/audit/events')
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.CASHIER)}`)
        .expect(403);
    });

    it('returns 403 for WAITER role', async () => {
      const jwtService = app.get(JwtService);
      await request(getHttpServer())
        .get('/operations/audit/events')
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.WAITER)}`)
        .expect(403);
    });

    it('returns the event list for OWNER with tenant derived from the JWT', async () => {
      const jwtService = app.get(JwtService);
      const response = await request(getHttpServer())
        .get('/operations/audit/events')
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(mockAuditEventsService.getEvents).toHaveBeenCalledWith(
        'tenant-1',
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(response.body).toEqual(eventsResponse);
    });

    it('returns the event list for MANAGER', async () => {
      const jwtService = app.get(JwtService);
      await request(getHttpServer())
        .get('/operations/audit/events')
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
        .expect(200);
    });

    it('forwards the period, severity filter and page cap', async () => {
      const jwtService = app.get(JwtService);
      await request(getHttpServer())
        .get('/operations/audit/events')
        .query({
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          severity: 'WARNING',
          limit: '25',
        })
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
        .expect(200);

      expect(
        mockAuditEventsService.getEvents,
      ).toHaveBeenLastCalledWith('tenant-1', '2026-08-01', '2026-08-31', 'WARNING', 25);
    });

    it('rejects a severity outside the single classifier taxonomy with 400', async () => {
      const jwtService = app.get(JwtService);
      await request(getHttpServer())
        .get('/operations/audit/events')
        .query({ severity: 'SEVERE' })
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
        .expect(400);
      expect(mockAuditEventsService.getEvents).not.toHaveBeenCalled();
    });

    it('rejects a page cap above the documented maximum with 400', async () => {
      const jwtService = app.get(JwtService);
      await request(getHttpServer())
        .get('/operations/audit/events')
        .query({ limit: '250' })
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
        .expect(400);
      expect(mockAuditEventsService.getEvents).not.toHaveBeenCalled();
    });
  });

  // S4a: GET /operations/audit/ledger projects the POS forensic audit ledger
  // (audit_logs, hash-chained via POST /identity/audit) into the owner
  // dashboard — the second, correct source beside the change_log stream.
  describe('GET /operations/audit/ledger', () => {
    const ledgerResponse = {
      entries: [
        {
          id: 'log-1',
          occurredAt: '2026-09-01T11:58:00.000Z',
          actorEmail: 'cashier@example.com',
          actorUserId: 'user-uuid-1',
          action: 'SALE_VOIDED',
          severity: 'CRITICAL',
          targetType: 'invoice',
          targetId: 'inv-001',
          deviceId: 'POS-1',
          sequenceNo: 7,
        },
      ],
      limit: 50,
      truncated: false,
      generatedAt: '2026-09-01T12:00:00.000Z',
    };

    beforeEach(() => {
      mockAuditLogsService.getLedger.mockClear();
      mockAuditLogsService.getLedger.mockResolvedValue(ledgerResponse);
    });

    it('requires authentication', async () => {
      await request(getHttpServer()).get('/operations/audit/ledger').expect(401);
    });

    it('returns 403 for CASHIER role', async () => {
      const jwtService = app.get(JwtService);
      await request(getHttpServer())
        .get('/operations/audit/ledger')
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.CASHIER)}`)
        .expect(403);
    });

    it('returns the ledger for OWNER with tenant derived from the JWT', async () => {
      const jwtService = app.get(JwtService);
      const response = await request(getHttpServer())
        .get('/operations/audit/ledger')
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(mockAuditLogsService.getLedger).toHaveBeenCalledWith('tenant-1', {
        startDate: undefined,
        endDate: undefined,
        actorUserId: undefined,
        targetType: undefined,
        targetId: undefined,
        action: undefined,
        limitInput: undefined,
      });
      expect(response.body).toEqual(ledgerResponse);
    });

    it('returns the ledger for MANAGER', async () => {
      const jwtService = app.get(JwtService);
      await request(getHttpServer())
        .get('/operations/audit/ledger')
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
        .expect(200);
    });

    it('forwards every optional filter and the page cap', async () => {
      const jwtService = app.get(JwtService);
      await request(getHttpServer())
        .get('/operations/audit/ledger')
        .query({
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          actorUserId: 'user-uuid-2',
          targetType: 'invoice',
          targetId: 'inv-42',
          action: 'SALE_VOIDED',
          limit: '25',
        })
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
        .expect(200);

      expect(mockAuditLogsService.getLedger).toHaveBeenLastCalledWith(
        'tenant-1',
        {
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          actorUserId: 'user-uuid-2',
          targetType: 'invoice',
          targetId: 'inv-42',
          action: 'SALE_VOIDED',
          limitInput: 25,
        },
      );
    });

    it('rejects a page cap above the documented maximum with 400', async () => {
      const jwtService = app.get(JwtService);
      await request(getHttpServer())
        .get('/operations/audit/ledger')
        .query({ limit: '250' })
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
        .expect(400);
      expect(mockAuditLogsService.getLedger).not.toHaveBeenCalled();
    });
  });

  // S4a: GET /operations/audit/integrity surfaces the nightly gap detection
  // state (audit_integrity_alerts) — read-only, same guard chain and roles.
  describe('GET /operations/audit/integrity', () => {
    const integrityResponse = {
      alerts: [
        {
          id: 'alert-1',
          deviceId: 'POS-1',
          actorUserId: 'user-uuid-1',
          gapStart: 41,
          gapEnd: 44,
          firstDetectedAt: '2026-09-01T08:00:00.000Z',
          lastSeenAt: '2026-09-02T08:00:00.000Z',
        },
      ],
      generatedAt: '2026-09-01T12:00:00.000Z',
    };

    beforeEach(() => {
      mockAuditLogsService.getIntegrityAlerts.mockClear();
      mockAuditLogsService.getIntegrityAlerts.mockResolvedValue(
        integrityResponse,
      );
    });

    it('requires authentication', async () => {
      await request(getHttpServer())
        .get('/operations/audit/integrity')
        .expect(401);
    });

    it('returns 403 for CASHIER role', async () => {
      const jwtService = app.get(JwtService);
      await request(getHttpServer())
        .get('/operations/audit/integrity')
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.CASHIER)}`)
        .expect(403);
    });

    it('returns the integrity alert state for OWNER with tenant derived from the JWT', async () => {
      const jwtService = app.get(JwtService);
      const response = await request(getHttpServer())
        .get('/operations/audit/integrity')
        .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(mockAuditLogsService.getIntegrityAlerts).toHaveBeenCalledWith(
        'tenant-1',
      );
      expect(response.body).toEqual(integrityResponse);
    });
  });
});
