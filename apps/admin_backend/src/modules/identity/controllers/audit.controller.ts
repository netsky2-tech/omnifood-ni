import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  Request,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { AuthGuard } from '../guards/auth.guard';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { PushAuditLogsDto } from '../dto/identity.dto';
import { AuditVerificationService } from '../services/audit-verification.service';

@Controller('identity/audit')
@UseGuards(AuthGuard)
@UseInterceptors(TenantInterceptor)
export class AuditController {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly verificationService: AuditVerificationService,
  ) {}

  @Post()
  async pushLogs(
    @GetTenantId() tenantId: string,
    @Body() dto: PushAuditLogsDto,
    @Request() req: { user: { sub: string } },
  ) {
    const requesterUserId = req.user.sub;
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
      logsToSave.push({
        ...persistedLog,
        action: resolvedAction,
        user_id: logActorUserId,
        tenant_id: tenantId,
        metadata: log.metadata === undefined ? {} : log.metadata,
        timestamp: new Date(log.timestamp),
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
