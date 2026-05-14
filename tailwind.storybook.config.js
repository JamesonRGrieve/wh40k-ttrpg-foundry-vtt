/**
 * Storybook-specific Tailwind profile.
 *
 * This config powers ONLY the synthetic "Foundry chrome" stylesheet loaded by
 * Storybook (`stories/css/foundry-chrome.css`). It deliberately diverges from
 * the main `tailwind.config.js` in three ways:
 *
 *   1. No `prefix` — chrome CSS uses `@apply bg-... text-...` directly so
 *      authored utility names match standard Tailwind documentation. The
 *      main-app `tw-` prefix is irrelevant here because no application code
 *      consumes these classes; only the chrome CSS does, at build time.
 *
 *   2. No `important` scope — `tailwind.config.js` scopes utilities under
 *      `.wh40k-rpg` to avoid clobbering Foundry's defaults. The chrome CSS
 *      this profile compiles is what we WANT to clobber the unstyled
 *      Storybook page with, so we leave it unscoped.
 *
 *   3. Hand-picked palette — values below are NOT transcribed from Foundry's
 *      `foundry2.css`. They are an Imperial-flavored stone/amber palette
 *      authored for this project, picked from Tailwind's default ladder
 *      (`stone-*`, `amber-*`, `zinc-*`) plus a small number of accent tones.
 *      The visual goal is "looks like a thematic 40K dark sheet"; the
 *      authored source is utility composition, not copied declarations.
 *
 * Output of `pnpm build-storybook` must contain ZERO references to
 * `foundry2.css`, `foundry.mjs`, or any other Foundry-distributed asset.
 *
 * Content globs include both `stories/css/foundry-chrome.css` (so Tailwind
 * sees `@apply` directives) and the templates/stories tree (so any bare
 * utilities a story or template uses without the `tw-` prefix still emit).
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
    content: [
        './stories/css/foundry-chrome.css',
        './stories/**/*.{ts,js,hbs}',
        './src/templates/**/*.hbs',
        './src/module/**/*.stories.{ts,js}',
    ],
    // Preflight is disabled so the chrome stylesheet doesn't double-reset
    // anything the main `src/css/entry.css` already handles (it ships
    // alongside this one in Storybook's preview bundle).
    corePlugins: { preflight: false },
    theme: {
        extend: {
            colors: {
                // Imperial / Adeptus palette — locally authored, not transcribed.
                'chrome-bg': '#1c1917',           // stone-900 baseline
                'chrome-bg-elev': '#292524',      // stone-800 raised surface
                'chrome-bg-input': '#0c0a09',     // stone-950 sunken
                'chrome-border': '#78350f',       // amber-900 frame
                'chrome-border-strong': '#b45309', // amber-700 active frame
                'chrome-text': '#e7e5e4',         // stone-200 body text
                'chrome-text-muted': '#a8a29e',   // stone-400 secondary
                'chrome-accent': '#d4af37',       // imperial gold accent
                'chrome-accent-dim': '#8b7015',   // gold dimmed
            },
            fontFamily: {
                'chrome-display': ['Cinzel', 'serif'],
                'chrome-body': ['Lusitana', 'serif'],
                'chrome-ui': ['Roboto', 'sans-serif'],
            },
            borderRadius: {
                'chrome-sm': '2px',
                'chrome-md': '4px',
                'chrome-lg': '8px',
            },
        },
    },
    plugins: [],
};
