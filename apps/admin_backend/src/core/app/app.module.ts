import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IdentityModule } from '../../modules/identity/identity.module';
import { InventoryModule } from '../../modules/inventory/inventory.module';
import { SalesModule } from '../../modules/sales/sales.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Tenant } from '../../modules/tenant/entities/tenant.entity';
import { User } from '../../modules/identity/entities/user.entity';
import { AuditLog } from '../../modules/identity/entities/audit-log.entity';
import { Insumo } from '../../modules/inventory/entities/insumo.entity';
import { Product } from '../../modules/inventory/entities/product.entity';
import { Recipe } from '../../modules/inventory/entities/recipe.entity';
import { InventoryMovement } from '../../modules/inventory/entities/inventory-movement.entity';
import { Supplier } from '../../modules/inventory/entities/supplier.entity';
import { Warehouse } from '../../modules/inventory/entities/warehouse.entity';
import { UomConversion } from '../../modules/inventory/entities/uom-conversion.entity';
import { Batch } from '../../modules/inventory/entities/batch.entity';
import { Invoice } from '../../modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../modules/sales/entities/invoice-item.entity';
import { Payment } from '../../modules/sales/entities/payment.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', '127.0.0.1'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'admin'),
        database: configService.get<string>('DB_DATABASE', 'omnifood'),
        entities: [
          Tenant,
          User,
          AuditLog,
          Insumo,
          Product,
          Recipe,
          InventoryMovement,
          Supplier,
          Warehouse,
          UomConversion,
          Batch,
          Invoice,
          InvoiceItem,
          Payment,
        ],
        synchronize: true, // Only for development
      }),
    }),
    IdentityModule,
    InventoryModule,
    SalesModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
