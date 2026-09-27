/**
 * Inventory coverage evidence — fail-closed wire normalization (review
 * round 2, WU2/WU11 consumption).
 *
 * The COGS read model now carries `inventoryCoverage`
 * (apps/admin_backend/src/modules/inventory/dto/inventory-reports.dto.ts):
 * trust evidence for the COGS figure, independent of `salesCogsNio`. The
 * client must treat unknown statuses, absent payloads and unknown reason
 * codes as unusable (fail closed) — never as COMPLETE, and never inferred
 * from the COGS amount itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { fetchCogs } from "@/features/inventory/inventory-api";
import { normalizeInventoryCoverage } from "@/features/inventory/inventory-types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

const COMPLETE = {
  status: "COMPLETE",
  costedSalesCount: 171,
  uncostedSalesCount: 0,
  reasonCodes: [],
};

describe("normalizeInventoryCoverage", () => {
  it("accepts a valid backend coverage payload", () => {
    expect(
      normalizeInventoryCoverage({
        status: "PARTIAL",
        costedSalesCount: 100,
        uncostedSalesCount: 71,
        reasonCodes: ["NO_EXPLICIT_INSUMO_MAPPING", "MISSING_COST_BASIS"],
      }),
    ).toEqual({
      status: "PARTIAL",
      costedSalesCount: 100,
      uncostedSalesCount: 71,
      reasonCodes: ["NO_EXPLICIT_INSUMO_MAPPING", "MISSING_COST_BASIS"],
    });
  });

  it("accepts a numeric-string count as transport defensiveness (the DTO says number; the backend emits numbers)", () => {
    const coverage = normalizeInventoryCoverage({
      status: "UNAVAILABLE",
      costedSalesCount: "0",
      uncostedSalesCount: "171",
    });
    expect(coverage?.costedSalesCount).toBe(0);
    expect(coverage?.uncostedSalesCount).toBe(171);
    expect(coverage?.reasonCodes).toEqual([]);
  });

  it("fails closed on an unknown status", () => {
    expect(
      normalizeInventoryCoverage({
        status: "SOMETHING_ELSE",
        costedSalesCount: 1,
        uncostedSalesCount: 0,
      }),
    ).toBeNull();
  });

  it("fails closed on an absent or malformed payload", () => {
    expect(normalizeInventoryCoverage(null)).toBeNull();
    expect(normalizeInventoryCoverage(undefined)).toBeNull();
    expect(normalizeInventoryCoverage("COMPLETE")).toBeNull();
    expect(normalizeInventoryCoverage({ status: "COMPLETE" })).toBeNull();
  });

  it("rejects explicit null/empty-string counts instead of coercing them to 0 (finding D2)", () => {
    // Number(null) and Number("") are both 0, so a coercion-based guard turns
    // a malformed wire into "COMPLETE 0/0" — an authoritative-looking empty
    // coverage that OPENS the ratio gate. Fail closed means refusing it.
    for (const bad of [null, "", " ", NaN, Infinity, true, {}, []]) {
      const value = Number.isNaN(bad) ? NaN : bad;
      expect(normalizeInventoryCoverage({ status: "COMPLETE", costedSalesCount: value, uncostedSalesCount: 0 }), String(value)).toBeNull();
      expect(normalizeInventoryCoverage({ status: "COMPLETE", costedSalesCount: 1, uncostedSalesCount: value }), String(value)).toBeNull();
    }
  });

  it("still accepts numeric-string counts, without claiming they come from a numeric column", () => {
    const coverage = normalizeInventoryCoverage({
      status: "PARTIAL",
      costedSalesCount: "12",
      uncostedSalesCount: "3",
    });
    expect(coverage).not.toBeNull();
    expect(coverage?.costedSalesCount).toBe(12);
    expect(coverage?.uncostedSalesCount).toBe(3);
  });

  it("filters unknown reason codes instead of rendering them", () => {
    const coverage = normalizeInventoryCoverage({
      status: "PARTIAL",
      costedSalesCount: 1,
      uncostedSalesCount: 2,
      reasonCodes: ["NO_EXPLICIT_INSUMO_MAPPING", "NOT_A_REAL_CODE", 42],
    });
    expect(coverage?.reasonCodes).toEqual(["NO_EXPLICIT_INSUMO_MAPPING"]);
  });

  it("keeps ZERO_COST_BASIS — the fail-closed filter must learn the WU12 code or its note silently degrades", () => {
    const coverage = normalizeInventoryCoverage({
      status: "PARTIAL",
      costedSalesCount: 100,
      uncostedSalesCount: 71,
      reasonCodes: ["ZERO_COST_BASIS", "MISSING_COST_BASIS"],
    });
    expect(coverage?.reasonCodes).toEqual([
      "ZERO_COST_BASIS",
      "MISSING_COST_BASIS",
    ]);
  });
});

describe("fetchCogs — coverage passthrough", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes the coverage payload of the COGS report", async () => {
    vi.mocked(api.get).mockResolvedValue({
      fromDate: "2026-09-23",
      toDate: "2026-09-23",
      totalCogsNio: 18740,
      salesCogsNio: 18740,
      shrinkageCogsNio: 0,
      inventoryCoverage: { ...COMPLETE },
      generatedAt: "2026-09-23T21:54:00Z",
      items: [],
    });
    const report = await fetchCogs("2026-09-23", "2026-09-23");
    expect(report.inventoryCoverage).toEqual(COMPLETE);
    expect(report.salesCogsNio).toBe(18740);
  });

  it("degrades an unusable coverage payload to null (gate closes downstream)", async () => {
    vi.mocked(api.get).mockResolvedValue({
      fromDate: "2026-09-23",
      toDate: "2026-09-23",
      totalCogsNio: 0,
      salesCogsNio: 0,
      shrinkageCogsNio: 0,
      inventoryCoverage: { status: "GARBAGE" },
      generatedAt: "2026-09-23T21:54:00Z",
      items: [],
    });
    const report = await fetchCogs("2026-09-23", "2026-09-23");
    expect(report.inventoryCoverage).toBeNull();
  });
});
