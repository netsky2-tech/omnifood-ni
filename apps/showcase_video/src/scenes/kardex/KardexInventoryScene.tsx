import React from 'react';
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  Img,
} from 'remotion';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  History,
  Lock,
  Package,
  Search,
  ShieldCheck,
  Store,
  X,
} from 'lucide-react';
import { DashboardSidebar } from '../../components/DashboardSidebar';
import { WebCursor, LocalWaypoint } from '../fiscal/FiscalWebChrome';

/**
 * Escenas 1 a 4 (f0..f885 — 885 frames / 29.5s @ 30fps con locución armónica):
 * - Escena 1 (f0..f145): Frame 0 en Macro-Zoom (`scale: 1.60`) con el cursor pulsando el botón
 *   `Ver movimientos` junto a la etiqueta ámbar/roja de alerta `Diferencia: -3 uds` (`Aceite 1L`).
 *   A los 1.5s (`f45`), zoom-out fluido de `1.60 ➔ 1.05` abriendo el panel de Kardex.
 * - Escena 2 (f145..f345): Panel de Kardex del Producto (`Aceite Vegetal 1 Litro (Caja x 12) | SKU: AB-0412`)
 *   con fecha y hora exacta (`12 nov, 4:15 p. m.`), tipo de movimiento y usuario responsable.
 * - Escena 3 (f345..f615): El cursor recorre las 3 filas del Kardex:
 *   1. `Entrada Compra` (`+24`)
 *   2. `Venta` (`Venta POS Factura #00912`, `-2`)
 *   3. `Merma / Ajuste` (`-3 uds · -C$ 285.00`) con motivo obligatorio `Merma / Daño auditado`
 *      y `Autorizado por: Roberto M.` (incluyendo tarjeta/modal de evidencia firmada).
 * - Escena 4 (f615..f885): Clic en `← Volver a existencias` cerrando el detalle y volviendo a la lista
 *   de inventario sin perder el filtro de búsqueda activo (`Aceite Vegetal 1L`) ni el chip
 *   `Estado: Con diferencias (1)`, con indicadores de Costo de Reposición y Margen Protegido en `tabular-nums`.
 */

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

export const KardexInventoryScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // =========================================================================
  // 1. MACRO-ZOOM FRAME 0 (scale: 1.60) -> CORTE 1.5s (f45 -> scale: 1.05)
  // =========================================================================
  const zoomOutProgress = spring({
    frame: Math.max(0, frame - 45),
    fps,
    config: { damping: 18, stiffness: 105, mass: 0.9 },
  });

  const windowScale = interpolate(zoomOutProgress, [0, 1], [1.6, 1.04]);
  const windowTranslateX = interpolate(zoomOutProgress, [0, 1], [-225, 0]);
  const windowTranslateY = interpolate(zoomOutProgress, [0, 1], [-65, 0]);

  // =========================================================================
  // 2. ESTADOS DE NAVEGACIÓN (LISTA -> KARDEX + MODAL -> RETORNO A LISTA)
  // =========================================================================
  // f0..f47: Vista de Lista de Inventario con fila destacada de Aceite Vegetal 1L y botón "Ver movimientos"
  // f48..f640: Panel de Kardex / Historial Inalterable del Producto + Modal de Ajuste Auditado
  // f641..f885: Retorno a la Lista de Inventario preservando "Estado: Con diferencias" y búsqueda activa
  const isKardexOpen = frame >= 48 && frame < 642;
  const isReturnedToList = frame >= 642;

  const isVerMovimientosPressed = frame >= 8 && frame < 44;
  const isRow1Highlighted = isKardexOpen && frame >= 355 && frame < 430;
  const isRow2Highlighted = isKardexOpen && frame >= 430 && frame < 505;
  const isRow3Highlighted = isKardexOpen && frame >= 505;

  const showAdjustmentAuditModal = isKardexOpen && frame >= 515 && frame < 632;
  const modalSpring = spring({
    frame: Math.max(0, frame - 515),
    fps,
    config: { damping: 17, stiffness: 140, mass: 0.8 },
  });

  const returnListSpring = spring({
    frame: Math.max(0, frame - 642),
    fps,
    config: { damping: 18, stiffness: 130, mass: 0.85 },
  });

  // =========================================================================
  // 3. TRAYECTORIA DEL CURSOR WEB (Coordenadas dentro de ventana 1000x780)
  // =========================================================================
  const waypoints: LocalWaypoint[] = [
    // Escena 1: Clic inmediato en Frame 0 sobre "Ver movimientos" (x=885, y=468)
    { frame: 0, x: 885, y: 468, click: true },
    { frame: 18, x: 885, y: 468, click: true },
    { frame: 44, x: 885, y: 468 },
    // Escena 2: Cursor se posiciona sobre la cabecera del Kardex (12 nov, 4:15 p. m.)
    { frame: 90, x: 520, y: 315 },
    { frame: 330, x: 520, y: 315 },
    // Escena 3: Recorre las 3 filas del Kardex (Compra +24, Venta POS -2, Ajuste -3)
    { frame: 375, x: 610, y: 435, click: true },
    { frame: 420, x: 610, y: 435 },
    { frame: 455, x: 610, y: 500, click: true },
    { frame: 495, x: 610, y: 500 },
    { frame: 525, x: 610, y: 565, click: true },
    { frame: 605, x: 610, y: 565 },
    // Escena 4: Clic en acción secundaria "← Volver a existencias" (x=875, y=225)
    { frame: 636, x: 875, y: 225, click: true },
    { frame: 660, x: 875, y: 225 },
    // Señala el filtro preservado "Estado: Con diferencias (1)" y los KPIs tabulares de margen protegido
    { frame: 710, x: 565, y: 318 },
    { frame: 785, x: 875, y: 230 },
    { frame: 870, x: 875, y: 230 },
  ];

  // =========================================================================
  // 4. TÍTULOS SUPERIORES Y SUBTÍTULOS CINÉTICOS INFERIORES POR ESCENA
  // =========================================================================
  let topHeadline = 'Auditoría de Stock y Kardex Inalterable';
  if (frame >= 145 && frame < 345) {
    topHeadline = 'Kardex por Fecha, Hora y Responsable';
  } else if (frame >= 345 && frame < 615) {
    topHeadline = 'Compras, Ventas POS y Ajustes Auditados';
  } else if (frame >= 615) {
    topHeadline = 'Filtro Preservado y Margen Protegido';
  }

  let kineticLine1 = '¿Fuga de mercadería?';
  let kineticLine2 = 'Rastrea cada unidad al instante.';
  if (frame >= 145 && frame < 345) {
    kineticLine1 = 'Cero inventario a ciegas.';
    kineticLine2 = 'Historial exacto por fecha y hora.';
  } else if (frame >= 345 && frame < 615) {
    kineticLine1 = 'Kardex 100% auditable.';
    kineticLine2 = 'Compras, ventas POS y ajustes.';
  } else if (frame >= 615) {
    kineticLine1 = 'Todo movimiento deja huella.';
    kineticLine2 = 'Sabes quién, cuándo y por qué.';
  }

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans select-none">
      {/* Iluminación institucional de fondo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[850px] h-[850px] bg-[#003757]/80 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute -bottom-20 right-10 w-[600px] h-[600px] bg-[#00BF81]/15 rounded-full blur-[180px] pointer-events-none" />

      {/* ===================================================================
          TOP SAFE ZONE (pt-[104px] + p-8 => 136px >= 130px)
          Sin badge flotante redundante de comercio/RUC
         =================================================================== */}
      <div className="w-full pt-[104px] flex flex-col items-center z-30 text-center">
        <div className="flex items-center gap-2.5 bg-[#003757]/95 border border-white/15 px-4 py-1.5 rounded-full mb-2.5 shadow-lg">
          <Img
            src={staticFile('logo.png')}
            alt="NHILOS POS"
            className="w-6 h-6 object-contain"
          />
          <span
            className="text-xs font-black text-white tracking-[3px] uppercase"
            style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
          >
            NHILOS POS
          </span>
          <span className="text-white/30 text-xs">•</span>
          <span className="text-[11px] text-[#CCCCCC] font-medium">
            Conectamos los hilos de tu negocio.
          </span>
          <span className="ml-1 text-[10px] font-extrabold text-[#003757] bg-[#00BF81] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Inventario & Kardex
          </span>
        </div>

        <h2
          className="text-4xl font-extrabold text-white tracking-wide drop-shadow-md"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          {topHeadline}
        </h2>
      </div>

      {/* ===================================================================
          CENTER STAGE: Ventana de Owner Dashboard (/inventory) (1000x780)
          Con recorte overflow-hidden para mantener intactas las Safe Zones en Macro-Zoom
         =================================================================== */}
      <div className="w-full flex-1 flex items-center justify-center z-20 overflow-hidden my-1">
        <div
          className="w-[1000px] h-[780px] bg-slate-50 rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.68)] overflow-hidden border border-slate-300 flex relative text-slate-800 origin-center"
          style={{
            transform: `translate(${windowTranslateX}px, ${windowTranslateY}px) scale(${windowScale})`,
          }}
        >
          {/* 1. Sidebar Oficial (`DashboardSidebar` con `/inventory` activo) */}
          <DashboardSidebar
            activePath="/inventory"
            compact
            userName="Roberto Morales"
            userRole="Owner"
          />

          {/* 2. Área Principal del Módulo `/inventory` (`inventory-page.tsx`) */}
          <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden text-left">
            {/* Header superior oficial (`header.tsx`) */}
            <header className="h-13 shrink-0 border-b border-slate-200 bg-white px-5 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Store className="h-4 w-4 text-[#003757]" />
                <div className="flex flex-col">
                  <h2 className="text-xs font-bold text-slate-900 leading-tight">
                    Minimarket &amp; Distribuidora Santa Fe
                  </h2>
                  <span className="text-[10px] text-slate-500 font-mono">
                    RUC: J0310000418920 · Sucursal Central
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00BF81]" />
                  Sincronizado · 4:15 p. m.
                </span>
                <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                  <div className="w-6 h-6 rounded-full bg-[#003757] text-white text-[11px] font-bold flex items-center justify-center">
                    R
                  </div>
                  <div className="text-left">
                    <div className="text-[11px] font-bold text-slate-900 leading-none">
                      Roberto Morales
                    </div>
                    <div className="text-[9px] text-slate-500">Propietario</div>
                  </div>
                </div>
              </div>
            </header>

            {/* Cuerpo de `/inventory` */}
            <main className="flex-1 px-5 py-3.5 space-y-3 overflow-hidden flex flex-col">
              {/* Encabezado de página + Rango de fecha (`inventory-page.tsx`) */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-tight">
                    Inventario
                  </h1>
                  <p className="text-[11px] text-slate-500">
                    Valoración de existencias, kardex de movimientos y alertas de stock
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-800 shadow-xs">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  <span className="tabular-nums">12/11/2026 — 12/11/2026</span>
                </div>
              </div>

              {/* Pestañas reales de `inventory-page.tsx` (`TABS`) */}
              <div className="border-b border-slate-200">
                <nav className="-mb-px flex gap-4">
                  {INVENTORY_TABS.map((tab) => {
                    const isActive = isKardexOpen
                      ? tab.id === 'kardex'
                      : tab.id === 'valuation';
                    return (
                      <div
                        key={tab.id}
                        className={`border-b-2 px-1 py-2 text-xs font-semibold whitespace-nowrap ${
                          isActive
                            ? 'border-[#003757] text-[#003757]'
                            : 'border-transparent text-slate-500'
                        }`}
                      >
                        {tab.label}
                      </div>
                    );
                  })}
                </nav>
              </div>

              {/* =============================================================
                  VISTA A: LISTA DE INVENTARIO CON FILTRO PRESERVADO
                  (Escena 1 en f0..f47 y Escena 4 en f642..f885)
                 ============================================================= */}
              {!isKardexOpen ? (
                <div
                  className="flex-1 flex flex-col space-y-3 overflow-hidden"
                  style={{
                    opacity: isReturnedToList
                      ? interpolate(returnListSpring, [0, 1], [0.85, 1])
                      : 1,
                  }}
                >
                  {/* Strip de KPIs con Costo de Reposición y Margen Protegido en cifras tabulares */}
                  <div className="grid grid-cols-4 gap-2.5">
                    <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-xs">
                      <div className="text-[10px] font-bold uppercase text-slate-500">
                        Valoración Total
                      </div>
                      <div className="text-base font-black text-slate-900 tabular-nums mt-0.5">
                        C$ 148,920.00
                      </div>
                      <div className="text-[10px] text-slate-500">
                        312 SKU activos
                      </div>
                    </div>

                    <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-2.5 shadow-xs">
                      <div className="text-[10px] font-bold uppercase text-amber-900 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-700" />
                        <span>Diferencias Hoy</span>
                      </div>
                      <div className="text-base font-black text-rose-700 tabular-nums mt-0.5">
                        -3 uds · -C$ 285.00
                      </div>
                      <div className="text-[10px] font-semibold text-amber-900">
                        1 ajuste auditado
                      </div>
                    </div>

                    <div
                      className={`rounded-lg border p-2.5 shadow-xs transition-all ${
                        isReturnedToList
                          ? 'border-[#003757] bg-[#003757]/5 ring-2 ring-[#003757]/20'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase text-slate-500">
                        Costo Reposición (AB-0412)
                      </div>
                      <div className="text-base font-black text-slate-900 tabular-nums mt-0.5">
                        C$ 95.00 / ud
                      </div>
                      <div className="text-[10px] text-slate-600 tabular-nums">
                        Stock valorizado: C$ 1,995.00
                      </div>
                    </div>

                    <div
                      className={`rounded-lg border p-2.5 shadow-xs transition-all ${
                        isReturnedToList
                          ? 'border-[#00BF81] bg-emerald-50/80 ring-2 ring-[#00BF81]/40'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase text-emerald-900 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-[#00BF81]" />
                        <span>Margen Protegido</span>
                      </div>
                      <div className="text-base font-black text-emerald-800 tabular-nums mt-0.5">
                        31.6% · P.V. C$ 138.00
                      </div>
                      <div className="text-[10px] font-semibold text-emerald-700">
                        Merma trazada al turno
                      </div>
                    </div>
                  </div>

                  {/* Barra de búsqueda + Filtro preservado en la cabecera: `Estado: Con diferencias` */}
                  <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-xs">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex items-center w-64 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-900 font-medium">
                        <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
                        <span className="truncate">Aceite Vegetal 1 Litro</span>
                        <X className="w-3 h-3 text-slate-400 ml-auto shrink-0" />
                      </div>

                      {/* Chip de filtro activo preservado */}
                      <div
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold border ${
                          isReturnedToList
                            ? 'bg-amber-100 text-amber-950 border-amber-400 ring-2 ring-amber-300'
                            : 'bg-amber-100/90 text-amber-900 border-amber-300'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-600" />
                        <span>Estado: Con diferencias (1)</span>
                      </div>

                      {isReturnedToList && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-[#00BF81]" />
                          Filtro preservado al volver
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] font-semibold text-slate-500 tabular-nums">
                      Mostrando 1 de 312 ítems
                    </span>
                  </div>

                  {/* Tabla de Existencias con la fila destacada de Aceite Vegetal 1L */}
                  <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden flex-1 flex flex-col">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                        <tr>
                          <th className="py-2.5 px-3">Ítem / SKU</th>
                          <th className="py-2.5 px-2.5">UoM</th>
                          <th className="py-2.5 px-2.5 text-right">Stock Sistema</th>
                          <th className="py-2.5 px-2.5 text-right">Conteo Físico</th>
                          <th className="py-2.5 px-3 text-center">Diferencia Detectada</th>
                          <th className="py-2.5 px-3 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {/* FILA DESTACADA: Aceite Vegetal 1 Litro (Caja x 12) | SKU: AB-0412 */}
                        <tr className="bg-amber-50/75 ring-2 ring-inset ring-amber-400">
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-[#003757] text-white flex items-center justify-center shrink-0">
                                <Package className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="font-extrabold text-slate-900 text-xs">
                                  Aceite Vegetal 1 Litro (Caja x 12)
                                </div>
                                <div className="text-[10px] font-mono text-slate-500">
                                  SKU: AB-0412 · Abarrotes · Turno Tarde (Luis Cajero)
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-2.5 font-mono text-[11px] font-semibold text-slate-600">
                            UN (Botella 1L)
                          </td>
                          <td className="py-3.5 px-2.5 text-right font-mono font-bold text-slate-700 tabular-nums">
                            24 uds
                          </td>
                          <td className="py-3.5 px-2.5 text-right font-mono font-black text-slate-900 tabular-nums">
                            21 uds
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            <div className="inline-flex flex-col items-center rounded-lg bg-rose-100 border-2 border-rose-400 px-2.5 py-1 shadow-xs">
                              <span className="text-xs font-black text-rose-800 tabular-nums">
                                Diferencia: -3 uds
                              </span>
                              <span className="text-[10px] font-bold text-rose-700 tabular-nums">
                                Impacto: -C$ 285.00
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            <button
                              type="button"
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-extrabold transition-all shadow-md ${
                                isVerMovimientosPressed
                                  ? 'bg-[#00BF81] text-[#003757] ring-4 ring-[#00BF81]/40 scale-95'
                                  : 'bg-[#003757] text-white'
                              }`}
                            >
                              <History className="w-3.5 h-3.5" />
                              <span>Ver movimientos</span>
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Pie informativo de trazabilidad normativa */}
                    <div className="mt-auto border-t border-slate-200 bg-slate-50 px-4 py-2.5 flex items-center justify-between text-[11px] text-slate-600">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[#00BF81]" />
                        <span>
                          Último movimiento auditado: <strong>12 nov, 4:15 p. m.</strong> · Ajuste por Merma (-3 uds) autorizado por <strong>Roberto M.</strong>
                        </span>
                      </div>
                      <span className="font-mono text-[10px] font-bold text-[#003757] tabular-nums">
                        Valoración neta SKU: C$ 1,995.00
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* =============================================================
                   VISTA B: PANEL DE KARDEX / HISTORIAL INALTERABLE DE STOCK
                   (Escenas 2 y 3: f48..f641)
                   ============================================================= */
                <div className="flex-1 flex flex-col space-y-2.5 overflow-hidden relative">
                  {/* Cabecera contextual del producto en Kardex + botón secundario para volver */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#003757] text-white flex items-center justify-center shrink-0">
                        <ClipboardCheck className="w-5 h-5 text-[#00BF81]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-900">
                            Aceite Vegetal 1 Litro (Caja x 12)
                          </span>
                          <span className="rounded bg-slate-100 border border-slate-300 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                            SKU: AB-0412
                          </span>
                          <span className="rounded-full bg-rose-100 border border-rose-300 px-2.5 py-0.5 text-[10px] font-black text-rose-800 tabular-nums">
                            Diferencia: -3 uds (-C$ 285.00)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          Stock antes del ajuste: <strong>24 uds</strong> ➔ Conteo físico: <strong>21 uds</strong> · Costo prom.: <strong>C$ 95.00</strong>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                        frame >= 625
                          ? 'bg-[#003757] text-white border-[#003757] ring-4 ring-[#00BF81]/40'
                          : 'bg-slate-100 text-slate-800 border-slate-300'
                      }`}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Volver a existencias</span>
                    </button>
                  </div>

                  {/* Chips de filtro de `KardexTab` (`inventory-page.tsx`) */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-md bg-[#003757] text-white px-2.5 py-1 text-[11px] font-bold shadow-xs">
                        Todos (3)
                      </span>
                      <span className="rounded-md bg-slate-200/80 text-slate-700 px-2.5 py-1 text-[11px] font-medium">
                        Entrada Compra
                      </span>
                      <span className="rounded-md bg-slate-200/80 text-slate-700 px-2.5 py-1 text-[11px] font-medium">
                        Venta
                      </span>
                      <span className="rounded-md bg-slate-200/80 text-slate-700 px-2.5 py-1 text-[11px] font-medium">
                        Mermas / Ajustes
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">
                      Historial inalterable · Orden cronológico
                    </span>
                  </div>

                  {/* Tabla de Kardex (`KardexTab` en `inventory-page.tsx`) */}
                  <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden flex-1 flex flex-col">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                        <tr>
                          <th className="py-2.5 px-3">Fecha y Hora</th>
                          <th className="py-2.5 px-2.5">Tipo de Movimiento</th>
                          <th className="py-2.5 px-3">Documento / Motivo Obligatorio</th>
                          <th className="py-2.5 px-2.5">Usuario / Turno</th>
                          <th className="py-2.5 px-2.5 text-right">Cant.</th>
                          <th className="py-2.5 px-3 text-right">Antes ➔ Después</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {/* FILA 1: Entrada por Compra (+24) */}
                        <tr
                          className={`transition-colors ${
                            isRow1Highlighted
                              ? 'bg-emerald-50 ring-2 ring-inset ring-[#00BF81]'
                              : 'bg-white'
                          }`}
                        >
                          <td className="py-3 px-3 font-mono text-[11px] font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                            12 nov, 8:30 a. m.
                          </td>
                          <td className="py-3 px-2.5">
                            <span className="inline-flex items-center rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-[10px] font-bold text-emerald-900">
                              Entrada Compra
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">
                              Recepción Factura Prov. #4410
                            </div>
                            <div className="text-[10px] text-slate-500 tabular-nums">
                              2 Cajas x 12 uds · Costo unit.: C$ 95.00
                            </div>
                          </td>
                          <td className="py-3 px-2.5">
                            <div className="font-semibold text-slate-800">
                              Roberto Morales
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Recepción Bodega
                            </div>
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono font-black text-emerald-700 text-sm tabular-nums">
                            +24
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-xs font-bold text-slate-700 tabular-nums">
                            2 ➔ 26
                          </td>
                        </tr>

                        {/* FILA 2: Venta POS Factura #00912 (-2) */}
                        <tr
                          className={`transition-colors ${
                            isRow2Highlighted
                              ? 'bg-sky-50 ring-2 ring-inset ring-[#003757]'
                              : 'bg-white'
                          }`}
                        >
                          <td className="py-3 px-3 font-mono text-[11px] font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                            12 nov, 1:40 p. m.
                          </td>
                          <td className="py-3 px-2.5">
                            <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-300 px-2.5 py-0.5 text-[10px] font-bold text-slate-800">
                              Venta POS
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">
                              Venta POS Factura #00912
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Descuento automático desde caja física POS
                            </div>
                          </td>
                          <td className="py-3 px-2.5">
                            <div className="font-semibold text-slate-800">
                              Luis Cajero
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Turno Tarde · Caja 1
                            </div>
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono font-black text-slate-900 text-sm tabular-nums">
                            -2
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-xs font-bold text-slate-700 tabular-nums">
                            26 ➔ 24
                          </td>
                        </tr>

                        {/* FILA 3: Ajuste por Merma / Faltante (-3 · Autorizado por: Roberto M.) */}
                        <tr
                          className={`transition-colors ${
                            isRow3Highlighted
                              ? 'bg-rose-50/90 ring-2 ring-inset ring-rose-500'
                              : 'bg-amber-50/50'
                          }`}
                        >
                          <td className="py-3 px-3 font-mono text-[11px] font-bold text-rose-900 tabular-nums whitespace-nowrap">
                            12 nov, 4:15 p. m.
                          </td>
                          <td className="py-3 px-2.5">
                            <span className="inline-flex items-center rounded-full bg-rose-100 border border-rose-300 px-2.5 py-0.5 text-[10px] font-black text-rose-800">
                              Ajuste / Merma
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-extrabold text-slate-900">
                              Motivo: Merma / Daño auditado
                            </div>
                            <div className="text-[10px] font-semibold text-rose-700 tabular-nums">
                              Conteo físico: 21 uds · Impacto: -C$ 285.00
                            </div>
                          </td>
                          <td className="py-3 px-2.5">
                            <div className="font-bold text-slate-900">
                              Luis Cajero (Turno Tarde)
                            </div>
                            <div className="inline-flex items-center gap-1 text-[10px] font-bold text-[#003757]">
                              <Lock className="w-3 h-3 text-[#003757]" />
                              <span>Autorizado por: Roberto M.</span>
                            </div>
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono font-black text-rose-700 text-sm tabular-nums">
                            -3
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-xs font-black text-rose-800 tabular-nums">
                            24 ➔ 21
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Modal / Tarjeta de Detalle del Ajuste Auditado (Escena 3: f515..f632) */}
                    {showAdjustmentAuditModal && (
                      <div
                        className="mx-3 my-auto rounded-xl border-2 border-[#003757] bg-slate-900 text-white p-3.5 shadow-xl flex items-center justify-between gap-4"
                        style={{
                          opacity: interpolate(modalSpring, [0, 1], [0, 1]),
                          transform: `scale(${interpolate(modalSpring, [0, 1], [0.95, 1])})`,
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#00BF81]/20 border border-[#00BF81] flex items-center justify-center shrink-0 mt-0.5">
                            <Lock className="w-4 h-4 text-[#00BF81]" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black uppercase tracking-wider text-[#00BF81]">
                                Ajuste de Inventario Auditado
                              </span>
                              <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/90">
                                12 nov, 4:15 p. m.
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-white mt-1">
                              Motivo obligatorio: <span className="text-[#00BF81]">Merma / Daño auditado</span> · Operador: <strong>Luis Cajero (Turno Tarde)</strong>
                            </p>
                            <p className="text-[11px] text-slate-300 mt-0.5">
                              Autorizado por: <strong>Roberto M. (Propietario)</strong> · Registro permanente en Kardex
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 border-l border-white/15 pl-4">
                          <div className="text-[10px] uppercase font-bold text-slate-400">
                            Diferencia Registrada
                          </div>
                          <div className="text-base font-black text-rose-400 tabular-nums">
                            -3 uds (-C$ 285.00)
                          </div>
                          <div className="text-[10px] font-mono text-emerald-300 tabular-nums">
                            Stock final: 21 uds
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </main>
          </div>

          {/* Cursor Web Calibrado */}
          <WebCursor waypoints={waypoints} />
        </div>
      </div>

      {/* ===================================================================
          BOTTOM SAFE ZONE (h-[320px] pt-5 => bottom >= 280px free)
         =================================================================== */}
      <div className="w-full h-[320px] flex flex-col items-center justify-start pt-5 z-30 text-center">
        <div className="space-y-1.5">
          <div
            className="text-5xl font-black text-white tracking-[1.5px] drop-shadow-lg"
            style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
          >
            {kineticLine1}
          </div>
          <div className="text-3xl font-extrabold text-[#00BF81] tracking-wide">
            {kineticLine2}
          </div>
        </div>
      </div>
    </div>
  );
};
