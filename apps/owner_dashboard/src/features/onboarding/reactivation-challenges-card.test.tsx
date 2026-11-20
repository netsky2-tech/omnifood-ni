import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReactivationChallengesCard } from "./reactivation-challenges-card";
import {
  approveReactivationChallenge,
  cancelReactivationChallenge,
  fetchReactivationChallenges,
} from "./onboarding-api";
import {
  ReactivationApprovalMethod,
  ReactivationChallengeStatus,
  ReactivationReason,
  type ReactivationChallenge,
} from "./types";

vi.mock("@/lib/tenant", () => ({
  useTenantId: () => "tenant-1",
  getActiveTenantId: () => "tenant-1",
}));

vi.mock("./onboarding-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./onboarding-api")>();
  return {
    ...actual,
    fetchReactivationChallenges: vi.fn(),
    approveReactivationChallenge: vi.fn(),
    cancelReactivationChallenge: vi.fn(),
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

const FUTURE_ISO = new Date(Date.now() + 12 * 60 * 1000).toISOString();

const PENDING_CHALLENGE: ReactivationChallenge = {
  id: "chal-1",
  terminalId: "pos-caja-01",
  terminalLabel: "Caja Principal",
  status: ReactivationChallengeStatus.PENDING,
  reason: ReactivationReason.REINSTALL,
  approvalMethod: null,
  latestCredentialVersion: 1,
  expiresAt: FUTURE_ISO,
  createdAt: new Date().toISOString(),
};

const APPROVED_CHALLENGE: ReactivationChallenge = {
  id: "chal-2",
  terminalId: "pos-caja-02",
  terminalLabel: "Caja Barra",
  status: ReactivationChallengeStatus.APPROVED,
  reason: ReactivationReason.REPLACED,
  approvalMethod: ReactivationApprovalMethod.DASHBOARD,
  latestCredentialVersion: 3,
  expiresAt: FUTURE_ISO,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.mocked(fetchReactivationChallenges).mockReset();
  vi.mocked(approveReactivationChallenge).mockReset();
  vi.mocked(cancelReactivationChallenge).mockReset();
});

describe("ReactivationChallengesCard", () => {
  it("renders nothing when there are no active reactivation challenges", async () => {
    vi.mocked(fetchReactivationChallenges).mockResolvedValue([]);

    renderWithQueryClient(<ReactivationChallengesCard />);

    await waitFor(() => {
      expect(fetchReactivationChallenges).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByTestId("reactivation-challenges-card"),
    ).not.toBeInTheDocument();
  });

  it("renders pending challenge details and allows 1-click approve and reject", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchReactivationChallenges).mockResolvedValue([
      PENDING_CHALLENGE,
    ]);
    vi.mocked(cancelReactivationChallenge).mockResolvedValue({
      id: "chal-1",
      tenantId: "tenant-1",
      terminalId: "pos-caja-01",
      status: ReactivationChallengeStatus.CANCELLED,
      reason: ReactivationReason.REINSTALL,
      approvalMethod: null,
      approvedByUserId: null,
      approvedAt: null,
      completedAt: null,
      previousCredentialId: "cred-1",
      previousCredentialVersion: 1,
      newCredentialId: null,
      newCredentialVersion: null,
      expiresAt: FUTURE_ISO,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderWithQueryClient(<ReactivationChallengesCard />);

    const card = await screen.findByTestId("reactivation-challenges-card");
    expect(card).toHaveTextContent("Reactivar terminal");
    expect(card).toHaveTextContent("Caja Principal");
    expect(card).toHaveTextContent("pos-caja-01");
    expect(card).toHaveTextContent("Reinstalación");
    expect(card).toHaveTextContent("v1 → v2");

    await user.click(screen.getByTestId("reject-reactivation-btn-chal-1"));

    await waitFor(() => {
      expect(cancelReactivationChallenge).toHaveBeenCalledWith("chal-1");
    });
  });

  it("displays exact approved status copy for APPROVED challenges without approve/reject buttons", async () => {
    vi.mocked(fetchReactivationChallenges).mockResolvedValue([
      APPROVED_CHALLENGE,
    ]);

    renderWithQueryClient(<ReactivationChallengesCard />);

    const approvedBanner = await screen.findByTestId(
      "reactivation-approved-status-chal-2",
    );
    expect(approvedBanner).toHaveTextContent(
      "Aprobada — el terminal completará la rotación de credencial automáticamente.",
    );
    expect(
      screen.getByTestId("reactivation-challenges-card"),
    ).toHaveTextContent("Reemplazo");
    expect(
      screen.getByTestId("reactivation-challenges-card"),
    ).toHaveTextContent("v3 → v4");
    expect(
      screen.queryByTestId("approve-reactivation-btn-chal-2"),
    ).not.toBeInTheDocument();
  });

  it("disables actions and shows permission warning when canManage is false", async () => {
    vi.mocked(fetchReactivationChallenges).mockResolvedValue([
      PENDING_CHALLENGE,
    ]);

    renderWithQueryClient(<ReactivationChallengesCard canManage={false} />);

    expect(
      await screen.findByTestId("approve-reactivation-btn-chal-1"),
    ).toBeDisabled();
    expect(screen.getByTestId("reject-reactivation-btn-chal-1")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /onboarding:activation:manage/i,
    );
  });

  it("surfaces error alert if approving a challenge fails", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchReactivationChallenges).mockResolvedValue([
      PENDING_CHALLENGE,
    ]);
    vi.mocked(approveReactivationChallenge).mockRejectedValue(
      new Error("Challenge expired"),
    );

    renderWithQueryClient(<ReactivationChallengesCard />);

    await user.click(
      await screen.findByTestId("approve-reactivation-btn-chal-1"),
    );

    expect(
      await screen.findByTestId("reactivation-challenge-error"),
    ).toHaveTextContent("Challenge expired");
  });
});
