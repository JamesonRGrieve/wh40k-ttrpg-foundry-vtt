import CreatureTemplate from "./templates/creature.mjs";

const { NumberField, StringField, HTMLField } = foundry.data.fields;

/**
 * Data model for NPC actors.
 * Extends CreatureTemplate with NPC-specific fields.
 * @extends {CreatureTemplate}
 */
export default class NPCData extends CreatureTemplate {
  
  /** @inheritDoc */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      // NPC-specific fields
      faction: new StringField({ required: false, initial: "", blank: true }),
      subfaction: new StringField({ required: false, initial: "", blank: true }),
      allegiance: new StringField({ required: false, initial: "", blank: true }),
      
      // NPC type classification
      type: new StringField({ 
        required: true, 
        initial: "troop",
        choices: ["troop", "elite", "master", "horde", "swarm", "creature", "daemon", "xenos"]
      }),
      
      // Threat assessment
      threatLevel: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // NPC notes
      description: new HTMLField({ required: false, blank: true }),
      tactics: new HTMLField({ required: false, blank: true }),
      specialAbilities: new HTMLField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the NPC type label.
   * @type {string}
   */
  get typeLabel() {
    return game.i18n.localize(`RT.NPCType.${this.type.capitalize()}`);
  }

  /**
   * Get a threat summary.
   * @type {string}
   */
  get threatSummary() {
    return `${this.typeLabel} (Threat ${this.threatLevel})`;
  }

  /**
   * Get threat level description.
   * @type {string}
   */
  get threatDescription() {
    if (this.threatLevel === 0) return game.i18n.localize("RT.Threat.Trivial");
    if (this.threatLevel <= 5) return game.i18n.localize("RT.Threat.Low");
    if (this.threatLevel <= 10) return game.i18n.localize("RT.Threat.Moderate");
    if (this.threatLevel <= 15) return game.i18n.localize("RT.Threat.Dangerous");
    if (this.threatLevel <= 20) return game.i18n.localize("RT.Threat.Deadly");
    return game.i18n.localize("RT.Threat.Apocalyptic");
  }

  /**
   * Is this a horde-type NPC?
   * @type {boolean}
   */
  get isHorde() {
    return this.type === "horde" || this.type === "swarm";
  }

  /**
   * Is this a significant threat (elite or above)?
   * @type {boolean}
   */
  get isElite() {
    return this.type === "elite" || this.type === "master";
  }
}
