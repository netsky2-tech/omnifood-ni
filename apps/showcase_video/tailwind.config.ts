import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
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
        heading: ['Achemost', 'Poppins', 'sans-serif'],
        subheading: ['Renogare', 'Poppins', 'sans-serif'],
      },
      boxShadow: {
        nhilos: '0 4px 20px -2px rgba(0, 55, 87, 0.08)',
        'nhilos-card': '0 10px 30px -4px rgba(0, 55, 87, 0.12)',
        'nhilos-glow': '0 0 40px rgba(0, 191, 129, 0.25)',
      },
    },
  },
  plugins: [],
} satisfies Config;
