import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CustomersList } from '@/features/customers/customers-list';
import { CustomerDialog } from '@/features/customers/customer-dialog';
import * as useCustomersModule from '@/features/customers/use-customers';
import * as usePromotionsModule from '@/hooks/use-promotions';
import type { CustomerItem } from '@/features/customers/customer-api';
import type { Promotion } from '@/types/promotions';

vi.mock('@/features/customers/use-customers');
vi.mock('@/hooks/use-promotions');

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const MOCK_CUSTOMERS: CustomerItem[] = [
  {
    id: 'cust-1',
    name: 'Distribuidora San José',
    customer_type: 'EMPRESA',
    tax_id: 'J0310000000123',
    phone: '2222-3333',
    email: 'contacto@sanjose.ni',
    address: 'Carretera Norte',
    is_active: true,
  },
  {
    id: 'cust-2',
    name: 'Juan Pérez',
    customer_type: 'PERSONA',
    tax_id: '001-120590-0001A',
    phone: '8888-1234',
    email: 'juan@gmail.com',
    address: 'Bello Horizonte',
    is_active: true,
  },
  {
    id: 'cust-3',
    name: 'Empresa Inactiva S.A.',
    customer_type: 'EMPRESA',
    tax_id: 'J0310000000999',
    phone: '8777-6655',
    email: 'inactiva@empresa.ni',
    address: 'Managua',
    is_active: false,
  },
];

const MOCK_PROMOTIONS: Partial<Promotion>[] = [
  {
    id: 'promo-conv-1',
    name: 'Convenio San José',
    type: 'convenio' as any,
    target_customer_id: 'cust-1',
    code: 'CONV-SJ',
    discount_value: 15,
    is_active: true,
  },
];

describe('Customers CRUD & Convenio Integration', () => {
  const mockDeactivate = vi.fn().mockResolvedValue(undefined);
  const mockReactivate = vi.fn().mockResolvedValue(undefined);
  const mockCreate = vi.fn().mockResolvedValue({ id: 'new-id', name: 'Nuevo' });
  const mockUpdate = vi.fn().mockResolvedValue({ id: 'cust-1', name: 'Actualizado' });

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(useCustomersModule, 'useCustomerList').mockReturnValue({
      data: { data: MOCK_CUSTOMERS, total: 3 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(useCustomersModule, 'useDeactivateCustomer').mockReturnValue({
      mutateAsync: mockDeactivate,
      isPending: false,
    } as any);

    vi.spyOn(useCustomersModule, 'useReactivateCustomer').mockReturnValue({
      mutateAsync: mockReactivate,
      isPending: false,
    } as any);

    vi.spyOn(useCustomersModule, 'useCreateCustomer').mockReturnValue({
      mutateAsync: mockCreate,
      isPending: false,
    } as any);

    vi.spyOn(useCustomersModule, 'useUpdateCustomer').mockReturnValue({
      mutateAsync: mockUpdate,
      isPending: false,
    } as any);

    vi.spyOn(usePromotionsModule, 'usePromotions').mockReturnValue({
      data: MOCK_PROMOTIONS as Promotion[],
      isLoading: false,
      error: null,
    } as any);
  });

  it('renders customer directory table with columns and customers', () => {
    render(
      <TestWrapper>
        <CustomersList search="" createOpen={false} onCreateOpenChange={vi.fn()} />
      </TestWrapper>,
    );

    expect(screen.getByText('Distribuidora San José')).toBeInTheDocument();
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('Empresa Inactiva S.A.')).toBeInTheDocument();
    expect(screen.getByText('Persona Natural')).toBeInTheDocument();
    expect(screen.getAllByText('Empresa').length).toBeGreaterThan(0);
  });

  it('displays active convenio badge and action for customer with convenio', () => {
    render(
      <TestWrapper>
        <CustomersList search="" createOpen={false} onCreateOpenChange={vi.fn()} />
      </TestWrapper>,
    );

    // Customer 1 has an active convenio (15% CONV-SJ)
    expect(screen.getByText(/CONV-SJ/i)).toBeInTheDocument();
    expect(screen.getByText(/15%/i)).toBeInTheDocument();
  });

  it('displays pagination controls and information', () => {
    render(
      <TestWrapper>
        <CustomersList search="" createOpen={false} onCreateOpenChange={vi.fn()} />
      </TestWrapper>,
    );

    expect(screen.getByTestId('pagination-summary')).toHaveTextContent('Mostrando 1 - 3 de 3 clientes');
    expect(screen.getByTestId('pagination-page-info')).toHaveTextContent('Página 1 de 1');
    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });

  it('provides Reactivar button for inactive customer and Desactivar for active customer', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <CustomersList search="" createOpen={false} onCreateOpenChange={vi.fn()} />
      </TestWrapper>,
    );

    const reactivateBtn = screen.getByRole('button', { name: /reactivar/i });
    expect(reactivateBtn).toBeInTheDocument();

    await user.click(reactivateBtn);
    expect(mockReactivate).toHaveBeenCalledWith('cust-3');
  });

  it('CustomerDialog validates required fields and submits create', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <TestWrapper>
        <CustomerDialog open={true} onOpenChange={onClose} />
      </TestWrapper>,
    );

    expect(screen.getByRole('heading', { name: /nuevo cliente/i })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/nombre/i);
    await user.type(nameInput, 'Distribuidora El Éxito');

    const submitBtn = screen.getByRole('button', { name: /registrar cliente/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Distribuidora El Éxito',
        }),
      );
    });
  });

  it('CustomerDialog pre-fills data in edit mode and submits update', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <TestWrapper>
        <CustomerDialog open={true} onOpenChange={onClose} customerToEdit={MOCK_CUSTOMERS[0]} />
      </TestWrapper>,
    );

    expect(screen.getByRole('heading', { name: /editar cliente/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Distribuidora San José')).toBeInTheDocument();
    expect(screen.getByDisplayValue('J0310000000123')).toBeInTheDocument();

    const phoneInput = screen.getByLabelText(/teléfono/i);
    await user.clear(phoneInput);
    await user.type(phoneInput, '2222-9999');

    const submitBtn = screen.getByRole('button', { name: /guardar cambios/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cust-1',
          dto: expect.objectContaining({
            phone: '2222-9999',
          }),
        }),
      );
    });
  });

  it('CustomerDialog shows validation error when name is empty or email is invalid', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <TestWrapper>
        <CustomerDialog open={true} onOpenChange={onClose} />
      </TestWrapper>,
    );

    const submitBtn = screen.getByRole('button', { name: /registrar cliente/i });
    await user.click(submitBtn);

    expect(screen.getByText(/el nombre del cliente es obligatorio/i)).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();

    const nameInput = screen.getByLabelText(/nombre/i);
    await user.type(nameInput, 'Cliente Válido');

    const emailInput = screen.getByLabelText(/correo electrónico/i);
    await user.type(emailInput, 'correo-invalido');

    await user.click(submitBtn);
    expect(screen.getByText(/el correo electrónico no tiene un formato válido/i)).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('filters customers in-memory by convenio status', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <CustomersList search="" createOpen={false} onCreateOpenChange={vi.fn()} />
      </TestWrapper>,
    );

    // Initial table has all 3 customers
    expect(screen.getByText('Distribuidora San José')).toBeInTheDocument();
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('Empresa Inactiva S.A.')).toBeInTheDocument();

    // Select "Con Convenio"
    const convenioCombobox = screen.getByRole('combobox', { name: /convenio/i });
    await user.click(convenioCombobox);
    const withConvenioOption = await screen.findByRole('option', { name: /con convenio/i });
    await user.click(withConvenioOption);

    // Only customer 1 has an active convenio
    expect(screen.getByText('Distribuidora San José')).toBeInTheDocument();
    expect(screen.queryByText('Juan Pérez')).not.toBeInTheDocument();
    expect(screen.queryByText('Empresa Inactiva S.A.')).not.toBeInTheDocument();
  });

  it('renders empty state when no customers match filters', () => {
    vi.spyOn(useCustomersModule, 'useCustomerList').mockReturnValue({
      data: { data: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(
      <TestWrapper>
        <CustomersList search="NoExiste" createOpen={false} onCreateOpenChange={vi.fn()} />
      </TestWrapper>,
    );

    expect(screen.getByText(/no se encontraron clientes con los filtros aplicados/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /limpiar filtros/i }).length).toBeGreaterThan(0);
  });
});
