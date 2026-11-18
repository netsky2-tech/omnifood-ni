/**
 * Throttle contract for the pre-auth credential endpoints.
 *
 * These endpoints are the only credential-bearing seams reachable without a
 * session, so they are the brute-force / credential-stuffing surface of the
 * public API. Limits are intentionally scoped to them (see the security
 * audit remediation spec): POS devices of one food park share a single
 * egress IP, so a global per-IP throttle would lock out whole stores.
 *
 * Two named throttlers are registered:
 * - `ip` — key is the client address (honors the reverse-proxy chain via
 *   Express `trust proxy`);
 * - `account` — key is `tenantSlug|email`, so one client cannot exhaust the
 *   IP budget of everyone behind the same office NAT, and rotating IPs does
 *   not defeat the limit for a targeted account.
 */

import type { ThrottlerOptions } from '@nestjs/throttler';

export const IP_THROTTLER_NAME = 'ip';
export const ACCOUNT_THROTTLER_NAME = 'account';

/** Milliseconds in the fixed throttle window (1 minute). */
export const THROTTLE_TTL_MS = 60_000;

/**
 * Test-only override for both login budgets. Honored ONLY outside
 * `NODE_ENV=production` and consumed by the e2e throttle contract
 * (`test/identity/login-throttle.e2e-spec.ts`), which pins it to the
 * production number so the full app enforces the real budget under test.
 * In production this variable is ignored: an environment leak can never
 * loosen the brute-force budget.
 */
export const LOGIN_THROTTLE_LIMIT_ENV = 'LOGIN_THROTTLE_LIMIT';

/** Login budget outside production when no override is set (local dev). */
export const DEV_LOGIN_LIMIT = 60;

function resolveLoginLimit(productionLimit: number): number {
  if (process.env.NODE_ENV === 'production') return productionLimit;
  const raw = process.env[LOGIN_THROTTLE_LIMIT_ENV];
  if (raw === undefined) return DEV_LOGIN_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEV_LOGIN_LIMIT;
}

/** Login attempts per IP per window in production (the security contract). */
export const PRODUCTION_LOGIN_PER_IP_LIMIT = 5;
/** Login attempts per account (tenantSlug|email) per window in production. */
export const PRODUCTION_LOGIN_PER_ACCOUNT_LIMIT = 5;

/** Login attempts per IP per window. */
export const LOGIN_PER_IP_LIMIT = resolveLoginLimit(
  PRODUCTION_LOGIN_PER_IP_LIMIT,
);
/** Login attempts per account (tenantSlug|email) per window. */
export const LOGIN_PER_ACCOUNT_LIMIT = resolveLoginLimit(
  PRODUCTION_LOGIN_PER_ACCOUNT_LIMIT,
);
/** Refresh exchanges per IP per window (per client this is roughly hourly). */
export const REFRESH_PER_IP_LIMIT = 15;
/** Device-sync token renewals per IP per window (many terminals, one LAN). */
export const DEVICE_SYNC_TOKEN_PER_IP_LIMIT = 15;

/**
 * Build the tracker key for the account throttler.
 *
 * Only identity fields participate. The password (`pass`) is never part of
 * the key, and unknown/missing identity falls back to the client IP so the
 * tracker is always defined.
 */
export function accountTracker(req: Record<string, any>): string {
  const body = (req?.body ?? {}) as Record<string, unknown>;
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const tenantSlug =
    typeof body.tenantSlug === 'string'
      ? body.tenantSlug.trim().toLowerCase()
      : '';

  if (!email) {
    const ip = typeof req?.ip === 'string' ? req.ip : 'unknown';
    return ip;
  }
  return `${tenantSlug}|${email}`;
}

/** Named throttler options consumed by `ThrottlerModule.forRoot`. */
export function authThrottlers(): ThrottlerOptions[] {
  return [
    {
      name: IP_THROTTLER_NAME,
      ttl: THROTTLE_TTL_MS,
      limit: LOGIN_PER_IP_LIMIT,
    },
    {
      name: ACCOUNT_THROTTLER_NAME,
      ttl: THROTTLE_TTL_MS,
      limit: LOGIN_PER_ACCOUNT_LIMIT,
      getTracker: (req: Record<string, any>) => accountTracker(req),
    },
  ];
}
