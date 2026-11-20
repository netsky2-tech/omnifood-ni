import React from 'react';
import { ShieldCheck, Coins } from 'lucide-react';

/**
 * Semana 4 — Pieza 2 (Jueves 19/11): Asset de ticket térmico 80 mm.
 *
 * Versión CAFÉ (continuidad con las fotos reales del cliente de café y con
 * el insert de checkout: 2 × Cappuccino 12oz, promo 2x1, paga $20 USD).
 *
 * Aritmética exacta:
 *   2 × C$ 125.00 = C$ 250.00 · Descuento 2x1 = −C$ 125.00
 *   Subtotal (sin IVA) C$ 108.70 · IVA 15% C$ 16.30 · TOTAL C$ 125.00
 *   $ 20.00 USD × TC 36.6243 = C$ 732.49 → Cambio C$ 607.49
 *
 * Layout real de `ReceiptLayoutFormatter.format80mm` (40 columnas, monoespaciado).
 * Canvas 945×1256 = 80 mm de ancho a 300 dpi. Estático, a sangre completa.
 */
const W = 945;
const H = 1256;

export const Semana4Ticket80mmAsset: React.FC = () => (
  <div
    style={{
      width: W,
      height: H,
      background: '#FFFFFF',
      fontFamily: '"Courier New", ui-monospace, monospace',
      color: '#0F172A',
      fontVariantNumeric: 'tabular-nums',
      padding: '44px 48px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      fontSize: 26,
      lineHeight: 1.35,
    }}
  >
    {/* 1. Business Header (Centered) */}
    <div style={{ textAlign: 'center', paddingBottom: 20, borderBottom: '4px double #94A3B8' }}>
      <div style={{ fontWeight: 900, fontSize: 30, letterSpacing: 2 }}>CAFÉ LA CEIBA</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#334155' }}>RUC: J0310000442106 · RÉGIMEN GENERAL</div>
      <div style={{ fontSize: 22, color: '#64748B' }}>Barrio La Ceiba, Managua · Tel: 2249-8100</div>
      <div style={{ marginTop: 12, fontWeight: 900, fontSize: 28, letterSpacing: 4 }}>
        FACTURA No. 001-001-01-00000893
      </div>
    </div>

    {/* 2. Document Info Block */}
    <div style={{ padding: '16px 0', borderBottom: '2px dashed #94A3B8' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24 }}>
        <span>Fecha: 12/11/2026 08:01</span>
        <span>Caja: Caja 1</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24 }}>
        <span>Atendido por: Carlos Cajero</span>
        <span>Cliente: Contado</span>
      </div>
    </div>

    {/* 3. 80mm 4-Column Master Grid */}
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 5fr 2fr 3fr',
        padding: '12px 0',
        borderBottom: '2px dashed #94A3B8',
        fontWeight: 900,
        color: '#334155',
        fontSize: 24,
      }}
    >
      <span>CANT</span>
      <span>DESCRIPCION</span>
      <span style={{ textAlign: 'right' }}>P.UNIT</span>
      <span style={{ textAlign: 'right' }}>TOTAL</span>
    </div>

    <div style={{ padding: '16px 0', borderBottom: '2px dashed #94A3B8' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 5fr 2fr 3fr', fontSize: 24 }}>
        <span style={{ fontWeight: 700 }}>2</span>
        <span>Cappuccino 12oz</span>
        <span style={{ textAlign: 'right' }}>125.00</span>
        <span style={{ textAlign: 'right', fontWeight: 700 }}>250.00</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 6fr 2fr', fontSize: 24, marginTop: 8 }}>
        <span style={{ fontWeight: 700 }} />
        <span style={{ fontWeight: 700, color: '#003757' }}>PROMOCION 2x1 Cappuccino</span>
        <span style={{ textAlign: 'right', fontWeight: 700, color: '#B91C1C' }}>-125.00</span>
      </div>
    </div>

    {/* 4. Totals & Tax Compliance (Ley 822 / DGI) */}
    <div style={{ padding: '16px 0', borderBottom: '4px double #94A3B8' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#334155' }}>
        <span>SUBTOTAL:</span>
        <span>C$ 108.70</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#334155' }}>
        <span>IVA (15%):</span>
        <span>C$ 16.30</span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 900,
          fontSize: 30,
          paddingTop: 8,
        }}
      >
        <span>TOTAL CORDOBAS:</span>
        <span>C$ 125.00</span>
      </div>
    </div>

    {/* 5. Secondary FX Equivalent (USD) */}
    <div style={{ padding: '14px 20px', margin: '10px 0', background: '#F1F5F9', borderRadius: 10, borderBottom: '2px dashed #94A3B8' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#003757' }}>
        <span>T/C USD (Oficial BCN / Sistema):</span>
        <span>36.6243</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, color: '#16A34A' }}>
        <span>TOTAL USD:</span>
        <span>$ 3.41</span>
      </div>
    </div>

    {/* 6. Payment Breakdown Bimoneda */}
    <div
      style={{
        background: '#ECFDF5',
        border: '4px solid #00BF81',
        borderRadius: 18,
        padding: '20px 22px',
        marginTop: 8,
      }}
    >
      <div
        style={{
          textAlign: 'center',
          fontWeight: 900,
          letterSpacing: 2,
          color: '#003757',
          fontSize: 24,
          borderBottom: '2px solid #A7F3D0',
          paddingBottom: 8,
          marginBottom: 10,
        }}
      >
        ------- DETALLE DE PAGO BIMONEDA -------
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
        <span>Efectivo (USD Recibido):</span>
        <span>$ 20.00 (C$ 732.49)</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 30, color: '#16A34A' }}>
        <span>Cambio (NIO Entregado):</span>
        <span>C$ 607.49</span>
      </div>
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: '2px solid #A7F3D0',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 22,
          fontWeight: 900,
          color: '#003757',
        }}
      >
        <Coins style={{ width: 30, height: 30, color: '#059669' }} />
        <span>Gaveta Virtual: +$ 20.00 USD | -C$ 607.49 NIO</span>
      </div>
    </div>

    {/* 7. Footer */}
    <div
      style={{
        marginTop: 'auto',
        paddingTop: 18,
        borderTop: '2px solid #CBD5E1',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 20,
        fontWeight: 700,
        color: '#64748B',
        letterSpacing: 1,
      }}
    >
      <span>Autorización DGI: AUT-DGI-2026-4410</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          color: '#003757',
        }}
      >
        <ShieldCheck style={{ width: 26, height: 26, color: '#00BF81' }} />
        <span>*** GRACIAS POR SU COMPRA ***</span>
      </span>
    </div>
  </div>
);
