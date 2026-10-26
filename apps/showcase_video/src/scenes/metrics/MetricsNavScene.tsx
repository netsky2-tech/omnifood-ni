import React, { useRef } from 'react';
import { useCurrentFrame } from 'remotion';
import {
  BehaviorCards,
  DateRangeBar,
  DirectoryTable,
  KpiGrid,
  MetricsLoading,
  MetricsWindow,
} from './MetricsChrome';
import { CursorPath, useCursorTargets } from './CursorPath';

export const MetricsNavScene: React.FC = () => {
  const frame = useCurrentFrame();
  const sceneRoot = useRef<HTMLDivElement>(null);
  const targets = useCursorTargets(['sidebar-clientes', 'tab-metrics', 'range-this-month'], sceneRoot);

  const tabActive = frame >= 108 ? 'metrics' : 'directory';

  return (
    <MetricsWindow
      rootRef={sceneRoot}
      activeTab={tabActive}
      overlay={
        <>
        <CursorPath
          targets={targets}
          visibleFrom={10}
          waypoints={[
            // Parte 1 dejó al usuario en Promociones; aquí vuelve a Clientes.
            { frame: 14, x: 1180, y: 760 },
            { frame: 48, target: 'sidebar-clientes' },
            // Dwell sobre el ítem del sidebar antes de seguir a las pestañas.
            { frame: 62, target: 'sidebar-clientes' },
            { frame: 92, target: 'tab-metrics' },
            // Dwell de 13 frames y clic limpio sobre "Métricas".
            { frame: 105, target: 'tab-metrics', click: true },
            { frame: 140, x: 700, y: 420 },
            { frame: 168, target: 'range-this-month' },
            { frame: 176, target: 'range-this-month', click: true },
            { frame: 205, x: 720, y: 620 },
          ]}
        />
        </>
      }
    >
      {tabActive === 'directory' ? (
        <DirectoryTable />
      ) : frame < 126 ? (
        <MetricsLoading />
      ) : (
        <>
          <DateRangeBar pressedFrom={178} />
          <KpiGrid highlight={0} />
          <BehaviorCards animate={false} showAnnotation={false} />
        </>
      )}
    </MetricsWindow>
  );
};
