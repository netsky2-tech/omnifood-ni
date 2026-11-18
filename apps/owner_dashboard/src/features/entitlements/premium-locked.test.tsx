import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PremiumLocked } from "./premium-locked";
import { premiumLockedMessage } from "./premium-locked-message";

describe("PremiumLocked", () => {
  it("uses the exact contractual upgrade copy, naming the capability key", () => {
    render(<PremiumLocked capability="promotions.convenio" />);

    expect(
      screen.getByText(
        'La función requiere el plan o el complemento que incluye "promotions.convenio". Actualice su plan para usarla.',
      ),
    ).toBeInTheDocument();
  });

  it("builds the exact message for any key", () => {
    expect(premiumLockedMessage("inventory.retail")).toBe(
      'La función requiere el plan o el complemento que incluye "inventory.retail". Actualice su plan para usarla.',
    );
  });

  it("names the feature when one is given", () => {
    render(<PremiumLocked capability="loyalty" featureName="Fidelización" />);

    expect(screen.getByText(/Fidelización/)).toBeInTheDocument();
  });

  it("names the plan or add-on that unlocks the capability", () => {
    render(<PremiumLocked capability="inventory.retail" />);

    // Catalog §4: inventory.retail comes from the Retail pack (Operación
    // includes one pack, Pro includes both, Esencial buys it as add-on).
    expect(screen.getByText(/pack Retail/)).toBeInTheDocument();
  });

  it("honors an explicit unlock descriptor", () => {
    render(
      <PremiumLocked
        capability="reports.margins"
        unlockedBy="el bundle Inteligencia"
      />,
    );

    expect(screen.getByText(/el bundle Inteligencia/)).toBeInTheDocument();
  });
});
