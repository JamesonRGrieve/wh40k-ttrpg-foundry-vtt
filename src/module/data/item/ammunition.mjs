import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import PhysicalItemTemplate from "../shared/physical-item-template.mjs";
import DamageTemplate from "../shared/damage-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Ammunition items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes DamageTemplate
 */
export default class AmmunitionData extends ItemDataModel.mixin(
  DescriptionTemplate,
  PhysicalItemTemplate,
  DamageTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // What weapon types can use this ammo
      weaponTypes: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: new Set() }
      ),
      
      // Ammo modifiers (applied to weapon when loaded)
      modifiers: new fields.SchemaField({
        damage: new fields.NumberField({ required: true, initial: 0, integer: true }),
        penetration: new fields.NumberField({ required: true, initial: 0, integer: true }),
        range: new fields.NumberField({ required: true, initial: 0, integer: true }),
        rateOfFire: new fields.SchemaField({
          single: new fields.NumberField({ required: true, initial: 0, integer: true }),
          semi: new fields.NumberField({ required: true, initial: 0, integer: true }),
          full: new fields.NumberField({ required: true, initial: 0, integer: true })
        })
      }),
      
      // Special qualities added by this ammo
      addedQualities: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: new Set() }
      ),
      
      // Qualities removed by this ammo
      removedQualities: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: new Set() }
      ),
      
      // Clip size modifier
      clipModifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
      
      // Effect description
      effect: new fields.HTMLField({ required: false, blank: true }),
      
      // Notes & source
      notes: new fields.StringField({ required: false, blank: true }),
      source: new fields.StringField({ required: false, blank: true })
    };
  }
  
  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */
  
  /**
   * Migrate ammunition data.
   * @param {object} source  The source data
   * @protected
   */
  static _migrateData(source) {
    super._migrateData?.(source);
    // Legacy field cleanup
    delete source.usedWith;
    delete source.damageOrEffect;
    delete source.qualities;
    delete source.damageModifier;
    delete source.penetrationModifier;
    delete source.specialRules;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the weapon types label.
   * @type {string}
   */
  get weaponTypesLabel() {
    if ( !this.weaponTypes || !this.weaponTypes.size ) return game.i18n.localize("RT.Ammunition.AllWeapons");
    return Array.from(this.weaponTypes).map(t => {
      const label = CONFIG.ROGUE_TRADER?.weaponTypes?.[t]?.label;
      return label ? game.i18n.localize(label) : t;
    }).join(", ");
  }

  /**
   * Does this ammo modify weapon stats?
   * @type {boolean}
   */
  get hasModifiers() {
    const mods = this.modifiers;
    if ( mods.damage !== 0 ) return true;
    if ( mods.penetration !== 0 ) return true;
    if ( mods.range !== 0 ) return true;
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
      `For: ${this.weaponTypesLabel}`
    ];
    
    const mods = this.modifiers;
    if ( mods.damage !== 0 ) {
      props.push(`Damage: ${mods.damage >= 0 ? "+" : ""}${mods.damage}`);
    }
    if ( mods.penetration !== 0 ) {
      props.push(`Pen: ${mods.penetration >= 0 ? "+" : ""}${mods.penetration}`);
    }
    
    if ( this.addedQualities.size ) {
      props.push(`Adds: ${Array.from(this.addedQualities).join(", ")}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      weaponTypes: this.weaponTypesLabel
    };
  }
}
