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
    durationInFrames: 990, // 33.0 segundos exactos (90 + 240 + 300 + 270 + 90)
  },
  socialReel: {
    id: 'SocialReel',
    width: 1080,
    height: 1920,
    fps: VIDEO_FPS,
    durationInFrames: 24 * VIDEO_FPS, // 24 segundos (720 frames)
  },
} as const;
