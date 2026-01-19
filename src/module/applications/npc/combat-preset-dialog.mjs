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
  #state = {
    mode: "library", // "library", "save", "load"
    npc: null,
    selectedPreset: null
  };

  /* -------------------------------------------- */
  /*  Static Configuration                        */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "combat-preset-dialog-{id}",
    classes: ["rogue-trader", "combat-preset-dialog"],
    tag: "div",
    window: {
      title: "RT.NPC.CombatPresets",
      icon: "fa-solid fa-bookmark"
    },
    position: {
      width: 700,
      height: 600
    },
    actions: {
      saveNew: CombatPresetDialog.#saveNew,
      loadSelected: CombatPresetDialog.#loadSelected,
      deletePreset: CombatPresetDialog.#deletePreset,
      exportPreset: CombatPresetDialog.#exportPreset,
      importPreset: CombatPresetDialog.#importPreset,
      selectPreset: CombatPresetDialog.#selectPreset
    }
  };

  /** @override */
  static PARTS = {
    form: {
      template: "systems/rogue-trader/templates/dialogs/combat-preset.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /**
   * Setting key for storing presets.
   * @type {string}
   */
  static SETTING_KEY = "combatPresets";

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * Create a new CombatPresetDialog.
   * @param {RogueTraderNPC} npc - The NPC actor (optional for library mode).
   * @param {string} mode - The dialog mode ("library", "save", "load").
   * @param {Object} options - Application options.
   */
  constructor(npc = null, mode = "library", options = {}) {
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
  static async showLibrary() {
    const dialog = new CombatPresetDialog(null, "library");
    dialog.render(true);
    return dialog;
  }

  /**
   * Save a preset from an NPC.
   * @param {RogueTraderNPC} npc - The NPC actor.
   * @returns {Promise<CombatPresetDialog>}
   */
  static async savePreset(npc) {
    const dialog = new CombatPresetDialog(npc, "save");
    dialog.render(true);
    return dialog;
  }

  /**
   * Load a preset onto an NPC.
   * @param {RogueTraderNPC} npc - The NPC actor.
   * @returns {Promise<CombatPresetDialog>}
   */
  static async loadPreset(npc) {
    const dialog = new CombatPresetDialog(npc, "load");
    dialog.render(true);
    return dialog;
  }

  /* -------------------------------------------- */
  /*  Preset Storage Methods                      */
  /* -------------------------------------------- */

  /**
   * Get all saved presets.
   * @returns {Array<Object>} Array of preset objects.
   */
  static getPresets() {
    return game.settings.get("rogue-trader", this.SETTING_KEY) || [];
  }

  /**
   * Save a preset.
   * @param {Object} preset - The preset data.
   * @returns {Promise<void>}
   */
  static async addPreset(preset) {
    const presets = this.getPresets();
    presets.push({
      ...preset,
      id: foundry.utils.randomID(),
      createdAt: Date.now()
    });
    await game.settings.set("rogue-trader", this.SETTING_KEY, presets);
  }

  /**
   * Update a preset.
   * @param {string} id - The preset ID.
   * @param {Object} updates - The updates to apply.
   * @returns {Promise<void>}
   */
  static async updatePreset(id, updates) {
    const presets = this.getPresets();
    const index = presets.findIndex(p => p.id === id);
    if (index >= 0) {
      presets[index] = { ...presets[index], ...updates };
      await game.settings.set("rogue-trader", this.SETTING_KEY, presets);
    }
  }

  /**
   * Delete a preset.
   * @param {string} id - The preset ID.
   * @returns {Promise<void>}
   */
  static async deletePresetById(id) {
    const presets = this.getPresets();
    const filtered = presets.filter(p => p.id !== id);
    await game.settings.set("rogue-trader", this.SETTING_KEY, filtered);
  }

  /**
   * Get a preset by ID.
   * @param {string} id - The preset ID.
   * @returns {Object|null} The preset or null.
   */
  static getPreset(id) {
    const presets = this.getPresets();
    return presets.find(p => p.id === id) || null;
  }

  /* -------------------------------------------- */
  /*  Preset Creation                             */
  /* -------------------------------------------- */

  /**
   * Create a preset from an NPC.
   * @param {RogueTraderNPC} npc - The NPC actor.
   * @param {string} name - The preset name.
   * @param {string} description - The preset description.
   * @returns {Object} The preset data.
   */
  static createPresetFromNPC(npc, name, description = "") {
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
      tags: [...(npc.system.tags || [])]
    };
  }

  /**
   * Apply a preset to an NPC.
   * @param {RogueTraderNPC} npc - The NPC actor.
   * @param {Object} preset - The preset data.
   * @returns {Promise<void>}
   */
  static async applyPresetToNPC(npc, preset) {
    const updates = {
      "system.faction": preset.faction,
      "system.type": preset.type,
      "system.role": preset.role,
      "system.threatLevel": preset.threatLevel,
      "system.characteristics": preset.characteristics,
      "system.wounds": preset.wounds,
      "system.movement": preset.movement,
      "system.size": preset.size,
      "system.initiative": preset.initiative,
      "system.trainedSkills": preset.trainedSkills,
      "system.weapons": preset.weapons,
      "system.armour": preset.armour,
      "system.horde": preset.horde,
      "system.tags": preset.tags
    };

    await npc.update(updates);
    ui.notifications.info(`Applied preset "${preset.name}" to ${npc.name}`);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.mode = this.#state.mode;
    context.npc = this.#state.npc ? {
      name: this.#state.npc.name,
      img: this.#state.npc.img,
      threatLevel: this.#state.npc.system.threatLevel,
      type: this.#state.npc.system.type,
      role: this.#state.npc.system.role
    } : null;

    // Get presets
    const presets = this.constructor.getPresets();
    context.presets = presets.map(p => ({
      ...p,
      selected: this.#state.selectedPreset === p.id,
      createdDate: new Date(p.createdAt).toLocaleDateString()
    }));
    context.hasPresets = presets.length > 0;

    context.selectedPreset = this.#state.selectedPreset 
      ? this.constructor.getPreset(this.#state.selectedPreset) 
      : null;

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
  static async #saveNew(event, target) {
    event.preventDefault();
    
    const form = target.closest("form");
    const name = form.querySelector('[name="presetName"]')?.value.trim();
    const description = form.querySelector('[name="presetDescription"]')?.value.trim();

    if (!name) {
      ui.notifications.warn("Please enter a preset name.");
      return;
    }

    if (!this.#state.npc) {
      ui.notifications.error("No NPC selected.");
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
  static async #loadSelected(event, target) {
    event.preventDefault();

    if (!this.#state.selectedPreset) {
      ui.notifications.warn("Please select a preset to load.");
      return;
    }

    if (!this.#state.npc) {
      ui.notifications.error("No NPC selected.");
      return;
    }

    const preset = this.constructor.getPreset(this.#state.selectedPreset);
    if (!preset) {
      ui.notifications.error("Preset not found.");
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
  static async #deletePreset(event, target) {
    event.preventDefault();

    const presetId = target.dataset.presetId;
    if (!presetId) return;

    const preset = this.constructor.getPreset(presetId);
    if (!preset) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Preset" },
      content: `<p>Delete preset <strong>${preset.name}</strong>?</p>`,
      rejectClose: false
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
  static async #exportPreset(event, target) {
    event.preventDefault();

    const presetId = target.dataset.presetId;
    if (!presetId) return;

    const preset = this.constructor.getPreset(presetId);
    if (!preset) return;

    const json = JSON.stringify(preset, null, 2);
    saveDataToFile(json, "application/json", `${preset.name.slugify()}.json`);
  }

  /**
   * Handle importing a preset.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #importPreset(event, target) {
    event.preventDefault();

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    
    input.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const preset = JSON.parse(text);
        
        // Basic validation
        if (!preset.name || !preset.characteristics) {
          throw new Error("Invalid preset format");
        }

        await this.constructor.addPreset(preset);
        ui.notifications.info(`Imported preset "${preset.name}"`);
        this.render();
      } catch (error) {
        ui.notifications.error("Failed to import preset: " + error.message);
      }
    });

    input.click();
  }

  /**
   * Handle selecting a preset.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #selectPreset(event, target) {
    event.preventDefault();
    const presetId = target.dataset.presetId;
    this.#state.selectedPreset = presetId;
    this.render();
  }
}
