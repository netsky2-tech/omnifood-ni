import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantBrandAsset } from './entities/tenant-brand-asset.entity';
import { CompanyIdentityService } from './services/company-identity.service';
import { TenantBrandAssetService } from './services/tenant-brand-asset.service';

/**
 * R19 T3: the tenant module now owns the server-side company identity —
 * the data lives in the tenant row, so the resolver that declares which
 * identity fields are present or absent (S4/S15) lives here and is
 * exported for formal documents (the printable count list) to consume.
 *
 * Company identity parity P3, slice 1: the module also owns the brand asset
 * table — the ORIGINAL logo bytes (migration 1809980000000) and the storage
 * seam that validates, replaces and reads them. Exported for the onboarding
 * upload endpoint and for the printable count list, which embeds the
 * original in the PDF.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantBrandAsset])],
  providers: [CompanyIdentityService, TenantBrandAssetService],
  exports: [CompanyIdentityService, TenantBrandAssetService],
})
export class TenantModule {}
