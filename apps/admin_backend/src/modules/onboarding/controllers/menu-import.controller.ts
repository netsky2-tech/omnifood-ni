import {
  Body,
  Controller,
  Get,
  Post,
  StreamableFile,
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

/** MIME type of the downloadable .xlsx menu-import template. */
export const MENU_IMPORT_TEMPLATE_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Download filename of the menu-import template. */
export const MENU_IMPORT_TEMPLATE_FILENAME = 'plantilla_menu.xlsx';

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

  /**
   * Ready-to-fill .xlsx template download. The workbook streams straight
   * from memory (no disk, no staging): the browser saves it as
   * plantilla_menu.xlsx, the owner fills it, and posts it back to preview.
   */
  @Get('template')
  async template(@GetTenantId() tenantId?: string): Promise<StreamableFile> {
    this.requireTenant(tenantId);
    const workbook = await this.menuImportService.buildTemplate();
    return new StreamableFile(workbook, {
      type: MENU_IMPORT_TEMPLATE_MIME_TYPE,
      disposition: `attachment; filename="${MENU_IMPORT_TEMPLATE_FILENAME}"`,
    });
  }
}
