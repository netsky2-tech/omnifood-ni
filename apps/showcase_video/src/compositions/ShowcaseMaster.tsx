import React from 'react';
import { Series } from 'remotion';
import { IntroScene } from '../scenes/IntroScene';
import { ClientCreateScene } from '../scenes/ClientCreateScene';
import { PromotionCreateScene } from '../scenes/PromotionCreateScene';
import { POSCheckoutScene } from '../scenes/POSCheckoutScene';
import { OutroScene } from '../scenes/OutroScene';

export const ShowcaseMaster: React.FC = () => {
  return (
    <Series>
      {/* 1. Intro de Marca: 90 frames (3.0s) */}
      <Series.Sequence durationInFrames={90}>
        <IntroScene />
      </Series.Sequence>

      {/* 2. Paso 1: Creación de Cliente con Selector de Tipo Empresa: 240 frames (8.0s) */}
      <Series.Sequence durationInFrames={240}>
        <ClientCreateScene />
      </Series.Sequence>

      {/* 3. Paso 2: Creación de Promoción Convenio con Alcance y Cliente: 300 frames (10.0s) */}
      <Series.Sequence durationInFrames={300}>
        <PromotionCreateScene />
      </Series.Sequence>

      {/* 4. Paso 3: POS en Acción con CustomerSelectDialog y Descuento: 270 frames (9.0s) */}
      <Series.Sequence durationInFrames={270}>
        <POSCheckoutScene />
      </Series.Sequence>

      {/* 5. Outro Oficial (Logo PNG, NHILOS POS y Slogan): 90 frames (3.0s) */}
      <Series.Sequence durationInFrames={90}>
        <OutroScene />
      </Series.Sequence>
    </Series>
  );
};
