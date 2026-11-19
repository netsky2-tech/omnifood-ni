/**
 * ENT-03 — the endpoint guard for premium capabilities (issue #984, ODD
 * slice ENT-03).
 *
 * Rules it enforces:
 *   1. Only endpoints marked with `@RequireCapability` are checked; every
 *      other route passes untouched. The fiscal and transactional paths
 *      (sales, cash shifts, POS/loyalty sync, catalog, customers) carry no
 *      decorator, so a plan can never block a sale or a DGI document
 *      (catalog §7, ODD S2/S3).
 *   2. Keys are validated with `isCapabilityGated()` at guard time: an
 *      unregistered or non-gateable (nucleus) key in a decorator is a
 *      programming error and FAILS CLOSED with a loud throw — never allows.
 *   3. The tenant id comes EXACTLY from the `@GetTenantId()` sources
 *      (`src/core/decorators/tenant.decorator.ts`): the authenticated device
 *      principal first, then the authenticated user. No new tenant source.
 *   4. The snapshot is resolved through `EntitlementsService.snapshot()`,
 *      which reads under the tenant's RLS context — the guard never queries
 *      entitlement tables itself and never leaks other tenants' data.
 *   5. The snapshot is memoized on the request object, so several guarded
 *      handlers of one request resolve it once and never share cache across
 *      requests.
 *   6. Denial is a clear Spanish 403 naming the missing capability and the
 *      upgrade path (ODD S6) — never the whole snapshot.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isCapabilityGated } from '../capability-registry';
import { assertCapabilitiesGranted } from '../capability-enforcement';
import { CAPABILITY_REQUIREMENT_KEY } from '../decorators/require-capability.decorator';
import { EntitlementsService } from '../entitlements.service';
import type { EntitlementSnapshotDto } from '../dto/entitlement-snapshot.dto';
import type { RequestWithPrincipalOrUser } from '../../../core/decorators/tenant.decorator';

/**
 * Per-request memoization slot. Keyed by the request object itself, so the
 * entry dies with the request: there is no cross-request snapshot cache and
 * no TTL to invalidate.
 */
const requestSnapshots = new WeakMap<object, Promise<EntitlementSnapshotDto>>();

@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Handler-level decorator wins over the class-level one (same rule as
    // @Roles and the rest of the Nest metadata surface).
    const requiredKeys = this.reflector.getAllAndOverride<string[] | undefined>(
      CAPABILITY_REQUIREMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredKeys || requiredKeys.length === 0) {
      return true;
    }

    // Fail closed: an unregistered key makes `isCapabilityGated` throw, and
    // a registered but non-gateable (nucleus) key must never gate anything.
    // Both are programming errors, so they stay loud instead of 403s.
    for (const key of requiredKeys) {
      if (!isCapabilityGated(key)) {
        throw new Error(
          `CAPABILITY_NOT_GATEABLE: "${key}" is registered but not gateable — ` +
            'nucleus keys (catalog §7) may never deny an endpoint via @RequireCapability',
        );
      }
    }

    const request = context
      .switchToHttp()
      .getRequest<RequestWithPrincipalOrUser>();
    // EXACTLY the tenant sources of @GetTenantId, in the same order.
    const tenantId =
      request.devicePrincipal?.tenantId ?? request.user?.tenant_id;
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }

    const snapshot = await this.resolveSnapshotOnce(request, tenantId.trim());
    assertCapabilitiesGranted(snapshot.capabilities, requiredKeys);
    return true;
  }

  private resolveSnapshotOnce(
    request: RequestWithPrincipalOrUser,
    tenantId: string,
  ): Promise<EntitlementSnapshotDto> {
    const cached = requestSnapshots.get(request);
    if (cached !== undefined) {
      return cached;
    }
    const resolved = this.entitlementsService.snapshot(tenantId);
    requestSnapshots.set(request, resolved);
    return resolved;
  }
}
