import React from 'react';
import {
  Menu,
  Search,
  RefreshCw,
  TriangleAlert,
  MoreVertical,
  Wifi,
  BatteryFull,
  Signal,
  ShoppingCart,
  Coffee,
  CupSoda,
  Croissant,
} from 'lucide-react';

/**
 * Web Hero — Pantalla de ventas del POS (`SaleView`) para montaje en
 * dispositivo (Q80/celular) agarrado por una mano, estilo referencia PayOne.
 *
 * 100% fiel al codebase (`apps/pos_app/lib/ui/features/sales/sale_view.dart`,
 * `widgets/product_card.dart`, `design_system/nhilos_tokens.dart`) y al
 * ground truth fotográfico del cliente de café (menú verbatim):
 *   Espresso Doble 80 · Espresso Sencillo 70 · Americano 12oz 100 ·
 *   Americano 8oz 90 · Cappuccino 12oz 125 (2x1) · Cappuccino 8oz 100 ·
 *   Latte 12oz 125 · Latte 8oz 100 · Cortadito 6oz 90
 *
 * Tokens reales: fondo #F8FAFC, brandPrimary #1E3A40, brandTealLight #E6EFF0,
 * bordes #E2E8F0, texto #0F172A/#64748B, warning #D97706 (promo 2x1).
 * Thumbnails: fallback de categoría real (icono sobre surfaceContainerHighest),
 * como se ve en las fotos del cliente — sin fotos inventadas.
 *
 * Canvas 1600×2560 = lógico 800×1280 @2× (ratio nativo del terminal Q80 y
 * usable como pantalla de celular en el montaje). Estático (asset, no clip).
 */

const BG = '#F8FAFC';
const BRAND = '#1E3A40';
const BRAND_LIGHT = '#E6EFF0';
const BORDER = '#E2E8F0';
const TEXT = '#0F172A';
const MUTED = '#64748B';
const SURFACE_THUMB = '#E2E8F0';
const WARNING = '#D97706';

type Product = {
  name: string;
  price: string;
  Icon: typeof Coffee;
  promo?: string;
};

const PRODUCTS: Product[] = [
  { name: 'Espresso Doble', price: '80.00', Icon: Coffee },
  { name: 'Espresso Sencillo', price: '70.00', Icon: Coffee },
  { name: 'Americano 12oz', price: '100.00', Icon: CupSoda },
  { name: 'Americano 8oz', price: '90.00', Icon: CupSoda },
  { name: 'Cappuccino 12oz', price: '125.00', Icon: Coffee, promo: '2x1' },
  { name: 'Cappuccino 8oz', price: '100.00', Icon: Coffee },
];

const ProductCardTile: React.FC<{ p: Product }> = ({ p }) => {
  const isPromo = !!p.promo;
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 14,
        border: isPromo ? `1.5px solid ${WARNING}` : `1px solid ${BORDER}`,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {isPromo && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: '#EA580C',
            color: '#FFFFFF',
            fontWeight: 900,
            fontSize: 18,
            padding: '3px 10px',
            borderRadius: 8,
            zIndex: 2,
          }}
        >
          {p.promo}
        </div>
      )}
      {/* Thumbnail: fallback de categoría real (icono sobre surfaceContainerHighest) */}
      <div
        style={{
          flex: 1,
          minHeight: 120,
          background: SURFACE_THUMB,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p.Icon style={{ width: '42%', height: '42%', color: '#334155' }} strokeWidth={1.6} />
      </div>
      {/* Footer band: nombre (2 líneas) + precio, centrado como ProductCard real */}
      <div style={{ padding: '8px 6px 10px', textAlign: 'center' }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 19,
            lineHeight: 1.15,
            color: TEXT,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {p.name}
        </div>
        <div
          style={{
            fontWeight: 700,
            fontSize: 22,
            color: isPromo ? WARNING : '#1E3A40',
            fontVariantNumeric: 'tabular-nums',
            marginTop: 2,
          }}
        >
          C$ {p.price}
        </div>
      </div>
    </div>
  );
};

export const Semana4HeroSalesScreenAsset: React.FC = () => (
  <div
    style={{
      width: 800,
      height: 1280,
      background: BG,
      transform: 'scale(2)',
      transformOrigin: 'top left',
      display: 'flex',
      flexDirection: 'column',
      fontVariantNumeric: 'tabular-nums',
      color: TEXT,
    }}
  >
    {/* Status bar (Android real) */}
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 20px 6px',
        fontSize: 20,
        fontWeight: 600,
        color: '#334155',
      }}
    >
      <span>8:01 a. m.</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Wifi style={{ width: 22, height: 22 }} />
        <Signal style={{ width: 22, height: 22 }} />
        <BatteryFull style={{ width: 24, height: 24 }} />
      </div>
    </div>

    {/* Toolbar real de SaleView: hamburger + buscar + refresh + sync + kebab */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px 12px',
      }}
    >
      <Menu style={{ width: 30, height: 30, color: '#334155' }} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: '#FFFFFF',
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '12px 16px',
          color: MUTED,
          fontSize: 22,
        }}
      >
        <Search style={{ width: 24, height: 24 }} />
        <span>Buscar...</span>
      </div>
      <RefreshCw style={{ width: 26, height: 26, color: '#334155' }} />
      <TriangleAlert style={{ width: 26, height: 26, color: '#EA580C' }} />
      <MoreVertical style={{ width: 26, height: 26, color: '#334155' }} />
    </div>

    {/* Category filter chips */}
    <div style={{ display: 'flex', gap: 10, padding: '0 16px 14px', flexWrap: 'nowrap' }}>
      {['Todo', 'Cafés', 'Bebidas', 'Repostería'].map((c, i) => (
        <div
          key={c}
          style={{
            padding: '10px 22px',
            borderRadius: 999,
            fontSize: 20,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            background: i === 0 ? BRAND : '#FFFFFF',
            color: i === 0 ? '#FFFFFF' : '#334155',
            border: `1px solid ${i === 0 ? BRAND : BORDER}`,
          }}
        >
          {c}
        </div>
      ))}
    </div>

    {/* Product grid 3 columnas (banda de teléfono real); 2 filas que llenan la pantalla */}
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: '1fr 1fr',
        gap: 12,
        padding: '0 16px',
      }}
    >
      {PRODUCTS.map((p) => (
        <ProductCardTile key={p.name} p={p} />
      ))}
    </div>

    {/* Cart bar real: Total + VER CARRITO */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: BRAND,
        margin: '14px 16px 16px',
        borderRadius: 16,
        padding: '14px 18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ position: 'relative' }}>
          <ShoppingCart style={{ width: 30, height: 30, color: '#FFFFFF' }} />
          <div
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              background: '#DC2626',
              color: '#FFF',
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 900,
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            1
          </div>
        </div>
        <div>
          <div style={{ color: '#FFFFFF', fontWeight: 800, fontSize: 24 }}>
            Total: C$ 125.00
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18 }}>
            1 productos agregados
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: BRAND_LIGHT,
          color: BRAND,
          fontWeight: 800,
          fontSize: 20,
          padding: '14px 22px',
          borderRadius: 999,
          letterSpacing: 0.5,
        }}
      >
        <ShoppingCart style={{ width: 22, height: 22 }} />
        VER CARRITO
      </div>
    </div>
  </div>
);
