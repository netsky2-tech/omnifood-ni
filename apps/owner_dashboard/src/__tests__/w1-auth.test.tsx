import { render, screen, waitFor, renderHook, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "@/features/auth/login-page";
import { ProtectedRoute } from "@/app/protected-route";
import { AuthGate } from "@/app/auth-gate";
import { useLogin, useLogout, useAuthInitialization } from "@/features/auth/auth-hooks";
import { useAuthStore } from "@/features/auth/auth-store";
import { useTenantContext } from "@/lib/tenant";
import * as apiModule from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
  },
  clearTokens: vi.fn(),
  hasStoredRefreshToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  setTokens: vi.fn(),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe("W1 — LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null, tenant: null, isAuthenticated: false, hydrated: false,
    });
    useTenantContext.setState({ tenant: null, resolvedFrom: null });
  });

  it("renders form fields", () => {
    render(<LoginPage />, { wrapper: TestWrapper });
    expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/negocio/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it("renders heading and branding", () => {
    render(<LoginPage />, { wrapper: TestWrapper });
    expect(screen.getByText("NHILOS POS")).toBeInTheDocument();
    expect(screen.getByText("Panel de administración")).toBeInTheDocument();
  });

  it("shows validation error for invalid email", async () => {
    const user = userEvent.setup();
    render(<LoginPage />, { wrapper: TestWrapper });

    await user.type(screen.getByLabelText(/correo electrónico/i), "not-an-email");
    await user.type(screen.getByLabelText(/contraseña/i), "1234567");
    fireEvent.submit(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText("Correo inválido")).toBeInTheDocument();
    });
  });

  it("shows validation error for short password", async () => {
    const user = userEvent.setup();
    render(<LoginPage />, { wrapper: TestWrapper });

    await user.type(screen.getByLabelText(/correo electrónico/i), "test@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "123");
    fireEvent.submit(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText("Mínimo 6 caracteres")).toBeInTheDocument();
    });
  });

  it("does not submit with empty fields", async () => {
    render(<LoginPage />, { wrapper: TestWrapper });

    fireEvent.submit(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText("Correo inválido")).toBeInTheDocument();
    });
    expect(vi.mocked(apiModule.api.post)).not.toHaveBeenCalled();
  });
});

describe("W1 — LoginPage error states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null, tenant: null, isAuthenticated: false, hydrated: false,
    });
    useTenantContext.setState({ tenant: null, resolvedFrom: null });
  });

  it("shows credential error on login failure", async () => {
    const user = userEvent.setup();
    vi.mocked(apiModule.api.post).mockRejectedValue(new Error("Invalid credentials"));

    render(<LoginPage />, { wrapper: TestWrapper });

    await user.type(screen.getByLabelText(/correo electrónico/i), "test@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "123456");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText("Credenciales incorrectas. Intente de nuevo.")).toBeInTheDocument();
    });
  });

  it("shows session expired error", async () => {
    const user = userEvent.setup();
    vi.mocked(apiModule.api.post).mockRejectedValue(new Error("Session expired"));

    render(<LoginPage />, { wrapper: TestWrapper });

    await user.type(screen.getByLabelText(/correo electrónico/i), "test@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "123456");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText("Sesión expirada. Inicie sesión nuevamente.")).toBeInTheDocument();
    });
  });
});

describe("W1 — LoginPage loading state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null, tenant: null, isAuthenticated: false, hydrated: false,
    });
    useTenantContext.setState({ tenant: null, resolvedFrom: null });
  });

  it("shows loading text and disables button during submission", async () => {
    const user = userEvent.setup();
    let resolvePost!: (value: unknown) => void;
    vi.mocked(apiModule.api.post).mockImplementation(
      () => new Promise((resolve) => { resolvePost = resolve; }),
    );

    render(<LoginPage />, { wrapper: TestWrapper });

    await user.type(screen.getByLabelText(/correo electrónico/i), "test@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "123456");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText("Ingresando...")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /ingresando/i })).toBeDisabled();

    resolvePost({
      accessToken: "at", refreshToken: "rt",
      user: { id: "1", email: "test@test.com", name: "Test", role: "OWNER", tenantId: "t1", active: true },
      tenant: { id: "t1", name: "Test", slug: "test", ruc: "0010010010001", active: true },
    });
  });
});

describe("W1 — ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when not authenticated", () => {
    useAuthStore.setState({
      user: null, tenant: null, isAuthenticated: false, hydrated: true,
    });

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <ProtectedRoute>
          <div>Secret content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });

  it("renders children when authenticated without required roles", () => {
    useAuthStore.setState({
      user: { id: "1", email: "a@b.com", name: "A", role: "OWNER", tenantId: "t1", active: true },
      tenant: { id: "t1", name: "T", slug: "t", ruc: "001", active: true },
      isAuthenticated: true,
      hydrated: true,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Secret content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });

  it("renders children when role matches required roles", () => {
    useAuthStore.setState({
      user: { id: "1", email: "a@b.com", name: "A", role: "OWNER", tenantId: "t1", active: true },
      tenant: { id: "t1", name: "T", slug: "t", ruc: "001", active: true },
      isAuthenticated: true,
      hydrated: true,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requiredRoles={["OWNER", "MANAGER"]}>
          <div>Admin content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText("Admin content")).toBeInTheDocument();
  });

  it("redirects to / when role does not match", () => {
    useAuthStore.setState({
      user: { id: "1", email: "a@b.com", name: "A", role: "CASHIER", tenantId: "t1", active: true },
      tenant: { id: "t1", name: "T", slug: "t", ruc: "001", active: true },
      isAuthenticated: true,
      hydrated: true,
    });

    render(
      <MemoryRouter initialEntries={["/users"]}>
        <ProtectedRoute requiredRoles={["OWNER"]}>
          <div>Admin content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });
});

describe("W1 — AuthGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner while auth is initializing", async () => {
    useAuthStore.setState({
      user: null, tenant: null, isAuthenticated: false, hydrated: false,
    });

    vi.mocked(apiModule.hasStoredRefreshToken).mockReturnValue(true);
    vi.mocked(apiModule.refreshAccessToken).mockImplementation(
      () => new Promise(() => {}),
    );

    render(
      <TestWrapper>
        <AuthGate>
          <div>App content</div>
        </AuthGate>
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("Cargando...")).toBeInTheDocument();
    });
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
  });

  it("renders children when hydrated", () => {
    useAuthStore.setState({
      user: null, tenant: null, isAuthenticated: false, hydrated: true,
    });

    render(
      <TestWrapper>
        <AuthGate>
          <div>App content</div>
        </AuthGate>
      </TestWrapper>,
    );

    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(screen.queryByText("Cargando...")).not.toBeInTheDocument();
  });
});

describe("W1 — useLogin hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null, tenant: null, isAuthenticated: false, hydrated: false,
    });
    useTenantContext.setState({ tenant: null, resolvedFrom: null });
  });

  it("calls api.post with credentials and sets tokens on success", async () => {
    const mockResponse = {
      accessToken: "new-at",
      refreshToken: "new-rt",
      user: { id: "u1", email: "a@b.com", name: "A", role: "OWNER" as const, tenantId: "t1", active: true },
      tenant: { id: "t1", name: "T", slug: "t", ruc: "001", active: true },
    };
    vi.mocked(apiModule.api.post).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useLogin(), { wrapper: TestWrapper });

    await act(async () => {
      await result.current.mutateAsync({ email: "a@b.com", password: "123456" });
    });

    expect(vi.mocked(apiModule.api.post)).toHaveBeenCalledWith("/identity/login", {
      email: "a@b.com",
      password: "123456",
    });
    expect(vi.mocked(apiModule.setTokens)).toHaveBeenCalledWith({
      accessToken: "new-at",
      refreshToken: "new-rt",
    });
  });
});

describe("W1 — useLogout hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: "u1", email: "a@b.com", name: "A", role: "OWNER", tenantId: "t1", active: true },
      tenant: { id: "t1", name: "T", slug: "t", ruc: "001", active: true },
      isAuthenticated: true,
      hydrated: true,
    });
    useTenantContext.setState({ tenant: { id: "t1", name: "T", slug: "t", ruc: "001", active: true }, resolvedFrom: "login" });
  });

  it("clears tokens and resets auth state", () => {
    const { result } = renderHook(() => useLogout(), { wrapper: TestWrapper });

    act(() => {
      result.current();
    });

    expect(vi.mocked(apiModule.clearTokens)).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useTenantContext.getState().tenant).toBeNull();
  });
});

describe("W1 — useAuthInitialization hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null, tenant: null, isAuthenticated: false, hydrated: false,
    });
    useTenantContext.setState({ tenant: null, resolvedFrom: null });
  });

  it("returns null and logs out when no refresh token stored", async () => {
    vi.mocked(apiModule.hasStoredRefreshToken).mockReturnValue(false);

    const { result } = renderHook(() => useAuthInitialization(), { wrapper: TestWrapper });

    await waitFor(() => {
      expect(result.current.data).toBeNull();
    });
  });

  it("refreshes token and fetches user on valid refresh token", async () => {
    vi.mocked(apiModule.hasStoredRefreshToken).mockReturnValue(true);
    vi.mocked(apiModule.refreshAccessToken).mockResolvedValue("refreshed-at");
    vi.mocked(apiModule.api.get).mockResolvedValue({
      user: { id: "u1", email: "a@b.com", name: "A", role: "OWNER", tenantId: "t1", active: true },
      tenant: { id: "t1", name: "T", slug: "t", ruc: "001", active: true },
    });

    const { result } = renderHook(() => useAuthInitialization(), { wrapper: TestWrapper });

    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });
    expect(vi.mocked(apiModule.refreshAccessToken)).toHaveBeenCalled();
    expect(vi.mocked(apiModule.api.get)).toHaveBeenCalledWith("/identity/me");
  });

  it("logs out when refresh fails", async () => {
    vi.mocked(apiModule.hasStoredRefreshToken).mockReturnValue(true);
    vi.mocked(apiModule.refreshAccessToken).mockRejectedValue(new Error("Refresh failed"));

    const { result } = renderHook(() => useAuthInitialization(), { wrapper: TestWrapper });

    await waitFor(() => {
      expect(result.current.data).toBeNull();
    });
  });

  it("does not run when already hydrated", () => {
    useAuthStore.setState({ hydrated: true });
    vi.mocked(apiModule.hasStoredRefreshToken).mockReturnValue(true);

    const { result } = renderHook(() => useAuthInitialization(), { wrapper: TestWrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(vi.mocked(apiModule.refreshAccessToken)).not.toHaveBeenCalled();
  });
});
