import Handlebars from 'handlebars';
import enLang from '../src/lang/en.json';

const TEMPLATE_PREFIX = 'systems/wh40k-rpg/templates/';
const SOURCE_ROOT = '../src/templates/';
const INIT_KEY = '__wh40kStoryHandlebarsInitialized';

type LocalizationDict = Record<string, unknown>;

function lookupLocalization(key: string, dict: LocalizationDict): string | null {
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

function asArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (value instanceof Set) return Array.from(value);
    if (value && typeof value === 'object' && Array.isArray((value as { values?: unknown[] }).values)) {
        return (value as { values: unknown[] }).values;
    }
    return [];
}

function normalizeSelectOptions(options: unknown): Array<{ value: string; label: string }> {
    if (Array.isArray(options)) {
        return options.map((entry) => {
            if (typeof entry === 'string' || typeof entry === 'number') {
                return { value: String(entry), label: String(entry) };
            }
            const record = entry as Record<string, unknown>;
            return {
                value: String(record.value ?? record.id ?? record.key ?? ''),
                label: String(record.label ?? record.name ?? record.value ?? record.id ?? ''),
            };
        });
    }

    if (!options || typeof options !== 'object') return [];

    return Object.entries(options as Record<string, unknown>).map(([key, value]) => {
        if (value && typeof value === 'object') {
            const record = value as Record<string, unknown>;
            return {
                value: key,
                label: String(record.label ?? record.name ?? key),
            };
        }

        return { value: key, label: String(value) };
    });
}

function buildOptionTag(option: { value: string; label: string }, selected: unknown, extraAttributes: Record<string, unknown>): string {
    const attrs = Object.entries(extraAttributes)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => ` ${key}="${Handlebars.escapeExpression(String(value))}"`)
        .join('');
    const isSelected = Array.isArray(selected) ? selected.includes(option.value) : selected === option.value;
    const selectedAttr = isSelected ? ' selected' : '';
    return `<option value="${Handlebars.escapeExpression(option.value)}"${selectedAttr}${attrs}>${Handlebars.escapeExpression(option.label)}</option>`;
}

export function initializeStoryHandlebars(): typeof Handlebars {
    const globalState = globalThis as typeof globalThis & { [INIT_KEY]?: boolean };
    if (globalState[INIT_KEY]) return Handlebars;

    Handlebars.registerHelper('join', (arr: unknown, sep: string) => asArray(arr).join(typeof sep === 'string' ? sep : ', '));
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    Handlebars.registerHelper('ne', (a: unknown, b: unknown) => a !== b);
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
    Handlebars.registerHelper('and', (...args: unknown[]) => {
        args.pop();
        return args.every(Boolean);
    });
    Handlebars.registerHelper('or', (...args: unknown[]) => {
        args.pop();
        return args.find(Boolean) ?? args[args.length - 1] ?? '';
    });
    Handlebars.registerHelper('add', (...args: unknown[]) => {
        args.pop();
        return args.reduce((sum, value) => sum + Number(value ?? 0), 0);
    });
    Handlebars.registerHelper('multiply', (a: unknown, b: unknown) => Number(a ?? 0) * Number(b ?? 0));
    Handlebars.registerHelper('inc', (value: unknown) => Number(value) + 1);
    Handlebars.registerHelper('iff', (cond: unknown, ifTrue: unknown, ifFalse: unknown) => (cond ? ifTrue : (ifFalse ?? '')));
    Handlebars.registerHelper('object', function (options: { hash?: Record<string, unknown> }) {
        return options?.hash ?? {};
    });
    Handlebars.registerHelper('array', (...args: unknown[]) => args.slice(0, -1));
    Handlebars.registerHelper('checked', (value: unknown) => (value ? 'checked' : ''));
    Handlebars.registerHelper('signedNumber', (value: unknown) => {
        const num = Number(value ?? 0);
        if (num > 0) return `+${num}`;
        if (num === 0) return '0';
        return String(num);
    });
    Handlebars.registerHelper('truncate', (value: unknown, length: unknown) => {
        const text = String(value ?? '');
        const limit = Number(length ?? 0);
        if (!Number.isFinite(limit) || limit <= 0 || text.length <= limit) return text;
        return `${text.slice(0, limit).trimEnd()}...`;
    });
    Handlebars.registerHelper('setToArray', (value: unknown) => asArray(value));
    Handlebars.registerHelper('specialQualities', (value: unknown) => asArray(value));
    Handlebars.registerHelper('selectOptions', (options: unknown, helperOptions?: { hash?: Record<string, unknown> }) => {
        const hash = helperOptions?.hash ?? {};
        const selected = hash.selected;
        const labelAttr = typeof hash.labelAttr === 'string' ? hash.labelAttr : null;
        const normalized = normalizeSelectOptions(options).map((option) => {
            if (!labelAttr) return option;
            const sourceValue = Array.isArray(options)
                ? options.find((entry) => String((entry as Record<string, unknown>)?.value ?? entry) === option.value)
                : null;
            if (sourceValue && typeof sourceValue === 'object') {
                const label = (sourceValue as Record<string, unknown>)[labelAttr];
                if (label !== undefined) return { ...option, label: String(label) };
            }
            return option;
        });

        const html = normalized
            .map((option) =>
                buildOptionTag(option, selected, {
                    disabled: hash.disabled ? 'disabled' : '',
                }),
            )
            .join('');

        return new Handlebars.SafeString(html);
    });
    Handlebars.registerHelper('editor', (value: unknown, options?: { hash?: Record<string, unknown> }) => {
        const target = options?.hash?.target;
        const classes = ['wh40k-story-editor'];
        if (options?.hash?.button) classes.push('wh40k-story-editor--button');
        return new Handlebars.SafeString(
            `<div class="${classes.join(' ')}" data-editor-target="${Handlebars.escapeExpression(String(target ?? ''))}">${value ?? ''}</div>`,
        );
    });
    Handlebars.registerHelper('localize', (key: string, options?: { hash?: Record<string, unknown> }) => {
        const resolved = lookupLocalization(key, enLang as LocalizationDict);
        if (resolved === null) return key;
        if (options?.hash && Object.keys(options.hash).length > 0) {
            return applySubstitutions(resolved, options.hash);
        }
        return resolved;
    });
    Handlebars.registerHelper('format', (key: string, options?: { hash?: Record<string, unknown> }) => {
        const resolved = lookupLocalization(key, enLang as LocalizationDict);
        const template = resolved ?? key;
        return applySubstitutions(template, options?.hash ?? {});
    });

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

    globalState[INIT_KEY] = true;
    return Handlebars;
}
