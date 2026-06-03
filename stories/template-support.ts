import HandlebarsLib from 'handlebars';
import enLang from '../src/lang/en.json';
import { ICON_REGISTRY } from '../src/module/icons/registry.generated.ts';

const TEMPLATE_PREFIX = 'systems/wh40k-rpg/templates/';
const SOURCE_ROOT = '../src/templates/';
const INIT_KEY = '__wh40kStoryHandlebarsInitialized';

/**
 * An arbitrary value handed to a Handlebars helper by template authors. This is
 * the genuine boundary type for this bridge: helpers receive whatever the
 * template passes, with no schema. It is `unknown` on purpose — every consumer
 * narrows it via the type-guards below before use.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars helpers receive arbitrary template-author values with no schema; this alias is the single boundary point and every consumer narrows it via the type-guards below.
type HbsValue = unknown;

/** A string-keyed object, the narrowed shape of an `HbsValue` that passes `asRecord`. */
type HbsRecord = { [key: string]: HbsValue };

/** Narrow an arbitrary Handlebars value to a string-keyed object, or null. */
function asRecord(value: HbsValue): HbsRecord | null {
    return value !== null && typeof value === 'object' ? (value as HbsRecord) : null;
}

/** Read a string-keyed property off an arbitrary Handlebars value, or undefined. */
function getProp(value: HbsValue, key: string): HbsValue {
    const record = asRecord(value);
    return record === null ? undefined : record[key];
}

type LocalizationDict = HbsRecord;

/**
 * Vite's `import.meta.glob` surface. Vite injects this at build time; fvtt-types
 * does not model it, so this is the narrow boundary shape for the eager raw glob
 * used to register partials (returns a path → source-string map).
 */
interface ViteImportMeta {
    glob: (pattern: string, opts: { query: '?raw'; import: 'default'; eager: true }) => Record<string, string>;
}

/** Safely convert an unknown value to string, returning '' for objects/functions. */
function unknownToStr(value: HbsValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'number') return String(value);
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'string') return value;
    return '';
}

function lookupLocalization(key: string, dict: LocalizationDict): string | null {
    const segments = key.split('.');
    let cursor: HbsValue = dict;
    for (const segment of segments) {
        const record = asRecord(cursor);
        if (record !== null && segment in record) {
            cursor = record[segment];
        } else {
            return null;
        }
    }
    return typeof cursor === 'string' ? cursor : null;
}

function applySubstitutions(value: string, data: HbsRecord): string {
    return value.replace(/\{(\w+)\}/g, (_match: string, name: string) => {
        return unknownToStr(data[name]);
    });
}

function asArray(value: HbsValue): HbsValue[] {
    if (Array.isArray(value)) return value;
    if (value instanceof Set) return Array.from(value) as HbsValue[];
    const record = asRecord(value);
    if (record !== null && Array.isArray(record['values'])) {
        return record['values'];
    }
    return [];
}

function normalizeSelectOptions(options: HbsValue): Array<{ value: string; label: string }> {
    if (Array.isArray(options)) {
        return options.map((entry: HbsValue) => {
            if (typeof entry === 'string' || typeof entry === 'number') {
                return { value: String(entry), label: String(entry) };
            }
            const record = asRecord(entry);
            if (record === null) return { value: '', label: '' };
            return {
                value: unknownToStr(record['value'] ?? record['id'] ?? record['key'] ?? ''),
                label: unknownToStr(record['label'] ?? record['name'] ?? record['value'] ?? record['id'] ?? ''),
            };
        });
    }

    const optionsRecord = asRecord(options);
    if (optionsRecord === null) return [];

    return Object.entries(optionsRecord).map(([key, value]) => {
        const record = asRecord(value);
        if (record !== null) {
            return {
                value: key,
                label: unknownToStr(record['label'] ?? record['name'] ?? key),
            };
        }

        return { value: key, label: unknownToStr(value) };
    });
}

function buildOptionTag(option: { value: string; label: string }, selected: HbsValue, extraAttributes: HbsRecord): string {
    const attrs = Object.entries(extraAttributes)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => ` ${key}="${HandlebarsLib.escapeExpression(String(value))}"`)
        .join('');
    const isSelected = Array.isArray(selected) ? selected.includes(option.value) : selected === option.value;
    const selectedAttr = isSelected ? ' selected' : '';
    return `<option value="${HandlebarsLib.escapeExpression(option.value)}"${selectedAttr}${attrs}>${HandlebarsLib.escapeExpression(option.label)}</option>`;
}

export function initializeStoryHandlebars(): typeof HandlebarsLib {
    const globalState = globalThis as typeof globalThis & { [INIT_KEY]?: boolean };
    if (globalState[INIT_KEY] === true) return HandlebarsLib;

    HandlebarsLib.registerHelper('join', (arr: HbsValue, sep: string) => asArray(arr).join(typeof sep === 'string' ? sep : ', '));
    HandlebarsLib.registerHelper('inputSize', (value: HbsValue, min: HbsValue) => {
        const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
        const floor = Number(min);
        return Math.max(text.length, Number.isFinite(floor) ? floor : 0, 2);
    });
    HandlebarsLib.registerHelper('eq', (a: HbsValue, b: HbsValue) => a === b);
    HandlebarsLib.registerHelper('ne', (a: HbsValue, b: HbsValue) => a !== b);
    HandlebarsLib.registerHelper('gt', (a: number, b: number) => Number(a) > Number(b));
    HandlebarsLib.registerHelper('lt', (a: number, b: number) => Number(a) < Number(b));
    HandlebarsLib.registerHelper('gte', (a: number, b: number) => Number(a) >= Number(b));
    HandlebarsLib.registerHelper('lte', (a: number, b: number) => Number(a) <= Number(b));
    HandlebarsLib.registerHelper('divide', (a: number, b: number) => {
        const denom = Number(b);
        return denom === 0 ? 0 : Number(a) / denom;
    });
    HandlebarsLib.registerHelper('concat', (...args: HbsValue[]) => {
        args.pop();
        return args.join('');
    });
    HandlebarsLib.registerHelper('isExpanded', () => false);
    HandlebarsLib.registerHelper('hideIfNot', (check: HbsValue) => {
        const b = Boolean(check);
        return b ? '' : new HandlebarsLib.SafeString('style="display:none;"');
    });
    HandlebarsLib.registerHelper('defaultVal', (value: HbsValue, fallback: HbsValue) => (value != null && value !== false && value !== '' ? value : fallback));
    HandlebarsLib.registerHelper('and', (...args: HbsValue[]) => {
        args.pop();
        return args.every(Boolean);
    });
    HandlebarsLib.registerHelper('or', (...args: HbsValue[]) => {
        args.pop();
        return args.find(Boolean) ?? args[args.length - 1] ?? '';
    });
    HandlebarsLib.registerHelper('add', (...args: HbsValue[]) => {
        args.pop();
        return args.reduce<number>((sum, value) => sum + Number(value ?? 0), 0);
    });
    HandlebarsLib.registerHelper('multiply', (a: HbsValue, b: HbsValue) => Number(a ?? 0) * Number(b ?? 0));
    HandlebarsLib.registerHelper('inc', (value: HbsValue) => Number(value) + 1);
    HandlebarsLib.registerHelper('iff', (cond: HbsValue, ifTrue: HbsValue, ifFalse: HbsValue) => {
        const b = Boolean(cond);
        return b ? ifTrue : ifFalse ?? '';
    });
    HandlebarsLib.registerHelper('object', (options: { hash?: HbsRecord }) => {
        return options.hash ?? {};
    });
    HandlebarsLib.registerHelper('array', (...args: HbsValue[]) => args.slice(0, -1));
    HandlebarsLib.registerHelper('checked', (value: HbsValue) => {
        const b = Boolean(value);
        return b ? 'checked' : '';
    });
    HandlebarsLib.registerHelper('signedNumber', (value: HbsValue) => {
        const num = Number(value ?? 0);
        if (num > 0) return `+${num}`;
        if (num === 0) return '0';
        return String(num);
    });
    HandlebarsLib.registerHelper('truncate', (value: HbsValue, length: HbsValue) => {
        const text = unknownToStr(value ?? '');
        const limit = Number(length ?? 0);
        if (!Number.isFinite(limit) || limit <= 0 || text.length <= limit) return text;
        return `${text.slice(0, limit).trimEnd()}...`;
    });
    HandlebarsLib.registerHelper('setToArray', (value: HbsValue) => asArray(value));
    HandlebarsLib.registerHelper('specialQualities', (value: HbsValue) => asArray(value));
    HandlebarsLib.registerHelper('arrayToObject', (array: HbsValue): Record<string, string> => {
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
    HandlebarsLib.registerHelper('capitalize', (text: HbsValue): string => {
        const s = unknownToStr(text ?? '');
        return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    });
    HandlebarsLib.registerHelper('toLowerCase', (str: HbsValue): string => unknownToStr(str ?? '').toLowerCase());
    HandlebarsLib.registerHelper('removeMarkup', (text: HbsValue): string => unknownToStr(text ?? '').replace(/<[^>]*>/g, ''));
    HandlebarsLib.registerHelper('cleanFieldName', (text: HbsValue): string => unknownToStr(text ?? '').replace(/[^a-zA-Z0-9]/g, ''));
    HandlebarsLib.registerHelper('hideIf', (check: HbsValue) => {
        const b = Boolean(check);
        return b ? new HandlebarsLib.SafeString('style="display:none;"') : '';
    });
    HandlebarsLib.registerHelper('arrayIncludes', (field: HbsValue, list: HbsValue): boolean => Array.isArray(list) && list.includes(field));
    HandlebarsLib.registerHelper('includes', (list: HbsValue, value: HbsValue): boolean => Array.isArray(list) && list.includes(value));
    HandlebarsLib.registerHelper('option', (option: HbsValue, current: HbsValue, name: HbsValue): string => {
        const v = unknownToStr(option ?? '');
        const label = name !== undefined ? unknownToStr(name) : v;
        const selected = current === option ? ' selected' : '';
        return `<option value="${HandlebarsLib.escapeExpression(v)}"${selected}>${HandlebarsLib.escapeExpression(label)}</option>`;
    });
    HandlebarsLib.registerHelper('slice', (arr: HbsValue, start: HbsValue, end: HbsValue) => {
        if (!Array.isArray(arr)) return [];
        return arr.slice(Number(start ?? 0), end === undefined ? undefined : Number(end));
    });
    HandlebarsLib.registerHelper('range', (start: HbsValue, end: HbsValue) => {
        const s = Number(start ?? 0);
        const e = Number(end ?? 0);
        const result: number[] = [];
        if (e < s) return result;
        for (let i = s; i <= e; i++) result.push(i);
        return result;
    });
    HandlebarsLib.registerHelper('times', function timesHelper(this: HbsValue, count: HbsValue, options: { fn: (ctx: number) => string }): string {
        const n = Number(count ?? 0);
        let out = '';
        for (let i = 0; i < n; i++) out += options.fn(i);
        return out;
    });
    // NB: cannot register a helper named `percent` here — many templates use
    // `{{percent}}` as a plain context variable (e.g. vital-progress-bar.hbs)
    // and a same-named helper shadows the lookup, returning 0. Use a distinct
    // identifier for the helper version if/when needed.
    HandlebarsLib.registerHelper('inversePercent', (value: HbsValue, max: HbsValue): number => {
        const v = Number(value ?? 0);
        const m = Number(max ?? 0);
        return m > 0 ? Math.max(0, 100 - Math.round((v / m) * 100)) : 0;
    });
    HandlebarsLib.registerHelper('colorCode', (positive: HbsValue, negative: HbsValue): string => {
        const isPositive = Boolean(positive);
        const isNegative = Boolean(negative);
        return isPositive ? 'positive' : isNegative ? 'negative' : 'neutral';
    });
    HandlebarsLib.registerHelper('isError', (value: HbsValue): boolean => value === 'error' || value === false);
    HandlebarsLib.registerHelper('isSuccess', (value: HbsValue): boolean => value === 'success' || value === true);
    HandlebarsLib.registerHelper('themeClassFor', (role: HbsValue): string => {
        return typeof role === 'string' ? `wh40k-theme-${role}` : '';
    });
    HandlebarsLib.registerHelper('select', function selectHelper(this: HbsValue, selected: HbsValue, options: { fn: (ctx: HbsValue) => string }): string {
        const html = options.fn(this);
        const target = typeof selected === 'string' || typeof selected === 'number' || typeof selected === 'boolean' ? String(selected) : '';
        return html.replace(/<option([^>]*?)value=(["'])(.*?)\2([^>]*)>/g, (_match, before: string, q: string, value: string, after: string) => {
            const alreadySelected = /\bselected\b/.test(before) || /\bselected\b/.test(after);
            const isMatch = value === target;
            const tail = alreadySelected || !isMatch ? '' : ' selected';
            return `<option${before}value=${q}${value}${q}${after}${tail}>`;
        });
    });
    HandlebarsLib.registerHelper('any', (list: HbsValue, prop: HbsValue) => {
        if (!Array.isArray(list) || typeof prop !== 'string' || prop === '') return false;
        return list.some((item: HbsValue) => Boolean(getProp(item, prop)));
    });
    HandlebarsLib.registerHelper('countType', (list: HbsValue, prop: HbsValue) => {
        if (!Array.isArray(list) || typeof prop !== 'string' || prop === '') return 0;
        return list.filter((item: HbsValue) => Boolean(getProp(item, prop))).length;
    });
    HandlebarsLib.registerHelper('hash', function hashHelper(this: HbsValue, options?: { hash?: HbsRecord }) {
        return options?.hash ?? {};
    });
    HandlebarsLib.registerHelper('specialDisplay', (special: HbsValue): string => {
        if (special === null || special === undefined || special === '') return '';
        if (Array.isArray(special)) {
            return special
                .map((q: HbsValue) => {
                    if (typeof q === 'string') return q;
                    const obj = asRecord(q);
                    if (obj !== null) {
                        const name = unknownToStr(obj['name'] ?? obj['label'] ?? '');
                        const value = obj['value'];
                        return value !== undefined && value !== null && value !== '' ? `${name} (${unknownToStr(value)})` : name;
                    }
                    return unknownToStr(q);
                })
                .filter((s) => s !== '')
                .join(', ');
        }
        return unknownToStr(special);
    });
    HandlebarsLib.registerHelper('armourDisplay', (armour: HbsValue): string => {
        const a = asRecord(armour);
        if (a === null) return '0';
        const num = (v: HbsValue): number => Number(v ?? 0);
        const body = num(a['body']);
        const locations = ['body', 'head', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'] as const;
        const same = locations.every((loc) => num(a[loc]) === body);
        return same ? String(body) : locations.map((loc) => num(a[loc])).join('/');
    });
    HandlebarsLib.registerHelper('armourLocation', (armour: HbsValue, location: HbsValue): number => {
        if (typeof location !== 'string') return 0;
        return Number(getProp(armour, location) ?? 0);
    });
    HandlebarsLib.registerHelper('displayStrength', (strength: HbsValue): string => {
        const n = Number(strength ?? 0);
        return n > 0 ? String(n) : '-';
    });
    HandlebarsLib.registerHelper('displayCrit', (crit: HbsValue): string => {
        const n = Number(crit ?? 0);
        return n > 0 ? `${n}+` : '-';
    });
    HandlebarsLib.registerHelper('selectOptions', (options: HbsValue, helperOptions?: { hash?: HbsRecord }) => {
        const hash = helperOptions?.hash ?? {};
        const selected = hash.selected;
        const labelAttr = typeof hash.labelAttr === 'string' ? hash.labelAttr : null;
        const normalized = normalizeSelectOptions(options).map((option) => {
            if (labelAttr === null) return option;
            const sourceValue = Array.isArray(options) ? options.find((entry: HbsValue) => String(getProp(entry, 'value') ?? entry) === option.value) : null;
            const sourceRecord = asRecord(sourceValue);
            if (sourceRecord !== null) {
                const label = sourceRecord[labelAttr];
                if (label !== undefined) return { ...option, label: unknownToStr(label) };
            }
            return option;
        });

        const isDisabled = Boolean(hash.disabled);
        const html = normalized
            .map((option) =>
                buildOptionTag(option, selected, {
                    disabled: isDisabled ? 'disabled' : '',
                }),
            )
            .join('');

        return new HandlebarsLib.SafeString(html);
    });
    HandlebarsLib.registerHelper('editor', (value: HbsValue, options?: { hash?: HbsRecord }) => {
        const target = options?.hash?.target;
        const classes = ['wh40k-story-editor'];
        const hasButton = Boolean(options?.hash?.button);
        if (hasButton) classes.push('wh40k-story-editor--button');
        return new HandlebarsLib.SafeString(
            `<div class="${classes.join(' ')}" data-editor-target="${HandlebarsLib.escapeExpression(unknownToStr(target ?? ''))}">${unknownToStr(
                value ?? '',
            )}</div>`,
        );
    });
    HandlebarsLib.registerHelper('localize', (key: string, options?: { hash?: HbsRecord }) => {
        const resolved = lookupLocalization(key, enLang);
        if (resolved === null) return key;
        if (options?.hash && Object.keys(options.hash).length > 0) {
            return applySubstitutions(resolved, options.hash);
        }
        return resolved;
    });
    HandlebarsLib.registerHelper('format', (key: string, options?: { hash?: HbsRecord }) => {
        const resolved = lookupLocalization(key, enLang);
        const template = resolved ?? key;
        return applySubstitutions(template, options?.hash ?? {});
    });

    // eslint-disable-next-line no-restricted-syntax -- boundary: Vite augments import.meta with glob() at build time; fvtt-types' ImportMeta doesn't model it
    const partials = (import.meta as unknown as ViteImportMeta).glob('../src/templates/**/*.hbs', {
        query: '?raw',
        import: 'default',
        eager: true,
    });

    for (const [path, source] of Object.entries(partials)) {
        const idx = path.indexOf(SOURCE_ROOT);
        if (idx === -1) continue;
        const relative = path.slice(idx + SOURCE_ROOT.length);
        HandlebarsLib.registerPartial(`${TEMPLATE_PREFIX}${relative}`, source);
        // Foundry's renderTemplate accepts paths without .hbs; many templates
        // (e.g. corruption-panel, insanity-panel) `{{> ... }}` partials by
        // bare path. Register that alias too.
        if (relative.endsWith('.hbs')) {
            const noExt = relative.slice(0, -4);
            HandlebarsLib.registerPartial(`${TEMPLATE_PREFIX}${noExt}`, source);
        }
    }

    // Register the {{icon}} helper using the same registry the runtime uses.
    // We don't import src/module/icons/helper.ts directly because it touches
    // the global Handlebars (Foundry-style) and not the bundled storybook copy.
    HandlebarsLib.registerHelper('iconSvg', function iconStoryHelper(key: HbsValue, options: { hash?: HbsRecord }) {
        if (typeof key !== 'string' || !Object.hasOwn(ICON_REGISTRY, key)) {
            return new HandlebarsLib.SafeString('');
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
        return new HandlebarsLib.SafeString(out);
    });

    globalState[INIT_KEY] = true;
    return HandlebarsLib;
}
