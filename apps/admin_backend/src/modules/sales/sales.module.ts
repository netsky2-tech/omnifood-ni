import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { Payment } from './entities/payment.entity';
import { InvoiceItemModifier } from './entities/invoice-item-modifier.entity';
import { InvoicesService } from './services/invoices.service';
import { InvoicesController } from './controllers/invoices.controller';
import { SyncBatchController } from './controllers/sync-batch.controller';
import { ReportsController } from './controllers/reports.controller';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthGuard } from '../identity/guards/auth.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../inventory/entities/inventory-sync-receipt.entity';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    ConfigModule,
    InventoryModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'super-secret'),
      }),
    }),
    TypeOrmModule.forFeature([
      Invoice,
      InvoiceItem,
      Payment,
      InvoiceItemModifier,
      InventoryMovement,
      InventorySyncReceipt,
    ]),
  ],
  controllers: [InvoicesController, SyncBatchController, ReportsController],
  providers: [InvoicesService, AuthGuard, RolesGuard],
  exports: [InvoicesService],
})
export class SalesModule {}
