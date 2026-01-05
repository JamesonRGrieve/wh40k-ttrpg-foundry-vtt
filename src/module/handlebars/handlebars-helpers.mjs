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

export function registerHandlebarsHelpers() {
    console.log('Registering Handlebars Helpers');

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

    Handlebars.registerHelper('isExpanded', function(field) {
        return CONFIG.rt.ui.expanded ? CONFIG.rt.ui.expanded.includes(field) : false;
    });

    Handlebars.registerHelper('toLowerCase', function(str) {
        return str.toLowerCase();
    });

    Handlebars.registerHelper('removeMarkup', function(text) {
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

    Handlebars.registerHelper('armourDisplay', function(armour) {
        let first = armour.armourPoints.body;
        const same = Object.keys(armour.armourPoints).every((p) => armour.armourPoints[p] === first);
        if (same) {
            return first + ' ALL';
        }

        const locations_array = [];
        Object.keys(armour.armourPoints).forEach((part) => {
            if (armour.armourPoints[part] > 0) {
                locations_array.push(part);
            }
        });

        return locations_array
            .map((item) => {
                return (
                    armour.armourPoints[item] +
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
}
