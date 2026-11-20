import React from 'react';
import { useCurrentFrame } from 'remotion';
import { NhilosLogo } from '../../components/NhilosLogo';
import { NHILOS_BRAND } from '../../tokens/brand';

const { colors } = NHILOS_BRAND;
const RENOGARE = 'Renogare, Poppins, sans-serif';

/**
 * Semana 4 — Pieza 2 (Jueves 19/11): Overlays cinéticos para el video físico.
 *
 * Canvas 1080×1920 con FONDO TRANSPARENTE (PNG alpha) para compositearse
 * sobre el rodaje real en la edición (CapCut / Premiere / Flow).
 * Un frame por overlay (0..3). El texto vive en el tercio superior/centro
 * para no chocar con las manos ni con la UI TikTok inferior (~300px).
 *
 * Los frames f0–f2 usan píldora scrim oscuro translúcido detrás del texto (legible
 * sobre cualquier tomas de iluminación). f3: cierre de marca compacto.
 */

const ScrimText: React.FC<{ children: React.ReactNode; top: number }> = ({ children, top }) => (
  <div
    style={{
      position: 'absolute',
      left: 48,
      right: 48,
      top,
      display: 'flex',
      justifyContent: 'center',
    }}
  >
    <div
      style={{
        background: 'rgba(0, 31, 51, 0.72)',
        border: '2px solid rgba(0, 191, 129, 0.45)',
        borderRadius: 28,
        padding: '28px 44px',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          fontFamily: RENOGARE,
          fontWeight: 800,
          fontSize: 60,
          lineHeight: 1.25,
          color: '#FFFFFF',
        }}
      >
        {children}
      </div>
    </div>
  </div>
);

const Green: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ color: colors.green }}>{children}</span>
);

/* ---------- f3: Overlay de cierre de marca (compacto, para plano limpio) ---------- */
const ClosingOverlay: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      left: 48,
      right: 48,
      top: 520,
      display: 'flex',
      justifyContent: 'center',
    }}
  >
    <div
      style={{
        width: 820,
        background: 'rgba(0, 55, 87, 0.90)',
        border: '2px solid rgba(0, 191, 129, 0.45)',
        borderRadius: 40,
        padding: '48px 56px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
      }}
    >
      <NhilosLogo size={96} />
      <div
        style={{
          fontFamily: RENOGARE,
          fontWeight: 800,
          fontSize: 46,
          letterSpacing: 8,
          color: '#FFFFFF',
        }}
      >
        NHILOS POS
      </div>
      <div
        style={{
          fontSize: 28,
          color: 'rgba(255,255,255,0.75)',
          fontWeight: 500,
        }}
      >
        Conectamos los hilos de tu negocio.
      </div>
      <div
        style={{
          marginTop: 8,
          background: colors.green,
          color: colors.navy,
          fontWeight: 900,
          fontSize: 40,
          padding: '22px 64px',
          borderRadius: 18,
          letterSpacing: 2,
        }}
      >
        ▬ Comenta DEMO
      </div>
    </div>
  </div>
);

export const Semana4OverlaysScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <div style={{ width: 1080, height: 1920, position: 'relative' }}>
      {frame === 0 && (
        <ScrimText top={180}>
          Software real.
          <br />
          <Green>Hardware real.</Green>
        </ScrimText>
      )}

      {frame === 1 && (
        <ScrimText top={180}>
          Cobro bimoneda e impresión <Green>en 1 segundo.</Green>
        </ScrimText>
      )}

      {frame === 2 && (
        <ScrimText top={180}>
          Sin internet.
          <br />
          <Green>Sin filas trabadas.</Green>
        </ScrimText>
      )}

      {frame === 3 && <ClosingOverlay />}
    </div>
  );
};
