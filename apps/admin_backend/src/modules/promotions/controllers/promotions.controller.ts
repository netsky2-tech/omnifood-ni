import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PromotionsService } from '../services/promotions.service';
import { CreatePromotionDto } from '../dto/create-promotion.dto';
import { UpdatePromotionDto } from '../dto/update-promotion.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';
import { CapabilitiesGuard } from '../../entitlements/guards/capabilities.guard';
import { RequireCapability } from '../../entitlements/decorators/require-capability.decorator';

@Controller('promotions')
@UseGuards(AuthGuard, RolesGuard, CapabilitiesGuard)
@UseInterceptors(TenantInterceptor)
// ENT-03 (issue #984): promotions is a transversal premium capability
// (catalog §3/§4) — every verb of this controller is gated. The B2B
// `promotions.convenio` requirement is enforced in the service, not here.
@RequireCapability('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId;
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER)
  async findAll(@GetTenantId() tenantId?: string) {
    return this.promotionsService.findAll(this.requireTenant(tenantId));
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER)
  async findOne(@Param('id') id: string, @GetTenantId() tenantId?: string) {
    return this.promotionsService.findOne(this.requireTenant(tenantId), id);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async create(
    @Body() dto: CreatePromotionDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.promotionsService.create(this.requireTenant(tenantId), dto);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.promotionsService.update(this.requireTenant(tenantId), id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async remove(@Param('id') id: string, @GetTenantId() tenantId?: string) {
    await this.promotionsService.remove(this.requireTenant(tenantId), id);
    return { success: true };
  }
}
