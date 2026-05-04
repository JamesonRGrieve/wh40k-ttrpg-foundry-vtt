/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin');

module.exports = {
  content: [
    './src/templates/**/*.hbs',
    './src/module/**/*.{ts,js}',
  ],
  prefix: 'tw-',
  important: '.wh40k-rpg',
  safelist: [
    // The monolith CSS (src/css/wh40k-rpg.css) still carries `animation: <name> ...`
    // rules on selectors like `.wh40k-panel`, `.wh40k-prompt::before`, etc. Those
    // rules reference @keyframes by name, and the @keyframes definitions now live
    // in theme.extend.keyframes below. Without this safelist, Tailwind would
    // tree-shake the @keyframes out (no `tw-animate-*` utility appears in any
    // template yet) and the monolith's animation rules would silently fail.
    // Drop this safelist once every animation is invoked via tw-animate-<name>
    // on its template AND the matching `animation:` rule is removed from the
    // monolith.
    { pattern: /^tw-animate-/ },
    // Per-system theme tokens emitted by `themeClassFor(systemId, role)` in
    // `src/module/config/game-systems/index.ts` — the helper produces these
    // class names dynamically at render time, so Tailwind's static template
    // scan can't see them. Each entry below matches a `theme.<role>` value
    // declared in `<id>-config.ts`. Update when a new theme token is added.
    'tw-bg-bronze', 'tw-text-gold-raw', 'tw-border-gold-raw-d10',
    'tw-bg-gold-raw', 'tw-text-gold-raw-l5', 'tw-border-gold-raw-d15',
    'tw-bg-crimson', 'tw-text-crimson-light', 'tw-border-crimson-dark',
    'tw-text-accent-combat', 'tw-border-accent-combat-d10',
    'tw-bg-crimson-light', 'tw-text-failure', 'tw-border-failure-l10',
    'tw-bg-brass', 'tw-text-brass-l20', 'tw-border-brass-d15',
    'tw-bg-accent-dynasty', 'tw-text-gold', 'tw-border-gold-dark',
    // Pill-style classes emitted by `get pill()` getters on item DataModels
    // (e.g. ritual.ts, navigator-power.ts, order.ts). These strings come from
    // TS at render time and are not visible to the static template scan.
    // When a new ritual/order/power type adds a pill, append its class names
    // here. Each entry is the literal class string emitted by the getter.
    'tw-bg-[rgba(217,119,6,0.2)]', 'tw-text-[#d97706]',
    'tw-bg-[rgba(124,58,237,0.2)]', 'tw-text-[#7c3aed]',
    'tw-bg-[rgba(220,38,38,0.2)]', 'tw-text-[#dc2626]',
    'tw-bg-[rgba(2,132,199,0.2)]', 'tw-text-[#0284c7]',
    'tw-bg-[rgba(100,116,139,0.2)]', 'tw-text-[#64748b]',
    'tw-bg-[rgba(0,0,0,0.1)]', 'tw-text-[color:var(--wh40k-text-muted)]',
    // Psychic discipline pill colors (psychic-power.ts get pill())
    'tw-bg-[rgba(139,92,246,0.2)]', 'tw-text-[#8b5cf6]',
    'tw-bg-[rgba(6,182,212,0.2)]', 'tw-text-[#06b6d4]',
    'tw-bg-[rgba(245,158,11,0.2)]', 'tw-text-[#f59e0b]',
    'tw-bg-[rgba(239,68,68,0.2)]', 'tw-text-[#ef4444]',
    'tw-bg-[rgba(34,197,94,0.2)]', 'tw-text-[#22c55e]',
    'tw-bg-[rgba(124,45,18,0.2)]', 'tw-text-[#7c2d12]',
    'tw-bg-[rgba(234,179,8,0.2)]', 'tw-text-[#eab308]',
    'tw-bg-[rgba(8,145,178,0.2)]', 'tw-text-[#0891b2]',
  ],
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
        'fury-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.1)', opacity: '0.8' },
        },
        'statIncrease': {
          '0%': {
            'background-color': 'transparent',
            transform: 'scale(1)',
          },
          '25%': {
            'background-color': 'rgba(74, 222, 128, 0.4)',
            transform: 'scale(1.15)',
            'box-shadow': '0 0 15px rgba(74, 222, 128, 0.6)',
          },
          '100%': {
            'background-color': 'transparent',
            transform: 'scale(1)',
          },
        },
        'statDecrease': {
          '0%': {
            'background-color': 'transparent',
            transform: 'translateX(0)',
          },
          '10%': {
            transform: 'translateX(-3px)',
          },
          '20%': {
            'background-color': 'rgba(220, 20, 60, 0.4)',
            transform: 'translateX(3px)',
            'box-shadow': '0 0 15px rgba(220, 20, 60, 0.6)',
          },
          '30%': {
            transform: 'translateX(-2px)',
          },
          '40%': {
            transform: 'translateX(2px)',
          },
          '50%': {
            transform: 'translateX(0)',
          },
          '100%': {
            'background-color': 'transparent',
          },
        },
        'statChanged': {
          '0%': {
            'box-shadow': '0 0 0 rgba(212, 175, 55, 0)',
          },
          '50%': {
            'box-shadow': '0 0 20px rgba(212, 175, 55, 0.8)',
          },
          '100%': {
            'box-shadow': '0 0 0 rgba(212, 175, 55, 0)',
          },
        },
        'statCritical': {
          '0%, 100%': {
            'box-shadow': '0 0 5px rgba(220, 20, 60, 0.3)',
            'border-color': 'var(--wh40k-red)',
          },
          '50%': {
            'box-shadow': '0 0 20px rgba(220, 20, 60, 0.7)',
            'border-color': 'var(--wh40k-red-bright)',
          },
        },
        'statSuccess': {
          '0%': {
            'box-shadow': '0 0 0 rgba(74, 222, 128, 0)',
          },
          '30%': {
            'box-shadow': '0 0 25px rgba(74, 222, 128, 0.7)',
          },
          '100%': {
            'box-shadow': '0 0 0 rgba(74, 222, 128, 0)',
          },
        },
        'pulse-warn-intense': {
          '0%, 100%': {
            opacity: '1',
            'box-shadow': '0 0 8px currentColor',
          },
          '50%': {
            opacity: '0.3',
            'box-shadow': 'none',
          },
        },
        'pulse-critical-intense': {
          '0%, 100%': {
            opacity: '1',
            'box-shadow': '0 0 12px currentColor',
          },
          '50%': {
            opacity: '0.3',
            'box-shadow': 'none',
          },
        },
        'slideDown': {
          'from': {
            opacity: '0',
            transform: 'translateY(-20px)',
          },
          'to': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'wh40k-pulse': {
          '0%, 100%': {
            opacity: '1',
          },
          '50%': {
            opacity: '0.6',
          },
        },
        'wh40k-glow': {
          '0%, 100%': {
            'box-shadow': '0 0 5px var(--wh40k-gold-glow)',
          },
          '50%': {
            'box-shadow': '0 0 20px var(--wh40k-gold-glow)',
          },
        },
        'burst-pulse': {
          '0%, 100%': {
            transform: 'scale(1.15)',
          },
          '50%': {
            transform: 'scale(1.25)',
          },
        },
        'clip-pulse': {
          '0%, 100%': {
            'border-color': 'rgba(182, 62, 46, 0.4)',
            'box-shadow': '0 0 0 rgba(182, 62, 46, 0)',
          },
          '50%': {
            'border-color': 'rgba(182, 62, 46, 0.7)',
            'box-shadow': '0 0 15px rgba(182, 62, 46, 0.3)',
          },
        },
        'star-twinkle': {
          '0%, 100%': {
            opacity: '0.8',
            transform: 'scale(1)',
          },
          '50%': {
            opacity: '1',
            transform: 'scale(1.2)',
          },
        },
        'value-change-highlight': {
          '0%': {
            'box-shadow': '0 0 0 0 rgba(212, 175, 55, 0.6)',
          },
          '50%': {
            'box-shadow': '0 0 20px 4px rgba(212, 175, 55, 0.4)',
          },
          '100%': {
            'box-shadow': '0 0 0 0 rgba(212, 175, 55, 0)',
          },
        },
        'subtle-pulse': {
          '0%, 100%': {
            opacity: '1',
          },
          '50%': {
            opacity: '0.7',
          },
        },
        'slide-in-up': {
          'from': {
            opacity: '0',
            transform: 'translateY(10px)',
          },
          'to': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'glow-pulse': {
          '0%, 100%': {
            'box-shadow': '0 0 5px rgba(212, 175, 55, 0.3)',
          },
          '50%': {
            'box-shadow': '0 0 15px rgba(212, 175, 55, 0.5)',
          },
        },
        'pulse-harmful': {
          '0%, 100%': {
            transform: 'scale(1)',
            opacity: '1',
          },
          '50%': {
            transform: 'scale(1.05)',
            opacity: '0.9',
          },
        },
        'pulse-danger': {
          '0%, 100%': {
            'box-shadow': '0 0 0 0 rgb(from #c0392b r g b / 0.7)',
          },
          '50%': {
            'box-shadow': '0 0 8px 2px rgb(from #c0392b r g b / 0.3)',
          },
        },
        'wh40k-panel-in': {
          '0%': {
            opacity: '0',
            transform: 'translateY(6px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'btn-press': {
          '0%': {
            transform: 'scale(1)',
          },
          '50%': {
            transform: 'scale(0.85)',
          },
          '100%': {
            transform: 'scale(1)',
          },
        },
        'btn-shake': {
          '0%, 100%': {
            transform: 'translateX(0)',
          },
          '10%, 30%, 50%, 70%, 90%': {
            transform: 'translateX(-4px)',
          },
          '20%, 40%, 60%, 80%': {
            transform: 'translateX(4px)',
          },
        },
        'number-roll': {
          '0%': {
            transform: 'translateY(-10px)',
            opacity: '0.5',
          },
          '50%': {
            transform: 'translateY(5px)',
            opacity: '0.8',
          },
          '100%': {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
        'bolt-glow': {
          '0%, 100%': {
            filter: 'brightness(1)',
          },
          '50%': {
            filter: 'brightness(1.3)',
          },
        },
        'pulse-red': {
          '0%, 100%': {
            'box-shadow': '0 0 0 0 rgba(182, 58, 43, 0.7)',
          },
          '50%': {
            'box-shadow': '0 0 0 6px rgba(182, 58, 43, 0)',
          },
        },
        'pulse-scale': {
          '0%, 100%': {
            transform: 'scale(1)',
          },
          '50%': {
            transform: 'scale(1.05)',
          },
        },
        'pulse-orange': {
          '0%, 100%': {
            'box-shadow': '0 0 0 0 rgba(192, 128, 32, 0.7)',
          },
          '50%': {
            'box-shadow': '0 0 0 6px rgba(192, 128, 32, 0)',
          },
        },
        'gentle-glow': {
          '0%, 100%': {
            filter: 'drop-shadow(0 3px 8px var(--wh40k-fate-border))',
          },
          '50%': {
            filter: 'drop-shadow(0 4px 12px var(--wh40k-fate-primary))',
          },
        },
        'sparkle': {
          '0%': {
            transform: 'scale(0.5) rotate(0deg)',
            opacity: '0',
          },
          '50%': {
            transform: 'scale(1.3) rotate(180deg)',
            opacity: '1',
          },
          '100%': {
            transform: 'scale(1) rotate(360deg)',
            opacity: '1',
          },
        },
        'fade-spend': {
          '0%': {
            transform: 'scale(1)',
            opacity: '1',
          },
          '50%': {
            transform: 'scale(1.2)',
            opacity: '0.5',
          },
          '100%': {
            transform: 'scale(1)',
            opacity: '0.3',
          },
        },
        'dropdown-slide': {
          'from': {
            opacity: '0',
            transform: 'translateY(-8px)',
          },
          'to': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'damned-pulse': {
          '0%, 100%': {
            'box-shadow': '0 0 0 0 rgba(139, 0, 0, 0.7)',
          },
          '50%': {
            'box-shadow': '0 0 0 8px rgba(139, 0, 0, 0)',
          },
        },
        'badge-pulse': {
          '0%, 100%': {
            transform: 'scale(1)',
          },
          '50%': {
            transform: 'scale(1.06)',
          },
        },
        'seal-pulse': {
          '0%, 100%': {
            transform: 'scale(1)',
          },
          '50%': {
            transform: 'scale(1.08)',
          },
        },
        'alert-pulse': {
          '0%, 100%': {
            opacity: '1',
            transform: 'scale(1)',
          },
          '50%': {
            opacity: '0.6',
            transform: 'scale(1.1)',
          },
        },
        'damned-alert': {
          '0%, 100%': {
            background: 'rgba(0, 0, 0, 0.3)',
            'box-shadow': '0 0 0 0 rgba(255, 0, 0, 0.7)',
          },
          '50%': {
            background: 'rgba(139, 0, 0, 0.4)',
            'box-shadow': '0 0 0 6px rgba(255, 0, 0, 0)',
          },
        },
        'insane-pulse': {
          '0%, 100%': {
            'box-shadow': '0 0 0 0 rgba(139, 0, 0, 0.7)',
          },
          '50%': {
            'box-shadow': '0 0 0 8px rgba(139, 0, 0, 0)',
          },
        },
        'pf-marker-pulse': {
          '0%, 100%': {
            transform: 'translateX(-50%) translateY(0)',
          },
          '50%': {
            transform: 'translateX(-50%) translateY(-2px)',
          },
        },
        'expandDown': {
          'from': {
            opacity: '0',
            'max-height': '0',
          },
          'to': {
            opacity: '1',
            'max-height': '500px',
          },
        },
        'pulse-glow': {
          '0%, 100%': {
            'box-shadow': 'none',
          },
          '50%': {
            'box-shadow': '0 0 15px rgba(212, 175, 55, 0.5)',
          },
        },
        'spin': {
          'from': {
            transform: 'rotate(0deg)',
          },
          'to': {
            transform: 'rotate(360deg)',
          },
        },
        'shimmer': {
          '0%': {
            transform: 'translateX(-100%)',
          },
          '100%': {
            transform: 'translateX(100%)',
          },
        },
        'bolt-glow-combat': {
          '0%, 100%': {
            filter: 'brightness(1)',
          },
          '50%': {
            filter: 'brightness(1.3)',
          },
        },
        'star-glow': {
          '0%, 100%': {
            filter: 'brightness(1)',
            transform: 'scale(1)',
          },
          '50%': {
            filter: 'brightness(1.2)',
            transform: 'scale(1.05)',
          },
        },
        'star-pulse': {
          '0%, 100%': {
            transform: 'scale(1)',
            opacity: '1',
          },
          '50%': {
            transform: 'scale(1.1)',
            opacity: '0.8',
          },
        },
        'critical-pulse': {
          '0%, 100%': {
            'background-color': 'transparent',
            'border-color': 'inherit',
          },
          '50%': {
            'background-color': 'rgba(139, 0, 0, 0.2)',
            'border-color': '#dc143c',
            'box-shadow': '0 0 10px rgba(220, 20, 60, 0.5)',
          },
        },
        'fury-glow': {
          'from': {
            'box-shadow': '0 0 10px rgba(255, 215, 0, 0.3)',
          },
          'to': {
            'box-shadow': '0 0 25px rgba(255, 215, 0, 0.5)',
          },
        },
        'melta-pulse': {
          '0%, 100%': {
            opacity: '0.8',
          },
          '50%': {
            opacity: '1',
          },
        },
        'wh40k-xp-preview-fadein': {
          'from': {
            opacity: '0',
            transform: 'translateY(-10px)',
          },
          'to': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'urd-target-pulse-green': {
          '0%, 100%': {
            filter: 'brightness(1)',
          },
          '50%': {
            filter: 'brightness(1.4)',
          },
        },
        'urd-target-pulse-red': {
          '0%, 100%': {
            filter: 'brightness(1)',
          },
          '50%': {
            filter: 'brightness(1.4)',
          },
        },
        'urd-picker-appear': {
          '0%': {
            opacity: '0',
            transform: 'translateY(-6px) scale(0.96)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0) scale(1)',
          },
        },
        'urd-result-reveal': {
          '0%': {
            opacity: '0',
            transform: 'translateY(10px) scale(0.95)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0) scale(1)',
          },
        },
        'urd-die-land': {
          '0%': {
            transform: 'rotate(-3deg) scale(1.05)',
          },
          '50%': {
            transform: 'rotate(2deg) scale(0.98)',
          },
          '100%': {
            transform: 'rotate(0) scale(1)',
          },
        },
        'csd-snap': {
          '0%': {
            transform: 'scale(1)',
          },
          '30%': {
            transform: 'scale(1.08)',
          },
          '60%': {
            transform: 'scale(0.97)',
          },
          '100%': {
            transform: 'scale(1)',
          },
        },
        'csd-bounce': {
          '0%, 100%': {
            transform: 'translateY(0)',
          },
          '50%': {
            transform: 'translateY(3px)',
          },
        },
        'csd-value-pop': {
          '0%': {
            transform: 'scale(0.8)',
            opacity: '0.5',
          },
          '50%': {
            transform: 'scale(1.1)',
          },
          '100%': {
            transform: 'scale(1)',
            opacity: '1',
          },
        },
        'csd-pulse-border': {
          '0%, 100%': {
            'border-color': 'rgb(from var(--csd-primary) r g b / 0.35)',
          },
          '50%': {
            'border-color': 'rgb(from var(--csd-gold) r g b / 0.6)',
          },
        },
        'xp-shimmer': {
          '0%': {
            transform: 'translateX(-100%)',
          },
          '100%': {
            transform: 'translateX(100%)',
          },
        },
        'fadeIn': {
          'from': {
            opacity: '0',
            transform: 'translateY(4px)',
          },
          'to': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'purchasePulse': {
          '0%': {
            'box-shadow': '0 0 0 0 rgba(45, 80, 22, 0.6)',
          },
          '50%': {
            'box-shadow': '0 0 20px 10px rgba(45, 80, 22, 0.6)',
          },
          '100%': {
            'box-shadow': '0 0 0 0 transparent',
          },
        },
        'currentPulse': {
          '0%, 100%': {
            'box-shadow': '0 0 0 0 rgba(201, 162, 39, 0.4)',
          },
          '50%': {
            'box-shadow': '0 0 6px 2px rgba(201, 162, 39, 0.6)',
          },
        },
        'pulse-border': {
          '0%, 100%': {
            opacity: '0.3',
          },
          '50%': {
            opacity: '1',
          },
        },
        'pulse': {
          '0%, 100%': {
            opacity: '0.4',
            transform: 'scale(1)',
          },
          '50%': {
            opacity: '1',
            transform: 'scale(1.05)',
          },
        },
        'emphasize': {
          '0%, 100%': {
            transform: 'scale(1)',
          },
          '50%': {
            transform: 'scale(1.05)',
          },
        },
        'glow': {
          '0%, 100%': {
            'box-shadow': '0 0 8px rgba(201, 162, 39, 0.3)',
          },
          '50%': {
            'box-shadow': '0 0 25px rgba(201, 162, 39, 0.6)',
          },
        },
        'hitLocationPulse': {
          '0%, 100%': {
            background: 'var(--wh40k-panel-bg)',
            'border-color': 'var(--wh40k-border-color)',
            'box-shadow': '0 2px 4px var(--wh40k-shadow-soft)',
          },
          '50%': {
            background: 'rgba(212, 175, 55, 0.25)',
            'border-color': 'var(--wh40k-gold)',
            'box-shadow': '0 0 16px rgba(212, 175, 55, 0.5)',
          },
        },
        'fadeSlideIn': {
          'from': {
            opacity: '0',
            transform: 'translateY(10px)',
          },
          'to': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'stat-increase': {
          '0%': {
            'background-color': 'transparent',
            transform: 'scale(1)',
          },
          '25%': {
            'background-color': 'rgba(76, 175, 80, 0.4)',
            'box-shadow': '0 0 8px rgba(76, 175, 80, 0.6)',
            transform: 'scale(1.05)',
          },
          '50%': {
            'background-color': 'rgba(76, 175, 80, 0.3)',
          },
          '100%': {
            'background-color': 'transparent',
            'box-shadow': 'none',
            transform: 'scale(1)',
          },
        },
        'stat-decrease': {
          '0%': {
            'background-color': 'transparent',
            transform: 'scale(1)',
          },
          '25%': {
            'background-color': 'rgba(244, 67, 54, 0.4)',
            'box-shadow': '0 0 8px rgba(244, 67, 54, 0.6)',
            transform: 'scale(1.05)',
          },
          '50%': {
            'background-color': 'rgba(244, 67, 54, 0.3)',
          },
          '100%': {
            'background-color': 'transparent',
            'box-shadow': 'none',
            transform: 'scale(1)',
          },
        },
        'pulse-gold': {
          '0%, 100%': {
            color: 'inherit',
            'text-shadow': 'none',
          },
          '50%': {
            color: 'var(--wh40k-color-gold)',
            'text-shadow': '0 0 10px rgba(212, 175, 55, 0.8)',
          },
        },
        'flash-update': {
          '0%': {
            'background-color': 'transparent',
          },
          '50%': {
            'background-color': 'rgba(33, 150, 243, 0.3)',
          },
          '100%': {
            'background-color': 'transparent',
          },
        },
        'count-up': {
          '0%': {
            transform: 'translateY(10px)',
            opacity: '0.5',
          },
          '100%': {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
        'count-down': {
          '0%': {
            transform: 'translateY(-10px)',
            opacity: '0.5',
          },
          '100%': {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
        'stat-advance': {
          '0%': {
            background: 'transparent',
            transform: 'scale(1)',
          },
          '25%': {
            background: 'radial-gradient(circle, rgba(212, 175, 55, 0.4) 0%, transparent 70%)',
            transform: 'scale(1.1)',
          },
          '50%': {
            background: 'radial-gradient(circle, rgba(212, 175, 55, 0.2) 0%, transparent 70%)',
            'box-shadow': '0 0 20px rgba(212, 175, 55, 0.6)',
          },
          '100%': {
            background: 'transparent',
            transform: 'scale(1)',
            'box-shadow': 'none',
          },
        },
        'stat-heal': {
          '0%': {
            'background-color': 'transparent',
          },
          '50%': {
            'background-color': 'rgba(76, 175, 80, 0.5)',
            'box-shadow': '0 0 15px rgba(76, 175, 80, 0.7)',
          },
          '100%': {
            'background-color': 'transparent',
            'box-shadow': 'none',
          },
        },
        'stat-damage': {
          '0%': {
            'background-color': 'transparent',
          },
          '25%': {
            'background-color': 'rgba(139, 0, 0, 0.6)',
            'box-shadow': '0 0 15px rgba(220, 20, 60, 0.8)',
            transform: 'scale(1.05)',
          },
          '50%': {
            'background-color': 'rgba(139, 0, 0, 0.3)',
          },
          '100%': {
            'background-color': 'transparent',
            'box-shadow': 'none',
            transform: 'scale(1)',
          },
        },
        'level-up-burst': {
          '0%': {
            'box-shadow': '0 0 0 0 rgba(212, 175, 55, 0.7)',
            transform: 'scale(1)',
          },
          '50%': {
            'box-shadow': '0 0 0 10px rgba(212, 175, 55, 0)',
            transform: 'scale(1.05)',
          },
          '100%': {
            'box-shadow': '0 0 0 0 rgba(212, 175, 55, 0)',
            transform: 'scale(1)',
          },
        },
        'panel-spin': {
          'to': {
            transform: 'rotate(360deg)',
          },
        },
        'pulse-warning': {
          '0%, 100%': {
            opacity: '1',
          },
          '50%': {
            opacity: '0.85',
          },
        },
        'panel-slide-in': {
          'from': {
            transform: 'translateY(-50%) translateX(100%)',
            opacity: '0',
          },
          'to': {
            transform: 'translateY(-50%) translateX(0)',
            opacity: '1',
          },
        },
        'drop-zone-pulse': {
          '0%, 100%': {
            opacity: '0.5',
          },
          '50%': {
            opacity: '1',
          },
        },
        'indicator-glow': {
          '0%, 100%': {
            'box-shadow': '0 0 5px var(--wh40k-gold)',
          },
          '50%': {
            'box-shadow': '0 0 15px var(--wh40k-gold), 0 0 25px var(--wh40k-gold)',
          },
        },
        'snap-to-slot': {
          '0%': {
            transform: 'scale(1) rotate(0deg)',
          },
          '30%': {
            transform: 'scale(1.15) rotate(5deg)',
          },
          '60%': {
            transform: 'scale(0.95) rotate(-3deg)',
          },
          '80%': {
            transform: 'scale(1.05) rotate(1deg)',
          },
          '100%': {
            transform: 'scale(1) rotate(0deg)',
          },
        },
        'popoverFadeIn': {
          'from': {
            opacity: '0',
            transform: 'translateY(-8px)',
          },
          'to': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'toolbar-slide-in': {
          'from': {
            transform: 'translateY(-100%)',
            opacity: '0',
          },
          'to': {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
        'flask-bubble': {
          '0%, 100%': {
            transform: 'scale(1)',
          },
          '50%': {
            transform: 'scale(1.1)',
          },
        },
        'preview-pulse': {
          '0%, 100%': {
            opacity: '0.6',
            'box-shadow': '0 0 5px rgba(212, 175, 55, 0.4)',
          },
          '50%': {
            opacity: '1',
            'box-shadow': '0 0 15px rgba(212, 175, 55, 0.8)',
          },
        },
        'badge-appear': {
          'from': {
            transform: 'scale(0) rotate(-45deg)',
            opacity: '0',
          },
          'to': {
            transform: 'scale(1) rotate(0deg)',
            opacity: '1',
          },
        },
        'seal-shake-pip': {
          '0%, 100%': {
            transform: 'rotate(0deg)',
          },
          '25%': {
            transform: 'rotate(-3deg)',
          },
          '75%': {
            transform: 'rotate(3deg)',
          },
        },
        'seal-burn-pip': {
          '0%, 100%': {
            transform: 'rotate(0deg) scale(1)',
            filter: 'drop-shadow(0 2px 10px rgba(139, 0, 0, 0.8)) brightness(1)',
          },
          '50%': {
            transform: 'rotate(0deg) scale(1.05)',
            filter: 'drop-shadow(0 2px 12px rgba(255, 0, 0, 1)) brightness(1.2)',
          },
        },
        'text-flicker': {
          '0%, 100%': {
            opacity: '1',
          },
          '50%': {
            opacity: '0.7',
          },
        },
        'wh40k-char-roll': {
          '0%': {
            transform: 'scale(1)',
          },
          '30%': {
            transform: 'scale(1.1)',
          },
          '100%': {
            transform: 'scale(1)',
          },
        },
        'wh40k-value-flash': {
          '0%': {
            color: 'var(--wh40k-text-dark)',
            'text-shadow': '0 1px 0 var(--wh40k-text-shadow)',
          },
          '50%': {
            color: 'var(--wh40k-gold, var(--wh40k-color-gold))',
            'text-shadow': '0 0 8px rgba(212, 175, 55, 0.8)',
          },
          '100%': {
            color: 'var(--wh40k-text-dark)',
            'text-shadow': '0 1px 0 var(--wh40k-text-shadow)',
          },
        },
        'wh40k-total-flash': {
          '0%': {
            color: 'var(--wh40k-text-muted)',
          },
          '50%': {
            color: 'var(--wh40k-gold, var(--wh40k-color-gold))',
          },
          '100%': {
            color: 'var(--wh40k-text-muted)',
          },
        },
        'origin-pulse': {
          '0%, 100%': {
            'text-shadow': '0 0 4px rgba(212, 175, 55, 0.3)',
          },
          '50%': {
            'text-shadow': '0 0 12px rgba(212, 175, 55, 0.9)',
            color: '#f0d060',
          },
        },
      },
      // Default timing for each animation utility, copied from the monolith
      // (`src/css/wh40k-rpg.css`). Where the same keyframe is invoked at
      // multiple call sites with different timings, the most common tuple is
      // the default; outliers are expressed inline on the consuming template
      // as arbitrary-value utilities (e.g. `tw-animate-[slide-in-up_0.4s_ease-out_backwards]`).
      animation: {
        'flash-gold': 'flash-gold 0.3s ease-out',
        'fury-pulse': 'fury-pulse 1s ease-in-out infinite',
        'statIncrease': 'statIncrease 0.6s ease-out',
        'statDecrease': 'statDecrease 0.6s ease-out',
        'statChanged': 'statChanged 0.5s ease-out',
        'statCritical': 'statCritical 1.5s ease-in-out infinite',
        'statSuccess': 'statSuccess 0.8s ease-out',
        'pulse-warn-intense': 'pulse-warn-intense 1.5s ease-in-out infinite',
        'pulse-critical-intense': 'pulse-critical-intense 1s ease-in-out infinite',
        'slideDown': 'slideDown 0.2s ease-out',
        'wh40k-pulse': 'wh40k-pulse 2s ease-in-out infinite',
        'wh40k-glow': 'wh40k-glow 2s ease-in-out infinite',
        'burst-pulse': 'burst-pulse 0.6s ease',
        'clip-pulse': 'clip-pulse 2s ease-in-out infinite',
        'star-twinkle': 'star-twinkle 2s ease-in-out infinite',
        'value-change-highlight': 'value-change-highlight 0.6s ease-out',
        'subtle-pulse': 'subtle-pulse 2s ease-in-out infinite',
        'slide-in-up': 'slide-in-up 0.3s ease-out',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'pulse-harmful': 'pulse-harmful 2s ease-in-out infinite',
        'pulse-danger': 'pulse-danger 2s ease-in-out infinite',
        'wh40k-panel-in': 'wh40k-panel-in 0.3s ease both',
        'btn-press': 'btn-press 0.2s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'btn-shake': 'btn-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        'number-roll': 'number-roll 0.3s ease-out',
        'bolt-glow': 'bolt-glow 2s ease-in-out infinite',
        'pulse-red': 'pulse-red 2s ease-in-out infinite',
        'pulse-scale': 'pulse-scale 1.5s ease-in-out infinite',
        'pulse-orange': 'pulse-orange 2s ease-in-out infinite',
        'gentle-glow': 'gentle-glow 3s ease-in-out infinite',
        'sparkle': 'sparkle 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'fade-spend': 'fade-spend 0.5s ease-out forwards',
        'dropdown-slide': 'dropdown-slide 0.2s ease',
        'damned-pulse': 'damned-pulse 2s ease-in-out infinite',
        'badge-pulse': 'badge-pulse 2s ease-in-out infinite',
        'seal-pulse': 'seal-pulse 2s ease-in-out infinite',
        'alert-pulse': 'alert-pulse 2s ease-in-out infinite',
        'damned-alert': 'damned-alert 1s ease-in-out infinite',
        'insane-pulse': 'insane-pulse 2s ease-in-out infinite',
        'pf-marker-pulse': 'pf-marker-pulse 2s ease-in-out infinite',
        'expandDown': 'expandDown 0.2s ease',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'spin': 'spin 2s linear infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'bolt-glow-combat': 'bolt-glow-combat 2s ease-in-out infinite',
        'star-glow': 'star-glow 2s ease-in-out infinite',
        'star-pulse': 'star-pulse 1.5s ease-in-out infinite',
        'critical-pulse': 'critical-pulse 1s ease-in-out infinite alternate',
        'fury-glow': 'fury-glow 1.5s ease-in-out infinite alternate',
        'melta-pulse': 'melta-pulse 2s ease-in-out infinite',
        'wh40k-xp-preview-fadein': 'wh40k-xp-preview-fadein 0.3s ease',
        'urd-target-pulse-green': 'urd-target-pulse-green 0.4s ease',
        'urd-target-pulse-red': 'urd-target-pulse-red 0.4s ease',
        'urd-picker-appear': 'urd-picker-appear 0.2s ease',
        'urd-result-reveal': 'urd-result-reveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'urd-die-land': 'urd-die-land 0.25s ease',
        'csd-snap': 'csd-snap 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'csd-bounce': 'csd-bounce 2s ease-in-out infinite',
        'csd-value-pop': 'csd-value-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'csd-pulse-border': 'csd-pulse-border 1.5s ease-in-out infinite',
        'xp-shimmer': 'xp-shimmer 2s linear infinite',
        'fadeIn': 'fadeIn 0.3s ease',
        'purchasePulse': 'purchasePulse 0.6s ease-out',
        'currentPulse': 'currentPulse 1.5s ease-in-out infinite',
        'pulse-border': 'pulse-border 1.5s ease-in-out infinite',
        'pulse': 'pulse 2.5s ease-in-out infinite',
        'emphasize': 'emphasize 1.5s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'hitLocationPulse': 'hitLocationPulse 0.5s ease-in-out 4',
        'fadeSlideIn': 'fadeSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'stat-increase': 'stat-increase 0.6s ease-out',
        'stat-decrease': 'stat-decrease 0.6s ease-out',
        'pulse-gold': 'pulse-gold 0.8s ease-out',
        'flash-update': 'flash-update 0.5s ease-out',
        'count-up': 'count-up 0.5s ease-out',
        'count-down': 'count-down 0.5s ease-out',
        'stat-advance': 'stat-advance 1s ease-out',
        'stat-heal': 'stat-heal 0.8s ease-out',
        'stat-damage': 'stat-damage 0.8s ease-out',
        'level-up-burst': 'level-up-burst 0.6s ease-out',
        'panel-spin': 'panel-spin 0.8s linear infinite',
        'pulse-warning': 'pulse-warning 2s ease-in-out infinite',
        'panel-slide-in': 'panel-slide-in 0.3s ease-out',
        'drop-zone-pulse': 'drop-zone-pulse 2s ease-in-out infinite',
        'indicator-glow': 'indicator-glow 1s ease-in-out infinite',
        'snap-to-slot': 'snap-to-slot 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'popoverFadeIn': 'popoverFadeIn 0.15s ease-out',
        'toolbar-slide-in': 'toolbar-slide-in 0.4s ease-out',
        'flask-bubble': 'flask-bubble 2s ease-in-out infinite',
        'preview-pulse': 'preview-pulse 2s ease-in-out infinite',
        'badge-appear': 'badge-appear 0.3s ease-out',
        'seal-shake-pip': 'seal-shake-pip 3s ease-in-out infinite',
        'seal-burn-pip': 'seal-burn-pip 1.5s ease-in-out infinite',
        'text-flicker': 'text-flicker 0.5s ease-in-out infinite',
        'wh40k-char-roll': 'wh40k-char-roll 0.4s ease-out',
        'wh40k-value-flash': 'wh40k-value-flash 0.5s ease-out',
        'wh40k-total-flash': 'wh40k-total-flash 0.5s ease-out',
        'origin-pulse': 'origin-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [
    // Per-system theme variants — apply a utility only when the sheet root
    // (or any ancestor) carries the matching `data-wh40k-system="<id>"` attr.
    // Usage in templates: `tw-bg-gold dh2e:tw-bg-bronze rt:tw-bg-amber-700`.
    // The 7 ids (`bc`, `dh1e`, `dh2e`, `dw`, `ow`, `rt`, `im`) match
    // `src/module/config/game-systems/types.ts` `GameSystemId`.
    plugin(function ({ addVariant }) {
      ['bc', 'dh1e', 'dh2e', 'dw', 'ow', 'rt', 'im'].forEach((id) => {
        addVariant(id, `[data-wh40k-system="${id}"] &`);
      });
    }),
    plugin(function ({ addComponents }) {
      // Selectors here are auto-prefixed by Tailwind's `prefix: 'tw-'` config,
      // so write them WITHOUT the tw- prefix.
      addComponents({
        // Shared form-group: standard label-over-input pattern used in nearly every dialog.
        '.form-group': {
          marginBottom: '0',
          '& > label': {
            fontWeight: 'bold',
            marginBottom: '0.25rem',
            display: 'block',
          },
          '& input[type="text"], & input[type="number"], & input[type="email"], & input[type="password"], & select, & textarea': {
            width: '100%',
            padding: '0.4rem 0.5rem',
            border: '1px solid var(--color-border-light-tertiary)',
            borderRadius: 'var(--wh40k-radius-md)',
            background: 'var(--color-bg-option)',
          },
          '& input:focus, & select:focus, & textarea:focus': {
            outline: 'none',
            borderColor: 'var(--wh40k-color-accent, var(--wh40k-color-gold))',
          },
          '& > .hint': {
            fontSize: '0.75rem',
            color: 'var(--color-text-light-6)',
            marginTop: '0.25rem',
          },
        },
        // Checkbox modifier: label and input on one line.
        '.form-group--checkbox > label': {
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontWeight: 'normal',
          cursor: 'pointer',
        },
        '.form-group--checkbox input[type="checkbox"]': {
          width: 'auto',
        },
        // Indent modifier for nested form-groups.
        '.form-group--indent': {
          marginLeft: '1.5rem',
        },
      });
    }),
  ],
};
