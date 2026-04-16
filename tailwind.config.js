/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/templates/**/*.hbs',
    './src/module/**/*.{ts,js}',
  ],
  prefix: 'tw-',
  corePlugins: {
    preflight: false, // Don't reset existing Foundry/system styles
  },
  theme: {
    // Override Tailwind defaults to match $wh40k-font-size-* tokens
    fontSize: {
      '2xs': '0.625rem',
      'xs': '0.7rem',
      'sm': '0.8rem',
      'base': '0.9rem',
      'md': '1rem',
      'lg': '1.2rem',
      'xl': '1.5rem',
      '2xl': '2rem',
    },
    extend: {
      spacing: {
        // Map to $wh40k-space-* tokens — fills gaps in Tailwind's default scale
        // 0.5 = 2px, 1 = 4px, 1.5 = 6px, 2 = 8px, 2.5 = 10px, 3 = 12px, 4 = 16px, 6 = 24px
        '0.5': '2px',
        '0.75': '3px',
        '1.5': '6px',
        '2.5': '10px',
        '3': '12px',
        '6.5': '26px',
        '8.5': '34px',
      },
      fontFamily: {
        display: ['Cinzel', 'serif'],
        heading: ["'IM Fell DW Pica'", 'serif'],
        body: ['Lusitana', 'serif'],
        ui: ['Roboto', 'sans-serif'],
        alt: ["'Modesto Condensed'", "'Palatino Linotype'", 'serif'],
      },
      colors: {
        gold: {
          DEFAULT: '#d4af37',
          dark: '#8b7015',
          light: '#e6c84a',
          accent: '#d4a520',
        },
        bronze: { DEFAULT: '#cd7f32' },
        crimson: {
          DEFAULT: '#8b0000',
          light: '#b22222',
          dark: '#5c0000',
        },
        success: '#2d5016',
        failure: '#6b1010',
        warning: '#8b6914',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0, 0, 0, 0.3)',
        md: '0 4px 6px rgba(0, 0, 0, 0.4)',
        lg: '0 10px 20px rgba(0, 0, 0, 0.5)',
        inset: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
      },
      borderRadius: {
        sm: '2px',
        md: '4px',
        lg: '8px',
      },
      gridTemplateColumns: {
        'skill-row': '1fr auto 40px',
        'skill-row-compact': '1fr 28px',
        'content-auto-auto': '1fr auto auto',
        'header-main': 'minmax(280px, 1fr) auto',
        'header-topline': 'auto 1fr',
      },
    },
  },
  plugins: [],
};
