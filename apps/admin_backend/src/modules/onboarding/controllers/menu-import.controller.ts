import {
  Body,
  Controller,
  Post,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { MenuImportService } from '../services/menu-import.service';
import { MenuImportRequestDto, MenuImportSummary } from '../dto/menu-import.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';

/**
 * Owner-dashboard menu import from Excel (human session transport).
 *
 * Both handlers accept the same base64 workbook payload; there is no
 * server-side staging, so commit re-parses and re-validates. The tenant
 * always comes from the authenticated session (`GetTenantId`), never from
 * the body.
 */
@Controller('onboarding/menu-import')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.MANAGER)
@UseInterceptors(TenantInterceptor)
export class MenuImportController {
  constructor(private readonly menuImportService: MenuImportService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Post('preview')
  async preview(
    @Body() dto: MenuImportRequestDto,
    @GetTenantId() tenantId?: string,
  ): Promise<MenuImportSummary> {
    return this.menuImportService.preview(this.requireTenant(tenantId), dto);
  }

  @Post('commit')
  async commit(
    @Body() dto: MenuImportRequestDto,
    @GetTenantId() tenantId?: string,
  ): Promise<MenuImportSummary> {
    return this.menuImportService.commit(this.requireTenant(tenantId), dto);
  }
}
