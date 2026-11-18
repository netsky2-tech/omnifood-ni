import React from 'react';
import {
  Audio,
  Sequence,
  staticFile,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  AbsoluteFill,
} from 'remotion';
import { MessageSquare, Wifi, Cloud, Globe } from 'lucide-react';
import { NHILOS_BRAND } from '../tokens/brand';
import { NhilosLogo } from '../components/NhilosLogo';
import { Semana4Q80ScreenAsset } from '../scenes/semana4_fisico/Semana4Q80ScreenAsset';

/**
 * Semana4Pieza2Digital — Demo 100% digital "Cobro Bimoneda" (Jueves 19/11).
 *
 * REESCRITA (v5, 615f @ 30fps = 20.5s, 1080x1920): tras análisis de nueve
 * videos de referencia de la industria —ninguno repite un mismo tratamiento
 * visual en cinco de seis tiempos, como hacía la v4— la pieza ahora alterna
 * CUATRO tratamientos distintos:
 *   1. Foto real (mano con el POS) + tipografía en el gancho.
 *   2. Pantalla real de la app en marco de dispositivo (Dinero y Vuelto).
 *   3. Acento isométrico VECTORIAL (una sola <svg>, proyección isométrica
 *      2:1 con polígonos y rellenos fijos por cara) en Cola y Sync: Vector
 *      plano como los videos de referencia — no 3D volumétrico. La
 *      pipeline WebGL (@remotion/three + fiber v8) es incompatible con
 *      React 19 del proyecto; SVG da bordes más nítidos y control exacto
 *      del sombreado, sin costo de render.
 *   4. Cierre de marca canónico.
 *
 * Todos los números en pantalla provienen de la UI real del POS
 * (`MultiCurrencyCheckoutDialog` montado en el asset Semana4Q80ScreenAsset):
 *   Total C$ 125.00 · Paga $ 20.00 USD · $ 20.00 × TC BCN 36.6243 = C$ 732.49
 *   → Vuelto C$ 607.49 · Folio 001-001-01-00000893.
 * Sin ticket renderizado, sin claims falsos, sin nombres de persona o equipo.
 *
 * Estructura (615f = 20.5s):
 * - f000..f070  Gancho   (70f, 2.33s): foto real + tipo. Línea 1 "Te pagan
 *                         con $20." f1..f33 (~1.1s), línea 2 "¿Cuánto
 *                         devuelves en córdobas?" f34..f69 (~1.2s).
 * - f070..f160  Dinero   (90f, 3.0s): checkout bimoneda real, push-in.
 * - f160..f250  Vuelto   (90f, 3.0s): conteo que para exacto en C$607.49,
 *                         aro spotlight + chip TC BCN 36.6243.
 * - f250..f360  Cola     (110f, 3.67s): isométrico — mostrador, dispositivo
 *                         como losa, badge ámbar "1" flotando; tipo "La
 *                         venta queda en cola".
 * - f360..f470  Sync     (110f, 3.67s): isométrico vuelve a estado limpio,
 *                         badge pasa a esmeralda "0 pendientes"; crossfade a
 *                         la pantalla real sincronizada; "Se sincronizó sola".
 * - f470..f615  Cierre   (145f, 4.83s): logo, NHILOS POS, CTA, sitio; el
 *                         contenido sale en f582..f594 (incluido el chip CTA)
 *                         y los frames finales son el mismo fondo del arranque
 *                         (loop: f614 == f0).
 *
 * Locución (edge-tts es-MX-JorgeNeural, rate -2%): entra en f0 y dura 334f
 * (11.14s). La cola de la pieza (cierre) queda sin voz — no se loopea el
 * audio. El CTA persistente aparece en f45 y sale con el contenido del
 * cierre para que el último frame loopee sin salto.
 */

const { colors } = NHILOS_BRAND;
const FPS = 30;
const RENOGARE = 'Renogare, Poppins, sans-serif';
const AMBER = '#D97706';

/* Frame global en el que el contenido del cierre (incluido el CTA) sale. */
const CLOSE_EXIT_START = 470 + 112; // f582
const CLOSE_EXIT_END = 470 + 124; // f594

/* ------------------------------------------------------------------ */
/* CTA persistente: chip pequeño y quieto, visible desde f45 hasta el
 * final del contenido del cierre (f582). Vive en la banda superior,
 * sobre el bezel, nunca sobre la UI ni las cifras. Sale con el cierre
 * para que los frames finales loopeen contra el arranque.             */
/* ------------------------------------------------------------------ */
const PersistentCTA: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 45 || frame >= CLOSE_EXIT_START) return null;
  const opacity = interpolate(frame, [45, 49, CLOSE_EXIT_START, CLOSE_EXIT_START + 6], [0, 1, 1, 0], {
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
/* ------------------------------------------------------------------ */
const SCREEN = { w: 950, h: 1520 }; // 1:1.6, igual proporción que el asset 1600x2560

/** Red de la app: estado real del indicador (folio real cuando hay red). */
type NetworkMode = 'online' | 'syncing' | 'synced';

const NetworkChip: React.FC<{ mode: NetworkMode }> = ({ mode }) => {
  const cfg = {
    online: { Icon: Wifi, label: 'Factura #00893', color: colors.green },
    syncing: { Icon: Wifi, label: 'Sincronizando…', color: AMBER },
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
  style?: React.CSSProperties;
}> = ({ network, zoom = 1, zoomOrigin = '50% 45%', style }) => {
  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
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
/* Tiempo 1: GANCHO (f0..f70) — foto real + tipografía                */
/* ------------------------------------------------------------------ */
const HookType: React.FC<{
  appearAt: number;
  /** Frame local en el que la línea sale (corte seco); indefinido = se queda. */
  disappearAt?: number;
  children: React.ReactNode;
  fontSize: number;
  top: number;
}> = ({ appearAt, disappearAt, children, fontSize, top }) => {
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
        top,
        left: 60,
        right: 60,
        display: 'flex',
        justifyContent: 'center',
        opacity,
      }}
    >
      <div
        style={{
          transform: `scale(${interpolate(s, [0, 1], [1.8, 1])})`,
          background: 'rgba(0, 31, 51, 0.94)',
          border: '2px solid rgba(0, 191, 129, 0.4)',
          borderRadius: 24,
          padding: '24px 46px',
        }}
      >
        <div
          style={{
            fontFamily: RENOGARE,
            fontWeight: 900,
            fontSize,
            lineHeight: 1.15,
            color: '#FFFFFF',
            textAlign: 'center',
            letterSpacing: -1,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

const HookBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const photoIn = spring({ frame, fps, config: { damping: 15, mass: 0.7 }, durationInFrames: 8 });
  // En f0 la foto está en opacidad 0: el frame 0 es el mismo fondo navy del
  // cierre, así la pieza loopea sin salto.
  const photoOpacity = interpolate(frame, [0, 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 40%, ${colors.navyLight} 0%, ${colors.navyDark} 78%)`,
      }}
    >
      {/* Foto real: mano sosteniendo el POS (asset transparente, sin modificar) */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: photoOpacity,
          transform: `scale(${interpolate(photoIn, [0, 1], [0.94, 1])})`,
        }}
      >
        <Img
          src={staticFile('pos_hand_device_transparent.webp')}
          style={{
            height: 1380,
            width: 'auto',
            objectFit: 'contain',
            filter: 'drop-shadow(0 40px 90px rgba(0,0,0,0.55))',
          }}
        />
      </div>
      {/* Línea 1: f1..f33 (~1.1s en cuadro); f0 queda navy vacío para el loop */}
      <HookType appearAt={1} disappearAt={34} fontSize={88} top={300}>
        Te pagan con <span style={{ color: colors.green }}>$20.</span>
      </HookType>
      {/* Línea 2: f34..fin del tiempo (~1.2s) */}
      <HookType appearAt={34} fontSize={72} top={300}>
        ¿Cuánto devuelves
        <br />
        en córdobas?
      </HookType>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 2: DINERO (f70..f160) — checkout bimoneda, push-in lento     */
/* ------------------------------------------------------------------ */
const MoneyBeat: React.FC = () => {
  const frame = useCurrentFrame();
  // Push-in lento y continuo hacia la tarjeta del total (sin corte).
  const zoom = interpolate(frame, [0, 88], [1, 1.065], {
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
/* Tiempo 3: VUELTO (f160..f250) — pantalla sostenida, conteo que para */
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
  const t = interpolate(frame, [12, 48], [0, 1], {
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
/* Acento isométrico VECTORIAL (decisión del fundador: vector plano,   */
/* no volumétrico). Una sola <svg> con viewBox explícito; caras como   */
/* polígonos con proyección isométrica 2:1 y tres rellenos FIJOS por   */
/* objeto (cara superior clara, izquierda media, derecha oscura — luz  */
/* desde arriba-izquierda, pasos de tono derivados de la paleta        */
/* NHILOS). Sin gradientes, sin filtros, sin blur, sin reflejos.       */
/* La animación sale de useCurrentFrame() con interpolación            */
/* determinística — nada de transiciones ni keyframes CSS. La          */
/* tipografía y el badge siguen en HTML sobre la escena.               */
/* ------------------------------------------------------------------ */
const ISO_W = 0.866; // cos(30°): factor horizontal por unidad de mundo
const ISO_OX = 480;  // origen del mundo dentro del viewBox 960x640
const ISO_OY = 330;
const BAR_H = 170;   // altura de las barras de cola (unidades de mundo)
const BAR_X = [-60, 40, 140]; // x de las tres barras, al fondo-derecha del mostrador

/** Proyección isométrica: x baja a la derecha, z baja a la izquierda,
 *  y sube. Unidades de mundo → coordenadas del viewBox. */
const iso = (x: number, z: number, y: number): [number, number] => [
  ISO_OX + (x - z) * ISO_W,
  ISO_OY + (x + z) * 0.5 - y,
];

const poly = (corners: Array<[number, number, number]>): string =>
  corners.map(([x, z, y]) => iso(x, z, y).join(',')).join(' ');

/* Rellenos fijos por objeto: [cara superior, cara izquierda, cara derecha].
 * Pasos de sombra derivados de la paleta (sin gradientes). El mostrador
 * va en tonos navy para que la pantalla esmeralda del dispositivo destaque. */
const COUNTER_FILL = [colors.navy, colors.navyDark, '#001B2C'] as const;
const DEVICE_FILL = ['#0B1220', '#060B14', '#04070D'] as const;
const BAR_FILL = [AMBER, '#B45309', '#92400E'] as const;

/** Caja isométrica: cara superior + las dos caras frontales visibles. */
const IsoBox: React.FC<{
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  base?: number;
  h: number;
  fills: readonly string[];
}> = ({ x0, x1, z0, z1, base = 0, h, fills }) => (
  <>
    {/* cara superior (y = base + h) */}
    <polygon
      points={poly([
        [x0, z0, base + h],
        [x1, z0, base + h],
        [x1, z1, base + h],
        [x0, z1, base + h],
      ])}
      fill={fills[0]}
    />
    {/* cara frontal derecha (x = x1) — la más oscura */}
    <polygon
      points={poly([
        [x1, z0, base + h],
        [x1, z1, base + h],
        [x1, z1, base],
        [x1, z0, base],
      ])}
      fill={fills[2]}
    />
    {/* cara frontal izquierda (z = z1) — tono medio */}
    <polygon
      points={poly([
        [x0, z1, base + h],
        [x1, z1, base + h],
        [x1, z1, base],
        [x0, z1, base],
      ])}
      fill={fills[1]}
    />
  </>
);

const IsoScene: React.FC<{
  /** Estado de cola (badge ámbar "1") o limpio (esmeralda "0 pendientes"). */
  state: 'queue' | 'clean';
  /** Opacidad global del escenario (crossfade a la pantalla real en Sync). */
  opacity: number;
}> = ({ state, opacity }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneIn = spring({ frame, fps, config: { damping: 16, mass: 0.6 }, durationInFrames: 12 });
  const queue = state === 'queue';

  /* Barras de cola: en Cola aparecen UNA POR UNA (el espectador las ve
   * acumularse). En Sync colapsan a la barra central, que queda como
   * único testigo mientras el badge pasa a esmeralda y se posa.        */
  const barHeights = queue
    ? BAR_X.map((_, i) =>
        frame < 14 + i * 14
          ? 0
          : interpolate(frame, [14 + i * 14, 26 + i * 14], [0, BAR_H], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.out(Easing.cubic),
            }),
      )
    : BAR_X.map((_, i) =>
        i === 2
          ? BAR_H
          : interpolate(frame, [6 + i * 8, 20 + i * 8], [BAR_H, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.in(Easing.cubic),
            }),
      );

  /* Sync: el badge baja y se posa SOBRE el mostrador (local f14..f38). */
  const settle = queue
    ? 0
    : interpolate(frame, [14, 38], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      });
  // Badge flotando: bob suave que se apaga al posarse.
  const badgeBob = Math.sin(frame / 9) * 10 * (1 - settle);

  return (
    <AbsoluteFill style={{ opacity, background: colors.navy }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '47%',
          width: 900,
          transform: `translate(-50%, -50%) scale(${interpolate(sceneIn, [0, 1], [0.94, 1])})`,
        }}
      >
        <svg width={900} height={600} viewBox="0 0 960 640" style={{ display: 'block' }}>
          {/* ORDEN DEL PINTOR, atrás → adelante. No reordenar: las caras
              se ocluyen entre sí solo en este orden.
              1. piso (plano en y=0, sin caras)
              2. barras de cola (detrás del mostrador, z negativo)
              3. mostrador (losa ancha con volumen)
              4. dispositivo (losa fina sobre el mostrador, con bisel)
              5. pantalla (rectángulo interior sobre la cara del
                 dispositivo: el inset es lo que lo lee como equipo)   */}
          {/* 1. piso (más claro que el mostrador, para separar siluetas) */}
          <polygon
            points={poly([
              [-260, -260, 0],
              [260, -260, 0],
              [260, 260, 0],
              [-260, 260, 0],
            ])}
            fill={colors.navyLight}
          />
          {/* 2. barras de cola (crecen una a una en Cola; colapsan a una en Sync;
              al fondo-derecha, fuera de la silueta del dispositivo en 2D) */}
          {BAR_X.map((xi, i) =>
            barHeights[i] > 0.5 ? (
              <IsoBox
                key={`bar-${i}`}
                x0={xi - 13}
                x1={xi + 13}
                z0={-200}
                z1={-182}
                h={barHeights[i]}
                fills={BAR_FILL}
              />
            ) : null,
          )}
          {/* 3. mostrador */}
          <IsoBox x0={-160} x1={160} z0={-90} z1={90} h={120} fills={COUNTER_FILL} />
          {/* 4. dispositivo (bisel oscuro fino sobre el mostrador) */}
          <IsoBox x0={-100} x1={100} z0={-55} z1={55} base={120} h={16} fills={DEVICE_FILL} />
          {/* 5. pantalla interior (inset claro sobre la cara superior) */}
          <polygon
            points={poly([
              [-84, -40, 136],
              [84, -40, 136],
              [84, 40, 136],
              [-84, 40, 136],
            ])}
            fill={colors.green}
          />
        </svg>
      </div>

      {/* Badge flotante en HTML (billboard en espacio de pantalla,
          siempre legible; fuera de las siluetas de las losas). */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 460 + 190 * settle,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {queue ? (
          <div
            style={{
              transform: `translateY(${badgeBob}px)`,
              width: 132,
              height: 132,
              borderRadius: '50%',
              background: AMBER,
              border: `6px solid ${colors.navyDark}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: RENOGARE,
                fontWeight: 900,
                fontSize: 72,
                color: colors.navyDark,
              }}
            >
              1
            </span>
          </div>
        ) : (
          <div
            style={{
              transform: `translateY(${badgeBob}px)`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 14,
              padding: '18px 36px',
              borderRadius: 999,
              background: colors.green,
              border: `6px solid ${colors.navyDark}`,
            }}
          >
            <span
              style={{
                fontFamily: RENOGARE,
                fontWeight: 900,
                fontSize: 48,
                color: colors.navyDark,
                whiteSpace: 'nowrap',
              }}
            >
              0 pendientes
            </span>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 4: COLA (f250..f360) — acento isométrico                    */
/* ------------------------------------------------------------------ */
const QueueBeat: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: colors.navy }}>
      <IsoScene state="queue" opacity={1} />
      <SlamPill appearAt={18} top={1620} fontSize={58}>
        La venta queda <span style={{ color: colors.green }}>en cola</span>
      </SlamPill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 5: SYNC (f360..f470) — isométrico limpio + pantalla real     */
/* ------------------------------------------------------------------ */
const SyncBeat: React.FC = () => {
  const frame = useCurrentFrame();
  // Crossfade: isométrico sale (f40..f56), pantalla real sincronizada entra
  // (f48..f62). El badge del isométrico ya está en esmeralda desde f0.
  const isoOpacity = interpolate(frame, [40, 56], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const screenOpacity = interpolate(frame, [48, 62], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const network: NetworkMode = frame < 56 ? 'syncing' : 'synced';
  return (
    <AbsoluteFill style={{ background: colors.navy }}>
      <IsoScene state="clean" opacity={isoOpacity} />
      <DeviceScreen network={network} style={{ opacity: screenOpacity }} />
      <SlamPill appearAt={14} top={1620} fontSize={58}>
        Se sincronizó <span style={{ color: colors.green }}>sola</span>
      </SlamPill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 6: CIERRE (f470..f615) — cierre de marca canónico            */
/* ------------------------------------------------------------------ */
const CloseBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // El contenido (incluido el glow) sale en local f112..f124 (global
  // f582..f594). Desde ahí hasta f614 solo queda el fondo, idéntico al del
  // gancho en f0: el frame final loopea sin salto.
  const exit = interpolate(frame, [112, 124], [1, 0], {
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
/* Composición principal — corte de seis tiempos, 615f (20.5s)          */
/* ------------------------------------------------------------------ */
export const Semana4Pieza2Digital: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: colors.navy }}>
      <Sequence from={0} durationInFrames={70}>
        <HookBeat />
      </Sequence>
      <Sequence from={70} durationInFrames={90}>
        <MoneyBeat />
      </Sequence>
      <Sequence from={160} durationInFrames={90}>
        <ChangeBeat />
      </Sequence>
      <Sequence from={250} durationInFrames={110}>
        <QueueBeat />
      </Sequence>
      <Sequence from={360} durationInFrames={110}>
        <SyncBeat />
      </Sequence>
      <Sequence from={470} durationInFrames={145}>
        <CloseBeat />
      </Sequence>
      {/* Locución (sin claims falsos): entra en f0, dura 334f (11.14s); la
          cola de la pieza queda sin voz y sin loop de audio. */}
      <Sequence from={0}>
        <Audio src={staticFile('audio/pieza2_digital_vo.mp3')} />
      </Sequence>
      {/* CTA persistente: f45..f582; sale con el cierre para loopear. */}
      <PersistentCTA />
    </AbsoluteFill>
  );
};
