import {
  addDuration,
  compareDateOnly,
  formatDateOnly,
  parseDateOnly,
  validateDuration,
} from './index';

describe('security evidence retention calendar foundation', () => {
  it('S1 rejects malformed and impossible date-only values without normalizing them', () => {
    expect(parseDateOnly('2024-02-30')).toEqual({
      ok: false,
      error: { code: 'INVALID_DATE', reason: 'INVALID_VALUE' },
    });
    expect(parseDateOnly('2024-2-03')).toEqual({
      ok: false,
      error: { code: 'INVALID_DATE', reason: 'MALFORMED_SHAPE' },
    });
    expect(parseDateOnly('2024-02-03T00:00:00Z')).toEqual({
      ok: false,
      error: { code: 'INVALID_DATE', reason: 'MALFORMED_SHAPE' },
    });
  });

  it('S2 validates durations with deterministic failure precedence', () => {
    expect(validateDuration({ years: 1, months: 0, days: 2 })).toEqual({
      ok: true,
      value: { years: 1, months: 0, days: 2 },
    });
    expect(
      validateDuration({ years: Number.NaN, months: -1.5, days: -1 }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_DURATION', reason: 'NON_FINITE' },
    });
    expect(validateDuration({ years: 0.5, months: -1, days: 0 })).toEqual({
      ok: false,
      error: { code: 'INVALID_DURATION', reason: 'NON_INTEGER' },
    });
    expect(validateDuration({ years: 0, months: -1, days: 0 })).toEqual({
      ok: false,
      error: { code: 'INVALID_DURATION', reason: 'NEGATIVE' },
    });
    expect(validateDuration({ years: 0, months: 0, days: 0 })).toEqual({
      ok: false,
      error: { code: 'INVALID_DURATION', reason: 'ALL_ZERO' },
    });
  });

  it('S3 clamps month ends and leap anniversaries', () => {
    const january = parseDateOnly('2024-01-31');
    const leapDay = parseDateOnly('2024-02-29');
    const month = validateDuration({ years: 0, months: 1, days: 0 });
    const year = validateDuration({ years: 1, months: 0, days: 0 });

    if (!january.ok || !leapDay.ok || !month.ok || !year.ok) {
      throw new Error('test inputs must validate');
    }

    expect(addDuration(january.value, month.value)).toEqual({
      ok: true,
      value: '2024-02-29',
    });
    expect(addDuration(leapDay.value, year.value)).toEqual({
      ok: true,
      value: '2025-02-28',
    });
  });

  it('S4 applies years, months, then days across Gregorian century boundaries', () => {
    const start = parseDateOnly('2099-01-31');
    const duration = validateDuration({ years: 1, months: 1, days: 1 });

    if (!start.ok || !duration.ok) {
      throw new Error('test inputs must validate');
    }

    const result = addDuration(start.value, duration.value);
    expect(result).toEqual({ ok: true, value: '2100-03-01' });
  });

  it('S6 returns typed failure for revoked Proxy and exotic object inputs', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(validateDuration(proxy)).toEqual({
      ok: false,
      error: { code: 'INVALID_DURATION', reason: 'MALFORMED_SHAPE' },
    });

    expect(validateDuration(new Date())).toEqual({
      ok: false,
      error: { code: 'INVALID_DURATION', reason: 'MALFORMED_SHAPE' },
    });
    expect(validateDuration(/regex/)).toEqual({
      ok: false,
      error: { code: 'INVALID_DURATION', reason: 'MALFORMED_SHAPE' },
    });
    expect(validateDuration([1, 2, 3])).toEqual({
      ok: false,
      error: { code: 'INVALID_DURATION', reason: 'MALFORMED_SHAPE' },
    });
  });

  it('S5 is deterministic and exposes infallible formatted comparison for validated dates', () => {
    const start = parseDateOnly('2023-12-31');
    const duration = validateDuration({ years: 0, months: 0, days: 1 });

    if (!start.ok || !duration.ok) {
      throw new Error('test inputs must validate');
    }

    const first = addDuration(start.value, duration.value);
    const second = addDuration(start.value, duration.value);
    if (!first.ok || !second.ok) {
      throw new Error('valid arithmetic must succeed');
    }

    expect(first).toEqual(second);
    expect(formatDateOnly(first.value)).toBe('2024-01-01');
    expect(compareDateOnly(start.value, first.value)).toBeLessThan(0);
    expect(formatDateOnly(start.value)).toBe('2023-12-31');
  });
});
