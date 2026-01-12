import SystemDataModel from "../abstract/system-data-model.mjs";

/**
 * Template for items that can be equipped.
 * @mixin
 */
export default class EquippableTemplate extends SystemDataModel {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      equipped: new fields.BooleanField({ required: true, initial: false }),
      inBackpack: new fields.BooleanField({ required: true, initial: false }),
      inShipStorage: new fields.BooleanField({ required: true, initial: false }),
      container: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */

  /**
   * Is this item currently carried (not in storage)?
   * @type {boolean}
   */
  get isCarried() {
    return !this.container && !this.inBackpack && !this.inShipStorage;
  }

  /* -------------------------------------------- */

  /**
   * Is this item in ship storage?
   * @type {boolean}
   */
  get isInShipStorage() {
    return this.inShipStorage === true;
  }

  /* -------------------------------------------- */

  /**
   * Toggle the equipped state.
   * @returns {Promise<Item>}
   */
  async toggleEquipped() {
    return this.parent?.update({ "system.equipped": !this.equipped });
  }

  /* -------------------------------------------- */

  /**
   * Move to backpack.
   * @returns {Promise<Item>}
   */
  async stowInBackpack() {
    return this.parent?.update({ 
      "system.equipped": false,
      "system.inBackpack": true 
    });
  }

  /* -------------------------------------------- */

  /**
   * Remove from backpack.
   * @returns {Promise<Item>}
   */
  async removeFromBackpack() {
    return this.parent?.update({ "system.inBackpack": false });
  }

  /* -------------------------------------------- */

  /**
   * Move to ship storage.
   * @returns {Promise<Item>}
   */
  async stowInShipStorage() {
    return this.parent?.update({ 
      "system.equipped": false,
      "system.inBackpack": false,
      "system.inShipStorage": true 
    });
  }

  /* -------------------------------------------- */

  /**
   * Remove from ship storage.
   * @returns {Promise<Item>}
   */
  async removeFromShipStorage() {
    return this.parent?.update({ "system.inShipStorage": false });
  }
}
