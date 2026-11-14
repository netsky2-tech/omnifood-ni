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
  Ban,
  Check,
  CheckCircle2,
  ChevronRight,
  FileX,
  History,
  Lock,
  RotateCcw,
  Search,
  ShieldCheck,
  Store,
  User,
  Wifi,
} from 'lucide-react';

/**
 * Escenas 1, 2 y 3 continuas en la terminal MIRAY Q80 (f0..f390 - 13.0s @ 30fps)
 * - Escena 1 (f0..f45): Macro-Zoom (scale: 1.55) enfocado en la Factura #00418 (C$ 1,250.00)
 *   y el dedo pulsando el botón destructivo rojo "ANULAR FACTURA", apareciendo de golpe
 *   el bloqueo de motivo DGI + autorización de supervisor por PIN.
 * - Escena 2 (f45..f150): Corte de Atención (zoom-out suave 1.55 -> 1.18) revelando el modal
 *   completo con radio buttons oficiales de `kVoidReasonLabels` (`sales_history_view.dart`)
 *   y la sección `Autorización de supervisor` (`supervisor_override_modal.dart` + `pin_pad.dart`).
 * - Escena 3 (f150..f390): Selección de "Error de captura", digitación de los 4 puntos del PIN
 *   (`••••`) en el `PinPad`, confirmación en "AUTORIZAR Y ANULAR", y vista de `Historial de Ventas`
 *   mostrando la factura `001-001-01-00000418` como `ANULADA` con su correlativo intacto entre
 *   `001-001-01-00000417` y `001-001-01-00000419`.
 */
const TAP_FRAMES = [8, 222, 248, 262, 276, 290, 315];

const tapAgeAt = (frame: number): number => {
  let age = -1;
  for (const tap of TAP_FRAMES) {
    if (frame >= tap && frame < tap + 10) {
      age = frame - tap;
    }
  }
  return age;
};

export const VoidAuditPosScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // =========================================================================
  // 1. Macro-Zoom en Frame 0 (scale: 1.55) -> Corte de Atención en f45 (1.18)
  // =========================================================================
  const zoomOutSpring =
    frame >= 45
      ? spring({
          frame: frame - 45,
          fps,
          config: { damping: 18, stiffness: 115, mass: 0.85 },
        })
      : 0;

  const terminalScale =
    frame < 45 ? 1.55 : interpolate(zoomOutSpring, [0, 1], [1.55, 1.18]);

  // En Macro-Zoom (f0..f44) desplazamos ligeramente hacia arriba para centrar
  // el botón rojo ANULAR FACTURA #00418 (C$ 1,250.00) y el candado de PIN,
  // evitando que el bisel superior colisione con el título del Top Safe Zone.
  const terminalTranslateY =
    frame < 45 ? -135 : interpolate(zoomOutSpring, [0, 1], [-135, 0]);

  // =========================================================================
  // 2. Estados de la UI de `apps/pos_app`
  // =========================================================================
  const isVoidBtnPressed = frame >= 6 && frame <= 16;
  const isLockFlashVisible = frame >= 12 && frame < 45;
  // En f0..f44 se ve en Macro-Zoom el botón rojo ANULAR FACTURA + candado de bloqueo;
  // en f45 (Corte de Atención 1.5s) se abre el modal completo de Motivo DGI + PIN.
  const isModalOpen = frame >= 45 && frame < 330;
  const isHistoryView = frame >= 330;

  const modalSpring = spring({
    frame: Math.max(0, frame - 45),
    fps,
    config: { damping: 17, mass: 0.85 },
  });

  // Selección del radio button obligatorio: "Error de captura" (kVoidReasonLabels)
  const isReasonSelected = frame >= 222;

  // Digitación de los 4 dígitos del PIN del supervisor (Roberto Morales)
  const pinDigitsCount =
    frame < 248
      ? 0
      : frame < 262
      ? 1
      : frame < 276
      ? 2
      : frame < 290
      ? 3
      : 4;

  const activePinKey: string | null =
    frame >= 246 && frame < 254
      ? '4'
      : frame >= 260 && frame < 268
      ? '8'
      : frame >= 274 && frame < 282
      ? '2'
      : frame >= 288 && frame < 296
      ? '9'
      : null;

  const isAuthorizeBtnTapped = frame >= 312 && frame <= 324;

  // =========================================================================
  // 3. Trayectoria del Puntero Táctil (con pausa de asentamiento >= 4 frames)
  //    Pantalla táctil interna: 508 x 828 px
  //    - Botón rojo ANULAR FACTURA (#00418): x=254, y=774
  //    - Radio "Error de captura": x=135, y=276
  //    - PinPad teclas: '4' (x=98, y=506), '8' (x=254, y=544), '2' (x=254, y=468), '9' (x=410, y=544)
  //    - Botón "AUTORIZAR Y ANULAR": x=315, y=640
  // =========================================================================
  const touchX = interpolate(
    frame,
    [
      0, 4, 8, 16, 44, 58, 210, 217, 222, 240, 244, 248, 257, 262, 271, 276,
      285, 290, 306, 315, 324, 360, 510,
    ],
    [
      254, 254, 254, 254, 254, 254, 135, 135, 135, 98, 98, 98, 254, 254, 254,
      254, 410, 410, 315, 315, 315, 254, 254,
    ],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const touchY = interpolate(
    frame,
    [
      0, 4, 8, 16, 44, 58, 210, 217, 222, 240, 244, 248, 257, 262, 271, 276,
      285, 290, 306, 315, 324, 360, 510,
    ],
    [
      774, 774, 774, 774, 774, 425, 276, 276, 276, 506, 506, 506, 544, 544, 468,
      468, 544, 544, 640, 640, 640, 425, 425,
    ],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const tapAge = tapAgeAt(frame);
  const tapScale = tapAge >= 0 ? interpolate(tapAge, [0, 9], [0.8, 2.25]) : 1;
  const tapOpacity = tapAge >= 0 ? interpolate(tapAge, [0, 9], [0.65, 0]) : 0;

  // =========================================================================
  // 4. Datos Reales del POS (Ferretería & Comercial Las Colinas)
  // =========================================================================
  const reasons = [
    'Error de captura',
    'Cliente desiste',
    'Ticket duplicado',
    'Otro',
  ];

  const invoiceRows = [
    {
      number: '001-001-01-00000417',
      time: '10:18',
      items: '2 Taladro Percutor 1/2" · 1 Juego Brocas Acero',
      payment: 'Efectivo',
      total: 'C$ 1,840.00',
      canceled: false,
    },
    {
      number: '001-001-01-00000418',
      time: '10:24',
      items: '1 Esmeriladora Angular 4-1/2" · 2 Disco Corte Metal',
      payment: 'Efectivo',
      total: 'C$ 1,250.00',
      canceled: true,
    },
    {
      number: '001-001-01-00000419',
      time: '10:31',
      items: '1 Caja Herramientas Acero 19" · 1 Cinta Métrica 5m',
      payment: 'Tarjeta',
      total: 'C$ 1,150.00',
      canceled: false,
    },
  ];

  const mainHeaderTitle =
    frame < 45
      ? 'Bloqueo de Anulación en Caja'
      : frame < 215
      ? 'Autorización de Supervisor Requerida'
      : 'Secuencia Fiscal DGI Inalterable';

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans select-none">
      {/* Iluminación institucional de fondo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[820px] h-[820px] bg-[#003757]/80 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-10 w-[560px] h-[560px] bg-rose-500/12 rounded-full blur-[170px] pointer-events-none" />

      {/* ===================================================================
          TOP SAFE ZONE (pt-[104px] + p-8 => 136px >= 130px)
          Overlay ligero con los 4 elementos de marca sobre la acción viva
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
            Control DGI & PIN
          </span>
        </div>

        <h2
          className="text-4xl font-extrabold text-white tracking-wide drop-shadow-md"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          {mainHeaderTitle}
        </h2>
      </div>

      {/* ===================================================================
          CENTER STAGE: Terminal MIRAY Q80 (Macro-Zoom 1.55 en f0 -> 1.18 en f45)
         =================================================================== */}
      <div className="w-full flex-1 flex items-center justify-center z-20 overflow-hidden rounded-3xl my-2">
        <div
          className="relative rounded-[48px] bg-slate-900 p-4 shadow-[0_25px_80px_rgba(0,0,0,0.68)] border-4 border-slate-700/80 overflow-hidden origin-center"
          style={{
            width: '540px',
            height: '860px',
            transform: `translateY(${terminalTranslateY}px) scale(${terminalScale})`,
          }}
        >
          {/* Ranura Impresora Térmica 58mm */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-48 h-3.5 bg-slate-800 rounded-full flex items-center justify-center z-30 border border-slate-700">
            <div className="w-32 h-1 bg-black/70 rounded-full" />
          </div>

          {/* Pantalla Táctil del POS (apps/pos_app/lib/ui/features/sales/sales_history_view.dart) */}
          <div className="w-full h-full bg-[#F8FAFC] rounded-[32px] overflow-hidden flex flex-col pt-3 text-slate-800 relative">
            {/* 1. Barra Superior de Estado */}
            <div className="h-10 bg-[#003757] text-white px-3.5 flex items-center justify-between text-[11px] font-medium shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Store className="w-3.5 h-3.5 text-[#00BF81] shrink-0" />
                <span className="font-bold tracking-wide truncate">
                  Ferretería Las Colinas
                </span>
                <span className="text-white/40">|</span>
                <span className="text-white/85 flex items-center gap-1 shrink-0">
                  <User className="w-3 h-3" /> Luis Operador
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="bg-[#00BF81]/25 text-[#00BF81] border border-[#00BF81]/40 px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1">
                  <Wifi className="w-3 h-3" /> En Línea
                </span>
                <span
                  className="text-white/80 font-mono text-[10px]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  10:24 AM
                </span>
              </div>
            </div>

            {!isHistoryView ? (
              /* =============================================================
                 VISTA 1 (f0..f253): InvoiceDetailScreen real (#00418)
                 ============================================================= */
              <>
                <div className="h-12 bg-white border-b border-slate-200 px-3.5 flex items-center justify-between shrink-0 shadow-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-slate-600">
                      <ArrowLeft className="w-4 h-4" />
                    </div>
                    <span className="text-slate-900 font-extrabold text-sm">
                      Factura 001-001-01-00000418
                    </span>
                  </div>
                  <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    Efectivo · Pagada
                  </span>
                </div>

                <div className="flex-1 overflow-hidden p-4 flex flex-col justify-between">
                  <div>
                    {/* Cabecera destacada para lectura instantánea en Frame 0 (0.2s) */}
                    <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/70 p-3.5 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                          Comprobante Fiscal DGI · Turno Activo
                        </div>
                        <div className="text-lg font-black text-slate-900 mt-0.5 font-mono">
                          Factura #00418
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          Fecha: 10/11/2026 10:24 · Caja: Caja 1 · Usuario: Luis Operador
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase text-rose-700">
                          Cobrado en Efectivo
                        </div>
                        <div
                          className="text-2xl font-black text-rose-600 tabular-nums"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          C$ 1,250.00
                        </div>
                      </div>
                    </div>

                    {/* Líneas de detalle (InvoiceDetailsPanel real) */}
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Artículos Facturados
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-800 border-b border-slate-100 pb-1.5">
                        <div>
                          <div className="font-bold">
                            Esmeriladora Angular 4-1/2&quot; 850W
                          </div>
                          <div className="text-[10px] text-slate-500">
                            1 x C$ 1,050.00
                          </div>
                        </div>
                        <span className="font-bold tabular-nums">C$ 1,050.00</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-800">
                        <div>
                          <div className="font-bold">
                            Disco de Corte p/Metal 4-1/2&quot;
                          </div>
                          <div className="text-[10px] text-slate-500">
                            2 x C$ 100.00
                          </div>
                        </div>
                        <span className="font-bold tabular-nums">C$ 200.00</span>
                      </div>
                    </div>

                    {/* Resumen Fiscal (buildInvoiceDetailSummary real) */}
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 space-y-1 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal:</span>
                        <span className="tabular-nums">C$ 1,086.96</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>IVA:</span>
                        <span className="tabular-nums">C$ 163.04</span>
                      </div>
                      <div className="pt-1 border-t border-slate-200 flex justify-between font-black text-base text-slate-900">
                        <span>TOTAL:</span>
                        <span className="tabular-nums text-[#003757]">
                          C$ 1,250.00
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botones de Acción Reales de `sales_history_view.dart` */}
                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      className="w-full h-10 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>REIMPRIMIR</span>
                    </button>

                    <button
                      type="button"
                      className="w-full h-10 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>EMITIR NOTA DE CRÉDITO</span>
                    </button>

                    {/* BOTÓN DESTRUCTIVO PROTAGONISTA EN MACRO FRAME 0 */}
                    <button
                      type="button"
                      className={`w-full h-14 rounded-xl border-2 text-sm font-black flex items-center justify-center gap-2.5 transition-all shadow-lg ${
                        isVoidBtnPressed
                          ? 'border-rose-700 bg-rose-600 text-white scale-[0.97] ring-4 ring-rose-500/40'
                          : 'border-rose-500 bg-rose-600 text-white'
                      }`}
                    >
                      <Ban className="w-5 h-5 stroke-[2.5]" />
                      <span>ANULAR FACTURA #00418 · C$ 1,250.00</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* =============================================================
                 VISTA 2 (f254..f390): SalesHistoryView real con correlativo intacto
                 ============================================================= */
              <>
                {/* AppBar de Historial de Ventas */}
                <div className="h-12 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                    <History className="w-4 h-4 text-[#003757]" />
                    <span>Historial de Ventas</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                    <Search className="w-4 h-4" />
                  </div>
                </div>

                {/* Header operativo real (`_buildHistoryHeader` de sales_history_view.dart) */}
                <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 shrink-0">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                    <span>Filtro: 10/11/2026</span>
                    <span className="text-[#003757] font-bold">Hoy</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-bold text-slate-900">Facturas: 3</span>
                    <span className="text-slate-700 tabular-nums">
                      Subtotal: C$ 2,600.00
                    </span>
                    <span className="text-slate-700 tabular-nums">
                      IVA: C$ 390.00
                    </span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      Total: C$ 2,990.00
                    </span>
                    <span className="text-rose-600 font-extrabold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                      Anuladas: 1 (excluidas del dinero)
                    </span>
                  </div>
                </div>

                {/* Banner DGI de secuencia correlativa intacta */}
                <div className="mx-3 mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span className="text-[11px] font-bold text-emerald-950">
                      Secuencia correlativa DGI intacta: #00417 ➔ #00418 ➔ #00419
                    </span>
                  </div>
                  <span className="text-[9px] font-black uppercase bg-emerald-700 text-white px-2 py-0.5 rounded">
                    0 SALTOS
                  </span>
                </div>

                {/* Lista real de facturas (`_buildInvoiceListView`) */}
                <div className="flex-1 overflow-hidden divide-y divide-slate-200 mt-2">
                  {invoiceRows.map((row) => (
                    <div
                      key={row.number}
                      className={`px-4 py-3.5 flex items-center justify-between ${
                        row.canceled
                          ? 'bg-rose-50/90 border-l-4 border-l-rose-600'
                          : 'bg-white'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900 font-mono">
                            {row.number}
                          </span>
                          {row.canceled && (
                            <span className="shrink-0 rounded border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">
                              ANULADA
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600">
                          <span>{row.time} · Luis Operador</span>
                          <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                            {row.payment}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 truncate">
                          {row.items}
                        </div>
                        {row.canceled && (
                          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-white border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            <Lock className="w-3 h-3 text-rose-600" />
                            <span>
                              Motivo: Error de captura · PIN Supervisor: Roberto Morales
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`text-sm font-black tabular-nums ${
                            row.canceled ? 'text-rose-600' : 'text-[#003757]'
                          }`}
                        >
                          {row.total}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* SnackBar oficial de `sales_history_view.dart` */}
                <div className="absolute bottom-4 left-3 right-3 bg-slate-900 text-white p-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs z-30 border border-[#00BF81]/40">
                  <CheckCircle2 className="w-4 h-4 text-[#00BF81] shrink-0" />
                  <span className="font-semibold">
                    Factura anulada. Se imprimió el comprobante ANULADO.
                  </span>
                </div>
              </>
            )}

            {/* ===============================================================
                CANDADO DE BLOQUEO INSTANTÁNEO EN MACRO FRAME 0 (f12..f44)
               =============================================================== */}
            {isLockFlashVisible && (
              <div className="absolute inset-x-4 bottom-24 z-50 rounded-2xl border-2 border-amber-400 bg-[#00253B]/95 p-3.5 text-white shadow-[0_15px_40px_rgba(0,0,0,0.75)] flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md">
                  <Lock className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black uppercase tracking-wider text-amber-300">
                    Autorización de Supervisor Requerida
                  </div>
                  <div className="text-[11px] font-semibold text-white mt-0.5">
                    Bloqueado: exige Motivo DGI + PIN de 4 dígitos
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                MODAL REAL: `_showVoidDialog` + `SupervisorOverrideModal` + `PinPad`
                (f16..f253)
               =============================================================== */}
            {isModalOpen && (
              <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px] flex items-center justify-center p-3 z-40">
                <div
                  className="w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
                  style={{
                    transform: `scale(${interpolate(modalSpring, [0, 1], [0.92, 1])})`,
                  }}
                >
                  {/* Header del Diálogo (`Anular Factura` + `Autorización de supervisor`) */}
                  <div className="bg-[#003757] text-white px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileX className="w-4 h-4 text-amber-400" />
                      <div>
                        <div className="text-xs font-extrabold uppercase tracking-wide">
                          Anular Factura · Autorización de Supervisor
                        </div>
                        <div className="text-[10px] text-white/75">
                          Seleccione el motivo de la anulación de 001-001-01-00000418:
                        </div>
                      </div>
                    </div>
                    <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white tabular-nums">
                      C$ 1,250.00
                    </span>
                  </div>

                  <div className="p-3 space-y-2.5">
                    {/* 1. Radios Oficiales de `VoidReasonCodes.all` (`kVoidReasonLabels`) */}
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      {reasons.map((reason, idx) => {
                        const selected = idx === 0 && isReasonSelected;
                        return (
                          <div
                            key={reason}
                            className={`p-2 rounded-xl border-2 flex items-center gap-2 transition-all ${
                              selected
                                ? 'border-[#00BF81] bg-emerald-50/80 text-emerald-950 font-bold'
                                : 'border-slate-200 bg-white text-slate-700'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                selected
                                  ? 'border-[#00BF81] bg-[#00BF81] text-white'
                                  : 'border-slate-400'
                              }`}
                            >
                              {selected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                            <span className="truncate">{reason}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* 2. Bloque `SupervisorOverrideModal` (`supervisor_override_modal.dart`) */}
                    <div className="rounded-xl border-2 border-amber-300 bg-amber-50/70 p-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-amber-950">
                          <Lock className="w-3.5 h-3.5 text-amber-700" />
                          <span>Autorización de supervisor (Método: PIN)</span>
                        </div>
                        <span className="text-[10px] font-bold text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded">
                          Roberto Morales · Gerente
                        </span>
                      </div>

                      {/* Campo `Su PIN` (`obscureText: true`) */}
                      <div className="mt-2 h-10 rounded-lg border-2 border-[#003757] bg-white px-3 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Su PIN (4 dígitos)
                        </span>
                        <div className="flex items-center gap-2">
                          {[0, 1, 2, 3].map((dotIdx) => {
                            const filled = dotIdx < pinDigitsCount;
                            return (
                              <span
                                key={dotIdx}
                                className={`w-3 h-3 rounded-full transition-all ${
                                  filled
                                    ? 'bg-[#003757] scale-110'
                                    : 'bg-slate-200 border border-slate-300'
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* 3. Teclado Numérico Limpio `PinPad` (`apps/pos_app/lib/ui/widgets/pin_pad.dart`) */}
                    <div className="bg-slate-100 p-2 rounded-xl border border-slate-200">
                      <div className="grid grid-cols-3 gap-1.5">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(
                          (key) => {
                            const isSpecial = key === 'C' || key === '⌫';
                            const isActive = activePinKey === key;
                            return (
                              <div
                                key={key}
                                className={`h-8 rounded-lg font-mono font-bold text-xs flex items-center justify-center border transition-transform ${
                                  isActive
                                    ? 'bg-[#00BF81] text-[#003757] border-[#009665] scale-95 font-black'
                                    : isSpecial
                                    ? 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]'
                                    : 'bg-white text-[#0F172A] border-[#E2E8F0]'
                                }`}
                                style={{ fontVariantNumeric: 'tabular-nums' }}
                              >
                                {key}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>

                    {/* 4. Acciones del Modal (`Cancelar` / `Autorizar` + `ANULAR`) */}
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <span className="px-3 py-2 text-xs font-bold text-slate-500 uppercase">
                        CANCELAR
                      </span>
                      <button
                        type="button"
                        className={`flex-1 h-10 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md ${
                          isReasonSelected && pinDigitsCount === 4
                            ? isAuthorizeBtnTapped
                              ? 'bg-rose-800 text-white scale-[0.97]'
                              : 'bg-rose-600 text-white'
                            : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>AUTORIZAR Y ANULAR</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                PUNTERO TÁCTIL CON ONDA EXPANSIVA DETERMINISTA
               =============================================================== */}
            <div
              className="absolute pointer-events-none z-50"
              style={{
                left: `${touchX}px`,
                top: `${touchY}px`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="w-10 h-10 rounded-full bg-white/80 border-2 border-[#00BF81] shadow-2xl flex items-center justify-center">
                <div className="w-3.5 h-3.5 rounded-full bg-[#00BF81]" />
              </div>
              {tapAge >= 0 && (
                <span
                  className="absolute -inset-2 rounded-full bg-[#00BF81]/50 pointer-events-none"
                  style={{
                    transform: `scale(${tapScale})`,
                    opacity: tapOpacity,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================
          BOTTOM SAFE ZONE (h-[320px] pt-5 => bottom >= 280px free)
          Subtítulos Cinéticos de Escenas 1, 2 y 3
         =================================================================== */}
      <div className="w-full h-[320px] flex flex-col items-center justify-start pt-5 z-30 text-center">
        {frame < 45 ? (
          <div className="space-y-1.5">
            <div
              className="text-5xl font-black text-white tracking-[1.5px] drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              ¿Facturas borradas?
            </div>
            <div className="text-3xl font-extrabold text-[#00BF81] tracking-wide">
              Bloqueo inmediato en caja.
            </div>
          </div>
        ) : frame < 215 ? (
          <div className="space-y-1.5">
            <div
              className="text-5xl font-black text-white tracking-[1.5px] drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Cero anulaciones libres.
            </div>
            <div className="text-3xl font-extrabold text-[#00BF81] tracking-wide">
              Exige PIN de supervisor y motivo.
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div
              className="text-5xl font-black text-white tracking-[1.5px] drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Folio #00418 intacto.
            </div>
            <div className="text-3xl font-extrabold text-[#00BF81] tracking-wide">
              Trazabilidad fiscal DGI al 100%.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
