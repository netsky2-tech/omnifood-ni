import { render, screen, waitFor, fireEvent, renderHook, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "@/features/auth/login-page";
import { useLogin } from "@/features/auth/auth-hooks";
import { useAuthStore } from "@/features/auth/auth-store";
import { useTenantContext } from "@/lib/tenant";
import { resolveTenantSlug } from "@/lib/auth";
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

const originalLocation = window.location;

function setHostname(hostname: string) {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { hostname },
  });
}

function restoreLocation() {
  Object.defineProperty(window, "location", {
    writable: true,
    value: originalLocation,
  });
}

const loginResponse = {
  access_token: "at",
  refresh_token: "rt",
  user: { id: "u1", email: "test@test.com", name: "Test", role: "OWNER", tenantId: "t1", active: true },
  tenant: { id: "t1", name: "Test", slug: "soho", ruc: "001", active: true },
};

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

describe("W1 — resolveTenantSlug", () => {
  it.each([
    ["soho.localhost", "soho"],
    ["soho.nhilospos.com", "soho"],
    ["www.nhilospos.com", null],
    ["app.nhilospos.com", null],
    ["localhost", null],
    ["127.0.0.1", null],
    ["nhilospos.com", null],
    ["soho.nhilospos.com:8080", "soho"],
    ["SOHO.NHILOSPOS.COM", "soho"],
    ["", null],
  ])("derives slug from %s", (hostname, expected) => {
    expect(resolveTenantSlug(hostname)).toBe(expected);
  });
});

describe("W1 — LoginPage host-derived slug", () => {
  beforeEach(() => {
    setHostname("localhost");
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null, tenant: null, isAuthenticated: false, hydrated: false,
    });
    useTenantContext.setState({ tenant: null, resolvedFrom: null });
  });

  afterEach(() => {
    restoreLocation();
  });

  it("renders fail-closed notice without credentials form on localhost", () => {
    render(<LoginPage />, { wrapper: TestWrapper });

    expect(screen.getByText(/accedé desde el subdominio de tu comercio/i)).toBeInTheDocument();
    expect(screen.getByText("NHILOS POS")).toBeInTheDocument();
    expect(screen.getByText("Panel de administración")).toBeInTheDocument();
    expect(screen.queryByLabelText(/correo electrónico/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^contraseña$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tenant/i)).not.toBeInTheDocument();
  });

  it.each(["nhilospos.com", "127.0.0.1"])(
    "renders fail-closed notice without credentials form on %s",
    (hostname) => {
      setHostname(hostname);
      render(<LoginPage />, { wrapper: TestWrapper });

      expect(screen.getByText(/accedé desde el subdominio de tu comercio/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/correo electrónico/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /iniciar sesión/i })).not.toBeInTheDocument();
      expect(vi.mocked(apiModule.api.post)).not.toHaveBeenCalled();
    },
  );

  it("renders credentials form without tenant field on soho.localhost", () => {
    setHostname("soho.localhost");
    render(<LoginPage />, { wrapper: TestWrapper });

    expect(screen.queryByText(/accedé desde el subdominio/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^contraseña$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/tenant/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("mi-negocio")).not.toBeInTheDocument();
  });

  it("sends host-derived tenantSlug on submit from soho.localhost", async () => {
    setHostname("soho.localhost");
    const user = userEvent.setup();
    vi.mocked(apiModule.api.post).mockResolvedValue(loginResponse);

    render(<LoginPage />, { wrapper: TestWrapper });

    await user.type(screen.getByLabelText(/correo electrónico/i), "test@test.com");
    await user.type(screen.getByLabelText(/^contraseña$/i), "123456");
    fireEvent.submit(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(vi.mocked(apiModule.api.post)).toHaveBeenCalledWith(
        "/identity/login",
        expect.objectContaining({
          email: "test@test.com",
          pass: "123456",
          tenantSlug: "soho",
        }),
        { auth: false },
      );
    });
  });

  it("sends host-derived tenantSlug on submit from soho.nhilospos.com", async () => {
    setHostname("soho.nhilospos.com");
    const user = userEvent.setup();
    vi.mocked(apiModule.api.post).mockResolvedValue(loginResponse);

    render(<LoginPage />, { wrapper: TestWrapper });

    await user.type(screen.getByLabelText(/correo electrónico/i), "test@test.com");
    await user.type(screen.getByLabelText(/^contraseña$/i), "123456");
    fireEvent.submit(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(vi.mocked(apiModule.api.post)).toHaveBeenCalledWith(
        "/identity/login",
        expect.objectContaining({
          email: "test@test.com",
          pass: "123456",
          tenantSlug: "soho",
        }),
        { auth: false },
      );
    });
  });
});

describe("W1 — useLogin tenant slug pass-through", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null, tenant: null, isAuthenticated: false, hydrated: false,
    });
    useTenantContext.setState({ tenant: null, resolvedFrom: null });
  });

  it("sends tenantSlug to the login endpoint when provided", async () => {
    const mockResponse = {
      access_token: "new-at",
      refresh_token: "new-rt",
      user: { id: "u1", email: "a@b.com", name: "A", role: "OWNER" as const, tenantId: "t1", active: true },
      tenant: { id: "t1", name: "T", slug: "soho", ruc: "001", active: true },
    };
    vi.mocked(apiModule.api.post).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useLogin(), { wrapper: TestWrapper });

    await act(async () => {
      await result.current.mutateAsync({ email: "a@b.com", password: "123456", tenantSlug: "soho" });
    });

    expect(vi.mocked(apiModule.api.post)).toHaveBeenCalledWith(
      "/identity/login",
      {
        email: "a@b.com",
        pass: "123456",
        tenantSlug: "soho",
      },
      { auth: false },
    );
  });
});
