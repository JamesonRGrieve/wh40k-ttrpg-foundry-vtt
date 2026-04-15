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
    extend: {
      spacing: {
        // Map to $wh40k-space-* tokens — fills gaps in Tailwind's default scale
        // 0.5 = 2px, 1 = 4px, 1.5 = 6px, 2 = 8px, 2.5 = 10px, 3 = 12px, 4 = 16px, 6 = 24px
        '0.5': '2px',
        '1.5': '6px',
        '2.5': '10px',
        '3': '12px',
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
        },
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
