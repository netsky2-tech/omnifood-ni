import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth-store";
import { api } from "@/lib/api";
import { CreditNotesTab } from "@/features/sales/credit-notes-tab";
import type { AdminInvoice } from "@/features/sales/credit-notes-api";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  isApiError: () => false,
}));

const mockedGet = vi.mocked(api.get);

function buildInvoice(overrides: Partial<AdminInvoice> = {}): AdminInvoice {
  return {
    id: "inv-regular",
    number: "001-001-01-00000010",
    created_at: "2026-11-26T12:00:00Z",
    total: 250,
    type: "regular",
    isCanceled: false,
    customerId: null,
    items: [
      {
        id: "item-1",
        productName: "Café Latte",
        quantity: 2,
        unitPrice: 125,
        total: 250,
      },
    ],
    payments: [{ method: "cash" }],
    contingencyManualSeries: null,
    contingencyManualNumber: null,
    contingencyManualIssuedAt: null,
    ...overrides,
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: {
      id: "u-1",
      name: "Propietario",
      role: "OWNER",
      email: "owner@test.ni",
      active: true,
      tenantId: "tenant-1",
    },
    tenant: { id: "tenant-1", name: "Café Prueba" } as never,
    isAuthenticated: true,
    hydrated: true,
  });
});

describe("Contingency manual invoice visibility & filter (DT 09-2007 3.3.b)", () => {
  it("renders contingency badge and manual cross-reference for contingency invoices and omits it for regular invoices", async () => {
    const regularInvoice = buildInvoice({
      id: "inv-reg",
      number: "001-001-01-00000010",
    });
    const contingencyInvoice = buildInvoice({
      id: "inv-cont",
      number: "001-001-01-00000011",
      contingencyManualSeries: "MAN-01",
      contingencyManualNumber: "000142",
      contingencyManualIssuedAt: "2026-11-26",
    });

    mockedGet.mockResolvedValue([regularInvoice, contingencyInvoice]);

    renderWithProviders(<CreditNotesTab />);

    await screen.findByText("001-001-01-00000010");
    expect(screen.getByText("001-001-01-00000011")).toBeInTheDocument();

    const badges = screen.getAllByText("Contingencia manual");
    expect(badges).toHaveLength(1);
    expect(
      screen.getByText("Ref. manual: MAN-01-000142 · 2026-11-26"),
    ).toBeInTheDocument();
  });

  it("toggles 'Solo contingencia manual' filter to request GET /sales/admin/invoices?contingencyOnly=true and updates the list", async () => {
    const user = userEvent.setup();
    const regularInvoice = buildInvoice({
      id: "inv-reg",
      number: "001-001-01-00000010",
    });
    const contingencyInvoice = buildInvoice({
      id: "inv-cont",
      number: "001-001-01-00000011",
      contingencyManualSeries: "MAN-01",
      contingencyManualNumber: "000142",
      contingencyManualIssuedAt: "2026-11-26",
    });

    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("contingencyOnly=true")) {
        return [contingencyInvoice];
      }
      return [regularInvoice, contingencyInvoice];
    });

    renderWithProviders(<CreditNotesTab />);

    await screen.findByText("001-001-01-00000010");
    expect(screen.getByText("001-001-01-00000011")).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith(
      "/sales/admin/invoices",
      expect.any(Object),
    );

    const filterCheckbox = screen.getByRole("checkbox", {
      name: /solo contingencia manual/i,
    });
    await user.click(filterCheckbox);

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith(
        "/sales/admin/invoices?contingencyOnly=true",
        expect.any(Object),
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByText("001-001-01-00000010"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText("001-001-01-00000011")).toBeInTheDocument();
  });
});
