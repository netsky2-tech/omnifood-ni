import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import {
  Check,
  CheckCircle2,
  Cloud,
  CloudOff,
  Lock,
  RefreshCw,
  Router,
  Store,
  Wifi,
} from 'lucide-react';
import { OFFLINE_AMBER, SyncMode } from './OfflineChrome';

const SignalBars: React.FC<{ level: number }> = ({ level }) => (
  <div className="flex items-end gap-1.5 h-9">
    {[0, 1, 2, 3].map((index) => {
      const active = index < level;
      return (
        <span
          key={index}
          className="w-2.5 rounded-sm"
          style={{
            height: `${10 + index * 7}px`,
            backgroundColor: active ? '#00BF81' : 'rgba(255,255,255,0.16)',
            boxShadow: active ? '0 0 8px rgba(0,191,129,0.45)' : 'none',
          }}
        />
      );
    })}
  </div>
);

export const OfflineSyncScene: React.FC = () => {
  const frame = useCurrentFrame();

  const mode: SyncMode =
    frame < 30 ? 'protected' : frame < 88 ? 'syncing' : 'synced';
  const pendingCount = frame < 92 ? 1 : 0;
  const progress = interpolate(frame, [30, 90], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const signalLevel =
    frame < 16 ? 1 : frame < 30 ? 2 : frame < 44 ? 3 : 4;

  const statusColor =
    mode === 'protected' ? OFFLINE_AMBER : mode === 'syncing' ? '#00BF81' : '#00BF81';
  const StatusIcon =
    mode === 'protected' ? CloudOff : mode === 'syncing' ? RefreshCw : Cloud;
  const statusLabel =
    mode === 'protected'
      ? 'Venta local protegida'
      : mode === 'syncing'
      ? 'Sincronizando con la nube'
      : 'En sincronía';
  const statusNote =
    mode === 'protected'
      ? '1 ticket en cola'
      : mode === 'syncing'
      ? `${Math.round(progress)}% · 1 de 1 documentos`
      : '0 pendientes · 1 folio único';

  const rowHighlight = frame >= 96;
  const toastOpacity = interpolate(frame, [108, 124], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const sub1Opacity = interpolate(frame, [10, 24, 136, 148], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sub2Opacity = interpolate(frame, [142, 158, 260, 270], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[850px] h-[850px] bg-[#003757]/70 rounded-full blur-[170px] pointer-events-none" />
      <div className="absolute -bottom-24 right-0 w-[620px] h-[620px] bg-[#00BF81]/10 rounded-full blur-[180px] pointer-events-none" />

      <div className="w-full pt-24 flex flex-col items-center z-10 text-center">
        <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 mb-3 shadow-sm flex items-center gap-2">
          <Wifi className="w-4 h-4" />
          <span>Reconexión Automática</span>
        </span>
        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          La caja nunca dejó de vender
        </h2>
      </div>

      <div className="w-full flex-1 flex flex-col items-center justify-center gap-4 z-20">
        <div className="w-[920px] rounded-3xl bg-[#0A1B2A] border border-white/10 shadow-2xl px-6 py-4">
          <div className="flex items-center gap-5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: `${statusColor}18`,
                borderColor: `${statusColor}55`,
              }}
            >
              <Router className="w-7 h-7" style={{ color: statusColor }} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[3px] text-white/45">
                Red del local
              </div>
              <div className="text-lg font-black text-white tracking-wide">
                CAFE_SAN_JUAN_5G
              </div>
              <div className="text-[11px] font-semibold text-[#2FE0A4] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00BF81]" />
                {mode === 'protected'
                  ? 'Reconectando…'
                  : 'Señal restablecida'}
              </div>
            </div>

            <SignalBars level={signalLevel} />

            <div
              className="w-[330px] rounded-2xl border px-4 py-2.5"
              style={{
                backgroundColor: `${statusColor}14`,
                borderColor: `${statusColor}55`,
              }}
            >
              <div
                className="flex items-center justify-between gap-2 text-sm font-black"
                style={{ color: statusColor }}
              >
                <span className="flex items-center gap-2">
                  <StatusIcon
                    className="w-5 h-5"
                    style={
                      mode === 'syncing'
                        ? { transform: `rotate(${frame * 14}deg)` }
                        : undefined
                    }
                  />
                  {statusLabel}
                </span>
                <span className="text-xs font-black tabular-nums">
                  {pendingCount}
                </span>
              </div>
              <div className="text-[10px] font-semibold mt-0.5" style={{ color: statusColor }}>
                {statusNote}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progress}%`,
                  backgroundColor: mode === 'protected' ? OFFLINE_AMBER : '#00BF81',
                  boxShadow: '0 0 12px rgba(0,191,129,0.5)',
                }}
              />
            </div>
            <span className="text-[10px] font-bold text-white/60 tabular-nums w-12 text-right">
              {Math.round(progress)}%
            </span>
          </div>
        </div>

        <div className="relative w-[920px] h-[82px] flex items-center justify-center">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 bg-white/15" />
          {[0, 1, 2].map((index) => {
            const position = ((frame * 1.8 + index * 28) % 82) - 4;
            return (
              <span
                key={index}
                className="absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#00BF81]"
                style={{
                  top: `${position}px`,
                  opacity: mode === 'protected' ? 0.2 : 1,
                  boxShadow: '0 0 10px rgba(0,191,129,0.8)',
                }}
              />
            );
          })}
          <div className="absolute left-[calc(50%+24px)] flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[2px] text-white/45">
              Cola transaccional
            </span>
            <span className="px-2.5 py-1 rounded-full bg-[#00BF81]/15 border border-[#00BF81]/40 text-[10px] font-black text-[#00BF81] flex items-center gap-1">
              <Lock className="w-3 h-3" /> 1 venta = 1 folio
            </span>
          </div>
        </div>

        <div className="relative w-[920px] rounded-2xl bg-slate-50 border border-slate-300 shadow-2xl overflow-hidden">
          <header className="h-14 shrink-0 border-b border-slate-200 bg-white px-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Store className="h-4 w-4 text-[#003757]" />
              <div className="flex flex-col">
                <h2 className="text-xs font-bold text-slate-900 leading-tight">
                  Café San Juan
                </h2>
                <span className="text-[10px] text-slate-500 font-mono">
                  RUC: J0310000000000
                </span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00BF81]" />
              En Línea
            </span>
          </header>

          <main className="p-5 space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">
                  Ventas
                </h1>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Resumen de ventas del período · Hoy
                </p>
              </div>
              <span className="text-[10px] font-semibold text-slate-500 border border-slate-200 bg-white px-2.5 py-1 rounded-md">
                27/10/2026
              </span>
            </div>

            <div className="border-b border-slate-200">
              <nav className="-mb-px flex gap-5 text-xs font-medium">
                <span className="border-b-2 border-[#003757] pb-2 px-1 font-bold text-[#003757]">
                  Resumen
                </span>
                <span className="border-b-2 border-transparent pb-2 px-1 text-slate-500">
                  Ventas por Hora
                </span>
                <span className="border-b-2 border-transparent pb-2 px-1 text-slate-500">
                  Top Productos
                </span>
                <span className="border-b-2 border-transparent pb-2 px-1 text-slate-500">
                  Rendimiento Cajeros
                </span>
                <span className="border-b-2 border-transparent pb-2 px-1 text-slate-500">
                  Reconciliaciones
                </span>
              </nav>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Ventas Brutas
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
                  {rowHighlight ? 'C$ 12,480.00' : 'C$ 12,220.00'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Facturas
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
                  {rowHighlight ? 48 : 47}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Ticket Promedio
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
                  C$ 260.00
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#003757]">
                  Últimas ventas
                </h3>
                <span className="text-[10px] text-slate-500">
                  Reflejo de la terminal en la nube
                </span>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2 px-3">Factura</th>
                    <th className="py-2 px-3">Hora</th>
                    <th className="py-2 px-3">Cajero</th>
                    <th className="py-2 px-3 text-right">Total</th>
                    <th className="py-2 px-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  <tr
                    className={`transition-colors ${
                      rowHighlight ? 'bg-emerald-50' : 'bg-amber-50/60'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-black text-slate-900 flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor: rowHighlight ? '#00BF81' : OFFLINE_AMBER,
                        }}
                      />
                      001-001-01-00000107
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">12:52 PM</td>
                    <td className="py-2.5 px-3 text-slate-700">Carlos Cajero</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                      C$ 260.00
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {rowHighlight ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          <Check className="w-3 h-3" /> Sincronizada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                          <RefreshCw
                            className="w-3 h-3"
                            style={{ transform: `rotate(${frame * 14}deg)` }}
                          />
                          Sincronizando
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00BF81]" />
                      001-001-01-00000106
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">12:48 PM</td>
                    <td className="py-2.5 px-3 text-slate-700">Carlos Cajero</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                      C$ 195.00
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        <Check className="w-3 h-3" /> Sincronizada
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </main>

        </div>
      </div>

    {frame >= 108 && (
      <div
        className="pointer-events-none absolute right-8 top-[300px] w-[340px] rounded-xl border border-emerald-200 bg-white p-3 shadow-2xl z-40"
        style={{
          opacity: toastOpacity,
          transform: `translateY(${(1 - toastOpacity) * 12}px)`,
        }}
      >
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-[#00BF81]" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-900 leading-tight">
              Venta #00107 sincronizada
            </p>
            <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
              Sin duplicados · folio único confirmado por la nube
            </p>
          </div>
        </div>
      </div>
    )}

      <div className="w-full h-[320px] flex flex-col items-center justify-start pt-6 z-30 text-center">
        {frame < 142 ? (
          <div
            className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub1Opacity,
            }}
          >
            Sincronización idempotente.
          </div>
        ) : (
          <div
            className="text-5xl font-black text-[#00BF81] tracking-[2px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)] leading-tight"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub2Opacity,
            }}
          >
            Cero duplicados. Cero pérdidas.
          </div>
        )}
      </div>
    </div>
  );
};
