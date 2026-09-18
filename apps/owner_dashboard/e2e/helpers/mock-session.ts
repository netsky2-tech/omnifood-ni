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
}

export async function performLogin(page: Page) {
  await setupStandardApiMocks(page);
  await page.goto("/login");
  await page.fill('input[id="email"]', "sofia@nhilos.com");
  await page.fill('input[id="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

