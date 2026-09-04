import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import {
  User,
  UserRole,
} from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { SystemParametersConfig } from '../../src/modules/inventory/entities/system-parameters-config.entity';
import {
  Product,
  ProductType,
} from '../../src/modules/inventory/entities/product.entity';
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
  ActivationCheckCode,
  ActivationCheckResult,
  ActivationCheckStatus,
} from '../../src/modules/onboarding/entities/activation-check-result.entity';
import {
  ActivationFollowUp,
  ActivationFollowUpStatus,
} from '../../src/modules/onboarding/entities/activation-follow-up.entity';
import { ChangeLog } from '../../src/modules/audit/entities/change-log.entity';
import { ChangeLogService } from '../../src/modules/audit/change-log.service';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { InvoiceItemModifier } from '../../src/modules/sales/entities/invoice-item-modifier.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import { InvoicesService } from '../../src/modules/sales/services/invoices.service';
import { SupportOverrideAction } from '../../src/modules/onboarding/dto/activation.dto';
import { ActivationController } from '../../src/modules/onboarding/controllers/activation.controller';
import { ActivationService } from '../../src/modules/onboarding/services/activation.service';
import { FiscalConfigVersionService } from '../../src/modules/onboarding/services/fiscal-config-version.service';
import { OnboardingCatalogService } from '../../src/modules/onboarding/services/onboarding-catalog.service';
import { OnboardingSessionService } from '../../src/modules/onboarding/services/onboarding-session.service';
import { OnboardingReadinessEvaluator } from '../../src/modules/onboarding/services/onboarding-readiness.evaluator';
import { OnboardingStateReconciler } from '../../src/modules/onboarding/services/onboarding-state.reconciler';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { PermissionsGuard } from '../../src/modules/identity/guards/permissions.guard';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

describe('ONB1.7A–C Activation Flow (E2E with Real PostgreSQL Persistence)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let schemaName: string;

  let tenantId: string;
  let ownerUserId: string;
  let cashierUserId: string;
  let ownerToken: string;
  let cashierToken: string;
  let supportToken: string;
  let candidateTerminalId: string;

  beforeAll(async () => {
    schemaName = `onb_e2e_act_${randomUUID().replace(/-/g, '')}`;

    const bootstrap = new DataSource({
      type: 'postgres',
      ...postgresConnection,
    });
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
        FiscalConfigRevision,
        Product,
        OnboardingSession,
        ActivationAttempt,
        ActivationCheckResult,
        ActivationFollowUp,
        ChangeLog,
        Invoice,
        InvoiceItem,
        InvoiceItemModifier,
        Payment,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schemaName}"`);

    // Create partial unique index on real Postgres
    await dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_activation_attempts_single_active
      ON onboarding_activation_attempts (tenant_id, onboarding_session_id)
      WHERE status IN ('CREATED', 'IN_PROGRESS');
    `);

    tenantId = randomUUID();
    ownerUserId = randomUUID();
    cashierUserId = randomUUID();
    candidateTerminalId = 'pos-station-founder-01';

    // Seed Tenant
    await dataSource.getRepository(Tenant).save({
      id: tenantId,
      name: 'OmniFood Founder Restaurant',
      ruc: 'J0310000004321',
      is_active: true,
    });

    // Seed Users: Owner (has ONBOARDING_ACTIVATION_MANAGE) & Cashier (lacks it)
    await dataSource.getRepository(User).save([
      {
        id: ownerUserId,
        tenant_id: tenantId,
        name: 'Owner User',
        email: 'owner@omnifood.ni',
        password_hash: 'test-hash',
        role: UserRole.OWNER,
        is_active: true,
        security_version: 1,
      },
      {
        id: cashierUserId,
        tenant_id: tenantId,
        name: 'Cashier User',
        email: 'cashier@omnifood.ni',
        password_hash: 'test-hash',
        role: UserRole.CASHIER,
        is_active: true,
        security_version: 1,
      },
    ]);

    // Seed Fiscal Config
    await dataSource.getRepository(SystemParametersConfig).save([
      {
        tenant_id: tenantId,
        paramKey: 'FISCAL_REGIME',
        paramValue: 'REGIMEN_GENERAL',
        isActive: true,
      },
      {
        tenant_id: tenantId,
        paramKey: 'TAX_RATE_IVA',
        paramValue: 0.15,
        isActive: true,
      },
    ]);

    // Seed Sellable Product
    await dataSource.getRepository(Product).save({
      tenant_id: tenantId,
      name: 'Quesillo Tipico Con Crema',
      sellPrice: 65,
      uom: 'UN',
      product_type: ProductType.SIMPLE,
      is_active: true,
      stock: 0,
      averageCost: 0,
    });

    // Seed OnboardingSession in SALE_READY
    await dataSource.getRepository(OnboardingSession).save({
      tenantId,
      lifecycleState: OnboardingLifecycleState.SALE_READY,
      saleReadyFirstAt: new Date(),
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 1,
    });

    // Nest Module setup
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ActivationController],
      providers: [
        createIdentityJwtConfigProvider(),
        createIdentityJwtTestConfigProvider(),
        JwtService,
        Reflector,
        AuthGuard,
        PermissionsGuard,
        {
          provide: DataSource,
          useValue: dataSource,
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
          provide: 'OnboardingSessionRepository',
          useValue: dataSource.getRepository(OnboardingSession),
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
        FiscalConfigVersionService,
        {
          provide: OnboardingSessionService,
          useValue: {
            ensureOnboardingStarted: jest.fn(),
          },
        },
        {
          provide: OnboardingReadinessEvaluator,
          useValue: {
            evaluate: jest.fn().mockResolvedValue({ saleReady: true }),
          },
        },
        {
          provide: OnboardingStateReconciler,
          useValue: {
            reconcile: jest.fn(),
          },
        },
        {
          provide: 'ChangeLogRepository',
          useValue: dataSource.getRepository(ChangeLog),
        },
        ChangeLogService,
        {
          provide: InvoicesService,
          useValue: { syncBatch: jest.fn() },
        },
        OnboardingCatalogService,
        ActivationService,
      ],
    }).compile();

    jwtService = moduleRef.get<JwtService>(JwtService);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();

    ownerToken = signIdentityJwtAccessToken(jwtService, {
      sub: ownerUserId,
      email: 'owner@omnifood.ni',
      role: UserRole.OWNER,
      tenantId,
      terminalId: candidateTerminalId,
    });

    cashierToken = signIdentityJwtAccessToken(jwtService, {
      sub: cashierUserId,
      email: 'cashier@omnifood.ni',
      role: UserRole.CASHIER,
      tenantId,
      terminalId: candidateTerminalId,
    });

    supportToken = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'support@omnifood.ni',
      role: UserRole.MANAGER,
      custom_permissions: [
        'onboarding:support:assist',
        'onboarding:activation:manage',
        'onboarding:read',
      ],
      tenantId,
      tenant_id: tenantId,
      terminalId: candidateTerminalId,
    });
  });

  async function persistVerificationSaleEvidence(
    attemptId: string,
    evidenceTenantId = tenantId,
    evidenceUserId = ownerUserId,
  ) {
    const invoiceId = randomUUID();
    await dataSource.getRepository(Invoice).save({
      id: invoiceId,
      tenant_id: evidenceTenantId,
      number: `VERIFY-${invoiceId}`,
      created_at: new Date(),
      userId: evidenceUserId,
      subtotal: 1,
      totalTax: 0,
      total: 1,
      paymentStatus: 'paid',
    });
    await dataSource.getRepository(ActivationAttempt).update(
      { id: attemptId, tenantId: evidenceTenantId },
      { verificationTicketId: invoiceId },
    );
  }

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.destroy();
    }
  });

  it('1. Enforces strict RBAC: rejects start activation without onboarding.activation.manage (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/onboarding/activation/attempts')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ candidateTerminalId });

    expect(res.status).toBe(403);
  });

  let createdAttemptId: string;

  it('2. ONB1.7A StartActivation: creates attempt, pins fiscal & product revisions and transitions session to ACTIVATION_IN_PROGRESS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/onboarding/activation/attempts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ candidateTerminalId, posBuild: 'pos-v1.8.0-founder' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe(ActivationAttemptStatus.CREATED);
    expect(res.body.candidateTerminalId).toBe(candidateTerminalId);
    expect(res.body.requiredFiscalRevision).toBe(1);
    expect(res.body.requiredFiscalFingerprint).toBeDefined();
    expect(res.body.verificationProductId).toBeDefined();
    expect(res.body.verificationProductRevision).toBe(1);
    expect(res.body.verificationProductFingerprint).toBeDefined();
    expect(res.body.serverTimeAnchorAt).toBeDefined();

    createdAttemptId = res.body.id;
    await persistVerificationSaleEvidence(createdAttemptId);

    // Verify session state in DB
    const session = await dataSource.getRepository(OnboardingSession).findOne({
      where: { tenantId },
    });
    expect(session?.lifecycleState).toBe(
      OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
    );
    expect(session?.currentActivationAttemptId).toBe(createdAttemptId);
  });

  it('3. ONB1.7A Single Active Attempt Invariant: rejects second concurrent attempt (400 / 409)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/onboarding/activation/attempts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ candidateTerminalId: 'pos-station-02' });

    expect([400, 409]).toContain(res.status);
  });

  it('4. ONB1.7B Ingest Check: rejects declarative forgery when tenantId or terminalId mismatches DevicePrincipal (403)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${createdAttemptId}/checks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        checkCode: ActivationCheckCode.TERMINAL_LINKED,
        status: ActivationCheckStatus.PASS,
        declarativeTenantId: randomUUID(), // Forged tenant
      });

    expect(res.status).toBe(403);
  });

  it('5. ONB1.7B Ingest Check: rejects WARNING status for local checks (400)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${createdAttemptId}/checks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        checkCode: ActivationCheckCode.REQUIRED_CONFIG_LOCAL,
        status: ActivationCheckStatus.WARNING,
      });

    expect(res.status).toBe(400);
  });

  it('6. ONB1.7B Ingest Check: accepts valid local checks and enforces idempotency in PostgreSQL', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${createdAttemptId}/checks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        checkCode: ActivationCheckCode.TERMINAL_LINKED,
        status: ActivationCheckStatus.PASS,
        evidenceType: 'DEVICE_IDENTITY',
        evidenceRef: 'token-ref-device-founder',
      });

    expect(res.status).toBe(201);
    expect(res.body.checkCode).toBe(ActivationCheckCode.TERMINAL_LINKED);
    expect(res.body.status).toBe(ActivationCheckStatus.PASS);

    // Idempotent retry
    const resReplay = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${createdAttemptId}/checks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        checkCode: ActivationCheckCode.TERMINAL_LINKED,
        status: ActivationCheckStatus.PASS,
        evidenceType: 'DEVICE_IDENTITY',
        evidenceRef: 'token-ref-device-founder',
      });

    expect(resReplay.status).toBe(201);
    expect(resReplay.body.id).toBe(res.body.id);
  });

  it('7. ONB1.7C Check Catalogue & Finalizer: rejects finalization with FAIL when checks are incomplete', async () => {
    // Only 1 of 10 checks ingested so far
    const res = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${createdAttemptId}/finalize`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send();

    expect(res.status).toBe(201);
    expect(res.body.status).toBe(ActivationAttemptStatus.FAIL);
    expect(res.body.failureCode).toBe('MISSING_REQUIRED_CHECKS');

    const session = await dataSource.getRepository(OnboardingSession).findOne({
      where: { tenantId },
    });
    // Invariant: FAIL attempt with valid readiness reverts to SALE_READY
    expect(session?.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
    expect(session?.activatedAt).toBeNull();
  });

  it('8. ONB1.7C Retrying after FAIL: starts second attempt and completes all 10 checks to achieve ACTIVATED', async () => {
    // Start second attempt
    const startRes = await request(app.getHttpServer())
      .post('/api/onboarding/activation/attempts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ candidateTerminalId });

    expect(startRes.status).toBe(201);
    const attempt2Id = startRes.body.id;
    expect(attempt2Id).not.toBe(createdAttemptId);
    await persistVerificationSaleEvidence(attempt2Id);

    // Ingest all 10 checks as PASS
    const catalogCodes = [
      ActivationCheckCode.TERMINAL_LINKED,
      ActivationCheckCode.REQUIRED_CONFIG_LOCAL,
      ActivationCheckCode.AUTHORIZED_USER_LOCAL,
      ActivationCheckCode.PRINTER_AVAILABLE,
      ActivationCheckCode.TEST_PRINT,
      ActivationCheckCode.SQLITE_DURABILITY,
      ActivationCheckCode.OFFLINE_SALE_PAID,
      ActivationCheckCode.SALE_RECEIPT_PATH,
      ActivationCheckCode.OUTBOX_DURABLE,
      ActivationCheckCode.POST_RECONNECT_SYNC,
    ];

    for (const code of catalogCodes) {
      const chkRes = await request(app.getHttpServer())
        .post(`/api/onboarding/activation/attempts/${attempt2Id}/checks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          checkCode: code,
          status: ActivationCheckStatus.PASS,
          evidenceType: 'REAL_EVIDENCE_RECORDED',
          evidenceRef: `ref-${code.toLowerCase()}`,
        });
      expect(chkRes.status).toBe(201);
    }

    // Authoritative Finalization
    const finalizeRes = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${attempt2Id}/finalize`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send();

    expect(finalizeRes.status).toBe(201);
    expect(finalizeRes.body.status).toBe(ActivationAttemptStatus.PASS);
    expect(finalizeRes.body.completedAt).toBeDefined();

    // Verify Session in DB is now ACTIVATED
    const finalSession = await dataSource
      .getRepository(OnboardingSession)
      .findOne({
        where: { tenantId },
      });
    expect(finalSession?.lifecycleState).toBe(
      OnboardingLifecycleState.ACTIVATED,
    );
    expect(finalSession?.activatedAt).toBeDefined();
    expect(finalSession?.currentActivationAttemptId).toBe(attempt2Id);
  });

  it('9. ONB1.7C PASS_WITH_WARNING & Follow-up E2E Lifecycle: finalizes with warning, queries follow-up and closes it without modifying activatedAt', async () => {
    // New tenant for isolated warning flow
    const tenantWarnId = randomUUID();
    const ownerWarnUserId = randomUUID();
    const terminalWarnId = 'pos-warn-01';

    await dataSource.getRepository(Tenant).save({
      id: tenantWarnId,
      name: 'OmniFood Warning Branch',
      ruc: 'J0310000005555',
      is_active: true,
    });

    await dataSource.getRepository(User).save({
      id: ownerWarnUserId,
      tenant_id: tenantWarnId,
      name: 'Owner Warn',
      email: 'ownerwarn@omnifood.ni',
      password_hash: 'hash',
      role: UserRole.OWNER,
      is_active: true,
      security_version: 1,
    });

    await dataSource.getRepository(SystemParametersConfig).save({
      tenant_id: tenantWarnId,
      paramKey: 'FISCAL_REGIME',
      paramValue: 'REGIMEN_GENERAL',
      isActive: true,
    });

    await dataSource.getRepository(Product).save({
      tenant_id: tenantWarnId,
      name: 'Cafe Negro',
      sellPrice: 30,
      uom: 'UN',
      product_type: ProductType.SIMPLE,
      is_active: true,
      stock: 0,
      averageCost: 0,
    });

    await dataSource.getRepository(OnboardingSession).save({
      tenantId: tenantWarnId,
      lifecycleState: OnboardingLifecycleState.SALE_READY,
      saleReadyFirstAt: new Date(),
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 1,
    });

    const warnToken = signIdentityJwtAccessToken(jwtService, {
      sub: ownerWarnUserId,
      email: 'ownerwarn@omnifood.ni',
      role: UserRole.OWNER,
      tenantId: tenantWarnId,
      terminalId: terminalWarnId,
    });

    // Start activation
    const startRes = await request(app.getHttpServer())
      .post('/api/onboarding/activation/attempts')
      .set('Authorization', `Bearer ${warnToken}`)
      .send({ candidateTerminalId: terminalWarnId });

    expect(startRes.status).toBe(201);
    const attemptWarnId = startRes.body.id;
    await persistVerificationSaleEvidence(
      attemptWarnId,
      tenantWarnId,
      ownerWarnUserId,
    );

    // Ingest 9 checks PASS
    const first9 = [
      ActivationCheckCode.TERMINAL_LINKED,
      ActivationCheckCode.REQUIRED_CONFIG_LOCAL,
      ActivationCheckCode.AUTHORIZED_USER_LOCAL,
      ActivationCheckCode.PRINTER_AVAILABLE,
      ActivationCheckCode.TEST_PRINT,
      ActivationCheckCode.SQLITE_DURABILITY,
      ActivationCheckCode.OFFLINE_SALE_PAID,
      ActivationCheckCode.SALE_RECEIPT_PATH,
      ActivationCheckCode.OUTBOX_DURABLE,
    ];

    for (const code of first9) {
      await request(app.getHttpServer())
        .post(`/api/onboarding/activation/attempts/${attemptWarnId}/checks`)
        .set('Authorization', `Bearer ${warnToken}`)
        .send({
          checkCode: code,
          status: ActivationCheckStatus.PASS,
        });
    }

    // Ingest POST_RECONNECT_SYNC as WARNING
    await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${attemptWarnId}/checks`)
      .set('Authorization', `Bearer ${warnToken}`)
      .send({
        checkCode: ActivationCheckCode.POST_RECONNECT_SYNC,
        status: ActivationCheckStatus.WARNING,
        evidenceRef: 'timeout-cloud-wan',
      });

    // Finalize -> PASS_WITH_WARNING
    const finalizeRes = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${attemptWarnId}/finalize`)
      .set('Authorization', `Bearer ${warnToken}`)
      .send();

    expect(finalizeRes.status).toBe(201);
    expect(finalizeRes.body.status).toBe(
      ActivationAttemptStatus.PASS_WITH_WARNING,
    );
    expect(finalizeRes.body.warningsCount).toBe(1);

    // Query follow-ups
    const followUpsRes = await request(app.getHttpServer())
      .get(`/api/onboarding/activation/attempts/${attemptWarnId}/follow-ups`)
      .set('Authorization', `Bearer ${warnToken}`);

    expect(followUpsRes.status).toBe(200);
    expect(followUpsRes.body.length).toBe(1);
    const followUpId = followUpsRes.body[0].id;
    expect(followUpsRes.body[0].status).toBe(ActivationFollowUpStatus.OPEN);
    expect(followUpsRes.body[0].warningCode).toBe(
      'POST_RECONNECT_SYNC_TRANSIENT',
    );

    // Close follow-up
    const closeRes = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/follow-ups/${followUpId}/close`)
      .set('Authorization', `Bearer ${warnToken}`)
      .send({
        closureEvidenceRef: 'sync-reconnected-ack-ok',
        closureNote: 'Reconnected and outbox drained successfully',
      });

    expect(closeRes.status).toBe(201);
    expect(closeRes.body.status).toBe(ActivationFollowUpStatus.CLOSED);

    // Verify session in DB remains ACTIVATED and activatedAt is not altered
    const sessionWarn = await dataSource
      .getRepository(OnboardingSession)
      .findOne({
        where: { tenantId: tenantWarnId },
      });
    expect(sessionWarn?.lifecycleState).toBe(
      OnboardingLifecycleState.ACTIVATED,
    );
    expect(sessionWarn?.activatedAt).toBeDefined();
  });

  it('10. ONB1.7D–E Background Convergence Reconciler: POST /api/onboarding/activation/reconcile-convergence auto-closes warning follow-up', async () => {
    const tenantConvId = randomUUID();
    const userConvId = randomUUID();
    const termConvId = 'term-pos-conv-1';

    await dataSource.getRepository(Tenant).save({
      id: tenantConvId,
      name: 'Restaurante Reconciler Convergencia',
      ruc: 'J0310000007777',
      is_active: true,
    });

    await dataSource.getRepository(User).save({
      id: userConvId,
      tenant_id: tenantConvId,
      name: 'Conv Owner',
      email: 'conv@omnifood.ni',
      password_hash: 'hash',
      role: UserRole.OWNER,
      is_active: true,
      security_version: 1,
    });

    await dataSource.getRepository(SystemParametersConfig).save({
      tenant_id: tenantConvId,
      paramKey: 'FISCAL_REGIME',
      paramValue: 'REGIMEN_GENERAL',
      isActive: true,
    });

    await dataSource.getRepository(Product).save({
      tenant_id: tenantConvId,
      name: 'Quesillo Doble Crema',
      sellPrice: 65,
      uom: 'UN',
      product_type: ProductType.SIMPLE,
      is_active: true,
      stock: 0,
      averageCost: 0,
    });

    await dataSource.getRepository(OnboardingSession).save({
      tenantId: tenantConvId,
      lifecycleState: OnboardingLifecycleState.SALE_READY,
      saleReadyFirstAt: new Date(),
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 1,
    });

    const convToken = signIdentityJwtAccessToken(jwtService, {
      sub: userConvId,
      email: 'conv@omnifood.ni',
      role: UserRole.OWNER,
      tenantId: tenantConvId,
      terminalId: termConvId,
    });

    // Start activation
    const startRes = await request(app.getHttpServer())
      .post('/api/onboarding/activation/attempts')
      .set('Authorization', `Bearer ${convToken}`)
      .send({ candidateTerminalId: termConvId });

    expect(startRes.status).toBe(201);
    const attemptId = startRes.body.id;
    await persistVerificationSaleEvidence(attemptId, tenantConvId, userConvId);

    // Ingest 9 checks as PASS
    const first9 = [
      ActivationCheckCode.TERMINAL_LINKED,
      ActivationCheckCode.REQUIRED_CONFIG_LOCAL,
      ActivationCheckCode.AUTHORIZED_USER_LOCAL,
      ActivationCheckCode.PRINTER_AVAILABLE,
      ActivationCheckCode.TEST_PRINT,
      ActivationCheckCode.SQLITE_DURABILITY,
      ActivationCheckCode.OFFLINE_SALE_PAID,
      ActivationCheckCode.SALE_RECEIPT_PATH,
      ActivationCheckCode.OUTBOX_DURABLE,
    ];

    for (const code of first9) {
      await request(app.getHttpServer())
        .post(`/api/onboarding/activation/attempts/${attemptId}/checks`)
        .set('Authorization', `Bearer ${convToken}`)
        .send({ checkCode: code, status: ActivationCheckStatus.PASS });
    }

    // Ingest check 10 as WARNING
    await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${attemptId}/checks`)
      .set('Authorization', `Bearer ${convToken}`)
      .send({
        checkCode: ActivationCheckCode.POST_RECONNECT_SYNC,
        status: ActivationCheckStatus.WARNING,
        evidenceRef: 'wan-network-flake',
      });

    // Finalize -> PASS_WITH_WARNING
    const finRes = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${attemptId}/finalize`)
      .set('Authorization', `Bearer ${convToken}`)
      .send();

    expect(finRes.status).toBe(201);
    expect(finRes.body.status).toBe(ActivationAttemptStatus.PASS_WITH_WARNING);

    const sessionBeforeReconcile = await dataSource
      .getRepository(OnboardingSession)
      .findOne({ where: { tenantId: tenantConvId } });
    const originalActivatedAt = sessionBeforeReconcile?.activatedAt;
    expect(originalActivatedAt).toBeDefined();

    // Now update POST_RECONNECT_SYNC check to PASS in database (terminal synced evidence)
    const checkToPass = await dataSource
      .getRepository(ActivationCheckResult)
      .findOne({
        where: {
          tenantId: tenantConvId,
          activationAttemptId: attemptId,
          checkCode: ActivationCheckCode.POST_RECONNECT_SYNC,
        },
      });
    checkToPass!.status = ActivationCheckStatus.PASS;
    checkToPass!.evidenceRef = 'SYNC_CONVERGED_BATCH_E2E';
    await dataSource.getRepository(ActivationCheckResult).save(checkToPass!);

    // Call Reconcile Convergence endpoint
    const reconRes = await request(app.getHttpServer())
      .post('/api/onboarding/activation/reconcile-convergence')
      .set('Authorization', `Bearer ${convToken}`)
      .send({ attemptId });

    expect(reconRes.status).toBe(201);
    expect(reconRes.body.evaluatedCount).toBe(1);
    expect(reconRes.body.closedCount).toBe(1);

    // Verify follow-up in DB is CLOSED by SYSTEM_RECONCILER
    const followUpsInDb = await dataSource
      .getRepository(ActivationFollowUp)
      .find({ where: { tenantId: tenantConvId, activationAttemptId: attemptId } });
    expect(followUpsInDb.length).toBe(1);
    expect(followUpsInDb[0].status).toBe(ActivationFollowUpStatus.CLOSED);
    expect(followUpsInDb[0].closedBy).toBe('SYSTEM_RECONCILER');
    expect(followUpsInDb[0].closureEvidenceRef).toBe('SYNC_CONVERGED_BATCH_E2E');

    // Invariant: activatedAt remains strictly identical
    const sessionAfterReconcile = await dataSource
      .getRepository(OnboardingSession)
      .findOne({ where: { tenantId: tenantConvId } });
    expect(sessionAfterReconcile?.activatedAt?.getTime()).toBe(
      originalActivatedAt?.getTime(),
    );
  });

  it('11. ONB1.7F Support Overrides: POST /api/onboarding/activation/attempts/:id/support-override enforces RBAC and audit', async () => {
    // 1. Rejects Cashier token without onboarding.support.assist (403)
    const unauthorizedRes = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/fake-id/support-override`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        reason: 'Unauthorized cashier override attempt',
        overrideAction: SupportOverrideAction.RECORD_DIAGNOSTIC_ASSIST,
      });
    expect(unauthorizedRes.status).toBe(403);

    // 2. Rejects Support token with short reason < 10 chars (400)
    const badReasonRes = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/fake-id/support-override`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({
        reason: 'short',
        overrideAction: SupportOverrideAction.RECORD_DIAGNOSTIC_ASSIST,
      });
    expect(badReasonRes.status).toBe(400);

    // 3. Accepts Support token on existing attempt and records audit trail in PostgreSQL
    const activeAttempt = await dataSource
      .getRepository(ActivationAttempt)
      .findOne({ where: { tenantId } });

    const overrideRes = await request(app.getHttpServer())
      .post(`/api/onboarding/activation/attempts/${activeAttempt?.id}/support-override`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({
        reason: 'Assisted tenant through support channel with peripheral hardware diagnostics',
        overrideAction: SupportOverrideAction.RECORD_DIAGNOSTIC_ASSIST,
        notes: 'Serial printer baudrate adjusted to 9600',
      });

    expect(overrideRes.status).toBe(201);
    expect(overrideRes.body.attempt.id).toBe(activeAttempt?.id);

    // Verify ChangeLog in PostgreSQL
    const auditEntries = await dataSource.getRepository(ChangeLog).find({
      where: {
        tenant_id: tenantId,
        action: 'ONBOARDING_ACTIVATION_SUPPORT_OVERRIDE',
      },
    });
    expect(auditEntries.length).toBeGreaterThanOrEqual(1);
    expect(auditEntries[0].target_id).toBe(activeAttempt?.id);
  });

  it('12. ONB1.7F Diagnostic Controls: GET /api/onboarding/activation/attempts/:id/diagnostics returns complete check matrix and audit trail', async () => {
    const activeAttempt = await dataSource
      .getRepository(ActivationAttempt)
      .findOne({ where: { tenantId } });

    const diagRes = await request(app.getHttpServer())
      .get(`/api/onboarding/activation/attempts/${activeAttempt?.id}/diagnostics`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(diagRes.status).toBe(200);
    expect(diagRes.body.attempt.id).toBe(activeAttempt?.id);
    expect(diagRes.body.session).toBeDefined();
    expect(diagRes.body.checksMatrix).toHaveLength(10);
    expect(diagRes.body.readiness).toBeDefined();
    expect(diagRes.body.auditTrail).toBeDefined();
  });
});
