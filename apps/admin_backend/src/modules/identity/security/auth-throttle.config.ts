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
import { Logger } from '@nestjs/common';

export const IP_THROTTLER_NAME = 'ip';
export const ACCOUNT_THROTTLER_NAME = 'account';

/** Milliseconds in the fixed throttle window (1 minute). */
export const THROTTLE_TTL_MS = 60_000;

/** Login attempts per IP per window. */
export const LOGIN_PER_IP_LIMIT = 5;
/** Login attempts per account (tenantSlug|email) per window. */
export const LOGIN_PER_ACCOUNT_LIMIT = 5;
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
  // TEMPORARY diagnostic (issue #896): logs each account-tracker evaluation
  // so the production investigation can see whether ThrottlerGuard invokes
  // the tracker at all, and with which key. Remove once #896 closes.
  new Logger('AuthThrottleProbe').log(`accountTracker evaluated`);

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
