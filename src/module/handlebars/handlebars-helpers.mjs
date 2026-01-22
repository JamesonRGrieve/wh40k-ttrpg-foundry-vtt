import ROGUE_TRADER from '../config.mjs';

export function capitalize(text) {
    if (!text) return '';
    return text[0].toUpperCase() + text.substring(1);
}

export function toCamelCase(str) {
    return str
        .replace(/\s(.)/g, function ($1) {
            return $1.toUpperCase();
        })
        .replace(/\s/g, '')
        .replace(/^(.)/, function ($1) {
            return $1.toLowerCase();
        });
}

const ARMOUR_LOCATIONS = ['head', 'leftArm', 'rightArm', 'body', 'leftLeg', 'rightLeg'];

function getArmourPointsObject(armour) {
    const raw = armour?.armourPoints;
    if (!raw || typeof raw !== 'object') return null;
    if (raw.armourPoints && typeof raw.armourPoints === 'object') {
        return raw.armourPoints;
    }
    return raw;
}

function parseLegacyLocations(rawLocations) {
    if (!rawLocations || typeof rawLocations !== 'string') return null;
    const normalized = rawLocations.toLowerCase();
    if (normalized.includes('all')) {
        return new Set(['all']);
    }
    const coverage = new Set();
    const tokens = normalized
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean);
    for (const token of tokens) {
        if (token.includes('head')) {
            coverage.add('head');
        }
        if (token.includes('body') || token.includes('chest') || token.includes('torso')) {
            coverage.add('body');
        }
        if (token.includes('arm')) {
            coverage.add('leftArm');
            coverage.add('rightArm');
        }
        if (token.includes('leg')) {
            coverage.add('leftLeg');
            coverage.add('rightLeg');
        }
    }
    return coverage.size ? coverage : null;
}

function parseLegacyAP(rawAp) {
    if (rawAp === null || rawAp === undefined) return null;
    if (typeof rawAp === 'number') {
        return { defaultValue: rawAp };
    }
    if (typeof rawAp !== 'string') return null;
    const values = rawAp.match(/-?\d+(?:\.\d+)?/g);
    if (!values) return null;
    const parsed = values.map((value) => Number(value));
    if (parsed.length === 1) {
        return { defaultValue: parsed[0] };
    }
    if (parsed.length >= 6) {
        return {
            pointsByLocation: {
                head: parsed[0],
                body: parsed[1],
                leftArm: parsed[2],
                rightArm: parsed[3],
                leftLeg: parsed[4],
                rightLeg: parsed[5],
            },
        };
    }
    if (parsed.length === 4) {
        return {
            pointsByLocation: {
                head: parsed[0],
                body: parsed[1],
                leftArm: parsed[2],
                rightArm: parsed[2],
                leftLeg: parsed[3],
                rightLeg: parsed[3],
            },
        };
    }
    return null;
}

function getArmourAPForLocation(armour, location) {
    if (!armour) return 0;
    if (typeof armour.getAPForLocation === 'function') {
        return armour.getAPForLocation(location);
    }
    const armourPoints = getArmourPointsObject(armour);
    if (armourPoints) {
        const hasValues = Object.values(armourPoints).some((value) => Number(value) > 0);
        if (hasValues) {
            const value = Number(armourPoints?.[location] ?? 0);
            return Number.isFinite(value) ? value : 0;
        }
    }

    const coverage = parseLegacyLocations(armour.locations);
    if (coverage && !coverage.has('all') && !coverage.has(location)) {
        return 0;
    }
    const legacy = parseLegacyAP(armour.ap);
    if (!legacy) return 0;
    if (legacy.pointsByLocation) {
        return legacy.pointsByLocation[location] ?? 0;
    }
    return legacy.defaultValue ?? 0;
}

export function registerHandlebarsHelpers() {
    Handlebars.registerHelper('isPsychicAttack', function (power) {
        if (power && power.system.subtype) {
            return power.system.subtype.includes('Attack');
        } else {
            return false;
        }
    });

    Handlebars.registerHelper('dhlog', function (object) {
        if (object) {
            game.rt.log('hb template', object);
        }
    });

    Handlebars.registerHelper('concat', function () {
        var outStr = '';
        for (var arg in arguments) {
            if (typeof arguments[arg] != 'object') {
                outStr += arguments[arg];
            }
        }
        return outStr;
    });

    Handlebars.registerHelper('hideIf', function (check) {
        if (check) {
            return new Handlebars.SafeString('style="display:none;"');
        }
    });

    Handlebars.registerHelper('hideIfNot', function (check) {
        if (!check) {
            return new Handlebars.SafeString('style="display:none;"');
        }
    });

    /**
     * Check if a panel is expanded
     * Checks actor flags first, falls back to global CONFIG for compatibility
     * Usage: {{isExpanded 'panel_name' @root.actor}}
     */
    Handlebars.registerHelper('isExpanded', function (field, actor) {
        // Try to get from actor flags first (new system)
        if (actor && actor.flags?.['rogue-trader']?.ui?.expanded) {
            return actor.flags['rogue-trader'].ui.expanded.includes(field);
        }
        // Fallback to global CONFIG for compatibility (old system)
        return CONFIG.rt.ui.expanded ? CONFIG.rt.ui.expanded.includes(field) : false;
    });

    Handlebars.registerHelper('toLowerCase', function (str) {
        return str.toLowerCase();
    });

    Handlebars.registerHelper('removeMarkup', function (text) {
        if (text == null) return '';
        if (typeof text !== 'string') text = String(text);
        const markup = /<(.*?)>/gi;
        return text.replace(markup, '');
    });

    Handlebars.registerHelper('cleanFieldName', function (text) {
        return text === 'Name' ? 'character_name' : text.toLowerCase().replace(/ /g, '_');
    });

    Handlebars.registerHelper('capitalize', function (text) {
        return capitalize(text);
    });

    Handlebars.registerHelper('getBioOptions', function (field) {
        return CONFIG.rt.bio[field];
    });

    Handlebars.registerHelper('and', function (obj1, obj2) {
        return obj1 && obj2;
    });

    /**
     * Logical OR helper - returns first truthy value or the last argument.
     * Usage: {{or value1 value2 "default"}}
     * Commonly used with editor helper: {{editor content=(or system.field "") ...}}
     */
    Handlebars.registerHelper('or', function (...args) {
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

    Handlebars.registerHelper('arrayIncludes', function (field, array) {
        if (!array) return false;
        if (Array.isArray(array)) return array.includes(field);
        if (array instanceof Set) return array.has(field);
        return false;
    });

    Handlebars.registerHelper('includes', function (array, value) {
        if (!array) return false;
        if (Array.isArray(array)) return array.includes(value);
        if (array instanceof Set) return array.has(value);
        return false;
    });

    Handlebars.registerHelper('any', function (list, prop) {
        if (!Array.isArray(list) || !prop) return false;
        return list.some((item) => Boolean(item?.[prop]));
    });

    /**
     * Count items in a list that have a specific property
     * Usage: {{countType actor.items "isMalignancy"}}
     */
    Handlebars.registerHelper('countType', function (list, prop) {
        if (!Array.isArray(list) || !prop) return 0;
        return list.filter((item) => Boolean(item?.[prop])).length;
    });

    /**
     * Convert array or CONFIG object to simple key-value object for selectOptions
     * Handles both arrays ["value1", "value2"] and CONFIG objects {key: {label: "..."}}
     */
    Handlebars.registerHelper('arrayToObject', function (array) {
        const obj = {};
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
            for (let a of array) {
                obj[a] = a;
            }
        }

        return obj;
    });

    Handlebars.registerHelper('option', function (option, current, name) {
        const selected = current === option ? 'selected="selected"' : '';
        let optionValue;
        if (Number.isInteger(option)) {
            optionValue = option;
        } else {
            optionValue = '"' + option + '"';
        }
        return new Handlebars.SafeString('<option value=' + optionValue + ' ' + selected + '>' + (name ? name : option) + '</option>');
    });

    Handlebars.registerHelper('getCharacteristicValue', function (name, characteristics) {
        for (let key of Object.keys(characteristics)) {
            if (characteristics[key].short === name) {
                return characteristics[key].total;
            }
        }
        return 0;
    });

    Handlebars.registerHelper('isError', function (value) {
        return value ? 'error' : '';
    });

    Handlebars.registerHelper('isSuccess', function (value) {
        return value ? 'success' : '';
    });

    Handlebars.registerHelper('inc', function (value) {
        return Number.parseInt(value) + 1;
    });

    /**
     * Create an array of numbers for iteration
     * Usage: {{#each (array 1 2 3 4 5)}}
     */
    Handlebars.registerHelper('array', function (...args) {
        // Remove the options object that Handlebars adds
        return args.slice(0, -1);
    });

    /**
     * Extract a slice of an array
     * Usage: {{#each (slice array 0 3)}}
     */
    Handlebars.registerHelper('slice', function (array, start, end) {
        if (!Array.isArray(array)) return [];
        const s = Number(start) || 0;
        const e = end !== undefined ? Number(end) : array.length;
        return array.slice(s, e);
    });

    /**
     * Create a numeric range for iteration
     * Usage: {{#each (range 1 5)}}
     */
    Handlebars.registerHelper('range', function (start, end) {
        const out = [];
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
    Handlebars.registerHelper('times', function (count, options) {
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
    Handlebars.registerHelper('add', function (a, b) {
        return (Number(a) || 0) + (Number(b) || 0);
    });

    /**
     * Compute a percentage for progress bars
     * Usage: {{percent value max}}
     */
    Handlebars.registerHelper('percent', function (value, max) {
        const v = Number(value) || 0;
        const m = Number(max) || 0;
        if (m <= 0) return 0;
        return Math.min(100, Math.max(0, (v / m) * 100));
    });

    /**
     * Compute an inverse percentage (full at 0, empty at max).
     * Usage: {{inversePercent value max}}
     */
    Handlebars.registerHelper('inversePercent', function (value, max) {
        const v = Number(value) || 0;
        const m = Number(max) || 0;
        if (m <= 0) return 0;
        return Math.min(100, Math.max(0, 100 - (v / m) * 100));
    });

    Handlebars.registerHelper('colorCode', function (positive, negative) {
        // Positive Precedence
        if (positive) {
            return 'success';
        } else if (negative) {
            return 'error';
        }
    });

    // Comparison helpers
    Handlebars.registerHelper('gt', function (a, b) {
        return a > b;
    });

    Handlebars.registerHelper('lt', function (a, b) {
        return a < b;
    });

    Handlebars.registerHelper('gte', function (a, b) {
        return a >= b;
    });

    Handlebars.registerHelper('lte', function (a, b) {
        return a <= b;
    });

    Handlebars.registerHelper('multiply', function (a, b) {
        return (a || 0) * (b || 0);
    });

    Handlebars.registerHelper('divide', function (a, b) {
        const divisor = Number(b) || 0;
        if (divisor === 0) return 0;
        return (Number(a) || 0) / divisor;
    });

    Handlebars.registerHelper('subtract', function (a, b) {
        return (a || 0) - (b || 0);
    });

    /**
     * Floor a number
     * Usage: {{floor value}}
     */
    Handlebars.registerHelper('floor', function (value) {
        return Math.floor(Number(value) || 0);
    });

    /**
     * Format a number with a + or - sign
     * Usage: {{signedNumber 5}} → "+5", {{signedNumber -3}} → "-3"
     */
    Handlebars.registerHelper('signedNumber', function (value) {
        const num = Number(value) || 0;
        if (num >= 0) return `+${num}`;
        return `${num}`;
    });

    Handlebars.registerHelper('eq', function (a, b) {
        return a === b;
    });

    Handlebars.registerHelper('neq', function (a, b) {
        return a !== b;
    });

    Handlebars.registerHelper('defaultVal', function (value, defaultVal) {
        return value || defaultVal;
    });

    Handlebars.registerHelper('rateOfFireDisplay', function (rateOfFire) {
        if (!rateOfFire) return '';
        const single = rateOfFire.single ?? '-';
        const burst = rateOfFire.burst ?? '-';
        const full = rateOfFire.full ?? '-';
        return `${single}/${burst}/${full}`;
    });

    Handlebars.registerHelper('specialDisplay', function (special) {
        if (!special) return '';
        if (Array.isArray(special)) {
            return special.filter(Boolean).join(', ');
        }
        if (typeof special === 'object') {
            return Object.entries(special)
                .map(([key, value]) => (value ? `${key} ${value}`.trim() : key))
                .join(', ');
        }
        return special;
    });

    Handlebars.registerHelper('json', function (value) {
        try {
            return JSON.stringify(value ?? {}, null, 2);
        } catch (error) {
            return '';
        }
    });

    Handlebars.registerHelper('armourDisplay', function (armour) {
        const getValue = (location) => getArmourAPForLocation(armour, location);
        const first = getValue('body');
        const same = ARMOUR_LOCATIONS.every((location) => getValue(location) === first);
        if (same) {
            return first + ' ALL';
        }

        const locations_array = [];
        ARMOUR_LOCATIONS.forEach((part) => {
            if (getValue(part) > 0) {
                locations_array.push(part);
            }
        });

        return locations_array
            .map((item) => {
                return (
                    getValue(item) +
                    ' ' +
                    (item.toLowerCase() === 'head'
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
                        : '')
                );
            })
            .filter((item) => item !== '')
            .join(', ');
    });

    Handlebars.registerHelper('armourLocation', function (armour, location) {
        return getArmourAPForLocation(armour, location);
    });

    Handlebars.registerHelper('skillIcon', function (skillKey) {
        const config = CONFIG?.rt?.getSkillIcon ? CONFIG.rt : ROGUE_TRADER;
        const icon = config?.getSkillIcon?.(skillKey) || 'modules/game-icons-net/blacktransparent/skills.svg';
        if (foundry?.utils?.getRoute) return foundry.utils.getRoute(icon);
        return icon;
    });

    Handlebars.registerHelper('damageTypeLong', function (damageType) {
        damageType = (damageType || 'i').toLowerCase();
        switch (damageType) {
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
    Handlebars.registerHelper('corruptionDegree', function (corruption) {
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
    Handlebars.registerHelper('corruptionModifier', function (corruption) {
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
    Handlebars.registerHelper('insanityDegree', function (insanity) {
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
    Handlebars.registerHelper('insanityModifier', function (insanity) {
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
    Handlebars.registerHelper('clampCritical', function (value) {
        return Math.min(Math.max(Number(value) || 0, 0), 10);
    });

    /**
     * Return the smaller of two values.
     */
    Handlebars.registerHelper('min', function (a, b) {
        const left = Number(a);
        const right = Number(b);
        if (Number.isNaN(left) || Number.isNaN(right)) return '';
        return Math.min(left, right);
    });

    /**
     * Get CSS class for corruption degree
     */
    Handlebars.registerHelper('corruptionDegreeClass', function (corruption) {
        const points = Number(corruption) || 0;
        if (points === 0) return 'rt-degree-pure';
        if (points <= 30) return 'rt-degree-tainted';
        if (points <= 60) return 'rt-degree-soiled';
        if (points <= 90) return 'rt-degree-debased';
        if (points <= 99) return 'rt-degree-profane';
        return 'rt-degree-damned';
    });

    /**
     * Get CSS class for insanity degree
     */
    Handlebars.registerHelper('insanityDegreeClass', function (insanity) {
        const points = Number(insanity) || 0;
        if (points <= 9) return 'rt-degree-stable';
        if (points <= 39) return 'rt-degree-unsettled';
        if (points <= 59) return 'rt-degree-disturbed';
        if (points <= 79) return 'rt-degree-unhinged';
        if (points <= 99) return 'rt-degree-deranged';
        return 'rt-degree-terminally';
    });

    /**
     * Join an array with a separator
     * Usage: {{join myArray ", "}}
     */
    Handlebars.registerHelper('join', function (array, separator) {
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
    Handlebars.registerHelper('talentIcon', function (category) {
        const icons = {
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
        return icons[category] || icons.general;
    });

    /**
     * Get CSS class for talent tier color.
     * Usage: {{tierColor tier}}
     * @param {number} tier - Talent tier (0-3)
     * @returns {string} CSS class name
     */
    Handlebars.registerHelper('tierColor', function (tier) {
        const colors = {
            1: 'tier-bronze',
            2: 'tier-silver',
            3: 'tier-gold',
            0: 'tier-none',
        };
        return colors[tier] || colors[0];
    });

    /**
     * Format prerequisites object as readable string.
     * Usage: {{formatPrerequisites prerequisites}}
     * @param {Object} prereqs - Prerequisites object
     * @returns {string} Formatted string
     */
    Handlebars.registerHelper('formatPrerequisites', function (prereqs) {
        if (!prereqs) return '';
        if (prereqs.text) return prereqs.text;

        const parts = [];

        // Characteristics
        for (const [char, value] of Object.entries(prereqs.characteristics || {})) {
            parts.push(`${char.toUpperCase()} ${value}+`);
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
    Handlebars.registerHelper('traitIcon', function (category) {
        const icons = {
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
    Handlebars.registerHelper('traitCategoryColor', function (category) {
        const colors = {
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
    Handlebars.registerHelper('formatTraitName', function (name, level) {
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
    Handlebars.registerHelper('specialQualities', function (specialSet) {
        if (!specialSet) return [];

        // Convert to array if it's a Set
        const qualityIds = Array.isArray(specialSet) ? specialSet : Array.from(specialSet);
        if (!qualityIds.length) return [];

        const rtConfig = CONFIG?.rt;
        if (!rtConfig?.weaponQualities) {
            console.warn('RT | CONFIG.rt.weaponQualities not available');
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
    Handlebars.registerHelper('craftsmanshipQualities', function (weaponSystem) {
        const rtConfig = CONFIG?.rt;
        if (!rtConfig?.weaponQualities) {
            console.warn('RT | CONFIG.rt.weaponQualities not available');
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
    Handlebars.registerHelper('hasCraftsmanshipQualities', function (weaponSystem) {
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
    Handlebars.registerHelper('hasEmbeddedQualities', function (items) {
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
    Handlebars.registerHelper('has', function (collection, value) {
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
    Handlebars.registerHelper('qualityLookup', function (identifier) {
        const rtConfig = CONFIG?.rt;
        if (!rtConfig?.weaponQualities) {
            console.warn('RT | CONFIG.rt.weaponQualities not available');
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
export function displayStrength(strength) {
    return strength && strength > 0 ? strength : '-';
}

/**
 * Display ship weapon crit rating (shows "-" for 0, appends "+" for non-zero)
 * @param {number} crit - Crit rating value
 * @returns {string} Display string
 */
export function displayCrit(crit) {
    return crit && crit > 0 ? `${crit}+` : '-';
}

/**
 * Truncate a string to a maximum length, adding ellipsis if truncated
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} Truncated string
 */
export function truncate(str, maxLength = 100) {
    if (!str || typeof str !== 'string') return '';
    // Strip HTML tags for text length calculation
    const plainText = str.replace(/<[^>]*>/g, '');
    if (plainText.length <= maxLength) return str;
    return plainText.substring(0, maxLength).trim() + '…';
}

/**
 * Select helper for dropdown options
 * Usage: {{#select currentValue}}...options...{{/select}}
 * Marks the matching option as selected
 */
export function select(selected, options) {
    const escapedValue = String(selected).replace(/['"]/g, '\\$&');

    // Replace selected attribute in options
    const html = options.fn(this);
    return html.replace(new RegExp(' value="' + escapedValue + '"'), ' value="' + escapedValue + '" selected="selected"');
}
