import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanCapability } from './entities/plan-capability.entity';
import { TenantSubscription } from './entities/tenant-subscription.entity';
import { TenantEntitlementOverride } from './entities/tenant-entitlement-override.entity';
import { TenantEntitlementChangeHistory } from './entities/tenant-entitlement-change-history.entity';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementOverridesService } from './entitlement-overrides.service';
import { EntitlementsService } from './entitlements.service';
import { TenantQuotaService } from './tenant-quota.service';
import { TenantSubscriptionService } from './tenant-subscription.service';

/**
 * Issue #984 entitlements.
 *
 * ENT-01: the plan catalog (`plan_capability`) and the tenant contract tables
 * (subscription, override, change history) with RLS.
 * ENT-02: effective-capability resolution (`entitlement-resolution.ts`, pure)
 * served through `GET /api/tenant/entitlements`.
 * ENT-03: `CapabilitiesGuard` / `@RequireCapability` gate the PREMIUM
 * endpoints of other modules (which import this module); the administrative
 * write paths land in later slices and are deliberately absent here.
 * ENT-03b: `TenantQuotaService` counts seats (`limits.terminals`) and owner
 * ENT-06: `EntitlementOverridesService` grants and revokes audited exceptions
 * (internal CLI only) and serves their read side. There is still no HTTP write
 * path: the backend has no platform role, so an OWNER-guarded write would let
 * a tenant grant itself the top plan.
 * ENT-07: `TenantSubscriptionService` writes audited plan changes and add-ons
 * (internal CLI only, same no-write-route decision) with the same
 * transaction + audit row + snapshot post-condition shape as the exceptions.
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
  controllers: [EntitlementsController],
  providers: [
    EntitlementsService,
    TenantQuotaService,
    EntitlementOverridesService,
    TenantSubscriptionService,
  ],
  exports: [
    EntitlementsService,
    TenantQuotaService,
    EntitlementOverridesService,
    TenantSubscriptionService,
  ],
})
export class EntitlementsModule {}
