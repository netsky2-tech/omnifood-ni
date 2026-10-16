/**
 * Success toast contrast contract (user report: "fondo verde perfecto, pero
 * las letras en un blanco tirando a gris").
 *
 * The old dark-mode variant was `dark:bg-emerald-950/80 dark:text-emerald-50`:
 * the /80 alpha let the page background bleed through (washing out the green),
 * `emerald-50` is a desaturated near-white green (reads as gray), and the
 * shared `ToastDescription` adds `opacity-90` on top. Net effect: washed,
 * low-contrast letters on a muddy green — exactly what was reported.
 *
 * The contract now pins: SOLID dark surface (no alpha bleed), pure white
 * text in dark mode, and dark-green text in light mode — mirroring the
 * destructive variant's solid-bg pattern. Asserted on the exported cva
 * because Radix defers toast mounting through a Presence portal that jsdom
 * does not surface synchronously.
 */
import { describe, expect, it } from "vitest";
import { toastVariants } from "@/components/ui/toast";

function successClasses(): string {
  return toastVariants({ variant: "success" });
}

describe("Toast success variant — contrast contract", () => {
  it("uses a solid dark green surface in dark mode (no alpha bleed-through)", () => {
    const classes = successClasses();

    expect(classes).toContain("dark:bg-emerald-900");
    expect(classes).not.toContain("dark:bg-emerald-950/80");
  });

  it("uses pure white text in dark mode instead of desaturated emerald-50", () => {
    const classes = successClasses();

    expect(classes).toContain("dark:text-white");
    expect(classes).not.toContain("dark:text-emerald-50");
  });

  it("keeps the light-mode high-contrast pairing (dark green text on pale green)", () => {
    const classes = successClasses();

    // R18/S15: the same pairing on the token ramp — secondary-50 surface
    // with secondary-700 ink (8.55:1, WCAG AA).
    expect(classes).toContain("bg-secondary-50");
    expect(classes).toContain("text-secondary-700");
  });

  it("keeps a visible border for definition against the page", () => {
    const classes = successClasses();

    expect(classes).toContain("dark:border-emerald-600");
    expect(classes).toContain("border-secondary-700/30");
  });
});
