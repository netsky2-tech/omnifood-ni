import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { useState, useRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  ApiError,
  onAuthExpired,
  notifyAuthExpired,
  resetAuthExpired,
  setTokens,
  clearTokens,
  api,
} from "@/lib/api";
import { DateRangePicker } from "@/components/date-range-picker";
import { NotFoundPage } from "@/app/not-found-page";
import { ErrorBoundary } from "@/app/error-boundary";
import { Sidebar } from "@/app/layout/sidebar";
import { useAuthStore } from "@/features/auth/auth-store";
import { useTenantContext } from "@/lib/tenant";
import { useLogout } from "@/features/auth/auth-hooks";

describe("Quality & Robustness Audit — Unit & Interaction Tests", () => {
  describe("API Error Strategy (getApiErrorMessage)", () => {
    it("maps 400 to validation error message", () => {
      const err = new ApiError("Validation failed", { status: 400 });
      expect(getApiErrorMessage(err)).toBe("Solicitud inválida. Verifique los datos ingresados.");
    });

    it("maps 401 to session expired message", () => {
      const err = new ApiError("Unauthorized", { status: 401 });
      expect(getApiErrorMessage(err)).toBe("Sesión expirada o no autorizada. Inicie sesión nuevamente.");
    });

    it("maps 403 to forbidden message", () => {
      const err = new ApiError("Forbidden", { status: 403 });
      expect(getApiErrorMessage(err)).toBe("No tiene permisos suficientes para realizar esta acción.");
    });

    it("maps 404 to not found message", () => {
      const err = new ApiError("Not found", { status: 404 });
      expect(getApiErrorMessage(err)).toBe("El recurso solicitado no fue encontrado o ha sido eliminado.");
    });

    it("maps 409 to duplicate conflict message", () => {
      const err = new ApiError("Conflict", { status: 409 });
      expect(getApiErrorMessage(err)).toBe("Conflicto: Ya existe un registro con este código o identificador.");
    });

    it("maps 422 to domain validation message", () => {
      const err = new ApiError("Unprocessable entity", { status: 422 });
      expect(getApiErrorMessage(err)).toBe("Error de validación. Verifique los requisitos de los campos.");
    });

    it("maps 429 to rate limit message", () => {
      const err = new ApiError("Too many requests", { status: 429 });
      expect(getApiErrorMessage(err)).toBe("Demasiadas peticiones. Por favor espere un momento antes de reintentar.");
    });

    it("maps 500 to server error message", () => {
      const err = new ApiError("Internal server error", { status: 500 });
      expect(getApiErrorMessage(err)).toBe("Error en el servidor. Por favor intente nuevamente en unos minutos.");
    });

    it("maps network connection failures gracefully", () => {
      const err = new Error("Failed to fetch");
      expect(getApiErrorMessage(err)).toBe(
        "Error de conexión. Verifique su acceso a internet o disponibilidad del servidor.",
      );
    });

    it("filters out raw JSON or technical stack traces from responseBody", () => {
      const err = new ApiError("Internal Error", {
        status: 500,
        responseBody: { message: "Error: at QueryFailedError in node_modules/typeorm" },
      });
      expect(getApiErrorMessage(err)).toBe("Error en el servidor. Por favor intente nuevamente en unos minutos.");
    });

    it("uses clean user-facing server message when informative", () => {
      const err = new ApiError("Custom business error", {
        status: 400,
        responseBody: { message: "El RUC ingresado no cumple con el formato DGI" },
      });
      expect(getApiErrorMessage(err)).toBe("El RUC ingresado no cumple con el formato DGI");
    });
  });

  describe("Session & Auth Event Bus", () => {
    beforeEach(() => {
      resetAuthExpired();
      useAuthStore.setState({
        user: { id: "u-1", name: "Admin", email: "a@a.com", role: "OWNER", tenantId: "t-1", active: true },
        tenant: { id: "t-1", name: "Test Tenant", slug: "test", ruc: "123", active: true },
        isAuthenticated: true,
        hydrated: true,
      });
    });

    it("notifies listeners when session expires", () => {
      const listener = vi.fn();
      const unsubscribe = onAuthExpired(listener);

      notifyAuthExpired();
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      resetAuthExpired();
      notifyAuthExpired();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("handles 5 simultaneous 401 requests with invalid refresh, causing a single effective session expiration transition", async () => {
      resetAuthExpired();
      const listener = vi.fn();
      const unsubscribe = onAuthExpired(listener);

      sessionStorage.setItem("oc_access_token", "expired-access-token");
      sessionStorage.setItem("oc_refresh_token", "invalid-refresh-token");

      let refreshFetchCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/identity/refresh")) {
          refreshFetchCount++;
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ message: "Invalid refresh token" }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ message: "Token expired" }),
        });
      });

      try {
        const results = await Promise.allSettled([
          api.get("/sales/report-1"),
          api.get("/sales/report-2"),
          api.get("/sales/report-3"),
          api.get("/sales/report-4"),
          api.get("/sales/report-5"),
        ]);

        expect(results.every((r) => r.status === "rejected")).toBe(true);
        expect(refreshFetchCount).toBe(1);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem("oc_access_token")).toBeNull();
        expect(sessionStorage.getItem("oc_refresh_token")).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
        unsubscribe();
        resetAuthExpired();
      }
    });

    it("does not reset authExpiredNotified when invalid or blank tokens are provided to setTokens", () => {
      const listener = vi.fn();
      onAuthExpired(listener);

      notifyAuthExpired();
      expect(listener).toHaveBeenCalledTimes(1);

      // Attempt to set invalid/empty tokens
      setTokens({ accessToken: "", refreshToken: "" });
      setTokens(null as any);
      setTokens({ accessToken: "   ", refreshToken: "valid" });

      // notifyAuthExpired must remain guarded because no verified valid session was established
      notifyAuthExpired();
      expect(listener).toHaveBeenCalledTimes(1);

      // Setting verified valid tokens resets the notification guard for future sessions
      setTokens({ accessToken: "valid-acc", refreshToken: "valid-ref" });
      notifyAuthExpired();
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("resets refreshPromise in finally so a failed refresh does not leave a rejected promise retained", async () => {
      clearTokens();
      resetAuthExpired();
      sessionStorage.setItem("oc_refresh_token", "test-refresh-token");

      let refreshAttempts = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/identity/refresh")) {
          refreshAttempts++;
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ message: "Failed refresh" }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      try {
        // First call fails refresh
        await expect(api.get("/protected-endpoint-1")).rejects.toThrow();
        expect(refreshAttempts).toBe(1);

        // Put a refresh token again to simulate a new attempt or retry
        sessionStorage.setItem("oc_refresh_token", "new-attempt-refresh-token");
        resetAuthExpired();

        // Second call must make a fresh network attempt and not reuse the previous rejected promise
        await expect(api.get("/protected-endpoint-2")).rejects.toThrow();
        expect(refreshAttempts).toBe(2);
      } finally {
        globalThis.fetch = originalFetch;
        clearTokens();
        resetAuthExpired();
      }
    });
  });

  describe("DateRangePicker Robustness", () => {
    it("corrects inverted date range when startDate is set after endDate", () => {
      const onChange = vi.fn();
      render(
        <DateRangePicker
          value={{ startDate: "2026-09-10", endDate: "2026-09-15" }}
          onChange={onChange}
        />,
      );

      // Open picker
      fireEvent.click(screen.getByRole("button", { name: /seleccionar rango de fechas/i }));

      // Set startDate to 2026-09-20 (after endDate)
      const startInput = screen.getByLabelText("Fecha inicio");
      fireEvent.change(startInput, { target: { value: "2026-09-20" } });

      expect(onChange).toHaveBeenCalledWith({
        startDate: "2026-09-20",
        endDate: "2026-09-20",
      });
    });

    it("corrects inverted date range when endDate is set before startDate", () => {
      const onChange = vi.fn();
      render(
        <DateRangePicker
          value={{ startDate: "2026-09-10", endDate: "2026-09-15" }}
          onChange={onChange}
        />,
      );

      // Open picker
      fireEvent.click(screen.getByRole("button", { name: /seleccionar rango de fechas/i }));

      // Set endDate to 2026-09-05 (before startDate)
      const endInput = screen.getByLabelText("Fecha fin");
      fireEvent.change(endInput, { target: { value: "2026-09-05" } });

      expect(onChange).toHaveBeenCalledWith({
        startDate: "2026-09-05",
        endDate: "2026-09-05",
      });
    });

    it("closes popover when Escape key is pressed", () => {
      render(
        <DateRangePicker
          value={{ startDate: "2026-09-10", endDate: "2026-09-15" }}
          onChange={vi.fn()}
        />,
      );

      // Open picker
      const trigger = screen.getByRole("button", { name: /seleccionar rango de fechas/i });
      fireEvent.click(trigger);
      expect(screen.getByText("Periodos Rápidos")).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByText("Periodos Rápidos")).not.toBeInTheDocument();
    });
  });

  describe("404 Route & NotFoundPage", () => {
    it("renders explicit 404 page with navigation action back to dashboard", () => {
      render(
        <MemoryRouter>
          <NotFoundPage />
        </MemoryRouter>,
      );

      expect(screen.getByText("Página no encontrada")).toBeInTheDocument();
      expect(
        screen.getByText(/La ruta que intenta acceder no existe/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /volver al dashboard/i })).toHaveAttribute(
        "href",
        "/",
      );
    });
  });

  describe("ErrorBoundary Resilience", () => {
    const ProblemChild = ({ shouldThrow }: { shouldThrow: boolean }) => {
      if (shouldThrow) {
        throw new Error("Simulated rendering failure");
      }
      return <div>Contenido sano</div>;
    };

    it("catches render exception and displays recovery UI without crashing app", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { rerender } = render(
        <ErrorBoundary>
          <ProblemChild shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText("Error al cargar esta sección")).toBeInTheDocument();
      expect(screen.getByText("Simulated rendering failure")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /recargar página/i })).toBeInTheDocument();

      // Resolve underlying error condition and click Reintentar
      rerender(
        <ErrorBoundary>
          <ProblemChild shouldThrow={false} />
        </ErrorBoundary>,
      );
      fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));

      expect(screen.getByText("Contenido sano")).toBeInTheDocument();
      consoleSpy.mockRestore();
    });
  });

  describe("useLogout Cache Purge & Cross-Tenant Safety", () => {
    it("clears React Query cache, resets auth store, and clears tenant context on logout", async () => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(["sales-data"], { revenue: 15000 });
      expect(queryClient.getQueryData(["sales-data"])).toEqual({ revenue: 15000 });

      const clearSpy = vi.spyOn(queryClient, "clear");

      useAuthStore.setState({
        user: { id: "u-1", name: "User", email: "u@u.com", role: "OWNER", tenantId: "t-1", active: true },
        tenant: { id: "t-1", name: "Tenant A", slug: "tenant-a", ruc: "J01", active: true },
        isAuthenticated: true,
      });
      useTenantContext.setState({
        tenant: { id: "t-1", name: "Tenant A", slug: "tenant-a", ruc: "J01", active: true },
        resolvedFrom: "login",
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useLogout(), { wrapper });
      await act(async () => {
        await result.current();
      });

      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(["sales-data"])).toBeUndefined();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useTenantContext.getState().tenant).toBeNull();
    });

    it("cancels in-flight queries before clear and prevents stale responses from rehydrating cache after logout", async () => {
      const queryClient = new QueryClient();
      const cancelSpy = vi.spyOn(queryClient, "cancelQueries");
      const clearSpy = vi.spyOn(queryClient, "clear");

      let resolveInFlight: (data: unknown) => void;
      const inFlightPromise = new Promise((resolve) => {
        resolveInFlight = resolve;
      });

      // Active query initiated during old session
      const activeQueryPromise = queryClient.fetchQuery({
        queryKey: ["tenant-confidential-report"],
        queryFn: () => inFlightPromise,
      });
      activeQueryPromise.catch(() => {});

      expect(queryClient.isFetching({ queryKey: ["tenant-confidential-report"] })).toBe(1);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useLogout(), { wrapper });
      await act(async () => {
        await result.current();
      });

      // Must cancel queries before clearing cache
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy.mock.invocationCallOrder[0]!).toBeLessThan(clearSpy.mock.invocationCallOrder[0]!);

      // In-flight response from old session finally resolves after logout
      resolveInFlight!({ secret: "TENANT_A_CONFIDENTIAL_PAYLOAD" });
      await activeQueryPromise.catch(() => {});

      // Regression check: query cache must remain empty, never rehydrated with previous session data
      expect(queryClient.getQueryData(["tenant-confidential-report"])).toBeUndefined();
      expect(queryClient.getQueryState(["tenant-confidential-report"])).toBeUndefined();
    });

    it("strictly awaits cancelQueries completion before purging the QueryClient cache", async () => {
      const queryClient = new QueryClient();
      let resolveCancel: () => void;
      const cancelPromise = new Promise<void>((res) => {
        resolveCancel = res;
      });

      let clearCalled = false;
      vi.spyOn(queryClient, "cancelQueries").mockImplementation(() => cancelPromise);
      vi.spyOn(queryClient, "clear").mockImplementation(() => {
        clearCalled = true;
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useLogout(), { wrapper });
      let logoutPromise!: Promise<void>;
      act(() => {
        logoutPromise = result.current();
      });

      // At this point cancelQueries is pending, so clear MUST NOT have been called yet
      expect(clearCalled).toBe(false);

      // Resolve cancelQueries
      await act(async () => {
        resolveCancel!();
        await logoutPromise;
      });

      // Now clear has been called
      expect(clearCalled).toBe(true);
    });
  });

  describe("Aggressive Double Submit Prevention", () => {
    it("blocks rapid concurrent form submissions using synchronous lock and invokes mutation exactly once", async () => {
      let resolveMutation: (val: unknown) => void;
      const deferredMutation = new Promise((resolve) => {
        resolveMutation = resolve;
      });

      const mockMutateAsync = vi.fn().mockReturnValue(deferredMutation);

      // Render a form using the synchronous isSubmittingRef lock pattern
      const TestForm = () => {
        const isSubmittingRef = useRef(false);
        const [isPending, setIsPending] = useState(false);

        const handleSubmit = async (e: React.FormEvent) => {
          e.preventDefault();
          if (isPending || isSubmittingRef.current) return;
          isSubmittingRef.current = true;
          setIsPending(true);
          try {
            await mockMutateAsync({ name: "Producto Test" });
          } finally {
            isSubmittingRef.current = false;
            setIsPending(false);
          }
        };

        return (
          <form onSubmit={handleSubmit} data-testid="test-form">
            <input name="name" defaultValue="Producto Test" />
            <button type="submit" disabled={isPending} data-testid="submit-btn">
              Guardar
            </button>
          </form>
        );
      };

      render(<TestForm />);
      const form = screen.getByTestId("test-form");
      const button = screen.getByTestId("submit-btn");

      // AGGRESSIVE SUBMISSION BURST:
      // Trigger multiple synthetic submit events and button clicks synchronously
      // in the same tick before React re-renders with isPending: true
      fireEvent.submit(form);
      fireEvent.submit(form);
      fireEvent.click(button);
      fireEvent.submit(form);

      // Mutation must only be initiated ONCE despite 4 concurrent attempts
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);

      // Resolve in-flight mutation
      await act(async () => {
        resolveMutation!({ id: "p-1", name: "Producto Test" });
        await deferredMutation;
      });

      // Remains called only once
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe("Accessibility — Accessible Names vs title Attribute", () => {
    it("ensures collapsed sidebar links provide accessible names via aria-label, not relying solely on title", () => {
      const queryClient = new QueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Sidebar />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const links = screen.getAllByRole("link");
      expect(links.length).toBeGreaterThan(0);

      // Every link must have an explicit aria-label for assistive tech
      for (const link of links) {
        expect(link).toHaveAttribute("aria-label");
        expect(link.getAttribute("aria-label")).toBeTruthy();
      }
    });

    it("ensures icon buttons provide accessible names and decorative SVG icons have aria-hidden", () => {
      const queryClient = new QueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Sidebar />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const allButtons = screen.getAllByRole("button");
      expect(allButtons.length).toBeGreaterThan(0);

      for (const btn of allButtons) {
        const hasVisibleText = (btn.textContent?.trim().length ?? 0) > 0 && btn.textContent?.trim() !== "N";
        const hasAriaLabel = !!btn.getAttribute("aria-label");
        expect(hasVisibleText || hasAriaLabel).toBe(true);
      }
    });
  });
});

