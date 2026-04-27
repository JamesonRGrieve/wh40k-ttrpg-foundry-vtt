import { mergeConfig } from 'vite';
import type { StorybookConfig } from '@storybook/html-vite';
import postcssNested from 'postcss-nested';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

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
    // Mirror Foundry's deployed asset roots: anything Foundry serves at /, /icons, /ui,
    // /fonts, /scripts, /lang, etc. resolves to the pulled .foundry-release/public/ tree
    // so direct asset URLs in templates (e.g. <img src="/icons/svg/...">) work in stories.
    // Run pull-foundry.sh first to populate this tree.
    staticDirs: [{ from: '../.foundry-release/public', to: '/' }],
    framework: {
        name: '@storybook/html-vite',
        options: {},
    },
    async viteFinal(viteConfig) {
        return mergeConfig(viteConfig, {
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
