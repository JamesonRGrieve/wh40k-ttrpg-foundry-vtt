/**
 * A special string field for unique identifiers.
 * Used for referencing items in compendiums and linking data.
 * 
 * Follows DND5E pattern: permissive validation (accepts legacy formats)
 * but provides helper for generating kebab-case from names.
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
    
    // Permissive validation - allows letters (any case), numbers, underscores, and hyphens
    // This matches DND5E pattern and accepts legacy camelCase identifiers
    if ( !/^[a-z0-9_-]+$/i.test(value) ) {
      throw new Error(`Identifier "${value}" must contain only letters, numbers, underscores, and hyphens`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Generate an identifier from a name string.
   * Produces kebab-case for new identifiers.
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
