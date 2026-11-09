import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          900: '#063b34',
          800: '#0B5D52',
          700: '#0e6e62',
          600: '#127f71',
          500: '#169082',
          400: '#1fa394',
          300: '#4bbdae',
          200: '#7fd4c9',
          100: '#b3e8e1',
          50:  '#e6f7f5',
        },
      },
    },
  },
  plugins: [],
};

export default config;
