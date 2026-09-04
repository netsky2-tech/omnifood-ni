import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivationService,
  V1_REQUIRED_ACTIVATION_CHECKS,
} from './activation.service';
import {
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../entities/activation-attempt.entity';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../entities/onboarding-session.entity';
import {
  ActivationCheckCode,
  ActivationCheckResult,
  ActivationCheckStatus,
} from '../entities/activation-check-result.entity';
import { ActivationFollowUp } from '../entities/activation-follow-up.entity';
import {
  CloseActivationFollowUpDto,
  DevicePrincipal,
  SupportOverrideAction,
} from '../dto/activation.dto';
import { ActivationFollowUpStatus } from '../entities/activation-follow-up.entity';
import { Invoice } from '../../sales/entities/invoice.entity';

describe('ActivationService — ONB1.7A StartActivation', () => {
  let service: ActivationService;
  let attemptRepo: any;
  let checkRepo: any;
  let followUpRepo: any;
  let sessionRepo: any;
  let invoiceRepo: any;
  let fiscalConfigVersionService: any;
  let onboardingCatalogService: any;
  let dataSource: any;
  let changeLogService: any;

  const tenantId = 'tenant-founder-01';
  const userId = 'user-owner-01';
  const candidateTerminalId = 'pos-term-01';

  beforeEach(() => {
    attemptRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'attempt-uuid-1' })),
      save: jest.fn((entity) =>
        Promise.resolve({ ...entity, id: entity.id || 'attempt-uuid-1' }),
      ),
    };

    checkRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'check-uuid-1' })),
      save: jest.fn((entity) =>
        Promise.resolve({ ...entity, id: entity.id || 'check-uuid-1' }),
      ),
    };

    followUpRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'follow-up-uuid-1' })),
      save: jest.fn((entity) =>
        Promise.resolve({ ...entity, id: entity.id || 'follow-up-uuid-1' }),
      ),
    };

    sessionRepo = {
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    invoiceRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'verification-invoice-1',
        tenant_id: tenantId,
        isCanceled: false,
        paymentStatus: 'paid',
      }),
    };

    fiscalConfigVersionService = {
      getLatestRevision: jest.fn().mockResolvedValue({
        revision: 2,
        fingerprint: 'fiscal-sha256-rev2',
        payload: { businessName: 'Founder Store' },
      }),
    };

    onboardingCatalogService = {
      getVerificationProductCandidate: jest.fn().mockResolvedValue({
        verificationProductId: 'prod-uuid-10',
        name: 'Cafe Americano',
        sellPrice: 50,
        uom: 'UN',
        tenantId,
        isActive: true,
        verificationProductRevision: 1,
        verificationProductFingerprint: 'product-sha256-rev1',
      }),
    };

    dataSource = {
      transaction: jest.fn((cb) =>
        cb({
          getRepository: (entityClass: any) => {
            if (entityClass === ActivationAttempt) return attemptRepo;
            if (entityClass === OnboardingSession) return sessionRepo;
            if (entityClass === ActivationCheckResult) return checkRepo;
            if (entityClass === ActivationFollowUp) return followUpRepo;
            if (entityClass === Invoice) return invoiceRepo;
            return null;
          },
        }),
      ),
    };

    changeLogService = {
      log: jest.fn().mockResolvedValue(undefined),
      findByTarget: jest.fn().mockResolvedValue([]),
    };

    service = new ActivationService(
      attemptRepo,
      checkRepo,
      followUpRepo,
      sessionRepo,
      fiscalConfigVersionService,
      onboardingCatalogService,
      {
        evaluate: jest.fn().mockResolvedValue({ saleReady: true }),
      } as any,
      dataSource,
      changeLogService,
    );
  });

  it('rejects StartActivation if tenantId or candidateTerminalId is empty', async () => {
    await expect(
      service.startActivation('', { candidateTerminalId }, userId),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.startActivation(tenantId, { candidateTerminalId: '   ' }, userId),
    ).rejects.toThrow(BadRequestException);
  });

  it('enforces strict precondition: current SALE_READY=true in session', async () => {
    sessionRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.startActivation(tenantId, { candidateTerminalId }, userId),
    ).rejects.toThrow(BadRequestException);

    // Session exists but is SETUP_IN_PROGRESS
    sessionRepo.findOne.mockResolvedValueOnce({
      id: 'sess-1',
      tenantId,
      lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
    });

    await expect(
      service.startActivation(tenantId, { candidateTerminalId }, userId),
    ).rejects.toThrow(BadRequestException);
  });

  it('enforces strict precondition: no other active attempt in progress (CREATED or IN_PROGRESS)', async () => {
    sessionRepo.findOne.mockResolvedValueOnce({
      id: 'sess-1',
      tenantId,
      lifecycleState: OnboardingLifecycleState.SALE_READY,
    });

    // Active attempt already exists
    attemptRepo.findOne.mockResolvedValueOnce({
      id: 'existing-att-1',
      tenantId,
      onboardingSessionId: 'sess-1',
      status: ActivationAttemptStatus.IN_PROGRESS,
    });

    await expect(
      service.startActivation(tenantId, { candidateTerminalId }, userId),
    ).rejects.toThrow(ConflictException);
  });

  it('pins required fiscal and verification product revisions, fingerprints, and serverTimeAnchorAt', async () => {
    const session = {
      id: 'sess-1',
      tenantId,
      lifecycleState: OnboardingLifecycleState.SALE_READY,
      activationStartedAt: null,
      currentActivationAttemptId: null,
      lastActivityAt: null,
    };
    sessionRepo.findOne.mockResolvedValueOnce(session);
    attemptRepo.findOne.mockResolvedValueOnce(null); // No active attempt

    const result = await service.startActivation(
      tenantId,
      { candidateTerminalId },
      userId,
    );

    expect(result).toBeDefined();
    expect(attemptRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        onboardingSessionId: 'sess-1',
        candidateTerminalId: 'pos-term-01',
        status: ActivationAttemptStatus.CREATED,
        startedByUserId: userId,
        requiredFiscalRevision: 2,
        requiredFiscalFingerprint: 'fiscal-sha256-rev2',
        verificationProductId: 'prod-uuid-10',
        verificationProductRevision: 1,
        verificationProductFingerprint: 'product-sha256-rev1',
        serverTimeAnchorAt: expect.any(Date),
      }),
    );

    // Session transitioned to ACTIVATION_IN_PROGRESS and current attempt referenced
    expect(session.lifecycleState).toBe(
      OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
    );
    expect(session.currentActivationAttemptId).toBe('attempt-uuid-1');
    expect(session.activationStartedAt).toBeDefined();
    expect(sessionRepo.save).toHaveBeenCalledWith(session);
  });

  it('triangulation: allows custom requestedProductId and records idempotencyKey', async () => {
    const session = {
      id: 'sess-1',
      tenantId,
      lifecycleState: OnboardingLifecycleState.SALE_READY,
      activationStartedAt: null,
      currentActivationAttemptId: null,
    };
    sessionRepo.findOne.mockResolvedValueOnce(session);
    attemptRepo.findOne.mockResolvedValueOnce(null);

    const result = await service.startActivation(
      tenantId,
      {
        candidateTerminalId: 'pos-term-02',
        verificationProductId: 'prod-custom-99',
        idempotencyKey: 'idem-key-123',
      },
      userId,
    );

    expect(
      onboardingCatalogService.getVerificationProductCandidate,
    ).toHaveBeenCalledWith(tenantId, 'prod-custom-99');
    expect(attemptRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateTerminalId: 'pos-term-02',
        idempotencyKey: 'idem-key-123',
      }),
    );
  });

  it('triangulation: idempotent replay returns existing attempt when same idempotencyKey is used', async () => {
    const existingAttempt = {
      id: 'existing-att-1',
      tenantId,
      candidateTerminalId: 'pos-term-01',
      idempotencyKey: 'idem-key-replay',
      status: ActivationAttemptStatus.CREATED,
    };
    attemptRepo.findOne.mockResolvedValueOnce(existingAttempt);

    const result = await service.startActivation(
      tenantId,
      { candidateTerminalId: 'pos-term-01', idempotencyKey: 'idem-key-replay' },
      userId,
    );

    expect(result.id).toBe('existing-att-1');
    expect(attemptRepo.create).not.toHaveBeenCalled();
  });

  describe('ONB1.7B — Activation Check / Evidence Ingestion', () => {
    const attemptId = 'attempt-uuid-1';
    const devicePrincipal: DevicePrincipal = {
      tenantId,
      terminalId: candidateTerminalId,
    };

    it('rejects declarative forgery when payload tenant or terminal does not match DevicePrincipal', async () => {
      await expect(
        service.ingestCheck(
          attemptId,
          {
            checkCode: ActivationCheckCode.TERMINAL_LINKED,
            status: ActivationCheckStatus.PASS,
            declarativeTenantId: 'forged-tenant-b',
          },
          devicePrincipal,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.ingestCheck(
          attemptId,
          {
            checkCode: ActivationCheckCode.TERMINAL_LINKED,
            status: ActivationCheckStatus.PASS,
            declarativeTerminalId: 'forged-terminal-99',
          },
          devicePrincipal,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects check if attempt does not exist or belongs to another tenant', async () => {
      attemptRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.ingestCheck(
          attemptId,
          {
            checkCode: ActivationCheckCode.TERMINAL_LINKED,
            status: ActivationCheckStatus.PASS,
          },
          devicePrincipal,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects check if DevicePrincipal terminal does not match candidateTerminalId', async () => {
      attemptRepo.findOne.mockResolvedValueOnce({
        id: attemptId,
        tenantId,
        candidateTerminalId: 'different-terminal-99',
        status: ActivationAttemptStatus.CREATED,
      });

      await expect(
        service.ingestCheck(
          attemptId,
          {
            checkCode: ActivationCheckCode.TERMINAL_LINKED,
            status: ActivationCheckStatus.PASS,
          },
          devicePrincipal,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects check if attempt is already completed (PASS, PASS_WITH_WARNING, FAIL)', async () => {
      attemptRepo.findOne.mockResolvedValueOnce({
        id: attemptId,
        tenantId,
        candidateTerminalId,
        status: ActivationAttemptStatus.PASS,
      });

      await expect(
        service.ingestCheck(
          attemptId,
          {
            checkCode: ActivationCheckCode.TERMINAL_LINKED,
            status: ActivationCheckStatus.PASS,
          },
          devicePrincipal,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects WARNING status for any check code other than POST_RECONNECT_SYNC', async () => {
      attemptRepo.findOne.mockResolvedValueOnce({
        id: attemptId,
        tenantId,
        candidateTerminalId,
        status: ActivationAttemptStatus.CREATED,
      });

      await expect(
        service.ingestCheck(
          attemptId,
          {
            checkCode: ActivationCheckCode.REQUIRED_CONFIG_LOCAL,
            status: ActivationCheckStatus.WARNING,
          },
          devicePrincipal,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('ingests check, materializes trustedTerminalId, and advances CREATED attempt to IN_PROGRESS', async () => {
      const attempt = {
        id: attemptId,
        tenantId,
        candidateTerminalId,
        trustedTerminalId: null,
        status: ActivationAttemptStatus.CREATED,
      };
      attemptRepo.findOne.mockResolvedValueOnce(attempt);
      checkRepo.findOne.mockResolvedValueOnce(null); // No previous check result

      const result = await service.ingestCheck(
        attemptId,
        {
          checkCode: ActivationCheckCode.TERMINAL_LINKED,
          status: ActivationCheckStatus.PASS,
          evidenceType: 'DEVICE_IDENTITY',
          evidenceRef: 'token-uuid',
        },
        devicePrincipal,
      );

      expect(result).toBeDefined();
      expect(checkRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          activationAttemptId: attemptId,
          checkCode: ActivationCheckCode.TERMINAL_LINKED,
          status: ActivationCheckStatus.PASS,
          required: true,
        }),
      );
      expect(checkRepo.save).toHaveBeenCalled();

      // Attempt transitioned to IN_PROGRESS and trustedTerminalId materialized
      expect(attempt.status).toBe(ActivationAttemptStatus.IN_PROGRESS);
      expect(attempt.trustedTerminalId).toBe(candidateTerminalId);
      expect(attemptRepo.save).toHaveBeenCalledWith(attempt);
    });

    it('triangulation: idempotent ingestion for identical check result and details', async () => {
      const attempt = {
        id: attemptId,
        tenantId,
        candidateTerminalId,
        trustedTerminalId: candidateTerminalId,
        status: ActivationAttemptStatus.IN_PROGRESS,
      };
      const existingCheck = {
        id: 'check-1',
        tenantId,
        activationAttemptId: attemptId,
        checkCode: ActivationCheckCode.TERMINAL_LINKED,
        status: ActivationCheckStatus.PASS,
        evidenceType: 'DEVICE_IDENTITY',
      };
      attemptRepo.findOne.mockResolvedValueOnce(attempt);
      checkRepo.findOne.mockResolvedValueOnce(existingCheck);

      const result = await service.ingestCheck(
        attemptId,
        {
          checkCode: ActivationCheckCode.TERMINAL_LINKED,
          status: ActivationCheckStatus.PASS,
          evidenceType: 'DEVICE_IDENTITY',
        },
        devicePrincipal,
      );

      expect(result.id).toBe('check-1');
      expect(checkRepo.create).not.toHaveBeenCalled();
    });

    it('triangulation: raises INTEGRITY_CONFLICT when replaying existing check with contradictory status', async () => {
      const attempt = {
        id: attemptId,
        tenantId,
        candidateTerminalId,
        trustedTerminalId: candidateTerminalId,
        status: ActivationAttemptStatus.IN_PROGRESS,
      };
      const existingCheck = {
        id: 'check-1',
        tenantId,
        activationAttemptId: attemptId,
        checkCode: ActivationCheckCode.REQUIRED_CONFIG_LOCAL,
        status: ActivationCheckStatus.PASS,
      };
      attemptRepo.findOne.mockResolvedValueOnce(attempt);
      checkRepo.findOne.mockResolvedValueOnce(existingCheck);

      await expect(
        service.ingestCheck(
          attemptId,
          {
            checkCode: ActivationCheckCode.REQUIRED_CONFIG_LOCAL,
            status: ActivationCheckStatus.FAIL,
          },
          devicePrincipal,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('ONB1.7C — Check Catalogue & Backend Finalizer', () => {
    const attemptId = 'attempt-uuid-1';
    const allChecksPass = [
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
    ].map((checkCode) => ({
      id: `chk-${checkCode}`,
      tenantId,
      activationAttemptId: attemptId,
      checkCode,
      required: true,
      status: ActivationCheckStatus.PASS,
    }));

    it('finalizes attempt with PASS and transitions session to ACTIVATED when all checks PASS', async () => {
      const attempt = {
        id: attemptId,
        tenantId,
        onboardingSessionId: 'sess-1',
        verificationTicketId: 'verification-invoice-1',
        status: ActivationAttemptStatus.IN_PROGRESS,
        completedAt: null,
        warningsCount: 0,
      };
      const session = {
        id: 'sess-1',
        tenantId,
        lifecycleState: OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
        activatedAt: null,
      };

      attemptRepo.findOne.mockResolvedValueOnce(attempt);
      sessionRepo.findOne.mockResolvedValueOnce(session);
      checkRepo.find.mockResolvedValueOnce(allChecksPass);

      const result = await service.finalizeActivation(
        tenantId,
        attemptId,
        userId,
      );

      expect(result.status).toBe(ActivationAttemptStatus.PASS);
      expect(result.completedAt).toBeDefined();
      expect(session.lifecycleState).toBe(OnboardingLifecycleState.ACTIVATED);
      expect(session.activatedAt).toBeDefined();
      expect(followUpRepo.save).not.toHaveBeenCalled();
    });

    it('finalizes attempt with PASS_WITH_WARNING and creates ActivationFollowUp when only POST_RECONNECT_SYNC has WARNING', async () => {
      const checksWithWarning = allChecksPass.map((c) =>
        c.checkCode === ActivationCheckCode.POST_RECONNECT_SYNC
          ? {
              ...c,
              status: ActivationCheckStatus.WARNING,
              evidenceRef: 'ref-wan-timeout',
            }
          : c,
      );

      const attempt = {
        id: attemptId,
        tenantId,
        onboardingSessionId: 'sess-1',
        verificationTicketId: 'verification-invoice-1',
        status: ActivationAttemptStatus.IN_PROGRESS,
        completedAt: null,
        warningsCount: 0,
      };
      const session = {
        id: 'sess-1',
        tenantId,
        lifecycleState: OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
        activatedAt: null,
      };

      attemptRepo.findOne.mockResolvedValueOnce(attempt);
      sessionRepo.findOne.mockResolvedValueOnce(session);
      checkRepo.find.mockResolvedValueOnce(checksWithWarning);

      const result = await service.finalizeActivation(
        tenantId,
        attemptId,
        userId,
      );

      expect(result.status).toBe(ActivationAttemptStatus.PASS_WITH_WARNING);
      expect(result.warningsCount).toBe(1);
      expect(session.lifecycleState).toBe(OnboardingLifecycleState.ACTIVATED);
      expect(session.activatedAt).toBeDefined();

      expect(followUpRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          activationAttemptId: attemptId,
          warningCode: 'POST_RECONNECT_SYNC_TRANSIENT',
          status: 'OPEN',
          openedBy: userId,
        }),
      );
      expect(followUpRepo.save).toHaveBeenCalled();
    });

    it('finalizes attempt with FAIL and reverts session to SALE_READY when a required check fails', async () => {
      const checksWithFailure = allChecksPass.map((c) =>
        c.checkCode === ActivationCheckCode.SQLITE_DURABILITY
          ? { ...c, status: ActivationCheckStatus.FAIL }
          : c,
      );

      const attempt = {
        id: attemptId,
        tenantId,
        onboardingSessionId: 'sess-1',
        verificationTicketId: 'verification-invoice-1',
        status: ActivationAttemptStatus.IN_PROGRESS,
        completedAt: null,
        failureCode: null,
      };
      const session = {
        id: 'sess-1',
        tenantId,
        lifecycleState: OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
        activatedAt: null,
      };

      attemptRepo.findOne.mockResolvedValueOnce(attempt);
      sessionRepo.findOne.mockResolvedValueOnce(session);
      checkRepo.find.mockResolvedValueOnce(checksWithFailure);

      const result = await service.finalizeActivation(
        tenantId,
        attemptId,
        userId,
      );

      expect(result.status).toBe(ActivationAttemptStatus.FAIL);
      expect(result.failureCode).toBe('CHECK_FAILED_SQLITE_DURABILITY');
      expect(session.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
      expect(session.activatedAt).toBeNull();
    });

    it('finalizes attempt with FAIL when required checks are missing', async () => {
      const partialChecks = allChecksPass.slice(0, 5); // Only 5 of 10 checks

      const attempt = {
        id: attemptId,
        tenantId,
        onboardingSessionId: 'sess-1',
        verificationTicketId: 'verification-invoice-1',
        status: ActivationAttemptStatus.IN_PROGRESS,
        completedAt: null,
      };
      const session = {
        id: 'sess-1',
        tenantId,
        lifecycleState: OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
        activatedAt: null,
      };

      attemptRepo.findOne.mockResolvedValueOnce(attempt);
      sessionRepo.findOne.mockResolvedValueOnce(session);
      checkRepo.find.mockResolvedValueOnce(partialChecks);

      const result = await service.finalizeActivation(
        tenantId,
        attemptId,
        userId,
      );

      expect(result.status).toBe(ActivationAttemptStatus.FAIL);
      expect(result.failureCode).toBe('MISSING_REQUIRED_CHECKS');
      expect(session.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
    });

    it('idempotent replay returns existing completed attempt without mutating session', async () => {
      const completedAttempt = {
        id: attemptId,
        tenantId,
        onboardingSessionId: 'sess-1',
        status: ActivationAttemptStatus.PASS,
        completedAt: new Date('2026-09-04T12:00:00Z'),
      };

      attemptRepo.findOne.mockResolvedValueOnce(completedAttempt);

      const result = await service.finalizeActivation(
        tenantId,
        attemptId,
        userId,
      );

      expect(result.id).toBe(attemptId);
      expect(checkRepo.find).not.toHaveBeenCalled();
      expect(sessionRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('ActivationService — ONB1.7D–F Convergence Reconciler & Hardening', () => {
    const attemptId = 'attempt-uuid-conv-1';

    it('records audit log on StartActivation', async () => {
      const session = {
        id: 'sess-1',
        tenantId,
        lifecycleState: OnboardingLifecycleState.SALE_READY,
      };
      sessionRepo.findOne.mockResolvedValueOnce(session);

      await service.startActivation(
        tenantId,
        { candidateTerminalId: 'term-conv-1' },
        userId,
      );

      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          userId,
          action: 'ONBOARDING_ACTIVATION_ATTEMPT_STARTED',
          targetType: 'ActivationAttempt',
        }),
      );
    });

    it('records audit log on check failure ingestion', async () => {
      const attempt = {
        id: attemptId,
        tenantId,
        candidateTerminalId: 'pos-term-01',
        status: ActivationAttemptStatus.IN_PROGRESS,
      };
      attemptRepo.findOne.mockResolvedValueOnce(attempt);
      checkRepo.findOne.mockResolvedValueOnce(null);

      const devicePrincipal: DevicePrincipal = {
        tenantId,
        terminalId: 'pos-term-01',
      };

      await service.ingestCheck(
        attemptId,
        {
          checkCode: ActivationCheckCode.TEST_PRINT,
          status: ActivationCheckStatus.FAIL,
        },
        devicePrincipal,
      );

      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          action: 'ONBOARDING_ACTIVATION_CHECK_FAILED',
          targetType: 'ActivationCheckResult',
        }),
      );
    });

    it('records audit log on FinalizeActivation (PASS)', async () => {
      const allChecksPass = V1_REQUIRED_ACTIVATION_CHECKS.map((code) => ({
        id: `chk-${code}`,
        checkCode: code,
        status: ActivationCheckStatus.PASS,
      }));

      const attempt = {
        id: attemptId,
        tenantId,
        onboardingSessionId: 'sess-1',
        verificationTicketId: 'verification-invoice-1',
        status: ActivationAttemptStatus.IN_PROGRESS,
      };
      const session = {
        id: 'sess-1',
        tenantId,
        lifecycleState: OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
        activatedAt: null,
      };

      attemptRepo.findOne.mockResolvedValueOnce(attempt);
      sessionRepo.findOne.mockResolvedValueOnce(session);
      checkRepo.find.mockResolvedValueOnce(allChecksPass);

      await service.finalizeActivation(tenantId, attemptId, userId);

      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          userId,
          action: 'ONBOARDING_ACTIVATION_FINALIZED',
          targetType: 'ActivationAttempt',
          changes: expect.objectContaining({
            status: ActivationAttemptStatus.PASS,
          }),
        }),
      );
    });

    it('reconcileFollowUpConvergence auto-closes follow-up when POST_RECONNECT_SYNC converges to PASS without altering activatedAt', async () => {
      const originalActivatedAt = new Date('2026-09-04T10:00:00Z');
      const openFollowUp = {
        id: 'fup-conv-1',
        tenantId,
        activationAttemptId: attemptId,
        warningCode: 'POST_RECONNECT_SYNC_TRANSIENT',
        status: ActivationFollowUpStatus.OPEN,
        openedAt: new Date('2026-09-04T10:00:00Z'),
        closureEvidenceRef: null,
        closedAt: null,
        closedBy: null,
      };

      const convergedCheck = {
        id: 'chk-sync-pass',
        tenantId,
        activationAttemptId: attemptId,
        checkCode: ActivationCheckCode.POST_RECONNECT_SYNC,
        status: ActivationCheckStatus.PASS,
        evidenceRef: 'SYNC_BATCH_ACK_12345',
      };

      const session = {
        id: 'sess-1',
        tenantId,
        lifecycleState: OnboardingLifecycleState.ACTIVATED,
        activatedAt: originalActivatedAt,
      };

      followUpRepo.find.mockResolvedValueOnce([openFollowUp]);
      checkRepo.findOne.mockResolvedValueOnce(convergedCheck);
      sessionRepo.findOne.mockResolvedValueOnce(session);

      const result = await service.reconcileFollowUpConvergence(tenantId);

      expect(result.evaluatedCount).toBe(1);
      expect(result.closedCount).toBe(1);
      expect(result.closedFollowUpIds).toContain('fup-conv-1');

      // Verify follow up was mutated to CLOSED by SYSTEM_RECONCILER
      expect(openFollowUp.status).toBe(ActivationFollowUpStatus.CLOSED);
      expect(openFollowUp.closedBy).toBe('SYSTEM_RECONCILER');
      expect(openFollowUp.closedAt).toBeInstanceOf(Date);
      expect(openFollowUp.closureEvidenceRef).toBe('SYNC_BATCH_ACK_12345');

      // Crucial Invariant: activatedAt remains strictly unmodified!
      expect(session.activatedAt).toEqual(originalActivatedAt);
      expect(sessionRepo.save).not.toHaveBeenCalled();

      // Audit logged
      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          userId: 'SYSTEM_RECONCILER',
          action: 'ONBOARDING_ACTIVATION_FOLLOW_UP_CLOSED',
          targetType: 'ActivationFollowUp',
        }),
      );
    });

    it('reconcileFollowUpConvergence leaves follow-up OPEN when no convergence evidence is available', async () => {
      const openFollowUp = {
        id: 'fup-unresolved',
        tenantId,
        activationAttemptId: attemptId,
        warningCode: 'POST_RECONNECT_SYNC_TRANSIENT',
        status: ActivationFollowUpStatus.OPEN,
      };

      // Check is still WARNING (no convergence)
      const pendingCheck = {
        id: 'chk-sync-warning',
        tenantId,
        activationAttemptId: attemptId,
        checkCode: ActivationCheckCode.POST_RECONNECT_SYNC,
        status: ActivationCheckStatus.WARNING,
      };

      followUpRepo.find.mockResolvedValueOnce([openFollowUp]);
      checkRepo.findOne.mockResolvedValueOnce(pendingCheck);

      const result = await service.reconcileFollowUpConvergence(tenantId);

      expect(result.evaluatedCount).toBe(1);
      expect(result.closedCount).toBe(0);
      expect(result.unresolvedCount).toBe(1);
      expect(openFollowUp.status).toBe(ActivationFollowUpStatus.OPEN);
    });

    it('executeSupportOverride rejects when reason is under 10 characters', async () => {
      await expect(
        service.executeSupportOverride(
          tenantId,
          attemptId,
          {
            reason: 'short',
            overrideAction: SupportOverrideAction.FORCE_FAIL,
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('executeSupportOverride FORCE_FAIL terminates attempt and reverts session lifecycle', async () => {
      const attempt = {
        id: attemptId,
        tenantId,
        status: ActivationAttemptStatus.IN_PROGRESS,
        failureCode: null,
      };
      const session = {
        id: 'sess-1',
        tenantId,
        lifecycleState: OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
      };

      attemptRepo.findOne.mockResolvedValueOnce(attempt);
      sessionRepo.findOne.mockResolvedValueOnce(session);

      const result = await service.executeSupportOverride(
        tenantId,
        attemptId,
        {
          reason: 'Manual support intervention requested due to hardware fault',
          overrideAction: SupportOverrideAction.FORCE_FAIL,
        },
        userId,
      );

      expect(result.attempt.status).toBe(ActivationAttemptStatus.FAIL);
      expect(result.attempt.failureCode).toBe('SUPPORT_OVERRIDE_FAIL');
      expect(session.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);

      // Audit logged
      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          userId,
          action: 'ONBOARDING_ACTIVATION_SUPPORT_OVERRIDE',
          targetType: 'ActivationAttempt',
        }),
      );
    });

    it('executeSupportOverride DISMISS_WARNING closes open follow-ups and leaves session ACTIVATED', async () => {
      const attempt = {
        id: attemptId,
        tenantId,
        status: ActivationAttemptStatus.PASS_WITH_WARNING,
      };
      const followUp = {
        id: 'fup-override-1',
        tenantId,
        activationAttemptId: attemptId,
        status: ActivationFollowUpStatus.OPEN,
      };
      const session = {
        id: 'sess-1',
        tenantId,
        lifecycleState: OnboardingLifecycleState.ACTIVATED,
        activatedAt: new Date('2026-09-04T10:00:00Z'),
      };

      attemptRepo.findOne.mockResolvedValueOnce(attempt);
      followUpRepo.find.mockResolvedValueOnce([followUp]);
      sessionRepo.findOne.mockResolvedValueOnce(session);

      const result = await service.executeSupportOverride(
        tenantId,
        attemptId,
        {
          reason: 'Manual approval of transient sync variance under supervision',
          overrideAction: SupportOverrideAction.DISMISS_WARNING,
        },
        userId,
      );

      expect(result.closedFollowUpsCount).toBe(1);
      expect(followUp.status).toBe(ActivationFollowUpStatus.CLOSED);
      expect(session.lifecycleState).toBe(OnboardingLifecycleState.ACTIVATED);
    });

    it('getActivationDiagnostics returns full diagnostic view with matrix of 10 checks and audit trail', async () => {
      const attempt = {
        id: attemptId,
        tenantId,
        candidateTerminalId: 'pos-term-01',
        trustedTerminalId: 'pos-term-01',
        status: ActivationAttemptStatus.IN_PROGRESS,
        requiredFiscalRevision: 1,
        requiredFiscalFingerprint: 'fiscal-fp-1',
        verificationProductId: 'prod-1',
        verificationProductRevision: 1,
        startedAt: new Date(),
        warningsCount: 0,
      };

      const session = {
        id: 'sess-1',
        tenantId,
        lifecycleState: OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
        activatedAt: null,
      };

      const recordedChecks = [
        {
          checkCode: ActivationCheckCode.TERMINAL_LINKED,
          status: ActivationCheckStatus.PASS,
          required: true,
          recordedAt: new Date(),
        },
      ];

      attemptRepo.findOne.mockResolvedValueOnce(attempt);
      sessionRepo.findOne.mockResolvedValueOnce(session);
      checkRepo.find.mockResolvedValueOnce(recordedChecks);
      followUpRepo.find.mockResolvedValueOnce([]);
      changeLogService.findByTarget.mockResolvedValueOnce([
        { action: 'ONBOARDING_ACTIVATION_ATTEMPT_STARTED', user_id: userId },
      ]);

      const diag = await service.getActivationDiagnostics(tenantId, attemptId);

      expect(diag.attempt.id).toBe(attemptId);
      expect(diag.session.lifecycleState).toBe(
        OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
      );
      expect(diag.checksMatrix).toHaveLength(10);
      // 1 recorded + 9 missing
      expect(diag.missingChecks).toHaveLength(9);
      expect(diag.checksMatrix.find((c) => c.checkCode === ActivationCheckCode.TERMINAL_LINKED)?.status).toBe(
        ActivationCheckStatus.PASS,
      );
      expect(diag.checksMatrix.find((c) => c.checkCode === ActivationCheckCode.SQLITE_DURABILITY)?.isMissing).toBe(
        true,
      );
      expect(diag.auditTrail).toHaveLength(1);
    });
  });
});
