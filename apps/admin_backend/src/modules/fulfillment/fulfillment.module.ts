import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { TenantTopologyRevision } from './entities/tenant-topology-revision.entity';
import { TenantTopologyRevisionService } from './services/tenant-topology-revision.service';
import { FulfillmentTopologyController } from './controllers/fulfillment-topology.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TenantTopologyRevision]), IdentityModule],
  controllers: [FulfillmentTopologyController],
  providers: [TenantTopologyRevisionService],
  exports: [TenantTopologyRevisionService],
})
export class FulfillmentModule {}
