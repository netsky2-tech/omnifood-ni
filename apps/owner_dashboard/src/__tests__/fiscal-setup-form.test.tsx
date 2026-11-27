import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FiscalSetupForm } from "@/features/settings/fiscal-setup-form";
import { FiscalRegime, fiscalSetupSchema } from "@/features/settings/types";
import { RUC_ACCEPTED_FORMS_MESSAGE } from "@/features/settings/nicaragua-fiscal";
import { setTokens, clearTokens } from "@/lib/api";

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "owner-jwt-test", refreshToken: "owner-refresh-test" });
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
});

const basePayload = {
  businessName: "Pulpería La Bendición",
  commercialFxSpread: 36.5,
  pricesIncludeTax: true,
};

describe("T3 (S3) — CONTROL_INTERNO Fiscal Regime", () => {
  describe("fiscalSetupSchema", () => {
    it("accepts CONTROL_INTERNO with empty or omitted ruc", () => {
      const emptyRuc = fiscalSetupSchema.safeParse({
        ...basePayload,
        regime: "CONTROL_INTERNO",
        ruc: "",
      });
      expect(emptyRuc.success).toBe(true);

      const omittedRuc = fiscalSetupSchema.safeParse({
        ...basePayload,
        regime: "CONTROL_INTERNO",
      });
      expect(omittedRuc.success).toBe(true);
    });

    it("accepts CONTROL_INTERNO with a valid ruc or cédula", () => {
      const withJuridico = fiscalSetupSchema.safeParse({
        ...basePayload,
        regime: "CONTROL_INTERNO",
        ruc: "J0310000012345",
      });
      expect(withJuridico.success).toBe(true);

      const withCedula = fiscalSetupSchema.safeParse({
        ...basePayload,
        regime: "CONTROL_INTERNO",
        ruc: "001-150885-1004J",
      });
      expect(withCedula.success).toBe(true);
    });

    it("rejects CONTROL_INTERNO when a non-empty ruc is invalid", () => {
      const invalidRuc = fiscalSetupSchema.safeParse({
        ...basePayload,
        regime: "CONTROL_INTERNO",
        ruc: "INVALID-RUC",
      });
      expect(invalidRuc.success).toBe(false);
      if (!invalidRuc.success) {
        expect(
          invalidRuc.error.issues.some(
            (i) => i.path.includes("ruc") && i.message === RUC_ACCEPTED_FORMS_MESSAGE,
          ),
        ).toBe(true);
      }
    });

    it.each([FiscalRegime.CUOTA_FIJA, FiscalRegime.REGIMEN_GENERAL])(
      "requires valid ruc for %s (regression guard)",
      (regime) => {
        const emptyRuc = fiscalSetupSchema.safeParse({
          ...basePayload,
          regime,
          ruc: "",
        });
        expect(emptyRuc.success).toBe(false);

        const omittedRuc = fiscalSetupSchema.safeParse({
          ...basePayload,
          regime,
        });
        expect(omittedRuc.success).toBe(false);
      },
    );
  });

  describe("FiscalSetupForm UI", () => {
    const mockInitialFiscalSetup = (regime: string = FiscalRegime.CUOTA_FIJA, ruc: string | null = "") => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: "tenant-ci-1",
            businessName: "Pulpería La Bendición",
            ruc,
            regime,
            taxRateIva: regime === FiscalRegime.REGIMEN_GENERAL ? 0.15 : 0.0,
            pricesIncludeTax: true,
            commercialFxSpread: 36.5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    };

    it("presents 3 regime options, marks RUC optional, shows non-fiscal notice, displays 0% IVA, and submits CONTROL_INTERNO without RUC", async () => {
      const user = userEvent.setup();
      mockInitialFiscalSetup(FiscalRegime.CUOTA_FIJA, "");

      render(
        <TestWrapper>
          <FiscalSetupForm />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("fiscal-setup-form")).toBeInTheDocument();
      });

      const regimeSelect = screen.getByLabelText(/Régimen Fiscal/i) as HTMLSelectElement;
      const optionValues = Array.from(regimeSelect.options).map((o) => o.value);
      expect(optionValues).toEqual(["CONTROL_INTERNO", "CUOTA_FIJA", "REGIMEN_GENERAL"]);

      // Select CONTROL_INTERNO
      await user.selectOptions(regimeSelect, "CONTROL_INTERNO");

      // RUC label becomes optional without required asterisk
      expect(screen.getByLabelText("RUC / Cédula (Opcional)")).toBeInTheDocument();

      // Non-fiscal informational banner is displayed
      const banner = screen.getByTestId("control-interno-non-fiscal-banner");
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(/NOTA DE VENTA — DOCUMENTO NO FISCAL/i);

      // IVA locked/displayed at 0%
      expect(screen.getByText("Control Interno (0% IVA — No fiscal)")).toBeInTheDocument();

      // Mock POST response
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: "tenant-ci-1",
            businessName: "Pulpería La Bendición",
            ruc: null,
            regime: "CONTROL_INTERNO",
            taxRateIva: 0.0,
            pricesIncludeTax: true,
            commercialFxSpread: 36.5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await user.click(screen.getByTestId("save-fiscal-setup-button"));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/onboarding/fiscal-setup",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining('"regime":"CONTROL_INTERNO"'),
          }),
        );
      });
    });

    it.each([FiscalRegime.CUOTA_FIJA, FiscalRegime.REGIMEN_GENERAL])(
      "blocks submission when %s is selected without RUC",
      async (regime) => {
        const user = userEvent.setup();
        // Start in CONTROL_INTERNO so switching to CUOTA_FIJA / REGIMEN_GENERAL marks form dirty
        mockInitialFiscalSetup("CONTROL_INTERNO" as FiscalRegime, "");

        render(
          <TestWrapper>
            <FiscalSetupForm />
          </TestWrapper>,
        );

        await waitFor(() => {
          expect(screen.getByTestId("fiscal-setup-form")).toBeInTheDocument();
        });

        const regimeSelect = screen.getByLabelText(/Régimen Fiscal/i);
        await user.selectOptions(regimeSelect, regime);

        expect(screen.getByLabelText("RUC (Número RUC) *")).toBeInTheDocument();
        expect(screen.queryByTestId("control-interno-non-fiscal-banner")).not.toBeInTheDocument();

        await user.click(screen.getByTestId("save-fiscal-setup-button"));

        await waitFor(() => {
          expect(screen.getByText(RUC_ACCEPTED_FORMS_MESSAGE)).toBeInTheDocument();
        });

        // Only the initial GET was called — POST was blocked
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      },
    );
  });
});
