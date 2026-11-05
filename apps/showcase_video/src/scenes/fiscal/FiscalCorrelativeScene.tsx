import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { ShieldCheck } from 'lucide-react';
import { FiscalWebWindow, SequenceWebContent, LocalWaypoint } from './FiscalWebChrome';

export const FiscalCorrelativeScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Resaltado de fila sincronizado con el cursor (0, 1, 2)
  const highlightedRow: 0 | 1 | 2 | undefined =
    frame >= 60 && frame < 100
      ? 0
      : frame >= 105 && frame < 145
      ? 1
      : frame >= 150
      ? 2
      : undefined;

  // Ruta del cursor calibrada dentro de la ventana de 1000x780
  const waypoints: LocalWaypoint[] = [
    { frame: 5, x: 92, y: 160 }, // Sidebar Fiscal
    { frame: 55, x: 500, y: 330 }, // Fila SERIE-001
    { frame: 85, x: 500, y: 330 }, // Dwell SERIE-001
    { frame: 110, x: 500, y: 374 }, // Fila SERIE-002
    { frame: 140, x: 500, y: 374 }, // Dwell SERIE-002
    { frame: 165, x: 830, y: 418 }, // Badge OK de SERIE-003
    { frame: 205, x: 830, y: 418 },
  ];

  // Subtítulos cinéticos en zona segura (borde inferior >= 288px)
  const sub1Opacity = interpolate(frame, [15, 25, 100, 110], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const sub2Opacity = interpolate(frame, [110, 125, 210, 220], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans">
      {/* Luz ambiental institucional */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[850px] h-[850px] bg-[#003757]/80 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute -bottom-20 right-10 w-[600px] h-[600px] bg-[#00BF81]/15 rounded-full blur-[180px] pointer-events-none" />

      {/* Header Superior del Reel (Zona Segura Instagram Reels: top >= 130px) */}
      <div className="w-full pt-[104px] flex flex-col items-center z-10 text-center">
        <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 mb-3 shadow-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#00BF81]" />
          <span>Cumplimiento DGI 09-2007</span>
        </span>
        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          Cero Saltos en Numeración
        </h2>
      </div>

      {/* Ventana de Backoffice Web Centrada en flex-1 */}
      <div className="w-full flex-1 flex items-center justify-center z-20">
        <FiscalWebWindow
          activePath="/fiscal"
          activeTab="sequence"
          animateEnter={true}
          cursorWaypoints={waypoints}
        >
          <SequenceWebContent highlightRow={highlightedRow} />
        </FiscalWebWindow>
      </div>

      {/* Subtítulos Cinéticos (borde inferior >= 288px) */}
      <div className="w-full h-[340px] flex flex-col items-center justify-start pt-4 z-30 text-center">
        {frame < 110 ? (
          <div
            className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub1Opacity,
            }}
          >
            Secuencia correlativa estricta
          </div>
        ) : (
          <div
            className="text-5xl font-black text-[#00BF81] tracking-[2px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)]"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub2Opacity,
            }}
          >
            Cero saltos en numeración
          </div>
        )}
      </div>
    </div>
  );
};
