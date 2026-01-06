import SystemDataModel from "./system-data-model.mjs";

/**
 * Base data model for all Item types in Rogue Trader.
 * Provides shared functionality and schema patterns for items.
 */
export default class ItemDataModel extends SystemDataModel {
  
  /* -------------------------------------------- */
  /*  Data Model Configuration                    */
  /* -------------------------------------------- */

  /**
   * @inheritdoc
   */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema()
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * Migrate legacy item data to new structure.
   * Handles common patterns across all item types.
   * @inheritdoc
   */
  static migrateData(source) {
    // Handle common legacy field patterns
    
    // Migrate flat description string to object structure
    if ( typeof source.description === "string" ) {
      source.description = { 
        value: source.description, 
        chat: "", 
        summary: "" 
      };
    }
    
    // Migrate flat source string to object structure  
    if ( typeof source.source === "string" ) {
      source.source = { 
        book: "", 
        page: "", 
        custom: source.source 
      };
    }
    
    return super.migrateData(source);
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The Item document that contains this data model.
   * @type {Item}
   */
  get item() {
    return this.parent;
  }

  /**
   * The Actor that owns this item, if any.
   * @type {Actor|null}
   */
  get actor() {
    return this.parent?.actor ?? null;
  }

  /**
   * A human-readable label for this item type.
   * @type {string}
   */
  get typeLabel() {
    return game.i18n.localize(CONFIG.Item.typeLabels[this.parent.type]);
  }

  /**
   * Whether this item can be rolled/activated.
   * @type {boolean}
   */
  get isRollable() {
    return false;
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /**
   * @inheritdoc
   */
  prepareBaseData() {
    super.prepareBaseData();
  }

  /**
   * @inheritdoc
   */
  prepareDerivedData() {
    super.prepareDerivedData();
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Retrieve the source book reference for this item.
   * @type {string}
   */
  get sourceReference() {
    if ( typeof this.source === "string" ) return this.source;
    const { book, page, custom } = this.source ?? {};
    if ( custom ) return custom;
    if ( book && page ) return `${book}, p.${page}`;
    if ( book ) return book;
    return "";
  }

  /**
   * Generate chat data for this item.
   * @param {object} htmlOptions   Options passed to enrichHTML.
   * @returns {Promise<object>}
   */
  async getChatData(htmlOptions = {}) {
    const descValue = typeof this.description === "string" 
      ? this.description 
      : (this.description?.value ?? "");
    const data = {
      description: await TextEditor.enrichHTML(descValue, {
        ...htmlOptions,
        rollData: this.parent.getRollData()
      }),
      properties: this.chatProperties ?? []
    };
    return data;
  }

  /**
   * Properties displayed in chat.
   * @type {string[]}
   */
  get chatProperties() {
    return [];
  }

  /**
   * Get labels for the item sheet header.
   * @type {object}
   */
  get headerLabels() {
    return {};
  }
}
