import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeForm } from '@/features/recipes/RecipeForm';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import type { RecipeSnapshot } from '@/features/recipes/types';
import type { Product } from '@/features/catalog/product-types';

// R15 / S12 — aceptación manual del owner sobre el formulario de recetas:
// (1) el campo Tipo no cambia de "Insumo"; (2) el UOM muestra "Base" y no la
// unidad real; (3) en receta nueva el UOM queda bloqueado; (4) no se puede
// cambiar la selección lejos de "insumo". Dos defectos los explican:
//   - `updateComponent` escribía con `setComponents(components.map(...))`
//     sobre el estado capturado del render; los handlers que encadenan
//     2-5 llamadas perdían todas menos la última.
//   - el formulario leía `consumption_uom` (snake) cuando GET /insumos
//     devuelve `consumptionUom` (camel): unidad resuelta null → "Base",
//     etiquetas con "(undefined)".
// El select de UOM ofrece la unidad de consumo del insumo como único valor
// válido (decisión del owner, S12), igual que el POS.

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

// El wire devuelve el entity tal cual (serializeInsumo spawnea el entity):
// camelCase `consumptionUom`, nunca `consumption_uom`.
const arroz = {
  id: 'i1',
  tenant_id: 't1',
  name: 'Arroz',
  purchaseUom: 'kg',
  consumptionUom: 'kg',
  conversionFactor: 1,
  stock: 100,
  averageCost: 15,
  parLevel: null,
  minStock: null,
  is_perishable: false,
  negativeStockPolicy: 'ALLOW',
  is_active: true,
};

const salsaCompuesta: Product = {
  id: 'p1',
  tenant_id: 't1',
  name: 'Salsa Base',
  uom: 'UN',
  product_type: 'COMPOUND',
  category_code: null,
  warehouse_id: null,
  is_perishable: false,
  stock: 0,
  averageCost: 0,
  sellPrice: 0,
  is_active: true,
  image_url: null,
  created_at: '2026-10-15T10:00:00.000Z',
  updated_at: '2026-10-15T10:00:00.000Z',
};

function existingRecipeWith(componentUom: string | null) {
  return {
    recipeVersion: {
      id: 'v1',
      tenant_id: 't1',
      product_id: 'prod-1',
      version_number: 2,
      is_active: true,
      fecha_inicio_vigencia: null,
      fecha_fin_vigencia: null,
      pos_document_id: null,
      product_name: 'Arroz cocido',
      yield_quantity: 1,
      technical_shrink_pct: 0,
      version_note: null,
      pos_created_at: null,
      published_at: '2026-10-15T10:00:00.000Z',
      created_at: '2026-10-15T10:00:00.000Z',
    },
    components: [
      {
        id: 'd1',
        tenant_id: 't1',
        recipe_version_id: 'v1',
        insumo_id: 'i1',
        ingredient_name: 'Arroz',
        ingredient_type: 'INSUMO',
        quantity: 1,
        gross_quantity: 1,
        technical_shrink_pct: 0,
        component_uom: componentUom,
        reference_version_id: null,
      },
    ],
  } as unknown as RecipeSnapshot;
}

const defaultProps = {
  productId: 'prod-1',
  productName: 'Arroz cocido',
  insumos: [arroz],
  compoundProducts: [salsaCompuesta],
  existingRecipe: null as RecipeSnapshot | null,
  onSuccess: vi.fn(),
  onCancel: vi.fn(),
};

async function addComponent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Agregar Ingrediente' }));
}

function ingredienteTrigger() {
  return screen.getByRole('combobox', { name: /Ingrediente/ });
}

function tipoTrigger() {
  return screen.getByRole('combobox', { name: /Tipo/ });
}

function uomTrigger() {
  return screen.getByRole('combobox', { name: /Unidad de Medida/ });
}

describe('RecipeForm componentes: Tipo, ingrediente y UOM (R15 / S12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recipeVersions.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('en receta nueva, elegir el insumo fija el ingrediente y desbloquea su unidad', async () => {
    const user = userEvent.setup();
    render(<RecipeForm {...defaultProps} />, { wrapper: TestWrapper });

    await addComponent(user);

    await user.click(ingredienteTrigger());
    await user.click(await screen.findByRole('option', { name: /Arroz/ }));

    // Síntoma 3: el ingrediente quedaba sin fijar y el UOM nunca se
    // desbloqueaba ("aparece bloqueado" en receta nueva).
    expect(ingredienteTrigger()).toHaveTextContent(/Arroz/);
    expect(uomTrigger()).toBeEnabled();
    expect(uomTrigger()).toHaveTextContent('kg');
  });

  it('el campo Tipo cambia a Sub-receta (síntomas 1 y 4)', async () => {
    const user = userEvent.setup();
    render(<RecipeForm {...defaultProps} />, { wrapper: TestWrapper });

    await addComponent(user);

    await user.click(tipoTrigger());
    await user.click(await screen.findByRole('option', { name: 'Sub-receta' }));

    expect(tipoTrigger()).toHaveTextContent('Sub-receta');
  });

  it('al pasar a Sub-receta se limpia el ingrediente seleccionado', async () => {
    const user = userEvent.setup();
    render(<RecipeForm {...defaultProps} existingRecipe={existingRecipeWith('kg')} />, {
      wrapper: TestWrapper,
    });

    // Síntoma 2: la unidad guardada se muestra tal cual, no "Base".
    expect(uomTrigger()).toHaveTextContent('kg');

    await user.click(tipoTrigger());
    await user.click(await screen.findByRole('option', { name: 'Sub-receta' }));

    expect(tipoTrigger()).toHaveTextContent('Sub-receta');
    expect(ingredienteTrigger()).toHaveTextContent(/Seleccione un ingrediente/);
  });

  it('un componente sin unidad guardada muestra la unidad real del insumo, nunca "Base"', () => {
    render(<RecipeForm {...defaultProps} existingRecipe={existingRecipeWith(null)} />, {
      wrapper: TestWrapper,
    });

    // Receta legada con component_uom NULL: el form resuelve la unidad de
    // consumo del insumo (era literalmente "Base", y esa opción no pasaba
    // la validación — la receta no se podía guardar).
    expect(uomTrigger()).toHaveTextContent('kg');
    expect(uomTrigger()).not.toHaveTextContent('Base');
  });

  it('la lista de ingredientes etiqueta con la unidad real del insumo', async () => {
    const user = userEvent.setup();
    render(<RecipeForm {...defaultProps} />, { wrapper: TestWrapper });

    await addComponent(user);
    await user.click(ingredienteTrigger());

    expect(await screen.findByRole('option', { name: 'Arroz (kg)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /undefined/ })).toBeNull();
  });

  it('elegir una sub-receta en la lista refleja Tipo = Sub-receta (síntoma 4)', async () => {
    const user = userEvent.setup();
    render(<RecipeForm {...defaultProps} />, { wrapper: TestWrapper });

    await addComponent(user);
    await user.click(ingredienteTrigger());
    await user.click(await screen.findByRole('option', { name: /Salsa Base/ }));

    // Sin sincronía, el par Tipo=Insumo + ingrediente=sub-receta es un
    // callejón: el UOM exige unidad, la sub-receta no tiene unidad de
    // consumo y el backend rechaza la guarda.
    expect(tipoTrigger()).toHaveTextContent('Sub-receta');
    expect(screen.queryByRole('combobox', { name: /Unidad de Medida/ })).toBeNull();
  });
});
