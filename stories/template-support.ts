import HandlebarsLib from 'handlebars';
import enLang from '../src/lang/en.json';
import { type HelperLanguage, registerHandlebarsHelpers } from '../src/module/handlebars/handlebars-helpers.ts';
import { registerIconHelper } from '../src/module/icons/helper.ts';

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

/** Handlebars' own truthiness: everything but undefined, null, false, 0 and ''. */
function isTruthy(value: HbsValue): boolean {
    return value !== undefined && value !== null && value !== false && value !== 0 && value !== '';
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

/** The harness's language: English, read from the langpack. */
const STORY_LANGUAGE: HelperLanguage = {
    localize: (key) => lookupLocalization(key, enLang) ?? key,
    lang: () => 'en',
};

/**
 * Stand-ins for the helpers Foundry core registers (and the one a sheet supplies
 * on its render context), which the templates call. Production's own helpers
 * come from the shared registry; these are the ones it never registers.
 */
export const FOUNDRY_CORE_HELPERS = [
    'localize',
    'checked',
    'disabled',
    'editor',
    'selectOptions',
    'formInput',
    'ne',
    'not',
    'setToArray',
    'setIncludes',
] as const;

function registerFoundryCoreHelpers(): void {
    HandlebarsLib.registerHelper('localize', (key: string, options?: { hash?: HbsRecord }) => {
        const resolved = lookupLocalization(key, enLang);
        if (resolved === null) return key;
        if (options?.hash && Object.keys(options.hash).length > 0) {
            return applySubstitutions(resolved, options.hash);
        }
        return resolved;
    });
    HandlebarsLib.registerHelper('checked', (value: HbsValue) => (isTruthy(value) ? 'checked' : ''));
    HandlebarsLib.registerHelper('disabled', (value: HbsValue) => (isTruthy(value) ? 'disabled' : ''));
    HandlebarsLib.registerHelper('ne', (a: HbsValue, b: HbsValue) => a !== b);
    HandlebarsLib.registerHelper('not', (value: HbsValue) => !isTruthy(value));
    // AmmoSheet supplies `setToArray` and `setIncludes` on its render context; Handlebars calls them like helpers.
    HandlebarsLib.registerHelper('setToArray', (value: HbsValue) => asArray(value));
    HandlebarsLib.registerHelper('setIncludes', (key: HbsValue, set: HbsValue) => asArray(set).includes(key));
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
    // Foundry's `{{formInput field value=…}}` renders the field's own input. A story's
    // field has no schema behind it, so this draws its enriched HTML when given, else a
    // text input named for the field.
    HandlebarsLib.registerHelper('formInput', (field: HbsValue, options?: { hash?: HbsRecord }) => {
        const hash = options?.hash ?? {};
        const name = unknownToStr(getProp(field, 'fieldPath') ?? hash.name ?? '');
        if (hash.enriched !== undefined) {
            return new HandlebarsLib.SafeString(
                `<div class="editor-content" data-edit="${HandlebarsLib.escapeExpression(name)}">${unknownToStr(hash.enriched)}</div>`,
            );
        }
        return new HandlebarsLib.SafeString(
            `<input type="text" name="${HandlebarsLib.escapeExpression(name)}" value="${HandlebarsLib.escapeExpression(unknownToStr(hash.value))}" />`,
        );
    });
}

/**
 * Production helpers that read live Foundry state (CONFIG.wh40k, the world settings,
 * the UUID cache, the debug logger), which a story has none of. Each is re-registered
 * here over production's with a story equivalent; every other helper a story renders
 * is production's own (#613).
 */
export const STORY_OVERRIDES = [
    'dhlog',
    'isExpanded',
    'isFreeformCreation',
    'isFreeformCharacters',
    'getBioOptions',
    'skillIcon',
    'specialQualities',
    'craftsmanshipQualities',
    'qualityLookup',
    'uuid-name',
    'uuid-expand',
] as const;

function registerStoryOverrides(): void {
    HandlebarsLib.registerHelper('dhlog', () => '');
    HandlebarsLib.registerHelper('isExpanded', () => false);
    HandlebarsLib.registerHelper('isFreeformCreation', () => false);
    HandlebarsLib.registerHelper('isFreeformCharacters', () => false);
    HandlebarsLib.registerHelper('getBioOptions', () => []);
    // Production's own fallback icon, which ships with Foundry.
    HandlebarsLib.registerHelper('skillIcon', () => 'icons/svg/target.svg');
    HandlebarsLib.registerHelper('specialQualities', (value: HbsValue) => asArray(value));
    HandlebarsLib.registerHelper('craftsmanshipQualities', () => []);
    HandlebarsLib.registerHelper('qualityLookup', (identifier: HbsValue) => {
        const id = unknownToStr(identifier);
        return { identifier: id, label: id, description: '', level: null };
    });
    HandlebarsLib.registerHelper('uuid-name', (uuid: HbsValue) => unknownToStr(uuid));
    HandlebarsLib.registerHelper('uuid-expand', (text: HbsValue) => unknownToStr(text));
}

function registerTemplatePartials(): void {
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
}

export function initializeStoryHandlebars(): typeof HandlebarsLib {
    const globalState = globalThis as typeof globalThis & { [INIT_KEY]?: boolean };
    if (globalState[INIT_KEY] === true) return HandlebarsLib;

    // Production's helpers, from the very registry Foundry runs, so the two sets can't drift (#613).
    registerHandlebarsHelpers(HandlebarsLib, STORY_LANGUAGE);
    registerIconHelper(HandlebarsLib);
    registerFoundryCoreHelpers();
    registerStoryOverrides();
    registerTemplatePartials();

    globalState[INIT_KEY] = true;
    return HandlebarsLib;
}
