import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromotionForm } from './PromotionForm';
import { promotionFormSchema } from './schema';
import { PromotionType, type Promotion } from '@/types/promotions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCreatePromotion, useUpdatePromotion } from '@/hooks/use-promotions';
import { useCatalogValues } from '@/features/catalog/use-catalog';
import { toast } from '@/hooks/use-toast';

vi.mock('@/hooks/use-promotions');
vi.mock('@/hooks/use-toast');
vi.mock('@/features/catalog/use-catalog');
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

const mockCatalogCategories = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    tenant_id: 'tenant-A',
    catalog_type: 'SALES_PRODUCT_CATEGORY',
    code: 'BEBIDAS',
    name: 'Bebidas',
    is_active: true,
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    tenant_id: 'tenant-A',
    catalog_type: 'SALES_PRODUCT_CATEGORY',
    code: 'POSTRES',
    name: 'Postres',
    is_active: false,
    sort_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

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

describe('promotionFormSchema target_category_id (T0.5\'d)', () => {
  const validUuid = '11111111-1111-4111-8111-111111111111';

  it('accepts an empty string (nothing selected / global)', () => {
    const result = promotionFormSchema.safeParse({
      name: 'Promo',
      type: 'comboPackage',
      target_category_id: '',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid category uuid', () => {
    const result = promotionFormSchema.safeParse({
      name: 'Promo',
      type: 'comboPackage',
      target_category_id: validUuid,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.target_category_id).toBe(validUuid);
    }
  });

  it('rejects free text with a Spanish message', () => {
    const result = promotionFormSchema.safeParse({
      name: 'Promo',
      type: 'comboPackage',
      target_category_id: 'Bebidas',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldError = result.error.issues.find(
        (issue) => issue.path[0] === 'target_category_id',
      );
      expect(fieldError).toBeDefined();
      expect(fieldError!.message).toMatch(/categor/i);
    }
  });

  it('keeps rejecting a malformed uuid-like string', () => {
    const result = promotionFormSchema.safeParse({
      name: 'Promo',
      type: 'comboPackage',
      target_category_id: '11111111-1111-4111-8111-not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('PromotionForm', () => {
  const mockCreatePromotion = { mutateAsync: vi.fn() };
  const mockUpdatePromotion = { mutateAsync: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    (useCreatePromotion as any).mockReturnValue(mockCreatePromotion);
    (useUpdatePromotion as any).mockReturnValue(mockUpdatePromotion);
    (useCatalogValues as any).mockReturnValue({ data: mockCatalogCategories });
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

  it('pins noValidate on the form and keeps zod/RHF as the only submit guard', async () => {
    renderForm(null);

    // (a) — the form element carries noValidate, so the browser's native
    // constraint validation can never replace the Spanish inline errors.
    // (DialogContent portals the form, so look it up in the document.)
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute('noValidate');

    // (b) — the schema rejects an empty name: no mutation call, Spanish
    // inline error from the design system.
    fireEvent.click(screen.getByRole('button', { name: /crear/i }));

    await waitFor(() => {
      expect(screen.getByText('El nombre es requerido')).toBeInTheDocument();
    });
    expect(mockCreatePromotion.mutateAsync).not.toHaveBeenCalled();
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

  // T0.5'd: the category target is a picker over the synced catalog, not
  // free text, and the submit contract differs by mode: create omits ''
  // (global), update maps '' to an explicit null (clear to global).
  describe("target category picker (T0.5'd)", () => {
    const catBebidas = '11111111-1111-4111-8111-111111111111';
    const catPostres = '22222222-2222-4222-8222-222222222222';

    // A real submission fills the optional timestamp fields; leaving them
    // empty trips a pre-existing NaN quirk of the numeric inputs that is
    // outside this work unit's scope.
    const fillRequiredFields = () => {
      fireEvent.change(screen.getByLabelText('Nombre *'), {
        target: { value: 'Promo Test' },
      });
      fireEvent.change(screen.getByLabelText('Fecha Inicio (timestamp)'), {
        target: { value: '1730000000000' },
      });
      fireEvent.change(screen.getByLabelText('Fecha Fin (timestamp)'), {
        target: { value: '1730086400000' },
      });
    };

    it('reads the full category catalog including inactive rows', () => {
      renderForm(null);
      expect(useCatalogValues).toHaveBeenCalledWith('SALES_PRODUCT_CATEGORY', true);
    });

    it('renders a Global option plus every catalog category, with a suffix on inactive ones', () => {
      renderForm(null);
      expect(screen.getByRole('option', { name: 'Global (sin categoría)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Bebidas' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Postres (inactiva)' })).toBeInTheDocument();
    });

    it('keeps an inactive stored target selectable when editing (no silent drop)', async () => {
      renderForm({ ...mockPromotion, target_category_id: catPostres });
      await waitFor(() => {
        const select = screen.getByLabelText('Categoría Objetivo (opcional)') as HTMLSelectElement;
        expect(select.value).toBe(catPostres);
      });
      expect(screen.getByRole('option', { name: 'Postres (inactiva)' })).toBeInTheDocument();
    });

    it('omits target_category_id on create when Global is selected', async () => {
      renderForm(null);
      fillRequiredFields();
      fireEvent.click(screen.getByRole('button', { name: /crear/i }));
      await waitFor(() => {
        expect(mockCreatePromotion.mutateAsync).toHaveBeenCalled();
      });
      const payload = mockCreatePromotion.mutateAsync.mock.calls[0]![0];
      expect(payload).not.toHaveProperty('target_category_id');
    });

    it('sends the selected uuid unchanged on create', async () => {
      renderForm(null);
      fillRequiredFields();
      fireEvent.change(screen.getByLabelText('Categoría Objetivo (opcional)'), {
        target: { value: catBebidas },
      });
      fireEvent.click(screen.getByRole('button', { name: /crear/i }));
      await waitFor(() => {
        expect(mockCreatePromotion.mutateAsync).toHaveBeenCalled();
      });
      const payload = mockCreatePromotion.mutateAsync.mock.calls[0]![0];
      expect(payload.target_category_id).toBe(catBebidas);
    });

    it('maps an empty selection to an explicit null on update (clear to global)', async () => {
      renderForm({ ...mockPromotion, target_category_id: catBebidas });
      fireEvent.change(screen.getByLabelText('Categoría Objetivo (opcional)'), {
        target: { value: '' },
      });
      fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
      await waitFor(() => {
        expect(mockUpdatePromotion.mutateAsync).toHaveBeenCalled();
      });
      const dto = mockUpdatePromotion.mutateAsync.mock.calls[0]![0].dto;
      expect(dto.target_category_id).toBeNull();
    });

    it('sends an untouched selected id unchanged on update', async () => {
      renderForm({ ...mockPromotion, target_category_id: catBebidas });
      fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
      await waitFor(() => {
        expect(mockUpdatePromotion.mutateAsync).toHaveBeenCalled();
      });
      const dto = mockUpdatePromotion.mutateAsync.mock.calls[0]![0].dto;
      expect(dto.target_category_id).toBe(catBebidas);
    });
  });
});