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

export type AttentionSeverity = "critical" | "warning" | "info";

export type AttentionKey = "stock" | "vouchers" | "voids" | "sequence" | "audit";

export interface AttentionItem {
  key: AttentionKey;
  label: string;
  severity: AttentionSeverity;
  detail: string;
  href: string;
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

const SIGNAL_HREFS: Record<AttentionKey, string> = {
  stock: "/inventory",
  vouchers: "/sales",
  voids: "/fiscal",
  sequence: "/fiscal",
  audit: "/audit",
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
): AttentionItem {
  return {
    key,
    label: SIGNAL_LABELS[key],
    severity,
    detail,
    href: SIGNAL_HREFS[key],
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
  if (data.criticalCount > 0) {
    return item(
      "stock",
      "critical",
      `${data.criticalCount} producto(s) en nivel crítico`,
    );
  }
  const low = data.warningCount + data.negativeCount;
  if (low > 0) {
    return item("stock", "warning", `${low} producto(s) con stock bajo/negativo`);
  }
  return null;
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
          )
        : null,
  );

  const voids = toSignal("voids", voidsQuery, voidsQuery.data, (d) =>
    d.totalVoidedCount > 0
      ? item(
          "voids",
          "warning",
          `${d.totalVoidedCount} anulaciones · ${formatAttentionCurrency(d.totalVoidedAmount)}`,
        )
      : null,
  );

  // AC-11: hasGaps/duplicates → Critical; a healthy sequence stays visible
  // as an Info row ("✓ Secuencia fiscal sin gaps", per the wireframe §1).
  const sequence = toSignal("sequence", sequenceQuery, sequenceQuery.data, (d) => {
    if (d.hasGaps || d.duplicateSequences.length > 0) {
      return item(
        "sequence",
        "critical",
        `Gaps en secuencia fiscal · ${d.missingSequences.length} faltante(s), ${d.duplicateSequences.length} duplicado(s)`,
      );
    }
    return item("sequence", "info", "Secuencia fiscal sin gaps");
  });

  const audit = toSignal("audit", auditQuery, auditQuery.data, (d) => {
    if (d.criticalCount > 0) {
      return item("audit", "critical", `${d.criticalCount} evento(s) crítico(s)`);
    }
    if (d.warningCount > 0) {
      return item("audit", "warning", `${d.warningCount} evento(s) de advertencia`);
    }
    if (d.infoCount > 0) {
      return item("audit", "info", `${d.infoCount} evento(s) informativos`);
    }
    return null;
  });

  return [stock, vouchers, voids, sequence, audit];
}
