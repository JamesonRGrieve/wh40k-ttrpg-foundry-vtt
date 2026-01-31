import BaseGrantData from "./base-grant.mjs";

/**
 * Grant that provides items (talents, traits, equipment) to an actor.
 * Uses UUID references for reliable item lookup.
 * 
 * @extends BaseGrantData
 */
export default class ItemGrantData extends BaseGrantData {

  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static TYPE = "item";
  static ICON = "icons/svg/item-bag.svg";

  /**
   * Valid item types for this grant.
   * @type {Set<string>}
   */
  static VALID_TYPES = new Set([
    "talent", "trait", "weapon", "armour", "gear", 
    "ammunition", "cybernetic", "forceField", "specialAbility"
  ]);

  /* -------------------------------------------- */
  /*  Schema Definition                           */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      // Items to grant - array of UUID references
      items: new fields.ArrayField(
        new fields.SchemaField({
          uuid: new fields.StringField({ required: true }),
          optional: new fields.BooleanField({ initial: false }),
          // Override data for the granted item
          overrides: new fields.ObjectField({ required: false, initial: {} })
        }),
        { required: true, initial: [] }
      ),
      
      // Applied state - tracks what was actually granted
      // Maps source UUID to created item ID on actor
      applied: new fields.ObjectField({ required: true, initial: {} })
    };
  }

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /**
   * Whether any items have been applied.
   * @type {boolean}
   */
  get hasApplied() {
    return Object.keys(this.applied).length > 0;
  }

  /* -------------------------------------------- */
  /*  Grant Application Methods                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async apply(actor, data = {}, options = {}) {
    const result = {
      success: true,
      applied: {},
      notifications: [],
      errors: []
    };

    if (!actor) {
      result.success = false;
      result.errors.push("No actor provided");
      return result;
    }

    // Handle missing items gracefully
    const items = this.items ?? [];
    if (items.length === 0) {
      result.notifications.push("Item grant has no items to apply");
      return result;
    }

    const itemsToCreate = [];
    const selectedUuids = data.selected ?? items.map(i => i.uuid);

    for (const itemConfig of items) {
      const { uuid, optional, overrides } = itemConfig;
      
      // Skip items with empty UUID (legacy data without proper mapping)
      if (!uuid) {
        const legacyName = itemConfig._legacyName;
        if (legacyName) {
          result.notifications.push(`Skipped "${legacyName}" - no UUID mapping available`);
        }
        continue;
      }
      
      // Skip if not selected
      if (!selectedUuids.includes(uuid)) {
        if (!optional && !this.optional) {
          result.errors.push(`Required item ${uuid} not selected`);
        }
        continue;
      }

      // Fetch the source item
      const sourceItem = await this._fetchItem(uuid);
      if (!sourceItem) {
        result.errors.push(`Could not find item: ${uuid}`);
        continue;
      }

      // Validate item type
      if (!this.constructor.VALID_TYPES.has(sourceItem.type)) {
        result.errors.push(`Invalid item type "${sourceItem.type}" for ${sourceItem.name}`);
        continue;
      }

      // Check for duplicates
      if (this._isDuplicate(actor, sourceItem)) {
        result.notifications.push(`${sourceItem.name} already exists, skipping`);
        continue;
      }

      // Create item data
      const itemData = await this._createItemData(sourceItem, uuid, overrides);
      itemsToCreate.push({ uuid, data: itemData });
    }

    // Apply if not dry run
    if (!options.dryRun && itemsToCreate.length > 0) {
      const created = await actor.createEmbeddedDocuments(
        "Item", 
        itemsToCreate.map(i => i.data)
      );

      // Track what was applied
      created.forEach((item, index) => {
        const sourceUuid = itemsToCreate[index].uuid;
        result.applied[sourceUuid] = item.id;
        result.notifications.push(`Granted: ${item.name}`);
      });
    } else if (options.dryRun) {
      // Preview mode
      itemsToCreate.forEach(({ data: itemData }) => {
        result.notifications.push(`Would grant: ${itemData.name}`);
      });
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /** @inheritDoc */
  async reverse(actor, appliedState) {
    const restoreData = { items: [] };
    const idsToDelete = [];

    for (const [uuid, itemId] of Object.entries(appliedState)) {
      const item = actor.items.get(itemId);
      if (item) {
        // Store item data for restore
        restoreData.items.push({
          uuid,
          data: item.toObject()
        });
        idsToDelete.push(itemId);
      }
    }

    // Delete items from actor
    if (idsToDelete.length > 0) {
      await actor.deleteEmbeddedDocuments("Item", idsToDelete);
    }

    return restoreData;
  }

  /** @inheritDoc */
  async restore(actor, restoreData) {
    const result = {
      success: true,
      applied: {},
      notifications: [],
      errors: []
    };

    if (!restoreData?.items?.length) return result;

    const itemsToCreate = restoreData.items.map(({ uuid, data }) => {
      // Preserve the original item data
      return { uuid, data };
    });

    const created = await actor.createEmbeddedDocuments(
      "Item",
      itemsToCreate.map(i => i.data)
    );

    created.forEach((item, index) => {
      const sourceUuid = itemsToCreate[index].uuid;
      result.applied[sourceUuid] = item.id;
      result.notifications.push(`Restored: ${item.name}`);
    });

    return result;
  }

  /** @inheritDoc */
  getAutomaticValue() {
    if (this.optional) return false;
    if (this.items.some(i => i.optional)) return false;
    return { selected: this.items.map(i => i.uuid) };
  }

  /** @inheritDoc */
  async getSummary() {
    const summary = await super.getSummary();
    summary.icon = this.constructor.ICON;
    
    for (const itemConfig of this.items) {
      const item = await this._fetchItem(itemConfig.uuid);
      if (item) {
        summary.details.push({
          label: item.name,
          value: item.type,
          optional: itemConfig.optional,
          img: item.img
        });
      } else {
        summary.details.push({
          label: itemConfig.uuid,
          value: "Not found",
          optional: itemConfig.optional,
          error: true
        });
      }
    }

    return summary;
  }

  /** @inheritDoc */
  validateGrant() {
    const errors = super.validateGrant();
    
    // items may be undefined if grant was created with invalid data
    const items = this.items ?? [];
    
    if (items.length === 0) {
      errors.push("Item grant has no items configured");
    }

    for (const itemConfig of items) {
      if (!itemConfig.uuid) {
        errors.push("Item grant entry missing UUID");
      }
    }

    return errors;
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Check if an item already exists on the actor.
   * @param {RogueTraderActor} actor 
   * @param {RogueTraderItem} sourceItem 
   * @returns {boolean}
   * @private
   */
  _isDuplicate(actor, sourceItem) {
    return actor.items.some(i => 
      i.type === sourceItem.type && 
      i.name === sourceItem.name &&
      // For talents/traits, also check specialization
      (i.type !== "talent" || i.system?.specialization === sourceItem.system?.specialization)
    );
  }

  /**
   * Create item data for granting.
   * @param {RogueTraderItem} sourceItem 
   * @param {string} uuid 
   * @param {object} overrides 
   * @returns {Promise<object>}
   * @private
   */
  async _createItemData(sourceItem, uuid, overrides = {}) {
    const itemData = sourceItem.toObject();
    
    // Apply overrides
    if (overrides && Object.keys(overrides).length > 0) {
      foundry.utils.mergeObject(itemData, overrides);
    }

    // Set grant flags
    itemData.flags = foundry.utils.mergeObject(
      itemData.flags ?? {},
      this._createGrantFlags(uuid)
    );

    // Generate new ID
    itemData._id = foundry.utils.randomID();

    return itemData;
  }
}
