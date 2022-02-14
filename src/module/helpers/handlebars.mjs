/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const initializeHandlebars = () => {
    registerHandlebarsHelpers();
    preloadHandlebarsTemplates();
};

function preloadHandlebarsTemplates() {
    return loadTemplates([
        // Actor partials.
        "systems/dark-heresy-2nd/templates/actor/panel/armour-display-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/armour-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/backpack-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/characteristic-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/corruption-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/encumbrance-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/fate-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/fatigue-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/gear-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/insanity-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/movement-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/skills-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/skills-specialist-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/storage-location-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/talent-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/trait-panel.hbs",
        "systems/dark-heresy-2nd/templates/actor/panel/weapon-panel.hbs",

        "systems/dark-heresy-2nd/templates/actor/partial/character-field.hbs",
        "systems/dark-heresy-2nd/templates/actor/partial/characteristic-col.hbs",
        "systems/dark-heresy-2nd/templates/actor/partial/display-toggle.hbs",
        "systems/dark-heresy-2nd/templates/actor/partial/skill.hbs",
        "systems/dark-heresy-2nd/templates/actor/partial/skill-specialist.hbs",
        "systems/dark-heresy-2nd/templates/actor/partial/trait-toggle.hbs"
    ]);
}

function registerHandlebarsHelpers() {
    Handlebars.registerHelper('concat', function() {
        var outStr = '';
        for (var arg in arguments) {
            if (typeof arguments[arg] != 'object') {
                outStr += arguments[arg];
            }
        }
        return outStr;
    });

    Handlebars.registerHelper('hideIf', function (check) {
        if(check) {
            return new Handlebars.SafeString('style="display:none;"');
        }
    })

    Handlebars.registerHelper('hideIfNot', function (check) {
        if(!check) {
            return new Handlebars.SafeString('style="display:none;"');
        }
    })

    Handlebars.registerHelper('isExpanded', function(field) {
        return CONFIG.dh.ui.expanded ? CONFIG.dh.ui.expanded.includes(field) : false;
    });

    Handlebars.registerHelper('toLowerCase', function(str) {
        return str.toLowerCase();
    });

    Handlebars.registerHelper("removeMarkup", function (text) {
        const markup = /<(.*?)>/gi;
        return text.replace(markup, "");
    })

    Handlebars.registerHelper("cleanFieldName", function (text) {
        return (text === "Name") ? "character_name" : text.toLowerCase().replace(/ /g,"_");
    })

    Handlebars.registerHelper("capitalize", function (text) {
        return text[0].toUpperCase() + text.substring(1);
    })

    Handlebars.registerHelper("getBioOptions", function (field) {
        return CONFIG.dh.bio[field];
    })

    Handlebars.registerHelper("and", function (obj1, obj2) {
        return obj1 && obj2;
    })

    Handlebars.registerHelper("arrayIncludes", function (field, array) {
        return array.includes(field);
    })

    Handlebars.registerHelper("arrayToObject", function (array) {
        const obj = {};
        if (array == null || typeof array[Symbol.iterator] !== 'function') return obj;
        for(let a of array) {
            obj[a] = a;
        }
        return obj;
    })

    Handlebars.registerHelper('option', function(option, current, name) {
        const selected = current === option ? 'selected="selected"' : '';
        let optionValue = '';
        if (Number.isInteger(option)) {
            optionValue = option;
        } else {
            optionValue="\"" + option + "\"";
        }
        return new Handlebars.SafeString("<option value=" + optionValue + " " + selected + ">" + (name ? name : option)+ "</option>");
    })

    Handlebars.registerHelper("getCharacteristicValue", function (name, characteristics) {
        for (let key of Object.keys(characteristics)) {
            if (characteristics[key].short === name) {
                return characteristics[key].total;
            }
        }
        return 0
    })

    Handlebars.registerHelper('isError', function (value) {
        return value ? "error" : "";
    });

    Handlebars.registerHelper('defaultVal', function (value, defaultVal) {
        return value || defaultVal;
    });

    Handlebars.registerHelper('armourDisplay', function(armour) {
        let first = armour.armourPoints.body;
        const same = Object.keys(armour.armourPoints).every(p => armour.armourPoints[p] === first);
        if(same) {
            return first + ' ALL';
        }

        const locations_array = [];
        Object.keys(armour.armourPoints).forEach(part => {
            if (armour.armourPoints[part] > 0) {
                locations_array.push(part)
            }
        });

        const location_out = locations_array.map(item => {
            return armour.armourPoints[item] + " " +
                ((item.toLowerCase() === "head") ?  "H" :
                (item.toLowerCase() === "leftarm") ? "LA" :
                (item.toLowerCase() === "rightarm") ? "RA" :
                (item.toLowerCase() === "body") ? "B" :
                (item.toLowerCase() === "leftleg") ? "LL" :
                (item.toLowerCase() === "rightleg") ? "RL" : "");
        }).filter(item => item !== "").join(", ");

        return location_out;
    });

    Handlebars.registerHelper("damageTypeLong", function (damageType) {
        damageType = (damageType || "i").toLowerCase();
        switch (damageType) {
            case "e":
                return game.i18n.localize("DAMAGE_TYPE.ENERGY");
            case "i":
                return game.i18n.localize("DAMAGE_TYPE.IMPACT");
            case "r":
                return game.i18n.localize("DAMAGE_TYPE.RENDING");
            case "e":
                return game.i18n.localize("DAMAGE_TYPE.EXPLOSIVE");
            default:
                return game.i18n.localize("DAMAGE_TYPE.IMPACT");
        }
    });

}
