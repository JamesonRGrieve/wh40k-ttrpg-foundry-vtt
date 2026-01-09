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
        value: new fields.HTMLField({ required: true, initial: "" }),
        chat: new fields.HTMLField({ required: false, initial: "" }),
        summary: new fields.StringField({ required: false, blank: true, initial: "" })
      }),
      source: new fields.SchemaField({
        book: new fields.StringField({ required: false, blank: true, initial: "" }),
        page: new fields.StringField({ required: false, blank: true, initial: "" }),
        custom: new fields.StringField({ required: false, blank: true, initial: "" })
      })
    };
  }

  // NOTE: migrateData for description/source is handled in ItemDataModel.migrateData()
  // to avoid duplication. The mixin pattern copies methods but not migrateData since
  // it already exists on ItemDataModel.

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
