import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  Request,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { AuthGuard } from '../guards/auth.guard';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { PushAuditLogsDto } from '../dto/identity.dto';

@Controller('identity/audit')
@UseGuards(AuthGuard)
@UseInterceptors(TenantInterceptor)
export class AuditController {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
  ) {}

  @Post()
  async pushLogs(
    @GetTenantId() tenantId: string,
    @Body() dto: PushAuditLogsDto,
    @Request() req: { user: { sub: string } },
  ) {
    const userId = req.user.sub;

    const logsToSave = dto.logs.map((log) => {
      // Security Check: Verify user can only push logs for themselves
      // Unless they have a higher role (Logic can be expanded here)
      return {
        ...log,
        user_id: userId,
        tenant_id: tenantId,
        metadata: log.metadata || {},
        timestamp: new Date(log.timestamp),
      };
    });

    await this.auditRepository.save(logsToSave);
    return { status: 'success', count: logsToSave.length };
  }
}
