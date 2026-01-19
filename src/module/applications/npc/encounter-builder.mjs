/**
 * @file EncounterBuilder - Plan and manage combat encounters
 * Phase 6: Advanced GM Tools
 * 
 * Provides:
 * - Drag NPCs from compendium/world
 * - Calculate total threat rating
 * - Encounter difficulty assessment
 * - Save/load encounter templates
 * - Deploy NPCs to combat tracker
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application for building and managing combat encounters.
 * @extends {ApplicationV2}
 */
export default class EncounterBuilder extends HandlebarsApplicationMixin(ApplicationV2) {

  /* -------------------------------------------- */
  /*  Static Configuration                        */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "encounter-builder",
    classes: ["rogue-trader", "encounter-builder"],
    tag: "div",
    window: {
      title: "RT.NPC.Encounter.Title",
      icon: "fa-solid fa-swords",
      minimizable: true,
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 800,
      height: 650
    },
    actions: {
      addNPC: EncounterBuilder.#addNPC,
      removeNPC: EncounterBuilder.#removeNPC,
      adjustCount: EncounterBuilder.#adjustCount,
      clearAll: EncounterBuilder.#clearAll,
      saveTemplate: EncounterBuilder.#saveTemplate,
      loadTemplate: EncounterBuilder.#loadTemplate,
      deployToCombat: EncounterBuilder.#deployToCombat,
      openNPC: EncounterBuilder.#openNPC
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: {
      template: "systems/rogue-trader/templates/apps/encounter-builder.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Difficulty Thresholds                       */
  /* -------------------------------------------- */

  /**
   * Difficulty ratings based on threat ratio.
   * Ratio = total enemy threat / party threat
   * @type {Object}
   */
  static DIFFICULTY_RATINGS = {
    trivial: { maxRatio: 0.5, label: "RT.Threat.Trivial", color: "#4ade80" },
    easy: { maxRatio: 0.8, label: "RT.Threat.Low", color: "#84cc16" },
    moderate: { maxRatio: 1.2, label: "RT.Threat.Moderate", color: "#facc15" },
    dangerous: { maxRatio: 1.6, label: "RT.Threat.Dangerous", color: "#fb923c" },
    deadly: { maxRatio: 2.0, label: "RT.Threat.Deadly", color: "#ef4444" },
    apocalyptic: { maxRatio: Infinity, label: "RT.Threat.Apocalyptic", color: "#991b1b" }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * NPCs in the current encounter.
   * @type {Array<{uuid: string, name: string, img: string, threat: number, count: number}>}
   */
  #npcs = [];

  /**
   * Party configuration.
   * @type {{count: number, averageLevel: number}}
   */
  #party = {
    count: 4,
    averageLevel: 5
  };

  /**
   * Saved templates.
   * @type {Array<{name: string, npcs: Array}>}
   */
  #templates = [];

  /* -------------------------------------------- */
  /*  Singleton Pattern                           */
  /* -------------------------------------------- */

  /**
   * Singleton instance.
   * @type {EncounterBuilder|null}
   */
  static #instance = null;

  /**
   * Get or create the singleton instance.
   * @returns {EncounterBuilder}
   */
  static get instance() {
    if (!this.#instance) {
      this.#instance = new this();
    }
    return this.#instance;
  }

  /**
   * Show the encounter builder.
   * @returns {EncounterBuilder}
   */
  static show() {
    const instance = this.instance;
    instance.render(true);
    return instance;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // Calculate encounter metrics
    const totalThreat = this.#npcs.reduce((sum, npc) => sum + (npc.threat * npc.count), 0);
    const totalNPCs = this.#npcs.reduce((sum, npc) => sum + npc.count, 0);
    
    // Calculate party threat (simplified: party count * average level * 2)
    const partyThreat = this.#party.count * this.#party.averageLevel * 2;
    
    // Determine difficulty
    const ratio = partyThreat > 0 ? totalThreat / partyThreat : 0;
    const difficulty = this._getDifficulty(ratio);
    
    // Prepare NPC list with expanded details
    const npcList = await Promise.all(this.#npcs.map(async (npc, index) => {
      return {
        ...npc,
        index,
        totalThreat: npc.threat * npc.count,
        threatPercent: totalThreat > 0 ? Math.round((npc.threat * npc.count / totalThreat) * 100) : 0
      };
    }));
    
    return {
      ...context,
      
      // NPC list
      npcs: npcList,
      hasNPCs: npcList.length > 0,
      
      // Party settings
      party: this.#party,
      
      // Encounter metrics
      totalThreat,
      totalNPCs,
      partyThreat,
      
      // Difficulty
      difficulty,
      difficultyLabel: game.i18n.localize(difficulty.label),
      difficultyColor: difficulty.color,
      threatRatio: ratio.toFixed(1),
      
      // Action economy
      actionEconomy: {
        partyActions: this.#party.count,
        enemyActions: totalNPCs,
        advantage: this._getActionAdvantage(this.#party.count, totalNPCs)
      },
      
      // Saved templates
      templates: this.#templates,
      hasTemplates: this.#templates.length > 0,
      
      // Combat availability
      hasCombat: game.combat !== null
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    
    // Party configuration inputs
    const partyCount = this.element.querySelector('[name="partyCount"]');
    const partyLevel = this.element.querySelector('[name="partyLevel"]');
    
    if (partyCount) {
      partyCount.addEventListener("change", (e) => {
        this.#party.count = parseInt(e.target.value, 10) || 4;
        this.render({ parts: ["content"] });
      });
    }
    
    if (partyLevel) {
      partyLevel.addEventListener("change", (e) => {
        this.#party.averageLevel = parseInt(e.target.value, 10) || 5;
        this.render({ parts: ["content"] });
      });
    }
    
    // Set up drop zone for NPCs
    this._setupDropZone();
  }

  /**
   * Set up drop zone for dragging NPCs.
   * @private
   */
  _setupDropZone() {
    const dropZone = this.element.querySelector('.encounter-drop-zone');
    if (!dropZone) return;
    
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
    
    dropZone.addEventListener("dragleave", (e) => {
      dropZone.classList.remove("drag-over");
    });
    
    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      
      try {
        const data = JSON.parse(e.dataTransfer.getData("text/plain"));
        
        if (data.type === "Actor") {
          await this._handleActorDrop(data);
        }
      } catch (err) {
        console.error("Failed to handle drop:", err);
      }
    });
  }

  /**
   * Handle actor drop.
   * @param {Object} data - Drop data.
   * @private
   */
  async _handleActorDrop(data) {
    let actor;
    
    if (data.uuid) {
      actor = await fromUuid(data.uuid);
    } else if (data.id) {
      actor = game.actors.get(data.id);
    }
    
    if (!actor) {
      ui.notifications.warn("Could not find the dropped actor.");
      return;
    }
    
    // Only allow NPC types
    if (actor.type !== "npc" && actor.type !== "npcV2") {
      ui.notifications.warn("Only NPC actors can be added to encounters.");
      return;
    }
    
    // Check if already in list
    const existing = this.#npcs.find(n => n.uuid === actor.uuid);
    if (existing) {
      existing.count++;
    } else {
      this.#npcs.push({
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img || "icons/svg/mystery-man.svg",
        threat: actor.system.threatLevel || 5,
        count: 1
      });
    }
    
    this.render({ parts: ["content"] });
  }

  /* -------------------------------------------- */
  /*  Difficulty Calculation                      */
  /* -------------------------------------------- */

  /**
   * Get difficulty rating for a threat ratio.
   * @param {number} ratio - Threat ratio.
   * @returns {Object} Difficulty rating.
   * @private
   */
  _getDifficulty(ratio) {
    for (const [key, rating] of Object.entries(EncounterBuilder.DIFFICULTY_RATINGS)) {
      if (ratio <= rating.maxRatio) {
        return { key, ...rating };
      }
    }
    return { key: "apocalyptic", ...EncounterBuilder.DIFFICULTY_RATINGS.apocalyptic };
  }

  /**
   * Get action economy advantage text.
   * @param {number} partyActions - Party action count.
   * @param {number} enemyActions - Enemy action count.
   * @returns {Object} Advantage info.
   * @private
   */
  _getActionAdvantage(partyActions, enemyActions) {
    const diff = enemyActions - partyActions;
    
    if (diff <= -2) return { text: game.i18n.localize("RT.NPC.Encounter.PartyAdvantage"), color: "#4ade80" };
    if (diff <= 0) return { text: game.i18n.localize("RT.NPC.Encounter.Balanced"), color: "#facc15" };
    if (diff <= 2) return { text: game.i18n.localize("RT.NPC.Encounter.EnemyAdvantage"), color: "#fb923c" };
    return { text: game.i18n.localize("RT.NPC.Encounter.EnemyOverwhelming"), color: "#ef4444" };
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Add an NPC via selector.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #addNPC(event, target) {
    // Show a simple actor picker
    const actors = game.actors.filter(a => a.type === "npc" || a.type === "npcV2");
    
    if (actors.length === 0) {
      ui.notifications.warn("No NPC actors found in the world.");
      return;
    }
    
    const options = actors.map(a => `<option value="${a.uuid}">${a.name}</option>`).join("");
    
    const content = `
      <form>
        <div class="form-group">
          <label>Select NPC</label>
          <select name="uuid">${options}</select>
        </div>
        <div class="form-group">
          <label>Count</label>
          <input type="number" name="count" value="1" min="1" max="20"/>
        </div>
      </form>
    `;
    
    const result = await Dialog.prompt({
      title: "Add NPC",
      content,
      label: "Add",
      callback: (html) => {
        const form = html[0].querySelector("form");
        return {
          uuid: form.querySelector('[name="uuid"]').value,
          count: parseInt(form.querySelector('[name="count"]').value, 10) || 1
        };
      },
      rejectClose: false
    });
    
    if (!result) return;
    
    const actor = await fromUuid(result.uuid);
    if (!actor) return;
    
    const existing = this.#npcs.find(n => n.uuid === result.uuid);
    if (existing) {
      existing.count += result.count;
    } else {
      this.#npcs.push({
        uuid: result.uuid,
        name: actor.name,
        img: actor.img || "icons/svg/mystery-man.svg",
        threat: actor.system.threatLevel || 5,
        count: result.count
      });
    }
    
    this.render({ parts: ["content"] });
  }

  /**
   * Remove an NPC from the encounter.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #removeNPC(event, target) {
    const index = parseInt(target.dataset.index, 10);
    if (isNaN(index) || index < 0 || index >= this.#npcs.length) return;
    
    this.#npcs.splice(index, 1);
    this.render({ parts: ["content"] });
  }

  /**
   * Adjust NPC count.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #adjustCount(event, target) {
    const index = parseInt(target.dataset.index, 10);
    const delta = parseInt(target.dataset.delta, 10);
    
    if (isNaN(index) || isNaN(delta)) return;
    
    const npc = this.#npcs[index];
    if (!npc) return;
    
    npc.count = Math.max(1, Math.min(20, npc.count + delta));
    this.render({ parts: ["content"] });
  }

  /**
   * Clear all NPCs.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #clearAll(event, target) {
    this.#npcs = [];
    this.render({ parts: ["content"] });
  }

  /**
   * Save current encounter as template.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #saveTemplate(event, target) {
    if (this.#npcs.length === 0) {
      ui.notifications.warn("No NPCs to save.");
      return;
    }
    
    const name = await Dialog.prompt({
      title: "Save Encounter Template",
      content: '<form><div class="form-group"><label>Template Name</label><input type="text" name="name" placeholder="My Encounter"/></div></form>',
      label: "Save",
      callback: (html) => html[0].querySelector('[name="name"]').value,
      rejectClose: false
    });
    
    if (!name) return;
    
    this.#templates.push({
      name,
      npcs: foundry.utils.deepClone(this.#npcs),
      party: foundry.utils.deepClone(this.#party),
      savedAt: Date.now()
    });
    
    ui.notifications.info(`Saved encounter template: ${name}`);
    this.render({ parts: ["content"] });
  }

  /**
   * Load a saved template.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #loadTemplate(event, target) {
    const index = parseInt(target.dataset.index, 10);
    if (isNaN(index) || index < 0 || index >= this.#templates.length) return;
    
    const template = this.#templates[index];
    this.#npcs = foundry.utils.deepClone(template.npcs);
    if (template.party) {
      this.#party = foundry.utils.deepClone(template.party);
    }
    
    ui.notifications.info(`Loaded encounter: ${template.name}`);
    this.render({ parts: ["content"] });
  }

  /**
   * Deploy NPCs to combat tracker.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #deployToCombat(event, target) {
    if (this.#npcs.length === 0) {
      ui.notifications.warn("No NPCs to deploy.");
      return;
    }
    
    // Ensure combat exists
    let combat = game.combat;
    if (!combat) {
      combat = await Combat.create({ scene: game.scenes.active?.id });
    }
    
    const combatants = [];
    
    for (const npcEntry of this.#npcs) {
      const actor = await fromUuid(npcEntry.uuid);
      if (!actor) continue;
      
      for (let i = 0; i < npcEntry.count; i++) {
        // Create token data
        const tokenData = await actor.getTokenDocument({
          name: npcEntry.count > 1 ? `${actor.name} ${i + 1}` : actor.name
        });
        
        combatants.push({
          actorId: actor.id,
          tokenId: null, // No token placed
          name: npcEntry.count > 1 ? `${actor.name} ${i + 1}` : actor.name,
          img: actor.img
        });
      }
    }
    
    await combat.createEmbeddedDocuments("Combatant", combatants);
    
    ui.notifications.info(game.i18n.format("RT.NPC.Encounter.Deployed", { count: combatants.length }));
  }

  /**
   * Open NPC sheet.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #openNPC(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    
    const actor = await fromUuid(uuid);
    if (actor) {
      actor.sheet.render(true);
    }
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Add an NPC to the encounter programmatically.
   * @param {Actor|string} actorOrUuid - Actor or UUID.
   * @param {number} [count=1] - Number to add.
   */
  async addNPC(actorOrUuid, count = 1) {
    let actor;
    let uuid;
    
    if (typeof actorOrUuid === "string") {
      uuid = actorOrUuid;
      actor = await fromUuid(uuid);
    } else {
      actor = actorOrUuid;
      uuid = actor.uuid;
    }
    
    if (!actor) return;
    
    const existing = this.#npcs.find(n => n.uuid === uuid);
    if (existing) {
      existing.count += count;
    } else {
      this.#npcs.push({
        uuid,
        name: actor.name,
        img: actor.img || "icons/svg/mystery-man.svg",
        threat: actor.system.threatLevel || 5,
        count
      });
    }
    
    if (this.rendered) {
      this.render({ parts: ["content"] });
    }
  }

  /**
   * Set party configuration.
   * @param {number} count - Number of party members.
   * @param {number} averageLevel - Average party level/threat.
   */
  setParty(count, averageLevel) {
    this.#party.count = count;
    this.#party.averageLevel = averageLevel;
    
    if (this.rendered) {
      this.render({ parts: ["content"] });
    }
  }

  /**
   * Get current encounter data.
   * @returns {Object} Encounter data.
   */
  getData() {
    return {
      npcs: foundry.utils.deepClone(this.#npcs),
      party: foundry.utils.deepClone(this.#party),
      templates: foundry.utils.deepClone(this.#templates)
    };
  }

  /**
   * Clear the encounter.
   */
  clear() {
    this.#npcs = [];
    if (this.rendered) {
      this.render({ parts: ["content"] });
    }
  }
}
