/**
 * Contextual Navigation Model and URL generator for Owner Dashboard.
 *
 * Authority:
 * - docs/nhilos/owner_dashboard_experience_standard_v1.0.md §5, §6 & §27.3
 *
 * Principles:
 * - Every "Ver", row, chart point or alert carrying a destination must carry its context.
 * - URL-first: context lives in shareable, bookmarkable query parameters.
 * - Centralized helper: no hand-crafted query strings scattered across widgets.
 */

export type DashboardSourceWidget =
  | "attention"
  | "top-products"
  | "payment-mix"
  | "sales-trend"
  | "hourly-sales"
  | "profitability"
  | "kpi";

export type DashboardEntityType =
  | "product"
  | "payment"
  | "invoice"
  | "inventory-item";

export interface DashboardNavigationContext {
  source: "dashboard";
  sourceWidget: DashboardSourceWidget;
  startDate?: string;
  endDate?: string;
  entityType?: DashboardEntityType;
  entityId?: string;
  filters?: Record<string, string | string[]>;
  severity?: "CRITICAL" | "WARNING" | "INFO";
  returnTo?: string;
}

/**
 * Serializes a typed dashboard navigation context and target-specific params into a URL pathname + search string.
 */
export function buildDashboardDrilldownUrl(
  path: string,
  context: DashboardNavigationContext,
  additionalParams?: Record<string, string | number | boolean | undefined>,
): string {
  const [basePath = path, existingQuery] = path.split("?");
  const params = new URLSearchParams(existingQuery);

  params.set("source", context.source);
  params.set("sourceWidget", context.sourceWidget);

  if (context.startDate) params.set("startDate", context.startDate);
  if (context.endDate) params.set("endDate", context.endDate);
  if (context.entityType) params.set("entityType", context.entityType);
  if (context.entityId) params.set("entityId", context.entityId);
  if (context.severity) params.set("severity", context.severity);
  if (context.returnTo) params.set("returnTo", context.returnTo);

  if (context.filters) {
    for (const [key, value] of Object.entries(context.filters)) {
      if (Array.isArray(value)) {
        params.delete(key);
        for (const item of value) {
          params.append(key, item);
        }
      } else if (value !== undefined) {
        params.set(key, value);
      }
    }
  }

  if (additionalParams) {
    for (const [key, value] of Object.entries(additionalParams)) {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    }
  }

  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * Extracts and parses dashboard navigation context from URL search params.
 */
export function parseDashboardNavigationContext(
  searchParams: URLSearchParams,
): Partial<DashboardNavigationContext> | null {
  const source = searchParams.get("source");
  if (source !== "dashboard") {
    return null;
  }

  const result: Partial<DashboardNavigationContext> = {
    source: "dashboard",
  };

  const sourceWidget = searchParams.get("sourceWidget") as DashboardSourceWidget | null;
  if (sourceWidget) result.sourceWidget = sourceWidget;

  const startDate = searchParams.get("startDate");
  if (startDate) result.startDate = startDate;

  const endDate = searchParams.get("endDate");
  if (endDate) result.endDate = endDate;

  const entityType = searchParams.get("entityType") as DashboardEntityType | null;
  if (entityType) result.entityType = entityType;

  const entityId = searchParams.get("entityId");
  if (entityId) result.entityId = entityId;

  const severity = searchParams.get("severity") as "CRITICAL" | "WARNING" | "INFO" | null;
  if (severity) result.severity = severity;

  const returnTo = searchParams.get("returnTo");
  if (returnTo) result.returnTo = returnTo;

  return result;
}
