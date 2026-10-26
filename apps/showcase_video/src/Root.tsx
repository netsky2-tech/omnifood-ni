import React from 'react';
import { Composition } from 'remotion';
import { ShowcaseMaster } from './compositions/ShowcaseMaster';
import { SocialReel } from './compositions/SocialReel';
import { MetricsShowcase } from './compositions/MetricsShowcase';
import { COMPOSITION_PRESETS } from './tokens/brand';
import './styles/global.css';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 1. Composición Master 16:9 (Horizontal para Web / Demos / YouTube) */}
      <Composition
        id={COMPOSITION_PRESETS.showcaseMaster.id}
        component={ShowcaseMaster}
        durationInFrames={COMPOSITION_PRESETS.showcaseMaster.durationInFrames}
        fps={COMPOSITION_PRESETS.showcaseMaster.fps}
        width={COMPOSITION_PRESETS.showcaseMaster.width}
        height={COMPOSITION_PRESETS.showcaseMaster.height}
      />

      {/* 2. Parte 2 del showcase: Métricas de Convenios (16:9) */}
      <Composition
        id={COMPOSITION_PRESETS.metricsShowcase.id}
        component={MetricsShowcase}
        durationInFrames={COMPOSITION_PRESETS.metricsShowcase.durationInFrames}
        fps={COMPOSITION_PRESETS.metricsShowcase.fps}
        width={COMPOSITION_PRESETS.metricsShowcase.width}
        height={COMPOSITION_PRESETS.metricsShowcase.height}
      />

      {/* 3. Composición Vertical 9:16 (Instagram Reels / TikTok / YouTube Shorts) */}
      <Composition
        id={COMPOSITION_PRESETS.socialReel.id}
        component={SocialReel}
        durationInFrames={COMPOSITION_PRESETS.socialReel.durationInFrames}
        fps={COMPOSITION_PRESETS.socialReel.fps}
        width={COMPOSITION_PRESETS.socialReel.width}
        height={COMPOSITION_PRESETS.socialReel.height}
      />
    </>
  );
};
