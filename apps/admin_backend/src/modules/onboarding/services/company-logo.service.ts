import { BadRequestException, Injectable } from '@nestjs/common';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  TenantBrandAssetService,
  validateLogoUpload,
} from '../../tenant/services/tenant-brand-asset.service';
import { FiscalConfigVersionService } from './fiscal-config-version.service';
import { DataSource } from 'typeorm';

/**
 * The dashboard-facing shape of the CURRENT logo. `null` is a DECLARED
 * absence (S3/S15): a tenant without a logo reads as null everywhere, never
 * as an empty base64 string or a placeholder.
 */
export interface CompanyLogoView {
  readonly sha256: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly base64: string;
}

/**
 * Company identity parity P3, slice 1 (odd/tasks/identidad-empresa-paridad.md,
 * S5) — upload and read the company logo's ORIGINAL.
 *
 * The storage itself is tenant-owned (TenantBrandAssetService); this service
 * is the orchestration that the HTTP endpoint and the versioned channel
 * agree on:
 *
 * - Validation happens COMPLETELY before any write — a rejected upload must
 *   leave the previous logo untouched.
 * - A successful upload REPLACES the single stored row and then records a
 *   fiscal-config revision: the snapshot's payload now carries
 *   `logoSha256` (a REFERENCE — never the bytes; the payload is stored whole
 *   per revision), so a logo change materializes as a NEW REVISION and the
 *   terminal can see it must re-fetch. A logo change is a TERMINAL-CONFIG
 *   change delivered through the existing versioned channel (S2), not a
 *   fiscal one — nothing in the fiscal semantics moves.
 */
@Injectable()
export class CompanyLogoService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantBrandAssetService: TenantBrandAssetService,
    private readonly fiscalConfigVersionService: FiscalConfigVersionService,
  ) {}

  async getLogo(tenantId: string): Promise<CompanyLogoView | null> {
    return this.tenantBrandAssetService.resolveWithBase64(tenantId);
  }

  async uploadLogo(
    tenantId: string,
    payload: { content_type: string; data: string },
  ): Promise<CompanyLogoView> {
    const validation = validateLogoUpload(payload.content_type, payload.data);
    if (validation.upload) {
      const stored = await runInTenantTransaction(
        this.dataSource,
        tenantId,
        (manager) =>
          this.tenantBrandAssetService.replaceWithinManager(
            manager,
            tenantId,
            validation.upload,
          ),
      );

      // After the bytes are committed, materialize the new revision so the
      // sha256 reference reaches the terminals through the snapshot.
      await this.fiscalConfigVersionService.recordRevisionChange(tenantId);

      return {
        sha256: stored.sha256,
        contentType: stored.content_type,
        byteLength: stored.byte_length,
        base64: stored.bytes.toString('base64'),
      };
    }

    // Nothing has been written: the previous logo is untouched by design.
    throw new BadRequestException(
      validation.reason ?? 'The logo upload was rejected',
    );
  }
}
