import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import ActivationTemplate from "../shared/activation-template.mjs";
import DamageTemplate from "../shared/damage-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";
import FormulaField from "../fields/formula-field.mjs";

/**
 * Data model for Psychic Power items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ActivationTemplate
 * @mixes DamageTemplate
 */
export default class PsychicPowerData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ActivationTemplate,
  DamageTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Psychic discipline
      discipline: new fields.StringField({
        required: true,
        initial: "telepathy",
        choices: [
          "telepathy", "telekinesis", "divination", "pyromancy",
          "biomancy", "daemonology", "malefic", "sanctic"
        ]
      }),
      
      // Psy Rating cost
      prCost: new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),
      
      // Focus Power Test
      focusPower: new fields.SchemaField({
        characteristic: new fields.StringField({
          required: true,
          initial: "willpower"
        }),
        modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
        threshold: new fields.NumberField({ required: false, initial: null }),
        opposed: new fields.BooleanField({ required: true, initial: false }),
        opposedCharacteristic: new fields.StringField({ required: false, blank: true })
      }),
      
      // Power effect (enhanced description)
      effect: new fields.HTMLField({ required: true, blank: true }),
      
      // Overbleed effect (pushing the power)
      overbleed: new fields.HTMLField({ required: false, blank: true }),
      
      // Is this an attack power?
      isAttack: new fields.BooleanField({ required: true, initial: false }),
      
      // Phenomena modifiers
      phenomenaModifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
      
      // Sustained power
      sustained: new fields.BooleanField({ required: true, initial: false }),
      
      // Range scaling with PR
      rangePerPR: new fields.NumberField({ required: false, initial: null }),
      
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
   * Get the discipline label.
   * @type {string}
   */
  get disciplineLabel() {
    return game.i18n.localize(`RT.PsychicDiscipline.${this.discipline.capitalize()}`);
  }

  /**
   * Get the focus power characteristic label.
   * @type {string}
   */
  get focusCharacteristicLabel() {
    return game.i18n.localize(`RT.Characteristic.${this.focusPower.characteristic.capitalize()}`);
  }

  /**
   * Get the focus test description.
   * @type {string}
   */
  get focusTestLabel() {
    let label = this.focusCharacteristicLabel;
    if ( this.focusPower.modifier !== 0 ) {
      label += ` ${this.focusPower.modifier >= 0 ? "+" : ""}${this.focusPower.modifier}`;
    }
    if ( this.focusPower.opposed ) {
      const oppChar = this.focusPower.opposedCharacteristic || "willpower";
      label += ` (Opposed by ${game.i18n.localize(`RT.Characteristic.${oppChar.capitalize()}`)})`;
    }
    return label;
  }

  /**
   * Is this power dangerous (causes phenomena)?
   * @type {boolean}
   */
  get causesPhenomena() {
    return true; // All psychic powers can cause phenomena
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      this.disciplineLabel,
      `PR Cost: ${this.prCost}`,
      `Focus: ${this.focusTestLabel}`,
      ...ActivationTemplate.prototype.chatProperties.call(this)
    ];
    
    if ( this.isAttack ) {
      props.push(...DamageTemplate.prototype.chatProperties.call(this));
    }
    
    if ( this.sustained ) {
      props.push(game.i18n.localize("RT.PsychicPower.Sustained"));
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      discipline: this.disciplineLabel,
      prCost: this.prCost,
      focus: this.focusTestLabel,
      action: this.activationLabel
    };
  }
}
