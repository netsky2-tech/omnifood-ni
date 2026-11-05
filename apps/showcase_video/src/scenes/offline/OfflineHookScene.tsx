import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import {
  ChevronRight,
  Coffee,
  Plus,
  Router,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import {
  OFFLINE_AMBER,
  TerminalShell,
  TerminalStatusBar,
} from './OfflineChrome';

const SignalBars: React.FC<{ level: number }> = ({ level }) => (
  <div className="flex items-end gap-1.5 h-9">
    {[0, 1, 2, 3].map((index) => {
      const active = index < level;
      return (
        <span
          key={index}
          className="w-2.5 rounded-sm transition-all duration-200"
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

export const OfflineHookScene: React.FC = () => {
  const frame = useCurrentFrame();

  const signalLevel =
    frame < 24 ? 4 : frame < 38 ? 3 : frame < 50 ? 2 : frame < 60 ? 1 : 0;
  const isOffline = frame >= 60;

  const firstTap = frame >= 146 && frame <= 154;
  const secondTap = frame >= 196 && frame <= 204;
  const itemCount = frame >= 196 ? 2 : frame >= 146 ? 1 : 0;

  const sub1Opacity = interpolate(frame, [12, 24, 96, 108], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sub2Opacity = interpolate(frame, [104, 118, 228, 240], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const touchX = interpolate(frame, [175, 190], [91, 254], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const touchY = 205;

  const products = [
    { name: 'Cappuccino Artesanal', price: 'C$ 85.00', target: true },
    { name: 'Café Americano', price: 'C$ 60.00', target: true },
    { name: 'Latte Vainilla', price: 'C$ 90.00', target: false },
    { name: 'Espresso Doble', price: 'C$ 55.00', target: false },
    { name: 'Mocha Caliente', price: 'C$ 95.00', target: false },
    { name: 'Chocolate Caliente', price: 'C$ 70.00', target: false },
  ];

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[#003757]/80 rounded-full blur-[160px] pointer-events-none" />
      <div
        className="absolute -bottom-24 right-0 w-[620px] h-[620px] rounded-full blur-[180px] pointer-events-none"
        style={{
          backgroundColor: isOffline
            ? 'rgba(217,119,6,0.14)'
            : 'rgba(0,191,129,0.12)',
        }}
      />

      <div className="w-full pt-24 flex flex-col items-center z-10 text-center">
        <span
          className="text-sm font-bold tracking-widest uppercase px-6 py-2 rounded-full border mb-3 shadow-sm flex items-center gap-2"
          style={{
            color: isOffline ? OFFLINE_AMBER : '#00BF81',
            backgroundColor: isOffline
              ? 'rgba(217,119,6,0.14)'
              : 'rgba(0,191,129,0.14)',
            borderColor: isOffline
              ? 'rgba(217,119,6,0.45)'
              : 'rgba(0,191,129,0.4)',
          }}
        >
          {isOffline ? (
            <WifiOff className="w-4 h-4" />
          ) : (
            <ShieldCheck className="w-4 h-4" />
          )}
          <span>Continuidad Operativa</span>
        </span>
        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          Hora punta sin señal
        </h2>
      </div>

      <div className="w-full flex-1 flex flex-col items-center justify-center gap-12 z-20">
        <div
          className="w-[820px] rounded-3xl border px-7 py-5 flex items-center gap-5 shadow-2xl"
          style={{
            backgroundColor: 'rgba(2,15,26,0.88)',
            borderColor: isOffline
              ? 'rgba(217,119,6,0.45)'
              : 'rgba(255,255,255,0.12)',
          }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor: isOffline
                ? 'rgba(217,119,6,0.16)'
                : 'rgba(0,55,87,0.9)',
              borderColor: isOffline
                ? 'rgba(217,119,6,0.4)'
                : 'rgba(255,255,255,0.12)',
            }}
          >
            <Router
              className="w-8 h-8"
              style={{ color: isOffline ? OFFLINE_AMBER : '#00BF81' }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[3px] text-white/45">
              Red del local
            </div>
            <div className="text-xl font-black text-white tracking-wide">
              CAFE_SAN_JUAN_5G
            </div>
            <div
              className="text-xs font-semibold mt-0.5 flex items-center gap-1.5"
              style={{ color: isOffline ? OFFLINE_AMBER : '#2FE0A4' }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: isOffline ? OFFLINE_AMBER : '#00BF81',
                }}
              />
              {isOffline
                ? 'Sin acceso a internet · la caja no se detiene'
                : 'Conexión estable'}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <SignalBars level={signalLevel} />
            <div
              className="w-12 h-12 rounded-full border flex items-center justify-center"
              style={{
                color: isOffline ? OFFLINE_AMBER : '#00BF81',
                borderColor: isOffline
                  ? 'rgba(217,119,6,0.45)'
                  : 'rgba(0,191,129,0.4)',
                backgroundColor: isOffline
                  ? 'rgba(217,119,6,0.14)'
                  : 'rgba(0,191,129,0.14)',
              }}
            >
              <WifiOff className="w-6 h-6" />
            </div>
          </div>
        </div>

        <TerminalShell scale={1.08}>
          <TerminalStatusBar
            mode={isOffline ? 'protected' : 'online'}
            count={0}
          />

          <div className="h-11 bg-white border-b border-slate-200 px-3 flex items-center gap-2 shrink-0 overflow-hidden">
            <span className="px-3 py-1 rounded-full text-[11px] font-medium text-slate-600 bg-slate-100">
              Todos
            </span>
            <span className="px-3 py-1 rounded-full text-[11px] font-bold text-white bg-[#003757] shadow-sm">
              Bebidas Calientes
            </span>
            <span className="px-3 py-1 rounded-full text-[11px] font-medium text-slate-600 bg-slate-100">
              Postres
            </span>
          </div>

          <div className="flex-1 p-3 overflow-hidden flex flex-col">
            <div className="grid grid-cols-3 gap-2.5">
              {products.map((product, index) => {
                const isTapped =
                  (index === 0 && firstTap) || (index === 1 && secondTap);
                return (
                  <div
                    key={product.name}
                    className={`bg-white rounded-xl p-2.5 border-2 shadow-sm flex flex-col justify-between h-[150px] transition-all ${
                      isTapped
                        ? 'border-[#00BF81] bg-emerald-50/60 scale-[0.97]'
                        : 'border-slate-200'
                    }`}
                  >
                    <div
                      className={`w-full h-16 rounded-lg flex items-center justify-center ${
                        index % 2 === 0
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Coffee className="w-7 h-7" />
                    </div>
                    <div className="text-[10px] font-bold text-slate-800 leading-tight whitespace-nowrap">
                      {product.name}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="text-[11px] font-extrabold text-[#003757]">
                        {product.price}
                      </span>
                      <span className="w-5 h-5 rounded-full bg-[#003757] text-white flex items-center justify-center">
                        <Plus className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-auto rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0">
                <span className="w-2 h-2 rounded-full bg-[#D97706]" />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-black text-amber-900 leading-tight">
                  Modo local activo
                </div>
                <div className="text-[9px] font-semibold text-amber-700 leading-tight">
                  Productos y precios leídos desde la base local
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border-t-2 border-slate-200 p-3 shadow-lg shrink-0">
            {itemCount === 0 ? (
              <div className="mb-2 h-11 border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-xs text-slate-400">
                Seleccione un producto para iniciar
              </div>
            ) : (
              <div className="mb-2 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-[#003757] text-white flex items-center justify-center text-[9px]">
                      1
                    </span>
                    Cappuccino Artesanal
                  </span>
                  <span className="text-[#003757]">C$ 85.00</span>
                </div>
                {itemCount === 2 && (
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-[#003757] text-white flex items-center justify-center text-[9px]">
                        1
                      </span>
                      Café Americano
                    </span>
                    <span className="text-[#003757]">C$ 60.00</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Total a Cobrar
                </span>
                <span
                  className="text-2xl font-black text-[#003757]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {itemCount === 0
                    ? 'C$ 0.00'
                    : itemCount === 1
                    ? 'C$ 85.00'
                    : 'C$ 145.00'}
                </span>
              </div>
              <button
                type="button"
                className={`flex-1 h-14 rounded-xl font-black text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-md ${
                  itemCount > 0
                    ? 'bg-[#00BF81] text-slate-900'
                    : 'bg-slate-200 text-slate-400'
                }`}
              >
                <span>Cobrar</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div
            className="absolute pointer-events-none z-50"
            style={{
              left: `${touchX}px`,
              top: `${touchY}px`,
              transform: 'translate(-50%, -50%)',
              opacity: frame < 120 ? 0 : 1,
            }}
          >
            <div className="w-10 h-10 rounded-full bg-white/70 border-2 border-[#00BF81] shadow-xl flex items-center justify-center">
              <div className="w-3.5 h-3.5 rounded-full bg-[#00BF81]" />
            </div>
            {(firstTap || secondTap) && (
              <span className="absolute -inset-2 rounded-full bg-[#00BF81]/50 animate-ping pointer-events-none" />
            )}
          </div>
        </TerminalShell>
      </div>

      <div className="w-full h-[320px] flex flex-col items-center justify-start pt-6 z-30 text-center">
        {frame < 104 ? (
          <div
            className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg leading-tight max-w-3xl"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub1Opacity,
            }}
          >
            ¿Tu caja depende del internet?
          </div>
        ) : (
          <div
            className="text-5xl font-black tracking-[2px] drop-shadow-lg leading-tight max-w-3xl"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub2Opacity,
              color: '#FFFFFF',
            }}
          >
            La fila no puede esperar.
          </div>
        )}
      </div>
    </div>
  );
};
