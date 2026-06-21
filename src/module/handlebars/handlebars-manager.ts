import { registerIconHelper } from '../icons/helper.ts';
import { registerHandlebarsHelpers } from './handlebars-helpers.ts';

/**
 * Manages Handlebars template loading and helper registration.
 * All templates are loaded at system initialization for simplicity and reliability.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: stable API surface with many callers across the codebase
export class HandlebarManager {
    /**
     * Load all templates at startup.
     */
    static async loadTemplates(): Promise<void> {
        await this.preloadHandlebarsTemplates();
    }

    static registerHelpers(): void {
        registerHandlebarsHelpers();
        registerIconHelper();
    }

    /**
     * Load all system templates at startup.
     * This is simpler and more reliable than lazy-loading.
     */
    static async preloadHandlebarsTemplates(): Promise<void> {
        const templates = [
            // Essential partials
            'systems/wh40k-rpg/templates/actor/partial/actor-identity.hbs',
            'systems/wh40k-rpg/templates/actor/partial/character-field.hbs',
            'systems/wh40k-rpg/templates/actor/partial/display-toggle.hbs',
            'systems/wh40k-rpg/templates/actor/partial/sidebar-header.hbs',
            'systems/wh40k-rpg/templates/actor/partial/sidebar-field-row.hbs',
            'systems/wh40k-rpg/templates/actor/partial/sidebar-fields-panel.hbs',
            'systems/wh40k-rpg/templates/actor/partial/origin-path-bubbles.hbs',
            // Character-creation builder: characteristic-generation mode partials
            'systems/wh40k-rpg/templates/character-creation/partials/char-gen-characteristic-grid.hbs',
            'systems/wh40k-rpg/templates/character-creation/partials/char-gen-divination.hbs',
            'systems/wh40k-rpg/templates/character-creation/partials/char-gen-pointbuy.hbs',
            'systems/wh40k-rpg/templates/actor/partial/daemonic-immunities-badge.hbs',
            'systems/wh40k-rpg/templates/actor/partial/header-base.hbs',
            'systems/wh40k-rpg/templates/actor/partial/trait-toggle.hbs',
            'systems/wh40k-rpg/templates/actor/partial/card-section-label.hbs',
            'systems/wh40k-rpg/templates/actor/partial/panel-header.hbs',
            'systems/wh40k-rpg/templates/actor/partial/panel.hbs',
            'systems/wh40k-rpg/templates/actor/partial/system-card.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-panel-shell.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-quick-controls.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-progress-bar.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-edit-input.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-info-card.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-edit-body.hbs',
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
            'systems/wh40k-rpg/templates/actor/partial/item-table.hbs',
            'systems/wh40k-rpg/templates/actor/partial/item-table-row.hbs',
            'systems/wh40k-rpg/templates/actor/partial/skill-row.hbs',
            'systems/wh40k-rpg/templates/actor/partial/labeled-rich-text-section.hbs',
            'systems/wh40k-rpg/templates/actor/partial/movement-stat-row.hbs',
            'systems/wh40k-rpg/templates/actor/partial/wounds-pip-row.hbs',
            'systems/wh40k-rpg/templates/actor/partial/armour-silhouette.hbs',
            'systems/wh40k-rpg/templates/actor/partial/armour-zone.hbs',
            'systems/wh40k-rpg/templates/actor/partial/circular-icon-button.hbs',
            'systems/wh40k-rpg/templates/actor/partial/stat-breakdown-button.hbs',
            'systems/wh40k-rpg/templates/actor/partial/labeled-stat-chip.hbs',
            'systems/wh40k-rpg/templates/actor/partial/vital-pip-row.hbs',
            'systems/wh40k-rpg/templates/dialogs/partial/dialog-footer.hbs',
            'systems/wh40k-rpg/templates/dialogs/partial/advancement-blocked-affordance.hbs',
            'systems/wh40k-rpg/templates/chat/partial/chat-card-shell.hbs',
            'systems/wh40k-rpg/templates/chat/partial/modern-card-shell.hbs',
            'systems/wh40k-rpg/templates/chat/partial/item-detail-row.hbs',
            'systems/wh40k-rpg/templates/chat/partial/roll-card-shell.hbs',
            'systems/wh40k-rpg/templates/chat/partial/modifier-breakdown.hbs',
            'systems/wh40k-rpg/templates/chat/partial/extended-test-progress.hbs',
            'systems/wh40k-rpg/templates/shared/field-row.hbs',
            'systems/wh40k-rpg/templates/shared/editable-portrait.hbs',
            'systems/wh40k-rpg/templates/shared/sheet-action-button.hbs',
            'systems/wh40k-rpg/templates/shared/accent-heading.hbs',

            // Acolyte sheet templates
            'systems/wh40k-rpg/templates/actor/player/header-sidebar.hbs',
            'systems/wh40k-rpg/templates/actor/player/header-dh.hbs',
            'systems/wh40k-rpg/templates/actor/player/tabs.hbs',
            'systems/wh40k-rpg/templates/actor/player/body.hbs',
            'systems/wh40k-rpg/templates/actor/player/tab-overview.hbs',
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
            'systems/wh40k-rpg/templates/actor/panel/subtlety-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/corruption-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/insanity-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/shock-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/possession-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/npc-interactions-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/experience-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/movement-panel-full.hbs',
            'systems/wh40k-rpg/templates/actor/panel/movement-panel-compact.hbs',
            'systems/wh40k-rpg/templates/actor/panel/active-effects-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/active-effects-compact.hbs',
            'systems/wh40k-rpg/templates/actor/panel/combat-station-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/weapon-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/combat-controls-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/combat-actions-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/combat-action-group.hbs',
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
            'systems/wh40k-rpg/templates/actor/panel/dark-pact-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/mortification-button.hbs',
            'systems/wh40k-rpg/templates/actor/panel/fanatic-button.hbs',
            'systems/wh40k-rpg/templates/actor/panel/grapple-controller-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/endeavour-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ship-role-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/journal-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/characteristic-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/characteristic-roller-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/bonuses-panel.hbs',

            // Craft sheet templates (terracraft / aircraft / watercraft)
            'systems/wh40k-rpg/templates/actor/craft/header.hbs',
            'systems/wh40k-rpg/templates/actor/craft/tabs.hbs',
            'systems/wh40k-rpg/templates/actor/craft/tab-overview.hbs',
            'systems/wh40k-rpg/templates/actor/craft/tab-combat.hbs',
            'systems/wh40k-rpg/templates/actor/craft/tab-crew.hbs',
            'systems/wh40k-rpg/templates/actor/craft/tab-components.hbs',
            'systems/wh40k-rpg/templates/actor/craft/tab-notes.hbs',
            'systems/wh40k-rpg/templates/actor/loot/loot-sheet.hbs',
            'systems/wh40k-rpg/templates/actor/panel/vehicle-armour-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/vehicle-integrity-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/vehicle-movement-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/vehicle-upgrades-panel.hbs',

            // Voidcraft sheet templates
            'systems/wh40k-rpg/templates/actor/voidcraft/header.hbs',
            'systems/wh40k-rpg/templates/actor/voidcraft/tabs.hbs',
            'systems/wh40k-rpg/templates/actor/voidcraft/tab-stats.hbs',
            'systems/wh40k-rpg/templates/actor/voidcraft/tab-components.hbs',
            'systems/wh40k-rpg/templates/actor/voidcraft/tab-weapons.hbs',
            'systems/wh40k-rpg/templates/actor/voidcraft/tab-crew.hbs',
            'systems/wh40k-rpg/templates/actor/voidcraft/tab-history.hbs',
            'systems/wh40k-rpg/templates/actor/voidcraft/tab-extended-actions.hbs',
            'systems/wh40k-rpg/templates/actor/voidcraft/tab-manoeuvre-actions.hbs',
            'systems/wh40k-rpg/templates/chat/extended-action-chat.hbs',
            'systems/wh40k-rpg/templates/chat/manoeuvre-action-chat.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ship-components-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ship-crew-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ship-points-budget-panel.hbs',
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
            'systems/wh40k-rpg/templates/dialogs/fate-uses.hbs',
            'systems/wh40k-rpg/templates/dialogs/inventory-generator-dialog.hbs',

            // NPC applications
            'systems/wh40k-rpg/templates/apps/encounter-builder.hbs',

            // NPC Template sheet templates
            'systems/wh40k-rpg/templates/item/partial/item-tab-strip.hbs',
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
            'systems/wh40k-rpg/templates/chat/ship-critical-hit-chat.hbs',
            'systems/wh40k-rpg/templates/chat/talent-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/navigator-power-chat.hbs',
            'systems/wh40k-rpg/templates/chat/order-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ritual-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/simple-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/damage-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/psychic-action-chat.hbs',
            'systems/wh40k-rpg/templates/chat/force-field-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/daemonhost-binding-chat.hbs',
            'systems/wh40k-rpg/templates/chat/mortification-chat.hbs',
            'systems/wh40k-rpg/templates/chat/fanatic-chat.hbs',
            'systems/wh40k-rpg/templates/chat/shock-snap-chat.hbs',

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
            'systems/wh40k-rpg/templates/prompt/partial/prompt-panel.hbs',
            'systems/wh40k-rpg/templates/prompt/partial/prompt-row.hbs',
            'systems/wh40k-rpg/templates/prompt/assign-damage-prompt.hbs',
            'systems/wh40k-rpg/templates/prompt/daemon-weapon-attribute-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/daemon-weapon-attribute-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/daemonhost-binding-dialog.hbs',
            'systems/wh40k-rpg/templates/prompt/mutant-background-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/mutant-background-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/within-homeworld-info-dialog.hbs',
            'systems/wh40k-rpg/templates/prompt/incorruptible-devotion-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/incorruptible-devotion-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/sanctic-purity-prompt.hbs',
            'systems/wh40k-rpg/templates/chat/sanctic-purity-negated-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/fear-test-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/fear-test-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/grenade-throw-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/grenade-throw-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/radical-services-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/radical-services-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/beyond-homeworld-info-dialog.hbs',
            'systems/wh40k-rpg/templates/prompt/mutation-roll-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/mutation-roll-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/disorder-roll-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/disorder-roll-chat.hbs',
            'systems/wh40k-rpg/templates/chat/possession-frenzy-chat.hbs',
            'systems/wh40k-rpg/templates/chat/aerial-manoeuvre-chat.hbs',
            'systems/wh40k-rpg/templates/chat/critical-damage-chat.hbs',
            'systems/wh40k-rpg/templates/chat/two-weapon-refocus-chat.hbs',
            'systems/wh40k-rpg/templates/chat/sanctic-daemonology-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/medicae-mechadendrite-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/medicae-mechadendrite-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/cybernetics-install-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/cybernetics-install-chat.hbs',
            'systems/wh40k-rpg/templates/actor/panel/crusader-button.hbs',
            'systems/wh40k-rpg/templates/chat/crusader-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/without-homeworld-info-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/push-the-limit-chat.hbs',
            'systems/wh40k-rpg/templates/chat/weapon-quality-effect-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/right-stuff-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/right-stuff-chat.hbs',
            'systems/wh40k-rpg/templates/actor/voidcraft/action-bar-manoeuvres.hbs',
            'systems/wh40k-rpg/templates/chat/ship-ramming-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ship-boarding-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ship-hit-and-run-chat.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ship-build-summary-panel.hbs',
            'systems/wh40k-rpg/templates/prompt/warp-travel-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/warp-travel-chat.hbs',
            'systems/wh40k-rpg/templates/chat/warp-travel-peril-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/colony-growth-dialog.hbs',
            'systems/wh40k-rpg/templates/chat/colony-growth-chat.hbs',
            'systems/wh40k-rpg/templates/actor/panel/bc-alignment-panel.hbs',

            // Batch-1 engine panels / chats / dialogs (BC #178, DW #162-#167, OW #151-#154).
            'systems/wh40k-rpg/templates/actor/panel/bc-psychic-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/dw-astartes-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/dw-cohesion-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/dw-mode-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/dw-renown-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/dw-requisition-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ow-comrade-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ow-logistics-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ow-orders-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ow-regiment-panel.hbs',
            'systems/wh40k-rpg/templates/chat/bc-psychic-test-chat.hbs',
            'systems/wh40k-rpg/templates/chat/dw-cohesion-chat.hbs',
            'systems/wh40k-rpg/templates/chat/dw-mode-chat.hbs',
            'systems/wh40k-rpg/templates/chat/dw-requisition-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ow-comrade-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ow-logistics-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ow-orders-chat.hbs',
            'systems/wh40k-rpg/templates/prompt/logistics-test-dialog.hbs',
            'systems/wh40k-rpg/templates/prompt/regiment-builder-dialog.hbs',

            // Batch-2 engine panels / chats (BC #179-#182, DW #168-#172, OW #155).
            'systems/wh40k-rpg/templates/actor/panel/bc-daemon-prince-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/bc-gifts-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/bc-ritual-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/bc-supplements-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/dw-ammo-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/dw-distinction-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/dw-mission-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/dw-oath-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/dw-vehicle-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ow-mission-gear-panel.hbs',
            // Batch-3 engine panels (OW #156, #157, #158)
            'systems/wh40k-rpg/templates/actor/panel/ow-vehicle-movement-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ow-comrade-healing-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ow-craftsmanship-panel.hbs',
            // Batch-4 engine panels (OW #159, #160, #161)
            'systems/wh40k-rpg/templates/actor/panel/ow-mount-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ow-drawback-panel.hbs',
            'systems/wh40k-rpg/templates/actor/panel/ow-battlefield-panel.hbs',
            'systems/wh40k-rpg/templates/chat/bc-ascension-chat.hbs',
            'systems/wh40k-rpg/templates/chat/bc-ritual-chat.hbs',
            'systems/wh40k-rpg/templates/chat/dw-mission-reward-chat.hbs',
            'systems/wh40k-rpg/templates/chat/dw-oath-chat.hbs',
            'systems/wh40k-rpg/templates/chat/dw-vehicle-crit-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ow-mission-gear-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ow-vehicle-action-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ow-comrade-healing-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ow-mount-action-chat.hbs',
            'systems/wh40k-rpg/templates/chat/ow-battlefield-chat.hbs',

            // Item sheet templates
            'systems/wh40k-rpg/templates/item/item-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-lead-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-location-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-weapon-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-armour-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-gear-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-trait-sheet.hbs',
            'systems/wh40k-rpg/templates/item/item-content-block-sheet.hbs',
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
        await foundry.applications.handlebars.loadTemplates(map);
    }
}
