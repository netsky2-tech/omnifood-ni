import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';

import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { User, UserRole } from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { SystemParametersConfig } from '../../src/modules/inventory/entities/system-parameters-config.entity';
import { Product, ProductType } from '../../src/modules/inventory/entities/product.entity';
import { FiscalConfigRevision } from '../../src/modules/onboarding/entities/fiscal-config-revision.entity';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../../src/modules/onboarding/entities/onboarding-session.entity';
import {
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../../src/modules/onboarding/entities/activation-attempt.entity';
import {
  ActivationCheckResult,
  ActivationCheckCode,
  ActivationCheckStatus,
} from '../../src/modules/onboarding/entities/activation-check-result.entity';
import { ActivationFollowUp } from '../../src/modules/onboarding/entities/activation-follow-up.entity';
import { ImportStaging } from '../../src/modules/onboarding/entities/import-staging.entity';
import { ProductImportSession } from '../../src/modules/onboarding/entities/product-import-session.entity';
import { LegacyOnboardingMigrationReceipt } from '../../src/modules/onboarding/entities/legacy-migration-receipt.entity';
import { ChangeLog } from '../../src/modules/audit/entities/change-log.entity';

import { OnboardingSessionController } from '../../src/modules/onboarding/controllers/onboarding-session.controller';
import { ActivationController } from '../../src/modules/onboarding/controllers/activation.controller';
import { ImportStagingController } from '../../src/modules/onboarding/controllers/import-staging.controller';

import { OnboardingSessionService } from '../../src/modules/onboarding/services/onboarding-session.service';
import { OnboardingReadinessEvaluator } from '../../src/modules/onboarding/services/onboarding-readiness.evaluator';
import { OnboardingStateReconciler } from '../../src/modules/onboarding/services/onboarding-state.reconciler';
import { ActivationService } from '../../src/modules/onboarding/services/activation.service';
import { FiscalConfigVersionService } from '../../src/modules/onboarding/services/fiscal-config-version.service';
import { OnboardingCatalogService } from '../../src/modules/onboarding/services/onboarding-catalog.service';
import { ImportStagingService } from '../../src/modules/onboarding/services/import-staging.service';
import { CanonicalCsvParserService } from '../../src/modules/onboarding/services/canonical-csv-parser.service';
import { LegacyImportIntegrityReportService } from '../../src/modules/onboarding/services/legacy-import-integrity-report.service';
import { ChangeLogService } from '../../src/modules/audit/change-log.service';

import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { PermissionsGuard } from '../../src/modules/identity/guards/permissions.guard';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';
import { SupportOverrideAction } from '../../src/modules/onboarding/dto/activation.dto';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

describe('ONB1.10C: Security & Multi-Tenant Isolation Hardening (Real PostgreSQL DB)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let schemaName: string;

  let tenantAId: string;
  let tenantBId: string;

  let ownerTokenA: string;
  let managerTokenA: string;
  let cashierTokenA: string;

  let ownerTokenB: string;

  let deviceTokenA: string;
  let forgedDeviceToken: string;
  let terminalAId: string;

  let supportToken: string;

  beforeAll(async () => {
    schemaName = `onb_sec_iso_${randomUUID().replace(/-/g, '')}`;

    const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schemaName}"`);
    await bootstrap.destroy();

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: schemaName,
      entities: [
        Tenant,
        User,
        SecurityProfile,
        SystemParametersConfig,
        Product,
        FiscalConfigRevision,
        OnboardingSession,
        ActivationAttempt,
        ActivationCheckResult,
        ActivationFollowUp,
        ImportStaging,
        ProductImportSession,
        LegacyOnboardingMigrationReceipt,
        ChangeLog,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schemaName}"`);

    tenantAId = randomUUID();
    tenantBId = randomUUID();
    terminalAId = 'term-pos-tenant-a-01';

    const tenantRepo = dataSource.getRepository(Tenant);
    await tenantRepo.save([
      tenantRepo.create({ id: tenantAId, name: 'Tenant A Isolation Corp', is_active: true }),
      tenantRepo.create({ id: tenantBId, name: 'Tenant B Isolation Corp', is_active: true }),
    ]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [
        OnboardingSessionController,
        ActivationController,
        ImportStagingController,
      ],
      providers: [
        Reflector,
        AuthGuard,
        RolesGuard,
        PermissionsGuard,
        createIdentityJwtConfigProvider(),
        createIdentityJwtTestConfigProvider(),
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: 'TenantRepository',
          useValue: dataSource.getRepository(Tenant),
        },
        {
          provide: 'UserRepository',
          useValue: dataSource.getRepository(User),
        },
        {
          provide: 'SystemParametersConfigRepository',
          useValue: dataSource.getRepository(SystemParametersConfig),
        },
        {
          provide: 'ProductRepository',
          useValue: dataSource.getRepository(Product),
        },
        {
          provide: 'FiscalConfigRevisionRepository',
          useValue: dataSource.getRepository(FiscalConfigRevision),
        },
        {
          provide: 'OnboardingSessionRepository',
          useValue: dataSource.getRepository(OnboardingSession),
        },
        {
          provide: 'ActivationAttemptRepository',
          useValue: dataSource.getRepository(ActivationAttempt),
        },
        {
          provide: 'ActivationCheckResultRepository',
          useValue: dataSource.getRepository(ActivationCheckResult),
        },
        {
          provide: 'ActivationFollowUpRepository',
          useValue: dataSource.getRepository(ActivationFollowUp),
        },
        {
          provide: 'ImportStagingRepository',
          useValue: dataSource.getRepository(ImportStaging),
        },
        {
          provide: 'ProductImportSessionRepository',
          useValue: dataSource.getRepository(ProductImportSession),
        },
        {
          provide: 'LegacyOnboardingMigrationReceiptRepository',
          useValue: dataSource.getRepository(LegacyOnboardingMigrationReceipt),
        },
        {
          provide: 'ChangeLogRepository',
          useValue: dataSource.getRepository(ChangeLog),
        },
        ChangeLogService,
        OnboardingSessionService,
        FiscalConfigVersionService,
        OnboardingCatalogService,
        ActivationService,
        CanonicalCsvParserService,
        ImportStagingService,
        {
          provide: OnboardingReadinessEvaluator,
          useValue: {
            evaluate: jest.fn().mockImplementation(async (tId: string) => {
              const prodCount = await dataSource
                .getRepository(Product)
                .count({ where: { tenant_id: tId, is_active: true } });
              return {
                saleReady: prodCount > 0,
                catalog: { sellableProductCount: prodCount, hasSellableProduct: prodCount > 0 },
                fiscal: { minimumConfigurationValid: true },
                identity: { tenantExists: true },
                blockers: prodCount > 0 ? [] : ['CATALOG_NO_SELLABLE_PRODUCTS'],
              };
            }),
          },
        },
        {
          provide: OnboardingStateReconciler,
          useValue: {
            reconcile: jest.fn().mockImplementation(async (tId: string, readiness: any) => {
              const session = await dataSource
                .getRepository(OnboardingSession)
                .findOne({ where: { tenantId: tId } });
              if (session && readiness.saleReady) {
                session.lifecycleState = OnboardingLifecycleState.SALE_READY;
              }
              return session;
            }),
          },
        },
        {
          provide: LegacyImportIntegrityReportService,
          useValue: {
            generateIntegrityReport: jest.fn(),
            expireIncompatibleLegacyStaging: jest.fn(),
            remediateReportWithInventoryCommand: jest.fn(),
            acceptReportAsIs: jest.fn(),
            reconcileLegacyBaselineSession: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    jwtService = moduleRef.get<JwtService>(JwtService);

    // Seed Fiscal Config for Tenant A
    await dataSource.getRepository(SystemParametersConfig).save([
      {
        tenant_id: tenantAId,
        paramKey: 'FISCAL_REGIME',
        paramValue: 'REGIMEN_GENERAL',
        isActive: true,
      },
      {
        tenant_id: tenantAId,
        paramKey: 'TAX_RATE_IVA',
        paramValue: 0.15,
        isActive: true,
      },
    ]);

    // Generate tokens for Tenant A
    ownerTokenA = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'ownerA@omnifood.ni',
      role: UserRole.OWNER,
      tenantId: tenantAId,
      tenant_id: tenantAId,
    });

    managerTokenA = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'managerA@omnifood.ni',
      role: UserRole.MANAGER,
      tenantId: tenantAId,
      tenant_id: tenantAId,
      custom_permissions: ['onboarding:read'],
    });

    cashierTokenA = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'cashierA@omnifood.ni',
      role: UserRole.CASHIER,
      tenantId: tenantAId,
      tenant_id: tenantAId,
    });

    // Generate tokens for Tenant B
    ownerTokenB = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'ownerB@omnifood.ni',
      role: UserRole.OWNER,
      tenantId: tenantBId,
      tenant_id: tenantBId,
    });

    // Valid DevicePrincipal token for Terminal A in Tenant A
    deviceTokenA = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'device-pos-a@omnifood.ni',
      role: UserRole.OWNER,
      tenantId: tenantAId,
      tenant_id: tenantAId,
      terminalId: terminalAId,
    });

    // Forged DevicePrincipal token (claims Terminal A, but bound to Tenant B)
    forgedDeviceToken = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'attacker@omnifood.ni',
      role: UserRole.OWNER,
      tenantId: tenantBId,
      tenant_id: tenantBId,
      terminalId: terminalAId,
    });

    // L2/L3 Support Token
    supportToken = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'l2support@omnifood.ni',
      role: UserRole.MANAGER,
      tenantId: tenantAId,
      tenant_id: tenantAId,
      custom_permissions: [
        'onboarding:support:assist',
        'onboarding:activation:manage',
        'onboarding:read',
      ],
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.destroy();
    }
  });

  it('1. Strict Tenant Boundary: Tenant B cannot read or modify Tenant A session or products (Rule 61, AC-38)', async () => {
    // Tenant A starts session and creates product
    await request(app.getHttpServer())
      .post('/api/onboarding/session/start')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ source: 'SETUP_CENTER' })
      .expect(200);

    const productRepo = dataSource.getRepository(Product);
    await productRepo.save(
      productRepo.create({
        id: randomUUID(),
        tenant_id: tenantAId,
        name: 'Plato Exclusivo Tenant A',
        uom: 'UN',
        sellPrice: 150.0,
        averageCost: 60.0,
        stock: 50,
        is_active: true,
      }),
    );

    // Tenant B gets session -> Has 0 products and is separate from Tenant A
    const resB = await request(app.getHttpServer())
      .get('/api/onboarding/session')
      .set('Authorization', `Bearer ${ownerTokenB}`)
      .expect(200);

    expect(resB.body.session.tenantId).toBe(tenantBId);
    expect(resB.body.readiness.catalog.sellableProductCount).toBe(0);
    expect(resB.body.readiness.saleReady).toBe(false);
  });

  it('2. Forged tenant parameters in query or body NEVER alter authenticated scope (Rule 62)', async () => {
    // Attacker with Tenant B token tries to query Tenant A by injecting tenant_id query parameter
    const queryTamperRes = await request(app.getHttpServer())
      .get(`/api/onboarding/session?tenant_id=${tenantAId}&tenantId=${tenantAId}`)
      .set('Authorization', `Bearer ${ownerTokenB}`)
      .expect(200);

    // The backend IGNORES the query string and securely returns Tenant B's data
    expect(queryTamperRes.body.session.tenantId).toBe(tenantBId);
    expect(queryTamperRes.body.session.tenantId).not.toBe(tenantAId);

    // Attacker attempts POST session/start with forged tenant in body
    const bodyTamperRes = await request(app.getHttpServer())
      .post('/api/onboarding/session/start')
      .set('Authorization', `Bearer ${ownerTokenB}`)
      .send({ tenantId: tenantAId, tenant_id: tenantAId, source: 'SETUP_CENTER' })
      .expect(200);

    expect(bodyTamperRes.body.session.tenantId).toBe(tenantBId);
    expect(bodyTamperRes.body.session.tenantId).not.toBe(tenantAId);
  });

  it('3. Fail-Closed Security: missing authentication or tenant context is rejected fail-closed (Rule 61)', async () => {
    // Unauthenticated call
    await request(app.getHttpServer())
      .get('/api/onboarding/session')
      .expect(401);

    // Malformed token without tenantId claim
    const tokenNoTenant = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'anonymous@omnifood.ni',
      role: UserRole.OWNER,
      tenantId: '',
      tenant_id: '',
    });

    await request(app.getHttpServer())
      .get('/api/onboarding/session')
      .set('Authorization', `Bearer ${tokenNoTenant}`)
      .expect(401);
  });

  it('4. Granular Server-Side RBAC: CASHIER denied (403), MANAGER read-only, OWNER full access (Rule 64)', async () => {
    // CASHIER gets 403 on session read and start
    await request(app.getHttpServer())
      .get('/api/onboarding/session')
      .set('Authorization', `Bearer ${cashierTokenA}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/onboarding/session/start')
      .set('Authorization', `Bearer ${cashierTokenA}`)
      .send({ source: 'SETUP_CENTER' })
      .expect(403);

    // CASHIER gets 403 on activation endpoints
    await request(app.getHttpServer())
      .post('/api/onboarding/activation/attempts')
      .set('Authorization', `Bearer ${cashierTokenA}`)
      .send({ candidateTerminalId: terminalAId })
      .expect(403);

    // MANAGER can read session (200 OK), but cannot start or mutate (403)
    await request(app.getHttpServer())
      .get('/api/onboarding/session')
      .set('Authorization', `Bearer ${managerTokenA}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/onboarding/session/start')
      .set('Authorization', `Bearer ${managerTokenA}`)
      .send({ source: 'SETUP_CENTER' })
      .expect(403);
  });

  it('5. Device Evidence Trust Boundary: detects and rejects DevicePrincipal forgery (Rule 63)', async () => {
    // Ensure Tenant A session is in SALE_READY
    const sessionRepo = dataSource.getRepository(OnboardingSession);
    let sessionA = await sessionRepo.findOne({ where: { tenantId: tenantAId } });
    if (!sessionA) {
      sessionA = sessionRepo.create({
        tenantId: tenantAId,
        lifecycleState: OnboardingLifecycleState.SALE_READY,
      });
    } else {
      sessionA.lifecycleState = OnboardingLifecycleState.SALE_READY;
    }
    await sessionRepo.save(sessionA);

    // Start an activation attempt for Tenant A
    const attemptRes = await request(app.getHttpServer())
      .post('/api/onboarding/activation/attempts')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ candidateTerminalId: terminalAId })
      .expect(201);

    const attemptId = attemptRes.body.id;

    // Sub-case A: Check payload claims a forged tenantId differing from DevicePrincipal
    const forgeryRes1 = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${attemptId}/checks`)
      .set('Authorization', `Bearer ${deviceTokenA}`)
      .send({
        checkCode: ActivationCheckCode.TERMINAL_LINKED,
        status: ActivationCheckStatus.PASS,
        declarativeTenantId: randomUUID(), // Forged tenant!
      });
    expect(forgeryRes1.status).toBe(403);
    expect(forgeryRes1.body.message).toContain('DEVICE_PRINCIPAL_FORGERY_DETECTED');

    // Sub-case B: Check payload claims a forged terminalId differing from DevicePrincipal
    const forgeryRes2 = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${attemptId}/checks`)
      .set('Authorization', `Bearer ${deviceTokenA}`)
      .send({
        checkCode: ActivationCheckCode.TERMINAL_LINKED,
        status: ActivationCheckStatus.PASS,
        declarativeTerminalId: 'fake-rogue-terminal-99', // Forged terminal!
      });
    expect(forgeryRes2.status).toBe(403);
    expect(forgeryRes2.body.message).toContain('DEVICE_PRINCIPAL_FORGERY_DETECTED');

    // Sub-case C: Token belonging to Tenant B attempts to submit checks for Tenant A's attempt
    const crossTenantRes = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${attemptId}/checks`)
      .set('Authorization', `Bearer ${forgedDeviceToken}`)
      .send({
        checkCode: ActivationCheckCode.TERMINAL_LINKED,
        status: ActivationCheckStatus.PASS,
      });
    expect(crossTenantRes.status).toBe(404); // Attempt not found in Tenant B's boundary!

    // Sub-case D: Legitimate DevicePrincipal for candidate terminal succeeds
    const validCheckRes = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${attemptId}/checks`)
      .set('Authorization', `Bearer ${deviceTokenA}`)
      .send({
        checkCode: ActivationCheckCode.TERMINAL_LINKED,
        status: ActivationCheckStatus.PASS,
        evidenceType: 'DEVICE_IDENTITY',
        evidenceRef: 'token-ref-valid-001',
      })
      .expect(201);

    expect(validCheckRes.body.status).toBe(ActivationCheckStatus.PASS);
  });

  it('6. Support Intervention Security: support overrides require explicit tenant grant and substantive justification (Rule 65)', async () => {
    // Find active attempt for Tenant A
    const attempt = await dataSource.getRepository(ActivationAttempt).findOne({
      where: { tenantId: tenantAId, status: ActivationAttemptStatus.IN_PROGRESS },
    });
    expect(attempt).toBeDefined();

    // Insufficient reason (< 10 chars) -> 400 Bad Request
    await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${attempt!.id}/support-override`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({
        overrideAction: SupportOverrideAction.FORCE_FAIL,
        reason: 'Short', // Less than 10 characters!
      })
      .expect(400);

    // Substantive reason (>= 10 chars) -> 201 Created and recorded in ChangeLog audit
    const overrideRes = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${attempt!.id}/support-override`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({
        overrideAction: SupportOverrideAction.FORCE_FAIL,
        reason: 'Level 2 support assistance verified hardware loopback connection successfully',
      })
      .expect(201);

    expect(overrideRes.body.attempt.id).toBe(attempt!.id);

    // Verification in real PostgreSQL audit log: entry is stored with actor and target
    const changeLogs = await dataSource.getRepository(ChangeLog).find({
      where: {
        tenant_id: tenantAId,
        action: 'ONBOARDING_ACTIVATION_SUPPORT_OVERRIDE',
      },
    });
    expect(changeLogs.length).toBeGreaterThanOrEqual(1);
    expect(changeLogs[0].target_id).toBe(attempt!.id);
  });
});
