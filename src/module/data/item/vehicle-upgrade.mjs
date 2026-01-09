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
      
      // Upgrade type (Standard, Integral, Custom)
      upgradeType: new fields.StringField({
        required: true,
        initial: "standard",
        choices: ["standard", "integral", "custom"],
        label: "RT.VehicleUpgrade.Type"
      }),
      
      // Allowed vehicles (Any, Ground Only, etc.)
      allowedVehicles: new fields.StringField({
        required: false,
        initial: "any",
        blank: true,
        label: "RT.VehicleUpgrade.AllowedVehicles"
      }),
      
      // Installation difficulty modifier
      difficulty: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
        label: "RT.VehicleUpgrade.Difficulty"
      }),
      
      // Plain text description
      descriptionText: new fields.StringField({ required: false, initial: "", blank: true }),
      
      // Availability
      availability: new fields.StringField({
        required: true,
        initial: "common",
        label: "RT.Availability"
      }),
      
      // Source book reference
      source: new fields.StringField({ required: false, initial: "", blank: true }),
      
      // Installation cost (Throne Gelt or Influence)
      installCost: new fields.NumberField({
        required: true,
        initial: 0,
        min: 0,
        integer: true,
        label: "RT.VehicleUpgrade.InstallCost"
      }),
      
      // Stat modifiers
      modifiers: new fields.SchemaField({
        speed: new fields.NumberField({ required: true, initial: 0, integer: true }),
        manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
        armour: new fields.NumberField({ required: true, initial: 0, integer: true }),
        integrity: new fields.NumberField({ required: true, initial: 0, integer: true })
      }),
      
      // Notes
      notes: new fields.StringField({ required: false, initial: "", blank: true })
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
        const label = game.i18n.localize(`RT.VehicleStat.${key.charAt(0).toUpperCase()}${key.slice(1)}`);
        list.push({
          key,
          label,
          value,
          formatted: `${value >= 0 ? '+' : ''}${value}`
        });
      }
    }
    return list;
  }

  /**
   * Get upgrade type label from config.
   * @type {string}
   */
  get upgradeTypeLabel() {
    const types = CONFIG.rt?.vehicleUpgradeTypes || {};
    const typeData = types[this.upgradeType];
    if (typeData) {
      return game.i18n.localize(typeData.label);
    }
    return this.upgradeType;
  }

  /**
   * Get difficulty formatted with sign.
   * @type {string}
   */
  get difficultyFormatted() {
    if (this.difficulty === 0) return "+0";
    return `${this.difficulty > 0 ? '+' : ''}${this.difficulty}`;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      game.i18n.localize(`RT.Availability.${this.availability.charAt(0).toUpperCase()}${this.availability.slice(1)}`),
      `Type: ${this.upgradeTypeLabel}`,
      `Difficulty: ${this.difficultyFormatted}`
    ];
    
    if (this.installCost > 0) {
      props.push(`Cost: ${this.installCost}`);
    }
    
    for ( const mod of this.modifiersList ) {
      props.push(`${mod.label}: ${mod.formatted}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      availability: this.availability,
      type: this.upgradeTypeLabel
    };
  }
}
