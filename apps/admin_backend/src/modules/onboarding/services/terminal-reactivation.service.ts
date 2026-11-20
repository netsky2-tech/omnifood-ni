import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, MoreThan } from 'typeorm';
import {
  bindTenantContext,
  runInTenantTransaction,
} from '../../../core/database/tenant-transaction';
import { ChangeLogService } from '../../audit/change-log.service';
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
} from '../../identity/entities/device-sync-credential.entity';
import { DeviceSyncCredentialService } from '../../identity/services/device-sync-credential.service';
import { Tenant } from '../../tenant/entities/tenant.entity';
import {
  CompleteReactivationDto,
  ConfirmReactivationCredentialDto,
  InitiateTerminalReactivationDto,
  ReactivationInitiationMode,
} from '../dto/terminal-reactivation.dto';
import { TerminalInstallFingerprint } from '../entities/terminal-install-fingerprint.entity';
import {
  ReactivationApprovalMethod,
  ReactivationChallengeStatus,
  ReactivationReason,
  TerminalReactivationChallenge,
} from '../entities/terminal-reactivation-challenge.entity';
import { TerminalRecoveryCode } from '../entities/terminal-recovery-code.entity';
import {
  asQueryRows,
  DeviceLinkingService,
  REACTIVATION_CHALLENGE_TTL_MS,
  UPSERT_TERMINAL_FINGERPRINT_SQL,
} from './device-linking.service';
import {
  DUMMY_RECOVERY_CODE_HASH,
  isValidUuid,
  issueRecoveryCodeInTransaction,
  normalizeHardwareFingerprint,
  verifyRecoveryCode,
} from '../utils/terminal-recovery-code';

export const DEVICE_LOOKUP_FLAG_SQL =
  "SELECT set_config('app.device_lookup', $1, true)";

export const LAST_SYNC_RECEIPT_SQL = `
  SELECT MAX(COALESCE(accepted_at, created_at)) AS last_sync_at
  FROM inventory_sync_receipts
  WHERE tenant_id = $1 AND source_device_id = $2 AND result_status = 'ACCEPTED'
`;

export interface DeviceLookupNotFoundResult {
  readonly found: false;
}

export interface DeviceLookupFoundResult {
  readonly found: true;
  readonly recoveryChallengeId: string;
  readonly status: ReactivationChallengeStatus;
  readonly maskedHint: string;
  readonly expiresAt: Date;
}

export type DeviceLookupResult =
  | DeviceLookupNotFoundResult
  | DeviceLookupFoundResult;

export interface ReactivationChallengeStatusResult {
  readonly status: ReactivationChallengeStatus;
  readonly expiresAt: Date;
}

export interface ActiveReactivationChallengeItem {
  readonly id: string;
  readonly terminalId: string;
  readonly terminalLabel: string;
  readonly status: ReactivationChallengeStatus;
  readonly reason: ReactivationReason;
  readonly approvalMethod: ReactivationApprovalMethod | null;
  readonly latestCredentialVersion: number | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface CompleteReactivationResult {
  readonly tenantId: string;
  readonly slug: string;
  readonly terminalId: string;
  readonly activationAttemptId: string;
  readonly credentialId: string;
  readonly version: number;
  readonly renewalSecret: string;
  readonly expiresAt: Date;
  readonly previousVersion: number;
}

export interface ConfirmReactivationCredentialResult {
  readonly credentialId: string;
  readonly version: number;
  readonly status: DeviceSyncCredentialStatus;
  readonly expiresAt: Date;
}

export type InitiateTerminalReactivationResult =
  | {
      readonly mode: 'factory_reset';
      readonly terminalId: string;
      readonly linkingCode: string;
      readonly expiresAt: Date;
    }
  | {
      readonly mode: 'challenge';
      readonly terminalId: string;
      readonly challenge: TerminalReactivationChallenge;
    };

export interface IssueRecoveryCodeResult {
  readonly terminalId: string;
  readonly recoveryCode: string;
  readonly issuedAt: Date;
}

/**
 * Masks a tenant display name so pre-auth hints recognize the business
 * without leaking the full name, slug, or tenant ID.
 * Example: "Café Central" -> "Ca*** Ce***"
 */
export function maskTenantName(rawName: string | null | undefined): string {
  const trimmed = rawName?.trim();
  if (!trimmed) {
    return 'Negocio ***';
  }
  return trimmed
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => {
      if (word.length <= 2) {
        return `${word[0]}***`;
      }
      return `${word.slice(0, 2)}***`;
    })
    .join(' ');
}

/**
 * Masks a terminal identifier so pre-auth hints never reveal the raw terminalId.
 */
export function maskTerminalLabel(terminalId: string): string {
  const trimmed = terminalId.trim();
  if (trimmed.length <= 4) {
    return '••••';
  }
  return `••••${trimmed.slice(-4)}`;
}

/**
 * Formats a timestamp in natural LATAM Spanish for the pre-auth masked hint.
 */
export function formatSpanishSyncDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes} UTC`;
}

/**
 * Builds the pre-auth Spanish masked hint without exposing tenantId, slug,
 * raw terminalId, or any credentials.
 */
export function buildMaskedReactivationHint(params: {
  readonly terminalId: string;
  readonly tenantName: string | null | undefined;
  readonly lastSyncAt: Date | null;
}): string {
  const maskedLabel = maskTerminalLabel(params.terminalId);
  const maskedTenant = maskTenantName(params.tenantName);
  const syncPart = params.lastSyncAt
    ? `última sincronización ${formatSpanishSyncDate(params.lastSyncAt)}`
    : 'sin sincronización reciente';
  return `Terminal «${maskedLabel}» — ${maskedTenant} — ${syncPart}`;
}

@Injectable()
export class TerminalReactivationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly deviceSyncCredentialService: DeviceSyncCredentialService,
    private readonly deviceLinkingService: DeviceLinkingService,
    private readonly changeLogService: ChangeLogService,
  ) {}

  private async findLatestCredentialForTerminal(
    manager: EntityManager,
    tenantId: string,
    terminalId: string,
  ): Promise<DeviceSyncCredential | null> {
    const credentials = await manager
      .getRepository(DeviceSyncCredential)
      .find({
        where: { tenantId },
        relations: ['activationAttempt'],
        order: { version: 'DESC', createdAt: 'DESC' },
      });
    const matched = credentials.find(
      (cred) => cred.activationAttempt?.trustedTerminalId?.trim() === terminalId,
    );
    return matched ?? null;
  }

  /**
   * PRE-AUTH device lookup by SHA-256 hardware fingerprint (#566).
   *
   * Privacy contract:
   * - Unknown fingerprint, missing credential, or deliberately REVOKED
   *   credential all return identical `{ found: false }` (HTTP 200).
   * - Eligible devices receive a masked Spanish hint that never contains
   *   tenantId, slug, raw terminalId, or any secret material.
   */
  async lookupDevice(hardwareFingerprint: string): Promise<DeviceLookupResult> {
    const normalizedFingerprint =
      normalizeHardwareFingerprint(hardwareFingerprint);

    return await this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.query(DEVICE_LOOKUP_FLAG_SQL, ['on']);

      const fpRepo = manager.getRepository(TerminalInstallFingerprint);
      const fingerprint = await fpRepo.findOne({
        where: { fingerprintHash: normalizedFingerprint },
        order: { lastSeenAt: 'DESC' },
      });

      if (!fingerprint) {
        return { found: false };
      }

      await bindTenantContext(manager, fingerprint.tenantId);

      const latestCredential = await this.findLatestCredentialForTerminal(
        manager,
        fingerprint.tenantId,
        fingerprint.terminalId,
      );

      if (
        !latestCredential ||
        (latestCredential.status !== DeviceSyncCredentialStatus.ACTIVE &&
          latestCredential.status !== DeviceSyncCredentialStatus.RETIRED)
      ) {
        // Deliberately revoked or never activated: identical privacy-preserving response.
        return { found: false };
      }

      const tenant = await manager.getRepository(Tenant).findOne({
        where: { id: fingerprint.tenantId },
      });

      let lastSyncAt: Date | null = null;
      try {
        const syncRows = asQueryRows<{ last_sync_at: string | Date | null }>(
          await manager.query(LAST_SYNC_RECEIPT_SQL, [
            fingerprint.tenantId,
            fingerprint.terminalId,
          ]),
        );
        const rawDate = syncRows[0]?.last_sync_at;
        if (rawDate) {
          lastSyncAt = rawDate instanceof Date ? rawDate : new Date(rawDate);
        }
      } catch {
        lastSyncAt = null;
      }

      const now = new Date();
      const challengeRepo = manager.getRepository(
        TerminalReactivationChallenge,
      );

      let challenge = await challengeRepo.findOne({
        where: {
          tenantId: fingerprint.tenantId,
          terminalId: fingerprint.terminalId,
          fingerprintHash: normalizedFingerprint,
          status: In([
            ReactivationChallengeStatus.PENDING,
            ReactivationChallengeStatus.APPROVED,
          ]),
          expiresAt: MoreThan(now),
        },
        order: { createdAt: 'DESC' },
      });

      if (!challenge) {
        challenge = challengeRepo.create({
          tenantId: fingerprint.tenantId,
          terminalId: fingerprint.terminalId,
          fingerprintHash: normalizedFingerprint,
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
          expiresAt: new Date(now.getTime() + REACTIVATION_CHALLENGE_TTL_MS),
        });
        challenge = await challengeRepo.save(challenge);
      }

      const maskedHint = buildMaskedReactivationHint({
        terminalId: fingerprint.terminalId,
        tenantName: tenant?.name,
        lastSyncAt,
      });

      return {
        found: true,
        recoveryChallengeId: challenge.id,
        status: challenge.status,
        maskedHint,
        expiresAt: challenge.expiresAt,
      };
    });
  }

  /**
   * PRE-AUTH poll of challenge status, bound to hardwareFingerprint so UUIDs
   * alone cannot be probed across devices.
   */
  async getChallengeStatus(
    challengeId: string,
    hardwareFingerprint: string,
  ): Promise<ReactivationChallengeStatusResult> {
    const normalizedFingerprint =
      normalizeHardwareFingerprint(hardwareFingerprint);

    return await this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.query(DEVICE_LOOKUP_FLAG_SQL, ['on']);

      const challengeRepo = manager.getRepository(
        TerminalReactivationChallenge,
      );
      const challenge = await challengeRepo.findOne({
        where: { id: challengeId },
      });

      if (!challenge) {
        throw new NotFoundException('Reactivation challenge not found');
      }

      if (
        challenge.fingerprintHash &&
        challenge.fingerprintHash !== normalizedFingerprint
      ) {
        throw new NotFoundException('Reactivation challenge not found');
      }

      const now = new Date();
      if (
        (challenge.status === ReactivationChallengeStatus.PENDING ||
          challenge.status === ReactivationChallengeStatus.APPROVED) &&
        challenge.expiresAt.getTime() <= now.getTime()
      ) {
        challenge.status = ReactivationChallengeStatus.EXPIRED;
        await challengeRepo.save(challenge);
      }

      return {
        status: challenge.status,
        expiresAt: challenge.expiresAt,
      };
    });
  }

  /**
   * HUMAN-AUTH: lists active (PENDING / APPROVED, non-expired) challenges for
   * the tenant, enriched with terminal label and latest credential version.
   */
  async listActiveChallenges(
    tenantId: string,
  ): Promise<ActiveReactivationChallengeItem[]> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Authorized tenant context is required');
    }

    return await runInTenantTransaction(
      this.dataSource,
      trimmedTenant,
      async (manager) => {
        const now = new Date();
        const challenges = await manager
          .getRepository(TerminalReactivationChallenge)
          .find({
            where: {
              tenantId: trimmedTenant,
              status: In([
                ReactivationChallengeStatus.PENDING,
                ReactivationChallengeStatus.APPROVED,
              ]),
              expiresAt: MoreThan(now),
            },
            order: { createdAt: 'DESC' },
          });

        if (challenges.length === 0) {
          return [];
        }

        const credentials = await manager
          .getRepository(DeviceSyncCredential)
          .find({
            where: { tenantId: trimmedTenant },
            relations: ['activationAttempt'],
            order: { version: 'DESC', createdAt: 'DESC' },
          });

        const latestVersionByTerminal = new Map<string, number>();
        for (const cred of credentials) {
          const termId = cred.activationAttempt?.trustedTerminalId?.trim();
          if (termId && !latestVersionByTerminal.has(termId)) {
            latestVersionByTerminal.set(termId, cred.version);
          }
        }

        return challenges.map((ch) => ({
          id: ch.id,
          terminalId: ch.terminalId,
          terminalLabel: ch.terminalId,
          status: ch.status,
          reason: ch.reason,
          approvalMethod: ch.approvalMethod,
          latestCredentialVersion:
            latestVersionByTerminal.get(ch.terminalId) ?? null,
          expiresAt: ch.expiresAt,
          createdAt: ch.createdAt,
        }));
      },
    );
  }

  /**
   * HUMAN-AUTH: approves a PENDING reactivation challenge from the dashboard.
   */
  async approveChallenge(
    tenantId: string,
    challengeId: string,
    actorUserId: string,
  ): Promise<TerminalReactivationChallenge> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Authorized tenant context is required');
    }

    const outcome = await runInTenantTransaction(
      this.dataSource,
      trimmedTenant,
      async (manager) => {
        const repo = manager.getRepository(TerminalReactivationChallenge);
        const challenge = await repo.findOne({
          where: { id: challengeId, tenantId: trimmedTenant },
        });

        if (!challenge) {
          throw new NotFoundException(
            `Reactivation challenge '${challengeId}' not found`,
          );
        }

        const now = new Date();
        if (challenge.expiresAt.getTime() <= now.getTime()) {
          if (
            challenge.status === ReactivationChallengeStatus.PENDING ||
            challenge.status === ReactivationChallengeStatus.APPROVED
          ) {
            challenge.status = ReactivationChallengeStatus.EXPIRED;
            await repo.save(challenge);
          }
          throw new ConflictException({
            code: 'REACTIVATION_CHALLENGE_EXPIRED',
            message: 'La solicitud de reactivación ha expirado',
          });
        }

        if (challenge.status === ReactivationChallengeStatus.APPROVED) {
          return { challenge, changed: false };
        }

        if (challenge.status !== ReactivationChallengeStatus.PENDING) {
          throw new ConflictException(
            `Cannot approve challenge in status '${challenge.status}'`,
          );
        }

        challenge.status = ReactivationChallengeStatus.APPROVED;
        challenge.approvalMethod = ReactivationApprovalMethod.DASHBOARD;
        challenge.approvedByUserId = isValidUuid(actorUserId)
          ? actorUserId.trim()
          : null;
        challenge.approvedAt = now;

        const saved = await repo.save(challenge);
        return { challenge: saved, changed: true };
      },
    );

    if (outcome.changed) {
      await this.changeLogService.log({
        tenantId: trimmedTenant,
        actor: actorUserId ? { userId: actorUserId } : { ref: 'SYSTEM' },
        action: 'TERMINAL_REACTIVATION_APPROVED',
        targetType: 'TerminalReactivationChallenge',
        targetId: outcome.challenge.id,
        changes: {
          terminalId: outcome.challenge.terminalId,
          reason: outcome.challenge.reason,
          approvalMethod: outcome.challenge.approvalMethod,
        },
      });
    }

    return outcome.challenge;
  }

  /**
   * HUMAN-AUTH: cancels a PENDING or APPROVED reactivation challenge.
   */
  async cancelChallenge(
    tenantId: string,
    challengeId: string,
    actorUserId: string,
  ): Promise<TerminalReactivationChallenge> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Authorized tenant context is required');
    }

    const outcome = await runInTenantTransaction(
      this.dataSource,
      trimmedTenant,
      async (manager) => {
        const repo = manager.getRepository(TerminalReactivationChallenge);
        const challenge = await repo.findOne({
          where: { id: challengeId, tenantId: trimmedTenant },
        });

        if (!challenge) {
          throw new NotFoundException(
            `Reactivation challenge '${challengeId}' not found`,
          );
        }

        if (challenge.status === ReactivationChallengeStatus.CANCELLED) {
          return { challenge, changed: false };
        }

        if (
          challenge.status !== ReactivationChallengeStatus.PENDING &&
          challenge.status !== ReactivationChallengeStatus.APPROVED
        ) {
          throw new ConflictException(
            `Cannot cancel challenge in status '${challenge.status}'`,
          );
        }

        challenge.status = ReactivationChallengeStatus.CANCELLED;
        const saved = await repo.save(challenge);
        return { challenge: saved, changed: true };
      },
    );

    if (outcome.changed) {
      await this.changeLogService.log({
        tenantId: trimmedTenant,
        actor: actorUserId ? { userId: actorUserId } : { ref: 'SYSTEM' },
        action: 'TERMINAL_REACTIVATION_CANCELLED',
        targetType: 'TerminalReactivationChallenge',
        targetId: outcome.challenge.id,
        changes: {
          terminalId: outcome.challenge.terminalId,
        },
      });
    }

    return outcome.challenge;
  }

  /**
   * HUMAN-AUTH: dashboard-initiated reactivation for an existing terminal.
   *
   * - `mode === 'factory_reset'` (or default when `reason === 'replaced'`):
   *   Generates a 6-character linking code bound to `replacesTerminalId` so
   *   the wiped device preserves the exact `terminalId`, registers its new
   *   hardware fingerprint, and receives an auto-approved challenge.
   * - `mode === 'challenge'`:
   *   Approves any existing PENDING challenge for `terminalId` or creates a
   *   fresh APPROVED challenge ready for the device.
   */
  async initiateTerminalReactivation(
    tenantId: string,
    terminalId: string,
    actorUserId: string,
    dto: InitiateTerminalReactivationDto,
  ): Promise<InitiateTerminalReactivationResult> {
    const trimmedTenant = tenantId?.trim();
    const trimmedTerminal = terminalId?.trim();
    if (!trimmedTenant || !trimmedTerminal) {
      throw new BadRequestException(
        'Tenant context and terminalId are required',
      );
    }

    const effectiveMode: ReactivationInitiationMode =
      dto.mode ??
      (dto.reason === ReactivationReason.REPLACED
        ? 'factory_reset'
        : 'challenge');

    if (effectiveMode === 'factory_reset') {
      const linkingResult =
        await this.deviceLinkingService.generateLinkingCode(
          trimmedTenant,
          actorUserId,
          { replacesTerminalId: trimmedTerminal },
        );

      await this.changeLogService.log({
        tenantId: trimmedTenant,
        actor: actorUserId ? { userId: actorUserId } : { ref: 'SYSTEM' },
        action: 'TERMINAL_FACTORY_RESET_LINKING_CODE_ISSUED',
        targetType: 'Terminal',
        targetId: isValidUuid(trimmedTerminal)
          ? trimmedTerminal
          : trimmedTenant,
        changes: {
          terminalId: trimmedTerminal,
          reason: dto.reason,
          mode: effectiveMode,
          expiresAt: linkingResult.expiresAt,
        },
      });

      return {
        mode: 'factory_reset',
        terminalId: trimmedTerminal,
        linkingCode: linkingResult.code,
        expiresAt: linkingResult.expiresAt,
      };
    }

    const challenge = await runInTenantTransaction(
      this.dataSource,
      trimmedTenant,
      async (manager) => {
        const latestCredential = await this.findLatestCredentialForTerminal(
          manager,
          trimmedTenant,
          trimmedTerminal,
        );
        if (!latestCredential) {
          throw new NotFoundException(
            `Terminal '${trimmedTerminal}' has no existing credential`,
          );
        }
        if (latestCredential.status === DeviceSyncCredentialStatus.REVOKED) {
          throw new ConflictException({
            code: 'TERMINAL_CREDENTIAL_REVOKED',
            message: 'Revoked terminal credential cannot be reactivated',
          });
        }

        const now = new Date();
        const challengeRepo = manager.getRepository(
          TerminalReactivationChallenge,
        );
        const approvedByUserId = isValidUuid(actorUserId)
          ? actorUserId.trim()
          : null;

        const existingPending = await challengeRepo.findOne({
          where: {
            tenantId: trimmedTenant,
            terminalId: trimmedTerminal,
            status: ReactivationChallengeStatus.PENDING,
            expiresAt: MoreThan(now),
          },
          order: { createdAt: 'DESC' },
        });

        if (existingPending) {
          existingPending.status = ReactivationChallengeStatus.APPROVED;
          existingPending.reason = dto.reason;
          existingPending.approvalMethod = ReactivationApprovalMethod.DASHBOARD;
          existingPending.approvedByUserId = approvedByUserId;
          existingPending.approvedAt = now;
          return await challengeRepo.save(existingPending);
        }

        const latestFp = await manager
          .getRepository(TerminalInstallFingerprint)
          .findOne({
            where: { tenantId: trimmedTenant, terminalId: trimmedTerminal },
            order: { lastSeenAt: 'DESC' },
          });

        const created = challengeRepo.create({
          tenantId: trimmedTenant,
          terminalId: trimmedTerminal,
          fingerprintHash: latestFp?.fingerprintHash ?? null,
          status: ReactivationChallengeStatus.APPROVED,
          reason: dto.reason,
          approvalMethod: ReactivationApprovalMethod.DASHBOARD,
          approvedByUserId,
          approvedAt: now,
          completedAt: null,
          previousCredentialId: null,
          previousCredentialVersion: null,
          newCredentialId: null,
          newCredentialVersion: null,
          expiresAt: new Date(now.getTime() + REACTIVATION_CHALLENGE_TTL_MS),
        });
        return await challengeRepo.save(created);
      },
    );

    await this.changeLogService.log({
      tenantId: trimmedTenant,
      actor: actorUserId ? { userId: actorUserId } : { ref: 'SYSTEM' },
      action: 'TERMINAL_REACTIVATION_INITIATED',
      targetType: 'TerminalReactivationChallenge',
      targetId: challenge.id,
      changes: {
        terminalId: trimmedTerminal,
        reason: dto.reason,
        mode: effectiveMode,
      },
    });

    return {
      mode: 'challenge',
      terminalId: trimmedTerminal,
      challenge,
    };
  }

  /**
   * HUMAN-AUTH: rotates/reissues a one-time 6-digit recovery code for an
   * existing terminal.
   */
  async issueRecoveryCode(
    tenantId: string,
    terminalId: string,
    actorUserId: string,
  ): Promise<IssueRecoveryCodeResult> {
    const trimmedTenant = tenantId?.trim();
    const trimmedTerminal = terminalId?.trim();
    if (!trimmedTenant || !trimmedTerminal) {
      throw new BadRequestException(
        'Tenant context and terminalId are required',
      );
    }

    const issued = await runInTenantTransaction(
      this.dataSource,
      trimmedTenant,
      async (manager) => {
        const latestCredential = await this.findLatestCredentialForTerminal(
          manager,
          trimmedTenant,
          trimmedTerminal,
        );
        if (!latestCredential) {
          throw new NotFoundException(
            `Terminal '${trimmedTerminal}' has no existing credential`,
          );
        }
        return await issueRecoveryCodeInTransaction(manager, {
          tenantId: trimmedTenant,
          terminalId: trimmedTerminal,
          activationAttemptId: latestCredential.activationAttemptId,
        });
      },
    );

    await this.changeLogService.log({
      tenantId: trimmedTenant,
      actor: actorUserId ? { userId: actorUserId } : { ref: 'SYSTEM' },
      action: 'TERMINAL_RECOVERY_CODE_ISSUED',
      targetType: 'TerminalRecoveryCode',
      targetId: issued.record.id,
      changes: {
        terminalId: trimmedTerminal,
      },
    });

    return {
      terminalId: trimmedTerminal,
      recoveryCode: issued.recoveryCode,
      issuedAt: issued.record.issuedAt,
    };
  }

  /**
   * PRE-AUTH: completes a human-approved reactivation challenge and rotates
   * the terminal's sync credential in place (`version + 1`) without creating a
   * new terminal, touching `onboarding_sessions`, or resetting fiscal sequences.
   */
  async completeReactivation(
    challengeId: string,
    dto: CompleteReactivationDto,
  ): Promise<CompleteReactivationResult> {
    const normalizedFingerprint = normalizeHardwareFingerprint(
      dto.hardwareFingerprint,
    );

    return await this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.query(DEVICE_LOOKUP_FLAG_SQL, ['on']);

      const challengeRepo = manager.getRepository(
        TerminalReactivationChallenge,
      );
      const challenge = await challengeRepo.findOne({
        where: { id: challengeId },
      });

      if (!challenge) {
        throw new NotFoundException('Reactivation challenge not found');
      }

      if (
        challenge.status === ReactivationChallengeStatus.COMPLETED ||
        challenge.status === ReactivationChallengeStatus.CANCELLED ||
        challenge.status === ReactivationChallengeStatus.EXPIRED
      ) {
        throw new ConflictException(
          `Reactivation challenge is already ${challenge.status.toLowerCase()}`,
        );
      }

      const now = new Date();
      if (challenge.expiresAt.getTime() <= now.getTime()) {
        challenge.status = ReactivationChallengeStatus.EXPIRED;
        await challengeRepo.save(challenge);
        throw new ConflictException({
          code: 'REACTIVATION_CHALLENGE_EXPIRED',
          message: 'La solicitud de reactivación ha expirado',
        });
      }

      if (
        challenge.fingerprintHash &&
        challenge.fingerprintHash !== normalizedFingerprint
      ) {
        throw new ForbiddenException({
          code: 'HARDWARE_FINGERPRINT_MISMATCH',
          message: 'La huella del dispositivo no coincide con la solicitud',
        });
      }

      await bindTenantContext(manager, challenge.tenantId);

      // Human approval gate: must be APPROVED via Dashboard OR accompanied by
      // a valid one-time 6-digit recovery code.
      if (challenge.status === ReactivationChallengeStatus.APPROVED) {
        // Already approved from dashboard.
      } else if (
        challenge.status === ReactivationChallengeStatus.PENDING &&
        dto.recoveryCode?.trim()
      ) {
        const recoveryRepo = manager.getRepository(TerminalRecoveryCode);
        const activeCode = await recoveryRepo.findOne({
          where: {
            tenantId: challenge.tenantId,
            terminalId: challenge.terminalId,
            usedAt: IsNull(),
            revokedAt: IsNull(),
          },
          order: { issuedAt: 'DESC' },
        });

        const candidateCode = dto.recoveryCode.trim();
        const isValid = activeCode
          ? await verifyRecoveryCode(candidateCode, activeCode.codeHash)
          : await verifyRecoveryCode(candidateCode, DUMMY_RECOVERY_CODE_HASH).then(
              () => false,
            );

        if (!isValid || !activeCode) {
          throw new ForbiddenException({
            code: 'INVALID_RECOVERY_CODE',
            message: 'Código de recuperación inválido o ya utilizado',
          });
        }

        activeCode.usedAt = now;
        await recoveryRepo.save(activeCode);

        challenge.approvalMethod = ReactivationApprovalMethod.RECOVERY_CODE;
        challenge.approvedAt = now;
      } else {
        throw new ForbiddenException({
          code: 'REACTIVATION_APPROVAL_REQUIRED',
          message:
            'Se requiere aprobación desde el panel o un código de recuperación',
        });
      }

      const latestCredential = await this.findLatestCredentialForTerminal(
        manager,
        challenge.tenantId,
        challenge.terminalId,
      );

      if (!latestCredential) {
        throw new NotFoundException({
          code: 'TERMINAL_CREDENTIAL_NOT_FOUND',
          message: 'No se encontró una credencial previa para esta terminal',
        });
      }

      if (latestCredential.status === DeviceSyncCredentialStatus.REVOKED) {
        throw new ConflictException({
          code: 'TERMINAL_CREDENTIAL_REVOKED',
          message: 'Revoked terminal credential cannot be reactivated',
        });
      }

      const rotated =
        await this.deviceSyncCredentialService.rotateCredentialForReactivation(
          manager,
          {
            tenantId: challenge.tenantId,
            activationAttemptId: latestCredential.activationAttemptId,
            previousCredentialId: latestCredential.id,
            reason: challenge.reason,
            approvedByUserId: challenge.approvedByUserId,
            approvalMethod:
              challenge.approvalMethod ?? ReactivationApprovalMethod.DASHBOARD,
            challengeId: challenge.id,
            canonicalDeviceId: challenge.terminalId,
          },
        );

      await manager.query(UPSERT_TERMINAL_FINGERPRINT_SQL, [
        challenge.tenantId,
        challenge.terminalId,
        normalizedFingerprint,
      ]);

      challenge.status = ReactivationChallengeStatus.COMPLETED;
      challenge.completedAt = now;
      challenge.fingerprintHash = normalizedFingerprint;
      challenge.previousCredentialId = latestCredential.id;
      challenge.previousCredentialVersion = rotated.previousVersion;
      challenge.newCredentialId = rotated.credential.id;
      challenge.newCredentialVersion = rotated.credential.version;
      await challengeRepo.save(challenge);

      const tenant = await manager.getRepository(Tenant).findOne({
        where: { id: challenge.tenantId },
      });
      if (!tenant?.slug) {
        throw new NotFoundException('Tenant slug not found');
      }

      return {
        tenantId: challenge.tenantId,
        slug: tenant.slug,
        terminalId: challenge.terminalId,
        activationAttemptId: latestCredential.activationAttemptId,
        credentialId: rotated.credential.id,
        version: rotated.credential.version,
        renewalSecret: rotated.renewalSecret,
        expiresAt: rotated.credential.expiresAt,
        previousVersion: rotated.previousVersion,
      };
    });
  }

  /**
   * PRE-AUTH: confirms a rotated PENDING credential issued by a COMPLETED
   * reactivation challenge, transitioning it to ACTIVE without requiring an
   * owner JWT on the POS.
   */
  async confirmReactivationCredential(
    challengeId: string,
    dto: ConfirmReactivationCredentialDto,
  ): Promise<ConfirmReactivationCredentialResult> {
    const context = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        await manager.query(DEVICE_LOOKUP_FLAG_SQL, ['on']);

        const challenge = await manager
          .getRepository(TerminalReactivationChallenge)
          .findOne({ where: { id: challengeId } });

        if (
          !challenge ||
          challenge.status !== ReactivationChallengeStatus.COMPLETED ||
          challenge.newCredentialId !== dto.credentialId ||
          challenge.newCredentialVersion !== dto.version
        ) {
          throw new NotFoundException(
            'Completed reactivation challenge for credential not found',
          );
        }

        await bindTenantContext(manager, challenge.tenantId);

        const credential = await manager
          .getRepository(DeviceSyncCredential)
          .findOne({
            where: {
              id: dto.credentialId,
              tenantId: challenge.tenantId,
            },
          });

        if (!credential) {
          throw new NotFoundException('Rotated device credential not found');
        }

        return {
          tenantId: challenge.tenantId,
          terminalId: challenge.terminalId,
          activationAttemptId: credential.activationAttemptId,
        };
      },
    );

    const confirmed = await this.deviceSyncCredentialService.confirmCredential({
      tenantId: context.tenantId,
      activationAttemptId: context.activationAttemptId,
      credentialId: dto.credentialId,
      credentialVersion: dto.version,
      renewalSecret: dto.renewalSecret,
      canonicalDeviceId: context.terminalId,
    });

    return {
      credentialId: confirmed.id,
      version: confirmed.version,
      status: confirmed.status,
      expiresAt: confirmed.expiresAt,
    };
  }
}
