/**
 * B17-04 Task 5 — RevokeDeviceModal unit, form sanitization & a11y suite.
 *
 * Covers the destructive revocation dialog for POST /identity/device-sync
 * revocation: operational warning, sanitized form (Zod via zodResolver with
 * noValidate so Spanish literal copy is authoritative — NHILoS §18.2/§18.3),
 * exact "REVOCAR" keyword gate, and server-error surfacing through the shared
 * API error mapper (§30: destructive actions are never silent).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RevokeDeviceModal } from "./revoke-device-modal";
import type { TerminalDevice } from "./types";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  error: null as unknown,
}));

vi.mock("./use-devices", () => ({
  // Task contract shape: isPending/error are observed by the component;
  // the component submits through mutate (not mutateAsync), so both are
  // provided and the mutation call is asserted on `mutate`.
  useRevokeDevice: () => ({
    mutate: mocks.mutate,
    mutateAsync: mocks.mutateAsync,
    isPending: false,
    error: mocks.error,
  }),
}));

const DEVICE: TerminalDevice = {
  terminalId: "pos-term-01",
  label: "Caja Principal",
  credentialId: "cred-1",
  credentialVersion: 1,
  status: "ACTIVE",
  issuedAt: "2026-09-01T10:00:00Z",
  expiresAt: "2027-09-01T10:00:00Z",
  revokedAt: null,
  revocationReason: null,
  posBuild: "1.2.3",
  freshnessState: "COMPLETE",
  acceptedThroughSequence: 42,
  lastReceiptAt: "2026-10-10T12:00:00Z",
  hasDeclaredGaps: false,
  hasInventoryPending: false,
  inventoryPendingCount: 0,
};

function renderModal() {
  return render(
    <RevokeDeviceModal device={DEVICE} open onOpenChange={vi.fn()} />,
  );
}

async function submit() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Confirmar revocación" }),
  );
  return user;
}

beforeEach(() => {
  mocks.mutate.mockClear();
  mocks.mutateAsync.mockClear();
  mocks.error = null;
});

describe("RevokeDeviceModal — dialog structure", () => {
  it("renders the dialog with the operational warning, terminal details and input fields", () => {
    renderModal();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("Revocar credencial de terminal"),
    ).toBeInTheDocument();

    // Terminal details in the description (§29: real terminal identity).
    expect(screen.getByText(/pos-term-01/)).toBeInTheDocument();
    expect(screen.getByText(/Caja Principal/)).toBeInTheDocument();

    // §46/§30: the operational consequence is a labeled alert, not color-only.
    expect(
      screen.getByText("Advertencia operativa crítica"),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Motivo de revocación"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Confirmación requerida"),
    ).toBeInTheDocument();
  });
});

describe("RevokeDeviceModal — form sanitization", () => {
  it("rejects an empty reason with the Spanish literal error", async () => {
    renderModal();

    await submit();

    expect(
      await screen.findByText("El motivo de revocación es obligatorio."),
    ).toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only reason as empty", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(
      screen.getByLabelText("Motivo de revocación"),
      "   ",
    );
    await user.type(
      screen.getByLabelText("Confirmación requerida"),
      "REVOCAR",
    );
    await submit();

    expect(
      await screen.findByText("El motivo de revocación es obligatorio."),
    ).toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("rejects a lowercase confirmation keyword mismatch", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(
      screen.getByLabelText("Motivo de revocación"),
      "Terminal rota",
    );
    await user.type(
      screen.getByLabelText("Confirmación requerida"),
      "revocar",
    );
    await submit();

    expect(
      await screen.findByText(
        'Debe escribir exactamente "REVOCAR" para confirmar.',
      ),
    ).toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("submits the credentialId and trimmed reason on a valid form", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(
      screen.getByLabelText("Motivo de revocación"),
      "Terminal dañada en turno",
    );
    await user.type(
      screen.getByLabelText("Confirmación requerida"),
      "REVOCAR",
    );
    await submit();

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).toHaveBeenCalledWith(
      { credentialId: "cred-1", reason: "Terminal dañada en turno" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});

describe("RevokeDeviceModal — server error banner", () => {
  it("renders the error alert with the Spanish fallback message on mutation failure", () => {
    // Truthy but unstructured error: getApiErrorMessage must fall back to
    // the Spanish literal instead of leaking internals (§30).
    mocks.error = { code: "INTERNAL" };

    renderModal();

    expect(
      screen.getByText("No se pudo revocar la terminal."),
    ).toBeInTheDocument();
  });
});
