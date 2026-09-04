import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { SystemParametersConfig } from '../../inventory/entities/system-parameters-config.entity';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import { FiscalConfigRevision } from '../entities/fiscal-config-revision.entity';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../entities/onboarding-session.entity';
import {
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../entities/activation-attempt.entity';
import {
  ActivationCheckCode,
  ActivationCheckResult,
  ActivationCheckStatus,
} from '../entities/activation-check-result.entity';
import {
  ActivationFollowUp,
  ActivationFollowUpStatus,
} from '../entities/activation-follow-up.entity';
import { ActivationService } from './activation.service';
import { FiscalConfigVersionService } from './fiscal-config-version.service';
import { OnboardingCatalogService } from './onboarding-catalog.service';
import { OnboardingSessionService } from './onboarding-session.service';
import { OnboardingReadinessEvaluator } from './onboarding-readiness.evaluator';
import { OnboardingStateReconciler } from './onboarding-state.reconciler';
import { ConflictException, BadRequestException } from '@nestjs/common';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for DB-backed service tests`);
  }
  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);
  if (!Number.isInteger(port)) {
    throw new Error('DB_PORT must be a valid integer');
  }
  return port;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: { dataSource: DataSource; schema: string }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [
        Tenant,
        SystemParametersConfig,
        FiscalConfigRevision,
        Product,
        OnboardingSession,
        ActivationAttempt,
        ActivationCheckResult,
        ActivationFollowUp,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    // Create partial unique index on real Postgres schema
    await dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_activation_attempts_single_active
      ON onboarding_activation_attempts (tenant_id, onboarding_session_id)
      WHERE status IN ('CREATED', 'IN_PROGRESS');
    `);

    await assertion({ dataSource, schema });
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

describe('ActivationService — Real PostgreSQL Persistence', () => {
  it('ONB1.7A: executes StartActivation and pins revisions with single active attempt constraint in real PostgreSQL', async () => {
    await withIsolatedSchema('onb_act_start', async ({ dataSource }) => {
      const tenantRepo = dataSource.getRepository(Tenant);
      const paramRepo = dataSource.getRepository(SystemParametersConfig);
      const revRepo = dataSource.getRepository(FiscalConfigRevision);
      const prodRepo = dataSource.getRepository(Product);
      const sessionRepo = dataSource.getRepository(OnboardingSession);
      const attemptRepo = dataSource.getRepository(ActivationAttempt);
      const checkRepo = dataSource.getRepository(ActivationCheckResult);
      const followUpRepo = dataSource.getRepository(ActivationFollowUp);

      const tenantId = randomUUID();
      await tenantRepo.save({
        id: tenantId,
        name: 'Restaurante El Fundador',
        ruc: 'J0310000001234',
        is_active: true,
      });

      // Seed fiscal config
      await paramRepo.save([
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

      // Seed sellable product
      const product = await prodRepo.save({
        tenant_id: tenantId,
        name: 'Gallo Pinto Especial',
        sellPrice: 85,
        uom: 'PLATO',
        product_type: ProductType.SIMPLE,
        is_active: true,
        stock: 0,
        averageCost: 0,
      });

      // Seed onboarding session in SALE_READY state
      const session = await sessionRepo.save({
        tenantId,
        lifecycleState: OnboardingLifecycleState.SALE_READY,
        saleReadyFirstAt: new Date(),
        measurementEligible: true,
        legacyBaseline: false,
        optimisticVersion: 1,
      });

      const fiscalService = new FiscalConfigVersionService(
        revRepo,
        tenantRepo,
        paramRepo,
        dataSource,
      );

      // Dummy readiness & reconciler for catalog service
      const dummyReadiness = {
        evaluate: jest.fn().mockResolvedValue({ saleReady: true }),
      } as unknown as OnboardingReadinessEvaluator;
      const dummyReconciler = {
        reconcile: jest.fn().mockResolvedValue(session),
      } as unknown as OnboardingStateReconciler;
      const dummySessionService = {
        ensureOnboardingStarted: jest.fn().mockResolvedValue(session),
      } as unknown as OnboardingSessionService;

      const catalogService = new OnboardingCatalogService(
        prodRepo,
        dummySessionService,
        dummyReadiness,
        dummyReconciler,
      );

      const activationService = new ActivationService(
        attemptRepo,
        checkRepo,
        followUpRepo,
        sessionRepo,
        fiscalService,
        catalogService,
        dummyReadiness,
        dataSource,
      );

      // 1. Start activation
      const attempt = await activationService.startActivation(
        tenantId,
        { candidateTerminalId: 'term-pos-01' },
        'user-admin-1',
      );

      expect(attempt).toBeDefined();
      expect(attempt.id).toBeDefined();
      expect(attempt.status).toBe(ActivationAttemptStatus.CREATED);
      expect(attempt.candidateTerminalId).toBe('term-pos-01');
      expect(attempt.requiredFiscalRevision).toBe(1);
      expect(attempt.requiredFiscalFingerprint).toBeDefined();
      expect(attempt.verificationProductId).toBe(product.id);
      expect(attempt.verificationProductRevision).toBe(1);
      expect(attempt.verificationProductFingerprint).toBeDefined();
      expect(attempt.serverTimeAnchorAt).toBeDefined();

      // Verify Session in DB
      const updatedSession = await sessionRepo.findOne({
        where: { tenantId },
      });
      expect(updatedSession?.lifecycleState).toBe(
        OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
      );
      expect(updatedSession?.currentActivationAttemptId).toBe(attempt.id);

      // 2. Reject second concurrent attempt (application & database constraint)
      await expect(
        activationService.startActivation(
          tenantId,
          { candidateTerminalId: 'term-pos-02' },
          'user-admin-1',
        ),
      ).rejects.toThrow(BadRequestException); // Because session is now ACTIVATION_IN_PROGRESS, not SALE_READY

      // Even if session state was temporarily simulated as SALE_READY, the active attempt guard catches it:
      updatedSession.lifecycleState = OnboardingLifecycleState.SALE_READY;
      await sessionRepo.save(updatedSession);

      await expect(
        activationService.startActivation(
          tenantId,
          { candidateTerminalId: 'term-pos-02' },
          'user-admin-1',
        ),
      ).rejects.toThrow(ConflictException);

      // ONB1.7B Ingest Check Real Persistence & Uniqueness Constraint
      const devicePrincipal = {
        tenantId,
        terminalId: 'term-pos-01',
      };

      const check1 = await activationService.ingestCheck(
        attempt.id,
        {
          checkCode: ActivationCheckCode.TERMINAL_LINKED,
          status: ActivationCheckStatus.PASS,
          evidenceType: 'DEVICE_IDENTITY',
          evidenceRef: 'token-abc-123',
        },
        devicePrincipal,
      );

      expect(check1).toBeDefined();
      expect(check1.id).toBeDefined();

      const attemptAfterCheck = await attemptRepo.findOne({
        where: { id: attempt.id },
      });
      expect(attemptAfterCheck?.status).toBe(
        ActivationAttemptStatus.IN_PROGRESS,
      );
      expect(attemptAfterCheck?.trustedTerminalId).toBe('term-pos-01');

      // Idempotent re-ingestion
      const checkReplay = await activationService.ingestCheck(
        attempt.id,
        {
          checkCode: ActivationCheckCode.TERMINAL_LINKED,
          status: ActivationCheckStatus.PASS,
          evidenceType: 'DEVICE_IDENTITY',
          evidenceRef: 'token-abc-123',
        },
        devicePrincipal,
      );
      expect(checkReplay.id).toBe(check1.id);

      // Conflicting status on same check triggers INTEGRITY_CONFLICT
      await expect(
        activationService.ingestCheck(
          attempt.id,
          {
            checkCode: ActivationCheckCode.TERMINAL_LINKED,
            status: ActivationCheckStatus.FAIL,
          },
          devicePrincipal,
        ),
      ).rejects.toThrow(ConflictException);

      // ONB1.7C: Ingest all remaining 9 checks with PASS
      const remainingCodes = [
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

      for (const code of remainingCodes) {
        await activationService.ingestCheck(
          attempt.id,
          {
            checkCode: code,
            status: ActivationCheckStatus.PASS,
            evidenceType: 'REAL_SQLITE_VERIFIED',
          },
          devicePrincipal,
        );
      }

      // Authoritative Backend Finalization: PASS
      const finalizedPass = await activationService.finalizeActivation(
        tenantId,
        attempt.id,
        'user-admin-1',
      );

      expect(finalizedPass.status).toBe(ActivationAttemptStatus.PASS);
      expect(finalizedPass.completedAt).toBeDefined();

      const sessionActivated = await sessionRepo.findOne({
        where: { tenantId },
      });
      expect(sessionActivated?.lifecycleState).toBe(
        OnboardingLifecycleState.ACTIVATED,
      );
      expect(sessionActivated?.activatedAt).toBeDefined();

      // Idempotent finalize replay
      const finalizeReplay = await activationService.finalizeActivation(
        tenantId,
        attempt.id,
        'user-admin-1',
      );
      expect(finalizeReplay.id).toBe(attempt.id);
      expect(finalizeReplay.status).toBe(ActivationAttemptStatus.PASS);
    });
  });

  it('ONB1.7C: executes PASS_WITH_WARNING with persistent ActivationFollowUp and FAIL with lifecycle revert in real PostgreSQL', async () => {
    await withIsolatedSchema('onb_act_warn_fail', async ({ dataSource }) => {
      const tenantRepo = dataSource.getRepository(Tenant);
      const paramRepo = dataSource.getRepository(SystemParametersConfig);
      const revRepo = dataSource.getRepository(FiscalConfigRevision);
      const prodRepo = dataSource.getRepository(Product);
      const sessionRepo = dataSource.getRepository(OnboardingSession);
      const attemptRepo = dataSource.getRepository(ActivationAttempt);
      const checkRepo = dataSource.getRepository(ActivationCheckResult);
      const followUpRepo = dataSource.getRepository(ActivationFollowUp);

      const tenantId = randomUUID();
      await tenantRepo.save({
        id: tenantId,
        name: 'Sucursal Warning/Fail',
        ruc: 'J0310000009999',
        is_active: true,
      });

      await paramRepo.save({
        tenant_id: tenantId,
        paramKey: 'FISCAL_REGIME',
        paramValue: 'REGIMEN_GENERAL',
        isActive: true,
      });

      await prodRepo.save({
        tenant_id: tenantId,
        name: 'Tostada con Queso',
        sellPrice: 40,
        uom: 'UN',
        product_type: ProductType.SIMPLE,
        is_active: true,
        stock: 0,
        averageCost: 0,
      });

      await sessionRepo.save({
        tenantId,
        lifecycleState: OnboardingLifecycleState.SALE_READY,
        saleReadyFirstAt: new Date(),
        measurementEligible: true,
        legacyBaseline: false,
        optimisticVersion: 1,
      });

      const fiscalService = new FiscalConfigVersionService(
        revRepo,
        tenantRepo,
        paramRepo,
        dataSource,
      );
      const dummyReadiness = {
        evaluate: jest.fn().mockResolvedValue({ saleReady: true }),
      } as unknown as OnboardingReadinessEvaluator;
      const dummyReconciler = {
        reconcile: jest.fn(),
      } as unknown as OnboardingStateReconciler;
      const dummySessionService = {
        ensureOnboardingStarted: jest.fn(),
      } as unknown as OnboardingSessionService;

      const catalogService = new OnboardingCatalogService(
        prodRepo,
        dummySessionService,
        dummyReadiness,
        dummyReconciler,
      );

      const activationService = new ActivationService(
        attemptRepo,
        checkRepo,
        followUpRepo,
        sessionRepo,
        fiscalService,
        catalogService,
        dummyReadiness,
        dataSource,
      );

      // --- Scenario 1: FAIL execution ---
      const attemptFail = await activationService.startActivation(
        tenantId,
        { candidateTerminalId: 'term-warn-01' },
        'user-admin-1',
      );

      const devicePrincipal = {
        tenantId,
        terminalId: 'term-warn-01',
      };

      // Ingest 1 check that is FAIL
      await activationService.ingestCheck(
        attemptFail.id,
        {
          checkCode: ActivationCheckCode.TERMINAL_LINKED,
          status: ActivationCheckStatus.FAIL,
        },
        devicePrincipal,
      );

      const finalizedFail = await activationService.finalizeActivation(
        tenantId,
        attemptFail.id,
        'user-admin-1',
      );

      expect(finalizedFail.status).toBe(ActivationAttemptStatus.FAIL);
      expect(finalizedFail.failureCode).toBeDefined();

      const sessionAfterFail = await sessionRepo.findOne({
        where: { tenantId },
      });
      // Reverted to SALE_READY because readiness was evaluated as true
      expect(sessionAfterFail?.lifecycleState).toBe(
        OnboardingLifecycleState.SALE_READY,
      );
      expect(sessionAfterFail?.activatedAt).toBeNull();

      // Constraint liberated: Since attemptFail is now in status FAIL, a new attempt can be started!
      const attemptWarn = await activationService.startActivation(
        tenantId,
        { candidateTerminalId: 'term-warn-01' },
        'user-admin-1',
      );
      expect(attemptWarn.id).not.toBe(attemptFail.id);
      expect(attemptWarn.status).toBe(ActivationAttemptStatus.CREATED);

      // --- Scenario 2: PASS_WITH_WARNING execution ---
      // Ingest 9 checks as PASS
      const first9Codes = [
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

      for (const code of first9Codes) {
        await activationService.ingestCheck(
          attemptWarn.id,
          {
            checkCode: code,
            status: ActivationCheckStatus.PASS,
          },
          devicePrincipal,
        );
      }

      // Ingest POST_RECONNECT_SYNC as WARNING
      await activationService.ingestCheck(
        attemptWarn.id,
        {
          checkCode: ActivationCheckCode.POST_RECONNECT_SYNC,
          status: ActivationCheckStatus.WARNING,
          evidenceRef: 'wan-network-drop-proof',
        },
        devicePrincipal,
      );

      const finalizedWarn = await activationService.finalizeActivation(
        tenantId,
        attemptWarn.id,
        'user-admin-1',
      );

      expect(finalizedWarn.status).toBe(
        ActivationAttemptStatus.PASS_WITH_WARNING,
      );
      expect(finalizedWarn.warningsCount).toBe(1);

      // Session is ACTIVATED
      const sessionAfterWarn = await sessionRepo.findOne({
        where: { tenantId },
      });
      expect(sessionAfterWarn?.lifecycleState).toBe(
        OnboardingLifecycleState.ACTIVATED,
      );
      expect(sessionAfterWarn?.activatedAt).toBeDefined();

      // Follow-up persisted in PostgreSQL
      const followUps = await followUpRepo.find({
        where: { tenantId, activationAttemptId: attemptWarn.id },
      });
      expect(followUps.length).toBe(1);
      expect(followUps[0].warningCode).toBe('POST_RECONNECT_SYNC_TRANSIENT');
      expect(followUps[0].status).toBe(ActivationFollowUpStatus.OPEN);
      expect(followUps[0].closureEvidenceRef).toBe('wan-network-drop-proof');

      // Close follow-up
      const closedFollowUp = await activationService.closeFollowUp(
        tenantId,
        followUps[0].id,
        { closureNote: 'Sync converged after connection restore' },
        'user-admin-1',
      );
      expect(closedFollowUp.status).toBe(ActivationFollowUpStatus.CLOSED);
      expect(closedFollowUp.closedAt).toBeDefined();

      // Ensure activatedAt in session remained intact
      const sessionFinal = await sessionRepo.findOne({
        where: { tenantId },
      });
      expect(sessionFinal?.activatedAt?.getTime()).toBe(
        sessionAfterWarn?.activatedAt?.getTime(),
      );
    });
  });
});
