import { mergeConfig } from 'vite';
import type { StorybookConfig } from '@storybook/html-vite';
import postcssImport from 'postcss-import';
import postcssNested from 'postcss-nested';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const config: StorybookConfig = {
    stories: ['../stories/**/*.mdx', '../stories/**/*.stories.@(js|ts)'],
    framework: {
        name: '@storybook/html-vite',
        options: {},
    },
    async viteFinal(viteConfig) {
        return mergeConfig(viteConfig, {
            css: {
                postcss: {
                    plugins: [postcssImport(), postcssNested(), tailwindcss(), autoprefixer()],
                },
            },
            assetsInclude: ['**/*.hbs'],
        });
    },
};

export default config;
