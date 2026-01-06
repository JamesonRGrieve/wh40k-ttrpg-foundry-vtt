/**
 * Base data model for all Rogue Trader system data.
 * Provides common functionality for schema definition and validation.
 * 
 * V13 Best Practice: Extends TypeDataModel for type-specific document data.
 */
export default class SystemDataModel extends foundry.abstract.TypeDataModel {
  
  /**
   * System type that this data model represents.
   * @type {string}
   */
  static _systemType = null;

  /* -------------------------------------------- */
  /*  Data Model Configuration                    */
  /* -------------------------------------------- */

  /**
   * Metadata that describes this DataModel.
   * @type {object}
   */
  static metadata = Object.freeze({
    systemFlagsModel: null
  });

  /* -------------------------------------------- */

  /**
   * @inheritdoc
   * @returns {SchemaField}
   */
  static defineSchema() {
    return {};
  }

  /* -------------------------------------------- */
  /*  Mixins                                      */
  /* -------------------------------------------- */

  /**
   * Mix multiple templates with this DataModel class, returning a new class.
   * @param {...function} templates   Template classes to mix.
   * @returns {typeof SystemDataModel}
   */
  static mixin(...templates) {
    for ( const template of templates ) {
      if ( !(template.prototype instanceof foundry.abstract.DataModel) ) {
        throw new Error(`${template.name} is not a DataModel subclass`);
      }
    }

    const Base = class extends this {};
    Object.defineProperty(Base, "name", { value: this.name });

    for ( const template of templates ) {
      // Copy static methods
      for ( const key of Object.getOwnPropertyNames(template) ) {
        if ( ["length", "name", "prototype"].includes(key) ) continue;
        if ( key in Base ) continue;
        Object.defineProperty(Base, key, Object.getOwnPropertyDescriptor(template, key));
      }

      // Copy instance methods
      for ( const key of Object.getOwnPropertyNames(template.prototype) ) {
        if ( ["constructor"].includes(key) ) continue;
        if ( key in Base.prototype ) continue;
        Object.defineProperty(Base.prototype, key, Object.getOwnPropertyDescriptor(template.prototype, key));
      }
    }

    // Merge schemas
    const originalDefineSchema = Base.defineSchema;
    Base.defineSchema = function() {
      const schema = originalDefineSchema.call(this);
      for ( const template of templates ) {
        if ( template.defineSchema ) {
          Object.assign(schema, template.defineSchema());
        }
      }
      return schema;
    };

    return Base;
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /**
   * Perform preliminary operations before data preparation.
   * @param {object} source   The initial data object.
   */
  prepareBaseData() {}

  /**
   * Perform preparatory operations after data preparation.
   */
  prepareDerivedData() {}

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Get a localized label for a characteristic abbreviation.
   * @param {string} char   Characteristic key.
   * @returns {string}
   */
  static getCharacteristicLabel(char) {
    return CONFIG.ROGUE_TRADER.characteristics[char]?.label ?? char;
  }

  /**
   * Get a localized abbreviation for a characteristic.
   * @param {string} char   Characteristic key.
   * @returns {string}
   */
  static getCharacteristicAbbr(char) {
    return CONFIG.ROGUE_TRADER.characteristics[char]?.abbreviation ?? char;
  }
}
