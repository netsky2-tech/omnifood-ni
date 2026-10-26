import React from 'react';
import {
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  Img,
} from 'remotion';
import {
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  FileText,
  Handshake,
  Loader2,
  Search,
  Store,
  UtensilsCrossed,
  UserPlus,
} from 'lucide-react';
import { DashboardSidebar } from '../../components/DashboardSidebar';
import { NHILOS_BRAND } from '../../tokens/brand';
import {
  DAY_DISTRIBUTION,
  DIRECTORY_ROWS,
  METRICS_COMPANIES,
  METRICS_KPIS,
  METRICS_PERIOD,
  OVERALL_TOP_PRODUCTS,
  PEAK_HOURS,
  formatCurrency,
} from './metrics-data';

/** Geometría del escenario 1920x1080 y de la ventana del dashboard. */
export const LAYOUT = {
  scene: { width: 1920, height: 1080 },
  window: { left: 100, top: 80, width: 1720, height: 920, sidebar: 260, header: 64 },
  content: { left: 392, top: 176 },
} as const;

/** Puntos de interacción verificados contra el layout renderizado. */
export const TARGETS = {
  sidebarClientes: { x: 205, y: 696 },
  tabDirectory: { x: 437, y: 272 },
  tabMetrics: { x: 520, y: 272 },
  rangeThisMonth: { x: 443, y: 352 },
  rankingRowBac: { x: 760, y: 330 },
  detailPdf: { x: 1705, y: 414 },
  detailExcel: { x: 1642, y: 414 },
} as const;

const PALETTE = {
  navy: NHILOS_BRAND.colors.navy,
  green: NHILOS_BRAND.colors.green,
  gray: NHILOS_BRAND.colors.gray,
};

// ---------------------------------------------------------------- ventana

export const MetricsWindow: React.FC<{
  children: React.ReactNode;
  scrollY?: number;
  activeTab?: 'directory' | 'metrics';
  /**
   * Capa absoluta en coordenadas de escena (1920x1080). El cursor vive aquí y
   * no dentro del contenido, porque el bloque con `transform` se convierte en
   * containing block y desplazaría sus coordenadas.
   */
  overlay?: React.ReactNode;
  /** Marco de la escena: referencia para medir elementos en coordenadas reales. */
  rootRef?: React.RefObject<HTMLDivElement | null>;
  /** Si true, la ventana hace fade-in y zoom de entrada. False para continuidad entre escenas. */
  animateEnter?: boolean;
}> = ({
  children,
  scrollY = 0,
  activeTab = 'metrics',
  overlay,
  rootRef,
  animateEnter = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = animateEnter
    ? spring({ frame, fps, config: { damping: 18, mass: 0.9 } })
    : 1;
  const scale = animateEnter ? interpolate(enter, [0, 1], [0.95, 1]) : 1;
  const opacity = animateEnter
    ? interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })
    : 1;

  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#001F33] p-6 font-sans"
    >
      <div
        className="flex h-[920px] w-full max-w-[1720px] overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-2xl"
        style={{ transform: `scale(${scale})`, opacity }}
      >
        <DashboardSidebar activePath="/customers" />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
          {/* Header superior real (tienda activa + conectividad) */}
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-[#003757]" />
              <div className="flex flex-col">
                <h2 className="text-base font-semibold leading-tight text-slate-900">
                  SOHO Café
                </h2>
                <span className="text-[11px] text-slate-500">RUC: J0310000000000</span>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-[#00BF81]" />
              En Línea
            </span>
          </header>

          <main className="flex-1 overflow-hidden px-8 pt-8">
            <div
              className="space-y-6"
              style={{ transform: `translateY(-${scrollY}px)` }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    Clientes
                  </h1>
                  <p className="text-sm text-slate-500">
                    Directorio de clientes, convenios comerciales y perfil de lealtad.
                  </p>
                </div>

                {activeTab === 'directory' && (
                  <button className="inline-flex items-center gap-2 rounded-md bg-[#003757] px-4 py-2 text-sm font-medium text-white shadow-xs transition">
                    <UserPlus className="h-4 w-4" />
                    <span>+ Nuevo Cliente</span>
                  </button>
                )}
              </div>

              <Tabs active={activeTab} />

              {children}
            </div>
          </main>
        </div>
      </div>

      {overlay}
    </div>
  );
};

// ---------------------------------------------------------------- pestañas

export const Tabs: React.FC<{ active: 'directory' | 'metrics' }> = ({ active }) => {
  const tabs = [
    { id: 'directory', label: 'Directorio' },
    { id: 'metrics', label: 'Métricas' },
    { id: 'loyalty', label: 'Perfil de Lealtad' },
  ] as const;

  return (
    <div className="border-b border-slate-200">
      <nav className="-mb-px flex gap-6 text-sm font-medium">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <span
              key={tab.id}
              data-cursor={`tab-${tab.id}`}
              className={`cursor-pointer border-b-2 pb-3 transition-colors ${
                isActive
                  ? 'border-[#003757] font-semibold text-[#003757]'
                  : 'border-transparent text-slate-500'
              }`}
            >
              {tab.label}
            </span>
          );
        })}
      </nav>
    </div>
  );
};

// ---------------------------------------------------------------- directorio

export const DirectoryTable: React.FC = () => (
  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
    <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <div className="flex h-9 items-center rounded-md border border-slate-200 pl-9 text-xs text-slate-400">
          Buscar por nombre, RUC/cédula, teléfono o correo...
        </div>
      </div>
    </div>

    <table className="w-full text-left text-sm">
      <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
        <tr>
          <th className="px-4 py-3">Cliente</th>
          <th className="px-4 py-3">Tipo</th>
          <th className="px-4 py-3">RUC / Cédula</th>
          <th className="px-4 py-3">Contacto</th>
          <th className="px-4 py-3">Convenio</th>
          <th className="px-4 py-3">Estado</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {DIRECTORY_ROWS.map((row) => (
          <tr key={row.name}>
            <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
            <td className="px-4 py-3">
              <span className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
                {row.type}
              </span>
            </td>
            <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.taxId}</td>
            <td className="px-4 py-3 text-xs text-slate-500">{row.phone}</td>
            <td className="px-4 py-3">
              {row.convenio ? (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
                  <Handshake className="h-3 w-3" />
                  {row.convenio}
                </span>
              ) : (
                <span className="text-xs text-slate-500">Sin convenio</span>
              )}
            </td>
            <td className="px-4 py-3">
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Activo
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ---------------------------------------------------------------- rango

export const DateRangeBar: React.FC<{ pressedFrom?: number; dimmed?: boolean }> = ({
  pressedFrom = 0,
  dimmed = false,
}) => {
  const frame = useCurrentFrame();
  const pressed = frame >= pressedFrom;

  return (
    <div
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-xs transition-opacity sm:flex-row sm:items-center sm:justify-between"
      style={{ opacity: dimmed ? 0.55 : 1 }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <RangeButton label="Este Mes" active={pressed} cursorName="range-this-month" />
        <RangeButton label="Mes Anterior" />
        <RangeButton label="Últimos 30 días" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Calendar className="h-4 w-4" />
          <span>Desde:</span>
          <DateInput value={METRICS_PERIOD.inputStart} />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Hasta:</span>
          <DateInput value={METRICS_PERIOD.inputEnd} />
        </div>
      </div>
    </div>
  );
};

const RangeButton: React.FC<{
  label: string;
  active?: boolean;
  cursorName?: string;
}> = ({ label, active, cursorName }) => (
  <span
    data-cursor={cursorName}
    className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors ${
      active
        ? 'border-[#003757] bg-[#003757]/5 text-[#003757]'
        : 'border-slate-200 bg-white text-slate-700'
    }`}
  >
    {label}
  </span>
);

const DateInput: React.FC<{ value: string }> = ({ value }) => (
  <span className="inline-flex h-8 w-36 items-center rounded-md border border-slate-200 px-3 text-xs text-slate-700">
    {value}
  </span>
);

// ---------------------------------------------------------------- KPIs

const KPI_CARDS: {
  label: string;
  target: number;
  subtitle: string;
  money: boolean;
  highlighted?: boolean;
}[] = [
  {
    label: 'Facturación Neta',
    target: METRICS_KPIS.totalCorporateNetSalesNio,
    subtitle: `Bruto: ${formatCurrency(METRICS_KPIS.totalCorporateGrossSalesNio)}`,
    money: true,
  },
  {
    label: 'Descuentos Otorgados',
    target: METRICS_KPIS.totalCorporateDiscountNio,
    subtitle: `Tasa efectiva: ${METRICS_KPIS.overallEffectiveDiscountRate}%`,
    money: true,
    highlighted: true,
  },
  {
    label: 'Tickets',
    target: METRICS_KPIS.totalCorporateTickets,
    subtitle: `${METRICS_KPIS.activeCompaniesCount} empresas activas`,
    money: false,
  },
  {
    label: 'Ticket Promedio',
    target: METRICS_KPIS.overallAverageTicketNio,
    subtitle: 'Por transacción',
    money: true,
  },
];

export const KpiGrid: React.FC<{ highlight: number; animate?: boolean }> = ({
  highlight,
  animate = true,
}) => {
  const frame = useCurrentFrame();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {KPI_CARDS.map((card, index) => {
        const start = index * 6;
        const enter = animate
          ? spring({
              frame: frame - start,
              fps: 30,
              config: { damping: 16, mass: 0.8 },
            })
          : 1;
        const countProgress = animate
          ? interpolate(frame, [start + 4, start + 34], [0, 1], {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          : 1;

        const counted = card.target * countProgress;
        const value = card.money
          ? formatCurrency(Math.round(counted * 100) / 100)
          : String(Math.round(counted));

        return (
          <div
            key={card.label}
            className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-xs"
            style={{
              opacity: animate ? interpolate(enter, [0, 1], [0, 1]) : 1,
              transform: animate
                ? `translateY(${interpolate(enter, [0, 1], [10, 0])}px)`
                : 'none',
            }}
          >
            <p className="truncate text-xs font-semibold uppercase tracking-wider text-slate-500">
              {card.label}
            </p>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <p className="truncate text-2xl font-bold tabular-nums text-slate-900">
                {value}
              </p>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">{card.subtitle}</p>

            {/* Subrayado verde: el descuento es el beneficio del convenio */}
            {card.highlighted && highlight > 0 && (
              <span
                className="absolute bottom-0 left-0 h-[3px] bg-[#00BF81]"
                style={{ width: `${Math.round(highlight * 100)}%` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- comportamiento

export const BehaviorCards: React.FC<{
  animate?: boolean;
  showAnnotation?: boolean;
}> = ({ animate = true, showAnnotation = true }) => {
  const frame = useCurrentFrame();
  const maxTickets = Math.max(...DAY_DISTRIBUTION.map((d) => d.ticketCount), 1);

  const rankingReveal = animate
    ? interpolate(frame, [110, 165], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : showAnnotation
      ? 1
      : 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Productos más consumidos */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between border-b border-slate-200/60 pb-3">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-[#003757]" />
            <h3 className="text-sm font-semibold text-slate-900">
              Productos Más Consumidos en Convenios
            </h3>
          </div>
          <span className="text-xs text-slate-500">Consolidado general</span>
        </div>

        <div className="space-y-3">
          {OVERALL_TOP_PRODUCTS.map((product, index) => {
            const rowProgress = animate
              ? interpolate(frame, [10 + index * 8, 22 + index * 8], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 1;
            return (
              <div
                key={product.productId}
                className="flex items-center justify-between text-xs"
                style={{
                  opacity: rowProgress,
                  transform: `translateX(${(1 - rowProgress) * 10}px)`,
                }}
              >
                <div className="flex min-w-0 items-center gap-2.5 pr-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                    {index + 1}
                  </span>
                  <span className="truncate font-medium text-slate-900">
                    {product.productName}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-right tabular-nums">
                  <span className="text-slate-500">{product.quantity} uds</span>
                  <span className="whitespace-nowrap font-semibold text-slate-900">
                    {formatCurrency(product.netSalesNio)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Afluencia y horarios pico */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between border-b border-slate-200/60 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#003757]" />
            <h3 className="text-sm font-semibold text-slate-900">
              Afluencia Semanal y Horarios Pico
            </h3>
          </div>
          <span className="text-xs text-slate-500">Hora de Managua (UTC-6)</span>
        </div>

        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Días con Mayor Demanda
          </p>
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {DAY_DISTRIBUTION.map((day, index) => {
              const grow = animate
                ? interpolate(frame, [20 + index * 3, 56 + index * 3], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  })
                : 1;
              const heightPct = Math.max(
                Math.round((day.ticketCount / maxTickets) * 100),
                8,
              );
              const isPeak = day.ticketCount === maxTickets;

              return (
                <div
                key={day.dayName}
                data-cursor={`day-${day.dayName.toLowerCase()}`}
                className="flex flex-col items-center gap-1"
              >
                  <div className="flex h-12 w-full items-end justify-center rounded bg-slate-100/70 p-0.5">
                    <div
                      className={`w-full rounded-xs ${
                        isPeak
                          ? 'bg-[#003757]'
                          : day.ticketCount > 0
                            ? 'bg-[#003757]/50'
                            : 'bg-slate-300/40'
                      }`}
                      style={{ height: `${heightPct * grow}%` }}
                    />
                  </div>
                  <span className="w-full truncate text-[10px] font-medium text-slate-500">
                    {day.dayName.slice(0, 3)}
                  </span>
                  <span className="text-[10px] font-semibold tabular-nums text-slate-900">
                    {day.ticketCount}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-200/60 pt-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Franjas Horarias Preferidas
            </p>
            <div className="flex flex-wrap gap-2">
              {PEAK_HOURS.map((peak, index) => {
                const show = animate
                  ? interpolate(frame, [70 + index * 6, 84 + index * 6], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    })
                  : 1;
                return (
                  <div
                    key={peak.formattedHour}
                    data-cursor={`peak-hour-${index}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs"
                    style={{ opacity: show, transform: `translateY(${(1 - show) * 6}px)` }}
                  >
                    <span className="font-semibold text-slate-900">
                      {peak.formattedHour}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      ({peak.ticketCount} tickets)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <p
            className="pt-1 text-[11px] italic text-slate-500"
            style={{ opacity: rankingReveal }}
          >
            El almuerzo corporativo concentra la demanda: martes a las 12:30 p. m.
          </p>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- ranking

export const RankingCard: React.FC<{
  expanded: boolean;
  detailExport: 'idle' | 'loading' | 'done';
}> = ({ expanded, detailExport }) => {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-[#003757]" />
          <h2 className="text-base font-semibold text-slate-900">
            Rendimiento por Empresa y Convenio
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 hidden text-xs text-slate-500 lg:inline">
            Haga clic en una empresa para ver sus productos y horarios
          </span>
          <HeaderExportButton label="Exportar a Excel" format="excel" />
          <HeaderExportButton label="Exportar a PDF" format="pdf" />
        </div>
      </div>

      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/60 text-xs font-semibold text-slate-500">
          <tr>
            <th className="w-8 px-2 py-3" />
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
        <tbody className="divide-y divide-slate-100">
          {METRICS_COMPANIES.map((company, index) => {
            const isFirst = index === 0;
            const showDetail = isFirst && expanded;

            return (
              <React.Fragment key={company.customerId}>
                <tr
                  data-cursor={isFirst ? 'ranking-row-bac' : undefined}
                  className={isFirst ? 'bg-slate-50/40' : ''}
                >
                  <td className="w-8 px-2 py-3.5 text-center text-slate-500">
                    {showDetail ? (
                      <ChevronDown className="inline h-4 w-4" />
                    ) : (
                      <ChevronRight className="inline h-4 w-4" />
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900">
                        {company.customerName}
                      </span>
                      <span className="text-xs text-slate-500">
                        RUC: {company.customerTaxId}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm font-medium text-slate-900">
                    {company.convenioName}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-slate-900">
                    {company.ticketCount}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-slate-500">
                    {formatCurrency(company.grossSalesNio)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium tabular-nums text-rose-600">
                    -{formatCurrency(company.discountNio)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold tabular-nums text-slate-900">
                    {formatCurrency(company.netSalesNio)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium tabular-nums text-slate-500">
                    {company.effectiveDiscountRate}%
                  </td>
                  <td className="px-4 py-3.5 pr-6 text-right tabular-nums text-slate-900">
                    {formatCurrency(company.averageTicketNio)}
                  </td>
                </tr>

                {showDetail && (
                  <tr className="border-b border-slate-200 bg-slate-50/60">
                    <td colSpan={9} className="p-4 sm:px-8 sm:py-5">
                      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-900">
                            Detalle de Consumo — {company.customerName}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="mr-1 text-xs text-slate-500">
                              {company.ticketCount} compras registradas
                            </span>
                            <DetailExportButton
                              label="Excel"
                              format="excel"
                              loading={false}
                              cursorName="detail-excel"
                            />
                            <DetailExportButton
                              label="PDF"
                              format="pdf"
                              loading={detailExport === 'loading'}
                              cursorName="detail-pdf"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                              <UtensilsCrossed className="h-3.5 w-3.5 text-[#003757]" />
                              Platos y Productos Preferidos
                            </p>
                            <div className="space-y-2">
                              {company.topProducts.map((product, index) => (
                                <div
                                  key={product.productId}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span className="max-w-[260px] truncate text-slate-900">
                                    {index + 1}. {product.productName}
                                  </span>
                                  <span className="tabular-nums text-slate-500">
                                    {product.quantity} uds • {formatCurrency(product.netSalesNio)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                              <Clock className="h-3.5 w-3.5 text-[#003757]" />
                              Días y Horarios Preferidos
                            </p>
                            <p className="text-xs text-slate-900">{company.preferredDays}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Franja: {company.preferredHours}
                            </p>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

    </div>
  );
};

const HeaderExportButton: React.FC<{ label: string; format: 'excel' | 'pdf' }> = ({
  label,
  format,
}) => (
  <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700">
    {format === 'excel' ? (
      <FileSpreadsheet className="h-3.5 w-3.5" />
    ) : (
      <FileText className="h-3.5 w-3.5" />
    )}
    <span>{label}</span>
  </span>
);

const DetailExportButton: React.FC<{
  label: string;
  format: 'excel' | 'pdf';
  loading: boolean;
  cursorName?: string;
}> = ({ label, format, loading, cursorName }) => (
  <span
    data-cursor={cursorName}
    className={`inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 ${
      loading ? 'opacity-50' : ''
    }`}
  >
    {loading ? (
      <Loader2 className="h-3 w-3 animate-spin" />
    ) : format === 'excel' ? (
      <FileSpreadsheet className="h-3 w-3" />
    ) : (
      <FileText className="h-3 w-3" />
    )}
    <span>{label}</span>
  </span>
);

// ---------------------------------------------------------------- carga / toasts

export const MetricsLoading: React.FC = () => (
  <div className="flex h-40 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-500">
    <Loader2 className="h-4 w-4 animate-spin text-[#003757]" />
    Cargando métricas de convenios y empresas...
  </div>
);

export const SuccessToast: React.FC<{
  title: string;
  description: string;
  progress: number;
}> = ({ title, description, progress }) => (
  <div
    className="pointer-events-none absolute z-50 w-[460px] rounded-lg border border-emerald-200 bg-white p-4 shadow-lg"
    style={{
      left: 1400,
      top: 930,
      opacity: progress,
      transform: `translateY(${(1 - progress) * 14}px)`,
    }}
  >
    <div className="flex items-start gap-3">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#00BF81]" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------- intro

export const MetricsIntro: React.FC<{ badge: string }> = ({ badge }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({ frame, fps, config: { damping: 15, mass: 0.8 } });
  const scale = interpolate(progress, [0, 1], [0.88, 1]);
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const badgeOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sloganOpacity = interpolate(frame, [25, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden font-sans"
      style={{ backgroundColor: PALETTE.navy }}
    >
      <div
        className="z-10 flex flex-col items-center px-8 text-center"
        style={{ transform: `scale(${scale})`, opacity }}
      >
        <div className="mb-4 flex h-28 w-28 items-center justify-center">
          <Img src={staticFile('logo.png')} alt="NHILOS POS" className="h-full w-full object-contain" />
        </div>

        <h1
          className="mb-4 text-4xl font-bold uppercase tracking-[6px] text-white"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          NHILOS POS
        </h1>

        <div
          style={{ opacity: badgeOpacity }}
          className="mb-5 inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-4 py-1.5 text-sm font-semibold tracking-wide text-[#00BF81]"
        >
          {badge}
        </div>

        <p
          className="text-xl font-normal tracking-wide"
          style={{
            fontFamily: 'Renogare, Poppins, sans-serif',
            color: PALETTE.gray,
            opacity: sloganOpacity,
          }}
        >
          Conectamos los hilos de tu negocio.
        </p>
      </div>
    </div>
  );
};
