import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Vehicle Upgrade items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class VehicleUpgradeData extends ItemDataModel.mixin(
  DescriptionTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Availability
      availability: new fields.StringField({
        required: true,
        initial: "common"
      }),
      
      // Effect description
      effect: new fields.HTMLField({ required: true, blank: true }),
      
      // Stat modifiers
      modifiers: new fields.SchemaField({
        speed: new fields.NumberField({ required: true, initial: 0, integer: true }),
        manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
        armour: new fields.NumberField({ required: true, initial: 0, integer: true }),
        integrity: new fields.NumberField({ required: true, initial: 0, integer: true })
      }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Has any non-zero modifiers?
   * @type {boolean}
   */
  get hasModifiers() {
    return Object.values(this.modifiers).some(v => v !== 0);
  }

  /**
   * Get modifiers as a formatted list.
   * @type {object[]}
   */
  get modifiersList() {
    const list = [];
    for ( const [key, value] of Object.entries(this.modifiers) ) {
      if ( value !== 0 ) {
        list.push({
          key,
          label: game.i18n.localize(`RT.VehicleStat.${key.capitalize()}`),
          value
        });
      }
    }
    return list;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      game.i18n.localize(`RT.Availability.${this.availability.capitalize()}`)
    ];
    
    for ( const mod of this.modifiersList ) {
      props.push(`${mod.label}: ${mod.value >= 0 ? "+" : ""}${mod.value}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      availability: this.availability
    };
  }
}
