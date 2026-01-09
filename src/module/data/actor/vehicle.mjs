import ActorDataModel from "../abstract/actor-data-model.mjs";

/**
 * Data model for Vehicle actors.
 * Enhanced V13 schema with proper structure for all vehicle data.
 */
export default class VehicleData extends ActorDataModel {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      // === Vehicle Classification ===
      vehicleClass: new fields.StringField({
        required: true,
        initial: "ground",
        choices: ["ground", "air", "water", "space", "walker"],
        label: "RT.Vehicle.Class"
      }),
      
      // === Size ===
      size: new fields.NumberField({
        required: true,
        initial: 4, // Average
        integer: true,
        min: 1,
        max: 10,
        label: "RT.Vehicle.Size"
      }),
      
      sizeDescriptor: new fields.StringField({
        required: false,
        initial: "",
        blank: true,
        label: "RT.Vehicle.SizeDescriptor"
      }),
      
      // === Threat Classification ===
      faction: new fields.StringField({ required: false, initial: "", blank: true }),
      subfaction: new fields.StringField({ required: false, initial: "", blank: true }),
      type: new fields.StringField({
        required: true,
        initial: "vehicle",
        choices: ["vehicle", "walker", "flyer", "skimmer", "bike", "tank"],
        label: "RT.Vehicle.Type"
      }),
      threatLevel: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // === Armour by Facing (nested for value + descriptor) ===
      armour: new fields.SchemaField({
        front: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
          descriptor: new fields.StringField({ required: false, initial: "", blank: true })
        }),
        side: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
          descriptor: new fields.StringField({ required: false, initial: "", blank: true })
        }),
        rear: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
          descriptor: new fields.StringField({ required: false, initial: "", blank: true })
        })
      }),
      
      // === Speed ===
      speed: new fields.SchemaField({
        cruising: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        tactical: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        notes: new fields.StringField({ required: false, initial: "", blank: true })
      }),
      
      // === Crew & Passengers ===
      crew: new fields.SchemaField({
        required: new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),
        notes: new fields.StringField({ required: false, initial: "", blank: true })
      }),
      
      passengers: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // === Manoeuverability ===
      manoeuverability: new fields.NumberField({ required: true, initial: 0, integer: true }),
      
      // === Carrying Capacity ===
      carryingCapacity: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // === Structural Integrity ===
      integrity: new fields.SchemaField({
        max: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        critical: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true })
      }),
      
      // === Weapons (rich text for weapon descriptions) ===
      weapons: new fields.HTMLField({ required: true, blank: true }),
      
      // === Special Rules (rich text) ===
      specialRules: new fields.HTMLField({ required: true, blank: true }),
      
      // === Traits (text until items are dragged on) ===
      traitsText: new fields.StringField({ required: false, initial: "", blank: true }),
      
      // === Availability & Source ===
      availability: new fields.StringField({ required: false, initial: "common", blank: true }),
      source: new fields.StringField({ required: false, initial: "", blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @override */
  prepareBaseData() {
    super.prepareBaseData();
    
    // Ensure integrity.value doesn't exceed max
    if (this.integrity.value > this.integrity.max) {
      this.integrity.value = this.integrity.max;
    }
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    
    // No derived calculations needed yet
    // Future: Apply trait/upgrade modifiers here
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Is the vehicle damaged?
   * @type {boolean}
   */
  get isDamaged() {
    return this.integrity.value < this.integrity.max;
  }

  /**
   * Is the vehicle critically damaged?
   * @type {boolean}
   */
  get isCritical() {
    return this.integrity.critical > 0;
  }

  /**
   * Is the vehicle destroyed?
   * @type {boolean}
   */
  get isDestroyed() {
    return this.integrity.value <= 0 && this.integrity.max > 0;
  }

  /**
   * Get armour summary for display.
   * @type {string}
   */
  get armourSummary() {
    const f = this.armour.front.value;
    const s = this.armour.side.value;
    const r = this.armour.rear.value;
    return `F:${f} / S:${s} / R:${r}`;
  }

  /**
   * Get speed summary for display.
   * @type {string}
   */
  get speedSummary() {
    return `Cruising: ${this.speed.cruising} kph / Tactical: ${this.speed.tactical}m`;
  }

  /**
   * Get size label from config.
   * @type {string}
   */
  get sizeLabel() {
    const sizeConfig = CONFIG.rt?.vehicleSizes || CONFIG.rt?.sizes || {};
    const sizeData = sizeConfig[this.size];
    if (sizeData) {
      return game.i18n.localize(sizeData.label);
    }
    return this.sizeDescriptor || `Size ${this.size}`;
  }

  /**
   * Get vehicle class label from config.
   * @type {string}
   */
  get vehicleClassLabel() {
    const classes = CONFIG.rt?.vehicleClasses || {};
    const classData = classes[this.vehicleClass];
    if (classData) {
      return game.i18n.localize(classData.label);
    }
    return this.vehicleClass;
  }

  /**
   * Get vehicle type label from config.
   * @type {string}
   */
  get vehicleTypeLabel() {
    const types = CONFIG.rt?.vehicleTypes || {};
    const typeData = types[this.type];
    if (typeData) {
      return game.i18n.localize(typeData.label);
    }
    return this.type;
  }

  /**
   * Get integrity percentage.
   * @type {number}
   */
  get integrityPercentage() {
    if (this.integrity.max === 0) return 0;
    return Math.round((this.integrity.value / this.integrity.max) * 100);
  }

  /* -------------------------------------------- */
  /*  Roll Data                                   */
  /* -------------------------------------------- */

  /** @override */
  getRollData() {
    const data = super.getRollData();
    
    data.man = this.manoeuverability;
    data.armF = this.armour.front.value;
    data.armS = this.armour.side.value;
    data.armR = this.armour.rear.value;
    data.size = this.size;
    data.integrity = this.integrity.value;
    data.integrityMax = this.integrity.max;
    
    return data;
  }
}
