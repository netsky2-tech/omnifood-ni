import React from 'react';
import { Series, Audio, staticFile } from 'remotion';
import { SpeedHookScene } from '../scenes/speed/SpeedHookScene';
import { SpeedTerminalScene } from '../scenes/speed/SpeedTerminalScene';
import { SpeedCheckoutScene } from '../scenes/speed/SpeedCheckoutScene';
import { SpeedOutroScene } from '../scenes/speed/SpeedOutroScene';

export const SpeedReel: React.FC = () => {
  return (
    <Series>
      {/* Escena 1: Hook & Contraste (6.0s - 180 frames). Locución: 164f (padding: 16f) */}
      <Series.Sequence durationInFrames={180}>
        <Audio src={staticFile('audio/speed_1_hook.mp3')} volume={1} />
        <SpeedHookScene />
      </Series.Sequence>

      {/* Escena 2: Terminal MIRAY Q80 & Extras (9.33s - 280 frames). Locución: 260f (padding: 20f) */}
      <Series.Sequence durationInFrames={280}>
        <Audio src={staticFile('audio/speed_2_terminal.mp3')} volume={1} />
        <SpeedTerminalScene />
      </Series.Sequence>

      {/* Escena 3: Cobro Multimoneda & Vuelto Tabular (8.67s - 260 frames). Locución: 226f (padding: 34f) */}
      <Series.Sequence durationInFrames={260}>
        <Audio src={staticFile('audio/speed_3_checkout.mp3')} volume={1} />
        <SpeedCheckoutScene />
      </Series.Sequence>

      {/* Escena 4: Ticket Térmico 58mm & Cierre Oficial CTA (8.0s - 240 frames). Locución: 218f (padding: 22f) */}
      <Series.Sequence durationInFrames={240}>
        <Audio src={staticFile('audio/speed_4_outro.mp3')} volume={1} />
        <SpeedOutroScene />
      </Series.Sequence>
    </Series>
  );
};
