// Gothic 40K design tokens — `:root` and theme-scoped CSS custom properties
// emitted via Tailwind's `addBase` plugin. Ports the legacy
// `src/css/abstracts/_gothic-theme.css` data block into Tailwind configuration
// without changing rendered output. Existing `var(--wh40k-foo)` consumers
// continue to work unchanged.
//
// Foundry V13+ uses .theme-light / .theme-dark on body. Light theme is the
// default and shares its values with `:root` (so anything outside Foundry's
// theme classes still gets sane defaults).

const palette = {
    '--wh40k-gold': '#d4af37',
    '--wh40k-gold-bright': '#ffd700',
    '--wh40k-gold-dark': '#b8941f',
    '--wh40k-gold-glow': 'rgba(212, 175, 55, 0.3)',
    '--wh40k-bronze': '#cd7f32',
    '--wh40k-bronze-dark': '#8b5a2b',
    '--wh40k-red': '#8b0000',
    '--wh40k-red-bright': '#dc143c',
    '--wh40k-red-dark': '#5a0000',
    '--wh40k-green': '#2d5a2d',
    '--wh40k-green-bright': '#4ade80',
    '--wh40k-accent-gold': '#d4a520',
    '--wh40k-accent-combat': '#a82020',
    '--wh40k-accent-red': '#e74c3c',
    '--wh40k-accent-skills': '#2a7a9a',
    '--wh40k-accent-talents': '#a07818',
    '--wh40k-accent-equipment': '#3a5f5f',
    '--wh40k-accent-powers': '#6a2090',
    '--wh40k-accent-bio': '#6a5a4a',
    '--wh40k-accent-info': '#3498db',
    '--wh40k-accent-green': '#27ae60',
    '--wh40k-accent-green-bright': '#2ecc71',
    '--wh40k-accent-psychic': '#9b59b6',
    '--wh40k-color-gold': '#d4af37',
    '--wh40k-color-gold-dark': '#8b7015',
    '--wh40k-color-gold-light': '#e6c84a',
    '--wh40k-color-brass': '#b5a642',
    '--wh40k-color-crimson': '#8b0000',
    '--wh40k-color-success': '#2d5016',
    '--wh40k-color-warning': '#8b6914',
    '--wh40k-text-primary': '#e8e0d0',
    '--wh40k-text-secondary': '#b8a890',
    '--wh40k-bg-overlay-light': 'rgba(255, 255, 255, 0.05)',
    '--wh40k-bg-overlay-medium': 'rgba(0, 0, 0, 0.2)',
    '--wh40k-bg-input': 'rgba(0, 0, 0, 0.3)',
    '--wh40k-bg-paper': 'rgba(30, 25, 20, 0.9)',
    '--wh40k-bg-paper-light': 'rgba(40, 35, 28, 0.85)',
    '--wh40k-bg-subtle': 'rgba(50, 45, 35, 0.6)',
    '--wh40k-bg-translucent': 'rgba(30, 25, 20, 0.7)',
    '--wh40k-border-light': 'rgba(120, 100, 80, 0.4)',
    '--wh40k-border-medium': 'rgba(120, 100, 80, 0.6)',
};

const typography = {
    '--wh40k-font-header': "'Caslon Antique', 'Trajan Pro', serif",
    '--wh40k-font-display': "'Modesto Condensed', 'Cinzel', serif",
    '--wh40k-font-heading': "'Modesto Condensed', 'IM Fell DW Pica', serif",
    '--wh40k-font-body': "'Lusitana', serif",
    '--wh40k-font-ui': "'Roboto', sans-serif",
    '--wh40k-font-alt': "'Modesto Condensed', 'Palatino Linotype', serif",
    '--wh40k-font-size-xs': '0.7rem',
    '--wh40k-font-size-sm': '0.8rem',
    '--wh40k-font-size-base': '0.9rem',
    '--wh40k-font-size-md': '1rem',
    '--wh40k-text-h3': '1.1rem',
};

const layout = {
    '--wh40k-space-xs': '4px',
    '--wh40k-space-sm': '8px',
    '--wh40k-space-md': '12px',
    '--wh40k-space-lg': '16px',
    '--wh40k-space-xl': '24px',
    '--wh40k-radius-sm': '2px',
    '--wh40k-radius-md': '4px',
    '--wh40k-radius-lg': '8px',
    '--wh40k-transition-fast': '150ms ease',
    '--wh40k-transition-base': '200ms ease',
    '--wh40k-transition-medium': '300ms ease',
};

const lightTheme = {
    '--wh40k-sheet-bg': 'rgba(250, 244, 233, 0.95)',
    '--wh40k-panel-bg': 'rgba(255, 255, 255, 0.5)',
    '--wh40k-panel-bg-solid': 'rgba(255, 255, 255, 0.85)',
    '--wh40k-panel-bg-translucent': 'rgba(255, 255, 255, 0.35)',
    '--wh40k-panel-body-bg': 'rgba(255, 255, 255, 0.4)',
    '--wh40k-input-bg': 'rgba(255, 255, 255, 0.75)',
    '--wh40k-input-bg-focus': 'rgba(255, 255, 255, 0.9)',
    '--wh40k-text-dark': '#2a1a0a',
    '--wh40k-text-medium': '#3a2820',
    '--wh40k-text-muted': '#6a5a43',
    '--wh40k-text-subtle': '#8b7355',
    '--wh40k-border-color': 'rgba(120, 46, 34, 0.45)',
    '--wh40k-border-color-light': 'rgba(120, 46, 34, 0.25)',
    '--wh40k-border-color-strong': 'rgba(120, 46, 34, 0.7)',
    '--wh40k-border-accent': 'rgba(74, 55, 40, 0.3)',
    '--wh40k-shadow-soft': 'rgba(0, 0, 0, 0.05)',
    '--wh40k-shadow-medium': 'rgba(0, 0, 0, 0.12)',
    '--wh40k-text-shadow': 'rgba(255, 255, 255, 0.8)',
    '--wh40k-hud-item-bg': 'rgba(255, 255, 255, 0.4)',
    '--wh40k-circle-bg': 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.85), rgba(210, 210, 210, 0.65))',
    '--wh40k-btn-bg': 'rgba(255, 255, 255, 0.4)',
    '--wh40k-btn-bg-hover': 'rgba(255, 255, 255, 0.6)',
    '--wh40k-accent-overlay': 'rgba(36, 107, 131, 0.12)',
    '--wh40k-accent-border': 'rgba(36, 107, 131, 0.25)',
};

const darkTheme = {
    '--wh40k-sheet-bg': 'rgba(30, 25, 22, 0.95)',
    '--wh40k-panel-bg': 'rgba(40, 35, 30, 0.7)',
    '--wh40k-panel-bg-solid': 'rgba(45, 40, 35, 0.9)',
    '--wh40k-panel-bg-translucent': 'rgba(50, 45, 40, 0.5)',
    '--wh40k-panel-body-bg': 'rgba(35, 30, 25, 0.6)',
    '--wh40k-input-bg': 'rgba(50, 45, 40, 0.8)',
    '--wh40k-input-bg-focus': 'rgba(60, 55, 48, 0.9)',
    '--wh40k-text-dark': '#e8dcc8',
    '--wh40k-text-medium': '#d4c8b4',
    '--wh40k-text-muted': '#a89880',
    '--wh40k-text-subtle': '#8a7a6a',
    '--wh40k-border-color': 'rgba(180, 140, 100, 0.4)',
    '--wh40k-border-color-light': 'rgba(180, 140, 100, 0.25)',
    '--wh40k-border-color-strong': 'rgba(212, 175, 55, 0.5)',
    '--wh40k-border-accent': 'rgba(180, 140, 100, 0.35)',
    '--wh40k-shadow-soft': 'rgba(0, 0, 0, 0.2)',
    '--wh40k-shadow-medium': 'rgba(0, 0, 0, 0.35)',
    '--wh40k-text-shadow': 'rgba(0, 0, 0, 0.6)',
    '--wh40k-hud-item-bg': 'rgba(60, 55, 48, 0.6)',
    '--wh40k-circle-bg': 'radial-gradient(circle at 30% 30%, rgba(70, 65, 58, 0.85), rgba(50, 45, 40, 0.75))',
    '--wh40k-btn-bg': 'rgba(60, 55, 48, 0.5)',
    '--wh40k-btn-bg-hover': 'rgba(80, 72, 62, 0.6)',
    '--wh40k-accent-overlay': 'rgba(212, 175, 55, 0.08)',
    '--wh40k-accent-border': 'rgba(212, 175, 55, 0.2)',
};

// Theme-invariant semantic tokens — same value in light and dark, applied to
// :root and both .theme-* selectors so any theme cascade still resolves them.
const semantic = {
    '--wh40k-wounds-primary': '#8b0000',
    '--wh40k-wounds-secondary': '#b63a2b',
    '--wh40k-wounds-bg': 'rgba(139, 0, 0, 0.08)',
    '--wh40k-wounds-border': 'rgba(139, 0, 0, 0.4)',
    '--wh40k-fate-primary': '#2563eb',
    '--wh40k-fate-bg': 'rgba(37, 99, 235, 0.08)',
    '--wh40k-fate-border': 'rgba(37, 99, 235, 0.4)',
    '--wh40k-corruption-primary': '#147058',
    '--wh40k-corruption-bg': 'rgba(20, 112, 88, 0.08)',
    '--wh40k-skills-primary': '#2a7a9a',
    '--wh40k-skills-secondary': '#3a9aba',
    '--wh40k-skills-bg': 'rgba(42, 122, 154, 0.08)',
    '--wh40k-skills-border': 'rgba(42, 122, 154, 0.4)',
    '--wh40k-combat-border': 'rgba(168, 32, 32, 0.4)',
    '--wh40k-talents-primary': '#a07818',
    '--wh40k-talents-bg': 'rgba(160, 120, 24, 0.08)',
    '--wh40k-talents-border': 'rgba(160, 120, 24, 0.4)',
    '--wh40k-traits-primary': '#6a2090',
    '--wh40k-traits-bg': 'rgba(106, 32, 144, 0.08)',
    '--wh40k-equipment-bg': 'rgba(58, 95, 95, 0.08)',
    '--wh40k-equipment-border': 'rgba(58, 95, 95, 0.4)',
    '--wh40k-powers-primary': '#6a2090',
    '--wh40k-powers-secondary': '#8a40b0',
    '--wh40k-powers-bg': 'rgba(106, 32, 144, 0.08)',
    '--wh40k-powers-border': 'rgba(106, 32, 144, 0.4)',
    '--wh40k-dynasty-primary': '#d4a520',
    '--wh40k-dynasty-bg': 'rgba(212, 165, 32, 0.08)',
    '--wh40k-bio-border': 'rgba(106, 90, 74, 0.3)',
    '--wh40k-success-primary': '#2d5a2d',
    '--wh40k-success-secondary': '#4ade80',
    '--wh40k-success-bg': 'rgba(45, 90, 45, 0.1)',
    '--wh40k-warning-primary': '#d97706',
    '--wh40k-warning-secondary': '#fbbf24',
    '--wh40k-warning-bg': 'rgba(217, 119, 6, 0.1)',
    '--wh40k-danger-primary': '#dc2626',
    '--wh40k-danger-secondary': '#ef4444',
    '--wh40k-danger-bg': 'rgba(220, 38, 38, 0.1)',
};

// Wrapped in `@layer wh40k-tokens` to bypass Tailwind v3's addBase rule-merging:
// without the layer wrapper, addBase silently DROPS the `body.theme-dark` rule
// because it shares property names with the earlier `:root, body.theme-light`
// rule. The merge isn't aware that the selectors are disjoint and the values
// differ — so dark-theme tokens (`--wh40k-panel-bg` etc.) never reach the
// output and every panel renders with the light-theme parchment background.
// Wrapping in any custom @layer (or @media) gives the rules a unique parent
// and addBase emits them verbatim. The native `@layer` cascade ordering is
// fine here because the only consumers of these vars are `var(--wh40k-*)`
// references — no specificity contest with other layers.
module.exports = {
    '@layer wh40k-tokens': {
        ':root': {
            ...palette,
            ...typography,
            ...layout,
        },
        ':root, body.theme-light': lightTheme,
        'body.theme-dark': darkTheme,
        ':root, body.theme-light, body.theme-dark': semantic,
    },
};
