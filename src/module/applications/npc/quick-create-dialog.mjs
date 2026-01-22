/**
 * @file NPCQuickCreateDialog - Quick NPC creation dialog
 * Phase 3: Quick Create Dialog (USER PRIORITY)
 *
 * Provides:
 * - Fast NPC creation with threat-based auto-generation
 * - Live stat preview as settings change
 * - Equipment preset selection
 * - Horde mode toggle
 */

import ThreatCalculator from './threat-calculator.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for quickly creating NPCs with auto-generated stats.
 * @extends {ApplicationV2}
 */
export default class NPCQuickCreateDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'npc-quick-create-{id}',
        classes: ['rogue-trader', 'npc-quick-create-dialog'],
        tag: 'form',
        window: {
            title: 'RT.NPC.QuickCreate',
            icon: 'fa-solid fa-user-plus',
            minimizable: false,
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 650,
            height: 700,
        },
        form: {
            handler: this.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        actions: {
            cancel: this.#onCancel,
            updatePreview: this.#onUpdatePreview,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/rogue-trader/templates/dialogs/npc-quick-create.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Current form state for preview.
     * @type {Object}
     */
    #state = {
        name: 'New NPC',
        threatLevel: 5,
        role: 'specialist',
        type: 'troop',
        preset: 'mixed',
        faction: '',
        isHorde: false,
    };

    /**
     * Promise resolver.
     * @type {Function|null}
     */
    #resolve = null;

    /**
     * Whether the dialog was submitted.
     * @type {boolean}
     */
    #submitted = false;

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    /**
     * @param {Object} [config] - Initial configuration.
     * @param {string} [config.name] - Default NPC name.
     * @param {number} [config.threatLevel] - Default threat level.
     * @param {string} [config.role] - Default role.
     * @param {string} [config.type] - Default type.
     * @param {string} [config.preset] - Default equipment preset.
     * @param {string} [config.faction] - Default faction.
     * @param {boolean} [config.isHorde] - Default horde mode.
     * @param {Object} [options] - Application options.
     */
    constructor(config = {}, options = {}) {
        super(options);
        this.#state = {
            name: config.name ?? 'New NPC',
            threatLevel: config.threatLevel ?? 5,
            role: config.role ?? 'specialist',
            type: config.type ?? 'troop',
            preset: config.preset ?? 'mixed',
            faction: config.faction ?? '',
            isHorde: config.isHorde ?? false,
        };
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Get available options
        const roles = ThreatCalculator.getRoles();
        const presets = ThreatCalculator.getPresets();
        const types = ThreatCalculator.getTypes();

        // Generate preview data
        const previewData = ThreatCalculator.generateNPCData(this.#state);
        const tier = ThreatCalculator.getTier(this.#state.threatLevel);

        // Prepare characteristics for display
        const characteristics = Object.entries(previewData.characteristics).map(([key, char]) => ({
            key,
            label: char.label,
            short: char.short,
            value: char.base,
            bonus: Math.floor(char.base / 10),
        }));

        // Prepare skills for display
        const skills = Object.entries(previewData.trainedSkills).map(([key, skill]) => {
            let level = '';
            if (skill.plus20) level = '+20';
            else if (skill.plus10) level = '+10';
            else if (skill.trained) level = '';

            return {
                key,
                name: skill.name || key,
                level,
                bonus: skill.bonus || 0,
            };
        });

        // Prepare weapons for display
        const weapons = previewData.weapons.simple.map((w) => ({
            name: w.name,
            damage: w.damage,
            pen: w.pen,
            range: w.range,
        }));

        return {
            ...context,

            // Form state
            state: this.#state,

            // Options
            roles: roles.map((r) => ({
                ...r,
                selected: r.key === this.#state.role,
            })),
            presets: presets.map((p) => ({
                ...p,
                selected: p.key === this.#state.preset,
            })),
            types: types.map((t) => ({
                ...t,
                selected: t.key === this.#state.type,
            })),

            // Threat tier info
            tierName: tier.name,
            tierDescription: this._getTierDescription(this.#state.threatLevel),

            // Preview data
            preview: {
                characteristics,
                skills,
                weapons,
                wounds: previewData.wounds.max,
                armour: previewData.armour.total,
                movement: previewData.movement,
            },

            // Buttons
            buttons: [
                { type: 'submit', icon: 'fa-solid fa-plus', label: 'RT.NPC.Create', cssClass: 'primary' },
                { type: 'button', action: 'cancel', icon: 'fa-solid fa-times', label: 'Cancel' },
            ],
        };
    }

    /**
     * Get threat tier description text.
     * @param {number} threatLevel - The threat level.
     * @returns {string} Description text.
     * @private
     */
    _getTierDescription(threatLevel) {
        if (threatLevel <= 5) return game.i18n.localize('RT.NPC.TierMinor');
        if (threatLevel <= 10) return game.i18n.localize('RT.NPC.TierStandard');
        if (threatLevel <= 15) return game.i18n.localize('RT.NPC.TierTough');
        if (threatLevel <= 20) return game.i18n.localize('RT.NPC.TierElite');
        return game.i18n.localize('RT.NPC.TierBoss');
    }

    /* -------------------------------------------- */

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);

        // Add live update listeners
        const form = this.element;

        // Name input
        const nameInput = form.querySelector('[name="name"]');
        if (nameInput) {
            nameInput.addEventListener('input', () => {
                this.#state.name = nameInput.value || 'New NPC';
            });
        }

        // Threat level slider
        const threatSlider = form.querySelector('[name="threatLevel"]');
        const threatValue = form.querySelector('.threat-value');
        if (threatSlider) {
            threatSlider.addEventListener('input', () => {
                this.#state.threatLevel = parseInt(threatSlider.value, 10);
                if (threatValue) threatValue.textContent = this.#state.threatLevel;
                this._debounceRender();
            });
        }

        // Role select
        const roleSelect = form.querySelector('[name="role"]');
        if (roleSelect) {
            roleSelect.addEventListener('change', () => {
                this.#state.role = roleSelect.value;
                this._debounceRender();
            });
        }

        // Type select
        const typeSelect = form.querySelector('[name="type"]');
        if (typeSelect) {
            typeSelect.addEventListener('change', () => {
                this.#state.type = typeSelect.value;
                // Auto-enable horde mode for horde/swarm types
                if (this.#state.type === 'horde' || this.#state.type === 'swarm') {
                    this.#state.isHorde = true;
                }
                this._debounceRender();
            });
        }

        // Equipment preset select
        const presetSelect = form.querySelector('[name="preset"]');
        if (presetSelect) {
            presetSelect.addEventListener('change', () => {
                this.#state.preset = presetSelect.value;
                this._debounceRender();
            });
        }

        // Faction input
        const factionInput = form.querySelector('[name="faction"]');
        if (factionInput) {
            factionInput.addEventListener('input', () => {
                this.#state.faction = factionInput.value;
            });
        }

        // Horde checkbox
        const hordeCheckbox = form.querySelector('[name="isHorde"]');
        if (hordeCheckbox) {
            hordeCheckbox.addEventListener('change', () => {
                this.#state.isHorde = hordeCheckbox.checked;
                this._debounceRender();
            });
        }
    }

    /**
     * Debounced render for preview updates.
     * @private
     */
    _debounceRender() {
        if (this._renderTimeout) clearTimeout(this._renderTimeout);
        this._renderTimeout = setTimeout(() => {
            this.render({ parts: ['form'] });
        }, 150);
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle form submission.
     * @param {Event} event - The submit event.
     * @param {HTMLFormElement} form - The form element.
     * @param {FormDataExtended} formData - The form data.
     */
    static async #onSubmit(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);

        // Update state from form
        this.#state.name = data.name || 'New NPC';
        this.#state.threatLevel = parseInt(data.threatLevel, 10) || 5;
        this.#state.role = data.role || 'specialist';
        this.#state.type = data.type || 'troop';
        this.#state.preset = data.preset || 'mixed';
        this.#state.faction = data.faction || '';
        this.#state.isHorde = data.isHorde === true || data.isHorde === 'true';

        // Generate NPC data
        const npcSystemData = ThreatCalculator.generateNPCData(this.#state);

        // Create the actor
        const actorData = {
            name: this.#state.name,
            type: 'npcV2',
            img: 'icons/svg/mystery-man.svg',
            system: npcSystemData,
        };

        try {
            const actor = await Actor.create(actorData);

            if (actor) {
                ui.notifications.info(`Created NPC: ${actor.name}`);

                // Open the sheet
                actor.sheet.render(true);

                this.#submitted = true;
                if (this.#resolve) this.#resolve(actor);
            }
        } catch (error) {
            console.error('Failed to create NPC:', error);
            ui.notifications.error('Failed to create NPC');
            if (this.#resolve) this.#resolve(null);
        }
    }

    /**
     * Handle cancel button.
     * @param {PointerEvent} event - The click event.
     * @param {HTMLElement} target - The target element.
     */
    static async #onCancel(event, target) {
        this.#submitted = false;
        if (this.#resolve) this.#resolve(null);
        await this.close();
    }

    /**
     * Handle preview update (for any action that triggers re-render).
     * @param {PointerEvent} event - The click event.
     * @param {HTMLElement} target - The target element.
     */
    static async #onUpdatePreview(event, target) {
        // Re-render to update preview
        this.render({ parts: ['form'] });
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    async close(options = {}) {
        // Clear any pending render
        if (this._renderTimeout) clearTimeout(this._renderTimeout);

        // Resolve as null if not submitted
        if (!this.#submitted && this.#resolve) {
            this.#resolve(null);
        }

        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Wait for the dialog to complete.
     * @returns {Promise<Actor|null>} The created actor, or null if cancelled.
     */
    async wait() {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            this.render(true);
        });
    }

    /* -------------------------------------------- */
    /*  Static Factory Methods                      */
    /* -------------------------------------------- */

    /**
     * Open the quick create dialog and wait for result.
     * @param {Object} [config] - Initial configuration.
     * @returns {Promise<Actor|null>} The created actor, or null if cancelled.
     */
    static async create(config = {}) {
        const dialog = new this(config);
        return dialog.wait();
    }

    /**
     * Create multiple NPCs at once (batch creation).
     * @param {Object} config - Configuration for batch creation.
     * @param {number} config.count - Number of NPCs to create.
     * @param {string} config.namePattern - Name pattern (use {n} for number).
     * @param {boolean} config.randomize - Whether to randomize stats slightly.
     * @param {Object} config.baseConfig - Base NPC configuration.
     * @returns {Promise<Array<Actor>>} Array of created actors.
     */
    static async createBatch(config) {
        const { count = 1, namePattern = 'NPC {n}', randomize = false, baseConfig = {} } = config;

        const actors = [];
        const baseData = ThreatCalculator.generateNPCData(baseConfig);

        for (let i = 1; i <= count; i++) {
            const name = namePattern.replace('{n}', i);

            // Clone and optionally randomize
            const systemData = foundry.utils.deepClone(baseData);

            if (randomize) {
                // Randomize characteristics slightly (±5)
                for (const char of Object.values(systemData.characteristics)) {
                    const variance = Math.floor(Math.random() * 11) - 5;
                    char.base = Math.max(10, Math.min(99, char.base + variance));
                    char.total = char.base + char.modifier;
                    char.bonus = Math.floor(char.total / 10);
                }
            }

            const actorData = {
                name,
                type: 'npcV2',
                img: 'icons/svg/mystery-man.svg',
                system: systemData,
            };

            const actor = await Actor.create(actorData);
            if (actor) actors.push(actor);
        }

        ui.notifications.info(`Created ${actors.length} NPCs`);
        return actors;
    }
}
