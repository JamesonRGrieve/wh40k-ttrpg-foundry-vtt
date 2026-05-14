import { mergeConfig, type Plugin } from 'vite';
import type { StorybookConfig } from '@storybook/html-vite';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// ESM `__dirname` shim — Storybook loads `main.ts` as an ES module.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import postcss from 'postcss';
import postcssNested from 'postcss-nested';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Absolute paths for the Storybook-specific Tailwind profile + chrome stylesheet.
// The chrome stylesheet replaces Foundry's `foundry2.css` (which we are no longer
// allowed to redistribute). It is compiled here with its OWN Tailwind config so
// the main app's `tw-` prefix and `.wh40k-rpg` important scope don't interfere.
const STORY_CHROME_CSS = path.resolve(__dirname, '../stories/css/foundry-chrome.css');
const STORY_TAILWIND_CONFIG = path.resolve(__dirname, '../tailwind.storybook.config.js');

/**
 * Vite plugin that intercepts imports of `stories/css/foundry-chrome.css` and
 * compiles them through a dedicated PostCSS pipeline using
 * `tailwind.storybook.config.js`. Every other CSS file (including the main
 * `src/css/entry.css`) continues to flow through Vite's normal PostCSS step
 * configured below, which uses the main `tailwind.config.js` automatically.
 *
 * This isolation matters: the main app's Tailwind config uses
 * `prefix: 'tw-'` and `important: '.wh40k-rpg'`, both of which would break
 * the chrome stylesheet's `@apply bg-... text-...` directives. Running a
 * second Tailwind pass via a per-file plugin keeps both configs pure.
 */
function storyChromeCssPlugin(): Plugin {
    return {
        name: 'wh40k-story-chrome-css',
        enforce: 'pre',
        async load(id) {
            // `id` may carry a `?import` / `?inline` suffix; strip it before comparing.
            const cleanId = id.split('?')[0];
            if (cleanId !== STORY_CHROME_CSS) return null;
            const css = await fs.readFile(STORY_CHROME_CSS, 'utf8');
            const result = await postcss([
                postcssNested(),
                tailwindcss({ config: STORY_TAILWIND_CONFIG }),
                autoprefixer(),
            ]).process(css, { from: STORY_CHROME_CSS, to: STORY_CHROME_CSS });
            // Return compiled CSS as a CSS module that Vite will inject as a <style>.
            // Wrapping in a default-exported empty string keeps the ESM shape Vite
            // expects from a `.css` module while letting `import '…/foundry-chrome.css'`
            // trigger the side-effect of style injection.
            return {
                code: result.css,
                map: result.map ? result.map.toString() : null,
            };
        },
    };
}

const config: StorybookConfig = {
    // Discover stories from both the top-level `stories/` directory (the
    // historical convention) and co-located `*.stories.ts` siblings under
    // `src/module/applications/` (the symmetry-coverage convention — every
    // sheet/dialog gets a sibling story so renames keep them in lock-step).
    stories: [
        '../stories/**/*.mdx',
        '../stories/**/*.stories.@(js|ts)',
        '../src/module/**/*.stories.@(js|ts)',
    ],
    // Foundry's compiled `foundry2.css`, `mce.css`, and the rest of
    // `.foundry-release/public/` are NOT bundled. The Storybook deployment
    // ships chrome styling that this repo authors itself (see
    // `stories/css/foundry-chrome.css` and `tailwind.storybook.config.js`).
    // Icons referenced as `/icons/...` URLs are not resolved by the Storybook
    // bundle — they fall back to broken-image alt text. Stories that need a
    // visible icon should use the registered icon helper which renders the
    // bundled inline SVG, not a Foundry-served URL.
    staticDirs: [],
    addons: ['@storybook/addon-a11y'],
    framework: {
        name: '@storybook/html-vite',
        options: {},
    },
    async viteFinal(viteConfig) {
        return mergeConfig(viteConfig, {
            plugins: [storyChromeCssPlugin()],
            css: {
                postcss: {
                    plugins: [postcssNested(), tailwindcss(), autoprefixer()],
                },
            },
            assetsInclude: ['**/*.hbs'],
        });
    },
};

export default config;
