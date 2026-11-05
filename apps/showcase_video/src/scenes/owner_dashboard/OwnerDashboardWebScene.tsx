import React from 'react';
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  Store,
  Calendar,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Filter,
  TrendingUp,
} from 'lucide-react';
import { DashboardSidebar } from '../../components/DashboardSidebar';

interface Waypoint {
  frame: number;
  x: number;
  y: number;
  click?: boolean;
}

const CRITICAL_ITEMS = [
  {
    code: 'INS-014',
    name: 'Café Molido Especial (g)',
    stock: '450 g',
    min: '1,500 g',
    severity: 'Crítica',
    message: 'Stock por debajo del mínimo crítico',
    reorder: '3,000 g',
  },
  {
    code: 'INS-022',
    name: 'Leche de Almendras Barista (ml)',
    stock: '600 ml',
    min: '2,000 ml',
    severity: 'Crítica',
    message: 'Stock por debajo del mínimo crítico',
    reorder: '6,000 ml',
  },
  {
    code: 'INS-038',
    name: 'Vasos Térmicos Doble Pared 12oz',
    stock: '28 und',
    min: '100 und',
    severity: 'Crítica',
    message: 'Cobertura menor a 1 turno operativo',
    reorder: '250 und',
  },
  {
    code: 'INS-051',
    name: 'Jarabe Artesanal de Vainilla (ml)',
    stock: '180 ml',
    min: '750 ml',
    severity: 'Crítica',
    message: 'Stock por debajo del mínimo crítico',
    reorder: '1,500 ml',
  },
] as const;

const INVENTORY_TABS = [
  { id: 'valuation', label: 'Valoración' },
  { id: 'insumos', label: 'Insumos' },
  { id: 'purchases', label: 'Compras' },
  { id: 'suppliers', label: 'Proveedores' },
  { id: 'cogs', label: 'COGS / Margen' },
  { id: 'kardex', label: 'Kardex' },
  { id: 'alerts', label: 'Alertas' },
  { id: 'conciliacion', label: 'Conciliación' },
] as const;

/**
 * Escenas 1, 2, 3 y 4 continuas (f0 - f980, 980 frames / 32.67s @ 30fps)
 * - Escena 1 (f0 - f45): Frame 0 Live Action — cursor ya en movimiento pulsando sobre la alerta
 *   "Stock crítico · 4 productos" (Botón "Revisar críticos") dentro de Atención Requerida.
 * - Escena 2 (f45 - f315): Corte de atención en f45 (zoom 1.0 -> 1.07) hacia Layer 1 (Cabecera Ejecutiva)
 *   y Layer 3 (Atención Requerida con solo excepciones reales). En f295 clic en "Revisar críticos".
 * - Escena 3 (f315 - f660): Navegación contextual a /inventory?status=CRITICAL&source=dashboard con
 *   los 4 insumos críticos ya filtrados y acción "← Volver al Dashboard" en f625.
 * - Escena 4 (f660 - f980): Retorno al Dashboard conservando "1–15 de noviembre de 2026 (vs. 1–15 oct)",
 *   cursor sobre indicador verde "Datos actualizados" y KPI "Margen Bruto 38.4%".
 */
export const OwnerDashboardWebScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Vista activa: Dashboard en E1+E2 (f0..f314), Inventario Crítico en E3 (f315..f640), Dashboard en E4 (f641..f980)
  const isInventoryView = frame >= 315 && frame < 640;
  const activeSidebarPath = isInventoryView ? '/inventory' : '/';

  // Corte de atención exacto en el frame 45 (1.5s): scale 1.0 -> 1.07
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

  // Escala dinámica continua sin saltos ni flashes
  const windowScale =
    frame < 45
      ? 1.0
      : frame < 315
      ? interpolate(attentionZoomSpring, [0, 1], [1.0, 1.07])
      : frame < 660
      ? interpolate(returnZoomOutSpring, [0, 1], [1.07, 1.02])
      : interpolate(scene4FocusSpring, [0, 1], [1.02, 1.06]);

  // Desplazamiento sutil de cámara durante el zoom de atención (enfocando cabecera y bloque derecho)
  const windowTranslateX =
    frame >= 45 && frame < 315
      ? interpolate(attentionZoomSpring, [0, 1], [0, -18])
      : frame >= 660
      ? interpolate(scene4FocusSpring, [0, 1], [0, -12])
      : 0;

  const windowTranslateY =
    frame >= 45 && frame < 315
      ? interpolate(attentionZoomSpring, [0, 1], [0, -10])
      : frame >= 660
      ? interpolate(scene4FocusSpring, [0, 1], [0, 14])
      : 0;

  // Estados de hover / foco accionados por el cursor (100% deterministas por frame)
  const isStockRowFocused =
    (frame >= 6 && frame < 160) || (frame >= 245 && frame < 315);
  const isVoidsRowFocused = frame >= 165 && frame < 240;
  const isRevisarButtonPressed =
    (frame >= 14 && frame <= 24) || (frame >= 295 && frame <= 306);
  const revisaBtnScale = isRevisarButtonPressed ? 0.95 : 1;

  const isFilterChipHighlighted = frame >= 345 && frame < 445;
  const highlightedInventoryRow =
    frame >= 450 && frame < 495
      ? 0
      : frame >= 495 && frame < 540
      ? 1
      : frame >= 540 && frame < 590
      ? 2
      : undefined;

  const isBackBtnHovered = frame >= 605 && frame < 640;
  const isBackBtnPressed = frame >= 624 && frame <= 634;
  const backBtnScale = isBackBtnPressed ? 0.95 : 1;

  const isFreshnessHovered = frame >= 685 && frame < 785;
  const isMarginCardHovered = frame >= 795 && frame < 955;

  // Ruta determinista del cursor dentro de la ventana de 1000x820
  const waypoints: Waypoint[] = [
    // Escena 1 (f0 - f45): Frame 0 Live Action — el cursor ya se mueve hacia "Stock crítico · 4 productos" y pulsa en f14
    { frame: 0, x: 805, y: 425 },
    { frame: 10, x: 842, y: 446 },
    { frame: 14, x: 842, y: 446, click: true },
    { frame: 45, x: 842, y: 446 },

    // Escena 2 (f45 - f315): Inspecciona Cabecera Ejecutiva y las 2 excepciones reales en Atención Requerida, luego pulsa "Revisar críticos"
    { frame: 85, x: 715, y: 446 },
    { frame: 135, x: 715, y: 446 },
    { frame: 175, x: 735, y: 525 }, // Fila "2 anulaciones en el período"
    { frame: 230, x: 735, y: 525 },
    { frame: 265, x: 842, y: 446 }, // Vuelve al botón "Revisar críticos"
    { frame: 291, x: 842, y: 446 }, // Dwell 4+ frames
    { frame: 295, x: 842, y: 446, click: true }, // Clic de navegación contextual
    { frame: 314, x: 842, y: 446 },

    // Escena 3 (f315 - f660): En /inventory?status=CRITICAL&source=dashboard
    { frame: 350, x: 645, y: 326 }, // Filtro automático "Estado = Crítico (4 productos)"
    { frame: 425, x: 645, y: 326 },
    { frame: 465, x: 540, y: 425 }, // Insumo crítico 1: Café Molido Especial
    { frame: 510, x: 540, y: 478 }, // Insumo crítico 2: Leche de Almendras
    { frame: 555, x: 540, y: 530 }, // Insumo crítico 3: Vasos Térmicos
    { frame: 608, x: 358, y: 120 }, // Llega a "← Volver al Dashboard"
    { frame: 620, x: 358, y: 120 }, // Dwell 4+ frames
    { frame: 624, x: 358, y: 120, click: true }, // Clic para volver preservando fechas
    { frame: 645, x: 358, y: 120 },

    // Escena 4 (f660 - f980): De vuelta en Dashboard -> Indicador "Datos actualizados" y KPI "Margen Bruto 38.4%"
    { frame: 695, x: 615, y: 118 }, // Indicador verde "Datos actualizados"
    { frame: 775, x: 615, y: 118 },
    { frame: 810, x: 875, y: 232 }, // KPI Card "Margen Bruto 38.4%"
    { frame: 950, x: 875, y: 232 },
  ];

  // Cálculo determinista de posición y ripple único del cursor (cero CSS animate-ping)
  let cursorPos = { x: waypoints[0].x, y: waypoints[0].y };
  let clickAge = -1;

  for (let i = 0; i < waypoints.length; i += 1) {
    const cur = waypoints[i];
    const nxt = waypoints[i + 1];

    if (cur.click && frame >= cur.frame && frame <= cur.frame + 8) {
      clickAge = frame - cur.frame;
    }

    if (!nxt) {
      if (frame >= cur.frame) {
        cursorPos = { x: cur.x, y: cur.y };
      }
      break;
    }

    if (frame >= cur.frame && frame <= nxt.frame) {
      const progress = interpolate(frame, [cur.frame, nxt.frame], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      cursorPos = {
        x: cur.x + (nxt.x - cur.x) * progress,
        y: cur.y + (nxt.y - cur.y) * progress,
      };
      break;
    }
  }

  const rippleScale =
    clickAge >= 0 ? interpolate(clickAge, [0, 8], [0.7, 2.3]) : 1;
  const rippleOpacity =
    clickAge >= 0 ? interpolate(clickAge, [0, 8], [0.85, 0]) : 0;

  // Título dinámico superior (único badge de funcionalidad arriba, sin duplicar pill de marca)
  const topHeaderTitle =
    frame < 45
      ? 'Visibilidad Gerencial Sin Ruido'
      : frame < 315
      ? 'Atención Requerida: Cero Adornos'
      : frame < 660
      ? 'Navegación Contextual Directa'
      : 'Control Ejecutivo en Tiempo Real';

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans select-none">
      {/* Iluminación ambiental institucional */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[880px] h-[880px] bg-[#003757]/80 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute -bottom-20 right-10 w-[620px] h-[620px] bg-[#00BF81]/15 rounded-full blur-[180px] pointer-events-none" />

      {/* Header Superior en Zona Segura (Instagram Reels Safe Zone: top >= 130px) */}
      <div className="w-full pt-[106px] flex flex-col items-center z-20 text-center">
        <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 mb-3 shadow-sm flex items-center gap-2">
          <Eye className="w-4 h-4 text-[#00BF81]" />
          <span>Visibilidad Ejecutiva · Navegación Contextual</span>
        </span>
        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          {topHeaderTitle}
        </h2>
      </div>

      {/* Ventana Web Backoffice2 Centrada en flex-1 */}
      <div className="w-full flex-1 flex items-center justify-center z-20">
        <div
          className="w-[1000px] h-[820px] bg-slate-50 rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.65)] overflow-hidden border border-slate-300 flex flex-col relative text-slate-800 origin-center"
          style={{
            transform: `scale(${windowScale}) translate(${windowTranslateX}px, ${windowTranslateY}px)`,
          }}
        >
          {/* Barra de Navegador Web con URL Contextual */}
          <div className="h-9 bg-slate-900 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-md px-4 py-0.5 text-[11px] font-mono text-slate-300 flex items-center gap-2">
              <span className="text-[#00BF81] font-semibold">NHILOS Backoffice</span>
              <span className="text-slate-500">|</span>
              <span className="text-white">
                {isInventoryView
                  ? '/inventory?status=CRITICAL&source=dashboard'
                  : '/dashboard?period=2026-11-01..2026-11-15'}
              </span>
            </div>
            <div className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase">
              Quiet Executive
            </div>
          </div>

          {/* Cuerpo de la Aplicación (Sidebar + Main) */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Sidebar Oficial con Roberto Morales (Propietario) */}
            <DashboardSidebar
              activePath={activeSidebarPath}
              compact
              userName="Roberto Morales"
              userRole="Propietario"
            />

            {/* Columna Derecha Principal */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden text-left">
              {/* Header Superior Oficial del Comercio */}
              <header className="h-14 shrink-0 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Store className="h-4 w-4 text-[#003757]" />
                  <div className="flex flex-col">
                    <h2 className="text-xs font-bold text-slate-900 leading-tight">
                      Distribuidora &amp; Café San Juan
                    </h2>
                    <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                      RUC: J0310000145821
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-600 font-medium">
                    Roberto Morales ·{' '}
                    <strong className="text-[#003757]">Propietario</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00BF81]" />
                    En Línea
                  </span>
                </div>
              </header>

              {/* Contenido Dinámico: Vista Dashboard vs Vista Inventario Prefiltrada */}
              {!isInventoryView ? (
                <main className="flex-1 p-5 space-y-4 overflow-hidden flex flex-col">
                  {/* LAYER 1: Cabecera Ejecutiva */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h1 className="text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap">
                        Dashboard Ejecutivo
                      </h1>
                      <p className="text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">
                        Resumen operativo · Comparativa:{' '}
                        <strong className="text-slate-700">vs. 1–15 oct</strong>
                      </p>
                    </div>

                    {/* Controles Superiores: Indicador de Frescura + Selector de Período */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold border whitespace-nowrap ${
                          isFreshnessHovered
                            ? 'bg-emerald-100 border-[#00BF81] text-emerald-950 shadow-[0_0_20px_rgba(0,191,129,0.35)]'
                            : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                        }`}
                        style={{
                          transform: isFreshnessHovered ? 'scale(1.04)' : 'scale(1)',
                        }}
                      >
                        <span className="h-2 w-2 rounded-full bg-[#00BF81] shrink-0" />
                        <span>Datos actualizados</span>
                      </span>

                      <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-slate-800 shadow-xs whitespace-nowrap">
                        <Calendar className="h-3.5 w-3.5 text-[#003757] shrink-0" />
                        <span className="tabular-nums">
                          1–15 de noviembre de 2026
                        </span>
                        <span className="text-[9.5px] font-bold text-[#003757] bg-slate-100 px-1.5 py-0.5 rounded">
                          vs. 1–15 oct
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* LAYER 2: Strip de 4 KPIs Ejecutivos con Números Tabulares */}
                  <section className="grid grid-cols-4 gap-3">
                    {/* KPI 1: Ventas Netas */}
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Ventas Netas
                      </p>
                      <p
                        className="mt-1.5 text-lg font-extrabold text-slate-900 tabular-nums whitespace-nowrap"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        C$ 148,520.00
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        Facturación neta del período
                      </p>
                      <p className="mt-1.5 flex items-center gap-1 text-[10.5px] font-semibold text-[#008558] tabular-nums whitespace-nowrap">
                        <span>↑ +12.4%</span>
                        <span className="font-normal text-slate-500">
                          vs. 1–15 oct
                        </span>
                      </p>
                    </div>

                    {/* KPI 2: Tickets Completados */}
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Tickets Completados
                      </p>
                      <p
                        className="mt-1.5 text-xl font-extrabold text-slate-900 tabular-nums"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        612
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        Transacciones cerradas
                      </p>
                      <p className="mt-1.5 flex items-center gap-1 text-[10.5px] font-semibold text-[#008558] tabular-nums whitespace-nowrap">
                        <span>↑ +8.1%</span>
                        <span className="font-normal text-slate-500">
                          vs. 1–15 oct
                        </span>
                      </p>
                    </div>

                    {/* KPI 3: Ticket Promedio */}
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Ticket Promedio
                      </p>
                      <p
                        className="mt-1.5 text-xl font-extrabold text-slate-900 tabular-nums whitespace-nowrap"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        C$ 242.68
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        Promedio por orden
                      </p>
                      <p className="mt-1.5 flex items-center gap-1 text-[10.5px] font-semibold text-[#008558] tabular-nums whitespace-nowrap">
                        <span>↑ +4.0%</span>
                        <span className="font-normal text-slate-500">
                          vs. 1–15 oct
                        </span>
                      </p>
                    </div>

                    {/* KPI 4: Margen Bruto */}
                    <div
                      className={`rounded-xl border p-3.5 ${
                        isMarginCardHovered
                          ? 'border-[#00BF81] bg-emerald-50/50 shadow-[0_0_25px_rgba(0,191,129,0.28)]'
                          : 'border-slate-200 bg-white shadow-xs'
                      }`}
                      style={{
                        transform: isMarginCardHovered ? 'scale(1.03)' : 'scale(1)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                          Margen Bruto
                        </p>
                        <span className="rounded bg-emerald-100 px-1 py-0.5 text-[8.5px] font-bold text-emerald-800 whitespace-nowrap">
                          100% costos
                        </span>
                      </div>
                      <p
                        className="mt-1.5 text-2xl font-extrabold text-[#003757] tabular-nums"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        38.4%
                      </p>
                      <p
                        className="mt-1 text-[10px] font-semibold text-slate-600 tabular-nums whitespace-nowrap"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        C$ 57,031.68 · Costo real
                      </p>
                      <p className="mt-1.5 flex items-center gap-1 text-[10.5px] font-semibold text-[#008558] tabular-nums whitespace-nowrap">
                        <span>↑ +1.8 pp</span>
                        <span className="font-normal text-slate-500">
                          vs. 1–15 oct
                        </span>
                      </p>
                    </div>
                  </section>

                  {/* LAYER 3: Banda de Desempeño + Bloque Atención Requerida (Quiet Executive) */}
                  <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
                    {/* Evolución de Ventas (5 columnas) */}
                    <div className="col-span-5 rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 whitespace-nowrap">
                            <TrendingUp className="w-3.5 h-3.5 text-[#003757] shrink-0" />
                            <span>Evolución de Ventas</span>
                          </h3>
                          <span className="text-[10px] font-semibold text-[#003757] whitespace-nowrap">
                            vs. 1–15 oct
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-0.5 bg-[#003757] inline-block" />
                            <span>1–15 nov 2026</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 border-t-2 border-dashed border-slate-400 inline-block" />
                            <span>1–15 oct 2026</span>
                          </span>
                        </div>
                      </div>

                      {/* Gráfico limpio comparativo (sin ruido decorativo) */}
                      <div className="my-2 h-36 w-full flex items-end gap-2 px-2 pt-4 pb-2 border-b border-slate-100 relative">
                        {[52, 60, 56, 68, 74, 70, 82, 78, 86, 92, 88, 96].map(
                          (h, idx) => (
                            <div
                              key={idx}
                              className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
                            >
                              <div
                                className="w-full rounded-t bg-[#003757]/85"
                                style={{ height: `${h}%` }}
                              />
                            </div>
                          )
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[9.5px] text-slate-500 tabular-nums whitespace-nowrap">
                        <span>Corte 100% conciliado</span>
                        <span className="font-semibold text-slate-700">
                          Prom: C$ 9,901.33
                        </span>
                      </div>
                    </div>

                    {/* Bloque Protagonista: Atención Requerida (Layer 3 - 7 columnas) */}
                    <section
                      aria-label="Atención requerida"
                      className="col-span-7 rounded-xl border-2 border-[#003757]/25 bg-white p-4 shadow-md flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 gap-2">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0" />
                            <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                              Atención Requerida
                            </h2>
                            <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                              2 excepciones activas
                            </span>
                          </div>
                        </div>

                        <ul className="mt-3 space-y-3">
                          {/* Excepción 1: Stock crítico · 4 productos */}
                          <li
                            className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 ${
                              isStockRowFocused
                                ? 'border-rose-400 bg-rose-50/70 shadow-[0_0_24px_rgba(225,29,72,0.15)]'
                                : 'border-rose-200 bg-rose-50/30'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span
                                aria-hidden="true"
                                className="mt-0.5 text-sm font-black text-rose-600 shrink-0"
                              >
                                ●
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <span className="text-xs font-extrabold text-rose-700">
                                    Stock crítico · 4 productos
                                  </span>
                                  <span className="rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-700">
                                    Actual
                                  </span>
                                </div>
                                <span className="block text-[11px] text-slate-600 mt-0.5">
                                  4 insumos por debajo del mínimo crítico en
                                  cafetería y barra
                                </span>
                              </div>
                            </div>

                            <div
                              style={{ transform: `scale(${revisaBtnScale})` }}
                              className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-xs whitespace-nowrap ${
                                isStockRowFocused
                                  ? 'bg-[#003757] text-white ring-2 ring-[#00BF81]'
                                  : 'bg-[#003757] text-white'
                              }`}
                            >
                              <span>Revisar críticos</span>
                              <ArrowRight className="w-3.5 h-3.5 text-[#00BF81]" />
                            </div>
                          </li>

                          {/* Excepción 2: 2 anulaciones en el período */}
                          <li
                            className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 ${
                              isVoidsRowFocused
                                ? 'border-amber-400 bg-amber-50/80 shadow-sm'
                                : 'border-amber-200/80 bg-amber-50/30'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span
                                aria-hidden="true"
                                className="mt-0.5 text-sm font-black text-amber-700 shrink-0"
                              >
                                ▲
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <span className="text-xs font-extrabold text-amber-800">
                                    2 anulaciones en el período
                                  </span>
                                  <span className="rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800">
                                    Período
                                  </span>
                                </div>
                                <span className="block text-[11px] text-slate-600 mt-0.5 tabular-nums">
                                  2 facturas anuladas con motivo formal · Total
                                  C$ 490.00 (1–15 nov)
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-[#003757] flex items-center gap-1 whitespace-nowrap">
                              <span>Ver anulaciones</span>
                              <ArrowRight className="w-3 h-3 text-[#003757]" />
                            </div>
                          </li>
                        </ul>
                      </div>

                      {/* Pie de doctrina Quiet Executive */}
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[9.5px] text-slate-500 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#00BF81] shrink-0" />
                          <span>
                            Secuencia DGI y caja al día (omitidas)
                          </span>
                        </span>
                        <span className="font-mono text-[9.5px] text-[#003757] font-semibold">
                          NHILOS +1: Context travels
                        </span>
                      </div>
                    </section>
                  </div>
                </main>
              ) : (
                /* VISTA DE INVENTARIO PREFILTRADA (/inventory?status=CRITICAL&source=dashboard) */
                <main className="flex-1 p-5 space-y-3.5 overflow-hidden flex flex-col">
                  {/* Barra de retorno contextual + Cabecera de Inventario */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        style={{ transform: `scale(${backBtnScale})` }}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold border shadow-xs whitespace-nowrap shrink-0 ${
                          isBackBtnHovered
                            ? 'bg-[#003757] text-white border-[#003757] ring-2 ring-[#00BF81]'
                            : 'bg-white text-[#003757] border-slate-300'
                        }`}
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-[#00BF81] shrink-0" />
                        <span>← Volver al Dashboard</span>
                      </button>

                      <div className="min-w-0">
                        <h1 className="text-sm font-bold tracking-tight text-slate-900 leading-tight whitespace-nowrap">
                          Inventario · Alertas de Stock
                        </h1>
                        <p className="text-[10px] text-slate-500 whitespace-nowrap">
                          Rango preservado: 1–15 nov 2026
                        </p>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-slate-800 shadow-xs whitespace-nowrap shrink-0">
                      <Calendar className="h-3.5 w-3.5 text-[#003757] shrink-0" />
                      <span className="tabular-nums">
                        1–15 de noviembre de 2026
                      </span>
                    </div>
                  </div>

                  {/* Pestañas de Inventario con "Alertas" activa */}
                  <div className="border-b border-slate-200">
                    <nav className="-mb-px flex gap-5 text-xs font-medium">
                      {INVENTORY_TABS.map((tab) => {
                        const isActive = tab.id === 'alerts';
                        return (
                          <span
                            key={tab.id}
                            className={`border-b-2 pb-2 px-1 ${
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

                  {/* Tarjetas de resumen rápido de alertas */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Total Alertas
                      </p>
                      <p className="mt-1 text-xl font-extrabold tabular-nums text-slate-900">
                        6
                      </p>
                    </div>
                    <div className="rounded-lg border-2 border-rose-300 bg-rose-50/70 p-3 shadow-xs">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                        Críticas (Filtro Activo)
                      </p>
                      <p className="mt-1 text-xl font-extrabold tabular-nums text-rose-700">
                        4
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs opacity-60">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Advertencias
                      </p>
                      <p className="mt-1 text-xl font-extrabold tabular-nums text-slate-700">
                        2
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs opacity-60">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Stock Negativo
                      </p>
                      <p className="mt-1 text-xl font-extrabold tabular-nums text-slate-700">
                        0
                      </p>
                    </div>
                  </div>

                  {/* Barra de Filtro Contextual Automático */}
                  <div
                    className={`flex items-center justify-between rounded-lg border px-3.5 py-2 text-xs ${
                      isFilterChipHighlighted
                        ? 'border-[#00BF81] bg-emerald-50/80 shadow-[0_0_20px_rgba(0,191,129,0.25)]'
                        : 'border-slate-200 bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Filter className="w-3.5 h-3.5 text-[#003757]" />
                      <span className="text-slate-700">
                        Filtro contextual aplicado desde Dashboard:
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 border border-rose-300 px-2.5 py-0.5 text-[11px] font-extrabold text-rose-800">
                        <AlertTriangle className="w-3 h-3 text-rose-700" />
                        <span>Estado = Crítico (4 productos)</span>
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-[#003757]">
                      Mostrar todas (6)
                    </span>
                  </div>

                  {/* Tabla de los 4 Productos en Estado Crítico */}
                  <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden flex-1">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3.5">Insumo / Producto</th>
                          <th className="py-2.5 px-3.5 text-right">
                            Stock Actual
                          </th>
                          <th className="py-2.5 px-3.5 text-right">Mínimo</th>
                          <th className="py-2.5 px-3.5 text-center">
                            Severidad
                          </th>
                          <th className="py-2.5 px-3.5">Diagnóstico</th>
                          <th className="py-2.5 px-3.5 text-right">
                            Reorden Sugerida
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {CRITICAL_ITEMS.map((item, idx) => (
                          <tr
                            key={item.code}
                            className={
                              highlightedInventoryRow === idx
                                ? 'bg-[#003757]/[0.06]'
                                : ''
                            }
                          >
                            <td className="py-2.5 px-3.5">
                              <div className="font-bold text-slate-900">
                                {item.name}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400">
                                {item.code}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 text-right tabular-nums font-bold text-rose-600 whitespace-nowrap">
                              {item.stock}
                            </td>
                            <td className="py-2.5 px-3.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
                              {item.min}
                            </td>
                            <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                              <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800">
                                {item.severity}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 text-[11px] text-slate-600">
                              {item.message}
                            </td>
                            <td className="py-2.5 px-3.5 text-right tabular-nums font-extrabold text-[#003757] whitespace-nowrap">
                              {item.reorder}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </main>
              )}
            </div>
          </div>

          {/* Cursor Web Determinista con Ripple Único */}
          <div
            className="absolute pointer-events-none z-50"
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
                className="absolute -top-2 -left-2 w-7 h-7 rounded-full border-2 border-[#00BF81] bg-[#00BF81]/30 pointer-events-none"
                style={{
                  transform: `scale(${rippleScale})`,
                  opacity: rippleOpacity,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Subtítulos Cinéticos Superpuestos en Zona Segura Inferior (bottom >= 280px) */}
      <div className="w-full h-[320px] flex flex-col items-center justify-start pt-4 z-30 text-center">
        {frame < 45 ? (
          /* Escena 1 (f0 - f45) */
          <div className="space-y-1">
            <div
              className="text-5xl font-black text-white tracking-[1.5px] drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Visibilidad sin ruido.
            </div>
            <div className="text-2xl font-bold text-[#00BF81] tracking-wide">
              Acción inmediata sobre alertas reales.
            </div>
          </div>
        ) : frame < 315 ? (
          /* Escena 2 (f45 - f315) */
          <div className="space-y-1">
            <div
              className="text-5xl font-black text-white tracking-[1.5px] drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Solo lo que importa.
            </div>
            <div className="text-2xl font-bold text-[#00BF81] tracking-wide">
              Excepciones reales, cero adornos.
            </div>
          </div>
        ) : frame < 660 ? (
          /* Escena 3 (f315 - f660) */
          <div className="space-y-1">
            <div
              className="text-5xl font-black text-white tracking-[1.5px] drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              El contexto viaja contigo.
            </div>
            <div className="text-2xl font-bold text-[#00BF81] tracking-wide">
              Filtro automático: Estado = Crítico.
            </div>
          </div>
        ) : (
          /* Escena 4 (f660 - f980) */
          <div className="space-y-1">
            <div
              className="text-5xl font-black text-white tracking-[1.5px] drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Cero pasos repetidos.
            </div>
            <div className="text-2xl font-bold text-[#00BF81] tracking-wide">
              Control ejecutivo en tiempo real.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
