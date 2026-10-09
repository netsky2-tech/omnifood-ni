import { expect, test, type Page } from "@playwright/test";

/**
 * LIVE end-to-end for the owner-dashboard Modificadores flow.
 *
 * Unlike the specs that intercept the API, this one drives a REAL browser
 * against the REAL stack: dev server 5174 (this worktree's code) + NestJS at
 * 127.0.0.1:3300 + real Postgres. It is the only way to prove that the
 * effective resolution shown to the owner (category inheritance vs product
 * exception) is what the backend actually resolves, and that what the form
 * saves actually persists.
 *
 * Opt-in (needs live stack + seeded credential):
 *
 *   NHILOS_LIVE_E2E=1 npx playwright test -c playwright.live.config.ts
 *
 * Facts a reader should know before trusting these assertions:
 *
 * - The tenant slug comes from the FIRST hostname label, so the base URL must
 *   be soho-test-fixture.localhost:5174. Plain `localhost` fails closed with
 *   no login form — that is correct behavior, not a bug.
 *
 * - The tests are SERIAL and share module-level state: the group created in
 *   test 2 is edited, attached, inherited, overridden and deactivated by the
 *   later tests. If one fails, the rest are skipped.
 *
 * - The group name embeds a run stamp so re-runs never collide with leftovers
 *   (duplicate names answer 409). The deactivated group is left behind BY
 *   DESIGN: DGI-style audit discipline in this product means the UI only ever
 *   deactivates, and the test respects that instead of deleting.
 *
 * - No route interception anywhere: every assertion reads what the server
 *   really answered. "The real proof is not a toast" — persistence is proven
 *   by a full reload, not by a success message.
 */

const LIVE = process.env.NHILOS_LIVE_E2E === "1";
const BASE =
  process.env.NHILOS_LIVE_BASE ?? "http://soho-test-fixture.localhost:5174";
const EMAIL = process.env.NHILOS_LIVE_EMAIL ?? "sofia@omnifood.ni";
const PASSWORD = process.env.NHILOS_LIVE_PASSWORD ?? "password123";

const RUN = Date.now().toString().slice(-6);
const GROUP = `E2E Extra Café ${RUN}`;
const CATEGORY_LABEL = "CAFE";
const PRODUCT = "Café Americano Preparado";

test.describe.configure({ mode: "serial" });

test.skip(!LIVE, "live-stack spec: set NHILOS_LIVE_E2E=1 to run it");

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

test("the owner logs in and sees the three modifier sections", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  const tablist = page.getByRole("tablist", {
    name: "Secciones de modificadores",
  });
  await expect(tablist).toBeVisible();
  await expect(tablist.getByRole("tab", { name: "Grupos", exact: true })).toBeVisible();
  await expect(
    tablist.getByRole("tab", { name: "Por categoría", exact: true }),
  ).toBeVisible();
  await expect(
    tablist.getByRole("tab", { name: "Por producto", exact: true }),
  ).toBeVisible();
});

test("the owner creates an optional group with quantities and it appears in the list", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  await page.getByRole("button", { name: "Nuevo grupo" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Nuevo grupo de modificadores" }),
  ).toBeVisible();

  await dialog.getByLabel("Nombre *").fill(GROUP);
  await dialog.getByLabel("Mínimo de selección").fill("0");
  await dialog.getByLabel("Máximo de selección").fill("3");
  await dialog.getByRole("switch", { name: "Permitir cantidades" }).click();
  await dialog.getByRole("button", { name: "Crear", exact: true }).click();

  // The toast confirms the action; the ROW confirms the state.
  await expect(page.getByText("Grupo creado", { exact: true })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: GROUP });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Opcional 0/3");
  await expect(row).toContainText("Con cantidades");
});

test("added options survive a full reload (the real persistence proof)", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  await page
    .getByRole("button", { name: `Editar grupo ${GROUP}` })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Editar grupo de modificadores" }),
  ).toBeVisible();

  await dialog.getByRole("button", { name: "Agregar opción" }).click();
  await dialog.getByRole("button", { name: "Agregar opción" }).click();

  // Row labels carry the option NAME once it is typed (falling back to the
  // row number while empty), so each field is addressed by its own aria label.
  await page.getByLabel("Nombre de la opción 1").fill("Extra shot");
  await page
    .getByLabel("Precio adicional de la opción Extra shot")
    .fill("15");
  await page.getByLabel("Nombre de la opción 2").fill("Vainilla");
  await page.getByLabel("Precio adicional de la opción Vainilla").fill("15");

  await dialog.getByRole("button", { name: "Actualizar" }).click();
  await expect(
    page.getByText("Grupo actualizado", { exact: true }),
  ).toBeVisible();

  // FULL RELOAD: the options must come back from the server, not from memory.
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: GROUP });
  await expect(row).toBeVisible();
  await expect(row).toContainText("2 opciones");

  await page.getByRole("button", { name: `Editar grupo ${GROUP}` }).click();
  // The backend serializes numeric price_delta as "15.00" on reload while a
  // freshly typed value reads "15"; the business fact is that the persisted
  // price IS 15, so assert the numeric value, not one display formatting.
  const extraShotPrice = page.getByLabel(
    "Precio adicional de la opción Extra shot",
  );
  await expect(
    page.getByLabel("Nombre de la opción Extra shot"),
  ).toHaveValue("Extra shot");
  await expect.poll(async () => Number(await extraShotPrice.inputValue())).toBe(15);
  await expect(
    page.getByLabel("Nombre de la opción Vainilla"),
  ).toHaveValue("Vainilla");
  const vainillaPrice = page.getByLabel(
    "Precio adicional de la opción Vainilla",
  );
  await expect.poll(async () => Number(await vainillaPrice.inputValue())).toBe(15);
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
});

test("a maximum below the minimum is refused in Spanish and the dialog stays open", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  await page.getByRole("button", { name: `Editar grupo ${GROUP}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Mínimo de selección").fill("2");
  await dialog.getByLabel("Máximo de selección").fill("1");

  await dialog.getByRole("button", { name: "Actualizar" }).click();

  // Client-side validation copy, exact business wording, no technical jargon.
  await expect(
    dialog.getByText("El máximo no puede ser menor que el mínimo"),
  ).toBeVisible();
  await expect(dialog).toBeVisible();

  // Restore the valid range and confirm the dialog actually saves now.
  await dialog.getByLabel("Mínimo de selección").fill("0");
  await dialog.getByLabel("Máximo de selección").fill("3");
  await dialog.getByRole("button", { name: "Actualizar" }).click();
  await expect(
    page.getByText("Grupo actualizado", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("a group attached to the CAFE category persists across a reload", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  await page.getByRole("tab", { name: "Por categoría", exact: true }).click();
  await page.getByLabel("Categoría").selectOption({ label: CATEGORY_LABEL });

  await page
    .getByRole("button", { name: `Agregar grupo ${GROUP}` })
    .click();
  await expect(
    page.getByText("Grupo agregado a la categoría", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Quitar ${GROUP} de la categoría` }),
  ).toBeVisible();

  // Reload: the attachment must come back from the server.
  await page.reload();
  // The tab resets to its default after a reload — re-navigate like tests 6/7.
  await page.getByRole("tab", { name: "Por categoría", exact: true }).click();
  await page.getByLabel("Categoría").selectOption({ label: CATEGORY_LABEL });
  await expect(
    page.getByRole("button", { name: `Quitar ${GROUP} de la categoría` }),
  ).toBeVisible();
});

test("the product inherits the category group and a product exception overrides it", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  await page.getByRole("tab", { name: "Por producto", exact: true }).click();
  await page.getByLabel("Buscar producto").fill("Americano");
  await page.getByRole("option", { name: PRODUCT }).click();

  // Server-side effective resolution: CAFE is attached, so the product shows
  // the group as INHERITED — this cannot be faked by client state.
  await expect(
    sectionBox(page, "Heredado de la categoría"),
  ).toBeVisible();
  const inheritedRow = sectionBox(page, "Heredado de la categoría")
    .locator("li")
    .filter({ hasText: GROUP });
  await expect(inheritedRow.filter({ hasText: "Heredado" })).toHaveCount(1);

  // Add the SAME group as a product exception. The select marks groups that
  // are already effectively present with "(ya presente)".
  const groupSelect = page.getByLabel("Grupo", { exact: true });
  await groupSelect.selectOption({ label: `${GROUP} (ya presente)` });
  await page.getByRole("button", { name: "Agregar como excepción" }).click();
  await expect(
    page.getByText("Grupo agregado al producto", { exact: true }),
  ).toBeVisible();

  // Product override wins: the group moves to "De este producto" and stops
  // being listed as inherited.
  const ownRow = sectionBox(page, "Excepciones de este producto")
    .locator("li")
    .filter({ hasText: GROUP });
  await expect(ownRow.filter({ hasText: "De este producto" })).toHaveCount(1);
  await expect(inheritedRow).toHaveCount(0);

  // Remove the exception: inheritance resumes.
  await page
    .getByRole("button", { name: `Quitar ${GROUP} de este producto` })
    .click();
  const confirm = page.getByRole("dialog");
  await expect(
    confirm.getByRole("heading", { name: "Quitar grupo del producto" }),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Quitar grupo" }).click();
  await expect(
    page.getByText("Grupo quitado del producto", { exact: true }),
  ).toBeVisible();
  await expect(inheritedRow.filter({ hasText: "Heredado" })).toHaveCount(1);
});

test("cleanup detaches the category and deactivates the group (inactive leftover by design)", async ({
  page,
}) => {
  await login(page);
  await openModifiers(page);

  // Detach from CAFE first.
  await page.getByRole("tab", { name: "Por categoría", exact: true }).click();
  await page.getByLabel("Categoría").selectOption({ label: CATEGORY_LABEL });
  await page
    .getByRole("button", { name: `Quitar ${GROUP} de la categoría` })
    .click();
  const detachDialog = page.getByRole("dialog");
  await expect(
    detachDialog.getByRole("heading", { name: "Quitar grupo de la categoría" }),
  ).toBeVisible();
  await detachDialog.getByRole("button", { name: "Quitar grupo" }).click();
  await expect(
    page.getByText("Grupo quitado de la categoría", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Agregar grupo ${GROUP}` }),
  ).toBeVisible();

  // Deactivate the group. There is NO delete in this product (only
  // is_active=false), so the deactivated group remains as an inert leftover —
  // by design, and safe for re-runs because the next run uses a new name.
  await page.getByRole("tab", { name: "Grupos", exact: true }).click();
  await page.getByRole("button", { name: `Desactivar grupo ${GROUP}` }).click();
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

  // The default filter is "Activos", so the row leaves the list; switch to
  // "Todos" and prove the badge, not just the toast.
  await page
    .getByRole("group", { name: "Filtrar grupos por estado" })
    .getByRole("button", { name: "Todos" })
    .click();
  const row = page.getByRole("row").filter({ hasText: GROUP });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Desactivado");
});
