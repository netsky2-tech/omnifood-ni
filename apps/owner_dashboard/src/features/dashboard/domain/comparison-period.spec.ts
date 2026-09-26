import { describe, expect, it } from "vitest";
import {
  resolveComparisonPeriod,
  type ComparisonPeriod,
  type LocalDateRange,
} from "./comparison-period";

/**
 * Comparison-period semantics under test (authority):
 * - docs/dashboard/owner_dashboard_v2_architecture_spec_v0.3.md §6.3
 * - docs/dashboard/owner_dashboard_v2_prd_v1.0.md §9 (§9.2 presets, §9.3 rules,
 *   §9.4 America/Managua calendar-day semantics + clamping, §9.5 no fake delta)
 *
 * All dates are inclusive local calendar days serialized as YYYY-MM-DD.
 * The reference "now" is always injected: the module must be deterministic
 * and pure (no Date.now, no timezone-dependent Date methods).
 */

interface PresetCase {
  readonly name: string;
  readonly now: string;
  readonly preset: Parameters<typeof resolveComparisonPeriod>[0];
  readonly expected: ComparisonPeriod;
}

const PRESET_CASES: readonly PresetCase[] = [
  // --- single-day presets: previous same weekday (-7 days) ---
  {
    name: "today compares with the same weekday one week earlier",
    now: "2029-03-15",
    preset: "today",
    expected: {
      currentStart: "2029-03-15",
      currentEnd: "2029-03-15",
      previousStart: "2029-03-08",
      previousEnd: "2029-03-08",
    },
  },
  {
    name: "yesterday compares with the same weekday one week earlier",
    now: "2029-03-15",
    preset: "yesterday",
    expected: {
      currentStart: "2029-03-14",
      currentEnd: "2029-03-14",
      previousStart: "2029-03-07",
      previousEnd: "2029-03-07",
    },
  },
  {
    name: "today resolves across the Dec->Jan year boundary",
    now: "2029-01-02",
    preset: "today",
    expected: {
      currentStart: "2029-01-02",
      currentEnd: "2029-01-02",
      previousStart: "2028-12-26",
      previousEnd: "2028-12-26",
    },
  },
  // --- rolling multi-day presets: immediately preceding equal-duration range ---
  {
    name: "last7 uses the trailing 7 days including today",
    now: "2029-03-15",
    preset: "last7",
    expected: {
      currentStart: "2029-03-09",
      currentEnd: "2029-03-15",
      previousStart: "2029-03-02",
      previousEnd: "2029-03-08",
    },
  },
  {
    name: "last30 uses the trailing 30 days including today",
    now: "2029-03-15",
    preset: "last30",
    expected: {
      currentStart: "2029-02-14",
      currentEnd: "2029-03-15",
      previousStart: "2029-01-15",
      previousEnd: "2029-02-13",
    },
  },
  // --- MTD: same elapsed days of the previous month, clamped to its calendar ---
  {
    name: "thisMonth clamps the 31st against a non-leap February",
    now: "2029-03-31",
    preset: "thisMonth",
    expected: {
      currentStart: "2029-03-01",
      currentEnd: "2029-03-31",
      previousStart: "2029-02-01",
      previousEnd: "2029-02-28",
    },
  },
  {
    name: "thisMonth clamps the 31st against leap-day February 2028",
    now: "2028-03-31",
    preset: "thisMonth",
    expected: {
      currentStart: "2028-03-01",
      currentEnd: "2028-03-31",
      previousStart: "2028-02-01",
      previousEnd: "2028-02-29",
    },
  },
  {
    name: "thisMonth on day 1 compares single elapsed day",
    now: "2029-03-01",
    preset: "thisMonth",
    expected: {
      currentStart: "2029-03-01",
      currentEnd: "2029-03-01",
      previousStart: "2029-02-01",
      previousEnd: "2029-02-01",
    },
  },
  {
    name: "thisMonth crosses the Dec->Jan year boundary into the previous year",
    now: "2029-01-15",
    preset: "thisMonth",
    expected: {
      currentStart: "2029-01-01",
      currentEnd: "2029-01-15",
      previousStart: "2028-12-01",
      previousEnd: "2028-12-15",
    },
  },
  // --- prevMonth: complete previous calendar month, compared with the same
  //     elapsed range of the month before it (clamped, never overlapping) ---
  {
    name: "prevMonth compares February against the same elapsed days of January",
    now: "2029-03-15",
    preset: "prevMonth",
    expected: {
      currentStart: "2029-02-01",
      currentEnd: "2029-02-28",
      previousStart: "2029-01-01",
      previousEnd: "2029-01-28",
    },
  },
  {
    name: "prevMonth clamps the 31-day December against 30-day November",
    now: "2029-01-15",
    preset: "prevMonth",
    expected: {
      currentStart: "2028-12-01",
      currentEnd: "2028-12-31",
      previousStart: "2028-11-01",
      previousEnd: "2028-11-30",
    },
  },
  {
    name: "prevMonth keeps leap-day February 2028 elapsed duration",
    now: "2028-03-15",
    preset: "prevMonth",
    expected: {
      currentStart: "2028-02-01",
      currentEnd: "2028-02-29",
      previousStart: "2028-01-01",
      previousEnd: "2028-01-29",
    },
  },
  // --- YTD: same elapsed prior-year range, clamped (Feb-29 case) ---
  {
    name: "thisYear compares with the same elapsed range of the previous year",
    now: "2029-03-15",
    preset: "thisYear",
    expected: {
      currentStart: "2029-01-01",
      currentEnd: "2029-03-15",
      previousStart: "2028-01-01",
      previousEnd: "2028-03-15",
    },
  },
  {
    name: "thisYear clamps leap day 2028-02-29 against non-leap 2027",
    now: "2028-02-29",
    preset: "thisYear",
    expected: {
      currentStart: "2028-01-01",
      currentEnd: "2028-02-29",
      previousStart: "2027-01-01",
      previousEnd: "2027-02-28",
    },
  },
  {
    name: "thisYear on Jan 1 compares a single day",
    now: "2029-01-01",
    preset: "thisYear",
    expected: {
      currentStart: "2029-01-01",
      currentEnd: "2029-01-01",
      previousStart: "2028-01-01",
      previousEnd: "2028-01-01",
    },
  },
];

interface ExplicitRangeCase {
  readonly name: string;
  readonly range: LocalDateRange;
  readonly expected: ComparisonPeriod;
}

const EXPLICIT_RANGE_CASES: readonly ExplicitRangeCase[] = [
  {
    name: "single-day explicit range compares with the same weekday one week earlier",
    range: { start: "2029-03-13", end: "2029-03-13" },
    expected: {
      currentStart: "2029-03-13",
      currentEnd: "2029-03-13",
      previousStart: "2029-03-06",
      previousEnd: "2029-03-06",
    },
  },
  {
    name: "multi-day explicit range compares with the immediately preceding equal-duration range",
    range: { start: "2029-02-10", end: "2029-02-19" },
    expected: {
      currentStart: "2029-02-10",
      currentEnd: "2029-02-19",
      previousStart: "2029-01-31",
      previousEnd: "2029-02-09",
    },
  },
  {
    name: "multi-day explicit range resolves across the Dec->Jan year boundary",
    range: { start: "2029-01-01", end: "2029-01-05" },
    expected: {
      currentStart: "2029-01-01",
      currentEnd: "2029-01-05",
      previousStart: "2028-12-27",
      previousEnd: "2028-12-31",
    },
  },
];

const VALID_NOW = "2029-03-15";

describe("resolveComparisonPeriod presets", () => {
  for (const testCase of PRESET_CASES) {
    it(testCase.name, () => {
      expect(resolveComparisonPeriod(testCase.preset, testCase.now)).toEqual(
        testCase.expected,
      );
    });
  }
});

describe("resolveComparisonPeriod explicit ranges", () => {
  for (const testCase of EXPLICIT_RANGE_CASES) {
    it(testCase.name, () => {
      expect(
        resolveComparisonPeriod(testCase.range, VALID_NOW),
      ).toEqual(testCase.expected);
    });
  }
});

describe("resolveComparisonPeriod invariants", () => {
  it("never lets the previous range overlap the current range", () => {
    for (const presetCase of PRESET_CASES) {
      const period = resolveComparisonPeriod(presetCase.preset, presetCase.now);
      expect(
        period.previousEnd < period.currentStart,
        `preset ${String(presetCase.preset)} at now=${presetCase.now}`,
      ).toBe(true);
    }
    for (const rangeCase of EXPLICIT_RANGE_CASES) {
      const period = resolveComparisonPeriod(rangeCase.range, VALID_NOW);
      expect(period.previousEnd < period.currentStart).toBe(true);
    }
  });

  it("keeps every resolved range non-empty and internally ordered", () => {
    for (const presetCase of PRESET_CASES) {
      const period = resolveComparisonPeriod(presetCase.preset, presetCase.now);
      expect(period.currentStart <= period.currentEnd).toBe(true);
      expect(period.previousStart <= period.previousEnd).toBe(true);
    }
  });
});

describe("resolveComparisonPeriod rejections", () => {
  it("throws TypeError for an inverted explicit range", () => {
    expect(() =>
      resolveComparisonPeriod(
        { start: "2029-03-10", end: "2029-03-05" },
        VALID_NOW,
      ),
    ).toThrow(TypeError);
    expect(() =>
      resolveComparisonPeriod(
        { start: "2029-03-10", end: "2029-03-05" },
        VALID_NOW,
      ),
    ).toThrow(/after/i);
  });

  it("throws TypeError for a malformed explicit date", () => {
    expect(() =>
      resolveComparisonPeriod(
        { start: "2029/03/05", end: "2029-03-10" },
        VALID_NOW,
      ),
    ).toThrow(TypeError);
  });

  it("throws TypeError for an impossible calendar date", () => {
    expect(() =>
      resolveComparisonPeriod(
        { start: "2029-02-30", end: "2029-03-10" },
        VALID_NOW,
      ),
    ).toThrow(TypeError);
  });

  it("throws TypeError for an unknown preset id", () => {
    expect(() =>
      resolveComparisonPeriod("lastWeek" as Parameters<
        typeof resolveComparisonPeriod
      >[0], VALID_NOW),
    ).toThrow(TypeError);
    expect(() =>
      resolveComparisonPeriod("lastWeek" as Parameters<
        typeof resolveComparisonPeriod
      >[0], VALID_NOW),
    ).toThrow(/preset/i);
  });

  it("throws TypeError for a malformed reference now", () => {
    expect(() => resolveComparisonPeriod("today", "not-a-date")).toThrow(
      TypeError,
    );
    expect(() => resolveComparisonPeriod("today", "")).toThrow(TypeError);
  });
});
