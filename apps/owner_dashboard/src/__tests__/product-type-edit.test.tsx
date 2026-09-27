import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductPage } from "@/features/catalog/product-page";
import {
  useProducts,
} from "@/features/catalog/use-product";
import type { Product } from "@/features/catalog/product-types";

/**
 * Issue #615 — the edit branch of ProductDialog never sent `product_type`,
 * so operators could not repair a mistyped product from the dashboard.
 *
 * Coverage:
 * - editing a product and choosing a different type sends `product_type`
 * - create mode still takes the type from the active tab (no selector shown)
 * - changing COMPOUND/PREPARED to SIMPLE requires explicit confirmation of
 *   the recipe/stock consequence before submitting
 * - a stored legacy `PREPARED` product renders honestly and saves unchanged
 */

const mocks = vi.hoisted(() => ({
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
}));

vi.mock("@/features/catalog/use-product", () => {
  const useProductsMock = vi.fn((_type?: string, _inactive?: boolean) => ({
    data: [] as Product[],
    isLoading: false,
    error: null,
  }));
  const usePaginatedProductsMock = vi.fn((params: any) => {
    const prodRes = useProductsMock(params?.productType, true) as any;
    const rawData = Array.isArray(prodRes?.data) ? prodRes.data : [];
    return {
      data: prodRes?.isLoading
        ? undefined
        : {
            data: rawData,
            total: rawData.length,
            page: params?.page ?? 1,
            pageSize: params?.pageSize ?? 25,
            totalPages: Math.max(1, Math.ceil(rawData.length / 25)),
          },
      isLoading: prodRes?.isLoading ?? false,
      error: prodRes?.error ?? null,
    };
  });
  return {
    useProducts: useProductsMock,
    usePaginatedProducts: usePaginatedProductsMock,
    useCreateProduct: vi.fn(() => ({
      mutateAsync: mocks.createMutateAsync,
      isPending: false,
    })),
    useUpdateProduct: vi.fn(() => ({
      mutateAsync: mocks.updateMutateAsync,
      isPending: false,
    })),
    useDeactivateProduct: vi.fn(() => ({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    })),
  };
});

vi.mock("@/features/catalog/use-catalog", () => ({
  useCatalogValues: vi.fn(() => ({
    data: [{ code: "un", name: "Unidad" }],
    isLoading: false,
    error: null,
  })),
}));

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    tenant_id: "t1",
    name: "Plato del Día",
    uom: "un",
    product_type: "COMPOUND",
    category_code: null,
    warehouse_id: null,
    is_perishable: false,
    stock: 0,
    averageCost: 25,
    sellPrice: 45,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderProductsPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductPage />
    </QueryClientProvider>,
  );
}

async function openEditDialog(name: string) {
  const user = userEvent.setup();
  renderProductsPage();
  await screen.findByText(name);
  await user.click(screen.getByText("Editar"));
  await screen.findByText("Editar Producto");
  return user;
}

describe("Product type edit (issue #615)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createMutateAsync.mockReset().mockResolvedValue({});
    mocks.updateMutateAsync.mockReset().mockResolvedValue({});
    vi.mocked(useProducts).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
  });

  // SIMPLE -> COMPOUND is the exact repair path issue #611 needs — it is what
  // the operator does to SOHO's nine genuine dishes — so it is both the
  // correct non-destructive case and the real user story this control exists
  // for. Entering the recipe-bearing set orphans nothing: no confirmation.
  it("sends product_type in the update payload when the type changes", async () => {
    vi.mocked(useProducts).mockReturnValue({
      data: [makeProduct({ product_type: "SIMPLE" })],
      isLoading: false,
      error: null,
    } as any);
    const user = await openEditDialog("Plato del Día");

    await user.selectOptions(
      screen.getByLabelText("Tipo de Producto"),
      "COMPOUND",
    );
    await user.click(screen.getByText("Guardar"));

    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByText(/dejará de consumir ingredientes/),
    ).not.toBeInTheDocument();
    const payload = mocks.updateMutateAsync.mock.calls[0]![0];
    expect(payload.id).toBe("p1");
    expect(payload.input).toEqual({
      name: "Plato del Día",
      uom: "un",
      product_type: "COMPOUND",
      category_code: undefined,
      sellPrice: 45,
      is_perishable: false,
    });
  });

  // The former case "create mode still takes the type from the active tab and
  // shows no selector" was removed in #618: it pinned #615's now-superseded
  // clause that create inherits the active tab's type. Its coverage (with the
  // tab-irrelevance assertion) lives in product-type-create.test.tsx.
  it("changing COMPOUND to SIMPLE requires explicit confirmation before submitting", async () => {
    vi.mocked(useProducts).mockReturnValue({
      data: [makeProduct()],
      isLoading: false,
      error: null,
    } as any);
    const user = await openEditDialog("Plato del Día");

    await user.selectOptions(screen.getByLabelText("Tipo de Producto"), "SIMPLE");
    await user.click(screen.getByText("Guardar"));

    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/dejará de consumir ingredientes/)).toBeInTheDocument();
    expect(screen.getByText(/dejará de mover inventario/)).toBeInTheDocument();

    await user.click(screen.getByText("Confirmar y guardar"));

    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.updateMutateAsync.mock.calls[0]![0];
    expect(payload.input.product_type).toBe("SIMPLE");
  });

  // A confirmation gate that a second click on the primary button can bypass
  // is not a gate: while awaiting confirmation the primary submit path must be
  // inert, and only "Confirmar y guardar" may apply the destructive change.
  it("does not apply the destructive change when Guardar is clicked a second time while awaiting confirmation", async () => {
    vi.mocked(useProducts).mockReturnValue({
      data: [makeProduct()],
      isLoading: false,
      error: null,
    } as any);
    const user = await openEditDialog("Plato del Día");

    await user.selectOptions(screen.getByLabelText("Tipo de Producto"), "SIMPLE");

    // First click: only shows the warning, no submit.
    await user.click(screen.getByText("Guardar"));
    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/dejará de consumir ingredientes/)).toBeInTheDocument();

    // Second click on the primary button must NOT bypass the confirmation.
    await user.click(screen.getByText("Guardar"));
    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByText("Confirmar y guardar"));
    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.updateMutateAsync.mock.calls[0]![0];
    expect(payload.input.product_type).toBe("SIMPLE");
  });

  // Pins the handler-level refusal, not the button's disabled attribute: an
  // Enter/stray form submit reaches handleSubmit even when Guardar is disabled
  // (a disabled button only swallows clicks), so the
  // `if (isDestructiveTypeChange) return;` guard is the last line of defense
  // on this path. This test fails if that line is removed.
  it("does not apply the destructive change when the form is submitted from the keyboard path while awaiting confirmation", async () => {
    vi.mocked(useProducts).mockReturnValue({
      data: [makeProduct()],
      isLoading: false,
      error: null,
    } as any);
    const user = await openEditDialog("Plato del Día");

    await user.selectOptions(screen.getByLabelText("Tipo de Producto"), "SIMPLE");

    // First submit: only shows the warning, no update.
    await user.click(screen.getByText("Guardar"));
    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/dejará de consumir ingredientes/)).toBeInTheDocument();

    // Keyboard path, not a click on Guardar: Enter in a focused text input
    // implicitly submits the form in a real browser regardless of the (now
    // disabled) default button. jsdom does not implement implicit submission
    // from keyboard events, so the Enter press alone is a no-op here; drive the
    // form's native submit exactly as the browser would have via requestSubmit(),
    // which fires the submit event -> React onSubmit -> handleSubmit without
    // any click on the disabled button.
    const nameInput = screen.getByPlaceholderText("Ej: Taza de Capuccino");
    nameInput.focus();
    await user.keyboard("{Enter}");
    const form = nameInput.closest("form");
    expect(form).not.toBeNull();
    form!.requestSubmit();

    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/dejará de consumir ingredientes/)).toBeInTheDocument();

    await user.click(screen.getByText("Confirmar y guardar"));
    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.updateMutateAsync.mock.calls[0]![0];
    expect(payload.input.product_type).toBe("SIMPLE");
  });

  it("changing COMPOUND to VARIANT_PARENT also requires confirmation before submitting", async () => {
    vi.mocked(useProducts).mockReturnValue({
      data: [makeProduct()],
      isLoading: false,
      error: null,
    } as any);
    const user = await openEditDialog("Plato del Día");

    await user.selectOptions(
      screen.getByLabelText("Tipo de Producto"),
      "VARIANT_PARENT",
    );
    await user.click(screen.getByText("Guardar"));

    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/dejará de consumir ingredientes/)).toBeInTheDocument();
    expect(screen.getByText(/dejará de mover inventario/)).toBeInTheDocument();

    await user.click(screen.getByText("Confirmar y guardar"));

    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.updateMutateAsync.mock.calls[0]![0];
    expect(payload.input.product_type).toBe("VARIANT_PARENT");
  });

  // Component-level round-trip only: a stored PREPARED row is not reachable
  // in production (TABS has no PREPARED entry and the backend filters per tab
  // by exact type), so its edit dialog can never open — tracked separately.
  it("round-trips a stored PREPARED value through the dialog without coercion (component-level, not proven reachable in production)", async () => {
    vi.mocked(useProducts).mockReturnValue({
      data: [makeProduct({ product_type: "PREPARED" })],
      isLoading: false,
      error: null,
    } as any);
    const user = await openEditDialog("Plato del Día");

    const typeSelect = screen.getByLabelText(
      "Tipo de Producto",
    ) as HTMLSelectElement;
    expect(typeSelect.value).toBe("PREPARED");
    expect(screen.getByText("Preparado (tipo heredado)")).toBeInTheDocument();

    await user.click(screen.getByText("Guardar"));

    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.updateMutateAsync.mock.calls[0]![0];
    expect(payload.input.product_type).toBe("PREPARED");
  });
});
