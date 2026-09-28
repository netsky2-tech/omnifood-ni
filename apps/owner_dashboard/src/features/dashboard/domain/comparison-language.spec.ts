import { describe, it, expect } from "vitest";
import { formatHumanComparisonLabel } from "./comparison-language";
import type { ComparisonPeriod } from "./comparison-period";

describe("formatHumanComparisonLabel", () => {
  it("formats single-day yesterday as 'vs ayer'", () => {
    const period: ComparisonPeriod = {
      currentStart: "2026-09-26",
      currentEnd: "2026-09-26",
      previousStart: "2026-09-25",
      previousEnd: "2026-09-25",
    };
    expect(formatHumanComparisonLabel(period)).toBe("vs ayer");
  });

  it("formats single-day same weekday (7 days earlier) as 'vs <weekday> anterior'", () => {
    // 2026-09-26 is Saturday
    const period: ComparisonPeriod = {
      currentStart: "2026-09-26",
      currentEnd: "2026-09-26",
      previousStart: "2026-09-19",
      previousEnd: "2026-09-19",
    };
    expect(formatHumanComparisonLabel(period)).toBe("vs sábado anterior");
  });

  it("formats 7-day range as 'vs 7 días anteriores'", () => {
    const period: ComparisonPeriod = {
      currentStart: "2026-09-20",
      currentEnd: "2026-09-26",
      previousStart: "2026-09-13",
      previousEnd: "2026-09-19",
    };
    expect(formatHumanComparisonLabel(period)).toBe("vs 7 días anteriores");
  });

  it("formats 30-day range as 'vs 30 días anteriores'", () => {
    const period: ComparisonPeriod = {
      currentStart: "2026-08-28",
      currentEnd: "2026-09-26",
      previousStart: "2026-07-29",
      previousEnd: "2026-08-27",
    };
    expect(formatHumanComparisonLabel(period)).toBe("vs 30 días anteriores");
  });

  it("formats month-based range starting on the 1st as 'vs mismo período del mes anterior'", () => {
    const period: ComparisonPeriod = {
      currentStart: "2026-09-01",
      currentEnd: "2026-09-26",
      previousStart: "2026-08-01",
      previousEnd: "2026-08-26",
    };
    expect(formatHumanComparisonLabel(period)).toBe("vs mismo período del mes anterior");
  });

  it("falls back to 'vs periodo anterior' for arbitrary non-matching ranges", () => {
    const period: ComparisonPeriod = {
      currentStart: "2026-09-10",
      currentEnd: "2026-09-15",
      previousStart: "2026-09-04",
      previousEnd: "2026-09-09",
    };
    expect(formatHumanComparisonLabel(period)).toBe("vs periodo anterior");
  });
});
