/**
 * W1 Integration Tests — Real Backend + PostgreSQL
 *
 * These tests hit the actual NestJS backend on localhost:3000.
 * Prerequisites:
 *   1. Backend running: `cd apps/admin_backend && npm run start:dev`
 *   2. Database seeded: `npm run seed:test`
 *   3. PostgreSQL on 127.0.0.1:5432 (database: omnifood, user: postgres, pass: admin)
 *
 * Run: `pnpm run test:integration` from apps/owner_dashboard/
 */
import { describe, expect, it } from "vitest";

const API_BASE = "http://localhost:3000/api";

const TEST_CREDENTIALS = {
  owner: { email: "sofia@omnifood.ni", pass: "password123" },
  manager: { email: "admin@omnifood.ni", pass: "password123" },
  cashier: { email: "carlos@omnifood.ni", pass: "password123" },
};

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

interface MeResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    tenant_id: string;
    active: boolean;
    permissions: string[];
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    ruc: string;
    active: boolean;
  } | null;
}

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

async function apiPost<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

async function apiGet<T>(
  path: string,
  headers?: Record<string, string>,
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...headers },
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

describe("W1 — POST /identity/login (real backend)", () => {
  it("returns access_token, refresh_token, and user on valid credentials", async () => {
    const { status, data } = await apiPost<LoginResponse>(
      "/identity/login",
      TEST_CREDENTIALS.owner,
    );

    expect(status).toBe(201);
    expect(data.access_token).toBeDefined();
    expect(data.refresh_token).toBeDefined();
    expect(data.user).toBeDefined();
    expect(data.user.id).toBeDefined();
    expect(data.user.role).toBe("OWNER");
    expect(data.user.tenant_id).toBeDefined();
    expect(Array.isArray(data.user.permissions)).toBe(true);
  });

  it("returns 401 on invalid password", async () => {
    const res = await fetch(`${API_BASE}/identity/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "sofia@omnifood.ni", pass: "wrongpassword" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 401 on non-existent email", async () => {
    const res = await fetch(`${API_BASE}/identity/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nonexistent@omnifood.ni", pass: "password123" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 when pass field is missing", async () => {
    const res = await fetch(`${API_BASE}/identity/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "sofia@omnifood.ni" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when email field is missing", async () => {
    const res = await fetch(`${API_BASE}/identity/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pass: "password123" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns correct user for MANAGER role", async () => {
    const { status, data } = await apiPost<LoginResponse>(
      "/identity/login",
      TEST_CREDENTIALS.manager,
    );

    expect(status).toBe(201);
    expect(data.user.role).toBe("MANAGER");
  });

  it("returns correct user for CASHIER role", async () => {
    const { status, data } = await apiPost<LoginResponse>(
      "/identity/login",
      TEST_CREDENTIALS.cashier,
    );

    expect(status).toBe(201);
    expect(data.user.role).toBe("CASHIER");
  });
});

describe("W1 — GET /identity/me (real backend)", () => {
  it("returns current user and tenant with valid token", async () => {
    const login = await apiPost<LoginResponse>(
      "/identity/login",
      TEST_CREDENTIALS.owner,
    );
    const token = login.data.access_token;

    const { status, data } = await apiGet<MeResponse>("/identity/me", {
      Authorization: `Bearer ${token}`,
    });

    expect(status).toBe(200);
    expect(data.user).toBeDefined();
    expect(data.user.id).toBeDefined();
    expect(data.user.email).toBeDefined();
    expect(data.user.role).toBe("OWNER");
    expect(data.user.active).toBe(true);
    expect(Array.isArray(data.user.permissions)).toBe(true);
    expect(data.tenant).toBeDefined();
    expect(data.tenant!.id).toBeDefined();
    expect(data.tenant!.name).toBeDefined();
    expect(data.tenant!.ruc).toBeDefined();
  });

  it("returns 401 without token", async () => {
    const res = await fetch(`${API_BASE}/identity/me`);
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const res = await fetch(`${API_BASE}/identity/me`, {
      headers: { Authorization: "Bearer invalid-token-12345" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with expired-format token", async () => {
    const res = await fetch(`${API_BASE}/identity/me`, {
      headers: {
        Authorization:
          "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwiZXhwIjoxfQ.invalid",
      },
    });
    expect(res.status).toBe(401);
  });
});

describe("W1 — POST /identity/refresh (real backend)", () => {
  it("returns new token pair on valid refresh", async () => {
    const login = await apiPost<LoginResponse>(
      "/identity/login",
      TEST_CREDENTIALS.owner,
    );
    const { refresh_token, user } = login.data;

    const { status, data } = await apiPost<RefreshResponse>(
      "/identity/refresh",
      { userId: user.id, refreshToken: refresh_token },
    );

    expect(status).toBe(201);
    expect(data.access_token).toBeDefined();
    expect(data.refresh_token).toBeDefined();
    expect(data.refresh_token).not.toBe(refresh_token);
  });

  it("returns 401 on invalid refresh token", async () => {
    const login = await apiPost<LoginResponse>(
      "/identity/login",
      TEST_CREDENTIALS.owner,
    );

    const res = await fetch(`${API_BASE}/identity/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: login.data.user.id,
        refreshToken: "invalid-refresh-token",
      }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 on missing userId", async () => {
    const res = await fetch(`${API_BASE}/identity/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "some-token" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 on missing refreshToken", async () => {
    const res = await fetch(`${API_BASE}/identity/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "some-uuid" }),
    });

    expect(res.status).toBe(400);
  });

  it("old refresh token is invalidated after rotation", async () => {
    const login = await apiPost<LoginResponse>(
      "/identity/login",
      TEST_CREDENTIALS.manager,
    );
    const { refresh_token, user } = login.data;

    // First rotation — should succeed
    const rotate1 = await apiPost<RefreshResponse>("/identity/refresh", {
      userId: user.id,
      refreshToken: refresh_token,
    });
    expect(rotate1.status).toBe(201);

    // Second rotation with OLD token — should fail (token rotation)
    const res = await fetch(`${API_BASE}/identity/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, refreshToken: refresh_token }),
    });
    expect(res.status).toBe(401);
  });
});

describe("W1 — Protected endpoint access (real backend)", () => {
  it("OWNER can access /identity/users (OWNER-only route)", async () => {
    const login = await apiPost<LoginResponse>(
      "/identity/login",
      TEST_CREDENTIALS.owner,
    );

    const { status } = await apiGet("/identity/users", {
      Authorization: `Bearer ${login.data.access_token}`,
    });

    expect(status).toBe(200);
  });

  it("CASHIER cannot access /identity/users (OWNER-only route)", async () => {
    const login = await apiPost<LoginResponse>(
      "/identity/login",
      TEST_CREDENTIALS.cashier,
    );

    const { status } = await apiGet("/identity/users", {
      Authorization: `Bearer ${login.data.access_token}`,
    });

    expect(status).toBe(403);
  });

  it("MANAGER can access /sales/reports/dashboard (OWNER+MANAGER route)", async () => {
    const login = await apiPost<LoginResponse>(
      "/identity/login",
      TEST_CREDENTIALS.manager,
    );

    const { status } = await apiGet("/sales/reports/dashboard", {
      Authorization: `Bearer ${login.data.access_token}`,
    });

    expect(status).toBe(200);
  });

  it("CASHIER cannot access /sales/reports/dashboard (OWNER+MANAGER route)", async () => {
    const login = await apiPost<LoginResponse>(
      "/identity/login",
      TEST_CREDENTIALS.cashier,
    );

    const { status } = await apiGet("/sales/reports/dashboard", {
      Authorization: `Bearer ${login.data.access_token}`,
    });

    expect(status).toBe(403);
  });
});

describe("W1 — Full session lifecycle (real backend)", () => {
  it("login → me → refresh → me with new token works end-to-end", async () => {
    // 1. Login
    const login = await apiPost<LoginResponse>(
      "/identity/login",
      TEST_CREDENTIALS.owner,
    );
    expect(login.status).toBe(201);
    const { access_token, refresh_token, user } = login.data;

    // 2. Call /me with access token
    const me1 = await apiGet<MeResponse>("/identity/me", {
      Authorization: `Bearer ${access_token}`,
    });
    expect(me1.status).toBe(200);
    expect(me1.data.user.id).toBe(user.id);
    expect(me1.data.tenant).toBeDefined();

    // 3. Refresh tokens
    const refresh = await apiPost<RefreshResponse>("/identity/refresh", {
      userId: user.id,
      refreshToken: refresh_token,
    });
    expect(refresh.status).toBe(201);
    const newAccessToken = refresh.data.access_token;

    // 4. Call /me with NEW access token
    const me2 = await apiGet<MeResponse>("/identity/me", {
      Authorization: `Bearer ${newAccessToken}`,
    });
    expect(me2.status).toBe(200);
    expect(me2.data.user.id).toBe(user.id);

    // 5. OLD access token should still work (JWT is stateless until expiry)
    const me3 = await apiGet<MeResponse>("/identity/me", {
      Authorization: `Bearer ${access_token}`,
    });
    expect(me3.status).toBe(200);
  });
});
