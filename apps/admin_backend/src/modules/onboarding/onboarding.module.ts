import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndustryTemplate } from './entities/industry-template.entity';
import { TemplateInsumo } from './entities/template-insumo.entity';
import { TemplateProduct } from './entities/template-product.entity';
import { TemplateRecipeItem } from './entities/template-recipe-item.entity';
import { ImportStaging } from './entities/import-staging.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SystemParametersConfig } from '../inventory/entities/system-parameters-config.entity';
import { Insumo } from '../inventory/entities/insumo.entity';
import { Product } from '../inventory/entities/product.entity';
import { RecipeVersion } from '../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../inventory/entities/recipe-detail.entity';
import { Recipe } from '../inventory/entities/recipe.entity';
import { UomConversion } from '../inventory/entities/uom-conversion.entity';
import { IndustryTemplateService } from './services/industry-template.service';
import { IndustryTemplateController } from './controllers/industry-template.controller';
import { FiscalSetupService } from './services/fiscal-setup.service';
import { FiscalSetupController } from './controllers/fiscal-setup.controller';
import { ImportStagingService } from './services/import-staging.service';
import { ImportStagingController } from './controllers/import-staging.controller';
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
      Tenant,
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
  ],
  providers: [
    IndustryTemplateService,
    FiscalSetupService,
    ImportStagingService,
  ],
  exports: [
    IndustryTemplateService,
    FiscalSetupService,
    ImportStagingService,
    TypeOrmModule,
  ],
})
export class OnboardingModule {}
