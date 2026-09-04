import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
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
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../entities/onboarding-session.entity';
import { FiscalConfigVersionService } from './fiscal-config-version.service';
import { OnboardingCatalogService } from './onboarding-catalog.service';
import { OnboardingReadinessEvaluator } from './onboarding-readiness.evaluator';
import {
  CloseActivationFollowUpDto,
  DevicePrincipal,
  IngestActivationCheckDto,
  StartActivationDto,
} from '../dto/activation.dto';

export const V1_REQUIRED_ACTIVATION_CHECKS: readonly ActivationCheckCode[] = [
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
] as const;

@Injectable()
export class ActivationService {
  constructor(
    @InjectRepository(ActivationAttempt)
    private readonly attemptRepo: Repository<ActivationAttempt>,
    @InjectRepository(ActivationCheckResult)
    private readonly checkRepo: Repository<ActivationCheckResult>,
    @InjectRepository(ActivationFollowUp)
    private readonly followUpRepo: Repository<ActivationFollowUp>,
    @InjectRepository(OnboardingSession)
    private readonly sessionRepo: Repository<OnboardingSession>,
    private readonly fiscalConfigVersionService: FiscalConfigVersionService,
    private readonly onboardingCatalogService: OnboardingCatalogService,
    private readonly readinessEvaluator: OnboardingReadinessEvaluator,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * ONB1.7A — StartActivation Command & Precondiciones
   */
  async startActivation(
    tenantId: string,
    dto: StartActivationDto,
    actorUserId: string,
  ): Promise<ActivationAttempt> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('tenantId is required');
    }

    const trimmedTerminalId = dto.candidateTerminalId?.trim();
    if (!trimmedTerminalId) {
      throw new BadRequestException('candidateTerminalId is required');
    }

    const trimmedIdempotencyKey = dto.idempotencyKey?.trim();
    if (trimmedIdempotencyKey) {
      const existing = await this.attemptRepo.findOne({
        where: {
          tenantId: trimmedTenant,
          idempotencyKey: trimmedIdempotencyKey,
        },
      });
      if (existing) {
        return existing;
      }
    }

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const sRepo = manager.getRepository(OnboardingSession);
      const aRepo = manager.getRepository(ActivationAttempt);

      // Precondición estricta: current SALE_READY=true
      const session = await sRepo.findOne({
        where: { tenantId: trimmedTenant },
      });

      if (!session) {
        throw new BadRequestException(
          `Onboarding session not found for tenant '${trimmedTenant}'`,
        );
      }

      if (session.lifecycleState !== OnboardingLifecycleState.SALE_READY) {
        throw new BadRequestException(
          `CANNOT_START_ACTIVATION_NOT_SALE_READY: Onboarding session is in '${session.lifecycleState}' state, but must be 'SALE_READY'`,
        );
      }

      // Precondición estricta: no otro attempt activo (CREATED o IN_PROGRESS)
      const activeAttempt = await aRepo.findOne({
        where: {
          tenantId: trimmedTenant,
          onboardingSessionId: session.id,
          status: In([
            ActivationAttemptStatus.CREATED,
            ActivationAttemptStatus.IN_PROGRESS,
          ]),
        },
      });

      if (activeAttempt) {
        throw new ConflictException(
          `ACTIVE_ATTEMPT_EXISTS: An activation attempt (${activeAttempt.id}) is already active in status '${activeAttempt.status}'`,
        );
      }

      // Pinning: fiscal config snapshot revision & fingerprint
      let fiscalRevision =
        await this.fiscalConfigVersionService.getLatestRevision(
          trimmedTenant,
          manager,
        );

      if (!fiscalRevision) {
        await this.fiscalConfigVersionService.recordRevisionChange(
          trimmedTenant,
          manager,
        );
        fiscalRevision =
          await this.fiscalConfigVersionService.getLatestRevision(
            trimmedTenant,
            manager,
          );
      }

      if (!fiscalRevision) {
        throw new BadRequestException(
          'FISCAL_REVISION_NOT_AVAILABLE: Cannot pin fiscal revision',
        );
      }

      // Pinning: verification product candidate
      const verificationCandidate =
        await this.onboardingCatalogService.getVerificationProductCandidate(
          trimmedTenant,
          dto.verificationProductId,
        );

      const now = new Date();

      const attempt = aRepo.create({
        tenantId: trimmedTenant,
        onboardingSessionId: session.id,
        candidateTerminalId: trimmedTerminalId,
        trustedTerminalId: null,
        status: ActivationAttemptStatus.CREATED,
        startedByUserId: actorUserId || 'SYSTEM',
        startedAt: now,
        serverTimeAnchorAt: now,
        requiredFiscalRevision: fiscalRevision.revision,
        requiredFiscalFingerprint: fiscalRevision.fingerprint,
        verificationProductId: verificationCandidate.verificationProductId,
        verificationProductRevision:
          verificationCandidate.verificationProductRevision ?? 1,
        verificationProductFingerprint:
          verificationCandidate.verificationProductFingerprint,
        posBuild: dto.posBuild?.trim() || null,
        warningsCount: 0,
        idempotencyKey: trimmedIdempotencyKey || null,
      });

      const savedAttempt = await aRepo.save(attempt);

      // Actualizar sesión a ACTIVATION_IN_PROGRESS
      session.lifecycleState = OnboardingLifecycleState.ACTIVATION_IN_PROGRESS;
      session.currentActivationAttemptId = savedAttempt.id;
      session.activationStartedAt = session.activationStartedAt ?? now;
      session.lastActivityAt = now;
      session.optimisticVersion = (session.optimisticVersion ?? 1) + 1;

      await sRepo.save(session);

      return savedAttempt;
    });
  }

  /**
   * ONB1.7B — Activation Check / Evidence Ingestion
   */
  async ingestCheck(
    attemptId: string,
    dto: IngestActivationCheckDto,
    devicePrincipal: DevicePrincipal,
  ): Promise<ActivationCheckResult> {
    const effectiveTenantId = devicePrincipal?.tenantId?.trim();
    const effectiveTerminalId = devicePrincipal?.terminalId?.trim();

    if (!effectiveTenantId || !effectiveTerminalId) {
      throw new ForbiddenException(
        'DEVICE_PRINCIPAL_MISSING: Authenticated DevicePrincipal context is required',
      );
    }

    // 1. Declarative forgery detection against authoritative DevicePrincipal
    if (
      dto.declarativeTenantId &&
      dto.declarativeTenantId.trim() !== effectiveTenantId
    ) {
      throw new ForbiddenException(
        'DEVICE_PRINCIPAL_FORGERY_DETECTED: Declarative tenantId does not match authenticated DevicePrincipal',
      );
    }

    if (
      dto.declarativeTerminalId &&
      dto.declarativeTerminalId.trim() !== effectiveTerminalId
    ) {
      throw new ForbiddenException(
        'DEVICE_PRINCIPAL_FORGERY_DETECTED: Declarative terminalId does not match authenticated DevicePrincipal',
      );
    }

    // 2. Validate attempt existence and tenant boundary
    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId, tenantId: effectiveTenantId },
    });

    if (!attempt) {
      throw new NotFoundException(
        `Activation attempt '${attemptId}' not found for tenant '${effectiveTenantId}'`,
      );
    }

    // 3. Validate device terminal matches candidate terminal
    if (attempt.candidateTerminalId.trim() !== effectiveTerminalId) {
      throw new ForbiddenException(
        `TERMINAL_MISMATCH: DevicePrincipal terminal '${effectiveTerminalId}' does not match candidate terminal '${attempt.candidateTerminalId}'`,
      );
    }

    // 4. Attempt status invariant: no checks allowed on completed attempt
    if (
      attempt.status === ActivationAttemptStatus.PASS ||
      attempt.status === ActivationAttemptStatus.PASS_WITH_WARNING ||
      attempt.status === ActivationAttemptStatus.FAIL
    ) {
      throw new ConflictException(
        `ATTEMPT_ALREADY_COMPLETED: Cannot ingest checks into an attempt in status '${attempt.status}'`,
      );
    }

    // 5. Normative check status constraint: Only POST_RECONNECT_SYNC may be WARNING
    if (
      dto.status === ActivationCheckStatus.WARNING &&
      dto.checkCode !== ActivationCheckCode.POST_RECONNECT_SYNC
    ) {
      throw new BadRequestException(
        `INVALID_CHECK_STATUS: Only POST_RECONNECT_SYNC may have WARNING status. Check '${dto.checkCode}' accepts only PASS | FAIL`,
      );
    }

    // 6. Uniqueness & idempotency: (tenant_id, activation_attempt_id, check_code)
    const existingCheck = await this.checkRepo.findOne({
      where: {
        tenantId: effectiveTenantId,
        activationAttemptId: attempt.id,
        checkCode: dto.checkCode,
      },
    });

    if (existingCheck) {
      if (existingCheck.status !== dto.status) {
        throw new ConflictException(
          `INTEGRITY_CONFLICT: Check '${dto.checkCode}' already exists with status '${existingCheck.status}', cannot conflict with '${dto.status}'`,
        );
      }

      // Idempotent update of non-destructive evidence fields
      if (dto.evidenceType) existingCheck.evidenceType = dto.evidenceType;
      if (dto.evidenceRef) existingCheck.evidenceRef = dto.evidenceRef;
      if (dto.detailsSanitizedJson) {
        existingCheck.detailsSanitizedJson = dto.detailsSanitizedJson;
      }
      if (dto.occurredAt) {
        existingCheck.occurredAt = new Date(dto.occurredAt);
      }
      return this.checkRepo.save(existingCheck);
    }

    // Create new check result
    const newCheck = this.checkRepo.create({
      tenantId: effectiveTenantId,
      activationAttemptId: attempt.id,
      checkCode: dto.checkCode,
      required: dto.required !== undefined ? dto.required : true,
      status: dto.status,
      evidenceType: dto.evidenceType?.trim() || null,
      evidenceRef: dto.evidenceRef?.trim() || null,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null,
      recordedAt: new Date(),
      detailsSanitizedJson: dto.detailsSanitizedJson || null,
    });

    const savedCheck = await this.checkRepo.save(newCheck);

    // 7. Advance attempt state & materialize trustedTerminalId
    let attemptMutated = false;
    if (attempt.status === ActivationAttemptStatus.CREATED) {
      attempt.status = ActivationAttemptStatus.IN_PROGRESS;
      attemptMutated = true;
    }
    if (!attempt.trustedTerminalId) {
      attempt.trustedTerminalId = effectiveTerminalId;
      attemptMutated = true;
    }
    if (dto.verificationTicketId && !attempt.verificationTicketId) {
      attempt.verificationTicketId = dto.verificationTicketId.trim();
      attemptMutated = true;
    }

    if (attemptMutated) {
      await this.attemptRepo.save(attempt);
    }

    return savedCheck;
  }

  /**
   * ONB1.7C — Check Catalogue & Backend Finalizer
   * Evaluates persisted evidence authoritatively and executes atomic state transition.
   */
  async finalizeActivation(
    tenantId: string,
    attemptId: string,
    actorUserId: string,
  ): Promise<ActivationAttempt> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('tenantId is required');
    }

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const aRepo = manager.getRepository(ActivationAttempt);
      const sRepo = manager.getRepository(OnboardingSession);
      const cRepo = manager.getRepository(ActivationCheckResult);
      const fRepo = manager.getRepository(ActivationFollowUp);

      const attempt = await aRepo.findOne({
        where: { id: attemptId, tenantId: trimmedTenant },
      });

      if (!attempt) {
        throw new NotFoundException(
          `Activation attempt '${attemptId}' not found for tenant '${trimmedTenant}'`,
        );
      }

      // Idempotency: if already terminalized, return as-is
      if (
        attempt.status === ActivationAttemptStatus.PASS ||
        attempt.status === ActivationAttemptStatus.PASS_WITH_WARNING ||
        attempt.status === ActivationAttemptStatus.FAIL
      ) {
        return attempt;
      }

      const session = await sRepo.findOne({
        where: { tenantId: trimmedTenant },
      });

      if (!session) {
        throw new NotFoundException(
          `Onboarding session not found for tenant '${trimmedTenant}'`,
        );
      }

      const recordedChecks = await cRepo.find({
        where: { tenantId: trimmedTenant, activationAttemptId: attempt.id },
      });

      const checkMap = new Map<ActivationCheckCode, ActivationCheckResult>();
      for (const chk of recordedChecks) {
        checkMap.set(chk.checkCode, chk);
      }

      // Evaluate normative truth table against catalog
      let hasMissingChecks = false;
      let firstFailedCode: string | null = null;
      let warningCheck: ActivationCheckResult | null = null;

      for (const requiredCode of V1_REQUIRED_ACTIVATION_CHECKS) {
        const check = checkMap.get(requiredCode);
        if (!check) {
          hasMissingChecks = true;
          break;
        }

        if (check.status === ActivationCheckStatus.FAIL) {
          if (!firstFailedCode) {
            firstFailedCode = `CHECK_FAILED_${check.checkCode}`;
          }
        } else if (check.status === ActivationCheckStatus.WARNING) {
          if (check.checkCode === ActivationCheckCode.POST_RECONNECT_SYNC) {
            warningCheck = check;
          } else {
            if (!firstFailedCode) {
              firstFailedCode = `INVALID_WARNING_${check.checkCode}`;
            }
          }
        } else if (check.status !== ActivationCheckStatus.PASS) {
          if (!firstFailedCode) {
            firstFailedCode = `CHECK_NOT_PASSED_${check.checkCode}`;
          }
        }
      }

      const now = new Date();

      if (hasMissingChecks) {
        attempt.status = ActivationAttemptStatus.FAIL;
        attempt.failureCode = 'MISSING_REQUIRED_CHECKS';
      } else if (firstFailedCode) {
        attempt.status = ActivationAttemptStatus.FAIL;
        attempt.failureCode = firstFailedCode;
      } else if (warningCheck) {
        // PASS_WITH_WARNING: all local required checks = PASS and POST_RECONNECT_SYNC = WARNING
        attempt.status = ActivationAttemptStatus.PASS_WITH_WARNING;
        attempt.warningsCount = 1;

        // Persist ActivationFollowUp
        const followUp = fRepo.create({
          tenantId: trimmedTenant,
          activationAttemptId: attempt.id,
          warningCode: 'POST_RECONNECT_SYNC_TRANSIENT',
          status: ActivationFollowUpStatus.OPEN,
          openedAt: now,
          openedBy: actorUserId || 'SYSTEM_FINALIZER',
          closureEvidenceRef: warningCheck.evidenceRef || null,
        });
        await fRepo.save(followUp);
      } else {
        // PASS: all required checks = PASS
        attempt.status = ActivationAttemptStatus.PASS;
      }

      attempt.completedAt = now;
      const savedAttempt = await aRepo.save(attempt);

      // Lifecycle update on OnboardingSession
      if (
        attempt.status === ActivationAttemptStatus.PASS ||
        attempt.status === ActivationAttemptStatus.PASS_WITH_WARNING
      ) {
        session.lifecycleState = OnboardingLifecycleState.ACTIVATED;
        session.activatedAt = session.activatedAt ?? attempt.completedAt;
      } else {
        // FAIL: liberate active attempt and revert lifecycle based on live readiness
        const readiness = await this.readinessEvaluator.evaluate(trimmedTenant);
        if (readiness.saleReady) {
          session.lifecycleState = OnboardingLifecycleState.SALE_READY;
        } else {
          session.lifecycleState = OnboardingLifecycleState.SETUP_IN_PROGRESS;
        }
      }

      session.lastActivityAt = now;
      session.currentActivationAttemptId = savedAttempt.id;
      session.optimisticVersion = (session.optimisticVersion ?? 1) + 1;
      await sRepo.save(session);

      return savedAttempt;
    });
  }

  async getAttempt(
    tenantId: string,
    attemptId: string,
  ): Promise<ActivationAttempt> {
    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId, tenantId },
    });
    if (!attempt) {
      throw new NotFoundException(
        `Activation attempt '${attemptId}' not found for tenant`,
      );
    }
    return attempt;
  }

  async getActiveAttempt(tenantId: string): Promise<ActivationAttempt | null> {
    return this.attemptRepo.findOne({
      where: {
        tenantId,
        status: In([
          ActivationAttemptStatus.CREATED,
          ActivationAttemptStatus.IN_PROGRESS,
        ]),
      },
      order: { startedAt: 'DESC' },
    });
  }

  async getFollowUps(
    tenantId: string,
    attemptId: string,
  ): Promise<ActivationFollowUp[]> {
    return this.followUpRepo.find({
      where: { tenantId, activationAttemptId: attemptId },
      order: { openedAt: 'DESC' },
    });
  }

  async closeFollowUp(
    tenantId: string,
    followUpId: string,
    dto: CloseActivationFollowUpDto,
    actorUserId: string,
  ): Promise<ActivationFollowUp> {
    const followUp = await this.followUpRepo.findOne({
      where: { id: followUpId, tenantId },
    });

    if (!followUp) {
      throw new NotFoundException(
        `Activation follow-up '${followUpId}' not found for tenant`,
      );
    }

    if (followUp.status === ActivationFollowUpStatus.CLOSED) {
      return followUp;
    }

    followUp.status = ActivationFollowUpStatus.CLOSED;
    followUp.closedAt = new Date();
    followUp.closedBy = actorUserId || 'SYSTEM_RECONCILER';
    if (dto.closureEvidenceRef) {
      followUp.closureEvidenceRef = dto.closureEvidenceRef.trim();
    }
    if (dto.closureNote) {
      followUp.closureNote = dto.closureNote.trim();
    }

    return this.followUpRepo.save(followUp);
  }
}
