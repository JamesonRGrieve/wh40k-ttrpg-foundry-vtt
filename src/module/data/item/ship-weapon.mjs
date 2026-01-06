import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Ship Weapon items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class ShipWeaponData extends ItemDataModel.mixin(
  DescriptionTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Weapon type
      weaponType: new fields.StringField({
        required: true,
        initial: "macrobattery",
        choices: [
          "macrobattery", "lance", "nova-cannon", "torpedo",
          "bombardment-cannon", "landing-bay", "attack-craft"
        ]
      }),
      
      // Firing arc/location
      location: new fields.StringField({
        required: true,
        initial: "dorsal",
        choices: ["prow", "dorsal", "port", "starboard", "keel"]
      }),
      
      // Hull type restrictions
      hullType: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: ["all"] }
      ),
      
      // Resource requirements
      power: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      space: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      shipPoints: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // Weapon stats
      strength: new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),
      damage: new fields.StringField({ required: true, initial: "1d10" }),
      crit: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      range: new fields.NumberField({ required: true, initial: 5, min: 0 }),
      
      // Special qualities
      special: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
      // Availability
      availability: new fields.StringField({
        required: true,
        initial: "common"
      }),
      
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
   * Get the weapon type label.
   * @type {string}
   */
  get weaponTypeLabel() {
    return game.i18n.localize(`RT.ShipWeapon.${this.weaponType.split("-").map(s => s.capitalize()).join("")}`);
  }

  /**
   * Get the location label.
   * @type {string}
   */
  get locationLabel() {
    return game.i18n.localize(`RT.ShipLocation.${this.location.capitalize()}`);
  }

  /**
   * Get the damage string.
   * @type {string}
   */
  get damageLabel() {
    return `${this.damage}${this.crit > 0 ? ` (Crit ${this.crit}+)` : ""}`;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      this.weaponTypeLabel,
      `Location: ${this.locationLabel}`,
      `Str: ${this.strength}`,
      `Damage: ${this.damageLabel}`,
      `Range: ${this.range} VU`,
      `Power: ${this.power}`,
      `Space: ${this.space}`,
      `SP: ${this.shipPoints}`
    ];
    
    if ( this.special.size ) {
      props.push(`Special: ${Array.from(this.special).join(", ")}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      type: this.weaponTypeLabel,
      location: this.locationLabel,
      strength: this.strength,
      damage: this.damageLabel,
      range: `${this.range} VU`
    };
  }
}
