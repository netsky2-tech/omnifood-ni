import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  Banknote,
  CheckCircle2,
  Printer,
  DollarSign,
  ShieldCheck,
  Check,
  ArrowRight,
} from 'lucide-react';

export const HoldOrdersCheckoutScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // =========================================================================
  // Concentric 2-Phase Scene (Local duration = 245 frames, Global f590..f835)
  // - Phase A (f0..f105): Multi-Currency Checkout Modal for Order #12
  // - Phase B (f95..f245): 58mm Thermal Receipt Printer Unrolling
  // =========================================================================
  const modalEnter = spring({
    frame,
    fps,
    config: { damping: 16, mass: 0.9 },
  });

  const phaseAOpacity = interpolate(frame, [92, 108], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const phaseBOpacity = interpolate(frame, [95, 112], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Cash chip C$ 200 selected at f22
  const isCashChipPressed = frame >= 22 && frame <= 30;
  const isCashSelected = frame >= 22;
  // Confirm button tapped at f75..f83 (after dwell f68..f75)
  const isConfirmTapped = frame >= 75 && frame <= 83;

  const changeSpring = spring({
    frame: Math.max(0, frame - 24),
    fps,
    config: { damping: 14 },
  });

  // Thermal ticket unrolling animation in Phase B (starts at f95)
  const ticketProgress = spring({
    frame: Math.max(0, frame - 98),
    fps,
    config: { damping: 16, mass: 0.9 },
  });
  const ticketHeight = interpolate(ticketProgress, [0, 1], [80, 650]);

  // Finger cursor trajectory in Phase A (with >= 4f dwell before tap)
  const touchX = interpolate(
    frame,
    [0, 15, 22, 32, 68, 75, 88],
    [540, 495, 495, 495, 540, 540, 540],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const touchY = interpolate(
    frame,
    [0, 15, 22, 32, 68, 75, 88],
    [760, 830, 830, 830, 1255, 1255, 1255],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const isTouched = isCashChipPressed || isConfirmTapped;

  const tapLocalFrame = isCashChipPressed
    ? frame - 22
    : isConfirmTapped
    ? frame - 75
    : -1;

  const rippleScale =
    tapLocalFrame >= 0
      ? interpolate(tapLocalFrame, [0, 8], [0.9, 1.9], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;

  const rippleOpacity =
    tapLocalFrame >= 0
      ? interpolate(tapLocalFrame, [0, 8], [0.75, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 0;

  // Kinetic Subtitles (Bottom Safe Zone >= 280px)
  const line1Opacity = interpolate(frame, [5, 18, 228, 242], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const line2Opacity = interpolate(frame, [45, 60, 228, 242], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans">
      {/* Ambient institutional glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[880px] h-[880px] bg-[#00BF81]/15 rounded-full blur-[180px] pointer-events-none" />

      {/* ===================================================================
          TOP SAFE ZONE (pt-[104px] + p-8 => 136px >= 130px)
         =================================================================== */}
      <div className="w-full pt-[104px] flex flex-col items-center z-10 text-center">
        <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 flex items-center gap-2 mb-3 shadow-sm">
          <Printer className="w-4 h-4 text-[#00BF81]" />
          <span>
            {frame < 100
              ? 'Cobro Multimoneda · Orden #12'
              : 'Impresión Térmica 58mm · Sin Pausas'}
          </span>
        </span>
        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          {frame < 100
            ? 'Vuelto Exacto & Cierre Ágil'
            : 'Papel Idéntico a Pantalla'}
        </h2>
      </div>

      {/* ===================================================================
          CENTER STAGE (Concentric 2-Phase Container: Rule 7.C)
         =================================================================== */}
      <div className="w-full flex-1 relative flex items-center justify-center z-20">
        {/* -----------------------------------------------------------------
            PHASE A (f0..f108): Multi-Currency Checkout Modal for Order #12
           ----------------------------------------------------------------- */}
        {frame < 110 && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ opacity: phaseAOpacity }}
          >
            <div
              className="w-[620px] bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.65)] border border-slate-200 overflow-hidden origin-center"
              style={{
                transform: `scale(${interpolate(
                  modalEnter,
                  [0, 1],
                  [0.94, 1.18]
                )})`,
              }}
            >
              {/* Modal Top Bar */}
              <div className="bg-[#003757] text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Banknote className="w-5 h-5 text-[#00BF81]" />
                  <div>
                    <h3 className="text-base font-extrabold tracking-wide">
                      Cobro y Facturación · Orden #12
                    </h3>
                    <p className="text-[11px] text-white/75">
                      Recuperada de Espera · Barra / Mostrador
                    </p>
                  </div>
                </div>
                <span
                  className="text-xs bg-white/10 px-3 py-1 rounded-md text-[#2FE0A4] font-bold flex items-center gap-1"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  <DollarSign className="w-3.5 h-3.5" /> T.C. BCN: 36.6243
                </span>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                {/* Order #12 Summary with Intact Variant */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      Total a Cobrar (Orden #12)
                    </span>
                    <span className="text-xs font-bold text-emerald-800 flex items-center gap-1 mt-0.5">
                      <Check className="w-3.5 h-3.5 text-[#00BF81] stroke-[3]" />
                      1x Capuccino Artesanal + Leche de Almendras
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className="text-3xl font-black text-[#003757]"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      C$ 105.00
                    </span>
                    <span
                      className="text-xs text-slate-500 block font-semibold"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      Equivalente Comercial: $ 2.87 USD
                    </span>
                  </div>
                </div>

                {/* Quick Cash Denominations (Rule 5.B: Canonical +1 Exact Amount Chip) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-700">
                      Efectivo Recibido del Cliente:
                    </label>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      Billetes rápidos C$ / USD
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2.5">
                    <div className="h-11 rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-700">
                      <span
                        className="text-xs font-black"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        C$ 105
                      </span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">
                        Exacto
                      </span>
                    </div>
                    <div
                      className={`h-11 rounded-xl border-2 flex items-center justify-center text-xs font-black shadow-sm ${
                        isCashSelected
                          ? 'border-[#00BF81] bg-[#00BF81] text-[#003757]'
                          : 'border-slate-300 bg-white text-slate-800'
                      }`}
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        transform: isCashChipPressed ? 'scale(0.97)' : 'scale(1)',
                      }}
                    >
                      C$ 200
                    </div>
                    <div
                      className="h-11 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-xs font-bold text-slate-600"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      C$ 500
                    </div>
                    <div
                      className="h-11 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-xs font-bold text-slate-600"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      $ 10 USD
                    </div>
                  </div>
                </div>

                {/* Tendered Amount Box */}
                <div className="bg-slate-100 rounded-xl px-4 py-2.5 border border-slate-300 flex items-center justify-between">
                  <span className="text-xs text-slate-600 font-bold">
                    Monto Recibido en Efectivo:
                  </span>
                  <span
                    className="text-xl font-black text-slate-900"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {isCashSelected ? 'C$ 200.00' : 'C$ 0.00'}
                  </span>
                </div>

                {/* Change to Return Panel (Tabular Figures) */}
                <div
                  className={`rounded-2xl p-4 border-2 shadow-md ${
                    isCashSelected
                      ? 'bg-[#ECFDF5] border-[#10B981]'
                      : 'bg-slate-50 border-slate-200 opacity-50'
                  }`}
                  style={{
                    transform: `scale(${interpolate(
                      changeSpring,
                      [0, 1],
                      [0.96, 1]
                    )})`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-black text-emerald-900 tracking-wide uppercase flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                        Vuelto a Entregar
                      </span>
                      <span className="text-[11px] text-emerald-700 font-semibold">
                        Cálculo multimoneda instantáneo
                      </span>
                    </div>
                    <span
                      className="text-3xl font-black text-[#059669]"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {isCashSelected ? 'C$ 95.00' : 'C$ 0.00'}
                    </span>
                  </div>

                  <div className="mt-2 pt-2 border-t border-emerald-200/80 flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-600">
                      Equivalente en Dólares:
                    </span>
                    <span
                      className="text-sm font-black text-[#003757] bg-white px-2.5 py-0.5 rounded border border-emerald-200"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {isCashSelected ? '$ 2.59 USD' : '$ 0.00 USD'}
                    </span>
                  </div>
                </div>

                {/* Confirm & Print Button */}
                <button
                  className={`w-full h-14 rounded-2xl font-black text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg ${
                    isConfirmTapped
                      ? 'bg-[#009665] text-white'
                      : 'bg-[#00BF81] text-[#003757]'
                  }`}
                  style={{
                    transform: isConfirmTapped ? 'scale(0.98)' : 'scale(1)',
                  }}
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span>Confirmar Cobro e Imprimir</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -----------------------------------------------------------------
            PHASE B (f95..f245): 58mm Thermal Receipt Printer Unrolling
            Rule 7.F: Receipt matches screen item by item & cent by cent
           ----------------------------------------------------------------- */}
        {frame >= 95 && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ opacity: phaseBOpacity }}
          >
            {/* Context Pill above Printer Slot */}
            <div className="mb-3 bg-[#003757] border border-white/15 px-4 py-1.5 rounded-full text-xs text-white/90 font-medium flex items-center gap-2 shadow-md">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00BF81]" />
              <span>
                Café San Juan · Orden #12 Recuperada · Variantes Impresas
              </span>
            </div>

            {/* MIRAY Q80 58mm Thermal Printer Slot */}
            <div className="w-[540px] h-10 bg-slate-900 rounded-t-2xl border-t-2 border-x-2 border-slate-700 flex items-center justify-center shadow-2xl relative z-20">
              <div className="w-[460px] h-2.5 bg-black rounded-full" />
            </div>

            {/* 58mm Thermal Paper Unrolling */}
            <div
              className="w-[500px] bg-white rounded-b-2xl shadow-[0_28px_70px_rgba(0,0,0,0.65)] border-x border-b border-slate-300 px-6 py-5 font-mono text-slate-800 text-xs leading-snug overflow-hidden relative"
              style={{
                height: `${ticketHeight}px`,
                maxHeight: '650px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {/* Header */}
              <div className="text-center pb-3 border-b-2 border-dashed border-slate-300">
                <div className="font-black text-base tracking-wider text-slate-950">
                  CAFÉ SAN JUAN
                </div>
                <div className="text-[11px] text-slate-600 font-bold">
                  RUC: J0310000000000
                </div>
                <div className="text-[11px] text-slate-500">
                  Plaza Central, Managua
                </div>
                <div className="text-xs text-slate-800 mt-1 font-extrabold">
                  Factura: 001-001-01-00004522
                </div>
                <div className="text-[11px] text-slate-500 font-semibold">
                  Orden #12 | Caja 1 | Carlos Cajero
                </div>
              </div>

              {/* Items + Preserved Modifiers & Notes */}
              <div className="py-3 border-b-2 border-dashed border-slate-300 space-y-1.5">
                <div className="flex justify-between font-black text-sm text-slate-950">
                  <span>1x Capuccino Artesanal</span>
                  <span>C$ 85.00</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-900 pl-3 font-extrabold">
                  <span>+ Leche de Almendras</span>
                  <span>C$ 20.00</span>
                </div>
                <div className="text-[11px] text-slate-600 pl-3 font-bold italic">
                  Nota: Sin azúcar · Para llevar
                </div>
              </div>

              {/* Multi-Currency Totals & Change */}
              <div className="py-4 border-b-2 border-dashed border-slate-300 space-y-2 text-xs">
                <div className="flex justify-between font-black text-base text-slate-950">
                  <span>TOTAL A PAGAR:</span>
                  <span>C$ 105.00 ($ 2.87)</span>
                </div>
                <div className="flex justify-between text-slate-700 font-bold">
                  <span>EFECTIVO RECIBIDO:</span>
                  <span>C$ 200.00</span>
                </div>
                <div className="flex justify-between font-black text-sm text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded border border-emerald-300">
                  <span>VUELTO ENTREGADO:</span>
                  <span>C$ 95.00 ($ 2.59 USD)</span>
                </div>
                <div className="text-[11px] text-slate-500 pt-1 flex justify-between font-bold">
                  <span>Método: Efectivo Mostrador</span>
                  <span>T.C. Oficial BCN: 36.6243</span>
                </div>
              </div>

              {/* Operational Verification & DGI Footer */}
              <div className="py-3 border-b-2 border-dashed border-slate-300 space-y-1 text-[11px] text-slate-600 font-bold">
                <div className="flex justify-between">
                  <span>Estado de Comanda:</span>
                  <span className="text-emerald-800 font-black">DESPACHADA SIN PAUSAS</span>
                </div>
                <div className="flex justify-between">
                  <span>Tiempo de Recuperación:</span>
                  <span className="text-slate-900 font-black">&lt; 50 ms (Intacta)</span>
                </div>
              </div>

              <div className="text-center pt-3 text-[11px] text-slate-500 font-semibold">
                <div>Documento Tributario Autorizado · Serie A</div>
                <div>Conserve su factura para cualquier reclamo.</div>
                <div className="font-black text-slate-800 mt-1">
                  ¡Gracias por su compra en Café San Juan!
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Touch Finger Indicator during Phase A */}
      {frame < 95 && (
        <div
          className="absolute pointer-events-none z-50"
          style={{
            left: `${touchX}px`,
            top: `${touchY}px`,
            transform: `translate(-50%, -50%) scale(${isTouched ? 0.92 : 1})`,
          }}
        >
          <div className="w-10 h-10 rounded-full bg-white/80 border-2 border-[#00BF81] shadow-2xl flex items-center justify-center">
            <div className="w-3.5 h-3.5 rounded-full bg-[#00BF81]" />
          </div>
          {tapLocalFrame >= 0 && (
            <span
              className="absolute inset-0 rounded-full border-2 border-[#00BF81] bg-[#00BF81]/40 pointer-events-none"
              style={{
                transform: `scale(${rippleScale})`,
                opacity: rippleOpacity,
              }}
            />
          )}
        </div>
      )}

      {/* ===================================================================
          BOTTOM SAFE ZONE (h-[320px] pt-6 => bottom >= 280px free)
         =================================================================== */}
      <div className="w-full h-[320px] flex flex-col items-center justify-start pt-6 z-30 text-center">
        <div className="space-y-2">
          <div
            className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: line1Opacity,
            }}
          >
            Despacho sin pausas.
          </div>
          <div
            className="text-4xl font-black text-[#00BF81] tracking-[1.5px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)]"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: line2Opacity,
            }}
          >
            Impresión térmica inmediata.
          </div>
        </div>
      </div>
    </div>
  );
};
