'use client';

import { useState } from 'react';
import {
  Building2,
  Calendar,
  AlertCircle,
  Clock,
  UtensilsCrossed,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSafeSearchParams } from '@/lib/safe-search-params';
import {
  useCorporateMetrics,
  downloadCorporateMetricsFile,
  type CorporateCustomerSummary,
} from './corporate-metrics-api';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 2,
  }).format(amount);
}

function getStartOfMonthISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CorporateMetricsTab() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSafeSearchParams();
  const startDate = searchParams.get('startDate') || getStartOfMonthISO();
  const endDate = searchParams.get('endDate') || getTodayISO();

  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  // Export is a long-running operation (§36): the button must acknowledge the
  // start and block a second click. One key per action target, so exporting a
  // company never disables the ranking export and vice versa.
  const [pendingExport, setPendingExport] = useState<string | null>(null);

  const updateDates = (newStart: string, newEnd: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newStart === getStartOfMonthISO() && newEnd === getTodayISO()) {
          next.delete('startDate');
          next.delete('endDate');
        } else {
          next.set('startDate', newStart);
          next.set('endDate', newEnd);
        }
        return next;
      },
      { replace: true },
    );
  };

  const { data, isLoading, error, refetch } = useCorporateMetrics(
    startDate || undefined,
    endDate || undefined,
  );

  const handleExportRanking = async (format: 'xlsx' | 'pdf') => {
    if (!data || data.companies.length === 0) return;
    const exportKey = `ranking:${format}`;
    if (pendingExport !== null) return;
    setPendingExport(exportKey);
    try {
      await downloadCorporateMetricsFile({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        format,
      });

      toast({
        variant: 'success',
        title: `Reporte de Convenios (${format.toUpperCase()})`,
        description: `Se descargó el reporte de convenios en formato ${format.toUpperCase()}.`,
      });
    } catch (exportError) {
      toast({
        variant: 'destructive',
        title: 'Error al exportar',
        description:
          exportError instanceof Error && exportError.message
            ? exportError.message
            : `No se pudo generar el archivo ${format.toUpperCase()} de convenios.`,
      });
    } finally {
      setPendingExport(null);
    }
  };

  const handleExportCompanyDetail = async (
    company: CorporateCustomerSummary,
    format: 'xlsx' | 'pdf',
  ) => {
    if (!company.topProducts || company.topProducts.length === 0) return;
    const exportKey = `company:${company.customerId}:${format}`;
    if (pendingExport !== null) return;
    setPendingExport(exportKey);
    try {
      await downloadCorporateMetricsFile({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        format,
        companyId: company.customerId,
        companyName: company.customerName,
      });

      toast({
        variant: 'success',
        title: `Detalle de consumo (${format.toUpperCase()})`,
        description: `Se descargó el reporte de productos para ${company.customerName}.`,
      });
    } catch (exportError) {
      toast({
        variant: 'destructive',
        title: 'Error al exportar',
        description:
          exportError instanceof Error && exportError.message
            ? exportError.message
            : 'No se pudo generar el detalle de consumo.',
      });
    } finally {
      setPendingExport(null);
    }
  };

  const handleSetCurrentMonth = () => {
    updateDates(getStartOfMonthISO(), getTodayISO());
  };

  const handleSetLastMonth = () => {
    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const year = prevMonthDate.getFullYear();
    const month = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
    const lastDay = String(lastDayPrevMonth.getDate()).padStart(2, '0');

    updateDates(`${year}-${month}-01`, `${year}-${month}-${lastDay}`);
  };

  const handleSetLast30Days = () => {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const format = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    updateDates(format(thirtyDaysAgo), format(now));
  };

  const toggleExpand = (companyId: string) => {
    setExpandedCompanyId((prev) => (prev === companyId ? null : companyId));
  };

  return (
    <div className="space-y-6">
      {/* Date Filter Bar */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSetCurrentMonth}
            className="text-xs"
          >
            Este Mes
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSetLastMonth}
            className="text-xs"
          >
            Mes Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSetLast30Days}
            className="text-xs"
          >
            Últimos 30 días
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Desde:</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => updateDates(e.target.value, endDate)}
              className="h-8 w-36 text-xs"
              aria-label="Fecha inicial"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Hasta:</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => updateDates(startDate, e.target.value)}
              className="h-8 w-36 text-xs"
              aria-label="Fecha final"
            />
          </div>
        </div>
      </div>

      {isLoading && (
        <LoadingState message="Cargando métricas de convenios y empresas..." />
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No se pudieron consultar las métricas corporativas</AlertTitle>
          <AlertDescription className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Ocurrió un error al comunicarse con el servidor. Verifique su conexión y reintente.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="shrink-0 text-xs"
            >
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          {/* KPI Cards Strip */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Facturación Neta"
              value={formatCurrency(data.kpis.totalCorporateNetSalesNio)}
              subtitle={`Bruto: ${formatCurrency(data.kpis.totalCorporateGrossSalesNio)}`}
            />
            <StatCard
              label="Descuentos Otorgados"
              value={formatCurrency(data.kpis.totalCorporateDiscountNio)}
              subtitle={`Tasa efectiva: ${data.kpis.overallEffectiveDiscountRate}%`}
            />
            <StatCard
              label="Tickets"
              value={String(data.kpis.totalCorporateTickets)}
              subtitle={`${data.kpis.activeCompaniesCount} empresas activas`}
            />
            <StatCard
              label="Ticket Promedio"
              value={formatCurrency(data.kpis.overallAverageTicketNio)}
              subtitle="Por transacción"
            />
          </div>

          {/* Behavior & Pattern Section: Top Products & Peak Hours */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Top Products Card */}
            <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
              <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <UtensilsCrossed className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-foreground text-sm">
                    Productos Más Consumidos en Convenios
                  </h3>
                </div>
                <span className="text-xs text-muted-foreground">
                  Consolidado general
                </span>
              </div>

              {!data.overallTopProducts || data.overallTopProducts.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Sin consumo de productos registrado en este período.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.overallTopProducts.slice(0, 5).map((prod, index) => (
                    <div
                      key={prod.productId}
                      className="flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-[10px] text-muted-foreground">
                          {index + 1}
                        </span>
                        <span
                          className="font-medium text-foreground truncate"
                          title={prod.productName}
                        >
                          {prod.productName}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-right tabular-nums">
                        <span className="text-muted-foreground">
                          {prod.quantity} ud{prod.quantity !== 1 ? 's' : ''}
                        </span>
                        <span className="font-semibold text-foreground w-20">
                          {formatCurrency(prod.netSalesNio)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Afluencia Semanal y Horarios Pico */}
            <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
              <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-foreground text-sm">
                    Afluencia Semanal y Horarios Pico
                  </h3>
                </div>
                <span className="text-xs text-muted-foreground">
                  Hora de Managua (UTC-6)
                </span>
              </div>

              {/* Day Distribution Bar */}
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Días con Mayor Demanda
                </p>
                <div className="grid grid-cols-7 gap-1.5 text-center">
                  {(data.overallDayDistribution || []).map((day) => {
                    const maxTickets = Math.max(
                      ...(data.overallDayDistribution || []).map((d) => d.ticketCount),
                      1,
                    );
                    const heightPct = Math.round((day.ticketCount / maxTickets) * 100);
                    const isPeak = day.ticketCount > 0 && day.ticketCount === maxTickets;

                    return (
                      <div
                        key={day.dayOfWeek}
                        className="flex flex-col items-center gap-1"
                      >
                        <div className="flex h-12 w-full items-end justify-center rounded bg-muted/40 p-0.5">
                          <div
                            style={{ height: `${Math.max(heightPct, 8)}%` }}
                            className={`w-full rounded-xs transition-all ${
                              isPeak
                                ? 'bg-primary'
                                : day.ticketCount > 0
                                  ? 'bg-primary/50'
                                  : 'bg-muted-foreground/15'
                            }`}
                            title={`${day.dayName}: ${day.ticketCount} tickets (${formatCurrency(day.netSalesNio)})`}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground truncate w-full">
                          {day.dayName.slice(0, 3)}
                        </span>
                        <span className="text-[10px] font-semibold tabular-nums text-foreground">
                          {day.ticketCount}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Peak Hours Badges */}
                <div className="pt-2 border-t border-border/40">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Franjas Horarias Preferidas
                  </p>
                  {!data.overallPeakHours || data.overallPeakHours.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      Sin visitas registradas en este período.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {data.overallPeakHours.slice(0, 4).map((peak) => (
                        <div
                          key={peak.hour}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs"
                        >
                          <span className="font-semibold text-foreground">
                            {peak.formattedHour}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            ({peak.ticketCount} ticket{peak.ticketCount !== 1 ? 's' : ''})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Companies Ranking Table with Expandable Detail */}
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
            <div className="border-b border-border bg-muted/40 px-4 py-3 sm:px-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">
                  Rendimiento por Empresa y Convenio
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-2 hidden text-xs text-muted-foreground lg:inline">
                  Haga clic en una empresa para ver sus productos y horarios
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportRanking('xlsx')}
                  disabled={!data || data.companies.length === 0 || pendingExport !== null}
                  loading={pendingExport === 'ranking:xlsx'}
                  className="h-8 gap-1.5 text-xs font-medium"
                  aria-label="Exportar a Excel"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Exportar a Excel</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportRanking('pdf')}
                  disabled={!data || data.companies.length === 0 || pendingExport !== null}
                  loading={pendingExport === 'ranking:pdf'}
                  className="h-8 gap-1.5 text-xs font-medium"
                  aria-label="Exportar a PDF"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Exportar a PDF</span>
                </Button>
              </div>
            </div>

            {data.companies.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="Sin ventas corporativas en este período"
                description="No se registraron transacciones asociadas a clientes tipo empresa o con convenios aplicados en el rango de fechas seleccionado."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSetCurrentMonth}
                    className="mt-2 text-xs"
                  >
                    Ver mes actual
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th className="w-8 px-2 py-3"></th>
                      <th className="px-4 py-3">Empresa</th>
                      <th className="px-4 py-3">Convenio Activo</th>
                      <th className="px-4 py-3 text-right">Tickets</th>
                      <th className="px-4 py-3 text-right">Venta Bruta</th>
                      <th className="px-4 py-3 text-right">Descuentos</th>
                      <th className="px-4 py-3 text-right">Venta Neta</th>
                      <th className="px-4 py-3 text-right">% Efectivo</th>
                      <th className="px-4 py-3 text-right sm:pr-6">Ticket Prom.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.companies.map((company) => {
                      const isExpanded = expandedCompanyId === company.customerId;

                      return (
                        <CompanyRowWithDetail
                          key={company.customerId}
                          company={company}
                          isExpanded={isExpanded}
                          onToggle={() => toggleExpand(company.customerId)}
                          onExportDetail={handleExportCompanyDetail}
                          pendingExport={pendingExport}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CompanyRowWithDetail({
  company,
  isExpanded,
  onToggle,
  onExportDetail,
  pendingExport,
}: {
  company: CorporateCustomerSummary;
  isExpanded: boolean;
  onToggle: () => void;
  onExportDetail: (
    company: CorporateCustomerSummary,
    format: 'xlsx' | 'pdf',
  ) => void;
  /** Key of the export currently running, shared with the page-level buttons. */
  pendingExport: string | null;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer transition-colors hover:bg-muted/30"
      >
        <td className="w-8 px-2 py-3.5 text-center text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 inline" />
          ) : (
            <ChevronRight className="h-4 w-4 inline" />
          )}
        </td>
        <td className="px-4 py-3.5">
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">
              {company.customerName}
            </span>
            <span className="text-xs text-muted-foreground">
              {company.customerTaxId
                ? `RUC: ${company.customerTaxId}`
                : 'Sin RUC registrado'}
            </span>
          </div>
        </td>
        <td className="px-4 py-3.5">
          {company.convenioName || company.convenioCode ? (
            <span
              className="font-medium text-foreground text-sm"
              title={company.convenioName || company.convenioCode || ''}
            >
              {company.convenioName || company.convenioCode}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              Sin convenio formal
            </span>
          )}
        </td>
        <td className="px-4 py-3.5 text-right tabular-nums text-foreground">
          {company.ticketCount}
        </td>
        <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
          {formatCurrency(company.grossSalesNio)}
        </td>
        <td className="px-4 py-3.5 text-right tabular-nums text-rose-600 dark:text-rose-400 font-medium">
          {company.discountNio > 0
            ? `-${formatCurrency(company.discountNio)}`
            : 'C$0.00'}
        </td>
        <td className="px-4 py-3.5 text-right tabular-nums font-bold text-foreground">
          {formatCurrency(company.netSalesNio)}
        </td>
        <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground font-medium">
          {company.effectiveDiscountRate > 0
            ? `${company.effectiveDiscountRate}%`
            : '0%'}
        </td>
        <td className="px-4 py-3.5 text-right tabular-nums text-foreground sm:pr-6">
          {company.ticketCount > 0
            ? formatCurrency(company.averageTicketNio)
            : '—'}
        </td>
      </tr>

      {/* Expanded Details Row */}
      {isExpanded && (
        <tr className="bg-muted/15 border-b border-border">
          <td colSpan={9} className="p-4 sm:px-8 sm:py-5">
            <div className="rounded-lg border border-border/70 bg-card p-4 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Detalle de Consumo — {company.customerName}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground mr-1">
                    {company.ticketCount} compras registradas
                  </span>
                  {company.topProducts && company.topProducts.length > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExportDetail(company, 'xlsx');
                        }}
                        disabled={pendingExport !== null}
                        loading={pendingExport === `company:${company.customerId}:xlsx`}
                        className="h-7 gap-1 text-[11px] px-2"
                        aria-label={`Exportar Excel de ${company.customerName}`}
                      >
                        <FileSpreadsheet className="h-3 w-3" aria-hidden="true" />
                        <span>Excel</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExportDetail(company, 'pdf');
                        }}
                        disabled={pendingExport !== null}
                        loading={pendingExport === `company:${company.customerId}:pdf`}
                        className="h-7 gap-1 text-[11px] px-2"
                        aria-label={`Exportar PDF de ${company.customerName}`}
                      >
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        <span>PDF</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {company.ticketCount === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">
                  Esta empresa no ha registrado transacciones en el rango de fechas seleccionado.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {/* Top Products */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <UtensilsCrossed className="h-3.5 w-3.5 text-primary" />
                      Platos y Productos Preferidos
                    </p>
                    {!company.topProducts || company.topProducts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Sin datos de productos específicos.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {company.topProducts.map((p, i) => (
                          <div
                            key={p.productId}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-foreground truncate max-w-[200px]">
                              {i + 1}. {p.productName}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {p.quantity} uds • {formatCurrency(p.netSalesNio)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Preferred Hours & Days */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      Horarios y Días Habituales de Visita
                    </p>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[11px] mb-1">
                          Horas pico de visita:
                        </span>
                        {!company.timePattern?.peakHours ||
                        company.timePattern.peakHours.length === 0 ? (
                          <span className="text-muted-foreground italic">
                            Sin registro de horario.
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {company.timePattern.peakHours.map((h) => (
                              <span
                                key={h.hour}
                                className="inline-block rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
                              >
                                {h.formattedHour} ({h.ticketCount} v.)
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-2">
                        <span className="text-muted-foreground block text-[11px] mb-1">
                          Días con mayor afluencia:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {(company.timePattern?.daysOfWeek || [])
                            .filter((d) => d.ticketCount > 0)
                            .map((d) => (
                              <span
                                key={d.dayOfWeek}
                                className="inline-block rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {d.dayName}: {d.ticketCount}
                              </span>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
