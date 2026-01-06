import ActorDataModel from "../abstract/actor-data-model.mjs";

/**
 * Data model for Vehicle actors.
 * Matches template.json "vehicle" template structure.
 * Note: Vehicles also include the "npc" template fields.
 */
export default class VehicleData extends ActorDataModel {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      // NPC template fields (vehicles include "npc" template)
      faction: new fields.StringField({ required: false, initial: "", blank: true }),
      subfaction: new fields.StringField({ required: false, initial: "", blank: true }),
      type: new fields.StringField({ required: true, initial: "troop" }),
      threatLevel: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // Armour by facing (flat fields matching template.json)
      front: new fields.StringField({ required: false, initial: "", blank: true }),
      side: new fields.StringField({ required: false, initial: "", blank: true }),
      rear: new fields.StringField({ required: false, initial: "", blank: true }),
      
      // Availability
      availability: new fields.StringField({ required: false, initial: "", blank: true }),
      
      // Speed
      speed: new fields.SchemaField({
        cruising: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        tactical: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true })
      }),
      
      // Crew
      crew: new fields.StringField({ required: false, initial: "", blank: true }),
      
      // Manoeuverability (note: template.json uses this spelling)
      manoeuverability: new fields.NumberField({ required: true, initial: 0, integer: true }),
      
      // Carrying capacity
      carryingCapacity: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // Structural Integrity
      integrity: new fields.SchemaField({
        max: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        critical: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true })
      })
    };
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
   * Get armour summary.
   * @type {string}
   */
  get armourSummary() {
    return `F:${this.front} / S:${this.side} / R:${this.rear}`;
  }

  /**
   * Get speed summary.
   * @type {string}
   */
  get speedSummary() {
    return `Cruising: ${this.speed.cruising} kph / Tactical: ${this.speed.tactical}m`;
  }

  /* -------------------------------------------- */
  /*  Roll Data                                   */
  /* -------------------------------------------- */

  /** @override */
  getRollData() {
    const data = super.getRollData();
    
    data.man = this.manoeuverability;
    data.armF = this.front;
    data.armS = this.side;
    data.armR = this.rear;
    
    return data;
  }
}
