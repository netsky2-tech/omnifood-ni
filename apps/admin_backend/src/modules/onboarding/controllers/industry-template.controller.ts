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
import { ApplyTemplateDto } from '../dto/apply-template.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';

@Controller('onboarding/templates')
@UseGuards(AuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class IndustryTemplateController {
  constructor(
    private readonly industryTemplateService: IndustryTemplateService,
  ) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async listTemplates() {
    return this.industryTemplateService.listTemplates();
  }

  @Get(':code')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getTemplate(@Param('code') code: string) {
    return this.industryTemplateService.getTemplateByCode(code);
  }

  @Post(':code/apply')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async applyTemplate(
    @Param('code') code: string,
    @Body() dto: ApplyTemplateDto,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.industryTemplateService.applyTemplate(validTenantId, code, dto);
  }
}
