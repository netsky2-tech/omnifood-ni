import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Wifi,
  User,
  History,
  Search,
  ArrowLeft,
  FileX,
  RotateCcw,
  Ban,
  ChevronRight,
} from 'lucide-react';

const TAP_FRAMES = [26, 60, 110, 180, 232];

const tapAgeAt = (frame: number): number => {
  let age = -1;
  for (const tap of TAP_FRAMES) {
    if (frame >= tap && frame < tap + 10) {
      age = frame - tap;
    }
  }
  return age;
};

export const FiscalVoidScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrada de la terminal MIRAY Q80
  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 16, mass: 0.9 },
  });

  // Flujo real de la app: historial → detalle de factura → diálogo → ANULAR → lista actualizada
  const isDetailOpen = frame >= 35 && frame < 238;
  const isModalOpen = frame >= 70 && frame < 195;
  const isReasonSelected = frame >= 112;
  const isDetailFocused = frame >= 130;
  const isVoidConfirmed = frame >= 195;

  const isRowTapped = frame >= 26 && frame <= 32;
  const isVoidButtonTapped = frame >= 60 && frame <= 68;
  const isReasonTapped = frame >= 110 && frame <= 118;
  const isConfirmTapped = frame >= 180 && frame <= 188;
  const isBackTapped = frame >= 230 && frame <= 238;

  // Tipeo progresivo del detalle opcional (no bloquea la anulación)
  const detailText = 'Monto digitado incorrecto';
  const typedChars = Math.round(
    interpolate(frame, [132, 172], [0, detailText.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );

  // Animación del modal de la app
  const modalSpring = spring({
    frame: Math.max(0, frame - 70),
    fps,
    config: { damping: 18 },
  });

  // Coordenadas locales del puntero táctil (pantalla terminal: ~508x828 px)
  const touchX = interpolate(
    frame,
    [0, 26, 32, 55, 65, 90, 110, 118, 130, 175, 188, 215, 232, 240, 265, 300],
    [254, 254, 254, 254, 254, 150, 150, 150, 254, 254, 400, 400, 28, 28, 254, 254],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const touchY = interpolate(
    frame,
    [0, 26, 32, 55, 65, 90, 110, 118, 130, 175, 188, 215, 232, 240, 265, 300],
    [500, 285, 285, 512, 512, 317, 317, 317, 497, 497, 559, 559, 64, 64, 332, 332],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Pulso táctil determinista único (sin animate-ping infinito)
  const tapAge = tapAgeAt(frame);
  const tapScale = tapAge >= 0 ? interpolate(tapAge, [0, 9], [0.8, 2.2]) : 1;
  const tapOpacity = tapAge >= 0 ? interpolate(tapAge, [0, 9], [0.55, 0]) : 0;

  // Subtítulos cinéticos
  const sub1Opacity = interpolate(frame, [15, 25, 135, 145], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sub2Opacity = interpolate(frame, [145, 160, 285, 295], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const rows = [
    {
      number: '001-001-01-00000104',
      time: '12:35',
      items: '2 Cappuccino Artesanal · 1 Pastel Tres Leches',
      payment: 'Efectivo',
      total: 'C$ 340.00',
      canceled: false,
    },
    {
      number: '001-001-01-00000105',
      time: '12:42',
      items: '1 Combo Ejecutivo · 2 Cappuccino · 1 Postre',
      payment: 'Efectivo',
      total: 'C$ 850.00',
      canceled: isVoidConfirmed,
    },
    {
      number: '001-001-01-00000106',
      time: '12:48',
      items: '1 Café Americano · 1 Mocha Caliente',
      payment: 'Tarjeta',
      total: 'C$ 195.00',
      canceled: false,
    },
  ];

  const reasons = [
    'Error de captura',
    'Cliente desiste',
    'Ticket duplicado',
    'Otro',
  ];

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans">
      {/* Luz ambiental institucional */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[750px] h-[750px] bg-[#003757]/80 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute -bottom-20 left-10 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[180px] pointer-events-none" />

      {/* Header Superior del Reel (Zona Segura Instagram Reels: top >= 130px) */}
      <div className="w-full pt-[104px] flex flex-col items-center z-10 text-center">
        <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 mb-3 shadow-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span>Protocolo en Terminal POS</span>
        </span>
        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          Anulación Inmutable & Auditada
        </h2>
      </div>

      {/* Mockup Físico de Terminal MIRAY Q80 Centrado en flex-1 */}
      <div className="w-full flex-1 flex items-center justify-center z-20">
        <div
          className="relative rounded-[48px] bg-slate-900 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.6)] border-4 border-slate-700/80 overflow-hidden origin-center"
          style={{
            width: '540px',
            height: '860px',
            transform: `scale(${interpolate(enterSpring, [0, 1], [0.95, 1.25])})`,
          }}
        >
          {/* Ranura Superior Impresora Térmica 58mm */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-48 h-3.5 bg-slate-800 rounded-full flex items-center justify-center z-30 border border-slate-700">
            <div className="w-32 h-1 bg-black/70 rounded-full" />
          </div>

          {/* Pantalla Táctil del POS (Flutter apps/pos_app) */}
          <div className="w-full h-full bg-[#F8FAFC] rounded-[32px] overflow-hidden flex flex-col pt-3 text-slate-800 relative">
            {/* 1. Barra Superior de Estado (SaleView real) */}
            <div className="h-10 bg-[#003757] text-white px-3 flex items-center justify-between text-[11px] font-medium shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-wide">Café San Juan</span>
                <span className="text-white/40">|</span>
                <span className="text-white/80 flex items-center gap-1">
                  <User className="w-3 h-3" /> Carlos Cajero
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-[#00BF81]/25 text-[#00BF81] border border-[#00BF81]/40 px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1">
                  <Wifi className="w-3 h-3" /> En Línea
                </span>
                <span className="text-white/70">12:42 PM</span>
              </div>
            </div>

            {!isDetailOpen ? (
              <>
                {/* 2. AppBar de Historial de Ventas (SalesHistoryView real) */}
                <div className="h-12 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <History className="w-4 h-4 text-[#003757]" />
                    <span>Historial de Ventas</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                    <Search className="w-4 h-4" />
                  </div>
                </div>

                {/* 3. Header operativo real: filtro de fecha + totales */}
                <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 shrink-0">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                    <span>Sin filtro de fecha</span>
                    <span className="text-[#003757] font-bold">Hoy</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    <span className="font-bold text-slate-800">Facturas: 3</span>
                    <span className="text-slate-600">
                      {isVoidConfirmed ? 'Subtotal: C$ 465.22' : 'Subtotal: C$ 1,204.35'}
                    </span>
                    <span className="text-slate-600">
                      {isVoidConfirmed ? 'IVA: C$ 69.78' : 'IVA: C$ 180.65'}
                    </span>
                    <span className="font-bold text-slate-800">
                      {isVoidConfirmed ? 'Total: C$ 535.00' : 'Total: C$ 1,385.00'}
                    </span>
                    <span className="text-rose-700 font-semibold">
                      {isVoidConfirmed ? 'Anuladas: 1 (excluidas del dinero)' : 'Anuladas: 0'}
                    </span>
                  </div>
                </div>

                {/* 4. Lista real de facturas (ListTile) */}
                <div className="flex-1 overflow-hidden divide-y divide-slate-200">
                  {rows.map((row) => {
                    const isTarget = row.number.endsWith('00000105');
                    return (
                      <div
                        key={row.number}
                        className={`px-4 py-3 flex items-center justify-between transition-colors ${
                          isTarget && isRowTapped
                            ? 'bg-[#003757]/10'
                            : row.canceled
                            ? 'bg-rose-50'
                            : 'bg-white'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-bold text-[13px] truncate text-slate-900`}
                            >
                              {row.number}
                            </span>
                            {row.canceled && (
                              <span className="shrink-0 rounded border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800">
                                ANULADA
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span>
                              {row.time} · Carlos Cajero
                            </span>
                            <span className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 text-[9px] font-semibold text-slate-600">
                              {row.payment}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-500 truncate">
                            {row.items}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className={`text-[13px] font-bold tabular-nums ${
                              row.canceled ? 'text-rose-700' : 'text-[#003757]'
                            }`}
                          >
                            {row.total}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {/* 5. AppBar del detalle de factura (InvoiceDetailScreen real) */}
                <div className="h-12 bg-white border-b border-slate-200 px-3 flex items-center gap-2 shrink-0 shadow-xs">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                      isBackTapped ? 'bg-slate-200 text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </div>
                  <span className="text-slate-900 font-bold text-sm">
                    Factura 001-001-01-00000105
                  </span>
                </div>

                <div className="flex-1 overflow-hidden p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-slate-900 truncate">
                        Factura: 001-001-01-00000105
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        Fecha: 27/10/2026 12:42
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Cajero: Carlos Cajero · Caja 1
                      </div>
                    </div>
                    {isVoidConfirmed && (
                      <span className="shrink-0 rounded bg-rose-600 px-2 py-1 text-[9px] font-bold text-white">
                        ANULADA
                      </span>
                    )}
                  </div>

                  <div className="mt-3 border-t border-slate-200 pt-2">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Detalle
                    </div>
                    {[
                      ['1 Combo Ejecutivo', 'C$ 550.00'],
                      ['2 Cappuccino Artesanal', 'C$ 170.00'],
                      ['1 Pastel Tres Leches', 'C$ 90.00'],
                      ['1 Jugo Natural', 'C$ 40.00'],
                    ].map(([name, price]) => (
                      <div
                        key={name}
                        className="mt-1 flex items-center justify-between text-[10px] text-slate-700"
                      >
                        <span>{name}</span>
                        <span className="tabular-nums">{price}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 border-t border-slate-200 pt-2 text-[10px]">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal</span>
                      <span className="tabular-nums">C$ 739.13</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>IVA 15%</span>
                      <span className="tabular-nums">C$ 110.87</span>
                    </div>
                    <div className="mt-1 flex justify-between font-bold text-slate-900">
                      <span>Total</span>
                      <span className="tabular-nums">C$ 850.00</span>
                    </div>
                  </div>

                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[9px] leading-snug text-amber-800">
                    La factura quedará registrada como ANULADA con fecha, hora y motivo. La
                    secuencia numérica no sufre saltos ni eliminación física.
                  </div>

                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      className="w-full h-9 rounded-lg border border-slate-300 bg-white text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      REIMPRIMIR
                    </button>
                    {!isVoidConfirmed && (
                      <>
                        <button
                          type="button"
                          className="w-full h-9 rounded-lg border border-slate-300 bg-white text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          EMITIR NOTA DE CRÉDITO
                        </button>
                        <button
                          type="button"
                          className={`w-full h-10 rounded-lg border-2 text-[10px] font-black flex items-center justify-center gap-1.5 transition-all ${
                            isVoidButtonTapped
                              ? 'border-rose-600 bg-rose-600 text-white scale-[0.98]'
                              : 'border-rose-300 bg-white text-rose-700'
                          }`}
                        >
                          <Ban className="w-3.5 h-3.5" />
                          ANULAR FACTURA
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* 6. SnackBar de confirmación oficial (al confirmar anulación) */}
            {isVoidConfirmed && (
              <div className="absolute bottom-4 left-3 right-3 bg-slate-900 text-white p-3 rounded-xl shadow-2xl flex items-start gap-2 text-[11px] z-30">
                <CheckCircle2 className="w-4 h-4 text-[#00BF81] shrink-0 mt-0.5" />
                <span>
                  Factura anulada. Se imprimió el comprobante ANULADO.
                </span>
              </div>
            )}

            {/* 7. Diálogo Modal Oficial de Anulación (Flutter AlertDialog real) */}
            {isModalOpen && (
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-3 z-40">
                <div
                  className="w-full bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
                  style={{
                    transform: `scale(${interpolate(modalSpring, [0, 1], [0.9, 1])})`,
                  }}
                >
                  {/* Header Flutter Modal */}
                  <div className="p-4 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                      <FileX className="w-5 h-5 text-amber-600" />
                      <span>Anular Factura</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Seleccione el motivo de la anulación de 001-001-01-00000105:
                    </p>
                  </div>

                  {/* Radios reales de VoidReasonCodes */}
                  <div className="p-3 space-y-1.5 text-xs">
                    {reasons.map((reason, index) => {
                      const selected = index === 0 && isReasonSelected;
                      return (
                        <div
                          key={reason}
                          className={`p-2.5 rounded-xl border-2 flex items-center gap-2.5 transition-all ${
                            selected
                              ? 'border-[#00BF81] bg-emerald-50/70 text-emerald-950'
                              : 'border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              selected
                                ? 'border-[#00BF81] bg-[#00BF81] text-white'
                                : 'border-slate-400'
                            }`}
                          >
                            {selected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                          <span className={selected ? 'font-bold' : ''}>{reason}</span>
                        </div>
                      );
                    })}

                    {/* Campo Detalle (opcional) real */}
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-[10px] font-bold text-slate-600 mb-1">
                        Detalle (opcional)
                      </div>
                      <div
                        className={`h-10 rounded-lg border-2 px-3 flex items-center text-[11px] ${
                          isDetailFocused
                            ? 'border-[#00BF81] bg-emerald-50/40'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        {typedChars > 0 ? (
                          <span className="text-slate-800">
                            {detailText.slice(0, typedChars)}
                            <span className="ml-0.5 inline-block w-px h-3.5 bg-[#003757] align-middle" />
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            Describa el motivo si lo considera necesario
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Acciones del Modal (CANCELAR / ANULAR) */}
                  <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">CANCELAR</span>
                    <button
                      type="button"
                      className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-sm ${
                        isReasonSelected
                          ? isConfirmTapped
                            ? 'bg-red-800 text-white scale-95'
                            : 'bg-red-600 text-white shadow-md'
                          : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      ANULAR
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Puntero Táctil (Toque de dedo en la pantalla) */}
            <div
              className="absolute pointer-events-none z-50"
              style={{
                left: `${touchX}px`,
                top: `${touchY}px`,
                transform: 'translate(-50%, -50%)',
                opacity: frame < 18 ? 0 : 1,
              }}
            >
              <div className="w-10 h-10 rounded-full bg-white/70 border-2 border-[#00BF81] shadow-xl flex items-center justify-center">
                <div className="w-3.5 h-3.5 rounded-full bg-[#00BF81]" />
              </div>

              {/* Onda expansiva de toque táctil: un solo pulso determinista */}
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

      {/* Subtítulos Cinéticos (borde inferior >= 288px) */}
      <div className="w-full h-[340px] flex flex-col items-center justify-start pt-4 z-30 text-center">
        {frame < 145 ? (
          <div
            className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub1Opacity,
            }}
          >
            Facturas inmutables
          </div>
        ) : (
          <div
            className="text-5xl font-black text-[#00BF81] tracking-[2px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)]"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub2Opacity,
            }}
          >
            Anulación con motivo formal
          </div>
        )}
      </div>
    </div>
  );
};
