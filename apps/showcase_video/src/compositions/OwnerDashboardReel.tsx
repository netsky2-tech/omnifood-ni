import React from 'react';
import { Series, Audio, staticFile } from 'remotion';
import { OwnerDashboardWebScene } from '../scenes/owner_dashboard/OwnerDashboardWebScene';
import { OwnerDashboardOutroScene } from '../scenes/owner_dashboard/OwnerDashboardOutroScene';

/**
 * Reel Vertical 9:16 (1080x1920 @ 30fps)
 * Tema: Visibilidad Gerencial Sin Ruido y Navegación Contextual (NHILOS +1: Context travels)
 * Duración: 40.67 segundos (1,220 frames) — Opción A con padding de seguridad para Edge TTS es-MX-JorgeNeural (-4%)
 *
 * Estructura de Escenas y Sincronización:
 * - Escenas 1 y 2 (f0 - f315, 315f / 10.50s):
 *   - f0 - f45 (1.5s): Frame 0 Live Action — cursor pulsando "Stock crítico · 4 productos" ("Revisar críticos") en Atención Requerida.
 *   - f45 - f315 (9.0s): Corte de atención (scale 1.0 -> 1.07) hacia Cabecera Ejecutiva (Layer 1) y Atención Requerida (Layer 3).
 * - Escena 3 (f315 - f660, 345f / 11.50s):
 *   - Navegación contextual a /inventory?status=CRITICAL&source=dashboard mostrando los 4 insumos críticos ya filtrados y clic en "← Volver al Dashboard".
 * - Escena 4 (f660 - f980, 320f / 10.67s):
 *   - Retorno al Dashboard conservando el período "1–15 de noviembre de 2026 (vs. 1–15 oct)", cursor sobre indicador "Datos actualizados" y KPI "Margen Bruto 38.4%".
 * - Escena 5 (f980 - f1220, 240f / 8.00s):
 *   - Cierre canónico en #003757 con logo oficial, "NHILOS POS", y botón "Comenta DEMO".
 */
export const OwnerDashboardReel: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#003757] text-white relative overflow-hidden">
      {/* Pista de Locución (Edge TTS: es-MX-JorgeNeural, Rate: -4%, Pitch: +0Hz) */}
      <Series>
        <Series.Sequence durationInFrames={315}>
          <Audio src={staticFile('audio/owner_1_hook.mp3')} volume={1} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={345}>
          <Audio src={staticFile('audio/owner_2_context.mp3')} volume={1} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={320}>
          <Audio src={staticFile('audio/owner_3_kpis.mp3')} volume={1} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={240}>
          <Audio src={staticFile('audio/owner_4_outro.mp3')} volume={1} />
        </Series.Sequence>
      </Series>

      {/* Secuencia Visual Continua */}
      <Series>
        {/* Escenas 1 + 2 + 3 + 4: Ventana Web Backoffice2 continua (980 frames: f0..f980) */}
        <Series.Sequence durationInFrames={980}>
          <OwnerDashboardWebScene />
        </Series.Sequence>

        {/* Escena 5: Cierre Canónico CTA Comenta DEMO (240 frames: f980..f1220) */}
        <Series.Sequence durationInFrames={240}>
          <OwnerDashboardOutroScene />
        </Series.Sequence>
      </Series>
    </div>
  );
};
