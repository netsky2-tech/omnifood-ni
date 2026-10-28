import {
  Controller,
  Get,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { SyncTransportGuard } from '../../identity/guards/sync-transport.guard';
import { RequireSyncScopes } from '../../identity/decorators/sync-scopes.decorator';
import { TenantBrandAssetService } from '../../tenant/services/tenant-brand-asset.service';

/**
 * The device-facing shape of the company logo's ORIGINAL. `present: false` is
 * a DECLARED absence (S3/S15): a tenant without a logo reads as an explicit
 * false, never as an empty base64 string or a placeholder the terminal could
 * mistake for bytes.
 */
export interface DeviceCompanyLogoResponse {
  readonly present: boolean;
  readonly sha256?: string;
  readonly contentType?: string;
  readonly byteLength?: number;
  readonly base64?: string;
}

/**
 * Company identity parity P4 (odd/tasks/identidad-empresa-paridad.md, S5/S7,
 * L4) — the DEVICE transport the terminal needs to adopt the company logo.
 *
 * The dashboard read (GET /onboarding/company-logo) is HUMAN transport: an
 * operator session JWT, useless to an offline-PIN terminal. Adoption is a
 * human DECISION executed by the DEVICE, so the original bytes must be
 * readable on the device channel. This route mirrors the existing inbound
 * sync surface exactly: SyncTransportGuard (device-sync JWT, credential row,
 * tenant binding), the `sync:pull` scope, and the same declared-presence
 * read shape — never a second authorization idea.
 *
 * Inertness note (S7): this route only READS the stored original. Nothing on
 * the terminal writes `printer_logo_*` unless a human explicitly applies the
 * logo from the hardware screen; a terminal that never calls this route
 * keeps printing exactly what it prints today.
 */
@Controller('v1/sync/inbound/company-logo')
@UseGuards(SyncTransportGuard)
@RequireSyncScopes('sync:pull')
export class CompanyLogoDeviceController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantBrandAssetService: TenantBrandAssetService,
  ) {}

  @Get()
  async getCompanyLogoOriginal(
    @GetTenantId() tenantId?: string,
  ): Promise<DeviceCompanyLogoResponse> {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    const tenant = tenantId.trim();
    // The guard's transaction-local `app.tenant_id` binding commits before
    // this handler runs, so a read through global pooled repositories would
    // not see it (issue #470): every read rides this handler's own
    // tenant-bound transaction, exactly like InboundSyncController.
    return runInTenantTransaction(this.dataSource, tenant, async (manager) => {
      const logo = await this.tenantBrandAssetService.resolveWithinManager(
        manager,
        tenant,
      );
      if (!logo.present) {
        return { present: false };
      }
      return {
        present: true,
        sha256: logo.sha256,
        contentType: logo.contentType,
        byteLength: logo.bytes.length,
        base64: logo.bytes.toString('base64'),
      };
    });
  }
}
