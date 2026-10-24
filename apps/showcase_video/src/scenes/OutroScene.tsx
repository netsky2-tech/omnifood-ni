import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig, staticFile, Img } from 'remotion';
import { NHILOS_BRAND } from '../tokens/brand';

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.9 },
  });

  const scale = interpolate(progress, [0, 1], [0.88, 1]);
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const textOpacity = interpolate(frame, [15, 35], [0, 1], {
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

        {/* 2. Nombre de la app: NHILOS POS */}
        <h2
          className="text-white text-4xl font-bold tracking-[6px] uppercase mb-4"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          NHILOS POS
        </h2>

        {/* 3. Slogan oficial */}
        <p
          className="text-[#CCCCCC] text-xl font-normal tracking-wide"
          style={{
            fontFamily: 'Renogare, Poppins, sans-serif',
            opacity: textOpacity,
          }}
        >
          Conectamos los hilos de tu negocio.
        </p>
      </div>
    </div>
  );
};
