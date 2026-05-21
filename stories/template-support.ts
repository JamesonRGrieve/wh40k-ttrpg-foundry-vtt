import Handlebars from 'handlebars';
import enLang from '../src/lang/en.json';
import { ICON_REGISTRY } from '../src/module/icons/registry.generated.ts';

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
    Handlebars.registerHelper('isExpanded', () => false);
    Handlebars.registerHelper('hideIfNot', (check) => (check ? '' : new Handlebars.SafeString('style="display:none;"')));
    Handlebars.registerHelper('defaultVal', (value, fallback) => value || fallback);
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
        return args.reduce<number>((sum, value) => sum + Number(value ?? 0), 0);
    });
    Handlebars.registerHelper('multiply', (a: unknown, b: unknown) => Number(a ?? 0) * Number(b ?? 0));
    Handlebars.registerHelper('inc', (value: unknown) => Number(value) + 1);
    Handlebars.registerHelper('iff', (cond: unknown, ifTrue: unknown, ifFalse: unknown) => (cond ? ifTrue : ifFalse ?? ''));
    Handlebars.registerHelper('object', (options: { hash?: Record<string, unknown> }) => {
        return options.hash ?? {};
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
    Handlebars.registerHelper('arrayToObject', (array: unknown): Record<string, string> => {
        const obj: Record<string, string> = {};
        if (array === null || array === undefined) return obj;
        if (Array.isArray(array)) {
            for (const a of array) {
                const key = String(a);
                obj[key] = key;
            }
            return obj;
        }
        if (typeof array === 'object') {
            for (const key of Object.keys(array)) obj[key] = key;
            return obj;
        }
        return obj;
    });
    Handlebars.registerHelper('capitalize', (text: unknown): string => {
        const s = String(text ?? '');
        return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    });
    Handlebars.registerHelper('toLowerCase', (str: unknown): string => String(str ?? '').toLowerCase());
    Handlebars.registerHelper('removeMarkup', (text: unknown): string => String(text ?? '').replace(/<[^>]*>/g, ''));
    Handlebars.registerHelper('cleanFieldName', (text: unknown): string => String(text ?? '').replace(/[^a-zA-Z0-9]/g, ''));
    Handlebars.registerHelper('hideIf', (check: unknown) => (check ? new Handlebars.SafeString('style="display:none;"') : ''));
    Handlebars.registerHelper('arrayIncludes', (field: unknown, list: unknown): boolean => Array.isArray(list) && list.includes(field));
    Handlebars.registerHelper('includes', (list: unknown, value: unknown): boolean => Array.isArray(list) && list.includes(value));
    Handlebars.registerHelper('option', (option: unknown, current: unknown, name: unknown): string => {
        const v = String(option ?? '');
        const label = name !== undefined ? String(name) : v;
        const selected = current === option ? ' selected' : '';
        return `<option value="${Handlebars.escapeExpression(v)}"${selected}>${Handlebars.escapeExpression(label)}</option>`;
    });
    Handlebars.registerHelper('slice', (arr: unknown, start: unknown, end: unknown) => {
        if (!Array.isArray(arr)) return [];
        return arr.slice(Number(start ?? 0), end === undefined ? undefined : Number(end));
    });
    Handlebars.registerHelper('range', (start: unknown, end: unknown) => {
        const s = Number(start ?? 0);
        const e = Number(end ?? 0);
        const result: number[] = [];
        if (e < s) return result;
        for (let i = s; i <= e; i++) result.push(i);
        return result;
    });
    Handlebars.registerHelper('times', function timesHelper(this: unknown, count: unknown, options: { fn: (ctx: number) => string }): string {
        const n = Number(count ?? 0);
        let out = '';
        for (let i = 0; i < n; i++) out += options.fn(i);
        return out;
    });
    // NB: cannot register a helper named `percent` here — many templates use
    // `{{percent}}` as a plain context variable (e.g. vital-progress-bar.hbs)
    // and a same-named helper shadows the lookup, returning 0. Use a distinct
    // identifier for the helper version if/when needed.
    Handlebars.registerHelper('inversePercent', (value: unknown, max: unknown): number => {
        const v = Number(value ?? 0);
        const m = Number(max ?? 0);
        return m > 0 ? Math.max(0, 100 - Math.round((v / m) * 100)) : 0;
    });
    Handlebars.registerHelper('colorCode', (positive: unknown, negative: unknown): string => {
        return positive ? 'positive' : negative ? 'negative' : 'neutral';
    });
    Handlebars.registerHelper('isError', (value: unknown): boolean => value === 'error' || value === false);
    Handlebars.registerHelper('isSuccess', (value: unknown): boolean => value === 'success' || value === true);
    Handlebars.registerHelper('themeClassFor', (role: unknown): string => {
        return typeof role === 'string' ? `wh40k-theme-${role}` : '';
    });
    Handlebars.registerHelper('select', function selectHelper(this: unknown, selected: unknown, options: { fn: (ctx: unknown) => string }): string {
        const html = options.fn(this);
        const target = typeof selected === 'string' || typeof selected === 'number' || typeof selected === 'boolean' ? String(selected) : '';
        return html.replace(/<option([^>]*?)value=(["'])(.*?)\2([^>]*)>/g, (_match, before: string, q: string, value: string, after: string) => {
            const alreadySelected = /\bselected\b/.test(before) || /\bselected\b/.test(after);
            const isMatch = value === target;
            const tail = alreadySelected || !isMatch ? '' : ' selected';
            return `<option${before}value=${q}${value}${q}${after}${tail}>`;
        });
    });
    Handlebars.registerHelper('any', (list: unknown, prop: unknown) => {
        if (!Array.isArray(list) || typeof prop !== 'string' || prop === '') return false;
        return list.some((item) => item !== null && typeof item === 'object' && Boolean((item as Record<string, unknown>)[prop]));
    });
    Handlebars.registerHelper('countType', (list: unknown, prop: unknown) => {
        if (!Array.isArray(list) || typeof prop !== 'string' || prop === '') return 0;
        return list.filter((item) => item !== null && typeof item === 'object' && Boolean((item as Record<string, unknown>)[prop])).length;
    });
    Handlebars.registerHelper('hash', function hashHelper(this: unknown, options?: { hash?: Record<string, unknown> }) {
        return options?.hash ?? {};
    });
    Handlebars.registerHelper('specialDisplay', (special: unknown): string => {
        if (special === null || special === undefined || special === '') return '';
        if (Array.isArray(special)) {
            return special
                .map((q) => {
                    if (typeof q === 'string') return q;
                    if (q !== null && typeof q === 'object') {
                        const obj = q as Record<string, unknown>;
                        const name = String(obj.name ?? obj.label ?? '');
                        const value = obj.value;
                        return value !== undefined && value !== null && value !== '' ? `${name} (${String(value)})` : name;
                    }
                    return String(q);
                })
                .filter((s) => s !== '')
                .join(', ');
        }
        return String(special);
    });
    Handlebars.registerHelper('armourDisplay', (armour: unknown): string => {
        if (armour === null || armour === undefined || typeof armour !== 'object') return '0';
        const a = armour as Record<string, unknown>;
        const num = (v: unknown): number => Number(v ?? 0);
        const body = num(a['body']);
        const locations = ['body', 'head', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'] as const;
        const same = locations.every((loc) => num(a[loc]) === body);
        return same ? String(body) : locations.map((loc) => num(a[loc])).join('/');
    });
    Handlebars.registerHelper('armourLocation', (armour: unknown, location: unknown): number => {
        if (armour === null || armour === undefined || typeof armour !== 'object' || typeof location !== 'string') return 0;
        return Number((armour as Record<string, unknown>)[location] ?? 0);
    });
    Handlebars.registerHelper('displayStrength', (strength: unknown): string => {
        const n = Number(strength ?? 0);
        return n > 0 ? String(n) : '-';
    });
    Handlebars.registerHelper('displayCrit', (crit: unknown): string => {
        const n = Number(crit ?? 0);
        return n > 0 ? `${n}+` : '-';
    });
    Handlebars.registerHelper('selectOptions', (options: unknown, helperOptions?: { hash?: Record<string, unknown> }) => {
        const hash = helperOptions?.hash ?? {};
        const selected = hash.selected;
        const labelAttr = typeof hash.labelAttr === 'string' ? hash.labelAttr : null;
        const normalized = normalizeSelectOptions(options).map((option) => {
            if (!labelAttr) return option;
            const sourceValue = Array.isArray(options)
                ? options.find((entry) => String((entry as Record<string, unknown>).value ?? entry) === option.value)
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
            `<div class="${classes.join(' ')}" data-editor-target="${Handlebars.escapeExpression(String(target ?? ''))}">${String(value ?? '')}</div>`,
        );
    });
    Handlebars.registerHelper('localize', (key: string, options?: { hash?: Record<string, unknown> }) => {
        const resolved = lookupLocalization(key, enLang);
        if (resolved === null) return key;
        if (options?.hash && Object.keys(options.hash).length > 0) {
            return applySubstitutions(resolved, options.hash);
        }
        return resolved;
    });
    Handlebars.registerHelper('format', (key: string, options?: { hash?: Record<string, unknown> }) => {
        const resolved = lookupLocalization(key, enLang);
        const template = resolved ?? key;
        return applySubstitutions(template, options?.hash ?? {});
    });

    const partials = (import.meta as unknown as { glob: (pattern: string, opts: Record<string, unknown>) => Record<string, string> }).glob(
        '../src/templates/**/*.hbs',
        {
            query: '?raw',
            import: 'default',
            eager: true,
        },
    );

    for (const [path, source] of Object.entries(partials)) {
        const idx = path.indexOf(SOURCE_ROOT);
        if (idx === -1) continue;
        const relative = path.slice(idx + SOURCE_ROOT.length);
        Handlebars.registerPartial(`${TEMPLATE_PREFIX}${relative}`, source);
        // Foundry's renderTemplate accepts paths without .hbs; many templates
        // (e.g. corruption-panel, insanity-panel) `{{> ... }}` partials by
        // bare path. Register that alias too.
        if (relative.endsWith('.hbs')) {
            const noExt = relative.slice(0, -4);
            Handlebars.registerPartial(`${TEMPLATE_PREFIX}${noExt}`, source);
        }
    }

    // Register the {{icon}} helper using the same registry the runtime uses.
    // We don't import src/module/icons/helper.ts directly because it touches
    // the global Handlebars (Foundry-style) and not the bundled storybook copy.
    Handlebars.registerHelper('iconSvg', function iconStoryHelper(key: unknown, options: { hash?: Record<string, unknown> }) {
        if (typeof key !== 'string' || !Object.hasOwn(ICON_REGISTRY, key)) {
            return new Handlebars.SafeString('');
        }
        const hash = options.hash ?? {};
        const svg = ICON_REGISTRY[key];
        const klass = typeof hash.class === 'string' ? hash.class : '';
        const label = typeof hash.label === 'string' ? hash.label : '';
        const labelAttrs = label ? `role="img" aria-label="${String(label).replace(/"/g, '&quot;')}"` : `aria-hidden="true" focusable="false"`;
        const sizeRaw = hash.size;
        const size = typeof sizeRaw === 'number' ? `${sizeRaw}px` : typeof sizeRaw === 'string' ? sizeRaw : '';
        const sizeAttr = size ? ` style="width:${size};height:${size};"` : '';
        const classes = ['wh40k-icon', `wh40k-icon--${key.replace(':', '-')}`];
        if (klass) classes.push(klass);
        const out = svg.replace(/^<svg([^>]*)>/, `<svg$1 class="${classes.join(' ')}" ${labelAttrs}${sizeAttr}>`);
        return new Handlebars.SafeString(out);
    });

    globalState[INIT_KEY] = true;
    return Handlebars;
}
