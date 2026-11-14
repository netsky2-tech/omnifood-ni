import React from 'react';
import { Audio, Sequence, Series, staticFile } from 'remotion';
import { KardexInventoryScene } from '../scenes/kardex/KardexInventoryScene';
import { KardexOutroScene } from '../scenes/kardex/KardexOutroScene';

/**
 * KardexAuditReel — Formato Vertical 9:16 (1080x1920)
 * Duración sincronizada con locución natural armónica (`es-MX-JorgeNeural` a +0% / -2%):
 * 1110 frames @ 30fps (37.0 segundos)
 *
 * Estructura narrativa y de audio:
 * - f0..f145 (145f / 4.83s): Escena 1 — Macro Frame 0 (`scale: 1.60`) sobre botón `Ver movimientos` + `Diferencia: -3 uds` y corte 1.5s (`f45`) -> `kardex_1_hook.mp3`
 * - f145..f345 (200f / 6.67s): Escena 2 — Panel de Kardex del Producto (`12 nov, 4:15 p. m.`) -> `kardex_2_context.mp3`
 * - f345..f615 (270f / 9.00s): Escena 3 — Recorrido por las 3 filas del Kardex (Compra +24, Venta POS -2, Ajuste -3 con motivo obligatorio) -> `kardex_3_audit.mp3`
 * - f615..f885 (270f / 9.00s): Escena 4 — Retorno a la lista preservando el filtro `Estado: Con diferencias` y KPIs de margen protegido -> `kardex_4_return.mp3`
 * - f885..f1110 (225f / 7.50s): Escena 5 — Cierre Canónico (`Comenta CONTROL`) -> `kardex_5_outro.mp3`
 */
export const KardexAuditReel: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#001F33] text-white relative overflow-hidden">
      {/* Pistas de Locución (Edge TTS: es-MX-JorgeNeural a ritmo natural armónico) */}
      <Series>
        <Series.Sequence durationInFrames={145}>
          <Audio src={staticFile('audio/kardex_1_hook.mp3')} volume={1} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={200}>
          <Audio src={staticFile('audio/kardex_2_context.mp3')} volume={1} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={270}>
          <Audio src={staticFile('audio/kardex_3_audit.mp3')} volume={1} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={270}>
          <Audio src={staticFile('audio/kardex_4_return.mp3')} volume={1} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={225}>
          <Audio src={staticFile('audio/kardex_5_outro.mp3')} volume={1} />
        </Series.Sequence>
      </Series>

      {/* Escenas Visuales */}
      {/* Escenas 1 a 4 (f0..f885): Flujo continuo en /inventory -> Kardex -> Retorno con filtro preservado */}
      <Sequence from={0} durationInFrames={885}>
        <KardexInventoryScene />
      </Sequence>

      {/* Escena 5 (f885..f1110): Cierre Canónico (#003757 + logo.png + Comenta CONTROL) */}
      <Sequence from={885} durationInFrames={225}>
        <KardexOutroScene />
      </Sequence>
    </div>
  );
};
