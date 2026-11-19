import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/core/app/app.module';
import { runInTenantTransaction } from '../../src/core/database/tenant-transaction';
import { User, UserRole } from '../../src/modules/identity/entities/user.entity';
import {
  ACTIVATION_CONTRACT_V2,
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../../src/modules/onboarding/entities/activation-attempt.entity';
import {
  ActivationCheckCode,
  ActivationCheckResult,
  ActivationCheckStatus,
} from '../../src/modules/onboarding/entities/activation-check-result.entity';
import {
  OnboardingLifecycleState,
  OnboardingSession,
} from '../../src/modules/onboarding/entities/onboarding-session.entity';
import {
  ActivationService,
  V2_REQUIRED_ACTIVATION_CHECKS,
} from '../../src/modules/onboarding/services/activation.service';
import { hashInstallToken } from '../../src/modules/onboarding/services/install-kit.service';
import { AppRelease } from '../../src/modules/releases/entities/app-release.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';

interface ProvisionedTenantFixture {
  readonly tenantId: string;
  readonly slug: string;
  readonly ownerId: string;
  readonly ownerEmail: string;
  readonly password: string;
}

interface LoginResponseBody {
  readonly access_token: string;
}

interface CreateInstallTokenResponseBody {
  readonly id: string;
  readonly token: string;
  readonly tokenPrefix: string;
  readonly label: string | null;
  readonly createdAt: string;
}

interface InstallTokenListItemBody {
  readonly id: string;
  readonly tokenPrefix: string;
  readonly label: string | null;
  readonly active: boolean;
  readonly useCount: number;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
}

interface InstallTokenDbRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly token_hash: string;
  readonly token_prefix: string;
  readonly use_count: number;
  readonly last_used_at: Date | string | null;
  readonly revoked_at: Date | string | null;
}

interface ActivationAttemptDbRow {
  readonly id: string;
  readonly status: string;
  readonly failure_code: string | null;
}

interface AssetLinkEntry {
  readonly relation: readonly string[];
  readonly target: {
    readonly namespace: string;
    readonly package_name: string;
    readonly sha256_cert_fingerprints: readonly string[];
  };
}

/**
 * Real PostgreSQL + real HTTP (`supertest`) E2E suite proving end-to-end
 * operability of:
 * - Issue #958 (Fase 1): POS Install Kit (`/api/onboarding/install-tokens`,
 *   public root `GET /i/:token`, `GET /.well-known/assetlinks.json`, and
 *   multi-tenant RLS isolation on `install_tokens`).
 * - Issue #961: Mock/simulator printer evidence rejection in
 *   `ActivationService.finalizeActivation` persisted against real PostgreSQL.
 *
 * Run with:
 *   npx jest --config ./test/jest-e2e.json test/onboarding/install-kit-and-mock-printer.db.e2e-spec.ts --runInBand
 */
describe('Install Kit (#958) & Mock Printer Rejection (#961) real DB & HTTP E2E', () => {
  const TEST_TIMEOUT_MS = 60_000;
  const TEMP_RELEASE_VERSION_CODE = 999999;
  const TEMP_RELEASE_STORAGE_KEY = 'releases/pilot/e2e-arm64-999999.apk';

  let app: INestApplication;
  let dataSource: DataSource;
  let activationService: ActivationService;

  const createdTenantIds: string[] = [];
  const createdReleaseIds: string[] = [];
  const runSuffix = randomUUID().slice(0, 8);

  const savedEnv: Record<string, string | undefined> = {};
  const managedEnvKeys = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS',
  ] as const;

  let tenantA: ProvisionedTenantFixture;
  let tenantB: ProvisionedTenantFixture;

  async function provisionTenantWithOwner(
    label: string,
  ): Promise<ProvisionedTenantFixture> {
    const tenantId = randomUUID();
    const slug = `e2e-ik-${label}-${runSuffix}`;
    const ownerEmail = `owner-${label}-${runSuffix}@nhilos.test`;
    const password = `NhilosE2E!${runSuffix}`;
    const passwordHash = await bcrypt.hash(password, 10);

    const owner = await runInTenantTransaction(
      dataSource,
      tenantId,
      async (manager) => {
        await manager.save(
          Tenant,
          manager.create(Tenant, {
            id: tenantId,
            name: `Tenant ${label.toUpperCase()} E2E ${runSuffix}`,
            slug,
            ruc: `J0310000${runSuffix.slice(0, 6)}`,
            email: ownerEmail,
            is_active: true,
          }),
        );

        return await manager.save(
          User,
          manager.create(User, {
            tenant_id: tenantId,
            name: `Owner ${label.toUpperCase()}`,
            email: ownerEmail,
            role: UserRole.OWNER,
            password_hash: passwordHash,
            is_active: true,
          }),
        );
      },
    );

    createdTenantIds.push(tenantId);

    return {
      tenantId,
      slug,
      ownerId: owner.id,
      ownerEmail,
      password,
    };
  }

  async function loginAsOwner(
    fixture: ProvisionedTenantFixture,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/identity/login')
      .send({
        email: fixture.ownerEmail,
        pass: fixture.password,
        tenantSlug: fixture.slug,
      });

    expect([200, 201]).toContain(res.status);
    const body = res.body as LoginResponseBody;
    expect(typeof body.access_token).toBe('string');
    expect(body.access_token.length).toBeGreaterThan(20);
    return body.access_token;
  }

  async function cleanupTenant(tenantId: string): Promise<void> {
    const tenantTablesInDependencyOrder = [
      'onboarding_activation_follow_ups',
      'onboarding_activation_check_results',
      'onboarding_activation_attempts',
      'onboarding_sessions',
      'install_tokens',
      'change_logs',
      'users',
    ];

    await runInTenantTransaction(dataSource, tenantId, async (manager) => {
      for (const table of tenantTablesInDependencyOrder) {
        await manager
          .query(`DELETE FROM "${table}" WHERE tenant_id = $1`, [tenantId])
          .catch(() => undefined);
      }
      await manager
        .query(`DELETE FROM tenants WHERE id = $1`, [tenantId])
        .catch(() => undefined);
    }).catch(() => undefined);
  }

  beforeAll(async () => {
    for (const key of managedEnvKeys) {
      savedEnv[key] = process.env[key];
    }

    // Ensure R2 SigV4 signing credentials exist locally so R2StorageService
    // produces a real presigned URL without making external network calls.
    process.env.R2_ACCOUNT_ID ||= 'e2e-test-account';
    process.env.R2_ACCESS_KEY_ID ||= 'e2e-test-access-key-id';
    process.env.R2_SECRET_ACCESS_KEY ||= 'e2e-test-secret-access-key';
    process.env.R2_BUCKET_NAME ||= 'nhilos-pos';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    // Mirror src/main.ts global prefix and root Install Kit / App Links exclusions.
    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'i/:token', method: RequestMethod.GET },
        { path: '.well-known/assetlinks.json', method: RequestMethod.GET },
      ],
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    dataSource = app.get(DataSource);
    activationService = app.get(ActivationService);

    tenantA = await provisionTenantWithOwner('a');
    tenantB = await provisionTenantWithOwner('b');

    // Seed temporary app_releases row with high version_code so getLatestRelease
    // deterministically resolves our E2E artifact for channel='pilot', abi='arm64-v8a'.
    const releaseRepo = dataSource.getRepository(AppRelease);
    await releaseRepo.delete({
      channel: 'pilot',
      abi: 'arm64-v8a',
      version_code: TEMP_RELEASE_VERSION_CODE,
    });

    const release = await releaseRepo.save(
      releaseRepo.create({
        channel: 'pilot',
        abi: 'arm64-v8a',
        version_code: TEMP_RELEASE_VERSION_CODE,
        version_name: '9.99.99-e2e',
        sha256: 'a'.repeat(64),
        size_bytes: '42000000',
        storage_key: TEMP_RELEASE_STORAGE_KEY,
        min_from_version_code: 1,
        mandatory: false,
        notes: 'Temporary E2E release for Install Kit test',
        published_at: new Date(),
      }),
    );
    createdReleaseIds.push(release.id);
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      for (const releaseId of createdReleaseIds) {
        await dataSource
          .getRepository(AppRelease)
          .delete({ id: releaseId })
          .catch(() => undefined);
      }
      for (const tenantId of createdTenantIds) {
        await cleanupTenant(tenantId);
      }
    }

    for (const key of managedEnvKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }

    if (app) {
      await app.close();
    }
  }, TEST_TIMEOUT_MS);

  it(
    '#958: manages install tokens with tenant RLS isolation, serves sanitized HTML & signed 302 APK redirect, enforces revocation, and serves assetlinks.json',
    async () => {
      const jwtA = await loginAsOwner(tenantA);
      const jwtB = await loginAsOwner(tenantB);

      // 1. Tenant A creates an install token -> 201 with plaintext token + prefix
      const createRes = await request(app.getHttpServer())
        .post('/api/onboarding/install-tokens')
        .set('Authorization', `Bearer ${jwtA}`)
        .send({ label: 'Caja Principal E2E' })
        .expect(201);

      const created = createRes.body as CreateInstallTokenResponseBody;
      expect(typeof created.id).toBe('string');
      expect(typeof created.token).toBe('string');
      expect(created.token.length).toBeGreaterThanOrEqual(32);
      expect(created.tokenPrefix).toBe(created.token.slice(0, 8));
      expect(created.label).toBe('Caja Principal E2E');

      // Verify PostgreSQL stores only the 64-char SHA-256 hex digest, never plaintext
      const expectedHash = hashInstallToken(created.token);
      const storedRows = await runInTenantTransaction(
        dataSource,
        tenantA.tenantId,
        async (manager) =>
          (await manager.query(
            `SELECT id, tenant_id, token_hash, token_prefix, use_count, last_used_at, revoked_at
               FROM install_tokens
              WHERE id = $1`,
            [created.id],
          )) as InstallTokenDbRow[],
      );
      expect(storedRows).toHaveLength(1);
      expect(storedRows[0].token_hash).toBe(expectedHash);
      expect(storedRows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(storedRows[0].token_hash).not.toBe(created.token);
      expect(storedRows[0].use_count).toBe(0);
      expect(storedRows[0].last_used_at).toBeNull();

      // 2. Tenant A lists tokens -> sees its token
      const listARes = await request(app.getHttpServer())
        .get('/api/onboarding/install-tokens')
        .set('Authorization', `Bearer ${jwtA}`)
        .expect(200);
      const listA = listARes.body as InstallTokenListItemBody[];
      expect(listA.some((item) => item.id === created.id)).toBe(true);
      const listedToken = listA.find((item) => item.id === created.id);
      expect(listedToken?.tokenPrefix).toBe(created.tokenPrefix);
      expect(listedToken?.active).toBe(true);
      expect(listedToken?.useCount).toBe(0);

      // 3. Tenant B lists tokens -> sees 0 of Tenant A's tokens
      const listBRes = await request(app.getHttpServer())
        .get('/api/onboarding/install-tokens')
        .set('Authorization', `Bearer ${jwtB}`)
        .expect(200);
      const listB = listBRes.body as InstallTokenListItemBody[];
      expect(listB.some((item) => item.id === created.id)).toBe(false);
      expect(listB).toHaveLength(0);

      // 4. Tenant B cannot revoke Tenant A's token -> 404 (RLS + tenant boundary)
      await request(app.getHttpServer())
        .delete(`/api/onboarding/install-tokens/${created.id}`)
        .set('Authorization', `Bearer ${jwtB}`)
        .expect(404);

      // 5. Public root route GET /i/:token?code=AB23CD with Accept: text/html -> 200 HTML
      const htmlRes = await request(app.getHttpServer())
        .get(`/i/${created.token}?code=AB23CD`)
        .set('Accept', 'text/html')
        .expect(200);
      expect(htmlRes.headers['content-type']).toContain('text/html');
      expect(htmlRes.headers['cache-control']).toBe('no-store');
      expect(htmlRes.text).toContain('NHILOS POS');
      expect(htmlRes.text).toContain(
        `/i/${encodeURIComponent(created.token)}?download=1&amp;abi=arm64-v8a`,
      );
      expect(htmlRes.text).toContain('AB23CD');

      // Verify XSS payload in ?code= is sanitized / NOT echoed
      const xssRes = await request(app.getHttpServer())
        .get(`/i/${created.token}`)
        .query({ code: '<script>alert(1)</script>' })
        .set('Accept', 'text/html')
        .expect(200);
      expect(xssRes.text).not.toContain('<script>');
      expect(xssRes.text).not.toContain('alert(1)');
      expect(xssRes.text).not.toContain('class="code-box"');

      // 6. Public root route GET /i/:token?download=1&abi=arm64-v8a -> 302 signed URL + audit update
      const downloadRes = await request(app.getHttpServer())
        .get(`/i/${created.token}?download=1&abi=arm64-v8a`)
        .redirects(0)
        .expect(302);
      const locationHeader = downloadRes.headers.location;
      expect(typeof locationHeader).toBe('string');
      expect(locationHeader).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(locationHeader).toContain('X-Amz-Signature=');
      expect(locationHeader).toContain(TEMP_RELEASE_STORAGE_KEY);

      const usedRows = await runInTenantTransaction(
        dataSource,
        tenantA.tenantId,
        async (manager) =>
          (await manager.query(
            `SELECT id, tenant_id, token_hash, token_prefix, use_count, last_used_at, revoked_at
               FROM install_tokens
              WHERE id = $1`,
            [created.id],
          )) as InstallTokenDbRow[],
      );
      expect(usedRows).toHaveLength(1);
      expect(usedRows[0].use_count).toBe(1);
      expect(usedRows[0].last_used_at).not.toBeNull();

      // 7. Invalid ABI -> 400 Bad Request
      await request(app.getHttpServer())
        .get(`/i/${created.token}?download=1&abi=universal`)
        .expect(400);

      // 8. Tenant A revokes token -> 204; subsequent download -> 410 Gone
      await request(app.getHttpServer())
        .delete(`/api/onboarding/install-tokens/${created.id}`)
        .set('Authorization', `Bearer ${jwtA}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/i/${created.token}?download=1`)
        .expect(410);

      // 9. Unknown token -> 404 Not Found
      await request(app.getHttpServer())
        .get('/i/nonexistent-token-xyz')
        .expect(404);

      // 10. Public root route GET /.well-known/assetlinks.json -> 200 application/json
      const testFingerprint =
        'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
      process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS = testFingerprint;

      const assetLinksRes = await request(app.getHttpServer())
        .get('/.well-known/assetlinks.json')
        .expect(200);
      expect(assetLinksRes.headers['content-type']).toContain(
        'application/json',
      );
      const assetLinksBody = assetLinksRes.body as AssetLinkEntry[];
      expect(Array.isArray(assetLinksBody)).toBe(true);
      expect(assetLinksBody).toHaveLength(1);
      expect(assetLinksBody[0].target.namespace).toBe('android_app');
      expect(assetLinksBody[0].target.package_name).toBe('com.nhilos.pos_app');
      expect(assetLinksBody[0].target.sha256_cert_fingerprints).toContain(
        testFingerprint,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    '#961: ActivationService.finalizeActivation rejects MOCK/simulated printer evidence in PostgreSQL and accepts IPOS_Q80 hardware evidence',
    async () => {
      const now = new Date();

      const seedV2AttemptWithChecks = async (params: {
        terminalId: string;
        printerDetails: Record<string, unknown>;
      }): Promise<string> => {
        return await runInTenantTransaction(
          dataSource,
          tenantA.tenantId,
          async (manager) => {
            const sessionRepo = manager.getRepository(OnboardingSession);
            let session = await sessionRepo.findOne({
              where: { tenantId: tenantA.tenantId },
            });
            if (!session) {
              session = await sessionRepo.save(
                sessionRepo.create({
                  tenantId: tenantA.tenantId,
                  lifecycleState:
                    OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
                  onboardingStartedAt: now,
                  saleReadyFirstAt: now,
                  activationStartedAt: now,
                  lastActivityAt: now,
                }),
              );
            } else {
              session.lifecycleState =
                OnboardingLifecycleState.ACTIVATION_IN_PROGRESS;
              session.lastActivityAt = now;
              session = await sessionRepo.save(session);
            }

            const attemptRepo = manager.getRepository(ActivationAttempt);
            const attempt = await attemptRepo.save(
              attemptRepo.create({
                tenantId: tenantA.tenantId,
                onboardingSessionId: session.id,
                candidateTerminalId: params.terminalId,
                trustedTerminalId: params.terminalId,
                status: ActivationAttemptStatus.IN_PROGRESS,
                startedByUserId: tenantA.ownerId,
                startedAt: now,
                serverTimeAnchorAt: now,
                requiredFiscalRevision: 1,
                requiredFiscalFingerprint: 'b'.repeat(64),
                verificationProductId: randomUUID(),
                verificationProductRevision: 1,
                verificationProductFingerprint: 'c'.repeat(64),
                contractVersion: ACTIVATION_CONTRACT_V2,
                posBuild: '1.0.0-e2e',
                warningsCount: 0,
              }),
            );

            const checkRepo = manager.getRepository(ActivationCheckResult);
            for (const checkCode of V2_REQUIRED_ACTIVATION_CHECKS) {
              let detailsSanitizedJson: Record<string, unknown> | null = null;
              if (
                checkCode === ActivationCheckCode.NON_FISCAL_TEST_PRINT ||
                checkCode === ActivationCheckCode.PRINTER_AVAILABLE
              ) {
                detailsSanitizedJson = params.printerDetails;
              } else if (
                checkCode === ActivationCheckCode.VERIFICATION_SEQUENCE_DRY_RUN
              ) {
                detailsSanitizedJson = { proposedSequence: 1 };
              }

              await checkRepo.save(
                checkRepo.create({
                  tenantId: tenantA.tenantId,
                  activationAttemptId: attempt.id,
                  checkCode,
                  required: true,
                  status: ActivationCheckStatus.PASS,
                  evidenceType: 'E2E_VERIFICATION',
                  evidenceRef: `ref-${checkCode}`,
                  occurredAt: now,
                  recordedAt: now,
                  detailsSanitizedJson,
                }),
              );
            }

            return attempt.id;
          },
        );
      };

      // Attempt 1: NON_FISCAL_TEST_PRINT carries MOCK / simulated evidence -> must FAIL
      const mockAttemptId = await seedV2AttemptWithChecks({
        terminalId: `CAJA-MOCK-${runSuffix}`,
        printerDetails: { driverType: 'MOCK', simulated: true },
      });

      const finalizedMock = await activationService.finalizeActivation(
        tenantA.tenantId,
        mockAttemptId,
        tenantA.ownerId,
      );
      expect(finalizedMock.status).toBe(ActivationAttemptStatus.FAIL);
      expect(finalizedMock.failureCode).toBe(
        'ACTIVATION_MOCK_PRINTER_EVIDENCE_NOT_ALLOWED',
      );

      // Verify persisted row in PostgreSQL
      const mockDbRows = await runInTenantTransaction(
        dataSource,
        tenantA.tenantId,
        async (manager) =>
          (await manager.query(
            `SELECT id, status, failure_code
               FROM onboarding_activation_attempts
              WHERE id = $1`,
            [mockAttemptId],
          )) as ActivationAttemptDbRow[],
      );
      expect(mockDbRows).toHaveLength(1);
      expect(mockDbRows[0].status).toBe(ActivationAttemptStatus.FAIL);
      expect(mockDbRows[0].failure_code).toBe(
        'ACTIVATION_MOCK_PRINTER_EVIDENCE_NOT_ALLOWED',
      );

      // Attempt 2: NON_FISCAL_TEST_PRINT carries real IPOS_Q80 hardware evidence -> must PASS
      const hardwareAttemptId = await seedV2AttemptWithChecks({
        terminalId: `CAJA-Q80-${runSuffix}`,
        printerDetails: { driverType: 'IPOS_Q80', simulated: false },
      });

      const finalizedHardware = await activationService.finalizeActivation(
        tenantA.tenantId,
        hardwareAttemptId,
        tenantA.ownerId,
      );
      expect(finalizedHardware.failureCode).not.toBe(
        'ACTIVATION_MOCK_PRINTER_EVIDENCE_NOT_ALLOWED',
      );
      expect(finalizedHardware.status).toBe(ActivationAttemptStatus.PASS);
      expect(finalizedHardware.failureCode).toBeNull();

      // Verify persisted row in PostgreSQL
      const hardwareDbRows = await runInTenantTransaction(
        dataSource,
        tenantA.tenantId,
        async (manager) =>
          (await manager.query(
            `SELECT id, status, failure_code
               FROM onboarding_activation_attempts
              WHERE id = $1`,
            [hardwareAttemptId],
          )) as ActivationAttemptDbRow[],
      );
      expect(hardwareDbRows).toHaveLength(1);
      expect(hardwareDbRows[0].status).toBe(ActivationAttemptStatus.PASS);
      expect(hardwareDbRows[0].failure_code).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );
});
