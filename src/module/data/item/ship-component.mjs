import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Ship Component items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class ShipComponentData extends ItemDataModel.mixin(
  DescriptionTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Component type/category
      componentType: new fields.StringField({
        required: true,
        initial: "essential",
        choices: [
          "essential", "supplemental", "weapons", "auger",
          "gellarField", "voidShields", "warpDrive", "lifeSupport",
          "quarters", "bridge", "generatorum", "plasmaDrive",
          "augment", "archeotech", "xenotech"
        ]
      }),
      
      // Hull type restrictions
      hullType: new fields.SetField(
        new fields.StringField({ 
          required: true,
          choices: ["transport", "raider", "frigate", "light-cruiser", "cruiser", "battlecruiser", "grand-cruiser", "all"]
        }),
        { required: true, initial: new Set(["all"]) }
      ),
      
      // Resource requirements
      power: new fields.SchemaField({
        used: new fields.NumberField({ required: true, initial: 0, integer: true }),
        generated: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true })
      }),
      
      space: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // Ship Points cost
      shipPoints: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // Availability
      availability: new fields.StringField({
        required: true,
        initial: "common",
        choices: [
          "ubiquitous", "abundant", "plentiful", "common",
          "average", "scarce", "rare", "very-rare",
          "extremely-rare", "near-unique", "unique"
        ]
      }),
      
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
      
      // Is this component essential (cannot be removed)?
      essential: new fields.BooleanField({ required: true, initial: false }),
      
      // Component condition
      condition: new fields.StringField({
        required: true,
        initial: "functional",
        choices: ["functional", "damaged", "unpowered", "destroyed"]
      }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * Migrate ship component data.
   * @param {object} source  The source data
   * @protected
   */
  static _migrateData(source) {
    super._migrateData?.(source);
    ShipComponentData.#migratePowerUsage(source);
    ShipComponentData.#migrateSpaceUsage(source);
    ShipComponentData.#migrateSpCost(source);
    ShipComponentData.#migrateType(source);
    ShipComponentData.#migrateHullType(source);
  }

  /**
   * Handle legacy powerUsage field.
   * @param {object} source  The source data
   */
  static #migratePowerUsage(source) {
    if ('powerUsage' in source && !source.power) {
      const usage = source.powerUsage;
      source.power = {
        used: usage >= 0 ? usage : 0,
        generated: usage < 0 ? Math.abs(usage) : 0
      };
      delete source.powerUsage;
    }
  }

  /**
   * Handle legacy spaceUsage field.
   * @param {object} source  The source data
   */
  static #migrateSpaceUsage(source) {
    if ('spaceUsage' in source && source.space === undefined) {
      source.space = source.spaceUsage;
      delete source.spaceUsage;
    }
  }

  /**
   * Handle legacy spCost field.
   * @param {object} source  The source data
   */
  static #migrateSpCost(source) {
    if ('spCost' in source && source.shipPoints === undefined) {
      source.shipPoints = source.spCost;
      delete source.spCost;
    }
  }

  /**
   * Handle legacy type field.
   * @param {object} source  The source data
   */
  static #migrateType(source) {
    if ('type' in source && !source.componentType) {
      let type = source.type.replace(/^\(es\.\)\s*/, '').toLowerCase();
      type = type.replace(/\s+/g, '-');
      source.componentType = type;
      
      if (source.type.startsWith('(es.)')) {
        source.essential = true;
      }
      delete source.type;
    }
  }

  /**
   * Parse hullType string to array.
   * @param {object} source  The source data
   */
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

  /* -------------------------------------------- */
  /*  Data Cleaning                               */
  /* -------------------------------------------- */

  /**
   * Clean ship component data.
   * @param {object} source     The source data
   * @param {object} options    Additional options
   * @protected
   */
  static _cleanData(source, options) {
    super._cleanData?.(source, options);
    // Ensure hullType is array for Set field
    if (source.hullType && !Array.isArray(source.hullType)) {
      if (typeof source.hullType === 'string') {
        source.hullType = [source.hullType];
      } else if (source.hullType instanceof Set) {
        source.hullType = Array.from(source.hullType);
      }
    }
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the component type label.
   * @type {string}
   */
  get componentTypeLabel() {
    return game.i18n.localize(`RT.ShipComponent.${this.componentType.capitalize()}`);
  }

  /**
   * Get the hull type label.
   * @type {string}
   */
  get hullTypeLabel() {
    if ( this.hullType.has("all") ) return game.i18n.localize("RT.HullType.All");
    return Array.from(this.hullType)
      .map(h => game.i18n.localize(`RT.HullType.${h.split("-").map(s => s.capitalize()).join("")}`))
      .join(", ");
  }

  /**
   * Net power usage (positive = consumes, negative = generates).
   * @type {number}
   */
  get netPower() {
    return this.power.used - this.power.generated;
  }

  /**
   * Get power display string.
   * @type {string}
   */
  get powerLabel() {
    if ( this.power.generated > 0 ) return `+${this.power.generated}`;
    if ( this.power.used > 0 ) return `−${this.power.used}`;
    return "0";
  }

  /**
   * Power display for templates (alias for powerLabel).
   * @type {string}
   */
  get powerDisplay() {
    return this.powerLabel;
  }

  /**
   * Is this component operational?
   * @type {boolean}
   */
  get isOperational() {
    return this.condition === "functional";
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
      this.componentTypeLabel,
      `Hull: ${this.hullTypeLabel}`,
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
      type: this.componentTypeLabel,
      power: this.powerLabel,
      space: this.space,
      sp: this.shipPoints
    };
  }
}
