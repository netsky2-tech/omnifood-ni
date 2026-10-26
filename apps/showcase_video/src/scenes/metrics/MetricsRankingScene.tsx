import React, { useRef } from 'react';
import { interpolate, spring, useCurrentFrame } from 'remotion';
import {
  BehaviorCards,
  DateRangeBar,
  KpiGrid,
  MetricsWindow,
  RankingCard,
  SuccessToast,
} from './MetricsChrome';
import { CursorPath, useCursorTargets } from './CursorPath';

export const MetricsRankingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const sceneRoot = useRef<HTMLDivElement>(null);

  const scrollSpring = spring({
    frame: frame - 4,
    fps: 30,
    config: { damping: 20, mass: 0.9 },
    durationInFrames: 38,
  });
  const scrollY = interpolate(scrollSpring, [0, 1], [0, 634]);
  const targets = useCursorTargets(['ranking-row-bac', 'detail-pdf'], sceneRoot, scrollY);

  const expanded = frame >= 86;
  const detailExport = frame < 152 ? 'idle' : frame < 205 ? 'loading' : 'done';

  const toast = interpolate(frame, [208, 224], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <MetricsWindow
      rootRef={sceneRoot}
      activeTab="metrics"
      scrollY={scrollY}
      overlay={
        <>
          <CursorPath
            targets={targets}
            visibleFrom={20}
            waypoints={[
              { frame: 24, x: 980, y: 900 },
              { frame: 62, target: 'ranking-row-bac' },
              // Dwell sobre la fila antes de expandir el detalle.
              { frame: 78, target: 'ranking-row-bac', click: true },
              { frame: 128, target: 'detail-pdf' },
              { frame: 148, target: 'detail-pdf', click: true },
              { frame: 190, x: 1590, y: 480 },
            ]}
          />
          <SuccessToast
            progress={toast}
            title="Detalle de consumo (PDF)"
            description="Se descargó el reporte de productos para Banco Atlántico de Nicaragua."
          />
        </>
      }
    >
      <DateRangeBar pressedFrom={0} />
      <KpiGrid highlight={1} />
      <BehaviorCards animate={false} showAnnotation={false} />
      <RankingCard expanded={expanded} detailExport={detailExport} />
    </MetricsWindow>
  );
};
