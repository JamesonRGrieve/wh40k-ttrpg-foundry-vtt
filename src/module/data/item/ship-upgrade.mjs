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
   */
  static _migrateData(source) {
    super._migrateData?.(source);
    ShipUpgradeData.#migrateSpCost(source);
    ShipUpgradeData.#migrateEffects(source);
    ShipUpgradeData.#migrateShipAvailability(source);
    ShipUpgradeData.#migrateModifiers(source);
    ShipUpgradeData.#initializeDefaults(source);
  }

  /**
   * Rename spCost → shipPoints.
   * @param {object} source  The source data
   */
  static #migrateSpCost(source) {
    if ('spCost' in source && source.shipPoints === undefined) {
      source.shipPoints = source.spCost;
      delete source.spCost;
    }
  }

  /**
   * Rename effects → effect.
   * @param {object} source  The source data
   */
  static #migrateEffects(source) {
    if ('effects' in source && !source.effect) {
      source.effect = source.effects;
      delete source.effects;
    }
  }

  /**
   * Parse shipAvailability → notes.
   * @param {object} source  The source data
   */
  static #migrateShipAvailability(source) {
    if ('shipAvailability' in source) {
      if (!source.notes) {
        source.notes = `Ship Availability: ${source.shipAvailability}`;
      }
      delete source.shipAvailability;
    }
  }

  /**
   * Add missing modifiers fields.
   * @param {object} source  The source data
   */
  static #migrateModifiers(source) {
    if (source.modifiers && typeof source.modifiers === 'object') {
      const defaults = {
        speed: 0, manoeuvrability: 0, detection: 0, armour: 0,
        hullIntegrity: 0, turretRating: 0, voidShields: 0, morale: 0, crewRating: 0
      };
      source.modifiers = { ...defaults, ...source.modifiers };
    }
  }

  /**
   * Initialize missing fields with defaults.
   * @param {object} source  The source data
   */
  static #initializeDefaults(source) {
    source.power ??= 0;
    source.space ??= 0;
    source.availability ??= 'common';
    source.notes ??= '';
  }

  /* -------------------------------------------- */
  /*  Data Cleaning                               */
  /* -------------------------------------------- */

  /**
   * Clean ship upgrade data.
   * @param {object} source     The source data
   * @param {object} options    Additional options
   * @protected
   */
  static _cleanData(source, options) {
    super._cleanData?.(source, options);
    // Ensure power and space are numbers
    if (typeof source.power === 'string') {
      source.power = parseInt(source.power) || 0;
    }
    if (typeof source.space === 'string') {
      source.space = parseInt(source.space) || 0;
    }
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
