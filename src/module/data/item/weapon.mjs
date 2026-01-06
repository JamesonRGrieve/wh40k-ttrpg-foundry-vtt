import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import PhysicalItemTemplate from "../shared/physical-item-template.mjs";
import EquippableTemplate from "../shared/equippable-template.mjs";
import AttackTemplate from "../shared/attack-template.mjs";
import DamageTemplate from "../shared/damage-template.mjs";
import FormulaField from "../fields/formula-field.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Weapon items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 * @mixes AttackTemplate
 * @mixes DamageTemplate
 */
export default class WeaponData extends ItemDataModel.mixin(
  DescriptionTemplate,
  PhysicalItemTemplate,
  EquippableTemplate,
  AttackTemplate,
  DamageTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Weapon classification
      class: new fields.StringField({
        required: true,
        initial: "melee",
        choices: [
          "melee", "pistol", "basic", "heavy", "thrown", "exotic",
          "chain", "power", "shock", "force"
        ]
      }),
      
      type: new fields.StringField({
        required: true,
        initial: "primitive",
        choices: [
          "primitive", "las", "solid-projectile", "bolt", "melta", "plasma",
          "flame", "launcher", "explosive", "power", "chain", "shock",
          "force", "exotic", "xenos"
        ]
      }),
      
      // Weapon properties
      twoHanded: new fields.BooleanField({ required: true, initial: false }),
      melee: new fields.BooleanField({ required: true, initial: false }),
      
      // Ammunition
      clip: new fields.SchemaField({
        max: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        value: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        type: new fields.StringField({ required: false, blank: true })
      }),
      reload: new fields.StringField({
        required: true,
        initial: "-",
        choices: ["-", "free", "half", "full", "2-full", "3-full"]
      }),
      
      // Weapon qualities (stored as set of quality identifiers)
      qualities: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
      // Modifications (references to weaponModification items)
      modifications: new fields.ArrayField(
        new fields.SchemaField({
          uuid: new fields.StringField({ required: true }),
          name: new fields.StringField({ required: true }),
          active: new fields.BooleanField({ required: true, initial: true })
        }),
        { required: true, initial: [] }
      ),
      
      // Proficiency required
      proficiency: new fields.StringField({ required: false, blank: true }),
      
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
   * Is this a ranged weapon?
   * @type {boolean}
   */
  get isRangedWeapon() {
    return ["pistol", "basic", "heavy", "launcher"].includes(this.class);
  }

  /**
   * Is this a melee weapon?
   * @type {boolean}
   */
  get isMeleeWeapon() {
    return this.class === "melee" || this.melee;
  }

  /**
   * Does this weapon use ammunition?
   * @type {boolean}
   */
  get usesAmmo() {
    return this.clip.max > 0;
  }

  /**
   * Is the weapon jammed or out of ammo?
   * @type {boolean}
   */
  get isOutOfAmmo() {
    return this.usesAmmo && this.clip.value <= 0;
  }

  /**
   * Get the reload time label.
   * @type {string}
   */
  get reloadLabel() {
    const labels = {
      "-": "-",
      "free": game.i18n.localize("RT.Reload.Free"),
      "half": game.i18n.localize("RT.Reload.Half"),
      "full": game.i18n.localize("RT.Reload.Full"),
      "2-full": game.i18n.localize("RT.Reload.2Full"),
      "3-full": game.i18n.localize("RT.Reload.3Full")
    };
    return labels[this.reload] ?? this.reload;
  }

  /**
   * Get the weapon class label.
   * @type {string}
   */
  get classLabel() {
    return game.i18n.localize(`RT.WeaponClass.${this.class.capitalize()}`);
  }

  /**
   * Get the weapon type label.
   * @type {string}
   */
  get typeLabel() {
    return game.i18n.localize(`RT.WeaponType.${this.type.split("-").map(s => s.capitalize()).join("")}`);
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      ...PhysicalItemTemplate.prototype.chatProperties.call(this),
      ...AttackTemplate.prototype.chatProperties.call(this),
      ...DamageTemplate.prototype.chatProperties.call(this)
    ];
    
    props.unshift(`${this.classLabel} (${this.typeLabel})`);
    
    if ( this.usesAmmo ) {
      props.push(`Clip: ${this.clip.value}/${this.clip.max}`);
      props.push(`Reload: ${this.reloadLabel}`);
    }
    
    if ( this.qualities.size ) {
      props.push(`Qualities: ${Array.from(this.qualities).join(", ")}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      class: this.classLabel,
      type: this.typeLabel,
      damage: this.damageLabel,
      pen: this.damage.penetration,
      range: this.rangeLabel,
      rof: this.rateOfFireLabel
    };
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Fire the weapon, consuming ammunition.
   * @param {number} [shots=1]   Number of shots to fire.
   * @returns {Promise<Item>}
   */
  async fire(shots = 1) {
    if ( !this.usesAmmo ) return this.parent;
    const newValue = Math.max(0, this.clip.value - shots);
    return this.parent?.update({ "system.clip.value": newValue });
  }

  /**
   * Reload the weapon.
   * @param {number} [amount]   Amount to reload (defaults to full).
   * @returns {Promise<Item>}
   */
  async reload(amount = null) {
    if ( !this.usesAmmo ) return this.parent;
    const newValue = amount ?? this.clip.max;
    return this.parent?.update({ "system.clip.value": Math.min(newValue, this.clip.max) });
  }
}
