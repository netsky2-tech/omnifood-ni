import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerLoyaltyProfile } from '@/features/loyalty/customer-loyalty-profile';
import {
  useCustomers,
  useCustomerLoyaltyAccounts,
  useCustomerTransactions,
  usePrograms,
  useAdjustPoints,
} from '@/features/loyalty/use-loyalty';
import type { Customer, LoyaltyProgram } from '@/features/loyalty/types';

vi.mock('@/features/loyalty/use-loyalty', () => ({
  useCustomers: vi.fn(),
  useCustomerLoyaltyAccounts: vi.fn(),
  useCustomerTransactions: vi.fn(),
  usePrograms: vi.fn(),
  useAdjustPoints: vi.fn(),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const MOCK_CUSTOMER: Customer = {
  id: 'cust-1',
  tenant_id: 'tenant-A',
  name: 'Carlos Mendoza',
  tax_id: '001-123456-0001A',
  phone: '8888-1234',
  email: 'carlos@test.ni',
  address: 'Managua',
  points_balance: 250,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const MOCK_PROGRAM: LoyaltyProgram = {
  id: 'prog-1',
  tenant_id: 'tenant-A',
  name: 'Club Smash Burger',
  program_type: 'SPEND_POINTS',
  status: 'ACTIVE',
  starts_at: null,
  ends_at: null,
  earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
  eligibility_rule: {},
  config_version: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

let mockMutateAsync: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockMutateAsync = vi.fn().mockResolvedValue({});

  vi.mocked(useCustomers).mockReturnValue({
    data: [MOCK_CUSTOMER],
    isLoading: false,
    error: null,
  } as any);

  vi.mocked(useCustomerLoyaltyAccounts).mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  } as any);

  vi.mocked(useCustomerTransactions).mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  } as any);

  vi.mocked(usePrograms).mockReturnValue({
    data: [MOCK_PROGRAM],
    isLoading: false,
    error: null,
  } as any);

  vi.mocked(useAdjustPoints).mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
  } as any);
});

describe('LV1.5E — Adjustment Dialog', () => {
  it('opens adjust dialog when "Ajustar puntos" button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    await user.click(screen.getByText('Carlos Mendoza'));

    await waitFor(() => {
      expect(screen.getByText('Ajustar puntos')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Ajustar puntos'));

    await waitFor(() => {
      expect(screen.getByText('Cantidad de puntos')).toBeInTheDocument();
      expect(screen.getByText('Razón')).toBeInTheDocument();
    });
  });

  it('displays current customer balance in the dialog', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    await user.click(screen.getByText('Carlos Mendoza'));

    await waitFor(() => {
      expect(screen.getByText('Ajustar puntos')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Ajustar puntos'));

    await waitFor(() => {
      expect(screen.getByText('Saldo actual: 250 pts')).toBeInTheDocument();
    });
  });

  it('validates that reason is required', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    await user.click(screen.getByText('Carlos Mendoza'));

    await waitFor(() => {
      expect(screen.getByText('Ajustar puntos')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Ajustar puntos'));

    await waitFor(() => {
      expect(screen.getByLabelText(/cantidad de puntos/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/cantidad de puntos/i), {
      target: { value: 100 },
    });

    await user.click(screen.getByRole('button', { name: /aplicar ajuste/i }));

    await waitFor(() => {
      expect(screen.getByText('La razón es obligatoria')).toBeInTheDocument();
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('validates that delta cannot be zero', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    await user.click(screen.getByText('Carlos Mendoza'));

    await waitFor(() => {
      expect(screen.getByText('Ajustar puntos')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Ajustar puntos'));

    await waitFor(() => {
      expect(screen.getByLabelText(/cantidad de puntos/i)).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText(/cantidad de puntos/i));
    await user.type(screen.getByLabelText(/cantidad de puntos/i), '0');

    await user.type(screen.getByLabelText(/razón/i), 'Test reason');

    await user.click(screen.getByRole('button', { name: /aplicar ajuste/i }));

    await waitFor(() => {
      expect(screen.getByText('El monto debe ser diferente de cero')).toBeInTheDocument();
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('calls adjustPoints mutation with correct arguments', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    await user.click(screen.getByText('Carlos Mendoza'));

    await waitFor(() => {
      expect(screen.getByText('Ajustar puntos')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Ajustar puntos'));

    await waitFor(() => {
      expect(screen.getByLabelText(/cantidad de puntos/i)).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText(/cantidad de puntos/i));
    await user.type(screen.getByLabelText(/cantidad de puntos/i), '100');

    await user.type(screen.getByLabelText(/razón/i), 'Promoción especial');

    await user.click(screen.getByRole('button', { name: /aplicar ajuste/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        customerId: 'cust-1',
        input: {
          points_delta: 100,
          reason: 'Promoción especial',
        },
      });
    });
  });

  it('supports negative delta for point deductions', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    await user.click(screen.getByText('Carlos Mendoza'));

    await waitFor(() => {
      expect(screen.getByText('Ajustar puntos')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Ajustar puntos'));

    await waitFor(() => {
      expect(screen.getByLabelText(/cantidad de puntos/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/cantidad de puntos/i), {
      target: { value: -50 },
    });

    await user.type(screen.getByLabelText(/razón/i), 'Corrección de error');

    await user.click(screen.getByRole('button', { name: /aplicar ajuste/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        customerId: 'cust-1',
        input: {
          points_delta: -50,
          reason: 'Corrección de error',
        },
      });
    });
  });

  it('closes dialog after successful adjustment', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    await user.click(screen.getByText('Carlos Mendoza'));

    await waitFor(() => {
      expect(screen.getByText('Ajustar puntos')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Ajustar puntos'));

    await waitFor(() => {
      expect(screen.getByLabelText(/cantidad de puntos/i)).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText(/cantidad de puntos/i));
    await user.type(screen.getByLabelText(/cantidad de puntos/i), '50');

    await user.type(screen.getByLabelText(/razón/i), 'Test close');

    await user.click(screen.getByRole('button', { name: /aplicar ajuste/i }));

    await waitFor(() => {
      expect(screen.queryByText('Cantidad de puntos')).not.toBeInTheDocument();
    });
  });

  it('displays error when adjustment fails', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Insufficient permissions'));

    const user = userEvent.setup();

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    await user.click(screen.getByText('Carlos Mendoza'));

    await waitFor(() => {
      expect(screen.getByText('Ajustar puntos')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Ajustar puntos'));

    await waitFor(() => {
      expect(screen.getByLabelText(/cantidad de puntos/i)).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText(/cantidad de puntos/i));
    await user.type(screen.getByLabelText(/cantidad de puntos/i), '50');

    await user.type(screen.getByLabelText(/razón/i), 'Test error');

    await user.click(screen.getByRole('button', { name: /aplicar ajuste/i }));

    await waitFor(() => {
      expect(screen.getByText('Insufficient permissions')).toBeInTheDocument();
    });
  });
});
