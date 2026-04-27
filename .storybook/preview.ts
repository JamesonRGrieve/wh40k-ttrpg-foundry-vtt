import type { Preview } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import '../src/css/wh40k-rpg.css';

Handlebars.registerHelper('join', (arr: unknown, sep: string) => {
    if (!Array.isArray(arr)) return '';
    return arr.join(typeof sep === 'string' ? sep : ', ');
});

Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
Handlebars.registerHelper('gt', (a: number, b: number) => Number(a) > Number(b));
Handlebars.registerHelper('lt', (a: number, b: number) => Number(a) < Number(b));
Handlebars.registerHelper('gte', (a: number, b: number) => Number(a) >= Number(b));
Handlebars.registerHelper('lte', (a: number, b: number) => Number(a) <= Number(b));
Handlebars.registerHelper('divide', (a: number, b: number) => {
    const denom = Number(b);
    return denom === 0 ? 0 : Number(a) / denom;
});
Handlebars.registerHelper('concat', (...args: unknown[]) => {
    args.pop();
    return args.join('');
});
Handlebars.registerHelper('localize', (key: string) => key);

const TEMPLATE_PREFIX = 'systems/wh40k-rpg/templates/';
const SOURCE_ROOT = '../src/templates/';

const partials = import.meta.glob('../src/templates/**/*.hbs', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

for (const [path, source] of Object.entries(partials)) {
    const idx = path.indexOf(SOURCE_ROOT);
    if (idx === -1) continue;
    const relative = path.slice(idx + SOURCE_ROOT.length);
    Handlebars.registerPartial(`${TEMPLATE_PREFIX}${relative}`, source);
}

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
