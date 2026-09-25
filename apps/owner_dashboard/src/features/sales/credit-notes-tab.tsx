import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useRbac } from "@/lib/rbac";
import { isApiError } from "@/lib/api";
import {
  fetchAdminInvoices,
  issueAdminCreditNote,
  type AdminInvoice,
  type AdminInvoiceItem,
} from "./credit-notes-api";
import { useQuery } from "@tanstack/react-query";

/**
 * B1c-2 slice B (D-14, #553 part 2): the credit-note issuance tab.
 *
 * D-20: FULL-TICKET credit notes only. The dialog renders every origin item
 * at its full quantity, read-only — no quantity editing exists in this UI.
 * The POST body passes quantities through so the backend could accept
 * partial values later, but this screen never produces one. A partial
 * correction today is the administrative procedure.
 */

// D-20/JD-A-005: the hints are FISCAL-ONLY and honest. This document
// registers the fiscal correction; the server does not execute any
// inventory effect here (appendCreditNoteCompensation is the device path,
// #519). Never claim stock movements this endpoint does not perform.
const REFUND_POLICIES: { value: string; label: string; hint: string }[] = [
  {
    value: "RESTOCK_ORIGINAL_BOM",
    label: "Reincorporación a inventario",
    hint: "La nota registra la corrección fiscal marcada para reincorporación de inventario.",
  },
  {
    value: "FINANCIAL_ONLY",
    label: "Solo contable",
    hint: "La nota registra únicamente la corrección contable, sin efecto de inventario.",
  },
  {
    value: "WASTE_NO_RESTOCK",
    label: "Merma",
    hint: "La nota registra la corrección fiscal marcada como merma, sin reincorporación.",
  },
  {
    value: "MANAGER_REVIEW_HOLD",
    label: "En revisión de gerencia",
    hint: "La nota queda registrada y el efecto de inventario queda pendiente de revisión de gerencia.",
  },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function rowStateLabel(invoice: AdminInvoice): string {
  if (invoice.isCanceled) return "Anulada";
  if (invoice.type === "creditNote") return "Nota de crédito";
  return "Venta";
}

function isIssuable(invoice: AdminInvoice): boolean {
  return invoice.type === "regular" && !invoice.isCanceled;
}

/** Card separation (D-20): never imply the processor refund happened. */
function originHadCardPayment(invoice: AdminInvoice): boolean {
  return (invoice.payments ?? []).some((payment) =>
    (payment.method ?? "").toLowerCase().includes("card"),
  );
}

function translateSeriesError(message: string): string {
  if (message.includes("FISCAL_CREDIT_NOTE_SERIES_UNCONFIGURED")) {
    return "La serie de notas de crédito no está configurada para este negocio. El propietario debe configurarla antes de poder emitir.";
  }
  if (message.includes("FISCAL_CREDIT_NOTE_SERIES_EXHAUSTED")) {
    return "La serie de notas de crédito está agotada. Debe configurarse un rango nuevo antes de seguir emitiendo.";
  }
  if (message.includes("FISCAL_CREDIT_NOTE_SERIES_INVALID")) {
    return "La configuración de la serie de notas de crédito es inválida. Contacte al propietario para corregirla.";
  }
  return message;
}

function originItems(invoice: AdminInvoice): AdminInvoiceItem[] {
  return invoice.items ?? [];
}

function IssuanceDialog({
  invoice,
  onClose,
}: {
  invoice: AdminInvoice;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [policy, setPolicy] = useState<string>(
    REFUND_POLICIES[0]?.value ?? "FINANCIAL_ONLY",
  );
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState<{ number: string } | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const reasonBlank = reason.trim().length === 0;
  const items = originItems(invoice);
  const hasCardPayment = originHadCardPayment(invoice);

  async function handleConfirm() {
    if (submitting || reasonBlank) return;
    setSubmitting(true);
    setFailureMessage(null);
    try {
      // D-20 tripwire: the body carries EVERY origin item at its FULL
      // quantity (positive absolute value; the backend applies the sign).
      const result = await issueAdminCreditNote({
        originInvoiceId: invoice.id,
        refundReasonCode: reason.trim(),
        refundReasonPolicy: policy,
        items: items.map((item) => ({
          originInvoiceItemId: item.id,
          quantity: Math.abs(Number(item.quantity)),
        })),
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
      setIssued({ number: result.number });
    } catch (error: unknown) {
      const raw = isApiError(error)
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo emitir la nota de crédito.";
      setFailureMessage(translateSeriesError(raw));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="issuance-dialog"
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        {issued ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Nota de crédito emitida
            </h2>
            <p className="text-foreground">
              Se emitió la nota de crédito{" "}
              <span
                className="font-mono font-semibold"
                data-testid="issued-number"
              >
                {issued.number}
              </span>{" "}
              para la factura {invoice.number}.
            </p>
            {hasCardPayment && (
              <p className="text-sm text-muted-foreground" data-testid="card-separation">
                Esta nota registra la corrección fiscal; el reembolso al cliente
                del pago con tarjeta lo procesa el banco por separado.
              </p>
            )}
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Emitir Nota de Crédito
            </h2>
            <p className="text-sm text-muted-foreground">
              Factura origen:{" "}
              <span className="font-mono">{invoice.number}</span> · Total{" "}
              {formatCurrency(invoice.total)}
            </p>
            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Se anularán todos los ítems por su cantidad total
              </p>
              <ul className="space-y-1 text-sm">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex justify-between gap-4 text-foreground"
                    data-testid="origin-item"
                  >
                    <span>
                      {item.productName} × {Math.abs(Number(item.quantity))}
                    </span>
                    <span className="tabular-nums">
                      {formatCurrency(Math.abs(Number(item.total)))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label
                htmlFor="credit-note-reason"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Motivo (requerido)
              </label>
              <textarea
                id="credit-note-reason"
                className="w-full rounded-md border border-border bg-background p-2 text-sm"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                data-testid="credit-note-reason"
              />
            </div>
            <div>
              <label
                htmlFor="credit-note-policy"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Política de la corrección
              </label>
              <select
                id="credit-note-policy"
                className="w-full rounded-md border border-border bg-background p-2 text-sm"
                value={policy}
                onChange={(event) => setPolicy(event.target.value)}
                data-testid="credit-note-policy"
              >
                {REFUND_POLICIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.hint}
                  </option>
                ))}
              </select>
            </div>
            {failureMessage && (
              <p
                className="text-sm text-red-600"
                role="alert"
                data-testid="issuance-error"
              >
                {failureMessage}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                onClick={onClose}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                onClick={handleConfirm}
                disabled={reasonBlank || submitting}
                data-testid="confirm-issuance"
              >
                {submitting ? "Emitiendo..." : "Emitir Nota de Crédito"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CreditNotesTab() {
  const { canPerformAction } = useRbac();
  const canIssue = canPerformAction("creditNotes.issue");
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["admin", "invoices"],
    queryFn: ({ signal }) => fetchAdminInvoices({ signal }),
  });
  const [selected, setSelected] = useState<AdminInvoice | null>(null);

  if (isLoading) return <LoadingState message="Cargando facturas..." />;
  if (!invoices) return <EmptyState message="Sin facturas disponibles" />;

  // The backend list endpoint is unpaginated (findAll); cap the display to
  // the most recent rows so the picker stays a picker, not a report.
  const visible = invoices.slice(0, 50);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Emitir una Nota de Crédito es la corrección fiscal para una venta
        existente. Solo se emiten notas de ticket completo; para correcciones
        parciales use el procedimiento administrativo.
      </p>
      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[540px]">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Factura
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Estado
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Total
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Fecha
                </th>
                {canIssue && (
                  <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                    <span className="sr-only">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">
                    {invoice.number}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {rowStateLabel(invoice)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                    {formatCurrency(invoice.total)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(invoice.created_at).toLocaleDateString("es-NI")}
                  </td>
                  {canIssue && (
                    <td className="px-4 py-3 text-right">
                      {isIssuable(invoice) && (
                        <button
                          type="button"
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                          onClick={() => setSelected(invoice)}
                          data-testid={`issue-credit-note-${invoice.id}`}
                        >
                          Emitir Nota de Crédito
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <IssuanceDialog
          invoice={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
