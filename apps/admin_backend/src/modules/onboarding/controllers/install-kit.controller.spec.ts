import {
  GoneException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  InstallKitController,
  sanitizeLinkingCodeParam,
} from './install-kit.controller';
import {
  InstallKitService,
  ResolvedInstallTokenRelease,
} from '../services/install-kit.service';
import { InstallKitRateLimiter } from '../utils/install-kit-rate-limiter';

interface MockResponseHandle {
  res: Response;
  headers: Record<string, string>;
  statusCode: number | null;
  /** `send` carries HTML strings; `json` carries the assetlinks payload array. */
  body: string | readonly unknown[] | null;
  redirectStatus: number | null;
  redirectUrl: string | null;
}

function createMockResponse(): MockResponseHandle {
  const handle: MockResponseHandle = {
    res: {} as Response,
    headers: {},
    statusCode: null,
    body: null,
    redirectStatus: null,
    redirectUrl: null,
  };

  const res = {
    setHeader: jest.fn((name: string, value: string) => {
      handle.headers[name.toLowerCase()] = value;
      return res;
    }),
    status: jest.fn((code: number) => {
      handle.statusCode = code;
      return res;
    }),
    send: jest.fn((payload: string) => {
      handle.body = payload;
      return res;
    }),
    json: jest.fn((payload: readonly unknown[]) => {
      handle.body = payload;
      return res;
    }),
    redirect: jest.fn((status: number, url: string) => {
      handle.redirectStatus = status;
      handle.redirectUrl = url;
      return res;
    }),
  } as unknown as Response;

  handle.res = res;
  return handle;
}

function createMockRequest(
  overrides: { ip?: string; accept?: string } = {},
): Request {
  return {
    ip: overrides.ip ?? '192.0.2.10',
    headers: {
      accept: overrides.accept ?? '*/*',
    },
  } as unknown as Request;
}

describe('InstallKitController', () => {
  let mockService: {
    resolveInstallToken: jest.Mock<
      Promise<ResolvedInstallTokenRelease>,
      [string, { abi?: string; channel?: string }?]
    >;
    validateActiveToken: jest.Mock<Promise<{ id: string }>, [string]>;
  };
  let rateLimiter: InstallKitRateLimiter;
  let controller: InstallKitController;

  const originalEnvFingerprints =
    process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS;

  beforeEach(() => {
    mockService = {
      resolveInstallToken: jest.fn(),
      validateActiveToken: jest.fn(),
    };
    rateLimiter = new InstallKitRateLimiter({ limit: 5, windowMs: 60_000 });
    controller = new InstallKitController(
      mockService as unknown as InstallKitService,
      rateLimiter,
    );
  });

  afterEach(() => {
    if (originalEnvFingerprints === undefined) {
      delete process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS;
    } else {
      process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS =
        originalEnvFingerprints;
    }
  });

  describe('GET /i/:token', () => {
    it('responds 302 Found redirecting to presigned downloadUrl when download=1', async () => {
      const presignedUrl = 'https://r2.example.com/bucket/app-arm64.apk?sig=ok';
      mockService.resolveInstallToken.mockResolvedValueOnce({
        downloadUrl: presignedUrl,
        versionName: '1.5.0',
        versionCode: 2050,
        abi: 'arm64-v8a',
        sizeBytes: 12_345_678,
        sha256: 'a'.repeat(64),
      });

      const req = createMockRequest({
        accept: 'text/html,application/xhtml+xml',
      });
      const resHandle = createMockResponse();

      await controller.handleInstallLink(
        'tok123',
        req,
        resHandle.res,
        'arm64-v8a',
        undefined,
        '1',
        'pilot',
      );

      expect(mockService.resolveInstallToken).toHaveBeenCalledWith('tok123', {
        abi: 'arm64-v8a',
        channel: 'pilot',
      });
      expect(resHandle.headers['cache-control']).toBe('no-store');
      expect(resHandle.redirectStatus).toBe(HttpStatus.FOUND);
      expect(resHandle.redirectUrl).toBe(presignedUrl);
    });

    it('renders Spanish HTML landing page with CSP and sanitized valid 6-char linking code', async () => {
      mockService.validateActiveToken.mockResolvedValueOnce({ id: 'tok-id' });

      const req = createMockRequest({ accept: 'text/html' });
      const resHandle = createMockResponse();

      await controller.handleInstallLink(
        'tok_abc',
        req,
        resHandle.res,
        undefined,
        'ab23cd',
        undefined,
        undefined,
      );

      expect(resHandle.statusCode).toBe(HttpStatus.OK);
      expect(resHandle.headers['cache-control']).toBe('no-store');
      expect(resHandle.headers['content-security-policy']).toBe(
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'none'; frame-ancestors 'none'",
      );

      const html = resHandle.body as string;
      expect(html).toContain('Descargar APK');
      expect(html).toContain('/i/tok_abc?download=1&amp;abi=arm64-v8a');
      expect(html).toContain('/i/tok_abc?download=1&amp;abi=armeabi-v7a');
      expect(html).toContain('/i/tok_abc?download=1&amp;abi=x86_64');
      expect(html).toContain('Abrir NHILOS POS');
      expect(html).toContain('/i/tok_abc?code=AB23CD');
      expect(html).toContain('>AB23CD<');
    });

    it('strictly strips XSS payloads from ?code= before rendering HTML', async () => {
      mockService.validateActiveToken.mockResolvedValueOnce({ id: 'tok-id' });
      const xssPayload = '"><script>alert(1)</script>';

      expect(sanitizeLinkingCodeParam(xssPayload)).toBeNull();
      expect(sanitizeLinkingCodeParam('ABC123" onclick="evil()')).toBeNull();

      const req = createMockRequest({ accept: 'text/html' });
      const resHandle = createMockResponse();

      await controller.handleInstallLink(
        'tok_safe',
        req,
        resHandle.res,
        undefined,
        xssPayload,
        undefined,
        undefined,
      );

      const html = resHandle.body as string;
      expect(resHandle.statusCode).toBe(HttpStatus.OK);
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('alert(1)');
      expect(html).toContain('href="/i/tok_safe"');
    });

    it('returns 410 Gone HTML page when token is revoked', async () => {
      mockService.validateActiveToken.mockRejectedValueOnce(
        new GoneException('Install link has been revoked'),
      );

      const req = createMockRequest({ accept: 'text/html' });
      const resHandle = createMockResponse();

      await controller.handleInstallLink('revoked-tok', req, resHandle.res);

      expect(resHandle.statusCode).toBe(HttpStatus.GONE);
      expect(resHandle.body as string).toContain('revocado');
    });

    it('returns 404 Not Found HTML page when token is unknown', async () => {
      mockService.validateActiveToken.mockRejectedValueOnce(
        new NotFoundException('Install link not found'),
      );

      const req = createMockRequest({ accept: 'text/html' });
      const resHandle = createMockResponse();

      await controller.handleInstallLink('unknown-tok', req, resHandle.res);

      expect(resHandle.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(resHandle.body as string).toContain('no válido');
    });

    it('enforces per-IP rate limiting with 429 Too Many Requests', async () => {
      const strictLimiter = new InstallKitRateLimiter({
        limit: 2,
        windowMs: 60_000,
      });
      const limitedController = new InstallKitController(
        mockService as unknown as InstallKitService,
        strictLimiter,
      );
      mockService.validateActiveToken.mockResolvedValue({ id: 'tok-id' });

      const req = createMockRequest({
        ip: '198.51.100.77',
        accept: 'text/html',
      });

      await limitedController.handleInstallLink(
        'tok1',
        req,
        createMockResponse().res,
      );
      await limitedController.handleInstallLink(
        'tok1',
        req,
        createMockResponse().res,
      );

      const blockedRes = createMockResponse();
      let caughtError: unknown;
      try {
        await limitedController.handleInstallLink('tok1', req, blockedRes.res);
      } catch (err: unknown) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(HttpException);
      expect((caughtError as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(Number(blockedRes.headers['retry-after'])).toBeGreaterThanOrEqual(
        1,
      );
    });
  });

  describe('GET /.well-known/assetlinks.json', () => {
    it('returns an empty JSON array when ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS is unset', () => {
      delete process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS;
      const resHandle = createMockResponse();

      controller.getAssetLinks(resHandle.res);

      expect(resHandle.statusCode).toBe(HttpStatus.OK);
      expect(resHandle.headers['cache-control']).toBe('public, max-age=3600');
      expect(resHandle.body).toEqual([]);
    });

    it('returns formatted Digital Asset Links statement with trimmed uppercase fingerprints', () => {
      process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS =
        '  aa:bb:cc:11 ,  dd:ee:ff:22 , ';
      const resHandle = createMockResponse();

      controller.getAssetLinks(resHandle.res);

      expect(resHandle.statusCode).toBe(HttpStatus.OK);
      expect(resHandle.headers['cache-control']).toBe('public, max-age=3600');
      expect(resHandle.body).toEqual([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'com.nhilos.pos_app',
            sha256_cert_fingerprints: ['AA:BB:CC:11', 'DD:EE:FF:22'],
          },
        },
      ]);
    });
  });
});
