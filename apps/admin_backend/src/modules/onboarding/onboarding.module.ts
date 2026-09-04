import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndustryTemplate } from './entities/industry-template.entity';
import { TemplateInsumo } from './entities/template-insumo.entity';
import { TemplateProduct } from './entities/template-product.entity';
import { TemplateRecipeItem } from './entities/template-recipe-item.entity';
import { ImportStaging } from './entities/import-staging.entity';
import { OnboardingSession } from './entities/onboarding-session.entity';
import { OnboardingIdempotencyRecord } from './entities/onboarding-idempotency.entity';
import { TemplateApplication } from './entities/template-application.entity';
import { TemplateSeedLink } from './entities/template-seed-link.entity';
import { LegacyOnboardingMigrationReceipt } from './entities/legacy-migration-receipt.entity';
import { ProductImportSession } from './entities/product-import-session.entity';
import { LegacyImportIntegrityReport } from './entities/legacy-import-integrity-report.entity';
import { FiscalConfigRevision } from './entities/fiscal-config-revision.entity';
import { ActivationAttempt } from './entities/activation-attempt.entity';
import { ActivationCheckResult } from './entities/activation-check-result.entity';
import { ActivationFollowUp } from './entities/activation-follow-up.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { User } from '../identity/entities/user.entity';
import { SystemParametersConfig } from '../inventory/entities/system-parameters-config.entity';
import { Insumo } from '../inventory/entities/insumo.entity';
import { Product } from '../inventory/entities/product.entity';
import { RecipeVersion } from '../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../inventory/entities/recipe-detail.entity';
import { Recipe } from '../inventory/entities/recipe.entity';
import { UomConversion } from '../inventory/entities/uom-conversion.entity';
import { Warehouse } from '../inventory/entities/warehouse.entity';
import { Supplier } from '../inventory/entities/supplier.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { IndustryTemplateService } from './services/industry-template.service';
import { TemplatePreviewService } from './services/template-preview.service';
import { LegacyTemplateRecipeScanService } from './services/legacy-template-recipe-scan.service';
import { LegacyImportIntegrityReportService } from './services/legacy-import-integrity-report.service';
import { CanonicalCsvParserService } from './services/canonical-csv-parser.service';
import { IndustryTemplateController } from './controllers/industry-template.controller';
import { FiscalSetupService } from './services/fiscal-setup.service';
import { FiscalConfigVersionService } from './services/fiscal-config-version.service';
import { FiscalSetupController } from './controllers/fiscal-setup.controller';
import { ImportStagingService } from './services/import-staging.service';
import { ImportStagingController } from './controllers/import-staging.controller';
import { OnboardingSessionService } from './services/onboarding-session.service';
import { OnboardingReadinessEvaluator } from './services/onboarding-readiness.evaluator';
import { OnboardingStateReconciler } from './services/onboarding-state.reconciler';
import { OnboardingIdempotencyCoordinator } from './services/onboarding-idempotency.coordinator';
import { OnboardingSessionController } from './controllers/onboarding-session.controller';
import { OnboardingCatalogService } from './services/onboarding-catalog.service';
import { OnboardingCatalogController } from './controllers/onboarding-catalog.controller';
import { ActivationService } from './services/activation.service';
import { ActivationController } from './controllers/activation.controller';
import { IDENTITY_READINESS_PORT } from './ports/identity-readiness.port';
import { FISCAL_READINESS_PORT } from './ports/fiscal-readiness.port';
import { CATALOG_READINESS_PORT } from './ports/catalog-readiness.port';
import { INVENTORY_READINESS_PORT } from './ports/inventory-readiness.port';
import { COSTING_READINESS_PORT } from './ports/costing-readiness.port';
import { OPERATIONS_READINESS_PORT } from './ports/operations-readiness.port';
import { IdentityReadinessAdapter } from './adapters/identity-readiness.adapter';
import { FiscalReadinessAdapter } from './adapters/fiscal-readiness.adapter';
import { CatalogReadinessAdapter } from './adapters/catalog-readiness.adapter';
import { InventoryReadinessAdapter } from './adapters/inventory-readiness.adapter';
import { CostingReadinessAdapter } from './adapters/costing-readiness.adapter';
import { OperationsReadinessAdapter } from './adapters/operations-readiness.adapter';
import { IdentityModule } from '../identity/identity.module';
import { AuditModule } from '../audit/audit.module';

export const getRequiredOnboardingJwtSecret = (
  configService: ConfigService,
): string => {
  const secret = configService.get<string>('JWT_SECRET');
  if (!secret?.trim()) {
    throw new Error('JWT_SECRET is required for OnboardingModule');
  }
  return secret;
};

@Module({
  imports: [
    ConfigModule,
    IdentityModule,
    AuditModule,
    TypeOrmModule.forFeature([
      IndustryTemplate,
      TemplateInsumo,
      TemplateProduct,
      TemplateRecipeItem,
      ImportStaging,
      OnboardingSession,
      OnboardingIdempotencyRecord,
      TemplateApplication,
      TemplateSeedLink,
      LegacyOnboardingMigrationReceipt,
      ProductImportSession,
      LegacyImportIntegrityReport,
      FiscalConfigRevision,
      ActivationAttempt,
      ActivationCheckResult,
      ActivationFollowUp,
      Tenant,
      User,
      SystemParametersConfig,
      Insumo,
      Product,
      RecipeVersion,
      RecipeDetail,
      Recipe,
      UomConversion,
      Warehouse,
      Supplier,
      InventoryMovement,
    ]),
  ],
  controllers: [
    IndustryTemplateController,
    FiscalSetupController,
    ImportStagingController,
    OnboardingSessionController,
    OnboardingCatalogController,
    ActivationController,
  ],
  providers: [
    IndustryTemplateService,
    TemplatePreviewService,
    LegacyTemplateRecipeScanService,
    LegacyImportIntegrityReportService,
    CanonicalCsvParserService,
    FiscalSetupService,
    FiscalConfigVersionService,
    ImportStagingService,
    OnboardingSessionService,
    OnboardingReadinessEvaluator,
    OnboardingStateReconciler,
    OnboardingIdempotencyCoordinator,
    OnboardingCatalogService,
    ActivationService,
    {
      provide: IDENTITY_READINESS_PORT,
      useClass: IdentityReadinessAdapter,
    },
    {
      provide: FISCAL_READINESS_PORT,
      useClass: FiscalReadinessAdapter,
    },
    {
      provide: CATALOG_READINESS_PORT,
      useClass: CatalogReadinessAdapter,
    },
    {
      provide: INVENTORY_READINESS_PORT,
      useClass: InventoryReadinessAdapter,
    },
    {
      provide: COSTING_READINESS_PORT,
      useClass: CostingReadinessAdapter,
    },
    {
      provide: OPERATIONS_READINESS_PORT,
      useClass: OperationsReadinessAdapter,
    },
  ],
  exports: [
    IndustryTemplateService,
    TemplatePreviewService,
    LegacyTemplateRecipeScanService,
    LegacyImportIntegrityReportService,
    CanonicalCsvParserService,
    FiscalSetupService,
    FiscalConfigVersionService,
    ImportStagingService,
    OnboardingSessionService,
    OnboardingReadinessEvaluator,
    OnboardingStateReconciler,
    OnboardingIdempotencyCoordinator,
    OnboardingCatalogService,
    ActivationService,
    TypeOrmModule,
  ],
})
export class OnboardingModule {}
