import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager } from 'typeorm';
import { ChangeLogService } from '../../audit/change-log.service';
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
} from '../../identity/entities/device-sync-credential.entity';
import { DeviceSyncCredentialService } from '../../identity/services/device-sync-credential.service';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { ActivationAttempt } from '../entities/activation-attempt.entity';
import { DeviceLinkingCode } from '../entities/device-linking-code.entity';
import { TerminalInstallFingerprint } from '../entities/terminal-install-fingerprint.entity';
import {
  ReactivationApprovalMethod,
  ReactivationChallengeStatus,
  ReactivationReason,
  TerminalReactivationChallenge,
} from '../entities/terminal-reactivation-challenge.entity';
import { TerminalRecoveryCode } from '../entities/terminal-recovery-code.entity';
import { TerminalReactivationRateLimiter } from '../utils/terminal-reactivation-rate-limiter';
import { hashRecoveryCode } from '../utils/terminal-recovery-code';
import { DeviceLinkingService } from './device-linking.service';
import {
  buildMaskedReactivationHint,
  maskTenantName,
  TerminalReactivationService,
} from './terminal-reactivation.service';

const SAMPLE_FP = 'a'.repeat(64);
const OTHER_FP = 'b'.repeat(64);
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const CRED_V1_ID = '44444444-4444-4444-8444-444444444444';
const CRED_V2_ID = '55555555-5555-4555-8555-555555555555';
const CHALLENGE_ID = '66666666-6666-4666-8666-666666666666';
const TERMINAL_ID = 'POS-CAJA-01-SECRET';
const TENANT_SLUG = 'cafe-central-managua';
const TENANT_NAME = 'Café Central Managua';

interface MockRepo<T> {
  findOne: jest.Mock<Promise<T | null>, [unknown?]>;
  find: jest.Mock<Promise<T[]>, [unknown?]>;
  create: jest.Mock<T, [Partial<T>]>;
  save: jest.Mock<Promise<T>, [T]>;
  insert?: jest.Mock<Promise<unknown>, [Partial<T>]>;
}

function createMockRepo<T>(defaultId: string): MockRepo<T> {
  return {
    findOne: jest.fn<Promise<T | null>, [unknown?]>().mockResolvedValue(null),
    find: jest.fn<Promise<T[]>, [unknown?]>().mockResolvedValue([]),
    create: jest.fn<T, [Partial<T>]>((dto) => ({
      id: defaultId,
      ...dto,
    }) as unknown as T),
    save: jest.fn<Promise<T>, [T]>((entity) => Promise.resolve(entity)),
    insert: jest.fn<Promise<unknown>, [Partial<T>]>().mockResolvedValue({}),
  };
}

function buildActiveCredential(
  status: DeviceSyncCredentialStatus = DeviceSyncCredentialStatus.ACTIVE,
  version = 1,
): DeviceSyncCredential {
  const attempt = {
    id: ATTEMPT_ID,
    tenantId: TENANT_ID,
    trustedTerminalId: TERMINAL_ID,
    candidateTerminalId: TERMINAL_ID,
  } as ActivationAttempt;

  return {
    id: CRED_V1_ID,
    tenantId: TENANT_ID,
    activationAttemptId: ATTEMPT_ID,
    activationAttempt: attempt,
    renewalSecretHash: 'hashed-secret',
    scopes: ['sync:push', 'sync:pull'],
    version,
    status,
    expiresAt: new Date(Date.now() + 86_400_000),
    issuedAt: new Date('2026-10-01T10:00:00.000Z'),
    rotatedAt: null,
    revokedAt: null,
    revocationReason: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
  };
}

describe('TerminalReactivationService (#566)', () => {
  let fpRepo: MockRepo<TerminalInstallFingerprint>;
  let challengeRepo: MockRepo<TerminalReactivationChallenge>;
  let recoveryRepo: MockRepo<TerminalRecoveryCode>;
  let credRepo: MockRepo<DeviceSyncCredential>;
  let tenantRepo: MockRepo<Tenant>;
  let linkingCodeRepo: MockRepo<DeviceLinkingCode>;
  let queryMock: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  let manager: EntityManager;
  let dataSource: DataSource;
  let deviceSyncCredentialService: {
    rotateCredentialForReactivation: jest.Mock;
    confirmCredential: jest.Mock;
  };
  let deviceLinkingService: DeviceLinkingService;
  let changeLogService: { log: jest.Mock };
  let service: TerminalReactivationService;

  beforeEach(() => {
    fpRepo = createMockRepo<TerminalInstallFingerprint>('fp-id-1');
    challengeRepo = createMockRepo<TerminalReactivationChallenge>(CHALLENGE_ID);
    recoveryRepo = createMockRepo<TerminalRecoveryCode>('rc-id-1');
    credRepo = createMockRepo<DeviceSyncCredential>(CRED_V1_ID);
    tenantRepo = createMockRepo<Tenant>(TENANT_ID);
    linkingCodeRepo = createMockRepo<DeviceLinkingCode>('lc-id-1');

    queryMock = jest
      .fn<Promise<unknown>, [string, unknown[]?]>()
      .mockImplementation(async (sql: string) => {
        if (sql.includes('inventory_sync_receipts')) {
          return [{ last_sync_at: '2026-11-18T14:30:00.000Z' }];
        }
        return [];
      });

    manager = {
      query: queryMock,
      getRepository: (entity: unknown) => {
        if (entity === TerminalInstallFingerprint) return fpRepo;
        if (entity === TerminalReactivationChallenge) return challengeRepo;
        if (entity === TerminalRecoveryCode) return recoveryRepo;
        if (entity === DeviceSyncCredential) return credRepo;
        if (entity === Tenant) return tenantRepo;
        if (entity === DeviceLinkingCode) return linkingCodeRepo;
        return null;
      },
    } as unknown as EntityManager;

    dataSource = {
      transaction: jest.fn(
        async <T>(cb: (em: EntityManager) => Promise<T>): Promise<T> =>
          cb(manager),
      ),
    } as unknown as DataSource;

    deviceSyncCredentialService = {
      rotateCredentialForReactivation: jest.fn().mockResolvedValue({
        credential: {
          id: CRED_V2_ID,
          tenantId: TENANT_ID,
          activationAttemptId: ATTEMPT_ID,
          version: 2,
          status: DeviceSyncCredentialStatus.PENDING,
          expiresAt: new Date(Date.now() + 900_000),
        },
        renewalSecret: 'fresh-renewal-secret-value-123456',
        previousVersion: 1,
      }),
      confirmCredential: jest.fn().mockResolvedValue({
        id: CRED_V2_ID,
        version: 2,
        status: DeviceSyncCredentialStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      }),
    };

    deviceLinkingService = new DeviceLinkingService(dataSource);
    changeLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new TerminalReactivationService(
      dataSource,
      deviceSyncCredentialService as unknown as DeviceSyncCredentialService,
      deviceLinkingService,
      changeLogService as unknown as ChangeLogService,
    );
  });

  describe('Privacy & Masked Hints', () => {
    it('masks tenant name and terminal ID without leaking tenantId, slug, raw terminalId, or secrets', () => {
      const hint = buildMaskedReactivationHint({
        terminalId: TERMINAL_ID,
        tenantName: TENANT_NAME,
        lastSyncAt: new Date('2026-11-18T14:30:00.000Z'),
      });

      expect(hint).toContain('Terminal «••••CRET»');
      expect(hint).toContain('Ca*** Ce*** Ma***');
      expect(hint).toContain('última sincronización 18/11/2026 14:30 UTC');
      expect(hint).not.toContain(TENANT_ID);
      expect(hint).not.toContain(TENANT_SLUG);
      expect(hint).not.toContain(TERMINAL_ID);
      expect(hint).not.toContain(TENANT_NAME);
    });

    it('uses natural Spanish fallback when terminal has no sync receipts yet', () => {
      const hint = buildMaskedReactivationHint({
        terminalId: TERMINAL_ID,
        tenantName: 'El Fogón',
        lastSyncAt: null,
      });
      expect(hint).toContain('sin sincronización reciente');
      expect(maskTenantName('El Fogón')).toBe('E*** Fo***');
    });
  });

  describe('Rate Limiter (IP + Fingerprint dual caps)', () => {
    it('enforces per-fingerprint cap (5/min) and per-IP cap (15/min)', () => {
      const limiter = new TerminalReactivationRateLimiter({
        ipLimit: 15,
        fingerprintLimit: 5,
        windowMs: 60_000,
      });

      // 5 allowed for same fingerprint
      for (let i = 0; i < 5; i++) {
        expect(limiter.consume('10.0.0.1', SAMPLE_FP).allowed).toBe(true);
      }
      // 6th blocked by fingerprint
      const fpBlocked = limiter.consume('10.0.0.1', SAMPLE_FP);
      expect(fpBlocked.allowed).toBe(false);
      expect(fpBlocked.limitedBy).toBe('fingerprint');
      expect(fpBlocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);

      // Different fingerprints from same IP allowed up to IP cap (15 total)
      for (let i = 0; i < 10; i++) {
        const distinctFp = i.toString(16).padStart(64, '0');
        expect(limiter.consume('10.0.0.1', distinctFp).allowed).toBe(true);
      }
      // 16th request from same IP blocked by IP
      const ipBlocked = limiter.consume('10.0.0.1', 'f'.repeat(64));
      expect(ipBlocked.allowed).toBe(false);
      expect(ipBlocked.limitedBy).toBe('ip');
    });
  });

  describe('lookupDevice (pre-auth)', () => {
    it('returns { found: false } for unknown fingerprint', async () => {
      fpRepo.findOne.mockResolvedValue(null);

      const res = await service.lookupDevice(SAMPLE_FP);
      expect(res).toEqual({ found: false });
      expect(queryMock).toHaveBeenCalledWith(
        "SELECT set_config('app.device_lookup', $1, true)",
        ['on'],
      );
    });

    it('returns identical { found: false } when terminal credential is REVOKED', async () => {
      fpRepo.findOne.mockResolvedValue({
        id: 'fp-1',
        tenantId: TENANT_ID,
        terminalId: TERMINAL_ID,
        fingerprintHash: SAMPLE_FP,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      credRepo.find.mockResolvedValue([
        buildActiveCredential(DeviceSyncCredentialStatus.REVOKED, 1),
      ]);

      const res = await service.lookupDevice(SAMPLE_FP);
      expect(res).toEqual({ found: false });
      expect(challengeRepo.save).not.toHaveBeenCalled();
    });

    it('creates a PENDING challenge and returns masked hint for ACTIVE terminal', async () => {
      fpRepo.findOne.mockResolvedValue({
        id: 'fp-1',
        tenantId: TENANT_ID,
        terminalId: TERMINAL_ID,
        fingerprintHash: SAMPLE_FP,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      credRepo.find.mockResolvedValue([
        buildActiveCredential(DeviceSyncCredentialStatus.ACTIVE, 1),
      ]);
      tenantRepo.findOne.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        slug: TENANT_SLUG,
      } as Tenant);

      const res = await service.lookupDevice(SAMPLE_FP.toUpperCase());

      expect(res.found).toBe(true);
      if (res.found) {
        expect(res.recoveryChallengeId).toBe(CHALLENGE_ID);
        expect(res.status).toBe(ReactivationChallengeStatus.PENDING);
        expect(res.maskedHint).not.toContain(TENANT_ID);
        expect(res.maskedHint).not.toContain(TENANT_SLUG);
        expect(res.maskedHint).not.toContain(TERMINAL_ID);
        expect(res.maskedHint).toContain('Ca*** Ce*** Ma***');
      }
      expect(challengeRepo.save).toHaveBeenCalledTimes(1);
    });

    it('reuses an existing non-expired PENDING/APPROVED challenge', async () => {
      fpRepo.findOne.mockResolvedValue({
        id: 'fp-1',
        tenantId: TENANT_ID,
        terminalId: TERMINAL_ID,
        fingerprintHash: SAMPLE_FP,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      credRepo.find.mockResolvedValue([
        buildActiveCredential(DeviceSyncCredentialStatus.ACTIVE, 1),
      ]);
      tenantRepo.findOne.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        slug: TENANT_SLUG,
      } as Tenant);
      challengeRepo.findOne.mockResolvedValue({
        id: 'existing-challenge-id',
        tenantId: TENANT_ID,
        terminalId: TERMINAL_ID,
        fingerprintHash: SAMPLE_FP,
        status: ReactivationChallengeStatus.APPROVED,
        reason: ReactivationReason.REINSTALL,
        approvalMethod: ReactivationApprovalMethod.DASHBOARD,
        approvedByUserId: USER_ID,
        approvedAt: new Date(),
        completedAt: null,
        previousCredentialId: null,
        previousCredentialVersion: null,
        newCredentialId: null,
        newCredentialVersion: null,
        expiresAt: new Date(Date.now() + 600_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.lookupDevice(SAMPLE_FP);
      expect(res.found).toBe(true);
      if (res.found) {
        expect(res.recoveryChallengeId).toBe('existing-challenge-id');
        expect(res.status).toBe(ReactivationChallengeStatus.APPROVED);
      }
      expect(challengeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('completeReactivation (human approval gate + in-place rotation)', () => {
    const makeChallenge = (
      overrides: Partial<TerminalReactivationChallenge> = {},
    ): TerminalReactivationChallenge => ({
      id: CHALLENGE_ID,
      tenantId: TENANT_ID,
      terminalId: TERMINAL_ID,
      fingerprintHash: SAMPLE_FP,
      status: ReactivationChallengeStatus.PENDING,
      reason: ReactivationReason.REINSTALL,
      approvalMethod: null,
      approvedByUserId: null,
      approvedAt: null,
      completedAt: null,
      previousCredentialId: null,
      previousCredentialVersion: null,
      newCredentialId: null,
      newCredentialVersion: null,
      expiresAt: new Date(Date.now() + 600_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

    it('rejects PENDING challenge without recoveryCode with REACTIVATION_APPROVAL_REQUIRED', async () => {
      challengeRepo.findOne.mockResolvedValue(makeChallenge());

      await expect(
        service.completeReactivation(CHALLENGE_ID, {
          hardwareFingerprint: SAMPLE_FP,
        }),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.completeReactivation(CHALLENGE_ID, {
          hardwareFingerprint: SAMPLE_FP,
        });
      } catch (err) {
        const response = (err as ForbiddenException).getResponse() as {
          code?: string;
        };
        expect(response.code).toBe('REACTIVATION_APPROVAL_REQUIRED');
      }
    });

    it('rejects PENDING challenge with wrong 6-digit recoveryCode (INVALID_RECOVERY_CODE)', async () => {
      challengeRepo.findOne.mockResolvedValue(makeChallenge());
      const validHash = await hashRecoveryCode('123456');
      recoveryRepo.findOne.mockResolvedValue({
        id: 'rc-1',
        tenantId: TENANT_ID,
        terminalId: TERMINAL_ID,
        activationAttemptId: ATTEMPT_ID,
        codeHash: validHash,
        issuedAt: new Date(),
        usedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      });

      try {
        await service.completeReactivation(CHALLENGE_ID, {
          hardwareFingerprint: SAMPLE_FP,
          recoveryCode: '999999',
        });
        fail('Expected ForbiddenException');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const response = (err as ForbiddenException).getResponse() as {
          code?: string;
        };
        expect(response.code).toBe('INVALID_RECOVERY_CODE');
      }
    });

    it('completes when APPROVED via Dashboard, rotates credential in place (v1 -> v2), preserves terminalId and activationAttemptId', async () => {
      const challenge = makeChallenge({
        status: ReactivationChallengeStatus.APPROVED,
        approvalMethod: ReactivationApprovalMethod.DASHBOARD,
        approvedByUserId: USER_ID,
        approvedAt: new Date(),
      });
      challengeRepo.findOne.mockResolvedValue(challenge);
      credRepo.find.mockResolvedValue([
        buildActiveCredential(DeviceSyncCredentialStatus.ACTIVE, 1),
      ]);
      tenantRepo.findOne.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        slug: TENANT_SLUG,
      } as Tenant);

      const res = await service.completeReactivation(CHALLENGE_ID, {
        hardwareFingerprint: SAMPLE_FP,
      });

      expect(res.tenantId).toBe(TENANT_ID);
      expect(res.slug).toBe(TENANT_SLUG);
      expect(res.terminalId).toBe(TERMINAL_ID);
      expect(res.activationAttemptId).toBe(ATTEMPT_ID);
      expect(res.credentialId).toBe(CRED_V2_ID);
      expect(res.version).toBe(2);
      expect(res.previousVersion).toBe(1);
      expect(res.renewalSecret).toBe('fresh-renewal-secret-value-123456');

      expect(
        deviceSyncCredentialService.rotateCredentialForReactivation,
      ).toHaveBeenCalledWith(manager, {
        tenantId: TENANT_ID,
        activationAttemptId: ATTEMPT_ID,
        previousCredentialId: CRED_V1_ID,
        reason: ReactivationReason.REINSTALL,
        approvedByUserId: USER_ID,
        approvalMethod: ReactivationApprovalMethod.DASHBOARD,
        challengeId: CHALLENGE_ID,
        canonicalDeviceId: TERMINAL_ID,
      });

      expect(challenge.status).toBe(ReactivationChallengeStatus.COMPLETED);
      expect(challenge.previousCredentialId).toBe(CRED_V1_ID);
      expect(challenge.newCredentialId).toBe(CRED_V2_ID);
      expect(challenge.newCredentialVersion).toBe(2);
    });

    it('completes when PENDING + valid 6-digit recoveryCode, marks code usedAt so replay fails', async () => {
      const challenge = makeChallenge();
      const validHash = await hashRecoveryCode('482910');
      const recoveryRow: TerminalRecoveryCode = {
        id: 'rc-1',
        tenantId: TENANT_ID,
        terminalId: TERMINAL_ID,
        activationAttemptId: ATTEMPT_ID,
        codeHash: validHash,
        issuedAt: new Date(),
        usedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      };

      challengeRepo.findOne.mockResolvedValue(challenge);
      recoveryRepo.findOne.mockImplementation(async () =>
        recoveryRow.usedAt ? null : recoveryRow,
      );
      credRepo.find.mockResolvedValue([
        buildActiveCredential(DeviceSyncCredentialStatus.ACTIVE, 1),
      ]);
      tenantRepo.findOne.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        slug: TENANT_SLUG,
      } as Tenant);

      const res = await service.completeReactivation(CHALLENGE_ID, {
        hardwareFingerprint: SAMPLE_FP,
        recoveryCode: '482910',
      });

      expect(res.version).toBe(2);
      expect(recoveryRow.usedAt).toBeInstanceOf(Date);
      expect(challenge.approvalMethod).toBe(
        ReactivationApprovalMethod.RECOVERY_CODE,
      );

      // Replay against a second PENDING challenge with the same recovery code must fail
      challengeRepo.findOne.mockResolvedValue(
        makeChallenge({ id: '77777777-7777-4777-8777-777777777777' }),
      );
      await expect(
        service.completeReactivation('77777777-7777-4777-8777-777777777777', {
          hardwareFingerprint: SAMPLE_FP,
          recoveryCode: '482910',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects REVOKED terminal credential with TERMINAL_CREDENTIAL_REVOKED', async () => {
      challengeRepo.findOne.mockResolvedValue(
        makeChallenge({ status: ReactivationChallengeStatus.APPROVED }),
      );
      credRepo.find.mockResolvedValue([
        buildActiveCredential(DeviceSyncCredentialStatus.REVOKED, 1),
      ]);

      try {
        await service.completeReactivation(CHALLENGE_ID, {
          hardwareFingerprint: SAMPLE_FP,
        });
        fail('Expected ConflictException');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const response = (err as ConflictException).getResponse() as {
          code?: string;
        };
        expect(response.code).toBe('TERMINAL_CREDENTIAL_REVOKED');
      }
    });

    it('rejects mismatched hardwareFingerprint with HARDWARE_FINGERPRINT_MISMATCH', async () => {
      challengeRepo.findOne.mockResolvedValue(
        makeChallenge({
          status: ReactivationChallengeStatus.APPROVED,
          fingerprintHash: SAMPLE_FP,
        }),
      );

      await expect(
        service.completeReactivation(CHALLENGE_ID, {
          hardwareFingerprint: OTHER_FP,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Factory-reset flow (initiateTerminalReactivation + claimCode)', () => {
    it('creates a replacement linking code and claiming it preserves terminalId, records new fingerprint, and creates an auto-approved challenge', async () => {
      credRepo.find.mockResolvedValue([
        buildActiveCredential(DeviceSyncCredentialStatus.ACTIVE, 1),
      ]);

      const initiated = await service.initiateTerminalReactivation(
        TENANT_ID,
        TERMINAL_ID,
        USER_ID,
        {
          reason: ReactivationReason.REPLACED,
          mode: 'factory_reset',
        },
      );

      expect(initiated.mode).toBe('factory_reset');
      if (initiated.mode === 'factory_reset') {
        expect(initiated.terminalId).toBe(TERMINAL_ID);
        expect(initiated.linkingCode).toHaveLength(6);

        // Simulate the wiped tablet claiming the linking code with a new deviceId & new hardwareFingerprint
        const codeHash = await bcrypt.hash(initiated.linkingCode, 10);
        queryMock.mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT id, code_hash, tenant_id')) {
            return [{ id: 'lc-1', code_hash: codeHash, tenant_id: TENANT_ID }];
          }
          if (sql.includes("UPDATE device_linking_codes SET status = 'CLAIMED'")) {
            return [
              [
                {
                  tenant_id: TENANT_ID,
                  replaces_terminal_id: TERMINAL_ID,
                  created_by_user_id: USER_ID,
                },
              ],
              1,
            ];
          }
          if (sql.includes('SELECT slug FROM tenants')) {
            return [{ slug: TENANT_SLUG }];
          }
          return [];
        });

        const claimed = await deviceLinkingService.claimCode(
          initiated.linkingCode,
          'wiped-device-temp-id',
          OTHER_FP,
        );

        // Preserves existing terminalId!
        expect(claimed.deviceId).toBe(TERMINAL_ID);
        expect(claimed.tenantId).toBe(TENANT_ID);
        expect(claimed.slug).toBe(TENANT_SLUG);
        expect(claimed.reactivationChallengeId).toBe(CHALLENGE_ID);

        // Upserts new hardware fingerprint
        expect(queryMock).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO terminal_install_fingerprints'),
          [TENANT_ID, TERMINAL_ID, OTHER_FP],
        );

        // Auto-creates APPROVED challenge with reason='replaced'
        expect(challengeRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TENANT_ID,
            terminalId: TERMINAL_ID,
            fingerprintHash: OTHER_FP,
            status: ReactivationChallengeStatus.APPROVED,
            reason: ReactivationReason.REPLACED,
            approvalMethod: ReactivationApprovalMethod.DASHBOARD,
            approvedByUserId: USER_ID,
          }),
        );
      }
    });
  });

  describe('confirmReactivationCredential (pre-auth confirm)', () => {
    it('delegates to DeviceSyncCredentialService.confirmCredential for a COMPLETED challenge', async () => {
      challengeRepo.findOne.mockResolvedValue({
        id: CHALLENGE_ID,
        tenantId: TENANT_ID,
        terminalId: TERMINAL_ID,
        fingerprintHash: SAMPLE_FP,
        status: ReactivationChallengeStatus.COMPLETED,
        reason: ReactivationReason.REINSTALL,
        approvalMethod: ReactivationApprovalMethod.DASHBOARD,
        approvedByUserId: USER_ID,
        approvedAt: new Date(),
        completedAt: new Date(),
        previousCredentialId: CRED_V1_ID,
        previousCredentialVersion: 1,
        newCredentialId: CRED_V2_ID,
        newCredentialVersion: 2,
        expiresAt: new Date(Date.now() + 600_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      credRepo.findOne.mockResolvedValue({
        id: CRED_V2_ID,
        tenantId: TENANT_ID,
        activationAttemptId: ATTEMPT_ID,
        version: 2,
      } as DeviceSyncCredential);

      const confirmed = await service.confirmReactivationCredential(
        CHALLENGE_ID,
        {
          credentialId: CRED_V2_ID,
          version: 2,
          renewalSecret: 'fresh-renewal-secret-value-123456',
        },
      );

      expect(confirmed.status).toBe(DeviceSyncCredentialStatus.ACTIVE);
      expect(confirmed.version).toBe(2);
      expect(
        deviceSyncCredentialService.confirmCredential,
      ).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        activationAttemptId: ATTEMPT_ID,
        credentialId: CRED_V2_ID,
        credentialVersion: 2,
        renewalSecret: 'fresh-renewal-secret-value-123456',
        canonicalDeviceId: TERMINAL_ID,
      });
    });

    it('throws NotFoundException when challenge is not COMPLETED or credential mismatches', async () => {
      challengeRepo.findOne.mockResolvedValue(null);

      await expect(
        service.confirmReactivationCredential(CHALLENGE_ID, {
          credentialId: CRED_V2_ID,
          version: 2,
          renewalSecret: 'fresh-renewal-secret-value-123456',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
