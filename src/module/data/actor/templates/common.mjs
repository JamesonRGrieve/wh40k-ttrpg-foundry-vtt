import ActorDataModel from "../../abstract/actor-data-model.mjs";

const { NumberField, SchemaField, StringField, BooleanField } = foundry.data.fields;

/**
 * Common template for all actor types in Rogue Trader.
 * Contains shared schema elements like wounds, characteristics, and initiative.
 * @extends {ActorDataModel}
 */
export default class CommonTemplate extends ActorDataModel {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    // Characteristic schema factory
    const CharacteristicField = (label, short) => new SchemaField({
      label: new StringField({ required: true, initial: label }),
      short: new StringField({ required: true, initial: short }),
      base: new NumberField({ required: true, initial: 0, integer: true }),
      advance: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
      modifier: new NumberField({ required: true, initial: 0, integer: true }),
      unnatural: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
      cost: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
      // Derived values
      total: new NumberField({ required: true, initial: 0, integer: true }),
      bonus: new NumberField({ required: true, initial: 0, integer: true })
    });

    return {
      ...super.defineSchema(),
      wounds: new SchemaField({
        max: new NumberField({ required: true, initial: 0, min: 0, integer: true, nullable: false }),
        value: new NumberField({ required: true, initial: 0, min: 0, integer: true, nullable: false }),
        critical: new NumberField({ required: true, initial: 0, min: 0, integer: true, nullable: false }),
        rolled: new BooleanField({ required: true, initial: false })
      }),

      initiative: new SchemaField({
        characteristic: new StringField({ required: true, initial: "agility" }),
        base: new StringField({ required: true, initial: "1d10" }),
        bonus: new NumberField({ required: true, initial: 0, integer: true, nullable: false })
      }),

      size: new NumberField({ required: true, initial: 4, min: 1, max: 10, integer: true, nullable: false }),

      characteristics: new SchemaField({
        weaponSkill: CharacteristicField("Weapon Skill", "WS"),
        ballisticSkill: CharacteristicField("Ballistic Skill", "BS"),
        strength: CharacteristicField("Strength", "S"),
        toughness: CharacteristicField("Toughness", "T"),
        agility: CharacteristicField("Agility", "Ag"),
        intelligence: CharacteristicField("Intelligence", "Int"),
        perception: CharacteristicField("Perception", "Per"),
        willpower: CharacteristicField("Willpower", "WP"),
        fellowship: CharacteristicField("Fellowship", "Fel"),
        influence: CharacteristicField("Influence", "Inf")
      }),

      movement: new SchemaField({
        half: new NumberField({ required: true, initial: 0, min: 0 }),
        full: new NumberField({ required: true, initial: 0, min: 0 }),
        charge: new NumberField({ required: true, initial: 0, min: 0 }),
        run: new NumberField({ required: true, initial: 0, min: 0 }),
        // Leap/Jump based on Strength Bonus
        leapVertical: new NumberField({ required: true, initial: 0, min: 0 }),
        leapHorizontal: new NumberField({ required: true, initial: 0, min: 0 }),
        jump: new NumberField({ required: true, initial: 0, min: 0 })
      }),

      // Lifting/Carrying capacity based on Strength Bonus
      lifting: new SchemaField({
        lift: new NumberField({ required: true, initial: 0, min: 0 }),
        carry: new NumberField({ required: true, initial: 0, min: 0 }),
        push: new NumberField({ required: true, initial: 0, min: 0 })
      })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * Convert a value to an integer, handling strings and edge cases.
   * @param {*} value - The value to convert
   * @param {number} fallback - Fallback value if conversion fails
   * @returns {number}
   */
  static _toInt(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return Math.floor(num);
  }

  /** @override */
  static migrateData(source) {
    // Ensure wounds values are integers
    if (source.wounds) {
      source.wounds.max = this._toInt(source.wounds.max);
      source.wounds.value = this._toInt(source.wounds.value);
      source.wounds.critical = this._toInt(source.wounds.critical);
    }

    // Ensure fatigue values are integers (defined in creature template but migrate here for safety)
    if (source.fatigue) {
      source.fatigue.max = this._toInt(source.fatigue.max);
      source.fatigue.value = this._toInt(source.fatigue.value);
    }

    // Ensure characteristic values are integers
    if (source.characteristics) {
      for (const char of Object.values(source.characteristics)) {
        char.base = this._toInt(char.base);
        char.advance = this._toInt(char.advance);
        char.modifier = this._toInt(char.modifier);
        char.unnatural = this._toInt(char.unnatural);
        char.cost = this._toInt(char.cost);
      }
    }

    return super.migrateData(source);
  }

  /** @override */
  static cleanData(source, options = {}) {
    // Clean integer fields before validation
    if (source?.wounds) {
      if (source.wounds.max !== undefined) {
        source.wounds.max = this._toInt(source.wounds.max);
      }
      if (source.wounds.value !== undefined) {
        source.wounds.value = this._toInt(source.wounds.value);
      }
      if (source.wounds.critical !== undefined) {
        source.wounds.critical = this._toInt(source.wounds.critical);
      }
    }
    if (source?.fatigue) {
      if (source.fatigue.max !== undefined) {
        source.fatigue.max = this._toInt(source.fatigue.max);
      }
      if (source.fatigue.value !== undefined) {
        source.fatigue.value = this._toInt(source.fatigue.value);
      }
    }
    return super.cleanData(source, options);
  }

  /* -------------------------------------------- */
  /*  Characteristic Mapping                      */
  /* -------------------------------------------- */

  /**
   * Map characteristic short names to full keys.
   * @type {Object<string, string>}
   */
  static CHARACTERISTIC_MAP = {
    "WS": "weaponSkill",
    "BS": "ballisticSkill",
    "S": "strength",
    "T": "toughness",
    "Ag": "agility",
    "Int": "intelligence",
    "Per": "perception",
    "WP": "willpower",
    "Fel": "fellowship",
    "Inf": "influence"
  };

  /**
   * Get a characteristic by its short name or full key.
   * @param {string} key - Short name (e.g., "Ag") or full key (e.g., "agility")
   * @returns {object|null}
   */
  getCharacteristic(key) {
    if (this.characteristics[key]) {
      return this.characteristics[key];
    }
    const fullKey = CommonTemplate.CHARACTERISTIC_MAP[key];
    if (fullKey && this.characteristics[fullKey]) {
      return this.characteristics[fullKey];
    }
    return null;
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareBaseData() {
    super.prepareBaseData();
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this._prepareCharacteristics();
    this._prepareMovement();
  }

  /**
   * Prepare characteristic totals and bonuses.
   * @protected
   */
  _prepareCharacteristics() {
    for (const [key, char] of Object.entries(this.characteristics)) {
      // Calculate total: base + (advance * 5) + modifier
      char.total = char.base + (char.advance * 5) + char.modifier;

      // Base modifier is tens digit
      const baseModifier = Math.floor(char.total / 10);

      // Unnatural multiplies the modifier (0 = no unnatural, 2+ = multiplier)
      const unnaturalLevel = char.unnatural || 0;
      char.bonus = unnaturalLevel >= 2 ? baseModifier * unnaturalLevel : baseModifier;
    }

    // Update initiative bonus
    const initChar = this.characteristics[this.initiative.characteristic];
    if (initChar) {
      this.initiative.bonus = initChar.bonus;
    }
  }

  /**
   * Prepare movement values based on agility and strength.
   * Movement: Half/Full/Charge/Run based on AB (Agility Bonus)
   * Leap/Jump: Based on SB (Strength Bonus)
   * Lifting: Based on SB with multipliers
   * @protected
   */
  _prepareMovement() {
    const agility = this.characteristics?.agility;
    const strength = this.characteristics?.strength;
    if (!agility) return;

    const ab = agility.bonus;
    const sb = strength?.bonus ?? 0;
    
    // Movement based on AB + Size adjustment
    const baseMove = ab + this.size - 4;
    this.movement.half = baseMove;
    this.movement.full = baseMove * 2;
    this.movement.charge = baseMove * 3;
    this.movement.run = baseMove * 6;
    
    // Leap/Jump based on Strength Bonus
    // Standing vertical leap: SB / 4 meters (round up to nearest 0.5m)
    // Running horizontal leap: SB meters
    // Jump (vertical jump height in cm): SB × 20
    this.movement.leapVertical = Math.ceil(sb / 4 * 2) / 2; // Round to nearest 0.5m
    this.movement.leapHorizontal = sb;
    this.movement.jump = sb * 20; // in centimeters
    
    // Lifting/Carrying capacity based on Strength Bonus
    // Carry: SB × 4.5 kg (sustained carrying)
    // Lift: SB × 9 kg (brief lifting over head)
    // Push: SB × 18 kg (pushing/dragging)
    this.lifting.carry = Math.round(sb * 4.5 * 10) / 10;
    this.lifting.lift = sb * 9;
    this.lifting.push = sb * 18;
  }

  /* -------------------------------------------- */
  /*  Roll Data                                   */
  /* -------------------------------------------- */

  /** @override */
  getRollData() {
    const data = super.getRollData ? super.getRollData() : {};

    // Add characteristic values and bonuses for formulas
    for (const [key, char] of Object.entries(this.characteristics)) {
      data[char.short] = char.total;
      data[`${char.short}B`] = char.bonus;
      data[key] = char.total;
    }

    return data;
  }
}
