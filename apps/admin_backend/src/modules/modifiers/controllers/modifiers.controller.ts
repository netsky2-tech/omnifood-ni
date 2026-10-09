import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ModifiersService,
  ModifierGroupStatusFilter,
} from '../services/modifiers.service';
import { CreateModifierGroupDto } from '../dto/create-modifier-group.dto';
import { UpdateModifierGroupDto } from '../dto/update-modifier-group.dto';
import { CreateModifierOptionDto } from '../dto/create-modifier-option.dto';
import { UpdateModifierOptionDto } from '../dto/update-modifier-option.dto';
import {
  AttachCategoryDto,
  AttachProductDto,
} from '../dto/attach-modifier-group.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import {
  serializeEffectiveGroups,
  serializeModifierGroup,
  serializeModifierGroups,
  serializeModifierOption,
} from '../modifier-response';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';

@Controller('modifier-groups')
@UseGuards(AuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ModifiersController {
  constructor(private readonly modifiersService: ModifiersService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId;
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER)
  async findAll(
    @GetTenantId() tenantId?: string,
    @Query('category_id') categoryId?: string,
    @Query('product_id') productId?: string,
    @Query('status') status?: string,
  ) {
    // status is validated inside the service (normalizeStatusFilter,
    // same doctrine as assertUuid): invalid values are a clean 400.
    const groups = await this.modifiersService.findAll(
      this.requireTenant(tenantId),
      {
        category_id: categoryId,
        product_id: productId,
        status: status as ModifierGroupStatusFilter | undefined,
      },
    );
    // Response boundary: Postgres numeric reaches Node as a string while the
    // entity declares number — every decimal field leaves as a JSON number
    // (see modifier-response.ts).
    return serializeModifierGroups(groups);
  }

  // NOTE: declared BEFORE @Get(':id') so 'effective' is not captured as an
  // :id path parameter by Nest's in-order route matching.
  @Get('effective')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER)
  async getEffective(
    @Query('product_id') productId: string | undefined,
    @GetTenantId() tenantId?: string,
  ) {
    // Missing or malformed product_id is rejected with 400 by the service
    // (assertUuid), the same doctrine as the other uuid inputs.
    const groups = await this.modifiersService.getEffectiveGroups(
      this.requireTenant(tenantId),
      productId ?? '',
    );
    return serializeEffectiveGroups(groups);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER)
  async findOne(@Param('id') id: string, @GetTenantId() tenantId?: string) {
    const group = await this.modifiersService.findOne(
      this.requireTenant(tenantId),
      id,
    );
    return serializeModifierGroup(group);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async createGroup(
    @Body() dto: CreateModifierGroupDto,
    @GetTenantId() tenantId?: string,
  ) {
    const group = await this.modifiersService.createGroup(
      this.requireTenant(tenantId),
      dto,
    );
    return serializeModifierGroup(group);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateModifierGroupDto,
    @GetTenantId() tenantId?: string,
  ) {
    const group = await this.modifiersService.updateGroup(
      this.requireTenant(tenantId),
      id,
      dto,
    );
    return serializeModifierGroup(group);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async removeGroup(@Param('id') id: string, @GetTenantId() tenantId?: string) {
    await this.modifiersService.removeGroup(this.requireTenant(tenantId), id);
    return { success: true };
  }

  @Post(':groupId/options')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async createOption(
    @Param('groupId') groupId: string,
    @Body() dto: CreateModifierOptionDto,
    @GetTenantId() tenantId?: string,
  ) {
    const option = await this.modifiersService.createOption(
      this.requireTenant(tenantId),
      groupId,
      dto,
    );
    return serializeModifierOption(option);
  }

  @Patch(':groupId/options/:optionId')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async updateOption(
    @Param('groupId') groupId: string,
    @Param('optionId') optionId: string,
    @Body() dto: UpdateModifierOptionDto,
    @GetTenantId() tenantId?: string,
  ) {
    const option = await this.modifiersService.updateOption(
      this.requireTenant(tenantId),
      groupId,
      optionId,
      dto,
    );
    return serializeModifierOption(option);
  }

  @Delete(':groupId/options/:optionId')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async removeOption(
    @Param('groupId') groupId: string,
    @Param('optionId') optionId: string,
    @GetTenantId() tenantId?: string,
  ) {
    await this.modifiersService.removeOption(
      this.requireTenant(tenantId),
      groupId,
      optionId,
    );
    return { success: true };
  }

  @Post(':id/categories')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async attachCategory(
    @Param('id') id: string,
    @Body() dto: AttachCategoryDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.modifiersService.attachCategory(
      this.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Delete(':id/categories/:catalogValueId')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async detachCategory(
    @Param('id') id: string,
    @Param('catalogValueId') catalogValueId: string,
    @GetTenantId() tenantId?: string,
  ) {
    await this.modifiersService.detachCategory(
      this.requireTenant(tenantId),
      id,
      catalogValueId,
    );
    return { success: true };
  }

  @Post(':id/products')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async attachProduct(
    @Param('id') id: string,
    @Body() dto: AttachProductDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.modifiersService.attachProduct(
      this.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Delete(':id/products/:productId')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async detachProduct(
    @Param('id') id: string,
    @Param('productId') productId: string,
    @GetTenantId() tenantId?: string,
  ) {
    await this.modifiersService.detachProduct(
      this.requireTenant(tenantId),
      id,
      productId,
    );
    return { success: true };
  }
}
