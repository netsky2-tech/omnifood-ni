/**
 * Throttle contract for the heavy report / fiscal export endpoints.
 *
 * These reads are the sensitive-business-flow surface of the authenticated
 * API (OWASP API6:2023 — unrestricted access to sensitive business flows):
 * bulk sales-book / Z-report exports and fiscal summaries/audits are
 * expensive to serve and valuable to scrape. Limits are keyed per TENANT,
 * never per IP: POS devices of one food park share a single egress IP, so a
 * per-IP throttle would lock out whole stores.
 *
 * One named throttler is registered: `tenant-report` — the tracker resolves
 * the tenant id exactly like the `@GetTenantId()` param decorator
 * (`devicePrincipal?.tenantId ?? user?.tenant_id`). If the request carries
 * no tenant context the tracker falls back to the client IP, and finally to
 * the literal `unknown`, so the tracker is always defined (a request without
 * tenant context cannot reach these routes — `TenantInterceptor` rejects it
 * with 401 first — the fallback only exists to keep the tracker total).
 */

import type { ThrottlerOptions } from '@nestjs/throttler';
import type { RequestWithPrincipalOrUser } from '../../../core/decorators/tenant.decorator';

export const TENANT_REPORT_THROTTLER_NAME = 'tenant-report';

/** Milliseconds in the fixed throttle window (1 minute). */
export const REPORT_THROTTLE_TTL_MS = 60_000;

/** Report/export requests per tenant per window (generous operator default). */
export const REPORTS_PER_TENANT_LIMIT = 30;

/**
 * Build the tracker key for the tenant report throttler.
 *
 * Mirrors `@GetTenantId()` (src/core/decorators/tenant.decorator.ts): the
 * device-sync principal wins over the JWT user, same resolution order. The
 * client IP is only a fallback for requests without tenant context.
 */
export function tenantReportTracker(req: RequestWithPrincipalOrUser): string {
  const deviceTenantId = req?.devicePrincipal?.tenantId;
  if (typeof deviceTenantId === 'string' && deviceTenantId.trim() !== '') {
    return deviceTenantId;
  }
  const userTenantId = req?.user?.tenant_id;
  if (typeof userTenantId === 'string' && userTenantId.trim() !== '') {
    return userTenantId;
  }
  const ip = typeof req?.ip === 'string' ? req.ip : 'unknown';
  return ip;
}

/** Named throttler options consumed by `ThrottlerModule.forRoot`. */
export function reportThrottlers(): ThrottlerOptions[] {
  return [
    {
      name: TENANT_REPORT_THROTTLER_NAME,
      ttl: REPORT_THROTTLE_TTL_MS,
      limit: REPORTS_PER_TENANT_LIMIT,
      getTracker: (req: RequestWithPrincipalOrUser) => tenantReportTracker(req),
    },
  ];
}
