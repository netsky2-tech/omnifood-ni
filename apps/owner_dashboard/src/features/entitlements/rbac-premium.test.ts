import { describe, expect, it } from "vitest";
import {
  ROUTE_PREMIUM_CAPABILITIES,
  SURFACE_PREMIUM_CAPABILITIES,
  canAccessPremiumRoute,
  canAccessPremiumSurface,
  evaluateRouteAccess,
  isPremiumRoute,
} from "@/lib/rbac";

const ALL_PREMIUM = [
  "promotions",
  "promotions.convenio",
  "loyalty",
  "inventory.retail",
  "inventory.cooking",
  "reports.margins",
];

describe("ROUTE_PREMIUM_CAPABILITIES mapping", () => {
  it("maps exactly the premium routes (ENT-05b deliverable 4)", () => {
    expect(Object.keys(ROUTE_PREMIUM_CAPABILITIES).sort()).toEqual(
      ["/dish-margins", "/kardex", "/loyalty", "/promotions", "/recipes"].sort(),
    );
    expect(ROUTE_PREMIUM_CAPABILITIES["/promotions"]).toEqual(["promotions"]);
    expect(ROUTE_PREMIUM_CAPABILITIES["/loyalty"]).toEqual(["loyalty"]);
    expect(ROUTE_PREMIUM_CAPABILITIES["/recipes"]).toEqual(["inventory.cooking"]);
    expect(ROUTE_PREMIUM_CAPABILITIES["/dish-margins"]).toEqual(["inventory.cooking"]);
    expect(ROUTE_PREMIUM_CAPABILITIES["/kardex"]).toEqual(["inventory.retail"]);
  });

  it("never maps a core.* capability to a route (catalog §7)", () => {
    for (const capabilities of Object.values(ROUTE_PREMIUM_CAPABILITIES)) {
      for (const key of capabilities) {
        expect(key.startsWith("core.")).toBe(false);
      }
    }
  });

  it("never maps a core.* capability to a premium surface either", () => {
    for (const capabilities of Object.values(SURFACE_PREMIUM_CAPABILITIES)) {
      for (const key of capabilities) {
        expect(key.startsWith("core.")).toBe(false);
      }
    }
  });

  it("maps the premium surfaces inside core routes", () => {
    expect(SURFACE_PREMIUM_CAPABILITIES["inventory.purchases"]).toEqual(["inventory.retail"]);
    expect(SURFACE_PREMIUM_CAPABILITIES["inventory.suppliers"]).toEqual(["inventory.retail"]);
    expect(SURFACE_PREMIUM_CAPABILITIES["inventory.valuation"]).toEqual(["reports.margins"]);
    expect(SURFACE_PREMIUM_CAPABILITIES["promotions.convenio"]).toEqual(["promotions.convenio"]);
  });
});

describe("evaluateRouteAccess / canAccessPremiumRoute (composition)", () => {
  it("keeps the role check first: a role denial wins over any entitlement", () => {
    // CASHIER is allowed on /promotions by role but holds no entitlements:
    // the failure must be entitlement, not role.
    const cashierOnPromotions = evaluateRouteAccess("CASHIER", [], "/promotions");
    expect(cashierOnPromotions).toEqual({
      allowed: false,
      reason: "entitlement",
      capability: "promotions",
    });

    // CASHIER has no role access to /kardex at all — role denial, never the
    // upgrade copy.
    const cashierOnKardex = evaluateRouteAccess("CASHIER", ALL_PREMIUM, "/kardex");
    expect(cashierOnKardex).toEqual({ allowed: false, reason: "role" });
    expect(canAccessPremiumRoute("CASHIER", ALL_PREMIUM, "/kardex")).toBe(false);
  });

  it("denies a role-allowed premium route when the capability is missing", () => {
    expect(evaluateRouteAccess("OWNER", [], "/loyalty")).toEqual({
      allowed: false,
      reason: "entitlement",
      capability: "loyalty",
    });
    expect(canAccessPremiumRoute("OWNER", [], "/loyalty")).toBe(false);
  });

  it("allows a premium route when the capability is held", () => {
    expect(evaluateRouteAccess("OWNER", ["loyalty"], "/loyalty")).toEqual({ allowed: true });
    expect(canAccessPremiumRoute("OWNER", ["loyalty"], "/loyalty")).toBe(true);
  });

  it("treats a missing capabilities list as no premium capabilities (fail closed)", () => {
    expect(canAccessPremiumRoute("OWNER", undefined, "/recipes")).toBe(false);
    expect(canAccessPremiumRoute("OWNER", null, "/recipes")).toBe(false);
  });

  it("normalizes trailing slashes before looking up the route", () => {
    expect(canAccessPremiumRoute("OWNER", ["promotions"], "/promotions/")).toBe(true);
    expect(canAccessPremiumRoute("OWNER", [], "/promotions/")).toBe(false);
  });

  it("never gates unmapped or core routes (catalog §7 / deliverable 4)", () => {
    for (const path of ["/", "/sales", "/cash", "/catalog", "/customers", "/products", "/modifiers"]) {
      expect(evaluateRouteAccess("OWNER", [], path)).toEqual({ allowed: true });
    }
    expect(isPremiumRoute("/")).toBe(false);
    expect(isPremiumRoute("/sales")).toBe(false);
    expect(isPremiumRoute("/inventory")).toBe(false);
    expect(isPremiumRoute("/promotions")).toBe(true);
    expect(isPremiumRoute("/kardex/")).toBe(true);
  });
});

describe("canAccessPremiumSurface", () => {
  it("gates each premium surface by its mapped capability", () => {
    expect(canAccessPremiumSurface(["inventory.retail"], "inventory.purchases")).toBe(true);
    expect(canAccessPremiumSurface(["inventory.retail"], "inventory.suppliers")).toBe(true);
    expect(canAccessPremiumSurface([], "inventory.purchases")).toBe(false);
    expect(canAccessPremiumSurface(["reports.margins"], "inventory.valuation")).toBe(true);
    expect(canAccessPremiumSurface(["inventory.retail"], "inventory.valuation")).toBe(false);
    expect(canAccessPremiumSurface(["promotions"], "promotions.convenio")).toBe(false);
    expect(canAccessPremiumSurface(["promotions.convenio"], "promotions.convenio")).toBe(true);
  });

  it("leaves unmapped surfaces alone", () => {
    expect(canAccessPremiumSurface([], "inventory.insumos")).toBe(true);
  });

  it("treats missing capabilities as denied on mapped surfaces", () => {
    expect(canAccessPremiumSurface(undefined, "inventory.purchases")).toBe(false);
  });
});
