import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  Store,
  Wifi,
  UserCheck,
  X,
  CreditCard,
  QrCode,
  Banknote,
  Split,
  ArrowLeftRight,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { NhilosLogo } from '../../components/NhilosLogo';

export const MultiCurrencyPosScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // =========================================================================
  // 1. Macro-Zoom en Frame 0 (scale: 1.60) -> Corte de Atención en f45 (1.16)
  // =========================================================================
  const zoomOutSpring =
    frame >= 45
      ? spring({
          frame: frame - 45,
          fps,
          config: { damping: 18, stiffness: 115, mass: 0.85 },
        })
      : 0;

  const terminalScale =
    frame < 45 ? 1.6 : interpolate(zoomOutSpring, [0, 1], [1.6, 1.16]);

  // En Macro-Zoom (f0..f44) desplazamos hacia arriba (-135px) para centrar
  // el chip rápido "$ 50" y el recuadro verde brillante "Vuelto: C$ 1,191.22"
  const terminalTranslateY =
    frame < 45 ? -135 : interpolate(zoomOutSpring, [0, 1], [-135, 0]);

  // =========================================================================
  // 2. Estados de la UI de `MultiCurrencyCheckoutDialog` (`apps/pos_app`)
  //    - Escena 1 (f0..f145): Cobro Completo, Paga con USD ($), chip "$ 50" pulsado -> Vuelto: C$ 1,191.22
  //      (con Macro-Zoom en f0..f45 y Zoom-out en f45..f145 mientras suena fx_1_hook)
  //    - Escena 2 (f145..f355): Vista completa de Cobro Completo mientras suena fx_2_context
  //    - Escena 3 (f355..f645): Pestaña "Pago Dividido" (Simulación de pago mixto: $ 10.00 USD + C$ 300.00 -> Vuelto: C$ 26.24) + Toque en botón "COBRAR"
  // =========================================================================
  const isSplitMode = frame >= 365;
  const isFiftyChipPressed = frame >= 4 && frame <= 18;
  const isChangePulseActive = frame >= 6 && frame < 45;

  // En modo Pago Dividido (f365..f645):
  // - Paso 1 (f365..f465): Ya aplicado Pago 1: $ 10.00 USD (C$ 366.24). Resta: C$ 273.76 ($ 7.47 USD).
  //   El cajero selecciona NIO (C$), digita C$ 300.00 y toca "+ Agregar Pago" en f460.
  // - Paso 2 (f465..f645): Pagos Aplicados (2): $ 10.00 (C$ 366.24) + C$ 300.00 -> Vuelto: C$ 26.24.
  //   Resta: C$ 0.00 ($ 0.00 USD). El cajero pulsa el verbo principal "COBRAR" en f610.
  const hasSecondSplitPayment = frame >= 465;
  const isAddPaymentPressed = frame >= 456 && frame <= 466;
  const isCobrarPressed = frame >= 606 && frame <= 620;
  const isSaleCompletedBanner = frame >= 620;

  const splitCardPulse = spring({
    frame: Math.max(0, frame - 465),
    fps,
    config: { damping: 14, stiffness: 140 },
  });

  // =========================================================================
  // 3. Trayectoria del Puntero Táctil (Pantalla interna: 508 x 828 px)
  //    - Chip rápido "$ 50" en Cobro Completo: x=306, y=506
  //    - Pestaña "Pago Dividido" en SegmentedButton: x=365, y=132
  //    - Botón "+ Agregar Pago (C$ 300.00)": x=254, y=384
  //    - Botón principal "COBRAR": x=254, y=766
  // =========================================================================
  const touchX = interpolate(
    frame,
    [
      0, 4, 16, 44, 65, 345, 357, 365, 440, 456, 466, 590, 606, 620, 645,
    ],
    [
      306, 306, 306, 306, 306, 365, 365, 365, 254, 254, 254, 254, 254, 254, 254,
    ],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const touchY = interpolate(
    frame,
    [
      0, 4, 16, 44, 65, 345, 357, 365, 440, 456, 466, 590, 606, 620, 645,
    ],
    [
      506, 506, 506, 506, 506, 132, 132, 132, 384, 384, 384, 766, 766, 766, 766,
    ],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const isTapping =
    (frame >= 4 && frame <= 16) ||
    (frame >= 357 && frame <= 367) ||
    (frame >= 456 && frame <= 466) ||
    (frame >= 606 && frame <= 620);

  // =========================================================================
  // 4. Subtítulos Cinéticos por Escena (Bottom Safe Zone >= 280px)
  // =========================================================================
  const sceneIndex = frame < 145 ? 1 : frame < 355 ? 2 : 3;

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans">
      {/* Glow institucional de fondo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[920px] h-[920px] bg-[#00BF81]/12 rounded-full blur-[180px] pointer-events-none" />

      {/* ===================================================================
          TOP SAFE ZONE (pt-[100px] + p-8 = 132px >= 130px)
         =================================================================== */}
      <div className="w-full pt-[100px] flex flex-col items-center z-30 text-center">
        <div className="inline-flex items-center gap-2.5 bg-[#003757]/90 border border-[#00BF81]/40 px-5 py-2 rounded-full mb-2.5 shadow-lg">
          <NhilosLogo size={24} />
          <span className="text-xs font-extrabold tracking-widest text-white uppercase">
            NHILOS POS
          </span>
          <span className="text-xs text-[#00BF81] font-bold">•</span>
          <span className="text-xs text-slate-200 font-medium">
            Conectamos los hilos de tu negocio.
          </span>
          <span className="ml-1 text-[11px] font-black text-[#003757] bg-[#00BF81] px-2.5 py-0.5 rounded-full uppercase">
            COBRO MULTIMONEDA
          </span>
        </div>

        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          {sceneIndex === 1
            ? 'Vuelto Exacto en Dólares y Córdobas'
            : sceneIndex === 2
            ? 'Conversión BCN Instantánea en Caja'
            : 'Pagos Mixtos C$ + USD sin Errores'}
        </h2>
      </div>

      {/* ===================================================================
          CENTER STAGE: Terminal MIRAY Q80 (Macro-Zoom 1.60 en f0 -> 1.16 en f45)
         =================================================================== */}
      <div className="w-full flex-1 flex items-center justify-center z-20 overflow-hidden rounded-3xl my-2">
        <div
          className="relative rounded-[48px] bg-slate-900 p-4 shadow-[0_25px_80px_rgba(0,0,0,0.68)] border-4 border-slate-700/80 overflow-hidden origin-center"
          style={{
            width: '540px',
            height: '860px',
            transform: `translateY(${terminalTranslateY}px) scale(${terminalScale})`,
          }}
        >
          {/* Notch de terminal POS */}
          <div className="w-28 h-2 bg-slate-800 rounded-full mx-auto mb-2" />

          {/* Pantalla táctil interna (508 x 828 px) */}
          <div
            className="w-full h-[812px] bg-[#F8FAFC] rounded-[34px] overflow-hidden flex flex-col relative border border-slate-200"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {/* AppBar NHILOS POS */}
            <div className="bg-[#003757] text-white px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-[#00BF81]" />
                <span className="font-bold text-xs tracking-wide">
                  Repuestos El Norte · Caja 1
                </span>
                <span className="text-[11px] text-white/50">|</span>
                <div className="flex items-center gap-1 text-[11px] text-slate-200 font-medium">
                  <UserCheck className="w-3.5 h-3.5 text-[#00BF81]" />
                  <span>Carlos Cajero</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-[#00BF81]/20 border border-[#00BF81]/40 px-2 py-0.5 rounded-full text-[10px] text-[#00BF81] font-bold">
                  <Wifi className="w-3 h-3" />
                  <span>Factura #00892</span>
                </div>
              </div>
            </div>

            {/* ===============================================================
                MODAL OFICIAL: `MultiCurrencyCheckoutDialog`
                (`apps/pos_app/lib/ui/features/sales/widgets/multi_currency_checkout_dialog.dart`)
               =============================================================== */}
            <div className="flex-1 p-3 flex flex-col justify-between bg-slate-100/80">
              <div className="w-full h-full bg-white rounded-xl border-2 border-[#003757] shadow-lg p-3.5 flex flex-col justify-between">
                {/* 1. Header & SegmentedButton (`Cobro Completo` | `Pago Dividido`) */}
                <div>
                  <div className="flex items-center justify-between pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-extrabold text-[#0F172A]">
                        Cobro y Facturación
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        001-001-01-00000892
                      </span>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                      <X className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* SegmentedButton<bool>: Cobro Completo | Pago Dividido */}
                  <div className="grid grid-cols-2 rounded-lg border border-slate-300 bg-slate-100 p-0.5 mb-2.5">
                    <div
                      className={`py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 text-xs font-bold transition-all ${
                        !isSplitMode
                          ? 'bg-[#003757] text-white shadow-sm'
                          : 'text-slate-600'
                      }`}
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      <span>Cobro Completo</span>
                    </div>
                    <div
                      className={`py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 text-xs font-bold transition-all ${
                        isSplitMode
                          ? 'bg-[#003757] text-white shadow-sm'
                          : 'text-slate-600'
                      }`}
                    >
                      <Split className="w-3.5 h-3.5" />
                      <span>Pago Dividido</span>
                    </div>
                  </div>

                  {/* =========================================================
                      MODO A: COBRO COMPLETO (`!isSplitMode`, f0..f165)
                     ========================================================= */}
                  {!isSplitMode ? (
                    <div className="space-y-2.5">
                      {/* _buildTotalHeaderCard */}
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-700">
                            Total a Cobrar:
                          </span>
                          <span className="text-xl font-black text-[#003757] tabular-nums">
                            C$ 640.00
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-slate-500 font-medium">
                            Equivalente Comercial:
                          </span>
                          <span className="text-sm font-extrabold text-[#16A34A] tabular-nums">
                            $17.47 USD
                          </span>
                        </div>
                        <div className="border-t border-slate-200 my-1.5" />
                        <div className="flex items-center justify-between">
                          <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-[#0F172A]">
                            <ArrowLeftRight className="w-3 h-3 text-[#003757]" />
                            <span>TC BCN: 36.6243</span>
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500">
                            1 Lit. Aceite 20W50 + Filtro
                          </span>
                        </div>
                      </div>

                      {/* _buildMethodSelector */}
                      <div className="flex items-center gap-2">
                        <div className="px-3 py-1 rounded-full bg-[#003757]/10 border border-[#003757] text-[#003757] text-xs font-bold flex items-center gap-1.5">
                          <Banknote className="w-3.5 h-3.5" />
                          <span>Efectivo</span>
                        </div>
                        <div className="px-3 py-1 rounded-full bg-white border border-slate-300 text-slate-600 text-xs font-semibold flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Tarjeta</span>
                        </div>
                        <div className="px-3 py-1 rounded-full bg-white border border-slate-300 text-slate-600 text-xs font-semibold flex items-center gap-1.5">
                          <QrCode className="w-3.5 h-3.5" />
                          <span>QR / Transfer</span>
                        </div>
                      </div>

                      {/* _buildCurrencySelectors */}
                      <div className="space-y-1.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700 w-16">
                            Paga con:
                          </span>
                          <div className="px-2.5 py-1 rounded-md bg-white border border-slate-300 text-slate-600 text-xs font-semibold">
                            NIO (C$)
                          </div>
                          <div className="px-3 py-1 rounded-md bg-[#003757] text-white text-xs font-extrabold shadow-sm ring-2 ring-[#00BF81]/40">
                            USD ($)
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700 w-16">
                            Vuelto en:
                          </span>
                          <div className="px-2.5 py-1 rounded-md bg-[#00BF81]/20 border border-[#00BF81] text-[#003757] text-xs font-extrabold">
                            Vuelto en NIO (C$)
                          </div>
                          <div className="px-2.5 py-1 rounded-md bg-white border border-slate-300 text-slate-500 text-xs font-semibold">
                            Vuelto en USD ($)
                          </div>
                        </div>
                      </div>

                      {/* _buildTenderInputField */}
                      <div className="relative">
                        <div className="text-[10px] font-bold text-[#003757] uppercase tracking-wider mb-0.5">
                          Monto Recibido (USD)
                        </div>
                        <div className="w-full px-3 py-2 rounded-lg border-2 border-[#003757] bg-white flex items-center justify-between">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-base font-extrabold text-slate-500">
                              $
                            </span>
                            <span className="text-2xl font-black text-[#0F172A] tabular-nums">
                              50.00
                            </span>
                            <span className="text-xs font-bold text-slate-500 ml-1">
                              (= C$ 1,831.22)
                            </span>
                          </div>
                          <X className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>

                      {/* _buildQuickSuggestionChips ($ 17.47, $ 20, $ 50, $ 100) */}
                      <div className="flex items-center gap-2 pt-0.5">
                        {['$ 17.47', '$ 20', '$ 50', '$ 100'].map((chip) => {
                          const isFifty = chip === '$ 50';
                          return (
                            <div
                              key={chip}
                              className={`flex-1 py-2 rounded-lg text-center font-extrabold text-xs tabular-nums border transition-all ${
                                isFifty
                                  ? 'bg-[#003757] text-white border-[#00BF81] ring-4 ring-[#00BF81]/40 shadow-md'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                              style={{
                                transform:
                                  isFifty && isFiftyChipPressed
                                    ? 'scale(0.94)'
                                    : 'scale(1)',
                              }}
                            >
                              {chip}
                            </div>
                          );
                        })}
                      </div>

                      {/* _buildCashBreakdownCard (Verde brillante: Vuelto: C$ 1,191.22) */}
                      <div
                        className={`rounded-xl p-3.5 border-2 transition-all ${
                          isChangePulseActive
                            ? 'bg-[#DCFCE7] border-[#00BF81] shadow-[0_0_30px_rgba(0,191,129,0.45)]'
                            : 'bg-[#F0FDF4] border-[#86EFAC]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black uppercase tracking-wider text-[#15803D]">
                            Vuelto Exacto a Entregar (NIO)
                          </span>
                          <span className="text-[10px] font-extrabold bg-[#16A34A] text-white px-2 py-0.5 rounded-full">
                            CÁLCULO &lt;50ms
                          </span>
                        </div>
                        <div className="text-[28px] leading-tight font-black text-[#16A34A] tabular-nums mt-0.5">
                          Vuelto: C$ 1,191.22
                        </div>
                        <div className="text-xs font-bold text-slate-600 tabular-nums mt-0.5">
                          Equivalente en USD: $32.53 USD · Tasa: 36.6243
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* =========================================================
                       MODO B: PAGO DIVIDIDO (`isSplitMode`, f166..f390)
                       Simulación de pago mixto: $ 10.00 USD + C$ 300.00
                       ========================================================= */
                    <div className="space-y-2.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {/* Split Summary Balance Card */}
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-2.5 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 font-semibold">
                            Total Ticket:
                          </span>
                          <span className="font-extrabold text-slate-900 tabular-nums">
                            C$ 640.00
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 font-semibold">
                            Total Pagado:
                          </span>
                          <span className="font-extrabold text-[#16A34A] tabular-nums">
                            {hasSecondSplitPayment ? 'C$ 640.00' : 'C$ 366.24'}
                          </span>
                        </div>
                        <div className="border-t border-slate-200 my-1" />
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm font-black tabular-nums ${
                              hasSecondSplitPayment
                                ? 'text-[#16A34A]'
                                : 'text-[#DC2626]'
                            }`}
                          >
                            {hasSecondSplitPayment
                              ? 'Resta: C$ 0.00'
                              : 'Resta: C$ 273.76'}
                          </span>
                          <span className="text-xs font-bold text-slate-500 tabular-nums">
                            {hasSecondSplitPayment
                              ? '($ 0.00 USD)'
                              : '($ 7.47 USD)'}
                          </span>
                        </div>
                      </div>

                      {/* Add Partial Payment Form */}
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-slate-800">
                            Agregar Pago Parcial:
                          </span>
                          <span className="text-[10px] font-bold text-[#003757] bg-[#00BF81]/20 px-2 py-0.5 rounded">
                            TC BCN: 36.6243
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="px-3 py-1 rounded-md bg-[#003757] text-white text-xs font-extrabold">
                            NIO (C$)
                          </div>
                          <div className="px-3 py-1 rounded-md bg-white border border-slate-300 text-slate-600 text-xs font-semibold">
                            USD ($)
                          </div>
                          <div className="flex-1 px-3 py-1 rounded-md border border-[#003757] bg-white flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-500">
                              C$
                            </span>
                            <span className="text-sm font-black text-slate-900 tabular-nums">
                              300.00
                            </span>
                          </div>
                        </div>

                        <div
                          className={`w-full py-2 rounded-lg font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all ${
                            hasSecondSplitPayment
                              ? 'bg-slate-200 text-slate-500'
                              : 'bg-[#003757]/15 text-[#003757] border border-[#003757]/30'
                          }`}
                          style={{
                            transform: isAddPaymentPressed
                              ? 'scale(0.96)'
                              : 'scale(1)',
                          }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agregar Pago (C$ 300.00)</span>
                        </div>
                      </div>

                      {/* Applied Payments List (`Pagos Aplicados (2):`) */}
                      <div className="space-y-1.5">
                        <div className="text-xs font-extrabold text-slate-800">
                          Pagos Aplicados ({hasSecondSplitPayment ? 2 : 1}):
                        </div>

                        {/* Pago 1: $ 10.00 USD (C$ 366.24) */}
                        <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-2">
                            <Banknote className="w-4 h-4 text-[#16A34A]" />
                            <div>
                              <div className="text-xs font-black text-slate-900 tabular-nums">
                                $ 10.00 (C$ 366.24)
                              </div>
                              <div className="text-[10px] font-semibold text-slate-500">
                                Efectivo USD · Tasa 36.6243
                              </div>
                            </div>
                          </div>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </div>

                        {/* Pago 2: C$ 300.00 -> Vuelto: C$ 26.24 */}
                        {hasSecondSplitPayment && (
                          <div
                            className="bg-[#F0FDF4] border-2 border-[#00BF81] rounded-lg px-3 py-2 flex items-center justify-between shadow-md"
                            style={{
                              transform: `scale(${interpolate(
                                splitCardPulse,
                                [0, 1],
                                [0.95, 1]
                              )})`,
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <Banknote className="w-4 h-4 text-[#16A34A]" />
                              <div>
                                <div className="text-xs font-black text-slate-900 tabular-nums">
                                  C$ 300.00 · Efectivo NIO
                                </div>
                                <div className="text-xs font-black text-[#16A34A] tabular-nums">
                                  Vuelto exacto: C$ 26.24 ($ 0.72 USD)
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] font-black bg-[#00BF81] text-[#003757] px-2 py-0.5 rounded uppercase">
                              TABULAR
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Botón Principal de Acción: `COBRAR` */}
                <div className="pt-2">
                  <div
                    className={`w-full py-3 rounded-xl font-black text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg transition-all ${
                      isCobrarPressed
                        ? 'bg-[#009e6a] text-white scale-[0.97]'
                        : 'bg-[#003757] text-white border border-[#00BF81]/50'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#00BF81]" />
                    <span>COBRAR · C$ 640.00</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SnackBar de confirmación al tocar COBRAR */}
            {isSaleCompletedBanner && (
              <div className="absolute bottom-3 left-3 right-3 bg-[#16A34A] text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center justify-between z-40">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-white" />
                  <span className="text-xs font-extrabold">
                    Venta procesada con éxito · Imprimiendo Ticket 80mm
                  </span>
                </div>
                <span className="text-[11px] font-black bg-white/20 px-2 py-0.5 rounded">
                  #00892
                </span>
              </div>
            )}

            {/* ===============================================================
                INDICADOR DE TOQUE TÁCTIL (Touch Ripple)
               =============================================================== */}
            <div
              className="absolute pointer-events-none z-50 flex items-center justify-center"
              style={{
                left: `${touchX}px`,
                top: `${touchY}px`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {isTapping && (
                <div className="absolute w-16 h-16 rounded-full bg-[#00BF81]/35 animate-ping" />
              )}
              <div
                className={`w-9 h-9 rounded-full border-[3px] border-[#00BF81] bg-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.35)] flex items-center justify-center transition-transform ${
                  isTapping ? 'scale-90 bg-[#00BF81]/20' : 'scale-100'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-[#00BF81]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================
          BOTTOM SAFE ZONE (h-[310px] pt-4 => >= 280px libre de UI de TikTok/Reels)
         =================================================================== */}
      <div className="w-full h-[310px] flex flex-col items-center justify-start pt-4 z-30 text-center">
        {sceneIndex === 1 && (
          <div className="space-y-1.5">
            <div
              className="text-[44px] leading-tight font-black text-white tracking-wide drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              ¿Pagos en dólares?
            </div>
            <div
              className="text-[34px] leading-tight font-extrabold text-[#00BF81] tracking-wide drop-shadow-[0_0_20px_rgba(0,191,129,0.35)]"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Cero errores dando vuelto.
            </div>
          </div>
        )}

        {sceneIndex === 2 && (
          <div className="space-y-1.5">
            <div
              className="text-[44px] leading-tight font-black text-white tracking-wide drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Olvida la calculadora.
            </div>
            <div
              className="text-[32px] leading-tight font-extrabold text-[#00BF81] tracking-wide drop-shadow-[0_0_20px_rgba(0,191,129,0.35)]"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Conversión instantánea en pantalla.
            </div>
          </div>
        )}

        {sceneIndex === 3 && (
          <div className="space-y-1.5">
            <div
              className="text-[42px] leading-tight font-black text-white tracking-wide drop-shadow-lg"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Pagos mixtos C$ + USD
            </div>
            <div
              className="text-[32px] leading-tight font-extrabold text-[#00BF81] tracking-wide drop-shadow-[0_0_20px_rgba(0,191,129,0.35)]"
              style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
            >
              Tipografía tabular sin errores.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
