import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Vehicle Trait items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class VehicleTraitData extends ItemDataModel.mixin(
  DescriptionTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Does this trait have a level?
      hasLevel: new fields.BooleanField({ required: true, initial: false }),
      level: new fields.NumberField({ required: false, initial: null, min: 0, integer: true }),
      
      // Effect description
      effect: new fields.HTMLField({ required: true, blank: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the full name including level.
   * @type {string}
   */
  get fullName() {
    let name = this.parent?.name ?? "";
    if ( this.hasLevel && this.level !== null ) {
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
    if ( this.hasLevel && this.level !== null ) {
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
