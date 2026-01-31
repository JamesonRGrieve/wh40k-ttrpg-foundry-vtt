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

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * Migrate description and source data.
   * @param {object} source  The source data
   * @protected
   */
  static _migrateData(source) {
    super._migrateData?.(source);
    DescriptionTemplate.#migrateDescription(source);
    DescriptionTemplate.#migrateSource(source);
  }

  /**
   * Migrate flat description string to object structure.
   * @param {object} source  The source data
   */
  static #migrateDescription(source) {
    if (typeof source.description === 'string') {
      source.description = {
        value: source.description,
        chat: '',
        summary: '',
      };
    }
    // Ensure sub-fields are not null (V13 HTMLField strictness)
    if (source.description && typeof source.description === 'object') {
      source.description.chat ??= '';
      source.description.summary ??= '';
    }
  }

  /**
   * Migrate flat source string to object structure.
   * @param {object} source  The source data
   */
  static #migrateSource(source) {
    if (typeof source.source === 'string') {
      source.source = {
        book: '',
        page: '',
        custom: source.source,
      };
    }
    if (source.source && typeof source.source === 'object') {
      source.source.book ??= '';
      source.source.page ??= '';
      source.source.custom ??= '';
    }
  }

  /* -------------------------------------------- */
  /*  Data Cleaning                               */
  /* -------------------------------------------- */

  /**
   * Clean description template data.
   * @param {object} source     The source data
   * @param {object} options    Additional options
   * @protected
   */
  static _cleanData(source, options) {
    super._cleanData?.(source, options);
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
