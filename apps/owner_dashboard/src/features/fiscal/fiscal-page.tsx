import { useState } from "react";
import { formatLocalDate } from "@/lib/utils";
import { FreshnessBadge } from "@/components/freshness-badge";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
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

  if (isLoading) return <LoadingState message="Cargando resumen fiscal mensual..." />;
  if (!data) return <EmptyState message="Sin datos de resumen fiscal" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Ventas Brutas" value={formatCurrency(data.totalGrossSales)} />
        <StatCard label="Facturas" value={String(data.invoiceCount)} />
        <StatCard label="IVA Recaudado" value={formatCurrency(data.totalTaxCollected)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Ventas Gravables" value={formatCurrency(data.totalTaxableSales)} />
        <StatCard label="Ventas Exentas" value={formatCurrency(data.totalExemptSales)} />
        <StatCard label="Notas de Crédito" value={String(data.creditNoteCount)} />
      </div>
      <div className="rounded-lg border border-border bg-card p-5 sm:p-6 shadow-xs">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Resumen Fiscal (DGI)
        </h3>
        <div className="space-y-2.5">
          {[
            { label: "Neto Gravable", val: formatCurrency(data.netTaxableSales) },
            { label: "IVA Neto a Pagar", val: formatCurrency(data.netTaxPayable) },
            { label: "Notas de Crédito (total)", val: formatCurrency(data.totalCreditNotes) },
            { label: "IVA en Notas de Crédito", val: formatCurrency(data.totalCreditNotesTax) },
          ].map((item) => (
            <div key={item.label} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="tabular-nums font-medium text-foreground">{item.val}</span>
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

  if (isLoading) return <LoadingState message="Cargando facturas anuladas..." />;
  if (!data) return <EmptyState message="Sin datos de anulaciones" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Total Anuladas" value={String(data.totalVoidedCount)} />
        <StatCard label="Monto Total Anulado" value={formatCurrency(data.totalVoidedAmount)} />
      </div>
      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[540px]">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Factura
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Cajero
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Total
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Motivo
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Fecha
                </th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{inv.number}</td>
                  <td className="px-4 py-3 text-foreground">{inv.cashierName}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">{formatCurrency(inv.total)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{inv.voidReason}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(inv.canceledAt).toLocaleDateString("es-NI")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}

function SequenceTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading } = useSequenceAudit(startDate, endDate);

  if (isLoading) return <LoadingState message="Auditoría de correlatividad fiscal en progreso..." />;
  if (!data) return <EmptyState message="Sin datos de auditoría de secuencia" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Secuencia Esperada" value={String(data.expectedCount)} />
        <StatCard label="Secuencia Real" value={String(data.actualCount)} />
        <StatCard
          label="Secuencias Faltantes"
          value={String(data.missingSequences.length)}
          accent={data.hasGaps}
        />
      </div>

      {data.hasGaps && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
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

      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Serie
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Inicio
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Fin
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Real / Esperado
                </th>
                <th className="px-4 py-3 text-center font-semibold uppercase text-xs text-muted-foreground">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {data.series.map((s) => (
                <tr key={s.seriesPrefix} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{s.seriesPrefix}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.startSequence}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.endSequence}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                    {s.actualCount} / {s.expectedCount}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.hasGaps ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                        CON FALTAS
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function convertRowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0 || !rows[0]) return "";
  const headers = Object.keys(rows[0]);
  const headerLine = headers.join(",");
  const dataLines = rows.map((r) =>
    headers
      .map((h) => {
        const val = r[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(","),
  );
  return [headerLine, ...dataLines].join("\n");
}

function ExportsTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const salesBook = useSalesBookExport(startDate, endDate);
  const zReports = useZReportsExport(startDate, endDate);

  const handleExportSalesBook = (format: "csv" | "json") => {
    if (!salesBook.data) return;
    const fileSuffix = `${startDate ?? "inicio"}_${endDate ?? "fin"}`;
    if (format === "json") {
      downloadBlob(
        JSON.stringify(salesBook.data, null, 2),
        `libro_ventas_${fileSuffix}.json`,
        "application/json",
      );
    } else {
      const csv = convertRowsToCsv(
        (salesBook.data.records ?? []) as unknown as Record<string, unknown>[],
      );
      downloadBlob(csv, `libro_ventas_${fileSuffix}.csv`, "text/csv;charset=utf-8;");
    }
  };

  const handleExportZReports = (format: "csv" | "json") => {
    if (!zReports.data) return;
    const fileSuffix = `${startDate ?? "inicio"}_${endDate ?? "fin"}`;
    if (format === "json") {
      downloadBlob(
        JSON.stringify(zReports.data, null, 2),
        `reportes_z_${fileSuffix}.json`,
        "application/json",
      );
    } else {
      const csv = convertRowsToCsv(
        (zReports.data.records ?? []) as unknown as Record<string, unknown>[],
      );
      downloadBlob(csv, `reportes_z_${fileSuffix}.csv`, "text/csv;charset=utf-8;");
    }
  };

  if (salesBook.isLoading || zReports.isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Libro de Ventas</h3>
          <div className="flex gap-2">
            <ExportButton
              label="CSV"
              disabled={!salesBook.data || salesBook.data.totalRecords === 0}
              onClick={() => handleExportSalesBook("csv")}
            />
            <ExportButton
              label="JSON"
              disabled={!salesBook.data || salesBook.data.totalRecords === 0}
              onClick={() => handleExportSalesBook("json")}
            />
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
            <ExportButton
              label="CSV"
              disabled={!zReports.data || zReports.data.totalRecords === 0}
              onClick={() => handleExportZReports("csv")}
            />
            <ExportButton
              label="JSON"
              disabled={!zReports.data || zReports.data.totalRecords === 0}
              onClick={() => handleExportZReports("json")}
            />
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

function ExportButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:pointer-events-none cursor-pointer transition-colors shadow-xs"
    >
      {label}
    </button>
  );
}

export function FiscalPage() {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [range, setRange] = useState<DateRangeValue>(() => {
    const iso = formatLocalDate(new Date());
    return { startDate: iso, endDate: iso };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Fiscal</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Cumplimiento DGI, correlatividad de facturas y libros de ventas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-4 sm:gap-6 overflow-x-auto pb-1 sm:pb-0" aria-label="Secciones fiscales">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
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
