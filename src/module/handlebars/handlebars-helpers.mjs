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
            game.dh.log('hb template', object);
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
        return CONFIG.dh.ui.expanded ? CONFIG.dh.ui.expanded.includes(field) : false;
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
        return CONFIG.dh.bio[field];
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

    Handlebars.registerHelper('colorCode', function(positive, negative) {
        // Positive Precedence
        if (positive) {
            return 'success';
        } else if (negative) {
            return 'error';
        }
    });

    Handlebars.registerHelper('defaultVal', function(value, defaultVal) {
        return value || defaultVal;
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
}
