import { test, expect } from "@playwright/test";
import { performLogin, setupStandardApiMocks } from "./helpers/mock-session";

test.describe("NHILOS POS — Dashboard Metrics & Filters E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setupStandardApiMocks(page);
    await performLogin(page);
  });

  test("renders key KPI cards with formatted values and subtitles", async ({ page }) => {
    await page.goto("/");

    // Verify main page title and subtitle
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByText("Métricas clave de facturación y resumen de operaciones")).toBeVisible();

    // Verify KPI cards
    await expect(page.getByText("Ventas Brutas").first()).toBeVisible();
    await expect(page.getByText("84 facturas")).toBeVisible();

    await expect(page.getByText("Ticket Promedio").first()).toBeVisible();
    await expect(page.getByText("Impuestos (IVA)").first()).toBeVisible();
    await expect(page.getByText("Descuentos").first()).toBeVisible();
  });

  test("renders payment methods breakdown and sales summary", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Métodos de Pago" })).toBeVisible();
    await expect(page.getByText("Efectivo NIO")).toBeVisible();
    await expect(page.getByText("Tarjeta NIO")).toBeVisible();
    await expect(page.getByText("Total NIO")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Resumen de Ventas" })).toBeVisible();
  });

  test("date range picker allows opening and selecting preset intervals", async ({ page }) => {
    await page.goto("/");

    // Find date range trigger button
    const datePickerTrigger = page.locator('button[aria-label="Seleccionar rango de fechas"]');
    await expect(datePickerTrigger).toBeVisible();
    await datePickerTrigger.click();

    // Verify popover presets
    await expect(page.getByRole("button", { name: "Hoy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ayer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Últimos 7 días" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Este mes" })).toBeVisible();

    // Click "Ayer" preset
    await page.getByRole("button", { name: "Ayer" }).click();
  });

  test("mobile viewport keeps header and cards within boundaries without horizontal scroll overflow", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile viewport test only");

    await page.goto("/");

    // Header hamburger button must be visible at top
    const hamburger = page.locator('button[aria-label="Abrir menú"]');
    await expect(hamburger).toBeVisible();

    // Verify no document-level horizontal scrollbar overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
