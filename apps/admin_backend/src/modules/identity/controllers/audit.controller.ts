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
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
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

  // Human transport: manual backoffice drawer-open entry. The POS has no
  // HTTP caller for this route (its drawer-opens stream rides the forensic
  // audit push below), so the strict identity JWT stays the gate.
  @Post('drawer-opens')
  @UseGuards(AuthGuard)
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
            throw new ConflictException('Conflicting forensic replay detected');
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
}
