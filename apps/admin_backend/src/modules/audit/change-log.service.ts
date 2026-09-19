import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChangeLog } from './entities/change-log.entity';

/**
 * Who performed an audited change: a human actor (`userId`) or a logical
 * actor (`ref`, e.g. 'SYSTEM_RECONCILER', 'SYSTEM_FINALIZER' or a terminal
 * id). Exactly one of the two shapes is representable, mirroring the
 * `change_log_actor_exactly_one` CHECK constraint added by migration
 * 1809170000000-ExplicitChangeLogActor (issue #412).
 */
export type AuditActor = { userId: string } | { ref: string };

/**
 * Raised when an audit entry is attempted without a usable actor. No SQL is
 * ever issued for a blank or missing actor.
 */
export class AuditActorRequiredError extends Error {
  constructor() {
    super(
      'AUDIT_ACTOR_REQUIRED: a non-blank actor ({ userId } or { ref }) is required to record a change log entry',
    );
    this.name = 'AuditActorRequiredError';
  }
}

@Injectable()
export class ChangeLogService {
  constructor(
    @InjectRepository(ChangeLog)
    private readonly changeLogRepo: Repository<ChangeLog>,
  ) {}

  async log(params: {
    tenantId: string;
    actor: AuditActor;
    userEmail?: string;
    action: string;
    targetType: string;
    targetId: string;
    changes?: Record<string, unknown>;
  }): Promise<void> {
    // Validate before any SQL: the CHECK constraint would reject the insert,
    // but the illegal state is rejected here, at the call site's boundary.
    const actor = this.resolveAuditActor(params.actor);

    const entry = this.changeLogRepo.create({
      tenant_id: params.tenantId,
      user_id: actor.userId ?? null,
      actor_ref: actor.ref ?? null,
      user_email: params.userEmail ?? null,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      changes: params.changes ?? null,
    });
    await this.changeLogRepo.save(entry);
  }

  /**
   * Validates and trims the actor before any SQL is issued. Exactly one
   * column is written: user_id for a human actor, actor_ref for a logical
   * one. A blank or missing actor throws a named error instead of reaching
   * the database.
   */
  private resolveAuditActor(actor: AuditActor): {
    userId: string | null;
    ref: string | null;
  } {
    if (actor === null || actor === undefined) {
      throw new AuditActorRequiredError();
    }

    if ('userId' in actor) {
      const userId = actor.userId?.trim();
      if (!userId) {
        throw new AuditActorRequiredError();
      }
      return { userId, ref: null };
    }

    if ('ref' in actor) {
      const ref = actor.ref?.trim();
      if (!ref) {
        throw new AuditActorRequiredError();
      }
      return { userId: null, ref };
    }

    throw new AuditActorRequiredError();
  }

  async findByTarget(
    tenantId: string,
    targetType: string,
    targetId: string,
  ): Promise<ChangeLog[]> {
    return this.changeLogRepo.find({
      where: {
        tenant_id: tenantId,
        target_type: targetType,
        target_id: targetId,
      },
      order: { created_at: 'ASC' },
    });
  }

  async findByTenant(tenantId: string): Promise<ChangeLog[]> {
    return this.changeLogRepo.find({
      where: { tenant_id: tenantId },
      order: { created_at: 'DESC' },
    });
  }
}
