import React from 'react';
import { interpolate, Easing, useCurrentFrame } from 'remotion';
import { Cursor } from '../../components/Cursor';

export interface FiscalWaypoint {
  frame: number;
  x: number;
  y: number;
  click?: boolean;
}

export const FiscalCursorPath: React.FC<{
  waypoints: FiscalWaypoint[];
  visibleFrom?: number;
  visibleUntil?: number;
}> = ({ waypoints, visibleFrom = 0, visibleUntil = Number.MAX_SAFE_INTEGER }) => {
  const frame = useCurrentFrame();

  if (waypoints.length === 0) return null;

  let position = { x: waypoints[0].x, y: waypoints[0].y };
  let clicked = false;

  for (let i = 0; i < waypoints.length; i += 1) {
    const current = waypoints[i];
    const next = waypoints[i + 1];

    // Pulso de clic en el punto exacto
    if (current.click && frame >= current.frame && frame < current.frame + 8) {
      clicked = true;
    }

    if (!next) {
      if (frame >= current.frame) {
        position = { x: current.x, y: current.y };
      }
      break;
    }

    if (frame >= current.frame && frame <= next.frame) {
      const progress = interpolate(frame, [current.frame, next.frame], [0, 1], {
        easing: Easing.inOut(Easing.cubic),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      position = {
        x: current.x + (next.x - current.x) * progress,
        y: current.y + (next.y - current.y) * progress,
      };
      break;
    }
  }

  const visible = frame >= visibleFrom && frame <= visibleUntil;
  return <Cursor x={position.x} y={position.y} clicked={clicked} visible={visible} />;
};
