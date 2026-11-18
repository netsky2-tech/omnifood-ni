import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanCapability } from './entities/plan-capability.entity';
import { TenantSubscription } from './entities/tenant-subscription.entity';
import { TenantEntitlementOverride } from './entities/tenant-entitlement-override.entity';
import { TenantEntitlementChangeHistory } from './entities/tenant-entitlement-change-history.entity';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementsService } from './entitlements.service';
import { TenantQuotaService } from './tenant-quota.service';

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
 * accounts (`limits.owner_accounts`) — a count that blocks enrolment only,
 * never the sale (catalog §6.2).
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
  providers: [EntitlementsService, TenantQuotaService],
  exports: [EntitlementsService, TenantQuotaService],
})
export class EntitlementsModule {}
