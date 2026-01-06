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
        { required: true, initial: ["body"] }
      ),
      
      // Maximum agility bonus while wearing
      maxAgility: new fields.NumberField({ required: false, nullable: true, min: 0 }),
      
      // Special properties
      properties: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: [] }
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

  _getLegacyField(field) {
    return this.parent?._source?.system?.[field];
  }

  _hasCustomArmourPoints() {
    return Object.values(this.armourPoints ?? {}).some((value) => Number(value) > 0);
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
    
    if ( this.maxAgility !== null ) {
      props.push(`Max Ag: ${this.maxAgility}`);
    }
    
    if ( this.properties.size ) {
      props.push(`Properties: ${Array.from(this.properties).join(", ")}`);
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
      maxAg: this.maxAgility ?? "-"
    };
  }
}
