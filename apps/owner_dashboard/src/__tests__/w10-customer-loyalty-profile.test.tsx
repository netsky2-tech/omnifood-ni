import { render, screen, waitFor } from '@testing-library/react';
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
import type { Customer, CustomerLoyaltyAccount, CustomerPointTransaction, LoyaltyProgram } from '@/features/loyalty/types';

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

const MOCK_CUSTOMERS: Customer[] = [
  {
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
  },
  {
    id: 'cust-2',
    tenant_id: 'tenant-A',
    name: 'Maria Lopez',
    tax_id: null,
    phone: '7777-5678',
    email: null,
    address: null,
    points_balance: 50,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const MOCK_PROGRAMS: LoyaltyProgram[] = [
  {
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
  },
];

const MOCK_ACCOUNTS: CustomerLoyaltyAccount[] = [
  {
    tenant_id: 'tenant-A',
    customer_id: 'cust-1',
    loyalty_program_id: 'prog-1',
    balance_units: 250,
    last_transaction_id: 'tx-1',
    projection_version: 3,
    recomputed_at: '2026-01-15T10:00:00Z',
  },
];

const MOCK_TRANSACTIONS: CustomerPointTransaction[] = [
  {
    id: 'tx-1',
    tenant_id: 'tenant-A',
    customer_id: 'cust-1',
    loyalty_program_id: 'prog-1',
    ticket_id: 'ticket-100',
    invoice_id: null,
    reward_id: null,
    transaction_type: 'earn',
    units: 10,
    reversal_of_transaction_id: null,
    idempotency_key: 'idem-1',
    source_event_id: null,
    actor_user_id: null,
    branch_id: null,
    terminal_id: null,
    program_version: 1,
    reward_version: null,
    commercial_snapshot: null,
    origin: 'pos',
    occurred_at: '2026-01-15T09:30:00Z',
    recorded_at: '2026-01-15T09:30:00Z',
    legacy_imported: false,
    type: 'earn',
    points: 10,
    balance_after: 250,
    conversion_rate: 0.1,
    reason: 'Compra en tienda',
    created_at: '2026-01-15T09:30:00Z',
  },
];

function mockCustomers(customers: Customer[] = MOCK_CUSTOMERS) {
  vi.mocked(useCustomers).mockReturnValue({
    data: customers,
    isLoading: false,
    error: null,
  } as any);
}

function mockAccounts(accounts: CustomerLoyaltyAccount[] = []) {
  vi.mocked(useCustomerLoyaltyAccounts).mockReturnValue({
    data: accounts,
    isLoading: false,
    error: null,
  } as any);
}

function mockTransactions(txs: CustomerPointTransaction[] = []) {
  vi.mocked(useCustomerTransactions).mockReturnValue({
    data: txs,
    isLoading: false,
    error: null,
  } as any);
}

function mockPrograms(programs: LoyaltyProgram[] = MOCK_PROGRAMS) {
  vi.mocked(usePrograms).mockReturnValue({
    data: programs,
    isLoading: false,
    error: null,
  } as any);
}

function mockAdjust() {
  vi.mocked(useAdjustPoints).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCustomers();
  mockAccounts([]);
  mockTransactions([]);
  mockPrograms();
  mockAdjust();
});

describe('LV1.5D — CustomerLoyaltyProfile', () => {
  it('renders empty state when no customer is selected', () => {
    mockCustomers(MOCK_CUSTOMERS);

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    expect(screen.getByText(/Seleccione un cliente/)).toBeInTheDocument();
  });

  it('displays customer list with names and point balances', () => {
    mockCustomers(MOCK_CUSTOMERS);

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
    expect(screen.getByText('Maria Lopez')).toBeInTheDocument();
    expect(screen.getByText('250 pts')).toBeInTheDocument();
    expect(screen.getByText('50 pts')).toBeInTheDocument();
  });

  it('filters customers by search query', async () => {
    const user = userEvent.setup();
    mockCustomers(MOCK_CUSTOMERS);

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText(/Buscar por nombre/);
    await user.type(searchInput, 'Carlos');

    await waitFor(() => {
      expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
      expect(screen.queryByText('Maria Lopez')).not.toBeInTheDocument();
    });
  });

  it('shows loading state while fetching customers', () => {
    vi.mocked(useCustomers).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
  });

  it('selects a customer and shows loyalty accounts', async () => {
    const user = userEvent.setup();
    mockCustomers(MOCK_CUSTOMERS);
    mockAccounts(MOCK_ACCOUNTS);
    mockTransactions([]);

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    await user.click(screen.getByText('Carlos Mendoza'));

    await waitFor(() => {
      expect(screen.getByText('Cuentas de Lealtad')).toBeInTheDocument();
      expect(screen.getByText('Club Smash Burger')).toBeInTheDocument();
      expect(screen.getByText('250')).toBeInTheDocument();
    });
  });

  it('shows transaction history when customer is selected', async () => {
    const user = userEvent.setup();
    mockCustomers(MOCK_CUSTOMERS);
    mockAccounts(MOCK_ACCOUNTS);
    mockTransactions(MOCK_TRANSACTIONS);

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    await user.click(screen.getByText('Carlos Mendoza'));

    await waitFor(() => {
      expect(screen.getByText('Historial de Transacciones')).toBeInTheDocument();
      expect(screen.getByText('Compra en tienda')).toBeInTheDocument();
      expect(screen.getByText('+10')).toBeInTheDocument();
    });
  });

  it('shows empty accounts message when no accounts exist', async () => {
    const user = userEvent.setup();
    mockCustomers(MOCK_CUSTOMERS);
    mockAccounts([]);
    mockTransactions([]);

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    await user.click(screen.getByText('Carlos Mendoza'));

    await waitFor(() => {
      expect(screen.getByText('Sin cuentas de lealtad activas')).toBeInTheDocument();
    });
  });

  it('shows empty transactions message when no transactions exist', async () => {
    const user = userEvent.setup();
    mockCustomers(MOCK_CUSTOMERS);
    mockAccounts(MOCK_ACCOUNTS);
    mockTransactions([]);

    render(
      <TestWrapper>
        <CustomerLoyaltyProfile />
      </TestWrapper>,
    );

    await user.click(screen.getByText('Carlos Mendoza'));

    await waitFor(() => {
      expect(screen.getByText('Sin transacciones registradas')).toBeInTheDocument();
    });
  });
});
