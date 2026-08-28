import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { PromotionsModule } from '../../modules/promotions/promotions.module';
import { Promotion as CloudPromotion } from '../../modules/promotions/entities/promotion.entity';
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
  host: configService.get<string>('DB_HOST', '127.0.0.1'),
  port: configService.get<number>('DB_PORT', 5432),
  username: configService.get<string>('DB_USERNAME', 'postgres'),
  password: getRequiredConfigValue(configService, 'DB_PASSWORD'),
  database: configService.get<string>('DB_DATABASE', 'omnifood'),
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
    Customer,
    CloudPromotion,
    CustomerPointTransaction,
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
    PromotionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
