import { expect, test } from "@playwright/test";
import {
  resolveLiveApiBase,
  resolveLiveWebBase,
} from "../src/lib/live-api-base";

/**
 * LIVE end-to-end for the CONVENIO promotion type (a commercial agreement
 * bound to one customer/company).
 *
 * Unlike the mocked specs in this directory, this one does NOT intercept the
 * API: it drives a real browser against a real backend and a real database.
 * That is the only way to prove the thing the owner actually does — assign a
 * discount to a company and see it applied — really works end to end.
 *
 * It is opt-in because it needs a live stack and a seeded credential:
 *
 *   NHILOS_LIVE_E2E=1 \
 *   NHILOS_LIVE_BASE=http://soho-test-fixture.localhost:5173 \
 *   NHILOS_LIVE_API=http://127.0.0.1:3000 \
 *   NHILOS_LIVE_EMAIL=sofia@omnifood.ni \
 *   NHILOS_LIVE_PASSWORD=... \
 *   npx playwright test e2e/convenios-comerciales.live.spec.ts --project="Desktop Chrome"
 *
 * Facts a reader should know before trusting these assertions:
 *
 * - The HOSTNAME carries the tenant. The dashboard resolves the tenant slug
 *   from the first label of window.location.hostname (src/lib/auth.ts), so a
 *   bare `localhost` renders "Accedé desde el subdominio de tu comercio"
 *   instead of the credentials form — there is no manual slug entry on a
 *   public page. The slug is therefore READ FROM THE HOST the browser visits,
 *   never hardcoded, so the API login and the browser can never disagree
 *   about which tenant they are talking to.
 *
 * - The login endpoint is throttled (5 per minute per IP AND per account).
 *   A suite that logs in once per test would trip its own rate limiter, so
 *   the API assertions share ONE token minted in beforeAll and a 429 is
 *   waited out instead of being reported as a product failure.
 *
 * - Every fixture is namespaced with a run-scoped suffix so the suite is
 *   RE-RUNNABLE: a leftover code from a previous run would make the "same
 *   code twice" scenario fail on its FIRST create, and a duplicated customer
 *   name would make the governed selector match two options at once.
 */

const LIVE = process.env.NHILOS_LIVE_E2E === "1";
const BASE = resolveLiveWebBase();
const API_BASE = resolveLiveApiBase();
const EMAIL = process.env.NHILOS_LIVE_EMAIL ?? "sofia@omnifood.ni";
const PASSWORD = process.env.NHILOS_LIVE_PASSWORD ?? "";

/** The tenant the browser talks to, derived from the host it visits. */
const TENANT_SLUG = new URL(BASE).hostname.split(".")[0] ?? "";

/**
 * The login endpoint is throttled at 5 attempts per IP AND per account per
 * 60s window (auth-throttle.config.ts).
 */
const THROTTLE_TTL_MS = 60_000;

test.describe.configure({ mode: "serial" });

test.skip(!LIVE, "live-stack spec: set NHILOS_LIVE_E2E=1 to run it");

const RUN_ID = Date.now().toString(36);

type ApiRequest = import("@playwright/test").APIRequestContext;
type Page = import("@playwright/test").Page;

async function loginWithRetry(request: ApiRequest): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await request.post(`${API_BASE}/identity/login`, {
      data: { email: EMAIL, pass: PASSWORD, tenantSlug: TENANT_SLUG },
    });
    if (res.status() === 201) {
      const body = await res.json();
      expect(body.access_token).toBeTruthy();
      return body.access_token;
    }
    if (res.status() === 429) {
      // The throttle window is 60s; wait it out instead of failing.
      await new Promise((resolve) => setTimeout(resolve, THROTTLE_TTL_MS + 1000));
      continue;
    }
    const body = await res.json().catch(() => null);
    throw new Error(`Login failed with ${res.status()}: ${JSON.stringify(body)}`);
  }
  throw new Error("Login kept getting throttled after 4 attempts");
}

async function createCustomer(request: ApiRequest, token: string, name: string) {
  const res = await request.post(`${API_BASE}/customers`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name,
      tax_id: "J0310000000001",
      phone: "50588888888",
      // Every space becomes a dot: the name is free text and a single
      // `replace(' ', '.')` would leave the second space in place, producing
      // an invalid address and a 400 from @IsEmail.
      email: `${name.trim().toLowerCase().replace(/\s+/g, ".")}@empresa.com.ni`,
    },
  });
  expect(res.status()).toBe(201);
  return await res.json();
}

async function createConvenioPromotion(
  request: ApiRequest,
  token: string,
  customerId: string,
  code: string,
  discountValue = 15,
) {
  return request.post(`${API_BASE}/promotions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: `Convenio ${code}`,
      type: "convenio",
      target_customer_id: customerId,
      code,
      restriction_type: "customer",
      discount_value: discountValue,
      min_order_amount: 0,
      priority: 10,
      is_stackable: true,
    },
  });
}

async function getPromotions(request: ApiRequest, token: string) {
  const res = await request.get(`${API_BASE}/promotions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);
  return await res.json();
}

/**
 * Login through the REAL form. A UI login can legitimately land on a 429 and
 * leave the operator on the login page: that is a rate-limit condition, not
 * a product failure, so the window is waited out and the attempt retried.
 */
async function performLogin(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${BASE}/login`);
    await page.getByPlaceholder("admin@negocio.com").fill(EMAIL);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: /ingresar|iniciar sesi/i }).click();
    try {
      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
      return;
    } catch {
      await page.waitForTimeout(THROTTLE_TTL_MS + 2000);
    }
  }
  throw new Error("UI login did not complete after 3 attempts");
}

async function openNewPromotionForm(page: Page) {
  await page.getByRole("button", { name: "Nueva Promoción" }).click();
  await expect(page.locator("#name")).toBeVisible();
}

/**
 * The convenio row that carries the given code. Assertions are scoped to the
 * ROW: the code appears both in the cell's composed text and in the span
 * that holds it, so a bare getByText(code) matches twice and trips
 * Playwright's strict mode.
 */
function convenioRow(page: Page, code: string) {
  return page.locator("tr", { hasText: code });
}

test.describe("NHILOS — Convenios Comerciales (E2E real: backend + dashboard)", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    // The hook's own budget must cover a throttled login waiting out the
    // 60s window: `test.setTimeout` inside the hook body is the hook-level
    // timeout (the second argument of beforeAll is not honoured by this
    // Playwright version).
    test.setTimeout(180_000);
    token = await loginWithRetry(request);
  });

  test("E2E-01: crear cliente empresa y convenio, aparece en listado", async ({
    request,
    page,
  }) => {
    const customerName = `Distribuidora Las Mercedes ${RUN_ID}`;
    const code = `CONV-LM-${RUN_ID}`;

    const customer = await createCustomer(request, token, customerName);
    expect(customer.id).toBeTruthy();
    expect(customer.name).toBe(customerName);

    const createRes = await createConvenioPromotion(
      request,
      token,
      customer.id,
      code,
    );
    expect(createRes.status()).toBe(201);

    const promotions = await getPromotions(request, token);
    const convenio = promotions.find((p: any) => p.code === code);
    expect(convenio).toBeDefined();
    expect(convenio.type).toBe("convenio");
    expect(convenio.target_customer_id).toBe(customer.id);
    expect(convenio.restriction_type).toBe("customer");

    await performLogin(page);
    await page.goto(`${BASE}/promotions`);
    await expect(
      page.getByRole("heading", { name: "Promociones", exact: true }),
    ).toBeVisible();

    const row = convenioRow(page, code);
    await expect(row).toBeVisible();
    await expect(row.getByText(code, { exact: true })).toBeVisible();
    await expect(row).toContainText(customerName);
  });

  test("E2E-03: flujo completo en UI — registrar cliente empresa en /customers, crear convenio, desactivar y reactivar", async ({
    page,
  }) => {
    const customerName = `Empresa E2E Live ${RUN_ID}`;
    const code = `CONV-LIVE-${RUN_ID}`;

    await performLogin(page);

    // 1. Navegar a /customers
    await page.goto(`${BASE}/customers`);
    await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();

    // 2. Abrir diálogo de nuevo cliente
    await page.getByRole("button", { name: "+ Nuevo Cliente" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo Cliente" })).toBeVisible();

    // 3. Completar formulario de cliente
    await page.locator("#customer-name").fill(customerName);
    await page.locator("#customer-type").selectOption("EMPRESA");
    await page.locator("#customer-tax-id").fill("J0310000000888");
    await page.locator("#customer-phone").fill("2222-8888");
    await page.locator("#customer-email").fill(`e2e.${RUN_ID}@empresa.com.ni`);
    await page.locator("#customer-address").fill("Managua, Carretera a Masaya");

    await page.getByRole("button", { name: "Registrar Cliente" }).click();
    await expect(page.getByText("Cliente registrado", { exact: true })).toBeVisible();

    // 4. Verificar que aparece en la tabla con tipo Empresa y Sin convenio
    const customerRow = page.locator("tr", { hasText: customerName });
    await expect(customerRow).toBeVisible();
    await expect(customerRow.getByText("Empresa")).toBeVisible();
    await expect(customerRow.getByText("Sin convenio")).toBeVisible();

    // 5. Clic en "Crear" convenio desde la fila del cliente en /customers
    await customerRow.getByRole("button", { name: "Crear" }).click();

    // Debe navegar a /promotions con el formulario pre-rellenado para este cliente
    await expect(page).toHaveURL(/\/promotions/);
    await expect(page.locator("#name")).toBeVisible();

    // Llenar código y descuento del convenio
    await page.locator("#code").fill(code);
    await page.locator("#discount_value").fill("20");

    await page.getByRole("button", { name: "Crear" }).click();
    await expect(page.getByText("Promoción creada", { exact: true })).toBeVisible();

    // 6. Regresar a /customers y verificar que el badge de convenio ahora está activo
    await page.goto(`${BASE}/customers`);
    await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();

    const updatedCustomerRow = page.locator("tr", { hasText: customerName });
    await expect(updatedCustomerRow).toBeVisible();
    await expect(updatedCustomerRow.getByText(new RegExp(`${code}: 20%`, "i"))).toBeVisible();

    // 7. Desactivar cliente
    page.once("dialog", (dialog) => dialog.accept());
    await updatedCustomerRow.getByRole("button", { name: "Desactivar" }).click();
    await expect(page.getByText("Cliente desactivado", { exact: true })).toBeVisible();

    // 8. Filtrar por Inactivos y Reactivar
    await page.locator('button[aria-label="Estado"]').click();
    await page.getByRole("option", { name: "Inactivos" }).click();

    const inactiveRow = page.locator("tr", { hasText: customerName });
    await expect(inactiveRow).toBeVisible();
    await expect(inactiveRow.getByText("Inactivo")).toBeVisible();

    await inactiveRow.getByRole("button", { name: "Reactivar" }).click();
    await expect(page.getByText("Cliente reactivado", { exact: true })).toBeVisible();
  });

  test("E2E-02: crear convenio completo desde el formulario del dashboard", async ({
    request,
    page,
  }) => {
    const customerName = `Empresa UI Test ${RUN_ID}`;
    const code = `CONV-UITEST-${RUN_ID}`;

    const customer = await createCustomer(request, token, customerName);

    await performLogin(page);
    await page.goto(`${BASE}/promotions`);
    await openNewPromotionForm(page);

    // Selectors by id: a Radix Select exposes no resolvable <label for>,
    // and the id is the stable anchor.
    await page.locator("#name").fill(`Convenio UI Test ${RUN_ID}`);

    await page.locator('button[aria-label="Tipo de Promoción"]').click();
    await page.getByRole("option", { name: "Convenio con Cliente" }).click();

    await page.locator('button[aria-label="Alcance del Descuento"]').click();
    await page
      .getByRole("option", { name: "Cliente / Empresa específica" })
      .click();

    // Governed selector (NHILOS §17.6: a selector, never a free-text UUID).
    await page.locator("#target-customer-search").fill(customerName);
    await page.getByRole("option", { name: customerName }).click();

    await page.locator("#code").fill(code);
    await page.locator("#discount_value").fill("15");

    await page.getByRole("button", { name: "Crear" }).click();

    // exact: true — the toast renders the title twice (the title div and the
    // aria-live status wrapper), and a bare getByText trips strict mode.
    await expect(page.getByText("Promoción creada", { exact: true })).toBeVisible();

    // The real proof is not the toast: it is that the agreement survives,
    // read back from the backend.
    const promotions = await getPromotions(request, token);
    const convenio = promotions.find((p: any) => p.code === code);
    expect(convenio).toBeDefined();
    expect(convenio.target_customer_id).toBe(customer.id);
    expect(convenio.discount_value).toBe(15);

    const row = convenioRow(page, code);
    await expect(row).toBeVisible();
    await expect(row.getByText(code, { exact: true })).toBeVisible();
    await expect(row).toContainText(customerName);
  });

  test("E2E-06: código duplicado en mismo tenant → 400", async ({ request }) => {
    const code = `CONV-DUP-${RUN_ID}`;
    const customer = await createCustomer(
      request,
      token,
      `Empresa Duplicado 1 ${RUN_ID}`,
    );
    const customer2 = await createCustomer(
      request,
      token,
      `Empresa Duplicado 2 ${RUN_ID}`,
    );

    const first = await createConvenioPromotion(request, token, customer.id, code);
    expect(first.status()).toBe(201);

    const second = await createConvenioPromotion(request, token, customer2.id, code);
    expect(second.status()).toBe(400);
    const body = await second.json();
    expect(body.message).toContain("already used");
  });

  test("E2E-07: target_customer_id inexistente → 400", async ({ request }) => {
    const res = await request.post(`${API_BASE}/promotions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Convenio Cliente Fantasma",
        type: "convenio",
        target_customer_id: "00000000-0000-0000-0000-000000000000",
        code: `CONV-FANTOM-${RUN_ID}`,
        restriction_type: "customer",
        discount_value: 10,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("not an active customer");
  });

  test("E2E-08: convenio sin target_customer_id → 400", async ({ request }) => {
    const res = await request.post(`${API_BASE}/promotions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Convenio Sin Cliente",
        type: "convenio",
        code: `CONV-SINCLIENTE-${RUN_ID}`,
        restriction_type: "customer",
        discount_value: 10,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("requires a target_customer_id");
  });

  test("E2E-11: convenio con discount_value 0 → 400 (nunca descontaría)", async ({
    request,
  }) => {
    const customer = await createCustomer(
      request,
      token,
      `Empresa Valor Cero ${RUN_ID}`,
    );
    const res = await createConvenioPromotion(
      request,
      token,
      customer.id,
      `CONV-VALORCERO-${RUN_ID}`,
      0,
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("discount_value greater than 0");
  });

  test("E2E-09: NHILOS §17.6 — el formulario nunca acepta UUID de texto libre para el cliente", async ({
    page,
  }) => {
    await performLogin(page);
    await page.goto(`${BASE}/promotions`);
    await openNewPromotionForm(page);

    await page.locator("#name").fill(`Test UUID Libre ${RUN_ID}`);
    await page.locator('button[aria-label="Tipo de Promoción"]').click();
    await page.getByRole("option", { name: "Convenio con Cliente" }).click();
    await page.locator('button[aria-label="Alcance del Descuento"]').click();
    await page
      .getByRole("option", { name: "Cliente / Empresa específica" })
      .click();

    // The customer field is a governed selector, NOT a free-text UUID input.
    // Typing a UUID yields no selectable option.
    await page
      .locator("#target-customer-search")
      .fill("00000000-0000-0000-0000-000000000000");

    await expect(page.getByTestId("entity-search-no-results")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("E2E-10: limpiar convenios de prueba creados en los tests", async ({
    request,
  }) => {
    const promotions = await getPromotions(request, token);
    for (const promo of promotions) {
      // Only this run's fixtures: the codes carry the run-scoped suffix.
      if (typeof promo.code === "string" && promo.code.includes(RUN_ID)) {
        const res = await request.delete(`${API_BASE}/promotions/${promo.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect([200, 204]).toContain(res.status());
      }
    }
  });
});
