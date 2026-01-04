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
            'systems/rogue-trader/templates/actor/panel/active-effects-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/aptitude-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/armour-display-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/armour-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/backpack-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/bonuses-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/characteristic-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/characteristic-roller-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/combat-controls-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/corruption-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/cybernetic-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/encumbrance-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/enemy-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/experience-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/fate-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/fatigue-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/force-field-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/gear-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/initiative-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/insanity-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/journal-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/movement-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/peer-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/rogue-trader-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/psychic-powers-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/psy-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/skills-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/skills-specialist-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/storage-location-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/talent-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/trait-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/weapon-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/wounds-panel.hbs',

            'systems/rogue-trader/templates/actor/panel/vehicle-armour-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-integrity-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-movement-panel.hbs',

            'systems/rogue-trader/templates/actor/partial/character-field.hbs',
            'systems/rogue-trader/templates/actor/partial/display-toggle.hbs',
            'systems/rogue-trader/templates/actor/partial/trait-toggle.hbs',

            // Item Panels
            'systems/rogue-trader/templates/item/panel/active-effects-panel.hbs',
        ]);
    }
}
