import BaseGrantData from "./base-grant.mjs";

/**
 * Grant that provides resource bonuses to an actor.
 * Handles wounds, fate, corruption, insanity, etc.
 * Supports both flat values and dice formulas.
 * 
 * @extends BaseGrantData
 */
export default class ResourceGrantData extends BaseGrantData {

  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static TYPE = "resource";
  static ICON = "icons/svg/aura.svg";

  /**
   * Valid resource types and their paths.
   * @type {object}
   */
  static RESOURCES = {
    wounds: {
      label: "RT.Resource.Wounds",
      valuePath: "system.wounds.value",
      maxPath: "system.wounds.max",
      affectsMax: true
    },
    fate: {
      label: "RT.Resource.Fate",
      valuePath: "system.fate.value",
      maxPath: "system.fate.max",
      affectsMax: true
    },
    corruption: {
      label: "RT.Resource.Corruption",
      valuePath: "system.corruption.value",
      maxPath: null,
      affectsMax: false
    },
    insanity: {
      label: "RT.Resource.Insanity",
      valuePath: "system.insanity.value",
      maxPath: null,
      affectsMax: false
    }
  };

  /* -------------------------------------------- */
  /*  Schema Definition                           */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      // Resources to grant
      resources: new fields.ArrayField(
        new fields.SchemaField({
          // Resource type (wounds, fate, corruption, insanity)
          type: new fields.StringField({ 
            required: true,
            choices: Object.keys(ResourceGrantData.RESOURCES)
          }),
          // Formula or flat value (e.g., "1d5+2", "5", "2xTB")
          formula: new fields.StringField({ required: true }),
          // Is this optional?
          optional: new fields.BooleanField({ initial: false })
        }),
        { required: true, initial: [] }
      ),
      
      // Applied state - tracks what was granted
      // Format: { "resourceType": { formula, rolledValue, previousValue } }
      applied: new fields.ObjectField({ required: true, initial: {} })
    };
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

    const updates = {};
    const selectedResources = data.selected ?? this.resources.map(r => r.type);
    // Pre-rolled values from dialog
    const rolledValues = data.rolledValues ?? {};

    for (const resourceConfig of this.resources) {
      const { type, formula, optional: resOptional } = resourceConfig;

      // Validate resource type
      const resourceDef = this.constructor.RESOURCES[type];
      if (!resourceDef) {
        result.errors.push(`Invalid resource type: ${type}`);
        continue;
      }

      // Skip if not selected
      if (!selectedResources.includes(type)) {
        if (!resOptional && !this.optional) {
          result.errors.push(`Required resource ${type} not selected`);
        }
        continue;
      }

      // Get value - either pre-rolled or evaluate now
      let value = rolledValues[type];
      if (value === undefined) {
        value = await this._evaluateFormula(formula, actor);
      }

      if (value === 0) continue;

      // Get current values
      const currentValue = foundry.utils.getProperty(actor, resourceDef.valuePath) ?? 0;

      // Apply to value path
      updates[resourceDef.valuePath] = currentValue + value;

      // Also apply to max if applicable
      if (resourceDef.affectsMax && resourceDef.maxPath) {
        const currentMax = foundry.utils.getProperty(actor, resourceDef.maxPath) ?? 0;
        updates[resourceDef.maxPath] = currentMax + value;
      }

      result.applied[type] = {
        formula,
        rolledValue: value,
        previousValue: currentValue
      };

      const label = game.i18n.localize(resourceDef.label);
      const sign = value > 0 ? "+" : "";
      result.notifications.push(`${label} ${sign}${value}`);
    }

    // Apply if not dry run
    if (!options.dryRun && Object.keys(updates).length > 0) {
      await actor.update(updates);
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /** @inheritDoc */
  async reverse(actor, appliedState) {
    const restoreData = { resources: {} };
    const updates = {};

    for (const [type, state] of Object.entries(appliedState)) {
      const resourceDef = this.constructor.RESOURCES[type];
      if (!resourceDef) continue;

      const currentValue = foundry.utils.getProperty(actor, resourceDef.valuePath) ?? 0;
      updates[resourceDef.valuePath] = currentValue - state.rolledValue;

      if (resourceDef.affectsMax && resourceDef.maxPath) {
        const currentMax = foundry.utils.getProperty(actor, resourceDef.maxPath) ?? 0;
        updates[resourceDef.maxPath] = currentMax - state.rolledValue;
      }

      restoreData.resources[type] = state;
    }

    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
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

    const updates = {};

    for (const [type, state] of Object.entries(restoreData.resources ?? {})) {
      const resourceDef = this.constructor.RESOURCES[type];
      if (!resourceDef) continue;

      const currentValue = foundry.utils.getProperty(actor, resourceDef.valuePath) ?? 0;
      updates[resourceDef.valuePath] = currentValue + state.rolledValue;

      if (resourceDef.affectsMax && resourceDef.maxPath) {
        const currentMax = foundry.utils.getProperty(actor, resourceDef.maxPath) ?? 0;
        updates[resourceDef.maxPath] = currentMax + state.rolledValue;
      }

      result.applied[type] = state;
    }

    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }

    return result;
  }

  /** @inheritDoc */
  getAutomaticValue() {
    // Resources with formulas typically need user confirmation
    // Only auto-apply if all are flat values
    if (this.optional) return false;
    
    for (const resource of this.resources) {
      if (resource.optional) return false;
      // Check if formula contains dice or variables
      if (/[dD]|TB|WP|AG/i.test(resource.formula)) return false;
    }

    return { selected: this.resources.map(r => r.type) };
  }

  /** @inheritDoc */
  async getSummary() {
    const summary = await super.getSummary();
    summary.icon = this.constructor.ICON;

    for (const resourceConfig of this.resources) {
      const resourceDef = this.constructor.RESOURCES[resourceConfig.type];
      const label = resourceDef 
        ? game.i18n.localize(resourceDef.label)
        : resourceConfig.type;

      summary.details.push({
        label: label,
        value: resourceConfig.formula,
        optional: resourceConfig.optional
      });
    }

    return summary;
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Evaluate a resource formula.
   * @param {string} formula - The formula to evaluate
   * @param {RogueTraderActor} actor - The actor for context
   * @returns {Promise<number>}
   * @private
   */
  async _evaluateFormula(formula, actor) {
    if (!formula) return 0;

    // Handle flat numbers
    const flat = parseInt(formula);
    if (!isNaN(flat) && String(flat) === formula.trim()) {
      return flat;
    }

    // Handle lookup table format: "(1-4|=2),(5-7|=3),(8-10|=4)"
    // This is a d10 roll table - roll and lookup the result
    if (formula.includes("|=")) {
      return this._evaluateLookupTable(formula);
    }

    // Replace characteristic references
    let processedFormula = formula;
    
    // Replace TB, WPB, etc. with actual bonus values
    const charAbbreviations = {
      TB: "toughness",
      SB: "strength",
      AB: "agility",
      WPB: "willpower",
      FB: "fellowship",
      IB: "intelligence",
      PB: "perception",
      WSB: "weaponSkill",
      BSB: "ballisticSkill"
    };

    for (const [abbr, charKey] of Object.entries(charAbbreviations)) {
      const regex = new RegExp(`(\\d*)x?${abbr}`, "gi");
      processedFormula = processedFormula.replace(regex, (match, multiplier) => {
        const bonus = actor.system?.characteristics?.[charKey]?.bonus ?? 0;
        const mult = parseInt(multiplier) || 1;
        return String(bonus * mult);
      });
    }

    // Evaluate dice formula
    try {
      const roll = await new Roll(processedFormula).evaluate();
      return roll.total;
    } catch (err) {
      console.error(`ResourceGrantData: Failed to evaluate formula "${formula}":`, err);
      return 0;
    }
  }

  /**
   * Evaluate a lookup table formula like "(1-4|=2),(5-7|=3),(8-10|=4)".
   * Rolls 1d10 and returns the value for the matching range.
   * @param {string} formula - Lookup table formula
   * @returns {Promise<number>}
   * @private
   */
  async _evaluateLookupTable(formula) {
    // Parse entries: "(1-4|=2),(5-7|=3),(8-10|=4)"
    const entries = [];
    const entryPattern = /\((\d+)-(\d+)\|=(\d+)\)/g;
    let match;
    
    while ((match = entryPattern.exec(formula)) !== null) {
      entries.push({
        min: parseInt(match[1]),
        max: parseInt(match[2]),
        value: parseInt(match[3])
      });
    }

    if (entries.length === 0) {
      console.warn(`ResourceGrantData: Could not parse lookup table: ${formula}`);
      return 0;
    }

    // Roll 1d10
    const roll = await new Roll("1d10").evaluate();
    const rolled = roll.total;

    // Find matching entry
    for (const entry of entries) {
      if (rolled >= entry.min && rolled <= entry.max) {
        game.rt?.log(`ResourceGrantData: Rolled ${rolled} on lookup table, result: ${entry.value}`);
        return entry.value;
      }
    }

    // No match - return first entry as fallback
    console.warn(`ResourceGrantData: Roll ${rolled} didn't match any range in: ${formula}`);
    return entries[0]?.value ?? 0;
  }
}
