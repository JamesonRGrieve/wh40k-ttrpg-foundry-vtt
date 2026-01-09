import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Ship Upgrade items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class ShipUpgradeData extends ItemDataModel.mixin(
  DescriptionTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Resource requirements
      power: new fields.NumberField({ required: true, initial: 0, integer: true }),
      space: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      shipPoints: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // Stat modifiers
      modifiers: new fields.SchemaField({
        speed: new fields.NumberField({ required: true, initial: 0, integer: true }),
        manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
        detection: new fields.NumberField({ required: true, initial: 0, integer: true }),
        armour: new fields.NumberField({ required: true, initial: 0, integer: true }),
        hullIntegrity: new fields.NumberField({ required: true, initial: 0, integer: true }),
        turretRating: new fields.NumberField({ required: true, initial: 0, integer: true }),
        voidShields: new fields.NumberField({ required: true, initial: 0, integer: true }),
        morale: new fields.NumberField({ required: true, initial: 0, integer: true }),
        crewRating: new fields.NumberField({ required: true, initial: 0, integer: true })
      }),
      
      // Effect description
      effect: new fields.HTMLField({ required: true, blank: true }),
      
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
    
    // Rename spCost → shipPoints
    if ('spCost' in migrated && migrated.shipPoints === undefined) {
      migrated.shipPoints = migrated.spCost;
      delete migrated.spCost;
    }
    
    // Rename effects → effect
    if ('effects' in migrated && !migrated.effect) {
      migrated.effect = migrated.effects;
      delete migrated.effects;
    }
    
    // Parse shipAvailability → hullType (for future use if needed)
    if ('shipAvailability' in migrated) {
      // Preserve in notes for reference, but ship upgrades don't have hullType restriction
      if (!migrated.notes) {
        migrated.notes = `Ship Availability: ${migrated.shipAvailability}`;
      }
      delete migrated.shipAvailability;
    }
    
    // Add missing modifiers fields
    if (migrated.modifiers && typeof migrated.modifiers === 'object') {
      const defaults = {
        speed: 0,
        manoeuvrability: 0,
        detection: 0,
        armour: 0,
        hullIntegrity: 0,
        turretRating: 0,
        voidShields: 0,
        morale: 0,
        crewRating: 0
      };
      migrated.modifiers = { ...defaults, ...migrated.modifiers };
    }
    
    // Initialize missing fields with defaults
    if (migrated.power === undefined) migrated.power = 0;
    if (migrated.space === undefined) migrated.space = 0;
    if (migrated.availability === undefined) migrated.availability = 'common';
    if (migrated.notes === undefined) migrated.notes = '';
    
    return migrated;
  }

  /**
   * Clean data to ensure proper types.
   * @param {object} source  Candidate source data
   * @param {object} options Cleaning options
   * @returns {object}       Cleaned data
   */
  static cleanData(source, options) {
    // Ensure power is a number
    if (typeof source.power === 'string') {
      source.power = parseInt(source.power) || 0;
    }
    
    // Ensure space is a number
    if (typeof source.space === 'string') {
      source.space = parseInt(source.space) || 0;
    }
    
    return super.cleanData?.(source, options) ?? source;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Net power usage.
   * @type {string}
   */
  get powerLabel() {
    if ( this.power > 0 ) return `-${this.power}`;
    if ( this.power < 0 ) return `+${Math.abs(this.power)}`;
    return "0";
  }

  /**
   * Has any non-zero modifiers?
   * @type {boolean}
   */
  get hasModifiers() {
    return Object.values(this.modifiers).some(v => v !== 0);
  }

  /**
   * Get modifiers as a formatted list.
   * @type {object[]}
   */
  get modifiersList() {
    const list = [];
    for ( const [key, value] of Object.entries(this.modifiers) ) {
      if ( value !== 0 ) {
        list.push({
          key,
          label: game.i18n.localize(`RT.ShipStat.${key.capitalize()}`),
          value
        });
      }
    }
    return list;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      `Power: ${this.powerLabel}`,
      `Space: ${this.space}`,
      `SP: ${this.shipPoints}`
    ];
    
    for ( const mod of this.modifiersList ) {
      props.push(`${mod.label}: ${mod.value >= 0 ? "+" : ""}${mod.value}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      power: this.powerLabel,
      space: this.space,
      sp: this.shipPoints
    };
  }
}
