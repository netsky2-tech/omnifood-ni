/**
 * Design-system contract: the Badge `success` variant is SOLID dark green
 * with white text (owner decision, mirroring the success toast from #917).
 *
 * The old pale variant (`border-emerald-200 bg-emerald-50 text-emerald-700`)
 * washed out on white tables and carried none of the visual weight of the
 * solid red `destructive` variant it is paired with across the app
 * (users, recipes, promotions, catalog, loyalty, suppliers).
 *
 * Contrast: emerald-700 (#047857) with white text = 5.2:1 (WCAG AA).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";

describe("Badge success variant — solid design-system contract", () => {
  it("renders a solid dark green surface with white text", () => {
    render(
      <Badge variant="success" data-testid="success-badge">
        Activo
      </Badge>,
    );

    const badge = screen.getByTestId("success-badge");
    expect(badge.className).toContain("bg-emerald-700");
    expect(badge.className).toContain("text-white");
  });

  it("no longer uses the washed pale palette", () => {
    render(
      <Badge variant="success" data-testid="success-badge">
        Activo
      </Badge>,
    );

    const badge = screen.getByTestId("success-badge");
    expect(badge.className).not.toContain("bg-emerald-50");
    expect(badge.className).not.toContain("text-emerald-700");
  });
});
