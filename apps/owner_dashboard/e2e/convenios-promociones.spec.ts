import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:3000";

const ADMIN_CREDENTIALS = {
  email: "sofia@omnifood.ni",
  pass: "password123",
  tenantSlug: "soho-test-fixture",
};

const TENANT_ID = "e05bf002-b1d3-45f2-a46a-3592e1cc1431";

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
) {
  const res = await request.post(`${BACKEND_URL}/promotions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: `Convenio ${code}`,
      type: "convenio",
      target_customer_id: customerId,
      code,
      restriction_type: "customer",
      discount_value: 15,
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

test.describe("NHILOS — Convenios Comerciales (E2E real contra backend)", () => {
  let token: string;

  test.beforeEach(async ({ request }) => {
    token = await loginAndGetToken(request);
  });

  test("E2E-01: crear cliente empresa y convenio, aparecer en listado de promociones", async ({
    request,
  }) => {
    // 1. Crear cliente empresa
    const customer = await createCustomer(request, token, "Distribuidora Las Mercedes");

    // 2. Crear promoción tipo convenio vinculada a ese cliente
    const createRes = await createConvenioPromotion(
      request,
      token,
      customer.id,
      "CONV-LM2026",
    );
    expect(createRes.status()).toBe(201);

    // 3. Verificar que aparece en el listado de promociones
    const promotions = await getPromotions(request, token);
    const convenio = promotions.find(
      (p: any) => p.code === "CONV-LM2026",
    );
    expect(convenio).toBeDefined();
    expect(convenio.type).toBe("convenio");
    expect(convenio.target_customer_id).toBe(customer.id);
    expect(convenio.restriction_type).toBe("customer");
  });

  test("E2E-06: crear dos convenios con mismo código en mismo tenant → debe fallar 400", async ({
    request,
  }) => {
    // Crear cliente
    const customer = await createCustomer(request, token, "Empresa Duplicado Test");

    // Crear primer convenio con código
    const first = await createConvenioPromotion(
      request,
      token,
      customer.id,
      "CONV-DUPLICATE",
    );
    expect(first.status()).toBe(201);

    // Intentar crear segundo convenio con mismo código y mismo tenant
    const customer2 = await createCustomer(request, token, "Empresa Duplicado Test 2");
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

  test("E2E-07: crear convenio con target_customer_id inexistente → debe fallar 400", async ({
    request,
  }) => {
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

  test("E2E-08: crear convenio sin target_customer_id cuando tipo es convenio → debe fallar 400", async ({
    request,
  }) => {
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
});
