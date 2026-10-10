import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PromotionsList } from './PromotionsList';
import { PromotionType, type Promotion } from '@/types/promotions';
import { usePromotions, useTogglePromotion, useDeletePromotion, useCreatePromotion, useUpdatePromotion } from '@/hooks/use-promotions';
import { useCatalogValues } from '@/features/catalog/use-catalog';
import { useProductById } from '@/features/catalog/use-product-search';
import { toast } from '@/hooks/use-toast';

vi.mock('@/hooks/use-promotions');
vi.mock('@/hooks/use-toast');
vi.mock('@/features/catalog/use-catalog');
// §17.6 display side: the list resolves a stored target_product_id through
// the same S3 hook the selector uses (useProductById), so it must be mocked
// here like every other query the component consumes.
vi.mock('@/features/catalog/use-product-search', () => ({
  useProductById: vi.fn(),
  useProductSearch: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockPromotions: Promotion[] = [
  {
    id: 'promo-1',
    tenant_id: 'tenant-A',
    name: 'Happy Hour 2x1',
    type: PromotionType.BUY_X_GET_Y_FREE,
    target_product_id: 'prod-beer',
    target_category_id: null,
    buy_quantity: 1,
    get_quantity: 1,
    discount_value: 0,
    min_order_amount: 0,
    days_of_week: ['5', '6'],
    start_time: '18:00',
    end_time: '21:00',
    start_date: null,
    end_date: null,
    priority: 10,
    is_stackable: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'promo-2',
    tenant_id: 'tenant-A',
    name: 'Descuento 15% Lunes',
    type: PromotionType.PERCENTAGE_DISCOUNT,
    target_product_id: null,
    target_category_id: 'cat-pizza',
    buy_quantity: 0,
    get_quantity: 0,
    discount_value: 15,
    min_order_amount: 100,
    days_of_week: ['1'],
    start_time: '12:00',
    end_time: '16:00',
    start_date: null,
    end_date: null,
    priority: 5,
    is_stackable: false,
    is_active: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockCatalogCategories = [
  {
    id: 'cat-pizza',
    tenant_id: 'tenant-A',
    catalog_type: 'SALES_PRODUCT_CATEGORY',
    code: 'PIZZA',
    name: 'Pizzas',
    is_active: true,
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cat-drinks',
    tenant_id: 'tenant-A',
    catalog_type: 'SALES_PRODUCT_CATEGORY',
    code: 'DRINKS',
    name: 'Bebidas',
    is_active: false,
    sort_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe('PromotionsList', () => {
  const mockTogglePromotion = { mutateAsync: vi.fn() };
  const mockDeletePromotion = { mutateAsync: vi.fn() };
  const mockCreatePromotion = { mutateAsync: vi.fn() };
  const mockUpdatePromotion = { mutateAsync: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    (usePromotions as any).mockReturnValue({
      data: mockPromotions,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    (useTogglePromotion as any).mockReturnValue(mockTogglePromotion);
    (useDeletePromotion as any).mockReturnValue(mockDeletePromotion);
    (useCreatePromotion as any).mockReturnValue(mockCreatePromotion);
    (useUpdatePromotion as any).mockReturnValue(mockUpdatePromotion);
    (useCatalogValues as any).mockReturnValue({ data: mockCatalogCategories });
    (useProductById as any).mockReturnValue({
      data: { id: 'prod-beer', name: 'Cerveza Victoria' },
    });
    (toast as any).mockImplementation(vi.fn());
  });

  it('renders promotions table with data', () => {
    render(<PromotionsList />);
    
    expect(screen.getByText('Promociones')).toBeInTheDocument();
    expect(screen.getByText('Happy Hour 2x1')).toBeInTheDocument();
    expect(screen.getByText('Descuento 15% Lunes')).toBeInTheDocument();
  });

  it('shows promotion type badges correctly', () => {
    render(<PromotionsList />);
    
    expect(screen.getByText('Compra X Llévate Y')).toBeInTheDocument();
    expect(screen.getByText('Descuento Porcentaje')).toBeInTheDocument();
  });

  it('shows active/inactive switch state', () => {
    render(<PromotionsList />);
    
    const switches = screen.getAllByRole('switch');
    expect(switches[0]).toBeChecked();
    expect(switches[1]).not.toBeChecked();
  });

  it('filters by search query', () => {
    render(<PromotionsList />);
    
    const searchInput = screen.getByPlaceholderText('Buscar por nombre o ID...');
    fireEvent.change(searchInput, { target: { value: 'Happy' } });
    
    expect(screen.getByText('Happy Hour 2x1')).toBeInTheDocument();
    expect(screen.queryByText('Descuento 15% Lunes')).not.toBeInTheDocument();
  });

  it.skip('filters by type', async () => {
    render(<PromotionsList />);
    
    const typeSelect = screen.getByRole('combobox', { name: /tipo/i });
    fireEvent.click(typeSelect);
    const options = screen.getAllByText('Compra X Llévate Y');
    expect(options.length).toBeGreaterThan(0);
    fireEvent.click(options[0]!);
    
    await waitFor(() => {
      expect(screen.getByText('Happy Hour 2x1')).toBeInTheDocument();
      expect(screen.queryByText('Descuento 15% Lunes')).not.toBeInTheDocument();
    });
  });

  it('filters by status', async () => {
    render(<PromotionsList />);
    
    const statusSelect = screen.getByRole('combobox', { name: /estado/i });
    fireEvent.click(statusSelect);
    fireEvent.click(screen.getByText('Activas'));
    
    await waitFor(() => {
      expect(screen.getByText('Happy Hour 2x1')).toBeInTheDocument();
      expect(screen.queryByText('Descuento 15% Lunes')).not.toBeInTheDocument();
    });
  });

  it.skip('opens edit form when edit button clicked', async () => {
    render(<PromotionsList />);
    
    const editButtons = screen.getAllByRole('button', { name: /editar promocion/i });
    expect(editButtons[0]).toBeInTheDocument();
    fireEvent.click(editButtons[0]!);
    
    await waitFor(() => {
      expect(screen.getByText('Editar Promoción')).toBeInTheDocument();
    });
  });

  it('toggles promotion status', async () => {
    render(<PromotionsList />);
    
    const switches = screen.getAllByRole('switch');
    expect(switches[1]).toBeInTheDocument();
    fireEvent.click(switches[1]!);
    
    await waitFor(() => {
      expect(mockTogglePromotion.mutateAsync).toHaveBeenCalledWith({
        id: 'promo-2',
        isActive: true,
      });
    });
  });

  it.skip('deletes promotion on confirmation', async () => {
    render(<PromotionsList />);
    
    const deleteButtons = screen.getAllByRole('button', { name: /eliminar promocion/i });
    expect(deleteButtons[0]).toBeInTheDocument();
    fireEvent.click(deleteButtons[0]!);
    
    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    
    await waitFor(() => {
      expect(mockDeletePromotion.mutateAsync).toHaveBeenCalledWith('promo-1');
    });
  });

  it('shows empty state when no promotions', () => {
    (usePromotions as any).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    
    render(<PromotionsList />);
    
    expect(screen.getByText('No se encontraron promociones')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    (usePromotions as any).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    
    render(<PromotionsList />);
    
    expect(screen.getByRole('status', { name: /cargando promociones/i })).toBeInTheDocument();
  });

  it('shows error state', () => {
    (usePromotions as any).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to fetch'),
      refetch: vi.fn(),
    });
    
    render(<PromotionsList />);
    
    expect(screen.getByText(/error al cargar promociones/i)).toBeInTheDocument();
  });

  // §17.6 display side: a stored target_product_id is a foreign key the
  // operator cannot read. The list must show the product NAME resolved via
  // useProductById (the same hook the selector uses), never the raw stored
  // uuid, in both the table and the detail dialog; an id the query cannot
  // resolve falls back to the short-id display, like the category target.
  describe('target product display (§17.6)', () => {
    it('resolves a known product id to its name', () => {
      render(<PromotionsList />);
      expect(screen.getByText('Producto: Cerveza Victoria')).toBeInTheDocument();
      expect(screen.queryByText('Producto: prod-beer')).not.toBeInTheDocument();
    });

    it('falls back to a short id display for an id the query cannot resolve', () => {
      (useProductById as any).mockReturnValue({ data: undefined });
      render(<PromotionsList />);
      expect(screen.getByText('Producto: …rod-beer')).toBeInTheDocument();
      expect(screen.queryByText('Producto: prod-beer')).not.toBeInTheDocument();
    });

    it('resolves the product name in the detail dialog too', () => {
      render(<PromotionsList />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalles' })[0]!);
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Producto: Cerveza Victoria')).toBeInTheDocument();
      expect(within(dialog).queryByText('prod-beer')).not.toBeInTheDocument();
    });
  });

  // T0.5'd: target_category_id is a uuid; the list must show the category
  // NAME from the synced catalog (including inactive rows), never a bare
  // uuid, and never "Global" for a non-null id.
  describe('target category display (T0.5\'d)', () => {
    it('reads the full category catalog including inactive rows', () => {
      render(<PromotionsList />);
      expect(useCatalogValues).toHaveBeenCalledWith('SALES_PRODUCT_CATEGORY', true);
    });

    it('resolves a known category id to its name', () => {
      render(<PromotionsList />);
      expect(screen.getByText('Categoría: Pizzas')).toBeInTheDocument();
      expect(screen.queryByText('Categoría: cat-pizza')).not.toBeInTheDocument();
    });

    it('falls back to a short id display for an id missing from the catalog', () => {
      (usePromotions as any).mockReturnValue({
        data: [
          {
            ...mockPromotions[1],
            id: 'promo-x',
            target_category_id: 'aaaaaaaa-bbbb-cccc-dddd-1234567890ab',
          },
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<PromotionsList />);
      expect(screen.getByText('Categoría: …567890ab')).toBeInTheDocument();
      expect(screen.queryByText('Categoría: aaaaaaaa-bbbb-cccc-dddd-1234567890ab')).not.toBeInTheDocument();
      expect(screen.queryByText('Global')).not.toBeInTheDocument();
    });

    it('resolves the category name in the detail dialog too', () => {
      render(<PromotionsList />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalles' })[1]!);
      expect(screen.getByText('Pizzas')).toBeInTheDocument();
      expect(screen.queryByText('cat-pizza')).not.toBeInTheDocument();
    });
  });
});