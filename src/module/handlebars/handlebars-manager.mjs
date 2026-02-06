import { registerHandlebarsHelpers } from './handlebars-helpers.mjs';

/**
 * Manages Handlebars template loading and helper registration.
 * All templates are loaded at system initialization for simplicity and reliability.
 */
export class HandlebarManager {
    /**
     * Load all templates at startup.
     */
    static async loadTemplates() {
        return this.preloadHandlebarsTemplates();
    }

    static registerHelpers() {
        registerHandlebarsHelpers();
    }

    /**
     * Load all system templates at startup.
     * This is simpler and more reliable than lazy-loading.
     */
    static preloadHandlebarsTemplates() {
        const templates = [
            // Essential partials
            'systems/rogue-trader/templates/actor/partial/character-field.hbs',
            'systems/rogue-trader/templates/actor/partial/display-toggle.hbs',
            'systems/rogue-trader/templates/actor/partial/trait-toggle.hbs',

            // Acolyte sheet templates
            'systems/rogue-trader/templates/actor/acolyte/header.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tabs.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tabs-sidebar.hbs',
            'systems/rogue-trader/templates/actor/acolyte/body.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tab-overview.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tab-status.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tab-combat.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tab-skills.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tab-talents.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tab-equipment.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tab-powers.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tab-dynasty.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tab-biography.hbs',

            // Actor panels
            'systems/rogue-trader/templates/actor/panel/wounds-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/fatigue-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/fate-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/corruption-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/insanity-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/experience-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/movement-panel-full.hbs',
            'systems/rogue-trader/templates/actor/panel/movement-panel-compact.hbs',
            'systems/rogue-trader/templates/actor/panel/active-effects-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/active-effects-compact.hbs',
            'systems/rogue-trader/templates/actor/panel/combat-station-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/weapon-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/armour-display-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/combat-controls-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/combat-actions-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/skills-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/skills-specialist-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/talent-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/trait-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/loadout-equipment-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/backpack-split-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/psy-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/psy-rating-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/psychic-powers-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/psychic-powers-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/navigator-powers-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/navigator-powers-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/orders-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/orders-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/rituals-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/rituals-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/acquisitions-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-role-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/journal-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/characteristic-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/characteristic-roller-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/bonuses-panel.hbs',

            // Vehicle sheet templates
            'systems/rogue-trader/templates/actor/vehicle/header.hbs',
            'systems/rogue-trader/templates/actor/vehicle/tabs.hbs',
            'systems/rogue-trader/templates/actor/vehicle/tab-stats.hbs',
            'systems/rogue-trader/templates/actor/vehicle/tab-weapons.hbs',
            'systems/rogue-trader/templates/actor/vehicle/tab-traits.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-armour-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-integrity-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-movement-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-upgrades-panel.hbs',

            // Starship sheet templates
            'systems/rogue-trader/templates/actor/starship/header.hbs',
            'systems/rogue-trader/templates/actor/starship/tabs.hbs',
            'systems/rogue-trader/templates/actor/starship/tab-stats.hbs',
            'systems/rogue-trader/templates/actor/starship/tab-components.hbs',
            'systems/rogue-trader/templates/actor/starship/tab-weapons.hbs',
            'systems/rogue-trader/templates/actor/starship/tab-crew.hbs',
            'systems/rogue-trader/templates/actor/starship/tab-history.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-components-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-crew-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-upgrades-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-weapons-panel.hbs',

            // NPC V2 sheet templates
            'systems/rogue-trader/templates/actor/npc-v2/header.hbs',
            'systems/rogue-trader/templates/actor/npc-v2/tabs.hbs',
            'systems/rogue-trader/templates/actor/npc-v2/tab-overview.hbs',
            'systems/rogue-trader/templates/actor/npc-v2/tab-combat.hbs',
            'systems/rogue-trader/templates/actor/npc-v2/tab-skills.hbs',
            'systems/rogue-trader/templates/actor/npc-v2/tab-abilities.hbs',
            'systems/rogue-trader/templates/actor/npc-v2/tab-notes.hbs',

            // NPC dialogs
            'systems/rogue-trader/templates/dialogs/npc-quick-create.hbs',
            'systems/rogue-trader/templates/dialogs/threat-scaler.hbs',
            'systems/rogue-trader/templates/dialogs/stat-block-exporter.hbs',
            'systems/rogue-trader/templates/dialogs/stat-block-parser.hbs',
            'systems/rogue-trader/templates/dialogs/batch-create.hbs',
            'systems/rogue-trader/templates/dialogs/template-selector.hbs',

            // NPC applications
            'systems/rogue-trader/templates/apps/encounter-builder.hbs',

            // NPC Template sheet templates
            'systems/rogue-trader/templates/item/npc-template/header.hbs',
            'systems/rogue-trader/templates/item/npc-template/tabs.hbs',
            'systems/rogue-trader/templates/item/npc-template/tab-basics.hbs',
            'systems/rogue-trader/templates/item/npc-template/tab-characteristics.hbs',
            'systems/rogue-trader/templates/item/npc-template/tab-equipment.hbs',
            'systems/rogue-trader/templates/item/npc-template/tab-abilities.hbs',
            'systems/rogue-trader/templates/item/npc-template/tab-preview.hbs',

            // Chat templates
            'systems/rogue-trader/templates/chat/item-card-chat.hbs',
            'systems/rogue-trader/templates/chat/ship-weapon-chat.hbs',
            'systems/rogue-trader/templates/chat/talent-roll-chat.hbs',
            'systems/rogue-trader/templates/chat/navigator-power-chat.hbs',
            'systems/rogue-trader/templates/chat/order-roll-chat.hbs',
            'systems/rogue-trader/templates/chat/ritual-roll-chat.hbs',
            'systems/rogue-trader/templates/chat/simple-roll-chat.hbs',
            'systems/rogue-trader/templates/chat/action-roll-chat.hbs',
            'systems/rogue-trader/templates/chat/damage-roll-chat.hbs',
            'systems/rogue-trader/templates/chat/psychic-action-chat.hbs',
            'systems/rogue-trader/templates/chat/force-field-roll-chat.hbs',

            // Roll prompt templates
            'systems/rogue-trader/templates/prompt/enhanced-skill-roll.hbs',
            'systems/rogue-trader/templates/prompt/simple-roll-prompt.hbs',
            'systems/rogue-trader/templates/prompt/weapon-roll-prompt.hbs',
            'systems/rogue-trader/templates/prompt/damage-roll-prompt.hbs',
            'systems/rogue-trader/templates/prompt/psychic-power-roll-prompt.hbs',
            'systems/rogue-trader/templates/prompt/force-field-prompt.hbs',
            'systems/rogue-trader/templates/prompt/assign-damage-prompt.hbs',

            // Item sheet templates
            'systems/rogue-trader/templates/item/item-sheet-modern.hbs',
            'systems/rogue-trader/templates/item/item-weapon-sheet-modern.hbs',
            'systems/rogue-trader/templates/item/item-armour-sheet-modern.hbs',
            'systems/rogue-trader/templates/item/item-gear-sheet-modern.hbs',
            'systems/rogue-trader/templates/item/item-talent-sheet-modern.hbs',
            'systems/rogue-trader/templates/item/item-trait-sheet-modern.hbs',
            'systems/rogue-trader/templates/item/item-skill-sheet-modern.hbs',
            'systems/rogue-trader/templates/item/item-psychic-power-sheet-modern.hbs',
            'systems/rogue-trader/templates/item/ship-component-sheet.hbs',
            'systems/rogue-trader/templates/item/ship-weapon-sheet.hbs',
            'systems/rogue-trader/templates/item/ship-upgrade-sheet.hbs',

            // Item panels
            'systems/rogue-trader/templates/item/panel/active-effects-panel.hbs',
            'systems/rogue-trader/templates/item/panel/modifiers-editor-panel.hbs',

            // Component templates
            'systems/rogue-trader/templates/components/active-modifiers-panel.hbs',
        ];

        return foundry.applications.handlebars.loadTemplates(templates);
    }
}
