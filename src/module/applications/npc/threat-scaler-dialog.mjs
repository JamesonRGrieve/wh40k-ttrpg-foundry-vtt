/**
 * @file NPCThreatScalerDialog - Threat scaling dialog for existing NPCs
 * Phase 4: Threat Scaling Dialog (USER PRIORITY)
 * 
 * Provides:
 * - Adjust existing NPC threat on-the-fly
 * - Live preview of stat changes
 * - Granular scaling options (chars, wounds, skills, weapons, armour)
 * - Percentage-based scaling
 */

import ThreatCalculator from "./threat-calculator.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for scaling an existing NPC's stats to a new threat level.
 * @extends {ApplicationV2}
 */
export default class NPCThreatScalerDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /* -------------------------------------------- */
  /*  Static Configuration                        */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "npc-threat-scaler-{id}",
    classes: ["rogue-trader", "npc-threat-scaler-dialog"],
    tag: "form",
    window: {
      title: "RT.NPC.ScaleThreat",
      icon: "fa-solid fa-chart-line",
      minimizable: false,
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 550,
      height: 650
    },
    form: {
      handler: NPCThreatScalerDialog.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      cancel: NPCThreatScalerDialog.#onCancel,
      adjustThreat: NPCThreatScalerDialog.#onAdjustThreat,
      resetThreat: NPCThreatScalerDialog.#onResetThreat,
      updatePreview: NPCThreatScalerDialog.#onUpdatePreview
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    form: {
      template: "systems/rogue-trader/templates/dialogs/threat-scaler.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The actor being scaled.
   * @type {Actor}
   */
  #actor = null;

  /**
   * Current form state.
   * @type {Object}
   */
  #state = {
    newThreatLevel: 5,
    scaleCharacteristics: true,
    scaleWounds: true,
    scaleSkills: true,
    scaleWeapons: true,
    scaleArmour: true,
    activeTab: "characteristics"
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

  /**
   * Original threat level for reset functionality.
   * @type {number}
   */
  #originalThreat = 5;

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {Actor} actor - The NPC actor to scale.
   * @param {Object} [options] - Application options.
   */
  constructor(actor, options = {}) {
    super(options);
    this.#actor = actor;
    this.#originalThreat = actor.system.threatLevel || 5;
    this.#state.newThreatLevel = this.#originalThreat;
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.format("RT.NPC.ScaleThreatTitle", { name: this.#actor?.name || "NPC" });
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    const currentThreat = this.#actor.system.threatLevel;
    const newThreat = this.#state.newThreatLevel;
    const threatDifference = Math.abs(newThreat - currentThreat);
    
    // Get scaling preview
    const preview = ThreatCalculator.previewScaling(
      this.#actor.system,
      currentThreat,
      newThreat,
      {
        scaleCharacteristics: this.#state.scaleCharacteristics,
        scaleWounds: this.#state.scaleWounds,
        scaleSkills: this.#state.scaleSkills,
        scaleWeapons: this.#state.scaleWeapons,
        scaleArmour: this.#state.scaleArmour
      }
    );
    
    // Prepare characteristics for display
    const characteristicChanges = Object.entries(preview.characteristics).map(([key, char]) => {
      const change = this.#state.scaleCharacteristics ? char.change : 0;
      const newValue = this.#state.scaleCharacteristics ? char.new : char.current;
      const percentChange = char.current > 0 ? Math.round((change / char.current) * 100) : 0;
      
      return {
        key,
        label: char.label,
        short: char.short,
        current: char.current,
        new: newValue,
        change,
        percentChange: percentChange > 0 ? `+${percentChange}` : `${percentChange}`
      };
    });
    
    // Calculate wounds change
    const currentWounds = preview.wounds.current;
    const newWounds = this.#state.scaleWounds ? preview.wounds.new : currentWounds;
    const woundsChange = newWounds - currentWounds;
    
    // Calculate armour change
    const currentArmour = typeof preview.armour.current === "number" ? preview.armour.current : 0;
    const newArmour = this.#state.scaleArmour && typeof preview.armour.new === "number" ? 
      preview.armour.new : currentArmour;
    const armourChange = newArmour - currentArmour;
    
    // Get tier info with colors
    const currentTier = ThreatCalculator.getTierInfo(currentThreat);
    const newTier = ThreatCalculator.getTierInfo(newThreat);
    
    return {
      ...context,
      
      // Actor info
      actor: this.#actor,
      
      // Threat levels
      currentThreat,
      newThreat,
      threatDifference,
      
      // Tier info
      currentTier,
      newTier,
      
      // Form state
      scaleCharacteristics: this.#state.scaleCharacteristics,
      scaleWounds: this.#state.scaleWounds,
      scaleSkills: this.#state.scaleSkills,
      scaleWeapons: this.#state.scaleWeapons,
      scaleArmour: this.#state.scaleArmour,
      
      // Preview data
      characteristicChanges,
      currentWounds,
      newWounds,
      woundsChange,
      currentArmour,
      newArmour,
      armourChange
    };
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    
    const form = this.element;
    
    // Threat level slider - live update
    const threatSlider = form.querySelector('[name="newThreatLevel"]');
    if (threatSlider) {
      threatSlider.addEventListener("input", () => {
        this.#state.newThreatLevel = parseInt(threatSlider.value, 10);
        this._debounceRender();
      });
    }
    
    // Scaling option checkboxes
    const checkboxes = [
      "scaleCharacteristics",
      "scaleWounds",
      "scaleSkills",
      "scaleWeapons",
      "scaleArmour"
    ];
    
    for (const name of checkboxes) {
      const checkbox = form.querySelector(`[name="${name}"]`);
      if (checkbox) {
        checkbox.addEventListener("change", () => {
          this.#state[name] = checkbox.checked;
          this._debounceRender();
        });
      }
    }
    
    // Preview tabs
    const tabs = form.querySelectorAll(".rt-preview-tab");
    const sections = form.querySelectorAll(".rt-preview-section");
    
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const targetTab = tab.dataset.tab;
        
        // Update active tab
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        
        // Update active section
        sections.forEach(s => {
          if (s.dataset.section === targetTab) {
            s.classList.add("active");
          } else {
            s.classList.remove("active");
          }
        });
      });
    });
  }

  /**
   * Debounced render for preview updates.
   * @private
   */
  _debounceRender() {
    if (this._renderTimeout) clearTimeout(this._renderTimeout);
    this._renderTimeout = setTimeout(() => {
      this.render({ parts: ["form"] });
    }, 100);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle adjust threat preset buttons.
   * @param {PointerEvent} event - The click event.
   * @param {HTMLElement} target - The target element.
   */
  static #onAdjustThreat(event, target) {
    const amount = parseInt(target.dataset.amount, 10);
    if (!amount) return;
    
    const newValue = Math.max(1, Math.min(30, this.#state.newThreatLevel + amount));
    this.#state.newThreatLevel = newValue;
    
    // Update slider
    const slider = this.element.querySelector('[name="newThreatLevel"]');
    if (slider) slider.value = newValue;
    
    this.render({ parts: ["form"] });
  }

  /**
   * Handle reset threat button.
   * @param {PointerEvent} event - The click event.
   * @param {HTMLElement} target - The target element.
   */
  static #onResetThreat(event, target) {
    this.#state.newThreatLevel = this.#originalThreat;
    
    // Update slider
    const slider = this.element.querySelector('[name="newThreatLevel"]');
    if (slider) slider.value = this.#originalThreat;
    
    this.render({ parts: ["form"] });
  }

  /**
   * Handle preview updates from slider.
   * @param {Event} event - The input event.
   * @param {HTMLElement} target - The target element.
   */
  static #onUpdatePreview(event, target) {
    this.#state.newThreatLevel = parseInt(target.value, 10);
    
    // Debounce render
    if (this._renderTimeout) clearTimeout(this._renderTimeout);
    this._renderTimeout = setTimeout(() => {
      this.render({ parts: ["form"] });
    }, 100);
  }

  /**
   * Handle form submission.
   * @param {Event} event - The submit event.
   * @param {HTMLFormElement} form - The form element.
   * @param {FormDataExtended} formData - The form data.
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    
    // Update state from form
    this.#state.newThreatLevel = parseInt(data.newThreatLevel, 10);
    this.#state.scaleCharacteristics = data.scaleCharacteristics === true || data.scaleCharacteristics === "true";
    this.#state.scaleWounds = data.scaleWounds === true || data.scaleWounds === "true";
    this.#state.scaleSkills = data.scaleSkills === true || data.scaleSkills === "true";
    this.#state.scaleWeapons = data.scaleWeapons === true || data.scaleWeapons === "true";
    this.#state.scaleArmour = data.scaleArmour === true || data.scaleArmour === "true";
    
    const currentThreat = this.#actor.system.threatLevel;
    const newThreat = this.#state.newThreatLevel;
    
    // Check for no change
    if (currentThreat === newThreat) {
      ui.notifications.info("No threat level change specified");
      this.#submitted = true;
      if (this.#resolve) this.#resolve(false);
      return;
    }
    
    // Get the updates
    const updates = ThreatCalculator.scaleToThreat(
      this.#actor.system,
      currentThreat,
      newThreat,
      {
        scaleCharacteristics: this.#state.scaleCharacteristics,
        scaleWounds: this.#state.scaleWounds,
        scaleSkills: this.#state.scaleSkills,
        scaleWeapons: this.#state.scaleWeapons,
        scaleArmour: this.#state.scaleArmour
      }
    );
    
    // Prepare update object with system prefix
    const actorUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      actorUpdates[`system.${key}`] = value;
    }
    
    try {
      await this.#actor.update(actorUpdates);
      
      const direction = newThreat > currentThreat ? "up" : "down";
      ui.notifications.info(
        game.i18n.format("RT.NPC.ScaledThreat", {
          name: this.#actor.name,
          from: currentThreat,
          to: newThreat
        })
      );
      
      this.#submitted = true;
      if (this.#resolve) this.#resolve(true);
    } catch (error) {
      console.error("Failed to scale NPC:", error);
      ui.notifications.error("Failed to scale NPC");
      if (this.#resolve) this.#resolve(false);
    }
  }

  /**
   * Handle cancel button.
   * @param {PointerEvent} event - The click event.
   * @param {HTMLElement} target - The target element.
   */
  static async #onCancel(event, target) {
    this.#submitted = false;
    if (this.#resolve) this.#resolve(false);
    await this.close();
  }

  /* -------------------------------------------- */
  /*  Lifecycle                                   */
  /* -------------------------------------------- */

  /** @override */
  async close(options = {}) {
    // Clear any pending render
    if (this._renderTimeout) clearTimeout(this._renderTimeout);
    
    // Resolve as false if not submitted
    if (!this.#submitted && this.#resolve) {
      this.#resolve(false);
    }
    
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Wait for the dialog to complete.
   * @returns {Promise<boolean>} True if scaling was applied, false otherwise.
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
   * Open the threat scaler dialog for an actor.
   * @param {Actor} actor - The NPC actor to scale.
   * @returns {Promise<boolean>} True if scaling was applied, false otherwise.
   */
  static async scale(actor) {
    if (!actor || actor.type !== "npcV2") {
      ui.notifications.warn("Can only scale npcV2 type actors");
      return false;
    }
    
    const dialog = new this(actor);
    return dialog.wait();
  }
}
