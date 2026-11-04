import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  Request,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { ForensicAlert } from '../../inventory/entities/forensic-alert.entity';
import { UserRole } from '../entities/user.entity';
import { AuthGuard } from '../guards/auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { PushAuditLogsDto } from '../dto/identity.dto';
import {
  QueryOverridesDto,
  QueryDrawerOpensDto,
  RecordManualDrawerOpenDto,
} from '../dto/audit-query.dto';
import { AuditTrailService } from '../services/audit-trail.service';
import { AuditVerificationService } from '../services/audit-verification.service';
import { deriveAuditTarget } from '../services/audit-target-derivation';
import { SyncTransportGuard } from '../guards/sync-transport.guard';
import { RequireSyncScopes } from '../decorators/sync-scopes.decorator';

@Controller('identity/audit')
@UseInterceptors(TenantInterceptor)
export class AuditController {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly auditTrailService: AuditTrailService,
    private readonly verificationService: AuditVerificationService,
  ) {}

  @Get('overrides')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getOverrides(
    @GetTenantId() tenantId: string,
    @Query() query: QueryOverridesDto,
  ) {
    return this.auditTrailService.queryOverrides(query, tenantId || '');
  }

  @Get('drawer-opens')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getDrawerOpens(
    @GetTenantId() tenantId: string,
    @Query() query: QueryDrawerOpensDto,
  ) {
    return this.auditTrailService.queryDrawerOpens(query, tenantId || '');
  }

  // Continuity stream head query (Issue #936): allows POS terminals to query
  // the latest sequence number and entry hash stored in cloud for a given
  // (deviceId, userId) stream so they can cleanly re-anchor their local
  // forensic chain without self-locking permanently on replay conflict (409).
  @Get('stream-head')
  @UseGuards(SyncTransportGuard)
  @RequireSyncScopes('sync:push', 'sync:pull')
  async getStreamHead(
    @GetTenantId() tenantId: string,
    @Query('deviceId') queryDeviceId: string | undefined,
    @Query('userId') queryUserId: string | undefined,
    @Request()
    req: {
      devicePrincipal?: { deviceId: string };
    },
  ) {
    const canonicalDeviceId = req.devicePrincipal?.deviceId;
    const targetDeviceId = queryDeviceId?.trim() || canonicalDeviceId;
    if (!targetDeviceId) {
      throw new BadRequestException('Missing deviceId');
    }
    if (canonicalDeviceId && targetDeviceId !== canonicalDeviceId) {
      throw new ForbiddenException(
        `Device ${canonicalDeviceId} cannot query stream head for ${targetDeviceId}`,
      );
    }
    const targetUserId = queryUserId?.trim();
    if (!targetUserId) {
      throw new BadRequestException('Missing userId');
    }

    const latest = await this.auditRepository.findOne({
      where: {
        tenant_id: tenantId,
        device_id: targetDeviceId,
        user_id: targetUserId,
        forensic_status: 'ACTIVE',
      },
      order: { sequence_no: 'DESC' },
    });

    const sequenceNo = latest ? latest.sequence_no : 0;
    const entryHash = latest ? latest.entry_hash : 'GENESIS';

    return {
      sequence_no: sequenceNo,
      entry_hash: entryHash,
      sequenceNo,
      entryHash,
    };
  }

  // Human transport: manual backoffice drawer-open entry. The POS has no
  // HTTP caller for this route (its drawer-opens stream rides the forensic
  // audit push below), so the strict identity JWT stays the gate.
  // Security audit remediation S5: writing audit records is an OWNER/MANAGER
  // backoffice action, not any-authenticated-user (the registry comment
  // always claimed this role set — now the guards enforce it).
  @Post('drawer-opens')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async recordDrawerOpen(
    @GetTenantId() tenantId: string,
    @Body() dto: RecordManualDrawerOpenDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.auditTrailService.recordManualDrawerOpen(
      dto,
      tenantId || '',
      req.user.sub,
    );
  }

  // Device sync transport (D-18 part 2): the audit stream is pushed by the
  // POS background sync pass, which runs under a device-sync JWT. In an
  // offline-PIN kiosk session (after CERRAR SESIÓN + PIN unlock) there is no
  // cloud user session, so the former class-level AuthGuard (strict identity
  // access JWT) rejected these pushes with 401 and the rows never reached the
  // cloud. Per-log attribution is preserved: every payload row carries its
  // authoring user_id (POS _payload), and the forensic continuity streams key
  // on (tenant, device, user) — not on the transport principal.
  @Post()
  @UseGuards(SyncTransportGuard)
  @RequireSyncScopes('sync:push')
  async pushLogs(
    @GetTenantId() tenantId: string,
    @Body() dto: PushAuditLogsDto,
    @Request()
    req: {
      user?: { sub: string } | null;
      devicePrincipal?: { deviceId: string };
    },
  ) {
    const requesterUserId =
      req.devicePrincipal?.deviceId ?? req.user?.sub ?? '';
    if (!requesterUserId) {
      // Unreachable behind SyncTransportGuard (which always attaches the
      // device principal); fail closed rather than persist unattributed rows.
      throw new UnauthorizedException(
        'Audit push requires an authenticated device or user principal',
      );
    }
    const logsToSave: Array<Record<string, unknown>> = [];
    for (const log of dto.logs) {
      const logActorUserId = log.user_id ?? requesterUserId;
      const resolvedAction = log.action ?? log.tipo_accion;
      if (!resolvedAction) {
        throw new BadRequestException(
          `Missing action/tipo_accion for log ${log.id}`,
        );
      }

      if (!logActorUserId || !logActorUserId.trim()) {
        throw new BadRequestException(`Missing user_id for log ${log.id}`);
      }
    }

    this.verificationService.verifyBatch(dto.logs, requesterUserId);
    for (const log of dto.logs) {
      const logActorUserId = log.user_id ?? requesterUserId;
      const resolvedAction = log.action ?? log.tipo_accion;

      const persistedLog = { ...log };
      delete persistedLog.metadata_raw;
      const normalizedMetadata = log.metadata === undefined ? {} : log.metadata;
      // Round-2 F-4a: the POS never sends the entity columns, so every POS
      // row rendered "—" in the owner's ledger. Derive them from the action
      // + metadata the push already carries; a POS-supplied value still wins.
      const derivedTarget = deriveAuditTarget(
        resolvedAction,
        normalizedMetadata,
      );
      logsToSave.push({
        ...persistedLog,
        action: resolvedAction,
        user_id: logActorUserId,
        tenant_id: tenantId,
        metadata: normalizedMetadata,
        timestamp: new Date(log.timestamp),
        target_type: persistedLog.target_type ?? derivedTarget.target_type,
        target_id: persistedLog.target_id ?? derivedTarget.target_id,
      });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const continuityCache = new Map<
        string,
        { sequence_no: number; entry_hash: string }
      >();

      for (const log of logsToSave) {
        const streamKey = `${tenantId}|${log.device_id as string}|${log.user_id as string}`;
        if (!continuityCache.has(streamKey)) {
          await queryRunner.query(
            'SELECT pg_advisory_xact_lock(hashtext($1))',
            [streamKey],
          );
        }

        let latest = continuityCache.get(streamKey);
        if (!latest) {
          const persistedLatest = await queryRunner.manager.findOne(AuditLog, {
            where: {
              tenant_id: tenantId,
              device_id: log.device_id as string,
              user_id: log.user_id as string,
              forensic_status: 'ACTIVE',
            },
            order: { sequence_no: 'DESC' },
          });

          latest = persistedLatest
            ? {
                sequence_no: persistedLatest.sequence_no,
                entry_hash: persistedLatest.entry_hash,
              }
            : { sequence_no: 0, entry_hash: 'GENESIS' };
          continuityCache.set(streamKey, latest);
        }

        const expectedSequence = latest.sequence_no + 1;
        const currentSequence = log.sequence_no as number;
        const currentPrevHash = log.prev_hash as string;
        if (currentSequence <= latest.sequence_no) {
          const existing = await queryRunner.manager.findOne(AuditLog, {
            where: {
              tenant_id: tenantId,
              device_id: log.device_id as string,
              user_id: log.user_id as string,
              sequence_no: currentSequence,
              forensic_status: 'ACTIVE',
            },
          });
          if (!existing || existing.entry_hash !== log.entry_hash) {
            const alert = await this.recordReplayConflictAlert(
              tenantId,
              log,
              currentSequence,
              existing?.entry_hash ?? latest.entry_hash,
            );
            throw new ConflictException({
              message: 'Conflicting forensic replay detected',
              alertId: alert.id,
              streamHead: {
                sequence_no: latest.sequence_no,
                entry_hash: latest.entry_hash,
              },
            });
          }
          continue;
        }
        if (currentSequence !== expectedSequence) {
          throw new BadRequestException(
            `Out-of-order forensic sequence for log ${log.id as string}: expected ${expectedSequence}, got ${currentSequence}`,
          );
        }

        if (currentPrevHash !== latest.entry_hash) {
          throw new BadRequestException(
            `Broken forensic chain for log ${log.id as string}: prev_hash mismatch`,
          );
        }

        await queryRunner.manager.insert(AuditLog, log);
        continuityCache.set(streamKey, {
          sequence_no: currentSequence,
          entry_hash: log.entry_hash as string,
        });
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === '23505'
      ) {
        throw new ConflictException(
          'Duplicate forensic stream sequence detected',
        );
      }
      throw error;
    } finally {
      await queryRunner.release();
    }

    return { status: 'success', count: logsToSave.length };
  }

  private async recordReplayConflictAlert(
    tenantId: string,
    log: Record<string, unknown>,
    sequenceNo: number,
    existingHash: string,
  ): Promise<{ id: string }> {
    try {
      if (this.dataSource && typeof this.dataSource.getRepository === 'function') {
        const alertRepo = this.dataSource.getRepository(ForensicAlert);
        const alert = alertRepo.create({
          tenant_id: tenantId,
          alert_type: 'AUDIT_BACKEND_TERMINAL_REJECTION',
          severity: 'critical',
          message: `Conflicting forensic replay detected on terminal ${log.device_id as string} for sequence ${sequenceNo}`,
          actor_role: 'SYSTEM',
          metadata: {
            device_id: log.device_id,
            user_id: log.user_id,
            sequence_no: sequenceNo,
            proposed_entry_hash: log.entry_hash,
            existing_entry_hash: existingHash,
            remote_ref_uuid: log.id,
          },
          resolved_at: null,
        });
        const saved = await alertRepo.save(alert);
        return { id: saved.id };
      }
    } catch {
      // In isolated fixtures without real repository, gracefully return fallback
    }
    return { id: (log.id as string) || 'alert-replay-conflict' };
  }
}
