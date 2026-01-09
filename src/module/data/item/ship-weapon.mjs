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
   * Migrate legacy pack data to V13 schema.
   * @param {object} source  Candidate source data
   * @returns {object}       Migrated data
   */
  static migrateData(source) {
    const migrated = super.migrateData?.(source) ?? source;
    
    // Handle legacy powerUsage field
    if ('powerUsage' in migrated && migrated.power === undefined) {
      migrated.power = migrated.powerUsage;
      delete migrated.powerUsage;
    }
    
    // Handle legacy spaceUsage field
    if ('spaceUsage' in migrated && migrated.space === undefined) {
      migrated.space = migrated.spaceUsage;
      delete migrated.spaceUsage;
    }
    
    // Handle legacy spCost field
    if ('spCost' in migrated && migrated.shipPoints === undefined) {
      migrated.shipPoints = migrated.spCost;
      delete migrated.spCost;
    }
    
    // Handle legacy critRating field
    if ('critRating' in migrated && migrated.crit === undefined) {
      migrated.crit = migrated.critRating;
      delete migrated.critRating;
    }
    
    // Handle legacy type field
    if ('type' in migrated && !migrated.weaponType) {
      migrated.weaponType = migrated.type.toLowerCase().replace(/\s+/g, '-');
      delete migrated.type;
    }
    
    // Parse hullType string to array
    if (typeof migrated.hullType === 'string') {
      const types = migrated.hullType.toLowerCase()
        .replace(/all ships?/i, 'all')
        .split(/[,\s]+/)
        .map(s => s.trim().replace(/\s+/g, '-'))
        .filter(Boolean);
      migrated.hullType = types.length ? types : ['all'];
    }
    
    return migrated;
  }

  /**
   * Clean data to ensure proper types.
   * @param {object} source  Candidate source data
   * @param {object} options Cleaning options
   * @returns {object}       Cleaned data
   */
  static cleanData(source, options) {
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
    
    return super.cleanData?.(source, options) ?? source;
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
