/**
 * Helmet contract for the admin backend.
 *
 * Local development stays relaxed (no CSP, no HSTS) so plain-HTTP localhost
 * flows keep working. Production hardens both: HSTS pins HTTPS for a year
 * (the API is only ever reached through TLS-terminating edge proxies), and
 * a deny-by-default CSP matches what the API actually is — a JSON endpoint
 * that serves no HTML, scripts, frames, or embeds of its own.
 */

import type helmet from 'helmet';

export type HelmetOptions = Parameters<typeof helmet>[0];

/** HSTS lifetime: one year, the widely accepted maximum. */
const HSTS_MAX_AGE_SECONDS = 31_536_000;

const RELAXED_OPTIONS: HelmetOptions = {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: false,
};

const PRODUCTION_OPTIONS: HelmetOptions = {
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      workerSrc: ["'none'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'"],
      styleSrc: ["'none'"],
      fontSrc: ["'none'"],
      scriptSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: HSTS_MAX_AGE_SECONDS,
    includeSubDomains: true,
    preload: true,
  },
};

/**
 * Resolve helmet options for the effective environment. Only
 * `NODE_ENV=production` hardens; every other value keeps dev relaxed so a
 * forgotten NODE_ENV can never lock a developer out of a local flow.
 */
export function helmetOptions(nodeEnv?: string | undefined): HelmetOptions {
  return nodeEnv === 'production' ? PRODUCTION_OPTIONS : RELAXED_OPTIONS;
}
