import ROGUE_TRADER from '../config.mjs';

export function capitalize(text) {
    if (!text) return '';
    return text[0].toUpperCase() + text.substring(1);
}

export function toCamelCase(str) {
    return str
        .replace(/\s(.)/g, function($1) {
            return $1.toUpperCase();
        })
        .replace(/\s/g, '')
        .replace(/^(.)/, function($1) {
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
    const tokens = normalized.split(',').map((token) => token.trim()).filter(Boolean);
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
                rightLeg: parsed[5]
            }
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
                rightLeg: parsed[3]
            }
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
    Handlebars.registerHelper('isPsychicAttack', function(power) {
        if (power && power.system.subtype) {
            return power.system.subtype.includes('Attack');
        } else {
            return false;
        }
    });

    Handlebars.registerHelper('dhlog', function(object) {
        if (object) {
            game.rt.log('hb template', object);
        }
    });

    Handlebars.registerHelper('concat', function() {
        var outStr = '';
        for (var arg in arguments) {
            if (typeof arguments[arg] != 'object') {
                outStr += arguments[arg];
            }
        }
        return outStr;
    });

    Handlebars.registerHelper('hideIf', function(check) {
        if (check) {
            return new Handlebars.SafeString('style="display:none;"');
        }
    });

    Handlebars.registerHelper('hideIfNot', function(check) {
        if (!check) {
            return new Handlebars.SafeString('style="display:none;"');
        }
    });

    /**
     * Check if a panel is expanded
     * Checks actor flags first, falls back to global CONFIG for compatibility
     * Usage: {{isExpanded 'panel_name' @root.actor}}
     */
    Handlebars.registerHelper('isExpanded', function(field, actor) {
        // Try to get from actor flags first (new system)
        if (actor && actor.flags?.['rogue-trader']?.ui?.expanded) {
            return actor.flags['rogue-trader'].ui.expanded.includes(field);
        }
        // Fallback to global CONFIG for compatibility (old system)
        return CONFIG.rt.ui.expanded ? CONFIG.rt.ui.expanded.includes(field) : false;
    });

    Handlebars.registerHelper('toLowerCase', function(str) {
        return str.toLowerCase();
    });

    Handlebars.registerHelper('removeMarkup', function(text) {
        if (text == null) return '';
        if (typeof text !== 'string') text = String(text);
        const markup = /<(.*?)>/gi;
        return text.replace(markup, '');
    });

    Handlebars.registerHelper('cleanFieldName', function(text) {
        return text === 'Name' ? 'character_name' : text.toLowerCase().replace(/ /g, '_');
    });

    Handlebars.registerHelper('capitalize', function(text) {
        return capitalize(text);
    });

    Handlebars.registerHelper('getBioOptions', function(field) {
        return CONFIG.rt.bio[field];
    });

    Handlebars.registerHelper('and', function(obj1, obj2) {
        return obj1 && obj2;
    });

    Handlebars.registerHelper('arrayIncludes', function(field, array) {
        return array.includes(field);
    });

    Handlebars.registerHelper('any', function(list, prop) {
        if (!Array.isArray(list) || !prop) return false;
        return list.some((item) => Boolean(item?.[prop]));
    });

    /**
     * Count items in a list that have a specific property
     * Usage: {{countType actor.items "isMalignancy"}}
     */
    Handlebars.registerHelper('countType', function(list, prop) {
        if (!Array.isArray(list) || !prop) return 0;
        return list.filter((item) => Boolean(item?.[prop])).length;
    });

    Handlebars.registerHelper('arrayToObject', function(array) {
        const obj = {};
        if (array == null || typeof array[Symbol.iterator] !== 'function') return obj;
        for (let a of array) {
            obj[a] = a;
        }
        return obj;
    });

    Handlebars.registerHelper('option', function(option, current, name) {
        const selected = current === option ? 'selected="selected"' : '';
        let optionValue;
        if (Number.isInteger(option)) {
            optionValue = option;
        } else {
            optionValue = '"' + option + '"';
        }
        return new Handlebars.SafeString('<option value=' + optionValue + ' ' + selected + '>' + (name ? name : option) + '</option>');
    });

    Handlebars.registerHelper('getCharacteristicValue', function(name, characteristics) {
        for (let key of Object.keys(characteristics)) {
            if (characteristics[key].short === name) {
                return characteristics[key].total;
            }
        }
        return 0;
    });

    Handlebars.registerHelper('isError', function(value) {
        return value ? 'error' : '';
    });

    Handlebars.registerHelper('isSuccess', function(value) {
        return value ? 'success' : '';
    });

    Handlebars.registerHelper('inc', function(value) {
        return Number.parseInt(value) + 1;
    });

    /**
     * Create an array of numbers for iteration
     * Usage: {{#each (array 1 2 3 4 5)}}
     */
    Handlebars.registerHelper('array', function(...args) {
        // Remove the options object that Handlebars adds
        return args.slice(0, -1);
    });

    /**
     * Create a numeric range for iteration
     * Usage: {{#each (range 1 5)}}
     */
    Handlebars.registerHelper('range', function(start, end) {
        const out = [];
        const s = Number(start) || 0;
        const e = Number(end) || 0;
        if (e < s) return out;
        for (let i = s; i <= e; i++) out.push(i);
        return out;
    });

    /**
     * Add two numbers
     * Usage: {{add value 1}}
     */
    Handlebars.registerHelper('add', function(a, b) {
        return (Number(a) || 0) + (Number(b) || 0);
    });

    /**
     * Compute a percentage for progress bars
     * Usage: {{percent value max}}
     */
    Handlebars.registerHelper('percent', function(value, max) {
        const v = Number(value) || 0;
        const m = Number(max) || 0;
        if (m <= 0) return 0;
        return Math.min(100, Math.max(0, (v / m) * 100));
    });

    /**
     * Compute an inverse percentage (full at 0, empty at max).
     * Usage: {{inversePercent value max}}
     */
    Handlebars.registerHelper('inversePercent', function(value, max) {
        const v = Number(value) || 0;
        const m = Number(max) || 0;
        if (m <= 0) return 0;
        return Math.min(100, Math.max(0, 100 - (v / m) * 100));
    });

    Handlebars.registerHelper('colorCode', function(positive, negative) {
        // Positive Precedence
        if (positive) {
            return 'success';
        } else if (negative) {
            return 'error';
        }
    });

    // Comparison helpers
    Handlebars.registerHelper('gt', function(a, b) {
        return a > b;
    });

    Handlebars.registerHelper('lt', function(a, b) {
        return a < b;
    });

    Handlebars.registerHelper('gte', function(a, b) {
        return a >= b;
    });

    Handlebars.registerHelper('lte', function(a, b) {
        return a <= b;
    });

    Handlebars.registerHelper('multiply', function(a, b) {
        return (a || 0) * (b || 0);
    });

    Handlebars.registerHelper('divide', function(a, b) {
        const divisor = Number(b) || 0;
        if (divisor === 0) return 0;
        return (Number(a) || 0) / divisor;
    });

    Handlebars.registerHelper('subtract', function(a, b) {
        return (a || 0) - (b || 0);
    });

    Handlebars.registerHelper('eq', function(a, b) {
        return a === b;
    });

    Handlebars.registerHelper('neq', function(a, b) {
        return a !== b;
    });

    Handlebars.registerHelper('defaultVal', function(value, defaultVal) {
        return value || defaultVal;
    });

    Handlebars.registerHelper('rateOfFireDisplay', function(rateOfFire) {
        if (!rateOfFire) return '';
        const single = rateOfFire.single ?? '-';
        const burst = rateOfFire.burst ?? '-';
        const full = rateOfFire.full ?? '-';
        return `${single}/${burst}/${full}`;
    });

    Handlebars.registerHelper('specialDisplay', function(special) {
        if (!special) return '';
        if (Array.isArray(special)) {
            return special.filter(Boolean).join(', ');
        }
        if (typeof special === 'object') {
            return Object.entries(special)
                .map(([key, value]) => value ? `${key} ${value}`.trim() : key)
                .join(', ');
        }
        return special;
    });

    Handlebars.registerHelper('json', function(value) {
        try {
            return JSON.stringify(value ?? {}, null, 2);
        } catch (error) {
            return '';
        }
    });

    Handlebars.registerHelper('armourDisplay', function(armour) {
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

    Handlebars.registerHelper('armourLocation', function(armour, location) {
        return getArmourAPForLocation(armour, location);
    });

    Handlebars.registerHelper('skillIcon', function(skillKey) {
        const config = CONFIG?.rt?.getSkillIcon ? CONFIG.rt : ROGUE_TRADER;
        const icon = config?.getSkillIcon?.(skillKey) || 'modules/game-icons-net/blacktransparent/skills.svg';
        if (foundry?.utils?.getRoute) return foundry.utils.getRoute(icon);
        return icon;
    });

    Handlebars.registerHelper('damageTypeLong', function(damageType) {
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
    Handlebars.registerHelper('corruptionDegree', function(corruption) {
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
    Handlebars.registerHelper('corruptionModifier', function(corruption) {
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
    Handlebars.registerHelper('insanityDegree', function(insanity) {
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
    Handlebars.registerHelper('insanityModifier', function(insanity) {
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
    Handlebars.registerHelper('clampCritical', function(value) {
        return Math.min(Math.max(Number(value) || 0, 0), 10);
    });

    /**
     * Return the smaller of two values.
     */
    Handlebars.registerHelper('min', function(a, b) {
        const left = Number(a);
        const right = Number(b);
        if (Number.isNaN(left) || Number.isNaN(right)) return '';
        return Math.min(left, right);
    });

    /**
     * Get CSS class for corruption degree
     */
    Handlebars.registerHelper('corruptionDegreeClass', function(corruption) {
        const points = Number(corruption) || 0;
        if (points === 0) return 'degree-pure';
        if (points <= 30) return 'degree-tainted';
        if (points <= 60) return 'degree-soiled';
        if (points <= 90) return 'degree-debased';
        if (points <= 99) return 'degree-profane';
        return 'degree-damned';
    });

    /**
     * Get CSS class for insanity degree
     */
    Handlebars.registerHelper('insanityDegreeClass', function(insanity) {
        const points = Number(insanity) || 0;
        if (points <= 9) return 'degree-stable';
        if (points <= 39) return 'degree-unsettled';
        if (points <= 59) return 'degree-disturbed';
        if (points <= 79) return 'degree-unhinged';
        if (points <= 99) return 'degree-deranged';
        return 'degree-terminally-insane';
    });

    /**
     * Join an array with a separator
     * Usage: {{join myArray ", "}}
     */
    Handlebars.registerHelper('join', function(array, separator) {
        if (!array) return '';
        if (!Array.isArray(array)) return String(array);
        return array.filter(Boolean).join(separator || ', ');
    });
}
