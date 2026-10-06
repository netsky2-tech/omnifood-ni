import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromotionForm } from './PromotionForm';
import { PromotionType, type Promotion } from '@/types/promotions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCreatePromotion, useUpdatePromotion } from '@/hooks/use-promotions';
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

const mockPromotion: Promotion = {
  id: 'promo-1',
  tenant_id: 'tenant-A',
  name: 'Test Promotion',
  type: PromotionType.BUY_X_GET_Y_FREE,
  target_product_id: 'prod-1',
  target_category_id: null,
  buy_quantity: 2,
  get_quantity: 1,
  discount_value: 0,
  min_order_amount: 0,
  days_of_week: ['1', '2', '3'],
  start_time: '09:00',
  end_time: '18:00',
  start_date: Date.now(),
  end_date: Date.now() + 86400000,
  priority: 10,
  is_stackable: true,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const renderForm = (initialData?: Promotion | null) => {
  return render(
    <Dialog open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test Form</DialogTitle>
        </DialogHeader>
        <PromotionForm
          initialData={initialData}
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
        />
      </DialogContent>
    </Dialog>
  );
};

describe('PromotionForm', () => {
  const mockCreatePromotion = { mutateAsync: vi.fn() };
  const mockUpdatePromotion = { mutateAsync: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    (useCreatePromotion as any).mockReturnValue(mockCreatePromotion);
    (useUpdatePromotion as any).mockReturnValue(mockUpdatePromotion);
    (toast as any).mockImplementation(vi.fn());
  });

  it('renders form with default values when no initialData', () => {
    renderForm(null);
    
    expect(screen.getByLabelText('Nombre *')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /tipo de promoci/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad a Comprar *')).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad a Llevar *')).toBeInTheDocument();
  });

  it('shows buy/get fields for BUY_X_GET_Y_FREE type', () => {
    renderForm(null);
    
    expect(screen.getByLabelText('Cantidad a Comprar *')).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad a Llevar *')).toBeInTheDocument();
    expect(screen.queryByLabelText('Porcentaje de Descuento *')).not.toBeInTheDocument();
  });

  it('shows discount fields for PERCENTAGE_DISCOUNT type', async () => {
    renderForm(null);
    
    const selectTrigger = screen.getByRole('combobox', { name: /tipo de promoci/i });
    fireEvent.click(selectTrigger);
    
    const percentageOptions = screen.getAllByText('Descuento Porcentaje');
    // The second one is in the dropdown (first is in the table badge)
    expect(percentageOptions.length).toBeGreaterThan(1);
    fireEvent.click(percentageOptions[1]!);
    
    await waitFor(() => {
      expect(screen.getByLabelText('Porcentaje de Descuento *')).toBeInTheDocument();
    });
    
    expect(screen.queryByLabelText('Cantidad a Comprar *')).not.toBeInTheDocument();
  });

  it('shows discount fields for FIXED_DISCOUNT type', async () => {
    renderForm(null);
    
    const selectTrigger = screen.getByRole('combobox', { name: /tipo de promoci/i });
    fireEvent.click(selectTrigger);
    
    const fixedOptions = screen.getAllByText('Descuento Fijo');
    // The second one is in the dropdown (first is in the table badge)
    expect(fixedOptions.length).toBeGreaterThan(1);
    fireEvent.click(fixedOptions[1]!);
    
    await waitFor(() => {
      expect(screen.getByLabelText('Descuento Fijo *')).toBeInTheDocument();
    });
  });

  it('pre-fills form with initialData when editing', () => {
    renderForm(mockPromotion);
    
    expect(screen.getByLabelText('Nombre *')).toHaveValue('Test Promotion');
    expect(screen.getByLabelText('Cantidad a Comprar *')).toHaveValue(2);
    expect(screen.getByLabelText('Cantidad a Llevar *')).toHaveValue(1);
    expect(screen.getByLabelText('Prioridad')).toHaveValue(10);
  });

  it('toggles days of week correctly', () => {
    renderForm(null);
    
    const mondayButton = screen.getByText('Lunes');
    fireEvent.click(mondayButton);
    
    expect(mondayButton).toHaveClass('bg-primary');
    
    fireEvent.click(mondayButton);
    expect(mondayButton).not.toHaveClass('bg-primary');
  });

  it('shows validation error for empty name', async () => {
    renderForm(null);
    
    const submitButton = screen.getByRole('button', { name: /crear/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('El nombre es requerido')).toBeInTheDocument();
    });
  });

  it.skip('shows validation error for discount type without discount value', async () => {
    renderForm(null);
    
    const selectTrigger = screen.getByRole('combobox', { name: /tipo de promoci/i });
    fireEvent.click(selectTrigger);
    fireEvent.click(screen.getByRole('option', { name: /descuento porcentaje/i }));
    
    // Fill in name to pass that validation
    const nameInput = screen.getByLabelText('Nombre *');
    fireEvent.change(nameInput, { target: { value: 'Test Promo' } });
    
    const submitButton = screen.getByRole('button', { name: /crear/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/complete los campos requeridos para el tipo de promoción seleccionado/i)).toBeInTheDocument();
    });
  });
});