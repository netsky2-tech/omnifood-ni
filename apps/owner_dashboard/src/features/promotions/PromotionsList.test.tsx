import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromotionsList } from './PromotionsList';
import { PromotionType, type Promotion } from '@/types/promotions';
import { usePromotions, useTogglePromotion, useDeletePromotion, useCreatePromotion, useUpdatePromotion } from '@/hooks/use-promotions';
import { toast } from '@/hooks/use-toast';

vi.mock('@/hooks/use-promotions');
vi.mock('@/hooks/use-toast');
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
});