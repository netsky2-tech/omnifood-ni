import React, { RefObject, useLayoutEffect, useState } from 'react';
import { interpolate, Easing, useCurrentFrame } from 'remotion';
import { Cursor } from '../../components/Cursor';

export interface Waypoint {
  frame: number;
  /** Coordenada fija en la escena (1920x1080). */
  x?: number;
  y?: number;
  /** Alternativa a x/y: centro medido del elemento con data-cursor="<name>". */
  target?: string;
  /** Dispara el pulso de clic en este punto de la ruta. */
  click?: boolean;
}

export type CursorTargets = Record<string, { x: number; y: number }>;

/**
 * Mide el centro real de los elementos marcados con `data-cursor` usando el DOM
 * del render. Evita coordenadas adivinadas: si el layout cambia (scroll,
 * contenido expandido), el cursor sigue apuntando al elemento correcto.
 *
 * La medición se cachea en un ref y se refresca cada frame; el cursor usa el
 * valor del frame anterior (1 frame de retraso, imperceptible).
 */
export const useCursorTargets = (
  names: string[],
  sceneRoot: RefObject<HTMLElement | null>,
  scrollY = 0,
): CursorTargets => {
  const frame = useCurrentFrame();
  const key = names.join('|');
  const [targets, setTargets] = useState<CursorTargets>({});

  useLayoutEffect(() => {
    const root = sceneRoot.current;
    const next: CursorTargets = {};

    if (root) {
      for (const name of names) {
        const element = document.querySelector(`[data-cursor="${name}"]`) as HTMLElement | null;
        if (!element) continue;
        const pos = measureTarget(element, root);
        if (!pos) continue;
        next[name] = pos;
      }
    }

    setTargets((previous) => (isSameMeasurement(previous, next) ? previous : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, key, scrollY]);

  return targets;
};

/**
 * Mide la posición central del elemento en coordenadas 1920x1080 del root.
 * getBoundingClientRect() captura fielmente CSS grid, flex, y transformaciones
 * (como translateY de scroll), normalizando por el zoom de renderizado.
 */
const measureTarget = (
  element: HTMLElement,
  root: HTMLElement,
): { x: number; y: number } | null => {
  const rootRect = root.getBoundingClientRect();
  const elRect = element.getBoundingClientRect();
  if (rootRect.width < 1000 || rootRect.height < 500) return null;

  return {
    x: Math.round(elRect.left - rootRect.left + elRect.width / 2),
    y: Math.round(elRect.top - rootRect.top + elRect.height / 2),
  };
};

const isSameMeasurement = (a: CursorTargets, b: CursorTargets): boolean => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return bKeys.every(
    (key) => a[key] && Math.abs(a[key].x - b[key].x) < 0.5 && Math.abs(a[key].y - b[key].y) < 0.5,
  );
};

export const FALLBACK_TARGETS: Record<string, { x: number; y: number }> = {
  'sidebar-clientes': { x: 205, y: 696 },
  'tab-directory': { x: 437, y: 272 },
  'tab-metrics': { x: 520, y: 272 },
  'range-this-month': { x: 443, y: 352 },
  'day-martes': { x: 1255, y: 460 },
  'peak-hour-0': { x: 1200, y: 568 },
  'ranking-row-bac': { x: 760, y: 340 },
  'detail-pdf': { x: 1690, y: 421 },
  'detail-excel': { x: 1642, y: 421 },
};

/**
 * Cursor con física de la skill: viaja, reposa (dwell) y sólo entonces pulsa.
 * El reposo se modela dejando el waypoint del destino unos frames antes del
 * clic: la interpolación llega y queda quieta antes del pulso verde.
 */
export const CursorPath: React.FC<{
  waypoints: Waypoint[];
  targets?: CursorTargets;
  visibleFrom?: number;
  visibleUntil?: number;
}> = ({ waypoints, targets = {}, visibleFrom = 0, visibleUntil = Number.MAX_SAFE_INTEGER }) => {
  const frame = useCurrentFrame();

  const resolve = (point: Waypoint): { x: number; y: number } => {
    if (
      point.target &&
      targets[point.target] &&
      targets[point.target].x > 0 &&
      targets[point.target].x <= 1920 &&
      targets[point.target].y > 0 &&
      targets[point.target].y <= 1080
    ) {
      return targets[point.target];
    }
    if (point.target && FALLBACK_TARGETS[point.target]) {
      return FALLBACK_TARGETS[point.target];
    }
    return { x: point.x ?? 0, y: point.y ?? 0 };
  };

  let position = resolve(waypoints[0]);
  let clicked = false;

  for (let i = 0; i < waypoints.length; i += 1) {
    const current = waypoints[i];
    const next = waypoints[i + 1];

    if (current.click && frame >= current.frame && frame < current.frame + 9) {
      clicked = true;
    }

    if (!next) {
      if (frame >= current.frame) position = resolve(current);
      break;
    }

    if (frame >= current.frame && frame <= next.frame) {
      const progress = interpolate(frame, [current.frame, next.frame], [0, 1], {
        easing: Easing.inOut(Easing.cubic),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const from = resolve(current);
      const to = resolve(next);
      position = {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      };
      break;
    }
  }

  const visible = frame >= visibleFrom && frame <= visibleUntil;
  return <Cursor x={position.x} y={position.y} clicked={clicked} visible={visible} />;
};
