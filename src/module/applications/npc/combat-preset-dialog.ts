/**
 * @file CombatPresetDialog - Save and load NPC combat presets
 * Phase 7: QoL Features
 *
 * Provides:
 * - Save current NPC configuration as named preset
 * - Load preset onto existing NPC
 * - Manage preset library (view, delete)
 * - Export/import presets as JSON
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for managing combat presets (NPC templates).
 * Allows GMs to save common NPC builds and quickly apply them.
 *
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export default class CombatPresetDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /**
     * Internal state for the dialog.
     * @type {Object}
     */
    #state: any = {
        mode: 'library', // "library", "save", "load"
        npc: null,
        selectedPreset: null,
    };

    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'combat-preset-dialog-{id}',
        classes: ['wh40k-rpg', 'combat-preset-dialog'],
        tag: 'div',
        window: {
            title: 'WH40K.NPC.CombatPresets',
            icon: 'fa-solid fa-bookmark',
        },
        position: {
            width: 700,
            height: 600,
        },
        actions: {
            saveNew: CombatPresetDialog.#saveNew,
            loadSelected: CombatPresetDialog.#loadSelected,
            deletePreset: CombatPresetDialog.#deletePreset,
            exportPreset: CombatPresetDialog.#exportPreset,
            importPreset: CombatPresetDialog.#importPreset,
            selectPreset: CombatPresetDialog.#selectPreset,
        },
    };

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/combat-preset.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    /**
     * Setting key for storing presets.
     * @type {string}
     */
    static SETTING_KEY = 'combatPresets';

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    /**
     * Create a new CombatPresetDialog.
     * @param {WH40KNPC} npc - The NPC actor (optional for library mode).
     * @param {string} mode - The dialog mode ("library", "save", "load").
     * @param {Object} options - Application options.
     */
    constructor(npc: any = null, mode: string = 'library', options = {}) {
        super(options);
        this.#state.npc = npc;
        this.#state.mode = mode;
    }

    /* -------------------------------------------- */
    /*  Static Factory Methods                      */
    /* -------------------------------------------- */

    /**
     * Show the preset library.
     * @returns {Promise<CombatPresetDialog>}
     */
    static showLibrary(): any {
        const dialog = new CombatPresetDialog(null, 'library');
        void dialog.render(true);
        return dialog;
    }

    /**
     * Save a preset from an NPC.
     * @param {WH40KNPC} npc - The NPC actor.
     * @returns {Promise<CombatPresetDialog>}
     */
    static savePreset(npc: any): any {
        const dialog = new CombatPresetDialog(npc, 'save');
        void dialog.render(true);
        return dialog;
    }

    /**
     * Load a preset onto an NPC.
     * @param {WH40KNPC} npc - The NPC actor.
     * @returns {Promise<CombatPresetDialog>}
     */
    static loadPreset(npc: any): any {
        const dialog = new CombatPresetDialog(npc, 'load');
        void dialog.render(true);
        return dialog;
    }

    /* -------------------------------------------- */
    /*  Preset Storage Methods                      */
    /* -------------------------------------------- */

    /**
     * Get all saved presets.
     * @returns {Array<Object>} Array of preset objects.
     */
    static getPresets(): any {
        return game.settings.get('wh40k-rpg', this.SETTING_KEY) || [];
    }

    /**
     * Save a preset.
     * @param {Object} preset - The preset data.
     * @returns {Promise<void>}
     */
    static async addPreset(preset: any): Promise<void> {
        const presets = this.getPresets();
        presets.push({
            ...preset,
            id: foundry.utils.randomID(),
            createdAt: Date.now(),
        });
        await game.settings.set('wh40k-rpg', this.SETTING_KEY, presets);
    }

    /**
     * Update a preset.
     * @param {string} id - The preset ID.
     * @param {Object} updates - The updates to apply.
     * @returns {Promise<void>}
     */
    static async updatePreset(id: string, updates: any): Promise<void> {
        const presets = this.getPresets();
        const index = presets.findIndex((p: any) => p.id === id);
        if (index >= 0) {
            presets[index] = { ...presets[index], ...updates };
            await game.settings.set('wh40k-rpg', this.SETTING_KEY, presets);
        }
    }

    /**
     * Delete a preset.
     * @param {string} id - The preset ID.
     * @returns {Promise<void>}
     */
    static async deletePresetById(id: string): Promise<void> {
        const presets = this.getPresets();
        const filtered = presets.filter((p: any) => p.id !== id);
        await game.settings.set('wh40k-rpg', this.SETTING_KEY, filtered);
    }

    /**
     * Get a preset by ID.
     * @param {string} id - The preset ID.
     * @returns {Object|null} The preset or null.
     */
    static getPreset(id: string): any {
        const presets = this.getPresets();
        return presets.find((p: any) => p.id === id) || null;
    }

    /* -------------------------------------------- */
    /*  Preset Creation                             */
    /* -------------------------------------------- */

    /**
     * Create a preset from an NPC.
     * @param {WH40KNPC} npc - The NPC actor.
     * @param {string} name - The preset name.
     * @param {string} description - The preset description.
     * @returns {Object} The preset data.
     */
    static createPresetFromNPC(npc: any, name: string, description: string = ''): any {
        return {
            name,
            description,
            faction: npc.system.faction,
            type: npc.system.type,
            role: npc.system.role,
            threatLevel: npc.system.threatLevel,
            characteristics: foundry.utils.deepClone(npc.system.characteristics),
            wounds: foundry.utils.deepClone(npc.system.wounds),
            movement: foundry.utils.deepClone(npc.system.movement),
            size: npc.system.size,
            initiative: foundry.utils.deepClone(npc.system.initiative),
            trainedSkills: foundry.utils.deepClone(npc.system.trainedSkills),
            weapons: foundry.utils.deepClone(npc.system.weapons),
            armour: foundry.utils.deepClone(npc.system.armour),
            horde: foundry.utils.deepClone(npc.system.horde),
            tags: [...(npc.system.tags || [])],
        };
    }

    /**
     * Apply a preset to an NPC.
     * @param {WH40KNPC} npc - The NPC actor.
     * @param {Object} preset - The preset data.
     * @returns {Promise<void>}
     */
    static async applyPresetToNPC(npc: any, preset: any): Promise<void> {
        const updates = {
            'system.faction': preset.faction,
            'system.type': preset.type,
            'system.role': preset.role,
            'system.threatLevel': preset.threatLevel,
            'system.characteristics': preset.characteristics,
            'system.wounds': preset.wounds,
            'system.movement': preset.movement,
            'system.size': preset.size,
            'system.initiative': preset.initiative,
            'system.trainedSkills': preset.trainedSkills,
            'system.weapons': preset.weapons,
            'system.armour': preset.armour,
            'system.horde': preset.horde,
            'system.tags': preset.tags,
        };

        await npc.update(updates);
        ui.notifications.info(`Applied preset "${preset.name}" to ${npc.name}`);
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        // @ts-expect-error - argument type
        const context: any = await super._prepareContext(options);

        context.mode = this.#state.mode;
        context.npc = this.#state.npc
            ? {
                  name: this.#state.npc.name,
                  img: this.#state.npc.img,
                  threatLevel: this.#state.npc.system.threatLevel,
                  type: this.#state.npc.system.type,
                  role: this.#state.npc.system.role,
              }
            : null;

        // Get presets
        const presets = (this.constructor as any).getPresets();
        context.presets = presets.map((p: any) => ({
            ...p,
            selected: this.#state.selectedPreset === p.id,
            createdDate: new Date(p.createdAt).toLocaleDateString(),
        }));
        context.hasPresets = presets.length > 0;

        context.selectedPreset = this.#state.selectedPreset ? (this.constructor as any).getPreset(this.#state.selectedPreset) : null;

        return context;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle saving a new preset.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #saveNew(this: any, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();

        const form = target.closest('form');
        const name = (form.querySelector('[name="presetName"]') as HTMLInputElement | null)?.value.trim();
        const description = (form.querySelector('[name="presetDescription"]') as HTMLTextAreaElement | null)?.value.trim();

        if (!name) {
            ui.notifications.warn('Please enter a preset name.');
            return;
        }

        if (!this.#state.npc) {
            ui.notifications.error('No NPC selected.');
            return;
        }

        const preset = this.constructor.createPresetFromNPC(this.#state.npc, name, description);
        await this.constructor.addPreset(preset);

        ui.notifications.info(`Saved preset "${name}"`);
        this.close();
    }

    /**
     * Handle loading selected preset.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #loadSelected(this: any, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();

        if (!this.#state.selectedPreset) {
            ui.notifications.warn('Please select a preset to load.');
            return;
        }

        if (!this.#state.npc) {
            ui.notifications.error('No NPC selected.');
            return;
        }

        const preset = this.constructor.getPreset(this.#state.selectedPreset);
        if (!preset) {
            ui.notifications.error('Preset not found.');
            return;
        }

        await this.constructor.applyPresetToNPC(this.#state.npc, preset);
        this.close();
    }

    /**
     * Handle deleting a preset.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #deletePreset(this: any, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();

        const presetId = target.dataset.presetId;
        if (!presetId) return;

        const preset = this.constructor.getPreset(presetId);
        if (!preset) return;

        const confirmed = await (foundry as any).applications.api.DialogV2.confirm({
            window: { title: 'Delete Preset' },
            content: `<p>Delete preset <strong>${preset.name}</strong>?</p>`,
            rejectClose: false,
        });

        if (confirmed) {
            await this.constructor.deletePresetById(presetId);
            ui.notifications.info(`Deleted preset "${preset.name}"`);
            this.render();
        }
    }

    /**
     * Handle exporting a preset.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #exportPreset(this: any, event: Event, target: HTMLElement): void {
        event.preventDefault();

        const presetId = target.dataset.presetId;
        if (!presetId) return;

        const preset = this.constructor.getPreset(presetId);
        if (!preset) return;

        const json = JSON.stringify(preset, null, 2);
        (saveDataToFile as any)(json, 'application/json', `${preset.name.slugify()}.json`);
    }

    /**
     * Handle importing a preset.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #importPreset(this: any, event: Event, target: HTMLElement): void {
        event.preventDefault();

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', (e) => {
            void (async () => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const preset = JSON.parse(text);

                    // Basic validation
                    if (!preset.name || !preset.characteristics) {
                        throw new Error('Invalid preset format');
                    }

                    await this.constructor.addPreset(preset);
                    ui.notifications.info(`Imported preset "${preset.name}"`);
                    this.render();
                } catch (error: any) {
                    ui.notifications.error(`Failed to import preset: ${error.message}`);
                }
            })();
        });

        input.click();
    }

    /**
     * Handle selecting a preset.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #selectPreset(this: any, event: Event, target: HTMLElement): void {
        event.preventDefault();
        const presetId = target.dataset.presetId;
        this.#state.selectedPreset = presetId;
        this.render();
    }
}
