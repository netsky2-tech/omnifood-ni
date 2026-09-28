import { api, type ApiClientMethodOptions } from "@/lib/api";
import type { AuditEvent, AuditEventsResponse, AuditSeverity } from "./types";

function toQueryParams(
  params: Record<string, string | number | undefined>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (entries.length === 0) return "";
  return (
    "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
  );
}

const SEVERITIES: readonly AuditSeverity[] = ["CRITICAL", "WARNING", "INFO"];

function toSeverity(value: unknown): AuditSeverity {
  // Fail closed to INFO: historical rows (NULL severity) surface as INFO on
  // the backend, so an unrecognized wire value can never read as an alert.
  return SEVERITIES.includes(value as AuditSeverity)
    ? (value as AuditSeverity)
    : "INFO";
}

/**
 * Wire normalization for GET /operations/audit/events (slice 6b). Garbage
 * fails closed: rows without a usable id/timestamp are dropped rather than
 * rendered as fabricated events.
 */
export function normalizeAuditEvents(raw: unknown): AuditEventsResponse {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const rows = Array.isArray(r.events) ? r.events : [];
  const events: AuditEvent[] = [];
  for (const entry of rows) {
    const e = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    if (typeof e.id !== "string" || e.id === "") continue;
    if (typeof e.occurredAt !== "string" || e.occurredAt === "") continue;
    events.push({
      id: e.id,
      occurredAt: e.occurredAt,
      actorEmail: typeof e.actorEmail === "string" ? e.actorEmail : null,
      actorRef: typeof e.actorRef === "string" ? e.actorRef : null,
      action: typeof e.action === "string" ? e.action : "",
      severity: toSeverity(e.severity),
      targetType: typeof e.targetType === "string" ? e.targetType : "",
      targetId: typeof e.targetId === "string" ? e.targetId : "",
    });
  }
  return {
    events,
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : "",
  };
}

/**
 * Owner-dashboard audit event list (GET /operations/audit/events,
 * OWNER/MANAGER on the backend). `severity` uses the single backend
 * AuditRiskClassifier taxonomy; `limit` caps the page server-side
 * (backend default 50, max 100).
 */
export function fetchAuditEvents(
  filters: {
    startDate?: string;
    endDate?: string;
    severity?: AuditSeverity;
    limit?: number;
  },
  opts?: ApiClientMethodOptions,
) {
  const url = `/operations/audit/events${toQueryParams(filters)}`;
  return opts
    ? api.get<unknown>(url, opts).then(normalizeAuditEvents)
    : api.get<unknown>(url).then(normalizeAuditEvents);
}
