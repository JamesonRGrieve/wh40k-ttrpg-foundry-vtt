import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import PhysicalItemTemplate from "../shared/physical-item-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Armour Modification items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 */
export default class ArmourModificationData extends ItemDataModel.mixin(
  DescriptionTemplate,
  PhysicalItemTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // What armour types this can be applied to
      restrictions: new fields.SchemaField({
        armourTypes: new fields.SetField(
          new fields.StringField({ required: true }),
          { required: true, initial: [] }
        )
      }),
      
      // Stat modifiers
      modifiers: new fields.SchemaField({
        armourPoints: new fields.NumberField({ required: true, initial: 0, integer: true }),
        maxAgility: new fields.NumberField({ required: true, initial: 0, integer: true }),
        weight: new fields.NumberField({ required: true, initial: 0 })
      }),
      
      // Properties added
      addedProperties: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
      // Properties removed
      removedProperties: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
      // Effect description
      effect: new fields.HTMLField({ required: false, blank: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get restrictions label.
   * @type {string}
   */
  get restrictionsLabel() {
    if ( this.restrictions.armourTypes.size ) {
      return `Types: ${Array.from(this.restrictions.armourTypes).join(", ")}`;
    }
    return game.i18n.localize("RT.Modification.NoRestrictions");
  }

  /**
   * Has any non-zero modifiers?
   * @type {boolean}
   */
  get hasModifiers() {
    const mods = this.modifiers;
    return mods.armourPoints !== 0 || mods.maxAgility !== 0 || mods.weight !== 0;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      ...PhysicalItemTemplate.prototype.chatProperties.call(this),
      this.restrictionsLabel
    ];
    
    const mods = this.modifiers;
    if ( mods.armourPoints !== 0 ) {
      props.push(`AP: ${mods.armourPoints >= 0 ? "+" : ""}${mods.armourPoints}`);
    }
    if ( mods.maxAgility !== 0 ) {
      props.push(`Max Ag: ${mods.maxAgility >= 0 ? "+" : ""}${mods.maxAgility}`);
    }
    
    if ( this.addedProperties.size ) {
      props.push(`Adds: ${Array.from(this.addedProperties).join(", ")}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      restrictions: this.restrictionsLabel
    };
  }
}
