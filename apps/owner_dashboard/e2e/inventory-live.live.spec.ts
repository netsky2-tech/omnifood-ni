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

test("the unpriced dishes explain themselves in operator copy (R16 via the UI)", async () => {
  await sharedPage.goto(`${BASE}/dish-margins`);

  // The rig data DOES have dishes the backend could not price (the E2E
  // products without an active recipe), so the attention block must be there.
  // R17/S14: it is the Dashboard's quiet attention-card pattern (glyph +
  // amber-700 text on the card surface), not a tinted notification and not an
  // assertive live region.
  const attention = sharedPage.getByTestId("dish-margins-attention");
  await expect(attention).toBeVisible();
  await expect(attention.locator("div[class*='bg-amber-50']")).toHaveCount(0);
  await expect(
    sharedPage.getByTestId("dish-margins-attention-severity"),
  ).toContainText("sin costo");

  // AP-10 / §30.3: no raw identifier reaches the operator copy. This is the
  // exact regression the owner reported: 'E2E Producto ...: Product
  // 21beade5-dfc6-... does not have an active published recipe'.
  await expect(attention).not.toContainText(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  await expect(attention).not.toContainText(/does not have|not found/i);
  await expect(attention).toContainText(/receta publicada vigente/);

  // §12.1/§13: the table is findable by dish OR by the ingredient that carries
  // its cost. ZZ TEST Pan de Lote consumes V4-PERECEDERO-* (rig data), so the
  // ingredient search must reach it even though its name says nothing about it.
  await sharedPage.getByRole("textbox", { name: /Buscar/ }).fill("V4-PERECEDERO");
  await expect(
    sharedPage.getByRole("cell", { name: "ZZ TEST Pan de Lote" }),
  ).toBeVisible();

  await sharedPage.getByRole("textbox", { name: /Buscar/ }).fill("zzzz-no-existe");
  await expect(
    sharedPage.getByText(/No se encontraron platos/),
  ).toBeVisible();
  await expect(
    sharedPage.getByRole("button", { name: /Limpiar búsqueda/ }),
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

test("the purchase form previews the CONVERTED CPP (R1 via the UI)", async () => {
  await sharedPage.goto(`${BASE}/inventory`);
  await sharedPage.getByTestId("inventory-tab-purchases").click();
  await sharedPage.getByTestId("purchases-register-btn").click();

  await sharedPage.getByTestId("purchases-form-supplier").click();
  await sharedPage
    .getByRole("option", { name: /ZZ TEST Proveedor Rig/ })
    .click();

  // A real lb -> kg insumo (stored factor 0.4536): 10 lb at C$100/lb is
  // 4.5360 kg at C$220.4586/kg. The preview must show the CONVERTED unit
  // cost, never the raw 100.
  await sharedPage.getByTestId("purchases-form-insumo").click();
  await sharedPage.getByRole("option", { name: /^R10-CONV/ }).click();

  await sharedPage.getByTestId("purchases-form-quantity").fill("10");
  await sharedPage.getByTestId("purchases-form-unit-cost").fill("100");
  // The preview also requires the invoice (the form says so explicitly):
  // proveedor, insumo, cantidad, costo y factura.
  await sharedPage
    .getByTestId("purchases-form-invoice-number")
    .fill(`E2E-R1-${Date.now()}`);

  await expect(
    sharedPage.getByTestId("purchases-preview-projected"),
  ).toContainText("C$220.46", { timeout: 15_000 });
});

test("the product form creates a product against the live rig", async () => {
  await sharedPage.goto(`${BASE}/products`);
  await sharedPage
    .getByRole("button", { name: /Nuevo Producto/ })
    .click();
  await sharedPage
    .getByPlaceholder("Ej: Taza de Capuccino")
    .fill(`E2E Producto ${Date.now()}`);
  // Unit of measure is a native select fed by the tenant catalog; option 0
  // is the 'Seleccionar UOM' placeholder.
  await sharedPage.locator("select").first().selectOption({ index: 1 });
  // The submit stays disabled until the type question is answered.
  await sharedPage.getByRole("radio").first().check();
  await sharedPage.getByRole("button", { name: "Crear", exact: true }).click();

  await expect(
    sharedPage.getByPlaceholder("Ej: Taza de Capuccino"),
  ).toBeHidden({ timeout: 15_000 });
});

test("the purchase form enforces NET cost on insumos declaring IVA (R9 via UI)", async () => {
  const ivaInsumoName = `E2E IVA 15 ${Date.now()}`;
  await openInsumoForm(ivaInsumoName);
  await pickUom("purchase", /kilogramo/i);
  await pickUom("consumption", /^gramo/i);
  await sharedPage.getByTestId("insumo-form-conversion-factor").fill("1000");
  await sharedPage.getByTestId("insumo-form-iva-rate").fill("15");
  await sharedPage.getByTestId("insumo-form-submit").click();
  await expect(sharedPage.getByTestId("insumo-form-error")).toBeHidden();

  // Go to Purchases tab and register a purchase for this new IVA insumo
  await sharedPage.getByTestId("inventory-tab-purchases").click();
  await sharedPage.getByTestId("purchases-register-btn").click();

  await sharedPage.getByTestId("purchases-form-supplier").click();
  await sharedPage
    .getByRole("option", { name: /ZZ TEST Proveedor Rig/ })
    .click();

  await sharedPage.getByTestId("purchases-form-insumo").click();
  await sharedPage.getByRole("option", { name: new RegExp(ivaInsumoName) }).click();

  // The IVA guard box MUST appear
  await expect(
    sharedPage.getByTestId("purchases-form-iva-guard-box"),
  ).toBeVisible();
  await expect(
    sharedPage.getByTestId("purchases-form-iva-guard-box"),
  ).toContainText("15%");

  await sharedPage.getByTestId("purchases-form-quantity").fill("5");
  await sharedPage.getByTestId("purchases-form-unit-cost").fill("115");
  await sharedPage
    .getByTestId("purchases-form-invoice-number")
    .fill(`E2E-IVA-${Date.now()}`);

  // Selecting "El costo incluye IVA" must disable the submit button (NIC 2 compliance)
  await sharedPage.getByTestId("purchases-form-cost-gross").check();
  await expect(
    sharedPage.getByTestId("purchases-form-submit"),
  ).toBeDisabled();

  // Switching to "Confirmo que el costo es NETO" enables submit and allows registering
  await sharedPage.getByTestId("purchases-form-cost-net").check();
  await expect(
    sharedPage.getByTestId("purchases-form-submit"),
  ).toBeEnabled();
  await sharedPage.getByTestId("purchases-form-submit").click();

  // Dialog closes on success
  await expect(
    sharedPage.getByTestId("purchases-form-error"),
  ).toBeHidden();
});

test("the recipe form pairs Tipo, ingredient and its real unit (R15 via the UI)", async () => {
  await sharedPage.goto(`${BASE}/recipes`);
  const dialog = sharedPage.getByRole("dialog");

  // Any compound card opens the form; the save button tells whether the
  // product already has a recipe (Actualizar) or not (Crear).
  await sharedPage
    .getByRole("button", { name: /^(Crear|Editar) Receta$/ })
    .first()
    .click();
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Agregar Ingrediente" }).click();

  // Pick a real rig insumo: the pair must stick and unlock the unit field
  // with the insumo's consumption UOM (never "Base", never "(undefined)").
  await dialog.getByRole("combobox", { name: /Ingrediente/ }).click();
  await sharedPage
    .getByRole("option", { name: /^Café en Grano Matagalpa/ })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: /Ingrediente/ }),
  ).toContainText("Café en Grano Matagalpa");
  const uom = dialog.getByRole("combobox", { name: /Unidad de Medida/ });
  await expect(uom).toBeEnabled();
  await expect(uom).toContainText("kg");

  // Tipo -> Sub-receta clears the ingredient and hides the unit (a sub-recipe
  // has no consumption unit).
  await dialog.getByRole("combobox", { name: /Tipo/ }).click();
  await sharedPage.getByRole("option", { name: "Sub-receta" }).click();
  await expect(dialog.getByRole("combobox", { name: /Tipo/ })).toContainText(
    "Sub-receta",
  );
  await expect(
    dialog.getByRole("combobox", { name: /Ingrediente/ }),
  ).toContainText("Seleccione un ingrediente");
  await expect(
    dialog.getByRole("combobox", { name: /Unidad de Medida/ }),
  ).toHaveCount(0);

  // Back to Insumo, pick again and SAVE against the live rig: a brand-new
  // recipe version must be accepted by the backend.
  await dialog.getByRole("combobox", { name: /Tipo/ }).click();
  await sharedPage.getByRole("option", { name: "Insumo" }).click();
  await dialog.getByRole("combobox", { name: /Ingrediente/ }).click();
  await sharedPage
    .getByRole("option", { name: /^Café en Grano Matagalpa/ })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: /Unidad de Medida/ }),
  ).toContainText("kg");
  await dialog.getByLabel(/Cantidad Bruta/).fill("0.5");
  await dialog
    .getByRole("button", { name: /^(Crear Receta|Actualizar Receta)$/ })
    .click();

  // The toast renders twice by design: the visible card and the aria-live
  // status region, so the assertion needs the exact node.
  await expect(
    sharedPage.getByText("Receta creada correctamente", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(dialog).toBeHidden({ timeout: 10_000 });
});

test("the kardex tab renders complete taxonomy and standard controls (R19 via UI)", async () => {
  await sharedPage.goto(`${BASE}/inventory?tab=kardex&startDate=2026-10-01&endDate=2026-11-01`);

  // 1) Taxonomy check: Castigo por valuación must render for Ron Flor de Caña, not an em dash
  const florDeCanaRow = sharedPage.locator("tr", { hasText: "Ron Flor de Caña 7 Años 750ml" }).first();
  await expect(florDeCanaRow).toBeVisible();
  await expect(florDeCanaRow).toContainText("Castigo por valuación");
  await expect(florDeCanaRow).toContainText("C$300.00");

  // 2) Search functionality
  const searchInput = sharedPage.getByPlaceholder("Buscar por insumo o motivo...");
  await expect(searchInput).toBeVisible();
  await searchInput.fill("Ron Flor de Caña");
  await expect(sharedPage.locator("tr", { hasText: "Ron Flor de Caña" })).toHaveCount(2);

  // 3) Pagination range display
  await expect(sharedPage.getByText(/Mostrando 1–/i)).toBeVisible();

  // 4) Clean search
  await sharedPage.getByRole("button", { name: "Limpiar búsqueda" }).click();
  await expect(sharedPage.locator("tr", { hasText: "Ron Flor de Caña" }).first()).toBeVisible();
});
