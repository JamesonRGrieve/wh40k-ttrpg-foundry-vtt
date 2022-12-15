import { registerHandlebarsHelpers } from './handlebars-helpers.mjs';

export class HandlebarManager {
    static async loadTemplates() {
        await this.preloadHandlebarsTemplates();
    }

    static registerHelpers() {
        registerHandlebarsHelpers();
    }

    static preloadHandlebarsTemplates() {
        return loadTemplates([
            // Actor partials.
            'systems/dark-heresy-2nd/templates/actor/panel/active-effects-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/aptitude-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/armour-display-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/armour-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/backpack-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/bonuses-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/characteristic-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/characteristic-roller-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/combat-controls-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/corruption-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/cybernetic-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/encumbrance-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/enemy-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/experience-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/fate-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/fatigue-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/force-field-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/gear-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/initiative-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/insanity-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/journal-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/movement-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/peer-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/psychic-powers-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/psy-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/skills-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/skills-specialist-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/storage-location-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/talent-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/trait-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/weapon-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/wounds-panel.hbs',

            'systems/dark-heresy-2nd/templates/actor/panel/vehicle-armour-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/vehicle-integrity-panel.hbs',
            'systems/dark-heresy-2nd/templates/actor/panel/vehicle-movement-panel.hbs',

            'systems/dark-heresy-2nd/templates/actor/partial/character-field.hbs',
            'systems/dark-heresy-2nd/templates/actor/partial/display-toggle.hbs',
            'systems/dark-heresy-2nd/templates/actor/partial/trait-toggle.hbs',

            // Item Panels
            'systems/dark-heresy-2nd/templates/item/panel/active-effects-panel.hbs',
        ]);
    }
}
