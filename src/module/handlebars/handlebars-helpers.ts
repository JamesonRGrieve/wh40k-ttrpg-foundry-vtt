import { type GameSystemId, type SystemThemeRole, SystemConfigRegistry, themeClassFor } from '../config/game-systems/index.ts';
import WH40K from '../config.ts';
import { uuidNameCache } from '../utils/uuid-name-cache.ts';
import { TALENT_ICONS, TIER_COLORS, TRAIT_CATEGORY_COLORS, TRAIT_ICONS, lookupOr } from './icon-lookups.ts';
import { formatSourceLabel, type SourceInput } from './source-label.ts';

/**
 * Template-supplied value. Handlebars helpers receive heterogeneous values from .hbs files
 * (strings, numbers, booleans, arrays, nested objects, undefined) and must narrow at the
 * call site. Using a dedicated alias makes the boundary explicit and lets the lint rule
 * see helper-argument `unknown`s as "validated next line" by construction.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: shared alias for Handlebars helper arguments; every call site narrows on the next line(s)
type TplValue = unknown;

/**
 * Template-supplied object record. Mirrors `Record<string, TplValue>` but expressed as an
 * interface so the boundary cast doesn't trip the `as Record<...>` rule. Use this when a
 * helper has confirmed an `unknown` is an object and needs keyed access.
 */
interface TplRecord {
    [key: string]: TplValue;
}

/** Weapon quality definition from CONFIG.wh40k.weaponQualities. */
interface WeaponQualityDef {
    label: string;
    description: string;
    hasLevel?: boolean;
}

/** Rich quality object returned by qualityLookup / specialQualities / craftsmanshipQualities. */
interface WeaponQuality {
    identifier: string;
    baseIdentifier?: string;
    label: string;
    description: string;
    hasLevel?: boolean;
    level: number | null;
}

/** Weapon system shape used by craftsmanship helpers. */
interface WeaponSystemForCraft {
    craftsmanship?: string;
    melee?: boolean;
}

/** Subset of CONFIG.wh40k surfacing the data these helpers need. */
interface WH40KConfig {
    weaponQualities?: Record<string, WeaponQualityDef>;
    ui?: { expanded?: string[] };
    bio?: Record<string, TplValue>;
    getSkillIcon?: (key: string) => string;
}

function getRtConfig(): WH40KConfig | undefined {
    const rt = (CONFIG as { rt?: WH40KConfig }).rt;
    return rt;
}

function isTplObject(v: TplValue): v is TplRecord {
    return v !== null && v !== undefined && typeof v === 'object';
}

export function capitalize(text: string): string {
    if (text === '') return '';
    return text.charAt(0).toUpperCase() + text.substring(1);
}

export function toCamelCase(str: string): string {
    return str
        .replace(/\s(.)/g, ($1: string) => {
            return $1.toUpperCase();
        })
        .replace(/\s/g, '')
        .replace(/^(.)/, ($1: string) => {
            return $1.toLowerCase();
        });
}

const ARMOUR_LOCATIONS = ['head', 'leftArm', 'rightArm', 'body', 'leftLeg', 'rightLeg'];

function getArmourPointsObject(armour: TplValue): TplRecord | null {
    if (!isTplObject(armour)) return null;
    const raw = armour['armourPoints'];
    if (!isTplObject(raw)) return null;
    const nested = raw['armourPoints'];
    if (isTplObject(nested)) return nested;
    return raw;
}

function getArmourAPForLocation(armour: TplValue, location: string): number {
    if (!isTplObject(armour)) return 0;
    const fn = armour['getAPForLocation'];
    if (typeof fn === 'function') {
        return (fn as (loc: string) => number).call(armour, location);
    }
    const armourPoints = getArmourPointsObject(armour);
    if (armourPoints) {
        const value = Number(armourPoints[location] ?? 0);
        return Number.isFinite(value) ? value : 0;
    }
    return 0;
}

export function registerHandlebarsHelpers(): void {
    /**
     * Resolve a per-system theme role into a Tailwind utility class.
     * Reads `_gameSystemId` from the surrounding sheet via Handlebars
     * `@root._gameSystemId` (set on the sheet root via PrimarySheetMixin).
     * Falls back to the explicitly passed `systemId` arg, then 'rt'.
     *
     * @example  {{themeClassFor 'border'}}            // uses @root system
     * @example  {{themeClassFor 'accent' 'dh2'}}     // explicit override
     */
    /**
     * Format an item's `source` (structured `{book,page,url}` object OR a plain
     * string) into a display label. Returns '' when there is nothing to show,
     * so callers can guard with `{{#if (sourceLabel item.system.source)}}`.
     * Fixes the `[object Object]` render of structured sources (#229).
     */
    Handlebars.registerHelper('sourceLabel', (source: TplValue): string => formatSourceLabel(source as SourceInput));

    /**
     * Character count for an `<input size="…">`, so a text input shrinks/grows to
     * fit its content — a browser-native alternative to the CSS `field-sizing:
     * content` property (which Tailwind does not currently emit, and which older
     * runtimes ignore). Floors at the supplied `min` (so the placeholder still
     * fits when empty) and a hard floor of 2 (#249).
     */
    Handlebars.registerHelper('inputSize', (value: TplValue, min: TplValue): number => {
        const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
        const floor = Number(min);
        return Math.max(text.length, Number.isFinite(floor) ? floor : 0, 2);
    });

    Handlebars.registerHelper('themeClassFor', function themeClassForHelper(this: TplValue, role: SystemThemeRole, ...rest: TplValue[]): string {
        // Last arg is Handlebars options object; preceding args are user-supplied.
        const userArgs = rest.slice(0, -1);
        const opts = rest[rest.length - 1] as { data?: { root?: { _gameSystemId?: string; gameSystemId?: string } } };
        const explicit = typeof userArgs[0] === 'string' ? userArgs[0] : undefined;
        const fromRoot = opts.data?.root?._gameSystemId ?? opts.data?.root?.gameSystemId;
        const candidate = explicit ?? fromRoot ?? 'rt';
        const systemId: GameSystemId = SystemConfigRegistry.has(candidate) ? (candidate as GameSystemId) : 'rt';
        return themeClassFor(systemId, role);
    });

    /**
     * Foundry V11-era `{{#select value}}…<option>…</option>…{{/select}}` block
     * helper. Removed in V14 core but still referenced by several item
     * templates here (cybernetic, etc.). Re-registers it as a shim so those
     * templates render without re-authoring; new templates should prefer
     * `{{selectOptions options selected=value}}` instead.
     *
     * Why: vault content + sheets that already use the block form would
     * silently break under V14 with "Missing helper: select" otherwise.
     */
    Handlebars.registerHelper('select', function selectHelper(this: TplValue, selected: TplValue, options: { fn: (ctx: TplValue) => string }): string {
        const html = options.fn(this);
        const target = typeof selected === 'string' || typeof selected === 'number' || typeof selected === 'boolean' ? String(selected) : '';
        // Match `<option ... value="X"` and append `selected` if it matches the
        // target. Tolerates single/double quotes and incidental attributes.
        return html.replace(/<option([^>]*?)value=(["'])(.*?)\2([^>]*)>/g, (_match, before: string, q: string, value: string, after: string) => {
            const alreadySelected = /\bselected\b/.test(before) || /\bselected\b/.test(after);
            const isMatch = value === target;
            const tail = alreadySelected || !isMatch ? '' : ' selected';
            return `<option${before}value=${q}${value}${q}${after}${tail}>`;
        });
    });

    Handlebars.registerHelper('isPsychicAttack', (power: TplValue): boolean => {
        if (!isTplObject(power)) return false;
        const sys = power['system'];
        if (!isTplObject(sys)) return false;
        const subtype = sys['subtype'];
        if (Array.isArray(subtype)) return subtype.includes('Attack');
        return false;
    });

    Handlebars.registerHelper('dhlog', (object: TplValue) => {
        if (object !== undefined && object !== null) {
            game.wh40k.log('hb template', object);
        }
    });

    Handlebars.registerHelper('concat', (...args: TplValue[]): string => {
        let outStr = '';
        for (const arg of args) {
            // Skip Handlebars options object (last arg) and any object/array values.
            if (arg === null || arg === undefined) continue;
            if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
                outStr += String(arg);
            }
        }
        return outStr;
    });

    // Truthiness helper: preserves Handlebars-style truthy semantics for templates.
    const isTruthy = (v: TplValue): boolean => v !== undefined && v !== null && v !== false && v !== 0 && v !== '';

    Handlebars.registerHelper('hideIf', (check: TplValue) => {
        if (isTruthy(check)) {
            return new Handlebars.SafeString('style="display:none;"');
        }
        return '';
    });

    Handlebars.registerHelper('hideIfNot', (check: TplValue) => {
        if (!isTruthy(check)) {
            return new Handlebars.SafeString('style="display:none;"');
        }
        return '';
    });

    /**
     * Check if a panel is expanded
     * Checks actor flags first, falls back to global CONFIG for compatibility
     * Usage: {{isExpanded 'panel_name' @root.actor}}
     */
    Handlebars.registerHelper('isExpanded', (field: string, actor: TplValue): boolean => {
        // Try to get from actor flags first (new system)
        interface ActorWithFlags {
            flags?: { 'wh40k-rpg'?: { ui?: { expanded?: string[] } } };
        }
        const actorFlags = (actor as ActorWithFlags | null | undefined)?.flags;
        const expanded = actorFlags?.['wh40k-rpg']?.ui?.expanded;
        if (Array.isArray(expanded)) {
            return expanded.includes(field);
        }
        // Fallback to global CONFIG for compatibility (old system)
        const wh40kConfig = CONFIG.wh40k as { ui?: { expanded?: string[] } };
        const expandedList = wh40kConfig.ui?.expanded;
        return Array.isArray(expandedList) && expandedList.includes(field);
    });

    Handlebars.registerHelper('toLowerCase', (str: string) => {
        return str.toLowerCase();
    });

    Handlebars.registerHelper('removeMarkup', (text: TplValue): string => {
        if (text === null || text === undefined) return '';
        let textStr: string;
        if (typeof text === 'string') textStr = text;
        else if (typeof text === 'number' || typeof text === 'boolean') textStr = String(text);
        else return '';
        const markup = /<(.*?)>/gi;
        return textStr.replace(markup, '');
    });

    Handlebars.registerHelper('cleanFieldName', (text: string) => {
        return text === 'Name' ? 'character_name' : text.toLowerCase().replace(/ /g, '_');
    });

    Handlebars.registerHelper('capitalize', (text: string) => {
        return capitalize(text);
    });

    Handlebars.registerHelper('getBioOptions', (field: string): TplValue => {
        const bioConfig = CONFIG.wh40k as { bio?: Record<string, TplValue> };
        return bioConfig.bio?.[field];
    });

    // Truthy `and` for Handlebars callers — must preserve template truthiness semantics.
    Handlebars.registerHelper('and', (obj1: TplValue, obj2: TplValue): TplValue => {
        return isTruthy(obj1) ? obj2 : obj1;
    });

    /**
     * Logical OR helper - returns first truthy value or the last argument.
     * Usage: {{or value1 value2 "default"}}
     * Commonly used with editor helper: {{editor content=(or system.field "") ...}}
     */
    Handlebars.registerHelper('or', (...args: TplValue[]): TplValue => {
        // Handlebars appends an options object as the last argument
        const lastArg = args[args.length - 1];
        const isOptions = lastArg !== null && lastArg !== undefined && typeof lastArg === 'object' && 'hash' in lastArg;

        // Get values, excluding the options object
        const values = isOptions ? args.slice(0, -1) : args;

        // Return the first truthy value, or the last value if all are falsy
        for (const v of values) {
            if (isTruthy(v)) return v;
        }
        return values[values.length - 1] ?? '';
    });

    Handlebars.registerHelper('arrayIncludes', (field: TplValue, array: TplValue): boolean => {
        if (Array.isArray(array)) return array.includes(field);
        if (array instanceof Set) return array.has(field);
        return false;
    });

    Handlebars.registerHelper('includes', (array: TplValue, value: TplValue): boolean => {
        if (Array.isArray(array)) return array.includes(value);
        if (array instanceof Set) return array.has(value);
        return false;
    });

    Handlebars.registerHelper('any', (list: TplValue, prop: string): boolean => {
        if (!Array.isArray(list) || prop === '') return false;
        return list.some((item: TplValue) => {
            if (!isTplObject(item)) return false;
            return isTruthy(item[prop]);
        });
    });

    /**
     * Count items in a list that have a specific property
     * Usage: {{countType actor.items "isMalignancy"}}
     */
    Handlebars.registerHelper('countType', (list: TplValue, prop: string): number => {
        if (!Array.isArray(list) || prop === '') return 0;
        return list.filter((item: TplValue) => {
            if (!isTplObject(item)) return false;
            return isTruthy(item[prop]);
        }).length;
    });

    /**
     * Convert array or CONFIG object to simple key-value object for selectOptions
     * Handles both arrays ["value1", "value2"] and CONFIG objects {key: {label: "..."}}
     */
    Handlebars.registerHelper('arrayToObject', (array: TplValue): Record<string, string> => {
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
            // CONFIG-style object - extract keys for selectOptions
            for (const key of Object.keys(array)) {
                obj[key] = key;
            }
            return obj;
        }

        return obj;
    });

    const stringifyTpl = (v: TplValue): string => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        return '';
    };

    Handlebars.registerHelper('option', (option: TplValue, current: TplValue, name: TplValue) => {
        const selected = current === option ? 'selected="selected"' : '';
        let optionValue: string | number;
        if (typeof option === 'number' && Number.isInteger(option)) {
            optionValue = option;
        } else {
            optionValue = `"${stringifyTpl(option)}"`;
        }
        const nameStr = stringifyTpl(name);
        const label = nameStr !== '' ? nameStr : stringifyTpl(option);
        return new Handlebars.SafeString(`<option value=${optionValue} ${selected}>${label}</option>`);
    });

    Handlebars.registerHelper('getCharacteristicValue', (name: string, characteristics: Record<string, { short?: string; total?: number }>): number => {
        for (const key of Object.keys(characteristics)) {
            const char = characteristics[key] as { short?: string; total?: number } | undefined;
            if (char?.short === name) {
                return char.total ?? 0;
            }
        }
        return 0;
    });

    Handlebars.registerHelper('isError', (value: TplValue) => {
        return isTruthy(value) ? 'error' : '';
    });

    Handlebars.registerHelper('isSuccess', (value: TplValue) => {
        return isTruthy(value) ? 'success' : '';
    });

    Handlebars.registerHelper('inc', (value: TplValue): number => {
        return Number.parseInt(String(value), 10) + 1;
    });

    /**
     * Create an array of numbers for iteration
     * Usage: {{#each (array 1 2 3 4 5)}}
     */
    Handlebars.registerHelper('array', (...args: TplValue[]): TplValue[] => {
        // Remove the options object that Handlebars adds
        return args.slice(0, -1);
    });

    /**
     * Extract a slice of an array
     * Usage: {{#each (slice array 0 3)}}
     */
    Handlebars.registerHelper('slice', (array: TplValue, start: TplValue, end: TplValue): TplValue[] => {
        if (!Array.isArray(array)) return [];
        const s = Number(start);
        const sValid = Number.isFinite(s) ? s : 0;
        const e = end !== undefined ? Number(end) : array.length;
        return array.slice(sValid, e);
    });

    /**
     * Create a numeric range for iteration
     * Usage: {{#each (range 1 5)}}
     */
    Handlebars.registerHelper('range', (start: TplValue, end: TplValue): number[] => {
        const out: number[] = [];
        const sRaw = Number(start);
        const eRaw = Number(end);
        const s = Number.isFinite(sRaw) ? sRaw : 0;
        const e = Number.isFinite(eRaw) ? eRaw : 0;
        if (e < s) return out;
        for (let i = s; i <= e; i++) out.push(i);
        return out;
    });

    /**
     * Repeat a block N times with 1-based index.
     * Usage: {{#times 5}}{{this}}{{/times}}
     */
    Handlebars.registerHelper('times', (count: TplValue, options: { fn: (ctx: number) => string }): string => {
        const num = Number(count);
        const total = Math.max(0, Number.isFinite(num) ? num : 0);
        let output = '';
        for (let i = 1; i <= total; i++) {
            output += options.fn(i);
        }
        return output;
    });

    /**
     * Add two numbers
     * Usage: {{add value 1}}
     */
    Handlebars.registerHelper('add', (a: TplValue, b: TplValue): number => {
        const aN = Number(a);
        const bN = Number(b);
        return (Number.isFinite(aN) ? aN : 0) + (Number.isFinite(bN) ? bN : 0);
    });

    /**
     * Compute a percentage for progress bars
     * Usage: {{percent value max}}
     */
    Handlebars.registerHelper('percent', (value: TplValue, max: TplValue): number => {
        const vRaw = Number(value);
        const mRaw = Number(max);
        const v = Number.isFinite(vRaw) ? vRaw : 0;
        const m = Number.isFinite(mRaw) ? mRaw : 0;
        if (m <= 0) return 0;
        return Math.min(100, Math.max(0, (v / m) * 100));
    });

    /**
     * Compute an inverse percentage (full at 0, empty at max).
     * Usage: {{inversePercent value max}}
     */
    Handlebars.registerHelper('inversePercent', (value: TplValue, max: TplValue): number => {
        const vRaw = Number(value);
        const mRaw = Number(max);
        const v = Number.isFinite(vRaw) ? vRaw : 0;
        const m = Number.isFinite(mRaw) ? mRaw : 0;
        if (m <= 0) return 0;
        return Math.min(100, Math.max(0, 100 - (v / m) * 100));
    });

    Handlebars.registerHelper('colorCode', (positive: TplValue, negative: TplValue): string => {
        // Positive Precedence
        if (isTruthy(positive)) {
            return 'success';
        } else if (isTruthy(negative)) {
            return 'error';
        }
        return '';
    });

    // Comparison helpers — template-supplied operands may be string or number; coerce numerically.
    Handlebars.registerHelper('gt', (a: TplValue, b: TplValue): boolean => Number(a) > Number(b));
    Handlebars.registerHelper('lt', (a: TplValue, b: TplValue): boolean => Number(a) < Number(b));
    Handlebars.registerHelper('gte', (a: TplValue, b: TplValue): boolean => Number(a) >= Number(b));
    Handlebars.registerHelper('lte', (a: TplValue, b: TplValue): boolean => Number(a) <= Number(b));

    Handlebars.registerHelper('multiply', (a: TplValue, b: TplValue): number => {
        const aN = Number(a);
        const bN = Number(b);
        return (Number.isFinite(aN) ? aN : 0) * (Number.isFinite(bN) ? bN : 0);
    });

    Handlebars.registerHelper('divide', (a: TplValue, b: TplValue): number => {
        const divisorRaw = Number(b);
        const divisor = Number.isFinite(divisorRaw) ? divisorRaw : 0;
        if (divisor === 0) return 0;
        const aN = Number(a);
        return (Number.isFinite(aN) ? aN : 0) / divisor;
    });

    Handlebars.registerHelper('subtract', (a: TplValue, b: TplValue): number => {
        const aN = Number(a);
        const bN = Number(b);
        return (Number.isFinite(aN) ? aN : 0) - (Number.isFinite(bN) ? bN : 0);
    });

    /**
     * Floor a number
     * Usage: {{floor value}}
     */
    Handlebars.registerHelper('floor', (value: TplValue): number => {
        const n = Number(value);
        return Math.floor(Number.isFinite(n) ? n : 0);
    });

    /**
     * Format a number with a + or - sign
     * Usage: {{signedNumber 5}} → "+5", {{signedNumber -3}} → "-3"
     */
    Handlebars.registerHelper('signedNumber', (value: TplValue): string => {
        const raw = Number(value);
        const num = Number.isFinite(raw) ? raw : 0;
        if (num >= 0) return `+${num}`;
        return `${num}`;
    });

    Handlebars.registerHelper('eq', (a: TplValue, b: TplValue): boolean => a === b);
    Handlebars.registerHelper('neq', (a: TplValue, b: TplValue): boolean => a !== b);

    Handlebars.registerHelper('defaultVal', (value: TplValue, defaultVal: TplValue): TplValue => (isTruthy(value) ? value : defaultVal));

    /**
     * Inline ternary helper. `if` is taken as a block helper, so we expose `iff`
     * as a subexpression-friendly form: `(iff cond "yes" "no")`. The third arg is
     * optional and defaults to "" — useful when the caller wants a class string
     * that's empty when the condition fails.
     */
    Handlebars.registerHelper('iff', (cond: TplValue, ifTrue: TplValue, ifFalse: TplValue): TplValue => {
        return isTruthy(cond) ? ifTrue : ifFalse ?? '';
    });

    /**
     * Build an object literal from hash arguments — mainly so partials can pass
     * structured data through subexpression syntax: `(object at=25 label="25%")`.
     */
    Handlebars.registerHelper('object', function objectHelper(this: TplValue, options: { hash?: Record<string, TplValue> }): Record<string, TplValue> {
        return options.hash ?? {};
    });

    Handlebars.registerHelper('rateOfFireDisplay', (rateOfFire: TplValue): string => {
        if (!isTplObject(rateOfFire)) return '';
        // RoF segments use canonical "S/B/F" format. Each segment is either:
        //   - 'S' / numeric count (when the mode is supported), or
        //   - '-' (when the mode is unsupported).
        // single: boolean → 'S' when true, '-' when false/missing.
        // semi/full: number → numeric string when > 0, '-' when 0/missing.
        const singleRaw = rateOfFire['single'];
        const single = singleRaw === true ? 'S' : '-';
        const semiNum = typeof rateOfFire['semi'] === 'number' ? rateOfFire['semi'] : 0;
        const fullNum = typeof rateOfFire['full'] === 'number' ? rateOfFire['full'] : 0;
        const semi = semiNum > 0 ? String(semiNum) : '-';
        const full = fullNum > 0 ? String(fullNum) : '-';
        return `${single}/${semi}/${full}`;
    });

    Handlebars.registerHelper('specialDisplay', (special: TplValue): string => {
        if (special === null || special === undefined || special === '') return '';
        if (Array.isArray(special)) {
            return special
                .filter((v) => isTruthy(v))
                .map((v) => stringifyTpl(v))
                .join(', ');
        }
        if (isTplObject(special)) {
            return Object.entries(special)
                .map(([key, value]) => (isTruthy(value) ? `${key} ${stringifyTpl(value)}`.trim() : key))
                .join(', ');
        }
        return stringifyTpl(special);
    });

    Handlebars.registerHelper('json', (value: TplValue): string => {
        try {
            return JSON.stringify(value ?? {}, null, 2);
        } catch {
            return '';
        }
    });

    Handlebars.registerHelper('armourDisplay', (armour: TplValue): string => {
        const getValue = (location: string): number => getArmourAPForLocation(armour, location);
        const first = getValue('body');
        const same = ARMOUR_LOCATIONS.every((location) => getValue(location) === first);
        if (same) {
            return `${first} ALL`;
        }

        const locationsArray: string[] = [];
        ARMOUR_LOCATIONS.forEach((part) => {
            if (getValue(part) > 0) {
                locationsArray.push(part);
            }
        });

        return locationsArray
            .map((item) => {
                return `${getValue(item)} ${
                    item.toLowerCase() === 'head'
                        ? 'H'
                        : item.toLowerCase() === 'leftarm'
                        ? 'LA'
                        : item.toLowerCase() === 'rightarm'
                        ? 'RA'
                        : item.toLowerCase() === 'body'
                        ? 'B'
                        : item.toLowerCase() === 'leftleg'
                        ? 'LL'
                        : item.toLowerCase() === 'rightleg'
                        ? 'RL'
                        : ''
                }`;
            })
            .filter((item) => item !== '')
            .join(', ');
    });

    Handlebars.registerHelper('armourLocation', (armour: TplValue, location: string): number => {
        return getArmourAPForLocation(armour, location);
    });

    Handlebars.registerHelper('skillIcon', (skillKey: string): string => {
        const rtConfig = getRtConfig();
        const wh40kConfig = CONFIG.wh40k as WH40KConfig;
        const config: WH40KConfig | typeof WH40K = rtConfig?.getSkillIcon !== undefined ? wh40kConfig : WH40K;
        const icon = config.getSkillIcon?.(skillKey) ?? 'modules/game-icons-net-font/svg/skills.svg';
        return foundry.utils.getRoute(icon);
    });

    const DAMAGE_TYPE_KEYS: Record<string, string> = {
        e: 'DAMAGE_TYPE.ENERGY',
        i: 'DAMAGE_TYPE.IMPACT',
        r: 'DAMAGE_TYPE.RENDING',
        x: 'DAMAGE_TYPE.EXPLOSIVE',
    };
    Handlebars.registerHelper('damageTypeLong', (damageType: TplValue) => {
        const normalizedType = (typeof damageType === 'string' && damageType !== '' ? damageType : 'i').toLowerCase();
        const key = DAMAGE_TYPE_KEYS[normalizedType] ?? 'DAMAGE_TYPE.IMPACT';
        return game.i18n.localize(key);
    });

    /**
     * Get corruption degree from corruption points (0-100)
     * PURE (0), TAINTED (1-30) +0, SOILED (31-60) -10, DEBASED (61-90) -20, PROFANE (91-99) -30, DAMNED (100)
     */
    const numberOr0 = (v: TplValue): number => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    /**
     * First-match threshold ladder: returns the result of the first tier whose
     * inclusive max is >= points, else the fallback. Backs the corruption /
     * insanity degree / modifier / css-class helpers (formerly six near-
     * identical if-chains).
     */
    const thresholdLadder = (points: number, tiers: ReadonlyArray<readonly [max: number, result: string]>, fallback: string): string => {
        for (const [max, result] of tiers) {
            if (points <= max) return result;
        }
        return fallback;
    };

    Handlebars.registerHelper('corruptionDegree', (corruption: TplValue): string =>
        thresholdLadder(
            numberOr0(corruption),
            [
                [0, 'PURE'],
                [30, 'TAINTED'],
                [60, 'SOILED'],
                [90, 'DEBASED'],
                [99, 'PROFANE'],
            ],
            'DAMNED',
        ),
    );

    /**
     * Get corruption modifier for checks
     */
    Handlebars.registerHelper('corruptionModifier', (corruption: TplValue): string =>
        thresholdLadder(
            numberOr0(corruption),
            [
                [0, '+0'],
                [30, '+0'],
                [60, '-10'],
                [90, '-20'],
                [99, '-30'],
            ],
            'DEAD',
        ),
    );

    /**
     * Get insanity degree from insanity points (0-100)
     * STABLE (0-9), UNSETTLED (10-39) +10, DISTURBED (40-59) +0, UNHINGED (60-79) -10, DERANGED (80-99) -20, TERMINALLY INSANE (100)
     */
    Handlebars.registerHelper('insanityDegree', (insanity: TplValue): string =>
        thresholdLadder(
            numberOr0(insanity),
            [
                [9, 'STABLE'],
                [39, 'UNSETTLED'],
                [59, 'DISTURBED'],
                [79, 'UNHINGED'],
                [99, 'DERANGED'],
            ],
            'TERMINALLY INSANE',
        ),
    );

    /**
     * Get insanity modifier for checks
     */
    Handlebars.registerHelper('insanityModifier', (insanity: TplValue): string =>
        thresholdLadder(
            numberOr0(insanity),
            [
                [9, '+0'],
                [39, '+10'],
                [59, '+0'],
                [79, '-10'],
                [99, '-20'],
            ],
            'DEAD',
        ),
    );

    /**
     * Clamp critical damage to max 10
     */
    Handlebars.registerHelper('clampCritical', (value: TplValue): number => {
        return Math.min(Math.max(numberOr0(value), 0), 10);
    });

    /**
     * Return the smaller of two values.
     */
    Handlebars.registerHelper('min', (a: TplValue, b: TplValue): number | string => {
        const left = Number(a);
        const right = Number(b);
        if (Number.isNaN(left) || Number.isNaN(right)) return '';
        return Math.min(left, right);
    });

    /**
     * Get CSS class for corruption degree
     */
    Handlebars.registerHelper('corruptionDegreeClass', (corruption: TplValue): string =>
        thresholdLadder(
            numberOr0(corruption),
            [
                [0, 'wh40k-degree-pure'],
                [30, 'wh40k-degree-tainted'],
                [60, 'wh40k-degree-soiled'],
                [90, 'wh40k-degree-debased'],
                [99, 'wh40k-degree-profane'],
            ],
            'wh40k-degree-damned',
        ),
    );

    /**
     * Get CSS class for insanity degree
     */
    Handlebars.registerHelper('insanityDegreeClass', (insanity: TplValue): string =>
        thresholdLadder(
            numberOr0(insanity),
            [
                [9, 'wh40k-degree-stable'],
                [39, 'wh40k-degree-unsettled'],
                [59, 'wh40k-degree-disturbed'],
                [79, 'wh40k-degree-unhinged'],
                [99, 'wh40k-degree-deranged'],
            ],
            'wh40k-degree-terminally',
        ),
    );

    /**
     * Join an array with a separator
     * Usage: {{join myArray ", "}}
     */
    Handlebars.registerHelper('join', (array: TplValue, separator: TplValue): string => {
        if (array === null || array === undefined) return '';
        if (!Array.isArray(array)) return stringifyTpl(array);
        const sep = typeof separator === 'string' && separator !== '' ? separator : ', ';
        return array
            .filter((v) => isTruthy(v))
            .map((v) => stringifyTpl(v))
            .join(sep);
    });

    /**
     * Get icon for talent category.
     * Usage: {{talentIcon category}}
     * @param {string} category - Talent category
     * @returns {string} Font Awesome icon class
     */
    Handlebars.registerHelper('talentIcon', (category: string): string => lookupOr(TALENT_ICONS, category, 'fa-circle'));

    /**
     * Get CSS class for talent tier color.
     * Usage: {{tierColor tier}}
     * @param {number} tier - Talent tier (0-3)
     * @returns {string} CSS class name
     */
    Handlebars.registerHelper('tierColor', (tier: TplValue): string => lookupOr(TIER_COLORS, Number(tier), 'tier-none'));

    /**
     * Format prerequisites object as readable string.
     * Usage: {{formatPrerequisites prerequisites}}
     */
    Handlebars.registerHelper('formatPrerequisites', (prereqs: TplValue): string => {
        if (prereqs === null || prereqs === undefined || typeof prereqs !== 'object') return '';
        const p = prereqs as { text?: string; characteristics?: Record<string, number>; skills?: string[]; talents?: string[] };
        if (typeof p.text === 'string' && p.text !== '') return p.text;

        const parts: string[] = [];

        // Characteristics
        for (const [char, value] of Object.entries(p.characteristics ?? {})) {
            parts.push(`${char.toUpperCase()} ${value}+`);
        }

        // Skills
        if (Array.isArray(p.skills) && p.skills.length > 0) {
            parts.push(...p.skills);
        }

        // Talents
        if (Array.isArray(p.talents) && p.talents.length > 0) {
            parts.push(...p.talents);
        }

        return parts.join(', ');
    });

    /**
     * Get icon for trait category.
     */
    Handlebars.registerHelper('traitIcon', (category: string): string => lookupOr(TRAIT_ICONS, category, 'fa-shield-alt'));

    /**
     * Get color class for trait category.
     */
    Handlebars.registerHelper('traitCategoryColor', (category: string): string => lookupOr(TRAIT_CATEGORY_COLORS, category, 'trait-general'));

    /**
     * Format trait name with level (if present).
     */
    Handlebars.registerHelper('formatTraitName', (name: string, level: TplValue): string => {
        const lvl = Number(level);
        if (Number.isFinite(lvl) && lvl > 0) {
            return `${name} (${lvl})`;
        }
        return name;
    });

    /**
     * Convert special Set to rich quality objects with lookups.
     * @param {Set<string>} specialSet    Set of quality identifiers
     * @returns {object[]}                Array of quality definition objects
     */
    Handlebars.registerHelper('specialQualities', (specialSet: TplValue): WeaponQuality[] => {
        if (specialSet === null || specialSet === undefined) return [];

        // Convert to array if it's a Set; otherwise expect an array of identifier strings.
        let qualityIds: string[];
        if (Array.isArray(specialSet)) {
            qualityIds = specialSet.filter((v): v is string => typeof v === 'string');
        } else if (specialSet instanceof Set) {
            qualityIds = Array.from(specialSet).filter((v): v is string => typeof v === 'string');
        } else {
            return [];
        }
        if (qualityIds.length === 0) return [];

        const rtConfig = getRtConfig();
        if (!rtConfig?.weaponQualities) {
            console.warn('WH40K | CONFIG.wh40k.weaponQualities not available');
            return [];
        }
        const weaponQualities = rtConfig.weaponQualities;

        const qualities: WeaponQuality[] = [];

        for (const identifier of qualityIds) {
            // Parse identifier (e.g., "blast-3" → base="blast", level=3)
            const levelMatch = identifier.match(/^(.+?)-(\d+|x)$/i);
            const matchGroup1 = levelMatch?.[1];
            const matchGroup2 = levelMatch?.[2];
            const baseId = matchGroup1 ?? identifier;
            const level: number | null = matchGroup2 !== undefined ? (matchGroup2.toLowerCase() === 'x' ? null : parseInt(matchGroup2, 10)) : null;

            // Look up definition. Use hasOwn to detect missing entries because index access on
            // Record<string, V> returns V (not V | undefined) under our tsconfig.
            if (!Object.hasOwn(weaponQualities, baseId)) {
                // Unknown quality, show raw identifier
                qualities.push({
                    identifier,
                    baseIdentifier: baseId,
                    label: identifier,
                    description: 'Unknown quality',
                    hasLevel: false,
                    level: null,
                });
                continue;
            }
            const def = weaponQualities[baseId] as WeaponQualityDef | undefined;
            if (def === undefined) continue;

            // Build rich quality object
            let label = game.i18n.localize(def.label);
            if (def.hasLevel === true && level !== null) {
                label += ` (${level})`;
            } else if (def.hasLevel === true) {
                label += ` (X)`;
            }

            qualities.push({
                identifier,
                baseIdentifier: baseId,
                label,
                description: game.i18n.localize(def.description),
                ...(def.hasLevel !== undefined ? { hasLevel: def.hasLevel } : {}),
                level,
            });
        }

        return qualities;
    });

    /**
     * Get qualities added by craftsmanship.
     * @param {object} weaponSystem    Weapon system data
     * @returns {object[]}             Array of quality objects
     */
    Handlebars.registerHelper('craftsmanshipQualities', (weaponSystem: WeaponSystemForCraft): WeaponQuality[] => {
        const rtConfig = getRtConfig();
        if (!rtConfig?.weaponQualities) {
            console.warn('WH40K | CONFIG.wh40k.weaponQualities not available');
            return [];
        }
        const weaponQualities = rtConfig.weaponQualities;

        const qualities: WeaponQuality[] = [];
        const craft = weaponSystem.craftsmanship;
        const isMelee = weaponSystem.melee === true;

        if (isMelee) {
            // Melee weapons don't get quality changes, only stat mods
            return [];
        }

        const pushDef = (key: string, identifier: string): void => {
            if (!Object.hasOwn(weaponQualities, key)) return;
            const def = weaponQualities[key];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard for strict tsconfig; weaponQualities[key] may be undefined
            if (def === undefined) return;
            qualities.push({
                identifier,
                label: game.i18n.localize(def.label),
                description: game.i18n.localize(def.description),
                hasLevel: false,
                level: null,
            });
        };

        // Ranged weapons get reliability qualities
        if (craft === 'poor') pushDef('unreliable-2', 'unreliable-2');
        else if (craft === 'cheap') pushDef('unreliable', 'unreliable');
        else if (craft === 'good') pushDef('reliable', 'reliable');
        else if (craft === 'best' || craft === 'master-crafted') pushDef('never-jam', 'never-jam');

        return qualities;
    });

    /**
     * Check if weapon has craftsmanship-derived qualities.
     * @param {object} weaponSystem    Weapon system data
     * @returns {boolean}
     */
    Handlebars.registerHelper('hasCraftsmanshipQualities', (weaponSystem: WeaponSystemForCraft): boolean => {
        const craft = weaponSystem.craftsmanship;
        const isMelee = weaponSystem.melee === true;

        if (isMelee) return false; // Melee only gets stat mods
        if (craft === undefined) return false;
        return ['poor', 'cheap', 'good', 'best', 'master-crafted'].includes(craft);
    });

    /**
     * Check if item has embedded quality items.
     * @param {object[]} items    Array of embedded items
     * @returns {boolean}
     */
    Handlebars.registerHelper('hasEmbeddedQualities', (items: Array<{ type?: string }> | null | undefined): boolean => {
        if (items === null || items === undefined || items.length === 0) return false;
        return items.some((item) => item.type === 'attackSpecial');
    });

    /**
     * Check if a collection contains a value.
     * Works with Sets, Arrays, and Objects.
     * @param {Set|Array|Object} collection    Collection to check
     * @param {*} value                        Value to look for
     * @returns {boolean}
     */
    Handlebars.registerHelper('has', (collection: TplValue, value: TplValue): boolean => {
        if (collection instanceof Set) return collection.has(value);
        if (Array.isArray(collection)) return collection.includes(value);
        if (isTplObject(collection)) {
            return Object.hasOwn(collection, String(value));
        }
        return false;
    });

    /**
     * Look up quality definition and return rich object.
     * @param {string} identifier    Quality identifier
     * @returns {object}
     */
    Handlebars.registerHelper('qualityLookup', (identifier: string): WeaponQuality => {
        const rtConfig = getRtConfig();
        if (!rtConfig?.weaponQualities) {
            console.warn('WH40K | CONFIG.wh40k.weaponQualities not available');
            return {
                identifier,
                label: identifier,
                description: 'Unknown quality',
                level: null,
            };
        }
        const weaponQualities = rtConfig.weaponQualities;

        const levelMatch = identifier.match(/^(.+?)-(\d+|x)$/i);
        const matchGroup1 = levelMatch?.[1];
        const matchGroup2 = levelMatch?.[2];
        const baseId = matchGroup1 ?? identifier;
        const level: number | null = matchGroup2 !== undefined ? (matchGroup2.toLowerCase() === 'x' ? null : parseInt(matchGroup2, 10)) : null;

        if (!Object.hasOwn(weaponQualities, baseId)) {
            return {
                identifier,
                label: identifier,
                description: 'Unknown quality',
                level: null,
            };
        }
        const def = weaponQualities[baseId] as WeaponQualityDef | undefined;
        if (def === undefined) {
            return { identifier, label: identifier, description: 'Unknown quality', level: null };
        }

        let label = game.i18n.localize(def.label);
        if (def.hasLevel === true && level !== null) {
            label += ` (${level})`;
        } else if (def.hasLevel === true) {
            label += ` (X)`;
        }

        return {
            identifier,
            baseIdentifier: baseId,
            label,
            description: game.i18n.localize(def.description),
            ...(def.hasLevel !== undefined ? { hasLevel: def.hasLevel } : {}),
            level,
        };
    });

    /**
     * Resolve a Compendium UUID to the linked document's current display name.
     * Backed by `uuidNameCache`, which is populated on the `ready` hook from
     * every compendium pack index and every world-side document.
     *
     * @example  {{uuid-name grant.uuid}}
     * @example  {{uuid-name "Compendium.wh40k-rpg.dh2-core-items-talents.Item.…"}}
     */
    Handlebars.registerHelper('uuid-name', (uuid: TplValue): string => {
        if (typeof uuid !== 'string' || uuid.length === 0) return '';
        return uuidNameCache.getName(uuid);
    });

    /**
     * Expand `{{Compendium.…}}` template tokens embedded in a freeform string
     * to the linked documents' current display names. Use for prerequisite /
     * requirement text where a structured UUID slot would be overkill.
     *
     * @example  {{uuid-expand item.system.prerequisites.text}}
     */
    Handlebars.registerHelper('uuid-expand', (text: TplValue): string => {
        if (typeof text !== 'string') return '';
        return uuidNameCache.expandTemplates(text);
    });
}

/**
 * Display ship weapon strength (shows "-" for 0)
 * @param {number} strength - Weapon strength value
 * @returns {string} Display string
 */
export function displayStrength(strength: number): string | number {
    return strength && strength > 0 ? strength : '-';
}

/**
 * Display ship weapon crit rating (shows "-" for 0, appends "+" for non-zero)
 * @param {number} crit - Crit rating value
 * @returns {string} Display string
 */
export function displayCrit(crit: number): string {
    return crit && crit > 0 ? `${crit}+` : '-';
}

/**
 * Truncate a string to a maximum length, adding ellipsis if truncated
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} Truncated string
 */
export function truncate(str: string, maxLength = 100): string {
    if (!str || typeof str !== 'string') return '';
    // Strip HTML tags for text length calculation
    const plainText = str.replace(/<[^>]*>/g, '');
    if (plainText.length <= maxLength) return str;
    return `${plainText.substring(0, maxLength).trim()}…`;
}

/**
 * Select helper for dropdown options
 * Usage: {{#select currentValue}}...options...{{/select}}
 * Marks the matching option as selected
 */
export function select(selected: TplValue, options: { fn: (ctx: TplValue) => string }): string {
    const escapedValue = String(selected).replace(/['"]/g, '\\$&');

    // Replace selected attribute in options
    const html = options.fn(undefined);
    return html.replace(new RegExp(` value="${escapedValue}"`), ` value="${escapedValue}" selected="selected"`);
}
