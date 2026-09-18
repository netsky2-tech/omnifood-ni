import { test, expect } from "@playwright/test";
import { performLogin, setupStandardApiMocks } from "./helpers/mock-session";

test.describe("NHILOS POS — Navigation, Layout & Error Boundaries E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setupStandardApiMocks(page);
    await performLogin(page);
  });

  test("desktop sidebar collapses and expands seamlessly with state retention", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar test only");

    await page.goto("/");

    const collapseBtn = page.locator('button[aria-label="Colapsar barra lateral"]');
    await expect(collapseBtn).toBeVisible();

    // Click to collapse
    await collapseBtn.click();

    // Verify collapsed sidebar contains expand button with real logo
    const expandBtn = page.locator('button[aria-label="Expandir barra lateral"]').first();
    await expect(expandBtn).toBeVisible();

    // Click to expand back
    await expandBtn.click();
    await expect(page.getByLabel("Navegación principal").getByText("NHILOS POS")).toBeVisible();
  });

  test("user profile menu displays user information and triggers clean logout", async ({ page }) => {
    await page.goto("/");

    // Open user dropdown in header
    const userMenuButton = page.locator('header button[aria-haspopup="menu"]');
    await expect(userMenuButton).toBeVisible();
    await userMenuButton.click();

    // Verify user information in dropdown
    const userMenu = page.getByRole("menu", { name: "Menú de usuario" });
    await expect(userMenu).toBeVisible();
    await expect(userMenu.getByText("Sofía Martínez")).toBeVisible();
    await expect(userMenu.getByText("sofia@nhilos.com")).toBeVisible();

    // Click logout
    const logoutItem = page.getByRole("menuitem", { name: /cerrar sesión/i });
    await expect(logoutItem).toBeVisible();
    await logoutItem.click();

    // Must navigate back to /login
    await page.waitForURL("**/login");
    await expect(page.getByRole("heading", { name: "NHILOS POS" })).toBeVisible();
  });

  test("navigating to unknown route renders 404 page with return action", async ({ page }) => {
    await page.goto("/ruta-inexistente-xyz");

    await expect(page.getByText("Página no encontrada")).toBeVisible();
    await expect(page.getByRole("link", { name: /volver al dashboard/i })).toBeVisible();

    // Click return button
    await page.getByRole("link", { name: /volver al dashboard/i }).click();
    await page.waitForURL("**/");
  });
});
