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
import { InventoryMovement } from '../../modules/inventory/entities/inventory-movement.entity';
import { Supplier } from '../../modules/inventory/entities/supplier.entity';
import { Warehouse } from '../../modules/inventory/entities/warehouse.entity';
import { UomConversion } from '../../modules/inventory/entities/uom-conversion.entity';
import { Batch } from '../../modules/inventory/entities/batch.entity';
import { CatalogValue } from '../../modules/catalog/entities/catalog-value.entity';
import { Invoice } from '../../modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../modules/sales/entities/invoice-item.entity';
import { Payment } from '../../modules/sales/entities/payment.entity';
import { InvoiceItemModifier } from '../../modules/sales/entities/invoice-item-modifier.entity';

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

export const createTypeOrmOptions = (
  configService: ConfigService,
  nodeEnv: string = process.env.NODE_ENV ?? 'development',
) => ({
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
    InventoryMovement,
    Supplier,
    Warehouse,
    UomConversion,
    Batch,
    CatalogValue,
    Invoice,
    InvoiceItem,
    Payment,
    InvoiceItemModifier,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
