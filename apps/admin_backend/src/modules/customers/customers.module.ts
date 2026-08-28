import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { CustomerPointTransaction } from './entities/customer-point-transaction.entity';
import { CustomersService } from './services/customers.service';
import { CustomersController } from './controllers/customers.controller';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, CustomerPointTransaction]),
    IdentityModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService, TypeOrmModule],
})
export class CustomersModule {}
