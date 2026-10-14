import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import {
  CompanyLogoDeviceController,
  DeviceCompanyLogoResponse,
} from './company-logo-device.controller';
import { TenantBrandAssetService } from '../../tenant/services/tenant-brand-asset.service';
import { SyncTransportGuard } from '../../identity/guards/sync-transport.guard';

/**
 * Company identity parity P4 (identidad-empresa-paridad.md, S5/S7, L4) — the
 * device-facing read of the logo ORIGINAL.
 *
 * What only a unit spec can pin here:
 *   - the DECLARED absence (S3): a tenant without a logo reads as
 *     `{ present: false }`, never as null bytes or an empty base64;
 *   - the presence shape carries the sha256 REFERENCE plus the base64 bytes
 *     the terminal must hash-verify against the fiscal snapshot reference;
 *   - a blank tenant context fails closed (UnauthorizedException) instead of
 *     leaking a cross-tenant read.
 *
 * The tenant BINDING itself (RLS inside runInTenantTransaction) is proven by
 * the DB specs and the transport guard, not re-proven here.
 */
describe('CompanyLogoDeviceController (device transport read)', () => {
  let controller: CompanyLogoDeviceController;
  let brandAssets: { resolveWithinManager: jest.Mock };

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    brandAssets = { resolveWithinManager: jest.fn() };

    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        async (work: (mgr: EntityManager) => Promise<unknown>) => work(manager),
      ),
    } as unknown as DataSource;

    const module = await Test.createTestingModule({
      providers: [
        CompanyLogoDeviceController,
        { provide: TenantBrandAssetService, useValue: brandAssets },
        { provide: DataSource, useValue: dataSource },
      ],
    })
      // The class-level device guard is transport wiring proven by the
      // route-transport-registry spec, not by this unit spec.
      .overrideGuard(SyncTransportGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<CompanyLogoDeviceController>(
      CompanyLogoDeviceController,
    );
  });

  it('declares absence as present:false when the tenant has no logo (S3)', async () => {
    brandAssets.resolveWithinManager.mockResolvedValueOnce({ present: false });

    const response: DeviceCompanyLogoResponse =
      await controller.getCompanyLogoOriginal(TENANT_ID);

    expect(response).toEqual({ present: false });
    expect(response.base64).toBeUndefined();
    expect(response.sha256).toBeUndefined();
  });

  it('returns the original bytes with the sha256 reference the snapshot carries', async () => {
    const bytes = Buffer.from('original-bytes', 'utf8');
    brandAssets.resolveWithinManager.mockResolvedValueOnce({
      present: true,
      bytes,
      contentType: 'image/png',
      sha256: 'a'.repeat(64),
    });

    const response = await controller.getCompanyLogoOriginal(TENANT_ID);

    expect(response).toEqual({
      present: true,
      sha256: 'a'.repeat(64),
      contentType: 'image/png',
      byteLength: bytes.length,
      base64: bytes.toString('base64'),
    });
  });

  it('reads through the tenant-bound transaction with the trimmed tenant id', async () => {
    brandAssets.resolveWithinManager.mockResolvedValueOnce({ present: false });

    await controller.getCompanyLogoOriginal(`  ${TENANT_ID}  `);

    expect(brandAssets.resolveWithinManager).toHaveBeenCalledTimes(1);
    const [manager, tenantArg] = brandAssets.resolveWithinManager.mock
      .calls[0] as unknown as [EntityManager, string];
    expect(manager).toBeDefined();
    expect(tenantArg).toBe(TENANT_ID);
  });

  it('fails closed on a blank tenant context', async () => {
    await expect(controller.getCompanyLogoOriginal('   ')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(brandAssets.resolveWithinManager).not.toHaveBeenCalled();
  });
});
