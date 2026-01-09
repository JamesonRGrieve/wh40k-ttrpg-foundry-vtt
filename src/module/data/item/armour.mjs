import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import PhysicalItemTemplate from "../shared/physical-item-template.mjs";
import EquippableTemplate from "../shared/equippable-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Armour items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 */
export default class ArmourData extends ItemDataModel.mixin(
  DescriptionTemplate,
  PhysicalItemTemplate,
  EquippableTemplate
) {
  
  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /**
   * Migrate legacy armour data to V13 schema.
   * @param {object} source  The source data
   * @returns {object}       Migrated data
   */
  static migrateData(source) {
    const updates = {};
    
    // 1. Migrate `ap` → `armourPoints`
    if (source.ap !== undefined && !this._hasCustomArmourPoints(source)) {
      const parsed = this._parseLegacyAPStatic(source);
      if (parsed?.pointsByLocation) {
        updates.armourPoints = parsed.pointsByLocation;
      } else if (parsed?.defaultValue !== undefined) {
        const ap = parsed.defaultValue;
        updates.armourPoints = {
          head: ap, body: ap, leftArm: ap, 
          rightArm: ap, leftLeg: ap, rightLeg: ap
        };
      } else if (parsed?.special) {
        // Special AP values (force fields, etc.) - set to 0 and preserve in notes
        updates.armourPoints = {
          head: 0, body: 0, leftArm: 0, 
          rightArm: 0, leftLeg: 0, rightLeg: 0
        };
        const specialNote = typeof source.ap === 'string' ? source.ap : 'Special';
        updates.notes = ((source.notes || '') + ` [AP: ${specialNote}]`).trim();
      }
    }
    
    // 2. Migrate `locations` → `coverage`
    if (typeof source.locations === 'string' && !source.coverage) {
      const parsed = this._parseLegacyLocationsStatic(source);
      if (parsed?.size) {
        updates.coverage = Array.from(parsed);
      }
    }
    
    // 3. Migrate `maxAg` string → `maxAgility` number
    if (source.maxAg !== undefined && source.maxAgility === undefined) {
      if (source.maxAg === '-' || source.maxAg === '' || source.maxAg === null) {
        updates.maxAgility = null;
      } else {
        const parsed = parseInt(source.maxAg);
        if (!isNaN(parsed)) updates.maxAgility = parsed;
      }
    }
    
    // 4. Clean weight (remove "kg" suffix)
    if (typeof source.weight === 'string') {
      const cleaned = parseFloat(source.weight.replace(/[^\d.]/g, ''));
      if (!isNaN(cleaned)) updates.weight = cleaned;
    }
    
    // 5. Ensure properties exists
    if (!source.properties) {
      updates.properties = [];
    }
    
    // Apply updates
    foundry.utils.mergeObject(source, updates);
    
    // Handle Sets (convert arrays to Sets)
    if (Array.isArray(source.coverage)) {
      source.coverage = new Set(source.coverage);
    }
    if (Array.isArray(source.properties)) {
      source.properties = new Set(source.properties);
    }
    
    return source;
  }

  /**
   * Clean data before saving (convert Sets to arrays).
   * @param {object} source  The source data
   * @param {object} options Cleaning options
   * @returns {object}       Cleaned data
   */
  static cleanData(source, options) {
    // Convert Sets to arrays for storage
    if (source.coverage instanceof Set) {
      source.coverage = Array.from(source.coverage);
    }
    if (source.properties instanceof Set) {
      source.properties = Array.from(source.properties);
    }
    
    return super.cleanData(source, options);
  }

  /**
   * Validate armour data.
   * @param {object} changes  Proposed changes
   * @throws {Error}          If validation fails
   */
  static validateJoint(data) {
    super.validateJoint(data);
    
    // Validate AP values (0-20 reasonable range)
    const locations = ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"];
    for (const loc of locations) {
      const ap = data.armourPoints?.[loc];
      if (ap !== undefined && (ap < 0 || ap > 20)) {
        throw new Error(`Armour point value for ${loc} must be between 0 and 20`);
      }
    }
    
    // Validate coverage is not empty
    const coverage = data.coverage instanceof Set ? data.coverage : new Set(data.coverage || []);
    if (coverage.size === 0) {
      throw new Error("Armour must cover at least one location");
    }
    
    // Validate maxAgility
    if (data.maxAgility !== null && data.maxAgility !== undefined) {
      if (data.maxAgility < 0 || data.maxAgility > 100) {
        throw new Error("Max Agility must be between 0 and 100");
      }
    }
  }

  /* -------------------------------------------- */
  /*  Schema Definition                           */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    
    // Body location schema (reused for armour points)
    const LocationSchema = () => new fields.SchemaField({
      head: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      leftArm: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      rightArm: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      body: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      leftLeg: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      rightLeg: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true })
    });
    
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Armour classification
      type: new fields.StringField({
        required: true,
        initial: "flak",
        choices: [
          "flak", "mesh", "carapace", "power", "light-power",
          "storm-trooper", "feudal-world", "primitive", 
          "xenos", "void", "enforcer", "hostile-environment"
        ]
      }),
      
      // Armour points per location
      armourPoints: LocationSchema(),
      
      // Coverage - which locations does this cover?
      coverage: new fields.SetField(
        new fields.StringField({ 
          required: true,
          choices: ["head", "leftArm", "rightArm", "body", "leftLeg", "rightLeg", "all"]
        }),
        { required: true, initial: new Set(["body"]) }
      ),
      
      // Maximum agility bonus while wearing
      maxAgility: new fields.NumberField({ required: false, nullable: true, min: 0 }),
      
      // Special properties
      properties: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: new Set() }
      ),
      
      // Modification slots
      modificationSlots: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // Installed modifications (references to armourModification items)
      modifications: new fields.ArrayField(
        new fields.SchemaField({
          uuid: new fields.StringField({ required: true }),
          name: new fields.StringField({ required: true }),
          active: new fields.BooleanField({ required: true, initial: true })
        }),
        { required: true, initial: [] }
      ),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the armour type label.
   * @type {string}
   */
  get typeLabel() {
    return game.i18n.localize(`RT.ArmourType.${this.type.split("-").map(s => s.capitalize()).join("")}`);
  }

  /**
   * Does this cover all locations?
   * @type {boolean}
   */
  get coversAll() {
    return this.coverage.has("all");
  }

  /**
   * Get human-readable coverage description.
   * @type {string}
   */
  get coverageLabel() {
    const coverage = this._getEffectiveCoverage();
    if (coverage.has("all")) return game.i18n.localize("RT.Coverage.All");
    
    const locations = ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"];
    const covered = locations.filter(loc => coverage.has(loc));
    
    if (covered.length === 0) return game.i18n.localize("RT.Coverage.None");
    if (covered.length === 6) return game.i18n.localize("RT.Coverage.All");
    
    // Check for symmetrical coverage
    const hasArms = covered.includes("leftArm") && covered.includes("rightArm");
    const hasLegs = covered.includes("leftLeg") && covered.includes("rightLeg");
    
    const parts = [];
    if (covered.includes("head")) parts.push("Head");
    if (covered.includes("body")) parts.push("Body");
    if (hasArms) parts.push("Arms");
    else {
      if (covered.includes("leftArm")) parts.push("L.Arm");
      if (covered.includes("rightArm")) parts.push("R.Arm");
    }
    if (hasLegs) parts.push("Legs");
    else {
      if (covered.includes("leftLeg")) parts.push("L.Leg");
      if (covered.includes("rightLeg")) parts.push("R.Leg");
    }
    
    return parts.join(", ");
  }

  /**
   * Get coverage as icon string for compact display.
   * @type {string}
   */
  get coverageIcons() {
    const coverage = this._getEffectiveCoverage();
    if (coverage.has("all")) return "●●●●●●";
    
    const icons = [];
    if (coverage.has("head")) icons.push("●"); else icons.push("○");
    if (coverage.has("body")) icons.push("●"); else icons.push("○");
    if (coverage.has("leftArm") || coverage.has("rightArm")) icons.push("●"); else icons.push("○");
    if (coverage.has("leftLeg") || coverage.has("rightLeg")) icons.push("●"); else icons.push("○");
    
    return icons.join("");
  }

  /**
   * Get available special properties.
   * @type {string[]}
   */
  static get AVAILABLE_PROPERTIES() {
    return [
      "sealed",
      "auto-stabilized",
      "hexagrammic",
      "blessed",
      "camouflage",
      "lightweight",
      "reinforced",
      "agility-bonus",
      "strength-bonus"
    ];
  }

  /**
   * Get properties as localized labels array.
   * @type {string[]}
   */
  get propertyLabels() {
    return Array.from(this.properties).map(prop => 
      game.i18n.localize(`RT.ArmourProperty.${prop.split("-").map(s => s.capitalize()).join("")}`)
    );
  }

  _getLegacyField(field) {
    return this.parent?._source?.system?.[field];
  }

  /**
   * Check if armour has custom armour points.
   * @param {object} [source] Optional source data to check
   * @returns {boolean}
   */
  static _hasCustomArmourPoints(source) {
    const data = source || this;
    return Object.values(data.armourPoints ?? {}).some((value) => Number(value) > 0);
  }

  _hasCustomArmourPoints() {
    return Object.values(this.armourPoints ?? {}).some((value) => Number(value) > 0);
  }

  /**
   * Parse legacy locations field (static version for migration).
   * @param {object} source Source data
   * @returns {Set|null}
   */
  static _parseLegacyLocationsStatic(source) {
    const rawLocations = source.locations;
    if (!rawLocations || typeof rawLocations !== "string") return null;

    const normalized = rawLocations.toLowerCase();
    if (normalized.includes("all")) {
      return new Set(["all"]);
    }

    const coverage = new Set();
    const tokens = normalized.split(",").map((token) => token.trim()).filter(Boolean);
    for (const token of tokens) {
      if (token.includes("head")) {
        coverage.add("head");
      }
      if (token.includes("body") || token.includes("chest") || token.includes("torso")) {
        coverage.add("body");
      }
      if (token.includes("arm")) {
        coverage.add("leftArm");
        coverage.add("rightArm");
      }
      if (token.includes("leg")) {
        coverage.add("leftLeg");
        coverage.add("rightLeg");
      }
    }

    return coverage.size ? coverage : null;
  }

  _parseLegacyLocations() {
    const rawLocations = this._getLegacyField("locations");
    if (!rawLocations || typeof rawLocations !== "string") return null;

    const normalized = rawLocations.toLowerCase();
    if (normalized.includes("all")) {
      return new Set(["all"]);
    }

    const coverage = new Set();
    const tokens = normalized.split(",").map((token) => token.trim()).filter(Boolean);
    for (const token of tokens) {
      if (token.includes("head")) {
        coverage.add("head");
      }
      if (token.includes("body") || token.includes("chest") || token.includes("torso")) {
        coverage.add("body");
      }
      if (token.includes("arm")) {
        coverage.add("leftArm");
        coverage.add("rightArm");
      }
      if (token.includes("leg")) {
        coverage.add("leftLeg");
        coverage.add("rightLeg");
      }
    }

    return coverage.size ? coverage : null;
  }

  /**
   * Parse legacy AP field (static version for migration).
   * @param {object} source Source data
   * @returns {object|null}
   */
  static _parseLegacyAPStatic(source) {
    const rawAp = source.ap;
    if (rawAp === null || rawAp === undefined) return null;

    // Handle "Special" or narrative AP
    if (rawAp === "Special" || (typeof rawAp === 'string' && rawAp.toLowerCase().includes('psy'))) {
      return { special: true };
    }

    // Handle percentage (force fields)
    if (typeof rawAp === 'string' && rawAp.includes('%')) {
      const percent = parseFloat(rawAp) / 100;
      return { special: true, percentage: percent };
    }

    // Handle decimal (force fields as decimal)
    if (typeof rawAp === 'number' && rawAp < 1 && rawAp > 0) {
      return { special: true, percentage: rawAp };
    }

    // Handle single number
    if (typeof rawAp === "number") {
      return { defaultValue: rawAp };
    }

    if (typeof rawAp !== "string") {
      return null;
    }

    // Try to parse as single number
    const values = rawAp.match(/-?\d+(?:\.\d+)?/g);
    if (!values) return null;

    const parsed = values.map((value) => Number(value));
    if (parsed.length === 1) {
      return { defaultValue: parsed[0] };
    }

    // Handle pattern "H/B/A/L"
    if (parsed.length === 4) {
      return {
        pointsByLocation: {
          head: parsed[0],
          body: parsed[1],
          leftArm: parsed[2],
          rightArm: parsed[2],
          leftLeg: parsed[3],
          rightLeg: parsed[3]
        }
      };
    }

    return null;
  }

  _parseLegacyAP() {
    const rawAp = this._getLegacyField("ap");
    if (rawAp === null || rawAp === undefined) return null;

    if (typeof rawAp === "number") {
      return { defaultValue: rawAp };
    }

    if (typeof rawAp !== "string") {
      return null;
    }

    const values = rawAp.match(/-?\d+(?:\.\d+)?/g);
    if (!values) return null;

    const parsed = values.map((value) => Number(value));
    if (parsed.length === 1) {
      return { defaultValue: parsed[0] };
    }

    if (parsed.length === 4) {
      return {
        pointsByLocation: {
          head: parsed[0],
          body: parsed[1],
          leftArm: parsed[2],
          rightArm: parsed[2],
          leftLeg: parsed[3],
          rightLeg: parsed[3]
        }
      };
    }

    return null;
  }

  _getLegacyArmourProfile() {
    const ap = this._parseLegacyAP();
    if (!ap) return null;

    return {
      coverage: this._parseLegacyLocations(),
      ...ap
    };
  }

  _getEffectiveCoverage() {
    if (!this._hasCustomArmourPoints()) {
      const legacyCoverage = this._parseLegacyLocations();
      if (legacyCoverage?.size) return legacyCoverage;
    }

    const inferred = new Set();
    const locations = ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"];
    for (const location of locations) {
      if (Number(this.armourPoints?.[location]) > 0) {
        inferred.add(location);
      }
    }
    if (inferred.size) return inferred;

    return this.coverage ?? new Set();
  }

  /**
   * Get the AP value for a specific location.
   * @param {string} location   The body location.
   * @returns {number}
   */
  getAPForLocation(location) {
    if (!this._hasCustomArmourPoints()) {
      const legacy = this._getLegacyArmourProfile();
      if (legacy) {
        if (legacy.coverage && !legacy.coverage.has("all") && !legacy.coverage.has(location)) {
          return 0;
        }
        if (legacy.pointsByLocation) {
          return legacy.pointsByLocation[location] ?? 0;
        }
        return legacy.defaultValue ?? 0;
      }
    }

    const coverage = this._getEffectiveCoverage();
    if (coverage.has("all")) return this.armourPoints[location] ?? 0;
    if (coverage.size && !coverage.has(location)) return 0;
    return this.armourPoints[location] ?? 0;
  }

  /**
   * Get a summary of AP by location.
   * @type {string}
   */
  get apSummary() {
    const locations = ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"];
    const abbrs = { head: "H", body: "B", leftArm: "LA", rightArm: "RA", leftLeg: "LL", rightLeg: "RL" };
    const coverage = this._getEffectiveCoverage();
    const coveredLocations = coverage.has("all") || !coverage.size
      ? locations
      : locations.filter((loc) => coverage.has(loc));

    const values = coveredLocations.map((loc) => this.getAPForLocation(loc));
    const same = values.length && values.every((value) => value === values[0]);
    if (same && coveredLocations.length === locations.length) {
      return `All: ${values[0]}`;
    }

    return coveredLocations
      .map((loc) => `${abbrs[loc]}: ${this.getAPForLocation(loc)}`)
      .join(", ");
  }

  /**
   * How many modification slots are available?
   * @type {number}
   */
  get availableModSlots() {
    return this.modificationSlots - this.modifications.length;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      ...PhysicalItemTemplate.prototype.chatProperties.call(this)
    ];
    
    props.unshift(this.typeLabel);
    props.push(`AP: ${this.apSummary}`);
    props.push(`Coverage: ${this.coverageLabel}`);
    
    if ( this.maxAgility !== null ) {
      props.push(`Max Ag: ${this.maxAgility}`);
    }
    
    if ( this.properties.size ) {
      props.push(`Properties: ${this.propertyLabels.join(", ")}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      type: this.typeLabel,
      ap: this.apSummary,
      coverage: this.coverageLabel,
      maxAg: this.maxAgility ?? "-"
    };
  }
}
