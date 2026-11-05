import React from 'react';
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  PauseCircle,
  PlayCircle,
  Clock,
  Coffee,
  Check,
  Store,
  User,
  Wifi,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  price: string;
  badge?: string;
}

const CATALOG_PRODUCTS: CatalogProduct[] = [
  {
    id: 'capuccino',
    name: 'Capuccino Artesanal',
    category: 'Barra · Especialidad',
    price: 'C$ 85.00',
    badge: 'Variantes',
  },
  {
    id: 'americano',
    name: 'Café Americano',
    category: 'Barra · Extracción',
    price: 'C$ 60.00',
    badge: 'Rápido',
  },
  {
    id: 'tres_leches',
    name: 'Pastel Tres Leches',
    category: 'Repostería Fresca',
    price: 'C$ 90.00',
  },
  {
    id: 'latte',
    name: 'Latte Vainilla',
    category: 'Barra · Especialidad',
    price: 'C$ 90.00',
  },
  {
    id: 'espresso',
    name: 'Espresso Doble',
    category: 'Barra · Extracción',
    price: 'C$ 55.00',
  },
  {
    id: 'mocha',
    name: 'Mocha Artesanal',
    category: 'Barra · Especialidad',
    price: 'C$ 95.00',
  },
];

export const HoldOrdersTerminalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // =========================================================================
  // 1. Dynamic Header Title by Scene Phase (f0..f590)
  // =========================================================================
  const mainTitle =
    frame < 45
      ? 'Cuentas en Espera en 1 Toque'
      : frame < 280
      ? 'Mostrador Sin Filas Trabadas'
      : 'Recuperación Instantánea <50 ms';

  // =========================================================================
  // 2. Attention Cut at Exact Frame 45 (Rule 2.B: scale 1.0 -> 1.08)
  // =========================================================================
  const baseScale = 1.18;
  const attentionZoom = interpolate(
    frame,
    [0, 44, 45, 95, 280, 325],
    [1.0, 1.0, 1.02, 1.08, 1.08, 1.03],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  const terminalScale = baseScale * attentionZoom;

  const originY = interpolate(
    frame,
    [0, 44, 45, 95, 280, 325],
    [50, 50, 28, 22, 22, 48],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  // =========================================================================
  // 3. State Timeline across Scenes 1, 2, and 3
  // =========================================================================
  // Scene 1 (f0..f45):
  // - Frame 0 Live Action: Finger presses "Poner en Espera" (f0..f8)
  // - At f8: Order #12 moves to "En espera (1)" and cart clears to C$ 0.00
  const isHoldButtonPressed = frame >= 0 && frame <= 8;
  const isOrderOnHold = frame >= 8 && frame < 434;
  const holdCount = isOrderOnHold ? 1 : 0;

  // Scene 2 (f45..f280):
  // - Top badge "En espera (1)" pulses
  // - Finger taps "Café Americano (C$ 60.00)" at f102..f110 (after dwell f94..f102)
  // - Express customer served and cleared at f235 so cart is ready to recall Order #12
  const isAmericanoTapped = frame >= 102 && frame <= 110;
  const isHoldTopBtnTapped = frame >= 312 && frame <= 320;
  const isDrawerOpen = frame >= 316 && frame < 434;
  const isRecallBtnTapped = frame >= 426 && frame <= 434;
  const isCobrarBtnTapped = frame >= 543 && frame <= 551;

  // Cart state machine:
  // - 'order12_initial': f0..f7 (Capuccino Artesanal C$ 85 + Leche de Almendras +C$ 20 = C$ 105.00)
  // - 'empty_after_hold': f8..f103 (C$ 0.00 - Carrito despejado al instante)
  // - 'americano_active': f104..f235 (1x Café Americano C$ 60.00 - Cliente siguiente atendido)
  // - 'empty_before_recall': f236..f433 (C$ 0.00 - Listo para recuperar Orden #12)
  // - 'order12_recalled': f434..f590 (Orden #12 recuperada intacta en <50 ms = C$ 105.00)
  const cartMode:
    | 'order12_initial'
    | 'empty_after_hold'
    | 'americano_active'
    | 'empty_before_recall'
    | 'order12_recalled' =
    frame < 8
      ? 'order12_initial'
      : frame < 104
      ? 'empty_after_hold'
      : frame < 236
      ? 'americano_active'
      : frame < 434
      ? 'empty_before_recall'
      : 'order12_recalled';

  const cartTotalText =
    cartMode === 'order12_initial' || cartMode === 'order12_recalled'
      ? 'C$ 105.00'
      : cartMode === 'americano_active'
      ? 'C$ 60.00'
      : 'C$ 0.00';

  const cartUsdText =
    cartMode === 'order12_initial' || cartMode === 'order12_recalled'
      ? '≈ $ 2.87 USD'
      : cartMode === 'americano_active'
      ? '≈ $ 1.64 USD'
      : '≈ $ 0.00 USD';

  // Drawer slide spring (opens at f316)
  const drawerSpring = spring({
    frame: Math.max(0, frame - 316),
    fps,
    config: { damping: 16, mass: 0.8 },
  });

  // Top "En espera (1)" badge attention pulse during Scene 2
  const badgePulse =
    isOrderOnHold && frame >= 45 && frame < 280
      ? 1 + Math.sin((frame - 45) / 5) * 0.05
      : 1;

  // =========================================================================
  // 4. Calibrated Touch Finger Trajectory (Inside 540x860 Terminal)
  //    Rule 5.2: Minimum 4-frame dwell before every tap
  // =========================================================================
  // Key targets inside 540x860 terminal:
  // - "Poner en Espera" bottom-left button: (135, 788) -> Live Action tap at f0..f12
  // - "Café Americano" card (col 2, row 1): (270, 215) -> Dwell f92..f102, tap f102..f112
  // - Top Bar "Cuentas en Espera (1)" button: (425, 82) -> Dwell f302..f312, tap f312..f322
  // - Drawer "Recuperar Orden #12" button: (325, 324) -> Dwell f418..f428, tap f428..f438
  // - Bottom-right "Cobrar (C$ 105.00)" button: (375, 788) -> Dwell f533..f543, tap f543..f556
  const touchX = interpolate(
    frame,
    [
      0, 12, 42, 92, 102, 115, 220, 302, 312, 325, 418, 428, 440, 533, 543, 558,
    ],
    [
      135, 135, 270, 270, 270, 270, 350, 425, 425, 425, 325, 325, 325, 375, 375,
      375,
    ],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const touchY = interpolate(
    frame,
    [
      0, 12, 42, 92, 102, 115, 220, 302, 312, 325, 418, 428, 440, 533, 543, 558,
    ],
    [
      788, 788, 215, 215, 215, 215, 150, 82, 82, 82, 324, 324, 324, 788, 788,
      788,
    ],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const isTouched =
    isHoldButtonPressed ||
    isAmericanoTapped ||
    isHoldTopBtnTapped ||
    isRecallBtnTapped ||
    isCobrarBtnTapped;

  // Single deterministic ripple per tap (avoids CSS animate-ping double pulse)
  const tapLocalFrame = isHoldButtonPressed
    ? frame
    : isAmericanoTapped
    ? frame - 102
    : isHoldTopBtnTapped
    ? frame - 312
    : isRecallBtnTapped
    ? frame - 426
    : isCobrarBtnTapped
    ? frame - 543
    : -1;

  const rippleScale =
    tapLocalFrame >= 0
      ? interpolate(tapLocalFrame, [0, 8], [0.9, 1.9], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;

  const rippleOpacity =
    tapLocalFrame >= 0
      ? interpolate(tapLocalFrame, [0, 8], [0.75, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 0;

  // =========================================================================
  // 5. Kinetic Subtitles Opacity (Bottom Safe Zone >= 280px)
  // =========================================================================
  const subScene1Opacity = interpolate(frame, [0, 6, 36, 44], [1, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const subScene2Line1Opacity = interpolate(
    frame,
    [45, 56, 265, 278],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const subScene2Line2Opacity = interpolate(
    frame,
    [90, 105, 265, 278],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const subScene3Line1Opacity = interpolate(
    frame,
    [280, 294, 575, 588],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const subScene3Line2Opacity = interpolate(
    frame,
    [335, 350, 575, 588],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans">
      {/* Ambient institutional lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[820px] h-[820px] bg-[#003757]/75 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-10 w-[550px] h-[550px] bg-[#00BF81]/12 rounded-full blur-[160px] pointer-events-none" />

      {/* ===================================================================
          TOP SAFE ZONE (pt-[104px] + p-8 => 136px >= 130px)
         =================================================================== */}
      <div className="w-full pt-[104px] flex flex-col items-center z-10 text-center">
        {/* Context Pill */}
        <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 mb-3 shadow-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#00BF81]" />
          <span>Agilidad Operativa · Cuentas en Espera &amp; Variantes</span>
        </span>

        {/* Scene Dynamic Title */}
        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          {mainTitle}
        </h2>
      </div>

      {/* ===================================================================
          CENTER STAGE: MIRAY Q80 Terminal (Persistent across Scenes 1, 2, 3)
         =================================================================== */}
      <div className="w-full flex-1 flex items-center justify-center z-20">
        <div
          className="relative rounded-[48px] bg-slate-900 p-4 shadow-[0_25px_80px_rgba(0,0,0,0.65)] border-4 border-slate-700/80 overflow-hidden"
          style={{
            width: '540px',
            height: '860px',
            transform: `scale(${terminalScale})`,
            transformOrigin: `50% ${originY}%`,
          }}
        >
          {/* 58mm Thermal Printer Slot on MIRAY Q80 Bezel */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-48 h-3.5 bg-slate-800 rounded-full flex items-center justify-center z-30 border border-slate-700">
            <div className="w-32 h-1 bg-black/70 rounded-full" />
          </div>

          {/* POS Touchscreen Surface */}
          <div className="w-full h-full bg-[#F8FAFC] rounded-[32px] overflow-hidden flex flex-col pt-3 text-slate-800 relative">
            {/* Top Status Bar */}
            <div className="h-10 bg-[#003757] text-white px-3.5 flex items-center justify-between text-[11px] font-medium shrink-0">
              <div className="flex items-center gap-2">
                <Store className="w-3.5 h-3.5 text-[#00BF81]" />
                <span className="font-bold tracking-wide">Café San Juan</span>
                <span className="text-white/40">|</span>
                <span className="text-white/85 flex items-center gap-1">
                  <User className="w-3 h-3" /> Carlos Cajero
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-[#00BF81]/25 text-[#00BF81] border border-[#00BF81]/40 px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1">
                  <Wifi className="w-3 h-3" /> En Línea
                </span>
                <span
                  className="text-white/80 font-mono text-[10px]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  10:45 AM
                </span>
              </div>
            </div>

            {/* Category Bar + Top-Right "Cuentas en Espera (1)" Indicator (Rule 7.D: "Todas" active) */}
            <div className="h-12 bg-white border-b border-slate-200 px-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-[#003757] text-white shadow-sm">
                  Todas
                </span>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                  Café & Barra
                </span>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                  Repostería
                </span>
              </div>

              {/* Cuentas en Espera Top Bar Button (Focus of Frame 45 Zoom & Scene 3 Tap) */}
              <div
                className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold flex items-center gap-1.5 border ${
                  holdCount > 0
                    ? isHoldTopBtnTapped
                      ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-inner'
                      : 'bg-amber-100 text-amber-950 border-amber-400 shadow-sm'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
                style={{
                  transform: `scale(${isHoldTopBtnTapped ? 0.96 : badgePulse})`,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Clock
                  className={`w-3.5 h-3.5 ${
                    holdCount > 0 ? 'text-amber-700' : 'text-slate-400'
                  }`}
                />
                <span>En espera ({holdCount})</span>
              </div>
            </div>

            {/* Main Catalog Grid (6 Products under "Todas" Category) */}
            <div className="p-3 grid grid-cols-3 gap-2.5 bg-slate-100/70">
              {CATALOG_PRODUCTS.map((product) => {
                const isCardPressed =
                  product.id === 'americano' && isAmericanoTapped;
                const isCardSelected =
                  product.id === 'americano' && cartMode === 'americano_active';
                const isCapuccinoHighlighted =
                  product.id === 'capuccino' &&
                  (cartMode === 'order12_initial' ||
                    cartMode === 'order12_recalled');

                return (
                  <div
                    key={product.id}
                    className={`rounded-xl p-2.5 border-2 flex flex-col justify-between h-[112px] ${
                      isCardPressed || isCardSelected
                        ? 'bg-emerald-50 border-[#00BF81] shadow-md'
                        : isCapuccinoHighlighted
                        ? 'bg-white border-[#003757]/40 shadow-sm'
                        : 'bg-white border-slate-200/90 shadow-sm'
                    }`}
                    style={{
                      transform: isCardPressed ? 'scale(0.97)' : 'scale(1)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        {product.category}
                      </span>
                      {product.badge && (
                        <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {product.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-extrabold text-slate-800 leading-tight">
                      {product.name}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span
                        className="text-xs font-black text-[#003757]"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {product.price}
                      </span>
                      <div className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center text-[#003757]">
                        <Coffee className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ===============================================================
                ACTIVE CART & BOTTOM ACTION BAR
               =============================================================== */}
            <div className="flex-1 bg-white border-t-2 border-slate-200 px-3.5 py-3 flex flex-col justify-between shadow-lg">
              {/* Cart Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-[#003757]" />
                  <span className="text-xs font-extrabold text-[#003757] uppercase tracking-wide">
                    {cartMode === 'order12_initial'
                      ? 'Orden #12 en Proceso · Mostrador'
                      : cartMode === 'order12_recalled'
                      ? 'Orden #12 Recuperada · Intacta'
                      : cartMode === 'americano_active'
                      ? 'Orden #13 · Venta Rápida Mostrador'
                      : 'Carrito Despejado · Caja Libre'}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                    cartMode === 'order12_initial' ||
                    cartMode === 'order12_recalled'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : cartMode === 'americano_active'
                      ? 'bg-sky-50 text-sky-800 border border-sky-200'
                      : 'bg-amber-50 text-amber-900 border border-amber-300'
                  }`}
                >
                  {cartMode === 'order12_initial'
                    ? 'Con Modificadores'
                    : cartMode === 'order12_recalled'
                    ? 'Recuperada en <50 ms'
                    : cartMode === 'americano_active'
                    ? 'Siguiente en Fila'
                    : 'Listo para Cobrar'}
                </span>
              </div>

              {/* Cart Items Content Area */}
              <div className="my-auto py-1">
                {(cartMode === 'order12_initial' ||
                  cartMode === 'order12_recalled') && (
                  <div className="bg-emerald-50/70 border-2 border-[#00BF81]/50 rounded-xl p-2.5 space-y-1.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-[#003757] text-white text-[11px] font-black flex items-center justify-center">
                          1
                        </span>
                        <span className="text-xs font-black text-slate-900">
                          Capuccino Artesanal
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">
                          (Base C$ 85.00)
                        </span>
                      </div>
                      <span
                        className="text-sm font-black text-[#003757]"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        C$ 105.00
                      </span>
                    </div>
                    <div className="pl-7 flex items-center justify-between text-[11px]">
                      <span className="font-extrabold text-emerald-800 flex items-center gap-1">
                        <Check className="w-3 h-3 text-[#00BF81] stroke-[3]" />
                        Tipo de Leche: Leche de Almendras
                      </span>
                      <span
                        className="font-bold text-emerald-900"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        +C$ 20.00
                      </span>
                    </div>
                    <div className="pl-7 flex items-center justify-between text-[10px] text-slate-600 font-semibold italic">
                      <span>Nota: Sin azúcar · Para llevar</span>
                      {cartMode === 'order12_recalled' && (
                        <span className="not-italic text-[9px] font-black text-[#003757] bg-[#00BF81]/30 px-2 py-0.5 rounded">
                          VARIANTES INTACTAS
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {cartMode === 'americano_active' && (
                  <div className="bg-sky-50/80 border-2 border-sky-300 rounded-xl p-3 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-md bg-[#003757] text-white text-[11px] font-black flex items-center justify-center">
                        1
                      </span>
                      <div>
                        <div className="text-xs font-black text-slate-900">
                          Café Americano
                        </div>
                        <div className="text-[10px] font-bold text-sky-800">
                          Cliente siguiente atendido sin espera
                        </div>
                      </div>
                    </div>
                    <span
                      className="text-sm font-black text-[#003757]"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      C$ 60.00
                    </span>
                  </div>
                )}

                {(cartMode === 'empty_after_hold' ||
                  cartMode === 'empty_before_recall') && (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                        <PauseCircle className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-slate-800">
                          {cartMode === 'empty_after_hold'
                            ? 'Orden #12 guardada en espera · Carrito en C$ 0.00'
                            : 'Orden rápida despachada · Listo para recuperar'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          La fila avanza al instante sin perder modificadores
                        </div>
                      </div>
                    </div>
                    <span
                      className="text-xs font-black text-slate-500 font-mono"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      C$ 0.00
                    </span>
                  </div>
                )}
              </div>

              {/* Totals Strip + Dual Action Row: [Poner en Espera] | [Cobrar] */}
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Total a Cobrar
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-[11px] font-bold text-slate-400"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {cartUsdText}
                    </span>
                    <span
                      className="text-xl font-black text-[#003757]"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {cartTotalText}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-2">
                  {/* Left Button (col-span-5): Poner en Espera (Pressed at Frame 0 Live Action!) */}
                  <button
                    className={`col-span-5 h-12 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 border-2 ${
                      isHoldButtonPressed
                        ? 'bg-amber-500 text-slate-950 border-amber-600 ring-4 ring-amber-400/50 shadow-inner'
                        : 'bg-amber-50 text-amber-950 border-amber-400 shadow-sm'
                    }`}
                    style={{
                      transform: isHoldButtonPressed ? 'scale(0.96)' : 'scale(1)',
                    }}
                  >
                    <PauseCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Poner en Espera</span>
                  </button>

                  {/* Right Button (col-span-7): Cobrar */}
                  <button
                    className={`col-span-7 h-12 rounded-xl font-black text-xs tracking-wide uppercase flex items-center justify-center gap-2 shadow-md ${
                      isCobrarBtnTapped
                        ? 'bg-[#009665] text-white ring-4 ring-[#00BF81]/40'
                        : cartTotalText === 'C$ 0.00'
                        ? 'bg-slate-200 text-slate-400'
                        : 'bg-[#00BF81] text-[#003757]'
                    }`}
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      transform: isCobrarBtnTapped ? 'scale(0.97)' : 'scale(1)',
                    }}
                  >
                    <span>
                      {cartTotalText === 'C$ 0.00'
                        ? 'Cobrar (C$ 0.00)'
                        : `Cobrar (${cartTotalText})`}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* ===============================================================
                SLIDE-OVER DRAWER: Cuentas en Espera (Scene 3: f316..f438)
               =============================================================== */}
            {isDrawerOpen && (
              <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px] flex justify-end z-40">
                <div
                  className="w-[82%] h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col justify-between p-4"
                  style={{
                    transform: `translateX(${interpolate(
                      drawerSpring,
                      [0, 1],
                      [320, 0]
                    )}px)`,
                  }}
                >
                  <div className="space-y-3">
                    {/* Drawer Header */}
                    <div className="bg-[#003757] text-white rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#00BF81]" />
                        <div>
                          <h3 className="text-xs font-extrabold uppercase tracking-wider">
                            Cuentas en Espera (1)
                          </h3>
                          <p className="text-[10px] text-white/75">
                            Recuperación instantánea con modificadores
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                        1 ACTIVA
                      </span>
                    </div>

                    {/* Saved Order #12 Card */}
                    <div className="bg-emerald-50/70 border-2 border-[#00BF81] rounded-2xl p-3.5 space-y-2.5 shadow-md">
                      {/* Saved Order #12 Header */}
                      <div className="flex items-start justify-between border-b border-emerald-200/80 pb-2 gap-2">
                        <div className="flex-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded">
                            En Espera · Mostrador
                          </span>
                          <h4 className="text-xs font-black text-[#003757] mt-1">
                            Orden #12 - Capuccino Artesanal
                          </h4>
                        </div>
                        <div className="text-right shrink-0 whitespace-nowrap">
                          <div
                            className="text-sm font-black text-[#003757]"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            C$ 105.00
                          </div>
                          <div className="text-[10px] text-slate-500 font-semibold">
                            Hace 25 seg
                          </div>
                        </div>
                      </div>

                      {/* Preserved Item + Variant Breakdown */}
                      <div className="bg-white rounded-xl p-2.5 border border-emerald-200 space-y-1 text-xs">
                        <div className="flex justify-between font-bold text-slate-800">
                          <span>1x Capuccino Artesanal</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                            C$ 85.00
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] font-extrabold text-emerald-800 pl-2">
                          <span>+ Leche de Almendras</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                            +C$ 20.00
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 pl-2 font-semibold italic">
                          Nota: Sin azúcar · Para llevar
                        </div>
                      </div>

                      {/* Additional Catalog Suggestion Pill */}
                      <div className="flex items-center justify-between text-[10px] text-slate-600 bg-white/80 px-2.5 py-1.5 rounded-lg border border-slate-200">
                        <span className="font-semibold">
                          Sugerido en mostrador: Pastel Tres Leches
                        </span>
                        <span
                          className="font-bold text-[#003757]"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          C$ 90.00
                        </span>
                      </div>

                      {/* Primary Recall Action Button */}
                      <button
                        className={`w-full h-11 rounded-xl font-black text-xs tracking-wide flex items-center justify-center gap-2 shadow-md ${
                          isRecallBtnTapped
                            ? 'bg-[#009665] text-white ring-4 ring-[#00BF81]/40'
                            : 'bg-[#00BF81] text-[#003757]'
                        }`}
                        style={{
                          transform: isRecallBtnTapped ? 'scale(0.97)' : 'scale(1)',
                        }}
                      >
                        <PlayCircle className="w-4 h-4" />
                        <span>Recuperar Orden #12 · Reanudar</span>
                      </button>
                    </div>
                  </div>

                  {/* Drawer Footer Info */}
                  <div className="bg-slate-100 rounded-xl p-2.5 border border-slate-200 flex items-center justify-between text-[10px] text-slate-600 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-[#003757]" />
                      Persistencia local instantánea
                    </span>
                    <span className="font-bold text-[#003757]">&lt; 50 ms</span>
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                TOUCH FINGER INDICATOR (With 4+ frame dwell & single ripple)
               =============================================================== */}
            <div
              className="absolute pointer-events-none z-50"
              style={{
                left: `${touchX}px`,
                top: `${touchY}px`,
                transform: `translate(-50%, -50%) scale(${isTouched ? 0.92 : 1})`,
              }}
            >
              <div className="w-10 h-10 rounded-full bg-white/80 border-2 border-[#00BF81] shadow-2xl flex items-center justify-center">
                <div className="w-3.5 h-3.5 rounded-full bg-[#00BF81]" />
              </div>
              {tapLocalFrame >= 0 && (
                <span
                  className="absolute inset-0 rounded-full border-2 border-[#00BF81] bg-[#00BF81]/40 pointer-events-none"
                  style={{
                    transform: `scale(${rippleScale})`,
                    opacity: rippleOpacity,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================
          BOTTOM SAFE ZONE (h-[320px] pt-6 => bottom >= 280px free)
          Kinetic Subtitles Synchronized with Scenes 1, 2, 3
         =================================================================== */}
      <div className="w-full h-[320px] flex flex-col items-center justify-start pt-6 z-30 text-center">
        {/* Scene 1 Subtitle (f0..f44) */}
        {frame < 45 && (
          <div
            className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: subScene1Opacity,
            }}
          >
            Cuentas en espera.
          </div>
        )}

        {/* Scene 2 Subtitles (f45..f279) */}
        {frame >= 45 && frame < 280 && (
          <div className="space-y-2">
            <div
              className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
              style={{
                fontFamily: 'Renogare, Poppins, sans-serif',
                opacity: subScene2Line1Opacity,
              }}
            >
              Cero filas trabadas.
            </div>
            <div
              className="text-4xl font-black text-[#00BF81] tracking-[1.5px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)]"
              style={{
                fontFamily: 'Renogare, Poppins, sans-serif',
                opacity: subScene2Line2Opacity,
              }}
            >
              Atiende al siguiente al instante.
            </div>
          </div>
        )}

        {/* Scene 3 Subtitles (f280..f589) */}
        {frame >= 280 && (
          <div className="space-y-2">
            <div
              className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
              style={{
                fontFamily: 'Renogare, Poppins, sans-serif',
                opacity: subScene3Line1Opacity,
              }}
            >
              Múltiples órdenes activas.
            </div>
            <div
              className="text-4xl font-black text-[#00BF81] tracking-[1.5px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)]"
              style={{
                fontFamily: 'Renogare, Poppins, sans-serif',
                opacity: subScene3Line2Opacity,
              }}
            >
              Variantes intactas en &lt;50 ms.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
