import React from 'react';
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  Img,
} from 'remotion';
import {
  EyeOff,
  Lock,
  ShieldCheck,
  User,
  Wifi,
  Banknote,
  DollarSign,
  CreditCard,
  CheckCircle2,
  Delete,
  Printer,
  Clock,
  Store,
} from 'lucide-react';

export const BlindAuditTerminalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // =========================================================================
  // 1. Dynamic Header Title by Phase
  // =========================================================================
  const mainTitle =
    frame < 45
      ? 'Control de Caja y Turnos'
      : frame < 300
      ? 'Política de Control Activa'
      : 'Conteo Físico Multimoneda';

  // =========================================================================
  // 2. Attention Cut at Frame 45 (Rule 3.D: scale 1.0 -> 1.08 on modal/input)
  // =========================================================================
  const baseScale = 1.18;
  const attentionZoom = interpolate(frame, [45, 115], [1.0, 1.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const terminalScale = baseScale * attentionZoom;

  // =========================================================================
  // 3. Scene 1 (f0..f44): Live Action Frame 0 on "Cerrar Turno" -> Modal Open
  // =========================================================================
  const isCloseBtnPressed = frame >= 0 && frame <= 12;
  const isDrawerBadgeVisible = frame >= 10 && frame <= 42;
  const isModalOpen = frame >= 14;

  const modalSpring = spring({
    frame: Math.max(0, frame - 14),
    fps,
    config: { damping: 17, mass: 0.85 },
  });

  // Security Policy Banner Pulse in Scene 2 (f45..f300)
  const policyPulse =
    frame >= 45 && frame < 300
      ? 1 + Math.sin((frame - 45) / 6) * 0.015
      : 1;

  // =========================================================================
  // 4. Scene 3 (f300..f599): Fast Native Keypad Entry (Tabular Figures)
  // =========================================================================
  // Field 1: Efectivo Córdobas (C$ contado) -> C$ 4,850.00
  const nioDisplay =
    frame < 315
      ? '0.00'
      : frame < 330
      ? '4.00'
      : frame < 345
      ? '48.00'
      : frame < 360
      ? '485.00'
      : '4,850.00';

  // Field 2: Efectivo Dólares (USD contado) -> $ 40.00
  const usdDisplay =
    frame < 395
      ? '0.00'
      : frame < 415
      ? '4.00'
      : '40.00';

  // Field 3: Vouchers POS Conciliados (C$) -> C$ 2,340.00
  const voucherDisplay =
    frame < 460
      ? '0.00'
      : frame < 475
      ? '2.00'
      : frame < 490
      ? '23.00'
      : frame < 505
      ? '234.00'
      : '2,340.00';

  // Active input field highlight
  const activeField: 0 | 1 | 2 | 3 =
    frame >= 300 && frame < 388
      ? 1
      : frame >= 388 && frame < 452
      ? 2
      : frame >= 452 && frame < 525
      ? 3
      : 0;

  // Active keypad key highlight during typing
  const activeKey: string | null =
    frame >= 313 && frame < 322
      ? '4'
      : frame >= 328 && frame < 337
      ? '8'
      : frame >= 343 && frame < 352
      ? '5'
      : frame >= 358 && frame < 368
      ? '0'
      : frame >= 393 && frame < 404
      ? '4'
      : frame >= 413 && frame < 424
      ? '0'
      : frame >= 458 && frame < 467
      ? '2'
      : frame >= 473 && frame < 482
      ? '3'
      : frame >= 488 && frame < 497
      ? '4'
      : frame >= 503 && frame < 512
      ? '0'
      : null;

  const isConfirmClicked = frame >= 552 && frame <= 564;
  const isConfirmedState = frame >= 562;

  // =========================================================================
  // 5. Calibrated Finger Cursor Trajectory (Inside 540x860 Terminal)
  // =========================================================================
  // Dwell before tap >= 4 frames guaranteed at f545..f551 before tap at f552
  const touchX = interpolate(
    frame,
    [
      0, 12, 40, 90, 295, 312, 330, 345, 360, 395, 415, 460, 475, 490, 505,
      544, 551, 565,
    ],
    [
      380, 380, 270, 270, 270, 155, 270, 270, 270, 155, 270, 270, 385, 155,
      270, 270, 270, 270,
    ],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const touchY = interpolate(
    frame,
    [
      0, 12, 40, 90, 295, 312, 330, 345, 360, 395, 415, 460, 475, 490, 505,
      544, 551, 565,
    ],
    [
      710, 710, 255, 255, 355, 625, 665, 625, 705, 625, 705, 585, 585, 625,
      705, 782, 782, 782,
    ],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const isTouched =
    (frame >= 0 && frame <= 12) ||
    activeKey !== null ||
    (frame >= 552 && frame <= 562);

  // =========================================================================
  // 6. Kinetic Subtitles Opacity (Bottom Safe Zone >= 280px)
  // =========================================================================
  const subScene1Opacity = interpolate(frame, [0, 8, 36, 44], [1, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const subScene2Line1Opacity = interpolate(
    frame,
    [45, 56, 285, 298],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const subScene2Line2Opacity = interpolate(
    frame,
    [95, 110, 285, 298],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const subScene3Line1Opacity = interpolate(
    frame,
    [300, 314, 585, 598],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const subScene3Line2Opacity = interpolate(
    frame,
    [355, 370, 585, 598],
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
          Rule 3.C: Lightweight Kinetic Brand Overlay over Live Action
         =================================================================== */}
      <div className="w-full pt-[104px] flex flex-col items-center z-10 text-center">
        {/* 4 Brand Elements Lightweight Bar */}
        <div className="flex items-center gap-2.5 bg-[#003757]/90 border border-white/15 px-4 py-1.5 rounded-full mb-2.5 shadow-md">
          <Img
            src={staticFile('logo.png')}
            alt="NHILOS POS"
            className="w-6 h-6 object-contain"
          />
          <span
            className="text-xs font-black text-white tracking-[3px] uppercase"
            style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
          >
            NHILOS POS
          </span>
          <span className="text-white/30 text-xs">•</span>
          <span className="text-[11px] text-[#CCCCCC] font-medium">
            Conectamos los hilos de tu negocio.
          </span>
          <span className="ml-1 text-[10px] font-extrabold text-[#003757] bg-[#00BF81] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Auditoría de Caja
          </span>
        </div>

        {/* Context Pill */}
        <span className="text-xs font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-5 py-1.5 rounded-full border border-[#00BF81]/40 mb-2 shadow-sm flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-[#00BF81]" />
          <span>Arqueo Ciego · Cero Cuadres Acomodados</span>
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
          className="relative rounded-[48px] bg-slate-900 p-4 shadow-[0_25px_80px_rgba(0,0,0,0.65)] border-4 border-slate-700/80 overflow-hidden origin-center"
          style={{
            width: '540px',
            height: '860px',
            transform: `scale(${terminalScale})`,
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
                  <Wifi className="w-3 h-3" /> TERM-01
                </span>
                <span
                  className="text-white/80 font-mono text-[10px]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  04:30 PM
                </span>
              </div>
            </div>

            {/* Underlying Screen: Control de Caja y Turnos (Live Action at Frame 0) */}
            <div className="flex-1 p-4 flex flex-col justify-between bg-slate-100/80">
              <div className="space-y-3">
                {/* Shift Status Card */}
                <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Turno Activo · Caja 1
                    </span>
                    <h3 className="text-base font-extrabold text-[#003757] mt-1">
                      Control de Caja y Turnos
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Apertura: Hoy 08:00 AM · Operador: Carlos Cajero
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-[#003757]/10 flex items-center justify-center text-[#003757]">
                    <Clock className="w-6 h-6" />
                  </div>
                </div>

                {/* Shift Summary Metrics (Expected Balance Masked!) */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-white rounded-xl p-3 border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">
                      Fondo Inicial (C$)
                    </span>
                    <div
                      className="text-base font-black text-[#003757] mt-0.5"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      C$ 1,500.00
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">
                      Fondo Inicial ($ USD)
                    </span>
                    <div
                      className="text-base font-black text-[#003757] mt-0.5"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      $ 0.00
                    </div>
                  </div>
                </div>

                {/* Masked Theoretical Balance Row on Base Screen */}
                <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                      <EyeOff className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-amber-950">
                        Esperado en Gaveta (Sistema)
                      </div>
                      <div className="text-[10px] text-amber-800 font-medium">
                        Protegido por política de Arqueo Ciego
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-black text-amber-900 bg-amber-200/70 px-2.5 py-1 rounded-md border border-amber-300">
                    C$ ••••••
                  </span>
                </div>

                {/* Drawer Activation Notification Pill (f10..f42) */}
                {isDrawerBadgeVisible && (
                  <div className="bg-[#003757] text-white rounded-xl p-2.5 px-3.5 flex items-center justify-between shadow-md border border-[#00BF81]/50">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#00BF81]" />
                      <span className="text-xs font-bold">
                        Gaveta activada · Abriendo Arqueo Ciego...
                      </span>
                    </div>
                    <span className="text-[10px] text-[#00BF81] font-mono uppercase">
                      GAVETA ABIERTA
                    </span>
                  </div>
                )}
              </div>

              {/* Bottom Action Bar with "Cerrar Turno" Button Pressed at Frame 0 */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-md flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-slate-800">
                    Finalizar Jornada Operativa
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Requiere conteo físico de efectivo y vouchers
                  </div>
                </div>
                <button
                  className={`px-5 h-12 rounded-xl font-black text-xs tracking-wider flex items-center gap-2 shadow-md transition-transform ${
                    isCloseBtnPressed
                      ? 'bg-[#009665] text-white scale-[0.96] ring-4 ring-[#00BF81]/40'
                      : 'bg-[#00BF81] text-[#003757]'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  <span>Cerrar Turno</span>
                </button>
              </div>
            </div>

            {/* ===============================================================
                MODAL: CloseShiftDialog (Arqueo Ciego y Cierre de Turno)
                Opens at f14, stays stable through f600
               =============================================================== */}
            {isModalOpen && (
              <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px] flex items-center justify-center p-3 z-40">
                <div
                  className="w-full h-[94%] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col justify-between"
                  style={{
                    transform: `scale(${interpolate(modalSpring, [0, 1], [0.92, 1])})`,
                  }}
                >
                  {/* Modal Header */}
                  <div className="bg-[#003757] text-white px-4 py-2.5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#00BF81]" />
                      <div>
                        <h3 className="text-xs font-extrabold tracking-wide uppercase">
                          Arqueo Ciego y Cierre de Turno
                        </h3>
                        <p className="text-[10px] text-white/70">
                          Caja 1 · Carlos Cajero · T.C. BCN: 36.6243
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold bg-[#00BF81]/20 text-[#2FE0A4] border border-[#00BF81]/40 px-2 py-0.5 rounded-md">
                      CORTE X
                    </span>
                  </div>

                  {/* Modal Body */}
                  <div className="p-3 space-y-2 flex-1 flex flex-col justify-between overflow-hidden">
                    {/* Prominent Security Control Policy Banner (Focus of Frame 45 Zoom) */}
                    <div
                      className="bg-[#FFFBEB] border-2 border-[#FBBF24] rounded-xl p-2.5 shadow-sm"
                      style={{
                        transform: `scale(${policyPulse})`,
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-[#D97706] shrink-0 mt-0.5">
                          <EyeOff className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-amber-950 tracking-tight">
                              Saldo teórico oculto por política de control
                            </span>
                            <span className="text-[9px] font-extrabold bg-amber-900 text-amber-100 px-1.5 py-0.5 rounded uppercase">
                              OCULTO
                            </span>
                          </div>
                          <p className="text-[10px] text-amber-900/90 leading-snug mt-0.5 font-medium">
                            Cuenta el efectivo físico en gaveta sin consultar la meta del sistema.
                          </p>
                        </div>
                      </div>

                      {/* Locked Theoretical Balance Strip */}
                      <div className="mt-1.5 pt-1.5 border-t border-amber-300/70 flex items-center justify-between text-[10px]">
                        <span className="font-bold text-amber-900 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-[#D97706]" />
                          Meta del Sistema (Saldo Esperado):
                        </span>
                        <span className="font-mono font-black text-amber-950 bg-amber-200/80 px-2 py-0.5 rounded">
                          C$ •••••• | $ ••••
                        </span>
                      </div>
                    </div>

                    {/* 3 Physical Count Inputs (Tabular Figures) */}
                    <div className="space-y-1.5">
                      {/* Input 1: Efectivo Córdobas */}
                      <div
                        className={`rounded-xl px-3 py-1.5 border-2 flex items-center justify-between transition-colors ${
                          activeField === 1
                            ? 'border-[#00BF81] bg-emerald-50/60'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Banknote className="w-4 h-4 text-[#003757]" />
                          <div>
                            <div className="text-[10px] font-bold text-slate-700">
                              Efectivo Córdobas (C$ contado)
                            </div>
                            <div className="text-[9px] text-slate-500">
                              Billetes y monedas en gaveta
                            </div>
                          </div>
                        </div>
                        <div
                          className="text-base font-black text-[#003757] font-mono"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          C$ {nioDisplay}
                        </div>
                      </div>

                      {/* Input 2: Efectivo Dólares */}
                      <div
                        className={`rounded-xl px-3 py-1.5 border-2 flex items-center justify-between transition-colors ${
                          activeField === 2
                            ? 'border-[#00BF81] bg-emerald-50/60'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-emerald-700" />
                          <div>
                            <div className="text-[10px] font-bold text-slate-700">
                              Efectivo Dólares (USD contado)
                            </div>
                            <div
                              className="text-[9px] text-emerald-700 font-semibold"
                              style={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                              {frame >= 415
                                ? '≈ C$ 1,464.97 · T.C. 36.6243'
                                : 'Conversión automática BCN'}
                            </div>
                          </div>
                        </div>
                        <div
                          className="text-base font-black text-emerald-800 font-mono"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          $ {usdDisplay}
                        </div>
                      </div>

                      {/* Input 3: Vouchers POS Conciliados */}
                      <div
                        className={`rounded-xl px-3 py-1.5 border-2 flex items-center justify-between transition-colors ${
                          activeField === 3
                            ? 'border-[#00BF81] bg-emerald-50/60'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-sky-700" />
                          <div>
                            <div className="text-[10px] font-bold text-slate-700">
                              Vouchers POS Conciliados (C$)
                            </div>
                            <div className="text-[9px] text-slate-500">
                              Cierre de lote BAC / Banpro
                            </div>
                          </div>
                        </div>
                        <div
                          className="text-base font-black text-[#003757] font-mono"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          C$ {voucherDisplay}
                        </div>
                      </div>
                    </div>

                    {/* Native Compact Numeric Keypad */}
                    <div className="bg-slate-100 p-2 rounded-xl border border-slate-200">
                      <div className="grid grid-cols-3 gap-1.5">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'].map(
                          (key) => {
                            const isKeyActive = activeKey === key;
                            return (
                              <div
                                key={key}
                                className={`h-8 rounded-lg font-mono font-black text-xs flex items-center justify-center border transition-transform ${
                                  isKeyActive
                                    ? 'bg-[#00BF81] text-[#003757] border-[#009665] scale-95 shadow-inner'
                                    : 'bg-white text-slate-800 border-slate-200 shadow-sm'
                                }`}
                                style={{ fontVariantNumeric: 'tabular-nums' }}
                              >
                                {key}
                              </div>
                            );
                          }
                        )}
                        <div className="h-8 rounded-lg bg-slate-200 text-slate-700 border border-slate-300 flex items-center justify-center">
                          <Delete className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>

                    {/* Primary Confirm Action Button */}
                    <button
                      className={`w-full h-11 rounded-xl font-black text-xs tracking-wider flex items-center justify-center gap-2 shadow-md transition-all ${
                        isConfirmedState
                          ? 'bg-[#003757] text-[#00BF81] border-2 border-[#00BF81]'
                          : isConfirmClicked
                          ? 'bg-[#009665] text-white scale-[0.98]'
                          : 'bg-[#00BF81] text-[#003757]'
                      }`}
                    >
                      {isConfirmedState ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#00BF81]" />
                          <span>Arqueo Confirmado · Imprimiendo Corte X...</span>
                        </>
                      ) : (
                        <>
                          <Printer className="w-4 h-4 text-[#003757]" />
                          <span>Confirmar Arqueo e Imprimir</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                TOUCH FINGER INDICATOR (With 4+ frame dwell before tap)
               =============================================================== */}
            <div
              className="absolute pointer-events-none z-50"
              style={{
                left: `${touchX}px`,
                top: `${touchY}px`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="w-10 h-10 rounded-full bg-white/80 border-2 border-[#00BF81] shadow-2xl flex items-center justify-center">
                <div className="w-3.5 h-3.5 rounded-full bg-[#00BF81]" />
              </div>
              {isTouched && (
                <span className="absolute -inset-2 rounded-full bg-[#00BF81]/55 animate-ping pointer-events-none" />
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
            Arqueo en caja.
          </div>
        )}

        {/* Scene 2 Subtitles (f45..f299) */}
        {frame >= 45 && frame < 300 && (
          <div className="space-y-2">
            <div
              className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
              style={{
                fontFamily: 'Renogare, Poppins, sans-serif',
                opacity: subScene2Line1Opacity,
              }}
            >
              Saldo teórico oculto.
            </div>
            <div
              className="text-4xl font-black text-[#00BF81] tracking-[1.5px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)]"
              style={{
                fontFamily: 'Renogare, Poppins, sans-serif',
                opacity: subScene2Line2Opacity,
              }}
            >
              Cero manipulación de cifras.
            </div>
          </div>
        )}

        {/* Scene 3 Subtitles (f300..f599) */}
        {frame >= 300 && (
          <div className="space-y-2">
            <div
              className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
              style={{
                fontFamily: 'Renogare, Poppins, sans-serif',
                opacity: subScene3Line1Opacity,
              }}
            >
              Arqueo 100% Ciego
            </div>
            <div
              className="text-4xl font-black text-[#00BF81] tracking-[1.5px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)]"
              style={{
                fontFamily: 'Renogare, Poppins, sans-serif',
                opacity: subScene3Line2Opacity,
              }}
            >
              Córdobas, Dólares y Vouchers.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
