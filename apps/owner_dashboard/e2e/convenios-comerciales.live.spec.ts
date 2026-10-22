import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:3000/api";
const DASHBOARD_URL = "http://localhost:5173";

const ADMIN_CREDENTIALS = {
  email: "owner.b.a6b4d092-b1c5-4071-b754-f7cb573236c9@test.com",
  pass: "password123",
  tenantSlug: "tenant-b-pilot-5d9c95ee",
};

const TENANT_ID = "381c9887-9ba7-4756-9bdf-588344d035dd";

/* ═════════════════════════════════════════════════════════════════════
   HELPERS — API REAL (sin mocks)
   ════════════════════════════════════════════════════════════════════ */

async function loginAndGetToken(request: any) {
  const res = await request.post(`${BACKEND_URL}/identity/login`, {
    data: ADMIN_CREDENTIALS,
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.access_token).toBeTruthy();
  return body.access_token;
}

async function createCustomer(request: any, token: string, name: string) {
  const res = await request.post(`${BACKEND_URL}/customers`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name,
      tax_id: "J0310000000001",
      phone: "50588888888",
      email: `${name.toLowerCase().replace(" ", ".")}@empresa.com.ni`,
    },
  });
  expect(res.status()).toBe(201);
  return await res.json();
}

async function createConvenioPromotion(
  request: any,
  token: string,
  customerId: string,
  code: string,
  discountValue = 15,
) {
  const res = await request.post(`${BACKEND_URL}/promotions`, {
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
  return res;
}

async function getPromotions(request: any, token: string) {
  const res = await request.get(`${BACKEND_URL}/promotions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);
  return await res.json();
}

async function deletePromotion(request: any, token: string, id: string) {
  return request.delete(`${BACKEND_URL}/promotions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/* ═════════════════════════════════════════════════════════════════════
   NAVEGADOR — HELPERS DE UI (Dashboard real)
   ════════════════════════════════════════════════════════════════════ */

async function performLogin(page: any) {
  await page.goto(`${DASHBOARD_URL}/login`);
  await page.fill('input[id="email"]', ADMIN_CREDENTIALS.email);
  await page.fill('input[id="password"]', ADMIN_CREDENTIALS.pass);
  await page.click('button[type="submit"]');
  await page.waitForURL((url: URL) => !url.pathname.includes("/login"));
}

async function openNewPromotionForm(page: any) {
  const nuevaBtn = page.getByRole("button", { name: "Nueva Promoción" });
  await expect(nuevaBtn).toBeVisible();
  await nuevaBtn.click();
}

/* ═════════════════════════════════════════════════════════════════════
   SUITE — Convenios Comerciales E2E punta a punta
   ═════════════════════════════════════════════════════════════════════ */

test.describe("NHILOS — Convenios Comerciales (E2E real: backend + dashboard)", () => {
  let token: string;

  test.beforeEach(async ({ request }) => {
    token = await loginAndGetToken(request);
  });

  /* ─────────────────────────────────────────────────────────────
     ESCENARIO TRIANGULADO 1: Crear cliente empresa + convenio
     ───────────────────────────────────────────────────────────── */

  test("E2E-01: crear cliente empresa y convenio, aparece en listado y detalle", async ({
    request,
    page,
  }) => {
    // ── Capa API: crear cliente empresa ──
    const customer = await createCustomer(
      request,
      token,
      "Distribuidora Las Mercedes",
    );
    expect(customer.id).toBeTruthy();
    expect(customer.name).toBe("Distribuidora Las Mercedes");

    // ── Capa API: crear convenio vinculado ──
    const createRes = await createConvenioPromotion(
      request,
      token,
      customer.id,
      "CONV-LM2026",
    );
    expect(createRes.status()).toBe(201);

    // ── Capa API: verificar en listado ──
    const promotions = await getPromotions(request, token);
    const convenio = promotions.find((p: any) => p.code === "CONV-LM2026");
    expect(convenio).toBeDefined();
    expect(convenio.type).toBe("convenio");
    expect(convenio.target_customer_id).toBe(customer.id);
    expect(convenio.restriction_type).toBe("customer");

    // ── Capa UI: navegar al dashboard y verificar que se renderiza ──
    await performLogin(page);
    await page.goto(`${DASHBOARD_URL}/promotions`);

    await expect(
      page.getByRole("heading", { name: "Promociones", exact: true }),
    ).toBeVisible();

    // La tabla debe mostrar el código y el cliente
    await expect(page.getByText("CONV-LM2026")).toBeVisible();
    await expect(page.getByText("Distribuidora Las Mercedes")).toBeVisible();
  });

  /* ─────────────────────────────────────────────────────────────
     ESCENARIO TRIANGULADO 2: Crear convenio vía UI del dashboard
     ───────────────────────────────────────────────────────────── */

  test("E2E-02: crear convenio completo desde el formulario del dashboard", async ({
    request,
    page,
  }) => {
    // ── Precondición API: crear cliente empresa ──
    const customer = await createCustomer(request, token, "Empresa UI Test");

    // ── Capa UI: login y abrir formulario ──
    await performLogin(page);
    await page.goto(`${DASHBOARD_URL}/promotions`);
    await openNewPromotionForm(page);

    // ── Llenar formulario ──
    await page.getByLabel("Nombre *").fill("Convenio UI Test");
    await page.getByLabel("Tipo de Promoción *").click();
    await page.getByRole("option", { name: "Convenio con Cliente" }).click();

    // Alcance: cliente específico
    await page.getByLabel("Alcance del Descuento").click();
    await page.getByRole("option", { name: "Cliente / Empresa específica" }).click();

    // Selector gobernado de cliente (NHILOS §17.6: selector, nunca input de UUID)
    await page.getByLabel("Cliente / Empresa del Convenio *").fill("Empresa UI Test");
    await page.getByRole("option", { name: "Empresa UI Test" }).click();

    // Código del convenio
    await page.getByLabel("Código del Convenio (opcional)").fill("CONV-UITEST");

    // Descuento
    await page.getByLabel("Porcentaje de Descuento *").fill("15");

    // ── Guardar ──
    await page.getByRole("button", { name: "Crear" }).click();

    // ── Verificar éxito ──
    await expect(page.getByText("Promoción creada")).toBeVisible();

    // ── Verificar en listado ──
    await expect(page.getByText("CONV-UITEST")).toBeVisible();
    await expect(page.getByText("Empresa UI Test")).toBeVisible();
  });

  /* ─────────────────────────────────────────────────────────────
     ESCENARIO TRIANGULADO 3: Validaciones de backend (errores)
     ───────────────────────────────────────────────────────────── */

  test("E2E-06: código duplicado en mismo tenant → 400", async ({ request }) => {
    const customer = await createCustomer(request, token, "Empresa Duplicado 1");
    const customer2 = await createCustomer(request, token, "Empresa Duplicado 2");

    const first = await createConvenioPromotion(
      request,
      token,
      customer.id,
      "CONV-DUPLICATE",
    );
    expect(first.status()).toBe(201);

    const second = await createConvenioPromotion(
      request,
      token,
      customer2.id,
      "CONV-DUPLICATE",
    );
    expect(second.status()).toBe(400);
    const body = await second.json();
    expect(body.message).toContain("already used");
  });

  test("E2E-07: target_customer_id inexistente → 400", async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/promotions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Convenio Cliente Fantasma",
        type: "convenio",
        target_customer_id: "00000000-0000-0000-0000-000000000000",
        code: "CONV-FANTOM",
        restriction_type: "customer",
        discount_value: 10,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("not an active customer");
  });

  test("E2E-08: convenio sin target_customer_id → 400", async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/promotions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Convenio Sin Cliente",
        type: "convenio",
        code: "CONV-SINCLIENTE",
        restriction_type: "customer",
        discount_value: 10,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("requires a target_customer_id");
  });

  /* ─────────────────────────────────────────────────────────────
     ESCENARIO TRIANGULADO 4: NHILOS — selector gobernado
     ───────────────────────────────────────────────────────────── */

  test("E2E-09: NHILOS §17.6 — el formulario nunca acepta UUID de texto libre para el cliente", async ({
    page,
  }) => {
    await performLogin(page);
    await page.goto(`${DASHBOARD_URL}/promotions`);
    await openNewPromotionForm(page);

    await page.getByLabel("Nombre *").fill("Test UUID Libre");
    await page.getByLabel("Tipo de Promoción *").click();
    await page.getByRole("option", { name: "Convenio con Cliente" }).click();
    await page.getByLabel("Alcance del Descuento").click();
    await page.getByRole("option", { name: "Cliente / Empresa específica" }).click();

    // El campo de cliente es un selector gobernado, NO un input libre de UUID.
    // Intentar escribir un UUID directamente no debe ser posible como selección válida.
    const customerInput = page.getByLabel("Cliente / Empresa del Convenio *");
    await customerInput.fill("00000000-0000-0000-0000-000000000000");

    // No debe haber opción válida para ese UUID (no aparece en resultados)
    await expect(
      page.getByText("Sin resultados para").first(),
    ).toBeVisible({ timeout: 3000 });
  });

  /* ─────────────────────────────────────────────────────────────
     ESCENARIO TRIANGULADO 5: Limpieza (evitar contaminar datos)
     ───────────────────────────────────────────────────────────── */

  test("E2E-10: limpiar convenios de prueba creados en los tests", async ({
    request,
  }) => {
    const promotions = await getPromotions(request, token);
    const testCodes = ["CONV-LM2026", "CONV-UITEST", "CONV-DUPLICATE", "CONV-FANTOM", "CONV-SINCLIENTE"];
    for (const promo of promotions) {
      if (testCodes.includes(promo.code)) {
        const res = await deletePromotion(request, token, promo.id);
        expect(res.status()).toBeIn([200, 204]);
      }
    }
  });
});
