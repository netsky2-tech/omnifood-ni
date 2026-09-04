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
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Controller('insumos')
@UseInterceptors(TenantInterceptor)
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class InsumoController {
  constructor(
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  async list(
    @Query('includeInactive') includeInactive?: string,
    @GetTenantId() tenantId?: string,
  ): Promise<Insumo[]> {
    if (!tenantId) {
      throw new Error('Tenant context is required');
    }

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
    };

    if (includeInactive !== 'true') {
      where.is_active = true;
    }

    return this.insumoRepo.find({
      where,
      order: { name: 'ASC' },
    });
  }
}
