import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeForm } from '@/features/recipes/RecipeForm';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import type { RecipeSnapshot } from '@/features/recipes/types';

// Round-2 §17.6 slice S5: the SUB_RECIPE "Versión de Referencia" field was
// the LAST free-text UUID input in the tree (the no-uuid-inputs guard's
// final dated exception). This file pins the governed replacement: the
// versions come from the GET /recipes/products/:id/versions surface through
// EntitySearchSelect, the machine UUID never renders as operator copy, and
// "Sin versión de referencia" is a real choice.

const recipeVersions = vi.fn();

vi.mock('@/features/recipes/use-recipes', () => ({
  useCreateRecipeVersion: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
  useRecipeVersions: vi.fn((productId: string) => recipeVersions(productId)),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const existingRecipe = {
  recipeVersion: {
    id: 'version-uuid-3',
    tenant_id: 'tenant-1',
    product_id: 'prod-sub-1',
    version_number: 3,
    is_active: true,
    fecha_inicio_vigencia: null,
    fecha_fin_vigencia: null,
    pos_document_id: null,
    product_name: 'Salsa Madre',
    yield_quantity: 1,
    technical_shrink_pct: 0,
    version_note: 'Ajuste de azúcar',
    pos_created_at: null,
    published_at: '2026-10-10T12:00:00.000Z',
    created_at: '2026-10-10T12:00:00.000Z',
  },
  components: [
    {
      id: 'detail-1',
      tenant_id: 'tenant-1',
      recipe_version_id: 'version-uuid-3',
      insumo_id: 'prod-sub-1',
      ingredient_name: 'Salsa Madre',
      ingredient_type: 'SUB_RECIPE',
      quantity: 0.5,
      gross_quantity: 1,
      technical_shrink_pct: 0,
      component_uom: 'LT',
      reference_version_id: 'version-uuid-2',
    },
  ],
} as unknown as RecipeSnapshot;

const defaultProps = {
  productId: 'prod-sub-1',
  productName: 'Salsa Madre',
  products: [],
  compoundProducts: [],
  insumos: [],
  existingRecipe,
  onSuccess: vi.fn(),
  onSubmit: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
};

describe('RecipeForm reference-version selector (round-2 §17.6 S5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recipeVersions.mockReturnValue({
      data: [
        {
          id: 'version-uuid-3',
          version_number: 3,
          is_active: true,
          version_note: 'Ajuste de azúcar',
          fecha_inicio_vigencia: null,
          fecha_fin_vigencia: null,
          published_at: '2026-10-10T12:00:00.000Z',
        },
        {
          id: 'version-uuid-2',
          version_number: 2,
          is_active: false,
          version_note: null,
          fecha_inicio_vigencia: null,
          fecha_fin_vigencia: null,
          published_at: '2026-10-01T12:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('renders the governed version options for the SUB_RECIPE component, never the UUID input', () => {
    render(<RecipeForm {...defaultProps} />, { wrapper: TestWrapper });

    const listbox = screen.getByRole('listbox', {
      name: 'Versión de Referencia',
    });
    expect(listbox).toBeInTheDocument();
    // The input exists, associated to the same label — and it is NOT the old
    // free-text uuid field.
    expect(
      screen.queryByPlaceholderText('UUID de versión (opcional)'),
    ).toBeNull();
    expect(
      screen.getByRole('combobox', { name: 'Versión de Referencia' }),
    ).toBeInTheDocument();
    const within = (text: string | RegExp) =>
      Array.from(listbox.querySelectorAll('*')).some((el) =>
        typeof text === 'string' ? el.textContent === text : text.test(el.textContent ?? ''),
      );
    expect(within('Sin versión de referencia')).toBe(true);
    expect(within(/Versión 3 · vigente · Ajuste de azúcar/)).toBe(true);
    expect(within(/Versión 2 · histórica/)).toBe(true);
    // The machine id is payload, never operator copy.
    expect(within('version-uuid-3')).toBe(false);
    expect(recipeVersions).toHaveBeenCalledWith('prod-sub-1');
  });

  it('searches the versions by their composed columns', async () => {
    const user = userEvent.setup();
    render(<RecipeForm {...defaultProps} />, { wrapper: TestWrapper });

    await user.type(
      screen.getByRole('combobox', { name: 'Versión de Referencia' }),
      'azúcar',
    );

    expect(screen.queryByText(/Seleccionado: Versión 2 · histórica/)).toBeNull();
    expect(screen.getByText(/Versión 3 · vigente · Ajuste de azúcar/)).toBeInTheDocument();
  });

  it('choosing Sin versión de referencia stores an explicit null', async () => {
    const user = userEvent.setup();
    render(<RecipeForm {...defaultProps} />, { wrapper: TestWrapper });

    // The component arrived with version-uuid-2 selected (edit mode); clear
    // it explicitly through the selector's own remove affordance.
    await user.click(screen.getByRole('button', { name: /Quitar/ }));

    expect(
      screen.getByRole('combobox', { name: 'Versión de Referencia' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Seleccionado: Versión 2 · histórica')).toBeNull();
  });
});
