/**
 * @file StatBlockParser - Import NPC data from various formats
 * Phase 6: Advanced GM Tools
 * 
 * Provides:
 * - Parse JSON stat blocks
 * - Parse structured text (common stat block layouts)
 * - Parse freeform text with pattern matching
 * - Preview and validate before import
 */

import ThreatCalculator from "./threat-calculator.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for parsing and importing NPC stat blocks.
 * @extends {ApplicationV2}
 */
export default class StatBlockParser extends HandlebarsApplicationMixin(ApplicationV2) {

  /* -------------------------------------------- */
  /*  Static Configuration                        */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "stat-block-parser-{id}",
    classes: ["rogue-trader", "stat-block-parser"],
    tag: "form",
    window: {
      title: "RT.NPC.Import.Title",
      icon: "fa-solid fa-file-import",
      minimizable: false,
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 800,
      height: 700
    },
    form: {
      handler: StatBlockParser.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      parse: StatBlockParser.#onParse,
      cancel: StatBlockParser.#onCancel,
      clearInput: StatBlockParser.#onClearInput
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    form: {
      template: "systems/rogue-trader/templates/dialogs/stat-block-parser.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Static Patterns                             */
  /* -------------------------------------------- */

  /**
   * Common patterns for parsing stat blocks.
   * @type {Object}
   */
  static PATTERNS = {
    // Characteristic patterns
    characteristic: /\b(WS|BS|S|T|Ag|Int|Per|WP|Fel|Inf)\s*[:=]?\s*(\d{1,2})/gi,
    characteristicLong: /\b(Weapon Skill|Ballistic Skill|Strength|Toughness|Agility|Intelligence|Perception|Willpower|Fellowship|Influence)\s*[:=]?\s*(\d{1,2})/gi,
    
    // Wounds
    wounds: /\bWounds\s*[:=]?\s*(\d+)/i,
    
    // Movement
    movement: /\bMovement\s*[:=]?\s*(\d+)(?:\s*\/\s*(\d+))?(?:\s*\/\s*(\d+))?(?:\s*\/\s*(\d+))?/i,
    movementNamed: /\b(Half|Full|Charge|Run)\s*[:=]?\s*(\d+)/gi,
    
    // Armour
    armour: /\b(?:Armou?r|AP)\s*[:=]?\s*(\d+)/i,
    armourByLocation: /\b(Head|Body|Arms?|Legs?)\s*[:=]?\s*(\d+)/gi,
    
    // Skills
    skill: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*(?:\+(\d+))?(?:\s*\(([^)]+)\))?/g,
    skillList: /Skills?\s*[:=]?\s*(.+?)(?=\n\n|\nTalents?|\nTraits?|$)/is,
    
    // Talents
    talentList: /Talents?\s*[:=]?\s*(.+?)(?=\n\n|\nTraits?|\nWeapons?|$)/is,
    
    // Traits
    traitList: /Traits?\s*[:=]?\s*(.+?)(?=\n\n|\nWeapons?|\nArmou?r|$)/is,
    
    // Weapons
    weapon: /([A-Z][^()\n]+?)\s*(?:\(([^)]+)\))?\s*(\d+d\d+(?:[+-]\d+)?)\s*(?:I|R|E|X)?(?:\s+Pen\s*(\d+))?/gi,
    weaponSimple: /([A-Z][a-zA-Z\s]+)\s*[:–-]\s*(\d+d\d+(?:[+-]\d+)?)/g,
    
    // Threat/Type
    threat: /\bThreat\s*(?:Level|Rating)?\s*[:=]?\s*(\d+)/i,
    npcType: /\b(Troop|Elite|Master|Horde|Swarm|Creature|Daemon|Xenos)\b/i,
    
    // Name extraction
    name: /^([A-Z][A-Za-z\s'-]+)(?:\n|$)/m
  };

  /**
   * Characteristic short to key mapping.
   * @type {Object}
   */
  static CHAR_MAP = {
    "WS": "weaponSkill",
    "BS": "ballisticSkill",
    "S": "strength",
    "T": "toughness",
    "Ag": "agility",
    "Int": "intelligence",
    "Per": "perception",
    "WP": "willpower",
    "Fel": "fellowship",
    "Inf": "influence",
    "Weapon Skill": "weaponSkill",
    "Ballistic Skill": "ballisticSkill",
    "Strength": "strength",
    "Toughness": "toughness",
    "Agility": "agility",
    "Intelligence": "intelligence",
    "Perception": "perception",
    "Willpower": "willpower",
    "Fellowship": "fellowship",
    "Influence": "influence"
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Raw input text.
   * @type {string}
   */
  #rawInput = "";

  /**
   * Parsed data preview.
   * @type {Object|null}
   */
  #parsedData = null;

  /**
   * Parse errors.
   * @type {Array<string>}
   */
  #errors = [];

  /**
   * Parse warnings.
   * @type {Array<string>}
   */
  #warnings = [];

  /**
   * Promise resolver.
   * @type {Function|null}
   */
  #resolve = null;

  /**
   * Whether submission occurred.
   * @type {boolean}
   */
  #submitted = false;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    return {
      ...context,
      rawInput: this.#rawInput,
      parsedData: this.#parsedData,
      errors: this.#errors,
      warnings: this.#warnings,
      hasParsed: this.#parsedData !== null,
      hasErrors: this.#errors.length > 0,
      hasWarnings: this.#warnings.length > 0,
      canImport: this.#parsedData !== null && this.#errors.length === 0,
      buttons: [
        { type: "button", action: "parse", icon: "fa-solid fa-magnifying-glass", label: "RT.NPC.Import.Parse", cssClass: "secondary" },
        { type: "submit", icon: "fa-solid fa-file-import", label: "RT.NPC.Import.Import", cssClass: "primary", disabled: !this.#parsedData },
        { type: "button", action: "cancel", icon: "fa-solid fa-times", label: "Cancel" }
      ]
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    
    // Track input changes
    const textarea = this.element.querySelector('[name="rawInput"]');
    if (textarea) {
      textarea.addEventListener("input", (e) => {
        this.#rawInput = e.target.value;
      });
    }
  }

  /* -------------------------------------------- */
  /*  Parsing Methods                             */
  /* -------------------------------------------- */

  /**
   * Parse input text and detect format.
   * @param {string} input - Raw input text.
   * @returns {Object} Parsed NPC data.
   */
  static parse(input) {
    const trimmed = input.trim();
    
    // Detect JSON
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return this.parseJSON(trimmed);
    }
    
    // Otherwise, parse as text
    return this.parseText(trimmed);
  }

  /**
   * Parse JSON format input.
   * @param {string} input - JSON string.
   * @returns {Object} Parsed data with validation.
   */
  static parseJSON(input) {
    const result = {
      data: null,
      errors: [],
      warnings: []
    };
    
    try {
      const parsed = JSON.parse(input);
      
      // Check if it's a full actor export
      if (parsed.system && parsed.type) {
        result.data = {
          name: parsed.name || "Imported NPC",
          img: parsed.img || "icons/svg/mystery-man.svg",
          type: parsed.type === "npcV2" ? "npcV2" : "npcV2",
          system: parsed.system,
          items: parsed.items || []
        };
      }
      // Check if it's just system data
      else if (parsed.characteristics || parsed.threatLevel) {
        result.data = {
          name: parsed.name || "Imported NPC",
          img: "icons/svg/mystery-man.svg",
          type: "npcV2",
          system: parsed,
          items: []
        };
      }
      else {
        result.errors.push("Unrecognized JSON format. Expected actor export or system data.");
      }
      
      // Validate required fields
      if (result.data) {
        if (!result.data.system.characteristics) {
          result.warnings.push("No characteristics found. Default values will be used.");
        }
        if (!result.data.system.wounds) {
          result.warnings.push("No wounds found. Default value will be used.");
        }
      }
      
    } catch (err) {
      result.errors.push(`Invalid JSON: ${err.message}`);
    }
    
    return result;
  }

  /**
   * Parse structured text format.
   * @param {string} input - Text input.
   * @returns {Object} Parsed data with validation.
   */
  static parseText(input) {
    const result = {
      data: null,
      errors: [],
      warnings: []
    };
    
    // Start with default NPC data
    const systemData = ThreatCalculator.generateNPCData({ threatLevel: 5 });
    
    // Extract name
    const nameMatch = input.match(this.PATTERNS.name);
    const name = nameMatch ? nameMatch[1].trim() : "Imported NPC";
    
    // Extract characteristics
    const charMatches = [...input.matchAll(this.PATTERNS.characteristic)];
    const charLongMatches = [...input.matchAll(this.PATTERNS.characteristicLong)];
    const allCharMatches = [...charMatches, ...charLongMatches];
    
    if (allCharMatches.length > 0) {
      for (const match of allCharMatches) {
        const short = match[1];
        const value = parseInt(match[2], 10);
        const key = this.CHAR_MAP[short];
        
        if (key && systemData.characteristics[key]) {
          systemData.characteristics[key].base = value;
          systemData.characteristics[key].total = value;
          systemData.characteristics[key].bonus = Math.floor(value / 10);
        }
      }
    } else {
      result.warnings.push("No characteristics found. Using defaults based on threat level.");
    }
    
    // Extract wounds
    const woundsMatch = input.match(this.PATTERNS.wounds);
    if (woundsMatch) {
      const wounds = parseInt(woundsMatch[1], 10);
      systemData.wounds.max = wounds;
      systemData.wounds.value = wounds;
    } else {
      result.warnings.push("No wounds found. Using default value.");
    }
    
    // Extract armour
    const armourMatch = input.match(this.PATTERNS.armour);
    if (armourMatch) {
      systemData.armour.total = parseInt(armourMatch[1], 10);
    }
    
    // Extract movement
    const movementMatch = input.match(this.PATTERNS.movement);
    if (movementMatch) {
      const values = [movementMatch[1], movementMatch[2], movementMatch[3], movementMatch[4]]
        .filter(v => v)
        .map(v => parseInt(v, 10));
      
      if (values.length === 1) {
        // Single value - assume it's half movement
        systemData.movement.half = values[0];
        systemData.movement.full = values[0] * 2;
        systemData.movement.charge = values[0] * 3;
        systemData.movement.run = values[0] * 6;
      } else if (values.length >= 4) {
        systemData.movement.half = values[0];
        systemData.movement.full = values[1];
        systemData.movement.charge = values[2];
        systemData.movement.run = values[3];
      }
    }
    
    // Extract threat level
    const threatMatch = input.match(this.PATTERNS.threat);
    if (threatMatch) {
      systemData.threatLevel = parseInt(threatMatch[1], 10);
    }
    
    // Extract NPC type
    const typeMatch = input.match(this.PATTERNS.npcType);
    if (typeMatch) {
      systemData.type = typeMatch[1].toLowerCase();
    }
    
    // Extract weapons (simple pattern)
    const weaponMatches = [...input.matchAll(this.PATTERNS.weaponSimple)];
    if (weaponMatches.length > 0) {
      systemData.weapons.simple = weaponMatches.map(m => ({
        name: m[1].trim(),
        damage: m[2],
        pen: 0,
        range: "Melee",
        rof: "S/-/-",
        clip: 0,
        reload: "-",
        special: "",
        class: "melee"
      }));
    }
    
    // Extract skills section
    const skillMatch = input.match(this.PATTERNS.skillList);
    if (skillMatch) {
      const skillText = skillMatch[1];
      const skills = this._parseSkillList(skillText);
      systemData.trainedSkills = { ...systemData.trainedSkills, ...skills };
    }
    
    // Build final data
    result.data = {
      name,
      img: "icons/svg/mystery-man.svg",
      type: "npcV2",
      system: systemData,
      items: []
    };
    
    // Extract talents/traits for items (would need separate handling)
    const talentMatch = input.match(this.PATTERNS.talentList);
    if (talentMatch) {
      result.warnings.push("Talents detected but not imported as items. Add manually after creation.");
    }
    
    const traitMatch = input.match(this.PATTERNS.traitList);
    if (traitMatch) {
      result.warnings.push("Traits detected but not imported as items. Add manually after creation.");
    }
    
    return result;
  }

  /**
   * Parse a skill list string.
   * @param {string} text - Skills text.
   * @returns {Object} Trained skills object.
   * @private
   */
  static _parseSkillList(text) {
    const skills = {};
    
    // Common skill names
    const skillNames = [
      "Acrobatics", "Athletics", "Awareness", "Charm", "Command", "Commerce",
      "Common Lore", "Deceive", "Dodge", "Evaluate", "Forbidden Lore", "Inquiry",
      "Interrogation", "Intimidate", "Linguistics", "Logic", "Medicae", "Navigate",
      "Operate", "Parry", "Psyniscience", "Scholastic Lore", "Scrutiny", "Security",
      "Sleight of Hand", "Stealth", "Survival", "Tech-Use", "Trade"
    ];
    
    for (const skillName of skillNames) {
      const regex = new RegExp(`\\b${skillName}(?:\\s*\\+?(\\d+))?`, "i");
      const match = text.match(regex);
      
      if (match) {
        const key = skillName.replace(/\s+/g, "").replace("-", "");
        const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
        const level = match[1] ? parseInt(match[1], 10) : 0;
        
        skills[camelKey] = {
          name: skillName,
          characteristic: this._getSkillCharacteristic(camelKey),
          trained: true,
          plus10: level >= 10,
          plus20: level >= 20,
          bonus: 0
        };
      }
    }
    
    return skills;
  }

  /**
   * Get the characteristic for a skill.
   * @param {string} skillKey - Skill key.
   * @returns {string} Characteristic key.
   * @private
   */
  static _getSkillCharacteristic(skillKey) {
    const map = {
      acrobatics: "agility",
      athletics: "strength",
      awareness: "perception",
      charm: "fellowship",
      command: "fellowship",
      commerce: "fellowship",
      commonLore: "intelligence",
      deceive: "fellowship",
      dodge: "agility",
      evaluate: "intelligence",
      forbiddenLore: "intelligence",
      inquiry: "fellowship",
      interrogation: "willpower",
      intimidate: "strength",
      linguistics: "intelligence",
      logic: "intelligence",
      medicae: "intelligence",
      navigate: "intelligence",
      operate: "agility",
      parry: "weaponSkill",
      psyniscience: "perception",
      scholasticLore: "intelligence",
      scrutiny: "perception",
      security: "intelligence",
      sleightOfHand: "agility",
      stealth: "agility",
      survival: "perception",
      techUse: "intelligence",
      trade: "intelligence"
    };
    
    return map[skillKey] || "perception";
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle parse button.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onParse(event, target) {
    const result = StatBlockParser.parse(this.#rawInput);
    
    this.#parsedData = result.data;
    this.#errors = result.errors;
    this.#warnings = result.warnings;
    
    this.render({ parts: ["form"] });
  }

  /**
   * Handle form submission.
   * @param {Event} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async #onSubmit(event, form, formData) {
    if (!this.#parsedData) {
      ui.notifications.error("No valid data to import. Parse input first.");
      return;
    }
    
    try {
      const actorData = {
        name: this.#parsedData.name,
        type: this.#parsedData.type,
        img: this.#parsedData.img,
        system: this.#parsedData.system
      };
      
      const actor = await Actor.create(actorData);
      
      // Create embedded items if any
      if (this.#parsedData.items?.length > 0) {
        await actor.createEmbeddedDocuments("Item", this.#parsedData.items);
      }
      
      ui.notifications.info(game.i18n.format("RT.NPC.Import.Success", { name: actor.name }));
      actor.sheet.render(true);
      
      this.#submitted = true;
      if (this.#resolve) this.#resolve(actor);
      
    } catch (err) {
      console.error("Failed to import NPC:", err);
      ui.notifications.error(game.i18n.localize("RT.NPC.Import.Failed"));
      if (this.#resolve) this.#resolve(null);
    }
  }

  /**
   * Handle cancel button.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onCancel(event, target) {
    this.#submitted = false;
    if (this.#resolve) this.#resolve(null);
    await this.close();
  }

  /**
   * Handle clear input button.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onClearInput(event, target) {
    this.#rawInput = "";
    this.#parsedData = null;
    this.#errors = [];
    this.#warnings = [];
    this.render({ parts: ["form"] });
  }

  /* -------------------------------------------- */
  /*  Lifecycle                                   */
  /* -------------------------------------------- */

  /** @override */
  async close(options = {}) {
    if (!this.#submitted && this.#resolve) {
      this.#resolve(null);
    }
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Wait for import completion.
   * @returns {Promise<Actor|null>} Created actor or null.
   */
  async wait() {
    return new Promise((resolve) => {
      this.#resolve = resolve;
      this.render(true);
    });
  }

  /**
   * Open the parser dialog.
   * @param {string} [initialInput=""] - Optional initial input.
   * @returns {Promise<Actor|null>} Created actor or null.
   */
  static async open(initialInput = "") {
    const parser = new this();
    parser.#rawInput = initialInput;
    return parser.wait();
  }

  /**
   * Quick parse without dialog (returns data only, doesn't create actor).
   * @param {string} input - Input to parse.
   * @returns {Object} Parse result with data, errors, warnings.
   */
  static quickParse(input) {
    return this.parse(input);
  }
}
