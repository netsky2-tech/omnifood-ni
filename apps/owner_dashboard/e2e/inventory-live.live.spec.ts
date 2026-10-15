import { expect, test, type Page } from "@playwright/test";
import { resolveLiveEnv, resolveLiveWebBase } from "../src/lib/live-api-base";

/**
 * LIVE specs for the inventory surfaces (V10,
 * odd/tasks/nucleo-inventario-verificacion-pre-integracion.md). They drive a
 * REAL browser against the REAL stack: the worktree dashboard on 5174 and the
 * rig backend on :3100 with the `pilot-caf---pruebas` tenant.
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
 *
 * ONE login for the whole file: the login endpoint is throttled to 5 requests
 * per IP per minute, and the dashboard keeps the session in memory (Zustand,
 * no localStorage), so a per-test login both burns the budget and cannot be
 * reused through `storageState`.
 */
const LIVE = process.env.NHILOS_LIVE_E2E === "1";
const BASE = resolveLiveWebBase();
const EMAIL = resolveLiveEnv("NHILOS_LIVE_EMAIL", "sofia@omnifood.ni");
const PASSWORD = resolveLiveEnv("NHILOS_LIVE_PASSWORD", "password123");

test.describe.configure({ mode: "serial" });

test.skip(!LIVE, "live-stack spec: set NHILOS_LIVE_E2E=1 to run it");

let sharedPage: Page;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  sharedPage = await context.newPage();
  await sharedPage.goto(`${BASE}/login`);
  await sharedPage.getByPlaceholder("admin@negocio.com").fill(EMAIL);
  await sharedPage.getByPlaceholder("••••••••").fill(PASSWORD);
  await sharedPage.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(sharedPage).not.toHaveURL(/\/login/, { timeout: 20_000 });
});

test.afterAll(async () => {
  await sharedPage?.context().close();
});

test("the inventory surface loads against the live rig", async () => {
  await sharedPage.goto(`${BASE}/inventory`);
  await expect(sharedPage).toHaveURL(/\/inventory/);
  await expect(sharedPage.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the recipes surface loads against the live rig", async () => {
  await sharedPage.goto(`${BASE}/recipes`);
  await expect(sharedPage).toHaveURL(/\/recipes/);
  await expect(sharedPage.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the dish-margins surface prices a dish against the live rig", async () => {
  await sharedPage.goto(`${BASE}/dish-margins`);
  await expect(sharedPage).toHaveURL(/\/dish-margins/);
  await expect(
    sharedPage.getByRole("heading", { name: "Costo y margen por plato" }),
  ).toBeVisible();
  // The rig has at least one priced COMPOUND dish with an active recipe.
  await expect(
    sharedPage.getByRole("cell", { name: "ZZ TEST Pan de Lote" }),
  ).toBeVisible();
});

async function openInsumoForm(name: string): Promise<void> {
  await sharedPage.goto(`${BASE}/inventory`);
  await sharedPage.getByTestId("inventory-tab-insumos").click();
  await sharedPage.getByTestId("add-insumo-btn").click();
  await sharedPage.getByTestId("insumo-form-name").fill(name);
}

async function pickUom(
  field: "purchase" | "consumption",
  option: RegExp,
): Promise<void> {
  await sharedPage.getByTestId(`insumo-form-${field}-uom`).click();
  await sharedPage.getByRole("option", { name: option }).click();
}

test("the insumo form rejects an incoherent UOM conversion (R1 via the UI)", async () => {
  await openInsumoForm(`E2E UOM BAD ${Date.now()}`);
  // Two different units with the untouched factor 1: the catalog anchor says
  // lb -> kg must be 0.45359237, so the backend rejects it.
  await pickUom("purchase", /libra/i);
  await pickUom("consumption", /kilogramo/i);
  await sharedPage.getByTestId("insumo-form-conversion-factor").fill("1");
  await sharedPage.getByTestId("insumo-form-submit").click();

  await expect(sharedPage.getByTestId("insumo-form-error")).toContainText(
    /catálogo establece/i,
  );
});

test("the insumo form accepts a coherent conversion (R1 via the UI)", async () => {
  await openInsumoForm(`E2E UOM OK ${Date.now()}`);
  await pickUom("purchase", /kilogramo/i);
  // Anchored: /gramo/i also matches 'Kilogramo'.
  await pickUom("consumption", /^gramo/i);
  await sharedPage.getByTestId("insumo-form-conversion-factor").fill("1000");
  await sharedPage.getByTestId("insumo-form-submit").click();

  await expect(sharedPage.getByTestId("insumo-form-error")).toBeHidden();
});
