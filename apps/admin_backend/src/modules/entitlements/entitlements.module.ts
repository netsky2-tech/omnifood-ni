import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanCapability } from './entities/plan-capability.entity';
import { TenantSubscription } from './entities/tenant-subscription.entity';
import { TenantEntitlementOverride } from './entities/tenant-entitlement-override.entity';
import { TenantEntitlementChangeHistory } from './entities/tenant-entitlement-change-history.entity';

/**
 * ENT-01 of issue #984: the entitlements module registers the plan catalog
 * and the tenant subscription/override/audit tables. The capability keys
 * themselves live in `capability-registry.ts`, the single code source.
 * Effective-capability resolution (ENT-02), guards (ENT-03) and endpoints
 * land in later slices and are deliberately absent here.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanCapability,
      TenantSubscription,
      TenantEntitlementOverride,
      TenantEntitlementChangeHistory,
    ]),
  ],
})
export class EntitlementsModule {}
