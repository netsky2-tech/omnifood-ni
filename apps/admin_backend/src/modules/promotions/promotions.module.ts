import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promotion } from './entities/promotion.entity';
import { PromotionsService } from './services/promotions.service';
import { PromotionsController } from './controllers/promotions.controller';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [TypeOrmModule.forFeature([Promotion]), IdentityModule],
  controllers: [PromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService, TypeOrmModule],
})
export class PromotionsModule {}
