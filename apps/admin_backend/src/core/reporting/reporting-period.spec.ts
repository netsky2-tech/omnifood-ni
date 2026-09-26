import {
  MANAGUA_UTC_OFFSET,
  REPORTING_TIMEZONE,
  ReportingPeriodValidationError,
  addLocalDays,
  createReportingPeriod,
  currentLocalDateKey,
  eachLocalDate,
  formatLocalDateKey,
  inclusiveEndBound,
  isValidLocalDateKey,
  localDayEndExclusiveUtc,
  localDayStartUtc,
  managuaHourBucket,
  parseLocalDateKey,
  resolveReportingBounds,
} from './reporting-period';

describe('ReportingPeriod (spec §6.1 — America/Managua calendar semantics)', () => {
  describe('parseLocalDateKey', () => {
    it('accepts a well-formed calendar date', () => {
      expect(parseLocalDateKey('2026-09-18')).toBe('2026-09-18');
    });

    it('accepts leap day 2024-02-29', () => {
      expect(parseLocalDateKey('2024-02-29')).toBe('2024-02-29');
    });

    it('rejects February 30th', () => {
      expect(() => parseLocalDateKey('2026-02-30')).toThrow(
        ReportingPeriodValidationError,
      );
    });

    it('rejects month 13', () => {
      expect(() => parseLocalDateKey('2026-13-01')).toThrow(
        ReportingPeriodValidationError,
      );
    });

    it('rejects malformed formats', () => {
      expect(() => parseLocalDateKey('2026-9-18')).toThrow(
        ReportingPeriodValidationError,
      );
      expect(() => parseLocalDateKey('18/09/2026')).toThrow(
        ReportingPeriodValidationError,
      );
      expect(() => parseLocalDateKey('')).toThrow(
        ReportingPeriodValidationError,
      );
    });
  });

  describe('isValidLocalDateKey', () => {
    it('discriminates valid and invalid inputs without throwing', () => {
      expect(isValidLocalDateKey('2026-09-18')).toBe(true);
      expect(isValidLocalDateKey('2026-02-30')).toBe(false);
      expect(isValidLocalDateKey('garbage')).toBe(false);
      expect(isValidLocalDateKey(undefined)).toBe(false);
    });
  });

  describe('local day boundaries (fixed UTC-06:00)', () => {
    it('maps local midnight to 06:00 UTC', () => {
      expect(localDayStartUtc('2026-09-18').toISOString()).toBe(
        '2026-09-18T06:00:00.000Z',
      );
    });

    it('maps the exclusive end of a local day to 06:00 UTC of the next day', () => {
      expect(localDayEndExclusiveUtc('2026-09-18').toISOString()).toBe(
        '2026-09-19T06:00:00.000Z',
      );
    });

    it('partitions the last local millisecond of a day from the first of the next', () => {
      const end = localDayEndExclusiveUtc('2026-09-18');
      const lastMillisecond = new Date(end.getTime() - 1);
      expect(lastMillisecond.toISOString()).toBe('2026-09-19T05:59:59.999Z');
      expect(lastMillisecond.getTime()).toBeLessThan(end.getTime());
    });
  });

  describe('createReportingPeriod', () => {
    it('builds a half-open period that includes the complete selected end date', () => {
      const period = createReportingPeriod('2026-09-18', '2026-09-20');

      expect(period.timezone).toBe(REPORTING_TIMEZONE);
      expect(period.localStartDate).toBe('2026-09-18');
      expect(period.localEndDate).toBe('2026-09-20');
      expect(period.startInclusiveUtc.toISOString()).toBe(
        '2026-09-18T06:00:00.000Z',
      );
      // Half-open [start, end): the exclusive end is the start of Sep 21 local,
      // so every instant of the selected end date is included.
      expect(period.endExclusiveUtc.toISOString()).toBe(
        '2026-09-21T06:00:00.000Z',
      );
    });

    it('includes a sale on the last local millisecond of the end date', () => {
      const period = createReportingPeriod('2026-09-18', '2026-09-18');
      const saleAt235959999 = new Date('2026-09-19T05:59:59.999Z');
      expect(saleAt235959999.getTime()).toBeLessThan(
        period.endExclusiveUtc.getTime(),
      );
      expect(saleAt235959999.getTime()).toBeGreaterThanOrEqual(
        period.startInclusiveUtc.getTime(),
      );
    });

    it('excludes a sale at local midnight of the day after the end date', () => {
      const period = createReportingPeriod('2026-09-18', '2026-09-18');
      const saleNextMidnight = new Date('2026-09-19T06:00:00.000Z');
      expect(saleNextMidnight.getTime()).toBeGreaterThanOrEqual(
        period.endExclusiveUtc.getTime(),
      );
    });

    it('handles a single-day period that spans a month boundary', () => {
      const period = createReportingPeriod('2026-08-31', '2026-08-31');
      expect(period.endExclusiveUtc.toISOString()).toBe(
        '2026-09-01T06:00:00.000Z',
      );
    });

    it('rejects an inverted range', () => {
      expect(() => createReportingPeriod('2026-09-20', '2026-09-18')).toThrow(
        ReportingPeriodValidationError,
      );
    });

    it('rejects invalid calendar dates', () => {
      expect(() => createReportingPeriod('2026-02-30', '2026-03-01')).toThrow(
        ReportingPeriodValidationError,
      );
    });

    it('accepts leap-day ranges', () => {
      const period = createReportingPeriod('2024-02-28', '2024-02-29');
      expect(period.endExclusiveUtc.toISOString()).toBe(
        '2024-03-01T06:00:00.000Z',
      );
    });

    it('accepts a range ending on the 31st', () => {
      const period = createReportingPeriod('2026-01-30', '2026-01-31');
      expect(period.endExclusiveUtc.toISOString()).toBe(
        '2026-02-01T06:00:00.000Z',
      );
    });
  });

  describe('inclusiveEndBound', () => {
    it('is one millisecond before the exclusive end (23:59:59.999 local)', () => {
      const period = createReportingPeriod('2026-09-18', '2026-09-18');
      expect(inclusiveEndBound(period).toISOString()).toBe(
        '2026-09-19T05:59:59.999Z',
      );
    });
  });

  describe('resolveReportingBounds (legacy one-sided support)', () => {
    it('resolves both calendar dates into a period', () => {
      const bounds = resolveReportingBounds('2026-09-18', '2026-09-20');
      expect(bounds.period).toBeDefined();
      expect(bounds.startInclusiveUtc?.toISOString()).toBe(
        '2026-09-18T06:00:00.000Z',
      );
      // 2026-09-20 23:59:59.999 local == 2026-09-21T05:59:59.999Z
      expect(bounds.endInclusiveUtc?.toISOString()).toBe(
        '2026-09-21T05:59:59.999Z',
      );
      expect(bounds.localStartDate).toBe('2026-09-18');
      expect(bounds.localEndDate).toBe('2026-09-20');
    });

    it('resolves a start-only bound without an end', () => {
      const bounds = resolveReportingBounds('2026-09-18', undefined);
      expect(bounds.startInclusiveUtc?.toISOString()).toBe(
        '2026-09-18T06:00:00.000Z',
      );
      expect(bounds.endInclusiveUtc).toBeUndefined();
      expect(bounds.period).toBeUndefined();
      expect(bounds.localStartDate).toBe('2026-09-18');
      expect(bounds.localEndDate).toBeUndefined();
    });

    it('resolves an end-only bound as the inclusive 23:59:59.999 local edge', () => {
      const bounds = resolveReportingBounds(undefined, '2026-09-18');
      expect(bounds.startInclusiveUtc).toBeUndefined();
      expect(bounds.endInclusiveUtc?.toISOString()).toBe(
        '2026-09-19T05:59:59.999Z',
      );
      expect(bounds.localEndDate).toBe('2026-09-18');
      expect(bounds.localStartDate).toBeUndefined();
    });

    it('treats absent and empty inputs as unbounded', () => {
      const bounds = resolveReportingBounds(undefined, '');
      expect(bounds.startInclusiveUtc).toBeUndefined();
      expect(bounds.endInclusiveUtc).toBeUndefined();
      expect(bounds.localStartDate).toBeUndefined();
      expect(bounds.localEndDate).toBeUndefined();
    });

    it('keeps legacy tolerance for full ISO timestamp inputs', () => {
      const bounds = resolveReportingBounds(
        '2026-09-18T12:30:00.000Z',
        '2026-09-19T03:00:00.000Z',
      );
      expect(bounds.startInclusiveUtc?.toISOString()).toBe(
        '2026-09-18T12:30:00.000Z',
      );
      expect(bounds.endInclusiveUtc?.toISOString()).toBe(
        '2026-09-19T03:00:00.000Z',
      );
      expect(bounds.localStartDate).toBe('2026-09-18');
      expect(bounds.localEndDate).toBe('2026-09-18');
    });

    it('ignores unparseable garbage input like the legacy parser did', () => {
      const bounds = resolveReportingBounds('garbage', undefined);
      expect(bounds.startInclusiveUtc).toBeUndefined();
      expect(bounds.localStartDate).toBeUndefined();
    });

    it('rejects an inverted range', () => {
      expect(() => resolveReportingBounds('2026-09-20', '2026-09-18')).toThrow(
        ReportingPeriodValidationError,
      );
    });
  });

  describe('bucket helpers', () => {
    it('eachLocalDate enumerates every local calendar day of the period', () => {
      const period = createReportingPeriod('2026-09-30', '2026-10-02');
      expect(eachLocalDate(period)).toEqual([
        '2026-09-30',
        '2026-10-01',
        '2026-10-02',
      ]);
    });

    it('managuaHourBucket converts a UTC instant to the local wall-clock hour', () => {
      // 08:15 UTC == 02:15 local (UTC-6)
      expect(managuaHourBucket(new Date('2026-09-18T08:15:00.000Z'))).toBe(2);
      // 05:30 UTC == 23:30 local of the previous day
      expect(managuaHourBucket(new Date('2026-09-19T05:30:00.000Z'))).toBe(23);
      // 06:00 UTC == 00:00 local
      expect(managuaHourBucket(new Date('2026-09-18T06:00:00.000Z'))).toBe(0);
    });

    it('addLocalDays crosses month and year boundaries', () => {
      expect(addLocalDays('2026-01-31', 1)).toBe('2026-02-01');
      expect(addLocalDays('2024-02-28', 1)).toBe('2024-02-29');
      expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addLocalDays('2026-09-18', -1)).toBe('2026-09-17');
    });

    it('formatLocalDateKey renders a UTC instant as its Managua calendar date', () => {
      expect(formatLocalDateKey(new Date('2026-09-19T05:30:00.000Z'))).toBe(
        '2026-09-18',
      );
      expect(formatLocalDateKey(new Date('2026-09-19T06:00:00.000Z'))).toBe(
        '2026-09-19',
      );
    });
  });

  describe('timezone constants', () => {
    it('pins the reporting timezone and offset', () => {
      expect(REPORTING_TIMEZONE).toBe('America/Managua');
      expect(MANAGUA_UTC_OFFSET).toBe('-06:00');
    });

    it('currentLocalDateKey matches the legacy en-CA Managua formatting', () => {
      expect(currentLocalDateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
