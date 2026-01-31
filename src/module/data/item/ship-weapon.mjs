import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Ship Weapon items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class ShipWeaponData extends ItemDataModel.mixin(
  DescriptionTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Weapon type
      weaponType: new fields.StringField({
        required: true,
        initial: "macrobattery",
        choices: [
          "macrobattery", "lance", "nova-cannon", "torpedo",
          "bombardment-cannon", "landing-bay", "attack-craft"
        ]
      }),
      
      // Firing arc/location
      location: new fields.StringField({
        required: true,
        initial: "dorsal",
        choices: ["prow", "dorsal", "port", "starboard", "keel"]
      }),
      
      // Hull type restrictions
      hullType: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: new Set(["all"]) }
      ),
      
      // Resource requirements
      power: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      space: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      shipPoints: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // Weapon stats
      strength: new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),
      damage: new fields.StringField({ required: true, initial: "1d10" }),
      crit: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      range: new fields.NumberField({ required: true, initial: 5, min: 0 }),
      
      // Special qualities
      special: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: new Set() }
      ),
      
      // Availability
      availability: new fields.StringField({
        required: true,
        initial: "common"
      }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * Migrate ship weapon data.
   * @param {object} source  The source data
   * @protected
   */
  static _migrateData(source) {
    super._migrateData?.(source);
    ShipWeaponData.#migratePowerUsage(source);
    ShipWeaponData.#migrateSpaceUsage(source);
    ShipWeaponData.#migrateSpCost(source);
    ShipWeaponData.#migrateCritRating(source);
    ShipWeaponData.#migrateType(source);
    ShipWeaponData.#migrateNumericFields(source);
    ShipWeaponData.#migrateHullType(source);
    ShipWeaponData.#initializeSpecial(source);
  }

  static #migratePowerUsage(source) {
    if ('powerUsage' in source && source.power === undefined) {
      source.power = source.powerUsage;
      delete source.powerUsage;
    }
  }

  static #migrateSpaceUsage(source) {
    if ('spaceUsage' in source && source.space === undefined) {
      source.space = source.spaceUsage;
      delete source.spaceUsage;
    }
  }

  static #migrateSpCost(source) {
    if ('spCost' in source && source.shipPoints === undefined) {
      source.shipPoints = source.spCost;
      delete source.spCost;
    }
  }

  static #migrateCritRating(source) {
    if ('critRating' in source && source.crit === undefined) {
      source.crit = source.critRating;
      delete source.critRating;
    }
  }

  static #migrateType(source) {
    if ('type' in source) {
      if (!source.weaponType) {
        const typeMap = {
          'macrocannon': 'macrobattery', 'macrobattery': 'macrobattery',
          'lance': 'lance', 'torpedo': 'torpedo', 'topedo warhead': 'torpedo',
          'nova cannon': 'nova-cannon', 'bombardment cannon': 'bombardment-cannon',
          'landing bay': 'landing-bay', 'attack craft': 'attack-craft'
        };
        const normalized = source.type.toLowerCase();
        source.weaponType = typeMap[normalized] || 'macrobattery';
      }
      delete source.type;
    }
  }

  static #migrateNumericFields(source) {
    const numericFields = ['power', 'space', 'shipPoints', 'crit', 'strength'];
    for (const field of numericFields) {
      if (source[field] === '-' || source[field] === null || source[field] === undefined) {
        source[field] = 0;
      } else if (typeof source[field] === 'string') {
        const parsed = parseInt(source[field]);
        source[field] = isNaN(parsed) ? 0 : parsed;
      }
    }
  }

  static #migrateHullType(source) {
    if (typeof source.hullType === 'string') {
      const types = source.hullType.toLowerCase()
        .replace(/all ships?/i, 'all')
        .split(/[,\s]+/)
        .map(s => s.trim().replace(/\s+/g, '-'))
        .filter(Boolean);
      source.hullType = types.length ? types : ['all'];
    }
  }

  static #initializeSpecial(source) {
    if (!source.special) {
      source.special = [];
    }
  }

  /* -------------------------------------------- */
  /*  Data Cleaning                               */
  /* -------------------------------------------- */

  /**
   * Clean ship weapon data.
   * @param {object} source     The source data
   * @param {object} options    Additional options
   * @protected
   */
  static _cleanData(source, options) {
    super._cleanData?.(source, options);
    // Ensure hullType is array
    if (source.hullType && !Array.isArray(source.hullType)) {
      if (typeof source.hullType === 'string') {
        source.hullType = [source.hullType];
      } else if (source.hullType instanceof Set) {
        source.hullType = Array.from(source.hullType);
      }
    }
    // Ensure special is array
    if (source.special && !Array.isArray(source.special)) {
      if (typeof source.special === 'string') {
        source.special = source.special.split(',').map(s => s.trim());
      } else if (source.special instanceof Set) {
        source.special = Array.from(source.special);
      }
    }
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  get isRollable() {
    return true;
  }

  /**
   * Get the weapon type label.
   * @type {string}
   */
  get weaponTypeLabel() {
    return game.i18n.localize(`RT.ShipWeapon.${this.weaponType.split("-").map(s => s.capitalize()).join("")}`);
  }

  /**
   * Get the location label.
   * @type {string}
   */
  get locationLabel() {
    return game.i18n.localize(`RT.ShipLocation.${this.location.capitalize()}`);
  }

  /**
   * Get the damage string.
   * @type {string}
   */
  get damageLabel() {
    return `${this.damage}${this.crit > 0 ? ` (Crit ${this.crit}+)` : ""}`;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      this.weaponTypeLabel,
      `Location: ${this.locationLabel}`,
      `Str: ${this.strength}`,
      `Damage: ${this.damageLabel}`,
      `Range: ${this.range} VU`,
      `Power: ${this.power}`,
      `Space: ${this.space}`,
      `SP: ${this.shipPoints}`
    ];
    
    if ( this.special.size ) {
      props.push(`Special: ${Array.from(this.special).join(", ")}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      type: this.weaponTypeLabel,
      location: this.locationLabel,
      strength: this.strength,
      damage: this.damageLabel,
      range: `${this.range} VU`
    };
  }
}
