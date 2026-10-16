/**
 * R18 (S15) — the status vocabulary of the backoffice lives in the tokens of
 * `docs/DESIGN_BACKOFFICE.md` §2, not in Tailwind's raw palette.
 *
 * Two durable guards, both written the way `dashboard-a11y-compliance.spec.tsx`
 * already writes them (read the source, do the colour math, fail on the
 * regression rather than on a screenshot):
 *
 * 1. The shared status components (`alert`, `badge`, `toast`, `stat-card`,
 *    `button`) contain ZERO raw status palette. Those five files are what the
 *    ~144 `<Alert>`/`<Badge>` usages render through, so the vocabulary is the
 *    cheapest place the whole app can be pulled back onto the system.
 * 2. Every status ink-on-surface pair the vocabulary uses passes WCAG AA for
 *    small text, computed from the hexes actually declared in `index.css`.
 *    The base status colors are documented as border/icon/solid-fill colors:
 *    on their own `-50` tint they fail (warning 2.07:1, info 3.38:1,
 *    destructive 4.41:1), which is exactly why the `-700` text shades exist.
 *
 * Raw palette OUTSIDE these five files (feature code writing `bg-amber-50` by
 * hand) is a measured, declared follow-up — see
 * `odd/tasks/nucleo-inventario-remediacion-pre-integracion.md` L37.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(import.meta.dirname, "..");

const STATUS_COMPONENTS = [
  "components/ui/alert.tsx",
  "components/ui/badge.tsx",
  "components/ui/toast.tsx",
  "components/ui/stat-card.tsx",
  "components/ui/button.tsx",
];

const RAW_STATUS_PALETTE =
  /(?:bg|text|border|ring-offset|ring|from|to|divide)-(?:amber|emerald|blue|red|rose|green|sky|indigo|violet)-\d{2,3}/g;

/**
 * Dark mode is explicitly NOT part of the v1 system (`DESIGN_BACKOFFICE.md`
 * §2: "Dark mode: No implementado en v1"), and `index.css` declares no dark
 * tokens. The `dark:*` stopgaps the owner already tuned per surface (the
 * success toast contrast fix) are therefore out of this contract's reach: the
 * vocabulary is judged on the light theme the system actually defines.
 */
const DARK_STOPGAPS =
  /\bdark:(?:\[[^\]]*\]:)?(?:bg|text|border|ring-offset|ring|from|to|divide)-(?:amber|emerald|blue|red|rose|green|sky|indigo|violet)-\d{2,3}(?:\/\d{1,3})?/g;

function readSource(relativePath: string): string {
  return readFileSync(resolve(SRC_ROOT, relativePath), "utf8");
}

function tokenColor(token: string): string {
  const css = readSource("index.css");
  const match = new RegExp(`--color-${token}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  expect(match, `token --color-${token} must exist in index.css`).not.toBeNull();
  return match![1]!;
}

function luminance(hex: string): number {
  const channels = [0, 2, 4]
    .map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(fg: string, bg: string): number {
  const [lighter, darker] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe("§2 design tokens — the status vocabulary is token-based (R18/S15)", () => {
  it.each(STATUS_COMPONENTS)(
    "%s carries no raw status palette",
    (component) => {
      const source = readSource(component).replace(DARK_STOPGAPS, "");
      const offenders = source.match(RAW_STATUS_PALETTE) ?? [];
      expect(
        [...new Set(offenders)],
        `${component} must use the --color-* status tokens, not Tailwind's raw palette`,
      ).toEqual([]);
    },
  );

  it("declares the -700 text shades the ramp rule requires", () => {
    for (const token of ["destructive-700", "warning-700", "info-700"]) {
      expect(tokenColor(token)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  // The pairs the migrated vocabulary actually paints.
  it.each([
    ["warning-700", "warning-50"],
    ["info-700", "info-50"],
    ["destructive-700", "destructive-50"],
    ["secondary-700", "secondary-50"],
    ["warning-700", "card"],
    ["info-700", "card"],
    ["destructive-700", "card"],
    ["secondary-700", "card"],
  ] as const)("AA small text: %s on %s", (ink, surface) => {
    const ratio = contrastRatio(tokenColor(ink), tokenColor(surface));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the base status colors out of small text on their own tint", () => {
    // Regression guard for the ramp rule itself: if someone paints words with
    // the base color again, these ratios are the ones that fail AA.
    expect(contrastRatio(tokenColor("warning"), tokenColor("warning-50"))).toBeLessThan(4.5);
    expect(contrastRatio(tokenColor("info"), tokenColor("info-50"))).toBeLessThan(4.5);
    expect(contrastRatio(tokenColor("destructive"), tokenColor("destructive-50"))).toBeLessThan(4.5);
  });

  it("pairs white text only with solid status fills that pass AA", () => {
    expect(contrastRatio("#ffffff", tokenColor("secondary-700"))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#ffffff", tokenColor("destructive"))).toBeGreaterThanOrEqual(4.5);
  });
});
