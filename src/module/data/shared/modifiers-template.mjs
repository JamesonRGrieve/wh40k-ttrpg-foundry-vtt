import SystemDataModel from "../abstract/system-data-model.mjs";

/**
 * MODIFIER SYSTEM DOCUMENTATION
 * 
 * This template provides two types of modifiers for items that affect actor statistics:
 * 
 * ============================================================================
 * 1. ALWAYS-ON MODIFIERS (Auto-Applied)
 * ============================================================================
 * 
 * These modifiers are automatically applied during prepareEmbeddedData() and permanently
 * affect the actor's statistics while the item is present/equipped.
 * 
 * ACTIVATION CONDITIONS:
 * - Talents: Always active if item exists on actor
 * - Traits: Always active if item exists on actor
 * - Conditions: Always active if item exists on actor
 * - Armour: Active when system.equipped === true
 * - Cybernetics: Active when system.equipped === true
 * - Gear: Active when system.equipped === true
 * 
 * MODIFIER FIELDS:
 * 
 * • modifiers.characteristics
 *   → Adds to characteristic totals in prepareEmbeddedData()
 *   → Applied before characteristic.bonus calculation
 *   → Example: { strength: 10, agility: -5 }
 *   → Usage: Unnatural Characteristics, Power Armour bonuses
 * 
 * • modifiers.skills
 *   → Adds to skill.current in prepareEmbeddedData()
 *   → Applied after training calculation
 *   → Example: { dodge: 10, awareness: 5 }
 *   → Usage: Skill bonuses from talents, equipment
 * 
 * • modifiers.combat
 *   → Adds to attack/damage/defense/initiative rolls
 *   → Fields: attack, damage, penetration, defense, initiative, speed
 *   → Example: { attack: 10, damage: 2, initiative: 1 }
 *   → Usage: Weapon attachments, combat talents, stance bonuses
 * 
 * • modifiers.resources
 *   → Adds to maximum resource values
 *   → Fields: wounds, fate, insanity, corruption
 *   → Example: { wounds: 5, fate: 1 }
 *   → Usage: Talents that increase max wounds, fate bonuses
 * 
 * • modifiers.other
 *   → Generic modifier array for custom effects
 *   → Each entry: { key, label, value, mode }
 *   → Modes: "add", "multiply", "override", "downgrade", "upgrade"
 *   → Example: [{ key: "movement", label: "Fleet of Foot", value: 2, mode: "add" }]
 * 
 * ============================================================================
 * 2. SITUATIONAL MODIFIERS (Manual Application)
 * ============================================================================
 * 
 * These modifiers are displayed in roll dialogs as optional checkboxes that players
 * can enable/disable based on current circumstances. They are NOT auto-applied.
 * 
 * DISPLAY LOCATION:
 * - Shown in characteristic/skill roll dialogs
 * - Presented as checkboxes with condition text
 * - Player chooses which apply to current roll
 * 
 * MODIFIER FIELDS:
 * 
 * • modifiers.situational.characteristics
 *   → Array of conditional characteristic modifiers
 *   → Each entry: { key, value, condition, icon }
 *   → Example: [{ 
 *       key: "strength", 
 *       value: 10, 
 *       condition: "When lifting or moving heavy objects",
 *       icon: "fa-dumbbell" 
 *     }]
 * 
 * • modifiers.situational.skills
 *   → Array of conditional skill modifiers
 *   → Each entry: { key, value, condition, icon }
 *   → Example: [{ 
 *       key: "stealth", 
 *       value: 10, 
 *       condition: "In shadows or darkness",
 *       icon: "fa-moon" 
 *     }]
 * 
 * • modifiers.situational.combat
 *   → Array of conditional combat modifiers
 *   → Each entry: { key, value, condition, icon }
 *   → Example: [{ 
 *       key: "attack", 
 *       value: 10, 
 *       condition: "When fighting xenos",
 *       icon: "fa-skull-crossbones" 
 *     }]
 * 
 * ============================================================================
 * PRACTICAL EXAMPLES
 * ============================================================================
 * 
 * TALENT: "Unnatural Strength (x2)"
 * {
 *   modifiers: {
 *     characteristics: { strength: 10 }  // Always-on +10 Strength
 *   }
 * }
 * 
 * TALENT: "Hatred (Orks)"
 * {
 *   modifiers: {
 *     situational: {
 *       combat: [{
 *         key: "attack",
 *         value: 10,
 *         condition: "When attacking Orks",
 *         icon: "fa-skull"
 *       }]
 *     }
 *   }
 * }
 * 
 * ARMOUR: "Power Armour"
 * {
 *   modifiers: {
 *     characteristics: { strength: 20 },  // Auto-applied when equipped
 *     resources: { wounds: 5 }
 *   }
 * }
 * 
 * TRAIT: "Quadruped"
 * {
 *   modifiers: {
 *     other: [{ 
 *       key: "movement", 
 *       label: "Movement", 
 *       value: 2, 
 *       mode: "add" 
 *     }]
 *   }
 * }
 * 
 * ============================================================================
 * MODIFIER TRACKING
 * ============================================================================
 * 
 * All applied modifiers are tracked in actor.system.modifierSources for transparency:
 * 
 * actor.system.modifierSources = {
 *   characteristics: {
 *     strength: [
 *       { name: "Power Armour", type: "armour", id: "xxx", value: 20 },
 *       { name: "Unnatural Strength", type: "trait", id: "yyy", value: 10 }
 *     ]
 *   },
 *   skills: { dodge: [{ name: "Dodge Training", ... }] },
 *   combat: { attack: [...], damage: [...], initiative: [...] },
 *   wounds: [{ name: "True Grit", type: "talent", value: 5 }],
 *   fate: [...],
 *   movement: [...]
 * }
 * 
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
        ),
        situational: new fields.SchemaField({
          characteristics: new fields.ArrayField(
            new fields.SchemaField({
              key: new fields.StringField({ required: true }),
              value: new fields.NumberField({ required: true, initial: 0 }),
              condition: new fields.StringField({ required: true }),
              icon: new fields.StringField({ required: false, initial: "fa-exclamation-triangle" })
            }),
            { required: true, initial: [] }
          ),
          skills: new fields.ArrayField(
            new fields.SchemaField({
              key: new fields.StringField({ required: true }),
              value: new fields.NumberField({ required: true, initial: 0 }),
              condition: new fields.StringField({ required: true }),
              icon: new fields.StringField({ required: false, initial: "fa-exclamation-triangle" })
            }),
            { required: true, initial: [] }
          ),
          combat: new fields.ArrayField(
            new fields.SchemaField({
              key: new fields.StringField({ required: true }),
              value: new fields.NumberField({ required: true, initial: 0 }),
              condition: new fields.StringField({ required: true }),
              icon: new fields.StringField({ required: false, initial: "fa-exclamation-triangle" })
            }),
            { required: true, initial: [] }
          )
        })
      })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * Migrate modifiers data.
   * @param {object} source  The source data
   * @protected
   */
  static _migrateData(source) {
    super._migrateData?.(source);
    ModifiersTemplate.#migrateModifiers(source);
  }

  /**
   * Migrate legacy modifier formats.
   * @param {object} source  The source data
   */
  static #migrateModifiers(source) {
    if (!source.modifiers) return;
    
    // Ensure nested objects exist
    source.modifiers.characteristics ??= {};
    source.modifiers.skills ??= {};
    source.modifiers.combat ??= {};
    source.modifiers.resources ??= {};
    source.modifiers.other ??= [];
    source.modifiers.situational ??= { characteristics: [], skills: [], combat: [] };
    
    // Migrate legacy flat modifiers to nested structure
    if (source.modifiers.strength !== undefined) {
      source.modifiers.characteristics.strength = source.modifiers.strength;
      delete source.modifiers.strength;
    }
  }

  /* -------------------------------------------- */
  /*  Data Cleaning                               */
  /* -------------------------------------------- */

  /**
   * Clean modifiers template data.
   * @param {object} source     The source data
   * @param {object} options    Additional options
   * @protected
   */
  static _cleanData(source, options) {
    super._cleanData?.(source, options);
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
    if ( mods.situational?.characteristics?.length ) return true;
    if ( mods.situational?.skills?.length ) return true;
    if ( mods.situational?.combat?.length ) return true;
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

  /* -------------------------------------------- */

  /**
   * Get situational modifiers as a structured list.
   * @type {object}
   */
  get situationalModifiers() {
    const situational = this.modifiers.situational || {};
    return {
      characteristics: situational.characteristics || [],
      skills: situational.skills || [],
      combat: situational.combat || []
    };
  }

  /* -------------------------------------------- */

  /**
   * Check if this item has any situational modifiers.
   * @type {boolean}
   */
  get hasSituationalModifiers() {
    const sit = this.situationalModifiers;
    return sit.characteristics.length > 0 || sit.skills.length > 0 || sit.combat.length > 0;
  }
}
