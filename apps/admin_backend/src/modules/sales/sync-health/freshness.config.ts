/**
 * Owner Dashboard V2 — freshness threshold configuration.
 *
 * PRD v1.0 FR-SYNC-03: the 5-minute platform freshness target must not be
 * hardcoded independently by widgets; architecture centralizes it as
 * platform configuration. This module is the single resolution point for the
 * backend: the env var, its default, and its validation live here.
 */

export const DASHBOARD_FRESHNESS_THRESHOLD_ENV_VAR =
  'DASHBOARD_FRESHNESS_THRESHOLD_MINUTES';

export const DEFAULT_FRESHNESS_THRESHOLD_MINUTES = 5;

const isPositiveInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

/**
 * Resolves the freshness threshold (minutes) from an environment bag,
 * defaulting to `process.env`. Invalid values fail closed to the platform
 * default of 5 minutes rather than throwing: freshness is a trust feature,
 * and a misconfigured threshold must not take the endpoint down.
 */
export function resolveFreshnessThresholdMinutes(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[DASHBOARD_FRESHNESS_THRESHOLD_ENV_VAR]?.trim();
  if (!raw) return DEFAULT_FRESHNESS_THRESHOLD_MINUTES;
  const parsed = Number(raw);
  if (!/^\d+$/.test(raw) || !isPositiveInteger(parsed)) {
    return DEFAULT_FRESHNESS_THRESHOLD_MINUTES;
  }
  return parsed;
}
