import React from 'react';
import {
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  AbsoluteFill,
} from 'remotion';
import {
  MessageSquare,
  Search,
  RefreshCw,
  MoreVertical,
  Menu,
  ShoppingCart,
  Coffee,
  CupSoda,
  Wifi,
  Signal,
  BatteryFull,
  Banknote,
  CreditCard,
  QrCode,
  ArrowLeftRight,
  X,
  CheckCircle2,
  MousePointer2,
} from 'lucide-react';
import { NHILOS_BRAND } from '../tokens/brand';
import { NhilosLogo } from '../components/NhilosLogo';

const { colors } = NHILOS_BRAND;
const RENOGARE = 'Renogare, Poppins, sans-serif';
const POPPINS = 'Poppins, system-ui, sans-serif';
const AMBER = '#F59E0B';
const BRAND_POS = '#1E3A40';
const BRAND_TEAL_LIGHT = '#E6EFF0';

/* Fondo radial compartido: f0 y f744..f749 muestran exactamente este fondo
 * limpio para garantizar un loop sin salto ni flash. */
const BG = `radial-gradient(circle at 50% 40%, ${colors.navyLight} 0%, ${colors.navyDark} 78%)`;

const CLOSE_EXIT_START = 732;
const CLOSE_EXIT_END = 744;

/* Ventanas exactas de cada escena (750 frames = 25.0s @ 30fps) medidas contra
 * las duraciones reales de los MP3 en public/audio/viernes20_*.mp3 */
const B0_FROM = 0;
const B0_DUR = 96; // 3.2s (audio 2.78s = 84f -> 10f aire)
const B1_FROM = 96;
const B1_DUR = 162; // 5.4s (audio 4.94s = 149f -> 9f aire)
const B2_FROM = 258;
const B2_DUR = 222; // 7.4s (audio 6.19s = 186f -> 30f aire)
const B3_FROM = 480;
const B3_DUR = 162; // 5.4s (audio 4.66s = 140f -> 18f aire)
const B4_FROM = 642;
const B4_DUR = 108; // 3.6s (audio 2.59s = 78f -> exit f732..f744)

interface ProductItem {
  sku: string;
  name: string;
  price: string;
  Icon: typeof Coffee;
  promo?: string;
}

const CATALOG: readonly ProductItem[] = [
  { sku: '101', name: 'Espresso Doble', price: '80.00', Icon: Coffee },
  { sku: '102', name: 'Espresso Sencillo', price: '70.00', Icon: Coffee },
  { sku: '104', name: 'Americano 12oz', price: '100.00', Icon: CupSoda },
  { sku: '105', name: 'Americano 8oz', price: '90.00', Icon: CupSoda },
  { sku: '106', name: 'Cappuccino 12oz', price: '125.00', Icon: Coffee, promo: '2x1' },
  { sku: '107', name: 'Cortadito 6oz', price: '90.00', Icon: Coffee },
];

/* ------------------------------------------------------------------ */
/* Tipografía protagonista T2 (estilo ganador de Semana4Pieza2Digital) */
/* ------------------------------------------------------------------ */
const SlamType: React.FC<{
  appearAt: number;
  disappearAt?: number;
  top: number;
  fontSize: number;
  children: React.ReactNode;
}> = ({ appearAt, disappearAt, top, fontSize, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < appearAt || (disappearAt !== undefined && frame >= disappearAt)) return null;
  const s = spring({
    frame: frame - appearAt,
    fps,
    config: { damping: 14, mass: 0.45 },
    durationInFrames: 6,
  });
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 96,
        right: 120,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 25,
        opacity: interpolate(frame, [appearAt, appearAt + 2], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
      }}
    >
      <div
        style={{
          transform: `scale(${interpolate(s, [0, 1], [1.22, 1])})`,
          fontFamily: RENOGARE,
          fontWeight: 900,
          fontSize,
          lineHeight: 1.12,
          letterSpacing: -1.5,
          color: '#FFFFFF',
          textAlign: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* CTA persistente temprano (R9): visible desde f45 hasta salida f732 */
/* ------------------------------------------------------------------ */
const PersistentCTA: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 45 || frame >= CLOSE_EXIT_END) return null;
  const opacity = interpolate(
    frame,
    [45, 50, CLOSE_EXIT_START, CLOSE_EXIT_START + 8],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return (
    <div
      style={{
        position: 'absolute',
        top: 128,
        left: 90,
        right: 120,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(0, 31, 51, 0.92)',
          border: '2px solid rgba(0, 191, 129, 0.55)',
          borderRadius: 999,
          padding: '12px 26px',
          boxShadow: '0 8px 28px rgba(0, 0, 0, 0.35)',
        }}
      >
        <MessageSquare style={{ width: 26, height: 26, color: colors.green }} />
        <span
          style={{
            fontFamily: RENOGARE,
            fontWeight: 800,
            fontSize: 28,
            color: '#FFFFFF',
            whiteSpace: 'nowrap',
          }}
        >
          Comenta DEMO
        </span>
        <span
          style={{
            fontFamily: RENOGARE,
            fontWeight: 700,
            fontSize: 24,
            color: colors.greenLight,
            whiteSpace: 'nowrap',
          }}
        >
          · acceso a la demo
        </span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Subtítulos obligatorios (R6): legibles a 360px y sobre bottom 320px */
/* ------------------------------------------------------------------ */
interface SubtitleCue {
  from: number;
  to: number;
  text: string;
}

const SUBTITLE_CUES: readonly SubtitleCue[] = [
  { from: 2, to: 88, text: 'Ocho de la mañana: fila llena y cajero nuevo.' },
  {
    from: 98,
    to: 250,
    text: 'Si busca cada orden 15 s, 20 cafés frenan 5 min tu mostrador.',
  },
  {
    from: 262,
    to: 416,
    text: 'En NHILOS digitas el código corto, presionas Enter y entra al carrito.',
  },
  { from: 416, to: 472, text: 'Tocas cobrar.' },
  {
    from: 484,
    to: 632,
    text: 'Paga con C$ 200: vuelto exacto al instante y ágil desde el día 1.',
  },
  { from: 646, to: 730, text: 'Comenta DEMO abajo para enviarte el acceso directo.' },
];

const MandatorySubtitles: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 2 || frame >= CLOSE_EXIT_START) return null;
  const cue = SUBTITLE_CUES.find((c) => frame >= c.from && frame < c.to);
  if (!cue) return null;

  const opacity = interpolate(
    frame,
    [cue.from, cue.from + 4, cue.to - 4, cue.to],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 1500,
        left: 90,
        right: 120,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        zIndex: 90,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'rgba(0, 21, 36, 0.88)',
          border: '1.5px solid rgba(255, 255, 255, 0.14)',
          borderRadius: 18,
          padding: '12px 24px',
          maxWidth: 850,
        }}
      >
        <div
          style={{
            fontFamily: POPPINS,
            fontWeight: 600,
            fontSize: 32,
            lineHeight: 1.3,
            color: '#FFFFFF',
            textAlign: 'center',
          }}
        >
          {cue.text}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Pantalla real Handheld SaleView (sale_view.dart:1005 & Hero Asset) */
/* Cero nombres de personas, cero marcas de dispositivo, cero clientes */
/* ------------------------------------------------------------------ */
interface HandheldSaleProps {
  searchText: string;
  isSearchFocused: boolean;
  filteredOnlySku104: boolean;
  cartCount: number;
  cartTotal: string;
  showCartSheet: boolean;
  cobrarPressed: boolean;
  enterPressedRipple: number;
}

const HandheldSaleUI: React.FC<HandheldSaleProps> = ({
  searchText,
  isSearchFocused,
  filteredOnlySku104,
  cartCount,
  cartTotal,
  showCartSheet,
  cobrarPressed,
  enterPressedRipple,
}) => {
  const visibleItems = filteredOnlySku104
    ? CATALOG.filter((item) => item.sku === '104')
    : CATALOG;

  return (
    <div
      style={{
        width: 800,
        height: 1280,
        background: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        fontVariantNumeric: 'tabular-nums',
        color: '#0F172A',
        fontFamily: POPPINS,
      }}
    >
      {/* Status bar genérico (cero marcas o datos personales) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 22px 8px',
          fontSize: 20,
          fontWeight: 600,
          color: '#334155',
        }}
      >
        <span>8:04 a. m.</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Wifi style={{ width: 22, height: 22 }} />
          <Signal style={{ width: 22, height: 22 }} />
          <BatteryFull style={{ width: 24, height: 24 }} />
        </div>
      </div>

      {/* AppBar real de SaleView con SearchBarWidget (sale_view.dart:1005) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 18px 14px',
          borderBottom: '1px solid #E2E8F0',
          background: '#FFFFFF',
        }}
      >
        <Menu style={{ width: 32, height: 32, color: '#334155', flexShrink: 0 }} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F1F5F9',
            border: isSearchFocused ? `3px solid ${BRAND_POS}` : '1.5px solid #CBD5E1',
            borderRadius: 10,
            padding: '12px 16px',
            position: 'relative',
            boxShadow: isSearchFocused ? '0 0 0 6px rgba(0, 191, 129, 0.25)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Search style={{ width: 26, height: 26, color: BRAND_POS }} />
            <span
              style={{
                fontSize: 26,
                fontWeight: searchText ? 700 : 500,
                color: searchText ? '#0F172A' : '#64748B',
                letterSpacing: searchText ? 1 : 0,
              }}
            >
              {searchText || 'Nombre o SKU'}
            </span>
            {isSearchFocused && (
              <span
                style={{
                  display: 'inline-block',
                  width: 3,
                  height: 28,
                  background: colors.green,
                }}
              />
            )}
          </div>
          {searchText && (
            <div
              style={{
                background: colors.green,
                color: '#00253B',
                fontWeight: 800,
                fontSize: 18,
                padding: '4px 12px',
                borderRadius: 8,
                transform: `scale(${1 + enterPressedRipple * 0.14})`,
              }}
            >
              Enter ↵
            </div>
          )}
        </div>
        <RefreshCw style={{ width: 28, height: 28, color: '#334155', flexShrink: 0 }} />
        <MoreVertical style={{ width: 28, height: 28, color: '#334155', flexShrink: 0 }} />
      </div>

      {/* CategoryFilterBar */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 18px' }}>
        {['Todo', 'Cafés', 'Bebidas', 'Postres'].map((cat, idx) => (
          <div
            key={cat}
            style={{
              padding: '10px 22px',
              borderRadius: 999,
              fontSize: 20,
              fontWeight: 700,
              background: idx === 0 ? BRAND_POS : '#FFFFFF',
              color: idx === 0 ? '#FFFFFF' : '#334155',
              border: `1.5px solid ${idx === 0 ? BRAND_POS : '#E2E8F0'}`,
            }}
          >
            {cat}
          </div>
        ))}
      </div>

      {/* ProductGrid 3 columnas (2 filas o filtrada por SKU 104) */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridAutoRows: '260px',
          gap: 14,
          padding: '0 18px',
        }}
      >
        {visibleItems.map((item) => {
          const isMatched = filteredOnlySku104 && item.sku === '104';
          return (
            <div
              key={item.sku}
              style={{
                background: '#FFFFFF',
                borderRadius: 16,
                border: isMatched ? `3px solid ${colors.green}` : '1.5px solid #E2E8F0',
                boxShadow: isMatched ? '0 0 28px rgba(0, 191, 129, 0.35)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  background: '#0F172A',
                  color: '#FFFFFF',
                  fontSize: 15,
                  fontWeight: 800,
                  padding: '3px 9px',
                  borderRadius: 6,
                }}
              >
                SKU {item.sku}
              </div>
              {item.promo && (
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: '#EA580C',
                    color: '#FFFFFF',
                    fontSize: 16,
                    fontWeight: 900,
                    padding: '3px 9px',
                    borderRadius: 6,
                  }}
                >
                  {item.promo}
                </div>
              )}
              <div
                style={{
                  flex: 1,
                  background: '#E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <item.Icon style={{ width: 68, height: 68, color: '#334155' }} strokeWidth={1.6} />
              </div>
              <div style={{ padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 19, color: '#0F172A' }}>{item.name}</div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 22,
                    color: BRAND_POS,
                    marginTop: 2,
                  }}
                >
                  C$ {item.price}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* MobileFloatingCartBar (sale_view.dart:637 & Hero Asset) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: BRAND_POS,
          margin: '16px 18px 20px',
          borderRadius: 18,
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative' }}>
            <ShoppingCart style={{ width: 34, height: 34, color: '#FFFFFF' }} />
            <div
              style={{
                position: 'absolute',
                top: -8,
                right: -10,
                background: cartCount > 0 ? colors.green : '#475569',
                color: '#00253B',
                borderRadius: 999,
                fontSize: 16,
                fontWeight: 900,
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {cartCount}
            </div>
          </div>
          <div>
            <div style={{ color: '#FFFFFF', fontWeight: 800, fontSize: 25 }}>
              Total: C$ {cartTotal}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 18 }}>
              {cartCount} productos agregados
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: cartCount > 0 ? colors.green : BRAND_TEAL_LIGHT,
            color: '#00253B',
            fontWeight: 900,
            fontSize: 21,
            padding: '14px 24px',
            borderRadius: 999,
          }}
        >
          <ShoppingCart style={{ width: 22, height: 22 }} />
          <span>VER CARRITO</span>
        </div>
      </div>

      {/* BottomSheet CARRITO (sale_view.dart:2355, 2773) */}
      {showCartSheet && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            zIndex: 30,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: '28px 26px 34px',
              boxShadow: '0 -12px 40px rgba(0, 0, 0, 0.28)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                marginBottom: 20,
              }}
            >
              <ShoppingCart style={{ width: 28, height: 28, color: BRAND_POS }} />
              <span style={{ fontWeight: 900, fontSize: 28, color: BRAND_POS }}>CARRITO</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#F8FAFC',
                border: '1.5px solid #E2E8F0',
                borderRadius: 16,
                padding: '18px 20px',
                marginBottom: 24,
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: 26, color: '#0F172A' }}>
                  1 × Americano 12oz
                </div>
                <div style={{ fontSize: 19, color: '#64748B', marginTop: 4 }}>
                  Agregado por SKU 104
                </div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 28, color: BRAND_POS }}>C$ 100.00</div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
                padding: '0 4px',
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 700, color: '#475569' }}>Total</span>
              <span style={{ fontSize: 34, fontWeight: 900, color: '#003757' }}>C$ 100.00</span>
            </div>

            {/* Etiqueta EXACTA Flutter sale_view.dart:2773 */}
            <div
              style={{
                width: '100%',
                padding: '22px 0',
                borderRadius: 16,
                background: cobrarPressed ? colors.greenDark : colors.green,
                color: '#00253B',
                fontWeight: 900,
                fontSize: 30,
                letterSpacing: 1.5,
                textAlign: 'center',
                transform: cobrarPressed ? 'scale(0.97)' : 'scale(1)',
                boxShadow: '0 10px 28px rgba(0, 191, 129, 0.35)',
              }}
            >
              COBRAR
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Modal real MultiCurrencyCheckoutDialog (multi_currency_checkout_dialog.dart) */
/* Título exacto "Cobro y Facturación", sin folio pre-emitido, botón "COBRAR" */
/* ------------------------------------------------------------------ */
const CheckoutDialogUI: React.FC<{
  selected200: boolean;
  submitPressed: boolean;
  showSuccessBanner: boolean;
}> = ({ selected200, submitPressed, showSuccessBanner }) => (
  <div
    style={{
      width: 800,
      height: 1280,
      background: '#E2E8F0',
      padding: 22,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      fontVariantNumeric: 'tabular-nums',
      fontFamily: POPPINS,
      color: '#0F172A',
    }}
  >
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 24,
        border: '4px solid #003757',
        padding: '26px 26px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.2)',
      }}
    >
      {/* Header exacto sin factura pre-emitida */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 34, fontWeight: 900, color: '#0F172A' }}>
          Cobro y Facturación
        </span>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 999,
            background: '#F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X style={{ width: 26, height: 26, color: '#64748B' }} />
        </div>
      </div>

      {/* SegmentedButton */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: '#F1F5F9',
          borderRadius: 14,
          padding: 6,
          border: '1.5px solid #CBD5E1',
        }}
      >
        <div
          style={{
            background: '#003757',
            color: '#FFFFFF',
            borderRadius: 10,
            padding: '12px 0',
            textAlign: 'center',
            fontWeight: 800,
            fontSize: 22,
          }}
        >
          Cobro Completo
        </div>
        <div
          style={{
            color: '#475569',
            padding: '12px 0',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: 22,
          }}
        >
          Pago Dividido
        </div>
      </div>

      {/* Total Card */}
      <div
        style={{
          background: '#F8FAFC',
          borderRadius: 16,
          border: '2px solid #E2E8F0',
          padding: '18px 20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: '#475569' }}>Total a Cobrar:</span>
          <span style={{ fontSize: 42, fontWeight: 900, color: '#003757' }}>C$ 100.00</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
            paddingTop: 10,
            borderTop: '1.5px solid #E2E8F0',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 20 }}>
            <ArrowLeftRight style={{ width: 20, height: 20, color: '#003757' }} />
            <span style={{ fontWeight: 700, color: '#334155' }}>TC BCN: 36.6243</span>
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#64748B' }}>
            1 × Americano 12oz
          </span>
        </div>
      </div>

      {/* Métodos de pago */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Efectivo', Icon: Banknote, active: true },
          { label: 'Tarjeta', Icon: CreditCard, active: false },
          { label: 'QR / Transfer', Icon: QrCode, active: false },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 999,
              border: m.active ? '2px solid #003757' : '1.5px solid #CBD5E1',
              background: m.active ? 'rgba(0, 55, 87, 0.08)' : '#FFFFFF',
              color: m.active ? '#003757' : '#475569',
              fontSize: 20,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <m.Icon style={{ width: 22, height: 22 }} />
            <span>{m.label}</span>
          </div>
        ))}
      </div>

      {/* Denominaciones sugeridas reales (currency_checkout_calculator.dart:131) */}
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#334155', marginBottom: 10 }}>
          Efectivo recibido (NIO C$)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {['C$ 100', 'C$ 200', 'C$ 500', 'C$ 1,000'].map((chip) => {
            const active = selected200 && chip === 'C$ 200';
            return (
              <div
                key={chip}
                style={{
                  padding: '14px 8px',
                  borderRadius: 12,
                  textAlign: 'center',
                  fontSize: 22,
                  fontWeight: 800,
                  background: active ? '#003757' : '#F8FAFC',
                  color: active ? '#FFFFFF' : '#334155',
                  border: active ? `3px solid ${colors.green}` : '1.5px solid #CBD5E1',
                  boxShadow: active ? '0 0 0 6px rgba(0, 191, 129, 0.25)' : 'none',
                }}
              >
                {chip}
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel de vuelto exacto */}
      <div
        style={{
          borderRadius: 18,
          padding: '18px 20px',
          border: `3px solid ${selected200 ? colors.green : '#CBD5E1'}`,
          background: selected200 ? '#DCFCE7' : '#F8FAFC',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 800, color: '#15803D', textTransform: 'uppercase' }}>
          Vuelto Exacto (NIO)
        </div>
        <div style={{ fontSize: 44, fontWeight: 900, color: '#16A34A', marginTop: 4 }}>
          {selected200 ? 'Vuelto: C$ 100.00' : 'Vuelto: C$ 0.00'}
        </div>
      </div>

      {showSuccessBanner ? (
        <div
          style={{
            borderRadius: 16,
            padding: '20px 0',
            background: '#ECFDF5',
            border: `2px solid ${colors.green}`,
            color: '#065F46',
            fontWeight: 900,
            fontSize: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <CheckCircle2 style={{ width: 32, height: 32, color: colors.green }} />
          <span>Venta registrada en segundos</span>
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            padding: '22px 0',
            borderRadius: 16,
            background: submitPressed ? colors.greenDark : '#003757',
            color: '#FFFFFF',
            fontWeight: 900,
            fontSize: 28,
            letterSpacing: 1.5,
            textAlign: 'center',
            border: `2px solid ${colors.green}`,
            transform: submitPressed ? 'scale(0.97)' : 'scale(1)',
          }}
        >
          COBRAR
        </div>
      )}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Marco de dispositivo genérico con AppBar cubierto + rótulo honesto  */
/* ------------------------------------------------------------------ */
const DeviceFrame: React.FC<{
  zoom: number;
  origin?: string;
  shiftY?: number;
  cursorX?: number;
  cursorY?: number;
  cursorTap?: boolean;
  children: React.ReactNode;
}> = ({
  zoom,
  origin = '50% 40%',
  shiftY = 0,
  cursorX,
  cursorY,
  cursorTap = false,
  children,
}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div style={{ transform: `translateY(${shiftY}px) scale(${zoom})`, transformOrigin: origin }}>
      <div
        style={{
          width: 836,
          height: 1320,
          background: '#0B1220',
          borderRadius: 50,
          padding: '20px 18px',
          boxShadow: '0 40px 100px rgba(0, 0, 0, 0.65), inset 0 0 0 2px rgba(255,255,255,0.08)',
        }}
      >
        <div
          style={{
            width: 800,
            height: 1280,
            borderRadius: 34,
            overflow: 'hidden',
            position: 'relative',
            background: '#F8FAFC',
          }}
        >
          {children}
          {/* Etiqueta obligatoria de transparencia (nhilos_content_system_v1.0.md:142) */}
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0, 31, 51, 0.90)',
              border: `1.5px solid ${colors.green}`,
              color: '#FFFFFF',
              fontFamily: POPPINS,
              fontWeight: 700,
              fontSize: 18,
              padding: '4px 16px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
              zIndex: 50,
            }}
          >
            Pantalla real · cafetería de ejemplo
          </div>

          {cursorX !== undefined && cursorY !== undefined && (
            <div
              style={{
                position: 'absolute',
                left: cursorX,
                top: cursorY,
                transform: `translate(-20%, -20%) scale(${cursorTap ? 0.85 : 1})`,
                zIndex: 80,
                pointerEvents: 'none',
              }}
            >
              {cursorTap && (
                <div
                  style={{
                    position: 'absolute',
                    left: -18,
                    top: -18,
                    width: 64,
                    height: 64,
                    borderRadius: 999,
                    background: 'rgba(0, 191, 129, 0.35)',
                    border: `2px solid ${colors.green}`,
                  }}
                />
              )}
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: 'rgba(0, 55, 87, 0.92)',
                  border: `3px solid ${colors.green}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 20px rgba(0, 0, 0, 0.35)',
                }}
              >
                <MousePointer2 style={{ width: 24, height: 24, color: '#FFFFFF' }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Beat 0 (0..96f): Hook G4 con Lente Macro-Zoom 1.65x en f1 + reset f45 */
/* f0 queda exclusivamente como BG radial limpio para el loop f749==f0  */
/* ------------------------------------------------------------------ */
const HookMacroBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const visibleOpacity = interpolate(frame, [0, 2], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Dispositivo centrado debajo del titular (sin solaparse con el texto superior)
  const zoom = interpolate(frame, [0, 44, 58, 95], [1.14, 1.14, 0.86, 0.86], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const shiftY = interpolate(frame, [0, 44, 58], [320, 320, 140], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  // Lente Macro-Zoom aislada (scale ~1.65 equivalente sobre el campo Nombre o SKU)
  // activa entre f1 y f45; en f45..f56 hace el reset visual prometido.
  const macroOpacity = interpolate(frame, [1, 3, 45, 55], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const macroScale = interpolate(frame, [1, 12, 45, 55], [1.08, 1.0, 1.0, 0.72], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ background: BG }}>
      <div style={{ opacity: visibleOpacity }}>
        <DeviceFrame zoom={zoom} origin="50% 25%" shiftY={shiftY}>
          <HandheldSaleUI
            searchText=""
            isSearchFocused={frame >= 12}
            filteredOnlySku104={false}
            cartCount={0}
            cartTotal="0.00"
            showCartSheet={false}
            cobrarPressed={false}
            enterPressedRipple={0}
          />
        </DeviceFrame>

        {/* Gradiente superior e inferior para contraste limpio sin chocar con UI */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 600,
            background:
              'linear-gradient(to bottom, rgba(0,37,59,0.96) 0%, rgba(0,37,59,0.85) 68%, transparent 100%)',
            zIndex: 15,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 540,
            background:
              'linear-gradient(to top, rgba(0,37,59,0.98) 0%, rgba(0,37,59,0.88) 65%, transparent 100%)',
            zIndex: 15,
            pointerEvents: 'none',
          }}
        />

        {/* Lente Macro-Zoom 1.65x del buscador crítico Nombre o SKU en f1..f45 */}
        {macroOpacity > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 640,
              left: 90,
              right: 120,
              opacity: macroOpacity,
              transform: `scale(${macroScale})`,
              zIndex: 40,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 26,
                border: `5px solid ${colors.green}`,
                padding: '28px 32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 28px 80px rgba(0, 0, 0, 0.55), 0 0 0 10px rgba(0, 191, 129, 0.22)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <Search style={{ width: 44, height: 44, color: BRAND_POS }} />
                <span
                  style={{
                    fontFamily: POPPINS,
                    fontSize: 42,
                    fontWeight: 600,
                    color: '#64748B',
                  }}
                >
                  Nombre o SKU
                </span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 4,
                    height: 44,
                    background: colors.green,
                  }}
                />
              </div>
              <div
                style={{
                  background: '#0F172A',
                  color: '#FFFFFF',
                  fontFamily: RENOGARE,
                  fontSize: 22,
                  fontWeight: 800,
                  padding: '8px 16px',
                  borderRadius: 999,
                }}
              >
                CAJA 1
              </div>
            </div>
          </div>
        )}

        <SlamType appearAt={1} disappearAt={64} top={250} fontSize={88}>
          ¿Tu cajero nuevo
          <br />
          <span style={{ color: AMBER }}>frena la fila?</span>
        </SlamType>
        <SlamType appearAt={64} top={250} fontSize={80}>
          Un <span style={{ color: colors.green }}>código corto</span>
          <br />
          destraba el mostrador
        </SlamType>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Beat 1 (96..258f): Aritmética condicional T2 sobre BG limpio         */
/* ------------------------------------------------------------------ */
const ArithmeticBeat: React.FC = () => (
  <AbsoluteFill style={{ background: BG }}>
    <SlamType appearAt={2} top={340} fontSize={44}>
      <span style={{ color: colors.gray, fontWeight: 700, letterSpacing: 0 }}>
        Si busca cada bebida entre carpetas…
      </span>
    </SlamType>
    <SlamType appearAt={18} top={490} fontSize={140}>
      <span style={{ color: AMBER, fontVariantNumeric: 'tabular-nums' }}>20 × 15 s</span>
    </SlamType>
    <SlamType appearAt={64} top={740} fontSize={128}>
      <span style={{ color: AMBER, fontVariantNumeric: 'tabular-nums' }}>= 5 minutos</span>
    </SlamType>
    <SlamType appearAt={86} top={930} fontSize={68}>
      de fila parada en hora pico
    </SlamType>
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ */
/* Beat 2 (258..480f): Demostración Handheld 104 + Enter -> COBRAR      */
/* ------------------------------------------------------------------ */
const SkuSearchBeat: React.FC = () => {
  const frame = useCurrentFrame();

  // Escritura determinista de "104" entre frames locales 18..42
  let typed = '';
  if (frame >= 20 && frame < 28) typed = '1';
  else if (frame >= 28 && frame < 36) typed = '10';
  else if (frame >= 36 && frame < 56) typed = '104';

  const enterRipple = frame >= 48 && frame <= 55 ? 1 : 0;
  const added = frame >= 56;
  const showSheet = frame >= 134;
  const cobrarTap = frame >= 186 && frame <= 198;

  // Cámara: mantiene el dispositivo completo arriba de y=1340px (cero cruce
  // con la banda esmeralda ni con el lente Macro arriba en top 270px)
  const zoom = interpolate(frame, [0, 80, 112, 170], [0.84, 0.84, 0.82, 0.82], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const shiftY = interpolate(frame, [0, 80, 112, 134], [-60, -60, -185, -185], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  // Lente Macro del tipeo "104 + Enter" encima de la barra superior mientras se digita
  const macroTypingOpacity = interpolate(frame, [16, 20, 58, 66], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Coordenadas del cursor con 4 frames de dwell previos a cada clic
  const cursorX = interpolate(
    frame,
    [0, 12, 16, 48, 86, 124, 128, 148, 180, 184],
    [400, 320, 320, 680, 620, 620, 620, 400, 400, 400],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const cursorY = interpolate(
    frame,
    [0, 12, 16, 48, 86, 124, 128, 148, 180, 184],
    [220, 96, 96, 96, 1190, 1190, 1190, 1170, 1170, 1170],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const cursorTap =
    (frame >= 48 && frame <= 54) ||
    (frame >= 128 && frame <= 134) ||
    cobrarTap;

  return (
    <AbsoluteFill style={{ background: BG }}>
      <DeviceFrame
        zoom={zoom}
        origin="50% 50%"
        shiftY={shiftY}
        cursorX={cursorX}
        cursorY={cursorY}
        cursorTap={cursorTap}
      >
        <HandheldSaleUI
          searchText={typed}
          isSearchFocused={frame >= 16 && frame < 56}
          filteredOnlySku104={typed.length > 0}
          cartCount={added ? 1 : 0}
          cartTotal={added ? '100.00' : '0.00'}
          showCartSheet={showSheet}
          cobrarPressed={cobrarTap}
          enterPressedRipple={enterRipple}
        />
      </DeviceFrame>

      {/* Lente Macro flotante mostrando el código 104 + Enter en grande encima del bezel */}
      {macroTypingOpacity > 0 && typed && (
        <div
          style={{
            position: 'absolute',
            top: 235,
            left: 110,
            right: 120,
            opacity: macroTypingOpacity,
            zIndex: 70,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 22,
              border: `4px solid ${colors.green}`,
              padding: '22px 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Search style={{ width: 40, height: 40, color: BRAND_POS }} />
              <span
                style={{
                  fontFamily: RENOGARE,
                  fontSize: 48,
                  fontWeight: 900,
                  color: '#0F172A',
                  letterSpacing: 3,
                }}
              >
                {typed}
              </span>
            </div>
            <div
              style={{
                background: enterRipple ? colors.greenDark : colors.green,
                color: '#00253B',
                fontFamily: RENOGARE,
                fontWeight: 900,
                fontSize: 28,
                padding: '10px 22px',
                borderRadius: 12,
                transform: `scale(${1 + enterRipple * 0.12})`,
              }}
            >
              Enter ↵
            </div>
          </div>
        </div>
      )}

      {/* Banda esmeralda inferior arriba de los subtítulos */}
      <div
        style={{
          position: 'absolute',
          top: 1365,
          left: 90,
          right: 120,
          background: colors.green,
          borderRadius: 18,
          padding: '18px 20px',
          display: 'flex',
          justifyContent: 'center',
          zIndex: 60,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
        }}
      >
        <span
          style={{
            fontFamily: RENOGARE,
            fontWeight: 900,
            fontSize: 44,
            color: colors.navyDark,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {showSheet ? '1 toque → Cobrar C$ 100.00' : '104 + Enter → directo al carrito'}
        </span>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Beat 3 (480..642f): Cobro C$ 200 -> Vuelto C$ 100 + Resolución T2    */
/* ------------------------------------------------------------------ */
const CheckoutAndResolutionBeat: React.FC = () => {
  const frame = useCurrentFrame();

  // 0..90f (globales 480..570): Modal Cobro y Facturación
  // 90..162f (globales 570..642): Resolución T2 ámbar -> esmeralda
  const showResolution = frame >= 90;
  const tap200 = frame >= 24 && frame <= 32;
  const selected200 = frame >= 26;
  const tapCobrar = frame >= 62 && frame <= 70;
  const completed = frame >= 70;

  const cursorX = interpolate(frame, [0, 20, 24, 56, 60], [400, 310, 310, 400, 400], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cursorY = interpolate(frame, [0, 20, 24, 56, 60], [500, 740, 740, 1085, 1085], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const resolvedProgress = interpolate(frame, [118, 130], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ background: BG }}>
      {!showResolution ? (
        <>
          <DeviceFrame
            zoom={0.86}
            origin="50% 50%"
            shiftY={-110}
            cursorX={cursorX}
            cursorY={cursorY}
            cursorTap={tap200 || tapCobrar}
          >
            <CheckoutDialogUI
              selected200={selected200}
              submitPressed={tapCobrar}
              showSuccessBanner={completed}
            />
          </DeviceFrame>

          <div
            style={{
              position: 'absolute',
              top: 1365,
              left: 90,
              right: 120,
              background: colors.green,
              borderRadius: 18,
              padding: '18px 20px',
              display: 'flex',
              justifyContent: 'center',
              zIndex: 60,
            }}
          >
            <span
              style={{
                fontFamily: RENOGARE,
                fontWeight: 900,
                fontSize: 44,
                color: colors.navyDark,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              Paga C$ 200 → Vuelto exacto C$ 100.00
            </span>
          </div>
        </>
      ) : (
        <AbsoluteFill style={{ background: BG }}>
          <SlamType appearAt={92} top={400} fontSize={82}>
            Sin buscar entre carpetas.
          </SlamType>

          <div
            style={{
              position: 'absolute',
              top: 710,
              left: 88,
              right: 110,
              height: 150,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: RENOGARE,
                fontWeight: 900,
                fontSize: 72,
                color: AMBER,
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                opacity: 1 - resolvedProgress,
              }}
            >
              5 min de fila parada
            </div>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: RENOGARE,
                fontWeight: 900,
                fontSize: 72,
                color: colors.green,
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                opacity: resolvedProgress,
              }}
            >
              0 min buscando menús
            </div>
          </div>

          <div
            style={{
              position: 'absolute',
              top: 900,
              left: 96,
              right: 120,
              textAlign: 'center',
              fontFamily: RENOGARE,
              fontWeight: 700,
              fontSize: 38,
              color: colors.greenLight,
              opacity: resolvedProgress,
            }}
          >
            ágil desde el día 1 con código corto
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Beat 4 (642..750f): Cierre oficial + salida limpia f732..f744 -> loop */
/* ------------------------------------------------------------------ */
const CloseLoopBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Exit en f90..f102 local (= f732..f744 global), dejando f744..f749 BG limpio
  const exit = interpolate(frame, [90, 102], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const logoScale = spring({ frame, fps, config: { damping: 14, mass: 0.9 } });
  const textOpacity = interpolate(frame, [5, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ctaScale = spring({ frame: Math.max(0, frame - 12), fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ background: BG }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
          opacity: exit,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at center, rgba(0,191,129,0.18) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ transform: `scale(${logoScale})`, marginBottom: 28, zIndex: 10 }}>
          <NhilosLogo size={200} />
        </div>
        <h1
          style={{
            opacity: textOpacity,
            fontFamily: RENOGARE,
            letterSpacing: 5,
            fontSize: 64,
            fontWeight: 900,
            color: '#FFFFFF',
            marginBottom: 12,
            zIndex: 10,
          }}
        >
          NHILOS POS
        </h1>
        <p
          style={{
            opacity: textOpacity,
            fontFamily: POPPINS,
            fontSize: 28,
            color: '#E2E8F0',
            textAlign: 'center',
            marginBottom: 42,
            zIndex: 10,
          }}
        >
          Conectamos los hilos de tu negocio.
        </p>
        <div
          style={{
            transform: `scale(${ctaScale})`,
            background: colors.green,
            color: colors.navy,
            fontWeight: 900,
            fontSize: 40,
            padding: '22px 52px',
            borderRadius: 20,
            border: '2px solid rgba(255,255,255,0.28)',
            boxShadow: '0 0 42px rgba(0, 191, 129, 0.45)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 16,
            zIndex: 10,
          }}
        >
          <MessageSquare style={{ width: 34, height: 34, color: colors.navy }} />
          <span style={{ fontFamily: RENOGARE }}>Comenta DEMO</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Composición principal — 750 frames (25.0s @ 30fps)                  */
/* ------------------------------------------------------------------ */
export const Viernes20CafeteriaCodigoReel: React.FC = () => (
  <AbsoluteFill style={{ background: BG }}>
    <Sequence from={B0_FROM} durationInFrames={B0_DUR}>
      <HookMacroBeat />
      <Sequence from={2}>
        <Audio src={staticFile('audio/viernes20_1_hook.mp3')} />
      </Sequence>
    </Sequence>

    <Sequence from={B1_FROM} durationInFrames={B1_DUR}>
      <ArithmeticBeat />
      <Sequence from={2}>
        <Audio src={staticFile('audio/viernes20_2_math.mp3')} />
      </Sequence>
    </Sequence>

    <Sequence from={B2_FROM} durationInFrames={B2_DUR}>
      <SkuSearchBeat />
      <Sequence from={4}>
        <Audio src={staticFile('audio/viernes20_3_sku.mp3')} />
      </Sequence>
    </Sequence>

    <Sequence from={B3_FROM} durationInFrames={B3_DUR}>
      <CheckoutAndResolutionBeat />
      <Sequence from={2}>
        <Audio src={staticFile('audio/viernes20_4_checkout.mp3')} />
      </Sequence>
    </Sequence>

    <Sequence from={B4_FROM} durationInFrames={B4_DUR}>
      <CloseLoopBeat />
      <Sequence from={4}>
        <Audio src={staticFile('audio/viernes20_5_cta.mp3')} />
      </Sequence>
    </Sequence>

    <MandatorySubtitles />
    <PersistentCTA />
  </AbsoluteFill>
);
