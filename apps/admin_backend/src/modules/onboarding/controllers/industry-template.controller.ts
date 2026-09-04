import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IndustryTemplateService } from '../services/industry-template.service';
import {
  TemplatePreviewService,
  TemplatePreviewOptions,
} from '../services/template-preview.service';
import {
  LegacyTemplateRecipeScanService,
  ScanOptions,
} from '../services/legacy-template-recipe-scan.service';
import { ApplyTemplateDto } from '../dto/apply-template.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';
import { UserRole } from '../../identity/entities/user.entity';

@Controller('onboarding/templates')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class IndustryTemplateController {
  constructor(
    private readonly industryTemplateService: IndustryTemplateService,
    private readonly templatePreviewService: TemplatePreviewService,
    private readonly legacyScanService: LegacyTemplateRecipeScanService,
  ) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async listTemplates() {
    return this.industryTemplateService.listTemplates();
  }

  @Get(':code')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async getTemplate(@Param('code') code: string) {
    return this.industryTemplateService.getTemplateByCode(code);
  }

  @Post(':code/preview')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async previewTemplate(
    @Param('code') code: string,
    @Body() dto: TemplatePreviewOptions,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.templatePreviewService.buildPreview(validTenantId, code, dto);
  }

  @Post('legacy-recipe-scan')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_TEMPLATE_APPLY)
  async scanLegacyRecipes(
    @Body() dto: ScanOptions,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.legacyScanService.scanAndRemediate(validTenantId, dto);
  }

  @Post(':code/apply')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_TEMPLATE_APPLY)
  async applyTemplate(
    @Param('code') code: string,
    @Body() dto: ApplyTemplateDto,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.industryTemplateService.applyTemplate(validTenantId, code, dto);
  }
}
