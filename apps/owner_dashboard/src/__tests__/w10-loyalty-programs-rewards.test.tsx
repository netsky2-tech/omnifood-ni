import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoyaltyPage } from '@/features/loyalty/loyalty-page';
import {
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
import type { LoyaltyProgram, RewardDefinition } from '@/features/loyalty/types';

vi.mock('@/features/loyalty/use-loyalty', () => ({
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
  useRewardProfitAware: vi.fn(),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const MOCK_PROGRAMS: LoyaltyProgram[] = [
  {
    id: 'prog-smash',
    tenant_id: 'tenant-A',
    name: 'Smash Burger Club',
    program_type: 'PRODUCT_STAMPS',
    status: 'ACTIVE',
    starts_at: null,
    ends_at: null,
    earning_rule: { eligibleProductIds: ['prod-smash'], unitsPerPurchasedUnit: 1 },
    eligibility_rule: {},
    config_version: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 'prog-draft',
    tenant_id: 'tenant-A',
    name: 'Puntos por Compra',
    program_type: 'SPEND_POINTS',
    status: 'DRAFT',
    starts_at: null,
    ends_at: null,
    earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
    eligibility_rule: {},
    config_version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const MOCK_REWARDS: RewardDefinition[] = [
  {
    id: 'rw-smash',
    tenant_id: 'tenant-A',
    loyalty_program_id: 'prog-smash',
    name: '1 Smash Burger gratis',
    description: 'Canjea 10 sellos por una burger clásica',
    reward_type: 'FREE_PRODUCT',
    cost_units: 10,
    benefit_config: { productId: 'prod-smash' },
    status: 'ACTIVE',
    starts_at: null,
    ends_at: null,
    presentation_order: 1,
    config_version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

describe('LV1.5A & LV1.5B — LoyaltyPage (Programs & Rewards UI)', () => {
  let mockCreateProgram: ReturnType<typeof vi.fn>;
  let mockUpdateProgram: ReturnType<typeof vi.fn>;
  let mockActivateProgram: ReturnType<typeof vi.fn>;
  let mockDeactivateProgram: ReturnType<typeof vi.fn>;
  let mockCreateReward: ReturnType<typeof vi.fn>;
  let mockUpdateReward: ReturnType<typeof vi.fn>;
  let mockActivateReward: ReturnType<typeof vi.fn>;
  let mockDeactivateReward: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateProgram = vi.fn().mockResolvedValue({});
    mockUpdateProgram = vi.fn().mockResolvedValue({});
    mockActivateProgram = vi.fn().mockResolvedValue({});
    mockDeactivateProgram = vi.fn().mockResolvedValue({});
    mockCreateReward = vi.fn().mockResolvedValue({});
    mockUpdateReward = vi.fn().mockResolvedValue({});
    mockActivateReward = vi.fn().mockResolvedValue({});
    mockDeactivateReward = vi.fn().mockResolvedValue({});

    vi.mocked(usePrograms).mockReturnValue({
      data: MOCK_PROGRAMS,
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(useRewards).mockReturnValue({
      data: MOCK_REWARDS,
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(useCreateProgram).mockReturnValue({
      mutateAsync: mockCreateProgram,
      isPending: false,
    } as any);

    vi.mocked(useUpdateProgram).mockReturnValue({
      mutateAsync: mockUpdateProgram,
      isPending: false,
    } as any);

    vi.mocked(useActivateProgram).mockReturnValue({
      mutateAsync: mockActivateProgram,
      isPending: false,
    } as any);

    vi.mocked(useDeactivateProgram).mockReturnValue({
      mutateAsync: mockDeactivateProgram,
      isPending: false,
    } as any);

    vi.mocked(useCreateReward).mockReturnValue({
      mutateAsync: mockCreateReward,
      isPending: false,
    } as any);

    vi.mocked(useUpdateReward).mockReturnValue({
      mutateAsync: mockUpdateReward,
      isPending: false,
    } as any);

    vi.mocked(useActivateReward).mockReturnValue({
      mutateAsync: mockActivateReward,
      isPending: false,
    } as any);

    vi.mocked(useDeactivateReward).mockReturnValue({
      mutateAsync: mockDeactivateReward,
      isPending: false,
    } as any);
  });

  describe('Programs Listing & Filtering (LV1.5A)', () => {
    it('renders programs list with badges, type and config_version', () => {
      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      expect(screen.getByText('Smash Burger Club')).toBeInTheDocument();
      expect(screen.getByText('Puntos por Compra')).toBeInTheDocument();
      expect(screen.getAllByText('Activo').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Borrador').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Tipo: Sellos por producto')).toBeInTheDocument();
      expect(screen.getByText('Tipo: Puntos por compra')).toBeInTheDocument();
      expect(screen.getByText('Versión config: 2')).toBeInTheDocument();
      expect(screen.getByText('Versión config: 1')).toBeInTheDocument();
    });

    it('filters programs by search query', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      const searchInput = screen.getByPlaceholderText(/buscar por nombre\.\.\./i);
      await user.type(searchInput, 'Smash');

      expect(screen.getByText('Smash Burger Club')).toBeInTheDocument();
      expect(screen.queryByText('Puntos por Compra')).not.toBeInTheDocument();
    });

    it('displays empty state when no programs match', () => {
      vi.mocked(usePrograms).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      } as any);

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      expect(screen.getByText('No hay programas de lealtad')).toBeInTheDocument();
    });
  });

  describe('Program Creation & Acceptance Fixture "Smash Burger Club" (LV1.5A)', () => {
    it('creates acceptance fixture "Smash Burger Club" (PRODUCT_STAMPS) with structured form', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      await user.click(screen.getByRole('button', { name: /nuevo programa/i }));

      expect(screen.getByRole('heading', { name: /nuevo programa de lealtad/i })).toBeInTheDocument();

      await user.type(screen.getByLabelText(/nombre/i), 'Smash Burger Club');

      // Select PRODUCT_STAMPS
      await user.selectOptions(screen.getByLabelText(/tipo de programa/i), 'PRODUCT_STAMPS');

      // Verify dynamic fields appeared
      expect(screen.getByLabelText(/productos elegibles/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/sellos por unidad/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /crear programa/i }));

      await waitFor(() => {
        expect(mockCreateProgram).toHaveBeenCalledWith({
          name: 'Smash Burger Club',
          program_type: 'PRODUCT_STAMPS',
          earning_rule: {
            eligibleProductIds: ['prod-smash'],
            unitsPerPurchasedUnit: 1,
          },
        });
      });
    });

    it('creates SPEND_POINTS program with structured block fields', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      await user.click(screen.getByRole('button', { name: /nuevo programa/i }));
      await user.type(screen.getByLabelText(/nombre/i), 'Puntos por Compra');

      await user.selectOptions(screen.getByLabelText(/tipo de programa/i), 'SPEND_POINTS');

      const spendInput = screen.getByLabelText(/monto bloque \(c\$\)/i);
      const pointsInput = screen.getByLabelText(/puntos por bloque/i);

      fireEvent.change(spendInput, { target: { value: '20' } });
      fireEvent.change(pointsInput, { target: { value: '2' } });

      await user.click(screen.getByRole('button', { name: /crear programa/i }));

      await waitFor(() => {
        expect(mockCreateProgram).toHaveBeenCalledWith({
          name: 'Puntos por Compra',
          program_type: 'SPEND_POINTS',
          earning_rule: {
            spendBlockNio: 20,
            pointsPerBlock: 2,
          },
        });
      });
    });

    it('creates VISIT_STAMPS program with structured visit fields', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      await user.click(screen.getByRole('button', { name: /nuevo programa/i }));
      await user.type(screen.getByLabelText(/nombre/i), 'Club de Visitas');

      await user.selectOptions(screen.getByLabelText(/tipo de programa/i), 'VISIT_STAMPS');

      const visitInput = screen.getByLabelText(/sellos por visita/i);
      const minSpendInput = screen.getByLabelText(/gasto mínimo/i);

      fireEvent.change(visitInput, { target: { value: '1' } });
      fireEvent.change(minSpendInput, { target: { value: '100' } });

      await user.click(screen.getByRole('button', { name: /crear programa/i }));

      await waitFor(() => {
        expect(mockCreateProgram).toHaveBeenCalledWith({
          name: 'Club de Visitas',
          program_type: 'VISIT_STAMPS',
          earning_rule: {
            unitsPerVisit: 1,
            minimumSpendNio: 100,
          },
        });
      });
    });

    it('supports advanced JSON mode and validates syntax', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      await user.click(screen.getByRole('button', { name: /nuevo programa/i }));
      await user.type(screen.getByLabelText(/nombre/i), 'Custom JSON Program');

      await user.click(screen.getByText(/modo json avanzado/i));

      const jsonTextarea = screen.getByLabelText(/regla de acumulación \(json\)/i);
      fireEvent.change(jsonTextarea, { target: { value: 'INVALID_JSON{' } });

      await user.click(screen.getByRole('button', { name: /crear programa/i }));

      await waitFor(() => {
        expect(screen.getByText('earning_rule debe ser JSON válido')).toBeInTheDocument();
      });

      expect(mockCreateProgram).not.toHaveBeenCalled();
    });
  });

  describe('Program Activation, Deactivation & Editing (LV1.5A)', () => {
    it('activates DRAFT program when "Activar" is clicked', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      const activateBtn = screen.getByRole('button', { name: /^activar$/i });
      await user.click(activateBtn);

      await waitFor(() => {
        expect(mockActivateProgram).toHaveBeenCalledWith('prog-draft');
      });
    });

    it('deactivates ACTIVE program when "Desactivar" is clicked', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      const deactivateBtn = screen.getByRole('button', { name: /^desactivar$/i });
      await user.click(deactivateBtn);

      await waitFor(() => {
        expect(mockDeactivateProgram).toHaveBeenCalledWith('prog-smash');
      });
    });

    it('edits an existing program and updates its details', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      // Find the edit button for Smash Burger Club card
      const programCard = screen.getByText('Smash Burger Club').closest('.border')!;
      const editButtons = programCard.querySelectorAll('button');
      // The last button in the program card action row is Edit
      const editBtn = editButtons[editButtons.length - 1]!;
      await user.click(editBtn);

      expect(screen.getByRole('heading', { name: /editar programa/i })).toBeInTheDocument();

      const nameInput = screen.getByLabelText(/nombre/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Smash Burger Club VIP');

      await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

      await waitFor(() => {
        expect(mockUpdateProgram).toHaveBeenCalledWith({
          programId: 'prog-smash',
          input: {
            name: 'Smash Burger Club VIP',
            earning_rule: {
              eligibleProductIds: ['prod-smash'],
              unitsPerPurchasedUnit: 1,
            },
          },
        });
      });
    });

    it('displays error message when program mutation fails', async () => {
      mockCreateProgram.mockRejectedValueOnce(new Error('Servidor no disponible'));
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      await user.click(screen.getByRole('button', { name: /nuevo programa/i }));
      await user.type(screen.getByLabelText(/nombre/i), 'Fail Program');
      await user.click(screen.getByRole('button', { name: /crear programa/i }));

      await waitFor(() => {
        expect(screen.getByText('Servidor no disponible')).toBeInTheDocument();
      });
    });
  });

  describe('Rewards UI & Fixture "1 Smash Burger gratis" (LV1.5B)', () => {
    it('expands rewards when program card is selected', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      await user.click(screen.getByText('Smash Burger Club'));

      await waitFor(() => {
        expect(screen.getByText('1 Smash Burger gratis')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /agregar/i })).toBeInTheDocument();
      });
    });

    it('creates FREE_PRODUCT reward for acceptance fixture', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      await user.click(screen.getByText('Smash Burger Club'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /agregar/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /agregar/i }));

      expect(screen.getByRole('heading', { name: /nueva recompensa/i })).toBeInTheDocument();

      await user.type(screen.getByLabelText(/nombre/i), '1 Smash Burger gratis');
      await user.selectOptions(screen.getByLabelText(/tipo de recompensa/i), 'FREE_PRODUCT');

      const costInput = screen.getByLabelText(/costo en unidades/i);
      fireEvent.change(costInput, { target: { value: '10' } });

      const prodInput = screen.getByLabelText(/id de producto a entregar/i);
      fireEvent.change(prodInput, { target: { value: 'prod-smash' } });

      await user.click(screen.getByRole('button', { name: /crear recompensa/i }));

      await waitFor(() => {
        expect(mockCreateReward).toHaveBeenCalledWith({
          programId: 'prog-smash',
          input: {
            name: '1 Smash Burger gratis',
            description: undefined,
            reward_type: 'FREE_PRODUCT',
            cost_units: 10,
            benefit_config: { productId: 'prod-smash' },
          },
        });
      });
    });

    it('creates DISCOUNT_AMOUNT reward with structured amount field', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      await user.click(screen.getByText('Smash Burger Club'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /agregar/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /agregar/i }));

      await user.type(screen.getByLabelText(/nombre/i), 'Descuento C$50');
      await user.selectOptions(screen.getByLabelText(/tipo de recompensa/i), 'DISCOUNT_AMOUNT');

      const costInput = screen.getByLabelText(/costo en unidades/i);
      fireEvent.change(costInput, { target: { value: '100' } });

      const amountInput = screen.getByLabelText(/monto de descuento \(c\$\)/i);
      fireEvent.change(amountInput, { target: { value: '50' } });

      await user.click(screen.getByRole('button', { name: /crear recompensa/i }));

      await waitFor(() => {
        expect(mockCreateReward).toHaveBeenCalledWith({
          programId: 'prog-smash',
          input: {
            name: 'Descuento C$50',
            description: undefined,
            reward_type: 'DISCOUNT_AMOUNT',
            cost_units: 100,
            benefit_config: { amountNio: 50 },
          },
        });
      });
    });

    it('deactivates active reward when toggle is clicked', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      await user.click(screen.getByText('Smash Burger Club'));

      await waitFor(() => {
        expect(screen.getByText('1 Smash Burger gratis')).toBeInTheDocument();
      });

      // Reward toggle button is inside rewards list
      const rewardRow = screen.getByText('1 Smash Burger gratis').closest('div')!;
      const toggleButtons = rewardRow.parentElement!.querySelectorAll('button');
      // First button is toggle, second is edit
      await user.click(toggleButtons[0]!);

      await waitFor(() => {
        expect(mockDeactivateReward).toHaveBeenCalledWith('rw-smash');
      });
    });

    it('activates inactive reward when toggle is clicked', async () => {
      vi.mocked(useRewards).mockReturnValue({
        data: [
          {
            ...MOCK_REWARDS[0],
            id: 'rw-inactive',
            status: 'INACTIVE',
          },
        ],
        isLoading: false,
        error: null,
      } as any);

      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      await user.click(screen.getByText('Smash Burger Club'));

      await waitFor(() => {
        expect(screen.getByText('1 Smash Burger gratis')).toBeInTheDocument();
      });

      const rewardRow = screen.getByText('1 Smash Burger gratis').closest('div')!;
      const toggleButtons = rewardRow.parentElement!.querySelectorAll('button');
      await user.click(toggleButtons[0]!);

      await waitFor(() => {
        expect(mockActivateReward).toHaveBeenCalledWith('rw-inactive');
      });
    });

    it('edits an existing reward', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LoyaltyPage />
        </TestWrapper>,
      );

      await user.click(screen.getByText('Smash Burger Club'));

      await waitFor(() => {
        expect(screen.getByText('1 Smash Burger gratis')).toBeInTheDocument();
      });

      const rewardRow = screen.getByText('1 Smash Burger gratis').closest('div')!;
      const toggleButtons = rewardRow.parentElement!.querySelectorAll('button');
      // Second button is edit
      await user.click(toggleButtons[1]!);

      expect(screen.getByRole('heading', { name: /editar recompensa/i })).toBeInTheDocument();

      const nameInput = screen.getByLabelText(/nombre/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Smash Burger Doble gratis');

      await user.click(screen.getByRole('button', { name: /^guardar$/i }));

      await waitFor(() => {
        expect(mockUpdateReward).toHaveBeenCalledWith({
          rewardId: 'rw-smash',
          input: {
            name: 'Smash Burger Doble gratis',
            description: 'Canjea 10 sellos por una burger clásica',
            cost_units: 10,
            benefit_config: { productId: 'prod-smash' },
          },
        });
      });
    });
  });
});
