import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DevicesPage, formatCredentialLineage } from "./devices-page";
import { fetchDevices } from "./devices-api";
import type { TerminalDevice } from "./types";
import {
  approveReactivationChallenge,
  cancelReactivationChallenge,
  fetchReactivationChallenges,
} from "@/features/onboarding/onboarding-api";
import {
  ReactivationChallengeStatus,
  ReactivationReason,
  type ReactivationChallenge,
} from "@/features/onboarding/types";

vi.mock("@/lib/tenant", () => ({
  useTenantId: () => "tenant-1",
  getActiveTenantId: () => "tenant-1",
}));

vi.mock("@/features/auth/permissions", () => ({
  useCanRevokeDevice: () => true,
}));

vi.mock("./devices-api", () => ({
  fetchDevices: vi.fn(),
  revokeDevice: vi.fn(),
}));

vi.mock("@/features/onboarding/onboarding-api", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/onboarding/onboarding-api")
  >();
  return {
    ...actual,
    fetchReactivationChallenges: vi.fn(),
    approveReactivationChallenge: vi.fn(),
    cancelReactivationChallenge: vi.fn(),
    initiateTerminalReactivation: vi.fn(),
    rotateTerminalRecoveryCode: vi.fn(),
    createInstallToken: vi.fn(),
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

function makeDevice(overrides: Partial<TerminalDevice> = {}): TerminalDevice {
  return {
    terminalId: "pos-term-01",
    label: "Caja 1",
    credentialId: "cred-1",
    credentialVersion: 1,
    status: "ACTIVE",
    issuedAt: "2026-10-01T10:00:00.000Z",
    expiresAt: "2027-10-01T10:00:00.000Z",
    revokedAt: null,
    revocationReason: null,
    posBuild: "1.5.0",
    freshnessState: "COMPLETE",
    acceptedThroughSequence: 100,
    lastReceiptAt: "2026-11-19T14:00:00.000Z",
    hasDeclaredGaps: false,
    hasInventoryPending: false,
    inventoryPendingCount: 0,
    credentialHistory: [],
    ...overrides,
  };
}

const FUTURE_ISO = new Date(Date.now() + 10 * 60 * 1000).toISOString();

const PENDING_CHALLENGE: ReactivationChallenge = {
  id: "chal-pending-1",
  terminalId: "pos-term-01",
  terminalLabel: "Caja 1",
  status: ReactivationChallengeStatus.PENDING,
  reason: ReactivationReason.REINSTALL,
  approvalMethod: null,
  latestCredentialVersion: 1,
  expiresAt: FUTURE_ISO,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.mocked(fetchDevices).mockReset();
  vi.mocked(fetchReactivationChallenges).mockReset();
  vi.mocked(approveReactivationChallenge).mockReset();
  vi.mocked(cancelReactivationChallenge).mockReset();
  vi.mocked(fetchReactivationChallenges).mockResolvedValue([]);
});

describe("DevicesPage — statuses, lineage & reactivation (#566)", () => {
  it("distinguishes ACTIVE (Activa), RETIRED (Reemplazada), REVOKED (Revocada + reason), and PENDING (Pendiente)", async () => {
    vi.mocked(fetchDevices).mockResolvedValue([
      makeDevice({
        terminalId: "term-active",
        label: "Caja Activa",
        credentialId: "c-active",
        credentialVersion: 2,
        status: "ACTIVE",
        credentialHistory: [
          {
            id: "c-v1",
            version: 1,
            status: "RETIRED",
            issuedAt: "2026-10-01T14:00:00.000Z",
            rotatedAt: "2026-11-19T18:00:00.000Z",
            revokedAt: null,
            revocationReason: "reinstall",
          },
          {
            id: "c-active",
            version: 2,
            status: "ACTIVE",
            issuedAt: "2026-11-19T18:00:00.000Z",
            rotatedAt: null,
            revokedAt: null,
            revocationReason: null,
          },
        ],
      }),
      makeDevice({
        terminalId: "term-retired",
        label: "Caja Reemplazada",
        credentialId: "c-retired",
        status: "RETIRED",
        freshnessState: null,
      }),
      makeDevice({
        terminalId: "term-revoked",
        label: "Caja Revocada",
        credentialId: "c-revoked",
        status: "REVOKED",
        revokedAt: "2026-11-10T15:00:00.000Z",
        revocationReason: "Equipo extraviado",
        freshnessState: null,
      }),
      makeDevice({
        terminalId: "term-pending",
        label: "Caja Pendiente",
        credentialId: "c-pending",
        status: "PENDING",
        freshnessState: "PENDING",
      }),
    ]);

    renderWithQueryClient(<DevicesPage />);
    await screen.findByRole("table");

    const activeRow = screen.getByText("Caja Activa").closest("tr") as HTMLElement;
    expect(within(activeRow).getByText("Activa")).toBeInTheDocument();
    expect(
      within(activeRow).getByRole("button", {
        name: "Reactivar terminal term-active",
      }),
    ).toBeInTheDocument();
    const lineage = within(activeRow).getByTestId(
      "credential-lineage-term-active",
    );
    expect(lineage.textContent).toContain("v1 (Reemplazada · Reinstalación");
    expect(lineage.textContent).toContain("→ v2 (Activa");

    const retiredRow = screen
      .getByText("Caja Reemplazada")
      .closest("tr") as HTMLElement;
    expect(within(retiredRow).getByText("Reemplazada")).toBeInTheDocument();
    expect(
      within(retiredRow).getByRole("button", {
        name: "Reactivar terminal term-retired",
      }),
    ).toBeInTheDocument();
    expect(
      within(retiredRow).queryByRole("button", {
        name: "Revocar terminal term-retired",
      }),
    ).not.toBeInTheDocument();

    const revokedRow = screen
      .getByText("Caja Revocada")
      .closest("tr") as HTMLElement;
    expect(within(revokedRow).getByText("Revocada")).toBeInTheDocument();
    expect(within(revokedRow).getByText("Equipo extraviado")).toBeInTheDocument();
    expect(
      within(revokedRow).queryByRole("button", {
        name: "Reactivar terminal term-revoked",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(revokedRow).queryByRole("button", {
        name: "Revocar terminal term-revoked",
      }),
    ).not.toBeInTheDocument();

    const pendingRow = screen
      .getByText("Caja Pendiente")
      .closest("tr") as HTMLElement;
    expect(within(pendingRow).getAllByText("Pendiente").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      within(pendingRow).queryByRole("button", {
        name: "Reactivar terminal term-pending",
      }),
    ).not.toBeInTheDocument();
  });

  it("opens ReactivateDeviceModal when Reactivar is clicked on an ACTIVE terminal", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchDevices).mockResolvedValue([makeDevice()]);

    renderWithQueryClient(<DevicesPage />);
    await screen.findByRole("table");

    await user.click(
      screen.getByRole("button", { name: "Reactivar terminal pos-term-01" }),
    );

    expect(
      await screen.findByTestId("reactivate-device-modal"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("reactivate-consequences-alert"),
    ).toHaveTextContent("pos-term-01");
  });

  it("renders pending reactivation challenge alert at the top of DevicesPage and supports 1-click approve & reject", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchDevices).mockResolvedValue([makeDevice()]);
    vi.mocked(fetchReactivationChallenges).mockResolvedValue([
      PENDING_CHALLENGE,
    ]);
    vi.mocked(approveReactivationChallenge).mockResolvedValue({
      id: PENDING_CHALLENGE.id,
      tenantId: "tenant-1",
      terminalId: "pos-term-01",
      status: ReactivationChallengeStatus.APPROVED,
      reason: ReactivationReason.REINSTALL,
      approvalMethod: null,
      approvedByUserId: "user-1",
      approvedAt: new Date().toISOString(),
      completedAt: null,
      previousCredentialId: "cred-1",
      previousCredentialVersion: 1,
      newCredentialId: null,
      newCredentialVersion: null,
      expiresAt: FUTURE_ISO,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderWithQueryClient(<DevicesPage />);

    const card = await screen.findByTestId("reactivation-challenges-card");
    expect(card).toHaveTextContent("Reactivar terminal");
    expect(card).toHaveTextContent("Caja 1");
    expect(card).toHaveTextContent("Reinstalación");
    expect(card).toHaveTextContent("v1 → v2");

    await user.click(
      screen.getByTestId(`approve-reactivation-btn-${PENDING_CHALLENGE.id}`),
    );

    await waitFor(() => {
      expect(approveReactivationChallenge).toHaveBeenCalledWith(
        PENDING_CHALLENGE.id,
      );
    });
  });

  it("formats credential lineage in ascending version order", () => {
    const text = formatCredentialLineage([
      {
        id: "c2",
        version: 2,
        status: "ACTIVE",
        issuedAt: "2026-11-19T18:00:00.000Z",
        rotatedAt: null,
        revokedAt: null,
        revocationReason: null,
      },
      {
        id: "c1",
        version: 1,
        status: "RETIRED",
        issuedAt: "2026-10-01T18:00:00.000Z",
        rotatedAt: "2026-11-19T18:00:00.000Z",
        revokedAt: null,
        revocationReason: "replaced",
      },
    ]);

    expect(text).not.toBeNull();
    expect(text).toMatch(/^v1 \(Reemplazada · Reemplazo · .+ → v2 \(Activa · .+\)$/);
    expect(formatCredentialLineage([])).toBeNull();
  });
});
