/**
 * Company identity parity P3, slice 1 (odd/tasks/identidad-empresa-paridad.md,
 * S5 / S5-bis) — the dashboard's logo upload must AGREE with the server.
 *
 * The cloud accepts PNG only: the single stored original has to be one every
 * consumer can use, and the terminal derives its 1-bit print raster from a
 * PNG. A client-side check that still welcomes JPEG is worse than no check —
 * the server would refuse what the UI invited. These specs pin:
 *
 *   - a JPEG file is rejected LOCALLY with an actionable message naming PNG,
 *     and no upload request is ever sent;
 *   - the card's copy never advertises JPEG (server and UI say the same
 *     thing);
 *   - a PNG file reaches the pending-confirm state and POSTs as image/png.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CompanyLogoCard } from "@/features/settings/company-logo-card";
import { setTokens, clearTokens } from "@/lib/api";

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let fetchSpy: ReturnType<typeof vi.fn>;

const mockFetchOnce = (status: number, body: unknown) => {
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
};

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "owner-jwt-test", refreshToken: "owner-refresh-test" });
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
});

describe("CompanyLogoCard — PNG-only upload gate (identidad-empresa-paridad S5/S5-bis)", () => {
  it("rejects a JPEG file locally with an actionable PNG-only message and never POSTs", async () => {
    // No stored logo: the declared-absence empty state.
    mockFetchOnce(200, null);

    render(
      <TestWrapper>
        <CompanyLogoCard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("company-logo-empty")).toBeInTheDocument();
    });

    const input = screen.getByTestId(
      "company-logo-input",
    ) as HTMLInputElement;
    const jpeg = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
      "logo.jpg",
      { type: "image/jpeg" },
    );
    fireEvent.change(input, { target: { files: [jpeg] } });

    const alert = await screen.findByTestId("company-logo-error");
    expect(alert.textContent).toMatch(/PNG/);
    expect(alert.textContent).not.toMatch(/JPEG/i);

    // The upload was refused client-side: only the logo GET ever left.
    const methods = fetchSpy.mock.calls.map(
      ([, init]) => (init as RequestInit | undefined)?.method,
    );
    expect(methods).not.toContain("POST");
  });

  it("never advertises JPEG in its copy (client and server agree on PNG only)", async () => {
    mockFetchOnce(200, null);

    render(
      <TestWrapper>
        <CompanyLogoCard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("company-logo-empty")).toBeInTheDocument();
    });

    const description = screen.getByText(/raster para tickets/);
    expect(description.textContent).toMatch(/PNG/);
    expect(description.textContent).not.toMatch(/JPEG/i);

    expect(inputAcceptsOnly(inputAccept())).toBe(true);
  });

  it("accepts a PNG file, shows the pending-confirm state, and POSTs image/png", async () => {
    const user = userEvent.setup();
    mockFetchOnce(200, null); // GET: no stored logo
    // POST: the stored logo response.
    mockFetchOnce(200, {
      sha256: "c".repeat(64),
      contentType: "image/png",
      byteLength: 70,
      base64: "iVBORw0KGgo=",
    });

    render(
      <TestWrapper>
        <CompanyLogoCard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("company-logo-empty")).toBeInTheDocument();
    });

    const input = screen.getByTestId(
      "company-logo-input",
    ) as HTMLInputElement;
    // A 1x1 PNG header is enough here: the client gate is a MIME check, the
    // STRUCTURAL decode is the server's job (and is pinned by its own specs).
    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "logo.png",
      { type: "image/png" },
    );
    fireEvent.change(input, { target: { files: [png] } });

    await waitFor(() => {
      expect(screen.getByText(/Listo para reemplazar por/)).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("company-logo-upload"));

    await waitFor(() => {
      const post = fetchSpy.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeTruthy();
      expect(JSON.parse(post?.[1]?.body as string)).toEqual({
        content_type: "image/png",
        data: expect.any(String),
      });
    });
  });
});

/** Reads the file input's `accept` attribute from the last render. */
function inputAccept(): string {
  const input = screen.getByTestId("company-logo-input") as HTMLInputElement;
  return input.getAttribute("accept") ?? "";
}

function inputAcceptsOnly(accept: string): boolean {
  const parts = accept.split(",").map((p) => p.trim());
  return parts.length === 1 && parts[0] === "image/png";
}
