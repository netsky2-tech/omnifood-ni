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
} as const;
