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
import { MessageSquare, Wifi, WifiOff, Cloud, CloudOff, RefreshCw, Plane, Check, CheckCircle2, Globe } from 'lucide-react';
import { NHILOS_BRAND } from '../tokens/brand';
import { NhilosLogo } from '../components/NhilosLogo';
import { Semana4Q80ScreenAsset } from '../scenes/semana4_fisico/Semana4Q80ScreenAsset';

/**
 * Semana4Pieza2Digital — Demo 100% digital "Cobro Bimoneda" (Jueves 19/11).
 *
 * REESCRITA (v3, 440f @ 30fps = 14.67s, 1080x1920): seis tiempos con cadencia
 * desigual y payoff front-loaded — analítica de TikTok/IG: watch time medio
 * 2.8–5.9s, la mayoría se va en 0:01. El total real (C$125.00) está en cuadro
 * antes del frame 90 (f38) para que un viewer de 3s ya sepa qué hace el
 * producto. El cierre sale en limpio y el último frame es idéntico al primero
 * (navy vacío) para loopear sin salto.
 *
 * Todos los números en pantalla provienen de la UI real del POS
 * (`MultiCurrencyCheckoutDialog` montado en el asset Semana4Q80ScreenAsset):
 *   Total C$ 125.00 · Paga $ 20.00 USD · $ 20.00 × TC BCN 36.6243 = C$ 732.49
 *   → Vuelto C$ 607.49 · Folio 001-001-01-00000893.
 *
 * Estructura (corte seco entre tiempos; 440f = 14.67s):
 * - f000..f030  Gancho    (30f, 1.0s): tipografía sola sobre navy, llegada dura.
 * - f030..f096  Dinero    (66f, 2.2s): checkout bimoneda real en marco de
 *                         dispositivo, push-in. "Total C$125.00" en f38.
 * - f096..f170  Vuelto    (74f, 2.47s): misma pantalla sostenida; el vuelto
 *                         cuenta hasta C$607.49 y se detiene + chip TC BCN.
 * - f170..f270  Offline   (100f, 3.33s): panel modo avión → venta completada
 *                         con badge de cola pendiente.
 * - f270..f330  Sync      (60f, 2.0s): indicador de red vuelve a sincronizado.
 * - f330..f440  Cierre    (110f, 3.67s): cierre de marca + CTA + sitio;
 *                         el contenido sale en f424 y el frame final es el
 *                         mismo navy vacío del arranque (loop).
 *
 * Locución regenerada (edge-tts es-MX-JorgeNeural, rate -2%): entra con el
 * beat de Dinero (f30) y dura 334f (11.14s); el texto no claims falsos.
 */

const { colors } = NHILOS_BRAND;
const FPS = 30;
const RENOGARE = 'Renogare, Poppins, sans-serif';
const AMBER = '#D97706';

/* Márgenes seguros: la UI de las plataformas cubre 120px arriba y abajo;
 * todo el texto en pantalla se coloca dentro de y∈[120, 1800]. */


/* ------------------------------------------------------------------ */
/* CTA persistente: chip pequeño y quieto, visible desde ~1.5s hasta   */
/* el último frame. La analítica muestra que el CTA al final no lo ve
/* nadie (0% comentarios): la promesa "comentar = acceso a la demo"    */
/* se entrega temprano y permanece. No cubre pantalla ni cifras:       */
/* vive en la banda superior, sobre el bezel, nunca sobre la UI.       */
/* ------------------------------------------------------------------ */
const PersistentCTA: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 45) return null;
  const opacity = interpolate(frame, [45, 49], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        top: 128,
        left: 0,
        right: 0,
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
          background: 'rgba(0, 31, 51, 0.9)',
          border: '2px solid rgba(0, 191, 129, 0.5)',
          borderRadius: 999,
          padding: '12px 28px',
        }}
      >
        <MessageSquare style={{ width: 28, height: 28, color: colors.green }} />
        <span
          style={{
            fontFamily: RENOGARE,
            fontWeight: 800,
            fontSize: 30,
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
            fontSize: 26,
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
/* Marco de dispositivo: la UI real de la app dentro de un bezel      */
/* (1000x1600 de pantalla útil, centrado; contenido dentro de los     */
/* márgenes seguros de 120px).                                        */
/* ------------------------------------------------------------------ */
const SCREEN = { w: 950, h: 1520 }; // 1:1.6, igual proporción que el asset 1600x2560

/** Red de la app: estado real del indicador (folio real cuando hay red). */
type NetworkMode = 'online' | 'offline' | 'syncing' | 'synced';

const NetworkChip: React.FC<{ mode: NetworkMode }> = ({ mode }) => {
  const cfg = {
    online: { Icon: Wifi, label: 'Factura #00893', color: colors.green },
    offline: { Icon: WifiOff, label: 'Sin conexión', color: AMBER },
    syncing: { Icon: RefreshCw, label: 'Sincronizando…', color: AMBER },
    synced: { Icon: Cloud, label: 'Sincronizado · 0 pendientes', color: colors.green },
  }[mode];
  const frame = useCurrentFrame();
  const Icon = cfg.Icon;
  const spin = mode === 'syncing' ? frame * 14 : 0;
  return (
    <div
      style={{
        position: 'absolute',
        top: 18,
        left: 28,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 24px',
        borderRadius: 999,
        background: `${cfg.color}1F`,
        border: `2px solid ${cfg.color}66`,
        color: cfg.color,
        fontFamily: RENOGARE,
        fontWeight: 700,
        fontSize: 26,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon
        style={{ width: 30, height: 30, ...(spin ? { transform: `rotate(${spin}deg)` } : {}) }}
      />
      <span>{cfg.label}</span>
    </div>
  );
};

const DeviceScreen: React.FC<{
  network: NetworkMode;
  /** Escala de push-in (1 = quieto). */
  zoom?: number;
  zoomOrigin?: string;
  children?: React.ReactNode;
}> = ({ network, zoom = 1, zoomOrigin = '50% 45%', children }) => {
  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Empujado 36px hacia abajo: libera la banda superior (y120..y190)
          para el CTA persistente sin tocar la pantalla del producto. */}
      <div style={{ transform: `translateY(36px) scale(${zoom})`, transformOrigin: zoomOrigin }}>
        {/* Bezel de dispositivo genérico (sin nombre ni marca) */}
        <div
          style={{
            width: SCREEN.w + 44,
            height: SCREEN.h + 52,
            background: '#0B1220',
            borderRadius: 56,
            padding: '26px 22px',
            boxShadow: '0 60px 140px rgba(0,0,0,0.7), inset 0 0 0 2px rgba(255,255,255,0.07)',
          }}
        >
          <div
            style={{
              width: SCREEN.w,
              height: SCREEN.h,
              borderRadius: 36,
              overflow: 'hidden',
              position: 'relative',
              background: '#F8FAFC',
            }}
          >
            {/* Pantalla real (1600x2560 asset → 950x1520) */}
            <div
              style={{
                width: 1600,
                height: 2560,
                transform: 'scale(0.59375)',
                transformOrigin: 'top left',
              }}
            >
              <Semana4Q80ScreenAsset />
            </div>
            {/* Cobertura del appbar del asset: esconde datos de persona/local
                sin tocar el archivo del asset (fuera de superficies permitidas). */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 104,
                background: colors.navy,
              }}
            />
            {/* Indicador de red real (reemplaza el badge del appbar cubierto) */}
            <NetworkChip mode={network} />
            {/* Overlays de estado de la venta (panel avión / venta completada) */}
            {children}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Píldora de texto con llegada dura (sin fades suaves)               */
/* ------------------------------------------------------------------ */
const SlamPill: React.FC<{
  appearAt: number;
  top: number;
  children: React.ReactNode;
  fontSize?: number;
  /** Banda de ancho completo (cubierta limpia de la fila de título del diálogo). */
  fullWidth?: boolean;
}> = ({ appearAt, top, children, fontSize = 60, fullWidth = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < appearAt) return null;
  const s = spring({
    frame: frame - appearAt,
    fps,
    config: { damping: 14, mass: 0.5 },
    durationInFrames: 6,
  });
  const opacity = interpolate(frame, [appearAt, appearAt + 2], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: fullWidth ? 60 : 0,
        right: fullWidth ? 60 : 0,
        display: 'flex',
        justifyContent: 'center',
        opacity,
      }}
    >
      <div
        style={{
          transform: `scale(${interpolate(s, [0, 1], [1.45, 1])})`,
          background: 'rgba(0, 31, 51, 0.99)',
          border: '2px solid rgba(0, 191, 129, 0.45)',
          borderRadius: fullWidth ? 20 : 24,
          padding: fullWidth ? '26px 40px' : '20px 44px',
          width: fullWidth ? '100%' : undefined,
        }}
      >
        <div
          style={{
            fontFamily: RENOGARE,
            fontWeight: 800,
            fontSize,
            lineHeight: 1.2,
            color: '#FFFFFF',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 1: GANCHO (f0..f48) — navy full-bleed, solo tipografía       */
/* ------------------------------------------------------------------ */
const HookType: React.FC<{
  appearAt: number;
  /** Frame en el que la línea sale (corte seco); indefinido = se queda. */
  disappearAt?: number;
  children: React.ReactNode;
  fontSize: number;
}> = ({ appearAt, disappearAt, children, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < appearAt || (disappearAt !== undefined && frame >= disappearAt)) return null;
  const s = spring({
    frame: frame - appearAt,
    fps,
    config: { damping: 13, mass: 0.4 },
    durationInFrames: 5,
  });
  const opacity = interpolate(frame, [appearAt, appearAt + 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        top: 560,
        left: 80,
        right: 80,
        textAlign: 'center',
        opacity,
        transform: `scale(${interpolate(s, [0, 1], [2.0, 1])})`,
      }}
    >
      <div
        style={{
          fontFamily: RENOGARE,
          fontWeight: 900,
          fontSize,
          lineHeight: 1.15,
          color: '#FFFFFF',
          letterSpacing: -1,
          textShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      >
        {children}
      </div>
    </div>
  );
};

const HookBeat: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 40%, ${colors.navyLight} 0%, ${colors.navyDark} 78%)`,
      }}
    >
      {/* Línea 1: f1..f13 (corte seco) — 1s de gancho total */}
      <HookType appearAt={1} disappearAt={13} fontSize={104}>
        Te pagan con <span style={{ color: colors.green }}>$20.</span>
      </HookType>
      {/* Línea 2: f13..fin del tiempo */}
      <HookType appearAt={13} fontSize={78}>
        ¿Cuánto devuelves
        <br />
        en córdobas?
      </HookType>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 2: DINERO (f48..f135) — checkout bimoneda, push-in lento     */
/* ------------------------------------------------------------------ */
const MoneyBeat: React.FC = () => {
  const frame = useCurrentFrame();
  // Push-in lento y continuo hacia la tarjeta del total (sin corte).
  // Con el dispositivo en 950x1520 el zoom 1.06 mantiene toda la pantalla
  // dentro de los márgenes seguros (120px superior / 120px inferior).
  const zoom = interpolate(frame, [0, 66], [1, 1.06], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ background: colors.navy }}>
      <DeviceScreen network="online" zoom={zoom} zoomOrigin="50% 45%" />
      {/* Banda de título: cubre la fila de cabecera del diálogo completa */}
      <SlamPill appearAt={8} top={376} fullWidth>
        Total <span style={{ color: colors.green }}>C$125.00</span>
      </SlamPill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 3: VUELTO (f135..f255) — pantalla sostenida, conteo que para */
/* ------------------------------------------------------------------ */
/*
 * Caja verde del vuelto medida sobre el asset (1600x2560):
 *   x 20..1580, y 1757..2228 → canvas con pantalla 950x1520 en y200:
 *   x = 540 + (assetX-800)*0.59375; y = 200 + assetY*0.59375
 *   → x 77..1003, y 1243..1523.
 */
const SPOT = { x1: 77, x2: 1003, y1: 1243, y2: 1523 };
const DIM = 0.66;

const ChangeBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dim = interpolate(frame, [4, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ringIn = spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 18 } });

  // Conteo del vuelto: sube hasta el valor real y SE DETIENE.
  const t = interpolate(frame, [12, 46], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const vuelto = (607.49 * t).toFixed(2);

  return (
    <AbsoluteFill style={{ background: colors.navy }}>
      <DeviceScreen network="online" />

      {/* Atenuación fuera de la caja del vuelto */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1080,
          height: SPOT.y1,
          background: `linear-gradient(to bottom, rgba(0,31,51,${DIM * dim}) 0%, rgba(0,31,51,${
            DIM * dim
          }) calc(100% - 90px), rgba(0,31,51,0) 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: SPOT.y2,
          width: 1080,
          height: 1920 - SPOT.y2,
          background: `linear-gradient(to bottom, rgba(0,31,51,0) 0%, rgba(0,31,51,${
            DIM * dim
          }) 90px, rgba(0,31,51,${DIM * dim}) 100%)`,
        }}
      />

      {/* Aro verde institucional sobre la caja del vuelto */}
      <div
        style={{
          position: 'absolute',
          left: SPOT.x1,
          top: SPOT.y1,
          width: SPOT.x2 - SPOT.x1,
          height: SPOT.y2 - SPOT.y1,
          border: `4px solid ${colors.green}`,
          borderRadius: 24,
          boxShadow: `0 0 60px rgba(0,191,129,0.55), inset 0 0 40px rgba(0,191,129,0.18)`,
          opacity: interpolate(ringIn, [0, 1], [0, 1]),
          transform: `scale(${interpolate(ringIn, [0, 1], [1.06, 1])})`,
        }}
      />

      {/* Vuelto contando (píldora grande, dentro del margen seguro) */}
      <SlamPill appearAt={10} top={1548} fontSize={84}>
        Vuelto <span style={{ color: colors.green }}>C${vuelto}</span>
      </SlamPill>
      {/* Chip de tasa: el que la app muestra de verdad */}
      <SlamPill appearAt={30} top={1700} fontSize={38}>
        <span style={{ color: colors.gray }}>TC BCN 36.6243</span>
      </SlamPill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tarjeta de venta completada + badge de cola (Offline y Sync)        */
/* ------------------------------------------------------------------ */
const CompletedSaleCard: React.FC<{ mode: 'offline' | 'sync' }> = ({ mode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inSpring = spring({ frame, fps, config: { damping: 16 }, durationInFrames: 12 });

  // En sync: badge ámbar breve (0..14) y luego verde definitivo.
  const synced = mode === 'sync' && frame >= 16;
  const badge = synced
    ? { Icon: CheckCircle2, label: 'Sincronizada · 0 pendientes', color: colors.green }
    : { Icon: CloudOff, label: '1 venta en cola de sincronización', color: AMBER };
  const BadgeIcon = badge.Icon;
  const badgeSpring = spring({
    frame: Math.max(0, frame - (synced ? 16 : 0)),
    fps,
    config: { damping: 13, mass: 0.5 },
    durationInFrames: 6,
  });

  return (
    <AbsoluteFill
      style={{
        background: 'rgba(2, 10, 20, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          transform: `scale(${interpolate(inSpring, [0, 1], [0.9, 1])})`,
          width: 760,
          background: 'rgba(0, 31, 51, 0.96)',
          border: '2px solid rgba(0, 191, 129, 0.4)',
          borderRadius: 32,
          padding: '40px 40px 34px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          boxShadow: '0 40px 110px rgba(0,0,0,0.65)',
        }}
      >
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: '50%',
            background: 'rgba(0, 191, 129, 0.14)',
            border: `3px solid ${colors.green}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check style={{ width: 60, height: 60, color: colors.green }} strokeWidth={3} />
        </div>
        <div
          style={{
            fontFamily: RENOGARE,
            fontWeight: 800,
            fontSize: 52,
            color: '#FFFFFF',
            textAlign: 'center',
          }}
        >
          Venta registrada
        </div>
        <div
          style={{
            fontFamily: RENOGARE,
            fontWeight: 600,
            fontSize: 34,
            color: colors.gray,
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          Factura 001-001-01-00000893
          <br />
          Total C$ 125.00
        </div>
        <div
          style={{
            transform: `scale(${interpolate(badgeSpring, [0, 1], [1.3, 1])})`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 26px',
            borderRadius: 999,
            background: `${badge.color}1F`,
            border: `2px solid ${badge.color}66`,
            color: badge.color,
            fontFamily: RENOGARE,
            fontWeight: 700,
            fontSize: 28,
            whiteSpace: 'nowrap',
          }}
        >
          <BadgeIcon style={{ width: 30, height: 30 }} />
          <span>{badge.label}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 4: OFFLINE (f255..f390) — panel avión → venta completada     */
/* ------------------------------------------------------------------ */
const OfflineBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const panelIn = spring({
    frame: Math.max(0, frame - 2),
    fps,
    config: { damping: 15, mass: 0.5 },
    durationInFrames: 8,
  });
  const showPanel = frame < 56;
  const showSale = frame >= 58;

  return (
    <AbsoluteFill style={{ background: colors.navy }}>
      <DeviceScreen network="offline">
        {showPanel && (
          <AbsoluteFill
            style={{
              background: 'rgba(2, 10, 20, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: interpolate(panelIn, [0, 1], [0, 1]),
            }}
          >
            <div
              style={{
                transform: `scale(${interpolate(panelIn, [0, 1], [0.9, 1])})`,
                width: 620,
                background: 'rgba(0, 31, 51, 0.97)',
                border: `2px solid ${AMBER}66`,
                borderRadius: 32,
                padding: '44px 40px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
                boxShadow: '0 40px 110px rgba(0,0,0,0.65)',
              }}
            >
              <Plane
                style={{ width: 76, height: 76, color: AMBER, transform: 'rotate(45deg)' }}
              />
              <div
                style={{
                  fontFamily: RENOGARE,
                  fontWeight: 800,
                  fontSize: 48,
                  color: '#FFFFFF',
                  textAlign: 'center',
                }}
              >
                Modo avión
              </div>
              <div
                style={{
                  fontFamily: RENOGARE,
                  fontWeight: 600,
                  fontSize: 32,
                  color: colors.gray,
                  textAlign: 'center',
                }}
              >
                Sin conexión a internet
              </div>
            </div>
          </AbsoluteFill>
        )}
        {showSale && <CompletedSaleCard mode="offline" />}
      </DeviceScreen>

      {/* Banda de título sobre la cabecera del diálogo (corte seco) */}
      <SlamPill appearAt={4} top={376} fullWidth>
        Sin internet
      </SlamPill>
      {frame >= 64 && (
        <SlamPill appearAt={64} top={376} fullWidth>
          La venta <span style={{ color: colors.green }}>sigue</span>
        </SlamPill>
      )}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 5: SYNC (f390..f495) — el indicador vuelve a sincronizado    */
/* ------------------------------------------------------------------ */
const SyncBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const network: NetworkMode = frame < 16 ? 'syncing' : 'synced';
  return (
    <AbsoluteFill style={{ background: colors.navy }}>
      <DeviceScreen network={network}>
        <CompletedSaleCard mode="sync" />
      </DeviceScreen>
      <SlamPill appearAt={10} top={376} fullWidth>
        Se sincronizó <span style={{ color: colors.green }}>sola</span>
      </SlamPill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 6: CIERRE (f495..f600) — cierre de marca canónico            */
/* ------------------------------------------------------------------ */
const CloseBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fondo idéntico al del gancho: el frame final del cierre (contenido ya
  // salido) loopea sin salto al frame 0 de la pieza.
  const exit = interpolate(frame, [94, 106], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const logoScale = spring({ frame, fps, config: { damping: 14, mass: 0.9 } });
  const textOpacity = interpolate(frame, [6, 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ctaScale = spring({ frame: Math.max(0, frame - 14), fps, config: { damping: 12 } });
  const urlOpacity = interpolate(frame, [24, 34], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-12 relative overflow-hidden text-center font-sans"
      style={{
        background: `radial-gradient(circle at 50% 40%, ${colors.navyLight} 0%, ${colors.navyDark} 78%)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: exit,
        }}
      >
      {/* Glow radial institucional */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, rgba(0,191,129,0.18) 0%, transparent 70%)',
          opacity: exit,
        }}
      />

      {/* Isotipo oficial NHILOS (logo.png) */}
      <div style={{ transform: `scale(${logoScale})` }} className="mb-8 relative z-10">
        <NhilosLogo size={200} />
      </div>

      {/* Nombre oficial */}
      <h1
        style={{
          opacity: textOpacity,
          fontFamily: RENOGARE,
          letterSpacing: 4,
        }}
        className="text-6xl font-extrabold text-white mb-3 z-10"
      >
        NHILOS POS
      </h1>

      <p
        style={{ opacity: textOpacity }}
        className="text-2xl text-slate-200 font-light tracking-wide max-w-xl mb-10 z-10"
      >
        Conectamos los hilos de tu negocio.
      </p>

      {/* Botón CTA: icono MessageSquare + Comenta DEMO */}
      <div
        style={{ transform: `scale(${ctaScale})` }}
        className="bg-[#00BF81] text-[#003757] font-black text-3xl px-10 py-5 rounded-2xl shadow-[0_0_40px_rgba(0,191,129,0.45)] flex items-center gap-4 z-10 mb-6 border-2 border-white/25"
      >
        <MessageSquare className="w-8 h-8 fill-[#003757] text-[#003757]" />
        <span style={{ fontFamily: RENOGARE }}>Comenta DEMO</span>
      </div>

      {/* Sitio web */}
      <div
        style={{ opacity: urlOpacity * exit }}
        className="inline-flex items-center gap-2 text-lg text-white/90 font-semibold bg-white/10 px-6 py-2.5 rounded-full border border-white/15 z-10"
      >
        <Globe className="w-5 h-5 text-[#00BF81]" />
        <span>nhilospos.com</span>
      </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Composición principal — corte de seis tiempos, 440f (14.67s)         */
/* ------------------------------------------------------------------ */
export const Semana4Pieza2Digital: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: colors.navy }}>
      <Sequence from={0} durationInFrames={30}>
        <HookBeat />
      </Sequence>
      <Sequence from={30} durationInFrames={66}>
        <MoneyBeat />
      </Sequence>
      <Sequence from={96} durationInFrames={74}>
        <ChangeBeat />
      </Sequence>
      <Sequence from={170} durationInFrames={100}>
        <OfflineBeat />
      </Sequence>
      <Sequence from={270} durationInFrames={60}>
        <SyncBeat />
      </Sequence>
      <Sequence from={330} durationInFrames={110}>
        <CloseBeat />
      </Sequence>
      {/* Locución corregida (sin claims falsos): entra con el beat de Dinero,
          dura 334f (11.14s) y termina antes del frame final. */}
      <Sequence from={30}>
        <Audio src={staticFile('audio/pieza2_digital_vo.mp3')} />
      </Sequence>
      {/* CTA persistente desde f45 (1.5s) hasta el último frame. */}
      <PersistentCTA />
    </AbsoluteFill>
  );
};
