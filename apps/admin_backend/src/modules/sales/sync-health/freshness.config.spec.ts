import {
  DASHBOARD_FRESHNESS_THRESHOLD_ENV_VAR,
  DEFAULT_FRESHNESS_THRESHOLD_MINUTES,
  resolveFreshnessThresholdMinutes,
} from './freshness.config';

describe('resolveFreshnessThresholdMinutes', () => {
  it('defaults to 5 minutes when the env var is absent', () => {
    expect(resolveFreshnessThresholdMinutes({})).toBe(5);
    expect(DEFAULT_FRESHNESS_THRESHOLD_MINUTES).toBe(5);
  });

  it('reads the configured value from DASHBOARD_FRESHNESS_THRESHOLD_MINUTES', () => {
    expect(
      resolveFreshnessThresholdMinutes({
        [DASHBOARD_FRESHNESS_THRESHOLD_ENV_VAR]: '10',
      }),
    ).toBe(10);
  });

  it('falls back to the default on non-numeric, non-positive, or fractional values', () => {
    expect(
      resolveFreshnessThresholdMinutes({
        [DASHBOARD_FRESHNESS_THRESHOLD_ENV_VAR]: 'abc',
      }),
    ).toBe(5);
    expect(
      resolveFreshnessThresholdMinutes({
        [DASHBOARD_FRESHNESS_THRESHOLD_ENV_VAR]: '0',
      }),
    ).toBe(5);
    expect(
      resolveFreshnessThresholdMinutes({
        [DASHBOARD_FRESHNESS_THRESHOLD_ENV_VAR]: '-2',
      }),
    ).toBe(5);
    expect(
      resolveFreshnessThresholdMinutes({
        [DASHBOARD_FRESHNESS_THRESHOLD_ENV_VAR]: '2.5',
      }),
    ).toBe(5);
    expect(
      resolveFreshnessThresholdMinutes({
        [DASHBOARD_FRESHNESS_THRESHOLD_ENV_VAR]: '  5  ',
      }),
    ).toBe(5);
  });
});
