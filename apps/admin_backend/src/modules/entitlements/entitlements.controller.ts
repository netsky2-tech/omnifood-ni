/**
 * ENT-02 — the entitlements read endpoint.
 *
 * `GET /api/tenant/entitlements` (global prefix `api` is set in `main.ts`) is
 * consumed by the owner dashboard and by the POS on every sync, so it must
 * answer for ANY authenticated role of the tenant and never expose another
 * tenant's contract: the tenant comes from the token, never from the request.
 *
 * No role restriction is intentional; there is no write path here.
 */
import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { AuthGuard } from '../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../identity/guards/authoritative-current-user.guard';
import type { EntitlementSnapshotDto } from './dto/entitlement-snapshot.dto';
import { EntitlementsService } from './entitlements.service';

@Controller('tenant')
@UseGuards(AuthGuard, AuthoritativeCurrentUserGuard)
@UseInterceptors(TenantInterceptor)
export class EntitlementsController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Get('entitlements')
  getEntitlements(
    @GetTenantId() tenantId: string,
  ): Promise<EntitlementSnapshotDto> {
    return this.entitlementsService.snapshot(tenantId);
  }
}
