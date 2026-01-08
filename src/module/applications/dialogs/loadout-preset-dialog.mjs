/**
 * @file LoadoutPresetDialog - Dialog for managing equipment loadout presets
 * Allows saving, loading, and managing preset equipment configurations
 */

import { ApplicationV2Mixin } from "../api/application-v2-mixin.mjs";

/**
 * Dialog for managing equipment loadout presets.
 * @extends {foundry.applications.api.DialogV2}
 */
export default class LoadoutPresetDialog extends ApplicationV2Mixin(foundry.applications.api.DialogV2) {
    
    /** @override */
    static DEFAULT_OPTIONS = {
        window: {
            title: "Equipment Loadout Presets",
            icon: "fas fa-layer-group",
            resizable: true
        },
        position: {
            width: 600,
            height: 500
        },
        classes: ["rt-loadout-preset-dialog"],
        actions: {
            savePreset: LoadoutPresetDialog.#onSavePreset,
            loadPreset: LoadoutPresetDialog.#onLoadPreset,
            deletePreset: LoadoutPresetDialog.#onDeletePreset,
            renamePreset: LoadoutPresetDialog.#onRenamePreset,
            exportPreset: LoadoutPresetDialog.#onExportPreset,
            importPreset: LoadoutPresetDialog.#onImportPreset
        }
    };

    /** @override */
    static PARTS = {
        content: {
            template: "systems/rogue-trader/templates/dialogs/loadout-preset-dialog.hbs"
        },
        footer: {
            template: "templates/generic/form-footer.hbs"
        }
    };

    /* -------------------------------------------- */

    /**
     * Create a new loadout preset dialog.
     * @param {Actor} actor  The actor to manage presets for.
     * @param {object} options  Additional options.
     */
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
    }

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Get saved presets
        const presets = this.actor.getFlag("rogue-trader", "equipmentPresets") || [];
        
        // Get current loadout
        const currentLoadout = this._captureCurrentLoadout();
        
        context.actor = this.actor;
        context.presets = presets;
        context.currentLoadout = currentLoadout;
        context.hasPresets = presets.length > 0;

        // Add buttons
        context.buttons = [
            {
                type: "button",
                action: "savePreset",
                icon: "fas fa-save",
                label: "Save Current as Preset",
                class: "rt-btn-primary"
            },
            {
                type: "button",
                action: "close",
                icon: "fas fa-times",
                label: "Close"
            }
        ];

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Capture the current equipment loadout state.
     * @returns {object}  Loadout data.
     * @private
     */
    _captureCurrentLoadout() {
        const items = this.actor.items.filter(i => 
            ["weapon", "armour", "gear", "cybernetic", "forceField"].includes(i.type)
        );

        const loadout = {
            equipped: [],
            activated: []
        };

        for (const item of items) {
            if (item.system.equipped) {
                loadout.equipped.push({
                    id: item.id,
                    name: item.name,
                    type: item.type,
                    img: item.img
                });
            }
            if (item.system.active || item.system.activated) {
                loadout.activated.push({
                    id: item.id,
                    name: item.name
                });
            }
        }

        return loadout;
    }

    /* -------------------------------------------- */

    /**
     * Handle saving the current loadout as a new preset.
     * @param {Event} event  The triggering event.
     * @param {HTMLElement} target  The target element.
     * @private
     */
    static async #onSavePreset(event, target) {
        event.preventDefault();

        // Prompt for preset name
        const name = await foundry.applications.api.DialogV2.prompt({
            window: {
                title: "Save Loadout Preset"
            },
            content: `
                <div class="form-group">
                    <label>Preset Name:</label>
                    <input type="text" name="presetName" placeholder="e.g., Combat, Social, Exploration" autofocus />
                </div>
            `,
            ok: {
                label: "Save",
                callback: (event, button, dialog) => button.form.elements.presetName.value
            }
        });

        if (!name || !name.trim()) return;

        // Capture current loadout
        const loadout = this._captureCurrentLoadout();

        // Get existing presets
        const presets = this.actor.getFlag("rogue-trader", "equipmentPresets") || [];

        // Check for duplicate name
        const existingIndex = presets.findIndex(p => p.name.toLowerCase() === name.trim().toLowerCase());
        
        if (existingIndex !== -1) {
            const overwrite = await foundry.applications.api.DialogV2.confirm({
                window: { title: "Overwrite Preset?" },
                content: `<p>A preset named "${name}" already exists. Overwrite it?</p>`,
                rejectClose: false
            });

            if (!overwrite) return;

            // Overwrite existing
            presets[existingIndex] = {
                id: foundry.utils.randomID(),
                name: name.trim(),
                loadout: loadout,
                timestamp: Date.now()
            };
        } else {
            // Add new preset
            presets.push({
                id: foundry.utils.randomID(),
                name: name.trim(),
                loadout: loadout,
                timestamp: Date.now()
            });
        }

        // Save to flags
        await this.actor.setFlag("rogue-trader", "equipmentPresets", presets);

        // Notify user
        foundry.applications.api.Toast.info(`Loadout preset "${name}" saved.`, { duration: 3000 });

        // Re-render dialog
        this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle loading a preset.
     * @param {Event} event  The triggering event.
     * @param {HTMLElement} target  The target element.
     * @private
     */
    static async #onLoadPreset(event, target) {
        event.preventDefault();

        const presetId = target.dataset.presetId;
        if (!presetId) return;

        // Get preset
        const presets = this.actor.getFlag("rogue-trader", "equipmentPresets") || [];
        const preset = presets.find(p => p.id === presetId);

        if (!preset) {
            foundry.applications.api.Toast.error("Preset not found.", { duration: 3000 });
            return;
        }

        // Confirm load
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Load Preset?" },
            content: `<p>Load preset "<strong>${preset.name}</strong>"? This will change your current equipment setup.</p>`,
            rejectClose: false
        });

        if (!confirmed) return;

        // Apply preset
        await this._applyPreset(preset);

        foundry.applications.api.Toast.info(`Loadout preset "${preset.name}" loaded.`, { duration: 3000 });

        // Close dialog
        this.close();
    }

    /* -------------------------------------------- */

    /**
     * Apply a preset to the actor's equipment.
     * @param {object} preset  The preset to apply.
     * @returns {Promise<void>}
     * @private
     */
    async _applyPreset(preset) {
        const loadout = preset.loadout;
        
        // First, unequip and deactivate everything
        const updates = [];
        for (const item of this.actor.items) {
            if (!["weapon", "armour", "gear", "cybernetic", "forceField"].includes(item.type)) continue;
            
            const update = { _id: item.id };
            let needsUpdate = false;

            if (item.system.equipped) {
                update["system.equipped"] = false;
                needsUpdate = true;
            }
            if (item.system.active || item.system.activated) {
                update["system.active"] = false;
                update["system.activated"] = false;
                needsUpdate = true;
            }

            if (needsUpdate) updates.push(update);
        }

        if (updates.length > 0) {
            await this.actor.updateEmbeddedDocuments("Item", updates);
        }

        // Then, equip items from preset
        const equipUpdates = [];
        for (const equipped of loadout.equipped) {
            const item = this.actor.items.get(equipped.id);
            if (item) {
                equipUpdates.push({
                    _id: equipped.id,
                    "system.equipped": true
                });
            }
        }

        if (equipUpdates.length > 0) {
            await this.actor.updateEmbeddedDocuments("Item", equipUpdates);
        }

        // Finally, activate items from preset
        const activateUpdates = [];
        for (const activated of loadout.activated) {
            const item = this.actor.items.get(activated.id);
            if (item) {
                activateUpdates.push({
                    _id: activated.id,
                    "system.active": true
                });
            }
        }

        if (activateUpdates.length > 0) {
            await this.actor.updateEmbeddedDocuments("Item", activateUpdates);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting a preset.
     * @param {Event} event  The triggering event.
     * @param {HTMLElement} target  The target element.
     * @private
     */
    static async #onDeletePreset(event, target) {
        event.preventDefault();

        const presetId = target.dataset.presetId;
        if (!presetId) return;

        // Get preset
        const presets = this.actor.getFlag("rogue-trader", "equipmentPresets") || [];
        const preset = presets.find(p => p.id === presetId);

        if (!preset) return;

        // Confirm delete
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Delete Preset?" },
            content: `<p>Delete preset "<strong>${preset.name}</strong>"? This cannot be undone.</p>`,
            rejectClose: false
        });

        if (!confirmed) return;

        // Remove preset
        const newPresets = presets.filter(p => p.id !== presetId);
        await this.actor.setFlag("rogue-trader", "equipmentPresets", newPresets);

        foundry.applications.api.Toast.info(`Preset "${preset.name}" deleted.`, { duration: 3000 });

        // Re-render
        this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle renaming a preset.
     * @param {Event} event  The triggering event.
     * @param {HTMLElement} target  The target element.
     * @private
     */
    static async #onRenamePreset(event, target) {
        event.preventDefault();

        const presetId = target.dataset.presetId;
        if (!presetId) return;

        // Get preset
        const presets = this.actor.getFlag("rogue-trader", "equipmentPresets") || [];
        const preset = presets.find(p => p.id === presetId);

        if (!preset) return;

        // Prompt for new name
        const newName = await foundry.applications.api.DialogV2.prompt({
            window: { title: "Rename Preset" },
            content: `
                <div class="form-group">
                    <label>New Name:</label>
                    <input type="text" name="presetName" value="${preset.name}" autofocus />
                </div>
            `,
            ok: {
                label: "Rename",
                callback: (event, button, dialog) => button.form.elements.presetName.value
            }
        });

        if (!newName || !newName.trim() || newName.trim() === preset.name) return;

        // Update preset name
        preset.name = newName.trim();
        preset.timestamp = Date.now();

        await this.actor.setFlag("rogue-trader", "equipmentPresets", presets);

        foundry.applications.api.Toast.info(`Preset renamed to "${newName}".`, { duration: 3000 });

        // Re-render
        this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle exporting a preset to JSON.
     * @param {Event} event  The triggering event.
     * @param {HTMLElement} target  The target element.
     * @private
     */
    static async #onExportPreset(event, target) {
        event.preventDefault();

        const presetId = target.dataset.presetId;
        if (!presetId) return;

        // Get preset
        const presets = this.actor.getFlag("rogue-trader", "equipmentPresets") || [];
        const preset = presets.find(p => p.id === presetId);

        if (!preset) return;

        // Export to JSON file
        const json = JSON.stringify(preset, null, 2);
        const filename = `${preset.name.slugify()}-loadout.json`;
        
        saveDataToFile(json, "application/json", filename);

        foundry.applications.api.Toast.info(`Preset "${preset.name}" exported.`, { duration: 3000 });
    }

    /* -------------------------------------------- */

    /**
     * Handle importing a preset from JSON.
     * @param {Event} event  The triggering event.
     * @param {HTMLElement} target  The target element.
     * @private
     */
    static async #onImportPreset(event, target) {
        event.preventDefault();

        // Create file input
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const preset = JSON.parse(text);

                // Validate preset structure
                if (!preset.name || !preset.loadout) {
                    throw new Error("Invalid preset format");
                }

                // Get existing presets
                const presets = this.actor.getFlag("rogue-trader", "equipmentPresets") || [];

                // Assign new ID and timestamp
                preset.id = foundry.utils.randomID();
                preset.timestamp = Date.now();

                // Check for duplicate name
                const existingIndex = presets.findIndex(p => p.name.toLowerCase() === preset.name.toLowerCase());
                
                if (existingIndex !== -1) {
                    const overwrite = await foundry.applications.api.DialogV2.confirm({
                        window: { title: "Overwrite Preset?" },
                        content: `<p>A preset named "${preset.name}" already exists. Overwrite it?</p>`,
                        rejectClose: false
                    });

                    if (!overwrite) {
                        // Prompt for new name
                        const newName = await foundry.applications.api.DialogV2.prompt({
                            window: { title: "Rename Imported Preset" },
                            content: `
                                <div class="form-group">
                                    <label>New Name:</label>
                                    <input type="text" name="presetName" value="${preset.name} (Imported)" autofocus />
                                </div>
                            `,
                            ok: {
                                label: "Import",
                                callback: (event, button, dialog) => button.form.elements.presetName.value
                            }
                        });

                        if (!newName || !newName.trim()) return;
                        preset.name = newName.trim();
                    } else {
                        presets[existingIndex] = preset;
                        await this.actor.setFlag("rogue-trader", "equipmentPresets", presets);
                        foundry.applications.api.Toast.info(`Preset "${preset.name}" imported and overwrote existing.`, { duration: 3000 });
                        this.render();
                        return;
                    }
                }

                // Add imported preset
                presets.push(preset);
                await this.actor.setFlag("rogue-trader", "equipmentPresets", presets);

                foundry.applications.api.Toast.info(`Preset "${preset.name}" imported successfully.`, { duration: 3000 });

                // Re-render
                this.render();

            } catch (err) {
                foundry.applications.api.Toast.error(`Failed to import preset: ${err.message}`, { duration: 5000 });
                console.error("Loadout preset import error:", err);
            }
        };

        input.click();
    }

    /* -------------------------------------------- */

    /**
     * Show the loadout preset dialog for an actor.
     * @param {Actor} actor  The actor to manage presets for.
     * @returns {Promise<LoadoutPresetDialog>}
     */
    static async show(actor) {
        const dialog = new LoadoutPresetDialog(actor);
        dialog.render(true);
        return dialog;
    }
}
