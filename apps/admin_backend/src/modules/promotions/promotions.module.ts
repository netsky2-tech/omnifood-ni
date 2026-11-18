import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promotion } from './entities/promotion.entity';
import { PromotionsService } from './services/promotions.service';
import { PromotionsController } from './controllers/promotions.controller';
import { IdentityModule } from '../identity/identity.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';

@Module({
  // ENT-03: EntitlementsModule provides EntitlementsService for the
  // CapabilitiesGuard on PromotionsController and the service-level
  // promotions.convenio check.
  imports: [
    TypeOrmModule.forFeature([Promotion]),
    IdentityModule,
    EntitlementsModule,
  ],
  controllers: [PromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService, TypeOrmModule],
})
export class PromotionsModule {}
