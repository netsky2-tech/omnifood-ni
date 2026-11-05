import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Zap, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

export const SpeedHookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animaciones de entrada
  const titleSpring = spring({ frame, fps, config: { damping: 15 } });
  const cardSpring = spring({ frame: Math.max(0, frame - 15), fps, config: { damping: 16 } });

  // Transición de subtítulos cinéticos
  const sub1Opacity = interpolate(frame, [15, 25, 90, 100], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sub1TranslateY = interpolate(frame, [15, 30], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const sub2Opacity = interpolate(frame, [100, 115, 170, 180], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sub2TranslateY = interpolate(frame, [100, 115], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Pulso de advertencia en UI saturada
  const errorPulse = Math.sin(frame / 4) > 0 ? 1 : 0.4;

  return (
    <div className="w-full h-full bg-[#00253B] flex flex-col items-center justify-between p-12 relative overflow-hidden font-sans">
      {/* Luz de fondo ambiental */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-[#003757] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-40 right-10 w-[500px] h-[500px] bg-[#00BF81]/15 rounded-full blur-[160px] pointer-events-none" />

      {/* Header Superior / Badge */}
      <div
        className="w-full pt-20 flex flex-col items-center z-10"
        style={{
          transform: `translateY(${interpolate(titleSpring, [0, 1], [-30, 0])}px)`,
          opacity: titleSpring,
        }}
      >
        <div className="inline-flex items-center gap-2.5 px-8 py-2.5 rounded-full bg-[#00BF81]/15 border border-[#00BF81]/40 text-[#00BF81] text-lg font-bold tracking-wider uppercase mb-5 shadow-sm">
          <Clock className="w-5 h-5" />
          <span>Hora Pico en Mostrador</span>
        </div>
        <h1
          className="text-5xl text-center font-extrabold text-white tracking-[2px] leading-tight max-w-2xl"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          ¿Por qué se estanca la fila?
        </h1>
      </div>

      {/* Comparativa Visual: Tradicional Saturado vs. NHILOS POS */}
      <div
        className="w-full flex-1 flex flex-col justify-center items-center gap-10 z-10 max-w-3xl"
        style={{
          transform: `scale(${interpolate(cardSpring, [0, 1], [0.92, 1])})`,
          opacity: cardSpring,
        }}
      >
        {/* Tarjeta 1: Software Tradicional Saturado */}
        <div className="w-[860px] bg-slate-900/95 rounded-3xl p-7 border-2 border-red-500/30 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
              <span className="text-base font-bold text-slate-300 uppercase tracking-wide">
                Sistema Tradicional (30+ botones diminutos)
              </span>
            </div>
            <span
              className="text-xs font-extrabold text-red-300 bg-red-950/80 border border-red-700 px-3 py-1 rounded-lg flex items-center gap-1.5"
              style={{ opacity: errorPulse }}
            >
              <AlertTriangle className="w-4 h-4" /> Targets &lt;28px
            </span>
          </div>

          {/* Cuadrícula caótica de micro-botones */}
          <div className="grid grid-cols-6 gap-2 opacity-75">
            {Array.from({ length: 24 }).map((_, i) => {
              const isAlert = i === 7 || i === 14;
              return (
                <div
                  key={i}
                  className={`h-12 rounded-lg flex items-center justify-center text-xs font-mono border ${
                    isAlert
                      ? 'bg-amber-900/50 border-amber-500 text-amber-200 font-bold'
                      : i % 4 === 0
                      ? 'bg-blue-900/40 border-blue-600 text-blue-200'
                      : 'bg-slate-800/90 border-slate-700 text-slate-400'
                  }`}
                >
                  BTN_{i + 1}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-red-400 font-semibold pt-1 border-t border-slate-800/80">
            <span>❌ 5 a 8 toques confusos por cliente</span>
            <span className="text-slate-400 font-bold">Demora en caja: 45s</span>
          </div>
        </div>

        {/* Indicador de Transición / Flecha de Mejora */}
        <div className="flex items-center gap-4">
          <div className="h-0.5 w-24 bg-slate-700" />
          <div className="w-14 h-14 rounded-full bg-[#00BF81]/20 border-2 border-[#00BF81]/50 flex items-center justify-center text-[#00BF81] shadow-[0_0_20px_rgba(0,191,129,0.3)]">
            <Zap className="w-7 h-7 fill-[#00BF81]" />
          </div>
          <div className="h-0.5 w-24 bg-slate-700" />
        </div>

        {/* Tarjeta 2: La Solución NHILOS POS */}
        <div className="w-[860px] bg-[#003757]/95 rounded-3xl p-7 border-2 border-[#00BF81] shadow-[0_0_40px_rgba(0,191,129,0.2)] relative overflow-hidden">
          <div className="flex items-center justify-between mb-4 border-b border-[#0A4D73] pb-3">
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full bg-[#00BF81] shadow-[0_0_12px_#00BF81]" />
              <span className="text-base font-black text-white uppercase tracking-wider">
                NHILOS POS (Diseño Ergonómico)
              </span>
            </div>
            <span className="text-xs font-black text-[#00BF81] bg-[#00BF81]/25 border border-[#00BF81]/60 px-3.5 py-1 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Target &gt;56 dp
            </span>
          </div>

          {/* Tarjetas limpias y amplias de producto */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/10 rounded-2xl p-4 border border-white/15 flex flex-col justify-between h-28">
              <div className="text-base font-bold text-white">Cappuccino Artesanal</div>
              <div className="flex justify-between items-end">
                <span className="text-xs text-[#2FE0A4] font-semibold">Bebidas Calientes</span>
                <span className="text-xl font-black text-white">C$ 85.00</span>
              </div>
            </div>

            <div className="bg-white/10 rounded-2xl p-4 border border-white/15 flex flex-col justify-between h-28">
              <div className="text-base font-bold text-white">Pastel Tres Leches</div>
              <div className="flex justify-between items-end">
                <span className="text-xs text-[#2FE0A4] font-semibold">Postres</span>
                <span className="text-xl font-black text-white">C$ 90.00</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-[#2FE0A4] font-bold pt-1 border-t border-white/10">
            <span>⚡ Marcación inmediata en 2 toques</span>
            <span className="text-white font-black">Despacho en caja: &lt;10s</span>
          </div>
        </div>
      </div>

      {/* Subtítulos Cinéticos (En flujo normal con altura reservada para zona segura de Reels: bottom >= 280px) */}
      <div className="w-full h-[320px] flex flex-col items-center justify-start pt-6 z-20 text-center">
        {frame < 95 && (
          <div
            className="text-6xl font-black text-white tracking-[2px] drop-shadow-lg"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub1Opacity,
              transform: `translateY(${sub1TranslateY}px)`,
            }}
          >
            Menos toques.
          </div>
        )}

        {frame >= 95 && (
          <div
            className="text-6xl font-black text-[#00BF81] tracking-[2px] drop-shadow-[0_0_25px_rgba(0,191,129,0.4)]"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub2Opacity,
              transform: `translateY(${sub2TranslateY}px)`,
            }}
          >
            Más fluidez en caja.
          </div>
        )}
      </div>
    </div>
  );
};
