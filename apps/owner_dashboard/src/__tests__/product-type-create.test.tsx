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
 * Issue #618 — creation must ask, in business language, whether the item is
 * prepared with ingredients instead of silently inheriting the active tab's
 * type (every product ever created that way came out SIMPLE).
 *
 * Coverage:
 * - with no answer chosen, "Crear" is disabled AND the handler refuses to
 *   submit (a disabled button alone is not the boundary — same two-layer
 *   discipline as #617)
 * - each of the three answers sends its mapped product_type, never the
 *   active tab's type (VARIANT_PARENT stays creatable: C1; PREPARED is never
 *   offered — legacy stored value only, per #615/#617)
 * - after a successful create the view switches to the created product's tab
 *   so the new item is visible immediately (C2)
 * - standing on any tab no longer derives the created product's type from it
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

async function openCreateDialog() {
  const user = userEvent.setup();
  renderProductsPage();
  await user.click(screen.getByText("+ Nuevo Producto"));
  await screen.findByText("Nuevo Producto");

  // Fill the non-question fields so only the type question can block submit.
  await user.type(screen.getByPlaceholderText("Ej: Taza de Capuccino"), "Producto Nuevo");
  const selects = screen.getAllByRole("combobox");
  await user.selectOptions(selects[0]!, "un");
  return user;
}

describe("Product type creation question (issue #618)", () => {
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

  it("renders the question with three answers and no preselected value", async () => {
    await openCreateDialog();

    expect(
      screen.getByText("¿Este ítem se prepara con ingredientes?"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Sí, se prepara con ingredientes")).not.toBeChecked();
    expect(
      screen.getByLabelText("No, se compra y se revende tal cual"),
    ).not.toBeChecked();
    expect(
      screen.getByLabelText(
        "Es un grupo de versiones del mismo ítem (por ejemplo por tamaño)",
      ),
    ).not.toBeChecked();
  });

  // Two-layer discipline from #617: the disabled button is the first boundary,
  // the handler-level refusal is the second (a disabled button only swallows
  // clicks; an implicit form submit still reaches handleSubmit). This test
  // pins the disabled attribute and the handler refusal as a pair. The two
  // handler-level guards (one in handleSubmit, one in runSubmit) are
  // deliberately redundant defense-in-depth: removing the disabled attribute
  // or either single handler guard still leaves the behavior intact, by
  // design.
  it("with no answer chosen, Crear is disabled and the handler refuses to submit", async () => {
    const user = await openCreateDialog();

    // Preserves the assertion from the case removed in #618: create mode
    // shows no "Tipo de Producto" selector.
    expect(screen.queryByLabelText("Tipo de Producto")).not.toBeInTheDocument();

    expect(screen.getByText("Crear")).toBeDisabled();

    // Drive the form's native submit exactly as the browser would on the
    // keyboard path (requestSubmit fires submit -> React onSubmit) — the
    // handler must refuse even when the click on the disabled button cannot.
    const nameInput = screen.getByPlaceholderText("Ej: Taza de Capuccino");
    nameInput.focus();
    await user.keyboard("{Enter}");
    const form = nameInput.closest("form");
    expect(form).not.toBeNull();
    form!.requestSubmit();

    expect(mocks.createMutateAsync).not.toHaveBeenCalled();
  });

  it("answering 'se prepara con ingredientes' sends product_type COMPOUND with the full create payload", async () => {
    const user = await openCreateDialog();

    await user.click(screen.getByLabelText("Sí, se prepara con ingredientes"));
    expect(screen.getByText("Crear")).toBeEnabled();
    await user.click(screen.getByText("Crear"));

    await waitFor(() => {
      expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mocks.createMutateAsync.mock.calls[0]![0]).toEqual({
      name: "Producto Nuevo",
      uom: "un",
      product_type: "COMPOUND",
      category_code: undefined,
      sellPrice: 0,
      is_perishable: false,
    });
  });

  it("answering 'se compra y se revende' sends product_type SIMPLE", async () => {
    const user = await openCreateDialog();

    await user.click(screen.getByLabelText("No, se compra y se revende tal cual"));
    await user.click(screen.getByText("Crear"));

    await waitFor(() => {
      expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mocks.createMutateAsync.mock.calls[0]![0].product_type).toBe("SIMPLE");
  });

  // C1: VARIANT_PARENT must stay creatable — the tab used to be the only way
  // to create one, so the question needs this third answer.
  it("answering the variant-parent option sends product_type VARIANT_PARENT", async () => {
    const user = await openCreateDialog();

    await user.click(
      screen.getByLabelText(
        "Es un grupo de versiones del mismo ítem (por ejemplo por tamaño)",
      ),
    );
    await user.click(screen.getByText("Crear"));

    await waitFor(() => {
      expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mocks.createMutateAsync.mock.calls[0]![0].product_type).toBe(
      "VARIANT_PARENT",
    );
  });

  // C2: the list is filtered by exact product_type per tab, so a COMPOUND
  // product created while standing on the Simple tab would be invisible to
  // the operator who just created it. The view must land on the created
  // product's tab. Observed via the table's query switching to COMPOUND.
  it("after creating a COMPOUND product from the Simple tab, the view switches to the Compuesto tab", async () => {
    const user = await openCreateDialog();
    expect(vi.mocked(useProducts).mock.lastCall?.[0]).toBe("SIMPLE");

    await user.click(screen.getByLabelText("Sí, se prepara con ingredientes"));
    await user.click(screen.getByText("Crear"));

    await waitFor(() => {
      expect(vi.mocked(useProducts).mock.lastCall?.[0]).toBe("COMPOUND");
    });
  });

  // Replaces the case "create mode still takes the type from the active tab
  // and shows no selector" removed from product-type-edit.test.tsx in this
  // change: #618 supersedes #615's clause that create inherits the tab. This
  // test is the strict superset — it pins the correct value AND the tab's
  // irrelevance.
  it("standing on the Compuesto tab and answering 'se compra y se revende' sends SIMPLE, not the tab's type", async () => {
    const user = userEvent.setup();
    renderProductsPage();

    await user.click(screen.getByText("Compuesto (con receta)"));
    expect(vi.mocked(useProducts).mock.lastCall?.[0]).toBe("COMPOUND");

    await user.click(screen.getByText("+ Nuevo Producto"));
    await screen.findByText("Nuevo Producto");
    await user.type(screen.getByPlaceholderText("Ej: Taza de Capuccino"), "Producto Nuevo");
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0]!, "un");

    await user.click(screen.getByLabelText("No, se compra y se revende tal cual"));
    await user.click(screen.getByText("Crear"));

    await waitFor(() => {
      expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mocks.createMutateAsync.mock.calls[0]![0].product_type).toBe("SIMPLE");
  });
});
