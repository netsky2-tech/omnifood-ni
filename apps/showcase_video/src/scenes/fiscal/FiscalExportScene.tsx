import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { Calculator } from 'lucide-react';
import {
  FiscalWebWindow,
  ExportsWebContent,
  SequenceWebContent,
  SuccessToast,
  LocalWaypoint,
} from './FiscalWebChrome';

export const FiscalExportScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Estados interactivos sincronizados con el cursor:
  // 1. Clic en pestaña "Exportaciones": frame 45
  const isTabExports = frame >= 45;

  // 2. Clic único en botón "CSV" del Libro de Ventas: frame 108 a 118
  const isCsvPressed = frame >= 108 && frame <= 150;
  const isExportSuccess = frame >= 118;

  // Animación del Toast Oficial flotante
  const toastProgress = interpolate(frame, [118, 134], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Ruta del cursor calibrada dentro de la ventana de 1000x780:
  // Pestaña "Exportaciones" está centrada en X=690, Y=147
  // Botón "CSV" del Libro de Ventas está centrado en X=878, Y=205
  const waypoints: LocalWaypoint[] = [
    { frame: 5, x: 520, y: 330 },
    { frame: 35, x: 690, y: 147 }, // Centro de la pestaña Exportaciones
    { frame: 45, x: 690, y: 147, click: true }, // Clic en pestaña
    { frame: 55, x: 690, y: 147 },
    { frame: 95, x: 878, y: 205 }, // Centro del botón CSV
    { frame: 103, x: 878, y: 205 }, // Dwell sobre el botón
    { frame: 108, x: 878, y: 205, click: true }, // Clic ÚNICO en CSV
    { frame: 120, x: 878, y: 205 },
    { frame: 175, x: 780, y: 330 }, // Reposa sobre el desglose
  ];

  // Subtítulos cinéticos en zona segura (borde inferior >= 288px)
  const sub1Opacity = interpolate(frame, [15, 25, 130, 140], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sub2Opacity = interpolate(frame, [140, 155, 270, 280], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans">
      {/* Luz ambiental institucional */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[850px] h-[850px] bg-[#003757]/80 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute -bottom-20 right-10 w-[600px] h-[600px] bg-[#00BF81]/20 rounded-full blur-[180px] pointer-events-none" />

      {/* Header Superior del Reel (Zona Segura Instagram Reels: top >= 130px) */}
      <div className="w-full pt-[104px] flex flex-col items-center z-10 text-center">
        <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 mb-3 shadow-sm flex items-center gap-2">
          <Calculator className="w-4 h-4 text-[#00BF81]" />
          <span>Cierre Contable Mensual</span>
        </span>
        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          Libro de Ventas & Exportación Limpia
        </h2>
      </div>

      {/* Ventana de Backoffice Web Centrada en flex-1 */}
      <div className="w-full flex-1 flex items-center justify-center z-20">
        <FiscalWebWindow
          activePath="/fiscal"
          activeTab={isTabExports ? 'exports' : 'sequence'}
          animateEnter={false}
          cursorWaypoints={waypoints}
          overlay={
            isExportSuccess ? (
              <SuccessToast
                title="Libro de Ventas exportado"
                description="Se descargó el reporte fiscal en formato CSV."
                progress={toastProgress}
              />
            ) : null
          }
        >
          {isTabExports ? (
            <ExportsWebContent
              pressedButton={isCsvPressed ? 'csv' : null}
              isExportSuccess={isExportSuccess}
            />
          ) : (
            <SequenceWebContent highlightRow={2} />
          )}
        </FiscalWebWindow>
      </div>

      {/* Subtítulos Cinéticos (borde inferior >= 288px) */}
      <div className="w-full h-[340px] flex flex-col items-center justify-start pt-4 z-30 text-center">
        {frame < 140 ? (
          <div
            className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub1Opacity,
            }}
          >
            Exportación contable limpia
          </div>
        ) : (
          <div
            className="text-5xl font-black text-[#00BF81] tracking-[2px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)]"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub2Opacity,
            }}
          >
            Cero doble digitación manual
          </div>
        )}
      </div>
    </div>
  );
};
