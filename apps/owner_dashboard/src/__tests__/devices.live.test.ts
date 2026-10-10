/**
 * B17-03 Device Sync backoffice — Real Backend Integration (Task 5)
 *
 * These tests hit the actual NestJS backend (see API_BASE below).
 * Prerequisites — the local SHADOW STACK, never the :3000/:5173 stack that
 * belongs to another worktree:
 *   1. Backend on port 3300: `cd apps/admin_backend && PORT=3300 npm run start:dev`
 *   2. Database seeded: `npm run seed:test` (from apps/admin_backend)
 *   3. PostgreSQL reachable with the credentials in apps/admin_backend/.env
 *      (DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_DATABASE — they are
 *      machine-local, so they are not repeated here)
 *
 * Run: `pnpm run test:integration` from apps/owner_dashboard/
 */
import { describe, expect, it } from "vitest";
import { resolveLiveApiBase } from "@/lib/live-api-base";

// Live-suite contract (src/lib/live-api-base.ts): NHILOS_LIVE_API overrides the
// base URL; unset OR blank falls back to the canonical shadow stack on :3300,
// never :3000/:5173, which belong to other worktrees' stacks.
const API_BASE = resolveLiveApiBase();

// Tenant fixture shared by all three seeded roles. LoginDto requires
// tenantSlug (issue #556 stage 12d — the legacy no-slug path is closed).
const TENANT_SLUG = "soho-test-fixture";

const TEST_CREDENTIALS = {
  owner: { email: "sofia@omnifood.ni", pass: "password123", tenantSlug: TENANT_SLUG },
  manager: { email: "admin@omnifood.ni", pass: "password123", tenantSlug: TENANT_SLUG },
  cashier: { email: "carlos@omnifood.ni", pass: "password123", tenantSlug: TENANT_SLUG },
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

/** TenantTerminalDto (apps/admin_backend, issue #832 AG-03) — fields the live suite asserts. */
interface TenantTerminal {
  terminalId: string;
  label: string | null;
  credentialId: string;
  credentialVersion: number;
  status: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
  posBuild: string | null;
  freshnessState: string | null;
  acceptedThroughSequence: number | null;
  lastReceiptAt: string | null;
  hasDeclaredGaps: boolean;
  hasInventoryPending: boolean;
  inventoryPendingCount: number;
}

/** Login with a seeded role and return the access token (POST /identity/login returns 201). */
async function login(role: keyof typeof TEST_CREDENTIALS): Promise<string> {
  const res = await fetch(`${API_BASE}/identity/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(TEST_CREDENTIALS[role]),
  });
  expect(res.status).toBe(201);
  const data = (await res.json()) as LoginResponse;
  return data.access_token;
}

async function apiGet(
  path: string,
  token?: string,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function apiPost(
  path: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

describe("B17-03 — GET /identity/device-sync/terminals (real backend)", () => {
  it("returns 401 without a token", async () => {
    const { status } = await apiGet("/identity/device-sync/terminals");
    expect(status).toBe(401);
  });

  it("returns 403 for CASHIER (DEC-17.2: cashier has no terminal-registry read)", async () => {
    const token = await login("cashier");
    const { status } = await apiGet("/identity/device-sync/terminals", token);
    expect(status).toBe(403);
  });

  it("returns 200 with an Array for MANAGER (DEC-17.2: manager read access)", async () => {
    const token = await login("manager");
    const { status, data } = await apiGet("/identity/device-sync/terminals", token);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns 200 with an Array of TenantTerminalDto items for OWNER", async () => {
    const token = await login("owner");
    const { status, data } = await apiGet("/identity/device-sync/terminals", token);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);

    for (const terminal of data as TenantTerminal[]) {
      expect(typeof terminal.terminalId).toBe("string");
      expect(terminal.terminalId.length).toBeGreaterThan(0);
      expect(typeof terminal.credentialId).toBe("string");
      expect(terminal.credentialId.length).toBeGreaterThan(0);
      expect(typeof terminal.credentialVersion).toBe("number");
      expect(["PENDING", "ACTIVE", "RETIRED", "REVOKED"]).toContain(terminal.status);
      expect(terminal.issuedAt).toBeDefined();
      expect(terminal.expiresAt).toBeDefined();
      expect(typeof terminal.hasDeclaredGaps).toBe("boolean");
      expect(typeof terminal.hasInventoryPending).toBe("boolean");
      expect(typeof terminal.inventoryPendingCount).toBe("number");
    }
  });
});

describe("B17-03 — POST /identity/device-sync/credentials/:id/revoke (real backend)", () => {
  it("returns 403 for CASHIER", async () => {
    const token = await login("cashier");
    const { status } = await apiPost(
      "/identity/device-sync/credentials/00000000-0000-4000-8000-000000000000/revoke",
      { reason: "test" },
      token,
    );
    expect(status).toBe(403);
  });

  it("returns 403 for MANAGER (DEC-17.2: manager cannot revoke)", async () => {
    const token = await login("manager");
    const { status } = await apiPost(
      "/identity/device-sync/credentials/00000000-0000-4000-8000-000000000000/revoke",
      { reason: "test" },
      token,
    );
    expect(status).toBe(403);
  });

  it("returns 400 for OWNER with a missing reason (DTO validation reached)", async () => {
    const token = await login("owner");
    const { status } = await apiPost(
      "/identity/device-sync/credentials/00000000-0000-4000-8000-000000000000/revoke",
      {},
      token,
    );
    expect(status).toBe(400);
  });

  it("returns 404 for OWNER with a non-existent credential id (OWNER reaches the endpoint)", async () => {
    const token = await login("owner");
    const nonExistentId = crypto.randomUUID();
    const { status, data } = await apiPost(
      `/identity/device-sync/credentials/${nonExistentId}/revoke`,
      { reason: "live-suite: credential does not exist" },
      token,
    );
    expect(status).toBe(404);
    expect(JSON.stringify(data)).toContain("not found");
  });
});
