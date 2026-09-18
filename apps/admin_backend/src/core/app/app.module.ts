import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolveDatabaseConnection } from '../config/database-connection.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IdentityModule } from '../../modules/identity/identity.module';
import { InventoryModule } from '../../modules/inventory/inventory.module';
import { CatalogModule } from '../../modules/catalog/catalog.module';
import { SalesModule } from '../../modules/sales/sales.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { OnboardingModule } from '../../modules/onboarding/onboarding.module';
import { CustomersModule } from '../../modules/customers/customers.module';
import { Customer } from '../../modules/customers/entities/customer.entity';
import { CustomerPointTransaction } from '../../modules/customers/entities/customer-point-transaction.entity';
import { LoyaltyModule } from '../../modules/loyalty/loyalty.module';
import { LoyaltyProgram } from '../../modules/loyalty/entities/loyalty-program.entity';
import { RewardDefinition } from '../../modules/loyalty/entities/reward-definition.entity';
import { CustomerLoyaltyAccountProjection } from '../../modules/loyalty/entities/customer-loyalty-account-projection.entity';
import { AuditModule } from '../../modules/audit/audit.module';
import { ChangeLog } from '../../modules/audit/entities/change-log.entity';
import { PromotionsModule } from '../../modules/promotions/promotions.module';
import { Promotion as CloudPromotion } from '../../modules/promotions/entities/promotion.entity';
import { FulfillmentModule } from '../../modules/fulfillment/fulfillment.module';
import { TenantTopologyRevision } from '../../modules/fulfillment/entities/tenant-topology-revision.entity';
import { TenantFulfillmentRecord } from '../../modules/fulfillment/entities/tenant-fulfillment-record.entity';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { Tenant } from '../../modules/tenant/entities/tenant.entity';
import { User } from '../../modules/identity/entities/user.entity';
import { AuditLog } from '../../modules/identity/entities/audit-log.entity';
import { AuditIntegrityAlert } from '../../modules/identity/entities/audit-integrity-alert.entity';
import { SecurityProfile } from '../../modules/identity/entities/security-profile.entity';
import { Insumo } from '../../modules/inventory/entities/insumo.entity';
import { Product } from '../../modules/inventory/entities/product.entity';
import { Recipe } from '../../modules/inventory/entities/recipe.entity';
import { RecipeVersion } from '../../modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../modules/inventory/entities/recipe-detail.entity';
import { InventoryMovement } from '../../modules/inventory/entities/inventory-movement.entity';
import { InventorySyncOutbox } from '../../modules/inventory/entities/inventory-sync-outbox.entity';
import { InventorySyncReceipt } from '../../modules/inventory/entities/inventory-sync-receipt.entity';
import { Supplier } from '../../modules/inventory/entities/supplier.entity';
import { Warehouse } from '../../modules/inventory/entities/warehouse.entity';
import { UomConversion } from '../../modules/inventory/entities/uom-conversion.entity';
import { Batch } from '../../modules/inventory/entities/batch.entity';
import { BcnFxRate } from '../../modules/inventory/entities/bcn-fx-rate.entity';
import { PurchaseDocument } from '../../modules/inventory/entities/purchase-document.entity';
import { ProductionOrder } from '../../modules/inventory/entities/production-order.entity';
import { ProductionOrderLine } from '../../modules/inventory/entities/production-order-line.entity';
import { ProductionBatchHistory } from '../../modules/inventory/entities/production-batch-history.entity';
import { Shrinkage } from '../../modules/inventory/entities/shrinkage.entity';
import { ShrinkageDetail } from '../../modules/inventory/entities/shrinkage-detail.entity';
import { SystemParametersConfig } from '../../modules/inventory/entities/system-parameters-config.entity';
import { KardexRecalculateQueue } from '../../modules/inventory/entities/kardex-recalculate-queue.entity';
import { KardexCorrection } from '../../modules/inventory/entities/kardex-correction.entity';
import { CatalogValue } from '../../modules/catalog/entities/catalog-value.entity';
import { Invoice } from '../../modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../modules/sales/entities/invoice-item.entity';
import { Payment } from '../../modules/sales/entities/payment.entity';
import { InvoiceItemModifier } from '../../modules/sales/entities/invoice-item-modifier.entity';
import { CashShiftSession } from '../../modules/sales/entities/cash-shift.entity';
import { CashMovement } from '../../modules/sales/entities/cash-movement.entity';
import { DatafonoEquipo } from '../../modules/sales/entities/datafono-equipo.entity';
import { IndustryTemplate } from '../../modules/onboarding/entities/industry-template.entity';
import { TemplateInsumo } from '../../modules/onboarding/entities/template-insumo.entity';
import { TemplateProduct } from '../../modules/onboarding/entities/template-product.entity';
import { TemplateRecipeItem } from '../../modules/onboarding/entities/template-recipe-item.entity';
import { ImportStaging } from '../../modules/onboarding/entities/import-staging.entity';
import { OnboardingSession } from '../../modules/onboarding/entities/onboarding-session.entity';
import { OnboardingIdempotencyRecord } from '../../modules/onboarding/entities/onboarding-idempotency.entity';
import { TemplateApplication } from '../../modules/onboarding/entities/template-application.entity';
import { TemplateSeedLink } from '../../modules/onboarding/entities/template-seed-link.entity';
import { LegacyOnboardingMigrationReceipt } from '../../modules/onboarding/entities/legacy-migration-receipt.entity';
import { FiscalConfigRevision } from '../../modules/onboarding/entities/fiscal-config-revision.entity';
import { ActivationAttempt } from '../../modules/onboarding/entities/activation-attempt.entity';
import { ActivationCheckResult } from '../../modules/onboarding/entities/activation-check-result.entity';
import { ActivationFollowUp } from '../../modules/onboarding/entities/activation-follow-up.entity';
import { OnboardingTelemetryEvent } from '../../modules/onboarding/entities/onboarding-telemetry-event.entity';
import { ProductImportSession } from '../../modules/onboarding/entities/product-import-session.entity';
import { LegacyImportIntegrityReport } from '../../modules/onboarding/entities/legacy-import-integrity-report.entity';

import { InventoryRemediationReceipt } from '../../modules/inventory/entities/inventory-remediation-receipt.entity';
import { ProductInventoryMappingVersion } from '../../modules/inventory/entities/product-inventory-mapping-version.entity';
import { DeviceSyncCredential } from '../../modules/identity/entities/device-sync-credential.entity';
import { DeviceSyncCredentialEvent } from '../../modules/identity/entities/device-sync-credential-event.entity';
import { DeviceSyncModule } from '../../modules/identity/device-sync.module';
export const getRequiredConfigValue = (
  configService: ConfigService,
  key: string,
): string => {
  const value = configService.get<string>(key)?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
};

export const createTypeOrmOptions = (configService: ConfigService) => ({
  type: 'postgres' as const,
  // Existing contract: the serving process requires an explicit DB password in
  // every environment, including local development, so `getRequiredConfigValue`
  // throws before any resolver default can apply.
  //
  // Credentials are resolved by the pure runtime resolver: under
  // NODE_ENV=production it fails closed instead of silently defaulting the
  // serving role to `postgres`/`omnifood`, validates DB_PORT, and never reads
  // the migration-owner credentials (`DB_MIGRATION_*`).
  ...resolveDatabaseConnection({
    role: 'runtime',
    env: {
      NODE_ENV: configService.get<string>('NODE_ENV'),
      DB_HOST: configService.get<string>('DB_HOST'),
      DB_PORT: configService.get<string>('DB_PORT'),
      DB_USERNAME: configService.get<string>('DB_USERNAME'),
      DB_PASSWORD: getRequiredConfigValue(configService, 'DB_PASSWORD'),
      DB_DATABASE: configService.get<string>('DB_DATABASE'),
    },
  }),
  entities: [
    Tenant,
    User,
    SecurityProfile,
    AuditLog,
    AuditIntegrityAlert,
    Insumo,
    Product,
    Recipe,
    RecipeVersion,
    RecipeDetail,
    InventoryMovement,
    InventorySyncOutbox,
    InventorySyncReceipt,
    Supplier,
    Warehouse,
    UomConversion,
    Batch,
    BcnFxRate,
    PurchaseDocument,
    ProductionOrder,
    ProductionOrderLine,
    ProductionBatchHistory,
    Shrinkage,
    ShrinkageDetail,
    SystemParametersConfig,
    KardexRecalculateQueue,
    KardexCorrection,
    CatalogValue,
    Invoice,
    InvoiceItem,
    Payment,
    InvoiceItemModifier,
    CashShiftSession,
    CashMovement,
    DatafonoEquipo,
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
    FiscalConfigRevision,
    ActivationAttempt,
    ActivationCheckResult,
    ActivationFollowUp,
    OnboardingTelemetryEvent,
    ProductImportSession,
    LegacyImportIntegrityReport,
    Customer,
    CloudPromotion,
    CustomerPointTransaction,
    ChangeLog,
    LoyaltyProgram,
    RewardDefinition,
    CustomerLoyaltyAccountProjection,
    TenantTopologyRevision,
    TenantFulfillmentRecord,
    ProductInventoryMappingVersion,
    InventoryRemediationReceipt,
    DeviceSyncCredential,
    DeviceSyncCredentialEvent,
  ],
  synchronize: false,
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createTypeOrmOptions(configService),
    }),
    IdentityModule,
    InventoryModule,
    CatalogModule,
    SalesModule,
    NotificationsModule,
    OnboardingModule,
    CustomersModule,
    LoyaltyModule,
    PromotionsModule,
    AuditModule,
    FulfillmentModule,
    DeviceSyncModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
