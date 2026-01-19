/**
 * @file StatBlockExporter - Export NPC data to various formats
 * Phase 6: Advanced GM Tools
 * 
 * Provides:
 * - Export to formatted text (for sharing/printing)
 * - Export to JSON (for backup/import)
 * - Copy to clipboard functionality
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for exporting NPC stat blocks in various formats.
 * @extends {ApplicationV2}
 */
export default class StatBlockExporter extends HandlebarsApplicationMixin(ApplicationV2) {

  /* -------------------------------------------- */
  /*  Static Configuration                        */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "stat-block-exporter-{id}",
    classes: ["rogue-trader", "stat-block-exporter"],
    tag: "div",
    window: {
      title: "RT.NPC.Export.Title",
      icon: "fa-solid fa-file-export",
      minimizable: false,
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 700,
      height: 600
    },
    actions: {
      copyToClipboard: StatBlockExporter.#onCopyToClipboard,
      exportJson: StatBlockExporter.#onExportJson,
      exportText: StatBlockExporter.#onExportText,
      close: StatBlockExporter.#onClose
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: {
      template: "systems/rogue-trader/templates/dialogs/stat-block-exporter.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The actor being exported.
   * @type {Actor}
   */
  #actor = null;

  /**
   * Current export format.
   * @type {string}
   */
  #format = "text";

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {Actor} actor - The NPC actor to export.
   * @param {Object} [options] - Application options.
   */
  constructor(actor, options = {}) {
    super(options);
    this.#actor = actor;
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.format("RT.NPC.Export.Title", { name: this.#actor?.name || "NPC" });
  }

  /* -------------------------------------------- */
  /*  Static Export Methods                       */
  /* -------------------------------------------- */

  /**
   * Export an NPC to formatted text.
   * @param {Actor} actor - The actor to export.
   * @returns {string} Formatted text stat block.
   */
  static toText(actor) {
    const sys = actor.system;
    const lines = [];
    
    // Header
    lines.push("═".repeat(50));
    lines.push(actor.name.toUpperCase());
    lines.push("═".repeat(50));
    lines.push("");
    
    // Identity
    if (sys.faction) lines.push(`Faction: ${sys.faction}`);
    if (sys.subfaction) lines.push(`Subfaction: ${sys.subfaction}`);
    lines.push(`Type: ${sys.type?.titleCase() || "Unknown"} | Role: ${sys.role?.titleCase() || "Unknown"}`);
    lines.push(`Threat Level: ${sys.threatLevel || 5}`);
    lines.push("");
    
    // Characteristics
    lines.push("─".repeat(50));
    lines.push("CHARACTERISTICS");
    lines.push("─".repeat(50));
    
    const chars = sys.characteristics;
    if (chars) {
      const charLine1 = [];
      const charLine2 = [];
      
      const order = ["weaponSkill", "ballisticSkill", "strength", "toughness", "agility"];
      for (const key of order) {
        const c = chars[key];
        if (c) {
          charLine1.push(`${c.short}: ${c.total}`);
        }
      }
      
      const order2 = ["intelligence", "perception", "willpower", "fellowship", "influence"];
      for (const key of order2) {
        const c = chars[key];
        if (c) {
          charLine2.push(`${c.short}: ${c.total}`);
        }
      }
      
      lines.push(charLine1.join(" | "));
      lines.push(charLine2.join(" | "));
    }
    lines.push("");
    
    // Vitals
    lines.push("─".repeat(50));
    lines.push("VITALS");
    lines.push("─".repeat(50));
    lines.push(`Wounds: ${sys.wounds?.value || 0}/${sys.wounds?.max || 0}`);
    
    if (sys.horde?.enabled) {
      lines.push(`Magnitude: ${sys.horde.magnitude?.current || 0}/${sys.horde.magnitude?.max || 100}`);
    }
    
    const mv = sys.movement;
    if (mv) {
      lines.push(`Movement: H${mv.half} / F${mv.full} / C${mv.charge} / R${mv.run}`);
    }
    lines.push("");
    
    // Armour
    lines.push("─".repeat(50));
    lines.push("ARMOUR");
    lines.push("─".repeat(50));
    if (sys.armour?.mode === "simple") {
      lines.push(`Total AP: ${sys.armour.total || 0}`);
    } else if (sys.armour?.locations) {
      const locs = sys.armour.locations;
      lines.push(`Head: ${locs.head || 0} | Body: ${locs.body || 0}`);
      lines.push(`Arms: ${locs.leftArm || 0}/${locs.rightArm || 0} | Legs: ${locs.leftLeg || 0}/${locs.rightLeg || 0}`);
    }
    lines.push("");
    
    // Trained Skills
    if (sys.trainedSkills && Object.keys(sys.trainedSkills).length > 0) {
      lines.push("─".repeat(50));
      lines.push("SKILLS");
      lines.push("─".repeat(50));
      
      const skillLines = [];
      for (const [key, skill] of Object.entries(sys.trainedSkills)) {
        let level = "";
        if (skill.plus20) level = "+20";
        else if (skill.plus10) level = "+10";
        
        const bonus = skill.bonus ? ` (+${skill.bonus})` : "";
        skillLines.push(`${skill.name || key}${level}${bonus}`);
      }
      lines.push(skillLines.join(", "));
      lines.push("");
    }
    
    // Weapons
    if (sys.weapons?.simple?.length > 0) {
      lines.push("─".repeat(50));
      lines.push("WEAPONS");
      lines.push("─".repeat(50));
      
      for (const w of sys.weapons.simple) {
        const special = w.special ? ` [${w.special}]` : "";
        lines.push(`${w.name}: ${w.damage} Pen ${w.pen} | ${w.range} | RoF: ${w.rof}${special}`);
      }
      lines.push("");
    }
    
    // Talents (from items)
    const talents = actor.items.filter(i => i.type === "talent");
    if (talents.length > 0) {
      lines.push("─".repeat(50));
      lines.push("TALENTS");
      lines.push("─".repeat(50));
      lines.push(talents.map(t => t.name).join(", "));
      lines.push("");
    }
    
    // Traits (from items)
    const traits = actor.items.filter(i => i.type === "trait");
    if (traits.length > 0) {
      lines.push("─".repeat(50));
      lines.push("TRAITS");
      lines.push("─".repeat(50));
      lines.push(traits.map(t => t.name).join(", "));
      lines.push("");
    }
    
    // Special Abilities
    if (sys.specialAbilities) {
      const plainText = this._stripHtml(sys.specialAbilities);
      if (plainText.trim()) {
        lines.push("─".repeat(50));
        lines.push("SPECIAL ABILITIES");
        lines.push("─".repeat(50));
        lines.push(plainText);
        lines.push("");
      }
    }
    
    // Notes
    if (sys.quickNotes) {
      const plainText = this._stripHtml(sys.quickNotes);
      if (plainText.trim()) {
        lines.push("─".repeat(50));
        lines.push("GM NOTES");
        lines.push("─".repeat(50));
        lines.push(plainText);
        lines.push("");
      }
    }
    
    lines.push("═".repeat(50));
    
    return lines.join("\n");
  }

  /**
   * Export an NPC to JSON format.
   * @param {Actor} actor - The actor to export.
   * @param {Object} [options] - Export options.
   * @param {boolean} [options.includeItems=true] - Include embedded items.
   * @param {boolean} [options.prettyPrint=true] - Pretty print JSON.
   * @returns {string} JSON string.
   */
  static toJSON(actor, options = {}) {
    const { includeItems = true, prettyPrint = true } = options;
    
    const exportData = {
      name: actor.name,
      img: actor.img,
      type: actor.type,
      system: foundry.utils.deepClone(actor.system),
      items: includeItems ? actor.items.map(i => ({
        name: i.name,
        type: i.type,
        img: i.img,
        system: foundry.utils.deepClone(i.system)
      })) : [],
      exportedAt: new Date().toISOString(),
      exportedBy: game.user?.name || "Unknown",
      systemVersion: game.system.version
    };
    
    return prettyPrint 
      ? JSON.stringify(exportData, null, 2)
      : JSON.stringify(exportData);
  }

  /**
   * Strip HTML tags from a string.
   * @param {string} html - HTML string.
   * @returns {string} Plain text.
   * @private
   */
  static _stripHtml(html) {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // Generate export content based on format
    const textContent = StatBlockExporter.toText(this.#actor);
    const jsonContent = StatBlockExporter.toJSON(this.#actor);
    
    return {
      ...context,
      actor: this.#actor,
      format: this.#format,
      textContent,
      jsonContent,
      buttons: [
        { action: "copyToClipboard", icon: "fa-solid fa-clipboard", label: "RT.NPC.Export.CopyToClipboard", cssClass: "primary" },
        { action: "exportText", icon: "fa-solid fa-file-lines", label: "RT.NPC.Export.DownloadText" },
        { action: "exportJson", icon: "fa-solid fa-file-code", label: "RT.NPC.Export.DownloadJSON" },
        { action: "close", icon: "fa-solid fa-times", label: "Close" }
      ]
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    
    // Handle format toggle
    const formatTabs = this.element.querySelectorAll('[data-format]');
    for (const tab of formatTabs) {
      tab.addEventListener("click", (e) => {
        this.#format = e.currentTarget.dataset.format;
        this.render({ parts: ["content"] });
      });
    }
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Copy current content to clipboard.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onCopyToClipboard(event, target) {
    const content = this.#format === "json" 
      ? StatBlockExporter.toJSON(this.#actor)
      : StatBlockExporter.toText(this.#actor);
    
    try {
      await navigator.clipboard.writeText(content);
      ui.notifications.info(game.i18n.localize("RT.NPC.Export.CopiedToClipboard"));
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      ui.notifications.error(game.i18n.localize("RT.NPC.Export.CopyFailed"));
    }
  }

  /**
   * Download as JSON file.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onExportJson(event, target) {
    const content = StatBlockExporter.toJSON(this.#actor);
    const filename = `${this.#actor.name.slugify()}.json`;
    
    StatBlockExporter._downloadFile(content, filename, "application/json");
    ui.notifications.info(game.i18n.format("RT.NPC.Export.Downloaded", { filename }));
  }

  /**
   * Download as text file.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onExportText(event, target) {
    const content = StatBlockExporter.toText(this.#actor);
    const filename = `${this.#actor.name.slugify()}.txt`;
    
    StatBlockExporter._downloadFile(content, filename, "text/plain");
    ui.notifications.info(game.i18n.format("RT.NPC.Export.Downloaded", { filename }));
  }

  /**
   * Close the dialog.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onClose(event, target) {
    await this.close();
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Download a file.
   * @param {string} content - File content.
   * @param {string} filename - File name.
   * @param {string} mimeType - MIME type.
   * @private
   */
  static _downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Open the exporter for an actor.
   * @param {Actor} actor - The actor to export.
   * @returns {StatBlockExporter} The exporter instance.
   */
  static show(actor) {
    const exporter = new this(actor);
    exporter.render(true);
    return exporter;
  }

  /**
   * Quick export to clipboard without dialog.
   * @param {Actor} actor - The actor to export.
   * @param {string} [format="text"] - Export format ("text" or "json").
   * @returns {Promise<void>}
   */
  static async quickExport(actor, format = "text") {
    const content = format === "json"
      ? this.toJSON(actor)
      : this.toText(actor);
    
    try {
      await navigator.clipboard.writeText(content);
      ui.notifications.info(game.i18n.localize("RT.NPC.Export.CopiedToClipboard"));
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      ui.notifications.error(game.i18n.localize("RT.NPC.Export.CopyFailed"));
    }
  }
}
