/**
 * Trust-proxy contract for the admin backend.
 *
 * The API runs behind at least one reverse proxy in every deployed
 * environment (Railway edge, optionally Cloudflare in front of it). Without
 * `trust proxy`, Express reports the proxy address as `req.ip`, which breaks
 * per-IP rate limiting and access-log forensics.
 *
 * The hop count is environment-driven (`TRUST_PROXY_HOPS`) so the value can
 * match the actual deployment topology without a code change:
 * - default `1` — only the immediate proxy is trusted;
 * - `2` — Cloudflare + Railway (production topology as of the 2025 audit).
 */

export const TRUST_PROXY_HOPS_ENV = 'TRUST_PROXY_HOPS';

/** Upper bound keeps a misconfiguration from trusting arbitrary chains. */
export const TRUST_PROXY_HOPS_MAX = 5;

/** Default when the env var is unset: trust only the immediate proxy. */
export const TRUST_PROXY_HOPS_DEFAULT = 1;

/**
 * Raised when the configured trust-proxy hop count is not a positive integer
 * within the allowed range. Startup must abort (fail closed).
 */
export class TrustProxyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustProxyConfigError';
  }
}

export interface TrustProxyHopsInput {
  /** Raw env value (undefined when unset). */
  raw?: string | undefined;
}

/**
 * Resolve the effective `trust proxy` hop count.
 *
 * Unset or blank falls back to {@link TRUST_PROXY_HOPS_DEFAULT}. Any other
 * value must be an integer between 1 and {@link TRUST_PROXY_HOPS_MAX};
 * otherwise a {@link TrustProxyConfigError} is thrown. Error messages never
 * echo the raw value: it may carry shell metacharacters that would end up in
 * operator terminals or log pipelines.
 */
export function resolveTrustProxyHops(input: TrustProxyHopsInput): number {
  const raw = input.raw?.trim();

  if (!raw) {
    return TRUST_PROXY_HOPS_DEFAULT;
  }

  const parsed = Number(raw);
  const valid =
    Number.isInteger(parsed) && parsed >= 1 && parsed <= TRUST_PROXY_HOPS_MAX;

  if (!valid) {
    throw new TrustProxyConfigError(
      `Malformed ${TRUST_PROXY_HOPS_ENV}: expected an integer between 1 and ${TRUST_PROXY_HOPS_MAX} (number of proxy hops in front of this API, e.g. 2 for Cloudflare + Railway). The entry value is omitted from this error to avoid echoing untrusted input.`,
    );
  }

  return parsed;
}
