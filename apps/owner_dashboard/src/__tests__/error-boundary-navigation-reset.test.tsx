import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/app/error-boundary";
import { AppLayout } from "@/app/layout/app-layout";
import { useAuthStore } from "@/features/auth/auth-store";
import { useTenantContext } from "@/lib/tenant";
import type { Tenant, User } from "@/types";

const FALLBACK_TEXT = "Error al cargar esta sección";

const user: User = {
  id: "u-1",
  email: "owner@example.com",
  name: "Owner",
  role: "OWNER",
  tenantId: "t-1",
  active: true,
};

const tenant: Tenant = {
  id: "t-1",
  name: "Test Tenant",
  slug: "test-tenant",
  ruc: "000-000-0000",
  active: true,
};

function BrokenChild(): never {
  throw new Error("broken child render failure");
}

function HealthyChild() {
  return <div>Sección sana</div>;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe("ErrorBoundary navigation reset", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs caught render errors through console.error; silence the
    // harness noise without weakening assertions (same approach as
    // robustness-quality-audit and chunk-reload tests).
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useAuthStore.getState().login(user, tenant);
    useTenantContext.getState().clear();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    useAuthStore.getState().logout();
    useTenantContext.getState().clear();
  });

  afterEach(() => {
    // The spy above also swallows React act() warnings (they go through
    // console.error). Fail loudly if any navigation escaped act scope so the
    // flake this suite once showed under full-suite parallelism cannot
    // silently return.
    const actWarnings = consoleErrorSpy.mock.calls.filter((args: unknown[]) =>
      args.some((a: unknown) => typeof a === "string" && a.includes("not wrapped in act")),
    );
    expect(actWarnings).toEqual([]);
  });

  it("clears the fallback when navigating to a healthy route (real AppLayout wiring)", async () => {
    const queryClient = makeQueryClient();
    const router = createMemoryRouter(
      [
        {
          element: <AppLayout />,
          children: [
            { path: "broken", element: <BrokenChild /> },
            { path: "healthy", element: <HealthyChild /> },
          ],
        },
      ],
      { initialEntries: ["/broken"] },
    );

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    // The throwing route shows the fallback.
    expect(await screen.findByText(FALLBACK_TEXT)).toBeTruthy();

    // Navigate to the healthy route WITHOUT any reload. createMemoryRouter is
    // a data router: navigate() returns a promise and the resulting state
    // updates must be flushed inside act or React warns and the update can
    // land outside the test's observation window (flake source).
    await act(async () => {
      await router.navigate("/healthy");
    });

    // The fallback must disappear and the healthy content must render.
    expect(await screen.findByText("Sección sana")).toBeTruthy();
    expect(screen.queryByText(FALLBACK_TEXT)).toBeNull();
  });

  it("clears the fallback on a query-only navigation with the same pathname (real AppLayout wiring)", async () => {
    function QueryChild() {
      const location = useLocation();
      const params = new URLSearchParams(location.search);
      if (params.get("crash") === "1") {
        throw new Error("query-only navigation crash");
      }
      return <div>Sección sana</div>;
    }

    const queryClient = makeQueryClient();
    const router = createMemoryRouter(
      [
        {
          element: <AppLayout />,
          children: [{ path: "products", element: <QueryChild /> }],
        },
      ],
      { initialEntries: ["/products?crash=1"] },
    );

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    // The throwing query shows the fallback.
    expect(await screen.findByText(FALLBACK_TEXT)).toBeTruthy();

    // Navigate to the SAME pathname with a different query string: this is the
    // gap case. A pathname-only reset key never changes here, so the fallback
    // would stay stuck and the healthy page would never render.
    // Same act discipline: the query-only navigation is a data-router
    // navigation returning a promise.
    await act(async () => {
      await router.navigate("/products");
    });

    expect(await screen.findByText("Sección sana")).toBeTruthy();
    expect(screen.queryByText(FALLBACK_TEXT)).toBeNull();
  });

  it("does NOT reset while resetKey stays the same (guards against reset loops)", async () => {
    const queryClient = makeQueryClient();
    const router = createMemoryRouter(
      [
        {
          element: <StableKeyLayout />,
          children: [
            { path: "broken", element: <BrokenChild /> },
            { path: "broken-again", element: <BrokenChild /> },
          ],
        },
      ],
      { initialEntries: ["/broken"] },
    );

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(screen.getByText(FALLBACK_TEXT)).toBeTruthy();

    // Re-render with the SAME key (different sibling throwing route),
    // flushed inside act like every other navigation in this file.
    await act(async () => {
      await router.navigate("/broken-again");
    });

    // The fallback must persist: same key means no reset.
    expect(screen.getByText(FALLBACK_TEXT)).toBeTruthy();
  });

  it("does not mask a still-broken child when resetKey changes (fallback reappears)", () => {
    function KeyedShell({ resetKey }: { resetKey: string }) {
      return (
        <ErrorBoundary resetKey={resetKey}>
          <BrokenChild />
        </ErrorBoundary>
      );
    }

    const { rerender } = render(<KeyedShell resetKey="key-a" />);
    expect(screen.getByText(FALLBACK_TEXT)).toBeTruthy();

    // Key changes: state is cleared, the child renders again and throws again,
    // so the fallback must reappear instead of silently hiding the failure.
    rerender(<KeyedShell resetKey="key-b" />);
    expect(screen.getByText(FALLBACK_TEXT)).toBeTruthy();
  });
});

/**
 * Shell-mirror helper used by the stable-key case: replicates the layout
 * structure (boundary in the layout route element, children under Outlet)
 * with a deliberately constant resetKey so sibling navigation changes the
 * location but never the key, proving no reset happens without a key change.
 */
const STABLE_RESET_KEY = "same-key";

function StableKeyLayout() {
  useLocation(); // navigation identity changes; the key intentionally does not
  return (
    <ErrorBoundary resetKey={STABLE_RESET_KEY}>
      <Outlet />
    </ErrorBoundary>
  );
}
