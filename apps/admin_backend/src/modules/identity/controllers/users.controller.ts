import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  Request,
} from '@nestjs/common';
import { UserService } from '../services/user.service';
import { AuthGuard } from '../guards/auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../entities/user.entity';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { CreateUserDto, UpdateUserDto } from '../dto/user-management.dto';
import { UpdateUserPermissionsDto } from '../dto/permission-matrix.dto';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    email: string;
    tenant_id: string;
    role: UserRole;
  };
}

@Controller('identity/users')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class UsersController {
  constructor(private userService: UserService) {}

  @Get('permissions/matrix')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getPermissionsMatrix() {
    return this.userService.getPermissionsMatrix();
  }

  @Get()
  @Roles(UserRole.OWNER)
  async list(@GetTenantId() tenantId: string) {
    return this.userService.findByTenant(tenantId || '');
  }

  @Post()
  @Roles(UserRole.OWNER)
  async create(
    @GetTenantId() tenantId: string,
    @Body() dto: CreateUserDto,
    @Request() req: RequestWithUser,
  ) {
    return this.userService.create(dto, tenantId || '', req.user.sub);
  }

  @Put(':id')
  @Roles(UserRole.OWNER)
  async update(
    @Param('id') id: string,
    @GetTenantId() tenantId: string,
    @Body() dto: UpdateUserDto,
    @Request() req: RequestWithUser,
  ) {
    return this.userService.update(id, dto, tenantId || '', req.user.sub);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER)
  async delete(
    @Param('id') id: string,
    @GetTenantId() tenantId: string,
    @Request() req: RequestWithUser,
  ) {
    return this.userService.deactivate(id, tenantId || '', req.user.sub);
  }

  @Get(':id/permissions')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getUserPermissions(
    @Param('id') id: string,
    @GetTenantId() tenantId: string,
  ) {
    return this.userService.getUserEffectivePermissions(id, tenantId || '');
  }

  @Put(':id/permissions')
  @Roles(UserRole.OWNER)
  async updateUserPermissions(
    @Param('id') id: string,
    @GetTenantId() tenantId: string,
    @Body() dto: UpdateUserPermissionsDto,
    @Request() req: RequestWithUser,
  ) {
    return this.userService.setCustomPermissions(
      id,
      dto.custom_permissions,
      tenantId || '',
      req.user.sub,
    );
  }
}
