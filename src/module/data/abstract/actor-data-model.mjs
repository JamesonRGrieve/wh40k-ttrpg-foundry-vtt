import SystemDataModel from "./system-data-model.mjs";

/**
 * Base data model for all Actor types in Rogue Trader.
 * Provides shared functionality and schema patterns for actors.
 */
export default class ActorDataModel extends SystemDataModel {
  
  /* -------------------------------------------- */
  /*  Data Model Configuration                    */
  /* -------------------------------------------- */

  /**
   * @inheritdoc
   */
  static defineSchema() {
    return {
      ...super.defineSchema()
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The Actor document that contains this data model.
   * @type {Actor}
   */
  get actor() {
    return this.parent;
  }

  /**
   * A human-readable label for this actor type.
   * @type {string}
   */
  get typeLabel() {
    return game.i18n.localize(CONFIG.Actor.typeLabels[this.parent.type]);
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
  /*  Roll Data                                   */
  /* -------------------------------------------- */

  /**
   * Generate base roll data for this actor.
   * @returns {object}
   */
  getRollData() {
    const data = { ...this };
    return data;
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Get items of a specific type owned by this actor.
   * @param {string} type   The item type.
   * @returns {Item[]}
   */
  getItemsByType(type) {
    return this.parent.items.filter(i => i.type === type);
  }

  /**
   * Check if the actor has an item by name and type.
   * @param {string} name   The item name.
   * @param {string} type   The item type.
   * @returns {boolean}
   */
  hasItem(name, type = null) {
    return this.parent.items.some(i => {
      if ( i.name !== name ) return false;
      if ( type && i.type !== type ) return false;
      return true;
    });
  }

  /**
   * Find an item by name and type.
   * @param {string} name   The item name.
   * @param {string} type   The item type.
   * @returns {Item|undefined}
   */
  getItem(name, type = null) {
    return this.parent.items.find(i => {
      if ( i.name !== name ) return false;
      if ( type && i.type !== type ) return false;
      return true;
    });
  }
}
