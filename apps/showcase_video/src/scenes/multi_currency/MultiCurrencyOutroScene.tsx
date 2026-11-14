import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { MessageSquare, ShieldCheck } from 'lucide-react';
import { NhilosLogo } from '../../components/NhilosLogo';

export const MultiCurrencyOutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.9 },
  });

  const textOpacity = interpolate(frame, [10, 26], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const ctaScale = spring({
    frame: Math.max(0, frame - 24),
    fps,
    config: { damping: 12 },
  });

  return (
    <div className="w-full h-full bg-[#003757] flex flex-col items-center justify-center p-12 relative overflow-hidden text-center font-sans">
      {/* Glow radial de fondo */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,191,129,0.18)_0%,transparent_70%)] pointer-events-none" />

      {/* Isotipo oficial NHILOS (`logo.png`) */}
      <div
        style={{ transform: `scale(${logoScale})` }}
        className="mb-8 relative z-10 shadow-2xl rounded-3xl"
      >
        <NhilosLogo size={200} />
      </div>

      {/* Nombre y Eslogan Oficial */}
      <h1
        style={{
          opacity: textOpacity,
          fontFamily: 'Renogare, Poppins, sans-serif',
        }}
        className="text-6xl font-extrabold text-white tracking-wider mb-3 z-10"
      >
        NHILOS POS
      </h1>

      <p
        style={{ opacity: textOpacity }}
        className="text-2xl text-slate-200 font-light tracking-wide max-w-xl mb-10 z-10"
      >
        Conectamos los hilos de tu negocio.
      </p>

      {/* Botón interactivo central en #00BF81 con texto #003757: Comenta DEMO */}
      <div
        style={{ transform: `scale(${ctaScale})` }}
        className="bg-[#00BF81] text-[#003757] font-black text-3xl px-10 py-5 rounded-2xl shadow-[0_0_40px_rgba(0,191,129,0.45)] flex items-center gap-4 z-10 mb-5 border-2 border-white/25"
      >
        <MessageSquare className="w-8 h-8 fill-[#003757] text-[#003757]" />
        <span>Comenta DEMO</span>
      </div>

      {/* Subtítulo de cierre */}
      <div
        style={{ opacity: textOpacity }}
        className="inline-flex items-center gap-2 text-lg text-white/90 font-semibold bg-white/10 px-6 py-2.5 rounded-full border border-white/15 z-10"
      >
        <ShieldCheck className="w-5 h-5 text-[#00BF81]" />
        <span>Acceso a la demostración operativa</span>
      </div>
    </div>
  );
};
