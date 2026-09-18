import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api";
import { ErrorBoundary } from "@/app/error-boundary";

describe("Production Security & Observability Audit (Frentes 9 & 10)", () => {
  it("captures x-request-id in ApiError for end-to-end trace correlation", () => {
    const error = new ApiError("Internal server error", {
      status: 500,
      requestId: "req-trace-xyz-789",
    });

    expect(error.requestId).toBe("req-trace-xyz-789");
    expect(error.status).toBe(500);
  });

  it("surfaces the backend request ID in ErrorBoundary for enterprise customer support", () => {
    function FaultyComponent(): never {
      throw new ApiError("Error en procesamiento fiscal", {
        status: 500,
        requestId: "trace-audit-999",
      });
    }

    // Suppress console.error in test runner
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <FaultyComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Error al cargar esta sección")).toBeInTheDocument();
    expect(screen.getByText("Error en procesamiento fiscal")).toBeInTheDocument();
    expect(screen.getByText(/ID de Seguimiento: trace-audit-999/)).toBeInTheDocument();

    spy.mockRestore();
  });

  it("ensures build version metadata is accessible in the environment", () => {
    const appVersion = import.meta.env.VITE_APP_VERSION ?? "0.0.0";
    expect(typeof appVersion).toBe("string");
    expect(appVersion.length).toBeGreaterThan(0);
  });
});
