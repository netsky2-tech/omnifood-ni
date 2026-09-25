import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AuditLog } from '../entities/audit-log.entity';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  QueryOverridesDto,
  QueryDrawerOpensDto,
  RecordManualDrawerOpenDto,
  AuditQueryResponseDto,
} from '../dto/audit-query.dto';

const OVERRIDE_ACTIONS = [
  'SUPERVISOR_OVERRIDE_APPROVED',
  'SUPERVISOR_OVERRIDE_REJECTED',
];

const DRAWER_ACTIONS = [
  'DRAWER_OPENED_MANUALLY',
  'CASH_MANUAL_DRAWER_OPEN',
  'MANUAL_DRAWER_OPEN',
  'cash:manual_drawer_open',
];

@Injectable()
export class AuditTrailService {
  constructor(
    @InjectRepository(AuditLog)
    // Issue #581: `audit_logs` is a debt table today but is promoted to
    // direct:SIUD RLS in #512 T3 slice 7, so every access below rides the
    // tenant-bound transaction manager instead of this pooled repository,
    // which stays declared for Nest DI compatibility only.
    private readonly auditRepository: Repository<AuditLog>,
    private readonly dataSource: DataSource,
  ) {}

  async queryOverrides(
    query: QueryOverridesDto,
    tenantId: string,
  ): Promise<AuditQueryResponseDto<AuditLog>> {
    // Issue #581: read through the tenant-bound transaction manager so the
    // query honors the transaction-local `app.tenant_id` RLS binding (the
    // audit tables become direct:SIUD in #512 T3 slice 7).
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const qb = manager.getRepository(AuditLog).createQueryBuilder('audit');

        qb.where('audit.tenant_id = :tenantId', { tenantId });
        qb.andWhere(
          '(audit.action IN (:...overrideActions) OR audit.target_type = :overrideTarget)',
          {
            overrideActions: OVERRIDE_ACTIONS,
            overrideTarget: 'SUPERVISOR_OVERRIDE',
          },
        );

        if (query.startDate) {
          qb.andWhere('audit.timestamp >= :startDate', {
            startDate: new Date(query.startDate),
          });
        }

        if (query.endDate) {
          qb.andWhere('audit.timestamp <= :endDate', {
            endDate: new Date(query.endDate),
          });
        }

        if (query.supervisorId) {
          qb.andWhere('audit.usuario_autorizador_id = :supervisorId', {
            supervisorId: query.supervisorId,
          });
        }

        if (query.permission) {
          qb.andWhere(
            "(audit.metadata ->> 'permissionRequired' = :permission OR audit.metadata ->> 'permission' = :permission)",
            { permission: query.permission },
          );
        }

        qb.leftJoinAndSelect('audit.user', 'actor');
        qb.orderBy('audit.timestamp', 'DESC');

        const limit = query.limit ?? 50;
        const offset = query.offset ?? 0;

        qb.skip(offset).take(limit);

        const [items, total] = await qb.getManyAndCount();

        return {
          items,
          total,
          limit,
          offset,
        };
      },
    );
  }

  async queryDrawerOpens(
    query: QueryDrawerOpensDto,
    tenantId: string,
  ): Promise<AuditQueryResponseDto<AuditLog>> {
    // Issue #581: same tenant-bound read as queryOverrides.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const qb = manager.getRepository(AuditLog).createQueryBuilder('audit');

        qb.where('audit.tenant_id = :tenantId', { tenantId });
        qb.andWhere(
          '(audit.action IN (:...drawerActions) OR audit.target_type = :drawerTarget)',
          {
            drawerActions: DRAWER_ACTIONS,
            drawerTarget: 'CASH_DRAWER',
          },
        );

        if (query.startDate) {
          qb.andWhere('audit.timestamp >= :startDate', {
            startDate: new Date(query.startDate),
          });
        }

        if (query.endDate) {
          qb.andWhere('audit.timestamp <= :endDate', {
            endDate: new Date(query.endDate),
          });
        }

        if (query.terminalId) {
          qb.andWhere('audit.device_id = :terminalId', {
            terminalId: query.terminalId,
          });
        }

        if (query.reason) {
          qb.andWhere("audit.metadata ->> 'reason' = :reason", {
            reason: query.reason,
          });
        }

        qb.leftJoinAndSelect('audit.user', 'actor');
        qb.orderBy('audit.timestamp', 'DESC');

        const limit = query.limit ?? 50;
        const offset = query.offset ?? 0;

        qb.skip(offset).take(limit);

        const [items, total] = await qb.getManyAndCount();

        return {
          items,
          total,
          limit,
          offset,
        };
      },
    );
  }

  async recordManualDrawerOpen(
    dto: RecordManualDrawerOpenDto,
    tenantId: string,
    actorUserId: string,
  ): Promise<AuditLog> {
    // Issue #581: the hash-chain read (findOne) and the append (save) are
    // one atomic unit: both ride the same tenant-bound transaction so the
    // sequence never races against a concurrent writer for the tenant.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const auditRepository = manager.getRepository(AuditLog);

        const lastLog = await auditRepository.findOne({
          where: {
            tenant_id: tenantId,
            device_id: dto.terminalId,
            user_id: actorUserId,
            forensic_status: 'ACTIVE',
          },
          order: { sequence_no: 'DESC' },
        });

        const sequenceNo = lastLog ? Number(lastLog.sequence_no) + 1 : 1;
        const prevHash = lastLog ? lastLog.entry_hash : 'GENESIS';
        const timestamp = new Date();

        const metadata: Record<string, unknown> = {
          reason: dto.reason,
          notes: dto.notes ?? '',
          authorizationToken: dto.authorizationToken ?? null,
          timestamp: timestamp.toISOString(),
        };

        const canonicalPayload = `${actorUserId}|DRAWER_OPENED_MANUALLY|${dto.terminalId}|${timestamp.toISOString()}|${sequenceNo}|${prevHash}|${dto.metodoAutorizacion || 'null'}|${dto.supervisorId || 'null'}|${JSON.stringify(metadata)}`;
        const entryHash = crypto
          .createHash('sha256')
          .update(canonicalPayload)
          .digest('hex');

        const log = new AuditLog();
        log.tenant_id = tenantId;
        log.user_id = actorUserId;
        log.action = 'DRAWER_OPENED_MANUALLY';
        log.target_type = 'CASH_DRAWER';
        log.device_id = dto.terminalId;
        log.sequence_no = sequenceNo;
        log.prev_hash = prevHash;
        log.entry_hash = entryHash;
        log.metodo_autorizacion = dto.metodoAutorizacion;
        log.usuario_autorizador_id = dto.supervisorId;
        log.timestamp = timestamp;
        log.metadata = metadata;
        log.forensic_status = 'ACTIVE';

        return auditRepository.save(log);
      },
    );
  }
}
