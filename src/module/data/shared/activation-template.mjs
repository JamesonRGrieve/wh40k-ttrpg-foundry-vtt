import SystemDataModel from "../abstract/system-data-model.mjs";

/**
 * Template for items with activation requirements (actions, powers).
 * @mixin
 */
export default class ActivationTemplate extends SystemDataModel {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      activation: new fields.SchemaField({
        type: new fields.StringField({
          required: true,
          initial: "action",
          choices: [
            "action", "half-action", "full-action", "extended-action",
            "reaction", "free-action", "passive"
          ]
        }),
        cost: new fields.NumberField({ required: false, initial: 1 }),
        condition: new fields.StringField({ required: false, blank: true })
      }),
      target: new fields.SchemaField({
        type: new fields.StringField({
          required: false,
          initial: "self",
          choices: [
            "self", "creature", "ally", "enemy", 
            "area", "cone", "line", "sphere", "special"
          ]
        }),
        value: new fields.NumberField({ required: false }),
        units: new fields.StringField({ required: false, initial: "m" }),
        width: new fields.NumberField({ required: false }),
        length: new fields.NumberField({ required: false })
      }),
      duration: new fields.SchemaField({
        value: new fields.NumberField({ required: false }),
        units: new fields.StringField({
          required: false,
          initial: "instant",
          choices: [
            "instant", "round", "rounds", "minute", "minutes",
            "hour", "hours", "day", "days", "sustained", "permanent", "special"
          ]
        }),
        sustained: new fields.BooleanField({ required: true, initial: false })
      }),
      uses: new fields.SchemaField({
        value: new fields.NumberField({ required: false, initial: null, min: 0 }),
        max: new fields.NumberField({ required: false, initial: null, min: 0 }),
        per: new fields.StringField({
          required: false,
          blank: true,
          choices: ["", "turn", "round", "encounter", "day", "long-rest", "short-rest"]
        }),
        recovery: new fields.StringField({ required: false, blank: true })
      })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * Migrate activation data.
   * @param {object} source  The source data
   * @protected
   */
  static _migrateData(source) {
    super._migrateData?.(source);
    ActivationTemplate.#migrateUses(source);
  }

  /**
   * Migrate legacy uses formats.
   * @param {object} source  The source data
   */
  static #migrateUses(source) {
    if (!source.uses) return;
    // Convert string values to numbers
    if (typeof source.uses.value === 'string') {
      const num = Number(source.uses.value);
      source.uses.value = Number.isNaN(num) ? null : num;
    }
    if (typeof source.uses.max === 'string') {
      const num = Number(source.uses.max);
      source.uses.max = Number.isNaN(num) ? null : num;
    }
  }

  /* -------------------------------------------- */
  /*  Data Cleaning                               */
  /* -------------------------------------------- */

  /**
   * Clean activation template data.
   * @param {object} source     The source data
   * @param {object} options    Additional options
   * @protected
   */
  static _cleanData(source, options) {
    super._cleanData?.(source, options);
  }

  /* -------------------------------------------- */

  /**
   * Get a localized activation type label.
   * @type {string}
   */
  get activationLabel() {
    return game.i18n.localize(`RT.Activation.${this.activation.type.capitalize()}`);
  }

  /* -------------------------------------------- */

  /**
   * Get a formatted target string.
   * @type {string}
   */
  get targetLabel() {
    const target = this.target;
    if ( target.type === "self" ) return game.i18n.localize("RT.Target.Self");
    if ( target.value ) {
      return `${target.value}${target.units} ${game.i18n.localize(`RT.Target.${target.type.capitalize()}`)}`;
    }
    return game.i18n.localize(`RT.Target.${target.type.capitalize()}`);
  }

  /* -------------------------------------------- */

  /**
   * Get a formatted duration string.
   * @type {string}
   */
  get durationLabel() {
    const duration = this.duration;
    if ( duration.units === "instant" ) return game.i18n.localize("RT.Duration.Instant");
    if ( duration.sustained ) return game.i18n.localize("RT.Duration.Sustained");
    if ( duration.value ) {
      return `${duration.value} ${game.i18n.localize(`RT.Duration.${duration.units.capitalize()}`)}`;
    }
    return game.i18n.localize(`RT.Duration.${duration.units.capitalize()}`);
  }

  /* -------------------------------------------- */

  /**
   * Does this item have limited uses?
   * @type {boolean}
   */
  get hasLimitedUses() {
    return this.uses.max !== null && this.uses.max > 0;
  }

  /* -------------------------------------------- */

  /**
   * Are uses exhausted?
   * @type {boolean}
   */
  get usesExhausted() {
    return this.hasLimitedUses && this.uses.value <= 0;
  }

  /* -------------------------------------------- */

  /**
   * Consume a use.
   * @returns {Promise<Item>}
   */
  async consumeUse() {
    if ( !this.hasLimitedUses ) return this.parent;
    const newValue = Math.max(0, (this.uses.value ?? 0) - 1);
    return this.parent?.update({ "system.uses.value": newValue });
  }

  /* -------------------------------------------- */

  /**
   * Recover uses.
   * @param {number} [amount=1]   Number of uses to recover.
   * @returns {Promise<Item>}
   */
  async recoverUses(amount = 1) {
    if ( !this.hasLimitedUses ) return this.parent;
    const max = this.uses.max ?? 0;
    const newValue = Math.min(max, (this.uses.value ?? 0) + amount);
    return this.parent?.update({ "system.uses.value": newValue });
  }

  /* -------------------------------------------- */

  /**
   * Properties for chat display.
   * @type {string[]}
   */
  get chatProperties() {
    const props = [];
    props.push(this.activationLabel);
    if ( this.target.type !== "self" ) props.push(this.targetLabel);
    if ( this.duration.units !== "instant" ) props.push(this.durationLabel);
    return props;
  }
}
