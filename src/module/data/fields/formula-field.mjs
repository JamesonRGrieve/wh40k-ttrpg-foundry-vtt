/**
 * A special string field for dice formula values.
 * Validates that the string is a valid dice formula.
 */
export default class FormulaField extends foundry.data.fields.StringField {
  
  /** @inheritdoc */
  static get _defaults() {
    return foundry.utils.mergeObject(super._defaults, {
      deterministic: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Is this formula field deterministic (no dice, just math)?
   * @type {boolean}
   */
  deterministic;

  /* -------------------------------------------- */

  /** @inheritdoc */
  _validateType(value) {
    if ( value === "" ) return;
    
    // Attempt to validate as a roll formula
    try {
      const roll = new Roll(value);
      if ( this.deterministic && !roll.isDeterministic ) {
        throw new Error(`Formula "${value}" must be deterministic`);
      }
    } catch(err) {
      throw new Error(`Invalid formula: ${value}`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Evaluate the formula and return the result.
   * @param {object} data   Roll data for formula evaluation.
   * @returns {number|null}
   */
  evaluate(data = {}) {
    const value = this.parent?.[this.name];
    if ( !value ) return null;
    
    try {
      const roll = Roll.create(value, data);
      return roll.evaluateSync().total;
    } catch(err) {
      console.warn(`Failed to evaluate formula: ${value}`, err);
      return null;
    }
  }
}
