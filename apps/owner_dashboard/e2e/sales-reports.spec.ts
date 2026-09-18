import { test, expect } from "@playwright/test";
import { performLogin, setupStandardApiMocks } from "./helpers/mock-session";

test.describe("NHILOS POS — Sales Reports & Tab Navigation E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setupStandardApiMocks(page);
    await performLogin(page);
  });

  test("renders sales page tabs and navigates between views", async ({ page }) => {
    await page.goto("/sales");

    // Page header
    await expect(page.getByRole("heading", { name: "Ventas", exact: true })).toBeVisible();
    await expect(page.getByText("Reportes detallados de transacciones, horarios y rendimiento")).toBeVisible();

    // Default tab is Resumen
    await expect(page.getByText("Desglose por Método de Pago")).toBeVisible();

    // Switch to Ventas por Hora
    await page.getByRole("button", { name: "Ventas por Hora" }).click();
    await expect(page.getByText("Ventas por Hora (00:00 - 23:00)")).toBeVisible();

    // Switch to Top Productos
    await page.getByRole("button", { name: "Top Productos" }).click();
    await expect(page.getByText("Café Americano 12oz")).toBeVisible();
    await expect(page.getByText("Cappuccino Vainilla")).toBeVisible();

    // Switch to Rendimiento Cajeros
    await page.getByRole("button", { name: "Rendimiento Cajeros" }).click();
    await expect(page.getByText("Carlos Gómez")).toBeVisible();
    await expect(page.getByText("Elena Rivas")).toBeVisible();
  });

  test("mobile viewport allows scrolling and switching report tabs smoothly", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile viewport test only");

    await page.goto("/sales");

    const tabsContainer = page.locator('nav[aria-label="Secciones de ventas"]');
    await expect(tabsContainer).toBeVisible();

    // Click Top Productos tab on mobile
    await page.getByRole("button", { name: "Top Productos" }).click();
    await expect(page.getByText("Café Americano 12oz")).toBeVisible();

    // Ensure header hamburger remains visible and responsive
    const hamburger = page.locator('button[aria-label="Abrir menú"]');
    await expect(hamburger).toBeVisible();
  });
});
