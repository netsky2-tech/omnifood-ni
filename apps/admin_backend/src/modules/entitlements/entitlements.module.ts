import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PlanCapability } from './entities/plan-capability.entity';
import { TenantSubscription } from './entities/tenant-subscription.entity';
import { TenantEntitlementOverride } from './entities/tenant-entitlement-override.entity';
import { TenantEntitlementChangeHistory } from './entities/tenant-entitlement-change-history.entity';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementOverridesService } from './entitlement-overrides.service';
import { EntitlementsService } from './entitlements.service';
import { TenantQuotaService } from './tenant-quota.service';
import { CurrentUserAuthorizationService } from '../identity/services/current-user-authorization.service';
import { AuthGuard } from '../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../identity/guards/authoritative-current-user.guard';
import {
  IDENTITY_JWT_CONFIG,
  IdentityJwtConfigModule,
  type IdentityJwtConfig,
} from '../identity/config/identity-jwt.config';

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
 * ENT-03b: `TenantQuotaService` counts seats (`limits.terminals`) and owner
 * accounts (`limits.owner_accounts`) — a count that blocks enrolment only,
 * never the sale (catalog §6.2).
 * ENT-06: `EntitlementOverridesService` grants and revokes audited exceptions
 * (internal CLI only) and serves their read side. There is still no HTTP write
 * path: the backend has no platform role, so an OWNER-guarded write would let
 * a tenant grant itself the top plan.
 *
 * The controller is guarded by `@UseGuards(AuthGuard,
 * AuthoritativeCurrentUserGuard)`, so this module must resolve what those
 * guards inject — exactly the wiring `IdentityModule` uses, never a local
 * copy of the secret: `IdentityJwtConfigModule` provides `IDENTITY_JWT_CONFIG`
 * and `JwtModule.registerAsync` derives the signer options from it with the
 * same factory shape (secret/algorithm/TTL/issuer/audience).
 * `CurrentUserAuthorizationService` backs the authoritative guard; like the
 * other two services it only needs the global `DataSource`, so providing it
 * here is the same object graph `IdentityModule` builds — and guards are
 * resolved in the declaring controller's module, so they must be listed here.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanCapability,
      TenantSubscription,
      TenantEntitlementOverride,
      TenantEntitlementChangeHistory,
    ]),
    IdentityJwtConfigModule,
    JwtModule.registerAsync({
      imports: [IdentityJwtConfigModule],
      inject: [IDENTITY_JWT_CONFIG],
      useFactory: (config: IdentityJwtConfig) => ({
        secret: config.secret,
        signOptions: {
          algorithm: config.algorithm,
          expiresIn: config.accessTokenTtlSeconds,
          issuer: config.issuer,
          audience: config.audience,
        },
      }),
    }),
  ],
  controllers: [EntitlementsController],
  providers: [
    EntitlementsService,
    TenantQuotaService,
    EntitlementOverridesService,
    // The guard chain of EntitlementsController (AuthGuard →
    // AuthoritativeCurrentUserGuard), resolved in THIS module's context.
    AuthGuard,
    AuthoritativeCurrentUserGuard,
    CurrentUserAuthorizationService,
  ],
  exports: [
    EntitlementsService,
    TenantQuotaService,
    EntitlementOverridesService,
  ],
})
export class EntitlementsModule {}
