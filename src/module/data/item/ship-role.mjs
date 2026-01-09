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
      
      // Career preferences (modern: array, legacy: string)
      careerPreferences: new fields.ArrayField(
        new fields.StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
      // Career note (for "Usually X" text)
      careerNote: new fields.StringField({ required: false, blank: true }),
      
      // Subordinate roles (modern: array, legacy: string)
      subordinates: new fields.ArrayField(
        new fields.StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
      // Important skills (modern: array of objects, legacy: array of strings or string)
      importantSkills: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true }),
          specialization: new fields.StringField({ required: false, blank: true })
        }),
        { required: true, initial: [] }
      ),
      
      // Special abilities/actions (modern structured data)
      abilities: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true }),
          description: new fields.HTMLField({ required: true }),
          bonus: new fields.NumberField({ required: false, integer: true }),
          action: new fields.StringField({ required: false, blank: true }),
          actionType: new fields.StringField({ 
            required: false, 
            blank: true,
            choices: ["standard", "extended", "free", "reaction", "passive", "special"]
          }),
          skill: new fields.StringField({ required: false, blank: true })
        }),
        { required: true, initial: [] }
      ),
      
      // Legacy effect field (kept for backward compatibility)
      effect: new fields.HTMLField({ required: false, blank: true }),
      
      // Ship bonuses (structured)
      shipBonuses: new fields.SchemaField({
        manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
        detection: new fields.NumberField({ required: true, initial: 0, integer: true }),
        ballisticSkill: new fields.NumberField({ required: true, initial: 0, integer: true }),
        crewRating: new fields.NumberField({ required: true, initial: 0, integer: true })
      }, { required: false }),
      
      // Skill bonuses (structured)
      skillBonuses: new fields.SchemaField({}, { required: false }),
      
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
    // Handle both array and string (legacy)
    if (Array.isArray(this.careerPreferences)) {
      if (!this.careerPreferences.length) return "-";
      let label = this.careerPreferences.join(", ");
      if (this.careerNote) label = `${this.careerNote}; ${label}`;
      return label;
    }
    // Legacy string handling
    return this.careerPreferences || "-";
  }

  /**
   * Get formatted subordinates.
   * @type {string}
   */
  get subordinatesLabel() {
    // Handle both array and string (legacy)
    if (Array.isArray(this.subordinates)) {
      if (!this.subordinates.length) return "-";
      return this.subordinates.join(", ");
    }
    // Legacy string handling
    return this.subordinates || "-";
  }

  /**
   * Get formatted important skills.
   * @type {string}
   */
  get importantSkillsLabel() {
    // Handle both array of objects and array of strings (legacy)
    if (Array.isArray(this.importantSkills)) {
      if (!this.importantSkills.length) return "-";
      return this.importantSkills.map(skill => {
        if (typeof skill === 'object' && skill.name) {
          if (skill.specialization) {
            return `${skill.name} (${skill.specialization})`;
          }
          return skill.name;
        }
        return skill; // Legacy string
      }).join(", ");
    }
    // Legacy string handling
    return this.importantSkills || "-";
  }

  /**
   * Get primary ability description.
   * @type {string}
   */
  get primaryAbility() {
    if (this.abilities && this.abilities.length > 0) {
      const ability = this.abilities[0];
      return ability.description || ability.name;
    }
    // Fallback to legacy effect
    return this.effect || "";
  }

  /**
   * Get all ship bonuses as array for display.
   * @type {Array<{label: string, value: number, display: string}>}
   */
  get shipBonusesArray() {
    const bonuses = [];
    const labels = {
      manoeuvrability: "Manoeuvrability",
      detection: "Detection",
      ballisticSkill: "Ballistic Skill",
      crewRating: "Crew Rating"
    };
    
    if (!this.shipBonuses) return bonuses;
    
    for (const [key, label] of Object.entries(labels)) {
      const value = this.shipBonuses[key] || 0;
      if (value !== 0) {
        bonuses.push({ 
          label, 
          value,
          display: value > 0 ? `+${value}` : `${value}`
        });
      }
    }
    
    return bonuses;
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
