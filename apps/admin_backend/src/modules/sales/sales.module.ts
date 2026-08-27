import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { Payment } from './entities/payment.entity';
import { InvoiceItemModifier } from './entities/invoice-item-modifier.entity';
import { InvoicesService } from './services/invoices.service';
import { InvoicesController } from './controllers/invoices.controller';
import { SyncBatchController } from './controllers/sync-batch.controller';
import { InboundSyncController } from './controllers/inbound-sync.controller';
import { InboundSyncService } from './services/inbound-sync.service';
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
import { Product } from '../inventory/entities/product.entity';
import { CatalogValue } from '../catalog/entities/catalog-value.entity';
import { Insumo } from '../inventory/entities/insumo.entity';
import { Recipe } from '../inventory/entities/recipe.entity';
import { RecipeVersion } from '../inventory/entities/recipe-version.entity';
import { SyncCreditNoteAuthGuard } from './guards/sync-credit-note-auth.guard';

import { CashShiftSession } from './entities/cash-shift.entity';
import { CashMovement } from './entities/cash-movement.entity';
import { DatafonoEquipo } from './entities/datafono-equipo.entity';
import { CashShiftService } from './services/cash-shift.service';

import { CashShiftController } from './controllers/cash-shift.controller';
import { SalesReportsService } from './services/sales-reports.service';
import { FiscalReportsService } from './services/fiscal-reports.service';
import { SalesExportService } from './services/sales-export.service';

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
      Product,
      CatalogValue,
      Insumo,
      Recipe,
      RecipeVersion,
      CashShiftSession,
      CashMovement,
      DatafonoEquipo,
    ]),
  ],
  controllers: [
    InvoicesController,
    SyncBatchController,
    InboundSyncController,
    ReportsController,
    CashShiftController,
  ],
  providers: [
    InvoicesService,
    InboundSyncService,
    CashShiftService,
    SalesReportsService,
    FiscalReportsService,
    SalesExportService,
    AuthGuard,
    RolesGuard,
    SyncCreditNoteAuthGuard,
  ],
  exports: [
    InvoicesService,
    InboundSyncService,
    CashShiftService,
    SalesReportsService,
    FiscalReportsService,
    SalesExportService,
  ],
})
export class SalesModule {}
