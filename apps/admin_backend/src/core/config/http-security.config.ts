/**
 * CORS allowlist contract for the admin backend.
 *
 * Browser CORS is environment-driven and fail-closed in production:
 * - `NODE_ENV=production` requires an explicit, well-formed origin allowlist;
 *   a missing, blank, or malformed allowlist is a configuration error.
 * - Non-production environments default to the local dashboard dev origins.
 *
 * The allowlist only controls which browser origins may call the API. It is
 * never an authorization boundary: tenant isolation comes from the JWT
 * `tenant_id` claim, not from hostnames.
 */

export const CORS_ORIGINS_ENV = 'CORS_ALLOWED_ORIGINS';

/** Local dashboard dev origins used when no allowlist is configured. */
export const LOCAL_DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
] as const;

/**
 * Raised when the configured CORS origin allowlist is missing or malformed.
 * In production this must abort startup (fail closed).
 */
export class CorsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorsConfigError';
  }
}

export interface CorsOriginsInput {
  /** Effective NODE_ENV (undefined treated as non-production). */
  nodeEnv?: string | undefined;
  /** Raw, comma-separated allowlist value (undefined when unset). */
  raw?: string | undefined;
}

function parseAllowlist(raw: string, requireHttps: boolean): string[] {
  const origins: string[] = [];
  const parts = raw.split(',');
  for (let index = 0; index < parts.length; index++) {
    const origin = parts[index].trim();
    if (!origin) {
      continue;
    }
    const rejection = describeOriginRejection(origin, requireHttps);
    if (rejection) {
      // The error must never echo the entry value: a malformed origin may
      // carry embedded credentials (e.g. `https://user:pass@host`). Locate
      // the entry by its 1-based comma-separated position instead, counting
      // blank segments so the position matches the raw environment value.
      throw new CorsConfigError(
        `Malformed ${CORS_ORIGINS_ENV} entry at comma-separated position ${index + 1}: ${rejection}. The entry value is omitted from this error to avoid leaking embedded credentials.`,
      );
    }
    if (!origins.includes(origin)) {
      origins.push(origin);
    }
  }
  if (origins.length === 0) {
    throw new CorsConfigError(
      `${CORS_ORIGINS_ENV} is set but contains no origins.`,
    );
  }
  return origins;
}

function describeOriginRejection(
  origin: string,
  requireHttps: boolean,
): string | null {
  if (origin.includes('*')) {
    return 'wildcard origins are not allowed; list each exact origin';
  }
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return `expected an absolute http(s) origin such as https://app.example.com (scheme://host[:port], no path, query, or credentials)`;
  }
  if (url.origin !== origin) {
    return 'expected only the origin (scheme://host[:port]) with no path, query, or credentials';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'only http and https origins are allowed';
  }
  if (requireHttps && url.protocol !== 'https:') {
    return 'production origins must use https';
  }
  return null;
}

/**
 * Resolve the effective CORS origin allowlist.
 *
 * Production (`NODE_ENV=production`) fails closed: a missing, blank, or
 * malformed allowlist throws {@link CorsConfigError}. Non-production
 * environments fall back to the local dashboard dev origins.
 */
export function resolveCorsOrigins(input: CorsOriginsInput): string[] {
  const isProduction = input.nodeEnv === 'production';
  const raw = input.raw?.trim();

  if (!raw) {
    if (isProduction) {
      throw new CorsConfigError(
        `Refusing to start with permissive CORS: ${CORS_ORIGINS_ENV} is required when NODE_ENV=production. Set it to the exact browser origins allowed to call this API (comma-separated), e.g. https://app.example.com.`,
      );
    }
    return [...LOCAL_DEFAULT_ORIGINS];
  }

  return parseAllowlist(raw, isProduction);
}
