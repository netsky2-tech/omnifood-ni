import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import {
  BehaviorCards,
  DateRangeBar,
  KpiGrid,
  MetricsWindow,
} from './MetricsChrome';

export const MetricsKpiScene: React.FC = () => {
  const frame = useCurrentFrame();

  // El subrayado verde recorre la tarjeta de descuentos: es el beneficio que
  // el convenio otorgó y el puente narrativo con la parte 1.
  const highlight = interpolate(frame, [75, 150], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <MetricsWindow activeTab="metrics">
      <DateRangeBar pressedFrom={0} />
      <KpiGrid highlight={highlight} />
      <BehaviorCards animate={false} showAnnotation={false} />
    </MetricsWindow>
  );
};
