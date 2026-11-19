import {
  Controller,
  Get,
  GoneException,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { InstallKitService } from '../services/install-kit.service';
import { InstallKitRateLimiter } from '../utils/install-kit-rate-limiter';

const INSTALL_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'none'; frame-ancestors 'none'";

const LINKING_CODE_PATTERN = /^[A-Z0-9]{6}$/;

const ANDROID_PACKAGE_NAME = 'com.nhilos.pos_app';

interface DigitalAssetLinkStatement {
  readonly relation: readonly string[];
  readonly target: {
    readonly namespace: 'android_app';
    readonly package_name: string;
    readonly sha256_cert_fingerprints: readonly string[];
  };
}

export function sanitizeLinkingCodeParam(raw?: string): string | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toUpperCase();
  return LINKING_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function parseAndroidCertFingerprints(raw?: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInstallPageHtml(
  encodedToken: string,
  validCode: string | null,
): string {
  const safePathToken = escapeHtml(encodedToken);
  const arm64Href = `/i/${safePathToken}?download=1&amp;abi=arm64-v8a`;
  const arm32Href = `/i/${safePathToken}?download=1&amp;abi=armeabi-v7a`;
  const x86Href = `/i/${safePathToken}?download=1&amp;abi=x86_64`;
  const openAppHref = validCode
    ? `/i/${safePathToken}?code=${validCode}`
    : `/i/${safePathToken}`;

  const codeBlock = validCode
    ? `<div class="code-box" aria-label="Código de vinculación">
        <span class="code-label">Código de vinculación</span>
        <strong class="code-value">${validCode}</strong>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es-NI">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Instalar NHILOS POS</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f5;
      --surface: #ffffff;
      --ink: #171a18;
      --muted: #56605a;
      --border: #dfe4e0;
      --accent: #184e3b;
      --accent-hover: #123d2e;
      --accent-soft: #eef5f1;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--ink);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px 16px;
      line-height: 1.5;
    }
    main {
      width: 100%;
      max-width: 440px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px 24px;
      box-shadow: 0 8px 28px rgba(18, 34, 26, 0.06);
    }
    .brand {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      margin: 0 0 8px;
    }
    h1 {
      font-size: 24px;
      line-height: 1.2;
      margin: 0 0 8px;
      font-weight: 700;
    }
    .subtitle {
      margin: 0 0 22px;
      color: var(--muted);
      font-size: 14px;
    }
    .btn {
      display: block;
      width: 100%;
      text-align: center;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      padding: 13px 16px;
      border-radius: 10px;
      transition: background-color 0.15s ease;
    }
    .btn-primary {
      background: var(--accent);
      color: #ffffff;
    }
    .btn-primary:hover {
      background: var(--accent-hover);
    }
    .btn-secondary {
      margin-top: 10px;
      background: var(--accent-soft);
      color: var(--accent);
      border: 1px solid var(--border);
    }
    .abi-links {
      margin: 12px 0 22px;
      text-align: center;
      font-size: 12px;
      color: var(--muted);
    }
    .abi-links a {
      color: var(--accent);
      text-decoration: underline;
      margin: 0 6px;
    }
    .code-box {
      margin: 0 0 20px;
      padding: 12px 14px;
      border-radius: 10px;
      background: var(--accent-soft);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .code-label {
      font-size: 12px;
      color: var(--muted);
      font-weight: 600;
    }
    .code-value {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 18px;
      letter-spacing: 0.14em;
      color: var(--ink);
    }
    .steps {
      margin: 0 0 22px;
      padding: 16px 16px 16px 32px;
      border-radius: 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      font-size: 13px;
      color: var(--ink);
    }
    .steps li + li {
      margin-top: 8px;
    }
    footer {
      margin-top: 18px;
      font-size: 12px;
      color: var(--muted);
      text-align: center;
    }
  </style>
</head>
<body>
  <main>
    <p class="brand">NHILOS POS</p>
    <h1>Instalá tu terminal de venta</h1>
    <p class="subtitle">Descargá la versión oficial para Android y vinculá tu caja en pocos pasos.</p>

    ${codeBlock}

    <a class="btn btn-primary" href="${arm64Href}">Descargar APK (Android 64-bit)</a>

    <div class="abi-links">
      ¿Otro equipo?
      <a href="${arm32Href}">Android 32-bit (armeabi-v7a)</a> ·
      <a href="${x86Href}">x86_64</a>
    </div>

    <ol class="steps">
      <li>Tocá <strong>Descargar APK</strong> y esperá a que termine la descarga.</li>
      <li>Abrí el archivo descargado y permití la instalación desde el navegador si Android lo solicita.</li>
      <li>Al finalizar, tocá <strong>Abrir NHILOS POS</strong> para iniciar la vinculación de esta terminal.</li>
    </ol>

    <a class="btn btn-secondary" href="${openAppHref}">Abrir NHILOS POS</a>

    <footer>Descarga verificada de NHILOS. No compartás este enlace fuera de tu negocio.</footer>
  </main>
</body>
</html>`;
}

function renderErrorPageHtml(
  title: string,
  heading: string,
  message: string,
): string {
  return `<!DOCTYPE html>
<html lang="es-NI">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f6f7f5;
      color: #171a18;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px 16px;
    }
    main {
      width: 100%;
      max-width: 420px;
      background: #ffffff;
      border: 1px solid #dfe4e0;
      border-radius: 16px;
      padding: 28px 24px;
    }
    .brand {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #184e3b;
      margin: 0 0 8px;
    }
    h1 { font-size: 20px; margin: 0 0 10px; }
    p { font-size: 14px; color: #56605a; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <p class="brand">NHILOS POS</p>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}

/**
 * Public root endpoints for the POS Install Kit (issue #958):
 * - `GET /i/:token` — stable QR / App Link entry point (excluded from `/api` prefix).
 * - `GET /.well-known/assetlinks.json` — Android Digital Asset Links statement.
 */
@Controller()
export class InstallKitController {
  constructor(
    private readonly installKitService: InstallKitService,
    private readonly rateLimiter: InstallKitRateLimiter,
  ) {}

  @Get('i/:token')
  async handleInstallLink(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('abi') abi?: string,
    @Query('code') code?: string,
    @Query('download') download?: string,
    @Query('channel') channel?: string,
  ): Promise<void> {
    const decision = this.rateLimiter.consume(req.ip ?? 'unknown');
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    res.setHeader('Cache-Control', 'no-store');

    const acceptHeader = (req.headers.accept ?? '').toLowerCase();
    const wantsHtml = acceptHeader.includes('text/html') && download !== '1';

    if (!wantsHtml) {
      const resolved = await this.installKitService.resolveInstallToken(token, {
        abi,
        channel,
      });
      res.redirect(HttpStatus.FOUND, resolved.downloadUrl);
      return;
    }

    res.setHeader('Content-Security-Policy', INSTALL_PAGE_CSP);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    try {
      await this.installKitService.validateActiveToken(token);
    } catch (error: unknown) {
      if (error instanceof GoneException) {
        res
          .status(HttpStatus.GONE)
          .send(
            renderErrorPageHtml(
              'Enlace revocado — NHILOS POS',
              'Este enlace fue revocado',
              'El enlace de instalación ya no está activo. Solicitá un nuevo enlace desde el panel administrativo de tu negocio.',
            ),
          );
        return;
      }
      if (error instanceof NotFoundException) {
        res
          .status(HttpStatus.NOT_FOUND)
          .send(
            renderErrorPageHtml(
              'Enlace no encontrado — NHILOS POS',
              'Enlace de instalación no válido',
              'No pudimos encontrar este enlace de instalación. Verificá el código QR o solicitá uno nuevo al administrador.',
            ),
          );
        return;
      }
      throw error;
    }

    const encodedToken = encodeURIComponent(token);
    const validCode = sanitizeLinkingCodeParam(code);
    res
      .status(HttpStatus.OK)
      .send(renderInstallPageHtml(encodedToken, validCode));
  }

  @Get('.well-known/assetlinks.json')
  getAssetLinks(@Res() res: Response): void {
    const fingerprints = parseAndroidCertFingerprints(
      process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS,
    );

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (fingerprints.length === 0) {
      res.status(HttpStatus.OK).json([]);
      return;
    }

    const statements: DigitalAssetLinkStatement[] = [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PACKAGE_NAME,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ];

    res.status(HttpStatus.OK).json(statements);
  }
}
