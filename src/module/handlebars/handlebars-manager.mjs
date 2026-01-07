import { registerHandlebarsHelpers } from './handlebars-helpers.mjs';

export class HandlebarManager {
    static async loadTemplates() {
        await this.preloadHandlebarsTemplates();
    }

    static registerHelpers() {
        registerHandlebarsHelpers();
    }

    static preloadHandlebarsTemplates() {
        return foundry.applications.handlebars.loadTemplates([
            // Actor partials.
            'systems/rogue-trader/templates/actor/panel/acquisitions-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/active-effects-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/aptitude-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/armour-display-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/armour-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/backpack-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/biography-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/bonuses-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/characteristic-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/characteristic-roller-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/combat-controls-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/combat-station-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/corruption-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/cybernetic-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/encumbrance-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/enemy-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/experience-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/fate-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/fate-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/corruption-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/insanity-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/fatigue-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/fatigue-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/force-field-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/gear-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/initiative-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/insanity-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/journal-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/loadout-equipment-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/movement-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/navigator-powers-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/orders-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/origin-path-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/peer-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/profit-factor-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/psychic-powers-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/psy-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/rituals-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/rogue-trader-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-role-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/skills-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/skills-specialist-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/storage-location-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/talent-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/trait-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/weapon-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/wounds-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/wounds-panel-v2.hbs',

            'systems/rogue-trader/templates/actor/panel/vehicle-armour-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-integrity-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-movement-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-upgrades-panel.hbs',

            // Starship Panels
            'systems/rogue-trader/templates/actor/panel/ship-components-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-crew-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-upgrades-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-weapons-panel.hbs',

            'systems/rogue-trader/templates/actor/partial/character-field.hbs',
            'systems/rogue-trader/templates/actor/partial/display-toggle.hbs',
            'systems/rogue-trader/templates/actor/partial/trait-toggle.hbs',

            // Chat Templates
            'systems/rogue-trader/templates/chat/item-card-chat.hbs',
            'systems/rogue-trader/templates/chat/ship-weapon-chat.hbs',
            'systems/rogue-trader/templates/chat/talent-roll-chat.hbs',
            'systems/rogue-trader/templates/chat/navigator-power-chat.hbs',
            'systems/rogue-trader/templates/chat/order-roll-chat.hbs',
            'systems/rogue-trader/templates/chat/ritual-roll-chat.hbs',

            // Item Panels
            'systems/rogue-trader/templates/item/panel/active-effects-panel.hbs',
        ]);
    }
}
