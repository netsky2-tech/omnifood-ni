import { describe, expect, it, beforeAll } from "vitest";

const API_BASE = "http://localhost:3000/api";

let managerToken: string;
let cashierToken: string;

async function loginAs(
  email: string,
  pass: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/identity/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, pass }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status}`);
  }
  const data = (await res.json()) as { access_token?: string; accessToken?: string };
  return data.access_token ?? data.accessToken ?? "";
}

beforeAll(async () => {
  managerToken = await loginAs("admin@omnifood.ni", "password123");
  cashierToken = await loginAs("carlos@omnifood.ni", "password123");
}, 15_000);

async function apiGet(
  path: string,
  token: string,
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return { status: res.status, body, headers: res.headers };
}

describe("W4 E2E — Fiscal endpoints against real backend", () => {
  describe("Security — RBAC enforcement", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await fetch(`${API_BASE}/sales/reports/fiscal/monthly-summary`);
      expect(res.status).toBe(401);
    });

    it("rejects CASHIER role on fiscal summary with 403", async () => {
      const { status } = await apiGet(
        "/sales/reports/fiscal/monthly-summary?year=2026&month=8",
        cashierToken,
      );
      expect(status).toBe(403);
    });

    it("rejects CASHIER role on sequence audit with 403", async () => {
      const { status } = await apiGet(
        "/sales/reports/fiscal/sequence-audit",
        cashierToken,
      );
      expect(status).toBe(403);
    });

    it("rejects CASHIER role on exports with 403", async () => {
      const { status } = await apiGet(
        "/sales/reports/export/sales-book?format=json",
        cashierToken,
      );
      expect(status).toBe(403);
    });
  });

  describe("GET /sales/reports/fiscal/monthly-summary", () => {
    it("returns valid shape with MANAGER token", async () => {
      const { status, body } = await apiGet(
        "/sales/reports/fiscal/monthly-summary?year=2026&month=8",
        managerToken,
      );
      expect(status).toBe(200);

      const b = body as Record<string, unknown>;
      expect(typeof b.year).toBe("number");
      expect(typeof b.month).toBe("number");
      expect(typeof b.totalGrossSales).toBe("number");
      expect(typeof b.totalTaxableSales).toBe("number");
      expect(typeof b.totalExemptSales).toBe("number");
      expect(typeof b.totalTaxCollected).toBe("number");
      expect(typeof b.totalCreditNotes).toBe("number");
      expect(typeof b.totalCreditNotesTax).toBe("number");
      expect(typeof b.netTaxableSales).toBe("number");
      expect(typeof b.netTaxPayable).toBe("number");
      expect(typeof b.invoiceCount).toBe("number");
      expect(typeof b.creditNoteCount).toBe("number");
      expect(typeof b.generatedAt).toBe("string");
    });
  });

  describe("GET /sales/reports/fiscal/voided-invoices", () => {
    it("returns valid shape", async () => {
      const { status, body } = await apiGet(
        "/sales/reports/fiscal/voided-invoices",
        managerToken,
      );
      expect(status).toBe(200);

      const b = body as Record<string, unknown>;
      expect(typeof b.totalVoidedCount).toBe("number");
      expect(typeof b.totalVoidedAmount).toBe("number");
      expect(typeof b.generatedAt).toBe("string");
      expect(Array.isArray(b.invoices)).toBe(true);

      if (Array.isArray(b.invoices) && b.invoices.length > 0) {
        const inv = b.invoices[0] as Record<string, unknown>;
        expect(typeof inv.id).toBe("string");
        expect(typeof inv.number).toBe("string");
        expect(typeof inv.total).toBe("number");
        expect(typeof inv.voidReason).toBe("string");
        expect(typeof inv.cashierName).toBe("string");
      }
    });
  });

  describe("GET /sales/reports/fiscal/sequence-audit", () => {
    it("returns valid shape", async () => {
      const { status, body } = await apiGet(
        "/sales/reports/fiscal/sequence-audit",
        managerToken,
      );
      expect(status).toBe(200);

      const b = body as Record<string, unknown>;
      expect(typeof b.startSequence).toBe("number");
      expect(typeof b.endSequence).toBe("number");
      expect(typeof b.expectedCount).toBe("number");
      expect(typeof b.actualCount).toBe("number");
      expect(typeof b.hasGaps).toBe("boolean");
      expect(Array.isArray(b.missingSequences)).toBe(true);
      expect(Array.isArray(b.duplicateSequences)).toBe(true);
      expect(Array.isArray(b.series)).toBe(true);
      expect(typeof b.generatedAt).toBe("string");
    });
  });

  describe("GET /sales/reports/export/sales-book", () => {
    it("returns valid JSON shape", async () => {
      const { status, body } = await apiGet(
        "/sales/reports/export/sales-book?format=json",
        managerToken,
      );
      expect(status).toBe(200);

      const b = body as Record<string, unknown>;
      expect(typeof b.totalRecords).toBe("number");
      expect(typeof b.totalGrossNio).toBe("number");
      expect(typeof b.totalTaxNio).toBe("number");
      expect(typeof b.totalExemptNio).toBe("number");
      expect(typeof b.generatedAt).toBe("string");
      expect(Array.isArray(b.records)).toBe(true);
    });
  });

  describe("GET /sales/reports/export/z-reports", () => {
    it("returns valid JSON shape", async () => {
      const { status, body } = await apiGet(
        "/sales/reports/export/z-reports?format=json",
        managerToken,
      );
      expect(status).toBe(200);

      const b = body as Record<string, unknown>;
      expect(typeof b.totalRecords).toBe("number");
      expect(typeof b.generatedAt).toBe("string");
      expect(Array.isArray(b.records)).toBe(true);
    });
  });
});
