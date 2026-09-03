import {
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { Roles } from '../../../core/decorators/roles.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { UserRole } from '../../identity/entities/user.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { TopologyRevisionConflictError } from '../domain/topology-revision-conflict.error';
import { CreateTenantTopologyRevisionDto } from '../dto/create-tenant-topology-revision.dto';
import { TenantTopologyResponseDto } from '../dto/tenant-topology-response.dto';
import { TenantTopologyRevisionService } from '../services/tenant-topology-revision.service';

@Controller('fulfillment/topology')
@UseInterceptors(TenantInterceptor)
export class FulfillmentTopologyController {
  constructor(
    private readonly topologyService: TenantTopologyRevisionService,
  ) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId;
  }

  @Get('current')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER)
  async getCurrent(
    @GetTenantId() tenantId?: string,
  ): Promise<TenantTopologyResponseDto> {
    const validTenantId = this.requireTenant(tenantId);
    return this.topologyService.current(validTenantId);
  }

  @Post('revisions')
  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async createRevision(
    @Body() dto: CreateTenantTopologyRevisionDto,
    @GetTenantId() tenantId?: string,
  ): Promise<TenantTopologyResponseDto> {
    const validTenantId = this.requireTenant(tenantId);
    try {
      return await this.topologyService.create({
        tenantId: validTenantId,
        baseRevision: dto.baseRevision,
        contractVersion: dto.contractVersion,
        topology: dto.topology,
        hash: dto.hash,
      });
    } catch (error: unknown) {
      if (error instanceof TopologyRevisionConflictError) {
        throw new ConflictException({
          message: error.message,
          baseRevision: error.baseRevision,
          currentRevision: error.currentRevision,
        });
      }
      throw error;
    }
  }
}
