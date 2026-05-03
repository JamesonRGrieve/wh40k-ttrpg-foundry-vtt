import type { WH40KNPC } from '../../documents/npc.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface Preset {
    id: string;
    name: string;
    description: string;
    createdAt: number;
    faction: string;
    type: string;
    role: string;
    threatLevel: number;
    characteristics: Record<string, unknown>;
    wounds: Record<string, unknown>;
    movement: Record<string, unknown>;
    size: string;
    initiative: Record<string, unknown>;
    trainedSkills: Record<string, unknown>;
    weapons: Record<string, unknown>;
    armour: Record<string, unknown>;
    horde: Record<string, unknown>;
    tags: string[];
}

interface DialogState {
    mode: 'library' | 'save' | 'load';
    npc: WH40KNPC | null;
    selectedPreset: string | null;
}

/**
 * Dialog for managing combat presets (NPC templates).
 * Allows GMs to save common NPC builds and quickly apply them.
 *
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export default class CombatPresetDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /**
     * Internal state for the dialog.
     * @type {DialogState}
     */
    #state: DialogState = {
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
     * @param {WH40KNPC | null} npc - The NPC actor (optional for library mode).
     * @param {'library' | 'save' | 'load'} mode - The dialog mode ("library", "save", "load").
     * @param {Record<string, unknown>} options - Application options.
     */
    constructor(npc: WH40KNPC | null = null, mode: 'library' | 'save' | 'load' = 'library', options: Record<string, unknown> = {}) {
        super(options);
        this.#state.npc = npc;
        this.#state.mode = mode;
    }

    /* -------------------------------------------- */
    /*  Static Factory Methods                      */
    /* -------------------------------------------- */

    /**
     * Show the preset library.
     * @returns {CombatPresetDialog}
     */
    static showLibrary(): CombatPresetDialog {
        const dialog = new CombatPresetDialog(null, 'library');
        void dialog.render(true);
        return dialog;
    }

    /**
     * Save a preset from an NPC.
     * @param {WH40KNPC} npc - The NPC actor.
     * @returns {CombatPresetDialog}
     */
    static savePreset(npc: WH40KNPC): CombatPresetDialog {
        const dialog = new CombatPresetDialog(npc, 'save');
        void dialog.render(true);
        return dialog;
    }

    /**
     * Load a preset onto an NPC.
     * @param {WH40KNPC} npc - The NPC actor.
     * @returns {CombatPresetDialog}
     */
    static loadPreset(npc: WH40KNPC): CombatPresetDialog {
        const dialog = new CombatPresetDialog(npc, 'load');
        void dialog.render(true);
        return dialog;
    }

    /* -------------------------------------------- */
    /*  Preset Storage Methods                      */
    /* -------------------------------------------- */

    /**
     * Get all saved presets.
     * @returns {Preset[]} Array of preset objects.
     */
    static getPresets(): Preset[] {
        return (game.settings.get('wh40k-rpg', this.SETTING_KEY) as Preset[]) || [];
    }

    /**
     * Save a preset.
     * @param {Omit<Preset, 'id' | 'createdAt'>} preset - The preset data.
     * @returns {Promise<void>}
     */
    static async addPreset(preset: Omit<Preset, 'id' | 'createdAt'>): Promise<void> {
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
     * @param {Partial<Preset>} updates - The updates to apply.
     * @returns {Promise<void>}
     */
    static async updatePreset(id: string, updates: Partial<Preset>): Promise<void> {
        const presets = this.getPresets();
        const index = presets.findIndex((p: Preset) => p.id === id);
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
        const filtered = presets.filter((p: Preset) => p.id !== id);
        await game.settings.set('wh40k-rpg', this.SETTING_KEY, filtered);
    }

    /**
     * Get a preset by ID.
     * @param {string} id - The preset ID.
     * @returns {Preset | null} The preset or null.
     */
    static getPreset(id: string): Preset | null {
        const presets = this.getPresets();
        return presets.find((p: Preset) => p.id === id) || null;
    }

    /* -------------------------------------------- */
    /*  Preset Creation                             */
    /* -------------------------------------------- */

    /**
     * Create a preset from an NPC.
     * @param {WH40KNPC} npc - The NPC actor.
     * @param {string} name - The preset name.
     * @param {string} description - The preset description.
     * @returns {Omit<Preset, 'id' | 'createdAt'>} The preset data.
     */
    static createPresetFromNPC(npc: WH40KNPC, name: string, description: string = ''): Omit<Preset, 'id' | 'createdAt'> {
        const system = npc.system as any;
        return {
            name,
            description,
            faction: system.faction,
            type: system.type,
            role: system.role,
            threatLevel: system.threatLevel,
            characteristics: foundry.utils.deepClone(system.characteristics),
            wounds: foundry.utils.deepClone(system.wounds),
            movement: foundry.utils.deepClone(system.movement),
            size: system.size,
            initiative: foundry.utils.deepClone(system.initiative),
            trainedSkills: foundry.utils.deepClone(system.trainedSkills),
            weapons: foundry.utils.deepClone(system.weapons),
            armour: foundry.utils.deepClone(system.armour),
            horde: foundry.utils.deepClone(system.horde),
            tags: [...(system.tags || [])],
        };
    }

    /**
     * Apply a preset to an NPC.
     * @param {WH40KNPC} npc - The NPC actor.
     * @param {Preset} preset - The preset data.
     * @returns {Promise<void>}
     */
    static async applyPresetToNPC(npc: WH40KNPC, preset: Preset): Promise<void> {
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

        await npc.update(updates as Record<string, unknown>);
        ui.notifications.info(`Applied preset "${preset.name}" to ${npc.name}`);
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = (await super._prepareContext(options as never)) as Record<string, unknown>;

        context.mode = this.#state.mode;
        context.npc = this.#state.npc
            ? {
                  name: this.#state.npc.name,
                  img: this.#state.npc.img,
                  threatLevel: (this.#state.npc.system as any).threatLevel,
                  type: (this.#state.npc.system as any).type,
                  role: (this.#state.npc.system as any).role,
              }
            : null;

        // Get presets
        const presets = CombatPresetDialog.getPresets();
        context.presets = presets.map((p: Preset) => ({
            ...p,
            selected: this.#state.selectedPreset === p.id,
            createdDate: new Date(p.createdAt).toLocaleDateString(),
        }));
        context.hasPresets = presets.length > 0;

        context.selectedPreset = this.#state.selectedPreset ? CombatPresetDialog.getPreset(this.#state.selectedPreset) : null;

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
    static async #saveNew(this: CombatPresetDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();

        const form = target.closest('form');
        const name = (form?.querySelector('[name="presetName"]') as HTMLInputElement | null)?.value.trim();
        const description = (form?.querySelector('[name="presetDescription"]') as HTMLTextAreaElement | null)?.value.trim();

        if (!name) {
            ui.notifications.warn('Please enter a preset name.');
            return;
        }

        if (!this.#state.npc) {
            ui.notifications.error('No NPC selected.');
            return;
        }

        const preset = CombatPresetDialog.createPresetFromNPC(this.#state.npc, name, description);
        await CombatPresetDialog.addPreset(preset);

        ui.notifications.info(`Saved preset "${name}"`);
        this.close();
    }

    /**
     * Handle loading selected preset.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #loadSelected(this: CombatPresetDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();

        if (!this.#state.selectedPreset) {
            ui.notifications.warn('Please select a preset to load.');
            return;
        }

        if (!this.#state.npc) {
            ui.notifications.error('No NPC selected.');
            return;
        }

        const preset = CombatPresetDialog.getPreset(this.#state.selectedPreset);
        if (!preset) {
            ui.notifications.error('Preset not found.');
            return;
        }

        await CombatPresetDialog.applyPresetToNPC(this.#state.npc, preset);
        this.close();
    }

    /**
     * Handle deleting a preset.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #deletePreset(this: CombatPresetDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();

        const presetId = target.dataset.presetId;
        if (!presetId) return;

        const preset = CombatPresetDialog.getPreset(presetId);
        if (!preset) return;

        const confirmed = await (foundry as any).applications.api.DialogV2.confirm({
            window: { title: 'Delete Preset' },
            content: `<p>Delete preset <strong>${preset.name}</strong>?</p>`,
            rejectClose: false,
        });

        if (confirmed) {
            await CombatPresetDialog.deletePresetById(presetId);
            ui.notifications.info(`Deleted preset "${preset.name}"`);
            this.render();
        }
    }

    /**
     * Handle exporting a preset.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #exportPreset(this: CombatPresetDialog, event: PointerEvent, target: HTMLElement): void {
        event.preventDefault();

        const presetId = target.dataset.presetId;
        if (!presetId) return;

        const preset = CombatPresetDialog.getPreset(presetId);
        if (!preset) return;

        const json = JSON.stringify(preset, null, 2);
        (saveDataToFile as any)(json, 'application/json', `${preset.name.slugify()}.json`);
    }

    /**
     * Handle importing a preset.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #importPreset(this: CombatPresetDialog, event: PointerEvent, target: HTMLElement): void {
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
                    const preset = JSON.parse(text) as Preset;

                    // Basic validation
                    if (!preset.name || !preset.characteristics) {
                        throw new Error('Invalid preset format');
                    }

                    await CombatPresetDialog.addPreset(preset);
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
    static #selectPreset(this: CombatPresetDialog, event: PointerEvent, target: HTMLElement): void {
        event.preventDefault();
        const presetId = target.dataset.presetId;
        if (presetId) {
            this.#state.selectedPreset = presetId;
            this.render();
        }
    }
}
