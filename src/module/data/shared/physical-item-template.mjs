import SystemDataModel from "../abstract/system-data-model.mjs";

/**
 * Template for physical items with weight and availability.
 * @mixin
 */
export default class PhysicalItemTemplate extends SystemDataModel {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      weight: new fields.NumberField({ 
        required: true, 
        nullable: false, 
        initial: 0, 
        min: 0 
      }),
      availability: new fields.StringField({
        required: true,
        initial: "common",
        choices: () => Object.keys(CONFIG.ROGUE_TRADER?.availabilities ?? {}).length 
          ? Object.keys(CONFIG.ROGUE_TRADER.availabilities)
          : ["ubiquitous", "abundant", "plentiful", "common", "average", "scarce", "rare", "very-rare", "extremely-rare", "near-unique", "unique"]
      }),
      craftsmanship: new fields.StringField({
        required: true,
        initial: "common",
        choices: () => Object.keys(CONFIG.ROGUE_TRADER?.craftsmanships ?? {}).length
          ? Object.keys(CONFIG.ROGUE_TRADER.craftsmanships)
          : ["poor", "common", "good", "best"]
      }),
      quantity: new fields.NumberField({ 
        required: true, 
        nullable: false, 
        initial: 1, 
        min: 0, 
        integer: true 
      }),
      cost: new fields.SchemaField({
        value: new fields.NumberField({ required: false, initial: 0 }),
        currency: new fields.StringField({ required: false, initial: "throne" })
      })
    };
  }

  /* -------------------------------------------- */

  /**
   * Get the total weight considering quantity.
   * @type {number}
   */
  get totalWeight() {
    return this.weight * (this.quantity || 1);
  }

  /* -------------------------------------------- */

  /**
   * Get localized availability label.
   * @type {string}
   */
  get availabilityLabel() {
    return game.i18n.localize(`RT.Availability.${this.availability.capitalize()}`);
  }

  /* -------------------------------------------- */

  /**
   * Get localized craftsmanship label.
   * @type {string}
   */
  get craftsmanshipLabel() {
    return game.i18n.localize(`RT.Craftsmanship.${this.craftsmanship.capitalize()}`);
  }

  /* -------------------------------------------- */

  /**
   * Properties for chat display.
   * @type {string[]}
   */
  get chatProperties() {
    const props = [];
    if ( this.weight ) props.push(`${this.weight} kg`);
    if ( this.availability ) props.push(this.availabilityLabel);
    if ( this.craftsmanship && this.craftsmanship !== "common" ) {
      props.push(this.craftsmanshipLabel);
    }
    return props;
  }
}
