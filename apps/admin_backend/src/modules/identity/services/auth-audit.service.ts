import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AuditLog } from '../entities/audit-log.entity';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

/**
 * Device id used for the auth-event chain. The audit hash chain is windowed
 * per (tenant_id, device_id, user_id); auth events chain beside the existing
 * WEB_ADMIN user-lifecycle events.
 */
export const AUTH_AUDIT_DEVICE = 'WEB_ADMIN';

/** Structured reasons kept generic on purpose (never credential material). */
export const LoginAuditReason = {
  UNKNOWN_TENANT: 'unknown_tenant',
  UNKNOWN_USER: 'unknown_user',
  INACTIVE_USER: 'inactive_user',
  CROSS_TENANT_USER: 'cross_tenant_user',
  WRONG_PASSWORD: 'wrong_password',
  INVALID_REFRESH: 'invalid_refresh',
  REUSED_REFRESH: 'reused_refresh_token',
} as const;
export type LoginAuditReason =
  (typeof LoginAuditReason)[keyof typeof LoginAuditReason];

export type AuthAuditAction =
  'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'REFRESH_SUCCESS' | 'REFRESH_FAILURE';

interface AuthFailureInput {
  action: Extract<AuthAuditAction, 'LOGIN_FAILURE' | 'REFRESH_FAILURE'>;
  /** Resolved tenant id, or null when the request had no tenant anchor. */
  tenantId: string | null;
  /** Identified user id, or null when no user row was resolved. */
  userId: string | null;
  /** Account identifier for the log line / metadata (never secrets). */
  email?: string;
  /** Structured failure reason (see {@link LoginAuditReason}). */
  reason: string;
  /** Caller-supplied extra metadata; credential material is stripped. */
  pass?: string;
}

/**
 * Records authentication events on the hash-chained audit log.
 *
 * Why: logins and refreshes were the only security-relevant events with no
 * audit trail (security audit remediation S4). Events anchor to a tenant and
 * a user row, so failures before either is resolved (unknown slug, unknown
 * email) cannot be written to the tenant-scoped table and are emitted to the
 * application log instead — the response to the client stays generic either
 * way.
 *
 * Audit writes are best-effort for availability: a failing audit sink must
 * never prevent or corrupt the auth flow itself, so write errors are logged
 * and swallowed.
 */
@Injectable()
export class AuthAuditService {
  private readonly logger = new Logger(AuthAuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    private readonly dataSource: DataSource,
  ) {}

  /** Successful human login. Call inside the login transaction when possible. */
  async recordLoginSuccess(
    tenantId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.recordEvent(
      'LOGIN_SUCCESS',
      tenantId,
      userId,
      'USER',
      userId,
      {},
      manager,
    );
  }

  /** Successful refresh exchange. */
  async recordRefreshSuccess(
    tenantId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.recordEvent(
      'REFRESH_SUCCESS',
      tenantId,
      userId,
      'USER',
      userId,
      {},
      manager,
    );
  }

  /**
   * Failed login or refresh. Writes a hash-chained row only when both a
   * tenant and a user row were resolved; otherwise falls back to the app log.
   * `pass` is accepted only to make credential stripping explicit: it is
   * never stored.
   */
  async recordAuthFailure(input: AuthFailureInput): Promise<void> {
    if (!input.tenantId || !input.userId) {
      this.logger.warn(
        `auth failure without audit anchor: action=${input.action} reason=${input.reason} email=${input.email ?? 'n/a'} tenantId=${input.tenantId ?? 'n/a'}`,
        AuthAuditService.name,
      );
      return;
    }
    await this.recordEvent(
      input.action,
      input.tenantId,
      input.userId,
      'USER',
      input.userId,
      {
        reason: input.reason,
        ...(input.email ? { email: input.email.trim().toLowerCase() } : {}),
      },
    );
  }

  private async recordEvent(
    action: AuthAuditAction,
    tenantId: string,
    userId: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
    manager?: EntityManager,
  ): Promise<void> {
    try {
      if (manager) {
        await this.writeEvent(
          manager,
          action,
          tenantId,
          userId,
          targetType,
          targetId,
          metadata,
        );
        return;
      }
      // Failures are audited after the original transaction already rolled
      // back, so open a dedicated tenant-bound transaction for the write.
      await runInTenantTransaction(
        this.dataSource,
        tenantId,
        async (boundManager) =>
          this.writeEvent(
            boundManager,
            action,
            tenantId,
            userId,
            targetType,
            targetId,
            metadata,
          ),
      );
    } catch (error) {
      // Availability first: a broken audit sink must never take auth down.
      this.logger.error(
        `auth audit write failed: action=${action} reason=${(error as Error).message}`,
      );
    }
  }

  private async writeEvent(
    manager: EntityManager,
    action: AuthAuditAction,
    tenantId: string,
    userId: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const repo = manager.getRepository(AuditLog);
    const lastLog = await repo.findOne({
      where: {
        tenant_id: tenantId,
        device_id: AUTH_AUDIT_DEVICE,
        user_id: userId,
        forensic_status: 'ACTIVE',
      },
      order: { sequence_no: 'DESC' as const },
    });

    const sequenceNo = lastLog ? Number(lastLog.sequence_no) + 1 : 1;
    const prevHash = lastLog?.entry_hash ? lastLog.entry_hash : 'GENESIS';
    const timestamp = new Date();
    const fullMetadata: Record<string, unknown> = {
      ...metadata,
      timestamp: timestamp.toISOString(),
    };

    const canonicalPayload = `${userId}|${action}|${AUTH_AUDIT_DEVICE}|${timestamp.toISOString()}|${sequenceNo}|${prevHash}|null|null|${JSON.stringify(fullMetadata)}`;
    const entryHash = crypto
      .createHash('sha256')
      .update(canonicalPayload)
      .digest('hex');

    const log = new AuditLog();
    log.action = action;
    log.target_type = targetType;
    log.target_id = targetId;
    log.tenant_id = tenantId;
    log.user_id = userId;
    log.device_id = AUTH_AUDIT_DEVICE;
    log.sequence_no = sequenceNo;
    log.prev_hash = prevHash;
    log.entry_hash = entryHash;
    log.timestamp = timestamp;
    log.metadata = fullMetadata;
    log.forensic_status = 'ACTIVE';

    await repo.save(log);
  }
}
