import React from 'react';
import { Audio, Series, staticFile } from 'remotion';
import { OfflineHookScene } from '../scenes/offline/OfflineHookScene';
import { OfflineSaleScene } from '../scenes/offline/OfflineSaleScene';
import { OfflineSyncScene } from '../scenes/offline/OfflineSyncScene';
import { OfflineOutroScene } from '../scenes/offline/OfflineOutroScene';

export const OfflineReel: React.FC = () => {
  return (
    <Series>
      {/* Escena 1: El Wi-Fi cae en hora punta (8.0s - 240 frames). Locución: 212f (padding: 28f) */}
      <Series.Sequence durationInFrames={240}>
        <Audio src={staticFile('audio/offline_1_hook.mp3')} volume={1} />
        <OfflineHookScene />
      </Series.Sequence>

      {/* Escena 2: Cobro local e impresión inmediata (10.0s - 300 frames). Locución: 264f (padding: 36f) */}
      <Series.Sequence durationInFrames={300}>
        <Audio src={staticFile('audio/offline_2_sale.mp3')} volume={1} />
        <OfflineSaleScene />
      </Series.Sequence>

      {/* Escena 3: Reconexión e idempotencia (9.0s - 270 frames). Locución: 208f (padding: 62f) */}
      <Series.Sequence durationInFrames={270}>
        <Audio src={staticFile('audio/offline_3_sync.mp3')} volume={1} />
        <OfflineSyncScene />
      </Series.Sequence>

      {/* Escena 4: Cierre institucional y CTA (9.0s - 270 frames). Locución: 189f (padding: 81f) */}
      <Series.Sequence durationInFrames={270}>
        <Audio src={staticFile('audio/offline_4_outro.mp3')} volume={1} />
        <OfflineOutroScene />
      </Series.Sequence>
    </Series>
  );
};
