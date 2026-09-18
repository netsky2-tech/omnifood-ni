import { test, expect } from "@playwright/test";

test.describe("NHILOS POS — Brand, Viewport & Authentication E2E", () => {
  test("login page displays real NHILOS logo, clean branding, and no generic text", async ({ page }) => {
    await page.goto("/login");

    // Title verification
    await expect(page).toHaveTitle(/NHILOS POS/i);
    expect(await page.title()).not.toContain("OmniCommerce");

    // Real logo verification
    const logoImg = page.locator('img[alt="NHILOS POS"]');
    await expect(logoImg).toBeVisible();
    const logoSrc = await logoImg.getAttribute("src");
    expect(logoSrc).toContain("logo.png");

    // Brand texts
    await expect(page.getByRole("heading", { name: "NHILOS POS" })).toBeVisible();
    await expect(page.getByText("Panel de administración")).toBeVisible();

    // Ensure deprecated legacy text is gone
    await expect(page.locator("text=OmniCommerce")).not.toBeVisible();
    await expect(page.locator("text=Retail B2B")).not.toBeVisible();
  });

  test("invalid credentials displays clear error message and NEVER shows 'Sesión expirada'", async ({ page }) => {
    // Intercept login to return 401 with standard backend response
    await page.route("**/api/identity/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Credenciales inválidas",
          error: "Unauthorized",
          statusCode: 401,
        }),
      });
    });

    await page.goto("/login");

    await page.fill('input[id="email"]', "usuario@invalido.com");
    await page.fill('input[id="password"]', "passwordIncorrecto");
    await page.click('button[type="submit"]');

    // Expected credential error
    const errorAlert = page.locator('div[role="alert"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("Credenciales incorrectas. Intente de nuevo.");

    // Must NEVER show false session expired message on login
    await expect(errorAlert).not.toContainText("Sesión expirada");
  });

  test("mobile drawer displays real logo, NHILOS POS title, and no Retail B2B", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-specific drawer test");

    // Mock successful authentication
    await page.route("**/api/identity/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "mock-access-token",
          refresh_token: "mock-refresh-token",
          user: {
            id: "user-1",
            name: "Admin Mobile",
            email: "admin@nhilos.com",
            role: "OWNER",
            tenant_id: "tenant-1",
            permissions: ["*"],
          },
          tenant: {
            id: "tenant-1",
            name: "Cafetería Central",
            ruc: "J0310000000001",
          },
        }),
      });
    });

    await page.route("**/api/sales/reports/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          grossSales: 15420,
          netSales: 13408.7,
          totalTax: 2011.3,
          totalDiscounts: 0,
          invoiceCount: 42,
          ticketAverage: 367.14,
          paymentMethodsBreakdown: {
            cashNio: 15420,
            cashUsd: 0,
            cardNio: 0,
            cardUsd: 0,
            other: 0,
            totalNio: 15420,
          },
          generatedAt: new Date().toISOString(),
        }),
      });
    });

    await page.goto("/login");
    await page.fill('input[id="email"]', "admin@nhilos.com");
    await page.fill('input[id="password"]', "validPassword123");
    await page.click('button[type="submit"]');

    // Upon login redirect to dashboard, verify top header is immediately visible
    const menuButton = page.locator('button[aria-label="Abrir menú"]');
    await expect(menuButton).toBeVisible();

    // Verify header branding
    await expect(page.locator("text=OmniCommerce")).not.toBeVisible();

    // Open mobile sidebar drawer
    await menuButton.click();

    const mobileDrawer = page.locator('aside[aria-label="Navegación móvil"]');
    await expect(mobileDrawer).toBeVisible();

    // Verify logo in mobile drawer
    const drawerLogo = mobileDrawer.locator('img[alt="NHILOS POS"]');
    await expect(drawerLogo).toBeVisible();

    // Verify brand text in drawer
    await expect(mobileDrawer.locator("text=NHILOS POS")).toBeVisible();
    await expect(mobileDrawer.locator("text=Retail B2B")).not.toBeVisible();
  });
});
