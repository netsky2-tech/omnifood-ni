import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  Store,
  CheckCircle2,
  Download,
  Calendar,
  History,
  ChevronDown,
} from 'lucide-react';
import { DashboardSidebar } from '../../components/DashboardSidebar';

export interface LocalWaypoint {
  frame: number;
  x: number;
  y: number;
  click?: boolean;
}

const FISCAL_DATE = '27/10/2026';

/**
 * Toast flotante oficial idéntico a Shadcn / use-toast.ts del proyecto.
 */
export const SuccessToast: React.FC<{
  title: string;
  description: string;
  progress: number;
}> = ({ title, description, progress }) => (
  <div
    className="pointer-events-none absolute z-50 w-[420px] rounded-xl border border-emerald-200 bg-white p-4 shadow-2xl transition-all"
    style={{
      right: 24,
      bottom: 24,
      opacity: progress,
      transform: `translateY(${(1 - progress) * 16}px)`,
    }}
  >
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
        <CheckCircle2 className="h-5 w-5 text-[#00BF81]" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-900 leading-tight">{title}</p>
        <p className="mt-1 text-[11px] text-slate-500 leading-snug">{description}</p>
      </div>
    </div>
  </div>
);

/**
 * Puntero de ratón para pantallas Web (Backoffice escritorio).
 * Coordenadas relativas a la ventana (0..1000, 0..780).
 * Pulso de clic determinista único (0..9 frames), CERO bucles repetitivos.
 */
export const WebCursor: React.FC<{
  waypoints: LocalWaypoint[];
  visibleFrom?: number;
  visibleUntil?: number;
}> = ({ waypoints, visibleFrom = 0, visibleUntil = Number.MAX_SAFE_INTEGER }) => {
  const frame = useCurrentFrame();

  if (waypoints.length === 0) return null;

  let pos = { x: waypoints[0].x, y: waypoints[0].y };
  let clickAge = -1;

  for (let i = 0; i < waypoints.length; i += 1) {
    const cur = waypoints[i];
    const nxt = waypoints[i + 1];

    if (cur.click && frame >= cur.frame && frame < cur.frame + 10) {
      clickAge = frame - cur.frame;
    }

    if (!nxt) {
      if (frame >= cur.frame) pos = { x: cur.x, y: cur.y };
      break;
    }

    if (frame >= cur.frame && frame <= nxt.frame) {
      const progress = interpolate(frame, [cur.frame, nxt.frame], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      pos = {
        x: cur.x + (nxt.x - cur.x) * progress,
        y: cur.y + (nxt.y - cur.y) * progress,
      };
      break;
    }
  }

  const isVis = frame >= visibleFrom && frame <= visibleUntil;
  if (!isVis) return null;

  // Pulso único determinista: un solo anillo que se expande y desvanece suavemente
  const rippleScale = clickAge >= 0 ? interpolate(clickAge, [0, 9], [0.8, 2.4]) : 1;
  const rippleOpacity = clickAge >= 0 ? interpolate(clickAge, [0, 9], [0.8, 0]) : 0;

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{ left: pos.x, top: pos.y, transform: 'translate(-2px, -2px)' }}
    >
      {/* SVG del Cursor nativo oscuro */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-md"
      >
        <path
          d="M5.5 3.5L18.5 13.5H11.5L8.5 20.5L5.5 3.5Z"
          fill="#00253B"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>

      {/* Pulso único al hacer clic: exactamente 1 onda expansiva */}
      {clickAge >= 0 && clickAge <= 9 && (
        <span
          className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full border-2 border-[#00BF81] bg-[#00BF81]/30 pointer-events-none"
          style={{
            transform: `scale(${rippleScale})`,
            opacity: rippleOpacity,
          }}
        />
      )}
    </div>
  );
};

/** DateRangePicker real: rango de fechas visible en la cabecera de página. */
export const DateRangePickerMock: React.FC<{ start?: string; end?: string }> = ({
  start = FISCAL_DATE,
  end = FISCAL_DATE,
}) => (
  <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-xs">
    <Calendar className="h-4 w-4 text-slate-500" />
    <span className="tabular-nums">{start}</span>
    <span className="text-slate-400">—</span>
    <span className="tabular-nums">{end}</span>
  </div>
);

/** FreshnessBadge real en su variante legacy `Actualizado HH:mm`. */
export const FreshnessBadgeMock: React.FC<{ label?: string }> = ({
  label = 'Actualizado 12:48',
}) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600">
    <span className="h-1.5 w-1.5 rounded-full bg-[#00BF81]" />
    {label}
  </span>
);

export const FiscalWebWindow: React.FC<{
  activePath?: string;
  activeTab?: 'summary' | 'voided' | 'sequence' | 'exports';
  pageTitle?: string;
  pageSubtitle?: string;
  showDateRange?: boolean;
  showTabs?: boolean;
  children: React.ReactNode;
  cursorWaypoints?: LocalWaypoint[];
  overlay?: React.ReactNode;
  animateEnter?: boolean;
}> = ({
  activePath = '/fiscal',
  activeTab = 'sequence',
  pageTitle = 'Fiscal',
  pageSubtitle = 'Cumplimiento DGI, correlatividad de facturas y libros de ventas',
  showDateRange = true,
  showTabs = true,
  children,
  cursorWaypoints,
  overlay,
  animateEnter = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = animateEnter
    ? spring({ frame, fps, config: { damping: 18, mass: 0.9 } })
    : 1;
  const scale = animateEnter ? interpolate(enter, [0, 1], [0.96, 1]) : 1;
  const opacity = animateEnter
    ? interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })
    : 1;

  const tabs = [
    { id: 'summary', label: 'Resumen Mensual' },
    { id: 'voided', label: 'Anulaciones' },
    { id: 'sequence', label: 'Auditoría Secuencia' },
    { id: 'exports', label: 'Exportaciones' },
  ] as const;

  return (
    <div
      className="w-[1000px] h-[780px] bg-slate-50 rounded-2xl shadow-2xl overflow-hidden border border-slate-300 flex relative text-slate-800 origin-center"
      style={{ transform: `scale(${scale})`, opacity }}
    >
      {/* 1. SIDEBAR OFICIAL NHILOS */}
      <DashboardSidebar activePath={activePath} compact />

      {/* 2. CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden text-left">
        {/* Header superior oficial con nombre mock nicaragüense confidencial (Café San Juan) */}
        <header className="h-14 shrink-0 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Store className="h-4 w-4 text-[#003757]" />
            <div className="flex flex-col">
              <h2 className="text-xs font-bold text-slate-900 leading-tight">Café San Juan</h2>
              <span className="text-[10px] text-slate-500 font-mono">RUC: J0310000000000</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00BF81]" />
              En Línea
            </span>
          </div>
        </header>

        {/* Cuerpo Principal del Módulo */}
        <main className="flex-1 p-6 space-y-4 overflow-hidden">
          {/* Título de Página (fiel a fiscal-page.tsx / audit-page.tsx) */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">
                {pageTitle}
              </h1>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                {pageSubtitle}
              </p>
            </div>
            {showDateRange && <DateRangePickerMock />}
          </div>

          {/* Pestañas Oficiales */}
          {showTabs && activePath === '/fiscal' && (
            <div className="border-b border-slate-200">
              <nav className="-mb-px flex gap-6 text-xs font-medium">
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTab;
                  return (
                    <span
                      key={tab.id}
                      className={`border-b-2 pb-2.5 px-1 transition-colors ${
                        isActive
                          ? 'border-[#003757] font-bold text-[#003757]'
                          : 'border-transparent text-slate-500'
                      }`}
                    >
                      {tab.label}
                    </span>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Contenido Inyectado */}
          <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
        </main>
      </div>

      {/* Capa de Cursor Local Relativo (Garantiza cero desfase de píxeles) */}
      {cursorWaypoints && <WebCursor waypoints={cursorWaypoints} />}

      {/* Capa de Overlay (Toast flotante oficial) */}
      {overlay}
    </div>
  );
};

// ---------------------------------------------------------------- CONTENIDO DE SECUENCIA WEB

export const SequenceWebContent: React.FC<{
  highlightRow?: 0 | 1 | 2;
}> = ({ highlightRow }) => {
  const rows = [
    { serie: 'SERIE-001', inicio: '104', fin: '106', real: 3, esperado: 3 },
    { serie: 'SERIE-002', inicio: '1', fin: '50', real: 50, esperado: 50 },
    { serie: 'SERIE-003', inicio: '1', fin: '53', real: 53, esperado: 53 },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 3 StatCards Oficiales (stat-card.tsx) */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Secuencia Esperada', value: '106' },
          { label: 'Secuencia Real', value: '106' },
          { label: 'Secuencias Faltantes', value: '0' },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 truncate">
              {card.label}
            </p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 font-mono">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabla Oficial de Series Fiscales (SequenceTab) */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3 px-4">Serie</th>
              <th className="py-3 px-4 text-right">Inicio</th>
              <th className="py-3 px-4 text-right">Fin</th>
              <th className="py-3 px-4 text-right">Real / Esperado</th>
              <th className="py-3 px-4 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {rows.map((row, index) => (
              <tr
                key={row.serie}
                className={`transition-colors ${
                  highlightRow === index ? 'bg-[#003757]/[0.06]' : ''
                }`}
              >
                <td className="py-4 px-4 font-mono text-[11px] font-bold text-slate-900">
                  {row.serie}
                </td>
                <td className="py-4 px-4 text-right tabular-nums text-slate-700">
                  {row.inicio}
                </td>
                <td className="py-4 px-4 text-right tabular-nums text-slate-700">
                  {row.fin}
                </td>
                <td className="py-4 px-4 text-right tabular-nums font-semibold text-slate-900">
                  {row.real} / {row.esperado}
                </td>
                <td className="py-4 px-4 text-center">
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                    OK
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-auto flex items-center justify-end">
        <FreshnessBadgeMock />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- CONTENIDO DE EXPORTACIONES WEB

export const ExportsWebContent: React.FC<{
  pressedButton?: 'csv' | 'json' | null;
  isExportSuccess?: boolean;
}> = ({ pressedButton = null, isExportSuccess = false }) => {
  const ExportButton: React.FC<{ label: string; active: boolean }> = ({
    label,
    active,
  }) => (
    <button
      type="button"
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all shadow-xs ${
        active
          ? 'border-[#00BF81] bg-[#00BF81]/15 text-[#003757] font-bold scale-95'
          : 'border-slate-200 bg-white text-slate-700'
      }`}
    >
      {label}
    </button>
  );

  const rows = [
    { label: 'Total Registros', value: '106 registros' },
    { label: 'Total Bruto (NIO)', value: 'C$ 145,280.00' },
    { label: 'Total IVA (NIO)', value: 'C$ 18,949.57' },
    { label: 'Total Exento (NIO)', value: 'C$ 0.00' },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Tarjeta 1: Libro de Ventas (ExportsTab real) */}
      <div className="rounded-lg border border-slate-200 bg-card bg-white p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Libro de Ventas
          </h3>
          <div className="flex gap-2">
            <ExportButton label="CSV" active={pressedButton === 'csv'} />
            <ExportButton label="JSON" active={pressedButton === 'json'} />
          </div>
        </div>
        <div className="space-y-1.5 text-xs">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex justify-between border-b border-slate-100 py-1.5 last:border-0"
            >
              <span className="font-medium text-slate-500">{row.label}</span>
              <span
                className={`tabular-nums ${
                  isExportSuccess && row.label === 'Total Registros'
                    ? 'font-bold text-[#003757]'
                    : 'text-slate-900'
                }`}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tarjeta 2: Reportes Z (ExportsTab real) */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Reportes Z
          </h3>
          <div className="flex gap-2">
            <ExportButton label="CSV" active={false} />
            <ExportButton label="JSON" active={false} />
          </div>
        </div>
        <div className="flex justify-between py-1.5 text-xs">
          <span className="font-medium text-slate-500">Total Turnos</span>
          <span className="tabular-nums text-slate-900">7 registros</span>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-end">
        <FreshnessBadgeMock />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- CONTENIDO DE AUDITORÍA WEB (LEDGER)

export const AuditWebContent: React.FC<{
  highlightRow?: number;
}> = ({ highlightRow }) => {
  const severityStyles: Record<string, string> = {
    Crítico: 'bg-rose-100 text-rose-800 border-rose-200',
    Advertencia: 'bg-amber-100 text-amber-800 border-amber-200',
    Informativo: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const ledger = [
    {
      fecha: '27/10/2026 12:42',
      usuario: 'carlos.cajero@cafesanjuan.ni',
      accion: 'Anulación de factura',
      severidad: 'Crítico',
      entidad: 'Factura',
      entidadId: '001-001-01-00000105',
      dispositivo: 'Q80-CAJA-01',
    },
    {
      fecha: '27/10/2026 12:35',
      usuario: 'carlos.cajero@cafesanjuan.ni',
      accion: 'Venta registrada',
      severidad: 'Informativo',
      entidad: 'Factura',
      entidadId: '001-001-01-00000104',
      dispositivo: 'Q80-CAJA-01',
    },
    {
      fecha: '27/10/2026 12:30',
      usuario: 'carlos.cajero@cafesanjuan.ni',
      accion: 'Apertura manual de gaveta',
      severidad: 'Advertencia',
      entidad: 'Caja / gaveta',
      entidadId: 'Caja 1',
      dispositivo: 'Q80-CAJA-01',
    },
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Fuente de auditoría: dos orígenes separados */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-500">
          Registro de la plataforma
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#003757] bg-[#003757]/10 px-3 py-1.5 text-[11px] font-medium text-[#003757]">
          <History className="h-3.5 w-3.5" />
          Bitácora del mostrador (POS)
        </span>
      </div>

      <p className="text-[10px] leading-snug text-slate-500">
        Entradas escritas por los terminales POS del local. No incluye los cambios de
        administración de la plataforma.
      </p>

      {/* Filtros visibles de la bitácora */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[11px] text-slate-700">
          Todos los actores
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </span>
        <span className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[11px] text-slate-700">
          Todas las entidades
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </span>
      </div>

      {/* LedgerTable real */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
        <table className="w-full table-fixed text-left text-[10px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
            <tr>
              <th className="w-[15%] py-2.5 px-2.5">Fecha y hora</th>
              <th className="w-[23%] py-2.5 px-2.5">Usuario</th>
              <th className="w-[21%] py-2.5 px-2.5">Acción</th>
              <th className="w-[12%] py-2.5 px-2.5">Severidad</th>
              <th className="w-[17%] py-2.5 px-2.5">Entidad</th>
              <th className="w-[12%] py-2.5 px-2.5">Dispositivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ledger.map((entry, index) => (
              <tr
                key={entry.entidadId}
                className={`transition-colors ${
                  highlightRow === index ? 'bg-[#003757]/[0.06]' : ''
                }`}
              >
                <td className="py-3 px-2.5 tabular-nums text-slate-500">
                  {entry.fecha}
                </td>
                <td className="py-3 px-2.5 text-slate-800">
                  <span className="block truncate">{entry.usuario}</span>
                </td>
                <td className="py-3 px-2.5 font-medium text-slate-900">
                  {entry.accion}
                </td>
                <td className="py-3 px-2.5">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                      severityStyles[entry.severidad]
                    }`}
                  >
                    {entry.severidad}
                  </span>
                </td>
                <td className="py-3 px-2.5">
                  <span className="block text-slate-800">{entry.entidad}</span>
                  <span className="block truncate text-[9px] text-slate-400">
                    {entry.entidadId}
                  </span>
                </td>
                <td className="py-3 px-2.5 font-mono text-[9px] text-slate-500">
                  {entry.dispositivo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-auto flex items-center justify-end">
        <FreshnessBadgeMock label="Reporte generado: 12:48" />
      </div>
    </div>
  );
};
