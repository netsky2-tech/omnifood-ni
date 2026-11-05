import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  Cloud,
  CloudOff,
  CloudUpload,
  Database,
  RefreshCw,
  User,
  Wifi,
} from 'lucide-react';

export const OFFLINE_AMBER = '#D97706';
export const OFFLINE_AMBER_SOFT = '#F59E0B';

export type SyncMode = 'online' | 'protected' | 'syncing' | 'synced';

const MODE_CONFIG = {
  online: {
    color: '#00BF81',
    icon: Wifi,
    label: 'En Línea',
    note: 'Nube sincronizada · 0 pendientes',
  },
  protected: {
    color: OFFLINE_AMBER,
    icon: CloudOff,
    label: 'Venta local protegida',
    note: '1 ticket en cola',
  },
  syncing: {
    color: '#00BF81',
    icon: RefreshCw,
    label: 'Sincronizando',
    note: '1 ticket en cola',
  },
  synced: {
    color: '#00BF81',
    icon: Cloud,
    label: 'En sincronía',
    note: '0 pendientes · 1 folio único',
  },
} as const;

export const SyncStrip: React.FC<{
  mode: SyncMode;
  count?: number;
  compact?: boolean;
}> = ({ mode, count = 0, compact = false }) => {
  const frame = useCurrentFrame();
  const config = MODE_CONFIG[mode];
  const Icon = config.icon;
  const spin = mode === 'syncing' ? frame * 14 : 0;
  const note =
    mode === 'protected'
      ? count > 0
        ? `${count} ${count === 1 ? 'ticket' : 'tickets'} en cola`
        : '0 pendientes · caja operando'
      : config.note;

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap"
        style={{
          color: config.color,
          backgroundColor: `${config.color}1F`,
          borderColor: `${config.color}66`,
        }}
      >
        <Icon
          className="w-3 h-3"
          style={spin ? { transform: `rotate(${spin}deg)` } : undefined}
        />
        <span>{config.label}</span>
      </span>
    );
  }

  return (
    <div
      className="w-full rounded-lg px-2.5 py-1 flex items-center justify-between gap-2 border"
      style={{
        backgroundColor:
          mode === 'protected' ? 'rgba(217,119,6,0.14)' : 'rgba(0,191,129,0.12)',
        borderColor:
          mode === 'protected' ? 'rgba(217,119,6,0.38)' : 'rgba(0,191,129,0.32)',
      }}
    >
      <span
        className="flex items-center gap-1.5 text-[11px] font-bold leading-none"
        style={{ color: config.color }}
      >
        <Icon
          className="w-3 h-3 shrink-0"
          style={spin ? { transform: `rotate(${spin}deg)` } : undefined}
        />
        <span className="truncate">{config.label}</span>
      </span>
      <span
        className="text-[10px] font-semibold leading-none whitespace-nowrap"
        style={{ color: config.color }}
      >
        {note}
      </span>
    </div>
  );
};

export const TerminalStatusBar: React.FC<{
  mode: SyncMode;
  time?: string;
  count?: number;
}> = ({ mode, time = '12:52 PM', count = 0 }) => (
  <div className="bg-[#003757] text-white px-3 pt-2 pb-1.5 shrink-0">
    <div className="h-6 flex items-center justify-between text-[11px] font-medium">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-bold tracking-wide truncate">Café San Juan</span>
        <span className="text-white/40">|</span>
        <span className="text-white/80 flex items-center gap-1 shrink-0">
          <User className="w-3 h-3" /> Carlos Cajero
        </span>
      </div>
      <span className="text-white/70 shrink-0">{time}</span>
    </div>
    <div className="mt-1">
      <SyncStrip mode={mode} count={count} />
    </div>
  </div>
);

export const TerminalShell: React.FC<{
  children: React.ReactNode;
  width?: number;
  height?: number;
  scale?: number;
  animateEnter?: boolean;
  className?: string;
}> = ({
  children,
  width = 540,
  height = 860,
  scale = 1.2,
  animateEnter = true,
  className = '',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, mass: 0.9 } });
  const finalScale = animateEnter
    ? interpolate(enter, [0, 1], [0.96, scale])
    : scale;

  return (
    <div
      className={`relative rounded-[48px] bg-slate-900 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.6)] border-4 border-slate-700/80 overflow-hidden origin-center ${className}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        transform: `scale(${finalScale})`,
      }}
    >
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-48 h-3.5 bg-slate-800 rounded-full flex items-center justify-center z-30 border border-slate-700">
        <div className="w-32 h-1 bg-black/70 rounded-full" />
      </div>
      <div className="w-full h-full bg-[#F8FAFC] rounded-[32px] overflow-hidden flex flex-col pt-3 text-slate-800 relative">
        {children}
      </div>
    </div>
  );
};

export const LocalDatabaseChip: React.FC<{
  label?: string;
  tone?: 'green' | 'amber';
}> = ({ label = 'Base local', tone = 'green' }) => {
  const color = tone === 'amber' ? OFFLINE_AMBER : '#00BF81';
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border"
      style={{
        color,
        backgroundColor: `${color}1A`,
        borderColor: `${color}55`,
      }}
    >
      <Database className="w-4 h-4" />
      {label}
    </span>
  );
};

export const CloudQueueCard: React.FC<{
  mode: SyncMode;
  count: number;
}> = ({ mode, count }) => {
  const color = mode === 'protected' ? OFFLINE_AMBER : '#00BF81';
  const Icon = mode === 'protected' ? CloudOff : CloudUpload;
  return (
    <div
      className="w-full rounded-xl border px-4 py-2.5 flex items-center justify-between"
      style={{
        backgroundColor: `${color}12`,
        borderColor: `${color}44`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <Icon className="w-5 h-5" style={{ color }} />
        <div>
          <div className="text-[11px] font-black leading-tight" style={{ color }}>
            {mode === 'protected' ? 'Venta local protegida' : 'En sincronía'}
          </div>
          <div className="text-[10px] text-slate-500 leading-tight">
            {mode === 'protected'
              ? 'La caja sigue operando sin internet'
              : 'La nube alcanzó la caja'}
          </div>
        </div>
      </div>
      <span
        className="text-[11px] font-black px-2.5 py-1 rounded-full"
        style={{ color, backgroundColor: `${color}1F` }}
      >
        {count} {count === 1 ? 'ticket' : 'tickets'} en cola
      </span>
    </div>
  );
};
