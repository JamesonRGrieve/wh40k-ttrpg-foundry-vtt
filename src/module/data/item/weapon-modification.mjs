import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import PhysicalItemTemplate from "../shared/physical-item-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Weapon Modification items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 */
export default class WeaponModificationData extends ItemDataModel.mixin(
  DescriptionTemplate,
  PhysicalItemTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // What weapon classes/types this can be applied to
      restrictions: new fields.SchemaField({
        weaponClasses: new fields.SetField(
          new fields.StringField({ required: true }),
          { required: true, initial: new Set() }
        ),
        weaponTypes: new fields.SetField(
          new fields.StringField({ required: true }),
          { required: true, initial: new Set() }
        )
      }),
      
      // Stat modifiers
      modifiers: new fields.SchemaField({
        damage: new fields.NumberField({ required: true, initial: 0, integer: true }),
        penetration: new fields.NumberField({ required: true, initial: 0, integer: true }),
        range: new fields.NumberField({ required: true, initial: 0, integer: true }),
        rangeMultiplier: new fields.NumberField({ required: true, initial: 1, min: 0 }),
        clip: new fields.NumberField({ required: true, initial: 0, integer: true }),
        toHit: new fields.NumberField({ required: true, initial: 0, integer: true }),
        weight: new fields.NumberField({ required: true, initial: 0 }),
        rateOfFire: new fields.SchemaField({
          single: new fields.NumberField({ required: true, initial: 0, integer: true }),
          semi: new fields.NumberField({ required: true, initial: 0, integer: true }),
          full: new fields.NumberField({ required: true, initial: 0, integer: true })
        })
      }),
      
      // Qualities added
      addedQualities: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: new Set() }
      ),
      
      // Qualities removed
      removedQualities: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: new Set() }
      ),
      
      // Effect description
      effect: new fields.HTMLField({ required: false }),
      
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
    const parts = [];
    if ( this.restrictions.weaponClasses.size ) {
      parts.push(`Classes: ${Array.from(this.restrictions.weaponClasses).join(", ")}`);
    }
    if ( this.restrictions.weaponTypes.size ) {
      parts.push(`Types: ${Array.from(this.restrictions.weaponTypes).join(", ")}`);
    }
    return parts.join("; ") || game.i18n.localize("RT.Modification.NoRestrictions");
  }

  /**
   * Has any non-zero modifiers?
   * @type {boolean}
   */
  get hasModifiers() {
    const mods = this.modifiers;
    if ( mods.damage !== 0 ) return true;
    if ( mods.penetration !== 0 ) return true;
    if ( mods.range !== 0 ) return true;
    if ( mods.rangeMultiplier !== 1 ) return true;
    if ( mods.clip !== 0 ) return true;
    if ( mods.toHit !== 0 ) return true;
    if ( mods.weight !== 0 ) return true;
    if ( Object.values(mods.rateOfFire).some(v => v !== 0) ) return true;
    return false;
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
    if ( mods.damage !== 0 ) props.push(`Damage: ${mods.damage >= 0 ? "+" : ""}${mods.damage}`);
    if ( mods.penetration !== 0 ) props.push(`Pen: ${mods.penetration >= 0 ? "+" : ""}${mods.penetration}`);
    if ( mods.toHit !== 0 ) props.push(`To Hit: ${mods.toHit >= 0 ? "+" : ""}${mods.toHit}`);
    if ( mods.range !== 0 ) props.push(`Range: ${mods.range >= 0 ? "+" : ""}${mods.range}`);
    
    if ( this.addedQualities.size ) {
      props.push(`Adds: ${Array.from(this.addedQualities).join(", ")}`);
    }
    if ( this.removedQualities.size ) {
      props.push(`Removes: ${Array.from(this.removedQualities).join(", ")}`);
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
