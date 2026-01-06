/**
 * A special ObjectField for mapping data.
 * Similar to DnD5e's MappingField for handling object-based data.
 */
export default class MappingField extends foundry.data.fields.ObjectField {
  
  /**
   * @param {DataField} model         The data field type for each mapped value.
   * @param {object} [options={}]     Field options.
   * @param {string[]} [options.initialKeys]   Initial keys to populate.
   * @param {boolean} [options.initialKeysOnly]   Only allow initial keys.
   */
  constructor(model, options = {}) {
    super(options);
    this.model = model;
    this.initialKeys = options.initialKeys ?? null;
    this.initialKeysOnly = options.initialKeysOnly ?? false;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _cleanType(value, options = {}) {
    const cleaned = super._cleanType(value, options);
    
    // Clean each mapped value
    for ( const [key, v] of Object.entries(cleaned) ) {
      if ( this.model instanceof foundry.data.fields.DataField ) {
        cleaned[key] = this.model.clean(v, options);
      }
    }
    
    return cleaned;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  initialize(value, model, options = {}) {
    if ( !value ) return {};
    
    const initialized = {};
    for ( const [key, v] of Object.entries(value) ) {
      if ( this.model instanceof foundry.data.fields.SchemaField ) {
        initialized[key] = this.model.initialize(v, model, options);
      } else if ( this.model instanceof foundry.data.fields.DataField ) {
        initialized[key] = this.model.initialize(v, model, options);
      } else {
        initialized[key] = v;
      }
    }
    
    return initialized;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _validateType(value, options = {}) {
    if ( foundry.utils.getType(value) !== "Object" ) {
      throw new Error("Value must be an object");
    }
    
    const errors = [];
    for ( const [key, v] of Object.entries(value) ) {
      if ( this.initialKeysOnly && this.initialKeys && !this.initialKeys.includes(key) ) {
        errors.push(`Key "${key}" is not allowed`);
        continue;
      }
      
      try {
        if ( this.model instanceof foundry.data.fields.DataField ) {
          this.model.validate(v, options);
        }
      } catch(err) {
        errors.push(`${key}: ${err.message}`);
      }
    }
    
    if ( errors.length ) {
      throw new Error(errors.join("; "));
    }
  }
}
