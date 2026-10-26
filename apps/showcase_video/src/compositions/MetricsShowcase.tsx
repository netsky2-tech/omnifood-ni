import React from 'react';
import { Audio, Series, staticFile } from 'remotion';
import { OutroScene } from '../scenes/OutroScene';
import { MetricsIntro } from '../scenes/metrics/MetricsChrome';
import { MetricsNavScene } from '../scenes/metrics/MetricsNavScene';
import { MetricsKpiScene } from '../scenes/metrics/MetricsKpiScene';
import { MetricsBehaviorScene } from '../scenes/metrics/MetricsBehaviorScene';
import { MetricsRankingScene } from '../scenes/metrics/MetricsRankingScene';

/**
 * Parte 2 del showcase: Métricas de Convenios.
 *
 * Duraciones = locución medida + 20 a 30 frames de holgura (regla §6 de la
 * skill). Audios: intro 153f, nav 248f, kpis 219f, behavior 181f, ranking 249f,
 * outro 121f.
 */
export const MetricsShowcase: React.FC = () => {
  return (
    <Series>
      {/* 1. Intro de marca: 190 frames (6.3s) para 153 frames de locución */}
      <Series.Sequence durationInFrames={190}>
        <Audio src={staticFile('audio/metrics_1_intro.mp3')} volume={1} />
        <MetricsIntro badge="Métricas de Convenios" />
      </Series.Sequence>

      {/* 2. De Clientes a Métricas: 285 frames (9.5s) para 248 de locución */}
      <Series.Sequence durationInFrames={285}>
        <Audio src={staticFile('audio/metrics_2_nav.mp3')} volume={1} />
        <MetricsNavScene />
      </Series.Sequence>

      {/* 3. Franja de KPIs: 255 frames (8.5s) para 219 de locución */}
      <Series.Sequence durationInFrames={255}>
        <Audio src={staticFile('audio/metrics_3_kpis.mp3')} volume={1} />
        <MetricsKpiScene />
      </Series.Sequence>

      {/* 4. Productos, días y horas: 220 frames (7.3s) para 181 de locución */}
      <Series.Sequence durationInFrames={220}>
        <Audio src={staticFile('audio/metrics_4_behavior.mp3')} volume={1} />
        <MetricsBehaviorScene />
      </Series.Sequence>

      {/* 5. Ranking, detalle y exportación: 290 frames (9.7s) para 249 */}
      <Series.Sequence durationInFrames={290}>
        <Audio src={staticFile('audio/metrics_5_ranking.mp3')} volume={1} />
        <MetricsRankingScene />
      </Series.Sequence>

      {/* 6. Outro oficial: 155 frames (5.2s) para 121 de locución */}
      <Series.Sequence durationInFrames={155}>
        <Audio src={staticFile('audio/metrics_6_outro.mp3')} volume={1} />
        <OutroScene />
      </Series.Sequence>
    </Series>
  );
};
