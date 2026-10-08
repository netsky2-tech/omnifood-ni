import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { CustomerPointTransaction } from './entities/customer-point-transaction.entity';
import { CustomersService } from './services/customers.service';
import { CustomersController } from './controllers/customers.controller';
import { CustomerSyncController } from './controllers/customer-sync.controller';
import { CustomerSyncIngestionService } from './services/customer-sync-ingestion.service';
import { IdentityModule } from '../identity/identity.module';
import { DeviceSyncModule } from '../identity/device-sync.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, CustomerPointTransaction]),
    IdentityModule,
    DeviceSyncModule,
  ],
  controllers: [CustomersController, CustomerSyncController],
  providers: [CustomersService, CustomerSyncIngestionService],
  exports: [CustomersService, CustomerSyncIngestionService, TypeOrmModule],
})
export class CustomersModule {}
