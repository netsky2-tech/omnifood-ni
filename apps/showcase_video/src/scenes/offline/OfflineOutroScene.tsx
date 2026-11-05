import React from 'react';
import {
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { MessageCircle, ShieldCheck } from 'lucide-react';

export const OfflineOutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const claimSpring = spring({
    frame,
    fps,
    config: { damping: 16, mass: 0.9 },
  });
  const brandSpring = spring({
    frame: Math.max(0, frame - 24),
    fps,
    config: { damping: 16, mass: 0.9 },
  });
  const ctaSpring = spring({
    frame: Math.max(0, frame - 58),
    fps,
    config: { damping: 15 },
  });

  const claimOpacity = interpolate(claimSpring, [0, 1], [0, 1]);
  const claimY = interpolate(claimSpring, [0, 1], [26, 0]);
  const brandScale = interpolate(brandSpring, [0, 1], [0.94, 1]);
  const brandOpacity = interpolate(brandSpring, [0, 1], [0, 1]);
  const ctaScale = interpolate(ctaSpring, [0, 1], [0.9, 1]);
  const ctaOpacity = interpolate(ctaSpring, [0, 1], [0, 1]);

  const ctaPulse = Math.sin(Math.max(0, frame - 70) / 6) * 0.03 + 1;

  return (
    <div className="relative w-full h-full bg-[#003757] overflow-hidden font-sans text-center">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[950px] h-[950px] bg-[#00BF81]/15 rounded-full blur-[210px] pointer-events-none" />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-[#0A4D73] rounded-full blur-[150px] pointer-events-none opacity-70" />

      <div className="absolute inset-0 flex flex-col items-center justify-center px-12 py-24 z-10">
        <div
          style={{
            opacity: claimOpacity,
            transform: `translateY(${claimY}px)`,
          }}
          className="flex flex-col items-center"
        >
          <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#00BF81]/15 border border-[#00BF81]/40 text-[#2FE0A4] text-sm font-bold tracking-[2px] uppercase mb-6">
            <ShieldCheck className="w-4 h-4" />
            Diseñado para la realidad.
          </span>
          <h1
            className="text-[44px] font-black text-white leading-[1.15] tracking-[1px] max-w-[880px]"
            style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
          >
            Diseñamos para la realidad,
            <br />
            no para el escenario perfecto.
          </h1>
        </div>

        <div
          className="mt-10 flex flex-col items-center"
          style={{
            opacity: brandOpacity,
            transform: `scale(${brandScale})`,
          }}
        >
          <div className="w-40 h-40 flex items-center justify-center drop-shadow-[0_20px_45px_rgba(0,0,0,0.55)]">
            <Img
              src={staticFile('logo.png')}
              alt="NHILOS POS"
              className="w-full h-full object-contain"
            />
          </div>

          <h2
            className="text-6xl font-black text-white tracking-[6px] uppercase mt-2"
            style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
          >
            NHILOS POS
          </h2>
          <p
            className="text-2xl text-[#CCCCCC] font-normal mt-3 tracking-wide"
            style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
          >
            Conectamos los hilos de tu negocio.
          </p>
        </div>

        <div
          className="mt-9 flex flex-col items-center"
          style={{
            opacity: ctaOpacity,
            transform: `scale(${ctaScale * ctaPulse})`,
          }}
        >
          <div className="px-10 py-4 rounded-2xl bg-[#00BF81] text-slate-950 font-black text-2xl tracking-wider uppercase shadow-[0_0_45px_rgba(0,191,129,0.65)] flex items-center gap-3 border-2 border-emerald-300">
            <MessageCircle className="w-7 h-7 fill-slate-950" />
            <span>Escríbenos por WhatsApp</span>
          </div>
          <p className="text-base text-white/75 font-semibold tracking-wide mt-4">
            Operación continua garantizada.
          </p>
          <p className="text-sm text-white/55 font-medium tracking-wide mt-1">
            Conoce cómo blindar tu mostrador.
          </p>
        </div>
      </div>
    </div>
  );
};
