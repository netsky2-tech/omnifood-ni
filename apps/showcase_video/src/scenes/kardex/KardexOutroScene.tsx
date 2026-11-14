import React from 'react';
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  Img,
} from 'remotion';
import { MessageSquare, ShieldCheck } from 'lucide-react';

/**
 * Escena 5 (Cierre Canónico — 225 frames / 7.5s @ 30fps):
 * Pantalla de cierre sobre fondo #003757 con isotipo oficial NHILOS (`logo.png`).
 * Botón interactivo central en #00BF81 con texto #003757: `Comenta CONTROL`
 * y subtítulo `Control de inventario y punto de venta`.
 */
export const KardexOutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const outroOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const outroScale = interpolate(
    spring({ frame, fps, config: { damping: 16 } }),
    [0, 1],
    [0.94, 1]
  );

  const ctaPulse = Math.sin(Math.max(0, frame - 15) / 6) * 0.03 + 1;

  return (
    <div className="relative w-full h-full bg-[#003757] overflow-hidden font-sans text-center select-none">
      {/* Luz ambiental esmeralda institucional */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-[#00BF81]/15 rounded-full blur-[200px] pointer-events-none" />

      {/* Cierre Canónico en Zona Segura (top >= 130px, bottom >= 280px) */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-12 pt-[130px] pb-[280px] space-y-10 z-20 pointer-events-none"
        style={{
          opacity: outroOpacity,
          transform: `scale(${outroScale})`,
        }}
      >
        {/* 1. Logo Oficial PNG */}
        <div className="w-52 h-52 flex items-center justify-center drop-shadow-[0_20px_45px_rgba(0,0,0,0.6)]">
          <Img
            src={staticFile('logo.png')}
            alt="NHILOS POS"
            className="w-full h-full object-contain"
          />
        </div>

        {/* 2. Nombre Oficial + 3. Eslogan Oficial */}
        <div>
          <h2
            className="text-7xl font-black text-white tracking-[6px] uppercase"
            style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
          >
            NHILOS POS
          </h2>
          <p
            className="text-3xl text-[#CCCCCC] font-normal mt-4 tracking-wide"
            style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
          >
            Conectamos los hilos de tu negocio.
          </p>
        </div>

        {/* 4. Botón CTA en #00BF81 con texto #003757: Comenta CONTROL */}
        <div className="pt-4" style={{ transform: `scale(${ctaPulse})` }}>
          <div className="px-12 py-5 rounded-2xl bg-[#00BF81] text-[#003757] font-black text-4xl tracking-wider shadow-[0_0_50px_rgba(0,191,129,0.7)] flex items-center gap-4 border-2 border-emerald-300">
            <MessageSquare className="w-9 h-9 fill-[#003757] text-[#003757]" />
            <span>Comenta CONTROL</span>
          </div>
        </div>

        {/* 5. Subtítulo del Guion: Control de inventario y punto de venta */}
        <div className="inline-flex items-center gap-2.5 bg-white/10 border border-white/20 px-6 py-2.5 rounded-full text-2xl text-white font-bold tracking-wide shadow-md">
          <ShieldCheck className="w-6 h-6 text-[#00BF81]" />
          <span>Control de inventario y punto de venta</span>
        </div>
      </div>
    </div>
  );
};
