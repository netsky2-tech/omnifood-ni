import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  Banknote,
  Check,
  CheckCircle2,
  ChevronRight,
  Coffee,
  Database,
  Printer,
  Store,
} from 'lucide-react';
import {
  LocalDatabaseChip,
  SyncStrip,
  TerminalShell,
  TerminalStatusBar,
} from './OfflineChrome';

export const OfflineSaleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isModalOpen = frame >= 26 && frame < 112;
  const isCashSelected = frame >= 62;
  const isCompleting = frame >= 104 && frame <= 112;
  const isLocalSaleDone = frame >= 112;

  const modalSpring = spring({
    frame: Math.max(0, frame - 26),
    fps,
    config: { damping: 18 },
  });

  const ticketSpring = spring({
    frame: Math.max(0, frame - 140),
    fps,
    config: { damping: 18, mass: 0.9 },
  });
  const ticketHeight = interpolate(ticketSpring, [0, 1], [0, 580]);

  const stampSpring = spring({
    frame: Math.max(0, frame - 182),
    fps,
    config: { damping: 14 },
  });

  const terminalOpacity = interpolate(frame, [136, 156], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ticketPhaseOpacity = interpolate(frame, [138, 158], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const sub1Opacity = interpolate(frame, [10, 24, 138, 150], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sub2Opacity = interpolate(frame, [146, 160, 290, 300], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const tapCobrar = frame >= 18 && frame <= 26;
  const tapCash = frame >= 56 && frame <= 66;
  const tapConfirm = frame >= 104 && frame <= 112;

  let touchX = 440;
  let touchY = 772;
  if (frame >= 26 && frame < 56) {
    const move = interpolate(frame, [26, 56], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    touchX = 440 + (185 - 440) * move;
    touchY = 772 + (398 - 772) * move;
  } else if (frame >= 56 && frame < 92) {
    touchX = 185;
    touchY = 398;
  } else if (frame >= 92 && frame < 104) {
    const move = interpolate(frame, [92, 104], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    touchX = 185 + (410 - 185) * move;
    touchY = 398 + (618 - 398) * move;
  } else if (frame >= 104) {
    touchX = 410;
    touchY = 618;
  }

  const products = [
    'Cappuccino Artesanal',
    'Café Americano',
    'Latte Vainilla',
    'Pastel Tres Leches',
    'Espresso Doble',
    'Mocha Caliente',
  ];

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[#003757]/80 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute -bottom-24 right-0 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[180px] pointer-events-none" />

      <div className="w-full pt-24 flex flex-col items-center z-10 text-center">
        <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 mb-3 shadow-sm flex items-center gap-2">
          <Database className="w-4 h-4" />
          <span>Cobro Local Garantizado</span>
        </span>
        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          La venta no espera al Wi-Fi
        </h2>
      </div>

      <div className="w-full flex-1 relative z-20">
        {frame < 156 && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ opacity: terminalOpacity }}
          >
            <TerminalShell scale={1.2}>
              <TerminalStatusBar
                mode={isLocalSaleDone ? 'protected' : 'protected'}
                count={isLocalSaleDone ? 1 : 0}
              />

              <div className="h-10 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0">
                <span className="text-sm font-bold text-slate-900">Punto de Venta</span>
                <span className="text-[10px] font-semibold text-slate-500">
                  Caja 1 · Carlos Cajero
                </span>
              </div>

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

              <div className="flex-1 p-3 overflow-hidden">
                <div className="grid grid-cols-3 gap-2.5">
                  {products.map((name, index) => {
                    const inCart = index === 0 || index === 3;
                    return (
                      <div
                        key={name}
                        className={`bg-white rounded-xl p-2.5 border shadow-sm flex flex-col justify-between h-[168px] ${
                          inCart
                            ? 'border-[#00BF81] bg-emerald-50/40'
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
                          {name}
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <span className="text-[11px] font-extrabold text-[#003757]">
                            {index === 0
                              ? 'C$ 85.00'
                              : index === 3
                              ? 'C$ 90.00'
                              : 'C$ 60.00'}
                          </span>
                          {inCart ? (
                            <span className="text-[9px] font-bold text-emerald-700">
                              EN CARRITO
                            </span>
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-[#003757] text-white flex items-center justify-center text-[10px]">
                              +
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border-t-2 border-slate-200 p-3 shadow-lg shrink-0">
                <div className="mb-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                    <span>2× Cappuccino Artesanal</span>
                    <span className="text-[#003757]">C$ 170.00</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                    <span>1× Pastel Tres Leches</span>
                    <span className="text-[#003757]">C$ 90.00</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Total a Cobrar
                    </span>
                    <span
                      className="text-2xl font-black text-[#003757]"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      C$ 260.00
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`flex-1 h-14 rounded-xl font-black text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-md ${
                      tapCobrar
                        ? 'bg-[#009665] text-white scale-[0.97]'
                        : 'bg-[#00BF81] text-slate-900'
                    }`}
                  >
                    <span>Cobrar</span>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {isModalOpen && (
                <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-3 z-40">
                  <div
                    className="w-full bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
                    style={{
                      transform: `scale(${interpolate(modalSpring, [0, 1], [0.92, 1])})`,
                    }}
                  >
                    <div className="bg-[#003757] text-white px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Banknote className="w-4 h-4 text-[#00BF81]" />
                        <h3 className="text-sm font-bold tracking-wide">
                          Cobro Multimoneda
                        </h3>
                      </div>
                      <span className="text-[9px] bg-white/10 px-2 py-1 rounded-md text-[#2FE0A4] font-semibold">
                        T.C. BCN: 36.6243
                      </span>
                    </div>

                    <div className="p-3 space-y-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider block">
                            Total de la Venta
                          </span>
                          <span className="text-[10px] text-slate-400">
                            3 productos
                          </span>
                        </div>
                        <div className="text-right">
                          <span
                            className="text-2xl font-black text-[#003757]"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            C$ 260.00
                          </span>
                          <span className="text-[10px] text-slate-500 block font-medium">
                            ≈ $7.10 USD
                          </span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[10px] font-bold text-slate-700">
                            Monto Recibido en Efectivo
                          </label>
                          <span className="text-[9px] text-slate-500">
                            Acceso rápido
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="h-11 rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-700">
                            <span className="text-[11px] font-black">C$ 260</span>
                            <span className="text-[8px] font-bold text-slate-400 uppercase">
                              Exacto
                            </span>
                          </div>
                          <div className="h-11 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-[11px] font-bold text-slate-600">
                            C$ 300
                          </div>
                          <div
                            className={`h-11 rounded-xl border-2 flex items-center justify-center text-[11px] font-extrabold transition-all ${
                              isCashSelected
                                ? 'border-[#00BF81] bg-[#00BF81] text-slate-900'
                                : 'border-slate-300 bg-white text-slate-800'
                            }`}
                          >
                            C$ 500
                          </div>
                          <div className="h-11 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-[11px] font-bold text-slate-600 opacity-60">
                            C$ 1000
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-100 rounded-xl px-3 py-2 border border-slate-300 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 font-medium">
                          Efectivo Ingresado:
                        </span>
                        <span
                          className="text-lg font-black text-slate-900"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {isCashSelected ? 'C$ 500.00' : 'C$ 0.00'}
                        </span>
                      </div>

                      <div
                        className={`rounded-2xl p-3 border-2 ${
                          isCashSelected
                            ? 'bg-[#ECFDF5] border-[#10B981]'
                            : 'bg-slate-50 border-slate-200 opacity-40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-emerald-800 uppercase flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#00BF81]" />
                            Vuelto a Entregar
                          </span>
                          <span
                            className="text-2xl font-black text-[#059669]"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {isCashSelected ? 'C$ 240.00' : 'C$ 0.00'}
                          </span>
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-emerald-200 flex items-center justify-between text-[10px]">
                          <span className="text-slate-600 font-semibold">
                            Equivalente en Dólares:
                          </span>
                          <span
                            className="font-extrabold text-[#003757]"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {isCashSelected ? '$6.55 USD' : '$0.00 USD'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`w-full h-12 rounded-xl font-black text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg ${
                          isCompleting
                            ? 'bg-[#009665] text-white scale-[0.98]'
                            : 'bg-[#00BF81] text-slate-900'
                        }`}
                      >
                        <Printer className="w-4 h-4" />
                        <span>Completar Cobro & Imprimir</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isLocalSaleDone && (
                <div className="absolute inset-x-0 bottom-0 top-[80px] bg-white z-30 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-[#00BF81] flex items-center justify-center">
                    <Check className="w-10 h-10 text-[#00BF81] stroke-[3]" />
                  </div>
                  <div className="text-lg font-black text-slate-900">
                    Venta registrada localmente
                  </div>
                  <div className="text-xs font-bold text-slate-500 font-mono">
                    001-001-01-00000107 · C$ 260.00
                  </div>
                  <LocalDatabaseChip label="Base local · confirmada sin internet" />
                  <div className="mt-2 flex items-center gap-2 text-xs font-bold text-[#003757]">
                    <Printer className="w-4 h-4" />
                    Imprimiendo ticket térmico
                  </div>
                </div>
              )}

              <div
                className="absolute pointer-events-none z-50"
                style={{
                  left: `${touchX}px`,
                  top: `${touchY}px`,
                  transform: 'translate(-50%, -50%)',
                  opacity: frame >= 112 ? 0 : 1,
                }}
              >
                <div className="w-10 h-10 rounded-full bg-white/80 border-2 border-[#00BF81] shadow-xl flex items-center justify-center">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#00BF81]" />
                </div>
                {(tapCobrar || tapCash || tapConfirm) && (
                  <span className="absolute -inset-2 rounded-full bg-[#00BF81]/50 animate-ping pointer-events-none" />
                )}
              </div>
            </TerminalShell>
          </div>
        )}

        {frame >= 138 && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center z-20"
            style={{ opacity: ticketPhaseOpacity }}
          >
            <div className="w-[900px] rounded-2xl bg-[#003757] border border-white/10 px-5 py-3.5 shadow-2xl flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-2.5">
                <Store className="w-5 h-5 text-[#00BF81]" />
                <div>
                  <div className="text-sm font-black text-white leading-tight">
                    Café San Juan
                  </div>
                  <div className="text-[10px] text-white/60 leading-tight">
                    Caja 1 · 12:52 PM
                  </div>
                </div>
              </div>
              <LocalDatabaseChip label="Base local" />
              <div className="w-[430px]">
                <SyncStrip mode="protected" count={1} />
              </div>
            </div>

            <div className="w-[540px] h-3 bg-slate-900 rounded-t-2xl border-t-2 border-x-2 border-slate-700 flex items-center justify-center z-30">
              <div className="w-[460px] h-1 bg-black rounded-full" />
            </div>

            <div
              className="w-[540px] bg-white rounded-b-2xl shadow-[0_25px_70px_rgba(0,0,0,0.55)] border-x border-b border-slate-300 px-7 py-5 font-mono text-slate-800 overflow-hidden relative"
              style={{ height: `${ticketHeight}px` }}
            >
              <div className="text-center pb-3 border-b-2 border-dashed border-slate-300">
                <div className="font-black text-lg tracking-wider text-black">
                  CAFÉ SAN JUAN
                </div>
                <div className="text-[11px] text-slate-500 font-bold mt-0.5">
                  RUC: J0310000000000
                </div>
                <div className="text-[11px] text-slate-400">
                  Plaza Central, Managua
                </div>
                <div className="text-[11px] text-slate-700 mt-1 font-bold">
                  Factura: 001-001-01-00000107
                </div>
                <div className="text-[11px] text-slate-400">
                  27/10/2026 12:52 PM | Caja 1
                </div>
              </div>

              <div className="py-3 border-b-2 border-dashed border-slate-300 space-y-1.5 text-[13px]">
                <div className="flex justify-between font-bold">
                  <span>2 Cappuccino Artesanal</span>
                  <span>170.00</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>1 Pastel Tres Leches</span>
                  <span>90.00</span>
                </div>
              </div>

              <div className="py-3 border-b-2 border-dashed border-slate-300 space-y-1.5 text-[13px]">
                <div className="flex justify-between font-black text-lg">
                  <span>TOTAL C$:</span>
                  <span>260.00</span>
                </div>
                <div className="flex justify-between text-slate-600 font-semibold">
                  <span>Efectivo C$:</span>
                  <span>500.00</span>
                </div>
                <div className="flex justify-between font-black text-emerald-700">
                  <span>CAMBIO C$:</span>
                  <span>240.00</span>
                </div>
                <div className="flex justify-between font-black text-[#003757]">
                  <span>CAMBIO USD:</span>
                  <span>$6.55</span>
                </div>
                <div className="text-[10px] text-slate-500 pt-1 text-right font-medium">
                  T.C. Oficial BCN: 36.6243
                </div>
              </div>

              <div className="text-center pt-3 text-[11px] text-slate-500">
                <div>Conserve su factura para cualquier reclamo.</div>
                <div className="font-bold text-slate-800 mt-1">
                  ¡Gracias por su compra!
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 flex items-center justify-between text-[10px] font-bold text-amber-800">
                <span>Ticket emitido sin conexión</span>
                <span>1 en cola de sincronización</span>
              </div>

              <div
                className="absolute right-8 bottom-6 border-[3px] border-[#009665] text-[#009665] rounded-lg px-3 py-1.5 rotate-[-8deg] bg-white/80"
                style={{
                  opacity: interpolate(stampSpring, [0, 1], [0, 0.95]),
                  transform: `rotate(-8deg) scale(${interpolate(
                    stampSpring,
                    [0, 1],
                    [0.7, 1]
                  )})`,
                }}
              >
                <div className="text-[10px] font-black tracking-wider">
                  GUARDADO LOCAL
                </div>
                <div className="text-[9px] font-bold text-center">Base local</div>
              </div>

              {frame >= 206 && (
                <div className="absolute top-2 left-0 right-0 border-t-2 border-dotted border-slate-400 opacity-70" />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="w-full h-[320px] flex flex-col items-center justify-start pt-6 z-30 text-center">
        {frame < 146 ? (
          <div
            className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg leading-tight"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub1Opacity,
            }}
          >
            Base de datos local
          </div>
        ) : (
          <div
            className="text-5xl font-black text-[#00BF81] tracking-[2px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)] leading-tight"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub2Opacity,
            }}
          >
            Cobro e impresión ininterrumpidos.
          </div>
        )}
      </div>
    </div>
  );
};
