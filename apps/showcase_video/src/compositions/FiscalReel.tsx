import React from 'react';
import { Series, Audio, staticFile } from 'remotion';
import { FiscalCorrelativeScene } from '../scenes/fiscal/FiscalCorrelativeScene';
import { FiscalVoidScene } from '../scenes/fiscal/FiscalVoidScene';
import { FiscalExportScene } from '../scenes/fiscal/FiscalExportScene';
import { FiscalAuditOutroScene } from '../scenes/fiscal/FiscalAuditOutroScene';

export const FiscalReel: React.FC = () => {
  return (
    <Series>
      {/* Escena 1: Secuencia Correlativa Estricta (7.33s - 220 frames). Locución: 200f (padding: 20f) */}
      <Series.Sequence durationInFrames={220}>
        <Audio src={staticFile('audio/fiscal_1_intro.mp3')} volume={1} />
        <FiscalCorrelativeScene />
      </Series.Sequence>

      {/* Escena 2: Anulación Inmutable (10.0s - 300 frames). Locución: 240f (padding: 60f) */}
      <Series.Sequence durationInFrames={300}>
        <Audio src={staticFile('audio/fiscal_2_void.mp3')} volume={1} />
        <FiscalVoidScene />
      </Series.Sequence>

      {/* Escena 3: Libro de Ventas & Exportación Limpia (9.33s - 280 frames). Locución: 257f (padding: 23f) */}
      <Series.Sequence durationInFrames={280}>
        <Audio src={staticFile('audio/fiscal_3_export.mp3')} volume={1} />
        <FiscalExportScene />
      </Series.Sequence>

      {/* Escena 4: Bitácora Forense & Cierre Oficial CTA (8.33s - 250 frames). Locución: 199f (padding: 51f) */}
      <Series.Sequence durationInFrames={250}>
        <Audio src={staticFile('audio/fiscal_4_outro.mp3')} volume={1} />
        <FiscalAuditOutroScene />
      </Series.Sequence>
    </Series>
  );
};
