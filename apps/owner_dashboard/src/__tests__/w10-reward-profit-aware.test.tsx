import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RewardProfitAwareDialog } from '@/features/loyalty/reward-profit-aware-dialog';
import { LoyaltyPage } from '@/features/loyalty/loyalty-page';
import {
  useRewardProfitAware,
  usePrograms,
  useRewards,
  useCreateProgram,
  useUpdateProgram,
  useActivateProgram,
  useDeactivateProgram,
  useCreateReward,
  useUpdateReward,
  useActivateReward,
  useDeactivateReward,
} from '@/features/loyalty/use-loyalty';
import type { RewardDefinition, RewardProfitAwareView } from '@/features/loyalty/types';

vi.mock('@/features/loyalty/use-loyalty', () => ({
  useRewardProfitAware: vi.fn(),
  usePrograms: vi.fn(),
  useRewards: vi.fn(),
  useCreateProgram: vi.fn(),
  useUpdateProgram: vi.fn(),
  useActivateProgram: vi.fn(),
  useDeactivateProgram: vi.fn(),
  useCreateReward: vi.fn(),
  useUpdateReward: vi.fn(),
  useActivateReward: vi.fn(),
  useDeactivateReward: vi.fn(),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const MOCK_REWARD: RewardDefinition = {
  id: 'rw-free-combo',
  tenant_id: 'tenant-1',
  loyalty_program_id: 'prog-1',
  name: '2x Special Combo',
  description: 'Canjea 80 puntos por 2 combos especiales',
  reward_type: 'FREE_PRODUCT',
  cost_units: 80,
  benefit_config: { productId: 'prod-combo', quantity: 2 },
  status: 'ACTIVE',
  starts_at: null,
  ends_at: null,
  presentation_order: 1,
  config_version: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const MOCK_METRICS_AVAILABLE: RewardProfitAwareView = {
  rewardId: 'rw-free-combo',
  programId: 'prog-1',
  asOfUtc: '2026-09-02T12:00:00.000Z',
  window: {
    startUtc: '2026-08-03T12:00:00.000Z',
    endUtc: '2026-09-02T12:00:00.000Z',
    label: 'LAST_30_DAYS',
  },
  retailPriceNio: { status: 'AVAILABLE', value: 150.0 },
  estimatedCppNio: { status: 'AVAILABLE', value: 60.0 },
  estimatedRewardCostNio: { status: 'AVAILABLE', value: 120.0 },
  qualifiedSalesNio: { status: 'AVAILABLE', value: 15000.0 },
  estimatedIncentiveCostInWindowNio: { status: 'AVAILABLE', value: 120.0 },
  effectiveIncentiveRatePct: { status: 'AVAILABLE', value: 0.8 },
};

describe('RewardProfitAwareDialog (LV1.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 6 profit-aware metrics and normative disclaimer when AVAILABLE', () => {
    vi.mocked(useRewardProfitAware).mockReturnValue({
      data: MOCK_METRICS_AVAILABLE,
      isLoading: false,
      error: null,
    } as any);

    render(
      <TestWrapper>
        <RewardProfitAwareDialog
          reward={MOCK_REWARD}
          open={true}
          onOpenChange={vi.fn()}
        />
      </TestWrapper>,
    );

    // Title and Reward Name
    expect(screen.getByText('Lectura económica de Recompensa')).toBeInTheDocument();
    expect(screen.getByText(/2x Special Combo/)).toBeInTheDocument();

    // Normative copy / disclaimer
    expect(screen.getByText('Métricas de diseño de incentivos')).toBeInTheDocument();
    expect(screen.getByText(/No representan P&L, margen contable, utilidad neta ni costo fiscal/i)).toBeInTheDocument();

    // Window
    expect(screen.getAllByText(/Últimos 30 días/i).length).toBeGreaterThanOrEqual(1);

    // Metric 1: Retail price C$ 150.00
    expect(screen.getByText('Precio base actual')).toBeInTheDocument();
    expect(screen.getByText(/C\$\s*150,00|C\$\s*150\.00/)).toBeInTheDocument();

    // Metric 2: CPP C$ 60.00
    expect(screen.getByText('CPP estimado')).toBeInTheDocument();
    expect(screen.getByText(/C\$\s*60,00|C\$\s*60\.00/)).toBeInTheDocument();

    // Metric 3: Reward cost C$ 120.00
    expect(screen.getByText('Costo estimado recompensa')).toBeInTheDocument();
    expect(screen.getAllByText(/C\$\s*120,00|C\$\s*120\.00/).length).toBeGreaterThanOrEqual(1);

    // Metric 4: Qualified sales C$ 15,000.00
    expect(screen.getByText('Ventas que generaron Loyalty')).toBeInTheDocument();
    expect(screen.getByText(/C\$\s*15.000,00|C\$\s*15,000\.00/)).toBeInTheDocument();

    // Metric 5: Incentive cost
    expect(screen.getByText('Costo estimado redenciones')).toBeInTheDocument();

    // Metric 6: Effective incentive rate 0.80%
    expect(screen.getByText('Tasa efectiva estimada')).toBeInTheDocument();
    expect(screen.getByText('0.80%')).toBeInTheDocument();
  });

  it('renders "No disponible" with human-readable reason when metrics are NOT_AVAILABLE', () => {
    const mockUnavailable: RewardProfitAwareView = {
      ...MOCK_METRICS_AVAILABLE,
      qualifiedSalesNio: { status: 'AVAILABLE', value: 0 },
      effectiveIncentiveRatePct: { status: 'NOT_AVAILABLE', reason: 'NO_QUALIFIED_SALES' },
      estimatedCppNio: { status: 'NOT_AVAILABLE', reason: 'COST_NOT_RESOLVABLE' },
      estimatedRewardCostNio: { status: 'NOT_AVAILABLE', reason: 'COST_NOT_RESOLVABLE' },
    };

    vi.mocked(useRewardProfitAware).mockReturnValue({
      data: mockUnavailable,
      isLoading: false,
      error: null,
    } as any);

    render(
      <TestWrapper>
        <RewardProfitAwareDialog
          reward={MOCK_REWARD}
          open={true}
          onOpenChange={vi.fn()}
        />
      </TestWrapper>,
    );

    expect(screen.getByText('Sin ventas que califiquen')).toBeInTheDocument();
    expect(screen.getAllByText('Costo no disponible en inventario').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "No aplica" when metric is NOT_APPLICABLE (e.g. DISCOUNT_AMOUNT)', () => {
    const mockDiscountReward: RewardDefinition = {
      ...MOCK_REWARD,
      reward_type: 'DISCOUNT_AMOUNT',
      benefit_config: { amountNio: 50 },
    };

    const mockNotApplicable: RewardProfitAwareView = {
      ...MOCK_METRICS_AVAILABLE,
      retailPriceNio: { status: 'NOT_APPLICABLE', reason: 'ONLY_FOR_FREE_PRODUCT' },
      estimatedCppNio: { status: 'NOT_APPLICABLE', reason: 'ONLY_FOR_FREE_PRODUCT' },
      estimatedRewardCostNio: { status: 'AVAILABLE', value: 50 },
    };

    vi.mocked(useRewardProfitAware).mockReturnValue({
      data: mockNotApplicable,
      isLoading: false,
      error: null,
    } as any);

    render(
      <TestWrapper>
        <RewardProfitAwareDialog
          reward={mockDiscountReward}
          open={true}
          onOpenChange={vi.fn()}
        />
      </TestWrapper>,
    );

    expect(screen.getAllByText('No aplica').length).toBe(2);
    expect(screen.getByText(/C\$\s*50,00|C\$\s*50\.00/)).toBeInTheDocument();
  });

  it('renders "Desactualizado" badge when metric is STALE', () => {
    const mockStale: RewardProfitAwareView = {
      ...MOCK_METRICS_AVAILABLE,
      retailPriceNio: { status: 'STALE', value: 140, source: 'INVENTORY_MIRROR' },
    };

    vi.mocked(useRewardProfitAware).mockReturnValue({
      data: mockStale,
      isLoading: false,
      error: null,
    } as any);

    render(
      <TestWrapper>
        <RewardProfitAwareDialog
          reward={MOCK_REWARD}
          open={true}
          onOpenChange={vi.fn()}
        />
      </TestWrapper>,
    );

    expect(screen.getByText('Desactualizado')).toBeInTheDocument();
  });

  it('renders error message when query fails', () => {
    vi.mocked(useRewardProfitAware).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Network error'),
    } as any);

    render(
      <TestWrapper>
        <RewardProfitAwareDialog
          reward={MOCK_REWARD}
          open={true}
          onOpenChange={vi.fn()}
        />
      </TestWrapper>,
    );

    expect(screen.getByText(/Error al cargar las métricas profit-aware/i)).toBeInTheDocument();
  });
});

describe('LoyaltyPage Profit-aware Integration', () => {
  it('shows "Métricas" button on reward and opens ProfitAware dialog when clicked', async () => {
    const user = userEvent.setup();

    vi.mocked(usePrograms).mockReturnValue({
      data: [
        {
          id: 'prog-1',
          tenant_id: 'tenant-1',
          name: 'Program 1',
          program_type: 'SPEND_POINTS',
          status: 'ACTIVE',
          starts_at: null,
          ends_at: null,
          earning_rule: {},
          eligibility_rule: {},
          config_version: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(useRewards).mockReturnValue({
      data: [MOCK_REWARD],
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(useCreateProgram).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    vi.mocked(useUpdateProgram).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    vi.mocked(useActivateProgram).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    vi.mocked(useDeactivateProgram).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    vi.mocked(useCreateReward).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    vi.mocked(useUpdateReward).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    vi.mocked(useActivateReward).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    vi.mocked(useDeactivateReward).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

    vi.mocked(useRewardProfitAware).mockReturnValue({
      data: MOCK_METRICS_AVAILABLE,
      isLoading: false,
      error: null,
    } as any);

    render(
      <TestWrapper>
        <LoyaltyPage />
      </TestWrapper>,
    );

    // Expand program to see rewards
    const programCard = screen.getByText('Program 1');
    await user.click(programCard);

    // Reward should be visible
    expect(screen.getByText('2x Special Combo')).toBeInTheDocument();

    // "Métricas" button should be present
    const metricsBtn = screen.getByTitle('Ver métricas económicas');
    expect(metricsBtn).toBeInTheDocument();

    // Click "Métricas" button
    await user.click(metricsBtn);

    // Profit-aware dialog opens
    expect(screen.getByText('Lectura económica de Recompensa')).toBeInTheDocument();
  });
});
