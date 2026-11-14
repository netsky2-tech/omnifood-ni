import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ShieldCheck, CheckCircle2, Coins } from 'lucide-react';
import { NhilosLogo } from '../../components/NhilosLogo';

export const MultiCurrencyTicketScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Desenrollado del ticket térmico de 80 mm (ReceiptLayoutFormatter.format80mm)
  const ticketProgress = spring({
    frame,
    fps,
    config: { damping: 16, mass: 0.85 },
  });
  const ticketHeight = interpolate(ticketProgress, [0, 1], [140, 740]);

  const highlightPulse = spring({
    frame: Math.max(0, frame - 32),
    fps,
    config: { damping: 13 },
  });

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans">
      {/* Glow institucional de fondo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-[#00BF81]/14 rounded-full blur-[180px] pointer-events-none" />

      {/* ===================================================================
          TOP SAFE ZONE (pt-[100px] + p-8 = 132px >= 130px)
         =================================================================== */}
      <div className="w-full pt-[100px] flex flex-col items-center z-20 text-center">
        <div className="inline-flex items-center gap-2.5 bg-[#003757]/90 border border-[#00BF81]/40 px-5 py-2 rounded-full mb-2.5 shadow-lg">
          <NhilosLogo size={24} />
          <span className="text-xs font-extrabold tracking-widest text-white uppercase">
            NHILOS POS
          </span>
          <span className="text-xs text-[#00BF81] font-bold">•</span>
          <span className="text-xs text-slate-200 font-medium">
            Impresión Térmica 80 mm (40 columnas)
          </span>
          <span className="ml-1 text-[11px] font-black text-[#003757] bg-[#00BF81] px-2.5 py-0.5 rounded-full uppercase">
            DGI & BCN
          </span>
        </div>

        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          Desglose Bimoneda en Ticket 80 mm
        </h2>
      </div>

      {/* ===================================================================
          CENTER STAGE: Ticket Térmico de 80 mm (`ReceiptLayoutFormatter.format80mm`)
         =================================================================== */}
      <div className="w-full flex-1 flex flex-col items-center justify-center z-20">
        {/* Ranura de impresora térmica 80 mm */}
        <div className="w-[640px] h-10 bg-slate-900 rounded-t-2xl border-t-2 border-x-2 border-slate-700 flex items-center justify-center shadow-2xl relative z-20">
          <div className="w-[560px] h-2.5 bg-black rounded-full" />
        </div>

        {/* Papel térmico 80 mm con formato monoespaciado de `receipt_layout_formatter.dart` */}
        <div
          className="w-[600px] bg-white rounded-b-2xl shadow-[0_28px_75px_rgba(0,0,0,0.68)] border-x border-b border-slate-300 px-7 py-5 font-mono text-slate-900 text-xs leading-snug overflow-hidden relative"
          style={{
            height: `${ticketHeight}px`,
            maxHeight: '740px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {/* 1. Business Header (Centered) */}
          <div className="text-center pb-2.5 border-b-2 border-double border-slate-400">
            <div className="font-black text-base tracking-wider text-slate-950">
              REPUESTOS &amp; LUBRICANTES EL NORTE
            </div>
            <div className="text-[11px] font-bold text-slate-700">
              RUC: J0310000391205 · RÉGIMEN GENERAL
            </div>
            <div className="text-[11px] text-slate-500">
              Carretera Norte Km 5.5, Managua · Tel: 2249-8100
            </div>
            <div className="mt-1.5 font-black text-sm tracking-widest text-slate-950">
              FACTURA No. 001-001-01-00000892
            </div>
          </div>

          {/* 2. Document Info Block */}
          <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span>Fecha: 12/11/2026 11:15</span>
              <span>Caja: Caja 1</span>
            </div>
            <div className="flex justify-between">
              <span>Atendido por: Carlos Cajero</span>
              <span>Cliente: Contado</span>
            </div>
          </div>

          {/* 3. 80mm 4-Column Master Grid (CANT | DESCRIPCION | P.UNIT | TOTAL) */}
          <div className="py-1.5 border-b border-dashed border-slate-400 text-[11px] font-black text-slate-700 grid grid-cols-12">
            <span className="col-span-2">CANT</span>
            <span className="col-span-5">DESCRIPCION</span>
            <span className="col-span-2 text-right">P.UNIT</span>
            <span className="col-span-3 text-right">TOTAL</span>
          </div>

          <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[11px] font-semibold">
            <div className="grid grid-cols-12">
              <span className="col-span-2 font-bold">1</span>
              <span className="col-span-5">Aceite Sintético 20W50 1Q</span>
              <span className="col-span-2 text-right">380.00</span>
              <span className="col-span-3 text-right font-bold">380.00</span>
            </div>
            <div className="grid grid-cols-12">
              <span className="col-span-2 font-bold">1</span>
              <span className="col-span-5">Filtro Aceite Blindado HD</span>
              <span className="col-span-2 text-right">176.52</span>
              <span className="col-span-3 text-right font-bold">176.52</span>
            </div>
          </div>

          {/* 5. Totals & Tax Compliance (Ley 822 / DGI) */}
          <div className="py-2 border-b-2 border-double border-slate-400 space-y-0.5 text-xs">
            <div className="flex justify-between font-semibold text-slate-700">
              <span>SUBTOTAL:</span>
              <span>C$ 556.52</span>
            </div>
            <div className="flex justify-between font-semibold text-slate-700">
              <span>IVA (15%):</span>
              <span>C$ 83.48</span>
            </div>
            <div className="flex justify-between font-black text-sm text-slate-950 pt-1">
              <span>TOTAL CORDOBAS:</span>
              <span>C$ 640.00</span>
            </div>
          </div>

          {/* 6. Secondary FX Equivalent (USD) */}
          <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5 text-xs bg-slate-50 px-2 rounded my-1">
            <div className="flex justify-between font-bold text-[#003757]">
              <span>T/C USD (Oficial BCN / Sistema):</span>
              <span>36.6243</span>
            </div>
            <div className="flex justify-between font-black text-[#16A34A]">
              <span>TOTAL USD:</span>
              <span>$ 17.47</span>
            </div>
          </div>

          {/* 7. Payment Breakdown (`----------- DETALLE DE PAGO ------------`) */}
          <div
            className="mt-1.5 bg-emerald-50 border-2 border-[#00BF81] rounded-xl p-3 space-y-1 shadow-sm"
            style={{
              transform: `scale(${interpolate(highlightPulse, [0, 1], [0.95, 1])})`,
            }}
          >
            <div className="text-center text-[11px] font-black tracking-widest text-[#003757] border-b border-emerald-200 pb-1 mb-1">
              ------- DETALLE DE PAGO BIMONEDA -------
            </div>
            <div className="flex justify-between text-xs font-extrabold text-slate-900">
              <span>Efectivo (USD Recibido):</span>
              <span>$ 50.00 (C$ 1,831.22)</span>
            </div>
            <div className="flex justify-between text-sm font-black text-[#16A34A]">
              <span>Cambio (NIO Entregado):</span>
              <span>C$ 1,191.22 ($ 32.53)</span>
            </div>

            <div className="pt-1.5 mt-1 border-t border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-[#003757]">
                <Coins className="w-4 h-4 text-[#059669]" />
                <span>Gaveta Virtual: +$ 50.00 USD | -C$ 1,191.22 NIO</span>
              </div>
              <span className="text-[10px] font-black bg-[#00BF81] text-[#003757] px-2 py-0.5 rounded flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>ARQUEO CIEGO OK</span>
              </span>
            </div>
          </div>

          {/* 8. Footer */}
          <div className="text-center pt-2.5 mt-2 border-t border-slate-200 text-[10px] text-slate-500 font-bold tracking-wider flex items-center justify-between">
            <span>Autorización DGI: AUT-DGI-2026-4410</span>
            <span className="flex items-center gap-1 text-[#003757]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00BF81]" />
              <span>*** GRACIAS POR SU COMPRA ***</span>
            </span>
          </div>
        </div>
      </div>

      {/* ===================================================================
          BOTTOM SAFE ZONE (h-[310px] pt-4 => >= 280px libre)
         =================================================================== */}
      <div className="w-full h-[310px] flex flex-col items-center justify-start pt-4 z-30 text-center">
        <div className="space-y-1.5">
          <div
            className="text-[44px] leading-tight font-black text-white tracking-wide drop-shadow-lg"
            style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
          >
            Gaveta bimoneda exacta.
          </div>
          <div
            className="text-[32px] leading-tight font-extrabold text-[#00BF81] tracking-wide drop-shadow-[0_0_20px_rgba(0,191,129,0.35)]"
            style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
          >
            Desglose claro en ticket y cierre.
          </div>
        </div>
      </div>
    </div>
  );
};
