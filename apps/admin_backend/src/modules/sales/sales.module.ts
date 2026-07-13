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
import { InventorySyncOutbox } from '../inventory/entities/inventory-sync-outbox.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { User } from '../identity/entities/user.entity';
import { SyncCreditNoteAuthGuard } from './guards/sync-credit-note-auth.guard';

export const getRequiredSalesJwtSecret = (
  configService: ConfigService,
): string => {
  const secret = configService.get<string>('JWT_SECRET')?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
};

@Module({
  imports: [
    ConfigModule,
    InventoryModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: getRequiredSalesJwtSecret(configService),
      }),
    }),
    TypeOrmModule.forFeature([
      Invoice,
      InvoiceItem,
      Payment,
      InvoiceItemModifier,
      InventoryMovement,
      InventorySyncReceipt,
      InventorySyncOutbox,
      User,
    ]),
  ],
  controllers: [InvoicesController, SyncBatchController, ReportsController],
  providers: [InvoicesService, AuthGuard, RolesGuard, SyncCreditNoteAuthGuard],
  exports: [InvoicesService],
})
export class SalesModule {}
