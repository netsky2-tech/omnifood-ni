import {
  Body,
  Controller,
  Get,
  Optional,
  Param,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { ImportStagingService } from '../services/import-staging.service';
import {
  UploadBatchDto,
  UploadRawCsvDto,
  CommitImportDto,
} from '../dto/import-staging.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';
import { UserRole } from '../../identity/entities/user.entity';
import {
  CANONICAL_COLUMN_NAMES,
  CANONICAL_IMPORT_CONTRACT_V1,
  generateOfficialProductTemplateCsv,
} from '../services/import-contract-version';
import { LegacyImportIntegrityReportService } from '../services/legacy-import-integrity-report.service';

@Controller('onboarding/import')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class ImportStagingController {
  constructor(
    private readonly importStagingService: ImportStagingService,
    @Optional()
    private readonly integrityReportService?: LegacyImportIntegrityReportService,
  ) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  /**
   * Returns official template CSV and metadata derived from canonical ImportContractVersion (AC-22).
   */
  @Get('template')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  getOfficialTemplate() {
    return {
      version: CANONICAL_IMPORT_CONTRACT_V1.version,
      encoding: CANONICAL_IMPORT_CONTRACT_V1.encodingPolicy,
      delimiters: CANONICAL_IMPORT_CONTRACT_V1.delimiterPolicy,
      columns: CANONICAL_COLUMN_NAMES,
      requiredColumns: CANONICAL_IMPORT_CONTRACT_V1.requiredColumns,
      templateCsv: generateOfficialProductTemplateCsv(),
    };
  }

  /**
   * Upload batch of products as structured DTO rows (backwards compatibility).
   */
  @Post('upload')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_PRODUCT_IMPORT_MANAGE)
  async uploadBatch(
    @Body() dto: UploadBatchDto,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.importStagingService.uploadBatch(validTenantId, dto);
  }

  /**
   * Upload raw CSV text or file payload parsed server-side by canonical parser (AC-14, AC-15).
   */
  @Post('upload-csv')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_PRODUCT_IMPORT_MANAGE)
  async uploadRawCsv(
    @Body() dto: UploadRawCsvDto,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.importStagingService.uploadRawCsv(validTenantId, dto);
  }

  /**
   * Get duplicate preview and conflict diagnostics before commit (AC-23).
   */
  @Get('preview/:sessionToken')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async getPreview(
    @Param('sessionToken') sessionToken: string,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.importStagingService.getPreview(validTenantId, sessionToken);
  }

  /**
   * Commit staged catalog items to live Product Master (AC-19, AC-20, AC-24).
   */
  @Post('commit')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_PRODUCT_IMPORT_MANAGE)
  async commitImport(
    @Body() dto: CommitImportDto,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.importStagingService.commitImport(validTenantId, dto);
  }

  /**
   * Get diagnostic report of failed rows for a session (AC-21).
   */
  @Get('errors/:sessionToken')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async getFailedRows(
    @Param('sessionToken') sessionToken: string,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.importStagingService.getFailedRows(validTenantId, sessionToken);
  }

  /**
   * Export diagnostic report of failed rows as CSV file (AC-21).
   */
  @Get('errors/:sessionToken/csv')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async exportFailedRowsCsv(
    @Param('sessionToken') sessionToken: string,
    @Res() res: Response,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    const errors = await this.importStagingService.getFailedRows(
      validTenantId,
      sessionToken,
    );

    const headers = [
      'fila',
      'nombre_suministrado',
      'sku_suministrado',
      'motivo_error',
    ];
    const lines = [headers.join(',')];

    for (const err of errors) {
      const escapedNombre = `"${(err.rawNombre || '').replace(/"/g, '""')}"`;
      const escapedSku = `"${(err.rawSku || '').replace(/"/g, '""')}"`;
      const escapedReason = `"${(err.reason || '').replace(/"/g, '""')}"`;
      lines.push(
        [err.rowNumber, escapedNombre, escapedSku, escapedReason].join(','),
      );
    }

    const csvOutput = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="errores_importacion_${sessionToken}.csv"`,
    );
    return res.status(200).send(csvOutput);
  }

  /**
   * Run forensic integrity scan for legacy unbacked stock/cost writes (ONB1.4H).
   */
  @Post('integrity-scan')
  @Roles(UserRole.OWNER)
  @RequirePermissions(AppPermission.ONBOARDING_PRODUCT_IMPORT_MANAGE)
  async runIntegrityScan(@GetTenantId() tenantId?: string) {
    const validTenantId = this.requireTenant(tenantId);
    if (!this.integrityReportService) {
      throw new UnauthorizedException('Integrity report service unavailable');
    }
    return this.integrityReportService.generateIntegrityReport(validTenantId);
  }

  /**
   * Expire and reject legacy incompatible staging sessions (ONB1.4H).
   */
  @Post('expire-legacy-staging')
  @Roles(UserRole.OWNER)
  @RequirePermissions(AppPermission.ONBOARDING_PRODUCT_IMPORT_MANAGE)
  async expireLegacyStaging(@GetTenantId() tenantId?: string) {
    const validTenantId = this.requireTenant(tenantId);
    if (!this.integrityReportService) {
      throw new UnauthorizedException('Integrity report service unavailable');
    }
    return this.integrityReportService.expireIncompatibleLegacyStaging(
      validTenantId,
    );
  }
}
