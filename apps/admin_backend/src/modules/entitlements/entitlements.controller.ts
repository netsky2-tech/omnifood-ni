/**
 * ENT-02 — the entitlements read endpoint.
 *
 * `GET /api/tenant/entitlements` (global prefix `api` is set in `main.ts`) is
 * consumed by the owner dashboard and by the POS on every sync, so it must
 * answer for ANY authenticated role of the tenant and never expose another
 * tenant's contract: the tenant comes from the token, never from the request.
 *
 * ENT-06 adds the READ side of overrides: a tenant may see the audited
 * exceptions recorded against it, but cannot grant one. Writes exist only in
 * the internal CLI (`src/scripts/entitlement-override.ts`), because the
 * backend has no platform role and an `OWNER`-guarded write endpoint would let
 * every tenant grant itself the top plan.
 */
import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { AuthGuard } from '../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { UserRole } from '../identity/entities/user.entity';
import type { EntitlementSnapshotDto } from './dto/entitlement-snapshot.dto';
import {
  EntitlementOverridesService,
  type OverrideHistoryRow,
  type OverrideRow,
} from './entitlement-overrides.service';
import { EntitlementsService } from './entitlements.service';

@Controller('tenant')
@UseGuards(AuthGuard, AuthoritativeCurrentUserGuard)
@UseInterceptors(TenantInterceptor)
export class EntitlementsController {
  constructor(
    private readonly entitlementsService: EntitlementsService,
    private readonly overridesService: EntitlementOverridesService,
  ) {}

  @Get('entitlements')
  getEntitlements(
    @GetTenantId() tenantId: string,
  ): Promise<EntitlementSnapshotDto> {
    return this.entitlementsService.snapshot(tenantId);
  }

  /**
   * Exceptions in force and already expired, so the owner can check what the
   * platform granted and why. Commercial terms: OWNER only.
   */
  @Get('entitlement-overrides')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  getOverrides(@GetTenantId() tenantId: string): Promise<OverrideRow[]> {
    return this.overridesService.list({ tenantId });
  }

  /** The append-only trail of those exceptions (who, why, when). */
  @Get('entitlement-overrides/history')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  getOverrideHistory(
    @GetTenantId() tenantId: string,
  ): Promise<OverrideHistoryRow[]> {
    return this.overridesService.history({ tenantId });
  }
}
