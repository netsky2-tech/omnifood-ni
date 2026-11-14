import React from 'react';
import { Audio, Sequence, Series, staticFile } from 'remotion';
import { MultiCurrencyPosScene } from '../scenes/multi_currency/MultiCurrencyPosScene';
import { MultiCurrencyTicketScene } from '../scenes/multi_currency/MultiCurrencyTicketScene';
import { MultiCurrencyOutroScene } from '../scenes/multi_currency/MultiCurrencyOutroScene';

/**
 * MultiCurrencyReel (9:16 Vertical - 1080x1920 @ 30fps, 840 frames = 28.0s)
 * Semana 3 - Clip 2 (Jueves): Cobro Multimoneda y Vuelto Exacto al Centavo.
 *
 * Estructura de Escenas y Timecodes:
 * - Escenas 1, 2 y 3 (f0 - f390 / 0.0s - 13.0s):
 *   - Escena 1 (f0 - f45): Frame 0 en Macro-Zoom (scale: 1.60) pulsando el billete rápido "$ 50" y encendiendo "Vuelto: C$ 1,191.22"
 *   - Escena 2 (f45 - f150): Corte de atención (1.60 -> 1.16) mostrando `MultiCurrencyCheckoutDialog` completo (`Total a Cobrar: C$ 640.00`, `$17.47 USD`, `TC BCN: 36.6243`)
 *   - Escena 3 (f150 - f390): Simulación de pago mixto en `Pago Dividido` (`$ 10.00 USD + C$ 300.00` -> `Vuelto exacto: C$ 26.24` en tipografía tabular fija) y toque en `COBRAR`
 * - Escena 4 (f390 - f630 / 13.0s - 21.0s):
 *   - Ticket térmico de 80 mm (`ReceiptLayoutFormatter.format80mm`) con desglose bimoneda y separación en gaveta virtual para el arqueo ciego
 * - Escena 5 (f630 - f840 / 21.0s - 28.0s):
 *   - Cierre canónico `#003757` + `logo.png` + CTA `#00BF81` (`Comenta DEMO` / `Acceso a la demostración operativa`)
 */
export const MultiCurrencyReel: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#001F33] relative overflow-hidden">
      {/* Locución Edge TTS (es-MX-JorgeNeural, Rate uniforme -2% / +0%) con holgura natural */}
      <Series>
        {/* Escena 1 (141f de voz + 4f pausa = 145f) */}
        <Series.Sequence durationInFrames={145}>
          <Audio src={staticFile('audio/fx_1_hook.mp3')} />
        </Series.Sequence>
        {/* Escena 2 (205f de voz + 5f pausa = 210f) -> acumula 355f */}
        <Series.Sequence durationInFrames={210}>
          <Audio src={staticFile('audio/fx_2_context.mp3')} />
        </Series.Sequence>
        {/* Escena 3 (280f de voz + 10f pausa = 290f) -> acumula 645f exactos al corte al ticket 80mm */}
        <Series.Sequence durationInFrames={290}>
          <Audio src={staticFile('audio/fx_3_mixed.mp3')} />
        </Series.Sequence>
        {/* Escena 4 (219f de voz + 21f pausa = 240f) */}
        <Series.Sequence durationInFrames={240}>
          <Audio src={staticFile('audio/fx_4_ticket.mp3')} />
        </Series.Sequence>
        {/* Escena 5 (211f de voz + 14f pausa = 225f) */}
        <Series.Sequence durationInFrames={225}>
          <Audio src={staticFile('audio/fx_5_outro.mp3')} />
        </Series.Sequence>
      </Series>

      {/* Escenas 1, 2 y 3 (645 frames): Terminal POS + MultiCurrencyCheckoutDialog */}
      <Sequence from={0} durationInFrames={645}>
        <MultiCurrencyPosScene />
      </Sequence>

      {/* Escena 4 (240 frames): Ticket Térmico de 80 mm */}
      <Sequence from={645} durationInFrames={240}>
        <MultiCurrencyTicketScene />
      </Sequence>

      {/* Escena 5 (225 frames): Cierre Canónico NHILOS POS */}
      <Sequence from={885} durationInFrames={225}>
        <MultiCurrencyOutroScene />
      </Sequence>
    </div>
  );
};
