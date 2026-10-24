import React from 'react';
import { staticFile, Img } from 'remotion';

interface NhilosLogoProps {
  size?: number;
  showText?: boolean;
}

export const NhilosLogo: React.FC<NhilosLogoProps> = ({
  size = 48,
  showText = false,
}) => {
  return (
    <div className="flex flex-col items-center justify-center">
      <div
        style={{ width: size, height: size }}
        className="shrink-0 flex items-center justify-center"
      >
        <Img
          src={staticFile('logo.png')}
          alt="NHILOS POS"
          className="w-full h-full object-contain"
        />
      </div>

      {showText && (
        <span
          className="text-white font-bold tracking-[4px] uppercase mt-3"
          style={{
            fontFamily: 'Renogare, Poppins, sans-serif',
            fontSize: size * 0.28,
          }}
        >
          NHILOS POS
        </span>
      )}
    </div>
  );
};
