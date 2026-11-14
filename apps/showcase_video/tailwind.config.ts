import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        foreground: '#0f172a',
        border: '#e2e8f0',
        input: '#e2e8f0',
        ring: '#013a57',
        card: { DEFAULT: '#ffffff', foreground: '#0f172a' },
        popover: { DEFAULT: '#ffffff', foreground: '#0f172a' },
        muted: { DEFAULT: '#f1f5f9', foreground: '#64748b' },
        accent: { DEFAULT: '#f1f5f9', foreground: '#013a57' },
        primary: {
          DEFAULT: '#013a57',
          50: '#e6eef2',
          100: '#b3cdd9',
          200: '#80acc0',
          400: '#1a6a8f',
          600: '#012d45',
          700: '#011f32',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#008558',
          50: '#e6faf3',
          100: '#b3f0d9',
          200: '#80e6bf',
          400: '#00a876',
          600: '#006e48',
          700: '#005236',
          foreground: '#ffffff',
        },
        destructive: {
          DEFAULT: '#dc2626',
          50: '#fef2f2',
          700: '#b91c1c',
          foreground: '#ffffff',
        },
        warning: {
          DEFAULT: '#f59e0b',
          50: '#fffbeb',
          700: '#b45309',
          foreground: '#ffffff',
        },
        info: {
          DEFAULT: '#3b82f6',
          50: '#eff6ff',
          700: '#1d4ed8',
          foreground: '#ffffff',
        },
        nhilos: {
          green: {
            DEFAULT: '#00BF81', // Verde Esmeralda oficial
            light: '#2FE0A4',
            dark: '#009665',
            surface: 'rgba(0, 191, 129, 0.12)',
          },
          navy: {
            DEFAULT: '#003757', // Azul Marino Profundo oficial
            light: '#0A4D73',
            dark: '#00253B',
            surface: 'rgba(0, 55, 87, 0.08)',
          },
          gray: {
            DEFAULT: '#CCCCCC',
            border: '#E2E8F0',
            subtle: '#94A3B8',
            surface: '#F8FAFC',
          },
        },
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        inter: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['Achemost', 'Poppins', 'sans-serif'],
        subheading: ['Renogare', 'Poppins', 'sans-serif'],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        nhilos: '0 4px 20px -2px rgba(0, 55, 87, 0.08)',
        'nhilos-card': '0 10px 30px -4px rgba(0, 55, 87, 0.12)',
        'nhilos-glow': '0 0 40px rgba(0, 191, 129, 0.25)',
      },
    },
  },
  plugins: [],
} satisfies Config;
