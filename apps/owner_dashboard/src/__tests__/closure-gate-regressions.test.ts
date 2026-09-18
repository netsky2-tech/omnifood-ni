import { describe, expect, it, vi } from "vitest";
import { formatLocalDate } from "@/lib/utils";
import { canAccessRoute, canPerformAction, getDefaultRouteForRole } from "@/lib/rbac";
import { fetchCustomers } from "@/features/loyalty/loyalty-api";
import * as apiModule from "@/lib/api";

describe("Closure Gate Regressions & Invariants", () => {
  describe("Timezone & Date formatting (NICARAGUA UTC-6)", () => {
    it("formatLocalDate produces local YYYY-MM-DD instead of UTC rollover in evening", () => {
      // Create a date corresponding to 2026-09-18 20:30:00 in UTC-6 (which in UTC is 2026-09-19 02:30:00)
      // When formatted locally, it MUST remain 2026-09-18
      const date = new Date(2026, 8, 18, 20, 30, 0); // month 8 is September (0-indexed)
      const formatted = formatLocalDate(date);
      expect(formatted).toBe("2026-09-18");

      // Verify that formatLocalDate matches expected pattern
      expect(typeof formatted).toBe("string");
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("formatLocalDate correctly formats month and day with zero-padding", () => {
      const jan5 = new Date(2026, 0, 5, 10, 0, 0);
      expect(formatLocalDate(jan5)).toBe("2026-01-05");

      const dec31 = new Date(2026, 11, 31, 23, 59, 59);
      expect(formatLocalDate(dec31)).toBe("2026-12-31");
    });
  });

  describe("Customer Response Contract Normalization", () => {
    it("normalizes backend { data: Customer[], total: number } response to Customer[]", async () => {
      const mockBackendPayload = {
        data: [
          {
            id: "cust-1",
            tenant_id: "tenant-1",
            name: "Empresa ABC",
            tax_id: "J0310000000000",
            points_balance: 150,
            is_active: true,
          },
        ],
        total: 1,
      };

      vi.spyOn(apiModule.api, "get").mockResolvedValueOnce(mockBackendPayload as any);

      const customers = await fetchCustomers();
      expect(Array.isArray(customers)).toBe(true);
      expect(customers).toHaveLength(1);
      expect(customers[0]?.name).toBe("Empresa ABC");
    });

    it("normalizes direct Customer[] array responses if backend returns array", async () => {
      const mockArrayPayload = [
        {
          id: "cust-2",
          tenant_id: "tenant-1",
          name: "Cliente Directo",
          points_balance: 50,
          is_active: true,
        },
      ];

      vi.spyOn(apiModule.api, "get").mockResolvedValueOnce(mockArrayPayload as any);

      const customers = await fetchCustomers();
      expect(Array.isArray(customers)).toBe(true);
      expect(customers).toHaveLength(1);
      expect(customers[0]?.name).toBe("Cliente Directo");
    });

    it("returns empty array safely if response is empty or malformed", async () => {
      vi.spyOn(apiModule.api, "get").mockResolvedValueOnce(null as any);
      const customers = await fetchCustomers();
      expect(Array.isArray(customers)).toBe(true);
      expect(customers).toHaveLength(0);
    });
  });

  describe("Authoritative RBAC Route & Action Alignment", () => {
    it("strictly blocks CASHIER from /inventory to match backend 403 enforcement", () => {
      expect(canAccessRoute("OWNER", "/inventory")).toBe(true);
      expect(canAccessRoute("MANAGER", "/inventory")).toBe(true);
      expect(canAccessRoute("CASHIER", "/inventory")).toBe(false);
      expect(canAccessRoute("WAITER", "/inventory")).toBe(false);
    });

    it("allows CASHIER and WAITER to access /promotions and /customers (read-only)", () => {
      expect(canAccessRoute("CASHIER", "/promotions")).toBe(true);
      expect(canAccessRoute("WAITER", "/promotions")).toBe(true);
      expect(canAccessRoute("CASHIER", "/customers")).toBe(true);
      expect(canAccessRoute("WAITER", "/customers")).toBe(true);
    });

    it("blocks CASHIER and WAITER from write operations", () => {
      expect(canPerformAction("CASHIER", "promotions.write")).toBe(false);
      expect(canPerformAction("WAITER", "promotions.write")).toBe(false);
      expect(canPerformAction("MANAGER", "promotions.write")).toBe(true);
      expect(canPerformAction("OWNER", "promotions.write")).toBe(true);
    });

    it("resolves safe default route for CASHIER as /promotions", () => {
      expect(getDefaultRouteForRole("CASHIER")).toBe("/promotions");
      expect(getDefaultRouteForRole("WAITER")).toBe("/promotions");
      expect(getDefaultRouteForRole("MANAGER")).toBe("/");
      expect(getDefaultRouteForRole("OWNER")).toBe("/");
    });
  });
});
