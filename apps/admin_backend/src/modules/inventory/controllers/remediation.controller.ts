import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { SaleInventoryRemediationService } from '../services/sale-inventory-remediation.service';
import { SaleInventoryRemediationDto } from '../dto/sale-inventory-remediation.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { UserRole } from '../../identity/entities/user.entity';
import { AppPermission } from '../../identity/security/permissions.enum';

interface AuthenticatedUserRequest extends Request {
  user?: {
    sub?: string;
    id?: string;
    role?: string;
  };
}

interface ProhibitedActorFields {
  actor?: unknown;
  actor_user_id?: unknown;
  actor_role?: unknown;
  userId?: unknown;
  role?: unknown;
}

@Controller('inventory/remediations')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class RemediationController {
  constructor(
    private readonly remediationService: SaleInventoryRemediationService,
  ) {}

  @Post('sale-inventory')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.INVENTORY_REMEDIATION_EXECUTE)
  async remediateSaleInventory(
    @GetTenantId() tenantId: string,
    @Body() dto: SaleInventoryRemediationDto,
    @Req() request: AuthenticatedUserRequest,
  ) {
    const probe = dto as unknown as ProhibitedActorFields;
    if (
      probe.actor ||
      probe.actor_user_id ||
      probe.actor_role ||
      probe.userId ||
      probe.role
    ) {
      throw new BadRequestException(
        'Actor fields in body are strictly rejected; identity is derived only from JWT principal',
      );
    }

    const userId = request.user?.sub || request.user?.id;
    const role = request.user?.role;

    if (!userId || !role) {
      throw new BadRequestException(
        'Authenticated actor principal is required',
      );
    }

    return this.remediationService.remediateSaleInventory(tenantId, dto, {
      userId,
      role,
    });
  }
}
