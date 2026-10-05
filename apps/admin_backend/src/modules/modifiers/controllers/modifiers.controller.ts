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
import { ModifiersService } from '../services/modifiers.service';
import { CreateModifierGroupDto } from '../dto/create-modifier-group.dto';
import { UpdateModifierGroupDto } from '../dto/update-modifier-group.dto';
import { CreateModifierOptionDto } from '../dto/create-modifier-option.dto';
import { UpdateModifierOptionDto } from '../dto/update-modifier-option.dto';
import {
  AttachCategoryDto,
  AttachProductDto,
} from '../dto/attach-modifier-group.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
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
  ) {
    return this.modifiersService.findAll(this.requireTenant(tenantId), {
      category_id: categoryId,
      product_id: productId,
    });
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
    return this.modifiersService.getEffectiveGroups(
      this.requireTenant(tenantId),
      productId ?? '',
    );
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER)
  async findOne(@Param('id') id: string, @GetTenantId() tenantId?: string) {
    return this.modifiersService.findOne(this.requireTenant(tenantId), id);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async createGroup(
    @Body() dto: CreateModifierGroupDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.modifiersService.createGroup(this.requireTenant(tenantId), dto);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateModifierGroupDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.modifiersService.updateGroup(
      this.requireTenant(tenantId),
      id,
      dto,
    );
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
    return this.modifiersService.createOption(
      this.requireTenant(tenantId),
      groupId,
      dto,
    );
  }

  @Patch(':groupId/options/:optionId')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async updateOption(
    @Param('groupId') groupId: string,
    @Param('optionId') optionId: string,
    @Body() dto: UpdateModifierOptionDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.modifiersService.updateOption(
      this.requireTenant(tenantId),
      groupId,
      optionId,
      dto,
    );
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
