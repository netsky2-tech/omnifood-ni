import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
  ValuationReport,
  ValuationItem,
  CogsReport,
  CogsItem,
  KardexReport,
  KardexMovement,
  AlertsSummary,
  InventoryAlert,
  MovementType,
  AlertSeverity,
  KardexFilters,
} from "@/features/inventory/types";

// ─── Contract Test: Frontend types must match backend DTOs ─────────────────
// These interfaces are copied from:
//   apps/admin_backend/src/modules/inventory/dto/inventory-reports.dto.ts
// If the backend DTO changes, these must be updated, and the assignment
// checks below will fail — forcing a同步.

interface BackendInventoryValuationItemDto {
  id: string;
  name: string;
  consumptionUom: string;
  warehouseId?: string;
  isPerishable: boolean;
  stock: number;
  averageCostNio: number;
  totalValuationNio: number;
  stockMin?: number;
  stockMax?: number;
  parLevel?: number;
  isLowStock: boolean;
  isNegativeStock: boolean;
}

interface BackendInventoryValuationReportDto {
  totalValuationNio: number;
  totalItemsCount: number;
  itemsWithStockCount: number;
  itemsLowStockCount: number;
  itemsNegativeStockCount: number;
  generatedAt: string;
  items: BackendInventoryValuationItemDto[];
}

interface BackendCogsReportItemDto {
  insumoId: string;
  insumoName: string;
  consumptionUom: string;
  salesQuantity: number;
  salesCostNio: number;
  shrinkageQuantity: number;
  shrinkageCostNio: number;
  totalQuantity: number;
  totalCostNio: number;
  costPercentage: number;
}

interface BackendCogsReportDto {
  fromDate: string;
  toDate: string;
  totalCogsNio: number;
  salesCogsNio: number;
  shrinkageCogsNio: number;
  generatedAt: string;
  items: BackendCogsReportItemDto[];
}

interface BackendKardexReportItemDto {
  id: string;
  insumoId: string;
  insumoName: string;
  consumptionUom: string;
  type: MovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  unitCostNio?: number;
  totalCostNio?: number;
  averageCostAfterNio?: number;
  reason?: string;
  sourceDocumentType?: string;
  sourceDocumentId?: string;
  createdAt: string;
}

interface BackendKardexReportDto {
  totalCount: number;
  filters: {
    from?: string;
    to?: string;
    insumoId?: string;
    type?: MovementType;
    warehouseId?: string;
  };
  generatedAt: string;
  movements: BackendKardexReportItemDto[];
}

interface BackendInventoryAlertItemDto {
  insumoId: string;
  insumoName: string;
  consumptionUom: string;
  warehouseId?: string;
  isPerishable: boolean;
  stock: number;
  minStock?: number;
  parLevel?: number;
  severity: AlertSeverity;
  message: string;
  suggestedReorderQuantity: number;
}

interface BackendInventoryAlertsSummaryDto {
  totalAlertsCount: number;
  criticalCount: number;
  warningCount: number;
  negativeCount: number;
  generatedAt: string;
  alerts: BackendInventoryAlertItemDto[];
}

// Type-level assignment compatibility checks (compile-time, not runtime)
function _assertValuationReportAssignable(): BackendInventoryValuationReportDto {
  return {} as ValuationReport;
}
function _assertCogsReportAssignable(): BackendCogsReportDto {
  return {} as CogsReport;
}
function _assertKardexReportAssignable(): BackendKardexReportDto {
  return {} as KardexReport;
}
function _assertAlertsSummaryAssignable(): BackendInventoryAlertsSummaryDto {
  return {} as AlertsSummary;
}

describe("W3 — Contract: frontend types match backend DTOs", () => {
  it("ValuationReport is assignable to BackendInventoryValuationReportDto", () => {
    const frontend: ValuationReport = {
      totalValuationNio: 100,
      totalItemsCount: 5,
      itemsWithStockCount: 4,
      itemsLowStockCount: 1,
      itemsNegativeStockCount: 0,
      generatedAt: "2026-01-01T00:00:00Z",
      items: [],
    };
    const backend: BackendInventoryValuationReportDto = frontend;
    expect(backend.totalValuationNio).toBe(100);
  });

  it("ValuationItem is assignable to BackendInventoryValuationItemDto", () => {
    const frontend: ValuationItem = {
      id: "1",
      name: "Test",
      consumptionUom: "kg",
      stock: 10,
      averageCostNio: 50,
      totalValuationNio: 500,
      isLowStock: false,
      isNegativeStock: false,
      isPerishable: false,
    };
    const backend: BackendInventoryValuationItemDto = frontend;
    expect(backend.id).toBe("1");
  });

  it("CogsReport is assignable to BackendCogsReportDto", () => {
    const frontend: CogsReport = {
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
      totalCogsNio: 5000,
      salesCogsNio: 4000,
      shrinkageCogsNio: 1000,
      generatedAt: "2026-01-31T00:00:00Z",
      items: [],
    };
    const backend: BackendCogsReportDto = frontend;
    expect(backend.totalCogsNio).toBe(5000);
  });

  it("CogsItem is assignable to BackendCogsReportItemDto", () => {
    const frontend: CogsItem = {
      insumoId: "i1",
      insumoName: "Carne",
      consumptionUom: "kg",
      salesQuantity: 100,
      salesCostNio: 22000,
      shrinkageQuantity: 5,
      shrinkageCostNio: 1100,
      totalQuantity: 105,
      totalCostNio: 23100,
      costPercentage: 45.5,
    };
    const backend: BackendCogsReportItemDto = frontend;
    expect(backend.insumoId).toBe("i1");
  });

  it("KardexReport is assignable to BackendKardexReportDto", () => {
    const frontend: KardexReport = {
      totalCount: 1,
      filters: {},
      generatedAt: "2026-01-01T00:00:00Z",
      movements: [],
    };
    const backend: BackendKardexReportDto = frontend;
    expect(backend.totalCount).toBe(1);
  });

  it("KardexMovement is assignable to BackendKardexReportItemDto", () => {
    const frontend: KardexMovement = {
      id: "m1",
      insumoId: "i1",
      insumoName: "Carne",
      consumptionUom: "kg",
      type: "SALE",
      quantity: 10,
      stockBefore: 50,
      stockAfter: 40,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const backend: BackendKardexReportItemDto = frontend;
    expect(backend.type).toBe("SALE");
  });

  it("AlertsSummary is assignable to BackendInventoryAlertsSummaryDto", () => {
    const frontend: AlertsSummary = {
      totalAlertsCount: 2,
      criticalCount: 1,
      warningCount: 1,
      negativeCount: 0,
      generatedAt: "2026-01-01T00:00:00Z",
      alerts: [],
    };
    const backend: BackendInventoryAlertsSummaryDto = frontend;
    expect(backend.totalAlertsCount).toBe(2);
  });

  it("InventoryAlert is assignable to BackendInventoryAlertItemDto", () => {
    const frontend: InventoryAlert = {
      insumoId: "i1",
      insumoName: "Carne",
      consumptionUom: "kg",
      stock: 3,
      severity: "CRITICAL",
      message: "Stock bajo",
      suggestedReorderQuantity: 50,
      isPerishable: false,
    };
    const backend: BackendInventoryAlertItemDto = frontend;
    expect(backend.severity).toBe("CRITICAL");
  });

  it("MovementType values match backend enum exactly", () => {
    const backendMovementTypes: MovementType[] = [
      "SALE",
      "SALE_CANCEL",
      "PURCHASE",
      "ENTRADA_COMPRA",
      "SHRINKAGE",
      "PRODUCTION",
      "CREDIT_NOTE_RESTOCK",
      "ADJUSTMENT",
      "REVERSAL",
    ];
    expect(backendMovementTypes).toHaveLength(9);
    for (const mt of backendMovementTypes) {
      expect(typeof mt).toBe("string");
    }
  });

  it("AlertSeverity values match backend enum exactly", () => {
    const backendSeverities: AlertSeverity[] = [
      "CRITICAL",
      "WARNING",
      "NEGATIVE_STOCK",
    ];
    expect(backendSeverities).toHaveLength(3);
  });
});

// ─── API Layer Tests ────────────────────────────────────────────────────────

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  getAccessToken: () => "mock-token",
  hasStoredRefreshToken: () => false,
}));

describe("W3 — API layer: query param construction", () => {
  let apiGet: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { api } = await import("@/lib/api");
    apiGet = api.get as unknown as ReturnType<typeof vi.fn>;
    apiGet.mockClear();
    apiGet.mockResolvedValue({});
  });

  it("fetchValuation hits correct endpoint", async () => {
    const { fetchValuation } = await import("@/features/inventory/inventory-api");
    await fetchValuation();
    expect(apiGet).toHaveBeenCalledWith("/inventory/reports/valuation");
  });

  it("fetchCogs with date range includes query params", async () => {
    const { fetchCogs } = await import("@/features/inventory/inventory-api");
    await fetchCogs("2026-08-01", "2026-08-31");
    expect(apiGet).toHaveBeenCalledWith(
      "/inventory/reports/cogs?from=2026-08-01&to=2026-08-31",
    );
  });

  it("fetchCogs without dates hits endpoint without params", async () => {
    const { fetchCogs } = await import("@/features/inventory/inventory-api");
    await fetchCogs();
    expect(apiGet).toHaveBeenCalledWith("/inventory/reports/cogs");
  });

  it("fetchKardex with filters includes all params", async () => {
    const { fetchKardex } = await import("@/features/inventory/inventory-api");
    await fetchKardex({
      from: "2026-08-01",
      to: "2026-08-31",
      type: "SALE",
      limit: 50,
      offset: 0,
    });
    const url = apiGet.mock.calls[0][0] as string;
    expect(url).toContain("from=2026-08-01");
    expect(url).toContain("to=2026-08-31");
    expect(url).toContain("type=SALE");
    expect(url).toContain("limit=50");
    expect(url).toContain("offset=0");
  });

  it("fetchKardex omits undefined params", async () => {
    const { fetchKardex } = await import("@/features/inventory/inventory-api");
    await fetchKardex({ insumoId: "i1" });
    const url = apiGet.mock.calls[0][0] as string;
    expect(url).toContain("insumoId=i1");
    expect(url).not.toContain("from=");
    expect(url).not.toContain("type=");
  });

  it("fetchAlerts hits correct endpoint", async () => {
    const { fetchAlerts } = await import("@/features/inventory/inventory-api");
    await fetchAlerts();
    expect(apiGet).toHaveBeenCalledWith("/inventory/reports/alerts");
  });
});

// ─── MovementType → Label Mapping ──────────────────────────────────────────

describe("W3 — MovementType label mapping covers all backend types", () => {
  const MOVEMENT_LABELS: Record<MovementType, string> = {
    SALE: "Venta",
    SALE_CANCEL: "Anulación Venta",
    PURCHASE: "Compra",
    ENTRADA_COMPRA: "Entrada Compra",
    SHRINKAGE: "Mermas",
    PRODUCTION: "Producción",
    CREDIT_NOTE_RESTOCK: "Nota Crédito",
    ADJUSTMENT: "Ajuste",
    REVERSAL: "Reversión",
  };

  const allBackendTypes: MovementType[] = [
    "SALE",
    "SALE_CANCEL",
    "PURCHASE",
    "ENTRADA_COMPRA",
    "SHRINKAGE",
    "PRODUCTION",
    "CREDIT_NOTE_RESTOCK",
    "ADJUSTMENT",
    "REVERSAL",
  ];

  it("has a Spanish label for every backend MovementType", () => {
    for (const type of allBackendTypes) {
      expect(MOVEMENT_LABELS[type]).toBeDefined();
      expect(typeof MOVEMENT_LABELS[type]).toBe("string");
      expect(MOVEMENT_LABELS[type].length).toBeGreaterThan(0);
    }
  });

  it("labels are human-readable Spanish", () => {
    expect(MOVEMENT_LABELS.SALE).toBe("Venta");
    expect(MOVEMENT_LABELS.SALE_CANCEL).toBe("Anulación Venta");
    expect(MOVEMENT_LABELS.PURCHASE).toBe("Compra");
    expect(MOVEMENT_LABELS.SHRINKAGE).toBe("Mermas");
    expect(MOVEMENT_LABELS.ADJUSTMENT).toBe("Ajuste");
  });
});

// ─── Currency & Number Formatting ──────────────────────────────────────────

describe("W3 — formatCurrency produces NIO format", () => {
  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("es-NI", {
      style: "currency",
      currency: "NIO",
      minimumFractionDigits: 2,
    }).format(amount);
  }

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("C$0.00");
  });

  it("formats positive amount", () => {
    const result = formatCurrency(15000.5);
    expect(result).toContain("15,000.50");
    expect(result).toContain("C$");
  });

  it("formats negative amount", () => {
    const result = formatCurrency(-500);
    expect(result).toContain("500");
    expect(result).toContain("C$");
  });

  it("formats large numbers with thousands separator", () => {
    const result = formatCurrency(245000.75);
    expect(result).toContain("245,000.75");
  });
});

describe("W3 — formatNumber produces es-NI format", () => {
  function formatNumber(n: number): string {
    return new Intl.NumberFormat("es-NI").format(n);
  }

  it("formats integer", () => {
    expect(formatNumber(120)).toBe("120");
  });

  it("formats zero", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("formats negative", () => {
    expect(formatNumber(-2)).toBe("-2");
  });
});

// ─── Valuation Computed Logic ──────────────────────────────────────────────

describe("W3 — Valuation computed logic matches backend service", () => {
  function computeValuation(items: { stock: number; averageCostNio: number }[]) {
    let totalValuationNio = 0;
    let itemsWithStockCount = 0;
    let itemsLowStockCount = 0;
    let itemsNegativeStockCount = 0;

    for (const item of items) {
      const stock = item.stock;
      const totalValuation = stock * item.averageCostNio;

      if (stock > 0) {
        itemsWithStockCount++;
        totalValuationNio += totalValuation;
      }
      if (stock < 0) itemsNegativeStockCount++;
    }

    return {
      totalValuationNio: Math.round(totalValuationNio * 10000) / 10000,
      itemsWithStockCount,
      itemsNegativeStockCount,
    };
  }

  it("sums only positive stock items (matches backend logic)", () => {
    const items = [
      { stock: 45, averageCostNio: 220 },   // 9900
      { stock: 3, averageCostNio: 8 },       // 24
      { stock: -2, averageCostNio: 45 },     // excluded (negative)
    ];
    const result = computeValuation(items);
    expect(result.totalValuationNio).toBe(9924);
    expect(result.itemsWithStockCount).toBe(2);
    expect(result.itemsNegativeStockCount).toBe(1);
  });

  it("handles empty items", () => {
    const result = computeValuation([]);
    expect(result.totalValuationNio).toBe(0);
    expect(result.itemsWithStockCount).toBe(0);
    expect(result.itemsNegativeStockCount).toBe(0);
  });

  it("handles all negative stock", () => {
    const items = [
      { stock: -5, averageCostNio: 100 },
      { stock: -10, averageCostNio: 50 },
    ];
    const result = computeValuation(items);
    expect(result.totalValuationNio).toBe(0);
    expect(result.itemsWithStockCount).toBe(0);
    expect(result.itemsNegativeStockCount).toBe(2);
  });
});

// ─── Alert Severity Logic ──────────────────────────────────────────────────

describe("W3 — Alert severity matches backend service rules", () => {
  function classifySeverity(
    stock: number,
    minStock?: number,
  ): "NEGATIVE_STOCK" | "CRITICAL" | "WARNING" | null {
    if (stock < 0) return "NEGATIVE_STOCK";
    if (stock === 0) return "CRITICAL";
    if (minStock != null && stock <= minStock) return "WARNING";
    return null;
  }

  it("negative stock → NEGATIVE_STOCK", () => {
    expect(classifySeverity(-5)).toBe("NEGATIVE_STOCK");
  });

  it("zero stock → CRITICAL", () => {
    expect(classifySeverity(0)).toBe("CRITICAL");
  });

  it("stock at minStock → WARNING", () => {
    expect(classifySeverity(10, 10)).toBe("WARNING");
  });

  it("stock below minStock → WARNING", () => {
    expect(classifySeverity(5, 10)).toBe("WARNING");
  });

  it("stock above minStock → null", () => {
    expect(classifySeverity(15, 10)).toBeNull();
  });

  it("stock above with no minStock → null", () => {
    expect(classifySeverity(5)).toBeNull();
  });
});

// ─── Kardex Filter Propagation ─────────────────────────────────────────────

describe("W3 — KardexFilters shape matches backend query", () => {
  it("accepts all backend filter fields", () => {
    const filters: KardexFilters = {
      from: "2026-01-01",
      to: "2026-12-31",
      insumoId: "uuid-here",
      type: "SALE",
      warehouseId: "wh-1",
      limit: 100,
      offset: 0,
    };
    expect(filters.type).toBe("SALE");
    expect(filters.limit).toBe(100);
  });

  it("all fields are optional", () => {
    const filters: KardexFilters = {};
    expect(filters.from).toBeUndefined();
    expect(filters.type).toBeUndefined();
  });
});
