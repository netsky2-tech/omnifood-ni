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
import { ProductService } from './product.service';
import { ProductType } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { CurrentUser, CurrentUserPayload } from '../../core/decorators/current-user.decorator';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { AuthGuard } from '../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../identity/entities/user.entity';

/**
 * Product management API. Products are the sellable items in the POS system.
 * Each product belongs to a tenant and has a type (SIMPLE, COMPOUND, VARIANT_PARENT)
 * that determines its behavior in the POS and inventory systems.
 */
@Controller('products')
@UseInterceptors(TenantInterceptor)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId;
  }

  private resolveProductType(raw?: string): ProductType | undefined {
    if (!raw) return undefined;
    const upper = raw.toUpperCase();
    if (!Object.values(ProductType).includes(upper as ProductType)) {
      return undefined;
    }
    return upper as ProductType;
  }

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async list(
    @Query('productType') productType?: string,
    @Query('includeInactive') includeInactive?: string,
    @GetTenantId() tenantId?: string,
  ) {
    const resolved = this.resolveProductType(productType);
    return this.productService.list(
      this.requireTenant(tenantId),
      resolved,
      includeInactive === 'true',
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async findOne(
    @Param('id') id: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.productService.findOne(id, this.requireTenant(tenantId));
  }

  @Post()
  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async create(
    @Body() dto: CreateProductDto,
    @GetTenantId() tenantId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.productService.create(
      this.requireTenant(tenantId),
      dto,
      user ? { userId: user.sub, userEmail: user.email } : undefined,
    );
  }

  @Patch(':id')
  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @GetTenantId() tenantId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.productService.update(
      id,
      this.requireTenant(tenantId),
      dto,
      user ? { userId: user.sub, userEmail: user.email } : undefined,
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async deactivate(
    @Param('id') id: string,
    @GetTenantId() tenantId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    await this.productService.deactivate(
      id,
      this.requireTenant(tenantId),
      user ? { userId: user.sub, userEmail: user.email } : undefined,
    );
    return { id, deactivated: true };
  }
}
