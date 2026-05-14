import type { Preview } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../stories/template-support';

// Storybook chrome CSS — REPLACEMENT for Foundry's `foundry2.css`. The chrome
// stylesheet authors `@apply` directives against a dedicated Tailwind profile
// (`tailwind.storybook.config.js`) so the deployable Storybook bundle ships
// ZERO Foundry-origin assets. The main app stylesheet still loads alongside
// it (utilities, design tokens, legacy component classes) — both pass through
// PostCSS but with isolated Tailwind configs, see `.storybook/main.ts` for
// the per-file plugin that handles the chrome compile.
import '../stories/css/foundry-chrome.css';
import '../src/css/entry.css';
initializeStoryHandlebars();

const preview: Preview = {
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
    },
};

export default preview;
