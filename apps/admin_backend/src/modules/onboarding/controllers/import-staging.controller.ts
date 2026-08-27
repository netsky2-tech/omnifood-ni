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
import { ImportStagingService } from '../services/import-staging.service';
import { UploadBatchDto, CommitImportDto } from '../dto/import-staging.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';

@Controller('onboarding/import')
@UseGuards(AuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ImportStagingController {
  constructor(private readonly importStagingService: ImportStagingService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Post('upload')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async uploadBatch(
    @Body() dto: UploadBatchDto,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.importStagingService.uploadBatch(validTenantId, dto);
  }

  @Post('commit')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async commitImport(
    @Body() dto: CommitImportDto,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.importStagingService.commitImport(validTenantId, dto);
  }

  @Get('errors/:sessionToken')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getFailedRows(
    @Param('sessionToken') sessionToken: string,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.importStagingService.getFailedRows(validTenantId, sessionToken);
  }
}
