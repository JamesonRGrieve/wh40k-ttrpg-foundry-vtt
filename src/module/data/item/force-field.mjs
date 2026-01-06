import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import PhysicalItemTemplate from "../shared/physical-item-template.mjs";
import EquippableTemplate from "../shared/equippable-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Force Field items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 */
export default class ForceFieldData extends ItemDataModel.mixin(
  DescriptionTemplate,
  PhysicalItemTemplate,
  EquippableTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Protection rating (1-100 roll threshold)
      protectionRating: new fields.NumberField({
        required: true,
        initial: 50,
        min: 0,
        max: 100,
        integer: true
      }),
      
      // Current state
      activated: new fields.BooleanField({ required: true, initial: false }),
      overloaded: new fields.BooleanField({ required: true, initial: false }),
      
      // Overload threshold (roll this or higher to overload)
      overloadThreshold: new fields.NumberField({
        required: true,
        initial: 1,
        min: 0,
        max: 100,
        integer: true
      }),
      
      // Overload duration
      overloadDuration: new fields.StringField({
        required: true,
        initial: "1d5 rounds"
      }),
      
      // Effect description
      effect: new fields.HTMLField({ required: false, blank: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  get isRollable() {
    return true;
  }

  /**
   * Get the status label.
   * @type {string}
   */
  get statusLabel() {
    if ( this.overloaded ) return game.i18n.localize("RT.ForceField.Overloaded");
    if ( this.activated ) return game.i18n.localize("RT.ForceField.Active");
    return game.i18n.localize("RT.ForceField.Inactive");
  }

  /**
   * Is the field currently providing protection?
   * @type {boolean}
   */
  get isProtecting() {
    return this.activated && !this.overloaded;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      ...PhysicalItemTemplate.prototype.chatProperties.call(this),
      `Protection: ${this.protectionRating}%`,
      `Overload: ${this.overloadThreshold}+`,
      this.statusLabel
    ];
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      protection: `${this.protectionRating}%`,
      overload: `${this.overloadThreshold}+`,
      status: this.statusLabel
    };
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Toggle activation state.
   * @returns {Promise<Item>}
   */
  async toggleActivated() {
    return this.parent?.update({ "system.activated": !this.activated });
  }

  /**
   * Set overloaded state.
   * @param {boolean} overloaded
   * @returns {Promise<Item>}
   */
  async setOverloaded(overloaded) {
    return this.parent?.update({ "system.overloaded": overloaded });
  }

  /**
   * Recover from overload.
   * @returns {Promise<Item>}
   */
  async recover() {
    return this.parent?.update({ "system.overloaded": false });
  }
}
