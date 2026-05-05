import { registerIconHelper } from '../icons/helper.ts';
import { registerHandlebarsHelpers } from './handlebars-helpers.ts';

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
        registerIconHelper();
    }

    /**
     * Load all system templates at startup.
     * This is simpler and more reliable than lazy-loading.
     */
    static preloadHandlebarsTemplates() {
        const templates = [
            // Essential partials
            'systems/wh40k-rpg/templates/actor/partial/actor-identity.hbs',
            'systems/wh40k-rpg/templates/actor/partial/character-field.hbs',
            'systems/wh40k-rpg/templates/actor/partial/display-toggle.hbs',
            'systems/wh40k-rpg/templates/actor/partial/sidebar-header.hbs',
            'systems/wh40k-rpg/templates/actor/partial/sidebar-field-row.hbs',
            'systems/wh40k-rpg/templates/actor/partial/sidebar-fields-panel.hbs',
            'systems/wh40k-rpg/templates/actor/partial/header-base.hbs',
            'systems/wh40k-rpg/templates/actor/partial/trait-toggle.hbs',
            'systems/wh40k-rpg/templates/actor/partial/panel.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-panel-shell.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-quick-controls.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-progress-bar.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-edit-input.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-info-card.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-quick-adjust.hbs',
            'systems/wh40k-rpg/templates/actor/partial/pip-tracker-row.hbs',
            'systems/wh40k-rpg/templates/actor/partial/dashboard-zone.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-inline-row.hbs',
            'systems/wh40k-rpg/templates/actor/partial/degree-meter-panel.hbs',
            'systems/wh40k-rpg/templates/actor/partial/section-card.hbs',
            'systems/wh40k-rpg/templates/actor/partial/tab-strip.hbs',
            'systems/wh40k-rpg/templates/actor/partial/stat-box.hbs',
            'systems/wh40k-rpg/templates/actor/partial/stat-grid-section.hbs',
            'systems/wh40k-rpg/templates/actor/partial/collapsible-panel.hbs',
            'systems/wh40k-rpg/templates/actor/partial/effect-row.hbs',
            'systems/wh40k-rpg/templates/actor/partial/empty-state.hbs',
            'systems/wh40k-rpg/templates/actor/partial/dropzone.hbs',
            'systems/wh40k-rpg/templates/actor/partial/item-list-row.hbs',
            'systems/wh40k-rpg/templates/dialogs/partial/dialog-footer.hbs',
            'systems/wh40k-rpg/templates/chat/partial/chat-card-shell.hbs',
            'systems/wh40k-rpg/templates/shared/field-row.hbs',

            // Acolyte sheet templates
            'systems/wh40k-rpg/templates/actor/player/header-dh.hbs',
            'systems/wh40k-rpg/templates/actor/player/tabs.hbs',
            'systems/wh40k-rpg/templates/actor/player/body.hbs',
            'systems/wh40k-rpg/templates/actor/player/tab-overview.hbs',
            'systems/wh40k-rpg/templates/actor/player/tab-status.hbs',
            'systems/wh40k-rpg/templates/actor/player/tab-combat.hbs',
            'systems/wh40k-rpg/templates/actor/player/tab-skills.hbs',
            'systems/wh40k-rpg/templates/actor/player/tab-talents.hbs',
            'systems/wh40k-rpg/templates/actor/player/tab-equipment.hbs',
            'systems/wh40k-rpg/templates/actor/player/tab-powers.hbs',
            'systems/wh40k-rpg/templates/actor/player/tab-dynasty.hbs',
            'systems/wh40k-rpg/templates/actor/player/tab-biography.hbs',

            // Actor panels
            'systems/wh40k-rpg/templates/actor/panel/wounds-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/fatigue-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/fate-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/corruption-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/insanity-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/experience-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/movement-panel-full.hbs',
            'systems/wh40k-rpg/templates/actor/panel/movement-panel-compact.hbs',
            'systems/wh40k-rpg/templates/actor/panel/active-effects-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/active-effects-compact.hbs',
            'systems/wh40k-rpg/templates/actor/panel/combat-station-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/weapon-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/armour-display-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/combat-controls-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/combat-actions-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/skills-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/skills-specialist-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/talent-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/trait-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/loadout-equipment-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/backpack-split-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/psy-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/psy-rating-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/psychic-powers-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/navigator-powers-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/orders-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/rituals-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/acquisitions-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ship-role-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/journal-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/characteristic-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/characteristic-roller-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/bonuses-panel.hbs',

            // Vehicle sheet templates
            'systems/wh40k-rpg/templates/actor/vehicle/header.hbs',
            'systems/wh40k-rpg/templates/actor/vehicle/tabs.hbs',
            'systems/wh40k-rpg/templates/actor/vehicle/tab-overview.hbs',
            'systems/wh40k-rpg/templates/actor/vehicle/tab-combat.hbs',
            'systems/wh40k-rpg/templates/actor/vehicle/tab-crew.hbs',
            'systems/wh40k-rpg/templates/actor/vehicle/tab-components.hbs',
            'systems/wh40k-rpg/templates/actor/vehicle/tab-notes.hbs',
            'systems/wh40k-rpg/templates/actor/panel/vehicle-armour-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/vehicle-integrity-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/vehicle-movement-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/vehicle-upgrades-panel.hbs',

            // Starship sheet templates
            'systems/wh40k-rpg/templates/actor/starship/header.hbs',
            'systems/wh40k-rpg/templates/actor/starship/tabs.hbs',
            'systems/wh40k-rpg/templates/actor/starship/tab-stats.hbs',
            'systems/wh40k-rpg/templates/actor/starship/tab-components.hbs',
            'systems/wh40k-rpg/templates/actor/starship/tab-weapons.hbs',
            'systems/wh40k-rpg/templates/actor/starship/tab-crew.hbs',
            'systems/wh40k-rpg/templates/actor/starship/tab-history.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ship-components-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ship-crew-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ship-upgrades-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ship-weapons-panel.hbs',

            // NPC-only tab (NPCs otherwise reuse the PC templates in actor/player/).
            'systems/wh40k-rpg/templates/actor/npc/tab-npc.hbs',

            // NPC dialogs
            'systems/wh40k-rpg/templates/dialogs/npc-quick-create.hbs',
            'systems/wh40k-rpg/templates/dialogs/threat-scaler.hbs',
            'systems/wh40k-rpg/templates/dialogs/stat-block-exporter.hbs',
            'systems/wh40k-rpg/templates/dialogs/stat-block-parser.hbs',
            'systems/wh40k-rpg/templates/dialogs/batch-create.hbs',
            'systems/wh40k-rpg/templates/dialogs/template-selector.hbs',

            // NPC applications
            'systems/wh40k-rpg/templates/apps/encounter-builder.hbs',

            // NPC Template sheet templates
            'systems/wh40k-rpg/templates/item/npc-template/header.hbs',
            'systems/wh40k-rpg/templates/item/npc-template/tabs.hbs',
            'systems/wh40k-rpg/templates/item/npc-template/tab-basics.hbs',
            'systems/wh40k-rpg/templates/item/npc-template/tab-characteristics.hbs',
            'systems/wh40k-rpg/templates/item/npc-template/tab-equipment.hbs',
            'systems/wh40k-rpg/templates/item/npc-template/tab-abilities.hbs',
            'systems/wh40k-rpg/templates/item/npc-template/tab-preview.hbs',

            // Chat templates
            'systems/wh40k-rpg/templates/chat/item-card-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ship-weapon-chat.hbs',
            'systems/wh40k-rpg/templates/chat/talent-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/navigator-power-chat.hbs',
            'systems/wh40k-rpg/templates/chat/order-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ritual-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/simple-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/damage-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/psychic-action-chat.hbs',
            'systems/wh40k-rpg/templates/chat/force-field-roll-chat.hbs',

            // Unified roll dialog panels
            'systems/wh40k-rpg/templates/prompt/unified/panels/weapon-panel.hbs',
            'systems/wh40k-rpg/templates/prompt/unified/panels/psychic-panel.hbs',
            'systems/wh40k-rpg/templates/prompt/unified/panels/force-field-panel.hbs',

            // Roll prompt templates
            'systems/wh40k-rpg/templates/prompt/enhanced-skill-roll.hbs',
            'systems/wh40k-rpg/templates/prompt/simple-roll-prompt.hbs',
            'systems/wh40k-rpg/templates/prompt/weapon-roll-prompt.hbs',
            'systems/wh40k-rpg/templates/prompt/damage-roll-prompt.hbs',
            'systems/wh40k-rpg/templates/prompt/psychic-power-roll-prompt.hbs',
            'systems/wh40k-rpg/templates/prompt/force-field-prompt.hbs',
            'systems/wh40k-rpg/templates/prompt/assign-damage-prompt.hbs',

            // Item sheet templates
            'systems/wh40k-rpg/templates/item/item-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-weapon-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-armour-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-gear-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-trait-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-skill-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-psychic-power-sheet.hbs',
            'systems/wh40k-rpg/templates/item/ship-component-sheet.hbs',
            'systems/wh40k-rpg/templates/item/ship-weapon-sheet.hbs',
            'systems/wh40k-rpg/templates/item/ship-upgrade-sheet.hbs',

            // Item panels
            'systems/wh40k-rpg/templates/item/panel/active-effects-panel.hbs',
            'systems/wh40k-rpg/templates/item/panel/modifiers-editor-panel.hbs',
            'systems/wh40k-rpg/templates/item/panel/acquisition-panel.hbs',
            'systems/wh40k-rpg/templates/item/panel/description-panel.hbs',
            'systems/wh40k-rpg/templates/item/panel/item-header.hbs',
            'systems/wh40k-rpg/templates/item/panel/modifiers-panel.hbs',
            'systems/wh40k-rpg/templates/item/panel/modifiers-summary.hbs',
            'systems/wh40k-rpg/templates/item/panel/source-panel.hbs',

            // Vehicle panels
            'systems/wh40k-rpg/templates/actor/panel/vehicle-crew-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/vehicle-special-rules-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/vehicle-weapons-panel.hbs',

            // Component templates
            'systems/wh40k-rpg/templates/components/active-modifiers-panel.hbs',
        ];

        // Foundry V13's loadTemplates registers partials under the exact key
        // provided. Some consumers reference partials with the `.hbs` suffix
        // (e.g. `{{> systems/.../actor-identity.hbs}}`) and others without
        // (e.g. `{{> systems/.../vital-inline-row}}`). Register every partial
        // under BOTH keys so either style resolves.
        const map: Record<string, string> = {};
        for (const path of templates) {
            map[path] = path;
            if (path.endsWith('.hbs')) {
                map[path.slice(0, -4)] = path;
            }
        }
        return foundry.applications.handlebars.loadTemplates(map);
    }
}
