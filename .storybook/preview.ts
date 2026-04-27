import type { Preview } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import enLang from '../src/lang/en.json';

// Foundry's compiled stylesheet (foundry2.css) is served as a static asset and loaded
// via a <link> tag in preview-head.html — it cannot go through Vite's PostCSS pipeline
// because Tailwind interprets Foundry's native CSS @layer cascade directives as its own
// @layer directives and errors out. The system CSS does run through PostCSS so Tailwind
// utilities still get generated.
import '../src/css/wh40k-rpg.css';

function lookupLocalization(key: string, dict: Record<string, unknown>): string | null {
    const segments = key.split('.');
    let cursor: unknown = dict;
    for (const segment of segments) {
        if (cursor && typeof cursor === 'object' && segment in cursor) {
            cursor = (cursor as Record<string, unknown>)[segment];
        } else {
            return null;
        }
    }
    return typeof cursor === 'string' ? cursor : null;
}

function applySubstitutions(value: string, data: Record<string, unknown>): string {
    return value.replace(/\{(\w+)\}/g, (_, name) => {
        const replacement = data[name];
        return replacement === undefined || replacement === null ? '' : String(replacement);
    });
}

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
Handlebars.registerHelper('localize', (key: string, options?: { hash?: Record<string, unknown> }) => {
    const resolved = lookupLocalization(key, enLang as Record<string, unknown>);
    if (resolved === null) return key;
    if (options?.hash && Object.keys(options.hash).length > 0) {
        return applySubstitutions(resolved, options.hash);
    }
    return resolved;
});
Handlebars.registerHelper('format', (key: string, options?: { hash?: Record<string, unknown> }) => {
    const resolved = lookupLocalization(key, enLang as Record<string, unknown>);
    const template = resolved ?? key;
    return applySubstitutions(template, options?.hash ?? {});
});

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
