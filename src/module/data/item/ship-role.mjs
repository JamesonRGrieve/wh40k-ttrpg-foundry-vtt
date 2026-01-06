import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Ship Role items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class ShipRoleData extends ItemDataModel.mixin(
  DescriptionTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Role rank/priority
      rank: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),
      
      // Role purpose/function
      purpose: new fields.HTMLField({ required: true, blank: true }),
      
      // Career preferences
      careerPreferences: new fields.ArrayField(
        new fields.StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
      // Subordinate roles
      subordinates: new fields.ArrayField(
        new fields.StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
      // Important skills for this role
      importantSkills: new fields.ArrayField(
        new fields.StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
      // Special abilities/actions
      abilities: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true }),
          description: new fields.HTMLField({ required: true }),
          action: new fields.StringField({ required: false, blank: true }),
          skill: new fields.StringField({ required: false, blank: true })
        }),
        { required: true, initial: [] }
      ),
      
      // Effect/benefits
      effect: new fields.HTMLField({ required: false, blank: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get formatted career preferences.
   * @type {string}
   */
  get careerPreferencesLabel() {
    if ( !this.careerPreferences.length ) return "-";
    return this.careerPreferences.join(", ");
  }

  /**
   * Get formatted important skills.
   * @type {string}
   */
  get importantSkillsLabel() {
    if ( !this.importantSkills.length ) return "-";
    return this.importantSkills.join(", ");
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      `Rank: ${this.rank}`,
      `Careers: ${this.careerPreferencesLabel}`,
      `Skills: ${this.importantSkillsLabel}`
    ];
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      rank: this.rank
    };
  }
}
