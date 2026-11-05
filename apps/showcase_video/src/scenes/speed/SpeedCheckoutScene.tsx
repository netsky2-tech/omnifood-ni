import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Banknote, CheckCircle, ArrowRight, ShieldCheck, DollarSign } from 'lucide-react';

export const SpeedCheckoutScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animación de entrada del modal de cobro
  const modalSpring = spring({
    frame,
    fps,
    config: { damping: 16, mass: 0.9 },
  });

  // Tiempos de interacción:
  // - Frames 0-40: Presentación del modal con total C$ 105.00
  // - Frames 40-70: Selección del billete C$ 500 en efectivo
  // - Frames 70-180: Despliegue del vuelto tabular exacto C$ 395.00 / $10.79 USD
  // - Frames 180-210: Pulsación de COMPLETAR COBRO

  const isTenderEntered = frame >= 45;
  const isCompleteClicked = frame >= 195 && frame <= 208;

  // Animación de cálculo del vuelto
  const changeSpring = spring({
    frame: Math.max(0, frame - 50),
    fps,
    config: { damping: 14 },
  });

  // Cursor táctil calibrado sobre el modal centrado
  const touchX = interpolate(
    frame,
    [0, 35, 48, 140, 195, 205],
    [540, 580, 580, 580, 540, 540],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const touchY = interpolate(
    frame,
    [0, 35, 48, 140, 195, 205],
    [865, 865, 865, 865, 1220, 1220],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const isTouched =
    (frame >= 45 && frame <= 52) ||
    (frame >= 195 && frame <= 205);

  // Subtítulos cinéticos
  const sub1Opacity = interpolate(frame, [10, 25, 120, 130], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sub2Opacity = interpolate(frame, [130, 145, 245, 255], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans">
      {/* Luz ambiental */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[750px] h-[750px] bg-[#00BF81]/15 rounded-full blur-[160px] pointer-events-none" />

      {/* Header Superior del Reel (Alineado exactamente con Escena 1: margen superior >= 128px para zona segura de Reels/Amigos) */}
      <div className="w-full pt-24 flex flex-col items-center z-10 text-center">
        <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 mb-3 shadow-sm">
          Cálculo Mental: 0 Segundos
        </span>
        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          Cobro Multimoneda & Vuelto Exacto
        </h2>
      </div>

      {/* Modal MultiCurrencyCheckoutDialog Centrado en flex-1 */}
      <div className="w-full flex-1 flex items-center justify-center z-20">
        <div
          className="w-[620px] bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.6)] border border-slate-200 overflow-hidden origin-center"
          style={{
            transform: `scale(${interpolate(modalSpring, [0, 1], [0.92, 1.25])})`,
          }}
        >
        {/* Barra Superior del Diálogo */}
        <div className="bg-[#003757] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-[#00BF81]" />
            <h3 className="text-base font-bold tracking-wide">Cobro Multimoneda</h3>
          </div>
          <span className="text-xs bg-white/10 px-2.5 py-1 rounded-md text-[#2FE0A4] font-semibold flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5" /> T.C. BCN: 36.6243
          </span>
        </div>

        {/* Cuerpo del Diálogo */}
        <div className="p-6 space-y-5">
          {/* Fila Total de la Venta */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Total de la Venta
              </span>
              <span className="text-xs text-slate-400">1 producto con extras</span>
            </div>
            <div className="text-right">
              <span
                className="text-3xl font-black text-[#003757]"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                C$ 105.00
              </span>
              <span className="text-xs text-slate-500 block font-medium">≈ $2.87 USD</span>
            </div>
          </div>

          {/* Selector de Moneda Recibida (Chips de selección) */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">
              Moneda Entregada por el Cliente:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-11 rounded-xl border-2 border-[#00BF81] bg-emerald-50/70 text-[#003757] font-bold text-xs flex items-center justify-center gap-2 shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00BF81]" />
                Córdobas (NIO - C$)
              </div>
              <div className="h-11 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 font-medium text-xs flex items-center justify-center gap-2 opacity-60">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                Dólares (USD - $)
              </div>
            </div>
          </div>

          {/* Botones de Denominación Rápida de Billetes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700">Monto Recibido en Efectivo:</label>
              <span className="text-[11px] text-slate-500">Acceso rápido</span>
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              {/* Botón Exacto (Canonical +1: Anticipación de cobro exacto §40) */}
              <div className="h-11 rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-700 relative">
                <span className="text-xs font-black">C$ 105</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Exacto</span>
              </div>
              <div className="h-11 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-xs font-bold text-slate-600">
                C$ 200
              </div>
              {/* Botón C$ 500 (Pulsado activamente) */}
              <div
                className={`h-11 rounded-xl border-2 flex items-center justify-center text-xs font-extrabold transition-all shadow-sm ${
                  isTenderEntered
                    ? 'border-[#00BF81] bg-[#00BF81] text-slate-900 scale-[0.98]'
                    : 'border-slate-300 bg-white text-slate-800'
                }`}
              >
                C$ 500
              </div>
              <div className="h-11 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-xs font-bold text-slate-600 opacity-60">
                C$ 1000
              </div>
            </div>
          </div>

          {/* Campo de Entrada de Monto */}
          <div className="bg-slate-100 rounded-xl px-4 py-2.5 border border-slate-300 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Efectivo Ingresado:</span>
            <span
              className="text-xl font-black text-slate-900"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {isTenderEntered ? 'C$ 500.00' : 'C$ 0.00'}
            </span>
          </div>

          {/* Panel de Vuelto Tabular (NhilosColors.successLight + tabularFigures) */}
          <div
            className={`rounded-2xl p-4 border-2 transition-all shadow-md ${
              isTenderEntered
                ? 'bg-[#ECFDF5] border-[#10B981]'
                : 'bg-slate-50 border-slate-200 opacity-40'
            }`}
            style={{
              transform: `scale(${interpolate(changeSpring, [0, 1], [0.95, 1])})`,
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-800 tracking-wide uppercase flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-[#00BF81]" />
                  Vuelto a Entregar
                </span>
                <span className="text-[11px] text-emerald-600 font-medium">
                  Cálculo automático instantáneo
                </span>
              </div>
              <div className="text-right">
                <span
                  className="text-3xl font-black text-[#059669]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {isTenderEntered ? 'C$ 395.00' : 'C$ 0.00'}
                </span>
              </div>
            </div>

            {/* Equivalente en USD (sin error mental bajo presión) */}
            <div className="mt-2.5 pt-2 border-t border-emerald-200/80 flex items-center justify-between text-xs text-emerald-900 font-semibold">
              <span className="text-slate-600">Equivalente en Dólares:</span>
              <span
                className="text-sm font-extrabold text-[#003757] bg-white/70 px-2.5 py-0.5 rounded-md border border-emerald-200"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {isTenderEntered ? '$10.79 USD' : '$0.00 USD'}
              </span>
            </div>
          </div>

          {/* Botón Primario: COMPLETAR COBRO */}
          <button
            className={`w-full h-14 rounded-2xl font-black text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-lg ${
              isCompleteClicked
                ? 'bg-[#009665] text-white scale-[0.98]'
                : 'bg-[#00BF81] text-slate-900 hover:bg-[#2FE0A4]'
            }`}
          >
            <ShieldCheck className="w-5 h-5 text-slate-900" />
            <span>Completar Cobro & Imprimir</span>
            <ArrowRight className="w-5 h-5 text-slate-900" />
          </button>
        </div>
      </div>
      </div>

      {/* Puntero Táctil */}
      <div
        className="absolute pointer-events-none z-50 transition-transform duration-75"
        style={{
          left: `${touchX}px`,
          top: `${touchY}px`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div className="w-10 h-10 rounded-full bg-white/80 border-2 border-[#00BF81] shadow-2xl flex items-center justify-center">
          <div className="w-3.5 h-3.5 rounded-full bg-[#00BF81]" />
        </div>
        {isTouched && (
          <span className="absolute -inset-2 rounded-full bg-[#00BF81]/60 animate-ping pointer-events-none" />
        )}
      </div>

      {/* Subtítulos Cinéticos (En flujo normal con altura reservada para zona segura de Reels: bottom >= 280px) */}
      <div className="w-full h-[320px] flex flex-col items-center justify-start pt-6 z-30 text-center">
        {frame < 130 && (
          <div
            className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub1Opacity,
            }}
          >
            Vuelto exacto C$ / USD
          </div>
        )}

        {frame >= 130 && (
          <div
            className="text-5xl font-black text-[#00BF81] tracking-[2px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)]"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub2Opacity,
            }}
          >
            Tipografía tabular fija.
          </div>
        )}
      </div>
    </div>
  );
};
