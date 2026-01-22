/**
 * @file BatchCreateDialog - Create multiple NPCs at once
 * Phase 6: Advanced GM Tools
 * 
 * Provides:
 * - Create X identical NPCs from configuration
 * - Name pattern support ({n} for numbering)
 * - Random stat variation option
 * - Folder organization option
 */

import ThreatCalculator from "./threat-calculator.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for creating multiple NPCs at once.
 * @extends {ApplicationV2}
 */
export default class BatchCreateDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /* -------------------------------------------- */
  /*  Static Configuration                        */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "batch-create-dialog-{id}",
    classes: ["rogue-trader", "batch-create-dialog"],
    tag: "form",
    window: {
      title: "RT.NPC.BatchCreate.Title",
      icon: "fa-solid fa-users",
      minimizable: false,
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 550,
      height: 550
    },
    form: {
      handler: BatchCreateDialog.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      cancel: BatchCreateDialog.#onCancel,
      updatePreview: BatchCreateDialog.#onUpdatePreview
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    form: {
      template: "systems/rogue-trader/templates/dialogs/batch-create.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Form state.
   * @type {Object}
   */
  #state = {
    namePattern: "NPC {n}",
    count: 3,
    threatLevel: 5,
    role: "specialist",
    type: "troop",
    preset: "mixed",
    faction: "",
    isHorde: false,
    randomize: false,
    randomizeAmount: 10,
    folder: "",
    openSheets: false
  };

  /**
   * Promise resolver.
   * @type {Function|null}
   */
  #resolve = null;

  /**
   * Whether submitted.
   * @type {boolean}
   */
  #submitted = false;

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {Object} [config] - Initial configuration.
   * @param {Object} [options] - Application options.
   */
  constructor(config = {}, options = {}) {
    super(options);
    Object.assign(this.#state, config);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // Get options
    const roles = ThreatCalculator.getRoles();
    const presets = ThreatCalculator.getPresets();
    const types = ThreatCalculator.getTypes();
    
    // Get available folders
    const folders = game.folders
      .filter(f => f.type === "Actor" && f.displayed)
      .map(f => ({ id: f.id, name: f.name }));
    
    // Generate preview names
    const previewNames = [];
    for (let i = 1; i <= Math.min(this.#state.count, 5); i++) {
      previewNames.push(this.#state.namePattern.replace("{n}", i));
    }
    if (this.#state.count > 5) {
      previewNames.push("...");
      previewNames.push(this.#state.namePattern.replace("{n}", this.#state.count));
    }
    
    // Calculate tier
    const tier = ThreatCalculator.getTier(this.#state.threatLevel);
    
    return {
      ...context,
      state: this.#state,
      
      roles: roles.map(r => ({ ...r, selected: r.key === this.#state.role })),
      presets: presets.map(p => ({ ...p, selected: p.key === this.#state.preset })),
      types: types.map(t => ({ ...t, selected: t.key === this.#state.type })),
      folders: folders.map(f => ({ ...f, selected: f.id === this.#state.folder })),
      
      tierName: tier.name,
      previewNames,
      
      buttons: [
        { type: "submit", icon: "fa-solid fa-plus", label: "RT.NPC.BatchCreate.Create", cssClass: "primary" },
        { type: "button", action: "cancel", icon: "fa-solid fa-times", label: "Cancel" }
      ]
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    
    const form = this.element;
    
    // Bind live update handlers
    const fields = [
      { name: "namePattern", type: "string" },
      { name: "count", type: "number" },
      { name: "threatLevel", type: "number" },
      { name: "role", type: "string" },
      { name: "type", type: "string" },
      { name: "preset", type: "string" },
      { name: "faction", type: "string" },
      { name: "isHorde", type: "boolean" },
      { name: "randomize", type: "boolean" },
      { name: "randomizeAmount", type: "number" },
      { name: "folder", type: "string" },
      { name: "openSheets", type: "boolean" }
    ];
    
    for (const field of fields) {
      const el = form.querySelector(`[name="${field.name}"]`);
      if (!el) continue;
      
      el.addEventListener(field.type === "boolean" ? "change" : "input", () => {
        if (field.type === "boolean") {
          this.#state[field.name] = el.checked;
        } else if (field.type === "number") {
          this.#state[field.name] = parseInt(el.value, 10) || 0;
        } else {
          this.#state[field.name] = el.value;
        }
        this._debounceRender();
      });
    }
    
    // Update threat value display
    const threatSlider = form.querySelector('[name="threatLevel"]');
    const threatValue = form.querySelector('.threat-value');
    if (threatSlider && threatValue) {
      threatSlider.addEventListener("input", () => {
        threatValue.textContent = threatSlider.value;
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
      this.render({ parts: ["form"] });
    }, 150);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle form submission.
   * @param {Event} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    
    // Update state from form
    this.#state.namePattern = data.namePattern || "NPC {n}";
    this.#state.count = Math.max(1, Math.min(100, parseInt(data.count, 10) || 1));
    this.#state.threatLevel = parseInt(data.threatLevel, 10) || 5;
    this.#state.role = data.role || "specialist";
    this.#state.type = data.type || "troop";
    this.#state.preset = data.preset || "mixed";
    this.#state.faction = data.faction || "";
    this.#state.isHorde = data.isHorde === true || data.isHorde === "true";
    this.#state.randomize = data.randomize === true || data.randomize === "true";
    this.#state.randomizeAmount = parseInt(data.randomizeAmount, 10) || 10;
    this.#state.folder = data.folder || "";
    this.#state.openSheets = data.openSheets === true || data.openSheets === "true";
    
    // Create the NPCs
    const actors = await this._createNPCs();
    
    if (actors.length > 0) {
      ui.notifications.info(game.i18n.format("RT.NPC.BatchCreate.Success", { count: actors.length }));
      
      // Open sheets if requested (only first 5 to avoid overwhelming)
      if (this.#state.openSheets) {
        const toOpen = actors.slice(0, 5);
        for (const actor of toOpen) {
          actor.sheet.render(true);
        }
      }
      
      this.#submitted = true;
      if (this.#resolve) this.#resolve(actors);
    } else {
      ui.notifications.error(game.i18n.localize("RT.NPC.BatchCreate.Failed"));
      if (this.#resolve) this.#resolve([]);
    }
  }

  /**
   * Create the NPCs based on current state.
   * @returns {Promise<Array<Actor>>}
   * @private
   */
  async _createNPCs() {
    const actors = [];
    
    // Generate base data
    const baseConfig = {
      threatLevel: this.#state.threatLevel,
      role: this.#state.role,
      type: this.#state.type,
      preset: this.#state.preset,
      faction: this.#state.faction,
      isHorde: this.#state.isHorde
    };
    
    const baseData = ThreatCalculator.generateNPCData(baseConfig);
    
    for (let i = 1; i <= this.#state.count; i++) {
      const name = this.#state.namePattern.replace("{n}", i);
      
      // Clone and optionally randomize
      const systemData = foundry.utils.deepClone(baseData);
      
      if (this.#state.randomize) {
        const variance = this.#state.randomizeAmount / 100;
        
        // Randomize characteristics
        for (const char of Object.values(systemData.characteristics)) {
          const delta = Math.floor((Math.random() * 2 - 1) * char.base * variance);
          char.base = Math.max(10, Math.min(99, char.base + delta));
          char.total = char.base + char.modifier;
          char.bonus = Math.floor(char.total / 10);
        }
        
        // Randomize wounds slightly
        const woundVariance = Math.floor((Math.random() * 2 - 1) * systemData.wounds.max * variance);
        systemData.wounds.max = Math.max(1, systemData.wounds.max + woundVariance);
        systemData.wounds.value = systemData.wounds.max;
      }
      
      const actorData = {
        name,
        type: "npcV2",
        img: "icons/svg/mystery-man.svg",
        system: systemData
      };
      
      // Add folder if specified
      if (this.#state.folder) {
        actorData.folder = this.#state.folder;
      }
      
      try {
        const actor = await Actor.create(actorData);
        if (actor) actors.push(actor);
      } catch (err) {
        console.error(`Failed to create NPC "${name}":`, err);
      }
    }
    
    return actors;
  }

  /**
   * Handle cancel button.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onCancel(event, target) {
    this.#submitted = false;
    if (this.#resolve) this.#resolve([]);
    await this.close();
  }

  /**
   * Handle preview update.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onUpdatePreview(event, target) {
    this.render({ parts: ["form"] });
  }

  /* -------------------------------------------- */
  /*  Lifecycle                                   */
  /* -------------------------------------------- */

  /** @override */
  async close(options = {}) {
    if (this._renderTimeout) clearTimeout(this._renderTimeout);
    
    if (!this.#submitted && this.#resolve) {
      this.#resolve([]);
    }
    
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Wait for dialog completion.
   * @returns {Promise<Array<Actor>>} Created actors.
   */
  async wait() {
    return new Promise((resolve) => {
      this.#resolve = resolve;
      this.render(true);
    });
  }

  /**
   * Open the batch create dialog.
   * @param {Object} [config] - Initial configuration.
   * @returns {Promise<Array<Actor>>} Created actors.
   */
  static async open(config = {}) {
    const dialog = new this(config);
    return dialog.wait();
  }

  /**
   * Quick batch create without dialog.
   * @param {Object} config - Configuration.
   * @param {string} config.namePattern - Name pattern with {n} placeholder.
   * @param {number} config.count - Number to create.
   * @param {number} [config.threatLevel=5] - Threat level.
   * @param {string} [config.role="specialist"] - NPC role.
   * @param {string} [config.type="troop"] - NPC type.
   * @param {string} [config.preset="mixed"] - Equipment preset.
   * @param {boolean} [config.randomize=false] - Randomize stats.
   * @param {string} [config.folder] - Folder ID.
   * @returns {Promise<Array<Actor>>} Created actors.
   */
  static async quickCreate(config) {
    const {
      namePattern = "NPC {n}",
      count = 1,
      threatLevel = 5,
      role = "specialist",
      type = "troop",
      preset = "mixed",
      faction = "",
      isHorde = false,
      randomize = false,
      randomizeAmount = 10,
      folder = ""
    } = config;
    
    const actors = [];
    const baseData = ThreatCalculator.generateNPCData({
      threatLevel, role, type, preset, faction, isHorde
    });
    
    for (let i = 1; i <= count; i++) {
      const name = namePattern.replace("{n}", i);
      const systemData = foundry.utils.deepClone(baseData);
      
      if (randomize) {
        const variance = randomizeAmount / 100;
        for (const char of Object.values(systemData.characteristics)) {
          const delta = Math.floor((Math.random() * 2 - 1) * char.base * variance);
          char.base = Math.max(10, Math.min(99, char.base + delta));
          char.total = char.base + char.modifier;
          char.bonus = Math.floor(char.total / 10);
        }
      }
      
      const actorData = {
        name,
        type: "npcV2",
        img: "icons/svg/mystery-man.svg",
        system: systemData,
        folder: folder || undefined
      };
      
      const actor = await Actor.create(actorData);
      if (actor) actors.push(actor);
    }
    
    if (actors.length > 0) {
      ui.notifications.info(game.i18n.format("RT.NPC.BatchCreate.Success", { count: actors.length }));
    }
    
    return actors;
  }
}
