import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInstallKitUrl,
  createInstallToken,
  fetchLinkingCodes,
  generateLinkingCode,
  listInstallTokens,
  revokeInstallToken,
} from "@/features/onboarding/onboarding-api";
import {
  LinkingCodeStatus,
  type CreateInstallTokenResponse,
  type GenerateLinkingCodeResponse,
  type InstallTokenListItem,
  type LinkingCodeResponse,
} from "@/features/onboarding/types";
import { AddTerminalKitDialog } from "./add-terminal-kit-dialog";

vi.mock("@/lib/tenant", () => ({
  useTenantId: () => "tenant-kit-1",
  getActiveTenantId: () => "tenant-kit-1",
}));

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "https://api-staging.nhilospos.com/api",
}));

vi.mock("@/features/onboarding/onboarding-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/onboarding/onboarding-api")>();
  return {
    ...actual,
    listInstallTokens: vi.fn(),
    createInstallToken: vi.fn(),
    revokeInstallToken: vi.fn(),
    generateLinkingCode: vi.fn(),
    fetchLinkingCodes: vi.fn(),
  };
});

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const CREATED_TOKEN_FIXTURE: CreateInstallTokenResponse = {
  id: "tok-uuid-1",
  token: "nhi_plain_secret_token_abc123",
  tokenPrefix: "nhi_plai",
  label: "Kit de instalación",
  createdAt: "2026-11-19T16:00:00.000Z",
};

const ACTIVE_TOKEN_ITEM: InstallTokenListItem = {
  id: "tok-uuid-1",
  tokenPrefix: "nhi_plai",
  label: "Kit de instalación",
  createdAt: "2026-11-19T16:00:00.000Z",
  revokedAt: null,
  lastUsedAt: "2026-11-19T16:15:00.000Z",
  useCount: 3,
  active: true,
};

const LINKING_CODE_FIXTURE: GenerateLinkingCodeResponse = {
  code: "K7M9P2",
  expiresAt: new Date(Date.now() + 14 * 60 * 1000).toISOString(),
};

describe("buildInstallKitUrl", () => {
  it("strips trailing /api and /api/ and omits query when no linking code is provided", () => {
    expect(
      buildInstallKitUrl("https://api.nhilospos.com/api", "tok_abc123"),
    ).toBe("https://api.nhilospos.com/i/tok_abc123");

    expect(
      buildInstallKitUrl("https://api.nhilospos.com/api/", "tok_abc123"),
    ).toBe("https://api.nhilospos.com/i/tok_abc123");
  });

  it("appends ?code= when a linking code is provided and keeps clean origin without /api", () => {
    expect(
      buildInstallKitUrl(
        "https://api-staging.nhilospos.com/api",
        "tok_abc123",
        "A7K9M2",
      ),
    ).toBe("https://api-staging.nhilospos.com/i/tok_abc123?code=A7K9M2");

    expect(
      buildInstallKitUrl("https://api.nhilospos.com", "tok_abc123", "A7K9M2"),
    ).toBe("https://api.nhilospos.com/i/tok_abc123?code=A7K9M2");
  });

  it("handles relative /api and empty base URLs gracefully", () => {
    const relativeUrl = buildInstallKitUrl("/api", "tok_dev1", "B2C3D4");
    expect(relativeUrl).toMatch(/^https?:\/\/.+\/i\/tok_dev1\?code=B2C3D4$/);

    const emptyBaseUrl = buildInstallKitUrl("", "tok_dev2");
    expect(emptyBaseUrl).toMatch(/^https?:\/\/.+\/i\/tok_dev2$/);
  });
});

describe("AddTerminalKitDialog", () => {
  beforeEach(() => {
    vi.mocked(listInstallTokens).mockReset().mockResolvedValue([]);
    vi.mocked(createInstallToken)
      .mockReset()
      .mockResolvedValue(CREATED_TOKEN_FIXTURE);
    vi.mocked(revokeInstallToken).mockReset().mockResolvedValue(undefined);
    vi.mocked(generateLinkingCode)
      .mockReset()
      .mockResolvedValue({
        ...LINKING_CODE_FIXTURE,
        expiresAt: new Date(Date.now() + 14 * 60 * 1000).toISOString(),
      });
    vi.mocked(fetchLinkingCodes).mockReset().mockResolvedValue([]);
  });

  it("opens dialog, generates kit with QR, countdown, copy link, and manual backup code", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderWithQueryClient(
      <AddTerminalKitDialog open={true} onOpenChange={() => {}} />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Agregar terminal")).toBeInTheDocument();
    // §17.6: zero raw identifier text inputs
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("generate-install-kit-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("install-kit-active-panel")).toBeInTheDocument();
    });

    expect(createInstallToken).toHaveBeenCalledWith({
      label: "Kit de instalación",
      revokePrevious: false,
    });
    expect(generateLinkingCode).toHaveBeenCalledTimes(1);

    // QR image rendered via uqr as PNG data URL
    const qrImg = screen.getByTestId("install-kit-qr-image");
    expect(qrImg).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/png;base64,/),
    );

    // Countdown timer formatted as mm:ss
    expect(screen.getByTestId("install-kit-countdown")).toHaveTextContent(
      /^\d{2}:\d{2}$/,
    );

    // Plain 1-sentence Spanish explanation
    expect(
      screen.getByText(
        /Al escanear este QR desde el teléfono o terminal, descargará NHILOS POS y precargará el código de vinculación automáticamente\./i,
      ),
    ).toBeInTheDocument();

    // Manual backup code
    expect(screen.getByTestId("install-kit-manual-code")).toHaveTextContent(
      "K7M9P2",
    );

    // Copy link button copies the full root URL without /api
    await user.click(screen.getByTestId("install-kit-copy-url-btn"));
    expect(writeText).toHaveBeenCalledWith(
      "https://api-staging.nhilospos.com/i/nhi_plain_secret_token_abc123?code=K7M9P2",
    );

    // Copy manual code button
    await user.click(screen.getByTestId("install-kit-copy-code-btn"));
    expect(writeText).toHaveBeenCalledWith("K7M9P2");
  });

  it("shows claimed terminal status when polling detects a terminal claimed the code", async () => {
    const claimedCode: LinkingCodeResponse = {
      id: "lc-1",
      status: LinkingCodeStatus.CLAIMED,
      deviceId: "pos-caja-04",
      lastAttemptStatus: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      claimedAt: "2026-11-19T16:20:00.000Z",
      createdAt: "2026-11-19T16:18:00.000Z",
    };
    vi.mocked(fetchLinkingCodes).mockResolvedValue([claimedCode]);

    renderWithQueryClient(
      <AddTerminalKitDialog open={true} onOpenChange={() => {}} />,
    );

    const banner = await screen.findByTestId("install-kit-claimed-terminal");
    expect(banner).toHaveTextContent("pos-caja-04");
    expect(banner).toHaveTextContent(/aprobación humana/i);
  });

  it("lists active install tokens and supports revoking and rotating tokens", async () => {
    const user = userEvent.setup();
    vi.mocked(listInstallTokens).mockResolvedValue([ACTIVE_TOKEN_ITEM]);

    renderWithQueryClient(
      <AddTerminalKitDialog open={true} onOpenChange={() => {}} />,
    );

    const row = await screen.findByTestId("install-token-row");
    expect(row).toHaveTextContent("nhi_plai");
    expect(row).toHaveTextContent("3 usos");

    // Revoke token
    await user.click(within(row).getByTestId("revoke-install-token-btn"));
    await waitFor(() => {
      expect(revokeInstallToken).toHaveBeenCalledWith("tok-uuid-1");
    });

    // Rotate token
    await user.click(screen.getByTestId("rotate-install-token-btn"));
    await waitFor(() => {
      expect(createInstallToken).toHaveBeenCalledWith({
        label: "Kit de instalación",
        revokePrevious: true,
      });
    });
  });
});
