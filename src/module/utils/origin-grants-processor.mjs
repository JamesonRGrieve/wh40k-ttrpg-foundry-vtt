/**
 * Origin Grants Processor - Wrapper for Unified Grants Processor
 *
 * Backward compatibility layer for origin path grant processing.
 * Now uses the unified GrantsProcessor for all grant operations.
 * 
 * This maintains the existing API for the origin path builder while
 * delegating to the unified grants processor underneath.
 */

import { GrantsProcessor, GRANT_MODE } from "./grants-processor.mjs";

export class OriginGrantsProcessor {

  /**
   * Process all grants from an origin path item.
   * This includes base grants AND grants from selected choices.
   *
   * @param {Item} originItem - The origin path item
   * @param {Actor} actor - The character actor
   * @returns {Promise<{
   *   characteristics: Object,
   *   itemsToCreate: Array,
   *   woundsBonus: number,
   *   fateBonus: number,
   *   corruptionBonus: number,
   *   insanityBonus: number
   * }>}
   */
  static async processOriginGrants(originItem, actor) {
    // Use unified processor in batch mode
    return await GrantsProcessor.processGrants(originItem, actor, {
      mode: GRANT_MODE.BATCH,
      showNotification: false
    });
  }

  /**
   * Apply skill upgrades to existing skills.
   * Called after items are created.
   *
   * @param {Actor} actor - The character actor
   * @param {Array} itemsToCreate - Items that may need upgrading
   * @deprecated Use GrantsProcessor.applyGrants() instead
   */
  static async applySkillUpgrades(actor, itemsToCreate) {
    const upgrades = itemsToCreate.filter(i => i._upgradeExisting);

    for (const upgrade of upgrades) {
      const existingSkill = actor.items.get(upgrade._existingId);
      if (!existingSkill) continue;

      const updates = {};
      if (upgrade.system.trained) updates["system.trained"] = true;
      if (upgrade.system.plus10) updates["system.plus10"] = true;
      if (upgrade.system.plus20) updates["system.plus20"] = true;

      if (Object.keys(updates).length > 0) {
        await existingSkill.update(updates);
        game.rt?.log(`Upgraded skill: ${existingSkill.name}`);
      }
    }
  }

  /**
   * Get a summary of what will be granted (for preview).
   *
   * @param {Item} originItem - The origin path item
   * @param {Actor} actor - The character actor
   * @returns {Promise<Object>} Summary object
   */
  static async getSummary(originItem, actor) {
    return await GrantsProcessor.getSummary(originItem, actor);
  }
}
