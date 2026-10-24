'use client';

import { Building2, Calendar, AlertCircle } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSafeSearchParams } from '@/lib/safe-search-params';
import { useCorporateMetrics } from './corporate-metrics-api';

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
  const [searchParams, setSearchParams] = useSafeSearchParams();
  const startDate = searchParams.get('startDate') || getStartOfMonthISO();
  const endDate = searchParams.get('endDate') || getTodayISO();

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

          {/* Companies Ranking Table */}
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
            <div className="border-b border-border bg-muted/40 px-4 py-3 sm:px-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">
                  Rendimiento por Empresa y Convenio
                </h2>
              </div>
              <span className="text-xs text-muted-foreground">
                Ordenado por mayor facturación neta
              </span>
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
                      <th className="px-4 py-3 sm:px-6">Empresa</th>
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
                    {data.companies.map((company) => (
                      <tr
                        key={company.customerId}
                        className="transition-colors hover:bg-muted/30"
                      >
                        <td className="px-4 py-3.5 sm:px-6">
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
                              className="font-medium text-foreground"
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
                    ))}
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
