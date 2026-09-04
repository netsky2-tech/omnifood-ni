import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
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
import { Tenant } from '../tenant/entities/tenant.entity';
import { User } from '../identity/entities/user.entity';
import { SystemParametersConfig } from '../inventory/entities/system-parameters-config.entity';
import { Insumo } from '../inventory/entities/insumo.entity';
import { Product } from '../inventory/entities/product.entity';
import { RecipeVersion } from '../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../inventory/entities/recipe-detail.entity';
import { Recipe } from '../inventory/entities/recipe.entity';
import { UomConversion } from '../inventory/entities/uom-conversion.entity';
import { IndustryTemplateService } from './services/industry-template.service';
import { TemplatePreviewService } from './services/template-preview.service';
import { LegacyTemplateRecipeScanService } from './services/legacy-template-recipe-scan.service';
import { LegacyImportIntegrityReportService } from './services/legacy-import-integrity-report.service';
import { CanonicalCsvParserService } from './services/canonical-csv-parser.service';
import { IndustryTemplateController } from './controllers/industry-template.controller';
import { FiscalSetupService } from './services/fiscal-setup.service';
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
import { IDENTITY_READINESS_PORT } from './ports/identity-readiness.port';
import { FISCAL_READINESS_PORT } from './ports/fiscal-readiness.port';
import { CATALOG_READINESS_PORT } from './ports/catalog-readiness.port';
import { IdentityReadinessAdapter } from './adapters/identity-readiness.adapter';
import { FiscalReadinessAdapter } from './adapters/fiscal-readiness.adapter';
import { CatalogReadinessAdapter } from './adapters/catalog-readiness.adapter';
import { IdentityModule } from '../identity/identity.module';

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
      Tenant,
      User,
      SystemParametersConfig,
      Insumo,
      Product,
      RecipeVersion,
      RecipeDetail,
      Recipe,
      UomConversion,
    ]),
  ],
  controllers: [
    IndustryTemplateController,
    FiscalSetupController,
    ImportStagingController,
    OnboardingSessionController,
    OnboardingCatalogController,
  ],
  providers: [
    IndustryTemplateService,
    TemplatePreviewService,
    LegacyTemplateRecipeScanService,
    LegacyImportIntegrityReportService,
    CanonicalCsvParserService,
    FiscalSetupService,
    ImportStagingService,
    OnboardingSessionService,
    OnboardingReadinessEvaluator,
    OnboardingStateReconciler,
    OnboardingIdempotencyCoordinator,
    OnboardingCatalogService,
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
  ],
  exports: [
    IndustryTemplateService,
    TemplatePreviewService,
    LegacyTemplateRecipeScanService,
    LegacyImportIntegrityReportService,
    CanonicalCsvParserService,
    FiscalSetupService,
    ImportStagingService,
    OnboardingSessionService,
    OnboardingReadinessEvaluator,
    OnboardingStateReconciler,
    OnboardingIdempotencyCoordinator,
    OnboardingCatalogService,
    TypeOrmModule,
  ],
})
export class OnboardingModule {}
