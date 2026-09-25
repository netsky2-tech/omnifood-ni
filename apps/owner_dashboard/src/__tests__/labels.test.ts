import { describe, expect, it } from "vitest";
import {
  localize,
  lifecycleStateLabels,
  alertSeverityLabels,
  importModeLabels,
  duplicateResolutionLabels,
  backendActivationErrorLabels,
} from "@/lib/labels";
import { OnboardingLifecycleState } from "@/features/onboarding/types";

/**
 * Regression guard for the dashboard label layer (issue #587 / D2, D4).
 *
 * Every exported family must have: non-empty keys, non-empty Spanish values
 * (no raw SCREAMING_CASE values passed through as "labels"), and `localize`
 * must pass unknown codes through untouched so the UI never crashes on a new
 * backend code — the gap is caught here, at the map level.
 *
 * The SCREAMING_CASE check mirrors the POS guard in
 * apps/pos_app/test/core/localization/label_map_test.dart.
 */

const SCREAMING_CASE = /^[A-Z][A-Z_]+$/;

const families: Record<string, Record<string, string>> = {
  lifecycleStateLabels,
  alertSeverityLabels,
  importModeLabels,
  duplicateResolutionLabels,
  backendActivationErrorLabels,
};

describe("label families — map hygiene", () => {
  it.each(Object.keys(families))("%s has non-empty keys and non-Screaming values", (familyName) => {
    const family = families[familyName];
    if (!family) throw new Error(`label family not found: ${familyName}`);
    expect(Object.keys(family).length).toBeGreaterThan(0);
    for (const [code, label] of Object.entries(family)) {
      expect(code.trim(), `${familyName}[${code}] key`).not.toBe("");
      expect(label.trim(), `${familyName}[${code}] value`).not.toBe("");
      expect(label, `${familyName}[${code}] must be human copy, not a raw code`).not.toMatch(
        SCREAMING_CASE,
      );
    }
  });
});

describe("label families — key sets verified against source enums", () => {
  it("lifecycleStateLabels matches OnboardingLifecycleState exactly", () => {
    expect(Object.keys(lifecycleStateLabels).sort()).toEqual(
      Object.values(OnboardingLifecycleState).sort(),
    );
  });

  it("alertSeverityLabels matches AlertSeverity exactly", () => {
    expect(Object.keys(alertSeverityLabels).sort()).toEqual(
      ["CRITICAL", "WARNING", "NEGATIVE_STOCK"].sort(),
    );
  });

  it("importModeLabels matches CommitMode exactly", () => {
    expect(Object.keys(importModeLabels).sort()).toEqual(
      ["VALID_ONLY", "ALL_OR_NOTHING"].sort(),
    );
  });

  it("duplicateResolutionLabels matches DuplicateResolution exactly", () => {
    expect(Object.keys(duplicateResolutionLabels).sort()).toEqual(
      ["REPLACE", "SKIP", "FAIL"].sort(),
    );
  });

  it("backendActivationErrorLabels covers the documented activation-attempt failure codes", () => {
    expect(Object.keys(backendActivationErrorLabels).sort()).toEqual(
      [
        "CANNOT_START_ACTIVATION_NOT_SALE_READY",
        "ACTIVE_ATTEMPT_EXISTS",
        "FISCAL_REVISION_NOT_AVAILABLE",
      ].sort(),
    );
  });
});

describe("localize", () => {
  it("returns the mapped Spanish label for a known code", () => {
    expect(localize("SALE_READY", lifecycleStateLabels)).toBe("Listo para Venta");
    expect(localize("CRITICAL", alertSeverityLabels)).toBe("Crítica");
  });

  it("passes unknown codes through untouched (never crashes, never '(unknown)')", () => {
    expect(localize("SOME_FUTURE_CODE", lifecycleStateLabels)).toBe("SOME_FUTURE_CODE");
    expect(localize("SOME_FUTURE_CODE", backendActivationErrorLabels)).toBe("SOME_FUTURE_CODE");
  });
});
