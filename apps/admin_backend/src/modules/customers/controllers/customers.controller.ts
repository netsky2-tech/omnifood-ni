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
import { CustomersService } from '../services/customers.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { CustomerQueryDto } from '../dto/customer-query.dto';
import { AdjustPointsDto } from '../dto/adjust-points.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';

@Controller('customers')
@UseGuards(AuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId;
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER)
  async findAll(
    @Query() query: CustomerQueryDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.customersService.findAll(this.requireTenant(tenantId), query);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER)
  async findOne(@Param('id') id: string, @GetTenantId() tenantId?: string) {
    return this.customersService.findOne(this.requireTenant(tenantId), id);
  }

  @Get(':id/points/transactions')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  async getPointTransactions(
    @Param('id') id: string,
    @GetTenantId() tenantId?: string,
  ) {
    return this.customersService.getPointTransactions(
      this.requireTenant(tenantId),
      id,
    );
  }

  @Post(':id/points/adjust')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async adjustPoints(
    @Param('id') id: string,
    @Body() dto: AdjustPointsDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.customersService.adjustPoints(
      this.requireTenant(tenantId),
      id,
      dto,
    );
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  async create(
    @Body() dto: CreateCustomerDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.customersService.create(this.requireTenant(tenantId), dto);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @GetTenantId() tenantId?: string,
  ) {
    return this.customersService.update(this.requireTenant(tenantId), id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async remove(@Param('id') id: string, @GetTenantId() tenantId?: string) {
    await this.customersService.remove(this.requireTenant(tenantId), id);
    return { success: true };
  }
}
