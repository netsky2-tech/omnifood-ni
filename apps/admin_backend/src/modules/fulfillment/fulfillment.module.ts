import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { TenantTopologyRevision } from './entities/tenant-topology-revision.entity';
import { TenantFulfillmentRecord } from './entities/tenant-fulfillment-record.entity';
import { Product } from '../inventory/entities/product.entity';
import { Insumo } from '../inventory/entities/insumo.entity';
import { Recipe } from '../inventory/entities/recipe.entity';
import { TenantTopologyRevisionService } from './services/tenant-topology-revision.service';
import { FulfillmentRetentionService } from './services/fulfillment-retention.service';
import { FulfillmentRolloutService } from './services/fulfillment-rollout.service';
import { FulfillmentTopologyController } from './controllers/fulfillment-topology.controller';
import { FulfillmentRetentionController } from './controllers/fulfillment-retention.controller';
import { FulfillmentRolloutController } from './controllers/fulfillment-rollout.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantTopologyRevision,
      TenantFulfillmentRecord,
      Product,
      Insumo,
      Recipe,
    ]),
    IdentityModule,
  ],
  controllers: [
    FulfillmentTopologyController,
    FulfillmentRetentionController,
    FulfillmentRolloutController,
  ],
  providers: [
    TenantTopologyRevisionService,
    FulfillmentRetentionService,
    FulfillmentRolloutService,
  ],
  exports: [
    TenantTopologyRevisionService,
    FulfillmentRetentionService,
    FulfillmentRolloutService,
  ],
})
export class FulfillmentModule {}
