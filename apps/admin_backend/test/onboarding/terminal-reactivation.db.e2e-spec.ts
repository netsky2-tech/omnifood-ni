import { createHash, randomUUID } from 'crypto';
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
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
} from '../../src/modules/identity/entities/device-sync-credential.entity';
import { User, UserRole } from '../../src/modules/identity/entities/user.entity';
import {
  ACTIVATION_CONTRACT_V2,
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../../src/modules/onboarding/entities/activation-attempt.entity';
import {
  OnboardingLifecycleState,
  OnboardingSession,
} from '../../src/modules/onboarding/entities/onboarding-session.entity';
import { TerminalInstallFingerprint } from '../../src/modules/onboarding/entities/terminal-install-fingerprint.entity';
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

interface DeviceLookupResponseBody {
  readonly found: boolean;
  readonly recoveryChallengeId?: string;
  readonly status?: string;
  readonly maskedHint?: string;
  readonly expiresAt?: string;
}

interface ChallengeListItemBody {
  readonly id: string;
  readonly terminalId: string;
  readonly status: string;
  readonly reason: string;
}

interface CompleteReactivationResponseBody {
  readonly tenantId: string;
  readonly slug: string;
  readonly terminalId: string;
  readonly activationAttemptId: string;
  readonly credentialId: string;
  readonly version: number;
  readonly previousVersion: number;
  readonly renewalSecret: string;
  readonly expiresAt: string;
}

interface ConfirmReactivationResponseBody {
  readonly credentialId: string;
  readonly version: number;
  readonly status: string;
}

interface IssueRecoveryCodeResponseBody {
  readonly recoveryCode: string;
  readonly terminalId: string;
}

interface InitiateReactivationResponseBody {
  readonly mode: string;
  readonly terminalId: string;
  readonly linkingCode?: string;
  readonly expiresAt?: string;
}

interface ClaimLinkingCodeResponseBody {
  readonly tenantId: string;
  readonly slug: string;
  readonly deviceId: string;
  readonly reactivationChallengeId?: string | null;
}

interface TenantTerminalResponseBody {
  readonly credentialId: string;
  readonly terminalId: string;
  readonly status: string;
  readonly credentialVersion: number;
  readonly revocationReason: string | null;
  readonly credentialHistory: ReadonlyArray<{
    readonly id: string;
    readonly version: number;
    readonly status: string;
    readonly revocationReason: string | null;
  }>;
}

function sha256Hex(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

/**
 * Real PostgreSQL + real HTTP (`supertest`) E2E suite proving end-to-end
 * operability of GitHub issue #566 (Terminal Reactivation, Hardware Fingerprint
 * Discovery, Dual Human Approval, Credential Rotation Lineage, Factory Reset,
 * Lifecycle Protection, and Multi-Tenant Isolation).
 *
 * Run with:
 *   npx jest --config ./test/jest-e2e.json test/onboarding/terminal-reactivation.db.e2e-spec.ts --runInBand
 */
describe('Terminal Reactivation & Credential Lineage (#566) real DB & HTTP E2E', () => {
  const TEST_TIMEOUT_MS = 60_000;

  let app: INestApplication;
  let dataSource: DataSource;

  const createdTenantIds: string[] = [];
  const runSuffix = randomUUID().slice(0, 8);
  const canonicalTerminalId = `term-caja-barra-${runSuffix}`;
  const hardwareFp1 = sha256Hex(`android-id-primary-${runSuffix}`);
  const hardwareFp2 = sha256Hex(`android-id-factory-reset-${runSuffix}`);
  const unknownFp = sha256Hex(`android-id-unknown-${runSuffix}`);

  let tenantA: ProvisionedTenantFixture;
  let tenantB: ProvisionedTenantFixture;
  let tokenA: string;
  let tokenB: string;
  let seededAttemptId: string;
  let issuedRecoveryCode: string;

  async function provisionTenantWithOwner(
    label: string,
  ): Promise<ProvisionedTenantFixture> {
    const tenantId = randomUUID();
    const slug = `e2e-r566-${label}-${runSuffix}`;
    const ownerEmail = `owner-r566-${label}-${runSuffix}@nhilos.test`;
    const password = `Nhilos566!${runSuffix}`;
    const passwordHash = await bcrypt.hash(password, 10);

    const owner = await runInTenantTransaction(
      dataSource,
      tenantId,
      async (manager) => {
        await manager.save(
          Tenant,
          manager.create(Tenant, {
            id: tenantId,
            name: `Cafe ${label.toUpperCase()} ${runSuffix}`,
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
    return body.access_token;
  }

  async function cleanupTenant(tenantId: string): Promise<void> {
    const tables = [
      'terminal_reactivation_challenges',
      'terminal_recovery_codes',
      'terminal_install_fingerprints',
      'device_linking_codes',
      'onboarding_activation_follow_ups',
      'onboarding_activation_check_results',
      'onboarding_activation_attempts',
      'onboarding_sessions',
      'change_logs',
      'users',
    ];

    await runInTenantTransaction(dataSource, tenantId, async (manager) => {
      for (const table of tables) {
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
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
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

    tenantA = await provisionTenantWithOwner('a');
    tenantB = await provisionTenantWithOwner('b');
    tokenA = await loginAsOwner(tenantA);
    tokenB = await loginAsOwner(tenantB);

    // Seed Tenant A with an ACTIVATED session, a finalized PASS attempt,
    // an ACTIVE v1 DeviceSyncCredential, and the initial hardware fingerprint.
    const now = new Date();
    const secretHash = await bcrypt.hash('initial-v1-secret', 10);

    await runInTenantTransaction(
      dataSource,
      tenantA.tenantId,
      async (manager) => {
        const session = await manager.save(
          OnboardingSession,
          manager.create(OnboardingSession, {
            tenantId: tenantA.tenantId,
            lifecycleState: OnboardingLifecycleState.ACTIVATED,
            activatedAt: now,
          }),
        );

        const attempt = await manager.save(
          ActivationAttempt,
          manager.create(ActivationAttempt, {
            tenantId: tenantA.tenantId,
            onboardingSessionId: session.id,
            candidateTerminalId: canonicalTerminalId,
            trustedTerminalId: canonicalTerminalId,
            status: ActivationAttemptStatus.PASS,
            startedByUserId: tenantA.ownerId,
            startedAt: now,
            completedAt: now,
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
        seededAttemptId = attempt.id;

        await manager.save(
          DeviceSyncCredential,
          manager.create(DeviceSyncCredential, {
            tenantId: tenantA.tenantId,
            activationAttemptId: attempt.id,
            renewalSecretHash: secretHash,
            scopes: ['sync:push', 'sync:pull'],
            version: 1,
            status: DeviceSyncCredentialStatus.ACTIVE,
            issuedAt: now,
            expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          }),
        );

        await manager.save(
          TerminalInstallFingerprint,
          manager.create(TerminalInstallFingerprint, {
            tenantId: tenantA.tenantId,
            terminalId: canonicalTerminalId,
            fingerprintHash: hardwareFp1,
            firstSeenAt: now,
            lastSeenAt: now,
          }),
        );
      },
    );

    // Issue a one-time 6-digit recovery code for offline fallback test.
    const recoveryRes = await request(app.getHttpServer())
      .post(
        `/api/onboarding/activation/terminals/${encodeURIComponent(canonicalTerminalId)}/recovery-code`,
      )
      .set('Authorization', `Bearer ${tokenA}`)
      .send();

    expect(recoveryRes.status).toBe(201);
    const recoveryBody = recoveryRes.body as IssueRecoveryCodeResponseBody;
    expect(recoveryBody.recoveryCode).toMatch(/^\d{6}$/);
    issuedRecoveryCode = recoveryBody.recoveryCode;
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      for (const tenantId of createdTenantIds) {
        await cleanupTenant(tenantId);
      }
    }
    if (app) {
      await app.close();
    }
  }, TEST_TIMEOUT_MS);

  it(
    'enforces lifecycle guard, privacy-safe lookup, 2-tenant isolation, dashboard approval, and v1->v2 rotation lineage',
    async () => {
      // 1. startActivation rejects duplicate attempt on ACTIVE terminal without approved reactivation
      const dupAttemptRes = await request(app.getHttpServer())
        .post('/api/onboarding/activation/attempts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ candidateTerminalId: canonicalTerminalId });

      expect(dupAttemptRes.status).toBe(409);
      expect((dupAttemptRes.body as { code?: string }).code).toBe(
        'TERMINAL_ALREADY_ACTIVE_USE_REACTIVATION',
      );

      // 2. Unknown hardware fingerprint returns identical { found: false }
      const unknownRes = await request(app.getHttpServer())
        .post('/api/onboarding/activation/device-lookup')
        .send({ hardwareFingerprint: unknownFp });

      expect(unknownRes.status).toBe(200);
      expect(unknownRes.body).toEqual({ found: false });

      // 3. Known hardware fingerprint returns maskedHint + challengeId without leaking IDs/slug/secrets
      const lookupRes = await request(app.getHttpServer())
        .post('/api/onboarding/activation/device-lookup')
        .send({ hardwareFingerprint: hardwareFp1 });

      expect(lookupRes.status).toBe(200);
      const lookupBody = lookupRes.body as DeviceLookupResponseBody;
      expect(lookupBody.found).toBe(true);
      expect(typeof lookupBody.recoveryChallengeId).toBe('string');
      expect(lookupBody.status).toBe('PENDING');
      expect(typeof lookupBody.maskedHint).toBe('string');
      expect(lookupBody.maskedHint).not.toContain(tenantA.tenantId);
      expect(lookupBody.maskedHint).not.toContain(tenantA.slug);
      expect(lookupBody.maskedHint).not.toContain(canonicalTerminalId);

      const challengeId = lookupBody.recoveryChallengeId as string;

      // 4. Without human approval or recovery code, reactivation CANNOT advance
      const blockedRes = await request(app.getHttpServer())
        .post(`/api/onboarding/activation/reactivation/${challengeId}/complete`)
        .send({ hardwareFingerprint: hardwareFp1 });

      expect(blockedRes.status).toBe(403);
      expect((blockedRes.body as { code?: string }).code).toBe(
        'REACTIVATION_APPROVAL_REQUIRED',
      );

      // 5. Tenant B cannot list or approve Tenant A's challenge (RLS isolation)
      const listBRes = await request(app.getHttpServer())
        .get('/api/onboarding/activation/reactivation-challenges')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(listBRes.status).toBe(200);
      expect(listBRes.body as ChallengeListItemBody[]).toEqual([]);

      const crossApproveRes = await request(app.getHttpServer())
        .post(
          `/api/onboarding/activation/reactivation-challenges/${challengeId}/approve`,
        )
        .set('Authorization', `Bearer ${tokenB}`);

      expect(crossApproveRes.status).toBe(404);

      // 6. Tenant A lists and approves the challenge
      const listARes = await request(app.getHttpServer())
        .get('/api/onboarding/activation/reactivation-challenges')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(listARes.status).toBe(200);
      const challengesA = listARes.body as ChallengeListItemBody[];
      expect(challengesA.some((item) => item.id === challengeId)).toBe(true);

      const approveRes = await request(app.getHttpServer())
        .post(
          `/api/onboarding/activation/reactivation-challenges/${challengeId}/approve`,
        )
        .set('Authorization', `Bearer ${tokenA}`);

      expect(approveRes.status).toBe(200);
      expect((approveRes.body as { status: string }).status).toBe('APPROVED');

      // 7. POS completes & confirms reactivation -> v1 RETIRED ('reinstall'), v2 ACTIVE, same terminalId & attempt
      const completeRes = await request(app.getHttpServer())
        .post(`/api/onboarding/activation/reactivation/${challengeId}/complete`)
        .send({ hardwareFingerprint: hardwareFp1 });

      expect(completeRes.status).toBe(200);
      const completeBody = completeRes.body as CompleteReactivationResponseBody;
      expect(completeBody.tenantId).toBe(tenantA.tenantId);
      expect(completeBody.slug).toBe(tenantA.slug);
      expect(completeBody.terminalId).toBe(canonicalTerminalId);
      expect(completeBody.activationAttemptId).toBe(seededAttemptId);
      expect(completeBody.previousVersion).toBe(1);
      expect(completeBody.version).toBe(2);
      expect(typeof completeBody.renewalSecret).toBe('string');

      const confirmRes = await request(app.getHttpServer())
        .post(`/api/onboarding/activation/reactivation/${challengeId}/confirm`)
        .send({
          credentialId: completeBody.credentialId,
          version: completeBody.version,
          renewalSecret: completeBody.renewalSecret,
        });

      expect(confirmRes.status).toBe(200);
      const confirmBody = confirmRes.body as ConfirmReactivationResponseBody;
      expect(confirmBody.status).toBe('ACTIVE');
      expect(confirmBody.version).toBe(2);

      // 8. Verify session never rolled back from ACTIVATED and no extra activation attempt was created
      await runInTenantTransaction(
        dataSource,
        tenantA.tenantId,
        async (manager) => {
          const session = await manager.findOneOrFail(OnboardingSession, {
            where: { tenantId: tenantA.tenantId },
          });
          expect(session.lifecycleState).toBe(
            OnboardingLifecycleState.ACTIVATED,
          );

          const attemptCount = await manager.count(ActivationAttempt, {
            where: { tenantId: tenantA.tenantId },
          });
          expect(attemptCount).toBe(1);
        },
      );

      // 9. Verify GET /identity/device-sync/terminals returns v1 -> v2 lineage
      const terminalsRes = await request(app.getHttpServer())
        .get('/api/identity/device-sync/terminals')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(terminalsRes.status).toBe(200);
      const terminals = terminalsRes.body as TenantTerminalResponseBody[];
      const target = terminals.find(
        (t) => t.terminalId === canonicalTerminalId,
      );
      expect(target).toBeDefined();
      expect(target?.credentialVersion).toBe(2);
      expect(target?.status).toBe('ACTIVE');
      expect(target?.credentialHistory).toHaveLength(2);
      expect(target?.credentialHistory[0]).toMatchObject({
        version: 1,
        status: 'RETIRED',
        revocationReason: 'reinstall',
      });
      expect(target?.credentialHistory[1]).toMatchObject({
        version: 2,
        status: 'ACTIVE',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'supports 6-digit offline recovery code (single-use), factory reset re-linking, and hides deliberately REVOKED terminals',
    async () => {
      // 1. Offline 6-digit recovery code path (v2 -> v3)
      const lookup2Res = await request(app.getHttpServer())
        .post('/api/onboarding/activation/device-lookup')
        .send({ hardwareFingerprint: hardwareFp1 });

      expect(lookup2Res.status).toBe(200);
      const challenge2Id = (lookup2Res.body as DeviceLookupResponseBody)
        .recoveryChallengeId as string;

      const wrongCode = issuedRecoveryCode === '000000' ? '999999' : '000000';
      const wrongCodeRes = await request(app.getHttpServer())
        .post(
          `/api/onboarding/activation/reactivation/${challenge2Id}/complete`,
        )
        .send({
          hardwareFingerprint: hardwareFp1,
          recoveryCode: wrongCode,
        });

      expect(wrongCodeRes.status).toBe(403);
      expect((wrongCodeRes.body as { code?: string }).code).toBe(
        'INVALID_RECOVERY_CODE',
      );

      const validCodeRes = await request(app.getHttpServer())
        .post(
          `/api/onboarding/activation/reactivation/${challenge2Id}/complete`,
        )
        .send({
          hardwareFingerprint: hardwareFp1,
          recoveryCode: issuedRecoveryCode,
        });

      expect(validCodeRes.status).toBe(200);
      const validComplete =
        validCodeRes.body as CompleteReactivationResponseBody;
      expect(validComplete.version).toBe(3);

      const confirm3Res = await request(app.getHttpServer())
        .post(`/api/onboarding/activation/reactivation/${challenge2Id}/confirm`)
        .send({
          credentialId: validComplete.credentialId,
          version: validComplete.version,
          renewalSecret: validComplete.renewalSecret,
        });
      expect(confirm3Res.status).toBe(200);

      // Replaying the consumed recovery code on a new challenge must fail
      const lookupReplayRes = await request(app.getHttpServer())
        .post('/api/onboarding/activation/device-lookup')
        .send({ hardwareFingerprint: hardwareFp1 });
      const challengeReplayId = (
        lookupReplayRes.body as DeviceLookupResponseBody
      ).recoveryChallengeId as string;

      const replayRes = await request(app.getHttpServer())
        .post(
          `/api/onboarding/activation/reactivation/${challengeReplayId}/complete`,
        )
        .send({
          hardwareFingerprint: hardwareFp1,
          recoveryCode: issuedRecoveryCode,
        });
      expect(replayRes.status).toBe(403);
      expect((replayRes.body as { code?: string }).code).toBe(
        'INVALID_RECOVERY_CODE',
      );

      // 2. Factory reset path: dashboard initiates factory_reset linking code -> new fingerprint preserves terminalId & rotates v3 -> v4
      const initResetRes = await request(app.getHttpServer())
        .post(
          `/api/onboarding/activation/terminals/${encodeURIComponent(canonicalTerminalId)}/reactivate`,
        )
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reason: 'replaced', mode: 'factory_reset' });

      expect(initResetRes.status).toBe(200);
      const initResetBody =
        initResetRes.body as InitiateReactivationResponseBody;
      expect(initResetBody.mode).toBe('factory_reset');
      expect(typeof initResetBody.linkingCode).toBe('string');

      const claimResetRes = await request(app.getHttpServer())
        .post('/api/onboarding/activation/link')
        .send({
          code: initResetBody.linkingCode,
          deviceId: `pos-local-wiped-${runSuffix}`,
          hardwareFingerprint: hardwareFp2,
        });

      expect([200, 201]).toContain(claimResetRes.status);
      const claimResetBody = claimResetRes.body as ClaimLinkingCodeResponseBody;
      expect(claimResetBody.deviceId).toBe(canonicalTerminalId);
      expect(typeof claimResetBody.reactivationChallengeId).toBe('string');

      const factoryCompleteRes = await request(app.getHttpServer())
        .post(
          `/api/onboarding/activation/reactivation/${claimResetBody.reactivationChallengeId}/complete`,
        )
        .send({ hardwareFingerprint: hardwareFp2 });

      expect(factoryCompleteRes.status).toBe(200);
      const factoryComplete =
        factoryCompleteRes.body as CompleteReactivationResponseBody;
      expect(factoryComplete.terminalId).toBe(canonicalTerminalId);
      expect(factoryComplete.previousVersion).toBe(3);
      expect(factoryComplete.version).toBe(4);

      const confirm4Res = await request(app.getHttpServer())
        .post(
          `/api/onboarding/activation/reactivation/${claimResetBody.reactivationChallengeId}/confirm`,
        )
        .send({
          credentialId: factoryComplete.credentialId,
          version: factoryComplete.version,
          renewalSecret: factoryComplete.renewalSecret,
        });
      expect(confirm4Res.status).toBe(200);

      // Verify both hardware fingerprints are stored for the same terminalId
      await runInTenantTransaction(
        dataSource,
        tenantA.tenantId,
        async (manager) => {
          const fps = await manager.find(TerminalInstallFingerprint, {
            where: {
              tenantId: tenantA.tenantId,
              terminalId: canonicalTerminalId,
            },
          });
          const hashes = fps.map((f) => f.fingerprintHash).sort();
          expect(hashes).toEqual([hardwareFp1, hardwareFp2].sort());
        },
      );

      // 3. Deliberate revocation (REVOKED) hides terminal from device-lookup (identical { found: false })
      const revokeRes = await request(app.getHttpServer())
        .post(
          `/api/identity/device-sync/credentials/${factoryComplete.credentialId}/revoke`,
        )
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reason: 'Equipo robado en sucursal' });

      expect(revokeRes.status).toBe(200);

      const postRevokeLookupRes = await request(app.getHttpServer())
        .post('/api/onboarding/activation/device-lookup')
        .send({ hardwareFingerprint: hardwareFp2 });

      expect(postRevokeLookupRes.status).toBe(200);
      expect(postRevokeLookupRes.body).toEqual({ found: false });

      // Lineage distinguishes RETIRED (reinstall/replaced) from REVOKED (baja deliberada)
      const finalTerminalsRes = await request(app.getHttpServer())
        .get('/api/identity/device-sync/terminals')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(finalTerminalsRes.status).toBe(200);
      const finalTarget = (
        finalTerminalsRes.body as TenantTerminalResponseBody[]
      ).find((t) => t.terminalId === canonicalTerminalId);

      expect(finalTarget?.status).toBe('REVOKED');
      expect(finalTarget?.revocationReason).toBe('Equipo robado en sucursal');
      expect(finalTarget?.credentialHistory.map((h) => h.version)).toEqual([
        1, 2, 3, 4,
      ]);
      expect(finalTarget?.credentialHistory.map((h) => h.status)).toEqual([
        'RETIRED',
        'RETIRED',
        'RETIRED',
        'REVOKED',
      ]);
    },
    TEST_TIMEOUT_MS,
  );
});
