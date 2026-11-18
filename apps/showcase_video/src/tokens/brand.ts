export const NHILOS_BRAND = {
  colors: {
    green: '#00BF81', // Verde Esmeralda oficial
    greenLight: '#2FE0A4',
    greenDark: '#009665',
    navy: '#003757', // Azul Marino Profundo oficial
    navyLight: '#0A4D73',
    navyDark: '#00253B',
    gray: '#CCCCCC',
    surface: '#F8FAFC',
    border: '#E2E8F0',
  },
  typography: {
    heading: 'Achemost, Poppins, sans-serif',
    subheading: 'Renogare, Poppins, sans-serif',
    body: 'Poppins, system-ui, sans-serif',
  },
  slogan: 'CONECTAMOS LOS HILOS DE TU NEGOCIO.',
  claim: 'Un software operativo probado en condiciones reales de trabajo.',
  cta: 'Agendar Demostración Operativa',
  brandName: 'NHILOS POS',
} as const;

export const VIDEO_FPS = 30;

export const COMPOSITION_PRESETS = {
  showcaseMaster: {
    id: 'ShowcaseMaster',
    width: 1920,
    height: 1080,
    fps: VIDEO_FPS,
    durationInFrames: 1125, // 37.5 segundos (165 + 240 + 300 + 270 + 150)
  },
  metricsShowcase: {
    id: 'MetricsShowcase',
    width: 1920,
    height: 1080,
    fps: VIDEO_FPS,
    // 46.5 s: 190 + 285 + 255 + 220 + 290 + 155
    durationInFrames: 1395,
  },
  socialReel: {
    id: 'SocialReel',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 24 * VIDEO_FPS, // 24 segundos (720 frames)
  },
  speedReel: {
    id: 'SpeedReel',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 960, // 32 segundos (180 + 280 + 260 + 240 = 960 frames)
  },
  fiscalReel: {
    id: 'FiscalReel',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 1050, // 35 segundos (220 + 300 + 280 + 250 = 1050 frames)
  },
  offlineReel: {
    id: 'OfflineReel',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 1080, // 36 segundos (240 + 300 + 270 + 270 = 1080 frames)
  },
  blindAuditReel: {
    id: 'BlindAuditReel',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 1140, // 38 segundos (600 + 300 + 240 = 1140 frames)
  },
  holdOrdersReel: {
    id: 'HoldOrdersReel',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 1065, // 35.5 segundos (590 + 245 + 230 = 1065 frames)
  },
  ownerDashboardReel: {
    id: 'OwnerDashboardReel',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 1220, // 40.67 segundos (315 + 345 + 320 + 240 = 1220 frames)
  },
  voidAuditReel: {
    id: 'VoidAuditReel',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 975, // 32.5 segundos (510 + 240 + 225 = 975 frames) con locución natural (-2%)
  },
  multiCurrencyReel: {
    id: 'MultiCurrencyReel',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 1110, // 37.0 segundos (645 + 240 + 225 = 1110 frames) con locución natural (-2%)
  },
  kardexAuditReel: {
    id: 'KardexAuditReel',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 1110, // 37.0 segundos (885 + 225 = 1110 frames) con locución natural (-2%)
  },
  semana4Carrusel: {
    id: 'Semana4Carrusel',
    width: 1080,
    height: 1350,
    fps: VIDEO_FPS,
    durationInFrames: 4, // 1 frame por lámina (portada + 3 fugas); exporta con remotion still
  },
  semana4CarruselVertical: {
    id: 'Semana4CarruselVertical',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 4, // variante TikTok Photo Mode 9:16; pie sobre la UI inferior (~300px)
  },
  semana4PosScreenAsset: {
    id: 'Semana4PosScreen',
    width: 1600,
    height: 2560,
    fps: VIDEO_FPS,
    durationInFrames: 1, // asset estático: pantalla Q80 800x1280 @2x para composite
  },
  semana4Ticket80mmAsset: {
    id: 'Semana4Ticket80mm',
    width: 945,
    height: 1256,
    fps: VIDEO_FPS,
    durationInFrames: 1, // asset estático: ticket 80mm a 300 dpi imprimible/compusable
  },
  semana4OverlaysAsset: {
    id: 'Semana4Overlays',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 4, // overlays PNG alpha (f0..f3): 3 textos + cierre de marca
  },
  semana4HeroSalesScreenAsset: {
    id: 'Semana4HeroSalesScreen',
    width: 1600,
    height: 2560,
    fps: VIDEO_FPS,
    durationInFrames: 1, // web hero: pantalla de ventas real (SaleView) para montaje en dispositivo
  },
  semana4Pieza2DigitalAsset: {
    id: 'Semana4Pieza2Digital',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 440, // 14.67s @ 30fps: seis tiempos desiguales, payoff antes de f90, cierre que loopea al gancho; sin ticket ni claims falsos
  },
} as const;
