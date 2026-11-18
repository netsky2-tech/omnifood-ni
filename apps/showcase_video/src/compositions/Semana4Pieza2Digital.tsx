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
import { MessageSquare, Wifi, Cloud, Globe } from 'lucide-react';
import { NHILOS_BRAND } from '../tokens/brand';
import { NhilosLogo } from '../components/NhilosLogo';
import { Semana4Q80ScreenAsset } from '../scenes/semana4_fisico/Semana4Q80ScreenAsset';

/**
 * Semana4Pieza2Digital — "El redondeo que nadie ve" (Jueves 19/11).
 *
 * REESCRITA (v6, 540f @ 30fps = 18s, 1080x1920): la v5 era una demo
 * competente pero sin argumento — pantallas en secuencia, tipografía
 * pequeña flotando en navy, la misma píldora abajo en cada tiempo, y una
 * escena isométrica que no comunicaba nada. Tras analizar nueve videos de
 * referencia de la industria (todos ARGUMENTAN y defienden una tesis), la
 * pieza ahora es un argumento con CINCO tiempos:
 *
 *   1. Argumento (f0..f78):    la PÉRDIDA y el CONDICIONAL entran en el
 *                              primer fotograma: "Si cada vuelto de $20 te
 *                              cuesta C$1." El "si" no es adorno: sin él la
 *                              pieza afirmaría una pérdida universal que el
 *                              material no puede sostener. No se
 *                              abre con una premisa neutra — la Compuerta 1
 *                              del Creative Critic lo vetó y tenía razón.
 *   2. La multiplicación       los números SON el elemento visual:
 *      (f78..f195)             "C$1 × 20" → "= C$20 al día" → "× 30 días"
 *                              → "= C$600 al mes" (ámbar = pérdida
 *                              hipotética). El paso de día a mes es
 *                              VISIBLE: sin él el salto a C$600 es
 *                              atacable y el argumento se cae.
 *   3. Prueba (f195..f345):    la pantalla real del checkout bimoneda con
 *                              la tasa real; banda esmeralda "Vuelto
 *                              exacto C$607.49" + "Calculado al tipo de
 *                              cambio del día". El producto es el
 *                              mecanismo, no la estrella.
 *   4. Resolución (f345..f450): tipografía con contraste. Una sola
 *                              afirmación ("Sin calcular a ojo.") y el
 *                              número ámbar resuelto a esmeralda:
 *                              "C$0 de redondeo" + "en cada cobro". Acotado
 *                              a cada transacción porque una sola
 *                              transacción grabada no sostiene un cero
 *                              mensual.
 *   5. Cierre (f450..f540):    logo, NHILOS POS, CTA, sitio; el contenido
 *                              sale en f522..f534 y los frames finales son
 *                              el mismo fondo del arranque (f539 == f0).
 *
 * La escena isométrica (v5) y sus losas/badges se eliminaron por completo,
 * igual que la foto de la mano: si un elemento visual no explica algo, no
 * va. El cambio es de ESCALA, POSICIÓN y CONTRASTE de la tipografía —
 * misma paleta NHILOS y misma pila de fuentes.
 *
 * Posición del texto por tiempo (para que el ojo no se acomode al mismo
 * ritmo): t1 tercio superior · t2 centro · t3 banda en tercio inferior ·
 * t4 tercio superior + número al centro · t5 centro.
 *
 * Todos los números provienen de la UI real del POS
 * (`MultiCurrencyCheckoutDialog` montado en el asset Semana4Q80ScreenAsset):
 *   $ 20.00 USD × TC BCN 36.6243 → Vuelto C$ 607.49. Los C$1 / C$20 / C$600
 *   son explícitamente hipotéticos y se leen como condicional ("si…").
 * Sin ticket renderizado, sin claims falsos, sin nombres de persona o equipo.
 *
 * Locución REGENERADA (edge-tts es-MX-JorgeNeural, rate -2%, 15.86s): entra
 * en f0 y narra el argumento nuevo; la cola de la pieza queda sin voz. El
 * CTA persistente aparece en f45 y sale con el contenido del cierre para
 * que el último frame loopee sin salto.
 */

const { colors } = NHILOS_BRAND;
const RENOGARE = 'Renogare, Poppins, sans-serif';
const AMBER = '#D97706';

/* Fondo compartido por todos los tiempos: el frame final del cierre y el
 * frame 0 del arranque son exactamente este fondo vacío → loop limpio. */
const BG = `radial-gradient(circle at 50% 40%, ${colors.navyLight} 0%, ${colors.navyDark} 78%)`;

/* Frames globales en los que el contenido del cierre (incluido el CTA)
 * sale: 450 + 72 = f522 .. 450 + 84 = f534. Desde ahí hasta f539 solo
 * queda el fondo, idéntico al arranque. */
const CLOSE_EXIT_START = 522;
const CLOSE_EXIT_END = 534;

/* ------------------------------------------------------------------ */
/* Fondo de producto: la pantalla real del checkout detrás del tipo.
 * Ampliada más allá del borde del cuadro (recortada), difuminada y muy
 * atenuada: debe leerse como TEXTURA, no como texto — ningún rótulo de la
 * UI es legible detrás del tipo (blur 18px + velo navy fuerte). Deriva
 * despacio para que se sienta viva y no pegada. En el frame local 0 está
 * en opacity 0 → el frame 0 global sigue siendo fondo limpio (loop).
 * ------------------------------------------------------------------ */
const BackdropScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Fade de entrada: en el frame local 0 está en 0 → el frame 0 global
  // sigue siendo fondo limpio y el loop se sostiene.
  const fadeIn = interpolate(frame, [0, 6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const drift = interpolate(frame, [0, durationInFrames], [0, 46], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const zoom = interpolate(frame, [0, durationInFrames], [1.32, 1.37], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ opacity: fadeIn, zIndex: 0, pointerEvents: 'none' }}>
      {/* Pantalla ampliada más allá del cuadro (recorte central que llena
          todo el alto) y derivando hacia abajo muy despacio. */}
      {/* Blur fuerte: la UI se vuelve textura — sin texto legible detrás
          del tipo (revisión de legibilidad 360px). */}
      <div style={{ opacity: 0.24, filter: 'blur(18px)' }}>
        <DeviceScreen network="online" zoom={zoom} zoomOrigin="50% 50%" shift={drift} />
      </div>
      {/* Velo navy fuerte: la pantalla queda como sugerencia de textura. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,31,51,0.82) 0%, rgba(0,31,51,0.72) 40%, rgba(0,31,51,0.92) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tipografía protagonista: línea a todo lo ancho, llegada dura.       */
/* Cada línea recibe su propio tamaño para llenar el ancho objetivo.   */
/* ------------------------------------------------------------------ */
const SlamType: React.FC<{
  appearAt: number;
  /** Frame local en el que la línea sale (corte seco); indefinido = se queda. */
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
    config: { damping: 14, mass: 0.4 },
    durationInFrames: 6,
  });
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 120,
        right: 120,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 10,
        opacity: interpolate(frame, [appearAt, appearAt + 2], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
      }}
    >
      <div
        style={{
          transform: `scale(${interpolate(s, [0, 1], [1.25, 1])})`,
          fontFamily: RENOGARE,
          fontWeight: 900,
          fontSize,
          lineHeight: 1.12,
          letterSpacing: -2,
          color: '#FFFFFF',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Pantalla real: la UI de la app dentro de un bezel genérico          */
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
  const Icon = cfg.Icon;
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
      <Icon style={{ width: 30, height: 30 }} />
      <span>{cfg.label}</span>
    </div>
  );
};

const DeviceScreen: React.FC<{
  network: NetworkMode;
  /** Escala de push-in (1 = quieto). */
  zoom?: number;
  zoomOrigin?: string;
  /** Desplazamiento vertical para liberar la banda inferior. */
  shift?: number;
}> = ({ network, zoom = 1, zoomOrigin = '50% 40%', shift = 0 }) => {
  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ transform: `translateY(${shift}px) scale(${zoom})`, transformOrigin: zoomOrigin }}>
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
/* CTA persistente: chip pequeño y quieto, visible desde f45 hasta el
 * inicio de la salida del cierre (f522). Vive en la banda superior,
 * nunca sobre el tipo protagonista ni las cifras. Sale con el cierre
 * para que los frames finales loopeen contra el arranque.             */
/* ------------------------------------------------------------------ */
const PersistentCTA: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 45 || frame >= CLOSE_EXIT_START) return null;
  const opacity = interpolate(
    frame,
    [45, 49, CLOSE_EXIT_START, CLOSE_EXIT_START + 6],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return (
    <div
      style={{
        position: 'absolute',
        top: 140,
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
/* Tiempo 1: ARGUMENTO (f0..f78) — tipografía a todo lo ancho,         */
/* tercio superior. Cada línea ~1.1–1.3s en cuadro.                    */
/* ------------------------------------------------------------------ */
const ArgumentBeat: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      {/* La pantalla real detrás del tipo: evidencia de producto desde f0 */}
      <BackdropScreen />
      {/* Un solo enunciado en tres líneas (mismas palabras, mismo orden):
          112 es el tamaño máximo que respeta el área segura x∈[90,960]. */}
      <SlamType appearAt={1} top={360} fontSize={112}>
        Si cada vuelto
      </SlamType>
      <SlamType appearAt={1} top={500} fontSize={112}>
        de <span style={{ color: colors.green }}>$20</span>
      </SlamType>
      <SlamType appearAt={1} top={640} fontSize={112}>
        te cuesta <span style={{ color: AMBER }}>C$1.</span>
      </SlamType>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 2: LA MULTIPLICACIÓN (f78..f195) — los números SON el        */
/* elemento visual. Ámbar = pérdida; el esmeralda se reserva para la   */
/* resolución del tiempo 4. Centro del cuadro.                         */
/* ------------------------------------------------------------------ */
const MultiplicationBeat: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      {/* La pantalla real detrás de los números */}
      <BackdropScreen />
      {/* Cadena de cuatro tiempos, retemporizada: la cifra climax aterriza
          en el frame local 64 y aguanta 53f (1.77s ≥ 1.5s) antes del
          corte. El paso de día a mes ES VISIBLE: sin C$20 × 30 el salto a
          C$600 es atacable y el argumento se cae. */}
      <SlamType appearAt={6} top={380} fontSize={176}>
        <span style={{ color: AMBER, fontVariantNumeric: 'tabular-nums' }}>C$1 × 20</span>
      </SlamType>
      <SlamType appearAt={26} top={600} fontSize={132}>
        <span style={{ color: AMBER, fontVariantNumeric: 'tabular-nums' }}>= C$20 al día</span>
      </SlamType>
      <SlamType appearAt={45} top={800} fontSize={110}>
        <span style={{ color: AMBER, fontVariantNumeric: 'tabular-nums' }}>× 30 días</span>
      </SlamType>
      {/* Aterriza y se queda: es la cifra que sostiene el argumento */}
      <SlamType appearAt={64} top={970} fontSize={121}>
        <span style={{ color: AMBER, fontVariantNumeric: 'tabular-nums' }}>= C$600 al mes</span>
      </SlamType>
      {/* Caption condicional: entra 14f después de la cifra (sin colisión,
          queda hasta el corte del beat). */}
      <SlamType appearAt={78} top={1150} fontSize={40}>
        <span style={{ color: colors.gray, fontWeight: 700, letterSpacing: 0 }}>
          si cada vuelto te cuesta C$1
        </span>
      </SlamType>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 3: PRUEBA (f195..f345) — la pantalla real con la tasa real.  */
/* El producto es el mecanismo, no la estrella: banda esmeralda con    */
/* el vuelto exacto + caption del tipo de cambio. Tercio inferior.     */
/* ------------------------------------------------------------------ */
const ProofBeat: React.FC = () => {
  const frame = useCurrentFrame();
  // Escala menor y push-in sutil: libera el tercio inferior para la banda
  // esmeralda y el caption sobre el fondo, sin tapar la UI del vuelto.
  const zoom = interpolate(frame, [0, 150], [0.84, 0.86], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Conteo del vuelto: sube hasta el valor real y SE DETIENE.
  const t = interpolate(frame, [14, 52], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const vuelto = (607.49 * t).toFixed(2);
  const bandOpacity = interpolate(frame, [10, 13], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ background: BG }}>
      {/* +60px: baja la pantalla para que la banda superior (CTA en y140)
          no pise el chip "Factura #00893" de la UI real. */}
      <DeviceScreen network="online" zoom={zoom} zoomOrigin="50% 25%" />
      {/* Banda esmeralda: subida para respetar la zona segura inferior
          (borde inferior ≤ y1640) y dejar aire para el caption debajo, sin
          tapar el bloque "VUELTO EXACTO A ENTREGAR" de la UI (termina
          ~y1350 a esta escala). */}
      <div
        style={{
          position: 'absolute',
          top: 1396,
          left: 120,
          right: 120,
          background: colors.green,
          borderRadius: 20,
          padding: '24px 16px',
          display: 'flex',
          justifyContent: 'center',
          opacity: bandOpacity,
        }}
      >
        <span
          style={{
            fontFamily: RENOGARE,
            fontWeight: 900,
            fontSize: 68,
            color: colors.navyDark,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          Vuelto exacto C${vuelto}
        </span>
      </div>
      {/* Caption del tipo de cambio: entra CON la banda (f14 local =
          f209 global; antes aparecía en f251 y a las 8.33s aún no estaba
          en cuadro) y a 50px para que sobreviva al ancho de feed
          (340px ≈ 15px en pantalla). Borde inferior ~y1634 ≤ y1640. */}
      <SlamType appearAt={14} top={1578} fontSize={50}>
        <span style={{ color: colors.gray, fontWeight: 700, letterSpacing: 0 }}>
          Calculado al tipo de cambio del día
        </span>
      </SlamType>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 4: RESOLUCIÓN (f345..f450) — tipografía con el contraste.    */
/* El número hipotético ámbar se resuelve a esmeralda. Tercio          */
/* superior para el claim, centro para el número.                      */
/* ------------------------------------------------------------------ */
const ResolutionBeat: React.FC = () => {
  const frame = useCurrentFrame();
  // La cifra hipotética (ámbar, "si redondeas a ojo") se resuelve a la
  // cifra resuelta (esmeralda, "si el vuelto se calcula solo").
  const resolved = interpolate(frame, [74, 84], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  // Salida en CROSSFADE con la entrada del cierre (f444..f456 global): el
  // contenido se funde mientras el logo crece — nunca hay frame vacío
  // entre el tiempo 4 y el tiempo 5. El fondo es el mismo BG del padre,
  // así que desvanecerlo no cambia el campo base.
  const exitFade = interpolate(frame, [99, 111], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ background: BG, opacity: exitFade }}>
      {/* Recorte tenue de la pantalla real detrás del contraste */}
      <BackdropScreen />
      {/* Una sola afirmación: la otra decía lo mismo que la cifra del beat. */}
      <SlamType appearAt={8} top={400} fontSize={104}>
        Sin calcular a ojo.
      </SlamType>
      {/* Número resuelto: ámbar → esmeralda */}
      <div
        style={{
          position: 'absolute',
          top: 800,
          left: 120,
          right: 120,
          display: 'flex',
          justifyContent: 'center',
          zIndex: 10,
        }}
      >
        <div style={{ position: 'relative', width: 920, height: 160 }}>
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: RENOGARE,
              fontWeight: 900,
              fontSize: 90,
              color: AMBER,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              opacity: 1 - resolved,
            }}
          >
            C$600 al mes
          </span>
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: RENOGARE,
              fontWeight: 900,
              fontSize: 90,
              color: colors.green,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              opacity: resolved,
            }}
          >
            C$0 de redondeo
          </span>
        </div>
      </div>
      {/* Condición que hace honesta la cifra: cambia con la resolución */}
      <div
        style={{
          position: 'absolute',
          top: 1000,
          left: 120,
          right: 120,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ position: 'relative', width: 760, height: 56 }}>
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: RENOGARE,
              fontWeight: 700,
              fontSize: 36,
              color: colors.gray,
              whiteSpace: 'nowrap',
              opacity: 1 - resolved,
            }}
          >
            si redondeas a ojo
          </span>
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: RENOGARE,
              fontWeight: 700,
              fontSize: 36,
              color: colors.greenLight,
              whiteSpace: 'nowrap',
              opacity: resolved,
            }}
          >
            en cada cobro
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Tiempo 5: CIERRE (f450..f540) — cierre de marca canónico. El        */
/* contenido (incluido el glow) sale en local f72..f84 (global         */
/* f522..f534); los frames finales son el fondo del arranque.          */
/* ------------------------------------------------------------------ */
const CloseBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const exit = interpolate(frame, [72, 84], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Sin fondo propio: el AbsoluteFill padre ya pinta el BG, y dejar el
  // fondo del cierre transparente permite el crossfade con el tiempo 4
  // durante f450..f456 (sin frame vacío entre resolución y cierre).
  const logoScale = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.9 },
    durationInFrames: 16,
  });
  const textOpacity = interpolate(frame, [4, 12], [0, 1], {
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
      style={{ background: 'transparent' }}
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
            background:
              'radial-gradient(circle at center, rgba(0,191,129,0.18) 0%, transparent 70%)',
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
/* Composición principal — argumento de cinco tiempos, 540f (18s)      */
/* ------------------------------------------------------------------ */
export const Semana4Pieza2Digital: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Sequence from={0} durationInFrames={78}>
        <ArgumentBeat />
      </Sequence>
      <Sequence from={78} durationInFrames={117}>
        <MultiplicationBeat />
      </Sequence>
      <Sequence from={195} durationInFrames={150}>
        <ProofBeat />
      </Sequence>
      <Sequence from={345} durationInFrames={117}>
        <ResolutionBeat />
      </Sequence>
      <Sequence from={450} durationInFrames={90}>
        <CloseBeat />
      </Sequence>
      {/* Locución regenerada (argumento nuevo): entra en f0, dura 476f
          (15.86s); la cola de la pieza queda sin voz y sin loop de audio. */}
      <Sequence from={0}>
        <Audio src={staticFile('audio/pieza2_digital_vo.mp3')} />
      </Sequence>
      {/* CTA persistente: f45..f522; sale con el cierre para loopear. */}
      <PersistentCTA />
    </AbsoluteFill>
  );
};
