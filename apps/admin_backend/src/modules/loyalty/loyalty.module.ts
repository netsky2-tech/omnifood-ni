import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoyaltyProgram } from './entities/loyalty-program.entity';
import { RewardDefinition } from './entities/reward-definition.entity';
import { CustomerLoyaltyAccountProjection } from './entities/customer-loyalty-account-projection.entity';
import { CustomerPointTransaction } from '../customers/entities/customer-point-transaction.entity';
import { Customer } from '../customers/entities/customer.entity';
import { LoyaltyService } from './services/loyalty.service';
import { LoyaltyLedgerService } from './services/loyalty-ledger.service';
import { LegacyClassificationService } from './services/legacy-classification.service';
import { TicketPaidHandler } from './services/ticket-paid.handler';
import { RedemptionService } from './services/redemption.service';
import { LoyaltyController } from './controllers/loyalty.controller';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LoyaltyProgram,
      RewardDefinition,
      CustomerLoyaltyAccountProjection,
      CustomerPointTransaction,
      Customer,
    ]),
    IdentityModule,
  ],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, LoyaltyLedgerService, LegacyClassificationService, TicketPaidHandler, RedemptionService],
  exports: [LoyaltyService, LoyaltyLedgerService, LegacyClassificationService, TicketPaidHandler, RedemptionService, TypeOrmModule],
})
export class LoyaltyModule {}
