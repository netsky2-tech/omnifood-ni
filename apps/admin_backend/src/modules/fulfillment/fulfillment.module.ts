import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { TenantTopologyRevision } from './entities/tenant-topology-revision.entity';
import { TenantFulfillmentRecord } from './entities/tenant-fulfillment-record.entity';
import { TenantTopologyRevisionService } from './services/tenant-topology-revision.service';
import { FulfillmentRetentionService } from './services/fulfillment-retention.service';
import { FulfillmentTopologyController } from './controllers/fulfillment-topology.controller';
import { FulfillmentRetentionController } from './controllers/fulfillment-retention.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantTopologyRevision, TenantFulfillmentRecord]),
    IdentityModule,
  ],
  controllers: [FulfillmentTopologyController, FulfillmentRetentionController],
  providers: [TenantTopologyRevisionService, FulfillmentRetentionService],
  exports: [TenantTopologyRevisionService, FulfillmentRetentionService],
})
export class FulfillmentModule {}
