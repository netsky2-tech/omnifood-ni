import { describe, it, expect } from "vitest";
import {
  buildDashboardDrilldownUrl,
  parseDashboardNavigationContext,
  type DashboardNavigationContext,
} from "./navigation-context";

describe("buildDashboardDrilldownUrl & parseDashboardNavigationContext", () => {
  it("builds a canonical URL with all provided context parameters", () => {
    const ctx: DashboardNavigationContext = {
      source: "dashboard",
      sourceWidget: "attention",
      startDate: "2026-09-01",
      endDate: "2026-09-26",
      entityType: "inventory-item",
      entityId: "prod-123",
      severity: "CRITICAL",
      returnTo: "/",
      filters: {
        status: "CRITICAL",
      },
    };

    const url = buildDashboardDrilldownUrl("/inventory", ctx, { tab: "alerts" });

    expect(url).toContain("/inventory?");
    expect(url).toContain("source=dashboard");
    expect(url).toContain("sourceWidget=attention");
    expect(url).toContain("startDate=2026-09-01");
    expect(url).toContain("endDate=2026-09-26");
    expect(url).toContain("entityType=inventory-item");
    expect(url).toContain("entityId=prod-123");
    expect(url).toContain("severity=CRITICAL");
    expect(url).toContain("status=CRITICAL");
    expect(url).toContain("tab=alerts");
    expect(url).toContain("returnTo=%2F");
  });

  it("handles array filters properly in URL search params", () => {
    const ctx: DashboardNavigationContext = {
      source: "dashboard",
      sourceWidget: "attention",
      filters: {
        tag: ["urgent", "low-stock"],
      },
    };

    const url = buildDashboardDrilldownUrl("/inventory", ctx);
    const searchParams = new URLSearchParams(url.split("?")[1]);
    expect(searchParams.getAll("tag")).toEqual(["urgent", "low-stock"]);
  });

  it("parses context correctly from search params", () => {
    const searchParams = new URLSearchParams(
      "source=dashboard&sourceWidget=top-products&startDate=2026-09-01&endDate=2026-09-26&entityType=product&entityId=prod-99&severity=WARNING&returnTo=%2F",
    );

    const parsed = parseDashboardNavigationContext(searchParams);
    expect(parsed).toEqual({
      source: "dashboard",
      sourceWidget: "top-products",
      startDate: "2026-09-01",
      endDate: "2026-09-26",
      entityType: "product",
      entityId: "prod-99",
      severity: "WARNING",
      returnTo: "/",
    });
  });

  it("returns null when source is not dashboard", () => {
    const searchParams = new URLSearchParams("foo=bar");
    expect(parseDashboardNavigationContext(searchParams)).toBeNull();
  });
});
