/**
 * Dashboard V2 Batch 6b — Attention Required signal composition (PRD §19,
 * §24; arch spec §15/§16/§18).
 *
 * Five independent react-query signals; each owns its own loading/error
 * state so one failing signal degrades only its own row without breaking
 * the rest of the section or the page (FR-STATE-04/05).
 *
 * Severity model per PRD §19.1: Critical (material fiscal/financial/
 * security/integrity risk), Warning (operational follow-up), Info
 * (awareness). Deep-links only — attention is navigation, never mutation
 * (PRD §24/§16).
 *
 * Exceptions-only panel (PRD §19): "Atención Requerida" surfaces actionable
 * exceptions, never healthy states. A healthy fiscal sequence emits no row
 * (AC-11 is conditional on `hasGaps = true`), and an info-only audit summary
 * emits no row. A signal also carries a temporal scope (current-state vs
 * selected-period) rendered as a quiet chip on its row.
 *
 * Drill-down destinations resolve to the module routes that exist today
 * (PRD §24): stock → Inventory; pending reconciliation → Sales; voids and
 * sequence anomalies → Fiscal (voided invoices / sequence audit); audit →
 * /audit (route pending — see the batch report).
 */
import { useQuery } from "@tanstack/react-query";
import { useAlerts } from "@/features/inventory/use-inventory-reports";
import {
  fetchSequenceAudit,
  fetchVoidedInvoices,
} from "@/features/fiscal/fiscal-api";
import {
  fetchAuditSummary,
  fetchCardReconciliationSummary,
} from "./dashboard-api";
import type { LocalDateRange } from "./domain/comparison-period";
import { buildDashboardDrilldownUrl } from "./domain/navigation-context";

export type AttentionSeverity = "critical" | "warning" | "info";

export type AttentionKey = "stock" | "vouchers" | "voids" | "sequence" | "audit";

/**
 * Temporal scope of a signal's data, rendered as a quiet chip so the owner
 * can tell current state from the selected date range at a glance (§28:
 * the chip is textual, never color-only).
 */
export type AttentionScope = "current" | "period";

export interface AttentionItem {
  key: AttentionKey;
  label: string;
  severity: AttentionSeverity;
  detail: string;
  href: string;
  scope: AttentionScope;
  actionLabel: string;
}

export interface AttentionSignal {
  key: AttentionKey;
  label: string;
  status: "pending" | "error" | "ready";
  /** null when the signal is ready and healthy (nothing to surface). */
  item: AttentionItem | null;
}

const SIGNAL_LABELS: Record<AttentionKey, string> = {
  stock: "Stock crítico",
  vouchers: "Vouchers pendientes",
  voids: "Anulaciones",
  sequence: "Secuencia fiscal",
  audit: "Auditoría / Seguridad",
};

/**
 * Single auditable lookup: which signals describe current state (not
 * date-filtered) vs the selected page period (fetched with
 * `range.start`/`range.end`).
 *
 * - `stock`: inventory alerts snapshot — no date range.
 * - `vouchers`: card-reconciliation summary is explicitly an
 *   outstanding-state snapshot (see `fetchCardReconciliationSummary`).
 * - `voids`, `sequence`, `audit`: date-scoped to the page range.
 */
const SIGNAL_SCOPES: Record<AttentionKey, AttentionScope> = {
  stock: "current",
  vouchers: "current",
  voids: "period",
  sequence: "period",
  audit: "period",
};

const SIGNAL_ACTION_LABELS: Record<AttentionKey, string> = {
  stock: "Ver productos",
  vouchers: "Revisar vouchers",
  voids: "Ver anulaciones",
  sequence: "Revisar secuencia",
  audit: "Ver auditoría",
};

export function formatAttentionCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function item(
  key: AttentionKey,
  severity: AttentionSeverity,
  detail: string,
  href: string,
): AttentionItem {
  return {
    key,
    label: SIGNAL_LABELS[key],
    severity,
    detail,
    href,
    scope: SIGNAL_SCOPES[key],
    actionLabel: SIGNAL_ACTION_LABELS[key],
  };
}

/** Stable row order for rendering: Critical, Warning, Info. */
const SEVERITY_ORDER: Record<AttentionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function compareAttentionItems(a: AttentionItem, b: AttentionItem): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
}

/**
 * Stock signals reuse the existing inventory alerts report
 * (GET /inventory/reports/alerts, AC-10): critical counts outrank
 * low/negative stock per PRD §19.2.
 */
function buildStockItem(
  data: { criticalCount: number; warningCount: number; negativeCount: number } | null,
): AttentionItem | null {
  if (!data) return null;
  const isCritical = data.criticalCount > 0;
  const low = data.warningCount + data.negativeCount;
  if (!isCritical && low <= 0) return null;

  const severity: AttentionSeverity = isCritical ? "critical" : "warning";
  const detail = isCritical
    ? `${data.criticalCount} producto(s) en nivel crítico`
    : `${low} producto(s) con stock bajo/negativo`;

  const href = buildDashboardDrilldownUrl(
    "/inventory",
    {
      source: "dashboard",
      sourceWidget: "attention",
      severity: isCritical ? "CRITICAL" : "WARNING",
      filters: { status: isCritical ? "CRITICAL" : "WARNING" },
    },
    { tab: "alerts" },
  );

  return item("stock", severity, detail, href);
}

export function useAttentionSignals(range: LocalDateRange): AttentionSignal[] {
  const alertsQuery = useAlerts();

  const reconciliationQuery = useQuery({
    queryKey: ["sales", "attention", "card-reconciliation-summary"],
    queryFn: ({ signal }) => fetchCardReconciliationSummary({ signal }),
    staleTime: 60 * 1000,
    retry: false,
  });

  // Voids are date-scoped to the selected day (AC-12: count/amount without
  // treating voids as sales).
  const voidsQuery = useQuery({
    queryKey: ["fiscal", "attention", "voided-invoices", range.start, range.end],
    queryFn: ({ signal }) => fetchVoidedInvoices(range.start, range.end, { signal }),
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const sequenceQuery = useQuery({
    queryKey: ["fiscal", "attention", "sequence-audit", range.start, range.end],
    queryFn: ({ signal }) => fetchSequenceAudit(range.start, range.end, undefined, { signal }),
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const auditQuery = useQuery({
    queryKey: ["operations", "attention", "audit-summary", range.start, range.end],
    queryFn: ({ signal }) => fetchAuditSummary(range.start, range.end, { signal }),
    staleTime: 60 * 1000,
    retry: false,
  });

  function toSignal<T>(
    key: AttentionKey,
    state: { isPending: boolean; isError: boolean },
    data: T | null | undefined,
    build: (data: T) => AttentionItem | null,
  ): AttentionSignal {
    if (state.isPending) {
      return { key, label: SIGNAL_LABELS[key], status: "pending", item: null };
    }
    if (state.isError || data == null) {
      return { key, label: SIGNAL_LABELS[key], status: "error", item: null };
    }
    return { key, label: SIGNAL_LABELS[key], status: "ready", item: build(data) };
  }

  const stock = toSignal("stock", alertsQuery, alertsQuery.data, (d) =>
    buildStockItem(d),
  );

  const vouchers = toSignal(
    "vouchers",
    reconciliationQuery,
    reconciliationQuery.data,
    (d) =>
      d.pendingCount > 0
        ? item(
            "vouchers",
            "warning",
            `${d.pendingCount} voucher(s) pendientes · ${formatAttentionCurrency(d.pendingAmountNio)}`,
            buildDashboardDrilldownUrl(
              "/sales",
              {
                source: "dashboard",
                sourceWidget: "attention",
                filters: { paymentMethod: "card" },
              },
              { tab: "summary" },
            ),
          )
        : null,
  );

  const voids = toSignal("voids", voidsQuery, voidsQuery.data, (d) =>
    d.totalVoidedCount > 0
      ? item(
          "voids",
          "warning",
          `${d.totalVoidedCount} anulaciones · ${formatAttentionCurrency(d.totalVoidedAmount)}`,
          buildDashboardDrilldownUrl(
            "/fiscal",
            {
              source: "dashboard",
              sourceWidget: "attention",
              startDate: range.start,
              endDate: range.end,
            },
            { tab: "voided" },
          ),
        )
      : null,
  );

  // AC-11 is conditional on `hasGaps = true`: it requires the sequence row
  // only when the sequence-audit reports gaps (or duplicates). §19 scopes
  // "Atención Requerida" to actionable exceptions, so a healthy sequence is
  // deliberately silent — no healthy Info row — and the panel itself hides
  // when no exception remains.
  const sequence = toSignal("sequence", sequenceQuery, sequenceQuery.data, (d) => {
    if (d.hasGaps || d.duplicateSequences.length > 0) {
      return item(
        "sequence",
        "critical",
        `Gaps en secuencia fiscal · ${d.missingSequences.length} faltante(s), ${d.duplicateSequences.length} duplicado(s)`,
        buildDashboardDrilldownUrl(
          "/fiscal",
          {
            source: "dashboard",
            sourceWidget: "attention",
            startDate: range.start,
            endDate: range.end,
            severity: "CRITICAL",
          },
          { tab: "sequence" },
        ),
      );
    }
    return null;
  });

  // Exceptions-only panel (§19): info-only audit activity is awareness, not
  // an actionable exception — no row unless there is a critical or warning
  // event.
  const audit = toSignal("audit", auditQuery, auditQuery.data, (d) => {
    if (d.criticalCount > 0) {
      return item(
        "audit",
        "critical",
        `${d.criticalCount} evento(s) crítico(s)`,
        buildDashboardDrilldownUrl("/audit", {
          source: "dashboard",
          sourceWidget: "attention",
          startDate: range.start,
          endDate: range.end,
          severity: "CRITICAL",
        }),
      );
    }
    if (d.warningCount > 0) {
      return item(
        "audit",
        "warning",
        `${d.warningCount} evento(s) de advertencia`,
        buildDashboardDrilldownUrl("/audit", {
          source: "dashboard",
          sourceWidget: "attention",
          startDate: range.start,
          endDate: range.end,
          severity: "WARNING",
        }),
      );
    }
    return null;
  });

  return [stock, vouchers, voids, sequence, audit];
}
