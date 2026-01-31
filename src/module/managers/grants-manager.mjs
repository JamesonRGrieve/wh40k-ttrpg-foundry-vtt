/**
 * Grants Manager
 * 
 * Coordinator for applying grants from items to actors.
 * Delegates to Grant DataModels for actual application logic.
 * 
 * Replaces the monolithic GrantsProcessor with a cleaner architecture.
 */

import { GRANT_TYPES, createGrant } from "../data/grant/_module.mjs";

/**
 * Result of a grants application session.
 * @typedef {object} GrantsApplicationResult
 * @property {boolean} success - Whether all grants applied successfully
 * @property {object} appliedState - State for each grant that was applied
 * @property {string[]} notifications - Messages to display
 * @property {string[]} errors - Error messages
 */

export class GrantsManager {

  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /**
   * Maximum recursion depth for nested grants.
   * @type {number}
   */
  static MAX_DEPTH = 3;

  /* -------------------------------------------- */
  /*  Main Entry Points                           */
  /* -------------------------------------------- */

  /**
   * Apply all grants from an item to an actor.
   * 
   * @param {RogueTraderItem} item - The item containing grants
   * @param {RogueTraderActor} actor - The actor to receive grants
   * @param {object} [options={}] - Application options
   * @param {object} [options.selections={}] - Player selections for choices
   * @param {object} [options.rolledValues={}] - Pre-rolled values for resources
   * @param {boolean} [options.dryRun=false] - Preview mode
   * @param {number} [options.depth=0] - Current recursion depth
   * @returns {Promise<GrantsApplicationResult>}
   */
  static async applyItemGrants(item, actor, options = {}) {
    const result = {
      success: true,
      appliedState: {},
      notifications: [],
      errors: []
    };

    if (!item || !actor) {
      result.success = false;
      result.errors.push("Missing item or actor");
      return result;
    }

    // Check recursion depth
    const depth = options.depth ?? 0;
    if (depth >= this.MAX_DEPTH) {
      console.warn(`GrantsManager: Max recursion depth reached for ${item.name}`);
      return result;
    }

    // Get grants from item
    const grants = this._extractGrants(item);
    if (grants.length === 0) {
      return result;
    }

    game.rt?.log(`GrantsManager: Applying ${grants.length} grants from ${item.name}`);

    // Apply each grant
    for (const grantConfig of grants) {
      const grant = createGrant(grantConfig);
      if (!grant) {
        result.errors.push(`Failed to create grant of type "${grantConfig.type}"`);
        continue;
      }

      // Get selection data for this grant
      const grantData = options.selections?.[grant._id] ?? {};
      
      // Check if grant can auto-apply
      const autoValue = grant.getAutomaticValue();
      const applyData = autoValue || grantData;

      const grantResult = await grant.apply(actor, applyData, {
        dryRun: options.dryRun,
        depth: depth
      });

      // Store state
      result.appliedState[grant._id] = {
        type: grant.constructor.TYPE,
        applied: grantResult.applied
      };

      result.notifications.push(...grantResult.notifications);
      result.errors.push(...grantResult.errors);

      if (!grantResult.success) {
        result.success = false;
      }

      // Handle recursive grants from granted items
      if (grantConfig.type === "item" && grantResult.applied) {
        await this._processNestedGrants(actor, grantResult.applied, {
          ...options,
          depth: depth + 1
        });
      }
    }

    // Show notification summary
    if (!options.dryRun && result.notifications.length > 0 && options.showNotification !== false) {
      ui.notifications.info(`Applied grants from ${item.name}`);
    }

    return result;
  }

  /**
   * Reverse/undo all grants from an item.
   * 
   * @param {RogueTraderItem} item - The item whose grants to reverse
   * @param {RogueTraderActor} actor - The actor to remove grants from
   * @param {object} appliedState - State from when grants were applied
   * @returns {Promise<object>} Restore data for re-applying
   */
  static async reverseItemGrants(item, actor, appliedState) {
    const restoreData = {};

    if (!item || !actor || !appliedState) return restoreData;

    const grants = this._extractGrants(item);

    // Reverse in reverse order
    for (const grantConfig of grants.reverse()) {
      const state = appliedState[grantConfig._id];
      if (!state) continue;

      const grant = createGrant(grantConfig);
      if (!grant) continue;

      restoreData[grantConfig._id] = await grant.reverse(actor, state.applied);
    }

    return restoreData;
  }

  /**
   * Get a preview/summary of what an item would grant.
   * 
   * @param {RogueTraderItem} item - The item to preview
   * @returns {Promise<object>} Summary of grants
   */
  static async getGrantsSummary(item) {
    const summary = {
      item: item.name,
      grants: []
    };

    const grants = this._extractGrants(item);
    
    for (const grantConfig of grants) {
      const grant = createGrant(grantConfig);
      if (grant) {
        summary.grants.push(await grant.getSummary());
      }
    }

    return summary;
  }

  /**
   * Validate all grants on an item.
   * 
   * @param {RogueTraderItem} item - The item to validate
   * @returns {string[]} Array of validation errors
   */
  static validateItemGrants(item) {
    const errors = [];
    const grants = this._extractGrants(item);

    for (const grantConfig of grants) {
      const grant = createGrant(grantConfig);
      if (!grant) {
        errors.push(`Invalid grant type: ${grantConfig.type}`);
        continue;
      }
      errors.push(...grant.validate());
    }

    return errors;
  }

  /* -------------------------------------------- */
  /*  Batch Processing (for Origin Path Builder)  */
  /* -------------------------------------------- */

  /**
   * Process grants from multiple items in batch.
   * Used by origin path builder to apply all selected origins at once.
   * 
   * @param {RogueTraderItem[]} items - Array of items with grants
   * @param {RogueTraderActor} actor - The actor to receive grants
   * @param {object} [options={}] - Application options
   * @returns {Promise<GrantsApplicationResult>}
   */
  static async applyBatchGrants(items, actor, options = {}) {
    const result = {
      success: true,
      appliedState: {},
      notifications: [],
      errors: []
    };

    if (!Array.isArray(items) || !actor) {
      result.success = false;
      result.errors.push("Invalid items array or actor");
      return result;
    }

    // Apply grants from each item in order
    for (const item of items) {
      const itemResult = await this.applyItemGrants(item, actor, {
        ...options,
        showNotification: false // Suppress per-item notifications
      });

      // Use item.id, item._id, or generate a key from name
      const itemKey = item.id || item._id || `item-${item.name?.replace(/\s+/g, '-')}`;
      result.appliedState[itemKey] = itemResult.appliedState;
      result.notifications.push(...itemResult.notifications);
      result.errors.push(...itemResult.errors);

      if (!itemResult.success) {
        result.success = false;
      }
    }

    // Show combined notification
    if (!options.dryRun && result.notifications.length > 0 && options.showNotification !== false) {
      ui.notifications.info(`Applied grants from ${items.length} items`);
    }

    return result;
  }

  /* -------------------------------------------- */
  /*  Migration Helpers                           */
  /* -------------------------------------------- */

  /**
   * Convert old grant format to new Grant DataModels.
   * 
   * @param {object} oldGrants - Old grants object from item.system.grants
   * @param {object} [modifiers] - Optional modifiers object from item.system.modifiers
   * @returns {object[]} Array of grant configurations
   */
  static migrateOldGrants(oldGrants, modifiers = null) {
    const newGrants = [];

    // Migrate characteristic modifiers from modifiers.characteristics (origin paths)
    // This is separate from grants in the old format
    const charMods = modifiers?.characteristics || oldGrants?.characteristics;
    if (charMods && Object.keys(charMods).length > 0) {
      const charGrant = {
        _id: foundry.utils.randomID(),
        type: "characteristic",
        characteristics: Object.entries(charMods)
          .filter(([_, value]) => value !== 0)
          .map(([key, value]) => ({ key, value }))
      };
      if (charGrant.characteristics.length > 0) {
        newGrants.push(charGrant);
      }
    }

    // If no grants object, return just characteristics
    if (!oldGrants) return newGrants;

    // Migrate wounds
    if (oldGrants.woundsFormula || oldGrants.wounds) {
      newGrants.push({
        _id: foundry.utils.randomID(),
        type: "resource",
        resources: [{
          type: "wounds",
          formula: oldGrants.woundsFormula || String(oldGrants.wounds)
        }]
      });
    }

    // Migrate fate
    if (oldGrants.fateFormula || oldGrants.fateThreshold) {
      newGrants.push({
        _id: foundry.utils.randomID(),
        type: "resource",
        resources: [{
          type: "fate",
          formula: oldGrants.fateFormula || String(oldGrants.fateThreshold)
        }]
      });
    }

    // Migrate skills
    if (oldGrants.skills?.length > 0) {
      newGrants.push({
        _id: foundry.utils.randomID(),
        type: "skill",
        skills: oldGrants.skills.map(s => ({
          key: s.key || s.name,  // Support both key and name
          specialization: s.specialization || "",
          level: s.level || "trained"
        }))
      });
    }

    // Migrate talents
    if (oldGrants.talents?.length > 0) {
      newGrants.push({
        _id: foundry.utils.randomID(),
        type: "item",
        items: oldGrants.talents.map(t => ({
          uuid: t.uuid || "",
          // If no UUID, we'll need to look it up
          _legacyName: t.name,
          _legacySpecialization: t.specialization
        }))
      });
    }

    // Migrate traits
    if (oldGrants.traits?.length > 0) {
      newGrants.push({
        _id: foundry.utils.randomID(),
        type: "item",
        items: oldGrants.traits.map(t => ({
          uuid: t.uuid || "",
          _legacyName: t.name,
          overrides: t.level ? { "system.level": t.level } : {}
        }))
      });
    }

    // Migrate equipment
    if (oldGrants.equipment?.length > 0) {
      newGrants.push({
        _id: foundry.utils.randomID(),
        type: "item",
        items: oldGrants.equipment.map(e => ({
          uuid: e.uuid || "",
          _legacyName: e.name,
          overrides: e.quantity > 1 ? { "system.quantity": e.quantity } : {}
        }))
      });
    }

    // Migrate choices
    if (oldGrants.choices?.length > 0) {
      for (const choice of oldGrants.choices) {
        newGrants.push({
          _id: foundry.utils.randomID(),
          type: "choice",
          label: choice.label,
          count: choice.count || 1,
          options: choice.options.map(opt => ({
            label: opt.name || opt.label || "Option",
            grants: this._migrateChoiceOption(opt)
          }))
        });
      }
    }

    return newGrants;
  }

  /* -------------------------------------------- */
  /*  Private Helper Methods                      */
  /* -------------------------------------------- */

  /**
   * Extract grants configuration from an item.
   * @param {RogueTraderItem} item 
   * @returns {object[]}
   * @private
   */
  static _extractGrants(item) {
    // Check for new-style grants array
    if (Array.isArray(item.system?.grantsV2)) {
      return item.system.grantsV2;
    }

    // Check for old-style grants object and migrate
    // Also include modifiers.characteristics which is separate from grants in origin paths
    if (item.system?.grants || item.system?.modifiers?.characteristics) {
      return this.migrateOldGrants(item.system.grants, item.system.modifiers);
    }

    return [];
  }

  /**
   * Process nested grants from granted items.
   * @param {RogueTraderActor} actor 
   * @param {object} appliedItems - Map of UUID to item ID
   * @param {object} options 
   * @private
   */
  static async _processNestedGrants(actor, appliedItems, options) {
    for (const [uuid, itemId] of Object.entries(appliedItems)) {
      const item = actor.items.get(itemId);
      if (!item) continue;

      // Check if the granted item has its own grants
      const grants = this._extractGrants(item);
      if (grants.length > 0) {
        game.rt?.log(`GrantsManager: Processing nested grants from ${item.name}`);
        await this.applyItemGrants(item, actor, options);
      }
    }
  }

  /**
   * Migrate a single choice option to grants format.
   * @param {object} option 
   * @returns {object[]}
   * @private
   */
  static _migrateChoiceOption(option) {
    const grants = [];

    // If option has a nested grants object, migrate it recursively
    if (option.grants) {
      const nestedGrants = this.migrateOldGrants(option.grants);
      grants.push(...nestedGrants);
    }

    // Characteristic bonus (flat structure)
    if (option.characteristic && option.value) {
      grants.push({
        type: "characteristic",
        characteristics: [{ key: option.characteristic, value: option.value }]
      });
    }

    // Skill (flat structure)
    if (option.skill) {
      grants.push({
        type: "skill",
        skills: [{
          key: option.skill,
          specialization: option.specialization || "",
          level: option.level || "trained"
        }]
      });
    }

    // Talent (flat structure)
    if (option.talent || (option.uuid && !option.grants)) {
      grants.push({
        type: "item",
        items: [{
          uuid: option.uuid || "",
          _legacyName: option.talent || option.name
        }]
      });
    }

    return grants;
  }
}

// Export for convenience
export default GrantsManager;
