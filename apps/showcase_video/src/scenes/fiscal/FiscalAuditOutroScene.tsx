import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig, staticFile, Img } from 'remotion';
import { History, MessageSquare } from 'lucide-react';
import { FiscalWebWindow, AuditWebContent, LocalWaypoint } from './FiscalWebChrome';

export const FiscalAuditOutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Ruta del cursor recorriendo la bitácora forense sin clics accidentales
  const waypoints: LocalWaypoint[] = [
    { frame: 5, x: 350, y: 230 },
    { frame: 40, x: 520, y: 285 }, // Fila de la anulación recién registrada
    { frame: 85, x: 520, y: 285 }, // Dwell inspeccionando el registro forense
  ];

  // Transición suave concéntrica entre Fase 1 (Auditoría Forense) y Fase 2 (Outro Oficial)
  const auditOpacity = interpolate(frame, [102, 120], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const outroOpacity = interpolate(frame, [105, 125], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const outroScale = interpolate(
    spring({ frame: Math.max(0, frame - 105), fps, config: { damping: 16 } }),
    [0, 1],
    [0.94, 1]
  );

  // Pulso sutil del botón CTA en Fase 2
  const ctaPulse = Math.sin(Math.max(0, frame - 120) / 6) * 0.03 + 1;

  // Subtítulo cinético de Fase 1
  const sub1Opacity = interpolate(frame, [10, 25, 96, 108], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="relative w-full h-full bg-[#003757] overflow-hidden font-sans text-center">
      {/* Luz ambiental institucional */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-[#00BF81]/15 rounded-full blur-[200px] pointer-events-none" />

      {/* ========================================================
          FASE 1: Bitácora del mostrador (POS) en Backoffice Web
         ======================================================== */}
      {frame < 125 && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-between p-8 z-10 pointer-events-none"
          style={{ opacity: auditOpacity }}
        >
          {/* Header Superior (Zona Segura Instagram Reels: top >= 130px) */}
          <div className="w-full pt-[104px] flex flex-col items-center">
            <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 flex items-center gap-2 mb-3 shadow-sm">
              <History className="w-4 h-4" /> Bitácora Forense
            </span>
            <h2
              className="text-4xl font-extrabold text-white tracking-wide"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Auditoría en Tiempo Real
            </h2>
          </div>

          {/* Ventana de Backoffice Web mostrando la bitácora ledger real */}
          <div className="w-full flex-1 flex items-center justify-center">
            <FiscalWebWindow
              activePath="/audit"
              pageTitle="Auditoría"
              pageSubtitle="Registro de lo que ocurrió en las cajas del local: anulaciones, notas de crédito, descuentos autorizados, aperturas de gaveta y reimpresiones — quién, cuándo y desde qué dispositivo."
              showDateRange={false}
              showTabs={false}
              animateEnter={false}
              cursorWaypoints={waypoints}
            >
              <AuditWebContent highlightRow={0} />
            </FiscalWebWindow>
          </div>

          {/* Subtítulo Cinético de Fase 1 (borde inferior >= 288px) */}
          <div className="w-full h-[340px] flex flex-col items-center justify-start pt-4 z-30 text-center">
            <div
              className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
              style={{
                fontFamily: 'Renogare, Poppins, sans-serif',
                opacity: sub1Opacity,
              }}
            >
              Control administrativo real
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          FASE 2: Pantalla de Cierre Oficial NHILOS POS
         ======================================================== */}
      {frame >= 102 && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-12 space-y-10 z-20 pointer-events-none"
          style={{
            opacity: outroOpacity,
            transform: `scale(${outroScale})`,
          }}
        >
          {/* 1. Logo oficial PNG */}
          <div className="w-52 h-52 flex items-center justify-center drop-shadow-[0_20px_45px_rgba(0,0,0,0.6)]">
            <Img
              src={staticFile('logo.png')}
              alt="NHILOS POS"
              className="w-full h-full object-contain"
            />
          </div>

          {/* 2. Texto de Marca oficial */}
          <div>
            <h2
              className="text-7xl font-black text-white tracking-[6px] uppercase"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              NHILOS POS
            </h2>
            {/* 3. Eslogan oficial innegociable */}
            <p
              className="text-3xl text-[#CCCCCC] font-normal mt-4 tracking-wide"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Conectamos los hilos de tu negocio.
            </p>
          </div>

          {/* 4. Llamada a la Acción (CTA Verde Esmeralda #00BF81) */}
          <div className="pt-6" style={{ transform: `scale(${ctaPulse})` }}>
            <div className="px-12 py-5 rounded-2xl bg-[#00BF81] text-slate-950 font-black text-3xl tracking-wider uppercase shadow-[0_0_50px_rgba(0,191,129,0.7)] flex items-center gap-4 border-2 border-emerald-300">
              <MessageSquare className="w-8 h-8 fill-slate-950" />
              <span>Comenta CONTROL</span>
            </div>
          </div>

          {/* Subtexto de apoyo alineado con el CTA */}
          <p className="text-xl text-white/70 tracking-wider font-medium pt-2 max-w-lg">
            Comenta CONTROL para enviarte nuestro protocolo técnico de auditoría
          </p>
        </div>
      )}
    </div>
  );
};
