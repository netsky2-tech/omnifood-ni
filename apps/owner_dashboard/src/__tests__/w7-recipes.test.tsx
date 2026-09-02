import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipesPage } from '@/features/recipes/recipes-page';
import { RecipeForm } from '@/features/recipes/RecipeForm';
import { useProducts } from '@/features/catalog/use-product';
import { useActiveRecipe, useInsumos, useCreateRecipeVersion } from '@/features/recipes/use-recipes';
import { toast } from '@/hooks/use-toast';
import type { Product } from '@/features/catalog/product-types';
import type { Insumo, RecipeSnapshot } from '@/features/recipes/types';

vi.mock('@/features/catalog/use-product', () => ({
  useProducts: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock('@/features/recipes/use-recipes', () => ({
  useActiveRecipe: vi.fn(() => ({
    data: null,
    isLoading: false,
    refetch: vi.fn(),
  })),
  useInsumos: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useCreateRecipeVersion: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const MOCK_COMPOUND_PRODUCTS: Product[] = [
  {
    id: 'p1',
    tenant_id: 't1',
    name: 'Gallopinto',
    uom: 'un',
    product_type: 'COMPOUND',
    category_code: 'PLATO_FUERTE',
    warehouse_id: null,
    is_perishable: false,
    stock: 50,
    averageCost: 20,
    sellPrice: 45,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'p2',
    tenant_id: 't1',
    name: 'Nacatamal',
    uom: 'un',
    product_type: 'COMPOUND',
    category_code: 'PLATO_FUERTE',
    warehouse_id: null,
    is_perishable: true,
    stock: 30,
    averageCost: 35,
    sellPrice: 60,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'p3',
    tenant_id: 't1',
    name: 'Vigoron',
    uom: 'un',
    product_type: 'COMPOUND',
    category_code: 'PLATO_FUERTE',
    warehouse_id: null,
    is_perishable: false,
    stock: 0,
    averageCost: 15,
    sellPrice: 35,
    is_active: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const MOCK_INSUMOS: Insumo[] = [
  { id: 'i1', tenant_id: 't1', name: 'Arroz', consumption_uom: 'kg', stock: 100, averageCost: 15, is_active: true },
  { id: 'i2', tenant_id: 't1', name: 'Frijol', consumption_uom: 'kg', stock: 50, averageCost: 20, is_active: true },
  { id: 'i3', tenant_id: 't1', name: 'Plátano', consumption_uom: 'un', stock: 200, averageCost: 5, is_active: true },
];

const MOCK_ACTIVE_RECIPE: RecipeSnapshot = {
  recipeVersion: {
    id: 'rv1',
    tenant_id: 't1',
    product_id: 'p1',
    version_number: 1,
    is_active: true,
    fecha_inicio_vigencia: '2026-01-01T00:00:00Z',
    fecha_fin_vigencia: null,
    pos_document_id: null,
    product_name: 'Gallopinto',
    yield_quantity: 10,
    technical_shrink_pct: 5,
    version_note: 'Receta original',
    pos_created_at: null,
    published_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  components: [
    {
      id: 'rd1', tenant_id: 't1', recipe_version_id: 'rv1', insumo_id: 'i1',
      quantity: 0.475, gross_quantity: 5, technical_shrink_pct: 5,
      ingredient_name: 'Arroz', ingredient_type: 'INSUMO', component_uom: 'kg', reference_version_id: null,
    },
    {
      id: 'rd2', tenant_id: 't1', recipe_version_id: 'rv1', insumo_id: 'i2',
      quantity: 0.285, gross_quantity: 3, technical_shrink_pct: 5,
      ingredient_name: 'Frijol', ingredient_type: 'INSUMO', component_uom: 'kg', reference_version_id: null,
    },
  ],
};

function mockProducts(products: Product[] = MOCK_COMPOUND_PRODUCTS) {
  vi.mocked(useProducts).mockReturnValue({
    data: products, isLoading: false, error: null, refetch: vi.fn(),
  } as any);
}

function mockCreateRecipe(opts: { mutateAsync?: any; isPending?: boolean } = {}) {
  vi.mocked(useCreateRecipeVersion).mockReturnValue({
    mutateAsync: opts.mutateAsync ?? vi.fn().mockResolvedValue({}),
    isPending: opts.isPending ?? false,
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useProducts).mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() } as any);
  vi.mocked(useInsumos).mockReturnValue({ data: [], isLoading: false } as any);
  vi.mocked(useActiveRecipe).mockReturnValue({ data: null, isLoading: false, refetch: vi.fn() } as any);
  vi.mocked(useCreateRecipeVersion).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false } as any);
});

describe('W7 — RecipesPage', () => {
  it('renders heading and description', () => {
    render(<RecipesPage />, { wrapper: TestWrapper });
    expect(screen.getByText('Recetas y BOM')).toBeInTheDocument();
    expect(screen.getByText(/Gestione recetas de productos compuestos/)).toBeInTheDocument();
  });

  it('shows search input', () => {
    render(<RecipesPage />, { wrapper: TestWrapper });
    expect(screen.getByPlaceholderText('Buscar por nombre o ID...')).toBeInTheDocument();
  });

  it('shows empty state when no compound products', () => {
    render(<RecipesPage />, { wrapper: TestWrapper });
    expect(screen.getByText('No se encontraron productos compuestos')).toBeInTheDocument();
  });

  it('renders compound product cards', () => {
    mockProducts();
    render(<RecipesPage />, { wrapper: TestWrapper });
    expect(screen.getByText('Gallopinto')).toBeInTheDocument();
    expect(screen.getByText('Nacatamal')).toBeInTheDocument();
    expect(screen.getByText('Vigoron')).toBeInTheDocument();
  });

  it('shows active/inactive badges', () => {
    mockProducts();
    render(<RecipesPage />, { wrapper: TestWrapper });
    expect(screen.getAllByText('Activo').length).toBe(2);
    expect(screen.getAllByText('Inactivo').length).toBe(1);
  });

  it('shows "Crear Receta" for all compound products without recipe', () => {
    mockProducts();
    render(<RecipesPage />, { wrapper: TestWrapper });
    expect(screen.getAllByText('Crear Receta').length).toBe(3);
  });

  it('shows active recipe info and "Editar Receta" button when recipe exists', async () => {
    mockProducts();
    let callCount = 0;
    vi.mocked(useActiveRecipe).mockImplementation(() => {
      callCount++;
      if (callCount <= 1) return { data: null, isLoading: false, refetch: vi.fn() } as any;
      return { data: MOCK_ACTIVE_RECIPE, isLoading: false, refetch: vi.fn() } as any;
    });

    const user = userEvent.setup();
    render(<RecipesPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText('Gallopinto'));

    await waitFor(() => {
      expect(screen.getByText(/Receta v1 activa/)).toBeInTheDocument();
    });
    expect(screen.getByText(/2 ingrediente/)).toBeInTheDocument();
    expect(screen.getByText(/Rendimiento: 10/)).toBeInTheDocument();
    expect(screen.getByText('Editar Receta')).toBeInTheDocument();
  });

  it('filters products by search query', async () => {
    mockProducts();
    const user = userEvent.setup();
    render(<RecipesPage />, { wrapper: TestWrapper });

    await user.type(screen.getByPlaceholderText('Buscar por nombre o ID...'), 'Gallo');
    expect(screen.getByText('Gallopinto')).toBeInTheDocument();
    expect(screen.queryByText('Nacatamal')).not.toBeInTheDocument();
  });

  it('clears filter when search is cleared', async () => {
    mockProducts();
    const user = userEvent.setup();
    render(<RecipesPage />, { wrapper: TestWrapper });

    const input = screen.getByPlaceholderText('Buscar por nombre o ID...');
    await user.type(input, 'Gallo');
    expect(screen.queryByText('Nacatamal')).not.toBeInTheDocument();

    await user.clear(input);
    expect(screen.getByText('Nacatamal')).toBeInTheDocument();
  });

  it('shows loading spinner', () => {
    vi.mocked(useProducts).mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() } as any);
    render(<RecipesPage />, { wrapper: TestWrapper });
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows error message on load failure', () => {
    vi.mocked(useProducts).mockReturnValue({ data: undefined, isLoading: false, error: new Error('API down'), refetch: vi.fn() } as any);
    render(<RecipesPage />, { wrapper: TestWrapper });
    expect(screen.getByText('Error al cargar productos: API down')).toBeInTheDocument();
  });
});

describe('W7 — RecipeForm', () => {
  const defaultProps = {
    productId: 'p1',
    productName: 'Gallopinto',
    insumos: MOCK_INSUMOS,
    compoundProducts: MOCK_COMPOUND_PRODUCTS.filter(p => p.id !== 'p1'),
    existingRecipe: null,
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders form fields', () => {
    render(<RecipeForm {...defaultProps} />, { wrapper: TestWrapper });
    expect(screen.getByText(/Número de Versión/)).toBeInTheDocument();
    expect(screen.getByText(/Rendimiento/)).toBeInTheDocument();
    expect(screen.getByText(/Merma Técnica/)).toBeInTheDocument();
    expect(screen.getByText('Ingredientes')).toBeInTheDocument();
    expect(screen.getByText('Agregar Ingrediente')).toBeInTheDocument();
  });

  it('shows recipe explanation alert', () => {
    render(<RecipeForm {...defaultProps} />, { wrapper: TestWrapper });
    expect(screen.getByText(/Las recetas definen los ingredientes/)).toBeInTheDocument();
  });

  it('shows validation error when submitting without ingredients', async () => {
    const user = userEvent.setup();
    render(<RecipeForm {...defaultProps} />, { wrapper: TestWrapper });

    await user.click(screen.getByText('Crear Receta'));

    await waitFor(() => {
      expect(screen.getByText('Debe agregar al menos un ingrediente')).toBeInTheDocument();
    });
  });

  it('allows adding ingredients', async () => {
    const user = userEvent.setup();
    render(<RecipeForm {...defaultProps} />, { wrapper: TestWrapper });

    await user.click(screen.getByText('Agregar Ingrediente'));
    expect(screen.getByLabelText('Ingrediente *')).toBeInTheDocument();
  });

  it('pre-fills form when editing existing recipe', () => {
    render(
      <RecipeForm {...defaultProps} existingRecipe={MOCK_ACTIVE_RECIPE} />,
      { wrapper: TestWrapper },
    );
    expect(screen.getByDisplayValue('2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('5').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByDisplayValue('Receta original')).toBeInTheDocument();
  });

  it('calls onCancel when cancel is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<RecipeForm {...defaultProps} onCancel={onCancel} />, { wrapper: TestWrapper });

    await user.click(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables submit while pending', () => {
    mockCreateRecipe({ isPending: true });
    render(<RecipeForm {...defaultProps} />, { wrapper: TestWrapper });
    expect(screen.getByText('Guardando...')).toBeDisabled();
  });

  it('shows error on mutation failure', async () => {
    mockCreateRecipe({ mutateAsync: vi.fn().mockRejectedValue(new Error('Error del servidor')) });
    const user = userEvent.setup();
    render(
      <RecipeForm {...defaultProps} existingRecipe={MOCK_ACTIVE_RECIPE} />,
      { wrapper: TestWrapper },
    );

    await user.click(screen.getByText('Actualizar Receta'));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          description: 'Error del servidor',
          variant: 'destructive',
        }),
      );
    });
  });
});

describe('W7 — Triangulation: form edge cases', () => {
  const defaultProps = {
    productId: 'p1',
    productName: 'Gallopinto',
    insumos: MOCK_INSUMOS,
    compoundProducts: MOCK_COMPOUND_PRODUCTS.filter(p => p.id !== 'p1'),
    existingRecipe: null,
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  };

  it('rejects yield quantity of 0', async () => {
    const recipeWithZeroYield: RecipeSnapshot = {
      recipeVersion: {
        ...MOCK_ACTIVE_RECIPE.recipeVersion,
        yield_quantity: 0,
      },
      components: MOCK_ACTIVE_RECIPE.components,
    };
    render(
      <RecipeForm {...defaultProps} existingRecipe={recipeWithZeroYield} />,
      { wrapper: TestWrapper },
    );

    const form = document.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('El rendimiento debe ser mayor a 0')).toBeInTheDocument();
    });
  });

  it('rejects technical shrink >= 100%', async () => {
    const recipeWithMaxShrink: RecipeSnapshot = {
      recipeVersion: {
        ...MOCK_ACTIVE_RECIPE.recipeVersion,
        technical_shrink_pct: 100,
      },
      components: MOCK_ACTIVE_RECIPE.components,
    };
    render(
      <RecipeForm {...defaultProps} existingRecipe={recipeWithMaxShrink} />,
      { wrapper: TestWrapper },
    );

    const form = document.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('La merma técnica debe ser entre 0 y 99.99%')).toBeInTheDocument();
    });
  });

  it('rejects duplicate ingredients', async () => {
    const duplicateRecipe: RecipeSnapshot = {
      recipeVersion: {
        ...MOCK_ACTIVE_RECIPE.recipeVersion,
        yield_quantity: 10,
      },
      components: [
        {
          id: 'rd1', tenant_id: 't1', recipe_version_id: 'rv1', insumo_id: 'i1',
          quantity: 0.475, gross_quantity: 5, technical_shrink_pct: 5,
          ingredient_name: 'Arroz', ingredient_type: 'INSUMO', component_uom: 'kg', reference_version_id: null,
        },
        {
          id: 'rd2', tenant_id: 't1', recipe_version_id: 'rv1', insumo_id: 'i1',
          quantity: 0.285, gross_quantity: 3, technical_shrink_pct: 5,
          ingredient_name: 'Arroz', ingredient_type: 'INSUMO', component_uom: 'kg', reference_version_id: null,
        },
      ],
    };
    render(
      <RecipeForm {...defaultProps} existingRecipe={duplicateRecipe} />,
      { wrapper: TestWrapper },
    );

    const form = document.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('No puede haber ingredientes duplicados')).toBeInTheDocument();
    });
  });

  it('shows net quantity calculation per unit', () => {
    render(
      <RecipeForm {...defaultProps} existingRecipe={MOCK_ACTIVE_RECIPE} />,
      { wrapper: TestWrapper },
    );

    expect(screen.getAllByText(/Cantidad neta por unidad/).length).toBeGreaterThanOrEqual(1);
  });
});
