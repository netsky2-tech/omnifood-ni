import React from 'react';
import { Series, Audio, staticFile } from 'remotion';
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
        <Audio src={staticFile('audio/scene_1_intro.mp3')} volume={1} />
        <IntroScene />
      </Series.Sequence>

      {/* 2. Paso 1: Creación de Cliente con Selector de Tipo Empresa: 240 frames (8.0s) */}
      <Series.Sequence durationInFrames={240}>
        <Audio src={staticFile('audio/scene_2_client.mp3')} volume={1} />
        <ClientCreateScene />
      </Series.Sequence>

      {/* 3. Paso 2: Creación de Promoción Convenio con Alcance y Cliente: 300 frames (10.0s) */}
      <Series.Sequence durationInFrames={300}>
        <Audio src={staticFile('audio/scene_3_promotion.mp3')} volume={1} />
        <PromotionCreateScene />
      </Series.Sequence>

      {/* 4. Paso 3: POS en Acción con CustomerSelectDialog y Descuento: 270 frames (9.0s) */}
      <Series.Sequence durationInFrames={270}>
        <Audio src={staticFile('audio/scene_4_pos.mp3')} volume={1} />
        <POSCheckoutScene />
      </Series.Sequence>

      {/* 5. Outro Oficial (Logo PNG, NHILOS POS y Slogan): 90 frames (3.0s) */}
      <Series.Sequence durationInFrames={90}>
        <Audio src={staticFile('audio/scene_5_outro.mp3')} volume={1} />
        <OutroScene />
      </Series.Sequence>
    </Series>
  );
};
