import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserDialog } from './user-dialog';
import { UserRole, type User } from './types';
import { useCreateUser, useUpdateUser } from './use-users';
import { toast } from '@/hooks/use-toast';

vi.mock('./use-users');
vi.mock('@/hooks/use-toast');
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockUpdateUser = {
  mutateAsync: vi.fn(),
  isPending: false,
};
const mockCreateUser = {
  mutateAsync: vi.fn(),
  isPending: false,
};

const existingCashier: User = {
  id: 'user-1',
  name: 'Mateo',
  email: 'mateo@soho.com',
  role: UserRole.CASHIER,
  is_active: true,
  created_at: '2026-10-01T00:00:00.000Z',
};

describe('UserDialog PIN change feedback (issue #944)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useUpdateUser as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockUpdateUser,
    );
    (useCreateUser as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockCreateUser,
    );
    mockUpdateUser.mutateAsync.mockResolvedValue(existingCashier);
    mockCreateUser.mutateAsync.mockResolvedValue(existingCashier);
  });

  function renderDialog() {
    return render(
      <UserDialog
        open
        onOpenChange={() => undefined}
        userToEdit={existingCashier}
      />,
    );
  }

  it('tells the operator the new PIN reaches the terminals on the next sync', async () => {
    renderDialog();

    const pinInput = screen.getByLabelText(/nuevo pin pos/i);
    fireEvent.change(pinInput, { target: { value: '4321' } });

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockUpdateUser.mutateAsync).toHaveBeenCalled());

    const successToast = (toast as unknown as ReturnType<typeof vi.fn>).mock
      .calls.map((call) => call[0])
      .find((args) => args.variant === 'success');

    expect(successToast).toBeDefined();
    expect(successToast.description).toMatch(/sincronizaci/i);
    expect(successToast.description).toMatch(/terminal/i);
  });

  it('keeps the plain confirmation when the change does not touch the PIN', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockUpdateUser.mutateAsync).toHaveBeenCalled());

    const successToast = (toast as unknown as ReturnType<typeof vi.fn>).mock
      .calls.map((call) => call[0])
      .find((args) => args.variant === 'success');

    expect(successToast).toBeDefined();
    expect(successToast.description).not.toMatch(/sincronizaci/i);
  });
});
