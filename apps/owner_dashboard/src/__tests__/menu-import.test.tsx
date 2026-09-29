/**
 * Menu import from Excel — wizard component tests (SOHO go-live readiness).
 *
 * The owner flow is: download template → fill → upload → preview → commit.
 * These tests mock the settings API module and verify the wizard contract:
 * tab placement, preview counts, insumo review note, error-gated confirm,
 * commit success summary, and the client-side .xlsx-only guard.
 */
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/features/settings/settings-page";
import {
  downloadMenuImportTemplate,
  previewMenuImport,
  commitMenuImport,
} from "@/features/settings/settings-api";
import type { MenuImportSummary } from "@/features/settings/settings-api";

vi.mock("@/features/settings/settings-api", () => ({
  MENU_IMPORT_TEMPLATE_FILENAME: "plantilla_menu.xlsx",
  MENU_IMPORT_MAX_FILE_BYTES: 4 * 1024 * 1024,
  downloadMenuImportTemplate: vi.fn(),
  previewMenuImport: vi.fn(),
  commitMenuImport: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const makeXlsxFile = (name = "menu.xlsx") =>
  new File(["workbook-bytes"], name, { type: XLSX_MIME });

const summaryWithErrors: MenuImportSummary = {
  categories: 2,
  productsToCreate: 2,
  productsToUpdate: 1,
  recipesToCreate: 2,
  recipesSkipped: [
    {
      productName: "Latte",
      reason: "VERSION_ALREADY_EXISTS",
      existingState: "PUBLISHED",
    },
  ],
  insumosToCreate: [
    { name: "Leche", purchaseUom: "L", consumptionUom: "L", review: true },
  ],
  errors: [
    {
      sheet: "CAFÉ HELADO",
      row: 7,
      message: "Row is missing 'producto'",
    },
  ],
  warnings: [
    {
      sheet: "VACÍA",
      row: 1,
      message: "Sheet 'VACÍA' has no data rows",
    },
  ],
};

const cleanSummary: MenuImportSummary = {
  categories: 2,
  productsToCreate: 2,
  productsToUpdate: 0,
  recipesToCreate: 2,
  recipesSkipped: [],
  insumosToCreate: [
    { name: "Café molido", purchaseUom: "g", consumptionUom: "g", review: true },
  ],
  errors: [],
  warnings: [],
};

async function uploadFile(file: File) {
  const user = userEvent.setup();
  const input = screen.getByTestId("menu-import-file-input");
  await user.upload(input, file);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("MenuImportWizard", () => {
  it("renders the wizard inside the settings import tab alongside the bulk import", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SettingsPage />
      </TestWrapper>,
    );

    await user.click(screen.getByTestId("tab-import"));
    expect(screen.getByTestId("tabpanel-import")).toBeInTheDocument();

    expect(screen.getByText(/Importar menú \(Excel\)/i)).toBeInTheDocument();
    expect(
      screen.getByTestId("menu-import-download-template-btn"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("menu-import-file-input")).toBeInTheDocument();
    // The existing bulk import wizard stays reachable in the same tab.
    expect(screen.getByText(/Carga Masiva de Productos/i)).toBeInTheDocument();
  });

  it("downloads the template as a blob from the template endpoint", async () => {
    const user = userEvent.setup();
    vi.mocked(downloadMenuImportTemplate).mockResolvedValue(
      new Blob(["xlsx-bytes"], { type: XLSX_MIME }),
    );
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );

    await user.click(screen.getByTestId("menu-import-download-template-btn"));

    await waitFor(() => {
      expect(downloadMenuImportTemplate).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
    });
  });

  it("preview renders counts, the insumo review note, and errors with sheet and row", async () => {
    vi.mocked(previewMenuImport).mockResolvedValue(summaryWithErrors);

    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );

    await uploadFile(makeXlsxFile());

    await waitFor(() => {
      expect(screen.getByTestId("menu-import-preview-card")).toBeInTheDocument();
    });

    expect(screen.getByTestId("menu-import-count-categories")).toHaveTextContent("2");
    expect(screen.getByTestId("menu-import-count-products-create")).toHaveTextContent("2");
    expect(screen.getByTestId("menu-import-count-products-update")).toHaveTextContent("1");
    expect(screen.getByTestId("menu-import-count-recipes-create")).toHaveTextContent("2");

    // Review note for created insumos (cost + PAR follow-up).
    expect(
      screen.getByTestId("menu-import-insumo-review-note"),
    ).toBeInTheDocument();
    expect(screen.getByText("Leche")).toBeInTheDocument();

    // Skipped recipes surface with their reason.
    expect(screen.getByText(/Latte/i)).toBeInTheDocument();

    // Errors table carries sheet + Excel row + message.
    expect(screen.getByTestId("menu-import-errors-table-body")).toHaveTextContent(
      "CAFÉ HELADO",
    );
    expect(screen.getByTestId("menu-import-errors-table-body")).toHaveTextContent(
      "7",
    );
    // Warnings render in their own table.
    expect(screen.getByTestId("menu-import-warnings-table-body")).toHaveTextContent(
      "VACÍA",
    );
  });

  it("disables confirm while errors exist and enables it when the preview is clean", async () => {
    vi.mocked(previewMenuImport).mockResolvedValueOnce(summaryWithErrors);

    const first = render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );
    await uploadFile(makeXlsxFile());
    await waitFor(() => {
      expect(screen.getByTestId("menu-import-preview-card")).toBeInTheDocument();
    });
    expect(screen.getByTestId("menu-import-confirm-btn")).toBeDisabled();
    first.unmount();

    vi.mocked(previewMenuImport).mockResolvedValueOnce(cleanSummary);
    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );
    await uploadFile(makeXlsxFile());
    await waitFor(() => {
      expect(screen.getByTestId("menu-import-preview-card")).toBeInTheDocument();
    });
    expect(screen.getByTestId("menu-import-confirm-btn")).toBeEnabled();
  });

  it("commits on confirm and renders the success summary", async () => {
    vi.mocked(previewMenuImport).mockResolvedValue(cleanSummary);
    vi.mocked(commitMenuImport).mockResolvedValue({
      ...cleanSummary,
      productsToCreate: 2,
      recipesToCreate: 2,
    });

    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );

    await uploadFile(makeXlsxFile());
    await waitFor(() => {
      expect(screen.getByTestId("menu-import-preview-card")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-import-confirm-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("menu-import-committed-card")).toBeInTheDocument();
    });

    expect(commitMenuImport).toHaveBeenCalledTimes(1);
    // Commit re-posts the same base64 payload (no server-side staging).
    const committedPayload = vi.mocked(commitMenuImport).mock.calls[0][0];
    expect(typeof committedPayload).toBe("string");
    expect(committedPayload.length).toBeGreaterThan(0);

    expect(screen.getByTestId("menu-import-committed-categories")).toHaveTextContent("2");
    expect(screen.getByTestId("menu-import-committed-products-create")).toHaveTextContent("2");
  });

  it("rejects a non-.xlsx file client-side without calling the API", async () => {
    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );

    // fireEvent bypasses the input's accept=".xlsx" filter (browser drop/programmatic
    // paths still deliver non-xlsx files); the wizard must guard client-side.
    const input = screen.getByTestId("menu-import-file-input");
    fireEvent.change(input, {
      target: { files: [new File(["pdf"], "menu.pdf", { type: "application/pdf" })] },
    });

    expect(screen.getByTestId("menu-import-client-error")).toBeInTheDocument();
    expect(previewMenuImport).not.toHaveBeenCalled();
    expect(commitMenuImport).not.toHaveBeenCalled();
  });
});
