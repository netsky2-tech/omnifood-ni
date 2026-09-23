import { describe, expect, it } from "vitest";
import { toFiniteNumber } from "@/lib/numeric";

describe("toFiniteNumber", () => {
  it("coerces string decimals that Postgres numeric sends as text", () => {
    expect(toFiniteNumber("50.00")).toBe(50);
    expect(toFiniteNumber("1234.56")).toBe(1234.56);
    expect(toFiniteNumber("0.0000")).toBe(0);
    expect(toFiniteNumber("-2.50")).toBe(-2.5);
  });

  it("keeps already-numeric values untouched", () => {
    expect(toFiniteNumber(50)).toBe(50);
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber(-2.5)).toBe(-2.5);
    expect(toFiniteNumber(1234.56)).toBe(1234.56);
  });

  it("preserves decimal precision so toFixed still formats correctly", () => {
    expect(toFiniteNumber("1234.56").toFixed(2)).toBe("1234.56");
    expect(toFiniteNumber("0.005").toFixed(2)).toBe("0.01");
  });

  it("fails closed to the default fallback for NaN, Infinity and -Infinity", () => {
    expect(toFiniteNumber(Number.NaN)).toBe(0);
    expect(toFiniteNumber(Number.POSITIVE_INFINITY)).toBe(0);
    expect(toFiniteNumber(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(toFiniteNumber("Infinity")).toBe(0);
    expect(toFiniteNumber("-Infinity")).toBe(0);
  });

  it("fails closed for null, undefined, empty and non-numeric strings", () => {
    expect(toFiniteNumber(null)).toBe(0);
    expect(toFiniteNumber(undefined)).toBe(0);
    expect(toFiniteNumber("")).toBe(0);
    expect(toFiniteNumber("not-a-number")).toBe(0);
  });

  it("uses the custom fallback when the value is not finite", () => {
    // null and "" coerce to 0 via Number(), mirroring the backend helper —
    // only genuinely non-finite results take the fallback.
    expect(toFiniteNumber(null, 99)).toBe(0);
    expect(toFiniteNumber("", 99)).toBe(0);
    expect(toFiniteNumber(undefined, -1)).toBe(-1);
    expect(toFiniteNumber("NaN", 42)).toBe(42);
    expect(toFiniteNumber(Number.POSITIVE_INFINITY, 7.5)).toBe(7.5);
    expect(toFiniteNumber("not-a-number", 3)).toBe(3);
  });

  it("does not use the custom fallback when the value is a valid finite number", () => {
    expect(toFiniteNumber("50.00", 99)).toBe(50);
    expect(toFiniteNumber(0, 99)).toBe(0);
  });
});
