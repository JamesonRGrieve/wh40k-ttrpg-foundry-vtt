/**
 * @file TemplateSelector - Browse and instantiate NPC templates
 * Phase 7: Template System
 * 
 * Provides:
 * - Browse available NPC templates
 * - Filter by category, faction, threat
 * - Preview template at different threat levels
 * - Create NPC from selected template
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for browsing and selecting NPC templates.
 * @extends {ApplicationV2}
 */
export default class TemplateSelector extends HandlebarsApplicationMixin(ApplicationV2) {

  /* -------------------------------------------- */
  /*  Static Configuration                        */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "template-selector-{id}",
    classes: ["rogue-trader", "template-selector"],
    tag: "div",
    window: {
      title: "RT.NPC.Template.SelectTitle",
      icon: "fa-solid fa-file-lines",
      minimizable: false,
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 800,
      height: 650
    },
    actions: {
      selectTemplate: TemplateSelector.#selectTemplate,
      clearFilter: TemplateSelector.#clearFilter,
      create: TemplateSelector.#onCreate,
      cancel: TemplateSelector.#onCancel
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: {
      template: "systems/rogue-trader/templates/dialogs/template-selector.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Available templates (cached).
   * @type {Array<Item>}
   */
  #templates = [];

  /**
   * Current filter settings.
   * @type {Object}
   */
  #filters = {
    category: "",
    faction: "",
    search: ""
  };

  /**
   * Selected template UUID.
   * @type {string|null}
   */
  #selectedUuid = null;

  /**
   * Selected threat level.
   * @type {number}
   */
  #threatLevel = 5;

  /**
   * Whether to create as horde.
   * @type {boolean}
   */
  #isHorde = false;

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
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Load templates if not cached
    if (this.#templates.length === 0) {
      await this._loadTemplates();
    }

    // Apply filters
    const filteredTemplates = this._filterTemplates();

    // Get selected template details
    let selectedTemplate = null;
    let preview = null;
    if (this.#selectedUuid) {
      selectedTemplate = this.#templates.find(t => t.uuid === this.#selectedUuid);
      if (selectedTemplate) {
        preview = selectedTemplate.system.previewAtThreat(this.#threatLevel);
      }
    }

    // Get unique categories and factions for filter dropdowns
    const categories = [...new Set(this.#templates.map(t => t.system.category))].sort();
    const factions = [...new Set(this.#templates.map(t => t.system.faction).filter(f => f))].sort();

    return {
      ...context,

      // Templates
      templates: filteredTemplates.map(t => ({
        uuid: t.uuid,
        name: t.name,
        img: t.img,
        category: t.system.category,
        faction: t.system.faction,
        baseThreat: t.system.baseThreatLevel,
        type: t.system.type,
        role: t.system.role,
        summary: t.system.summary,
        selected: t.uuid === this.#selectedUuid
      })),
      hasTemplates: filteredTemplates.length > 0,
      templateCount: filteredTemplates.length,

      // Filters
      filters: this.#filters,
      categories: categories.map(c => ({ key: c, label: c.titleCase(), selected: c === this.#filters.category })),
      factions: factions.map(f => ({ key: f, label: f, selected: f === this.#filters.faction })),

      // Selection
      selectedTemplate,
      hasSelection: selectedTemplate !== null,
      preview,
      threatLevel: this.#threatLevel,
      isHorde: this.#isHorde,

      // Buttons
      buttons: [
        { action: "create", icon: "fa-solid fa-plus", label: "RT.NPC.Template.CreateFromTemplate", cssClass: "primary", disabled: !selectedTemplate },
        { action: "cancel", icon: "fa-solid fa-times", label: "Cancel" }
      ]
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Filter inputs
    const categorySelect = this.element.querySelector('[name="filterCategory"]');
    const factionSelect = this.element.querySelector('[name="filterFaction"]');
    const searchInput = this.element.querySelector('[name="filterSearch"]');

    if (categorySelect) {
      categorySelect.addEventListener("change", () => {
        this.#filters.category = categorySelect.value;
        this.render({ parts: ["content"] });
      });
    }

    if (factionSelect) {
      factionSelect.addEventListener("change", () => {
        this.#filters.faction = factionSelect.value;
        this.render({ parts: ["content"] });
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        this.#filters.search = searchInput.value;
        this._debounceRender();
      });
    }

    // Threat level slider
    const threatSlider = this.element.querySelector('[name="threatLevel"]');
    const threatValue = this.element.querySelector('.threat-value');
    if (threatSlider) {
      threatSlider.addEventListener("input", () => {
        this.#threatLevel = parseInt(threatSlider.value, 10);
        if (threatValue) threatValue.textContent = this.#threatLevel;
        this._debounceRender();
      });
    }

    // Horde checkbox
    const hordeCheckbox = this.element.querySelector('[name="isHorde"]');
    if (hordeCheckbox) {
      hordeCheckbox.addEventListener("change", () => {
        this.#isHorde = hordeCheckbox.checked;
      });
    }
  }

  /**
   * Debounced render.
   * @private
   */
  _debounceRender() {
    if (this._renderTimeout) clearTimeout(this._renderTimeout);
    this._renderTimeout = setTimeout(() => {
      this.render({ parts: ["content"] });
    }, 150);
  }

  /* -------------------------------------------- */
  /*  Template Loading                            */
  /* -------------------------------------------- */

  /**
   * Load all NPC templates from compendiums and world.
   * @private
   */
  async _loadTemplates() {
    this.#templates = [];

    // Load from world items
    const worldTemplates = game.items.filter(i => i.type === "npcTemplate");
    this.#templates.push(...worldTemplates);

    // Load from compendiums
    for (const pack of game.packs) {
      if (pack.documentName !== "Item") continue;
      if (pack.locked && !pack.visible) continue;

      try {
        const index = await pack.getIndex({ fields: ["type", "system.category", "system.faction"] });
        const templateEntries = index.filter(e => e.type === "npcTemplate");

        for (const entry of templateEntries) {
          const item = await pack.getDocument(entry._id);
          if (item) this.#templates.push(item);
        }
      } catch (err) {
        console.warn(`Failed to load templates from pack ${pack.collection}:`, err);
      }
    }
  }

  /**
   * Filter templates based on current filter settings.
   * @returns {Array<Item>}
   * @private
   */
  _filterTemplates() {
    return this.#templates.filter(t => {
      // Category filter
      if (this.#filters.category && t.system.category !== this.#filters.category) {
        return false;
      }

      // Faction filter
      if (this.#filters.faction && t.system.faction !== this.#filters.faction) {
        return false;
      }

      // Search filter
      if (this.#filters.search) {
        const search = this.#filters.search.toLowerCase();
        const name = t.name.toLowerCase();
        const faction = (t.system.faction || "").toLowerCase();
        if (!name.includes(search) && !faction.includes(search)) {
          return false;
        }
      }

      return true;
    });
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Select a template.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #selectTemplate(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    this.#selectedUuid = uuid;
    this.render({ parts: ["content"] });
  }

  /**
   * Clear all filters.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #clearFilter(event, target) {
    this.#filters = { category: "", faction: "", search: "" };
    this.render({ parts: ["content"] });
  }

  /**
   * Create NPC from selected template.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onCreate(event, target) {
    if (!this.#selectedUuid) {
      ui.notifications.warn("Select a template first.");
      return;
    }

    const template = this.#templates.find(t => t.uuid === this.#selectedUuid);
    if (!template) return;

    try {
      const systemData = template.system.generateAtThreat(this.#threatLevel, {
        isHorde: this.#isHorde
      });

      const actorData = {
        name: template.name,
        type: "npcV2",
        img: template.img || "icons/svg/mystery-man.svg",
        system: systemData
      };

      const actor = await Actor.create(actorData);

      if (actor) {
        // Create embedded traits and talents
        const itemsToCreate = [];

        for (const trait of template.system.traits || []) {
          if (trait.uuid) {
            const item = await fromUuid(trait.uuid);
            if (item) {
              itemsToCreate.push({
                name: item.name,
                type: item.type,
                img: item.img,
                system: foundry.utils.deepClone(item.system)
              });
            }
          }
        }

        for (const talent of template.system.talents || []) {
          if (talent.uuid) {
            const item = await fromUuid(talent.uuid);
            if (item) {
              itemsToCreate.push({
                name: item.name,
                type: item.type,
                img: item.img,
                system: foundry.utils.deepClone(item.system)
              });
            }
          }
        }

        if (itemsToCreate.length > 0) {
          await actor.createEmbeddedDocuments("Item", itemsToCreate);
        }

        ui.notifications.info(`Created NPC: ${actor.name}`);
        actor.sheet.render(true);

        this.#submitted = true;
        if (this.#resolve) this.#resolve(actor);
        await this.close();
      }
    } catch (err) {
      console.error("Failed to create NPC from template:", err);
      ui.notifications.error("Failed to create NPC from template");
    }
  }

  /**
   * Cancel and close.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onCancel(event, target) {
    this.#submitted = false;
    if (this.#resolve) this.#resolve(null);
    await this.close();
  }

  /* -------------------------------------------- */
  /*  Lifecycle                                   */
  /* -------------------------------------------- */

  /** @override */
  async close(options = {}) {
    if (this._renderTimeout) clearTimeout(this._renderTimeout);

    if (!this.#submitted && this.#resolve) {
      this.#resolve(null);
    }

    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Wait for selection.
   * @returns {Promise<Actor|null>} Created actor or null.
   */
  async wait() {
    return new Promise((resolve) => {
      this.#resolve = resolve;
      this.render(true);
    });
  }

  /**
   * Open the template selector.
   * @param {Object} [options] - Options.
   * @param {string} [options.category] - Initial category filter.
   * @param {string} [options.faction] - Initial faction filter.
   * @returns {Promise<Actor|null>} Created actor or null.
   */
  static async open(options = {}) {
    const selector = new this();

    if (options.category) selector.#filters.category = options.category;
    if (options.faction) selector.#filters.faction = options.faction;

    return selector.wait();
  }
}
