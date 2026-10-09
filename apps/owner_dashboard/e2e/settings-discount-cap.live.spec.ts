import { expect, test } from "@playwright/test";

/**
 * LIVE end-to-end for the owner's manual-discount cap management.
 *
 * Unlike the other specs in this directory, this one does NOT intercept the
 * API: it drives a real browser against a real backend (the dev server proxies
 * /api to it) and a real database row, which is the only way to prove that the
 * form the owner actually uses persists what it claims.
 *
 * It is opt-in because it needs a live stack and a seeded credential:
 *
 *   NHILOS_LIVE_E2E=1 \
 *   NHILOS_LIVE_BASE=http://soho.localhost:5173 \
 *   NHILOS_LIVE_EMAIL=admin@soho.com \
 *   NHILOS_LIVE_PASSWORD=... \
 *   npx playwright test e2e/settings-discount-cap.live.spec.ts --project="Desktop Chrome"
 *
 * Two facts a reader should know before trusting these assertions:
 *
 * - The hostname matters. The dashboard resolves the tenant slug from the first
 *   label of window.location.hostname, so `soho.<anything>` selects tenant
 *   "soho". Chromium resolves `soho.localhost` to loopback by itself and the dev
 *   server accepts it, which is why it is the default; a host outside the
 *   localhost TLD is rejected by allowedHosts.
 *
 * - The save button is gated on the form being DIRTY, so it is disabled until a
 *   value actually differs from what was loaded. A test that "restores" a field
 *   to its stored value leaves the form pristine and the button disabled, which
 *   looks like a product defect and is not one. These tests only click Save
 *   while a real change is pending.
 *
 * The form mirrors the backend's own constraints (for example the FX spread is
 * 10..100 on both sides), so an out-of-range value is refused CLIENT-side in
 * Spanish and never reaches the network. Server-side error copy is covered by
 * the dashboard's own unit tests, not here.
 */

const LIVE = process.env.NHILOS_LIVE_E2E === "1";
const BASE = process.env.NHILOS_LIVE_BASE ?? "http://soho.localhost:5173";
const EMAIL = process.env.NHILOS_LIVE_EMAIL ?? "admin@soho.com";
const PASSWORD = process.env.NHILOS_LIVE_PASSWORD ?? "";

const AMOUNT = /descuento m[aá]ximo por monto/i;
const PERCENT = /descuento m[aá]ximo por porcentaje/i;

test.describe.configure({ mode: "serial" });

test.skip(!LIVE, "live-stack spec: set NHILOS_LIVE_E2E=1 to run it");

function saveButton(page: import("@playwright/test").Page) {
  return page.getByTestId("save-fiscal-setup-button");
}

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder("admin@negocio.com").fill(EMAIL);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: /ingresar|iniciar sesi/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

/** The Business Profile lives behind the fiscal tab, not the default one. */
async function openFiscalTab(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/settings`);
  const tab = page
    .getByRole("tab", { name: /r[eé]gimen fiscal/i })
    .or(page.getByRole("button", { name: /r[eé]gimen fiscal/i }))
    .first();
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
  await expect(page.getByLabel(AMOUNT)).toBeVisible({ timeout: 15_000 });
}

test("the owner sets the manual discount cap and it persists", async ({
  page,
}) => {
  await login(page);
  await openFiscalTab(page);

  const amount = page.getByLabel(AMOUNT);
  const percent = page.getByLabel(PERCENT);

  // The save button only enables when the form is DIRTY, so this test picks
  // values that differ from whatever the previous run left behind. Otherwise it
  // would "restore" the stored values, leave nothing to save, and fail on a
  // disabled button that is behaving correctly.
  const targetAmount = (await amount.inputValue()) === "111" ? "112" : "111";
  const targetPercent = targetAmount === "111" ? "11" : "12";

  await amount.fill(targetAmount);
  await percent.fill(targetPercent);
  await expect(saveButton(page)).toBeEnabled();
  await saveButton(page).click();

  // The real proof is not a toast: it is that the value survives a reload,
  // read back from the backend.
  await openFiscalTab(page);
  await expect(page.getByLabel(AMOUNT)).toHaveValue(targetAmount);
  await expect(page.getByLabel(PERCENT)).toHaveValue(targetPercent);
});

test("an out-of-range percent is refused in Spanish and never persisted", async ({
  page,
}) => {
  await login(page);
  await openFiscalTab(page);

  const percent = page.getByLabel(PERCENT);
  const before = await percent.inputValue();
  await percent.fill("150");

  // Validation runs on SUBMIT, not on change: nothing is flagged until the
  // owner presses save, which is the honest description of what happens.
  await saveButton(page).click();
  await expect(percent).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText(/menor o igual a 100/i).first()).toBeVisible();

  // The VISIBLE text must carry no English technical copy. Checking rendered
  // text rather than the whole DOM keeps this honest: hidden nodes (dev-server
  // scripts, collapsed sections) are not something the operator can read.
  const visible = await page.locator("body").innerText();
  expect(visible).not.toMatch(
    /must be|should not be|isNumber|isInt|cast to number/i,
  );

  // Nothing reached the server: the stored percent is exactly what it was
  // before the refused 150, never the refused value itself.
  await openFiscalTab(page);
  await expect(page.getByLabel(PERCENT)).toHaveValue(before);
  expect(before).not.toBe("150");
});

test("clearing the caps persists as no limit (the null tombstone round trip)", async ({
  page,
}) => {
  await login(page);
  await openFiscalTab(page);

  const amount = page.getByLabel(AMOUNT);
  const percent = page.getByLabel(PERCENT);

  // Make sure there IS a cap to clear, so this test is re-runnable no matter
  // what the previous run left behind. The seed amount is chosen to differ from
  // the stored one, because the save button needs a pending change.
  const seedAmount = (await amount.inputValue()) === "50" ? "51" : "50";
  await amount.fill(seedAmount);
  await percent.fill("5");
  await expect(saveButton(page)).toBeEnabled();
  await saveButton(page).click();

  // Re-open before clearing: a fill issued while the post-save refresh is still
  // in flight gets overwritten by it, which leaves the form pristine and the
  // button disabled. Re-navigating gives a settled form to edit.
  await openFiscalTab(page);

  // Emptying both is the path that inserts a superseding null tombstone, which
  // used to answer 500 because the column forbade it.
  await page.getByLabel(AMOUNT).fill("");
  await page.getByLabel(PERCENT).fill("");
  await expect(saveButton(page)).toBeEnabled();
  await saveButton(page).click();

  await openFiscalTab(page);
  await expect(page.getByLabel(AMOUNT)).toHaveValue("");
  await expect(page.getByLabel(PERCENT)).toHaveValue("");
});
