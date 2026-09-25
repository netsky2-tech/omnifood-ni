import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  InvoicesService,
  SyncBatchResult,
} from '../../sales/services/invoices.service';
import { SyncBatchRecordDto } from '../../sales/dto/sync-batch.dto';
import { Invoice } from '../../sales/entities/invoice.entity';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  Repository,
} from 'typeorm';
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
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { FiscalConfigVersionService } from './fiscal-config-version.service';
import { OnboardingCatalogService } from './onboarding-catalog.service';
import { OnboardingReadinessEvaluator } from './onboarding-readiness.evaluator';
import { ChangeLogService } from '../../audit/change-log.service';
import { ChangeLog } from '../../audit/entities/change-log.entity';
import {
  ActivationCheckDiagnosticItem,
  ActivationDiagnosticsDto,
  CloseActivationFollowUpDto,
  DevicePrincipal,
  IngestActivationCheckDto,
  FirstSuccessfulSaleClaimDto,
  StartActivationDto,
  SupportOverrideAction,
  SupportOverrideDto,
} from '../dto/activation.dto';
import { DeviceSyncCredentialResponseDto } from '../dto/device-sync-credential-response.dto';
import { ConfirmDeviceSyncCredentialDto } from '../dto/confirm-device-sync-credential.dto';
import { DeviceSyncCredentialService } from '../../identity/services/device-sync-credential.service';
import { TenantTopologyRevisionService } from '../../fulfillment/services/tenant-topology-revision.service';

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
    private readonly changeLogService: ChangeLogService,
    @Optional() private readonly invoicesService?: InvoicesService,
    @Optional()
    private readonly deviceSyncCredentialService?: DeviceSyncCredentialService,
    @Optional()
    private readonly tenantTopologyRevisionService?: TenantTopologyRevisionService,
  ) {}

  /**
   * Runs work inside a DataSource transaction whose manager is bound to the
   * tenant context (transaction-local set_config) before any repository
   * access. Every access to RLS-protected activation tables must go through
   * this wrapper or an explicitly bound transaction manager.
   */
  private runTenantBound<T>(
    tenantId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return runInTenantTransaction(this.dataSource, tenantId, work);
  }

  private assertPrincipalMatchesRecord(
    record: SyncBatchRecordDto,
    devicePrincipal: DevicePrincipal,
  ): void {
    if (
      record.documentType !== 'SALE' ||
      record.flowType !== 'sales' ||
      !record.invoice ||
      !record.invoiceId ||
      record.invoice.id !== record.invoiceId ||
      record.sourceDeviceId?.trim() !== devicePrincipal.terminalId ||
      record.terminalId?.trim() !== devicePrincipal.terminalId
    ) {
      throw new BadRequestException(
        'INVALID_VERIFICATION_SALE: A complete SALE/sales record for the authenticated terminal is required',
      );
    }
  }

  async syncVerificationSale(
    attemptId: string,
    record: SyncBatchRecordDto,
    devicePrincipal: DevicePrincipal,
  ): Promise<SyncBatchResult> {
    const tenantId = devicePrincipal?.tenantId?.trim();
    const terminalId = devicePrincipal?.terminalId?.trim();
    if (!tenantId || !terminalId) {
      throw new ForbiddenException('DEVICE_PRINCIPAL_MISSING');
    }
    this.assertPrincipalMatchesRecord(record, devicePrincipal);

    const attempt = await this.runTenantBound(tenantId, (manager) =>
      manager
        .getRepository(ActivationAttempt)
        .findOne({ where: { id: attemptId, tenantId } }),
    );
    if (!attempt) {
      throw new NotFoundException(
        `Activation attempt '${attemptId}' not found for tenant`,
      );
    }
    if (attempt.candidateTerminalId.trim() !== terminalId) {
      throw new ForbiddenException('TERMINAL_MISMATCH');
    }

    if (!this.invoicesService) {
      throw new BadRequestException('VERIFICATION_SALE_SYNC_UNAVAILABLE');
    }
    return this.invoicesService.syncBatch(tenantId, [record]);
  }

  async claimFirstSuccessfulSale(
    attemptId: string,
    dto: FirstSuccessfulSaleClaimDto,
    devicePrincipal: DevicePrincipal,
  ): Promise<{ claimed: boolean; ticketId: string | null }> {
    const tenantId = devicePrincipal?.tenantId?.trim();
    const terminalId = devicePrincipal?.terminalId?.trim();
    if (!tenantId || !terminalId) {
      throw new ForbiddenException('DEVICE_PRINCIPAL_MISSING');
    }
    if (
      dto.declarativeTenantId.trim() !== tenantId ||
      dto.declarativeTerminalId.trim() !== terminalId ||
      dto.activationAttemptId.trim() !== attemptId
    ) {
      throw new ForbiddenException('DEVICE_PRINCIPAL_FORGERY_DETECTED');
    }

    return this.runTenantBound(tenantId, async (manager) => {
      const aRepo = manager.getRepository(ActivationAttempt);
      const sRepo = manager.getRepository(OnboardingSession);
      const attempt = await aRepo.findOne({
        where: { id: attemptId, tenantId },
      });
      if (!attempt) {
        throw new NotFoundException(
          `Activation attempt '${attemptId}' not found for tenant`,
        );
      }
      if (attempt.candidateTerminalId.trim() !== terminalId) {
        throw new ForbiddenException('TERMINAL_MISMATCH');
      }
      if (attempt.verificationTicketId) {
        return { claimed: false, ticketId: attempt.verificationTicketId };
      }

      const invoice = await manager.getRepository(Invoice).findOne({
        where: { id: dto.ticketId, tenant_id: tenantId },
      });
      if (!invoice || invoice.isCanceled || invoice.paymentStatus !== 'paid') {
        throw new BadRequestException('VERIFICATION_SALE_NOT_PERSISTED_PAID');
      }

      const session = await sRepo.findOne({ where: { tenantId } });
      if (!session) {
        throw new NotFoundException(
          `Onboarding session not found for tenant '${tenantId}'`,
        );
      }

      // Issue #556 re-activation fix: the verification ticket binds to THIS
      // attempt unconditionally. The tenant-level firstSuccessfulSaleAt
      // marker is first-ever only — on re-activation (wipe + re-link) the
      // marker is already set by a previous attempt, and skipping the bind
      // here left the new attempt without evidence (finalize evaluated
      // VERIFICATION_SALE_EVIDENCE_MISSING on an all-PASS attempt).
      attempt.verificationTicketId = dto.ticketId;
      await aRepo.save(attempt);

      if (!session.firstSuccessfulSaleAt) {
        session.firstSuccessfulSaleAt = new Date(
          dto.anchoredOccurredAt || dto.deviceOccurredAt,
        );
      }
      session.lastActivityAt = new Date();
      session.optimisticVersion = (session.optimisticVersion ?? 1) + 1;
      await sRepo.save(session);
      return { claimed: true, ticketId: dto.ticketId };
    });
  }

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

    let idempotentReplay = false;
    const result = await this.runTenantBound(
      trimmedTenant,
      async (manager: EntityManager) => {
        const sRepo = manager.getRepository(OnboardingSession);
        const aRepo = manager.getRepository(ActivationAttempt);

        const trimmedIdempotencyKey = dto.idempotencyKey?.trim();
        if (trimmedIdempotencyKey) {
          const existing = await aRepo.findOne({
            where: {
              tenantId: trimmedTenant,
              idempotencyKey: trimmedIdempotencyKey,
            },
          });
          if (existing) {
            idempotentReplay = true;
            return existing;
          }
        }

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
        session.lifecycleState =
          OnboardingLifecycleState.ACTIVATION_IN_PROGRESS;
        session.currentActivationAttemptId = savedAttempt.id;
        session.activationStartedAt = session.activationStartedAt ?? now;
        session.lastActivityAt = now;
        session.optimisticVersion = (session.optimisticVersion ?? 1) + 1;

        await sRepo.save(session);

        return savedAttempt;
      },
    );

    // ONB1.7F: Audit log for attempt started (idempotent replays skip the audit log)
    if (!idempotentReplay) {
      await this.changeLogService.log({
        tenantId: trimmedTenant,
        actor: actorUserId ? { userId: actorUserId } : { ref: 'SYSTEM' },
        action: 'ONBOARDING_ACTIVATION_ATTEMPT_STARTED',
        targetType: 'ActivationAttempt',
        targetId: result.id,
        changes: {
          candidateTerminalId: result.candidateTerminalId,
          requiredFiscalRevision: result.requiredFiscalRevision,
          verificationProductId: result.verificationProductId,
          serverTimeAnchorAt: result.serverTimeAnchorAt,
        },
      });
    }

    return result;
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

    let idempotentReplay = false;
    const savedCheck = await this.runTenantBound(
      effectiveTenantId,
      async (manager: EntityManager) => {
        const attemptRepo = manager.getRepository(ActivationAttempt);
        const checkRepo = manager.getRepository(ActivationCheckResult);

        // 2. Validate attempt existence and tenant boundary
        const attempt = await attemptRepo.findOne({
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
        const existingCheck = await checkRepo.findOne({
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
          // Already-persisted check: skip the failure audit emission below
          // (parity with the pre-tenant-binding early return)
          idempotentReplay = true;
          return checkRepo.save(existingCheck);
        }

        // Create new check result
        const newCheck = checkRepo.create({
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

        const saved = await checkRepo.save(newCheck);

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
          await attemptRepo.save(attempt);
        }

        return saved;
      },
    );

    // ONB1.7F: Audit log for check failure (idempotent replays skip the audit log)
    if (savedCheck.status === ActivationCheckStatus.FAIL && !idempotentReplay) {
      await this.changeLogService.log({
        tenantId: effectiveTenantId,
        // Attributes a failed check to the terminal, not to a user or to the
        // system. Whether a terminal deserves its own actor class is a
        // product decision left for review (issue #412).
        actor: { ref: effectiveTerminalId },
        action: 'ONBOARDING_ACTIVATION_CHECK_FAILED',
        targetType: 'ActivationCheckResult',
        targetId: savedCheck.id,
        changes: {
          checkCode: savedCheck.checkCode,
          status: savedCheck.status,
          evidenceType: savedCheck.evidenceType,
          evidenceRef: savedCheck.evidenceRef,
        },
      });
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

    const result = await this.runTenantBound(
      trimmedTenant,
      async (manager: EntityManager) => {
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
          return {
            savedAttempt: attempt,
            followUpCreated: null,
            isReplay: true,
          };
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
        const verificationInvoice = attempt.verificationTicketId
          ? await manager.getRepository(Invoice).findOne({
              where: {
                id: attempt.verificationTicketId,
                tenant_id: trimmedTenant,
              },
            })
          : null;
        const hasPersistedVerificationSale = Boolean(
          verificationInvoice &&
          !verificationInvoice.isCanceled &&
          verificationInvoice.paymentStatus === 'paid',
        );

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
        let followUpCreated: ActivationFollowUp | null = null;

        if (!hasPersistedVerificationSale) {
          attempt.status = ActivationAttemptStatus.FAIL;
          attempt.failureCode = 'VERIFICATION_SALE_EVIDENCE_MISSING';
        } else if (hasMissingChecks) {
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
          followUpCreated = await fRepo.save(followUp);
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
          const readiness =
            await this.readinessEvaluator.evaluate(trimmedTenant);
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

        return { savedAttempt, followUpCreated, isReplay: false };
      },
    );

    if (!result.isReplay) {
      await this.changeLogService.log({
        tenantId: trimmedTenant,
        actor: actorUserId
          ? { userId: actorUserId }
          : { ref: 'SYSTEM_FINALIZER' },
        action: 'ONBOARDING_ACTIVATION_FINALIZED',
        targetType: 'ActivationAttempt',
        targetId: result.savedAttempt.id,
        changes: {
          status: result.savedAttempt.status,
          failureCode: result.savedAttempt.failureCode,
          warningsCount: result.savedAttempt.warningsCount,
          completedAt: result.savedAttempt.completedAt,
        },
      });

      if (result.followUpCreated) {
        await this.changeLogService.log({
          tenantId: trimmedTenant,
          actor: actorUserId
            ? { userId: actorUserId }
            : { ref: 'SYSTEM_FINALIZER' },
          action: 'ONBOARDING_ACTIVATION_FOLLOW_UP_OPENED',
          targetType: 'ActivationFollowUp',
          targetId: result.followUpCreated.id,
          changes: {
            warningCode: result.followUpCreated.warningCode,
            closureEvidenceRef: result.followUpCreated.closureEvidenceRef,
          },
        });
      }
    }

    return result.savedAttempt;
  }

  async getAttempt(
    tenantId: string,
    attemptId: string,
  ): Promise<ActivationAttempt> {
    const attempt = await this.runTenantBound(tenantId, (manager) =>
      manager
        .getRepository(ActivationAttempt)
        .findOne({ where: { id: attemptId, tenantId } }),
    );
    if (!attempt) {
      throw new NotFoundException(
        `Activation attempt '${attemptId}' not found for tenant`,
      );
    }
    return attempt;
  }

  async getActiveAttempt(tenantId: string): Promise<ActivationAttempt | null> {
    return this.runTenantBound(tenantId, (manager) =>
      manager.getRepository(ActivationAttempt).findOne({
        where: {
          tenantId,
          status: In([
            ActivationAttemptStatus.CREATED,
            ActivationAttemptStatus.IN_PROGRESS,
          ]),
        },
        order: { startedAt: 'DESC' },
      }),
    );
  }

  async getFollowUps(
    tenantId: string,
    attemptId: string,
  ): Promise<ActivationFollowUp[]> {
    return this.runTenantBound(tenantId, (manager) =>
      manager.getRepository(ActivationFollowUp).find({
        where: { tenantId, activationAttemptId: attemptId },
        order: { openedAt: 'DESC' },
      }),
    );
  }

  async closeFollowUp(
    tenantId: string,
    followUpId: string,
    dto: CloseActivationFollowUpDto,
    actorUserId: string,
  ): Promise<ActivationFollowUp> {
    const outcome = await this.runTenantBound(
      tenantId,
      async (manager: EntityManager) => {
        const followUpRepo = manager.getRepository(ActivationFollowUp);

        const followUp = await followUpRepo.findOne({
          where: { id: followUpId, tenantId },
        });

        if (!followUp) {
          throw new NotFoundException(
            `Activation follow-up '${followUpId}' not found for tenant`,
          );
        }

        if (followUp.status === ActivationFollowUpStatus.CLOSED) {
          return { followUp, changed: false };
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

        return { followUp: await followUpRepo.save(followUp), changed: true };
      },
    );

    if (outcome.changed) {
      await this.changeLogService.log({
        tenantId,
        actor: actorUserId
          ? { userId: actorUserId }
          : { ref: 'SYSTEM_RECONCILER' },
        action: 'ONBOARDING_ACTIVATION_FOLLOW_UP_CLOSED',
        targetType: 'ActivationFollowUp',
        targetId: outcome.followUp.id,
        changes: {
          closedBy: outcome.followUp.closedBy,
          closureEvidenceRef: outcome.followUp.closureEvidenceRef,
          closureNote: outcome.followUp.closureNote,
        },
      });
    }

    return outcome.followUp;
  }

  /**
   * ONB1.7D–E — Background Convergence Reconciler
   * Scans open follow-ups and automatically closes them when convergence evidence
   * is corroborated, without mutating session.activatedAt.
   */
  async reconcileFollowUpConvergence(
    tenantId?: string,
    attemptId?: string,
  ): Promise<{
    evaluatedCount: number;
    closedCount: number;
    closedFollowUpIds: string[];
    unresolvedCount: number;
  }> {
    // Tenant context is mandatory: every activation-table access below runs
    // inside a transaction whose manager is bound to app.tenant_id.
    const scopedTenantId = tenantId?.trim();
    if (!scopedTenantId) {
      throw new BadRequestException('tenantId is required');
    }

    const whereClause: FindOptionsWhere<ActivationFollowUp> = {
      status: ActivationFollowUpStatus.OPEN,
      tenantId: scopedTenantId,
    };
    if (attemptId?.trim()) {
      whereClause.activationAttemptId = attemptId.trim();
    }

    const openFollowUps = await this.runTenantBound(scopedTenantId, (manager) =>
      manager.getRepository(ActivationFollowUp).find({
        where: whereClause,
      }),
    );

    const closedFollowUpIds: string[] = [];
    let unresolvedCount = 0;

    for (const fup of openFollowUps) {
      // Corroborate convergence inside a tenant-bound transaction per
      // follow-up, preserving per-follow-up commit atomicity.
      const outcome = await this.runTenantBound(
        fup.tenantId,
        async (manager: EntityManager) => {
          const checkRepo = manager.getRepository(ActivationCheckResult);
          const attemptRepo = manager.getRepository(ActivationAttempt);
          const followUpRepo = manager.getRepository(ActivationFollowUp);

          // Corroborate convergence: check if POST_RECONNECT_SYNC check has converged to PASS
          const check = await checkRepo.findOne({
            where: {
              tenantId: fup.tenantId,
              activationAttemptId: fup.activationAttemptId,
              checkCode: ActivationCheckCode.POST_RECONNECT_SYNC,
            },
          });

          let converged = false;
          let evidenceRef = fup.closureEvidenceRef;

          if (check && check.status === ActivationCheckStatus.PASS) {
            converged = true;
            evidenceRef =
              check.evidenceRef || 'POST_RECONNECT_SYNC_PASS_CONVERGED';
          } else {
            // Corroborate via verificationTicketId in real sales persistence
            const attempt = await attemptRepo.findOne({
              where: { id: fup.activationAttemptId, tenantId: fup.tenantId },
            });
            if (attempt?.verificationTicketId) {
              try {
                const invoice = await manager.getRepository(Invoice).findOne({
                  where: {
                    tenant_id: fup.tenantId,
                    id: attempt.verificationTicketId,
                  },
                });
                if (
                  invoice &&
                  !invoice.isCanceled &&
                  invoice.paymentStatus === 'paid'
                ) {
                  converged = true;
                  evidenceRef = `VERIFICATION_INVOICE_${invoice.id}`;
                }
              } catch {
                // Table not available or query error; ignore
              }
            }
          }

          if (converged) {
            fup.status = ActivationFollowUpStatus.CLOSED;
            fup.closedAt = new Date();
            fup.closedBy = 'SYSTEM_RECONCILER';
            fup.closureEvidenceRef = evidenceRef;
            fup.closureNote =
              'Automated background convergence completed without operator intervention';
            await followUpRepo.save(fup);
          }

          return { converged };
        },
      );

      if (outcome.converged) {
        await this.changeLogService.log({
          tenantId: fup.tenantId,
          actor: { ref: 'SYSTEM_RECONCILER' },
          action: 'ONBOARDING_ACTIVATION_FOLLOW_UP_CLOSED',
          targetType: 'ActivationFollowUp',
          targetId: fup.id,
          changes: {
            closedBy: fup.closedBy,
            closureEvidenceRef: fup.closureEvidenceRef,
            closureNote: fup.closureNote,
          },
        });

        closedFollowUpIds.push(fup.id);
      } else {
        unresolvedCount++;
      }
    }

    return {
      evaluatedCount: openFollowUps.length,
      closedCount: closedFollowUpIds.length,
      closedFollowUpIds,
      unresolvedCount,
    };
  }

  /**
   * ONB1.7F — Support Overrides & Manual Interventions
   */
  async executeSupportOverride(
    tenantId: string,
    attemptId: string,
    dto: SupportOverrideDto,
    actorUserId: string,
  ): Promise<{
    attempt: ActivationAttempt;
    closedFollowUpsCount: number;
  }> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('tenantId is required');
    }

    const reason = dto.reason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        'INVALID_OVERRIDE_REASON: A substantive audit reason of at least 10 characters is required for support overrides',
      );
    }

    return this.runTenantBound(trimmedTenant, async (manager) => {
      const aRepo = manager.getRepository(ActivationAttempt);
      const sRepo = manager.getRepository(OnboardingSession);
      const fRepo = manager.getRepository(ActivationFollowUp);

      const attempt = await aRepo.findOne({
        where: { id: attemptId, tenantId: trimmedTenant },
      });

      if (!attempt) {
        throw new NotFoundException(
          `Activation attempt '${attemptId}' not found for tenant '${trimmedTenant}'`,
        );
      }

      let closedFollowUpsCount = 0;
      const now = new Date();

      if (dto.overrideAction === SupportOverrideAction.FORCE_FAIL) {
        attempt.status = ActivationAttemptStatus.FAIL;
        attempt.failureCode = 'SUPPORT_OVERRIDE_FAIL';
        attempt.completedAt = now;
        await aRepo.save(attempt);

        const session = await sRepo.findOne({
          where: { tenantId: trimmedTenant },
        });
        if (session) {
          const readiness =
            await this.readinessEvaluator.evaluate(trimmedTenant);
          if (readiness.saleReady) {
            session.lifecycleState = OnboardingLifecycleState.SALE_READY;
          } else {
            session.lifecycleState = OnboardingLifecycleState.SETUP_IN_PROGRESS;
          }
          session.lastActivityAt = now;
          session.optimisticVersion = (session.optimisticVersion ?? 1) + 1;
          await sRepo.save(session);
        }
      } else if (dto.overrideAction === SupportOverrideAction.DISMISS_WARNING) {
        const openFollowUps = await fRepo.find({
          where: {
            tenantId: trimmedTenant,
            activationAttemptId: attempt.id,
            status: ActivationFollowUpStatus.OPEN,
          },
        });

        for (const fup of openFollowUps) {
          fup.status = ActivationFollowUpStatus.CLOSED;
          fup.closedAt = now;
          fup.closedBy = actorUserId || 'SUPPORT_OPERATOR';
          fup.closureNote = `Support override: ${reason}`;
          if (dto.evidenceRef) {
            fup.closureEvidenceRef = dto.evidenceRef.trim();
          }
          await fRepo.save(fup);
          closedFollowUpsCount++;
        }
      }

      // Issue #512 slice 7: the audit entry rides the caller's tenant-bound
      // transaction manager so the override and its audit log commit
      // atomically inside the same bound transaction.
      await this.changeLogService.log(
        {
          tenantId: trimmedTenant,
          actor: actorUserId
            ? { userId: actorUserId }
            : { ref: 'SUPPORT_OPERATOR' },
          action: 'ONBOARDING_ACTIVATION_SUPPORT_OVERRIDE',
          targetType: 'ActivationAttempt',
          targetId: attempt.id,
          changes: {
            overrideAction: dto.overrideAction,
            reason,
            evidenceRef: dto.evidenceRef || null,
            notes: dto.notes || null,
          },
        },
        manager,
      );

      return {
        attempt,
        closedFollowUpsCount,
      };
    });
  }

  /**
   * ONB1.7F — Activation Diagnostic Controls
   * Compiles exhaustive diagnostic snapshot for troubleshooting & auditing.
   */
  async getActivationDiagnostics(
    tenantId: string,
    attemptId: string,
  ): Promise<ActivationDiagnosticsDto> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('tenantId is required');
    }

    return this.runTenantBound(
      trimmedTenant,
      async (manager: EntityManager) => {
        const attemptRepo = manager.getRepository(ActivationAttempt);
        const checkRepo = manager.getRepository(ActivationCheckResult);
        const followUpRepo = manager.getRepository(ActivationFollowUp);

        const attempt = await attemptRepo.findOne({
          where: { id: attemptId, tenantId: trimmedTenant },
        });

        if (!attempt) {
          throw new NotFoundException(
            `Activation attempt '${attemptId}' not found for tenant '${trimmedTenant}'`,
          );
        }

        const session = await manager.getRepository(OnboardingSession).findOne({
          where: { tenantId: trimmedTenant },
        });

        if (!session) {
          throw new NotFoundException(
            `Onboarding session not found for tenant '${trimmedTenant}'`,
          );
        }

        const recordedChecks = await checkRepo.find({
          where: { tenantId: trimmedTenant, activationAttemptId: attempt.id },
        });

        const checkMap = new Map<ActivationCheckCode, ActivationCheckResult>();
        for (const chk of recordedChecks) {
          checkMap.set(chk.checkCode, chk);
        }

        const checksMatrix: ActivationCheckDiagnosticItem[] = [];
        const missingChecks: ActivationCheckCode[] = [];

        for (const requiredCode of V1_REQUIRED_ACTIVATION_CHECKS) {
          const recorded = checkMap.get(requiredCode);
          if (recorded) {
            checksMatrix.push({
              checkCode: requiredCode,
              status: recorded.status,
              required: recorded.required,
              isMissing: false,
              recordedAt: recorded.recordedAt,
              occurredAt: recorded.occurredAt,
              evidenceType: recorded.evidenceType,
              evidenceRef: recorded.evidenceRef,
              detailsSanitizedJson: recorded.detailsSanitizedJson,
            });
          } else {
            missingChecks.push(requiredCode);
            checksMatrix.push({
              checkCode: requiredCode,
              status: 'MISSING',
              required: true,
              isMissing: true,
            });
          }
        }

        const followUps = await followUpRepo.find({
          where: { tenantId: trimmedTenant, activationAttemptId: attempt.id },
          order: { openedAt: 'ASC' },
        });

        const readiness = await this.readinessEvaluator.evaluate(trimmedTenant);

        let auditTrail: ChangeLog[] = [];
        try {
          // Issue #512 slice 7: the read rides the tenant-bound transaction
          // manager this diagnostic already runs inside.
          auditTrail = await this.changeLogService.findByTarget(
            trimmedTenant,
            'ActivationAttempt',
            attempt.id,
            manager,
          );
        } catch {
          // Table not present or query error; ignore
        }

        return {
          tenantId: trimmedTenant,
          attempt: {
            id: attempt.id,
            status: attempt.status,
            candidateTerminalId: attempt.candidateTerminalId,
            trustedTerminalId: attempt.trustedTerminalId,
            verificationTicketId: attempt.verificationTicketId,
            requiredFiscalRevision: attempt.requiredFiscalRevision,
            requiredFiscalFingerprint: attempt.requiredFiscalFingerprint,
            verificationProductId: attempt.verificationProductId,
            verificationProductRevision: attempt.verificationProductRevision,
            startedAt: attempt.startedAt,
            completedAt: attempt.completedAt,
            failureCode: attempt.failureCode,
            warningsCount: attempt.warningsCount,
          },
          session: {
            id: session.id,
            lifecycleState: session.lifecycleState,
            activatedAt: session.activatedAt,
            saleReadyFirstAt: session.saleReadyFirstAt,
          },
          checksMatrix,
          missingChecks,
          followUps: followUps.map((f) => ({
            id: f.id,
            warningCode: f.warningCode,
            status: f.status,
            openedAt: f.openedAt,
            openedBy: f.openedBy,
            closureEvidenceRef: f.closureEvidenceRef,
            closedAt: f.closedAt,
            closedBy: f.closedBy,
            closureNote: f.closureNote,
          })),
          readiness: {
            saleReady: readiness.saleReady,
            blockers: readiness.blockers,
            warnings: readiness.warnings,
          },
          auditTrail: auditTrail.map((a) => ({
            action: a.action,
            targetType: a.target_type,
            targetId: a.target_id,
            userId: a.user_id,
            createdAt: a.created_at,
            changes: a.changes,
          })),
        };
      },
    );
  }

  /**
   * Reads the persisted provisioning slug for the tenant (issue #556 slice
   * 11, OD-03). `tenants` is a global (non-RLS) table; the slug is the
   * stable provisioning identifier the POS stores for the stage-2 optional
   * cloud login context. It is NOT recomputed from the display name: a
   * tenant rename leaves the slug stable by design.
   */
  private async readPersistedTenantSlug(tenantId: string): Promise<string> {
    const rows: unknown = await this.dataSource.query(
      'SELECT slug FROM tenants WHERE id = $1',
      [tenantId],
    );
    const firstRow: unknown = Array.isArray(rows)
      ? (rows as unknown[])[0]
      : undefined;
    const slug =
      firstRow && typeof (firstRow as Record<string, unknown>).slug === 'string'
        ? (firstRow as { slug: string }).slug
        : undefined;
    if (!slug) {
      throw new NotFoundException(
        `Tenant '${tenantId}' has no provisioning slug`,
      );
    }
    return slug;
  }

  /**
   * DSI-3: Provisions device sync credentials for a PASS or PASS_WITH_WARNING ActivationAttempt.
   *
   * Security & Canonical Identity Rules:
   * 1. Tenant authority is strictly scoped to the authenticated human caller session.
   * 2. Canonical device is ActivationAttempt.trustedTerminalId, which must match candidate terminal evidence.
   * 3. Where topology authority exists for the tenant, canonical device must match an entry in devices[].deviceId.
   * 4. Delegates atomic generation and PROVISIONED event logging to DeviceSyncCredentialService.
   * 5. Never serializes renewalSecretHash or entity internals in the response.
   */
  async provisionDeviceCredential(
    tenantId: string,
    attemptId: string,
  ): Promise<DeviceSyncCredentialResponseDto> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('tenantId is required');
    }
    const trimmedAttemptId = attemptId?.trim();
    if (!trimmedAttemptId) {
      throw new BadRequestException('attemptId is required');
    }

    const attempt = await this.runTenantBound(trimmedTenant, (manager) =>
      manager.getRepository(ActivationAttempt).findOne({
        where: { id: trimmedAttemptId, tenantId: trimmedTenant },
      }),
    );

    if (!attempt) {
      throw new NotFoundException(
        `Activation attempt '${trimmedAttemptId}' not found for tenant '${trimmedTenant}'`,
      );
    }

    if (
      attempt.status !== ActivationAttemptStatus.PASS &&
      attempt.status !== ActivationAttemptStatus.PASS_WITH_WARNING
    ) {
      throw new BadRequestException(
        `Activation attempt must be PASS or PASS_WITH_WARNING to provision credentials (current status: ${attempt.status})`,
      );
    }

    const canonicalDeviceId = attempt.trustedTerminalId?.trim();
    if (!canonicalDeviceId) {
      throw new BadRequestException(
        'Activation attempt has no canonical device identity (trustedTerminalId is null or empty)',
      );
    }

    const candidateDeviceId = attempt.candidateTerminalId?.trim();
    if (candidateDeviceId && candidateDeviceId !== canonicalDeviceId) {
      throw new BadRequestException(
        `Canonical device identity '${canonicalDeviceId}' does not match candidate terminal evidence '${candidateDeviceId}'`,
      );
    }

    // Canonical tenant topology check where topology authority exists
    if (this.tenantTopologyRevisionService) {
      const topologyState =
        await this.tenantTopologyRevisionService.current(trimmedTenant);
      if (topologyState?.provisioned && topologyState.topology) {
        const topologyObj = topologyState.topology;
        const rawDevices = topologyObj.devices;
        const matchesTopology =
          Array.isArray(rawDevices) &&
          rawDevices.some((d: unknown) => {
            if (typeof d === 'object' && d !== null && 'deviceId' in d) {
              const dev = d as { deviceId?: unknown };
              return (
                typeof dev.deviceId === 'string' &&
                dev.deviceId.trim() === canonicalDeviceId
              );
            }
            return false;
          });
        if (!matchesTopology) {
          throw new BadRequestException(
            `Latest tenant topology does not contain canonical device '${canonicalDeviceId}'`,
          );
        }
      }
    }

    if (!this.deviceSyncCredentialService) {
      throw new BadRequestException(
        'Device sync credential service is not available',
      );
    }

    const result = await this.deviceSyncCredentialService.provisionCredential({
      tenantId: trimmedTenant,
      activationAttemptId: attempt.id,
    });

    return {
      credentialId: result.credential.id,
      tenantId: result.credential.tenantId,
      slug: await this.readPersistedTenantSlug(trimmedTenant),
      deviceId: canonicalDeviceId,
      scopes: [...result.credential.scopes],
      credentialVersion: result.credential.version,
      renewalSecret: result.renewalSecret,
      renewalCredentialExpiresAt: result.credential.expiresAt.toISOString(),
      status: result.credential.status,
    };
  }

  async confirmDeviceCredential(
    tenantId: string,
    attemptId: string,
    dto: ConfirmDeviceSyncCredentialDto,
  ): Promise<DeviceSyncCredentialResponseDto> {
    const trimmedTenant = tenantId?.trim();
    const trimmedAttemptId = attemptId?.trim();

    if (!trimmedTenant || !trimmedAttemptId) {
      throw new BadRequestException('tenantId and attemptId are required');
    }

    const attempt = await this.runTenantBound(trimmedTenant, (manager) =>
      manager.getRepository(ActivationAttempt).findOne({
        where: {
          id: trimmedAttemptId,
          tenantId: trimmedTenant,
        },
      }),
    );

    if (!attempt) {
      throw new NotFoundException(
        `Activation attempt '${trimmedAttemptId}' not found for tenant '${trimmedTenant}'`,
      );
    }

    if (
      attempt.status !== ActivationAttemptStatus.PASS &&
      attempt.status !== ActivationAttemptStatus.PASS_WITH_WARNING
    ) {
      throw new BadRequestException(
        `Activation attempt must be PASS or PASS_WITH_WARNING to confirm credentials (current status: ${attempt.status})`,
      );
    }

    const canonicalDeviceId = attempt.trustedTerminalId?.trim();
    if (!canonicalDeviceId) {
      throw new BadRequestException(
        'Activation attempt has no canonical device identity (trustedTerminalId is null or empty)',
      );
    }

    const candidateId = attempt.candidateTerminalId?.trim();
    if (candidateId && candidateId !== canonicalDeviceId) {
      throw new BadRequestException(
        `Canonical trustedTerminalId '${canonicalDeviceId}' does not match candidateTerminalId '${candidateId}'`,
      );
    }

    if (dto.deviceId?.trim() !== canonicalDeviceId) {
      throw new BadRequestException(
        `Declared device '${dto.deviceId}' does not match canonical device '${canonicalDeviceId}'`,
      );
    }

    if (this.tenantTopologyRevisionService) {
      const topologyState =
        await this.tenantTopologyRevisionService.current(trimmedTenant);
      if (topologyState?.provisioned && topologyState.topology) {
        const topologyObj = topologyState.topology;
        const rawDevices = topologyObj.devices;
        const matchesTopology =
          Array.isArray(rawDevices) &&
          rawDevices.some((d: unknown) => {
            if (typeof d === 'object' && d !== null && 'deviceId' in d) {
              const dev = d as { deviceId?: unknown };
              return (
                typeof dev.deviceId === 'string' &&
                dev.deviceId.trim() === canonicalDeviceId
              );
            }
            return false;
          });
        if (!matchesTopology) {
          throw new BadRequestException(
            `Latest tenant topology does not contain canonical device '${canonicalDeviceId}'`,
          );
        }
      }
    }

    if (!this.deviceSyncCredentialService) {
      throw new BadRequestException(
        'Device sync credential service is not available',
      );
    }

    const confirmed = await this.deviceSyncCredentialService.confirmCredential({
      tenantId: trimmedTenant,
      activationAttemptId: attempt.id,
      credentialId: dto.credentialId,
      credentialVersion: dto.credentialVersion,
      renewalSecret: dto.renewalSecret,
      canonicalDeviceId,
    });

    return {
      credentialId: confirmed.id,
      tenantId: confirmed.tenantId,
      slug: await this.readPersistedTenantSlug(trimmedTenant),
      deviceId: canonicalDeviceId,
      scopes: [...confirmed.scopes],
      credentialVersion: confirmed.version,
      renewalCredentialExpiresAt: confirmed.expiresAt.toISOString(),
      status: confirmed.status,
    };
  }

  /**
   * Resolves the latest finalized PASS or PASS_WITH_WARNING ActivationAttempt
   * for a given tenant and canonical device ID.
   * Rejects when no finalized attempt is found.
   */
  async resolveLatestFinalizedAttemptForDevice(
    tenantId: string,
    deviceId: string,
  ): Promise<ActivationAttempt> {
    const trimmedTenant = tenantId?.trim();
    const trimmedDevice = deviceId?.trim();

    if (!trimmedTenant) {
      throw new BadRequestException('tenantId is required');
    }
    if (!trimmedDevice) {
      throw new BadRequestException('deviceId is required');
    }

    const attempt = await this.runTenantBound(trimmedTenant, (manager) =>
      manager.getRepository(ActivationAttempt).findOne({
        where: {
          tenantId: trimmedTenant,
          trustedTerminalId: trimmedDevice,
          status: In([
            ActivationAttemptStatus.PASS,
            ActivationAttemptStatus.PASS_WITH_WARNING,
          ]),
        },
        order: {
          completedAt: 'DESC',
          startedAt: 'DESC',
        },
      }),
    );

    if (!attempt) {
      throw new NotFoundException(
        `No finalized activation attempt found for device '${trimmedDevice}' in tenant '${trimmedTenant}'`,
      );
    }

    return attempt;
  }

  /**
   * Bootstrap provisioning endpoint helper: resolves latest finalized attempt
   * for (tenantId, deviceId) and delegates to provisionDeviceCredential.
   */
  async provisionBootstrapDeviceCredential(
    tenantId: string,
    deviceId: string,
  ): Promise<DeviceSyncCredentialResponseDto> {
    const attempt = await this.resolveLatestFinalizedAttemptForDevice(
      tenantId,
      deviceId,
    );
    return this.provisionDeviceCredential(tenantId, attempt.id);
  }

  /**
   * Bootstrap confirm endpoint helper: resolves latest finalized attempt
   * for (tenantId, dto.deviceId) and delegates to confirmDeviceCredential.
   */
  async confirmBootstrapDeviceCredential(
    tenantId: string,
    dto: ConfirmDeviceSyncCredentialDto,
  ): Promise<DeviceSyncCredentialResponseDto> {
    const attempt = await this.resolveLatestFinalizedAttemptForDevice(
      tenantId,
      dto.deviceId,
    );
    return this.confirmDeviceCredential(tenantId, attempt.id, dto);
  }
}
