import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveLiveEnv, resolveLiveWebBase } from "../src/lib/live-api-base";

const LIVE = process.env.NHILOS_LIVE_E2E === "1";
const BASE = resolveLiveWebBase();
const EMAIL = resolveLiveEnv("NHILOS_LIVE_EMAIL", "sofia@omnifood.ni");
const PASSWORD = resolveLiveEnv("NHILOS_LIVE_PASSWORD", "password123");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(HERE, "../../../docs/nhilos/manuals/images");

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

test.skip(!LIVE, "Set NHILOS_LIVE_E2E=1 to run generic media capture");

async function capture(page: Page, fileName: string) {
  await page.screenshot({
    path: path.join(IMAGES_DIR, fileName),
    fullPage: false,
  });
  console.log(`[media-capture] Captured: ${fileName}`);
}

async function login(page: Page) {
  page.on("console", (msg) => console.log(`[browser console] ${msg.type()}: ${msg.text()}`));
  page.on("requestfailed", (req) => console.log(`[browser request failed] ${req.url()} ${req.failure()?.errorText}`));
  page.on("response", (res) => console.log(`[browser response] ${res.url()} ${res.status()}`));

  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder("admin@negocio.com").fill(EMAIL);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

test("captures missing web media assets on fixture tenant", async ({ page }) => {
  await login(page);

  // 1. MEDIA-DASH-02: Top products ranking in Sales -> Top Productos tab
  await page.goto(`${BASE}/sales?tab=products&startDate=2026-08-01&endDate=2026-12-31`);
  await expect(page.getByRole("heading", { name: "Ventas", exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await capture(page, "dsh_19_top_productos.png");

  // 2. MEDIA-INV-01: Recetas / BOM with real compound product expanded
  await page.goto(`${BASE}/recipes`);
  await expect(page.getByRole("heading", { level: 1, name: "Recetas y BOM" })).toBeVisible();
  // Click on the first compound product card to expand its recipe
  const productCard = page.locator("button, div").filter({ hasText: "Hamburguesa Clásica con Papas" }).first();
  if (await productCard.isVisible()) {
    await productCard.click();
    await page.waitForTimeout(1000);
  }
  await capture(page, "dsh_16_recetas_bom.png");

  // 1. MEDIA-INV-02: Kardex in inventory module with date range covering movements
  await page.goto(`${BASE}/inventory?tab=kardex&startDate=2026-09-01&endDate=2026-10-31`);
  await expect(page.getByRole("heading", { level: 1, name: "Inventario" })).toBeVisible();
  // Wait for kardex table rows to load
  await expect(page.getByRole("table")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1000);
  await capture(page, "dsh_20_kardex_delta_ledger.png");

  // 4. MEDIA-ONB-01: Setup Center
  await page.goto(`${BASE}/settings?tab=setup`);
  await expect(page.getByRole("heading", { name: "Configuración & Onboarding" })).toBeVisible();
  await page.waitForTimeout(1500);
  await capture(page, "dsh_21_setup_center.png");

  // 5. MEDIA-ONB-01 secondary: Menu Import Wizard
  await page.goto(`${BASE}/settings?tab=import`);
  await expect(page.getByRole("heading", { name: "Configuración & Onboarding" })).toBeVisible();
  await page.waitForTimeout(1500);
  await capture(page, "dsh_22_menu_import_wizard.png");
});
