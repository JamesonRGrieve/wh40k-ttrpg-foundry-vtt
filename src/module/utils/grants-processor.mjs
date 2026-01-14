/**
 * Unified Grants Processor
 *
 * Single source of truth for processing grants from items (talents, traits, origins).
 * Supports both immediate application (for talents) and batch processing (for origins).
 *
 * Replaces and consolidates:
 * - talent-grants.mjs (immediate application with recursion)
 * - origin-grants-processor.mjs (batch processing with choices)
 */

import { evaluateWoundsFormula, evaluateFateFormula } from "./formula-evaluator.mjs";
import { SkillKeyHelper } from "../helpers/skill-key-helper.mjs";

/**
 * Processing modes
 */
export const GRANT_MODE = {
  IMMEDIATE: "immediate",  // Apply grants immediately (talents, traits)
  BATCH: "batch"           // Collect grants for batch application (origins)
};

/**
 * Context object for grant processing
 */
class GrantContext {
  constructor(actor, options = {}) {
    this.actor = actor;
    this.mode = options.mode || GRANT_MODE.IMMEDIATE;
    this.depth = options.depth || 0;
    this.maxDepth = options.maxDepth || 3;
    this.dryRun = options.dryRun || false;
    this.showNotification = options.showNotification ?? true;
    this.sourceItem = options.sourceItem || null;
    
    // Accumulated results
    this.result = {
      characteristics: {},
      itemsToCreate: [],
      skillUpdates: {},
      woundsBonus: 0,
      fateBonus: 0,
      corruptionBonus: 0,
      insanityBonus: 0,
      aptitudes: [],
      notifications: []
    };
  }
}

export class GrantsProcessor {

  /* -------------------------------------------- */
  /*  Main Entry Points                           */
  /* -------------------------------------------- */

  /**
   * Process grants from an item.
   * 
   * @param {RogueTraderItem} item - The item with grants
   * @param {RogueTraderActor} actor - The actor receiving grants
   * @param {object} options - Processing options
   * @param {string} options.mode - "immediate" (default) or "batch"
   * @param {number} options.depth - Recursion depth for nested grants
   * @param {number} options.maxDepth - Maximum recursion depth (default 3)
   * @param {boolean} options.dryRun - Preview mode, don't apply
   * @param {boolean} options.showNotification - Show UI notification
   * @param {RogueTraderItem} options.sourceItem - Item granting this (for nested grants)
   * @returns {Promise<object>} Result object with grants processed
   */
  static async processGrants(item, actor, options = {}) {
    if (!item || !actor) {
      console.warn("GrantsProcessor: Missing item or actor");
      return null;
    }

    const context = new GrantContext(actor, options);
    
    // Check recursion depth
    if (context.depth >= context.maxDepth) {
      console.warn(`GrantsProcessor: Maximum recursion depth (${context.maxDepth}) reached for item: ${item.name}`);
      return context.result;
    }

    // Check if item has grants
    const grants = item.system?.grants;
    if (!grants) {
      game.rt?.log(`GrantsProcessor: No grants found on item: ${item.name}`);
      return context.result;
    }

    // Check if this is a talent with the hasGrants flag
    if (item.type === 'talent' && !item.system?.hasGrants) {
      game.rt?.log(`GrantsProcessor: Talent ${item.name} has no hasGrants flag`);
      return context.result;
    }

    game.rt?.log(`GrantsProcessor: Processing grants from ${item.type}: ${item.name} (mode: ${context.mode}, depth: ${context.depth})`);

    // Process based on item type
    if (item.type === 'originPath' || item.flags?.rt?.kind === 'origin') {
      await this._processOriginGrants(item, context);
    } else if (item.type === 'talent' || item.type === 'trait') {
      await this._processItemGrants(item, context);
    } else {
      console.warn(`GrantsProcessor: Unsupported item type: ${item.type}`);
      return context.result;
    }

    // Apply grants if in immediate mode and not dry run
    if (context.mode === GRANT_MODE.IMMEDIATE && !context.dryRun) {
      await this._applyGrantsImmediate(context);
    }

    return context.result;
  }

  /**
   * Apply accumulated grants to an actor (batch mode).
   * Used by origin path builder to commit all selected origins at once.
   * 
   * @param {RogueTraderActor} actor - The actor to update
   * @param {object} result - Result from processGrants()
   * @param {object} options - Application options
   * @returns {Promise<void>}
   */
  static async applyGrants(actor, result, options = {}) {
    if (!actor || !result) return;

    const updates = {};

    // Apply characteristic advances
    if (result.characteristics && Object.keys(result.characteristics).length > 0) {
      for (const [char, value] of Object.entries(result.characteristics)) {
        if (value !== 0) {
          const currentAdvance = actor.system.characteristics[char]?.advance || 0;
          updates[`system.characteristics.${char}.advance`] = currentAdvance + value;
        }
      }
    }

    // Apply wounds bonus
    if (result.woundsBonus) {
      const current = actor.system.wounds?.value || 0;
      const max = actor.system.wounds?.max || 0;
      updates["system.wounds.value"] = current + result.woundsBonus;
      updates["system.wounds.max"] = max + result.woundsBonus;
    }

    // Apply fate bonus
    if (result.fateBonus) {
      const current = actor.system.fate?.value || 0;
      const max = actor.system.fate?.max || 0;
      updates["system.fate.value"] = current + result.fateBonus;
      updates["system.fate.max"] = max + result.fateBonus;
    }

    // Apply corruption/insanity
    if (result.corruptionBonus) {
      const current = actor.system.corruption?.value || 0;
      updates["system.corruption.value"] = current + result.corruptionBonus;
    }
    if (result.insanityBonus) {
      const current = actor.system.insanity?.value || 0;
      updates["system.insanity.value"] = current + result.insanityBonus;
    }

    // Apply actor updates
    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }

    // Create items
    const itemsToAdd = result.itemsToCreate.filter(i => !i._upgradeExisting);
    if (itemsToAdd.length > 0) {
      await actor.createEmbeddedDocuments('Item', itemsToAdd);
    }

    // Apply skill upgrades
    const upgrades = result.itemsToCreate.filter(i => i._upgradeExisting);
    for (const upgrade of upgrades) {
      const existingSkill = actor.items.get(upgrade._existingId);
      if (existingSkill) {
        const skillUpdates = {};
        if (upgrade.system.trained) skillUpdates["system.trained"] = true;
        if (upgrade.system.plus10) skillUpdates["system.plus10"] = true;
        if (upgrade.system.plus20) skillUpdates["system.plus20"] = true;
        if (Object.keys(skillUpdates).length > 0) {
          await existingSkill.update(skillUpdates);
        }
      }
    }

    // Show notification
    if (options.showNotification !== false && result.itemsToCreate.length > 0) {
      ui.notifications.info(`Applied grants: ${result.itemsToCreate.length} items created/upgraded`);
    }
  }

  /**
   * Get a summary of what will be granted (dry run for previews).
   * 
   * @param {RogueTraderItem} item - The item with grants
   * @param {RogueTraderActor} actor - The actor that would receive grants
   * @returns {Promise<object>} Summary object
   */
  static async getSummary(item, actor) {
    const result = await this.processGrants(item, actor, { dryRun: true, mode: GRANT_MODE.BATCH });
    
    return {
      characteristics: result.characteristics,
      wounds: result.woundsBonus,
      fate: result.fateBonus,
      corruption: result.corruptionBonus,
      insanity: result.insanityBonus,
      itemCount: result.itemsToCreate.length,
      items: result.itemsToCreate.map(i => ({
        type: i.type,
        name: i.name,
        isUpgrade: i._upgradeExisting || false
      }))
    };
  }

  /* -------------------------------------------- */
  /*  Origin Path Processing                      */
  /* -------------------------------------------- */

  /**
   * Process origin path grants (includes base + choice grants).
   * @private
   */
  static async _processOriginGrants(originItem, context) {
    // 1. Process characteristic modifiers (from modifiers template)
    await this._processCharacteristicModifiers(originItem, context);

    // 2. Process base grants
    await this._processBaseGrants(originItem, context);

    // 3. Process selected choice grants
    await this._processChoiceGrants(originItem, context);
  }

  /**
   * Process characteristic modifiers from the modifiers template.
   * @private
   */
  static async _processCharacteristicModifiers(originItem, context) {
    const charMods = originItem.system?.modifiers?.characteristics || {};
    for (const [char, value] of Object.entries(charMods)) {
      if (value !== 0) {
        context.result.characteristics[char] = (context.result.characteristics[char] || 0) + value;
      }
    }
  }

  /**
   * Process base grants (always applied).
   * @private
   */
  static async _processBaseGrants(originItem, context) {
    const grants = originItem.system?.grants || {};

    // Wounds - prefer formula over legacy field
    if (grants.woundsFormula) {
      context.result.woundsBonus += await this._evaluateWounds(grants.woundsFormula, context.actor, originItem);
    } else if (grants.wounds && grants.wounds !== 0) {
      context.result.woundsBonus += grants.wounds;
      console.warn(`Origin "${originItem.name}" uses legacy grants.wounds field. Consider migrating to woundsFormula.`);
    }

    // Fate - prefer formula over legacy field
    if (grants.fateFormula) {
      context.result.fateBonus += await this._evaluateFate(grants.fateFormula, originItem);
    } else if (grants.fateThreshold && grants.fateThreshold !== 0) {
      context.result.fateBonus += grants.fateThreshold;
      console.warn(`Origin "${originItem.name}" uses legacy grants.fateThreshold field. Consider migrating to fateFormula.`);
    }

    // Process grant arrays
    await this._processGrantArray(grants.skills, "skill", context);
    await this._processGrantArray(grants.talents, "talent", context);
    await this._processGrantArray(grants.traits, "trait", context);
    await this._processGrantArray(grants.equipment, "equipment", context);
    await this._processGrantArray(grants.specialAbilities, "specialAbility", context);

    // Aptitudes (tracked but not created as items)
    if (grants.aptitudes && Array.isArray(grants.aptitudes)) {
      context.result.aptitudes.push(...grants.aptitudes);
    }

    // Direct corruption/insanity from base grants
    if (grants.corruption) {
      const corruptionValue = await this._evaluateDiceFormula(grants.corruption);
      context.result.corruptionBonus += corruptionValue;
    }
    if (grants.insanity) {
      const insanityValue = await this._evaluateDiceFormula(grants.insanity);
      context.result.insanityBonus += insanityValue;
    }
  }

  /**
   * Process choice grants from selectedChoices.
   * @private
   */
  static async _processChoiceGrants(originItem, context) {
    const choices = originItem.system?.grants?.choices || [];
    const selectedChoices = originItem.system?.selectedChoices || {};

    for (const choice of choices) {
      const selected = selectedChoices[choice.label] || [];

      for (const selectedValue of selected) {
        const option = choice.options.find(opt => opt.value === selectedValue);
        if (!option?.grants) {
          console.warn(`Origin "${originItem.name}" choice "${choice.label}" has selection "${selectedValue}" but no grants found.`);
          continue;
        }

        const optionGrants = option.grants;

        // Characteristics from choice
        if (optionGrants.characteristics) {
          for (const [char, value] of Object.entries(optionGrants.characteristics)) {
            if (value !== 0) {
              context.result.characteristics[char] = (context.result.characteristics[char] || 0) + value;
              game.rt?.log(`Origin choice "${choice.label}" grants ${value >= 0 ? '+' : ''}${value} ${char}`);
            }
          }
        }

        // Process grant arrays from choice
        await this._processGrantArray(optionGrants.skills, "skill", context, choice.label);
        await this._processGrantArray(optionGrants.talents, "talent", context, choice.label);
        await this._processGrantArray(optionGrants.traits, "trait", context, choice.label);
        await this._processGrantArray(optionGrants.equipment, "equipment", context, choice.label);

        // Corruption/Insanity from choice
        if (optionGrants.corruption) {
          const corruptionValue = await this._evaluateDiceFormula(optionGrants.corruption);
          context.result.corruptionBonus += corruptionValue;
          game.rt?.log(`Origin choice "${choice.label}" grants ${corruptionValue} corruption`);
        }
        if (optionGrants.insanity) {
          const insanityValue = await this._evaluateDiceFormula(optionGrants.insanity);
          context.result.insanityBonus += insanityValue;
          game.rt?.log(`Origin choice "${choice.label}" grants ${insanityValue} insanity`);
        }
      }
    }
  }

  /* -------------------------------------------- */
  /*  Item Grant Processing (Talents/Traits)      */
  /* -------------------------------------------- */

  /**
   * Process grants from a talent or trait item.
   * @private
   */
  static async _processItemGrants(item, context) {
    const grants = item.system?.grants;
    if (!grants) return;

    // Process grant arrays
    await this._processGrantArray(grants.talents, "talent", context);
    await this._processGrantArray(grants.skills, "skill", context);
    await this._processGrantArray(grants.traits, "trait", context);
    await this._processGrantArray(grants.equipment, "equipment", context);
  }

  /**
   * Process an array of grants.
   * @private
   */
  static async _processGrantArray(grantArray, type, context, choiceLabel = null) {
    if (!grantArray || !Array.isArray(grantArray) || grantArray.length === 0) return;

    for (const grant of grantArray) {
      switch (type) {
        case "skill":
          await this._processSkillGrant(grant, context);
          break;
        case "talent":
          await this._processTalentGrant(grant, context);
          break;
        case "trait":
          await this._processTraitGrant(grant, context);
          break;
        case "equipment":
          await this._processEquipmentGrant(grant, context);
          break;
        case "specialAbility":
          await this._processSpecialAbilityGrant(grant, context);
          break;
      }
      
      if (choiceLabel && context.showNotification) {
        context.result.notifications.push(`${choiceLabel}: ${grant.name || grant}`);
      }
    }
  }

  /* -------------------------------------------- */
  /*  Individual Grant Type Processors            */
  /* -------------------------------------------- */

  /**
   * Process a single skill grant.
   * Uses SkillKeyHelper for robust name-to-key conversion.
   * @private
   */
  static async _processSkillGrant(skillGrant, context) {
    // Normalize skill grant (might be string or object)
    const normalized = typeof skillGrant === 'string' 
      ? { name: skillGrant, level: 'trained' }
      : skillGrant;

    // Validate skill name using SkillKeyHelper
    const skillKey = SkillKeyHelper.nameToKey(normalized.name);
    const metadata = SkillKeyHelper.getSkillMetadata(skillKey);
    
    if (!metadata) {
      console.warn(`SkillGrant: Unknown skill "${normalized.name}", skipping`);
      return;
    }
    
    // Check if skill is specialist type
    const isSpecialist = metadata.isSpecialist;
    const displayName = metadata.name;
    
    // For specialist skills, the grant must specify a specialization
    if (isSpecialist && !normalized.specialization) {
      console.warn(`SkillGrant: Specialist skill "${displayName}" requires specialization, skipping`);
      return;
    }

    // Check if skill already exists on actor
    const existingSkill = context.actor?.items?.find(i =>
      i.type === "skill" &&
      i.name.toLowerCase() === displayName.toLowerCase() &&
      (!normalized.specialization || i.system?.specialization === normalized.specialization)
    );

    if (existingSkill) {
      // Skill exists - mark for upgrade
      context.result.itemsToCreate.push({
        _upgradeExisting: true,
        _existingId: existingSkill.id,
        type: "skill",
        name: displayName,
        system: {
          characteristic: metadata.characteristic,
          specialization: normalized.specialization || "",
          trained: normalized.level === "trained" || normalized.level === "plus10" || normalized.level === "plus20",
          plus10: normalized.level === "plus10" || normalized.level === "plus20",
          plus20: normalized.level === "plus20"
        }
      });
      
      if (context.showNotification) {
        const fullName = normalized.specialization 
          ? `${displayName} (${normalized.specialization})`
          : displayName;
        context.result.notifications.push(`Skill: ${fullName} (upgrade to ${normalized.level})`);
      }
    } else {
      // Create new skill item with proper metadata
      context.result.itemsToCreate.push({
        type: "skill",
        name: displayName,
        system: {
          characteristic: metadata.characteristic,
          skillType: isSpecialist ? "specialist" : (metadata.isAdvanced ? "advanced" : "basic"),
          isBasic: !metadata.isAdvanced,
          specialization: normalized.specialization || "",
          trained: normalized.level === "trained" || normalized.level === "plus10" || normalized.level === "plus20",
          plus10: normalized.level === "plus10" || normalized.level === "plus20",
          plus20: normalized.level === "plus20"
        }
      });
      
      if (context.showNotification) {
        const fullName = normalized.specialization 
          ? `${displayName} (${normalized.specialization})`
          : displayName;
        context.result.notifications.push(`Skill: ${fullName} (${normalized.level})`);
      }
    }
  }

  /**
   * Process a single talent grant.
   * May trigger recursive processing if talent has grants.
   * @private
   */
  static async _processTalentGrant(talentGrant, context) {
    // Check for duplicates
    const existing = context.actor?.items?.find(i =>
      i.type === 'talent' &&
      i.name === talentGrant.name &&
      (!talentGrant.specialization || i.system?.specialization === talentGrant.specialization)
    );

    if (existing) {
      game.rt?.log(`Talent ${talentGrant.name} already exists, skipping grant`);
      return;
    }

    // Fetch talent from UUID or compendium
    let talentItem = null;
    if (talentGrant.uuid) {
      try {
        talentItem = await fromUuid(talentGrant.uuid);
        if (!talentItem) {
          console.warn(`Failed to resolve talent UUID: ${talentGrant.uuid} (${talentGrant.name})`);
        }
      } catch (err) {
        console.error(`Error loading talent ${talentGrant.uuid}:`, err);
      }
    }

    // Fallback: search compendium
    if (!talentItem) {
      talentItem = await this._findInCompendium('rogue-trader.rt-items-talents', talentGrant.name);
    }

    if (!talentItem) {
      console.warn(`Could not find talent: ${talentGrant.name}`);
      // Create basic talent as fallback
      this._createBasicTalent(talentGrant, context);
      return;
    }

    // Clone item data
    const itemData = talentItem.toObject();
    if (talentGrant.specialization) {
      itemData.system.specialization = talentGrant.specialization;
      itemData.name = `${itemData.name} (${talentGrant.specialization})`;
    }

    // Mark as granted
    itemData.flags = itemData.flags || {};
    itemData.flags['rogue-trader'] = itemData.flags['rogue-trader'] || {};
    if (context.sourceItem) {
      itemData.flags['rogue-trader'].grantedBy = context.sourceItem.name;
      itemData.flags['rogue-trader'].grantedById = context.sourceItem.id;
      itemData.flags['rogue-trader'].autoGranted = true;
    }

    context.result.itemsToCreate.push(itemData);
    
    if (context.showNotification) {
      context.result.notifications.push(`Talent: ${talentGrant.name}`);
    }

    // Recursive processing for granted talent's grants (immediate mode only)
    if (context.mode === GRANT_MODE.IMMEDIATE && talentItem.system?.hasGrants) {
      const nestedContext = new GrantContext(context.actor, {
        mode: context.mode,
        depth: context.depth + 1,
        maxDepth: context.maxDepth,
        dryRun: context.dryRun,
        showNotification: false,  // Suppress nested notifications
        sourceItem: talentItem
      });
      
      await this._processItemGrants(talentItem, nestedContext);
      
      // Merge nested results into parent context
      this._mergeResults(context.result, nestedContext.result);
    }
  }

  /**
   * Create a basic talent item when full data is unavailable.
   * @private
   */
  static _createBasicTalent(talentGrant, context) {
    const itemData = {
      type: "talent",
      name: talentGrant.name,
      system: {
        specialization: talentGrant.specialization || ""
      }
    };
    
    context.result.itemsToCreate.push(itemData);
    
    if (context.showNotification) {
      context.result.notifications.push(`Talent: ${talentGrant.name} (basic)`);
    }
  }

  /**
   * Process a single trait grant.
   * @private
   */
  static async _processTraitGrant(traitGrant, context) {
    // Check for duplicates (stackable traits can increase level)
    const existing = context.actor?.items?.find(i =>
      i.type === 'trait' &&
      i.name === traitGrant.name
    );

    if (existing && existing.system.stackable && traitGrant.level != null) {
      // Increase stackable trait level
      const newLevel = (existing.system.level || 1) + (traitGrant.level || 1);
      context.result.skillUpdates[`items.${existing.id}.system.level`] = newLevel;
      game.rt?.log(`Increased trait ${traitGrant.name} level to ${newLevel}`);
      return;
    } else if (existing) {
      game.rt?.log(`Trait ${traitGrant.name} already exists, skipping grant`);
      return;
    }

    // Fetch trait from UUID or compendium
    let traitItem = null;
    if (traitGrant.uuid) {
      try {
        traitItem = await fromUuid(traitGrant.uuid);
      } catch (err) {
        console.error(`Error loading trait ${traitGrant.uuid}:`, err);
      }
    }

    if (!traitItem) {
      traitItem = await this._findInCompendium('rogue-trader.rt-items-traits', traitGrant.name);
    }

    if (!traitItem) {
      console.warn(`Could not find trait: ${traitGrant.name}`);
      this._createBasicTrait(traitGrant, context);
      return;
    }

    // Clone item data
    const itemData = traitItem.toObject();
    if (traitGrant.level != null) {
      itemData.system.level = traitGrant.level;
    }

    // Mark as granted
    itemData.flags = itemData.flags || {};
    itemData.flags['rogue-trader'] = itemData.flags['rogue-trader'] || {};
    if (context.sourceItem) {
      itemData.flags['rogue-trader'].grantedBy = context.sourceItem.name;
      itemData.flags['rogue-trader'].grantedById = context.sourceItem.id;
      itemData.flags['rogue-trader'].autoGranted = true;
    }

    context.result.itemsToCreate.push(itemData);
    
    if (context.showNotification) {
      context.result.notifications.push(`Trait: ${traitGrant.name}`);
    }
  }

  /**
   * Create a basic trait item when full data is unavailable.
   * @private
   */
  static _createBasicTrait(traitGrant, context) {
    const itemData = {
      type: "trait",
      name: traitGrant.name,
      system: {
        level: traitGrant.level || null
      }
    };
    
    context.result.itemsToCreate.push(itemData);
    
    if (context.showNotification) {
      context.result.notifications.push(`Trait: ${traitGrant.name} (basic)`);
    }
  }

  /**
   * Process a single equipment grant.
   * @private
   */
  static async _processEquipmentGrant(equipGrant, context) {
    if (!equipGrant.uuid) {
      console.warn(`Equipment grant "${equipGrant.name}" has no UUID - cannot create item.`);
      return;
    }

    try {
      const doc = await fromUuid(equipGrant.uuid);
      if (doc) {
        const itemData = doc.toObject();
        if (equipGrant.quantity && equipGrant.quantity > 1) {
          itemData.system.quantity = equipGrant.quantity;
        }
        context.result.itemsToCreate.push(itemData);
        
        if (context.showNotification) {
          context.result.notifications.push(`Equipment: ${equipGrant.name}`);
        }
      } else {
        console.warn(`Could not find equipment with UUID: ${equipGrant.uuid}`);
      }
    } catch (err) {
      console.error(`Error fetching equipment ${equipGrant.uuid}:`, err);
    }
  }

  /**
   * Process a special ability grant.
   * @private
   */
  static async _processSpecialAbilityGrant(abilityGrant, context) {
    // Special abilities are descriptive text, not items
    // They could be stored as journal entries or just logged
    game.rt?.log(`Special ability granted: ${abilityGrant.name || abilityGrant}`);
    
    if (context.showNotification) {
      context.result.notifications.push(`Special Ability: ${abilityGrant.name || abilityGrant}`);
    }
  }

  /* -------------------------------------------- */
  /*  Application Methods                         */
  /* -------------------------------------------- */

  /**
   * Apply grants immediately (talent/trait mode).
   * @private
   */
  static async _applyGrantsImmediate(context) {
    // Create items
    const itemsToAdd = context.result.itemsToCreate.filter(i => !i._upgradeExisting);
    if (itemsToAdd.length > 0) {
      await context.actor.createEmbeddedDocuments('Item', itemsToAdd);
    }

    // Apply skill upgrades
    const upgrades = context.result.itemsToCreate.filter(i => i._upgradeExisting);
    for (const upgrade of upgrades) {
      const existingSkill = context.actor.items.get(upgrade._existingId);
      if (existingSkill) {
        const skillUpdates = {};
        if (upgrade.system.trained) skillUpdates["system.trained"] = true;
        if (upgrade.system.plus10) skillUpdates["system.plus10"] = true;
        if (upgrade.system.plus20) skillUpdates["system.plus20"] = true;
        if (Object.keys(skillUpdates).length > 0) {
          await existingSkill.update(skillUpdates);
        }
      }
    }

    // Apply other skill updates
    if (Object.keys(context.result.skillUpdates).length > 0) {
      await context.actor.update(context.result.skillUpdates);
    }

    // Show notification (only at depth 0)
    if (context.depth === 0 && context.showNotification && context.result.notifications.length > 0) {
      const sourceItemName = context.sourceItem?.name || "Item";
      const message = `<strong>${sourceItemName}</strong> granted:<br/>• ${context.result.notifications.join('<br/>• ')}`;
      ui.notifications.info(message, { permanent: false });
    }
  }

  /* -------------------------------------------- */
  /*  Formula Evaluation                          */
  /* -------------------------------------------- */

  /**
   * Evaluate wounds formula with optional stored roll.
   * @private
   */
  static async _evaluateWounds(formula, actor, originItem) {
    const storedRoll = originItem.system?.rollResults?.wounds;

    if (storedRoll?.rolled !== null && storedRoll?.rolled !== undefined) {
      game.rt?.log(`Using stored wounds roll: ${storedRoll.rolled} (${storedRoll.breakdown})`);
      return storedRoll.rolled;
    }

    const evaluated = evaluateWoundsFormula(formula, actor);
    game.rt?.log(`Evaluated wounds formula "${formula}": ${evaluated}`);
    return evaluated;
  }

  /**
   * Evaluate fate formula with optional stored roll.
   * @private
   */
  static async _evaluateFate(formula, originItem) {
    const storedRoll = originItem.system?.rollResults?.fate;

    if (storedRoll?.rolled !== null && storedRoll?.rolled !== undefined) {
      game.rt?.log(`Using stored fate roll: ${storedRoll.rolled} (${storedRoll.breakdown})`);
      return storedRoll.rolled;
    }

    const evaluated = evaluateFateFormula(formula);
    game.rt?.log(`Evaluated fate formula "${formula}": ${evaluated}`);
    return evaluated;
  }

  /**
   * Evaluate a dice formula like "1d5" or "2d10".
   * @private
   */
  static async _evaluateDiceFormula(formula) {
    try {
      const roll = new Roll(formula);
      await roll.evaluate();
      return roll.total;
    } catch (err) {
      console.error(`Error evaluating dice formula "${formula}":`, err);
      const parsed = parseInt(formula);
      return isNaN(parsed) ? 0 : parsed;
    }
  }

  /* -------------------------------------------- */
  /*  Utility Methods                             */
  /* -------------------------------------------- */

  /**
   * Find an item in a compendium pack by name.
   * @private
   */
  static async _findInCompendium(packId, itemName) {
    const pack = game.packs.get(packId);
    if (!pack) {
      console.error(`Compendium pack not found: ${packId}`);
      return null;
    }

    const index = await pack.getIndex({ fields: ['name'] });
    const entry = index.find(i => i.name === itemName);
    if (entry) {
      return await pack.getDocument(entry._id);
    }

    return null;
  }

  /**
   * Merge nested result into parent result.
   * @private
   */
  static _mergeResults(parent, child) {
    // Merge characteristics
    for (const [char, value] of Object.entries(child.characteristics)) {
      parent.characteristics[char] = (parent.characteristics[char] || 0) + value;
    }

    // Merge items
    parent.itemsToCreate.push(...child.itemsToCreate);

    // Merge skill updates
    Object.assign(parent.skillUpdates, child.skillUpdates);

    // Merge bonuses
    parent.woundsBonus += child.woundsBonus;
    parent.fateBonus += child.fateBonus;
    parent.corruptionBonus += child.corruptionBonus;
    parent.insanityBonus += child.insanityBonus;

    // Merge aptitudes
    parent.aptitudes.push(...child.aptitudes);

    // Merge notifications
    parent.notifications.push(...child.notifications);
  }
}

/**
 * Handle removal of an item that granted other items.
 * Prompts user to optionally remove granted items.
 * 
 * @param {RogueTraderItem} item - The item being removed (talent/trait)
 * @param {RogueTraderActor} actor - The actor losing the item
 * @returns {Promise<void>}
 */
export async function handleGrantRemoval(item, actor) {
  if (!item || !actor) return;
  if (item.type !== 'talent' && item.type !== 'trait') return;
  if (item.type === 'talent' && !item.system?.hasGrants) return;

  // Find all items granted by this item
  const grantedItems = actor.items.filter(i =>
    i.flags['rogue-trader']?.grantedById === item.id
  );

  if (grantedItems.length === 0) return;

  // Ask user if they want to remove granted items
  const itemNames = grantedItems.map(i => i.name).join(', ');
  const content = `
    <p><strong>${item.name}</strong> granted the following abilities:</p>
    <p style="margin-left: 1em; color: #c9a227;">${itemNames}</p>
    <p>Do you want to remove these granted abilities as well?</p>
  `;

  const remove = await Dialog.confirm({
    title: 'Remove Granted Abilities?',
    content: content,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });

  if (remove) {
    const ids = grantedItems.map(i => i.id);
    await actor.deleteEmbeddedDocuments('Item', ids);
    ui.notifications.info(`Removed ${grantedItems.length} granted abilities from ${item.name}`);
  }
}
