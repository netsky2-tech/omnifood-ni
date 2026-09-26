import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth-store";
import { canPerformAction } from "@/lib/rbac";
import { CreditNotesTab } from "@/features/sales/credit-notes-tab";
import {
  fetchAdminInvoices,
  issueAdminCreditNote,
} from "@/features/sales/credit-notes-api";
import type {
  AdminInvoice,
  IssuedCreditNote,
} from "@/features/sales/credit-notes-api";

vi.mock("@/features/sales/credit-notes-api", () => ({
  fetchAdminInvoices: vi.fn(),
  issueAdminCreditNote: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchAdminInvoices);
const mockedIssue = vi.mocked(issueAdminCreditNote);

function buildInvoice(overrides: Partial<AdminInvoice> = {}): AdminInvoice {
  return {
    id: "inv-regular",
    number: "001-001-01-00000010",
    created_at: "2026-09-24T12:00:00Z",
    total: 115,
    type: "regular",
    isCanceled: false,
    customerId: null,
    items: [
      {
        id: "item-1",
        productName: "Café Espresso",
        quantity: 2,
        unitPrice: 50,
        total: 115,
      },
      {
        id: "item-2",
        productName: "Croissant",
        quantity: 1,
        unitPrice: 40,
        total: 40,
      },
    ],
    payments: [{ method: "cash" }],
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

function setRole(role: "OWNER" | "MANAGER" | "CASHIER" | "WAITER") {
  useAuthStore.setState({
    user: {
      id: "u-1",
      name: "Operador",
      role,
      email: "op@test.ni",
      active: true,
      tenantId: "tenant-1",
    },
    tenant: { id: "tenant-1", name: "Test" } as never,
    isAuthenticated: true,
    hydrated: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setRole("OWNER");
  mockedFetch.mockResolvedValue([
    buildInvoice(),
    buildInvoice({
      id: "inv-canceled",
      number: "001-001-01-00000011",
      isCanceled: true,
    }),
    buildInvoice({
      id: "inv-cn",
      number: "NC-40",
      type: "creditNote",
    }),
  ]);
});

describe("creditNotes.issue permission mirror (rbac.ts)", () => {
  it("maps to OWNER and MANAGER only, mirroring backend defaults", () => {
    expect(canPerformAction("OWNER", "creditNotes.issue")).toBe(true);
    expect(canPerformAction("MANAGER", "creditNotes.issue")).toBe(true);
    expect(canPerformAction("CASHIER", "creditNotes.issue")).toBe(false);
    expect(canPerformAction("WAITER", "creditNotes.issue")).toBe(false);
  });
});

describe("invoice picker gating (AC-1)", () => {
  it("offers issuance only on regular, non-canceled invoices", async () => {
    renderWithProviders(<CreditNotesTab />);
    await screen.findByText("001-001-01-00000010");

    expect(
      screen.getByTestId("issue-credit-note-inv-regular"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("issue-credit-note-inv-canceled"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("issue-credit-note-inv-cn"),
    ).not.toBeInTheDocument();
  });

  it("shows no issuance action for users without the permission", async () => {
    setRole("CASHIER");
    renderWithProviders(<CreditNotesTab />);
    await screen.findByText("001-001-01-00000010");

    expect(screen.queryByTestId("issue-credit-note-inv-regular"))
      .not.toBeInTheDocument();
    expect(mockedIssue).not.toHaveBeenCalled();
  });
});

describe("issuance dialog (AC-2 + D-20)", () => {
  it("renders full quantities read-only and blocks confirm while the reason is blank", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreditNotesTab />);
    await screen.findByText("001-001-01-00000010");

    await user.click(screen.getByTestId("issue-credit-note-inv-regular"));
    expect(screen.getByTestId("issuance-dialog")).toBeInTheDocument();
    // D-20: every origin item shown at FULL quantity, read-only.
    expect(screen.getAllByTestId("origin-item")).toHaveLength(2);
    expect(screen.getByText("Café Espresso × 2")).toBeInTheDocument();
    expect(screen.getByText("Croissant × 1")).toBeInTheDocument();

    const confirm = screen.getByTestId("confirm-issuance");
    expect(confirm).toBeDisabled();
    await user.type(screen.getByTestId("credit-note-reason"), "   ");
    expect(confirm).toBeDisabled();
    expect(mockedIssue).not.toHaveBeenCalled();
  });

  it("sends every item at full quantity and shows the allocated number (D-20 tripwire)", async () => {
    const user = userEvent.setup();
    mockedIssue.mockResolvedValue({
      id: "cn-1",
      number: "NC-40",
      originInvoiceId: "inv-regular",
      originInvoiceNumber: "001-001-01-00000010",
      total: -155,
    });
    renderWithProviders(<CreditNotesTab />);
    await screen.findByText("001-001-01-00000010");

    await user.click(screen.getByTestId("issue-credit-note-inv-regular"));
    await user.type(
      screen.getByTestId("credit-note-reason"),
      "Error de captura",
    );
    await user.click(screen.getByTestId("confirm-issuance"));

    await screen.findByTestId("issued-number");
    expect(mockedIssue).toHaveBeenCalledTimes(1);
    const body = mockedIssue.mock.calls[0]?.[0];
    expect(body?.originInvoiceId).toBe("inv-regular");
    // D-20 tripwire: FULL quantities, every item, nothing partial.
    expect(body?.items).toEqual([
      { originInvoiceItemId: "item-1", quantity: 2 },
      { originInvoiceItemId: "item-2", quantity: 1 },
    ]);
    expect(screen.getByTestId("issued-number")).toHaveTextContent("NC-40");
  });

  it("adds the card-separation sentence only when the origin had a card payment", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValue([
      buildInvoice({
        payments: [{ method: "card" }],
      }),
    ]);
    mockedIssue.mockResolvedValue({
      id: "cn-1",
      number: "NC-41",
      originInvoiceId: "inv-regular",
      originInvoiceNumber: "001-001-01-00000010",
      total: -155,
    });
    renderWithProviders(<CreditNotesTab />);
    await screen.findByText("001-001-01-00000010");

    await user.click(screen.getByTestId("issue-credit-note-inv-regular"));
    await user.type(screen.getByTestId("credit-note-reason"), "Cliente desiste");
    await user.click(screen.getByTestId("confirm-issuance"));

    await screen.findByTestId("issued-number");
    expect(screen.getByTestId("card-separation")).toBeInTheDocument();
  });

  it("does not add the card-separation sentence for cash payments", async () => {
    const user = userEvent.setup();
    mockedIssue.mockResolvedValue({
      id: "cn-1",
      number: "NC-42",
      originInvoiceId: "inv-regular",
      originInvoiceNumber: "001-001-01-00000010",
      total: -155,
    });
    renderWithProviders(<CreditNotesTab />);
    await screen.findByText("001-001-01-00000010");

    await user.click(screen.getByTestId("issue-credit-note-inv-regular"));
    await user.type(screen.getByTestId("credit-note-reason"), "Cliente desiste");
    await user.click(screen.getByTestId("confirm-issuance"));

    await screen.findByTestId("issued-number");
    expect(screen.queryByTestId("card-separation")).not.toBeInTheDocument();
  });
});

describe("failure states (honesty rule #548)", () => {
  it("renders the backend message on failure", async () => {
    const user = userEvent.setup();
    mockedIssue.mockRejectedValue(
      new Error("credit-note origin invoice was not found"),
    );
    renderWithProviders(<CreditNotesTab />);
    await screen.findByText("001-001-01-00000010");

    await user.click(screen.getByTestId("issue-credit-note-inv-regular"));
    await user.type(screen.getByTestId("credit-note-reason"), "Error");
    await user.click(screen.getByTestId("confirm-issuance"));

    await screen.findByTestId("issuance-error");
    expect(screen.getByTestId("issuance-error")).toHaveTextContent(
      "credit-note origin invoice was not found",
    );
    // No success claim without a committed issuance.
    expect(screen.queryByTestId("issued-number")).not.toBeInTheDocument();
  });

  it("translates the series-unconfigured error into actionable Spanish", async () => {
    const user = userEvent.setup();
    mockedIssue.mockRejectedValue(
      new Error(
        "FISCAL_CREDIT_NOTE_SERIES_UNCONFIGURED: no CREDIT_NOTE_SERIES row is configured for this tenant",
      ),
    );
    renderWithProviders(<CreditNotesTab />);
    await screen.findByText("001-001-01-00000010");

    await user.click(screen.getByTestId("issue-credit-note-inv-regular"));
    await user.type(screen.getByTestId("credit-note-reason"), "Error");
    await user.click(screen.getByTestId("confirm-issuance"));

    await screen.findByTestId("issuance-error");
    expect(screen.getByTestId("issuance-error")).toHaveTextContent(
      "La serie de notas de crédito no está configurada para este negocio",
    );
  });

  it("guards against double submission while the first POST is in flight", async () => {
    const user = userEvent.setup();
    let resolveIssue: (value: IssuedCreditNote) => void = () => undefined;
    mockedIssue.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveIssue = resolve as (value: IssuedCreditNote) => void;
        }),
    );
    renderWithProviders(<CreditNotesTab />);
    await screen.findByText("001-001-01-00000010");

    await user.click(screen.getByTestId("issue-credit-note-inv-regular"));
    await user.type(screen.getByTestId("credit-note-reason"), "Error");
    const confirm = screen.getByTestId("confirm-issuance");
    await user.click(confirm);
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    resolveIssue({
      id: "cn-1",
      number: "NC-40",
      originInvoiceId: "inv-regular",
      originInvoiceNumber: "001-001-01-00000010",
      total: -155,
    });
    await screen.findByTestId("issued-number");

    expect(mockedIssue).toHaveBeenCalledTimes(1);
  });
});
