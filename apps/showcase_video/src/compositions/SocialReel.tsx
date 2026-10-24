import React from 'react';
import { Series, useCurrentFrame, interpolate, spring, useVideoConfig, staticFile, Img } from 'remotion';
import { POSCheckoutScene } from '../scenes/POSCheckoutScene';
import { NHILOS_BRAND } from '../tokens/brand';

const ReelIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame,
    fps,
    config: { damping: 14 },
  });
  const scale = interpolate(progress, [0, 1], [0.85, 1]);

  return (
    <div className="w-full h-full bg-[#003757] flex flex-col justify-center items-center p-16 font-sans relative overflow-hidden text-center">
      <div style={{ transform: `scale(${scale})` }} className="space-y-6 flex flex-col items-center">
        {/* Logo oficial PNG */}
        <div className="w-32 h-32 flex items-center justify-center">
          <Img
            src={staticFile('logo.png')}
            alt="NHILOS POS"
            className="w-full h-full object-contain"
          />
        </div>

        <h1
          className="text-5xl font-bold text-white tracking-[6px] uppercase"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          NHILOS POS
        </h1>

        <div className="inline-flex items-center px-5 py-2 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-[#00BF81] text-base font-semibold tracking-wide">
          Directorio de Clientes & Convenios
        </div>

        <p
          className="text-2xl text-[#CCCCCC] font-normal max-w-md"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          Conectamos los hilos de tu negocio.
        </p>
      </div>
    </div>
  );
};

const ReelPOSDemo: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-center p-8 font-sans">
      <div className="pt-16 pb-6 text-center">
        <span className="text-xs font-bold text-[#00BF81] tracking-wider uppercase bg-emerald-500/10 px-4 py-1.5 rounded-full border border-emerald-400/30">
          En Caja Registradora
        </span>
        <h2 className="text-3xl font-extrabold text-white mt-2">
          Descuento Automático por Convenio
        </h2>
      </div>

      <div className="flex-1 w-full flex items-center justify-center">
        <div className="scale-[0.88] origin-center">
          <POSCheckoutScene />
        </div>
      </div>
    </div>
  );
};

const ReelOutro: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#003757] flex flex-col items-center justify-center p-16 text-center font-sans">
      <div className="w-32 h-32 mb-6 flex items-center justify-center">
        <Img
          src={staticFile('logo.png')}
          alt="NHILOS POS"
          className="w-full h-full object-contain"
        />
      </div>

      <h2
        className="text-5xl font-bold text-white tracking-[6px] uppercase mb-4"
        style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
      >
        NHILOS POS
      </h2>

      <p
        className="text-2xl text-[#CCCCCC] font-normal"
        style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
      >
        Conectamos los hilos de tu negocio.
      </p>
    </div>
  );
};

export const SocialReel: React.FC = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={90}>
        <ReelIntro />
      </Series.Sequence>
      <Series.Sequence durationInFrames={540}>
        <ReelPOSDemo />
      </Series.Sequence>
      <Series.Sequence durationInFrames={90}>
        <ReelOutro />
      </Series.Sequence>
    </Series>
  );
};
