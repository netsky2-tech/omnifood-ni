import { api, type ApiClientMethodOptions } from "@/lib/api";
import type {
  AuditEvent,
  AuditEventsResponse,
  AuditSeverity,
  SupervisionFlow,
  SupervisionReviewClassCount,
  SupervisionReviewEntry,
  SupervisionReviewResponse,
} from "./types";

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
 * S4b — POS forensic ledger surface (GET /operations/audit/ledger, S4a wire
 * contract) and the nightly integrity report (GET /operations/audit/integrity).
 * Same fail-closed discipline as normalizeAuditEvents: rows without a usable
 * id/timestamp/device are dropped rather than rendered as fabricated entries.
 * Hash-chain columns (`prev_hash`, `entry_hash`) NEVER reach these types —
 * the read models are executive-grade only.
 */
export interface AuditLedgerEntry {
  id: string;
  /** When the POS recorded the entry (ISO 8601 UTC). */
  occurredAt: string;
  /** Human actor email resolved from audit_logs.user_id; null if unresolvable. */
  actorEmail: string | null;
  /** Actor user id — reference data (filter value), never rendered raw. */
  actorUserId: string;
  action: string;
  severity: AuditSeverity;
  targetType: string | null;
  /** Audited entity id — reference data only, rendered muted when present. */
  targetId: string | null;
  /** POS device that produced the entry. */
  deviceId: string;
  sequenceNo: number;
}

export interface AuditLedgerResponse {
  entries: AuditLedgerEntry[];
  /** Page size actually applied by the backend (default 50, max 100). */
  limit: number;
  /** True when more matching rows exist beyond this page (honest flag). */
  truncated: boolean;
  generatedAt: string;
}

export interface AuditIntegrityAlert {
  id: string;
  deviceId: string;
  /** Actor whose chain shows the gap — reference data, never rendered raw. */
  actorUserId: string;
  gapStart: number;
  gapEnd: number;
  firstDetectedAt: string;
  lastSeenAt: string;
}

export interface AuditIntegrityResponse {
  alerts: AuditIntegrityAlert[];
  generatedAt: string;
}

export function normalizeAuditLedger(raw: unknown): AuditLedgerResponse {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const rows = Array.isArray(r.entries) ? r.entries : [];
  const entries: AuditLedgerEntry[] = [];
  for (const entry of rows) {
    const e = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    if (typeof e.id !== "string" || e.id === "") continue;
    if (typeof e.occurredAt !== "string" || e.occurredAt === "") continue;
    if (typeof e.deviceId !== "string" || e.deviceId === "") continue;
    entries.push({
      id: e.id,
      occurredAt: e.occurredAt,
      actorEmail:
        typeof e.actorEmail === "string" && e.actorEmail !== "" ? e.actorEmail : null,
      actorUserId: typeof e.actorUserId === "string" ? e.actorUserId : "",
      action: typeof e.action === "string" ? e.action : "",
      severity: toSeverity(e.severity),
      targetType:
        typeof e.targetType === "string" && e.targetType !== "" ? e.targetType : null,
      targetId:
        typeof e.targetId === "string" && e.targetId !== "" ? e.targetId : null,
      deviceId: e.deviceId,
      sequenceNo: typeof e.sequenceNo === "number" ? e.sequenceNo : 0,
    });
  }
  return {
    entries,
    limit: typeof r.limit === "number" ? r.limit : 0,
    // Honest truncation: only an explicit true from the backend counts.
    truncated: r.truncated === true,
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : "",
  };
}

/**
 * Normalizes the supervision review queue. A row that does not carry the
 * minimum evidence (when, what, who) is DROPPED rather than shown as a
 * half-row: a review line without its evidence is worse than no line.
 */
const SUPERVISION_FLOWS: readonly SupervisionFlow[] = [
  "CLOSE_BOX",
  "MANUAL_DISCOUNT",
  "CASH_DRAWER",
  "MODIFIER_QUANTITY",
];

/**
 * A flow the backend does not know is NOT guessed: it falls back to
 * CLOSE_BOX only when the value is one of the known members; anything else
 * is dropped by the caller (the row is skipped, never half-rendered).
 */
function toSupervisionFlow(raw: unknown): SupervisionFlow {
  return (SUPERVISION_FLOWS as string[]).includes(raw as string)
    ? (raw as SupervisionFlow)
    : "CLOSE_BOX";
}

export function normalizeSupervisionReview(
  raw: unknown,
): SupervisionReviewResponse {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const rows = Array.isArray(r.entries) ? r.entries : [];
  const entries: SupervisionReviewEntry[] = [];
  for (const entry of rows) {
    const e = (typeof entry === "object" && entry !== null
      ? entry
      : {}) as Record<string, unknown>;
    if (typeof e.occurredAt !== "string" || e.occurredAt === "") continue;
    if (typeof e.action !== "string" || e.action === "") continue;
    entries.push({
      occurredAt: e.occurredAt,
      actorEmail:
        typeof e.actorEmail === "string" && e.actorEmail !== ""
          ? e.actorEmail
          : null,
      authorizerEmail:
        typeof e.authorizerEmail === "string" && e.authorizerEmail !== ""
          ? e.authorizerEmail
          : null,
      hadSupervisor: e.hadSupervisor === true,
      method: typeof e.method === "string" && e.method !== "" ? e.method : null,
      flow: toSupervisionFlow(e.flow),
      action: e.action,
      severity: toSeverity(e.severity),
      deviceId: typeof e.deviceId === "string" ? e.deviceId : "",
    });
  }

  const byClass: SupervisionReviewClassCount[] = [];
  for (const entry of Array.isArray(r.byClass) ? r.byClass : []) {
    const c = (typeof entry === "object" && entry !== null
      ? entry
      : {}) as Record<string, unknown>;
    const flow = toSupervisionFlow(c.flow);
    if (!flow) continue;
    byClass.push({
      flow,
      supervised: typeof c.supervised === "number" ? c.supervised : 0,
      selfAuthorized:
        typeof c.selfAuthorized === "number" ? c.selfAuthorized : 0,
    });
  }

  return {
    startDate: typeof r.startDate === "string" ? r.startDate : null,
    endDate: typeof r.endDate === "string" ? r.endDate : null,
    total: typeof r.total === "number" ? r.total : 0,
    selfAuthorizedTotal:
      typeof r.selfAuthorizedTotal === "number" ? r.selfAuthorizedTotal : 0,
    byClass,
    entries,
    limit: typeof r.limit === "number" ? r.limit : 0,
    truncated: r.truncated === true,
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : "",
  };
}

export function normalizeAuditIntegrity(raw: unknown): AuditIntegrityResponse {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const rows = Array.isArray(r.alerts) ? r.alerts : [];
  const alerts: AuditIntegrityAlert[] = [];
  for (const entry of rows) {
    const e = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    if (typeof e.id !== "string" || e.id === "") continue;
    if (typeof e.deviceId !== "string" || e.deviceId === "") continue;
    if (typeof e.firstDetectedAt !== "string" || e.firstDetectedAt === "") continue;
    alerts.push({
      id: e.id,
      deviceId: e.deviceId,
      actorUserId: typeof e.actorUserId === "string" ? e.actorUserId : "",
      gapStart: typeof e.gapStart === "number" ? e.gapStart : 0,
      gapEnd: typeof e.gapEnd === "number" ? e.gapEnd : 0,
      firstDetectedAt: e.firstDetectedAt,
      lastSeenAt:
        typeof e.lastSeenAt === "string" && e.lastSeenAt !== ""
          ? e.lastSeenAt
          : e.firstDetectedAt,
    });
  }
  return {
    alerts,
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : "",
  };
}

/**
 * Owner-dashboard POS counter ledger (GET /operations/audit/ledger, S4a).
 * Filters mirror AuditLedgerQueryDto; `limit` caps the page server-side
 * (backend default 50, max 100). `truncated` in the response is the honest
 * completeness signal for the view.
 */
export function fetchAuditLedger(
  filters: {
    startDate?: string;
    endDate?: string;
    actorUserId?: string;
    targetType?: string;
    limit?: number;
  },
  opts?: ApiClientMethodOptions,
) {
  const url = `/operations/audit/ledger${toQueryParams(filters)}`;
  return opts
    ? api.get<unknown>(url, opts).then(normalizeAuditLedger)
    : api.get<unknown>(url).then(normalizeAuditLedger);
}

/**
 * Nightly integrity report (GET /operations/audit/integrity, S4a): sequence
 * gaps detected in a device/actor hash-chain stream. Read-only surface —
 * the view must distinguish "no alerts" from "could not load".
 */
export function fetchAuditIntegrity(opts?: ApiClientMethodOptions) {
  return opts
    ? api
        .get<unknown>("/operations/audit/integrity", opts)
        .then(normalizeAuditIntegrity)
    : api.get<unknown>("/operations/audit/integrity").then(normalizeAuditIntegrity);
}

/**
 * The owner's review queue for the tenant's supervision policy
 * (GET /operations/audit/supervision-review). Same period contract as the
 * rest of the reporting surfaces.
 */
export function fetchSupervisionReview(
  filters: { startDate?: string; endDate?: string; limit?: number },
  opts?: ApiClientMethodOptions,
) {
  const url = `/operations/audit/supervision-review${toQueryParams(filters)}`;
  return opts
    ? api.get<unknown>(url, opts).then(normalizeSupervisionReview)
    : api.get<unknown>(url).then(normalizeSupervisionReview);
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
