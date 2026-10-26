import React, { useRef } from 'react';
import { interpolate, spring, useCurrentFrame } from 'remotion';
import {
  BehaviorCards,
  DateRangeBar,
  KpiGrid,
  MetricsWindow,
} from './MetricsChrome';
import { CursorPath, useCursorTargets } from './CursorPath';

/** La cámara baja por la página para poner en foco la tarjeta de patrón. */
export const MetricsBehaviorScene: React.FC = () => {
  const frame = useCurrentFrame();
  const sceneRoot = useRef<HTMLDivElement>(null);

  const scroll = spring({
    frame: frame - 6,
    fps: 30,
    config: { damping: 20, mass: 0.8 },
    durationInFrames: 34,
  });
  const scrollY = interpolate(scroll, [0, 1], [0, 170]);
  const targets = useCursorTargets(['day-martes', 'peak-hour-0'], sceneRoot, scrollY);

  return (
    <MetricsWindow
      rootRef={sceneRoot}
      activeTab="metrics"
      scrollY={scrollY}
      overlay={
        <CursorPath
          targets={targets}
          visibleFrom={12}
          waypoints={[
            { frame: 12, x: 1560, y: 700 },
            // Martes: el día pico de la semana.
            { frame: 58, target: 'day-martes' },
            { frame: 96, target: 'day-martes' },
            // Franja de mayor afluencia (12:30 PM).
            { frame: 132, target: 'peak-hour-0' },
            { frame: 175, target: 'peak-hour-0' },
          ]}
        />
      }
    >
      <DateRangeBar pressedFrom={0} />
      <KpiGrid highlight={1} animate={false} />
      <BehaviorCards showAnnotation />
    </MetricsWindow>
  );
};
