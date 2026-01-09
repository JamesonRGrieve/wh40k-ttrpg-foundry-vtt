import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import ModifiersTemplate from "../shared/modifiers-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Condition items (status effects).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class ConditionData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ModifiersTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Is this a beneficial or harmful condition?
      nature: new fields.StringField({
        required: true,
        initial: "harmful",
        choices: ["beneficial", "harmful", "neutral"]
      }),
      
      // Effect description
      effect: new fields.HTMLField({ required: true, blank: true }),
      
      // How to remove the condition
      removal: new fields.HTMLField({ required: false, blank: true }),
      
      // Is this stackable?
      stackable: new fields.BooleanField({ required: true, initial: false }),
      stacks: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),
      
      // Who does it apply to?
      appliesTo: new fields.StringField({
        required: true,
        initial: "self",
        choices: ["self", "target", "both", "area"]
      }),
      
      // Duration tracking
      duration: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        units: new fields.StringField({
          required: true,
          initial: "permanent",
          choices: ["rounds", "minutes", "hours", "days", "permanent"]
        })
      }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the nature label with safe fallback.
   * @type {string}
   */
  get natureLabel() {
    const key = `RT.Condition.Nature.${this.nature.capitalize()}`;
    return game.i18n.has(key) ? game.i18n.localize(key) : this.nature.capitalize();
  }

  /**
   * Get the nature icon class.
   * @type {string}
   */
  get natureIcon() {
    const icons = {
      beneficial: "fa-plus-circle",
      harmful: "fa-exclamation-triangle",
      neutral: "fa-info-circle"
    };
    return icons[this.nature] || "fa-question-circle";
  }

  /**
   * Get the nature CSS class.
   * @type {string}
   */
  get natureClass() {
    return `nature-${this.nature}`;
  }

  /**
   * Get the appliesTo label with safe fallback.
   * @type {string}
   */
  get appliesToLabel() {
    const key = `RT.Condition.AppliesTo.${this.appliesTo.capitalize()}`;
    return game.i18n.has(key) ? game.i18n.localize(key) : this.appliesTo.capitalize();
  }

  /**
   * Get the appliesTo icon class.
   * @type {string}
   */
  get appliesToIcon() {
    const icons = {
      self: "fa-user",
      target: "fa-crosshairs",
      both: "fa-users",
      area: "fa-circle-notch"
    };
    return icons[this.appliesTo] || "fa-question";
  }

  /**
   * Get the full name with stacks.
   * @type {string}
   */
  get fullName() {
    let name = this.parent?.name ?? "";
    if ( this.stackable && this.stacks > 1 ) {
      name += ` (×${this.stacks})`;
    }
    return name;
  }

  /**
   * Get the duration display string.
   * @type {string}
   */
  get durationDisplay() {
    if ( this.duration.units === "permanent" ) {
      const key = "RT.Condition.Duration.Permanent";
      return game.i18n.has(key) ? game.i18n.localize(key) : "Permanent";
    }
    const unitKey = `RT.Condition.Duration.${this.duration.units.capitalize()}`;
    const unit = game.i18n.has(unitKey) ? game.i18n.localize(unitKey) : this.duration.units;
    return `${this.duration.value} ${unit}`;
  }

  /**
   * Is this condition temporary?
   * @type {boolean}
   */
  get isTemporary() {
    return this.duration.units !== "permanent";
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      this.natureLabel,
      this.appliesToLabel
    ];
    
    if ( this.stackable ) {
      const stacksKey = "RT.Condition.Stacks.Label";
      const stacksLabel = game.i18n.has(stacksKey) ? game.i18n.localize(stacksKey) : "Stacks";
      props.push(`${stacksLabel}: ${this.stacks}`);
    }
    
    if ( this.isTemporary ) {
      const durationKey = "RT.Condition.Duration.Label";
      const durationLabel = game.i18n.has(durationKey) ? game.i18n.localize(durationKey) : "Duration";
      props.push(`${durationLabel}: ${this.durationDisplay}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      nature: this.natureLabel,
      stacks: this.stackable ? this.stacks : "-",
      duration: this.durationDisplay
    };
  }
}
