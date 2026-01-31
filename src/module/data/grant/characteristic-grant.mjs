import BaseGrantData from "./base-grant.mjs";

/**
 * Grant that provides characteristic bonuses to an actor.
 * Modifies characteristic advance values.
 * 
 * @extends BaseGrantData
 */
export default class CharacteristicGrantData extends BaseGrantData {

  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static TYPE = "characteristic";
  static ICON = "icons/svg/dice-target.svg";

  /**
   * Valid characteristic keys.
   * @type {Set<string>}
   */
  static VALID_CHARACTERISTICS = new Set([
    "weaponSkill", "ballisticSkill", "strength", "toughness",
    "agility", "intelligence", "perception", "willpower", "fellowship"
  ]);

  /* -------------------------------------------- */
  /*  Schema Definition                           */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      // Characteristics to modify
      characteristics: new fields.ArrayField(
        new fields.SchemaField({
          // Characteristic key
          key: new fields.StringField({ required: true }),
          // Value to add (positive or negative)
          value: new fields.NumberField({ required: true, initial: 0, integer: true }),
          // Is this optional?
          optional: new fields.BooleanField({ initial: false })
        }),
        { required: true, initial: [] }
      ),
      
      // Applied state - tracks what was granted
      // Format: { "characteristicKey": { previousValue, appliedValue } }
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

    const selectedChars = data.selected ?? this.characteristics.map(c => c.key);
    const updates = {};

    for (const charConfig of this.characteristics) {
      const { key, value, optional: charOptional } = charConfig;

      // Validate characteristic
      if (!this.constructor.VALID_CHARACTERISTICS.has(key)) {
        result.errors.push(`Invalid characteristic: ${key}`);
        continue;
      }

      // Skip if not selected
      if (!selectedChars.includes(key)) {
        if (!charOptional && !this.optional) {
          result.errors.push(`Required characteristic ${key} not selected`);
        }
        continue;
      }

      // Skip zero values
      if (value === 0) continue;

      // Get current advance value
      const currentAdvance = actor.system?.characteristics?.[key]?.advance ?? 0;
      const newAdvance = currentAdvance + value;

      updates[`system.characteristics.${key}.advance`] = newAdvance;
      result.applied[key] = {
        previousValue: currentAdvance,
        appliedValue: value,
        newValue: newAdvance
      };

      const charLabel = game.i18n.localize(`RT.Characteristic.${key}`);
      const sign = value > 0 ? "+" : "";
      result.notifications.push(`${charLabel} ${sign}${value}`);
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
    const restoreData = { characteristics: {} };
    const updates = {};

    for (const [key, state] of Object.entries(appliedState)) {
      if (state.previousValue !== undefined) {
        updates[`system.characteristics.${key}.advance`] = state.previousValue;
        restoreData.characteristics[key] = state;
      }
    }

    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }

    return restoreData;
  }

  /** @inheritDoc */
  async restore(actor, restoreData) {
    // Re-apply with the original applied values
    const result = {
      success: true,
      applied: {},
      notifications: [],
      errors: []
    };

    const updates = {};
    for (const [key, state] of Object.entries(restoreData.characteristics ?? {})) {
      const currentAdvance = actor.system?.characteristics?.[key]?.advance ?? 0;
      const newAdvance = currentAdvance + state.appliedValue;
      
      updates[`system.characteristics.${key}.advance`] = newAdvance;
      result.applied[key] = {
        previousValue: currentAdvance,
        appliedValue: state.appliedValue,
        newValue: newAdvance
      };
    }

    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }

    return result;
  }

  /** @inheritDoc */
  getAutomaticValue() {
    if (this.optional) return false;
    if (this.characteristics.some(c => c.optional)) return false;
    return { selected: this.characteristics.map(c => c.key) };
  }

  /** @inheritDoc */
  async getSummary() {
    const summary = await super.getSummary();
    summary.icon = this.constructor.ICON;

    for (const charConfig of this.characteristics) {
      const label = game.i18n.localize(`RT.Characteristic.${charConfig.key}`);
      const sign = charConfig.value > 0 ? "+" : "";
      
      summary.details.push({
        label: label,
        value: `${sign}${charConfig.value}`,
        optional: charConfig.optional
      });
    }

    return summary;
  }

  /** @inheritDoc */
  validate() {
    const errors = super.validate();

    for (const charConfig of this.characteristics) {
      if (!this.constructor.VALID_CHARACTERISTICS.has(charConfig.key)) {
        errors.push(`Invalid characteristic key: ${charConfig.key}`);
      }
    }

    return errors;
  }
}
