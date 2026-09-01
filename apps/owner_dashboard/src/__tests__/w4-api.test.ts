import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { setTokens, clearTokens } from "@/lib/api";
import {
  fetchMonthlyFiscalSummary,
  fetchVoidedInvoices,
  fetchSequenceAudit,
  fetchSalesBookExport,
  fetchZReportsExport,
} from "@/features/fiscal/fiscal-api";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "test-access-token", refreshToken: "test-refresh-token" });
});

afterEach(() => {
  clearTokens();
});

function mockFetchSuccess(body: unknown) {
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockFetchError(status: number, message?: string) {
  fetchSpy.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ message: message ?? `Error ${status}` }),
      { status, headers: { "Content-Type": "application/json" } },
    ),
  );
}

describe("W4 API Layer — fiscal-api.ts", () => {
  describe("fetchMonthlyFiscalSummary", () => {
    it("calls correct URL with year and month", async () => {
      mockFetchSuccess({ year: 2026, month: 8 });
      await fetchMonthlyFiscalSummary(2026, 8);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/sales/reports/fiscal/monthly-summary?year=2026&month=8",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-access-token",
          }),
        }),
      );
    });

    it("calls URL without params when none provided", async () => {
      mockFetchSuccess({ year: 2026, month: 9 });
      await fetchMonthlyFiscalSummary();
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/sales/reports/fiscal/monthly-summary",
        expect.anything(),
      );
    });

    it("returns parsed response", async () => {
      const mockData = { year: 2026, month: 8, totalGrossSales: 5000 };
      mockFetchSuccess(mockData);
      const result = await fetchMonthlyFiscalSummary(2026, 8);
      expect(result).toEqual(mockData);
    });
  });

  describe("fetchVoidedInvoices", () => {
    it("calls correct URL with date range", async () => {
      mockFetchSuccess({ totalVoidedCount: 0 });
      await fetchVoidedInvoices("2026-08-01", "2026-08-31");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/sales/reports/fiscal/voided-invoices?startDate=2026-08-01&endDate=2026-08-31",
        expect.anything(),
      );
    });

    it("calls URL without params when none provided", async () => {
      mockFetchSuccess({ totalVoidedCount: 0 });
      await fetchVoidedInvoices();
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/sales/reports/fiscal/voided-invoices",
        expect.anything(),
      );
    });
  });

  describe("fetchSequenceAudit", () => {
    it("calls correct URL with all params", async () => {
      mockFetchSuccess({ hasGaps: false });
      await fetchSequenceAudit("2026-08-01", "2026-08-31", "POS-01");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/sales/reports/fiscal/sequence-audit?startDate=2026-08-01&endDate=2026-08-31&terminalId=POS-01",
        expect.anything(),
      );
    });

    it("omits undefined params", async () => {
      mockFetchSuccess({ hasGaps: false });
      await fetchSequenceAudit("2026-08-01", "2026-08-31");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/sales/reports/fiscal/sequence-audit?startDate=2026-08-01&endDate=2026-08-31",
        expect.anything(),
      );
    });
  });

  describe("fetchSalesBookExport", () => {
    it("calls correct URL with format", async () => {
      mockFetchSuccess({ totalRecords: 0 });
      await fetchSalesBookExport("2026-08-01", "2026-08-31", "csv");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/sales/reports/export/sales-book?startDate=2026-08-01&endDate=2026-08-31&format=csv",
        expect.anything(),
      );
    });
  });

  describe("fetchZReportsExport", () => {
    it("calls correct URL with date range", async () => {
      mockFetchSuccess({ totalRecords: 0 });
      await fetchZReportsExport("2026-08-01", "2026-08-31");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/sales/reports/export/z-reports?startDate=2026-08-01&endDate=2026-08-31",
        expect.anything(),
      );
    });
  });

  describe("Error handling", () => {
    it("throws on 401 after refresh failure", async () => {
      mockFetchError(401, "Unauthorized");
      // Refresh will also fail
      mockFetchError(401, "Refresh failed");
      await expect(fetchMonthlyFiscalSummary(2026, 8)).rejects.toThrow();
    });

    it("throws on 500 with backend message", async () => {
      mockFetchError(500, "Internal server error");
      // Need to also mock the refresh retry path
      mockFetchError(500, "Internal server error");
      await expect(fetchMonthlyFiscalSummary(2026, 8)).rejects.toThrow();
    });
  });

  describe("Authorization header", () => {
    it("sends Bearer token in request", async () => {
      mockFetchSuccess({ year: 2026, month: 9 });
      await fetchMonthlyFiscalSummary();
      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers.Authorization).toBe("Bearer test-access-token");
    });
  });
});
