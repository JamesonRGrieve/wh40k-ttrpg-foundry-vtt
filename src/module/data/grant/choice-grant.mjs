import BaseGrantData from "./base-grant.mjs";
import ItemGrantData from "./item-grant.mjs";
import SkillGrantData from "./skill-grant.mjs";
import CharacteristicGrantData from "./characteristic-grant.mjs";
import ResourceGrantData from "./resource-grant.mjs";

/**
 * Grant that presents choices to the player.
 * Can contain sub-grants of any type.
 * 
 * @extends BaseGrantData
 */
export default class ChoiceGrantData extends BaseGrantData {

  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static TYPE = "choice";
  static ICON = "icons/svg/clockwork.svg";

  /**
   * Registry of grant types that can be used in choices.
   * @type {object}
   */
  static GRANT_TYPES = {
    item: ItemGrantData,
    skill: SkillGrantData,
    characteristic: CharacteristicGrantData,
    resource: ResourceGrantData
  };

  /* -------------------------------------------- */
  /*  Schema Definition                           */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      // Number of choices the player must make
      count: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),
      
      // Choice options - each option can grant multiple things
      options: new fields.ArrayField(
        new fields.SchemaField({
          // Display label for this option
          label: new fields.StringField({ required: true }),
          // Description/hint
          description: new fields.StringField({ required: false, blank: true }),
          // Grants provided by this option (array of grant configs)
          grants: new fields.ArrayField(
            new fields.ObjectField({ required: true }),
            { required: true, initial: [] }
          )
        }),
        { required: true, initial: [] }
      ),
      
      // Whether options can be selected multiple times
      allowDuplicates: new fields.BooleanField({ initial: false }),
      
      // Applied state - tracks selected options and their applied grants
      // Format: { selectedOptions: ["option1", "option2"], grantResults: {...} }
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
      applied: {
        selectedOptions: [],
        grantResults: {}
      },
      notifications: [],
      errors: []
    };

    if (!actor) {
      result.success = false;
      result.errors.push("No actor provided");
      return result;
    }

    // Handle missing/undefined options gracefully
    const choiceOptions = this.options ?? [];
    if (choiceOptions.length === 0) {
      result.notifications.push("Choice grant has no options to apply");
      return result;
    }

    const selectedOptions = data.selected ?? [];

    // Validate selection count
    if (selectedOptions.length < this.count && !this.optional) {
      result.errors.push(`Must select ${this.count} options, only ${selectedOptions.length} selected`);
      result.success = false;
      return result;
    }

    // Check for duplicates
    if (!this.allowDuplicates) {
      const unique = new Set(selectedOptions);
      if (unique.size !== selectedOptions.length) {
        result.errors.push("Duplicate selections not allowed");
        result.success = false;
        return result;
      }
    }

    // Apply each selected option
    for (const optionLabel of selectedOptions) {
      const option = choiceOptions.find(o => o.label === optionLabel);
      if (!option) {
        result.errors.push(`Unknown option: ${optionLabel}`);
        continue;
      }

      result.applied.selectedOptions.push(optionLabel);
      result.notifications.push(`Selected: ${optionLabel}`);

      // Apply each grant in this option
      const grants = option.grants ?? [];
      for (let i = 0; i < grants.length; i++) {
        const grantConfig = grants[i];
        const grantKey = `${optionLabel}:${i}`;

        const grantResult = await this._applySubGrant(actor, grantConfig, data, options);
        result.applied.grantResults[grantKey] = grantResult.applied;
        
        result.notifications.push(...grantResult.notifications);
        result.errors.push(...grantResult.errors);
      }
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /** @inheritDoc */
  async reverse(actor, appliedState) {
    const restoreData = {
      selectedOptions: appliedState.selectedOptions ?? [],
      grantResults: {}
    };

    // Reverse each applied grant in reverse order
    for (const [grantKey, grantApplied] of Object.entries(appliedState.grantResults ?? {})) {
      const [optionLabel, indexStr] = grantKey.split(":");
      const index = parseInt(indexStr);
      
      const option = this.options.find(o => o.label === optionLabel);
      if (!option || !option.grants[index]) continue;

      const grantConfig = option.grants[index];
      const GrantClass = this.constructor.GRANT_TYPES[grantConfig.type];
      if (!GrantClass) continue;

      const grant = new GrantClass(grantConfig);
      const reverseData = await grant.reverse(actor, grantApplied);
      restoreData.grantResults[grantKey] = reverseData;
    }

    return restoreData;
  }

  /** @inheritDoc */
  getAutomaticValue() {
    // Choices always require user interaction
    return false;
  }

  /** @inheritDoc */
  async getSummary() {
    const summary = await super.getSummary();
    summary.icon = this.constructor.ICON;
    summary.choiceCount = this.count;
    summary.options = [];

    for (const option of this.options) {
      const optionSummary = {
        label: option.label,
        description: option.description,
        grants: []
      };

      for (const grantConfig of option.grants) {
        const GrantClass = this.constructor.GRANT_TYPES[grantConfig.type];
        if (GrantClass) {
          const grant = new GrantClass(grantConfig);
          const grantSummary = await grant.getSummary();
          optionSummary.grants.push(grantSummary);
        }
      }

      summary.options.push(optionSummary);
    }

    return summary;
  }

  /** @inheritDoc */
  validateGrant() {
    const errors = super.validateGrant();

    // Handle missing/undefined options gracefully
    const options = this.options ?? [];

    if (options.length === 0) {
      errors.push("Choice grant has no options");
    }

    if (this.count > options.length && !this.allowDuplicates) {
      errors.push(`Cannot select ${this.count} from ${options.length} options without duplicates`);
    }

    // Validate sub-grants
    for (const option of options) {
      const grants = option.grants ?? [];
      for (const grantConfig of grants) {
        const GrantClass = this.constructor.GRANT_TYPES[grantConfig.type];
        if (!GrantClass) {
          errors.push(`Unknown grant type "${grantConfig.type}" in option "${option.label}"`);
        }
      }
    }

    return errors;
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Apply a sub-grant.
   * @param {RogueTraderActor} actor 
   * @param {object} grantConfig 
   * @param {object} data 
   * @param {object} options 
   * @returns {Promise<GrantApplicationResult>}
   * @private
   */
  async _applySubGrant(actor, grantConfig, data, options) {
    const GrantClass = this.constructor.GRANT_TYPES[grantConfig.type];
    if (!GrantClass) {
      return {
        success: false,
        applied: {},
        notifications: [],
        errors: [`Unknown grant type: ${grantConfig.type}`]
      };
    }

    const grant = new GrantClass(grantConfig);
    
    // Pass through any sub-grant specific data
    const subData = data.subGrants?.[grantConfig._id] ?? {};
    
    return grant.apply(actor, subData, options);
  }
}
