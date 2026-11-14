import React from 'react';
import {
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Eye,
  Lock,
  Store,
} from 'lucide-react';
import { DashboardSidebar } from '../../components/DashboardSidebar';

interface Waypoint {
  frame: number;
  x: number;
  y: number;
  click?: boolean;
}

const UI_WIDTH = 1280;
const UI_HEIGHT = 956;
const UI_SCALE = 0.78;
const WRAP_WIDTH = Math.round(UI_WIDTH * UI_SCALE);
const WRAP_HEIGHT = Math.round(UI_HEIGHT * UI_SCALE);

const DASHBOARD_URL =
  'app.nhilospos.com/?startDate=2026-10-07&endDate=2026-11-05';
const INVENTORY_URL =
  'app.nhilospos.com/inventory?source=dashboard&sourceWidget=attention&severity=CRITICAL&status=CRITICAL&tab=alerts';
const COMPARISON_LABEL = 'vs 30 días anteriores';
const DASHBOARD_RANGE = '07/10/2026 — 05/11/2026';
const INVENTORY_RANGE = '05/11/2026 — 05/11/2026';
const FRESHNESS_TEXT = 'Datos completos hasta 14:32 · sync 14:32';

const CRITICAL_ALERTS = [
  {
    name: 'Café Molido Especial',
    stock: '450',
    min: '1,500',
    message: 'Stock por debajo del mínimo crítico',
    reorder: '3,000',
  },
  {
    name: 'Leche de Almendras Barista',
    stock: '600',
    min: '2,000',
    message: 'Stock por debajo del mínimo crítico',
    reorder: '6,000',
  },
  {
    name: 'Vasos Térmicos Doble Pared 12oz',
    stock: '28',
    min: '100',
    message: 'Cobertura menor a 1 turno operativo',
    reorder: '250',
  },
  {
    name: 'Jarabe Artesanal de Vainilla',
    stock: '180',
    min: '750',
    message: 'Stock por debajo del mínimo crítico',
    reorder: '1,500',
  },
] as const;

const INVENTORY_TABS = [
  'Valoración',
  'Insumos',
  'Compras',
  'Proveedores',
  'COGS / Margen',
  'Kardex',
  'Alertas',
  'Conciliación',
] as const;

const TREND_LABELS = ['7 oct', '12 oct', '17 oct', '22 oct', '27 oct', '1 nov', '5 nov'];
const TREND_LABEL_INDICES = [0, 5, 10, 15, 20, 25, 29];

function buildTrend(): number[] {
  const raw = Array.from({ length: 30 }, (_, index) =>
    4300 + Math.sin(index / 3) * 480 + index * 34 + Math.cos(index / 5) * 180,
  );
  const total = raw.reduce((sum, value) => sum + value, 0);
  const factor = 148520 / total;
  return raw.map((value) => Math.round(value * factor));
}

const TREND_CURRENT = buildTrend();
const TREND_PREVIOUS = TREND_CURRENT.map((value, index) =>
  Math.round(value * 0.9 + Math.sin(index / 4) * 170),
);

const TREND_MAX = 6000;

function smoothPath(points: { x: number; y: number }[]): string {
  return points.reduce((path, point, index, all) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = all[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

const TrendChart: React.FC = () => {
  const width = 560;
  const height = 220;
  const plotLeft = 88;
  const plotTop = 8;
  const plotWidth = 464;
  const plotHeight = 188;

  const x = (index: number) =>
    plotLeft + (index / (TREND_CURRENT.length - 1)) * plotWidth;
  const y = (value: number) =>
    plotTop + (1 - Math.min(value, TREND_MAX) / TREND_MAX) * plotHeight;

  const currentPoints = TREND_CURRENT.map((value, index) => ({
    x: x(index),
    y: y(value),
  }));
  const previousPoints = TREND_PREVIOUS.map((value, index) => ({
    x: x(index),
    y: y(value),
  }));

  const ticks = [0, 1500, 3000, 4500, 6000];

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Evolución de ventas netas por día"
    >
      {ticks.map((tick) => {
        const tickY = y(tick);
        return (
          <g key={tick}>
            <text
              x={plotLeft - 8}
              y={tickY + 4}
              textAnchor="end"
              fontSize={11}
              fill="#64748b"
            >
              {`C$${tick.toLocaleString('es-NI')}.00`}
            </text>
          </g>
        );
      })}

      {TREND_LABELS.map((label, index) => (
        <text
          key={label}
          x={x(TREND_LABEL_INDICES[index] ?? 0)}
          y={height - 6}
          textAnchor={index === TREND_LABELS.length - 1 ? 'end' : 'middle'}
          fontSize={11}
          fill="#64748b"
        >
          {label}
        </text>
      ))}

      <path
        d={smoothPath(previousPoints)}
        fill="none"
        stroke="#64748b"
        strokeWidth={1.5}
        strokeDasharray="6 4"
        strokeLinecap="round"
      />
      <path
        d={smoothPath(currentPoints)}
        fill="none"
        stroke="#0284c7"
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {currentPoints.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={3.5}
          fill="#ffffff"
          stroke="#0284c7"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
};

const FreshnessBadge: React.FC = () => (
  <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-slate-600">
    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
    {FRESHNESS_TEXT}
  </span>
);

const DateRangePicker: React.FC<{ label: string }> = ({ label }) => (
  <button
    type="button"
    className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs"
  >
    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
    <span className="tabular-nums">{label}</span>
  </button>
);

const AppHeader: React.FC = () => (
  <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-8">
    <div className="flex min-w-0 items-center gap-3">
      <Store className="h-5 w-5 shrink-0 text-primary" />
      <div className="flex min-w-0 flex-col">
        <h2 className="truncate text-lg font-semibold text-foreground">
          Distribuidora &amp; Café San Juan
        </h2>
        <span className="text-[11px] text-muted-foreground">
          RUC: J0310000145821
        </span>
      </div>
    </div>

    <div className="flex shrink-0 items-center gap-2.5 rounded-full p-1">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-xs">
        R
      </div>
      <div className="text-left">
        <p className="text-xs font-semibold leading-none text-foreground">
          Roberto Morales
        </p>
        <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
          owner
        </p>
      </div>
    </div>
  </header>
);

const KpiTile: React.FC<{
  label: string;
  value: string;
  delta: string;
  subtitle?: string;
}> = ({ label, value, delta, subtitle }) => (
  <div className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <p className="mt-2 truncate text-[25px] leading-8 font-bold tracking-tight tabular-nums text-card-foreground">
      {value}
    </p>
    {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    <p className="mt-2 flex items-center gap-1 text-sm font-medium text-secondary">
      <span aria-hidden="true">↑</span>
      <span>{delta}</span>
      <span className="font-normal text-muted-foreground">{COMPARISON_LABEL}</span>
    </p>
  </div>
);

const SalesTrendCard: React.FC = () => (
  <div className="flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-sm">
    <header className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-card-foreground">
        Evolución de ventas
      </h3>
      <span className="rounded text-xs font-medium text-primary">Ver →</span>
    </header>
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="flex items-center gap-1.5 text-xs font-medium text-card-foreground">
        <span className="inline-block h-1 w-5 rounded-full bg-[#0284c7]" />
        Ventas netas — periodo actual
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className="inline-block border-t-2 border-dashed border-muted-foreground"
          style={{ width: 16 }}
        />
        Periodo anterior (comparación)
      </span>
    </div>
    <div className="flex-1">
      <TrendChart />
    </div>
  </div>
);

const AttentionBand: React.FC<{
  stockHovered: boolean;
  voidsHovered: boolean;
}> = ({ stockHovered, voidsHovered }) => (
  <section
    aria-label="Atención requerida"
    className="flex flex-col rounded-lg border border-border bg-card p-5 shadow-sm"
  >
    <h2 className="text-lg font-semibold text-card-foreground">
      Atención Requerida
    </h2>
    <ul className="mt-3 space-y-2.5">
      <li className="flex items-start justify-between gap-2 text-sm">
        <span className="flex items-start gap-2">
          <span aria-hidden="true" className="shrink-0 font-semibold text-destructive">
            ●
          </span>
          <span>
            <span className="font-medium text-destructive">Stock crítico</span>
            <span className="block text-xs text-muted-foreground">
              4 producto(s) en nivel crítico
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded border border-border px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
            Actual
          </span>
          <span
            className={`rounded text-xs font-semibold text-primary underline-offset-2 ${
              stockHovered ? 'underline' : ''
            }`}
          >
            Ver productos →
          </span>
        </span>
      </li>

      <li className="flex items-start justify-between gap-2 text-sm">
        <span className="flex items-start gap-2">
          <span aria-hidden="true" className="shrink-0 font-semibold text-amber-700">
            ▲
          </span>
          <span>
            <span className="font-medium text-amber-700">Anulaciones</span>
            <span className="block text-xs text-muted-foreground">
              2 anulaciones · C$490.00
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded border border-border px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
            Período
          </span>
          <span
            className={`rounded text-xs font-semibold text-primary underline-offset-2 ${
              voidsHovered ? 'underline' : ''
            }`}
          >
            Ver anulaciones →
          </span>
        </span>
      </li>
    </ul>
  </section>
);

const HourlyBars: React.FC = () => {
  const heights = [
    18, 14, 12, 10, 11, 16, 24, 34, 48, 62, 78, 92, 100, 88, 72, 60, 55, 68,
    84, 96, 90, 74, 52, 34,
  ];
  return (
    <div className="flex h-[180px] items-end gap-1.5 border-b border-border px-1 pb-2">
      {heights.map((height, index) => (
        <div key={index} className="flex h-full flex-1 items-end">
          <div
            className="w-full rounded-t-[2px] bg-primary"
            style={{ height: `${height}%` }}
          />
        </div>
      ))}
    </div>
  );
};

const WeeklyBars: React.FC = () => {
  const heights = [62, 58, 66, 72, 84, 96, 88];
  return (
    <div className="flex h-[180px] items-end gap-3 border-b border-border px-1 pb-2">
      {heights.map((height, index) => (
        <div key={index} className="flex h-full flex-1 items-end">
          <div
            className="w-full rounded-t-[2px] bg-primary"
            style={{ height: `${height}%` }}
          />
        </div>
      ))}
    </div>
  );
};

const SecondaryCharts: React.FC = () => (
  <div className="grid grid-cols-2 gap-6">
    <div className="flex flex-col rounded-lg border border-border bg-card p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-card-foreground">
          Ventas por hora
        </h3>
        <span className="rounded text-xs font-medium text-primary">Ver →</span>
      </header>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
        <span className="truncate">Pico 12:00–13:00 · C$4,120.00</span>
        <span className="shrink-0 font-medium text-foreground">
          Pico 18:00–19:00
        </span>
      </div>
      <HourlyBars />
    </div>

    <div className="flex flex-col rounded-lg border border-border bg-card p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-card-foreground">
          Afluencia semanal
        </h3>
        <span className="rounded text-xs font-medium text-primary">Ver →</span>
      </header>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
        <span className="truncate">Pico: sábado · C$8,420.00</span>
        <span className="shrink-0 font-medium text-foreground">
          Fin de semana +18%
        </span>
      </div>
      <WeeklyBars />
    </div>
  </div>
);

const PageHeader: React.FC = () => (
  <div className="flex min-h-[72px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Dashboard
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Métricas clave de facturación y resumen de operaciones · Régimen fiscal:
        Cuota Fija
      </p>
    </div>
    <div className="flex flex-wrap items-center gap-2.5">
      <FreshnessBadge />
      <DateRangePicker label={DASHBOARD_RANGE} />
    </div>
  </div>
);

const DashboardView: React.FC<{
  stockHovered: boolean;
  voidsHovered: boolean;
}> = ({ stockHovered, voidsHovered }) => (
  <main className="flex-1 overflow-hidden p-8">
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <PageHeader />

      <section aria-label="Indicadores ejecutivos" className="grid grid-cols-4 gap-4">
        <KpiTile label="Ventas Netas" value="C$148,520.00" delta="+12.4%" />
        <KpiTile label="Tickets" value="612" delta="+8.1%" />
        <KpiTile label="Ticket Promedio" value="C$242.68" delta="+4.0%" />
        <KpiTile
          label="Margen Bruto"
          value="38.4%"
          subtitle="C$57,031.68"
          delta="+1.8 pp"
        />
      </section>

      <section aria-label="Rendimiento del negocio" className="space-y-6">
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <SalesTrendCard />
          </div>
          <AttentionBand stockHovered={stockHovered} voidsHovered={voidsHovered} />
        </div>
        <SecondaryCharts />
      </section>
    </div>
  </main>
);

const StatCard: React.FC<{
  label: string;
  value: string;
  accent?: boolean;
}> = ({ label, value, accent = false }) => (
  <div
    className={`rounded-lg border p-5 shadow-xs ${
      accent
        ? 'border-warning/40 bg-warning-50/60'
        : 'border-border bg-card'
    }`}
  >
    <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
    <p className="mt-1.5 truncate text-2xl font-bold tabular-nums text-card-foreground">
      {value}
    </p>
  </div>
);

const InventoryView: React.FC<{ hoveredRow: number | undefined }> = ({
  hoveredRow,
}) => (
  <main className="flex-1 overflow-hidden p-8">
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Inventario
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Valoración de existencias, kardex de movimientos y alertas de stock
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker label={INVENTORY_RANGE} />
        </div>
      </div>

      <div className="border-b border-border">
        <nav
          className="-mb-px flex gap-6 overflow-x-auto pb-0"
          aria-label="Secciones de inventario"
          role="tablist"
        >
          {INVENTORY_TABS.map((tab) => {
            const active = tab === 'Alertas';
            return (
              <span
                key={tab}
                role="tab"
                aria-selected={active}
                className={`whitespace-nowrap rounded border-b-2 px-1 py-3 text-sm font-medium ${
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground'
                }`}
              >
                {tab}
              </span>
            );
          })}
        </nav>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Alertas" value="6" />
          <StatCard label="Críticas" value="4" accent />
          <StatCard label="Advertencias" value="2" />
          <StatCard label="Stock Negativo" value="0" />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
          <span>
            Mostrando alertas con severidad:{' '}
            <strong className="font-semibold">CRITICAL</strong> (4)
          </span>
          <span className="rounded font-medium text-primary">
            Mostrar todas (6)
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                    Insumo
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">
                    Stock
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">
                    Mínimo
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-muted-foreground">
                    Severidad
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                    Mensaje
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">
                    Reorden Sugerida
                  </th>
                </tr>
              </thead>
              <tbody>
                {CRITICAL_ALERTS.map((alert, index) => (
                  <tr
                    key={alert.name}
                    className={`border-b border-border last:border-0 ${
                      hoveredRow === index ? 'bg-muted/40' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {alert.name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {alert.stock}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {alert.min}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                        Crítica
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {alert.message}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                      {alert.reorder}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <FreshnessBadge />
      </div>
    </div>
  </main>
);

const BrowserChrome: React.FC<{
  url: string;
  backHovered: boolean;
  backPressed: boolean;
}> = ({ url, backHovered, backPressed }) => (
  <div className="flex h-14 w-full flex-col bg-slate-900 text-slate-300">
    <div className="flex h-6 items-end gap-2 px-3">
      <span className="mb-1.5 h-2 w-2 rounded-full bg-rose-500/80" />
      <span className="mb-1.5 h-2 w-2 rounded-full bg-amber-400/80" />
      <span className="mb-1.5 h-2 w-2 rounded-full bg-emerald-500/80" />
      <div className="ml-3 flex h-[22px] items-center rounded-t-md bg-slate-800 px-3 text-[10px] font-medium text-slate-300">
        NHILOS POS — Panel de administración
      </div>
    </div>

    <div className="flex h-8 items-center gap-1 border-t border-slate-800 px-3">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full ${
          backHovered ? 'bg-white/10' : ''
        }`}
        style={{ transform: `scale(${backPressed ? 0.9 : 1})` }}
      >
        <ArrowLeft className="h-4 w-4 text-slate-200" />
      </div>
      <div className="flex h-6 w-6 items-center justify-center rounded-full">
        <ArrowRight className="h-4 w-4 text-slate-600" />
      </div>
      <div className="ml-2 flex h-6 flex-1 items-center gap-2 truncate rounded-md bg-slate-800 px-3 text-[10px] font-mono text-slate-300">
        <Lock className="h-3 w-3 shrink-0 text-slate-500" />
        <span className="truncate">{url}</span>
      </div>
    </div>
  </div>
);

export const OwnerDashboardWebScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const [fontHandle] = React.useState(() =>
    delayRender('Loading Inter for Owner Dashboard'),
  );

  React.useEffect(() => {
    let alive = true;
    const face = new FontFace(
      'Inter',
      `url(${staticFile('fonts/inter-latin-var.woff2')})`,
      { weight: '100 900', style: 'normal', display: 'block' },
    );
    document.fonts.add(face);
    Promise.all([
      face.load(),
      ...[400, 500, 600, 700].map((weight) =>
        document.fonts.load(`${weight} 16px Inter`),
      ),
    ])
      .then(() => document.fonts.ready)
      .finally(() => {
        if (alive) continueRender(fontHandle);
      });
    return () => {
      alive = false;
    };
  }, [fontHandle]);

  const isInventoryView = frame >= 315 && frame < 656;
  const activeSidebarPath = isInventoryView ? '/inventory' : '/';
  const currentUrl = isInventoryView ? INVENTORY_URL : DASHBOARD_URL;

  const attentionZoomSpring =
    frame >= 45
      ? spring({
          frame: frame - 45,
          fps,
          config: { damping: 18, stiffness: 120, mass: 0.8 },
        })
      : 0;

  const returnZoomOutSpring =
    frame >= 315
      ? spring({
          frame: frame - 315,
          fps,
          config: { damping: 18, stiffness: 110, mass: 0.85 },
        })
      : 0;

  const scene4FocusSpring =
    frame >= 660
      ? spring({
          frame: frame - 660,
          fps,
          config: { damping: 18, stiffness: 115, mass: 0.85 },
        })
      : 0;

  const windowScale =
    frame < 45
      ? 1.0
      : frame < 315
      ? interpolate(attentionZoomSpring, [0, 1], [1.0, 1.06])
      : frame < 660
      ? interpolate(returnZoomOutSpring, [0, 1], [1.06, 1.02])
      : interpolate(scene4FocusSpring, [0, 1], [1.02, 1.05]);

  const windowTranslateX =
    frame >= 45 && frame < 315
      ? interpolate(attentionZoomSpring, [0, 1], [0, -6])
      : frame >= 660
      ? interpolate(scene4FocusSpring, [0, 1], [0, -6])
      : 0;

  const windowTranslateY =
    frame >= 45 && frame < 315
      ? interpolate(attentionZoomSpring, [0, 1], [0, -4])
      : frame >= 660
      ? interpolate(scene4FocusSpring, [0, 1], [0, 8])
      : 0;

  const isStockLinkHovered =
    (frame >= 6 && frame < 160) || (frame >= 245 && frame < 315);
  const isVoidsLinkHovered = frame >= 165 && frame < 240;
  const isBackHovered = frame >= 600 && frame < 656;
  const isBackPressed = frame >= 636 && frame <= 648;

  const hoveredInventoryRow =
    frame >= 450 && frame < 495
      ? 0
      : frame >= 495 && frame < 540
      ? 1
      : frame >= 540 && frame < 590
      ? 2
      : undefined;

  const waypoints: Waypoint[] = [
    { frame: 0, x: 1080, y: 460 },
    { frame: 10, x: 1180, y: 500 },
    { frame: 14, x: 1180, y: 500, click: true },
    { frame: 45, x: 1180, y: 500 },

    { frame: 85, x: 1180, y: 500 },
    { frame: 135, x: 1100, y: 540 },
    { frame: 160, x: 1175, y: 546 },
    { frame: 165, x: 1175, y: 546 },
    { frame: 205, x: 1175, y: 546 },
    { frame: 240, x: 1180, y: 500 },
    { frame: 280, x: 1180, y: 500 },
    { frame: 295, x: 1180, y: 500, click: true },
    { frame: 314, x: 1138, y: 436 },

    { frame: 350, x: 1138, y: 436 },
    { frame: 425, x: 1138, y: 436 },
    { frame: 465, x: 450, y: 550 },
    { frame: 510, x: 450, y: 603 },
    { frame: 555, x: 450, y: 656 },

    { frame: 600, x: 24, y: 40 },
    { frame: 620, x: 24, y: 40 },
    { frame: 634, x: 24, y: 40 },
    { frame: 640, x: 24, y: 40, click: true },
    { frame: 655, x: 24, y: 40 },

    { frame: 695, x: 918, y: 188 },
    { frame: 775, x: 918, y: 188 },
    { frame: 810, x: 1134, y: 316 },
    { frame: 950, x: 1134, y: 316 },
  ];

  let cursorPos = { x: waypoints[0].x, y: waypoints[0].y };
  let clickAge = -1;

  for (let index = 0; index < waypoints.length; index += 1) {
    const current = waypoints[index];
    const next = waypoints[index + 1];

    if (current.click && frame >= current.frame && frame <= current.frame + 8) {
      clickAge = frame - current.frame;
    }

    if (!next) {
      if (frame >= current.frame) {
        cursorPos = { x: current.x, y: current.y };
      }
      break;
    }

    if (frame >= current.frame && frame <= next.frame) {
      const progress = interpolate(frame, [current.frame, next.frame], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      cursorPos = {
        x: current.x + (next.x - current.x) * progress,
        y: current.y + (next.y - current.y) * progress,
      };
      break;
    }
  }

  const rippleScale =
    clickAge >= 0 ? interpolate(clickAge, [0, 8], [0.7, 2.3]) : 1;
  const rippleOpacity =
    clickAge >= 0 ? interpolate(clickAge, [0, 8], [0.85, 0]) : 0;

  return (
    <div className="relative flex h-full w-full select-none flex-col items-center justify-between overflow-hidden bg-[#001F33] p-8 font-sans">
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-[880px] w-[880px] -translate-x-1/2 rounded-full bg-[#003757]/80 blur-[160px]" />
      <div className="pointer-events-none absolute -bottom-20 right-10 h-[620px] w-[620px] rounded-full bg-[#00BF81]/15 blur-[180px]" />

      <div className="z-20 flex w-full flex-col items-center pt-[130px] text-center">
        <span className="mb-3 flex items-center gap-2 rounded-full border border-[#00BF81]/40 bg-[#00BF81]/15 px-6 py-2 text-sm font-bold uppercase tracking-widest text-[#00BF81] shadow-sm">
          <Eye className="h-4 w-4 text-[#00BF81]" />
          <span>Visibilidad Ejecutiva · Navegación Contextual</span>
        </span>
      </div>

      <div className="z-20 flex w-full flex-1 items-center justify-center">
        <div
          className="relative origin-center overflow-hidden rounded-2xl border border-slate-300 bg-slate-900 shadow-[0_30px_80px_rgba(0,0,0,0.65)]"
          style={{
            width: WRAP_WIDTH,
            height: WRAP_HEIGHT,
            transform: `scale(${windowScale}) translate(${windowTranslateX}px, ${windowTranslateY}px)`,
          }}
        >
          <div
            style={{
              width: UI_WIDTH,
              height: UI_HEIGHT,
              transform: `scale(${UI_SCALE})`,
              transformOrigin: 'top left',
            }}
          >
            <BrowserChrome
              url={currentUrl}
              backHovered={isBackHovered}
              backPressed={isBackPressed}
            />

            <div className="flex h-[900px] w-[1280px] bg-background font-inter text-foreground">
              <DashboardSidebar
                activePath={activeSidebarPath}
                userName="Roberto Morales"
                userRole="Owner"
              />

              <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
                <AppHeader />
                {isInventoryView ? (
                  <InventoryView hoveredRow={hoveredInventoryRow} />
                ) : (
                  <DashboardView
                    stockHovered={isStockLinkHovered}
                    voidsHovered={isVoidsLinkHovered}
                  />
                )}
              </div>
            </div>

            <div
              className="pointer-events-none absolute z-50"
              style={{
                left: cursorPos.x,
                top: cursorPos.y,
                transform: 'translate(-2px, -2px)',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="drop-shadow-md"
              >
                <path
                  d="M5.5 3.5L18.5 13.5H11.5L8.5 20.5L5.5 3.5Z"
                  fill="#00253B"
                  stroke="#FFFFFF"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
              {clickAge >= 0 && clickAge <= 8 && (
                <span
                  className="pointer-events-none absolute -left-2 -top-2 h-7 w-7 rounded-full border-2 border-[#00BF81] bg-[#00BF81]/30"
                  style={{
                    transform: `scale(${rippleScale})`,
                    opacity: rippleOpacity,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="z-30 flex h-[320px] w-full flex-col items-center justify-start pt-4 text-center">
        {frame < 45 ? (
          <div className="space-y-1">
            <div
              className="text-5xl font-black tracking-[1.5px] text-white drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Visibilidad sin ruido.
            </div>
            <div className="text-2xl font-bold tracking-wide text-[#00BF81]">
              Acción inmediata sobre alertas reales.
            </div>
          </div>
        ) : frame < 315 ? (
          <div className="space-y-1">
            <div
              className="text-5xl font-black tracking-[1.5px] text-white drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Solo lo que importa.
            </div>
            <div className="text-2xl font-bold tracking-wide text-[#00BF81]">
              Excepciones reales, cero adornos.
            </div>
          </div>
        ) : frame < 660 ? (
          <div className="space-y-1">
            <div
              className="text-5xl font-black tracking-[1.5px] text-white drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              El contexto viaja contigo.
            </div>
            <div className="text-2xl font-bold tracking-wide text-[#00BF81]">
              Filtro automático: Estado = Crítico.
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div
              className="text-5xl font-black tracking-[1.5px] text-white drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Cero pasos repetidos.
            </div>
            <div className="text-2xl font-bold tracking-wide text-[#00BF81]">
              Control ejecutivo en tiempo real.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
