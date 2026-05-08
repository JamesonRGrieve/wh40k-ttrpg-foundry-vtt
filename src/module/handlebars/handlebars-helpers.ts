import WH40K from '../config.ts';
import { SystemConfigRegistry, themeClassFor } from '../config/game-systems/index.ts';
import type { GameSystemId, SystemThemeRole } from '../config/game-systems/index.ts';

export function capitalize(text: string): string {
    if (!text) return '';
    return text[0].toUpperCase() + text.substring(1);
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

function getArmourPointsObject(armour: unknown) {
    if (!armour || typeof armour !== 'object') return null;
    const raw = (armour as Record<string, unknown>).armourPoints;
    if (!raw || typeof raw !== 'object') return null;
    const nested = (raw as Record<string, unknown>).armourPoints;
    if (nested && typeof nested === 'object') {
        return nested;
    }
    return raw;
}

function getArmourAPForLocation(armour: unknown, location: string) {
    if (!armour || typeof armour !== 'object') return 0;
    const armourObj = armour as Record<string, unknown>;
    if (typeof armourObj.getAPForLocation === 'function') {
        return (armourObj.getAPForLocation as (loc: string) => number)(location);
    }
    const armourPoints = getArmourPointsObject(armour);
    if (armourPoints) {
        const value = Number((armourPoints as Record<string, unknown>)[location] ?? 0);
        return Number.isFinite(value) ? value : 0;
    }
    return 0;
}

export function registerHandlebarsHelpers() {
    /**
     * Resolve a per-system theme role into a Tailwind utility class.
     * Reads `_gameSystemId` from the surrounding sheet via Handlebars
     * `@root._gameSystemId` (set on the sheet root via PrimarySheetMixin).
     * Falls back to the explicitly passed `systemId` arg, then 'rt'.
     *
     * @example  {{themeClassFor 'border'}}            // uses @root system
     * @example  {{themeClassFor 'accent' 'dh2e'}}     // explicit override
     */
    Handlebars.registerHelper('themeClassFor', function (this: unknown, role: SystemThemeRole, ...rest: unknown[]) {
        // Last arg is Handlebars options object; preceding args are user-supplied.
        const userArgs = rest.slice(0, -1) as string[];
        const opts = rest[rest.length - 1] as { data?: { root?: { _gameSystemId?: string; gameSystemId?: string } } };
        const explicit = userArgs[0];
        const fromRoot = opts?.data?.root?._gameSystemId ?? opts?.data?.root?.gameSystemId;
        const candidate = explicit ?? fromRoot ?? 'rt';
        const systemId: GameSystemId = SystemConfigRegistry.has(candidate) ? (candidate as GameSystemId) : 'rt';
        return themeClassFor(systemId, role);
    });

    Handlebars.registerHelper('isPsychicAttack', (power) => {
        if (power && power.system.subtype) {
            return power.system.subtype.includes('Attack');
        } else {
            return false;
        }
    });

    Handlebars.registerHelper('dhlog', (object) => {
        if (object) {
            game.wh40k.log('hb template', object);
        }
    });

    Handlebars.registerHelper('concat', (...args: unknown[]) => {
        let outStr = '';
        for (const arg of args) {
            if (typeof arg != 'object') {
                outStr += arg as string;
            }
        }
        return outStr;
    });

    Handlebars.registerHelper('hideIf', (check) => {
        if (check) {
            return new Handlebars.SafeString('style="display:none;"');
        }
        return '';
    });

    Handlebars.registerHelper('hideIfNot', (check) => {
        if (!check) {
            return new Handlebars.SafeString('style="display:none;"');
        }
        return '';
    });

    /**
     * Check if a panel is expanded
     * Checks actor flags first, falls back to global CONFIG for compatibility
     * Usage: {{isExpanded 'panel_name' @root.actor}}
     */
    Handlebars.registerHelper('isExpanded', (field, actor) => {
        // Try to get from actor flags first (new system)
        if (actor && actor.flags?.['wh40k-rpg']?.ui?.expanded) {
            return actor.flags['wh40k-rpg'].ui.expanded.includes(field);
        }
        // Fallback to global CONFIG for compatibility (old system)
        const wh40kConfig = CONFIG.wh40k as unknown as { ui?: { expanded?: string[] } };
        return wh40kConfig.ui?.expanded ? wh40kConfig.ui.expanded.includes(field) : false;
    });

    Handlebars.registerHelper('toLowerCase', (str) => {
        return str.toLowerCase();
    });

    Handlebars.registerHelper('removeMarkup', (text) => {
        if (text == null) return '';
        const textStr = typeof text !== 'string' ? String(text) : text;
        const markup = /<(.*?)>/gi;
        return textStr.replace(markup, '');
    });

    Handlebars.registerHelper('cleanFieldName', (text) => {
        return text === 'Name' ? 'character_name' : text.toLowerCase().replace(/ /g, '_');
    });

    Handlebars.registerHelper('capitalize', (text) => {
        return capitalize(text);
    });

    Handlebars.registerHelper('getBioOptions', (field) => {
        const bioConfig = CONFIG.wh40k as unknown as { bio?: Record<string, unknown> };
        return bioConfig.bio?.[field];
    });

    Handlebars.registerHelper('and', (obj1, obj2) => {
        return obj1 && obj2;
    });

    /**
     * Logical OR helper - returns first truthy value or the last argument.
     * Usage: {{or value1 value2 "default"}}
     * Commonly used with editor helper: {{editor content=(or system.field "") ...}}
     */
    Handlebars.registerHelper('or', (...args) => {
        // Handlebars appends an options object as the last argument
        // We need to check if the last arg is the options object
        const lastArg = args[args.length - 1];
        const isOptions = lastArg && typeof lastArg === 'object' && 'hash' in lastArg;

        // Get values, excluding the options object
        const values = isOptions ? args.slice(0, -1) : args;

        // Return the first truthy value, or the last value if all are falsy
        for (let i = 0; i < values.length; i++) {
            if (values[i]) return values[i];
        }
        return values[values.length - 1] ?? '';
    });

    Handlebars.registerHelper('arrayIncludes', (field, array) => {
        if (!array) return false;
        if (Array.isArray(array)) return array.includes(field);
        if (array instanceof Set) return array.has(field);
        return false;
    });

    Handlebars.registerHelper('includes', (array, value) => {
        if (!array) return false;
        if (Array.isArray(array)) return array.includes(value);
        if (array instanceof Set) return array.has(value);
        return false;
    });

    Handlebars.registerHelper('any', (list, prop) => {
        if (!Array.isArray(list) || !prop) return false;
        return list.some((item) => Boolean(item?.[prop]));
    });

    /**
     * Count items in a list that have a specific property
     * Usage: {{countType actor.items "isMalignancy"}}
     */
    Handlebars.registerHelper('countType', (list, prop) => {
        if (!Array.isArray(list) || !prop) return 0;
        return list.filter((item) => Boolean(item?.[prop])).length;
    });

    /**
     * Convert array or CONFIG object to simple key-value object for selectOptions
     * Handles both arrays ["value1", "value2"] and CONFIG objects {key: {label: "..."}}
     */
    Handlebars.registerHelper('arrayToObject', (array) => {
        const obj: Record<string, unknown> = {};
        if (array == null) return obj;

        // Handle CONFIG-style objects (already objects with label/data properties)
        if (typeof array === 'object' && !Array.isArray(array) && typeof array[Symbol.iterator] !== 'function') {
            // CONFIG object - extract keys for selectOptions
            for (const key of Object.keys(array)) {
                obj[key] = key;
            }
            return obj;
        }

        // Handle arrays and iterables
        if (typeof array[Symbol.iterator] === 'function') {
            for (const a of array) {
                obj[a] = a;
            }
        }

        return obj;
    });

    Handlebars.registerHelper('option', (option, current, name) => {
        const selected = current === option ? 'selected="selected"' : '';
        let optionValue;
        if (Number.isInteger(option)) {
            optionValue = option;
        } else {
            optionValue = `"${option}"`;
        }
        return new Handlebars.SafeString(`<option value=${optionValue} ${selected}>${name ? name : option}</option>`);
    });

    Handlebars.registerHelper('getCharacteristicValue', (name, characteristics) => {
        for (const key of Object.keys(characteristics)) {
            if (characteristics[key].short === name) {
                return characteristics[key].total;
            }
        }
        return 0;
    });

    Handlebars.registerHelper('isError', (value) => {
        return value ? 'error' : '';
    });

    Handlebars.registerHelper('isSuccess', (value) => {
        return value ? 'success' : '';
    });

    Handlebars.registerHelper('inc', (value) => {
        return Number.parseInt(value) + 1;
    });

    /**
     * Create an array of numbers for iteration
     * Usage: {{#each (array 1 2 3 4 5)}}
     */
    Handlebars.registerHelper('array', (...args) => {
        // Remove the options object that Handlebars adds
        return args.slice(0, -1);
    });

    /**
     * Extract a slice of an array
     * Usage: {{#each (slice array 0 3)}}
     */
    Handlebars.registerHelper('slice', (array, start, end) => {
        if (!Array.isArray(array)) return [];
        const s = Number(start) || 0;
        const e = end !== undefined ? Number(end) : array.length;
        return array.slice(s, e);
    });

    /**
     * Create a numeric range for iteration
     * Usage: {{#each (range 1 5)}}
     */
    Handlebars.registerHelper('range', (start, end) => {
        const out: number[] = [];
        const s = Number(start) || 0;
        const e = Number(end) || 0;
        if (e < s) return out;
        for (let i = s; i <= e; i++) out.push(i);
        return out;
    });

    /**
     * Repeat a block N times with 1-based index.
     * Usage: {{#times 5}}{{this}}{{/times}}
     */
    Handlebars.registerHelper('times', (count, options) => {
        const total = Math.max(0, Number(count) || 0);
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
    Handlebars.registerHelper('add', (a, b) => {
        return (Number(a) || 0) + (Number(b) || 0);
    });

    /**
     * Compute a percentage for progress bars
     * Usage: {{percent value max}}
     */
    Handlebars.registerHelper('percent', (value, max) => {
        const v = Number(value) || 0;
        const m = Number(max) || 0;
        if (m <= 0) return 0;
        return Math.min(100, Math.max(0, (v / m) * 100));
    });

    /**
     * Compute an inverse percentage (full at 0, empty at max).
     * Usage: {{inversePercent value max}}
     */
    Handlebars.registerHelper('inversePercent', (value, max) => {
        const v = Number(value) || 0;
        const m = Number(max) || 0;
        if (m <= 0) return 0;
        return Math.min(100, Math.max(0, 100 - (v / m) * 100));
    });

    Handlebars.registerHelper('colorCode', (positive, negative) => {
        // Positive Precedence
        if (positive) {
            return 'success';
        } else if (negative) {
            return 'error';
        }
        return '';
    });

    // Comparison helpers
    Handlebars.registerHelper('gt', (a, b) => {
        return a > b;
    });

    Handlebars.registerHelper('lt', (a, b) => {
        return a < b;
    });

    Handlebars.registerHelper('gte', (a, b) => {
        return a >= b;
    });

    Handlebars.registerHelper('lte', (a, b) => {
        return a <= b;
    });

    Handlebars.registerHelper('multiply', (a, b) => {
        return (a || 0) * (b || 0);
    });

    Handlebars.registerHelper('divide', (a, b) => {
        const divisor = Number(b) || 0;
        if (divisor === 0) return 0;
        return (Number(a) || 0) / divisor;
    });

    Handlebars.registerHelper('subtract', (a, b) => {
        return (a || 0) - (b || 0);
    });

    /**
     * Floor a number
     * Usage: {{floor value}}
     */
    Handlebars.registerHelper('floor', (value) => {
        return Math.floor(Number(value) || 0);
    });

    /**
     * Format a number with a + or - sign
     * Usage: {{signedNumber 5}} → "+5", {{signedNumber -3}} → "-3"
     */
    Handlebars.registerHelper('signedNumber', (value) => {
        const num = Number(value) || 0;
        if (num >= 0) return `+${num}`;
        return `${num}`;
    });

    Handlebars.registerHelper('eq', (a, b) => {
        return a === b;
    });

    Handlebars.registerHelper('neq', (a, b) => {
        return a !== b;
    });

    Handlebars.registerHelper('defaultVal', (value, defaultVal) => {
        return value || defaultVal;
    });

    /**
     * Inline ternary helper. `if` is taken as a block helper, so we expose `iff`
     * as a subexpression-friendly form: `(iff cond "yes" "no")`. The third arg is
     * optional and defaults to "" — useful when the caller wants a class string
     * that's empty when the condition fails.
     */
    Handlebars.registerHelper('iff', (cond: unknown, ifTrue: unknown, ifFalse: unknown) => {
        return cond ? ifTrue : ifFalse ?? '';
    });

    /**
     * Build an object literal from hash arguments — mainly so partials can pass
     * structured data through subexpression syntax: `(object at=25 label="25%")`.
     */
    Handlebars.registerHelper('object', function (this: unknown, options: { hash?: Record<string, unknown> }) {
        return options.hash ?? {};
    });

    Handlebars.registerHelper('rateOfFireDisplay', (rateOfFire) => {
        if (!rateOfFire) return '';
        const single = rateOfFire.single ?? '-';
        const semi = rateOfFire.semi ?? '-';
        const full = rateOfFire.full ?? '-';
        return `${single}/${semi}/${full}`;
    });

    Handlebars.registerHelper('specialDisplay', (special) => {
        if (!special) return '';
        if (Array.isArray(special)) {
            return special.filter(Boolean).join(', ');
        }
        if (typeof special === 'object') {
            return Object.entries(special)
                .map(([key, value]) => (value ? `${key} ${value as string}`.trim() : key))
                .join(', ');
        }
        return special;
    });

    Handlebars.registerHelper('json', (value) => {
        try {
            return JSON.stringify(value ?? {}, null, 2);
        } catch {
            return '';
        }
    });

    Handlebars.registerHelper('armourDisplay', (armour) => {
        const getValue = (location: string) => getArmourAPForLocation(armour, location);
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

    Handlebars.registerHelper('armourLocation', (armour, location) => {
        return getArmourAPForLocation(armour, location);
    });

    Handlebars.registerHelper('skillIcon', (skillKey) => {
        const configAny = CONFIG as unknown as Record<string, unknown>;
        const config = (configAny?.rt as { getSkillIcon?: (k: string) => string } | undefined)?.getSkillIcon ? CONFIG.wh40k : WH40K;
        const icon = config?.getSkillIcon?.(skillKey) || 'modules/game-icons-net-font/svg/skills.svg';
        if (foundry?.utils?.getRoute) return foundry.utils.getRoute(icon);
        return icon;
    });

    Handlebars.registerHelper('damageTypeLong', (damageType) => {
        const normalizedType = (damageType || 'i').toLowerCase();
        switch (normalizedType) {
            case 'e':
                return game.i18n.localize('DAMAGE_TYPE.ENERGY');
            case 'i':
                return game.i18n.localize('DAMAGE_TYPE.IMPACT');
            case 'r':
                return game.i18n.localize('DAMAGE_TYPE.RENDING');
            case 'x':
                return game.i18n.localize('DAMAGE_TYPE.EXPLOSIVE');
            default:
                return game.i18n.localize('DAMAGE_TYPE.IMPACT');
        }
    });

    /**
     * Get corruption degree from corruption points (0-100)
     * PURE (0), TAINTED (1-30) +0, SOILED (31-60) -10, DEBASED (61-90) -20, PROFANE (91-99) -30, DAMNED (100)
     */
    Handlebars.registerHelper('corruptionDegree', (corruption) => {
        const points = Number(corruption) || 0;
        if (points === 0) return 'PURE';
        if (points <= 30) return 'TAINTED';
        if (points <= 60) return 'SOILED';
        if (points <= 90) return 'DEBASED';
        if (points <= 99) return 'PROFANE';
        return 'DAMNED';
    });

    /**
     * Get corruption modifier for checks
     */
    Handlebars.registerHelper('corruptionModifier', (corruption) => {
        const points = Number(corruption) || 0;
        if (points === 0) return '+0';
        if (points <= 30) return '+0';
        if (points <= 60) return '-10';
        if (points <= 90) return '-20';
        if (points <= 99) return '-30';
        return 'DEAD';
    });

    /**
     * Get insanity degree from insanity points (0-100)
     * STABLE (0-9), UNSETTLED (10-39) +10, DISTURBED (40-59) +0, UNHINGED (60-79) -10, DERANGED (80-99) -20, TERMINALLY INSANE (100)
     */
    Handlebars.registerHelper('insanityDegree', (insanity) => {
        const points = Number(insanity) || 0;
        if (points <= 9) return 'STABLE';
        if (points <= 39) return 'UNSETTLED';
        if (points <= 59) return 'DISTURBED';
        if (points <= 79) return 'UNHINGED';
        if (points <= 99) return 'DERANGED';
        return 'TERMINALLY INSANE';
    });

    /**
     * Get insanity modifier for checks
     */
    Handlebars.registerHelper('insanityModifier', (insanity) => {
        const points = Number(insanity) || 0;
        if (points <= 9) return '+0';
        if (points <= 39) return '+10';
        if (points <= 59) return '+0';
        if (points <= 79) return '-10';
        if (points <= 99) return '-20';
        return 'DEAD';
    });

    /**
     * Clamp critical damage to max 10
     */
    Handlebars.registerHelper('clampCritical', (value) => {
        return Math.min(Math.max(Number(value) || 0, 0), 10);
    });

    /**
     * Return the smaller of two values.
     */
    Handlebars.registerHelper('min', (a, b) => {
        const left = Number(a);
        const right = Number(b);
        if (Number.isNaN(left) || Number.isNaN(right)) return '';
        return Math.min(left, right);
    });

    /**
     * Get CSS class for corruption degree
     */
    Handlebars.registerHelper('corruptionDegreeClass', (corruption) => {
        const points = Number(corruption) || 0;
        if (points === 0) return 'wh40k-degree-pure';
        if (points <= 30) return 'wh40k-degree-tainted';
        if (points <= 60) return 'wh40k-degree-soiled';
        if (points <= 90) return 'wh40k-degree-debased';
        if (points <= 99) return 'wh40k-degree-profane';
        return 'wh40k-degree-damned';
    });

    /**
     * Get CSS class for insanity degree
     */
    Handlebars.registerHelper('insanityDegreeClass', (insanity) => {
        const points = Number(insanity) || 0;
        if (points <= 9) return 'wh40k-degree-stable';
        if (points <= 39) return 'wh40k-degree-unsettled';
        if (points <= 59) return 'wh40k-degree-disturbed';
        if (points <= 79) return 'wh40k-degree-unhinged';
        if (points <= 99) return 'wh40k-degree-deranged';
        return 'wh40k-degree-terminally';
    });

    /**
     * Join an array with a separator
     * Usage: {{join myArray ", "}}
     */
    Handlebars.registerHelper('join', (array, separator) => {
        if (!array) return '';
        if (!Array.isArray(array)) return String(array);
        return array.filter(Boolean).join(separator || ', ');
    });

    /**
     * Get icon for talent category.
     * Usage: {{talentIcon category}}
     * @param {string} category - Talent category
     * @returns {string} Font Awesome icon class
     */
    Handlebars.registerHelper('talentIcon', (category) => {
        const icons: Record<string, string> = {
            combat: 'fa-sword',
            social: 'fa-users',
            knowledge: 'fa-book',
            leadership: 'fa-crown',
            psychic: 'fa-brain',
            technical: 'fa-cog',
            defense: 'fa-shield-alt',
            willpower: 'fa-fist-raised',
            movement: 'fa-running',
            unique: 'fa-star',
            general: 'fa-circle',
        };
        return icons[category] || icons['general'];
    });

    /**
     * Get CSS class for talent tier color.
     * Usage: {{tierColor tier}}
     * @param {number} tier - Talent tier (0-3)
     * @returns {string} CSS class name
     */
    Handlebars.registerHelper('tierColor', (tier) => {
        const colors: Record<number, string> = {
            1: 'tier-bronze',
            2: 'tier-silver',
            3: 'tier-gold',
            0: 'tier-none',
        };
        return colors[Number(tier)] || colors[0];
    });

    /**
     * Format prerequisites object as readable string.
     * Usage: {{formatPrerequisites prerequisites}}
     * @param {Object} prereqs - Prerequisites object
     * @returns {string} Formatted string
     */
    Handlebars.registerHelper('formatPrerequisites', (prereqs) => {
        if (!prereqs) return '';
        if (prereqs.text) return prereqs.text;

        const parts = [];

        // Characteristics
        for (const [char, value] of Object.entries(prereqs.characteristics || {})) {
            parts.push(`${char.toUpperCase()} ${value as number}+`);
        }

        // Skills
        if (prereqs.skills && prereqs.skills.length > 0) {
            parts.push(...prereqs.skills);
        }

        // Talents
        if (prereqs.talents && prereqs.talents.length > 0) {
            parts.push(...prereqs.talents);
        }

        return parts.join(', ');
    });

    /**
     * Get icon for trait category.
     * @param {string} category  Trait category
     * @returns {string} Font Awesome icon class
     */
    Handlebars.registerHelper('traitIcon', (category) => {
        const icons: Record<string, string> = {
            creature: 'fa-paw',
            character: 'fa-user-shield',
            elite: 'fa-star',
            unique: 'fa-gem',
            origin: 'fa-route',
            general: 'fa-shield-alt',
        };
        return icons[category] || 'fa-shield-alt';
    });

    /**
     * Get color class for trait category.
     * @param {string} category  Trait category
     * @returns {string} CSS class
     */
    Handlebars.registerHelper('traitCategoryColor', (category) => {
        const colors: Record<string, string> = {
            creature: 'trait-creature',
            character: 'trait-character',
            elite: 'trait-elite',
            unique: 'trait-unique',
            origin: 'trait-origin',
            general: 'trait-general',
        };
        return colors[category] || 'trait-general';
    });

    /**
     * Format trait name with level (if present).
     * @param {string} name  Trait name
     * @param {number} level  Trait level
     * @returns {string} Formatted name
     */
    Handlebars.registerHelper('formatTraitName', (name, level) => {
        if (level && level > 0) {
            return `${name} (${level})`;
        }
        return name;
    });

    /**
     * Convert special Set to rich quality objects with lookups.
     * @param {Set<string>} specialSet    Set of quality identifiers
     * @returns {object[]}                Array of quality definition objects
     */
    Handlebars.registerHelper('specialQualities', (specialSet) => {
        if (!specialSet) return [];

        // Convert to array if it's a Set
        const qualityIds = Array.isArray(specialSet) ? specialSet : Array.from(specialSet);
        if (!qualityIds.length) return [];

        const rtConfig = (CONFIG as unknown as Record<string, unknown>)?.rt as
            | { weaponQualities?: Record<string, { label: string; description: string; hasLevel?: boolean }> }
            | undefined;
        if (!rtConfig?.weaponQualities) {
            console.warn('WH40K | CONFIG.wh40k.weaponQualities not available');
            return [];
        }

        const qualities = [];

        for (const identifier of qualityIds) {
            // Parse identifier (e.g., "blast-3" → base="blast", level=3)
            const levelMatch = identifier.match(/^(.+?)-(\d+|x)$/i);
            const baseId = levelMatch ? levelMatch[1] : identifier;
            const level = levelMatch ? (levelMatch[2].toLowerCase() === 'x' ? null : parseInt(levelMatch[2])) : null;

            // Look up definition
            const def = rtConfig.weaponQualities[baseId];
            if (!def) {
                // Unknown quality, show raw identifier
                qualities.push({
                    identifier: identifier,
                    baseIdentifier: baseId,
                    label: identifier,
                    description: 'Unknown quality',
                    hasLevel: false,
                    level: null,
                });
                continue;
            }

            // Build rich quality object
            let label = game.i18n.localize(def.label);
            if (def.hasLevel && level !== null) {
                label += ` (${level})`;
            } else if (def.hasLevel) {
                label += ` (X)`;
            }

            qualities.push({
                identifier: identifier,
                baseIdentifier: baseId,
                label: label,
                description: game.i18n.localize(def.description),
                hasLevel: def.hasLevel,
                level: level,
            });
        }

        return qualities;
    });

    /**
     * Get qualities added by craftsmanship.
     * @param {object} weaponSystem    Weapon system data
     * @returns {object[]}             Array of quality objects
     */
    Handlebars.registerHelper('craftsmanshipQualities', (weaponSystem) => {
        const rtConfig = (CONFIG as unknown as Record<string, unknown>)?.rt as
            | { weaponQualities?: Record<string, { label: string; description: string; hasLevel?: boolean }> }
            | undefined;
        if (!rtConfig?.weaponQualities) {
            console.warn('WH40K | CONFIG.wh40k.weaponQualities not available');
            return [];
        }

        const qualities = [];
        const craft = weaponSystem.craftsmanship;
        const isMelee = weaponSystem.melee;

        if (isMelee) {
            // Melee weapons don't get quality changes, only stat mods
            return [];
        }

        // Ranged weapons get reliability qualities
        if (craft === 'poor') {
            const def = rtConfig.weaponQualities['unreliable-2'];
            if (def) {
                qualities.push({
                    identifier: 'unreliable-2',
                    label: game.i18n.localize(def.label),
                    description: game.i18n.localize(def.description),
                    hasLevel: false,
                    level: null,
                });
            }
        } else if (craft === 'cheap') {
            const def = rtConfig.weaponQualities['unreliable'];
            if (def) {
                qualities.push({
                    identifier: 'unreliable',
                    label: game.i18n.localize(def.label),
                    description: game.i18n.localize(def.description),
                    hasLevel: false,
                    level: null,
                });
            }
        } else if (craft === 'good') {
            const def = rtConfig.weaponQualities['reliable'];
            if (def) {
                qualities.push({
                    identifier: 'reliable',
                    label: game.i18n.localize(def.label),
                    description: game.i18n.localize(def.description),
                    hasLevel: false,
                    level: null,
                });
            }
        } else if (['best', 'master-crafted'].includes(craft)) {
            const def = rtConfig.weaponQualities['never-jam'];
            if (def) {
                qualities.push({
                    identifier: 'never-jam',
                    label: game.i18n.localize(def.label),
                    description: game.i18n.localize(def.description),
                    hasLevel: false,
                    level: null,
                });
            }
        }

        return qualities;
    });

    /**
     * Check if weapon has craftsmanship-derived qualities.
     * @param {object} weaponSystem    Weapon system data
     * @returns {boolean}
     */
    Handlebars.registerHelper('hasCraftsmanshipQualities', (weaponSystem) => {
        const craft = weaponSystem.craftsmanship;
        const isMelee = weaponSystem.melee;

        if (isMelee) return false; // Melee only gets stat mods

        return ['poor', 'cheap', 'good', 'best', 'master-crafted'].includes(craft);
    });

    /**
     * Check if item has embedded quality items.
     * @param {object[]} items    Array of embedded items
     * @returns {boolean}
     */
    Handlebars.registerHelper('hasEmbeddedQualities', (items: Array<{ type?: string }>) => {
        if (!items || !items.length) return false;
        return items.some((item) => item.type === 'attackSpecial');
    });

    /**
     * Check if a collection contains a value.
     * Works with Sets, Arrays, and Objects.
     * @param {Set|Array|Object} collection    Collection to check
     * @param {*} value                        Value to look for
     * @returns {boolean}
     */
    Handlebars.registerHelper('has', (collection, value) => {
        if (collection instanceof Set) return collection.has(value);
        if (Array.isArray(collection)) return collection.includes(value);
        if (typeof collection === 'object' && collection !== null) {
            return Object.prototype.hasOwnProperty.call(collection, value);
        }
        return false;
    });

    /**
     * Look up quality definition and return rich object.
     * @param {string} identifier    Quality identifier
     * @returns {object}
     */
    Handlebars.registerHelper('qualityLookup', (identifier) => {
        const rtConfig = (CONFIG as unknown as Record<string, unknown>)?.rt as
            | { weaponQualities?: Record<string, { label: string; description: string; hasLevel?: boolean }> }
            | undefined;
        if (!rtConfig?.weaponQualities) {
            console.warn('WH40K | CONFIG.wh40k.weaponQualities not available');
            return {
                identifier,
                label: identifier,
                description: 'Unknown quality',
            };
        }

        const levelMatch = identifier.match(/^(.+?)-(\d+|x)$/i);
        const baseId = levelMatch ? levelMatch[1] : identifier;
        const level = levelMatch ? (levelMatch[2].toLowerCase() === 'x' ? null : parseInt(levelMatch[2])) : null;

        const def = rtConfig.weaponQualities[baseId];
        if (!def) {
            return {
                identifier,
                label: identifier,
                description: 'Unknown quality',
            };
        }

        let label = game.i18n.localize(def.label);
        if (def.hasLevel && level !== null) {
            label += ` (${level})`;
        } else if (def.hasLevel) {
            label += ` (X)`;
        }

        return {
            identifier,
            baseIdentifier: baseId,
            label,
            description: game.i18n.localize(def.description),
            hasLevel: def.hasLevel,
            level,
        };
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
export function select(selected: unknown, options: { fn: (ctx: unknown) => string }): string {
    const escapedValue = String(selected).replace(/['"]/g, '\\$&');

    // Replace selected attribute in options
    const html = options.fn(undefined);
    return html.replace(new RegExp(` value="${escapedValue}"`), ` value="${escapedValue}" selected="selected"`);
}
