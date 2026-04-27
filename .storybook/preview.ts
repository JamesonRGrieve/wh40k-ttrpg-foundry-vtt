import type { Preview } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../stories/template-support';

// Foundry's compiled stylesheet (foundry2.css) is served as a static asset and loaded
// via a <link> tag in preview-head.html — it cannot go through Vite's PostCSS pipeline
// because Tailwind interprets Foundry's native CSS @layer cascade directives as its own
// @layer directives and errors out. The system CSS does run through PostCSS so Tailwind
// utilities still get generated.
import '../src/css/wh40k-rpg.css';
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
