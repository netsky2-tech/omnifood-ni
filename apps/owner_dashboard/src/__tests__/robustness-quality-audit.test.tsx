import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getApiErrorMessage } from "@/lib/api-error";
import { ApiError, onAuthExpired, notifyAuthExpired } from "@/lib/api";
import { DateRangePicker } from "@/components/date-range-picker";
import { NotFoundPage } from "@/app/not-found-page";
import { ErrorBoundary } from "@/app/error-boundary";
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
      notifyAuthExpired();
      expect(listener).toHaveBeenCalledTimes(1);
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
    it("clears React Query cache, resets auth store, and clears tenant context on logout", () => {
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
      act(() => {
        result.current();
      });

      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(["sales-data"])).toBeUndefined();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useTenantContext.getState().tenant).toBeNull();
    });
  });
});

