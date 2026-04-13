import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // MirMari design system colors — spec §DESIGN SYSTEM
      colors: {
        brand: {
          bg: '#FAF8F3',          // Page background
          dark: '#1E1420',         // Primary dark (replaces black)
          accent: '#C4688A',       // Dusty berry — primary CTA, highlights
          surface: '#F5E8EE',      // Soft blush — info boxes, tag backgrounds
          plum: '#7B5EA7',         // Muted plum — queue circles, active dots, nav indicators
        },
      },
      // Cormorant Garamond is loaded via Google Fonts in layout.tsx.
      // It is intentionally restricted to logo and slogan only per spec.
      fontFamily: {
        cormorant: ['Cormorant Garamond', 'Georgia', 'serif'],
      },
      // Max content width per spec: 480px column, centered on desktop
      maxWidth: {
        app: '480px',
      },
    },
  },
  plugins: [],
};

export default config;
