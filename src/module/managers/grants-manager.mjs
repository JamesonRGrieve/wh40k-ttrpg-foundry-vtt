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
   * @param {boolean} [options.force=false] - Bypass idempotency check
   * @param {boolean} [options.saveState=true] - Save applied state to actor flags
   * @param {number} [options.depth=0] - Current recursion depth
   * @returns {Promise<GrantsApplicationResult>}
   */
  static async applyItemGrants(item, actor, options = {}) {
    const result = {
      success: true,
      appliedState: {},
      notifications: [],
      errors: [],
      skipped: false
    };

    if (!item || !actor) {
      result.success = false;
      result.errors.push("Missing item or actor");
      return result;
    }

    // Generate source key for tracking
    const sourceKey = item.uuid || item._id || item.id || `item-${item.name?.replace(/\s+/g, '-')}`;

    // Idempotency check - skip if already applied (unless forced)
    if (!options.force && !options.dryRun && this.hasAppliedGrants(actor, sourceKey)) {
      game.rt?.log(`GrantsManager: Grants from ${item.name} already applied, skipping`);
      const existingState = this.loadAppliedState(actor, sourceKey);
      result.appliedState = existingState?.grants || {};
      result.skipped = true;
      result.notifications.push(`Grants from ${item.name} already applied`);
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

    // Save applied state to actor flags (unless dry run or explicitly disabled)
    const shouldSaveState = !options.dryRun && options.saveState !== false && depth === 0;
    if (shouldSaveState && Object.keys(result.appliedState).length > 0) {
      await this.saveAppliedState(actor, sourceKey, result.appliedState, {
        sourceName: item.name,
        sourceType: item.type
      });
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
   * @param {boolean} [options.reverseExisting=false] - Reverse all existing grants before applying
   * @returns {Promise<GrantsApplicationResult>}
   */
  static async applyBatchGrants(items, actor, options = {}) {
    const result = {
      success: true,
      appliedState: {},
      notifications: [],
      errors: [],
      reversed: {}
    };

    if (!Array.isArray(items) || !actor) {
      result.success = false;
      result.errors.push("Invalid items array or actor");
      return result;
    }

    // Reverse existing grants if requested
    if (options.reverseExisting) {
      game.rt?.log(`GrantsManager: Reversing existing grants before batch apply`);
      const reverseResult = await this.reverseAllAppliedGrants(actor);
      result.reversed = reverseResult.reversed;
      result.notifications.push(...reverseResult.notifications);
      result.errors.push(...reverseResult.errors);
      
      if (!reverseResult.success) {
        console.warn("GrantsManager: Some grants failed to reverse, continuing anyway");
      }
    }

    // Apply grants from each item in order
    for (const item of items) {
      const itemResult = await this.applyItemGrants(item, actor, {
        ...options,
        showNotification: false, // Suppress per-item notifications
        force: options.reverseExisting // Force apply if we reversed
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
  /*  State Persistence (Actor Flags)             */
  /* -------------------------------------------- */

  /**
   * Flag path for storing applied grants on actor.
   * @type {string}
   */
  static FLAG_KEY = "appliedGrants";

  /**
   * Save applied grant state to actor flags.
   * 
   * @param {RogueTraderActor} actor - The actor
   * @param {string} sourceKey - Unique key for the source (UUID or item key)
   * @param {object} state - The applied state to save
   * @param {object} [metadata={}] - Additional metadata
   * @returns {Promise<void>}
   */
  static async saveAppliedState(actor, sourceKey, state, metadata = {}) {
    if (!actor || !sourceKey) return;

    const flagData = {
      appliedAt: Date.now(),
      sourceName: metadata.sourceName || sourceKey,
      sourceType: metadata.sourceType || "unknown",
      grants: state
    };

    // Sanitize the key for use in flag path (remove dots, special chars)
    const safeKey = this._sanitizeKey(sourceKey);
    
    await actor.setFlag("rogue-trader", `${this.FLAG_KEY}.${safeKey}`, flagData);
    game.rt?.log(`GrantsManager: Saved applied state for ${sourceKey}`);
  }

  /**
   * Load applied grant state from actor flags.
   * 
   * @param {RogueTraderActor} actor - The actor
   * @param {string} [sourceKey] - Optional source key to load specific grants
   * @returns {object|null} The applied state, or null if not found
   */
  static loadAppliedState(actor, sourceKey = null) {
    if (!actor) return null;

    const allGrants = actor.getFlag("rogue-trader", this.FLAG_KEY) || {};

    if (sourceKey) {
      const safeKey = this._sanitizeKey(sourceKey);
      return allGrants[safeKey] || null;
    }

    return allGrants;
  }

  /**
   * Clear applied grant state from actor flags.
   * 
   * @param {RogueTraderActor} actor - The actor
   * @param {string} [sourceKey] - Optional source key to clear specific grants
   * @returns {Promise<void>}
   */
  static async clearAppliedState(actor, sourceKey = null) {
    if (!actor) return;

    if (sourceKey) {
      const safeKey = this._sanitizeKey(sourceKey);
      await actor.unsetFlag("rogue-trader", `${this.FLAG_KEY}.${safeKey}`);
      game.rt?.log(`GrantsManager: Cleared applied state for ${sourceKey}`);
    } else {
      await actor.unsetFlag("rogue-trader", this.FLAG_KEY);
      game.rt?.log(`GrantsManager: Cleared all applied grant state`);
    }
  }

  /**
   * Check if grants from a source have already been applied.
   * 
   * @param {RogueTraderActor} actor - The actor
   * @param {string} sourceKey - The source key to check
   * @returns {boolean}
   */
  static hasAppliedGrants(actor, sourceKey) {
    const state = this.loadAppliedState(actor, sourceKey);
    return state !== null && Object.keys(state.grants || {}).length > 0;
  }

  /**
   * Sanitize a key for use in flag paths.
   * @param {string} key 
   * @returns {string}
   * @private
   */
  static _sanitizeKey(key) {
    // Replace dots and special characters with underscores
    return key.replace(/[.\/\\]/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
  }

  /* -------------------------------------------- */
  /*  Reversal & Reset                            */
  /* -------------------------------------------- */

  /**
   * Reverse all applied grants from a specific source.
   * 
   * @param {RogueTraderActor} actor - The actor
   * @param {string} sourceKey - The source key to reverse
   * @returns {Promise<object>} Result of the reversal
   */
  static async reverseAppliedGrants(actor, sourceKey) {
    const result = {
      success: true,
      reversed: {},
      notifications: [],
      errors: []
    };

    if (!actor || !sourceKey) {
      result.success = false;
      result.errors.push("Missing actor or sourceKey");
      return result;
    }

    const appliedData = this.loadAppliedState(actor, sourceKey);
    if (!appliedData) {
      result.notifications.push(`No applied grants found for ${sourceKey}`);
      return result;
    }

    game.rt?.log(`GrantsManager: Reversing grants from ${appliedData.sourceName || sourceKey}`);

    // Reverse each grant in reverse order
    const grantIds = Object.keys(appliedData.grants || {}).reverse();
    
    for (const grantId of grantIds) {
      const grantState = appliedData.grants[grantId];
      if (!grantState) continue;

      try {
        const reversed = await this._reverseGrant(actor, grantId, grantState);
        result.reversed[grantId] = reversed;
        result.notifications.push(...(reversed.notifications || []));
      } catch (err) {
        console.error(`GrantsManager: Failed to reverse grant ${grantId}:`, err);
        result.errors.push(`Failed to reverse grant: ${err.message}`);
      }
    }

    // Clear the applied state
    await this.clearAppliedState(actor, sourceKey);

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * Reverse all applied grants from all sources (full reset).
   * 
   * @param {RogueTraderActor} actor - The actor
   * @returns {Promise<object>} Result of the reversal
   */
  static async reverseAllAppliedGrants(actor) {
    const result = {
      success: true,
      reversed: {},
      notifications: [],
      errors: []
    };

    if (!actor) {
      result.success = false;
      result.errors.push("Missing actor");
      return result;
    }

    const allApplied = this.loadAppliedState(actor);
    if (!allApplied || Object.keys(allApplied).length === 0) {
      result.notifications.push("No applied grants to reverse");
      return result;
    }

    game.rt?.log(`GrantsManager: Reversing all applied grants (${Object.keys(allApplied).length} sources)`);

    // Reverse each source in reverse order (most recent first)
    const sourceKeys = Object.keys(allApplied).reverse();
    
    for (const sourceKey of sourceKeys) {
      const sourceResult = await this.reverseAppliedGrants(actor, sourceKey);
      result.reversed[sourceKey] = sourceResult.reversed;
      result.notifications.push(...sourceResult.notifications);
      result.errors.push(...sourceResult.errors);
      
      if (!sourceResult.success) {
        result.success = false;
      }
    }

    return result;
  }

  /**
   * Reverse a single grant.
   * @param {RogueTraderActor} actor 
   * @param {string} grantId 
   * @param {object} grantState 
   * @returns {Promise<object>}
   * @private
   */
  static async _reverseGrant(actor, grantId, grantState) {
    const { type, applied } = grantState;
    const result = { notifications: [] };

    switch (type) {
      case "characteristic":
        await this._reverseCharacteristicGrant(actor, applied, result);
        break;
      
      case "skill":
        await this._reverseSkillGrant(actor, applied, result);
        break;
      
      case "item":
        await this._reverseItemGrant(actor, applied, result);
        break;
      
      case "resource":
        await this._reverseResourceGrant(actor, applied, result);
        break;
      
      case "choice":
        // Choice grants contain nested grants, reverse them
        if (applied.grantResults) {
          for (const [key, nestedState] of Object.entries(applied.grantResults)) {
            await this._reverseGrant(actor, key, { type: nestedState.type || "unknown", applied: nestedState });
          }
        }
        break;
      
      default:
        console.warn(`GrantsManager: Unknown grant type to reverse: ${type}`);
    }

    return result;
  }

  /**
   * Reverse characteristic grant.
   * @private
   */
  static async _reverseCharacteristicGrant(actor, applied, result) {
    const updates = {};
    
    for (const [key, state] of Object.entries(applied || {})) {
      if (state.previousValue !== undefined) {
        updates[`system.characteristics.${key}.advance`] = state.previousValue;
        result.notifications.push(`Reversed ${key}: ${state.newValue} → ${state.previousValue}`);
      }
    }

    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }
  }

  /**
   * Reverse skill grant.
   * @private
   */
  static async _reverseSkillGrant(actor, applied, result) {
    const idsToDelete = [];
    const itemsToUpdate = [];

    for (const [key, state] of Object.entries(applied || {})) {
      if (state.created && state.itemId) {
        // Delete created skill
        idsToDelete.push(state.itemId);
        result.notifications.push(`Removed skill: ${key}`);
      } else if (state.upgraded && state.itemId && state.previousLevel) {
        // Revert upgrade
        const updates = this._getSkillLevelUpdates(state.previousLevel);
        itemsToUpdate.push({ _id: state.itemId, ...updates });
        result.notifications.push(`Reverted skill ${key} to ${state.previousLevel}`);
      }
    }

    if (idsToDelete.length > 0) {
      await actor.deleteEmbeddedDocuments("Item", idsToDelete);
    }

    if (itemsToUpdate.length > 0) {
      await actor.updateEmbeddedDocuments("Item", itemsToUpdate);
    }
  }

  /**
   * Reverse item grant.
   * @private
   */
  static async _reverseItemGrant(actor, applied, result) {
    const idsToDelete = [];

    for (const [uuid, itemId] of Object.entries(applied || {})) {
      if (itemId && actor.items.has(itemId)) {
        const item = actor.items.get(itemId);
        idsToDelete.push(itemId);
        result.notifications.push(`Removed: ${item.name}`);
      }
    }

    if (idsToDelete.length > 0) {
      await actor.deleteEmbeddedDocuments("Item", idsToDelete);
    }
  }

  /**
   * Reverse resource grant.
   * @private
   */
  static async _reverseResourceGrant(actor, applied, result) {
    const updates = {};
    
    const resourcePaths = {
      wounds: { value: "system.wounds.value", max: "system.wounds.max" },
      fate: { value: "system.fatePoints.value", max: "system.fatePoints.max" },
      corruption: { value: "system.corruption.value" },
      insanity: { value: "system.insanity.value" }
    };

    for (const [resourceType, state] of Object.entries(applied || {})) {
      const paths = resourcePaths[resourceType];
      if (!paths) continue;

      if (state.previousValue !== undefined && paths.value) {
        updates[paths.value] = state.previousValue;
      }
      if (state.previousMax !== undefined && paths.max) {
        updates[paths.max] = state.previousMax;
      }
      
      result.notifications.push(`Reversed ${resourceType}`);
    }

    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }
  }

  /**
   * Get skill level update data.
   * @private
   */
  static _getSkillLevelUpdates(level) {
    const updates = {
      "system.trained": false,
      "system.plus10": false,
      "system.plus20": false
    };

    switch (level) {
      case "plus20":
        updates["system.plus20"] = true;
        // Fall through
      case "plus10":
        updates["system.plus10"] = true;
        // Fall through
      case "trained":
        updates["system.trained"] = true;
        break;
    }

    return updates;
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
