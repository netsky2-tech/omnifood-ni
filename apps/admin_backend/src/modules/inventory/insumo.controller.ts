import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Insumo } from './entities/insumo.entity';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { AuthGuard } from '../identity/guards/auth.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../identity/entities/user.entity';
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../core/database/tenant-transaction';

@Controller('insumos')
@UseInterceptors(TenantInterceptor)
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class InsumoController {
  // Issue #512 slice 1 part A: the pooled insumo repository injection is
  // gone. Every read of `insumos` rides one tenant-bound transaction and
  // resolves its repository from that exact manager, so upcoming FORCE RLS
  // policies authorize the read via `app.tenant_id`.
  constructor(private readonly dataSource: DataSource) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId) {
      throw new Error('Tenant context is required');
    }
    return tenantId;
  }

  @Get()
  async list(
    @Query('includeInactive') includeInactive?: string,
    @GetTenantId() tenantId?: string,
  ): Promise<Insumo[]> {
    const normalizedTenantId = this.requireTenant(tenantId);

    const where: Record<string, unknown> = {
      tenant_id: normalizedTenantId,
    };

    if (includeInactive !== 'true') {
      where.is_active = true;
    }

    return runInTenantTransaction(
      this.dataSource,
      normalizedTenantId,
      (manager) =>
        manager.getRepository(Insumo).find({
          where,
          order: { name: 'ASC' },
        }),
    );
  }
}
