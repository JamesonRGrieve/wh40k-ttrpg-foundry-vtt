/**
 * A special string field for unique identifiers.
 * Used for referencing items in compendiums and linking data.
 */
export default class IdentifierField extends foundry.data.fields.StringField {
  
  /** @inheritdoc */
  static get _defaults() {
    return foundry.utils.mergeObject(super._defaults, {
      nullable: false,
      blank: true,
      textSearch: true
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _validateType(value) {
    if ( value === "" ) return;
    
    // Identifiers should be kebab-case
    if ( !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ) {
      throw new Error(`Identifier "${value}" must be kebab-case (lowercase letters, numbers, and hyphens)`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Generate an identifier from a name string.
   * @param {string} name   The name to convert.
   * @returns {string}
   */
  static fromName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }
}
