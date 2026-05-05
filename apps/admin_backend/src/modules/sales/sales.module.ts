import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { Payment } from './entities/payment.entity';
import { InvoiceItemModifier } from './entities/invoice-item-modifier.entity';
import { InvoicesService } from './services/invoices.service';
import { InvoicesController } from './controllers/invoices.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Invoice,
      InvoiceItem,
      Payment,
      InvoiceItemModifier,
    ]),
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class SalesModule {}
