import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requiredLiveEnv, resolveLiveEnv } from "../src/lib/live-api-base";

/**
 * MANUAL SCREENSHOT CAPTURE for the owner-dashboard operation manual.
 *
 * Drives the REAL UI against the REAL live stack (Vite 5174 + NestJS 3300 +
 * real Postgres) and writes every capture straight into the manual's images
 * directory. It exists so the manual shows what the system ACTUALLY does,
 * never a mocked or retouched state.
 *
 * Opt-in (needs the live stack + the soho seeded credential):
 *
 *   NHILOS_MANUAL_CAPTURE=1 npx playwright test -c playwright.live.config.ts manual-screenshots
 *
 * Operator contract (npm run test:e2e:capture, from apps/owner_dashboard):
 *
 * - Runs against the REAL `soho` tenant, NOT the `soho-test-fixture` tenant
 *   used by the automated live suites: the walkthrough data this spec
 *   navigates by (`CAFÉ CALIENTE` category, `Americano 12oz` product, and
 *   exactly 3 active modifier groups) only exists in `soho`.
 * - Required environment variables:
 *   - `NHILOS_MANUAL_CAPTURE=1` — the opt-in gate (own gate, NOT
 *     `NHILOS_LIVE_E2E`).
 *   - `MANUAL_E2E_BASE_URL` — optional web origin; defaults to
 *     `http://soho.localhost:5174`.
 *   - `MANUAL_E2E_EMAIL` — optional login email; defaults to
 *     `admin@soho.com`.
 *   - `MANUAL_E2E_PASS` — REQUIRED, no committed default: the credential is
 *     read with `requiredLiveEnv` and unset/blank fails the run before any
 *     navigation (issue #839).
 *
 * Facts a reader should know before trusting these captures:
 *
 * - Gated by NHILOS_MANUAL_CAPTURE (own gate, NOT NHILOS_LIVE_E2E): the
 *   normal live suite must never regenerate manual images as a side effect.
 *
 * - Serial tests, shared module state: the walkthrough group created here is
 *   attached, inherited, deactivated and cleaned up by the later tests. The
 *   final test proves the soho tenant is left with exactly its original 3
 *   active groups.
 *
 * - The backend only offers SOFT delete for modifier groups (is_active=false,
 *   DGI-style audit discipline), so "deleting" the walkthrough group means
 *   detaching it from the category and deactivating it. The cleanup asserts
 *   the active list is back to the original 3 groups.
 *
 * - Every capture is guarded by a key-state assertion (heading, badge, row or
 *   toast) so an image can never show a wrong or half-loaded screen.
 */

const CAPTURE = process.env.NHILOS_MANUAL_CAPTURE === "1";
// Targets (base URL, email) keep their canonical defaults (issue #828);
// the PASSWORD is a credential and must come from the environment, never a
// committed fallback (issue #839). It is required when the run actually
// starts (below), NOT at module scope: module scope also executes during
// `playwright test --list`, and listing must keep working without the
// credential. The requirement still lands before the first navigation.
const BASE = resolveLiveEnv("MANUAL_E2E_BASE_URL", "http://soho.localhost:5174");
const EMAIL = resolveLiveEnv("MANUAL_E2E_EMAIL", "admin@soho.com");
let PASSWORD = "";
test.beforeAll(() => {
  if (CAPTURE) {
    PASSWORD = requiredLiveEnv("MANUAL_E2E_PASS");
  }
});

// Tenant binding guard, evaluated at module scope BEFORE any navigation.
// This spec navigates with its own absolute BASE (MANUAL_E2E_BASE_URL) on
// every page.goto, so NHILOS_LIVE_BASE — the variable playwright.live.config.ts
// uses for baseURL — silently does nothing here. An operator who sets only
// the canonical variable would capture against whichever tenant the host
// actually names, while believing they overrode it; a wrong tenant yields
// captures taken under the wrong identity (the walkthrough data above only
// exists in `soho`).
const EXPECTED_TENANT_LABEL = "soho";
const BASE_TENANT_LABEL = new URL(BASE).hostname.split(".")[0];
if (BASE_TENANT_LABEL !== EXPECTED_TENANT_LABEL) {
  throw new Error(
    `manual-capture spec targets tenant "${EXPECTED_TENANT_LABEL}" but ` +
      `MANUAL_E2E_BASE_URL points at "${BASE_TENANT_LABEL}" ` +
      `(${BASE}). Point MANUAL_E2E_BASE_URL at ` +
      `${EXPECTED_TENANT_LABEL}.localhost:<port> or update the spec's ` +
      "expected tenant deliberately.",
  );
}

// Walkthrough data (section 6 narrative): one plausibly-named group with two
// options carrying real price deltas, attached to a category that really has
// products so the inheritance capture is genuine.
const GROUP = "Jarabes";
const OPTION_1 = "Vainilla";
const OPTION_1_PRICE = "15.00";
const OPTION_2 = "Caramelo";
const OPTION_2_PRICE = "5.00";
const CATEGORY_LABEL = "CAFÉ CALIENTE";
const PRODUCT = "Americano 12oz";

// ESM: rebuild __dirname from import.meta.url.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(
  HERE,
  "../../../docs/nhilos/manuals/images",
);

test.describe.configure({ mode: "serial" });

test.use({ viewport: { width: 1440, height: 900 } });

// The config's per-test budget is tight for the multi-step walkthrough; give
// every capture test room to breathe without weakening any assertion.
test.setTimeout(120_000);

test.skip(
  !CAPTURE,
  "manual-capture spec: set NHILOS_MANUAL_CAPTURE=1 to regenerate the manual images",
);

/** Capture the current 1440x900 viewport into the manual images directory. */
async function capture(page: Page, fileName: string) {
  await page.screenshot({
    path: path.join(IMAGES_DIR, fileName),
    fullPage: false,
  });
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder("admin@negocio.com").fill(EMAIL);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

async function openModifiers(page: Page) {
  await page.goto(`${BASE}/modifiers`);
  await expect(
    page.getByRole("heading", { name: "Modificadores", exact: true }),
  ).toBeVisible();
}

/** The bordered box that contains a section heading ("Heredado…", etc.). */
function sectionBox(page: Page, heading: string) {
  return page
    .getByText(heading, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]");
}

test("captures the static reference screens (login, KPIs month view, ventas, productos, caja, fiscal, inventario, recetas, usuarios)", async ({
  page,
}) => {
  // dsh_01: the login screen itself, logged out, reached from the base URL.
  await page.goto(`${BASE}/`);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByPlaceholder("admin@negocio.com")).toBeVisible();
  await capture(page, "dsh_01_login.png");

  await login(page);

  // dsh_02: dashboard overview filtered with the "Este mes" preset, so the
  // manual shows real KPIs, the sales-evolution chart and populated
  // breakdowns instead of the empty first-day view (the tenant's sales live
  // earlier in the month, not on "today").
  await page.goto(`${BASE}/`);
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Ventas Netas", { exact: true })).toBeVisible();
  await expect(page.getByText("Ticket Promedio", { exact: true })).toBeVisible();

  const rangeTrigger = page.getByRole("button", {
    name: "Seleccionar rango de fechas",
  });
  await rangeTrigger.click();
  await page.getByRole("button", { name: "Este mes", exact: true }).click();

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const month = pad(now.getMonth() + 1);
  const today = `${pad(now.getDate())}/${month}/${now.getFullYear()}`;
  const firstOfMonth = `01/${month}/${now.getFullYear()}`;
  await expect(rangeTrigger).toContainText(firstOfMonth);
  await expect(rangeTrigger).toContainText(today);

  // Key state that keeps the month capture honest: the net-sales KPI carries
  // the month's real total, the "no activity" note is gone, and the
  // evolution chart renders (its "pick 2+ days" placeholder must disappear).
  // (the total renders in more than one card — net sales and gross margin —
  // so assert the first occurrence instead of a multi-match locator)
  await expect(page.getByText(/4,571\.00/).first()).toBeVisible();
  await expect(
    page.getByText("sin actividad registrada en este periodo"),
  ).toHaveCount(0);
  await expect(
    page.getByText("Evolución de ventas", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Seleccione un rango de 2 o más días"),
  ).toHaveCount(0);
  await capture(page, "dsh_02_kpis_ventas.png");

  // dsh_03: Ventas section, Resumen tab (ventas/comprobantes overview).
  await page.goto(`${BASE}/sales`);
  await expect(
    page.getByRole("heading", { name: "Ventas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Secciones de ventas" }),
  ).toBeVisible();
  await expect(page.getByText("Ventas Brutas", { exact: true })).toBeVisible();
  await capture(page, "dsh_03_historial_comprobantes.png");

  // dsh_04: full product catalog — the "Total: N productos" counter proves
  // the list finished loading with the real SOHO catalog size.
  await page.goto(`${BASE}/products`);
  await expect(
    page.getByRole("heading", { name: "Productos", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Total: \d+ productos/)).toBeVisible();
  const total = await page.getByText(/Total: \d+ productos/).textContent();
  console.log(`[manual-capture] product catalog counter: ${total}`);
  await capture(page, "dsh_04_catalogo_productos.png");

  // dsh_05: cash sessions — wait out the loading state explicitly.
  await page.goto(`${BASE}/cash`);
  await expect(
    page.getByRole("heading", { name: "Sesiones de Caja" }),
  ).toBeVisible();
  await expect(
    page.getByText("Cargando sesiones de caja..."),
  ).toBeHidden();
  await capture(page, "dsh_05_sesiones_caja.png");

  // dsh_06: fiscal module, monthly DGI summary loaded.
  await page.goto(`${BASE}/fiscal`);
  await expect(
    page.getByRole("heading", { name: "Fiscal", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Resumen Fiscal (DGI)" }),
  ).toBeVisible();
  await capture(page, "dsh_06_fiscal.png");

  // dsh_15: inventory module landing (section 7) — Day-1 state: the catalog
  // still sells SIMPLE products, recipes not loaded yet.
  await page.goto(`${BASE}/inventory`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Inventario", exact: true }),
  ).toBeVisible();
  await capture(page, "dsh_15_inventario.png");

  // dsh_16: recipes & BOM (section 7) — the empty state a Day-1 tenant sees,
  // matching the section's "when recipes are loaded" note.
  await page.goto(`${BASE}/recipes`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Recetas y BOM",
      exact: true,
    }),
  ).toBeVisible();
  await capture(page, "dsh_16_recetas_bom.png");

  // dsh_17: users, roles and permissions (section 9) — the real users page
  // with its roles/permissions card.
  await page.goto(`${BASE}/users`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Gestión de Usuarios" }),
  ).toBeVisible();
  await capture(page, "dsh_17_gestion_usuarios.png");
});

test("shows the Modificadores Grupos tab with the three real groups", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  const tablist = page.getByRole("tablist", {
    name: "Secciones de modificadores",
  });
  await expect(
    tablist.getByRole("tab", { name: "Grupos", exact: true }),
  ).toBeVisible();

  // Key state: the three real seeded groups are in the list.
  for (const name of ["Leche", "Endulzante", "Extras"]) {
    await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
  }

  await capture(page, "dsh_07_modificadores_grupos.png");
});

test("walkthrough: creates the group, adds its options in the edit dialog and shows it listed", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  // dsh_09 must be recaptured on EVERY run: the manual's Paso 1 shows the
  // pristine create dialog over a list without the walkthrough group. Under
  // the default Activos filter the only way that group could leak into the
  // background is an interrupted run that left it active — deactivate it
  // first and wait for the toast to leave the frame so it never lands in
  // the screenshot.
  // Anchor on an always-visible row first so the list has actually loaded
  // before counting (otherwise a slow list reads as "group absent" and the
  // stale row could render behind the dialog).
  await expect(page.getByRole("row").filter({ hasText: "Leche" })).toBeVisible({
    timeout: 20_000,
  });
  let row = page.getByRole("row").filter({ hasText: GROUP });
  if ((await row.count()) > 0) {
    await page
      .getByRole("button", { name: `Desactivar grupo ${GROUP}` })
      .click();
    const deactivateDialog = page.getByRole("dialog");
    await expect(
      deactivateDialog.getByRole("heading", { name: "Desactivar grupo" }),
    ).toBeVisible();
    await deactivateDialog
      .getByRole("button", { name: "Desactivar grupo" })
      .click();
    await expect(
      page.getByText("Grupo desactivado", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Grupo desactivado", { exact: true }),
    ).toBeHidden({ timeout: 15_000 });
  }
  // The assertion that keeps Paso 1 honest: no walkthrough row may be in the
  // background (fresh tenant: never created; re-run: inactive, hidden by
  // the Activos filter).
  await expect(
    page.getByRole("row").filter({ hasText: GROUP }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Nuevo grupo" }).click();
  const captureDialog = page.getByRole("dialog");
  await expect(
    captureDialog.getByRole("heading", { name: "Nuevo grupo de modificadores" }),
  ).toBeVisible();
  await capture(page, "dsh_09_crear_grupo_modificador.png");
  await captureDialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // Re-run safety: the backend only soft-deletes groups, so an interrupted
  // capture run may have left the walkthrough group behind. Reuse it instead
  // of colliding with the 409 duplicate-name error; the options-editor
  // capture (dsh_10) is the only one a populated reuse run skips.
  await page
    .getByRole("group", { name: "Filtrar grupos por estado" })
    .getByRole("button", { name: "Todos", exact: true })
    .click();
  // The reuse check must run against the LOADED list: anchor on a group that
  // always exists (Leche) so the fetch has visibly resolved before counting.
  await expect(page.getByRole("row").filter({ hasText: "Leche" })).toBeVisible({
    timeout: 20_000,
  });
  row = page.getByRole("row").filter({ hasText: GROUP });
  const reused = (await row.count()) > 0;

  if (reused && (await row.getByText("Desactivado").count()) > 0) {
    await page
      .getByRole("button", { name: `Activar grupo ${GROUP}` })
      .click();
    const reactivateDialog = page.getByRole("dialog");
    await expect(
      reactivateDialog.getByRole("heading", { name: "Activar grupo" }),
    ).toBeVisible();
    await reactivateDialog
      .getByRole("button", { name: "Activar grupo" })
      .click();
    await expect(
      page.getByText("Grupo activado", { exact: true }),
    ).toBeVisible();
  }

  if (!reused) {
    await page.getByRole("button", { name: "Nuevo grupo" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Nuevo grupo de modificadores" }),
    ).toBeVisible();

    // The real UI only offers the options editor once the group exists
    // (modifier-group-form gates it behind isEditing), so the honest flow is:
    // save the group rules first, then add the options through the edit dialog.
    await dialog.getByLabel("Nombre *").fill(GROUP);
    await dialog.getByLabel("Mínimo de selección").fill("0");
    await dialog.getByLabel("Máximo de selección").fill("2");
    await dialog.getByRole("switch", { name: "Permitir cantidades" }).click();
    await dialog.getByRole("button", { name: "Crear", exact: true }).click();
    await expect(
      page.getByText("Grupo creado", { exact: true }),
    ).toBeVisible();
  }

  // Back to the default active filter: the group must be listed as active.
  await page
    .getByRole("group", { name: "Filtrar grupos por estado" })
    .getByRole("button", { name: "Activos", exact: true })
    .click();
  row = page.getByRole("row").filter({ hasText: GROUP });
  await expect(row).toBeVisible();

  if ((await row.getByText("2 opciones").count()) === 0) {
    // Reopen the group and load its options with real price deltas.
    await page.getByRole("button", { name: `Editar grupo ${GROUP}` }).click();
    const editDialog = page.getByRole("dialog");
    await expect(
      editDialog.getByRole("heading", {
        name: "Editar grupo de modificadores",
      }),
    ).toBeVisible();
    await editDialog.getByRole("button", { name: "Agregar opción" }).click();
    await editDialog.getByRole("button", { name: "Agregar opción" }).click();
    await page.getByLabel("Nombre de la opción 1").fill(OPTION_1);
    await page
      .getByLabel(`Precio adicional de la opción ${OPTION_1}`)
      .fill(OPTION_1_PRICE);
    await page.getByLabel("Nombre de la opción 2").fill(OPTION_2);
    await page
      .getByLabel(`Precio adicional de la opción ${OPTION_2}`)
      .fill(OPTION_2_PRICE);

    // dsh_10: the group dialog fully filled BEFORE saving — rules plus the
    // two options with their price deltas, exactly as the owner leaves them.
    await expect(editDialog.getByLabel("Nombre *")).toHaveValue(GROUP);
    await expect(
      page.getByLabel(`Nombre de la opción ${OPTION_1}`),
    ).toHaveValue(OPTION_1);
    await expect(
      page.getByLabel(`Nombre de la opción ${OPTION_2}`),
    ).toHaveValue(OPTION_2);
    await capture(page, "dsh_10_formulario_grupo_completo.png");

    await editDialog.getByRole("button", { name: "Actualizar" }).click();
  }

  // dsh_11: post-save state — the group row with its options under the
  // default Activos filter. On the reuse path a stale "Grupo activado" toast
  // would contradict the just-saved narrative, so let it fade first; on the
  // fresh path the "Grupo creado/actualizado" toast stays in frame on purpose.
  if (reused) {
    await expect(
      page.getByText("Grupo activado", { exact: true }),
    ).toBeHidden({ timeout: 15_000 });
  }
  await expect(row).toContainText("2 opciones");
  await expect(row).toContainText("Con cantidades");
  await capture(page, "dsh_11_grupo_creado_con_opciones.png");
});

test("walkthrough: the group survives a full reload (the real persistence proof)", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  await page.reload();
  const row = page.getByRole("row").filter({ hasText: GROUP });
  await expect(row).toBeVisible();
  await expect(row).toContainText("2 opciones");
  await expect(row).toContainText("Con cantidades");

  // dsh_12: same group and options AFTER the reload — server-proven state.
  await capture(page, "dsh_12_persistencia_tras_recarga.png");
});

test("walkthrough: attaches the group to the CAFE category", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  await page.getByRole("tab", { name: "Por categoría", exact: true }).click();
  await page.getByLabel("Categoría").selectOption({ label: CATEGORY_LABEL });
  // Load anchor: the category data must be on screen before counting buttons.
  await expect(
    page.getByText("Grupos de la categoría", { exact: true }),
  ).toBeVisible();

  // Exactly one of the two states must be on screen once the category data
  // settles: the attach button (fresh) or the detach button (already there).
  // A plain count() races the fetch, so poll until the state is unambiguous.
  let freshAttach = false;
  await expect(async () => {
    const quitar = await page
      .getByRole("button", { name: `Quitar ${GROUP} de la categoría` })
      .count();
    const agregar = await page
      .getByRole("button", { name: `Agregar grupo ${GROUP}` })
      .count();
    expect(quitar + agregar).toBe(1);
    freshAttach = agregar > 0;
  }).toPass();
  const attachButton = page.getByRole("button", {
    name: `Agregar grupo ${GROUP}`,
  });
  if (freshAttach) {
    await attachButton.click();
    await expect(
      page.getByText("Grupo agregado a la categoría", { exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: `Quitar ${GROUP} de la categoría` }),
  ).toBeVisible();

  // dsh_08: the Por categoría tab right after the real attachment (toast +
  // the walkthrough group in the category's assigned list).
  if (freshAttach) {
    await capture(page, "dsh_08_modificadores_categoria.png");
  }
});

test("walkthrough: a product of that category inherits the group", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  await page.getByRole("tab", { name: "Por producto", exact: true }).click();
  await page.getByLabel("Buscar producto").fill("Americano");
  await page.getByRole("option", { name: PRODUCT }).click();

  // Server-side effective resolution: the category attachment is real, so
  // the product shows the group as inherited — this cannot be faked client-side.
  const inheritedBox = sectionBox(page, "Heredado de la categoría");
  await expect(inheritedBox).toBeVisible();
  const inheritedRow = inheritedBox.locator("li").filter({ hasText: GROUP });
  await expect(inheritedRow.filter({ hasText: "Heredado" })).toHaveCount(1);

  // dsh_13: product view with the "Heredado" badge on the walkthrough group.
  await capture(page, "dsh_13_producto_heredado.png");
});

test("walkthrough: deactivates the group and shows it under Todos with reactivation", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  await page.getByRole("tab", { name: "Grupos", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "Leche" })).toBeVisible({
    timeout: 20_000,
  });
  // Skip the dialog flow if a previous run already deactivated the group.
  if ((await page.getByRole("row").filter({ hasText: GROUP }).count()) > 0) {
    await page
      .getByRole("button", { name: `Desactivar grupo ${GROUP}` })
      .click();
    const confirmDialog = page.getByRole("dialog");
    await expect(
      confirmDialog.getByRole("heading", { name: "Desactivar grupo" }),
    ).toBeVisible();
    await confirmDialog
      .getByRole("button", { name: "Desactivar grupo" })
      .click();
    await expect(
      page.getByText("Grupo desactivado", { exact: true }),
    ).toBeVisible();
  }

  // The default filter is Activos; switch to Todos to prove the badge and
  // the reactivation affordance — the key state for dsh_14.
  await page
    .getByRole("group", { name: "Filtrar grupos por estado" })
    .getByRole("button", { name: "Todos", exact: true })
    .click();
  const row = page.getByRole("row").filter({ hasText: GROUP });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Desactivado");
  await expect(
    page.getByRole("button", { name: `Activar grupo ${GROUP}` }),
  ).toBeVisible();

  await capture(page, "dsh_14_desactivacion_grupo.png");
});

test("cleanup: detaches the category attachment and leaves exactly the 3 original active groups", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  // The dsh_14 test deactivated the group, and the category page only lists
  // ACTIVE groups on either side. Reactivate first so the attachment can be
  // removed, then deactivate again at the end.
  await page
    .getByRole("group", { name: "Filtrar grupos por estado" })
    .getByRole("button", { name: "Todos", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: GROUP }).getByText("Desactivado"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Activar grupo ${GROUP}` })
    .click();
  const reactivateDialog = page.getByRole("dialog");
  await expect(
    reactivateDialog.getByRole("heading", { name: "Activar grupo" }),
  ).toBeVisible();
  await reactivateDialog
    .getByRole("button", { name: "Activar grupo" })
    .click();
  await expect(
    page.getByText("Grupo activado", { exact: true }),
  ).toBeVisible();

  // Detach the walkthrough group from CAFÉ CALIENTE while it is active.
  await page.getByRole("tab", { name: "Por categoría", exact: true }).click();
  await page.getByLabel("Categoría").selectOption({ label: CATEGORY_LABEL });
  await expect(
    page.getByText("Grupos de la categoría", { exact: true }),
  ).toBeVisible();
  // Same settle rule as the attach test: poll until the detach button is
  // genuinely there (or the group is already detached, leaving Agregar).
  let needsDetach = false;
  await expect(async () => {
    const quitar = await page
      .getByRole("button", { name: `Quitar ${GROUP} de la categoría` })
      .count();
    const agregar = await page
      .getByRole("button", { name: `Agregar grupo ${GROUP}` })
      .count();
    expect(quitar + agregar).toBe(1);
    needsDetach = quitar > 0;
  }).toPass();
  if (needsDetach) {
    await page
      .getByRole("button", { name: `Quitar ${GROUP} de la categoría` })
      .click();
    const detachDialog = page.getByRole("dialog");
    await expect(
      detachDialog.getByRole("heading", {
        name: "Quitar grupo de la categoría",
      }),
    ).toBeVisible();
    await detachDialog.getByRole("button", { name: "Quitar grupo" }).click();
    await expect(
      page.getByText("Grupo quitado de la categoría", { exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: `Agregar grupo ${GROUP}` }),
  ).toBeVisible();

  // Deactivate the walkthrough group again: the backend has no hard delete
  // by design (DGI audit discipline), so soft-deactivation is the terminal
  // cleanup state. Verify via the UI that the ACTIVE list is back to
  // exactly the original 3 groups.
  await page.getByRole("tab", { name: "Grupos", exact: true }).click();
  // Deactivate only if a previous run has not already done it.
  await expect(page.getByRole("row").filter({ hasText: "Leche" })).toBeVisible({
    timeout: 20_000,
  });
  if ((await page.getByRole("row").filter({ hasText: GROUP }).count()) > 0) {
    await page
      .getByRole("button", { name: `Desactivar grupo ${GROUP}` })
      .click();
    const deactivateDialog = page.getByRole("dialog");
    await expect(
      deactivateDialog.getByRole("heading", { name: "Desactivar grupo" }),
    ).toBeVisible();
    await deactivateDialog
      .getByRole("button", { name: "Desactivar grupo" })
      .click();
    await expect(
      page.getByText("Grupo desactivado", { exact: true }),
    ).toBeVisible();
  }

  await expect(
    page
      .getByRole("group", { name: "Filtrar grupos por estado" })
      .getByRole("button", { name: "Activos", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  for (const name of ["Leche", "Endulzante", "Extras"]) {
    await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: name })
        .getByText("Desactivado"),
    ).toHaveCount(0);
  }
  await expect(
    page.getByRole("row").filter({ hasText: GROUP }),
  ).toHaveCount(0);

  // And the inactive walkthrough group only shows up under Todos/Inactivos,
  // confirming it is not part of the active set the POS resolves.
  await page
    .getByRole("group", { name: "Filtrar grupos por estado" })
    .getByRole("button", { name: "Todos", exact: true })
    .click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: GROUP })
      .getByText("Desactivado"),
  ).toBeVisible();
});
