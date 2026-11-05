import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Printer, CheckCircle2, ShieldCheck, Clock } from 'lucide-react';

export const BlindAuditTicketScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Concentric entrance & 58mm thermal paper unrolling animation
  const enterOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const ticketProgress = spring({
    frame,
    fps,
    config: { damping: 16, mass: 0.9 },
  });
  const ticketHeight = interpolate(ticketProgress, [0, 1], [80, 680]);

  // Highlight pulse for the exact zero-discrepancy audit seal
  const sealScale = spring({
    frame: Math.max(0, frame - 40),
    fps,
    config: { damping: 13 },
  });

  // Kinetic subtitles in bottom safe zone (bottom >= 280px)
  const line1Opacity = interpolate(frame, [5, 18, 280, 295], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const line2Opacity = interpolate(frame, [45, 60, 280, 295], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans"
      style={{ opacity: enterOpacity }}
    >
      {/* Ambient institutional glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[880px] h-[880px] bg-[#00BF81]/15 rounded-full blur-[180px] pointer-events-none" />

      {/* ===================================================================
          TOP SAFE ZONE (pt-[104px] + p-8 => 136px >= 130px)
         =================================================================== */}
      <div className="w-full pt-[104px] flex flex-col items-center z-10 text-center">
        <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 flex items-center gap-2 mb-3 shadow-sm">
          <Printer className="w-4 h-4 text-[#00BF81]" />
          <span>Impresión Térmica 58mm · Auditoría</span>
        </span>
        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          Comprobante de Corte X
        </h2>
      </div>

      {/* ===================================================================
          CENTER STAGE (Concentric absolute inset-0 inside flex-1)
         =================================================================== */}
      <div className="w-full flex-1 relative flex items-center justify-center z-20">
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* Context Pill above Printer Slot */}
          <div className="mb-3 bg-[#003757] border border-white/15 px-4 py-1.5 rounded-full text-xs text-white/90 font-medium flex items-center gap-2 shadow-md">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00BF81]" />
            <span>Café San Juan · RUC: J0310000000000 · Caja 1 · Carlos Cajero</span>
          </div>

          {/* MIRAY Q80 58mm Thermal Printer Slot */}
          <div className="w-[560px] h-10 bg-slate-900 rounded-t-2xl border-t-2 border-x-2 border-slate-700 flex items-center justify-center shadow-2xl relative z-20">
            <div className="w-[480px] h-2.5 bg-black rounded-full" />
          </div>

          {/* 58mm Thermal Receipt Paper Unrolling */}
          <div
            className="w-[520px] bg-white rounded-b-2xl shadow-[0_28px_70px_rgba(0,0,0,0.65)] border-x border-b border-slate-300 px-6 py-5 font-mono text-slate-800 text-xs leading-snug overflow-hidden relative"
            style={{
              height: `${ticketHeight}px`,
              maxHeight: '680px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {/* Commercial Header */}
            <div className="text-center pb-2.5 border-b-2 border-dashed border-slate-300">
              <div className="font-black text-base tracking-wider text-slate-950">
                CAFÉ SAN JUAN
              </div>
              <div className="text-[11px] text-slate-600 font-bold">
                RUC: J0310000000000
              </div>
              <div className="text-[11px] text-slate-500">
                Plaza Central, Managua
              </div>
              <div className="mt-1.5 inline-block bg-slate-900 text-white font-black text-xs px-3 py-1 rounded tracking-widest">
                *** CORTE X (ARQUEO CIEGO) ***
              </div>
            </div>

            {/* Metadata & Exact Date/Time Stamp */}
            <div className="py-2.5 border-b-2 border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Terminal:</span>
                <span className="font-bold text-slate-900">Caja 1 · Punto de Venta</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Operador:</span>
                <span className="font-bold text-slate-900">Carlos Cajero</span>
              </div>
              <div className="flex justify-between items-center bg-slate-100 px-2 py-1 rounded border border-slate-200 mt-1">
                <span className="text-slate-600 font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#003757]" /> Fecha/Hora:
                </span>
                <span className="font-black text-[#003757]">
                  02/11/2026 04:30:18 PM
                </span>
              </div>
            </div>

            {/* Section 1: Initial Cash Float */}
            <div className="py-2 border-b border-dashed border-slate-300 space-y-1">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                1. Fondo de Caja Inicial
              </div>
              <div className="flex justify-between font-bold text-xs">
                <span>Fondo Inicial C$:</span>
                <span>C$ 1,500.00</span>
              </div>
            </div>

            {/* Section 2: Physical Blind Count Declared */}
            <div className="py-2.5 border-b-2 border-dashed border-slate-300 space-y-1.5">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                2. Conteo Físico Declarado (A Ciegas)
              </div>
              <div className="flex justify-between font-semibold">
                <span>Efectivo Córdobas:</span>
                <span className="font-bold text-slate-900">C$ 4,850.00</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Efectivo Dólares ($ 40.00):</span>
                <span className="font-bold text-slate-900">C$ 1,464.97</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Vouchers POS (BAC/Banpro):</span>
                <span className="font-bold text-slate-900">C$ 2,340.00</span>
              </div>
            </div>

            {/* Section 3: System vs Physical Reconciliation */}
            <div className="pt-2.5 space-y-1.5">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                3. Auditoría vs. Sistema
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span>Total Recaudado (Sistema):</span>
                <span>C$ 8,654.97</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-900">
                <span>Conteo Físico Total:</span>
                <span>C$ 8,654.97</span>
              </div>

              {/* Zero Discrepancy Highlighted Box */}
              <div
                className="mt-2 bg-emerald-50 border-2 border-[#00BF81] rounded-xl p-2.5 flex items-center justify-between shadow-sm"
                style={{
                  transform: `scale(${interpolate(sealScale, [0, 1], [0.92, 1])})`,
                }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#059669]" />
                  <div>
                    <div className="text-xs font-black text-emerald-950">
                      DIFERENCIA: C$ 0.00
                    </div>
                    <div className="text-[10px] font-bold text-emerald-700">
                      CUADRE EXACTO · INALTERABLE
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-black bg-[#00BF81] text-[#003757] px-2.5 py-1 rounded-md uppercase">
                  OK AL CENTAVO
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-3 mt-2 border-t border-slate-200 text-[10px] text-slate-500 font-bold tracking-wider uppercase">
              Sincronizado al Panel Administrativo
            </div>
          </div>
        </div>
      </div>

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
            Corte X Inalterable
          </div>
          <div
            className="text-4xl font-black text-[#00BF81] tracking-[1.5px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)]"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: line2Opacity,
            }}
          >
            Diferencias al centavo en tiempo real.
          </div>
        </div>
      </div>
    </div>
  );
};
