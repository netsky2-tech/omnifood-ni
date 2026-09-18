import { test, expect } from "@playwright/test";
import { performLogin, setupStandardApiMocks } from "./helpers/mock-session";
import * as path from "node:path";
import * as fs from "node:fs";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "e2e-screenshots");

test.describe("NHILOS POS — Comprehensive Visual & Mobile Inspection", () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  test("visual inspection 1: login screen and invalid credentials error state", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Visual inspection runs on mobile viewport");

    // 1. Visit login page
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "NHILOS POS" })).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-login-screen.png") });

    // 2. Trigger invalid credentials error
    await page.route("**/api/identity/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Invalid credentials" }),
      });
    });

    await page.fill('input[id="email"]', "usuario@invalido.com");
    await page.fill('input[id="password"]', "passwordIncorrecto");
    await page.click('button[type="submit"]');
    const alert = page.locator('div[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Credenciales incorrectas. Intente de nuevo.");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-login-error-state.png") });
  });

  test("visual inspection 2: dashboard landing, header visibility, drawer, and rapid scroll", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Visual inspection runs on mobile viewport");

    await performLogin(page);

    // Verify Header position on land
    const header = page.locator("header");
    await expect(header).toBeVisible();
    await expect(page.locator("main").getByText("Ventas Brutas").first()).toBeVisible();
    const headerBox = await header.boundingBox();
    console.log("[Visual Inspection] Header bounding box on landing:", headerBox);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-dashboard-landing.png") });

    // Open and inspect mobile drawer
    const hamburger = page.locator('button[aria-label="Abrir menú"]');
    await expect(hamburger).toBeVisible();
    await hamburger.click();
    const mobileDrawer = page.locator('aside[aria-label="Navegación móvil"]');
    await expect(mobileDrawer).toBeVisible();
    // Wait for drawer slide-in transition to finish
    await page.waitForTimeout(350);
    await expect(mobileDrawer.getByText("Dashboard")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-mobile-drawer-open.png") });

    // Close drawer
    const closeBtn = page.locator('button[aria-label="Cerrar menú móvil"]');
    await closeBtn.click();
    await page.waitForTimeout(350);
    await expect(mobileDrawer).toHaveClass(/-translate-x-full/);

    // Simulate rapid scroll down and up
    const mainContainer = page.locator("main");
    await expect(mainContainer).toBeVisible();

    await mainContainer.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-dashboard-scrolled-bottom.png") });

    await mainContainer.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06-dashboard-scrolled-top.png") });
  });

  test("visual inspection 3: screens across all main modules", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Visual inspection runs on mobile viewport");

    await performLogin(page);

    // Sales page tabs
    await page.goto("/sales");
    await expect(page.getByRole("heading", { name: "Ventas", exact: true })).toBeVisible();
    await expect(page.getByText("C$38,450.50")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07-sales-resumen.png") });

    await page.getByRole("button", { name: "Ventas por Hora" }).click();
    await expect(page.getByText("Ventas por Hora (00:00 - 23:00)")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08-sales-ventas-por-hora.png") });

    await page.getByRole("button", { name: "Top Productos" }).click();
    await expect(page.getByText("Café Americano 12oz")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09-sales-top-productos.png") });

    await page.getByRole("button", { name: "Rendimiento Cajeros" }).click();
    await expect(page.getByText("Carlos Gómez")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10-sales-rendimiento-cajeros.png") });

    // Other core modules
    await page.goto("/catalog");
    await expect(page.getByText("Bebidas Calientes")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11-catalog-page.png") });

    await page.goto("/products");
    await expect(page.getByText("Café Americano 12oz")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "12-products-page.png") });

    await page.goto("/fiscal");
    await expect(page.getByText("Resumen Fiscal (DGI)")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "13-fiscal-page.png") });

    await page.goto("/users");
    await expect(page.locator("table").getByText("Sofía Martínez")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "14-users-page.png") });

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Configuración & Onboarding" })).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "15-settings-page.png") });
  });
});
