import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Test } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { CompanyLogoService, CompanyLogoView } from './company-logo.service';
import { FiscalConfigVersionService } from './fiscal-config-version.service';
import {
  TenantBrandAssetService,
  ValidatedLogoUpload,
} from '../../tenant/services/tenant-brand-asset.service';

/**
 * Company identity parity P3, slice 1 (S5) — the UPLOAD ORCHESTRATION.
 *
 * The storage itself is pinned against the migration-built schema
 * (tenant-brand-asset.service.db.spec.ts); what only a unit spec can pin is
 * the contract the HTTP endpoint depends on:
 *
 *   - a REJECTED upload throws BEFORE any write is attempted — the previous
 *     logo cannot be touched because `replaceWithinManager` is never called;
 *   - a successful upload replaces the row and then RECORDS A REVISION — a
 *     logo change must materialize as a new version of the snapshot the
 *     terminals consume (the sha256 reference travels DOWN, never the bytes);
 *   - the view returned declares the stored sha, content type and length.
 *
 * `runInTenantTransaction` is exercised through the mocked DataSource
 * transaction (the same seam every service spec here uses): the tenant
 * BINDING itself is proven by the DB specs, not re-proven here.
 */
describe('CompanyLogoService (upload orchestration)', () => {
  let service: CompanyLogoService;
  let brandAssets: {
    replaceWithinManager: jest.Mock;
    resolveWithBase64: jest.Mock;
  };
  let fiscalVersions: { recordRevisionChange: jest.Mock };
  let manager: EntityManager;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';

  /** A minimal valid PNG payload (built byte-exact, CRCs set). */
  const validPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(async () => {
    brandAssets = {
      replaceWithinManager: jest.fn(),
      resolveWithBase64: jest.fn(),
    };
    fiscalVersions = { recordRevisionChange: jest.fn() };

    manager = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        async (work: (mgr: EntityManager) => Promise<unknown>) => work(manager),
      ),
    } as unknown as DataSource;

    const module = await Test.createTestingModule({
      providers: [
        CompanyLogoService,
        { provide: TenantBrandAssetService, useValue: brandAssets },
        { provide: FiscalConfigVersionService, useValue: fiscalVersions },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<CompanyLogoService>(CompanyLogoService);
  });

  it('uploads a valid logo: replaces the stored row and records a revision', async () => {
    const stored = {
      sha256: 'a'.repeat(64),
      content_type: 'image/png',
      byte_length: 70,
      bytes: Buffer.from(validPngBase64, 'base64'),
    };
    brandAssets.replaceWithinManager.mockResolvedValueOnce(stored);

    const view = await service.uploadLogo(TENANT_ID, {
      content_type: 'image/png',
      data: validPngBase64,
    });

    expect(brandAssets.replaceWithinManager).toHaveBeenCalledTimes(1);
    const [, tenantArg, uploadArg] = brandAssets.replaceWithinManager.mock
      .calls[0] as [unknown, string, ValidatedLogoUpload];
    expect(tenantArg).toBe(TENANT_ID);
    expect(uploadArg.contentType).toBe('image/png');
    // The sha is of the DECODED bytes, not the base64 string.
    expect(uploadArg.sha256).toBe(
      createHash('sha256')
        .update(Buffer.from(validPngBase64, 'base64'))
        .digest('hex'),
    );

    // A logo change is a terminal-config change delivered through the
    // EXISTING versioned channel: the revision must move.
    expect(fiscalVersions.recordRevisionChange).toHaveBeenCalledTimes(1);
    expect(fiscalVersions.recordRevisionChange).toHaveBeenCalledWith(TENANT_ID);

    expect(view.sha256).toBe(stored.sha256);
    expect(view.contentType).toBe('image/png');
    expect(view.byteLength).toBe(stored.byte_length);
    expect(view.base64).toBe(validPngBase64);
  });

  it('rejects a non-image content type BEFORE any write: the previous logo is untouched', async () => {
    await expect(
      service.uploadLogo(TENANT_ID, {
        content_type: 'application/pdf',
        data: validPngBase64,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(brandAssets.replaceWithinManager).not.toHaveBeenCalled();
    expect(fiscalVersions.recordRevisionChange).not.toHaveBeenCalled();
  });

  it('rejects undecodable image bytes BEFORE any write: the previous logo is untouched', async () => {
    // Valid base64, but the bytes are not a decodable PNG.
    const notAnImage = Buffer.from('definitely not a png').toString('base64');
    await expect(
      service.uploadLogo(TENANT_ID, {
        content_type: 'image/png',
        data: notAnImage,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(brandAssets.replaceWithinManager).not.toHaveBeenCalled();
    expect(fiscalVersions.recordRevisionChange).not.toHaveBeenCalled();
  });

  it('rejects invalid base64 BEFORE any write: the previous logo is untouched', async () => {
    await expect(
      service.uploadLogo(TENANT_ID, {
        content_type: 'image/png',
        data: 'not base64!!!',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(brandAssets.replaceWithinManager).not.toHaveBeenCalled();
    expect(fiscalVersions.recordRevisionChange).not.toHaveBeenCalled();
  });

  it('reads the current logo as a declared view, or null when absent (S3)', async () => {
    const current: CompanyLogoView = {
      sha256: 'b'.repeat(64),
      contentType: 'image/jpeg',
      byteLength: 128,
      base64: 'AAAA',
    };
    brandAssets.resolveWithBase64.mockResolvedValueOnce(current);
    await expect(service.getLogo(TENANT_ID)).resolves.toEqual(current);

    brandAssets.resolveWithBase64.mockResolvedValueOnce(null);
    await expect(service.getLogo(TENANT_ID)).resolves.toBeNull();
  });
});
