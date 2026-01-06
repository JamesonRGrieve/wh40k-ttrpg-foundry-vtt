import SystemDataModel from "../abstract/system-data-model.mjs";

/**
 * Template for items that provide modifiers to characteristics, skills, etc.
 * @mixin
 */
export default class ModifiersTemplate extends SystemDataModel {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      modifiers: new fields.SchemaField({
        characteristics: new fields.ObjectField({ required: true, initial: {} }),
        skills: new fields.ObjectField({ required: true, initial: {} }),
        combat: new fields.SchemaField({
          attack: new fields.NumberField({ required: false, initial: 0 }),
          damage: new fields.NumberField({ required: false, initial: 0 }),
          penetration: new fields.NumberField({ required: false, initial: 0 }),
          defense: new fields.NumberField({ required: false, initial: 0 }),
          initiative: new fields.NumberField({ required: false, initial: 0 }),
          speed: new fields.NumberField({ required: false, initial: 0 })
        }),
        resources: new fields.SchemaField({
          wounds: new fields.NumberField({ required: false, initial: 0 }),
          fate: new fields.NumberField({ required: false, initial: 0 }),
          insanity: new fields.NumberField({ required: false, initial: 0 }),
          corruption: new fields.NumberField({ required: false, initial: 0 })
        }),
        other: new fields.ArrayField(
          new fields.SchemaField({
            key: new fields.StringField({ required: true }),
            label: new fields.StringField({ required: false }),
            value: new fields.NumberField({ required: true, initial: 0 }),
            mode: new fields.StringField({ 
              required: true, 
              initial: "add",
              choices: ["add", "multiply", "override", "downgrade", "upgrade"]
            })
          }),
          { required: true, initial: [] }
        )
      })
    };
  }

  /* -------------------------------------------- */

  /**
   * Check if this item provides any modifiers.
   * @type {boolean}
   */
  get hasModifiers() {
    const mods = this.modifiers;
    if ( Object.keys(mods.characteristics).length ) return true;
    if ( Object.keys(mods.skills).length ) return true;
    if ( Object.values(mods.combat).some(v => v !== 0) ) return true;
    if ( Object.values(mods.resources).some(v => v !== 0) ) return true;
    if ( mods.other?.length ) return true;
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Get the modifier for a specific characteristic.
   * @param {string} char   The characteristic key.
   * @returns {number}
   */
  getCharacteristicModifier(char) {
    return this.modifiers.characteristics[char] ?? 0;
  }

  /* -------------------------------------------- */

  /**
   * Get the modifier for a specific skill.
   * @param {string} skill   The skill key.
   * @returns {number}
   */
  getSkillModifier(skill) {
    return this.modifiers.skills[skill] ?? 0;
  }

  /* -------------------------------------------- */

  /**
   * Get all modifiers as a flat array for display.
   * @type {object[]}
   */
  get modifiersList() {
    const list = [];
    const mods = this.modifiers;

    // Characteristics
    for ( const [key, value] of Object.entries(mods.characteristics) ) {
      if ( value !== 0 ) {
        list.push({
          key,
          label: game.i18n.localize(`RT.Characteristic.${key.capitalize()}`),
          value,
          type: "characteristic"
        });
      }
    }

    // Skills
    for ( const [key, value] of Object.entries(mods.skills) ) {
      if ( value !== 0 ) {
        list.push({
          key,
          label: game.i18n.localize(`RT.Skill.${key}`),
          value,
          type: "skill"
        });
      }
    }

    // Combat
    for ( const [key, value] of Object.entries(mods.combat) ) {
      if ( value !== 0 ) {
        list.push({
          key,
          label: game.i18n.localize(`RT.Combat.${key.capitalize()}`),
          value,
          type: "combat"
        });
      }
    }

    // Resources
    for ( const [key, value] of Object.entries(mods.resources) ) {
      if ( value !== 0 ) {
        list.push({
          key,
          label: game.i18n.localize(`RT.Resource.${key.capitalize()}`),
          value,
          type: "resource"
        });
      }
    }

    // Other
    for ( const mod of mods.other ) {
      list.push({
        ...mod,
        type: "other"
      });
    }

    return list;
  }
}
