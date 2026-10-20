/**
 * The tenant's supervision policy, in the backoffice.
 *
 * These specs pin the three things the card must never get wrong:
 *
 *  - it tells the owner what "sin definir" MEANS (the default its
 *    terminals are living with), instead of hiding it behind a sentinel;
 *  - it refuses to let the owner save a configuration that would make the
 *    shift close impossible (the dead end that strands a till at 6pm);
 *  - it says the honest thing about delivery: the terminals apply the
 *    policy on their next sync, not instantly.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SupervisionPolicyCard } from "@/features/supervision/supervision-policy-card";
import { useAuthStore } from "@/features/auth/auth-store";
import { setTokens, clearTokens } from "@/lib/api";

function renderCard() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <SupervisionPolicyCard />
    </QueryClientProvider>,
  );
}

const defaultPolicy = {
  authorizingRoles: ["MANAGER", "OWNER"],
  selfAuthorizationAllowedCloseBox: true,
  selfAuthorizationAllowedCashDrawer: true,
  selfAuthorizationAllowedManualDiscount: true,
  supervisorRequiredForModifierQuantity: false,
};

const policyResponse = (overrides: Record<string, unknown> = {}) => ({
  policy: null,
  defaultPolicy,
  configured: false,
  operationMode: "FOODPARK_QSR",
  validation: { errors: [], warnings: [] },
  configVersion: { revision: 3, fingerprint: "fp-3" },
  ...overrides,
});

let fetchSpy: ReturnType<typeof vi.fn>;

const mockPolicy = (body: unknown, status = 200) => {
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
};

function setRole(role: "OWNER" | "MANAGER" | "CASHIER") {
  useAuthStore.setState({
    user: {
      id: "u-1",
      name: "Operador",
      role,
      email: "op@test.ni",
      active: true,
      tenantId: "tenant-1",
    },
    tenant: { id: "tenant-1", name: "Test" } as never,
    isAuthenticated: true,
    hydrated: true,
  });
}

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "jwt-test", refreshToken: "refresh-test" });
  setRole("OWNER");
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
});

describe("SupervisionPolicyCard", () => {
  it("explains what the terminals are applying while the policy is undefined", async () => {
    mockPolicy(policyResponse());

    renderCard();

    expect(
      await screen.findByTestId("supervision-policy-card"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sin definir/i)).toBeInTheDocument();
    // The default is a NAMED value, not a hidden one.
    expect(screen.getByText(/Food Park \/ QSR/)).toBeInTheDocument();
  });

  it("does not render for a user without the permission (no placeholder, no tab)", async () => {
    setRole("CASHIER");
    mockPolicy(policyResponse());

    const { container } = renderCard();

    await waitFor(() => expect(fetchSpy).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("warns before it blocks: an empty authorizer set with the close box off is refused", async () => {
    mockPolicy(
      policyResponse({
        policy: {
          authorizingRoles: ["MANAGER", "OWNER"],
          selfAuthorizationAllowedCloseBox: true,
          selfAuthorizationAllowedCashDrawer: true,
          selfAuthorizationAllowedManualDiscount: true,
          supervisorRequiredForModifierQuantity: false,
        },
        configured: true,
      }),
    );

    renderCard();

    await screen.findByTestId("supervision-policy-card");

    // Remove every authorizing role and turn the close box off: the shift
    // close would become impossible — the till would be stuck at 6pm.
    await userEvent.click(screen.getByLabelText("Dueño"));
    await userEvent.click(screen.getByLabelText("Gerente"));
    await userEvent.click(screen.getByLabelText("Cerrar el turno (Corte Z)"));

    const error = await screen.findByTestId("supervision-invariant-error");
    expect(error).toHaveTextContent(/corte de caja quedaría imposible/i);
    expect(screen.getByTestId("supervision-save-button")).toBeDisabled();
  });

  it("warns (without blocking) when no discount could ever be authorized", async () => {
    mockPolicy(
      policyResponse({
        policy: {
          authorizingRoles: [],
          selfAuthorizationAllowedCloseBox: true,
          selfAuthorizationAllowedCashDrawer: true,
          selfAuthorizationAllowedManualDiscount: false,
          supervisorRequiredForModifierQuantity: false,
        },
        configured: true,
      }),
    );

    renderCard();

    const warning = await screen.findByTestId("supervision-invariant-warning");
    expect(warning).toHaveTextContent(/descuento manual/i);
    expect(screen.queryByTestId("supervision-invariant-error")).toBeNull();
  });

  it("says the honest thing about delivery: the terminals apply it on their next sync", async () => {
    mockPolicy(policyResponse());

    renderCard();

    await screen.findByTestId("supervision-policy-card");
    expect(screen.getByText(/próxima sincronización/i)).toBeInTheDocument();
  });

  it("saves the whole policy and reports the new state", async () => {
    mockPolicy(policyResponse());
    renderCard();
    await screen.findByTestId("supervision-policy-card");

    mockPolicy(policyResponse({ configured: true }), 200);
    await userEvent.click(screen.getByLabelText("Mesero"));
    await userEvent.click(screen.getByTestId("supervision-save-button"));

    await waitFor(() => {
      const putCall = fetchSpy.mock.calls.find(
        (call) => call[1]?.method === "PUT" || call[0] === "/supervision/policy",
      );
      expect(putCall).toBeTruthy();
    });

    const body = fetchSpy.mock.calls
      .map((call) => call[1]?.body)
      .find((candidate) => typeof candidate === "string");
    expect(JSON.parse(String(body))).toEqual({
      authorizingRoles: ["MANAGER", "OWNER", "WAITER"],
      selfAuthorizationAllowedCloseBox: true,
      selfAuthorizationAllowedCashDrawer: true,
      selfAuthorizationAllowedManualDiscount: true,
      supervisorRequiredForModifierQuantity: false,
    });
  });

  it("offers an explicit reset back to the mode default", async () => {
    mockPolicy(
      policyResponse({
        configured: true,
        policy: defaultPolicy,
      }),
    );

    renderCard();
    await screen.findByTestId("supervision-policy-card");

    await userEvent.click(screen.getByTestId("supervision-reset-button"));
    expect(await screen.findByText(/¿Restablecer la política\?/)).toBeInTheDocument();

    mockPolicy(policyResponse(), 200);
    fireEvent.click(screen.getByTestId("supervision-reset-confirm"));

    await waitFor(() => {
      const deleteCall = fetchSpy.mock.calls.find(
        (call) => call[1]?.method === "DELETE",
      );
      expect(deleteCall).toBeTruthy();
    });
  });

  it("explains a failed load without pretending the business is broken", async () => {
    mockPolicy({ message: "boom" }, 500);

    renderCard();

    const error = await screen.findByTestId("supervision-error");
    expect(error).toHaveTextContent(/siguen funcionando/i);
  });
});
