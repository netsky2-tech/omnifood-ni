import React from 'react';
import {
  Store,
  Wifi,
  UserCheck,
  X,
  CreditCard,
  QrCode,
  Banknote,
  ArrowLeftRight,
} from 'lucide-react';

/**
 * Semana 4 — Pieza 2 (Jueves 19/11): Asset de pantalla para terminal MIRAY Q80.
 *
 * Versión CAFÉ (continuidad con las fotos reales 20261002_080016/080158 del
 * cliente de café, cuyo menú muestra Cappuccino 12oz C$ 125.00 con promo 2x1).
 *
 * UI real de `MultiCurrencyCheckoutDialog` (apps/pos_app) en su estado
 * "Cobro Completo · Paga con $ 20.00 USD · Vuelto: C$ 607.49".
 * Aritmética exacta: 2 × C$ 125.00 − Descuento 2x1 (C$ 125.00) = Total C$ 125.00;
 * $ 20.00 USD × TC BCN 36.6243 = C$ 732.49 → Vuelto C$ 607.49.
 *
 * Canvas 1600×2560 = lógico 800×1280 (proporción nativa de la Q80) a escala 2×
 * para nitidez al compositearse sobre la pantalla real en la edición.
 * Estático: sin cursor ni animaciones (asset de montaje, no clip).
 */
export const Semana4Q80ScreenAsset: React.FC = () => (
  <div
    className="w-full h-full bg-[#F8FAFC] flex flex-col relative"
    style={{ fontVariantNumeric: 'tabular-nums', transform: 'scale(2)', transformOrigin: 'top left', width: 800, height: 1280 }}
  >
    {/* AppBar NHILOS POS (equivalente real de la AppBar del POS) */}
    <div className="bg-[#003757] text-white px-8 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Store className="w-8 h-8 text-[#00BF81]" />
        <span className="font-bold text-2xl tracking-wide">Café La Ceiba · Caja 1</span>
        <span className="text-2xl text-white/50">|</span>
        <div className="flex items-center gap-2 text-2xl text-slate-200 font-medium">
          <UserCheck className="w-7 h-7 text-[#00BF81]" />
          <span>Carlos Cajero</span>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-[#00BF81]/20 border border-[#00BF81]/40 px-4 py-1 rounded-full text-xl text-[#00BF81] font-bold">
        <Wifi className="w-6 h-6" />
        <span>Factura #00893</span>
      </div>
    </div>

    {/* Modal oficial MultiCurrencyCheckoutDialog */}
    <div className="flex-1 p-5 flex bg-slate-100/80">
      <div className="w-full h-full bg-white rounded-2xl border-4 border-[#003757] shadow-lg p-6 flex flex-col justify-between">
        {/* 1. Header & SegmentedButton */}
        <div>
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-extrabold text-[#0F172A]">Cobro y Facturación</span>
              <span className="text-xl font-bold text-slate-500 bg-slate-100 px-4 py-1 rounded-lg">
                001-001-01-00000893
              </span>
            </div>
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
              <X className="w-7 h-7" />
            </div>
          </div>

          <div className="grid grid-cols-2 rounded-xl border-2 border-slate-300 bg-slate-100 p-1 mb-4">
            <div className="py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xl font-bold bg-[#003757] text-white shadow-sm">
              <Banknote className="w-7 h-7" />
              <span>Cobro Completo</span>
            </div>
            <div className="py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xl font-bold text-slate-600">
              <Banknote className="w-7 h-7" />
              <span>Pago Dividido</span>
            </div>
          </div>

          {/* Total Header Card */}
          <div className="bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-semibold text-slate-700">Total a Cobrar:</span>
              <span className="text-4xl font-black text-[#003757] tabular-nums">C$ 125.00</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-2xl text-slate-500 font-medium">Equivalente Comercial:</span>
              <span className="text-3xl font-extrabold text-[#16A34A] tabular-nums">$3.41 USD</span>
            </div>
            <div className="border-t-2 border-slate-200 my-3" />
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-3 bg-white border-2 border-slate-300 px-5 py-1.5 rounded-full text-2xl font-bold text-[#0F172A]">
                <ArrowLeftRight className="w-6 h-6 text-[#003757]" />
                <span>TC BCN: 36.6243</span>
              </div>
              <span className="text-xl font-semibold text-slate-500">2 Cappuccino 12oz · Promo 2x1</span>
            </div>
          </div>

          {/* Método de pago */}
          <div className="flex items-center gap-3 mt-4">
            <div className="px-5 py-2 rounded-full bg-[#003757]/10 border-2 border-[#003757] text-[#003757] text-xl font-bold flex items-center gap-3">
              <Banknote className="w-7 h-7" />
              <span>Efectivo</span>
            </div>
            <div className="px-5 py-2 rounded-full bg-white border-2 border-slate-300 text-slate-600 text-xl font-semibold flex items-center gap-3">
              <CreditCard className="w-7 h-7" />
              <span>Tarjeta</span>
            </div>
            <div className="px-5 py-2 rounded-full bg-white border-2 border-slate-300 text-slate-600 text-xl font-semibold flex items-center gap-3">
              <QrCode className="w-7 h-7" />
              <span>QR / Transfer</span>
            </div>
          </div>

          {/* Selectores de moneda */}
          <div className="space-y-2 bg-slate-50 p-3 rounded-xl border-2 border-slate-200 mt-4">
            <div className="flex items-center gap-4">
              <span className="text-2xl font-bold text-slate-700 w-36">Paga con:</span>
              <div className="px-5 py-2 rounded-lg bg-white border-2 border-slate-300 text-slate-600 text-2xl font-semibold">
                NIO (C$)
              </div>
              <div className="px-6 py-2 rounded-lg bg-[#003757] text-white text-2xl font-extrabold shadow-sm ring-4 ring-[#00BF81]/40">
                USD ($)
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-2xl font-bold text-slate-700 w-36">Vuelto en:</span>
              <div className="px-5 py-2 rounded-lg bg-[#00BF81]/20 border-2 border-[#00BF81] text-[#003757] text-2xl font-extrabold">
                Vuelto en NIO (C$)
              </div>
            </div>
          </div>

          {/* Monto recibido */}
          <div className="mt-4">
            <div className="text-lg font-bold text-[#003757] uppercase tracking-wider mb-1.5">
              Monto Recibido (USD)
            </div>
            <div className="w-full px-5 py-3 rounded-xl border-4 border-[#003757] bg-white flex items-center justify-between">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-extrabold text-slate-500">$</span>
                <span className="text-4xl font-black text-[#0F172A] tabular-nums">20.00</span>
                <span className="text-3xl font-bold text-slate-500 ml-2">(= C$ 732.49)</span>
              </div>
              <X className="w-10 h-10 text-slate-400" />
            </div>
          </div>

          {/* Chips rápidos */}
          <div className="flex items-center gap-3 mt-4">
            {['$ 3.41', '$ 20', '$ 50', '$ 100'].map((chip) => {
              const isTwenty = chip === '$ 20';
              return (
                <div
                  key={chip}
                  className={`flex-1 py-2.5 rounded-xl text-center font-extrabold text-xl tabular-nums border-2 ${
                    isTwenty
                      ? 'bg-[#003757] text-white border-[#00BF81] ring-8 ring-[#00BF81]/40 shadow-md'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  {chip}
                </div>
              );
            })}
          </div>

          {/* Vuelto exacto */}
          <div className="rounded-2xl p-4 border-4 border-[#00BF81] bg-[#DCFCE7] shadow-[0_0_60px_rgba(0,191,129,0.45)] mt-4">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-black uppercase tracking-wider text-[#15803D]">
                Vuelto Exacto a Entregar (NIO)
              </span>
              <span className="text-xl font-extrabold bg-[#16A34A] text-white px-4 py-1 rounded-full">
                CÁLCULO &lt;50ms
              </span>
            </div>
            <div className="text-4xl leading-tight font-black text-[#16A34A] tabular-nums mt-1">
              Vuelto: C$ 607.49
            </div>
            <div className="text-2xl font-bold text-slate-600 tabular-nums mt-1">
              Equivalente en USD: $16.59 USD · Tasa: 36.6243
            </div>
          </div>
        </div>

        {/* Botón COBRAR */}
        <div className="pt-3">
          <div className="w-full py-4 rounded-2xl font-black text-2xl tracking-wider uppercase flex items-center justify-center gap-4 shadow-lg bg-[#003757] text-white border-2 border-[#00BF81]/50">
            <span>COBRAR · C$ 125.00</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);
