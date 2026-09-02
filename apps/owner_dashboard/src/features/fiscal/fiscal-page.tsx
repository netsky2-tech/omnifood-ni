import { useState } from "react";
import { FreshnessBadge } from "@/components/freshness-badge";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import {
  useMonthlyFiscalSummary,
  useVoidedInvoices,
  useSequenceAudit,
  useSalesBookExport,
  useZReportsExport,
} from "./use-fiscal-reports";

type TabId = "summary" | "voided" | "sequence" | "exports";

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "Resumen Mensual" },
  { id: "voided", label: "Anulaciones" },
  { id: "sequence", label: "Auditoría Secuencia" },
  { id: "exports", label: "Exportaciones" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function currentMonthYear(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function SummaryTab(_props: { startDate?: string; endDate?: string }) {
  const { year, month } = currentMonthYear();
  const { data, isLoading } = useMonthlyFiscalSummary(year, month);

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState message="Sin datos de resumen fiscal" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Ventas Brutas" value={formatCurrency(data.totalGrossSales)} />
        <StatCard label="Facturas" value={String(data.invoiceCount)} />
        <StatCard label="IVA Recaudado" value={formatCurrency(data.totalTaxCollected)} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Ventas Gravables" value={formatCurrency(data.totalTaxableSales)} />
        <StatCard label="Ventas Exentas" value={formatCurrency(data.totalExemptSales)} />
        <StatCard label="Notas de Crédito" value={String(data.creditNoteCount)} />
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Resumen Fiscal
        </h3>
        <div className="space-y-2">
          {[
            { label: "Neto Gravable", val: formatCurrency(data.netTaxableSales) },
            { label: "IVA Neto a Pagar", val: formatCurrency(data.netTaxPayable) },
            { label: "Notas de Crédito (total)", val: formatCurrency(data.totalCreditNotes) },
            { label: "IVA en Notas de Crédito", val: formatCurrency(data.totalCreditNotesTax) },
          ].map((item) => (
            <div key={item.label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="tabular-nums">{item.val}</span>
            </div>
          ))}
        </div>
      </div>
      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}

function VoidedTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading } = useVoidedInvoices(startDate, endDate);

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState message="Sin datos de anulaciones" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatCard label="Total Anuladas" value={String(data.totalVoidedCount)} />
        <StatCard label="Monto Total Anulado" value={formatCurrency(data.totalVoidedAmount)} />
      </div>
      <div className="rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                Factura
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                Cajero
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Total
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                Motivo
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                Fecha
              </th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-xs">{inv.number}</td>
                <td className="px-4 py-3">{inv.cashierName}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(inv.total)}</td>
                <td className="px-4 py-3 text-muted-foreground">{inv.voidReason}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(inv.canceledAt).toLocaleDateString("es-NI")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}

function SequenceTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading } = useSequenceAudit(startDate, endDate);

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState message="Sin datos de auditoría de secuencia" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Secuencia Esperada" value={String(data.expectedCount)} />
        <StatCard label="Secuencia Real" value={String(data.actualCount)} />
        <StatCard
          label="Secuencias Faltantes"
          value={String(data.missingSequences.length)}
          variant={data.hasGaps ? "warning" : "default"}
        />
      </div>

      {data.hasGaps && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
          {data.missingSequences.length} secuencia(s) faltante(s):{" "}
          <span className="font-mono">{data.missingSequences.join(", ")}</span>
        </div>
      )}

      {data.duplicateSequences.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {data.duplicateSequences.length} secuencia(s) duplicada(s):{" "}
          <span className="font-mono">{data.duplicateSequences.join(", ")}</span>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                Serie
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Inicio
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Fin
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Real / Esperado
              </th>
              <th className="px-4 py-3 text-center font-semibold uppercase text-muted-foreground">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {data.series.map((s) => (
              <tr key={s.seriesPrefix} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-xs">{s.seriesPrefix}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.startSequence}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.endSequence}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {s.actualCount} / {s.expectedCount}
                </td>
                <td className="px-4 py-3 text-center">
                  {s.hasGaps ? (
                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      CON FALTAS
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                      OK
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}

function ExportsTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const salesBook = useSalesBookExport(startDate, endDate);
  const zReports = useZReportsExport(startDate, endDate);

  if (salesBook.isLoading || zReports.isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Libro de Ventas</h3>
          <div className="flex gap-2">
            <ExportButton label="CSV" />
            <ExportButton label="JSON" />
          </div>
        </div>
        {salesBook.data ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Registros</span>
              <span className="tabular-nums">{salesBook.data.totalRecords} registros</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Bruto (NIO)</span>
              <span className="tabular-nums">{formatCurrency(salesBook.data.totalGrossNio)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total IVA (NIO)</span>
              <span className="tabular-nums">{formatCurrency(salesBook.data.totalTaxNio)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Exento (NIO)</span>
              <span className="tabular-nums">{formatCurrency(salesBook.data.totalExemptNio)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin datos disponibles</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Reportes Z</h3>
          <div className="flex gap-2">
            <ExportButton label="CSV" />
            <ExportButton label="JSON" />
          </div>
        </div>
        {zReports.data ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Turnos</span>
              <span className="tabular-nums">{zReports.data.totalRecords} registros</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin datos disponibles</p>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "default" | "warning";
}) {
  return (
    <div
      className={`rounded-lg border bg-card p-4 ${
        variant === "warning"
          ? "border-yellow-300 dark:border-yellow-700"
          : "border-border"
      }`}
    >
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          variant === "warning"
            ? "text-yellow-600 dark:text-yellow-400"
            : "text-card-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ExportButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
    >
      {label}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function FiscalPage() {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [range, setRange] = useState<DateRangeValue>(() => {
    const d = new Date();
    const iso = d.toISOString().slice(0, 10);
    return { startDate: iso, endDate: iso };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Fiscal</h1>
        <div className="flex items-center gap-3">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {activeTab === "summary" && (
          <SummaryTab startDate={range.startDate} endDate={range.endDate} />
        )}
        {activeTab === "voided" && (
          <VoidedTab startDate={range.startDate} endDate={range.endDate} />
        )}
        {activeTab === "sequence" && (
          <SequenceTab startDate={range.startDate} endDate={range.endDate} />
        )}
        {activeTab === "exports" && (
          <ExportsTab startDate={range.startDate} endDate={range.endDate} />
        )}
      </div>
    </div>
  );
}
