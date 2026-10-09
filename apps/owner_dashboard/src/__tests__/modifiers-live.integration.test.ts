/**
 * LIVE API integration tests — Modifier groups management flow (CRUD +
 * validations + attachments + effective resolution).
 *
 * These tests hit a REAL running NestJS backend over plain HTTP. No mocks,
 * no route interception, no direct DB access — everything goes through the
 * HTTP API exactly like a dashboard client would.
 *
 * Prerequisites:
 *   1. Real backend listening on http://127.0.0.1:3300 (NestJS from this
 *      worktree + real PostgreSQL, dev DB `omnifood`). Never started or
 *      stopped by this file.
 *   2. Tenant fixture: slug `soho-test-fixture` with OWNER login
 *      sofia@omnifood.ni / password123 (tenantSlug is REQUIRED).
 *   3. Seeded catalog: a SALES_PRODUCT_CATEGORY catalog value labeled
 *      "CAFE", and the product "Café Americano Preparado" (category_code
 *      CAFE) present for that tenant.
 *   4. The tenant may contain leftover active groups named
 *      "E2E Extra Café …" from UI spec runs: this file never assumes an
 *      empty group list and uses run-unique names
 *      (`E2E-API Grupos <RUN>`) so it is independent of them.
 *
 * Run (from apps/owner_dashboard):
 *   npx vitest run -c vitest.integration.config.ts src/__tests__/modifiers-live.integration.test.ts
 *
 * Override the API base with NHILOS_LIVE_API when the backend lives
 * elsewhere (never hardcode port 3000 — other worktrees own it):
 *   NHILOS_LIVE_API=http://127.0.0.1:3300/api npx vitest run ...
 */
import { describe, expect, it } from "vitest";

const API = process.env.NHILOS_LIVE_API ?? "http://127.0.0.1:3300/api";

const TENANT_SLUG = "soho-test-fixture";
const LOGIN_BODY = {
  email: "sofia@omnifood.ni",
  pass: "password123",
  tenantSlug: TENANT_SLUG,
};

// Run-unique prefix: the tenant already holds leftover "E2E Extra Café …"
// groups, so every created group must be namespaced per run.
const RUN = Date.now().toString().slice(-6);
const GROUP_NAME = `E2E-API Grupos ${RUN}`;

// ---------------------------------------------------------------------------
// Helpers (plain fetch, w1.integration.test.ts style)
// ---------------------------------------------------------------------------

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    name: string;
    role: string;
    tenant_id: string;
    permissions: string[];
  };
}

interface ModifierOption {
  id: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  sort_order: number;
  is_active: boolean;
}

interface ModifierGroup {
  id: string;
  name: string;
  min_selected: number;
  max_selected: number;
  allow_quantities: boolean;
  sort_order: number;
  is_active: boolean;
  options: ModifierOption[];
}

interface EffectiveOption {
  id: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  sort_order: number;
}

interface EffectiveGroup {
  group_id: string;
  name: string;
  min_selected: number;
  max_selected: number;
  allow_quantities: boolean;
  source: "category" | "product";
  options: EffectiveOption[];
}

interface CatalogValue {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

interface Product {
  id: string;
  name: string;
  category_code: string | null;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

/** Nest error bodies are { statusCode, message, error }; validation errors carry an array. */
function messagesOf(data: unknown): string {
  const message = (data as { message?: unknown })?.message;
  return Array.isArray(message) ? message.join("; ") : String(message ?? "");
}

// ---------------------------------------------------------------------------
// Shared sequential state (one describe, ordered it() blocks)
// ---------------------------------------------------------------------------

describe("Modifiers live API — CRUD + validations + attachments + effective resolution", () => {
  let token = "";
  let groupId = "";
  let shotOptionId = "";
  let vainillaOptionId = "";
  let cafeCategoryId = "";
  let productId = "";

  it("logs in as OWNER of soho-test-fixture (tenantSlug required)", async () => {
    const { status, data } = await request<LoginResponse>(
      "POST",
      "/identity/login",
      LOGIN_BODY,
    );
    expect(status, `login failed: ${JSON.stringify(data)}`).toBe(201);
    expect(data.access_token).toBeDefined();
    expect(data.user.role).toBe("OWNER");
    expect(data.user.tenant_id).toBeDefined();
    token = data.access_token;
  });

  it("creates a modifier group with the full echo shape", async () => {
    const { status, data } = await request<ModifierGroup>(
      "POST",
      "/modifier-groups",
      {
        name: GROUP_NAME,
        min_selected: 0,
        max_selected: 3,
        allow_quantities: true,
        sort_order: 10,
      },
      token,
    );
    expect(status, `create failed: ${JSON.stringify(data)}`).toBe(201);
    expect(data.id).toMatch(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    );
    expect(data.name).toBe(GROUP_NAME);
    expect(data.min_selected).toBe(0);
    expect(data.max_selected).toBe(3);
    expect(data.allow_quantities).toBe(true);
    expect(data.sort_order).toBe(10);
    expect(data.is_active).toBe(true);
    groupId = data.id;
  });

  it("creates options whose price_delta serializes as a JSON number (Postgres numeric)", async () => {
    const shot = await request<ModifierOption>(
      "POST",
      `/modifier-groups/${groupId}/options`,
      { name: "Extra shot", price_delta: 15, sort_order: 1 },
      token,
    );
    expect(shot.status, `create option failed: ${JSON.stringify(shot.data)}`).toBe(201);
    // Record ids BEFORE any decimal assertion: downstream sequential tests
    // must exercise their own contracts even when this one is RED.
    shotOptionId = shot.data.id;

    const vainilla = await request<ModifierOption>(
      "POST",
      `/modifier-groups/${groupId}/options`,
      { name: "Vainilla", price_delta: 5, sort_order: 2 },
      token,
    );
    expect(vainilla.status, `create option failed: ${JSON.stringify(vainilla.data)}`).toBe(201);
    vainillaOptionId = vainilla.data.id;

    // DECIMAL CONTRACT: a Postgres numeric column must reach JSON clients as
    // a number, never as the raw driver string "15.00".
    expect(
      typeof shot.data.price_delta,
      `POST option price_delta must be a number, got ${JSON.stringify(shot.data.price_delta)}`,
    ).toBe("number");
    expect(shot.data.price_delta).toBe(15);

    const group = await request<ModifierGroup>(
      "GET",
      `/modifier-groups/${groupId}`,
      undefined,
      token,
    );
    expect(group.status).toBe(200);
    const mine = group.data.options.filter((option) =>
      [shotOptionId, vainillaOptionId].includes(option.id),
    );
    expect(mine).toHaveLength(2);
    for (const option of mine) {
      expect(
        typeof option.price_delta,
        `GET group option "${option.name}" price_delta must be a number, got ${JSON.stringify(option.price_delta)}`,
      ).toBe("number");
    }
  });

  it("accepts a read-modify-write round trip that echoes the API's own output", async () => {
    const group = await request<ModifierGroup>(
      "GET",
      `/modifier-groups/${groupId}`,
      undefined,
      token,
    );
    expect(group.status).toBe(200);
    const mine = group.data.options.filter((option) =>
      [shotOptionId, vainillaOptionId].includes(option.id),
    );
    expect(mine).toHaveLength(2);

    // Echo EXACTLY what GET returned for the whitelisted writable fields —
    // in particular price_delta AS RECEIVED (no client-side coercion). A
    // client replaying the API's own output must succeed.
    const results: Array<{ name: string; status: number; body: unknown }> = [];
    for (const option of mine) {
      const { status, data } = await request<ModifierOption>(
        "PATCH",
        `/modifier-groups/${groupId}/options/${option.id}`,
        {
          name: option.name,
          price_delta: option.price_delta,
          is_default: option.is_default,
          sort_order: option.sort_order,
          is_active: option.is_active,
        },
        token,
      );
      results.push({ name: option.name, status, body: data });
    }
    for (const result of results) {
      expect(
        result.status,
        `PATCH echoing GET output for "${result.name}" failed: ${JSON.stringify(result.body)}`,
      ).toBe(200);
    }
  });

  it("enforces the documented validation contract on groups and options", async () => {
    // Duplicate name → 409 (catalog conflict doctrine)
    const duplicate = await request<{ message: string }>(
      "POST",
      "/modifier-groups",
      { name: GROUP_NAME, min_selected: 0, max_selected: 1 },
      token,
    );
    expect(duplicate.status).toBe(409);
    expect(messagesOf(duplicate.data)).toBe(
      `Modifier group with name "${GROUP_NAME}" already exists`,
    );

    // min_selected > max_selected → 400 with the merged-rules message
    const badRange = await request<{ message: string }>(
      "POST",
      "/modifier-groups",
      { name: `${GROUP_NAME} rango`, min_selected: 2, max_selected: 1 },
      token,
    );
    expect(badRange.status).toBe(400);
    expect(messagesOf(badRange.data)).toBe(
      "min_selected must be >= 0, max_selected must be >= 1, and max_selected must be >= min_selected",
    );

    // PATCH max_selected 0 → 400 (violates @Min(1))
    const zeroMax = await request<{ message: string }>(
      "PATCH",
      `/modifier-groups/${groupId}`,
      { max_selected: 0 },
      token,
    );
    expect(zeroMax.status).toBe(400);

    // Whitespace-only name → 400 (service-level blank-name guard)
    const blank = await request<{ message: string }>(
      "POST",
      "/modifier-groups",
      { name: "   ", min_selected: 0, max_selected: 1 },
      token,
    );
    expect(blank.status).toBe(400);
    expect(messagesOf(blank.data)).toBe("name must not be blank");

    // Non-numeric price_delta → 400 (invalid input must stay rejected)
    const badDelta = await request<{ message: string }>(
      "POST",
      `/modifier-groups/${groupId}/options`,
      { name: "Inválido", price_delta: "abc" },
      token,
    );
    expect(badDelta.status).toBe(400);
    expect(messagesOf(badDelta.data)).toContain("price_delta must be a number");
  });

  it("resolves the CAFE catalog value and the coffee product from the live fixtures", async () => {
    const catalogs = await request<CatalogValue[]>(
      "GET",
      "/catalogs/SALES_PRODUCT_CATEGORY",
      undefined,
      token,
    );
    expect(catalogs.status).toBe(200);
    const cafe = catalogs.data.find(
      (value) => value.name === "CAFE" && value.is_active,
    );
    expect(cafe, `CAFE catalog value not found in ${JSON.stringify(catalogs.data.map((v) => v.name))}`).toBeDefined();
    cafeCategoryId = cafe!.id;

    const products = await request<Product[]>("GET", "/products", undefined, token);
    expect(products.status).toBe(200);
    const product = products.data.find(
      (candidate) => candidate.name === "Café Americano Preparado",
    );
    expect(
      product,
      `"Café Americano Preparado" not found among ${products.data.length} products`,
    ).toBeDefined();
    expect(product!.category_code).toBe("CAFE");
    productId = product!.id;
  });

  it("attaches the group to category CAFE and surfaces it in attachment queries", async () => {
    const attach = await request<unknown>(
      "POST",
      `/modifier-groups/${groupId}/categories`,
      { catalog_value_id: cafeCategoryId, sort_order: 5 },
      token,
    );
    expect(attach.status, `attach failed: ${JSON.stringify(attach.data)}`).toBe(201);

    const byCategory = await request<ModifierGroup[]>(
      "GET",
      `/modifier-groups?category_id=${cafeCategoryId}`,
      undefined,
      token,
    );
    expect(byCategory.status).toBe(200);
    expect(byCategory.data.some((group) => group.id === groupId)).toBe(true);

    // Documented truth of the list filters (modifiers.service.findGroupsWithOptions):
    // `product_id` narrows by DIRECT product attachments only — it is NOT a
    // category-inherited query. After a category-only attach the group must
    // NOT appear under product_id.
    const byProduct = await request<ModifierGroup[]>(
      "GET",
      `/modifier-groups?product_id=${productId}`,
      undefined,
      token,
    );
    expect(byProduct.status).toBe(200);
    expect(
      byProduct.data.some((group) => group.id === groupId),
      "product_id filter must return only direct product attachments",
    ).toBe(false);

    // Foreign/nonexistent category id → 400, no existence oracle message split
    const foreign = await request<{ message: string }>(
      "POST",
      `/modifier-groups/${groupId}/categories`,
      {
        catalog_value_id: "00000000-0000-4000-8000-000000000000",
        sort_order: 1,
      },
      token,
    );
    expect(foreign.status).toBe(400);
    expect(messagesOf(foreign.data)).toContain(
      "is not a product category of this tenant",
    );
  });

  it("resolves the group as effective for the product via category inheritance", async () => {
    const effective = await request<EffectiveGroup[]>(
      "GET",
      `/modifier-groups/effective?product_id=${productId}`,
      undefined,
      token,
    );
    expect(effective.status).toBe(200);
    const mine = effective.data.filter((group) => group.group_id === groupId);
    expect(mine, "group must resolve through category CAFE").toHaveLength(1);
    expect(mine[0].source).toBe("category");
    expect(mine[0].min_selected).toBe(0);
    expect(mine[0].max_selected).toBe(3);
    expect(mine[0].allow_quantities).toBe(true);
    const optionNames = mine[0].options.map((option) => option.name);
    expect(optionNames).toEqual(expect.arrayContaining(["Extra shot", "Vainilla"]));
    for (const option of mine[0].options) {
      expect(
        typeof option.price_delta,
        `effective option "${option.name}" price_delta must be a number, got ${JSON.stringify(option.price_delta)}`,
      ).toBe("number");
    }
  });

  it("overrides the source to product with a direct attachment, then restores category", async () => {
    const attach = await request<unknown>(
      "POST",
      `/modifier-groups/${groupId}/products`,
      { product_id: productId, sort_order: 9 },
      token,
    );
    expect(attach.status, `product attach failed: ${JSON.stringify(attach.data)}`).toBe(201);

    const overridden = await request<EffectiveGroup[]>(
      "GET",
      `/modifier-groups/effective?product_id=${productId}`,
      undefined,
      token,
    );
    expect(overridden.status).toBe(200);
    const mine = overridden.data.filter((group) => group.group_id === groupId);
    // Override rule: attached at BOTH levels → appears EXACTLY ONCE.
    expect(mine, "group must appear exactly once after dual attach").toHaveLength(1);
    expect(mine[0].source).toBe("product");

    const detach = await request<{ success: boolean }>(
      "DELETE",
      `/modifier-groups/${groupId}/products/${productId}`,
      undefined,
      token,
    );
    expect(detach.status).toBe(200);
    expect(detach.data.success).toBe(true);

    const restored = await request<EffectiveGroup[]>(
      "GET",
      `/modifier-groups/effective?product_id=${productId}`,
      undefined,
      token,
    );
    expect(restored.status).toBe(200);
    const restoredMine = restored.data.filter((group) => group.group_id === groupId);
    expect(restoredMine).toHaveLength(1);
    expect(restoredMine[0].source).toBe("category");
  });

  it("drops inactive options from effective resolution and restores them", async () => {
    const deactivate = await request<ModifierOption>(
      "PATCH",
      `/modifier-groups/${groupId}/options/${shotOptionId}`,
      { is_active: false },
      token,
    );
    expect(deactivate.status).toBe(200);

    const withoutShot = await request<EffectiveGroup[]>(
      "GET",
      `/modifier-groups/effective?product_id=${productId}`,
      undefined,
      token,
    );
    expect(withoutShot.status).toBe(200);
    const group = withoutShot.data.find((entry) => entry.group_id === groupId);
    expect(group).toBeDefined();
    expect(group!.options.some((option) => option.id === shotOptionId)).toBe(false);

    const reactivate = await request<ModifierOption>(
      "PATCH",
      `/modifier-groups/${groupId}/options/${shotOptionId}`,
      { is_active: true },
      token,
    );
    expect(reactivate.status).toBe(200);

    const withShot = await request<EffectiveGroup[]>(
      "GET",
      `/modifier-groups/effective?product_id=${productId}`,
      undefined,
      token,
    );
    expect(withShot.status).toBe(200);
    const restored = withShot.data.find((entry) => entry.group_id === groupId);
    expect(restored).toBeDefined();
    expect(restored!.options.some((option) => option.id === shotOptionId)).toBe(true);
  });

  it("soft-deletes the group: inactive listing finds it, active listing and effective do not", async () => {
    const remove = await request<{ success: boolean }>(
      "DELETE",
      `/modifier-groups/${groupId}`,
      undefined,
      token,
    );
    expect(remove.status).toBe(200);
    expect(remove.data.success).toBe(true);

    const inactive = await request<ModifierGroup[]>(
      "GET",
      `/modifier-groups?status=inactive`,
      undefined,
      token,
    );
    expect(inactive.status).toBe(200);
    expect(inactive.data.some((group) => group.id === groupId)).toBe(true);

    const active = await request<ModifierGroup[]>(
      "GET",
      `/modifier-groups?status=active`,
      undefined,
      token,
    );
    expect(active.status).toBe(200);
    expect(active.data.some((group) => group.id === groupId)).toBe(false);

    const defaultList = await request<ModifierGroup[]>(
      "GET",
      `/modifier-groups`,
      undefined,
      token,
    );
    expect(defaultList.status).toBe(200);
    expect(defaultList.data.some((group) => group.id === groupId)).toBe(false);

    const effective = await request<EffectiveGroup[]>(
      "GET",
      `/modifier-groups/effective?product_id=${productId}`,
      undefined,
      token,
    );
    expect(effective.status).toBe(200);
    expect(effective.data.some((group) => group.group_id === groupId)).toBe(false);

    // Reactivate so the cleanup step can exercise a deterministic end state.
    const reactivate = await request<ModifierGroup>(
      "PATCH",
      `/modifier-groups/${groupId}`,
      { is_active: true },
      token,
    );
    expect(reactivate.status).toBe(200);
    expect(reactivate.data.is_active).toBe(true);
  });

  it("cleans up: detaches category, soft-deletes the group, GET by id is then 404", async () => {
    const detach = await request<{ success: boolean }>(
      "DELETE",
      `/modifier-groups/${groupId}/categories/${cafeCategoryId}`,
      undefined,
      token,
    );
    expect(detach.status).toBe(200);
    expect(detach.data.success).toBe(true);

    const remove = await request<{ success: boolean }>(
      "DELETE",
      `/modifier-groups/${groupId}`,
      undefined,
      token,
    );
    expect(remove.status).toBe(200);

    // findOne uses findActiveGroupById: a soft-deleted group is
    // indistinguishable from a nonexistent one → 404.
    const gone = await request<unknown>(
      "GET",
      `/modifier-groups/${groupId}`,
      undefined,
      token,
    );
    expect(
      gone.status,
      `GET by id after soft delete returned: ${JSON.stringify(gone.data)}`,
    ).toBe(404);
  });
});
