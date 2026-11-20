import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReactivateDeviceModal } from "./reactivate-device-modal";
import type { TerminalDevice } from "./types";
import {
  createInstallToken,
  initiateTerminalReactivation,
  rotateTerminalRecoveryCode,
} from "@/features/onboarding/onboarding-api";
import {
  ReactivationApprovalMethod,
  ReactivationChallengeStatus,
  ReactivationReason,
} from "@/features/onboarding/types";

vi.mock("@/lib/tenant", () => ({
  useTenantId: () => "tenant-1",
  getActiveTenantId: () => "tenant-1",
}));

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "https://api.nhilos.com/api",
}));

vi.mock("@/features/menu-qr/qr-encode", () => ({
  generateMenuQrDataUrl: vi.fn(() => ({
    dataUrl: "data:image/png;base64,ZmFrZS1xcg==",
  })),
}));

vi.mock("@/features/onboarding/onboarding-api", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/onboarding/onboarding-api")
  >();
  return {
    ...actual,
    initiateTerminalReactivation: vi.fn(),
    createInstallToken: vi.fn(),
    rotateTerminalRecoveryCode: vi.fn(),
  };
});

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const DEVICE: TerminalDevice = {
  terminalId: "pos-caja-01",
  label: "Caja Principal",
  credentialId: "cred-v2",
  credentialVersion: 2,
  status: "ACTIVE",
  issuedAt: "2026-10-01T10:00:00.000Z",
  expiresAt: "2027-10-01T10:00:00.000Z",
  revokedAt: null,
  revocationReason: null,
  posBuild: "1.5.0",
  freshnessState: "COMPLETE",
  acceptedThroughSequence: 120,
  lastReceiptAt: "2026-11-19T15:00:00.000Z",
  hasDeclaredGaps: false,
  hasInventoryPending: false,
  inventoryPendingCount: 0,
  credentialHistory: [],
};

beforeEach(() => {
  vi.mocked(initiateTerminalReactivation).mockReset();
  vi.mocked(createInstallToken).mockReset();
  vi.mocked(rotateTerminalRecoveryCode).mockReset();
});

describe("ReactivateDeviceModal", () => {
  it("explains consequences before confirming (same terminalId, fiscal sequence, RETIRED, v+1)", () => {
    renderWithQueryClient(
      <ReactivateDeviceModal device={DEVICE} open onOpenChange={vi.fn()} />,
    );

    const consequences = screen.getByTestId("reactivate-consequences-alert");
    expect(consequences).toHaveTextContent("pos-caja-01");
    expect(consequences).toHaveTextContent(/consecutivo fiscal/i);
    expect(consequences).toHaveTextContent(/Reemplazada \/ RETIRED/i);
    expect(consequences).toHaveTextContent("v3");
  });

  it("triggers challenge mode (same device / reinstall) and shows approval feedback", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    vi.mocked(initiateTerminalReactivation).mockResolvedValue({
      mode: "challenge",
      terminalId: "pos-caja-01",
      challenge: {
        id: "chal-1",
        tenantId: "tenant-1",
        terminalId: "pos-caja-01",
        status: ReactivationChallengeStatus.APPROVED,
        reason: ReactivationReason.REINSTALL,
        approvalMethod: ReactivationApprovalMethod.DASHBOARD,
        approvedByUserId: "user-1",
        approvedAt: "2026-11-19T17:00:00.000Z",
        completedAt: null,
        previousCredentialId: "cred-v2",
        previousCredentialVersion: 2,
        newCredentialId: null,
        newCredentialVersion: null,
        expiresAt: "2026-11-19T17:15:00.000Z",
        createdAt: "2026-11-19T17:00:00.000Z",
        updatedAt: "2026-11-19T17:00:00.000Z",
      },
    });

    renderWithQueryClient(
      <ReactivateDeviceModal
        device={DEVICE}
        open
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    expect(
      screen.getByTestId("reactivate-mode-challenge"),
    ).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByTestId("confirm-reactivate-btn"));

    await waitFor(() => {
      expect(initiateTerminalReactivation).toHaveBeenCalledWith("pos-caja-01", {
        mode: "challenge",
        reason: "reinstall",
      });
    });

    expect(
      await screen.findByTestId("reactivate-challenge-success"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("reactivate-challenge-success"),
    ).toHaveTextContent("v3");
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("triggers factory_reset mode (replaced device), displays 6-char linking code and QR kit", async () => {
    const user = userEvent.setup();

    vi.mocked(initiateTerminalReactivation).mockResolvedValue({
      mode: "factory_reset",
      terminalId: "pos-caja-01",
      linkingCode: "AB34CD",
      expiresAt: "2026-11-19T17:30:00.000Z",
    });
    vi.mocked(createInstallToken).mockResolvedValue({
      id: "tok-1",
      token: "install-secret-token",
      tokenPrefix: "install-",
      label: "Re-vinculación pos-caja-01",
      createdAt: "2026-11-19T17:15:00.000Z",
    });

    renderWithQueryClient(
      <ReactivateDeviceModal device={DEVICE} open onOpenChange={vi.fn()} />,
    );

    await user.click(screen.getByTestId("reactivate-mode-factory-reset"));
    expect(
      screen.getByTestId("reactivate-mode-factory-reset"),
    ).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByTestId("confirm-reactivate-btn"));

    await waitFor(() => {
      expect(initiateTerminalReactivation).toHaveBeenCalledWith("pos-caja-01", {
        mode: "factory_reset",
        reason: "replaced",
      });
    });

    expect(
      await screen.findByTestId("reactivate-factory-reset-success"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("reactivate-linking-code")).toHaveTextContent(
      "AB34CD",
    );
    expect(screen.getByTestId("reactivate-kit-qr-image")).toBeInTheDocument();
    expect(screen.getByTestId("reactivate-copy-url-btn")).toBeInTheDocument();
  });

  it("still displays the 6-char linking code cleanly when install token creation fails", async () => {
    const user = userEvent.setup();

    vi.mocked(initiateTerminalReactivation).mockResolvedValue({
      mode: "factory_reset",
      terminalId: "pos-caja-01",
      linkingCode: "ZX98YQ",
      expiresAt: "2026-11-19T17:30:00.000Z",
    });
    vi.mocked(createInstallToken).mockRejectedValue(
      new Error("token quota exceeded"),
    );

    renderWithQueryClient(
      <ReactivateDeviceModal device={DEVICE} open onOpenChange={vi.fn()} />,
    );

    await user.click(screen.getByTestId("reactivate-mode-factory-reset"));
    await user.click(screen.getByTestId("confirm-reactivate-btn"));

    expect(await screen.findByTestId("reactivate-linking-code")).toHaveTextContent(
      "ZX98YQ",
    );
    expect(
      screen.queryByTestId("reactivate-kit-qr-image"),
    ).not.toBeInTheDocument();
  });

  it("generates a 6-digit backup recovery code when requested", async () => {
    const user = userEvent.setup();

    vi.mocked(rotateTerminalRecoveryCode).mockResolvedValue({
      terminalId: "pos-caja-01",
      recoveryCode: "482910",
      issuedAt: "2026-11-19T17:20:00.000Z",
    });

    renderWithQueryClient(
      <ReactivateDeviceModal device={DEVICE} open onOpenChange={vi.fn()} />,
    );

    await user.click(screen.getByTestId("generate-recovery-code-btn"));

    await waitFor(() => {
      expect(rotateTerminalRecoveryCode).toHaveBeenCalledWith("pos-caja-01");
    });

    expect(await screen.findByTestId("recovery-code-display")).toHaveTextContent(
      "482910",
    );
  });

  it("surfaces API errors when initiation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(initiateTerminalReactivation).mockRejectedValue(
      new Error("Terminal revocada no elegible"),
    );

    renderWithQueryClient(
      <ReactivateDeviceModal device={DEVICE} open onOpenChange={vi.fn()} />,
    );

    await user.click(screen.getByTestId("confirm-reactivate-btn"));

    expect(await screen.findByTestId("reactivate-submit-error")).toHaveTextContent(
      "Terminal revocada no elegible",
    );
  });
});
