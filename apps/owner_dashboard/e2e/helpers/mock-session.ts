import type { Page } from "@playwright/test";

export const MOCK_USER = {
  id: "usr-admin-01",
  name: "Sofía Martínez",
  email: "sofia@nhilos.com",
  role: "OWNER",
  tenant_id: "tenant-soho-01",
  permissions: ["*"],
};

export const MOCK_TENANT = {
  id: "tenant-soho-01",
  name: "SOHO Café & Bistro",
  ruc: "J0310000000001",
  is_active: true,
};

export const MOCK_DASHBOARD_DATA = {
  grossSales: 38450.5,
  netSales: 33435.22,
  totalTax: 5015.28,
  totalDiscounts: 1200.0,
  invoiceCount: 84,
  ticketAverage: 457.74,
  paymentMethodsBreakdown: {
    cashNio: 15400.0,
    cashUsd: 250.0,
    cardNio: 21850.5,
    cardUsd: 0,
    other: 950.0,
    totalNio: 38450.5,
  },
  generatedAt: new Date().toISOString(),
};

export const MOCK_TOP_PRODUCTS = {
  startDate: "2026-09-18",
  endDate: "2026-09-18",
  generatedAt: new Date().toISOString(),
  products: [
    { productId: "p-1", productName: "Café Americano 12oz", totalQuantity: 142, totalRevenue: 7810.0 },
    { productId: "p-2", productName: "Cappuccino Vainilla", totalQuantity: 98, totalRevenue: 8330.0 },
    { productId: "p-3", productName: "Croissant de Mantequilla", totalQuantity: 65, totalRevenue: 4550.0 },
    { productId: "p-4", productName: "Panini Jamón y Queso", totalQuantity: 48, totalRevenue: 6240.0 },
  ],
};

export const MOCK_HOURLY_SALES = {
  date: "2026-09-18",
  totalSales: 33000,
  totalInvoices: 77,
  generatedAt: new Date().toISOString(),
  hourly: [
    { hour: 7, invoiceCount: 8, totalSales: 2400.0 },
    { hour: 8, invoiceCount: 18, totalSales: 6800.0 },
    { hour: 9, invoiceCount: 14, totalSales: 5100.0 },
    { hour: 12, invoiceCount: 22, totalSales: 11500.0 },
    { hour: 13, invoiceCount: 15, totalSales: 7200.0 },
  ],
};

export const MOCK_CASHIERS = {
  startDate: "2026-09-18",
  endDate: "2026-09-18",
  generatedAt: new Date().toISOString(),
  cashiers: [
    { userId: "c-1", cashierName: "Carlos Gómez", invoiceCount: 48, totalSales: 21200.0, ticketAverage: 441.67 },
    { userId: "c-2", cashierName: "Elena Rivas", invoiceCount: 36, totalSales: 17250.5, ticketAverage: 479.18 },
  ],
};

export const MOCK_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3ItYWRtaW4tMDEifQ.mock-sig";

export async function setupStandardApiMocks(page: Page) {
  await page.route("**/api/identity/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: MOCK_JWT,
        refresh_token: "mock-refresh-token",
        user: MOCK_USER,
        tenant: MOCK_TENANT,
      }),
    });
  });

  await page.route("**/api/identity/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: MOCK_JWT,
        refresh_token: "mock-refresh-token",
      }),
    });
  });

  await page.route("**/api/identity/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: MOCK_USER,
        tenant: MOCK_TENANT,
      }),
    });
  });

  await page.route("**/api/sales/reports/dashboard**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_DASHBOARD_DATA),
    });
  });

  await page.route("**/api/sales/reports/top-products**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_TOP_PRODUCTS),
    });
  });

  await page.route("**/api/sales/reports/hourly-sales**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_HOURLY_SALES),
    });
  });

  await page.route("**/api/sales/reports/cashier-performance**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CASHIERS),
    });
  });

  await page.route("**/api/catalogs/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "cat-1", name: "Bebidas Calientes", code: "BEB-CAL", type: "category", is_active: true, sort_order: 1 },
        { id: "cat-2", name: "Bebidas Frías", code: "BEB-FRI", type: "category", is_active: true, sort_order: 2 },
        { id: "cat-3", name: "Panadería & Repostería", code: "PAN-REP", type: "category", is_active: true, sort_order: 3 },
      ]),
    });
  });

  await page.route("**/api/products**", async (route) => {
    const productsList = [
      { id: "prod-1", name: "Café Americano 12oz", sku: "CAF-001", sellPrice: 55, stock: 120, uom: "UND", productType: "SIMPLE", is_active: true },
      { id: "prod-2", name: "Cappuccino Vainilla", sku: "CAP-002", sellPrice: 85, stock: 80, uom: "UND", productType: "SIMPLE", is_active: true },
      { id: "prod-3", name: "Croissant Mantequilla", sku: "PAN-001", sellPrice: 70, stock: 45, uom: "UND", productType: "SIMPLE", is_active: true },
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: productsList,
        total: productsList.length,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      }),
    });
  });

  await page.route("**/api/sales/reports/fiscal/monthly-summary**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        year: 2026,
        month: 9,
        invoiceCount: 84,
        totalGrossSales: 38450.5,
        totalTaxCollected: 5015.28,
        totalTaxableSales: 33435.22,
        totalExemptSales: 0,
        creditNoteCount: 2,
        netTaxableSales: 33435.22,
        netTaxPayable: 5015.28,
        totalCreditNotes: 850.0,
        totalCreditNotesTax: 110.87,
        generatedAt: new Date().toISOString(),
      }),
    });
  });

  await page.route("**/api/sales/reports/fiscal/voided-invoices**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalVoidedCount: 3,
        totalVoidedAmount: 1450.0,
        invoices: [
          { id: "inv-v1", number: "FAC-001-0089", cashierName: "Carlos Gómez", total: 450.0, voidReason: "Error en método de pago", canceledAt: new Date().toISOString() },
          { id: "inv-v2", number: "FAC-001-0094", cashierName: "Elena Rivas", total: 1000.0, voidReason: "Pedido cancelado por cliente", canceledAt: new Date().toISOString() },
        ],
        generatedAt: new Date().toISOString(),
      }),
    });
  });

  await page.route("**/api/sales/reports/fiscal/sequence-audit**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        expectedCount: 84,
        actualCount: 84,
        missingSequences: [],
        duplicateSequences: [],
        hasGaps: false,
        ranges: [{ series: "FAC-001", start: 1, end: 84, count: 84 }],
        generatedAt: new Date().toISOString(),
      }),
    });
  });

  await page.route("**/api/inventory/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/fiscal/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: true, regime: "general", autoDgiSync: true }),
    });
  });

  await page.route("**/api/promotions**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/recipes**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/identity/users/permissions/matrix**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ roles: ["OWNER", "MANAGER", "CASHIER"], permissions: [] }),
    });
  });

  await page.route("**/api/identity/users/**/permissions**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ effective_permissions: ["*"] }),
    });
  });

  await page.route("**/api/identity/users**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        MOCK_USER,
        { id: "usr-2", name: "Carlos Gómez", email: "carlos@nhilos.com", role: "CASHIER", tenant_id: "tenant-soho-01", is_active: true, created_at: "2026-09-01T10:00:00Z" },
      ]),
    });
  });

  await page.route("**/api/onboarding/fiscal-setup**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ruc: "J0310000000001",
        legalName: "SOHO Café & Bistro S.A.",
        commercialName: "SOHO Café & Bistro",
        taxRegime: "GENERAL",
        economicActivity: "Restaurantes y Cafeterías",
        dgiEstablishmentCode: "001",
        dgiPosNumber: "01",
        dgiAuthorizedSeries: "FAC-001",
        dgiInitialNumber: 1,
        dgiFinalNumber: 50000,
        dgiAuthorizationDate: "2026-01-15",
        dgiResolutionNumber: "RES-DGI-2026-089",
        printerIp: "192.168.1.100",
        autoDgiSync: true,
        isConfigured: true,
      }),
    });
  });

  await page.route("**/api/onboarding/templates**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { code: "CAFE_BISTRO", name: "Cafetería & Bistro", description: "Plantilla para cafeterías de especialidad y comida ligera" },
      ]),
    });
  });

  await page.route("**/api/customers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/tenant**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_TENANT),
    });
  });
}

export async function performLogin(page: Page) {
  await setupStandardApiMocks(page);
  await page.goto("/login");
  await page.fill('input[id="email"]', "sofia@nhilos.com");
  await page.fill('input[id="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

