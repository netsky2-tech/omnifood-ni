/**
 * W2 Contract Tests — Frontend ↔ Backend DTO Alignment
 *
 * These tests validate that:
 * 1. Frontend types are structurally compatible with backend DTOs
 * 2. API functions send correct query parameters
 * 3. Hooks handle response shapes correctly
 *
 * They do NOT validate runtime behavior against a live backend.
 * For that, use the backend's E2E tests: test/sales/sales-reports.e2e-spec.ts
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type {
  SalesDashboardReport,
  HourlySalesReport,
  TopProductsReport,
  CashierPerformanceReport,
} from "../features/sales/types";
import {
  fetchSalesDashboard,
  fetchHourlySales,
  fetchTopProducts,
  fetchCashierPerformance,
} from "../features/sales/sales-api";
import * as apiModule from "../lib/api";

// Backend DTO shapes (copied from apps/admin_backend/src/modules/sales/dto/sales-reports.dto.ts)
// If these diverge, the structural assignability checks below will FAIL.

interface BackendPaymentMethodsBreakdownDto {
  cashNio: number;
  cashUsd: number;
  cardNio: number;
  cardUsd: number;
  other: number;
  totalNio: number;
}

interface BackendSalesDashboardReportDto {
  grossSales: number;
  netTaxableSales: number;
  totalTax: number;
  totalDiscounts: number;
  invoiceCount: number;
  ticketAverage: number;
  paymentMethodsBreakdown: BackendPaymentMethodsBreakdownDto;
  startDate?: string;
  endDate?: string;
  generatedAt: string;
}

interface BackendHourlySalesBucketDto {
  hour: number;
  invoiceCount: number;
  totalSales: number;
}

interface BackendHourlySalesReportDto {
  date: string;
  totalSales: number;
  totalInvoices: number;
  generatedAt: string;
  hourly: BackendHourlySalesBucketDto[];
}

interface BackendTopProductItemDto {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

interface BackendTopProductsReportDto {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  products: BackendTopProductItemDto[];
}

interface BackendCashierPerformanceItemDto {
  userId: string;
  cashierName: string;
  invoiceCount: number;
  totalSales: number;
  ticketAverage: number;
}

interface BackendCashierPerformanceReportDto {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  cashiers: BackendCashierPerformanceItemDto[];
}

// Structural compatibility helpers
type IsAssignable<T, U> = T extends U ? true : false;
type AssertTrue<T extends true> = T;

describe("W2 Contract — Frontend types vs Backend DTOs", () => {
  it("SalesDashboardReport matches BackendSalesDashboardReportDto", () => {
    type Check = AssertTrue<IsAssignable<SalesDashboardReport, BackendSalesDashboardReportDto>>;
    const check: Check = true;
    expect(check).toBe(true);
  });

  it("HourlySalesReport matches BackendHourlySalesReportDto", () => {
    type Check = AssertTrue<IsAssignable<HourlySalesReport, BackendHourlySalesReportDto>>;
    const check: Check = true;
    expect(check).toBe(true);
  });

  it("TopProductsReport matches BackendTopProductsReportDto", () => {
    type Check = AssertTrue<IsAssignable<TopProductsReport, BackendTopProductsReportDto>>;
    const check: Check = true;
    expect(check).toBe(true);
  });

  it("CashierPerformanceReport matches BackendCashierPerformanceReportDto", () => {
    type Check = AssertTrue<IsAssignable<CashierPerformanceReport, BackendCashierPerformanceReportDto>>;
    const check: Check = true;
    expect(check).toBe(true);
  });
});

describe("W2 Contract — API functions send correct parameters", () => {
  const mockGet = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    vi.spyOn(apiModule.api, "get").mockImplementation(mockGet);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchSalesDashboard calls api.get with correct path and params", async () => {
    await fetchSalesDashboard("2026-08-01", "2026-08-31");

    expect(mockGet).toHaveBeenCalledWith(
      "/sales/reports/dashboard?startDate=2026-08-01&endDate=2026-08-31",
    );
  });

  it("fetchSalesDashboard omits undefined params", async () => {
    await fetchSalesDashboard();

    expect(mockGet).toHaveBeenCalledWith("/sales/reports/dashboard");
  });

  it("fetchHourlySales sends date param", async () => {
    await fetchHourlySales("2026-08-26");

    expect(mockGet).toHaveBeenCalledWith(
      "/sales/reports/hourly-sales?date=2026-08-26",
    );
  });

  it("fetchTopProducts sends startDate, endDate, and limit", async () => {
    await fetchTopProducts("2026-08-01", "2026-08-31", 5);

    expect(mockGet).toHaveBeenCalledWith(
      "/sales/reports/top-products?startDate=2026-08-01&endDate=2026-08-31&limit=5",
    );
  });

  it("fetchCashierPerformance sends date range", async () => {
    await fetchCashierPerformance("2026-08-01", "2026-08-31");

    expect(mockGet).toHaveBeenCalledWith(
      "/sales/reports/cashier-performance?startDate=2026-08-01&endDate=2026-08-31",
    );
  });
});

describe("W2 Contract — API functions handle backend response shapes", () => {
  const mockGet = vi.fn();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockDashboardResponse: BackendSalesDashboardReportDto = {
    grossSales: 15000.5,
    netTaxableSales: 13043.91,
    totalTax: 1956.59,
    totalDiscounts: 500,
    invoiceCount: 42,
    ticketAverage: 357.15,
    paymentMethodsBreakdown: {
      cashNio: 8000,
      cashUsd: 200,
      cardNio: 4500,
      cardUsd: 300,
      other: 0,
      totalNio: 13000,
    },
    startDate: "2026-08-31",
    endDate: "2026-08-31",
    generatedAt: "2026-08-31T15:30:00Z",
  };

  it("fetchSalesDashboard returns typed response matching backend shape", async () => {
    mockGet.mockResolvedValueOnce(mockDashboardResponse);
    vi.spyOn(apiModule.api, "get").mockImplementation(mockGet);

    const result = await fetchSalesDashboard("2026-08-31", "2026-08-31");

    expect(typeof result.grossSales).toBe("number");
    expect(typeof result.netTaxableSales).toBe("number");
    expect(typeof result.totalTax).toBe("number");
    expect(typeof result.totalDiscounts).toBe("number");
    expect(typeof result.invoiceCount).toBe("number");
    expect(typeof result.ticketAverage).toBe("number");
    expect(typeof result.generatedAt).toBe("string");
    expect(typeof result.paymentMethodsBreakdown.cashNio).toBe("number");
    expect(typeof result.paymentMethodsBreakdown.cashUsd).toBe("number");
    expect(typeof result.paymentMethodsBreakdown.cardNio).toBe("number");
    expect(typeof result.paymentMethodsBreakdown.cardUsd).toBe("number");
    expect(typeof result.paymentMethodsBreakdown.other).toBe("number");
    expect(typeof result.paymentMethodsBreakdown.totalNio).toBe("number");
  });

  it("fetchHourlySales returns typed response with hourly array", async () => {
    mockGet.mockResolvedValueOnce({
      date: "2026-08-26",
      totalSales: 5000,
      totalInvoices: 10,
      generatedAt: "2026-08-26T18:00:00Z",
      hourly: [
        { hour: 0, invoiceCount: 0, totalSales: 0 },
        { hour: 8, invoiceCount: 3, totalSales: 1500 },
      ],
    });
    vi.spyOn(apiModule.api, "get").mockImplementation(mockGet);

    const result = await fetchHourlySales("2026-08-26");

    expect(typeof result.date).toBe("string");
    expect(typeof result.totalSales).toBe("number");
    expect(Array.isArray(result.hourly)).toBe(true);
    expect(result.hourly.length).toBe(2);
    expect(typeof result.hourly[0]?.hour).toBe("number");
    expect(typeof result.hourly[0]?.invoiceCount).toBe("number");
    expect(typeof result.hourly[0]?.totalSales).toBe("number");
  });

  it("fetchTopProducts returns typed response with products array", async () => {
    mockGet.mockResolvedValueOnce({
      generatedAt: "2026-08-26T18:00:00Z",
      products: [
        { productId: "p-1", productName: "Café", totalQuantity: 20, totalRevenue: 2000 },
      ],
    });
    vi.spyOn(apiModule.api, "get").mockImplementation(mockGet);

    const result = await fetchTopProducts();

    expect(Array.isArray(result.products)).toBe(true);
    expect(typeof result.products[0]?.productId).toBe("string");
    expect(typeof result.products[0]?.productName).toBe("string");
    expect(typeof result.products[0]?.totalQuantity).toBe("number");
    expect(typeof result.products[0]?.totalRevenue).toBe("number");
  });

  it("fetchCashierPerformance returns typed response with cashiers array", async () => {
    mockGet.mockResolvedValueOnce({
      generatedAt: "2026-08-26T18:00:00Z",
      cashiers: [
        { userId: "u-1", cashierName: "Juan", invoiceCount: 10, totalSales: 5000, ticketAverage: 500 },
      ],
    });
    vi.spyOn(apiModule.api, "get").mockImplementation(mockGet);

    const result = await fetchCashierPerformance();

    expect(Array.isArray(result.cashiers)).toBe(true);
    expect(result.cashiers.length).toBeGreaterThan(0);
    expect(typeof result.cashiers[0]?.userId).toBe("string");
    expect(typeof result.cashiers[0]?.cashierName).toBe("string");
    expect(typeof result.cashiers[0]?.invoiceCount).toBe("number");
    expect(typeof result.cashiers[0]?.totalSales).toBe("number");
    expect(typeof result.cashiers[0]?.ticketAverage).toBe("number");
  });
});

describe("W2 Contract — API functions handle error responses", () => {
  const mockGet = vi.fn();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchSalesDashboard throws on backend error", async () => {
    mockGet.mockRejectedValueOnce(new Error("API error: 500"));
    vi.spyOn(apiModule.api, "get").mockImplementation(mockGet);

    await expect(fetchSalesDashboard()).rejects.toThrow("API error: 500");
  });

  it("fetchHourlySales throws on RBAC denied", async () => {
    mockGet.mockRejectedValueOnce(new Error("API error: 403"));
    vi.spyOn(apiModule.api, "get").mockImplementation(mockGet);

    await expect(fetchHourlySales()).rejects.toThrow("API error: 403");
  });
});
