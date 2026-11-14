import React from 'react';
import { Series, Audio, staticFile } from 'remotion';
import { VoidAuditPosScene } from '../scenes/void_audit/VoidAuditPosScene';
import { VoidAuditDashboardScene } from '../scenes/void_audit/VoidAuditDashboardScene';
import { VoidAuditOutroScene } from '../scenes/void_audit/VoidAuditOutroScene';

/**
 * Reel Vertical 9:16 (1080x1920 @ 30fps)
 * Feature: nhilos_video_script_anulaciones_pin_auditoria_v1.0.md
 * Duración: 28.0 segundos (840 frames @ 30 FPS)
 *
 * Estructura Visual:
 * - Escenas 1 + 2 + 3 continuas en Terminal POS (f0..f390 — 390f / 13.0s):
 *   - Escena 1 (f0..f45): Macro-Zoom (scale: 1.55) sobre Factura #00418 (C$ 1,250.00) y botón ANULAR FACTURA.
 *   - Escena 2 (f45..f150): Corte de atención (1.55 -> 1.18) revelando modal de Motivo DGI + PIN de supervisor.
 *   - Escena 3 (f150..f390): Selección de "Error de captura", PIN 4 dígitos, y vista de Historial con #00418 ANULADA entre #00417 y #00419.
 * - Escena 4 en Owner Dashboard (f390..f630 — 240f / 8.0s):
 *   - Atención Requerida (Anulaciones · 1 · C$ 1,250.00) + tabla de bitácora auditada con hora, monto y supervisor.
 * - Escena 5 Cierre Canónico (f630..f840 — 210f / 7.0s):
 *   - Fondo #003757, logo PNG, NHILOS POS, botón #00BF81 con texto #003757 "Comenta CONTROL".
 */
export const VoidAuditReel: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#003757] text-white relative overflow-hidden">
      {/* Pista de Locución Sincronizada (Rate uniforme -2% / +0%, 975 frames totales) */}
      <Series>
        {/* Audio 1 (Escenas 1+2): 209f voz + 6f pausa = 215f */}
        <Series.Sequence durationInFrames={215}>
          <Audio src={staticFile('audio/void_1_hook.mp3')} volume={1} />
        </Series.Sequence>
        {/* Audio 2 (Escena 3): 289f voz + 6f pausa = 295f (termina en f510 exacto) */}
        <Series.Sequence durationInFrames={295}>
          <Audio src={staticFile('audio/void_2_pos.mp3')} volume={1} />
        </Series.Sequence>
        {/* Audio 3 (Escena 4): 219f voz + 21f pausa = 240f (f510..f750) */}
        <Series.Sequence durationInFrames={240}>
          <Audio src={staticFile('audio/void_3_dashboard.mp3')} volume={1} />
        </Series.Sequence>
        {/* Audio 4 (Escena 5): 204f voz + 21f pausa = 225f (f750..f975) */}
        <Series.Sequence durationInFrames={225}>
          <Audio src={staticFile('audio/void_4_outro.mp3')} volume={1} />
        </Series.Sequence>
      </Series>

      {/* Pista Visual (975 frames totales) */}
      <Series>
        <Series.Sequence durationInFrames={510}>
          <VoidAuditPosScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={240}>
          <VoidAuditDashboardScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={225}>
          <VoidAuditOutroScene />
        </Series.Sequence>
      </Series>
    </div>
  );
};
