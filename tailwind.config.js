/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/templates/**/*.hbs',
    './src/module/**/*.{ts,js}',
  ],
  prefix: 'tw-',
  important: '.wh40k-rpg',
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
        // Imperial Gold palette
        gold: {
          DEFAULT: '#d4af37',
          dark: '#8b7015',
          light: '#e6c84a',
          accent: '#d4a520',
          // Pre-computed darken/lighten of #c9a227 (SCSS $wh40k-color-gold)
          'raw': '#c9a227',
          'raw-d8': '#a78620',
          'raw-d10': '#9e801f',
          'raw-d15': '#896e1b',
          'raw-l5': '#d7b032',
          'raw-l10': '#dbb848',
        },
        bronze: { DEFAULT: '#cd7f32' },
        brass: {
          DEFAULT: '#b5a642',
          'd15': '#7d732e',
          'l20': '#d4ca89',
        },
        crimson: {
          DEFAULT: '#8b0000',
          light: '#b22222',
          dark: '#5c0000',
          'l20': '#f10000',
          'l25': '#ff0b0b',
          'l30': '#ff2525',
        },
        // Status colors
        success: {
          DEFAULT: '#2d5016',
          'd10': '#17280b',
          'l10': '#447821',
          'l20': '#5aa02c',
        },
        failure: {
          DEFAULT: '#6b1010',
          'l10': '#971717',
        },
        warning: '#8b6914',
        // Panel accent palettes (pre-computed darken/lighten variants)
        'accent-gold': {
          DEFAULT: '#d4a520',
          'd10': '#a88319',
          'l10': '#e3b944',
        },
        'accent-combat': {
          DEFAULT: '#a82020',
          'd5': '#931c1c',
          'd10': '#7d1818',
          'd15': '#681414',
          'l5': '#bd2424',
          'l10': '#d32828',
          'l15': '#da3b3b',
          'l20': '#de5050',
        },
        'accent-skills': {
          DEFAULT: '#2a7a9a',
          'd10': '#1f5a72',
          'l5': '#2f8aae',
          'l10': '#359ac2',
        },
        'accent-talents': {
          DEFAULT: '#a07818',
          'd5': '#8a6715',
          'd10': '#745711',
          'l10': '#cc991f',
          'l15': '#dea826',
          'l20': '#e2b13c',
        },
        'accent-equipment': {
          DEFAULT: '#3a5f5f',
          'l15': '#578f8f',
        },
        'accent-bio': {
          DEFAULT: '#6a5a4a',
          'l10': '#88745f',
        },
        'accent-powers': {
          DEFAULT: '#6a2090',
        },
        'accent-dynasty': '#d4a520',
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
      keyframes: {
        'flash-gold': {
          '0%': { boxShadow: '0 0 0 rgba(212, 175, 55, 0)' },
          '50%': { boxShadow: '0 0 30px rgba(212, 175, 55, 0.8)' },
          '100%': { boxShadow: '0 0 15px rgba(212, 175, 55, 0.5)' },
        },
      },
      animation: {
        'flash-gold': 'flash-gold 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
