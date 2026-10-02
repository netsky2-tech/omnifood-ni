import { ConfigService } from '@nestjs/config';
import { R2StorageService } from './r2-storage.service';

describe('R2StorageService', () => {
  const mockConfigValues: Record<string, string> = {
    R2_ACCOUNT_ID: '5ee2be45b9936ad89ebe203c3b050ada',
    R2_ACCESS_KEY_ID: 'test_access_key_123',
    R2_SECRET_ACCESS_KEY: 'test_secret_key_456',
    R2_BUCKET_NAME: 'nhilos-pos',
    R2_ENDPOINT:
      'https://5ee2be45b9936ad89ebe203c3b050ada.r2.cloudflarestorage.com',
  };

  const createService = (overrides: Partial<Record<string, string>> = {}) => {
    const values = { ...mockConfigValues, ...overrides };
    const configService = {
      get: (key: string) => values[key],
    } as unknown as ConfigService;
    return new R2StorageService(configService);
  };

  it('marks service as configured when all credentials are provided', () => {
    const service = createService();
    expect(service.isConfigured).toBe(true);
  });

  it('marks service as unconfigured when credentials are missing', () => {
    const service = createService({ R2_ACCESS_KEY_ID: undefined });
    expect(service.isConfigured).toBe(false);
  });

  it('throws when getPresignedDownloadUrl is called without credentials', () => {
    const service = createService({ R2_ACCESS_KEY_ID: undefined });
    expect(() => service.getPresignedDownloadUrl('releases/app.apk')).toThrow(
      /R2 storage is not configured/,
    );
  });

  it('generates a valid AWS SigV4 signed URL with expected query parameters', () => {
    const service = createService();
    const fixedDate = new Date('2026-10-02T12:00:00.000Z');

    const signedUrl = service.getPresignedDownloadUrl(
      'releases/pilot/app-arm64-2002.apk',
      3600,
      fixedDate,
    );

    const url = new URL(signedUrl);
    expect(url.hostname).toBe(
      '5ee2be45b9936ad89ebe203c3b050ada.r2.cloudflarestorage.com',
    );
    expect(url.pathname).toBe(
      '/nhilos-pos/releases/pilot/app-arm64-2002.apk',
    );
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toContain(
      'test_access_key_123/20261002/auto/s3/aws4_request',
    );
    expect(url.searchParams.get('X-Amz-Date')).toBe('20261002T120000Z');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalizes leading slash in storage key', () => {
    const service = createService();
    const signedUrl = service.getPresignedDownloadUrl(
      '/releases/pilot/app.apk',
    );
    const url = new URL(signedUrl);
    expect(url.pathname).toBe('/nhilos-pos/releases/pilot/app.apk');
  });
});
