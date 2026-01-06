import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import ModifiersTemplate from "../shared/modifiers-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Trait items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class TraitData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ModifiersTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Level/rating (matching template.json)
      level: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Does this trait have a level/rating?
   * @type {boolean}
   */
  get hasLevel() {
    return this.level > 0;
  }

  /**
   * Get the full name including level.
   * @type {string}
   */
  get fullName() {
    let name = this.parent?.name ?? "";
    if ( this.hasLevel ) {
      name += ` (${this.level})`;
    }
    return name;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [];
    
    if ( this.hasLevel ) {
      props.push(`Level: ${this.level}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      level: this.hasLevel ? this.level : "-"
    };
  }
}
