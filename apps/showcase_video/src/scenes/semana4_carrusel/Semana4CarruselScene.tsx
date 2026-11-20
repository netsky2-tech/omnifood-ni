import React from 'react';
import { useCurrentFrame } from 'remotion';
import { NHILOS_BRAND } from '../../tokens/brand';

const { colors } = NHILOS_BRAND;

const RENOGARE = 'Renogare, Poppins, sans-serif';

/* ============================================================
 * Layout compartido para el Carrusel Semana 4.
 * - Variante 4:5  (1080×1350): para Instagram.
 * - Variante 9:16 (1080×1920): nativa de TikTok Photo Mode.
 *   TikTok cubre ~300px inferiores con la UI (caption/audio),
 *   por lo que el pie vive por encima de ese inset.
 * ============================================================ */

type LayoutConfig = {
  height: number;
  padding: string;
  footerGap: number; // espacio reservado bajo el pie
  headlineSize: number;
  titleSize: number;
  bodySize: number;
  ghostSize: number;
  maxWidth: number;
};

const CONFIG_45: LayoutConfig = {
  height: 1350,
  padding: '88px 96px 72px 96px',
  footerGap: 0,
  headlineSize: 78,
  titleSize: 54,
  bodySize: 37,
  ghostSize: 300,
  maxWidth: 880,
};

const CONFIG_916: LayoutConfig = {
  height: 1920,
  padding: '120px 92px 340px 92px',
  footerGap: 0,
  headlineSize: 88,
  titleSize: 60,
  bodySize: 42,
  ghostSize: 340,
  maxWidth: 830,
};

const background = (c: LayoutConfig): React.CSSProperties => ({
  width: 1080,
  height: c.height,
  background: `radial-gradient(circle at 18% 8%, ${colors.navyLight} 0%, ${colors.navy} 48%, ${colors.navyDark} 100%)`,
  position: 'relative',
  overflow: 'hidden',
  fontFamily: 'Poppins, system-ui, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  padding: c.padding,
});

const Decor: React.FC = () => (
  <>
    <div
      style={{
        position: 'absolute',
        width: 620,
        height: 620,
        borderRadius: '50%',
        border: `2px solid rgba(0, 191, 129, 0.10)`,
        top: -180,
        right: -160,
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: 380,
        height: 380,
        borderRadius: '50%',
        border: `2px solid rgba(255, 255, 255, 0.06)`,
        bottom: -120,
        left: -110,
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: colors.green,
        opacity: 0.35,
        top: 260,
        right: 120,
      }}
    />
  </>
);

const Badge: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 14,
      alignSelf: 'flex-start',
      padding: '14px 30px',
      borderRadius: 999,
      background: 'rgba(0, 191, 129, 0.12)',
      border: `1.5px solid rgba(0, 191, 129, 0.45)`,
    }}
  >
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: colors.green,
        boxShadow: `0 0 12px ${colors.green}`,
      }}
    />
    <span
      style={{
        color: colors.green,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: 6,
        fontFamily: RENOGARE,
      }}
    >
      {label}
    </span>
  </div>
);

const Footer: React.FC<{ index: number; arrow?: boolean }> = ({ index, arrow = true }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    }}
  >
    <div
      style={{
        color: 'rgba(255, 255, 255, 0.55)',
        fontSize: 26,
        fontWeight: 600,
        letterSpacing: 5,
        fontFamily: RENOGARE,
      }}
    >
      {`0${index} / 04`}
    </div>
    <div
      style={{
        color: colors.green,
        fontSize: 34,
        fontWeight: 700,
        opacity: arrow ? 1 : 0,
      }}
    >
      →
    </div>
  </div>
);

const GhostNumber: React.FC<{ n: string; size: number }> = ({ n, size }) => (
  <div
    style={{
      position: 'absolute',
      top: 24,
      right: 64,
      fontSize: size,
      fontWeight: 800,
      fontFamily: RENOGARE,
      color: 'rgba(0, 191, 129, 0.10)',
      lineHeight: 1,
      userSelect: 'none',
    }}
  >
    {n}
  </div>
);

const LaminaTitle: React.FC<{ num: string; rest: string; size: number }> = ({ num, rest, size }) => (
  <h2
    style={{
      margin: 0,
      fontSize: size,
      fontWeight: 800,
      fontFamily: RENOGARE,
      color: '#FFFFFF',
      textTransform: 'uppercase',
      letterSpacing: 2,
      lineHeight: 1.2,
    }}
  >
    <span style={{ color: colors.green }}>{num}</span>
    <span style={{ color: 'rgba(255,255,255,0.45)', margin: '0 14px' }}>·</span>
    <span>{rest}</span>
  </h2>
);

const LaminaBody: React.FC<{ text: string; size: number }> = ({ text, size }) => (
  <p
    style={{
      margin: 0,
      fontSize: size,
      fontWeight: 400,
      color: '#C7D7E2',
      lineHeight: 1.55,
    }}
  >
    {text}
  </p>
);

const Divider: React.FC = () => (
  <div
    style={{
      width: 90,
      height: 6,
      borderRadius: 3,
      background: colors.green,
    }}
  />
);

/* ---------- Lámina 1: Portada — Gancho de dolor ---------- */
const CoverLamina: React.FC<{ c: LayoutConfig }> = ({ c }) => (
  <div style={{ ...background(c), justifyContent: 'space-between' }}>
    <Decor />
    <Badge label="AUDITORÍA OPERATIVA" />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 44, maxWidth: c.maxWidth }}>
      <h1
        style={{
          margin: 0,
          fontSize: c.headlineSize,
          fontWeight: 800,
          fontFamily: RENOGARE,
          lineHeight: 1.2,
          color: '#FFFFFF',
        }}
      >
        3 fugas de efectivo silenciosas en tu mostrador{' '}
        <span style={{ color: colors.green }}>que no aparecen en tus reportes de venta.</span>
      </h1>
      <Divider />
    </div>
    <Footer index={1} />
  </div>
);

/* ---------- Láminas 2–4: Fugas ---------- */
const LeakLamina: React.FC<{
  c: LayoutConfig;
  index: number;
  num: string;
  rest: string;
  text: string;
  closing?: React.ReactNode;
}> = ({ c, index, num, rest, text, closing }) => (
  <div style={{ ...background(c), justifyContent: 'space-between' }}>
    <Decor />
    <GhostNumber n={num} size={c.ghostSize} />
    <Badge label="AUDITORÍA OPERATIVA" />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 42, maxWidth: c.maxWidth }}>
      <LaminaTitle num={num} rest={rest} size={c.titleSize} />
      <Divider />
      <LaminaBody text={text} size={c.bodySize} />
      {closing}
    </div>
    <Footer index={index} />
  </div>
);

const ClosingCard: React.FC<{ bodySize: number }> = ({ bodySize }) => (
  <div
    style={{
      marginTop: 10,
      padding: '34px 38px',
      borderRadius: 22,
      background: 'rgba(0, 191, 129, 0.08)',
      border: `1.5px solid rgba(0, 191, 129, 0.45)`,
    }}
  >
    <p
      style={{
        margin: 0,
        fontSize: bodySize - 3,
        fontWeight: 600,
        color: '#FFFFFF',
        lineHeight: 1.5,
      }}
    >
      ¿Quieres auditar estos 3 puntos en tu local?{' '}
      <span style={{ color: colors.green, fontWeight: 800 }}>Comenta CONTROL</span> y te
      enviamos la lista de verificación completa.
    </p>
  </div>
);

const renderLamina = (frame: number, c: LayoutConfig): React.ReactElement => {
  switch (frame) {
    case 0:
      return <CoverLamina c={c} />;
    case 1:
      return (
        <LeakLamina
          c={c}
          index={2}
          num="01"
          rest="EL REDONDEO DEL TIPO DE CAMBIO"
          text="Cuando el cajero calcula el vuelto de billetes en dólares con calculadora manual, los redondeos hacia arriba y errores de tasa acumulan pérdidas invisibles en cada turno."
        />
      );
    case 2:
      return (
        <LeakLamina
          c={c}
          index={3}
          num="02"
          rest="EL ARQUEO CON META EN PANTALLA"
          text={
            'Si el operador ve cuánto dinero "debería" tener antes de contar la gaveta, los sobrantes nunca se reportan y los faltantes se maquillan con tickets pendientes.'
          }
        />
      );
    default:
      return (
        <LeakLamina
          c={c}
          index={4}
          num="03"
          rest="TICKETS ANULADOS SIN HUELLA"
          text="Borrar una venta cobrada en efectivo es la forma más rápida de extraer dinero sin alterar el inventario aparente."
          closing={<ClosingCard bodySize={c.bodySize} />}
        />
      );
  }
};

/**
 * Semana 4 — Pieza 1: Carrusel Educativo 4:5 (1080×1350) para Instagram.
 * Cada frame (0..3) renderiza una lámina distinta; se exporta con `remotion still`.
 */
export const Semana4CarruselScene: React.FC = () => {
  const frame = useCurrentFrame();
  return renderLamina(frame, CONFIG_45);
};

/**
 * Semana 4 — Pieza 1: Carrusel Educativo 9:16 (1080×1920) nativo para
 * TikTok Photo Mode. El pie (`01 / 04`) vive por encima de la UI inferior
 * de TikTok (~300px de inset) y el texto evita la columna derecha de iconos.
 */
export const Semana4CarruselVerticalScene: React.FC = () => {
  const frame = useCurrentFrame();
  return renderLamina(frame, CONFIG_916);
};
