import React from 'react';
import { Series, Audio, staticFile } from 'remotion';
import { HoldOrdersTerminalScene } from '../scenes/hold_orders/HoldOrdersTerminalScene';
import { HoldOrdersCheckoutScene } from '../scenes/hold_orders/HoldOrdersCheckoutScene';
import { HoldOrdersOutroScene } from '../scenes/hold_orders/HoldOrdersOutroScene';

/**
 * Reel Vertical 9:16 (1080x1920 @ 30fps)
 * Tema: Agilidad Operativa y Cuentas en Espera en Mostrador (Eliminar el bloqueo de fila)
 * Duración: 35.5 segundos (1,065 frames) — Opción A con padding de seguridad para Edge TTS es-MX-JorgeNeural (-4%)
 *
 * Estructura de Escenas y Sincronización:
 * - Escenas 1, 2 y 3 (f0 - f590, 590f / 19.67s):
 *   - f0 - f45 (1.5s): Frame 0 Live Action pulsando "Poner en Espera" -> Carrito se despeja a C$ 0.00.
 *   - f45 - f280 (7.83s): Corte de atención (scale 1.0 -> 1.08) hacia indicador "En espera (1)" + Café Americano (C$ 60.00).
 *   - f280 - f590 (10.33s): Toque en "En espera (1)" -> Drawer lateral -> Recuperar Orden #12 (Capuccino + Leche de Almendras, C$ 105.00) -> Toque en "Cobrar (C$ 105.00)".
 * - Escena 4 (f590 - f835, 245f / 8.17s):
 *   - Modal Multimoneda (C$ 105.00 / $ 2.87 USD) -> Impresión inmediata de ticket térmico con variantes intactas.
 * - Escena 5 (f835 - f1065, 230f / 7.67s):
 *   - Cierre canónico en #003757 con logo oficial, "NHILOS POS", y botón "Comenta DEMO".
 */
export const HoldOrdersReel: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#003757] text-white relative overflow-hidden">
      {/* Pista de Locución (Edge TTS: es-MX-JorgeNeural, Rate: -4%, Pitch: +0Hz) */}
      <Series>
        <Series.Sequence durationInFrames={280}>
          <Audio src={staticFile('audio/hold_1_hook.mp3')} volume={1} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={310}>
          <Audio src={staticFile('audio/hold_2_resume.mp3')} volume={1} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={245}>
          <Audio src={staticFile('audio/hold_3_checkout.mp3')} volume={1} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={230}>
          <Audio src={staticFile('audio/hold_4_outro.mp3')} volume={1} />
        </Series.Sequence>
      </Series>

      {/* Secuencia Visual Continua */}
      <Series>
        {/* Escenas 1 + 2 + 3: Terminal MIRAY Q80 continua (590 frames: f0..f590) */}
        <Series.Sequence durationInFrames={590}>
          <HoldOrdersTerminalScene />
        </Series.Sequence>

        {/* Escena 4: Modal Multimoneda + Ticket Térmico 58mm (245 frames: f590..f835) */}
        <Series.Sequence durationInFrames={245}>
          <HoldOrdersCheckoutScene />
        </Series.Sequence>

        {/* Escena 5: Cierre Canónico CTA Comenta DEMO (230 frames: f835..f1065) */}
        <Series.Sequence durationInFrames={230}>
          <HoldOrdersOutroScene />
        </Series.Sequence>
      </Series>
    </div>
  );
};
