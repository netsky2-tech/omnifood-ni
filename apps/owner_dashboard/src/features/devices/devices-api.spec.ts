import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { api } from "@/lib/api";
import { fetchDevices, normalizeTerminalDevice } from "./devices-api";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

const validRow = {
  terminalId: "fp-ca-01",
  label: "Caja 1",
  credentialId: "cred-abc",
  credentialVersion: 2,
  status: "ACTIVE",
  issuedAt: "2025-01-01T00:00:00.000Z",
  expiresAt: "2026-01-01T00:00:00.000Z",
  revokedAt: null,
  revocationReason: null,
  posBuild: "1.4.2",
  freshnessState: "COMPLETE",
  acceptedThroughSequence: 42,
  lastReceiptAt: "2025-06-01T12:00:00.000Z",
  hasDeclaredGaps: false,
  hasInventoryPending: true,
  inventoryPendingCount: 7,
};

describe("normalizeTerminalDevice", () => {
  it("normalizes a valid payload unchanged", () => {
    expect(normalizeTerminalDevice(validRow)).toEqual(validRow);
  });

  it("handles null and undefined input with safe defaults", () => {
    for (const input of [null, undefined]) {
      expect(normalizeTerminalDevice(input)).toEqual({
        terminalId: "",
        label: null,
        credentialId: "",
        credentialVersion: 0,
        status: "PENDING",
        issuedAt: "",
        expiresAt: "",
        revokedAt: null,
        revocationReason: null,
        posBuild: null,
        freshnessState: "UNKNOWN",
        acceptedThroughSequence: null,
        lastReceiptAt: null,
        hasDeclaredGaps: false,
        hasInventoryPending: false,
        inventoryPendingCount: 0,
      });
    }
  });

  it("fails closed on unrecognized status values", () => {
    expect(normalizeTerminalDevice({ ...validRow, status: "HACKED" }).status).toBe("PENDING");
    expect(normalizeTerminalDevice({ ...validRow, status: 123 }).status).toBe("PENDING");
  });

  it("maps freshness wire values and falls back to UNKNOWN", () => {
    expect(normalizeTerminalDevice({ ...validRow, freshnessState: null }).freshnessState).toBeNull();
    expect(normalizeTerminalDevice({ ...validRow, freshnessState: "STALE" }).freshnessState).toBe("STALE");
    expect(normalizeTerminalDevice({ ...validRow, freshnessState: "GARBAGE" }).freshnessState).toBe("UNKNOWN");
    expect(normalizeTerminalDevice({ ...validRow, freshnessState: 99 }).freshnessState).toBe("UNKNOWN");
  });

  it("falls back to null for malformed numbers", () => {
    const row = normalizeTerminalDevice({
      ...validRow,
      acceptedThroughSequence: "42",
    });
    expect(row.acceptedThroughSequence).toBeNull();
  });

  it("falls back to 0 for malformed credentialVersion and inventoryPendingCount", () => {
    const row = normalizeTerminalDevice({
      ...validRow,
      credentialVersion: "two",
      inventoryPendingCount: Number.NaN,
    });
    expect(row.credentialVersion).toBe(0);
    expect(row.inventoryPendingCount).toBe(0);
  });

  it("falls back to empty strings for malformed required strings", () => {
    const row = normalizeTerminalDevice({
      ...validRow,
      terminalId: 99,
      credentialId: null,
      issuedAt: {},
    });
    expect(row.terminalId).toBe("");
    expect(row.credentialId).toBe("");
    expect(row.issuedAt).toBe("");
  });

  it("coerces booleans strictly (only true is true)", () => {
    const row = normalizeTerminalDevice({
      ...validRow,
      hasDeclaredGaps: "true",
      hasInventoryPending: 1,
    });
    expect(row.hasDeclaredGaps).toBe(false);
    expect(row.hasInventoryPending).toBe(false);
  });

  it("drops non-string optional strings to null", () => {
    const row = normalizeTerminalDevice({
      ...validRow,
      label: 5,
      revokedAt: true,
      revocationReason: [],
      posBuild: "",
      lastReceiptAt: undefined,
    });
    expect(row.label).toBeNull();
    expect(row.revokedAt).toBeNull();
    expect(row.revocationReason).toBeNull();
    expect(row.posBuild).toBeNull();
    expect(row.lastReceiptAt).toBeNull();
  });
});

describe("fetchDevices", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the terminals endpoint and normalizes rows", async () => {
    vi.mocked(api.get).mockResolvedValue([validRow]);
    const devices = await fetchDevices();
    expect(api.get).toHaveBeenCalledWith("/identity/device-sync/terminals", undefined);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual(validRow);
  });

  it("forwards the abort signal", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const controller = new AbortController();
    await fetchDevices({ signal: controller.signal });
    expect(api.get).toHaveBeenCalledWith("/identity/device-sync/terminals", {
      signal: controller.signal,
    });
  });

  it("returns an empty list for a non-array payload", async () => {
    vi.mocked(api.get).mockResolvedValue({ devices: [validRow] });
    await expect(fetchDevices()).resolves.toEqual([]);
  });

  it("normalizes malformed rows instead of throwing", async () => {
    vi.mocked(api.get).mockResolvedValue([null, validRow]);
    const devices = await fetchDevices();
    expect(devices).toHaveLength(2);
    expect(devices[0].status).toBe("PENDING");
    expect(devices[1]).toEqual(validRow);
  });

  it("propagates API errors", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));
    await expect(fetchDevices()).rejects.toThrow("boom");
  });
});
