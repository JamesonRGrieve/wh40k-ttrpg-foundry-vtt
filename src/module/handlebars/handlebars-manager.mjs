import { registerHandlebarsHelpers } from './handlebars-helpers.mjs';

/**
 * Manages Handlebars template loading with support for lazy loading.
 * Templates are categorized into:
 * - Core: Always preloaded (essential partials, chat templates)
 * - Deferred: Loaded on-demand when first needed (tab templates, secondary sheets)
 */
export class HandlebarManager {
    /**
     * Track which templates have been loaded.
     * @type {Set<string>}
     * @private
     */
    static _loadedTemplates = new Set();

    /**
     * Load core templates at startup.
     */
    static async loadTemplates() {
        await this.preloadHandlebarsTemplates();
    }

    static registerHelpers() {
        registerHandlebarsHelpers();
    }

    /**
     * Load a template on-demand if not already loaded.
     * Uses Foundry's template cache - if already loaded, returns immediately.
     * @param {string} templatePath - Full path to the template
     * @returns {Promise<void>}
     */
    static async loadTemplateOnDemand(templatePath) {
        if (this._loadedTemplates.has(templatePath)) return;
        
        await foundry.applications.handlebars.loadTemplates([templatePath]);
        this._loadedTemplates.add(templatePath);
    }

    /**
     * Load multiple templates on-demand.
     * @param {string[]} templatePaths - Array of template paths
     * @returns {Promise<void>}
     */
    static async loadTemplatesOnDemand(templatePaths) {
        const toLoad = templatePaths.filter(t => !this._loadedTemplates.has(t));
        if (toLoad.length === 0) return;
        
        await foundry.applications.handlebars.loadTemplates(toLoad);
        toLoad.forEach(t => this._loadedTemplates.add(t));
    }

    /**
     * Preload core templates that are needed immediately.
     * Deferred templates (tabs, secondary sheets) are loaded on-demand.
     */
    static preloadHandlebarsTemplates() {
        // Core templates - always needed
        const coreTemplates = [
            // Essential partials used across multiple sheets
            'systems/rogue-trader/templates/actor/partial/character-field.hbs',
            'systems/rogue-trader/templates/actor/partial/characteristic-hud-v2.hbs',
            'systems/rogue-trader/templates/actor/partial/display-toggle.hbs',
            'systems/rogue-trader/templates/actor/partial/trait-toggle.hbs',

            // Acolyte header and navigation (always visible)
            'systems/rogue-trader/templates/actor/acolyte/header.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tabs.hbs',
            'systems/rogue-trader/templates/actor/acolyte/tabs-sidebar.hbs',
            'systems/rogue-trader/templates/actor/acolyte/body.hbs',

            // Default tab (overview) - preload for fast initial render
            'systems/rogue-trader/templates/actor/acolyte/tab-overview.hbs',

            // Core panels used in overview tab
            'systems/rogue-trader/templates/actor/panel/wounds-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/fatigue-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/fate-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/corruption-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/insanity-panel-v2.hbs',
            'systems/rogue-trader/templates/actor/panel/movement-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/initiative-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/active-effects-panel.hbs',

            // Chat templates - needed for roll results
            'systems/rogue-trader/templates/chat/item-card-chat.hbs',
            'systems/rogue-trader/templates/chat/ship-weapon-chat.hbs',
            'systems/rogue-trader/templates/chat/talent-roll-chat.hbs',
            'systems/rogue-trader/templates/chat/navigator-power-chat.hbs',
            'systems/rogue-trader/templates/chat/order-roll-chat.hbs',
            'systems/rogue-trader/templates/chat/ritual-roll-chat.hbs',

            // Item panels (used in item sheets)
            'systems/rogue-trader/templates/item/panel/active-effects-panel.hbs',
        ];

        // Mark core templates as loaded
        coreTemplates.forEach(t => this._loadedTemplates.add(t));

        return foundry.applications.handlebars.loadTemplates(coreTemplates);
    }

    /**
     * Deferred templates organized by category.
     * These are loaded on-demand when the relevant sheet/tab is opened.
     */
    static DEFERRED_TEMPLATES = {
        // Acolyte tab templates (loaded when tab is first accessed)
        acolyteTabs: {
            combat: [
                'systems/rogue-trader/templates/actor/acolyte/tab-combat.hbs',
                'systems/rogue-trader/templates/actor/panel/combat-station-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/weapon-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/armour-display-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/combat-controls-panel.hbs',
            ],
            skills: [
                'systems/rogue-trader/templates/actor/acolyte/tab-skills.hbs',
                'systems/rogue-trader/templates/actor/panel/skills-panel.hbs',
            ],
            talents: [
                'systems/rogue-trader/templates/actor/acolyte/tab-talents.hbs',
                'systems/rogue-trader/templates/actor/panel/skills-specialist-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/talent-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/trait-panel.hbs',
            ],
            equipment: [
                'systems/rogue-trader/templates/actor/acolyte/tab-equipment.hbs',
                'systems/rogue-trader/templates/actor/panel/loadout-equipment-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/encumbrance-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/backpack-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/gear-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/cybernetic-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/force-field-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/storage-location-panel.hbs',
            ],
            powers: [
                'systems/rogue-trader/templates/actor/acolyte/tab-powers.hbs',
                'systems/rogue-trader/templates/actor/panel/psy-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/psychic-powers-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/navigator-powers-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/orders-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/rituals-panel.hbs',
            ],
            dynasty: [
                'systems/rogue-trader/templates/actor/acolyte/tab-dynasty.hbs',
                'systems/rogue-trader/templates/actor/panel/profit-factor-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/rogue-trader-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/acquisitions-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/ship-role-panel.hbs',
            ],
            biography: [
                'systems/rogue-trader/templates/actor/acolyte/tab-biography.hbs',
                'systems/rogue-trader/templates/actor/panel/biography-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/origin-path-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/journal-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/experience-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/peer-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/enemy-panel.hbs',
                'systems/rogue-trader/templates/actor/panel/aptitude-panel.hbs',
            ],
        },

        // Vehicle sheet templates
        vehicle: [
            'systems/rogue-trader/templates/actor/actor-vehicle-sheet.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-armour-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-integrity-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-movement-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/vehicle-upgrades-panel.hbs',
        ],

        // Starship sheet templates
        starship: [
            'systems/rogue-trader/templates/actor/actor-starship-sheet.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-components-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-crew-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-upgrades-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/ship-weapons-panel.hbs',
        ],

        // NPC sheet templates
        npc: [
            'systems/rogue-trader/templates/actor/actor-npc-sheet.hbs',
            'systems/rogue-trader/templates/actor/panel/characteristic-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/characteristic-roller-panel.hbs',
        ],

        // Legacy panels (used less frequently)
        legacy: [
            'systems/rogue-trader/templates/actor/panel/armour-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/bonuses-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/corruption-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/fate-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/fatigue-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/insanity-panel.hbs',
            'systems/rogue-trader/templates/actor/panel/wounds-panel.hbs',
        ],
    };

    /**
     * Load templates for a specific acolyte tab.
     * @param {string} tabName - Tab name (combat, skills, talents, equipment, powers, dynasty, biography)
     * @returns {Promise<void>}
     */
    static async loadAcolyteTabTemplates(tabName) {
        const templates = this.DEFERRED_TEMPLATES.acolyteTabs[tabName];
        if (templates) {
            await this.loadTemplatesOnDemand(templates);
        }
    }

    /**
     * Load templates for a specific actor type sheet.
     * @param {string} actorType - Actor type (vehicle, starship, npc)
     * @returns {Promise<void>}
     */
    static async loadActorSheetTemplates(actorType) {
        const templates = this.DEFERRED_TEMPLATES[actorType];
        if (templates) {
            await this.loadTemplatesOnDemand(templates);
        }
    }
}
