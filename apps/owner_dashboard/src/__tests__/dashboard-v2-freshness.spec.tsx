/**
 * Dashboard V2 — sync freshness badge unit suite (PRD §20, FR-SYNC-01..05,
 * AC-08/AC-09/AC-09A visual contract, ui_wireframe_reference.md §1/§3).
 *
 * The badge is the first frontend consumer of the real
 * GET /operations/sync/freshness read model (Batch 3 endpoint): each
 * tenant-level state renders a distinct, text-labeled, color-backed indicator
 * while `generatedAt` stays separated as technical metadata (FR-SYNC-04).
 */
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FreshnessBadge } from "@/components/freshness-badge";
import {
  fetchSyncFreshness,
  normalizeSyncFreshness,
  type SyncFreshnessResponse,
} from "@/features/dashboard/dashboard-api";
import {
  SYNC_FRESHNESS_REFETCH_INTERVAL_MS,
  useSyncFreshness,
} from "@/features/dashboard/use-sync-freshness";

vi.mock("@/lib/tenant", () => ({ useTenantId: () => "tenant-1" }));

vi.mock("@/features/dashboard/dashboard-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchSyncFreshness: vi.fn(),
}));

const GENERATED_AT = "2026-09-23T21:54:00Z";

function freshnessFixture(
  overrides: Partial<SyncFreshnessResponse> = {},
): SyncFreshnessResponse {
  return {
    state: "COMPLETE",
    thresholdMinutes: 5,
    lastCompleteAt: "2026-09-23T21:52:00Z",
    perTerminal: [
      {
        terminalId: "term-1",
        label: "Caja 1",
        state: "COMPLETE",
        acceptedThroughSequence: 41,
        lastReceiptAt: "2026-09-23T21:52:30Z",
      },
    ],
    evaluatedAt: GENERATED_AT,
    ...overrides,
  };
}

describe("FreshnessBadge — COMPLETE (FR-SYNC-01)", () => {
  it("renders the green state with completeness time separated from the sync heartbeat", () => {
    render(
      <FreshnessBadge
        freshness={freshnessFixture()}
        generatedAt={GENERATED_AT}
      />,
    );

    const badge = screen.getByTestId("freshness-badge");
    expect(badge).toHaveAttribute("data-freshness-state", "COMPLETE");
    expect(badge.textContent).toContain("Datos completos hasta");
    // Two timestamps separated (wireframe §3 #2): completeness vs heartbeat.
    expect(badge.textContent).toContain("· sync ");
    // The completeness claim is derived from watermarks, not from generatedAt.
    expect(badge.textContent).not.toContain("Actualizado");
    // Technical metadata keeps its own, clearly-labeled caption (FR-SYNC-04).
    expect(screen.getByText(/Reporte generado:/)).toBeInTheDocument();
  });

  it("renders 'Datos completos' for a quiet store with no watermark times (AC-09A)", () => {
    // No sales/inventory activity for 30 minutes, checkpoints current: the
    // store remains COMPLETE — lack of business activity never produces a
    // stale claim (AC-09A), and no misleading time is invented.
    render(
      <FreshnessBadge
        freshness={freshnessFixture({
          lastCompleteAt: null,
          perTerminal: [
            {
              terminalId: "term-1",
              label: "Caja 1",
              state: "COMPLETE",
              acceptedThroughSequence: 41,
              lastReceiptAt: null,
            },
          ],
        })}
        generatedAt={GENERATED_AT}
      />,
    );

    const badge = screen.getByTestId("freshness-badge");
    expect(badge).toHaveAttribute("data-freshness-state", "COMPLETE");
    expect(badge.textContent).toContain("Datos completos");
    expect(badge.textContent).not.toContain("hasta");
    expect(badge.textContent).not.toContain("demorada");
  });
});

describe("FreshnessBadge — STALE (AC-08)", () => {
  it("renders the amber state with the server-configured threshold and complete-through time", () => {
    // All streams were complete 20 minutes ago: STALE, never COMPLETE.
    render(
      <FreshnessBadge
        freshness={freshnessFixture({
          state: "STALE",
          lastCompleteAt: "2026-09-23T21:34:00Z",
        })}
        generatedAt={GENERATED_AT}
      />,
    );

    const badge = screen.getByTestId("freshness-badge");
    expect(badge).toHaveAttribute("data-freshness-state", "STALE");
    expect(badge.textContent).toContain("Sincronización demorada (>5 min)");
    expect(badge.textContent).toContain("· hasta ");
    expect(badge.className).not.toContain("bg-emerald-500");
  });

  it("renders the threshold from the server payload, not a widget constant (FR-SYNC-03)", () => {
    render(
      <FreshnessBadge
        freshness={freshnessFixture({
          state: "STALE",
          thresholdMinutes: 10,
          lastCompleteAt: null,
        })}
      />,
    );
    expect(screen.getByTestId("freshness-badge").textContent).toContain(
      "Sincronización demorada (>10 min)",
    );
  });
});

describe("FreshnessBadge — PARTIAL (FR-SYNC-01)", () => {
  it("counts the incomplete terminals (PENDING included) in the orange state", () => {
    render(
      <FreshnessBadge
        freshness={freshnessFixture({
          state: "PARTIAL",
          lastCompleteAt: null,
          perTerminal: [
            {
              terminalId: "term-1",
              label: "Caja 1",
              state: "COMPLETE",
              acceptedThroughSequence: 41,
              lastReceiptAt: "2026-09-23T21:52:30Z",
            },
            {
              terminalId: "term-2",
              label: "Caja 2",
              state: "PARTIAL",
              acceptedThroughSequence: 12,
              lastReceiptAt: "2026-09-23T21:10:00Z",
            },
            {
              terminalId: "term-3",
              label: null,
              state: "PENDING",
              acceptedThroughSequence: null,
              lastReceiptAt: null,
            },
          ],
        })}
        generatedAt={GENERATED_AT}
      />,
    );

    const badge = screen.getByTestId("freshness-badge");
    expect(badge).toHaveAttribute("data-freshness-state", "PARTIAL");
    expect(badge.textContent).toContain(
      "Información parcial (2 terminales con datos pendientes)",
    );
  });

  it("uses singular wording for exactly one incomplete terminal", () => {
    render(
      <FreshnessBadge
        freshness={freshnessFixture({
          state: "PARTIAL",
          lastCompleteAt: null,
          perTerminal: [
            {
              terminalId: "term-1",
              label: "Caja 1",
              state: "STALE",
              acceptedThroughSequence: 3,
              lastReceiptAt: null,
            },
          ],
        })}
      />,
    );
    expect(screen.getByTestId("freshness-badge").textContent).toContain(
      "Información parcial (1 terminal con datos pendientes)",
    );
  });
});

describe("FreshnessBadge — UNKNOWN (AC-09)", () => {
  it("renders the neutral state without using generatedAt as a substitute", () => {
    render(
      <FreshnessBadge
        freshness={freshnessFixture({
          state: "UNKNOWN",
          lastCompleteAt: null,
          perTerminal: [],
        })}
        generatedAt={GENERATED_AT}
      />,
    );

    const badge = screen.getByTestId("freshness-badge");
    expect(badge).toHaveAttribute("data-freshness-state", "UNKNOWN");
    expect(badge.textContent).toContain(
      "No se puede verificar la completitud de los datos",
    );
    // FR-SYNC-04 / AC-09: generatedAt never masquerades as completeness.
    expect(badge.textContent).not.toContain("Actualizado");
    expect(badge.textContent).not.toContain("Datos completos");
  });
});

describe("FreshnessBadge — technical metadata and fallback (FR-SYNC-04)", () => {
  it("keeps the legacy 'Actualizado' fallback when no freshness data exists", () => {
    render(<FreshnessBadge generatedAt={GENERATED_AT} />);

    const badge = screen.getByTestId("freshness-badge");
    expect(badge).toHaveAttribute("data-freshness-state", "FALLBACK");
    expect(badge.textContent).toMatch(/Actualizado/);
    // The fallback must not claim any completeness state.
    expect(badge.textContent).not.toContain("Datos completos");
    expect(badge.textContent).not.toContain("Sincronización");
  });

  it("keeps the legacy fallback while the freshness query is loading", () => {
    // In-flight freshness must never fabricate a completeness claim: the
    // legacy generatedAt caption stays until real state arrives.
    render(<FreshnessBadge generatedAt={GENERATED_AT} isLoading />);

    const badge = screen.getByTestId("freshness-badge");
    expect(badge).toHaveAttribute("data-freshness-state", "FALLBACK");
    expect(badge.textContent).toMatch(/Actualizado/);
    expect(badge.textContent).not.toContain("Datos completos");
  });

  it("falls back to the em-dash placeholder when generatedAt is absent too", () => {
    render(<FreshnessBadge />);
    expect(screen.getByTestId("freshness-badge").textContent).toContain(
      "Actualizado —",
    );
    // The hardcoded 'CST' abbreviation is gone from the trust widget.
    expect(screen.getByTestId("freshness-badge").textContent).not.toContain(
      "CST",
    );
  });
});

describe("FreshnessBadge — watermark date visibility (P0 review round 2)", () => {
  // Managua (UTC-6, no DST): 2026-09-23T04:52:00Z → 22 sep, 10:52 p. m. local.
  // The owner's screenshot case: a watermark from the previous local day
  // rendered time-only next to a same-day generation time.
  const PREVIOUS_DAY_WATERMARK = "2026-09-23T04:52:00Z";
  const PREVIOUS_DAY_GENERATED_AT = "2026-09-23T23:22:00Z"; // 23 sep, 05:22 p. m.
  const INJECTED_NOW = new Date("2026-09-23T23:24:00Z"); // 23 sep, 05:24 p. m.

  it("renders the full date form for a previous-local-day watermark in the STALE branch (owner screenshot case)", () => {
    render(
      <FreshnessBadge
        freshness={freshnessFixture({
          state: "STALE",
          lastCompleteAt: PREVIOUS_DAY_WATERMARK,
        })}
        generatedAt={PREVIOUS_DAY_GENERATED_AT}
        now={INJECTED_NOW}
      />,
    );

    const badge = screen.getByTestId("freshness-badge");
    expect(badge).toHaveAttribute("data-freshness-state", "STALE");
    // Full form: day + month + time — never a bare clock time.
    expect(badge.textContent).toContain("hasta 22 sept, 10:52 p. m.");
    // No time-only claim could be misread as same-day.
    expect(badge.textContent).not.toContain("hasta 10:52");
  });

  it("renders the compact time-only form only for a watermark on the current local day", () => {
    // 21:52Z = 15:52 Managua on the injected now's local day.
    render(
      <FreshnessBadge
        freshness={freshnessFixture({ lastCompleteAt: "2026-09-23T21:52:00Z" })}
        now={INJECTED_NOW}
      />,
    );

    const badge = screen.getByTestId("freshness-badge");
    expect(badge.textContent).toContain("Datos completos hasta 03:52 p. m.");
    // Compact form only: no day/month token after 'hasta'.
    expect(badge.textContent).not.toMatch(/hasta \d{1,2} \w+/);
  });

  it("keeps the date on BOTH timestamps when the COMPLETE heartbeat crosses midnight", () => {
    // 05:58Z 09-22 → 21 sept, 11:58 p. m.; 06:01Z 09-22 → 22 sept, 12:01 a. m.;
    // injected now 12:00Z 09-23 (06:00 a. m. 23 sept) → both watermarks are
    // previous local days, so both must carry the full date form.
    render(
      <FreshnessBadge
        freshness={freshnessFixture({
          lastCompleteAt: "2026-09-22T05:58:00Z",
          perTerminal: [
            {
              terminalId: "term-1",
              label: "Caja 1",
              state: "COMPLETE",
              acceptedThroughSequence: 41,
              lastReceiptAt: "2026-09-22T06:01:00Z",
            },
          ],
        })}
        now={new Date("2026-09-23T12:00:00Z")}
      />,
    );

    const badge = screen.getByTestId("freshness-badge");
    expect(badge.textContent).toContain(
      "Datos completos hasta 21 sept, 11:58 p. m. · sync 22 sept, 12:01 a. m.",
    );
  });

  it("day-boundary behaviour is deterministic under an injected clock", () => {
    // Same watermark instant: compact before Managua midnight, full after.
    const props = {
      freshness: freshnessFixture({
        lastCompleteAt: "2026-09-23T04:52:00Z", // 22 sept 10:52 p. m. local
      }),
    };

    const before = render(
      <FreshnessBadge {...props} now={new Date("2026-09-23T04:55:00Z")} />,
    );
    // Injected now is 22 sept 10:55 p. m. local → same local day → compact.
    expect(
      before.getByTestId("freshness-badge").textContent,
    ).toContain("Datos completos hasta 10:52 p. m.");
    before.unmount();

    const nextDay = render(
      <FreshnessBadge {...props} now={new Date("2026-09-24T00:05:00Z")} />,
    );
    expect(
      nextDay.getByTestId("freshness-badge").textContent,
    ).toContain("Datos completos hasta 22 sept, 10:52 p. m.");
    nextDay.unmount();
  });

  it("never renders a time-only string that could be misread as same-day (legacy fallback)", () => {
    // The legacy generatedAt fallback gets the same treatment: a previous-day
    // generatedAt renders the full date form, and the hardcoded 'CST'
    // abbreviation is gone from the trust widget.
    render(
      <FreshnessBadge
        generatedAt={PREVIOUS_DAY_GENERATED_AT}
        now={new Date("2026-09-25T23:00:00Z")}
      />,
    );

    const badge = screen.getByTestId("freshness-badge");
    expect(badge.textContent).toContain("Actualizado 23 sept, 05:22 p. m.");
    expect(badge.textContent).not.toContain("CST");
  });

  it("formats the generatedAt caption with the same date discipline", () => {
    render(
      <FreshnessBadge
        freshness={freshnessFixture({ lastCompleteAt: PREVIOUS_DAY_WATERMARK })}
        generatedAt={PREVIOUS_DAY_GENERATED_AT}
        now={INJECTED_NOW}
      />,
    );

    // generatedAt is 23 sept local (same local day as the injected now) →
    // compact is provable; the previous-day watermark carries its date.
    expect(screen.getByText(/Reporte generado: 05:22 p\. m\./)).toBeInTheDocument();
  });
});

describe("normalizeSyncFreshness — fail-closed wire normalization", () => {
  it("keeps the backend DTO shape for a valid payload", () => {
    const raw = freshnessFixture();
    expect(normalizeSyncFreshness(raw)).toEqual(raw);
  });

  it("degrades an unrecognized state to UNKNOWN instead of COMPLETE", () => {
    const normalized = normalizeSyncFreshness(
      freshnessFixture({ state: "SORT_OF_FRESH" as never }),
    );
    expect(normalized.state).toBe("UNKNOWN");
  });

  it("defaults the threshold to the FR-SYNC-03 platform target of 5 minutes", () => {
    const missing = freshnessFixture();
    const { thresholdMinutes: _ignored, ...withoutThreshold } = missing;
    const garbage = normalizeSyncFreshness({
      ...withoutThreshold,
      thresholdMinutes: "not-a-number",
    });
    expect(garbage.thresholdMinutes).toBe(5);
    // Numeric-string wire values (Postgres numeric) are accepted.
    expect(
      normalizeSyncFreshness({ ...missing, thresholdMinutes: "15" })
        .thresholdMinutes,
    ).toBe(15);
  });

  it("normalizes terminal rows and rejects unknown terminal states", () => {
    const normalized = normalizeSyncFreshness({
      state: "PARTIAL",
      perTerminal: [
        {
          terminalId: "term-1",
          label: "Caja 1",
          state: "PENDING",
          acceptedThroughSequence: "7",
          lastReceiptAt: "2026-09-23T21:00:00Z",
        },
        { terminalId: "term-2", state: "TOTALLY_BROKEN" },
        "garbage-row",
      ],
      evaluatedAt: GENERATED_AT,
    });

    expect(normalized.perTerminal).toHaveLength(3);
    expect(normalized.perTerminal[0]).toEqual({
      terminalId: "term-1",
      label: "Caja 1",
      state: "PENDING",
      acceptedThroughSequence: 7,
      lastReceiptAt: "2026-09-23T21:00:00Z",
    });
    expect(normalized.perTerminal[1]?.state).toBe("UNKNOWN");
    expect(normalized.perTerminal[2]?.state).toBe("UNKNOWN");
  });

  it("fails closed for non-object garbage", () => {
    const normalized = normalizeSyncFreshness("nope");
    expect(normalized.state).toBe("UNKNOWN");
    expect(normalized.perTerminal).toEqual([]);
    expect(normalized.lastCompleteAt).toBeNull();
    expect(normalized.thresholdMinutes).toBe(5);
  });
});

describe("useSyncFreshness — hook wiring (FR-SYNC-05)", () => {
  function renderHookWithProviders() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let result: ReturnType<typeof useSyncFreshness> | undefined;
    function Probe() {
      result = useSyncFreshness();
      return null;
    }
    render(createElement(QueryClientProvider, { client }, createElement(Probe)));
    return { getResult: () => result, client };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches GET /operations/sync/freshness under the per-tenant query key", async () => {
    vi.mocked(fetchSyncFreshness).mockResolvedValue(freshnessFixture());

    const { getResult, client } = renderHookWithProviders();

    await waitFor(() => {
      expect(getResult()?.data).toBeDefined();
    });
    expect(getResult()?.data?.state).toBe("COMPLETE");
    expect(fetchSyncFreshness).toHaveBeenCalledTimes(1);
    const cached = client.getQueryCache().find({
      queryKey: ["sync-freshness", "tenant-1"],
    });
    expect(cached).toBeDefined();
    // FR-SYNC-05: auto-refresh cadence of 5 minutes.
    expect(SYNC_FRESHNESS_REFETCH_INTERVAL_MS).toBe(5 * 60 * 1000);
  });

  it("surfaces the failure as an absent freshness state instead of fabricating one", async () => {
    vi.mocked(fetchSyncFreshness).mockRejectedValue(new Error("offline"));

    const { getResult } = renderHookWithProviders();

    await waitFor(() => {
      expect(getResult()?.isError).toBe(true);
    });
    expect(getResult()?.data).toBeUndefined();
  });
});
