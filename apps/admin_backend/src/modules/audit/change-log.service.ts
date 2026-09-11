import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChangeLog } from './entities/change-log.entity';

@Injectable()
export class ChangeLogService {
  constructor(
    @InjectRepository(ChangeLog)
    private readonly changeLogRepo: Repository<ChangeLog>,
  ) {}

  async log(params: {
    tenantId: string;
    userId: string;
    userEmail?: string;
    action: string;
    targetType: string;
    targetId: string;
    changes?: Record<string, unknown>;
  }): Promise<void> {
    const entry = this.changeLogRepo.create({
      tenant_id: params.tenantId,
      user_id: params.userId,
      user_email: params.userEmail ?? null,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      changes: params.changes ?? null,
    });
    await this.changeLogRepo.save(entry);
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
