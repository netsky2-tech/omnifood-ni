import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig, staticFile, Img } from 'remotion';
import { NHILOS_BRAND } from '../tokens/brand';

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame,
    fps,
    config: { damping: 15, mass: 0.8 },
  });

  const scale = interpolate(progress, [0, 1], [0.88, 1]);
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const badgeOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const sloganOpacity = interpolate(frame, [25, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      className="w-full h-full relative overflow-hidden flex flex-col items-center justify-center font-sans"
      style={{
        backgroundColor: NHILOS_BRAND.colors.navy,
      }}
    >
      <div
        className="flex flex-col items-center text-center z-10 px-8"
        style={{
          transform: `scale(${scale})`,
          opacity,
        }}
      >
        {/* 1. Logo oficial PNG */}
        <div className="w-28 h-28 mb-4 flex items-center justify-center">
          <Img
            src={staticFile('logo.png')}
            alt="NHILOS POS"
            className="w-full h-full object-contain"
          />
        </div>

        {/* 2. Debajo: NHILOS POS */}
        <h1
          className="text-white text-4xl font-bold tracking-[6px] uppercase mb-4"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          NHILOS POS
        </h1>

        {/* 3. Badge: Directorio de Clientes & Convenios */}
        <div
          style={{ opacity: badgeOpacity }}
          className="mb-5 inline-flex items-center px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-[#00BF81] text-sm font-semibold tracking-wide"
        >
          Directorio de Clientes & Convenios
        </div>

        {/* 4. Por último: el slogan */}
        <p
          className="text-[#CCCCCC] text-xl font-normal tracking-wide"
          style={{
            fontFamily: 'Renogare, Poppins, sans-serif',
            opacity: sloganOpacity,
          }}
        >
          Conectamos los hilos de tu negocio.
        </p>
      </div>
    </div>
  );
};
