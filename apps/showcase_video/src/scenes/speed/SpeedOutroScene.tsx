import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig, staticFile, Img } from 'remotion';
import { Printer, MessageSquare } from 'lucide-react';

export const SpeedOutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animación del ticket térmico saliendo
  const ticketProgress = spring({
    frame,
    fps,
    config: { damping: 17, mass: 0.9 },
  });
  const ticketHeight = interpolate(ticketProgress, [0, 1], [0, 620]);

  // Transición suave entre Fase 1 (Ticket) y Fase 2 (Outro)
  // Crossfade puro con capas absolute inset-0: CERO salto de layout o desplazamiento vertical
  const ticketOpacity = interpolate(frame, [100, 120], [1, 0], {
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
    [0.95, 1]
  );

  // Pulso sutil del botón CTA
  const ctaPulse = Math.sin(Math.max(0, frame - 120) / 6) * 0.03 + 1;

  // Subtítulo cinético de la Fase 1
  const sub1Opacity = interpolate(frame, [10, 25, 95, 105], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="relative w-full h-full bg-[#003757] overflow-hidden font-sans text-center">
      {/* Luz ambiental institucional */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-[#00BF81]/15 rounded-full blur-[200px] pointer-events-none" />

      {/* ========================================================
          FASE 1: Impresión de Ticket Térmico 58mm (Frames 0 a 120)
          Posicionamiento absoluto centrado: no interactúa con Fase 2
         ======================================================== */}
      {frame < 125 && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-8 z-10 pointer-events-none"
          style={{
            opacity: ticketOpacity,
          }}
        >
          {/* Header Superior durante la impresión */}
          <div className="mb-8 flex flex-col items-center">
            <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 flex items-center gap-2 mb-3 shadow-sm">
              <Printer className="w-4 h-4" /> Impresión Térmica
            </span>
            <h2
              className="text-4xl font-extrabold text-white"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Corte Limpio & Sin Esperas
            </h2>
          </div>

          {/* Ranura de la Impresora MIRAY Q80 */}
          <div className="w-[520px] h-10 bg-slate-900 rounded-t-2xl border-t-2 border-x-2 border-slate-700 flex items-center justify-center shadow-2xl relative z-20">
            <div className="w-[440px] h-2 bg-black rounded-full" />
          </div>

          {/* Papel Térmico Saliendo hacia abajo */}
          <div
            className="w-[480px] bg-white rounded-b-2xl shadow-[0_25px_60px_rgba(0,0,0,0.5)] border-x border-b border-slate-300 p-6 font-mono text-slate-800 text-sm leading-tight overflow-hidden relative"
            style={{
              height: `${ticketHeight}px`,
              maxHeight: '620px',
            }}
          >
            {/* Cabecera Mock / Demo comercial confidencial */}
            <div className="text-center pb-3 border-b-2 border-dashed border-slate-300">
              <div className="font-black text-base tracking-wider text-black">CAFÉ SAN JUAN</div>
              <div className="text-xs text-slate-500 font-bold mt-0.5">RUC: J0310000000000</div>
              <div className="text-xs text-slate-400">Plaza Central, Managua</div>
              <div className="text-xs text-slate-600 mt-1 font-semibold">Factura: 001-001-01-00004521</div>
              <div className="text-xs text-slate-400">28/04/2025 12:45 PM | Caja 1</div>
            </div>

            {/* Detalle de Productos */}
            <div className="py-3 border-b-2 border-dashed border-slate-300 space-y-1.5">
              <div className="flex justify-between font-black text-sm">
                <span>1 Cappuccino Artesanal</span>
                <span>85.00</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600 pl-4 font-bold">
                <span>+ Leche Almendras</span>
                <span>20.00</span>
              </div>
            </div>

            {/* Totales y Vuelto Multimoneda */}
            <div className="py-3 border-b-2 border-dashed border-slate-300 space-y-1.5 text-sm">
              <div className="flex justify-between font-black text-base">
                <span>TOTAL C$:</span>
                <span>105.00</span>
              </div>
              <div className="flex justify-between text-slate-600 font-semibold">
                <span>Efectivo C$:</span>
                <span>500.00</span>
              </div>
              <div className="flex justify-between font-black text-emerald-700">
                <span>CAMBIO C$:</span>
                <span>395.00</span>
              </div>
              <div className="flex justify-between font-black text-[#003757]">
                <span>CAMBIO USD:</span>
                <span>$10.79</span>
              </div>
              <div className="text-xs text-slate-500 pt-1 text-right font-medium">
                T.C. Oficial BCN: 36.6243
              </div>
            </div>

            {/* Pie DGI */}
            <div className="text-center pt-3 text-xs text-slate-500">
              <div>Conserve su factura para cualquier reclamo.</div>
              <div className="font-bold text-slate-800 mt-1">¡Gracias por su compra!</div>
            </div>

            {/* Animación de línea de corte parcial */}
            {frame >= 70 && (
              <div className="absolute top-2 left-0 right-0 border-t-2 border-dotted border-red-400 opacity-70" />
            )}
          </div>

          {/* Subtítulo Cinético de Fase 1 (Área segura Instagram Reels: bottom >= 280px) */}
          <div className="absolute bottom-[280px] left-0 right-0 flex flex-col items-center justify-center min-h-[80px] text-center px-8">
            <div
              className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
              style={{
                fontFamily: 'Renogare, Poppins, sans-serif',
                opacity: sub1Opacity,
              }}
            >
              Despacho en 1 segundo
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          FASE 2: Pantalla de Cierre Oficial NHILOS POS (Frames 105 a 240)
          Reglas de Marca innegociables: Logo, NHILOS POS, Slogan, CTA
         ======================================================== */}
      {frame >= 100 && (
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
          <div
            className="pt-6"
            style={{
              transform: `scale(${ctaPulse})`,
            }}
          >
            <div className="px-12 py-5 rounded-2xl bg-[#00BF81] text-slate-950 font-black text-3xl tracking-wider uppercase shadow-[0_0_50px_rgba(0,191,129,0.7)] flex items-center gap-4 border-2 border-emerald-300">
              <MessageSquare className="w-8 h-8 fill-slate-950" />
              <span>Comenta DEMO</span>
            </div>
          </div>

          {/* Subtexto de apoyo ubicado en zona segura sobre los 280px */}
          <p className="text-xl text-white/70 tracking-wider font-medium pt-2">
            Flujo operativo en vivo para Food Parks y Retail
          </p>
        </div>
      )}
    </div>
  );
};
