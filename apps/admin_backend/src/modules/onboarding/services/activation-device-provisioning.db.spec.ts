import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { SystemParametersConfig } from '../../inventory/entities/system-parameters-config.entity';
import { Product } from '../../inventory/entities/product.entity';
import { FiscalConfigRevision } from '../entities/fiscal-config-revision.entity';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../entities/onboarding-session.entity';
import {
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../entities/activation-attempt.entity';
import { ActivationCheckResult } from '../entities/activation-check-result.entity';
import { ActivationFollowUp } from '../entities/activation-follow-up.entity';
import { ChangeLog } from '../../audit/entities/change-log.entity';
import { ChangeLogService } from '../../audit/change-log.service';
import { Invoice } from '../../sales/entities/invoice.entity';
import { InvoiceItem } from '../../sales/entities/invoice-item.entity';
import { InvoiceItemModifier } from '../../sales/entities/invoice-item-modifier.entity';
import { Payment } from '../../sales/entities/payment.entity';
import { ActivationService } from './activation.service';
import { FiscalConfigVersionService } from './fiscal-config-version.service';
import { OnboardingCatalogService } from './onboarding-catalog.service';
import { OnboardingReadinessEvaluator } from './onboarding-readiness.evaluator';
import { OnboardingSessionService } from './onboarding-session.service';
import { OnboardingStateReconciler } from './onboarding-state.reconciler';
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
} from '../../identity/entities/device-sync-credential.entity';
import {
  DeviceSyncCredentialEvent,
  DeviceSyncCredentialEventType,
} from '../../identity/entities/device-sync-credential-event.entity';
import { TenantTopologyRevision } from '../../fulfillment/entities/tenant-topology-revision.entity';
import { DeviceSyncCredentialService } from '../../identity/services/device-sync-credential.service';
import { TenantTopologyRevisionService } from '../../fulfillment/services/tenant-topology-revision.service';
import { DeviceSyncJwtConfig } from '../../identity/config/device-sync-jwt.config';
import { compareDeviceRenewalSecret } from '../../identity/security/device-renewal-secret-verifier';

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

const testDeviceSyncJwtConfig: DeviceSyncJwtConfig = {
  secret: 'device-sync-test-secret-must-be-thirty-two-chars-long-or-more',
  issuer: 'omnifood-admin',
  audience: 'omnifood-device-sync',
  accessTokenTtlSeconds: 900,
  renewalTtlSeconds: 2592000,
  clockToleranceSeconds: 5,
  algorithm: 'HS256',
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
        ChangeLog,
        Invoice,
        InvoiceItem,
        InvoiceItemModifier,
        Payment,
        DeviceSyncCredential,
        DeviceSyncCredentialEvent,
        TenantTopologyRevision,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    await assertion({ dataSource, schema });
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

describe('Activation Device Credential Provisioning (db)', () => {
  it('enforces approved device provisioning lifecycle: PENDING -> token denied -> CONFIRMED/ACTIVE -> duplicate no-op -> pending replacement -> topology mismatch', async () => {
    await withIsolatedSchema('act_prov_lifecycle', async ({ dataSource }) => {
      const tenantId = randomUUID();
      const q80DeviceId = 'Q802024120001';

      // Seed Tenant
      await dataSource.getRepository(Tenant).save({
        id: tenantId,
        name: 'Lifecycle Test Tenant',
        slug: tenantId,
        currency: 'NIO',
        is_active: true,
      });

      // Seed OnboardingSession
      const session = await dataSource.getRepository(OnboardingSession).save({
        tenantId,
        lifecycleState: OnboardingLifecycleState.ACTIVATED,
        activatedAt: new Date(),
        lastActivityAt: new Date(),
        optimisticVersion: 1,
      });

      // Seed PASS ActivationAttempt for Q80
      const attempt = await dataSource.getRepository(ActivationAttempt).save({
        tenantId,
        onboardingSessionId: session.id,
        candidateTerminalId: q80DeviceId,
        trustedTerminalId: q80DeviceId,
        status: ActivationAttemptStatus.PASS,
        startedByUserId: 'user-op-1',
        startedAt: new Date(),
        completedAt: new Date(),
        serverTimeAnchorAt: new Date(),
        requiredFiscalRevision: 1,
        requiredFiscalFingerprint: 'fiscal-fp-1',
        verificationProductId: 'prod-verify-1',
        verificationProductRevision: 1,
        verificationProductFingerprint: 'prod-fp-1',
        verificationTicketId: 'ticket-1',
      });

      // Seed Canonical Tenant Topology
      await dataSource.getRepository(TenantTopologyRevision).save({
        tenant_id: tenantId,
        contract_version: 1,
        revision: 1,
        hash: 'hash-topo-q80',
        topology: {
          operationMode: 'FOOD_PARK',
          channels: ['KDS_AND_PRINT'],
          devices: [
            {
              deviceId: q80DeviceId,
              roles: ['CASHIER'],
              capabilities: ['PRINT'],
            },
          ],
        },
      });

      const jwtService = new JwtService();
      const deviceCredentialRepo =
        dataSource.getRepository(DeviceSyncCredential);
      const deviceEventRepo = dataSource.getRepository(
        DeviceSyncCredentialEvent,
      );
      const attemptRepo = dataSource.getRepository(ActivationAttempt);

      const deviceSyncService = new DeviceSyncCredentialService(
        dataSource,
        deviceCredentialRepo,
        deviceEventRepo,
        attemptRepo,
        jwtService,
        testDeviceSyncJwtConfig,
      );

      const topologyService = new TenantTopologyRevisionService(dataSource);

      const changeLogService = new ChangeLogService(
        dataSource.getRepository(ChangeLog),
      );

      const dummyReadiness = {
        evaluate: jest.fn().mockResolvedValue({ saleReady: true }),
      } as unknown as OnboardingReadinessEvaluator;
      const dummyReconciler = {
        reconcile: jest.fn().mockResolvedValue(session),
      } as unknown as OnboardingStateReconciler;
      const dummySessionService = {
        ensureOnboardingStarted: jest.fn().mockResolvedValue(session),
      } as unknown as OnboardingSessionService;

      const fiscalService = new FiscalConfigVersionService(
        dataSource.getRepository(FiscalConfigRevision),
        dataSource.getRepository(Tenant),
        dataSource.getRepository(SystemParametersConfig),
        dataSource,
      );

      const catalogService = new OnboardingCatalogService(
        dataSource.getRepository(Product),
        dummySessionService,
        dummyReadiness,
        dummyReconciler,
      );

      const activationService = new ActivationService(
        attemptRepo,
        dataSource.getRepository(ActivationCheckResult),
        dataSource.getRepository(ActivationFollowUp),
        dataSource.getRepository(OnboardingSession),
        fiscalService,
        catalogService,
        dummyReadiness,
        dataSource,
        changeLogService,
        undefined, // invoicesService
        deviceSyncService,
        topologyService,
      );

      // =========================================================================
      // 1. provision returns PENDING
      // =========================================================================
      const provisionResult = await activationService.provisionDeviceCredential(
        tenantId,
        attempt.id,
      );

      expect(provisionResult.credentialId).toBeDefined();
      expect(provisionResult.tenantId).toBe(tenantId);
      expect(provisionResult.deviceId).toBe(q80DeviceId);
      expect(provisionResult.status).toBe(DeviceSyncCredentialStatus.PENDING);
      expect(provisionResult.credentialVersion).toBe(1);
      expect(provisionResult.renewalSecret).toBeDefined();
      expect(typeof provisionResult.renewalSecret).toBe('string');
      expect((provisionResult as any).renewalSecretHash).toBeUndefined();

      const persistedPending = await deviceCredentialRepo.findOne({
        where: { id: provisionResult.credentialId },
      });
      expect(persistedPending).toBeDefined();
      expect(persistedPending.status).toBe(DeviceSyncCredentialStatus.PENDING);
      expect(persistedPending.version).toBe(1);
      const isHashValid = await compareDeviceRenewalSecret(
        provisionResult.renewalSecret,
        persistedPending.renewalSecretHash,
      );
      expect(isHashValid).toBe(true);

      // =========================================================================
      // 2. token exchange denied before confirm
      // =========================================================================
      await expect(
        deviceSyncService.renewAccessToken({
          credentialId: provisionResult.credentialId,
          renewalSecret: provisionResult.renewalSecret,
          declarativeTenantId: tenantId,
          declarativeDeviceId: q80DeviceId,
        }),
      ).rejects.toThrow(UnauthorizedException);

      // =========================================================================
      // 3. confirm transitions ACTIVE
      // =========================================================================
      const confirmResult = await activationService.confirmDeviceCredential(
        tenantId,
        attempt.id,
        {
          credentialId: provisionResult.credentialId,
          credentialVersion: provisionResult.credentialVersion,
          renewalSecret: provisionResult.renewalSecret,
          deviceId: q80DeviceId,
        },
      );

      expect(confirmResult.credentialId).toBe(provisionResult.credentialId);
      expect(confirmResult.status).toBe(DeviceSyncCredentialStatus.ACTIVE);
      expect(confirmResult.credentialVersion).toBe(1);

      const persistedActive = await deviceCredentialRepo.findOne({
        where: { id: provisionResult.credentialId },
      });
      expect(persistedActive.status).toBe(DeviceSyncCredentialStatus.ACTIVE);

      // Token exchange now succeeds
      const tokenResponse = await deviceSyncService.renewAccessToken({
        credentialId: provisionResult.credentialId,
        renewalSecret: provisionResult.renewalSecret,
        declarativeTenantId: tenantId,
        declarativeDeviceId: q80DeviceId,
      });
      expect(tokenResponse.accessToken).toBeDefined();
      expect(tokenResponse.tokenType).toBe('Bearer');
      expect(tokenResponse.expiresIn).toBe(900);
      expect(tokenResponse.principal.deviceId).toBe(q80DeviceId);

      // =========================================================================
      // 4. audit contains pending + confirmed events
      // =========================================================================
      const events = await deviceEventRepo.find({
        where: { credentialId: provisionResult.credentialId },
        order: { occurredAt: 'ASC' },
      });
      // Includes PROVISIONED, CONFIRMED, and TOKEN_ISSUED from step 3 token exchange
      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain(DeviceSyncCredentialEventType.PROVISIONED);
      expect(eventTypes).toContain(DeviceSyncCredentialEventType.CONFIRMED);

      const provEvent = events.find(
        (e) =>
          e.eventType === (DeviceSyncCredentialEventType.PROVISIONED as string),
      );
      expect(provEvent.metadata).toEqual({
        deviceId: q80DeviceId,
        activationAttemptId: attempt.id,
        scopes: ['sync:push', 'sync:pull'],
        version: 1,
      });
      // Never leak plain secret in audit logs
      for (const ev of events) {
        expect(JSON.stringify(ev.metadata)).not.toContain(
          provisionResult.renewalSecret,
        );
      }

      // =========================================================================
      // 5. duplicate ACTIVE provisioning is no-op/no secret/no new row
      // =========================================================================
      const duplicateResult = await activationService.provisionDeviceCredential(
        tenantId,
        attempt.id,
      );
      expect(duplicateResult.credentialId).toBe(provisionResult.credentialId);
      expect(duplicateResult.status).toBe(DeviceSyncCredentialStatus.ACTIVE);
      expect(duplicateResult.renewalSecret).toBeUndefined(); // no new secret returned

      const totalRowsForAttempt = await deviceCredentialRepo.count({
        where: { activationAttemptId: attempt.id },
      });
      expect(totalRowsForAttempt).toBe(1);

      // =========================================================================
      // 6. pending replacement produces N+1 and retires N
      // =========================================================================
      // Create a fresh PASS attempt to exercise pending replacement without prior active state
      const attempt2 = await attemptRepo.save({
        tenantId,
        onboardingSessionId: session.id,
        candidateTerminalId: q80DeviceId,
        trustedTerminalId: q80DeviceId,
        status: ActivationAttemptStatus.PASS,
        startedByUserId: 'user-op-2',
        startedAt: new Date(),
        completedAt: new Date(),
        serverTimeAnchorAt: new Date(),
        requiredFiscalRevision: 1,
        requiredFiscalFingerprint: 'fp-2',
        verificationProductId: 'prod-2',
        verificationProductRevision: 1,
        verificationProductFingerprint: 'fp-prod-2',
      });

      // Provision initial pending (v1)
      const firstPending = await activationService.provisionDeviceCredential(
        tenantId,
        attempt2.id,
      );
      expect(firstPending.credentialVersion).toBe(1);
      expect(firstPending.status).toBe(DeviceSyncCredentialStatus.PENDING);

      // Second provision while first is still PENDING -> supersedes v1 with v2
      const secondPending = await activationService.provisionDeviceCredential(
        tenantId,
        attempt2.id,
      );
      expect(secondPending.credentialVersion).toBe(2);
      expect(secondPending.status).toBe(DeviceSyncCredentialStatus.PENDING);
      expect(secondPending.credentialId).not.toBe(firstPending.credentialId);

      // Old credential (v1) must now be RETIRED
      const retiredV1 = await deviceCredentialRepo.findOne({
        where: { id: firstPending.credentialId },
      });
      expect(retiredV1.status).toBe(DeviceSyncCredentialStatus.RETIRED);

      const retiredEvents = await deviceEventRepo.find({
        where: { credentialId: firstPending.credentialId },
      });
      const retiredTypes = retiredEvents.map((e) => e.eventType);
      expect(retiredTypes).toContain(DeviceSyncCredentialEventType.RETIRED);

      // =========================================================================
      // 7. stale N confirm rejected
      // =========================================================================
      await expect(
        activationService.confirmDeviceCredential(tenantId, attempt2.id, {
          credentialId: firstPending.credentialId,
          credentialVersion: firstPending.credentialVersion,
          renewalSecret: firstPending.renewalSecret,
          deviceId: q80DeviceId,
        }),
      ).rejects.toThrow(BadRequestException);

      // Confirming the new N+1 (v2) succeeds
      const confirmV2 = await activationService.confirmDeviceCredential(
        tenantId,
        attempt2.id,
        {
          credentialId: secondPending.credentialId,
          credentialVersion: secondPending.credentialVersion,
          renewalSecret: secondPending.renewalSecret,
          deviceId: q80DeviceId,
        },
      );
      expect(confirmV2.status).toBe(DeviceSyncCredentialStatus.ACTIVE);
      expect(confirmV2.credentialVersion).toBe(2);

      // =========================================================================
      // 8. topology mismatch denied
      // =========================================================================
      const attemptMismatch = await attemptRepo.save({
        tenantId,
        onboardingSessionId: session.id,
        candidateTerminalId: 'UNKNOWN_TERMINAL_99',
        trustedTerminalId: 'UNKNOWN_TERMINAL_99',
        status: ActivationAttemptStatus.PASS,
        startedByUserId: 'user-op-3',
        startedAt: new Date(),
        completedAt: new Date(),
        serverTimeAnchorAt: new Date(),
        requiredFiscalRevision: 1,
        requiredFiscalFingerprint: 'fp-3',
        verificationProductId: 'prod-3',
        verificationProductRevision: 1,
        verificationProductFingerprint: 'fp-prod-3',
      });

      await expect(
        activationService.provisionDeviceCredential(
          tenantId,
          attemptMismatch.id,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
