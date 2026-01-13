/**
 * Origin Grants Processor
 *
 * Centralized processor for origin path grants.
 * Handles both base grants and choice grants identically.
 *
 * This is the critical utility that makes choice grants work!
 */

import { evaluateWoundsFormula, evaluateFateFormula } from "./formula-evaluator.mjs";

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
    const result = {
      characteristics: {},
      itemsToCreate: [],
      woundsBonus: 0,
      fateBonus: 0,
      corruptionBonus: 0,
      insanityBonus: 0
    };

    // 1. Process base modifiers (from modifiers template)
    await this._processCharacteristicModifiers(originItem, result);

    // 2. Process base grants (always applied)
    await this._processBaseGrants(originItem, result, actor);

    // 3. Process selected choice grants (THE CRITICAL NEW FUNCTIONALITY!)
    await this._processChoiceGrants(originItem, result, actor);

    return result;
  }

  /* -------------------------------------------- */
  /*  Base Grants Processing                      */
  /* -------------------------------------------- */

  /**
   * Process characteristic modifiers from the modifiers template.
   * @private
   */
  static async _processCharacteristicModifiers(originItem, result) {
    const charMods = originItem.system?.modifiers?.characteristics || {};
    for (const [char, value] of Object.entries(charMods)) {
      if (value !== 0) {
        result.characteristics[char] = (result.characteristics[char] || 0) + value;
      }
    }
  }

  /**
   * Process base grants (always applied when origin is on character).
   * @private
   */
  static async _processBaseGrants(originItem, result, actor) {
    const grants = originItem.system?.grants || {};

    // Wounds - prefer formula over legacy field
    if (grants.woundsFormula) {
      result.woundsBonus += await this._evaluateWounds(grants.woundsFormula, actor, originItem);
    } else if (grants.wounds && grants.wounds !== 0) {
      result.woundsBonus += grants.wounds;
      console.warn(`Origin "${originItem.name}" uses legacy grants.wounds field (${grants.wounds}). Consider migrating to woundsFormula.`);
    }

    // Fate - prefer formula over legacy field
    if (grants.fateFormula) {
      result.fateBonus += await this._evaluateFate(grants.fateFormula, originItem);
    } else if (grants.fateThreshold && grants.fateThreshold !== 0) {
      result.fateBonus += grants.fateThreshold;
      console.warn(`Origin "${originItem.name}" uses legacy grants.fateThreshold field (${grants.fateThreshold}). Consider migrating to fateFormula.`);
    }

    // Skills
    if (grants.skills) {
      for (const skillGrant of grants.skills) {
        await this._processSkillGrant(skillGrant, result, actor);
      }
    }

    // Talents
    if (grants.talents) {
      for (const talentGrant of grants.talents) {
        await this._processTalentGrant(talentGrant, result);
      }
    }

    // Traits
    if (grants.traits) {
      for (const traitGrant of grants.traits) {
        await this._processTraitGrant(traitGrant, result);
      }
    }

    // Equipment
    if (grants.equipment) {
      for (const equipGrant of grants.equipment) {
        await this._processEquipmentGrant(equipGrant, result);
      }
    }

    // Aptitudes (tracked but not created as items)
    // These are handled separately in character advancement
  }

  /* -------------------------------------------- */
  /*  Choice Grants Processing                    */
  /* -------------------------------------------- */

  /**
   * Process choice grants (from selectedChoices).
   * THIS IS THE CRITICAL NEW FUNCTIONALITY!
   *
   * Iterates through all choices, finds selected options,
   * and processes their grants EXACTLY like base grants.
   *
   * @private
   */
  static async _processChoiceGrants(originItem, result, actor) {
    const choices = originItem.system?.grants?.choices || [];
    const selectedChoices = originItem.system?.selectedChoices || {};

    for (const choice of choices) {
      const selected = selectedChoices[choice.label] || [];

      for (const selectedValue of selected) {
        // Find the option object
        const option = choice.options.find(opt => opt.value === selectedValue);
        if (!option?.grants) {
          console.warn(`Origin "${originItem.name}" choice "${choice.label}" has selection "${selectedValue}" but no grants found.`);
          continue;
        }

        // Process option's grants EXACTLY like base grants
        const optionGrants = option.grants;

        // Characteristics from choice
        if (optionGrants.characteristics) {
          for (const [char, value] of Object.entries(optionGrants.characteristics)) {
            if (value !== 0) {
              result.characteristics[char] = (result.characteristics[char] || 0) + value;
              game.rt?.log(`Origin choice "${choice.label}" grants ${value >= 0 ? '+' : ''}${value} ${char}`);
            }
          }
        }

        // Skills from choice
        if (optionGrants.skills) {
          for (const skillGrant of optionGrants.skills) {
            await this._processSkillGrant(skillGrant, result, actor);
            game.rt?.log(`Origin choice "${choice.label}" grants skill: ${skillGrant.name}`);
          }
        }

        // Talents from choice
        if (optionGrants.talents) {
          for (const talentGrant of optionGrants.talents) {
            await this._processTalentGrant(talentGrant, result);
            game.rt?.log(`Origin choice "${choice.label}" grants talent: ${talentGrant.name}`);
          }
        }

        // Traits from choice
        if (optionGrants.traits) {
          for (const traitGrant of optionGrants.traits) {
            await this._processTraitGrant(traitGrant, result);
            game.rt?.log(`Origin choice "${choice.label}" grants trait: ${traitGrant.name}`);
          }
        }

        // Equipment from choice
        if (optionGrants.equipment) {
          for (const equipGrant of optionGrants.equipment) {
            await this._processEquipmentGrant(equipGrant, result);
            game.rt?.log(`Origin choice "${choice.label}" grants equipment: ${equipGrant.name}`);
          }
        }

        // Corruption from choice (supports dice formulas like "1d5")
        if (optionGrants.corruption) {
          const corruptionValue = await this._evaluateDiceFormula(optionGrants.corruption);
          result.corruptionBonus = (result.corruptionBonus || 0) + corruptionValue;
          game.rt?.log(`Origin choice "${choice.label}" grants ${corruptionValue} corruption`);
        }

        // Insanity from choice (supports dice formulas like "1d5")
        if (optionGrants.insanity) {
          const insanityValue = await this._evaluateDiceFormula(optionGrants.insanity);
          result.insanityBonus = (result.insanityBonus || 0) + insanityValue;
          game.rt?.log(`Origin choice "${choice.label}" grants ${insanityValue} insanity`);
        }
      }
    }
  }

  /* -------------------------------------------- */
  /*  Individual Grant Type Processors            */
  /* -------------------------------------------- */

  /**
   * Process a single skill grant.
   * @private
   */
  static async _processSkillGrant(skillGrant, result, actor) {
    // Check if skill already exists on actor
    const existingSkill = actor?.items?.find(i =>
      i.type === "skill" &&
      i.name.toLowerCase() === skillGrant.name.toLowerCase() &&
      (!skillGrant.specialization || i.system?.specialization === skillGrant.specialization)
    );

    if (existingSkill) {
      // Skill exists - we'll upgrade it in the commit phase
      // For now, just note that we need to upgrade
      result.itemsToCreate.push({
        _upgradeExisting: true,
        _existingId: existingSkill.id,
        type: "skill",
        name: skillGrant.name,
        system: {
          specialization: skillGrant.specialization || "",
          trained: skillGrant.level === "trained" || skillGrant.level === "plus10" || skillGrant.level === "plus20",
          plus10: skillGrant.level === "plus10" || skillGrant.level === "plus20",
          plus20: skillGrant.level === "plus20"
        }
      });
    } else {
      // Create new skill item
      result.itemsToCreate.push({
        type: "skill",
        name: skillGrant.name,
        system: {
          specialization: skillGrant.specialization || "",
          trained: skillGrant.level === "trained" || skillGrant.level === "plus10" || skillGrant.level === "plus20",
          plus10: skillGrant.level === "plus10" || skillGrant.level === "plus20",
          plus20: skillGrant.level === "plus20"
        }
      });
    }
  }

  /**
   * Process a single talent grant.
   * @private
   */
  static async _processTalentGrant(talentGrant, result) {
    if (talentGrant.uuid) {
      // Fetch from compendium
      try {
        const doc = await fromUuid(talentGrant.uuid);
        if (doc) {
          result.itemsToCreate.push(doc.toObject());
        } else {
          console.warn(`Could not find talent with UUID: ${talentGrant.uuid}`);
          // Fall back to creating basic item
          this._createBasicTalent(talentGrant, result);
        }
      } catch (err) {
        console.error(`Error fetching talent ${talentGrant.uuid}:`, err);
        this._createBasicTalent(talentGrant, result);
      }
    } else {
      // Create basic talent item
      this._createBasicTalent(talentGrant, result);
    }
  }

  /**
   * Create a basic talent item when UUID is not available.
   * @private
   */
  static _createBasicTalent(talentGrant, result) {
    result.itemsToCreate.push({
      type: "talent",
      name: talentGrant.name,
      system: {
        specialization: talentGrant.specialization || ""
      }
    });
  }

  /**
   * Process a single trait grant.
   * @private
   */
  static async _processTraitGrant(traitGrant, result) {
    if (traitGrant.uuid) {
      try {
        const doc = await fromUuid(traitGrant.uuid);
        if (doc) {
          const itemData = doc.toObject();
          if (traitGrant.level) {
            itemData.system.level = traitGrant.level;
          }
          result.itemsToCreate.push(itemData);
        } else {
          console.warn(`Could not find trait with UUID: ${traitGrant.uuid}`);
          this._createBasicTrait(traitGrant, result);
        }
      } catch (err) {
        console.error(`Error fetching trait ${traitGrant.uuid}:`, err);
        this._createBasicTrait(traitGrant, result);
      }
    } else {
      this._createBasicTrait(traitGrant, result);
    }
  }

  /**
   * Create a basic trait item when UUID is not available.
   * @private
   */
  static _createBasicTrait(traitGrant, result) {
    result.itemsToCreate.push({
      type: "trait",
      name: traitGrant.name,
      system: {
        level: traitGrant.level || null
      }
    });
  }

  /**
   * Process a single equipment grant.
   * @private
   */
  static async _processEquipmentGrant(equipGrant, result) {
    if (equipGrant.uuid) {
      try {
        const doc = await fromUuid(equipGrant.uuid);
        if (doc) {
          const itemData = doc.toObject();
          if (equipGrant.quantity && equipGrant.quantity > 1) {
            itemData.system.quantity = equipGrant.quantity;
          }
          result.itemsToCreate.push(itemData);
        } else {
          console.warn(`Could not find equipment with UUID: ${equipGrant.uuid}`);
        }
      } catch (err) {
        console.error(`Error fetching equipment ${equipGrant.uuid}:`, err);
      }
    } else {
      console.warn(`Equipment grant "${equipGrant.name}" has no UUID - cannot create item.`);
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

    // If already rolled and stored, use that
    if (storedRoll?.rolled !== null && storedRoll?.rolled !== undefined) {
      game.rt?.log(`Using stored wounds roll: ${storedRoll.rolled} (${storedRoll.breakdown})`);
      return storedRoll.rolled;
    }

    // Otherwise evaluate fresh
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

    // If already rolled and stored, use that
    if (storedRoll?.rolled !== null && storedRoll?.rolled !== undefined) {
      game.rt?.log(`Using stored fate roll: ${storedRoll.rolled} (${storedRoll.breakdown})`);
      return storedRoll.rolled;
    }

    // Otherwise evaluate fresh
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
      // Try to parse as integer
      const parsed = parseInt(formula);
      return isNaN(parsed) ? 0 : parsed;
    }
  }

  /* -------------------------------------------- */
  /*  Utility Methods                             */
  /* -------------------------------------------- */

  /**
   * Apply skill upgrades to existing skills.
   * Called after items are created.
   *
   * @param {Actor} actor - The character actor
   * @param {Array} itemsToCreate - Items that may need upgrading
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
    const result = await this.processOriginGrants(originItem, actor);

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
}
