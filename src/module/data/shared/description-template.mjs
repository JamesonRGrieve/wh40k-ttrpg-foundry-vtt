import SystemDataModel from "../abstract/system-data-model.mjs";

/**
 * Template for items with descriptions and source references.
 * @mixin
 */
export default class DescriptionTemplate extends SystemDataModel {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.SchemaField({
        value: new fields.HTMLField({ required: true, blank: true, initial: "" }),
        chat: new fields.HTMLField({ required: false, blank: true }),
        summary: new fields.StringField({ required: false, blank: true })
      }),
      source: new fields.SchemaField({
        book: new fields.StringField({ required: false, blank: true }),
        page: new fields.StringField({ required: false, blank: true }),
        custom: new fields.StringField({ required: false, blank: true })
      })
    };
  }

  /* -------------------------------------------- */

  /**
   * Migrate legacy flat description/source fields to new structure.
   * @inheritdoc
   */
  static migrateData(source) {
    // Migrate flat description string to object
    if ( typeof source.description === "string" ) {
      source.description = { value: source.description, chat: "", summary: "" };
    }
    
    // Migrate flat source string to object
    if ( typeof source.source === "string" ) {
      source.source = { book: "", page: "", custom: source.source };
    }
    
    return super.migrateData(source);
  }

  /* -------------------------------------------- */

  /**
   * Get a formatted source reference string.
   * @type {string}
   */
  get sourceReference() {
    const { book, page, custom } = this.source;
    if ( custom ) return custom;
    if ( book && page ) return `${book}, p.${page}`;
    if ( book ) return book;
    return "";
  }

  /* -------------------------------------------- */

  /**
   * Get the enriched description for display.
   * @returns {Promise<string>}
   */
  async getEnrichedDescription() {
    return TextEditor.enrichHTML(this.description.value, {
      secrets: this.parent?.isOwner,
      rollData: this.parent?.getRollData() ?? {}
    });
  }
}
