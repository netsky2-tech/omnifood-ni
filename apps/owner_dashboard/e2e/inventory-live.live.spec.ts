import { expect, test, type Page } from "@playwright/test";
import { resolveLiveEnv, resolveLiveWebBase } from "../src/lib/live-api-base";

/**
 * LIVE smoke for the inventory surfaces (V10, odd/tasks/
 * nucleo-inventario-verificacion-pre-integracion.md). It drives a REAL browser
 * against the REAL stack: the worktree dashboard on 5174 and the rig backend on
 * :3100 with the `pilot-caf---pruebas` tenant.
 *
 * Opt-in:
 *
 *   NHILOS_LIVE_E2E=1 \
 *   NHILOS_LIVE_BASE=http://pilot-caf---pruebas.localhost:5174 \
 *   NHILOS_LIVE_API=http://127.0.0.1:3100 \
 *   npx playwright test -c playwright.live.config.ts inventory-live
 *
 * The first hostname label IS the tenant slug, so the base URL must carry the
 * rig tenant. Plain `localhost` fails closed with no login form.
 */
const LIVE = process.env.NHILOS_LIVE_E2E === "1";
const BASE = resolveLiveWebBase();
const EMAIL = resolveLiveEnv("NHILOS_LIVE_EMAIL", "sofia@omnifood.ni");
const PASSWORD = resolveLiveEnv("NHILOS_LIVE_PASSWORD", "password123");

test.describe.configure({ mode: "serial" });

test.skip(!LIVE, "live-stack spec: set NHILOS_LIVE_E2E=1 to run it");

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder("admin@negocio.com").fill(EMAIL);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

test("the inventory surface loads against the live rig", async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/inventory`);
  await expect(page).toHaveURL(/\/inventory/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the recipes surface loads against the live rig", async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/recipes`);
  await expect(page).toHaveURL(/\/recipes/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
