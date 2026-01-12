import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import ModifiersTemplate from "../shared/modifiers-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Origin Path items (homeworld, birthright, career, etc).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class OriginPathData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ModifiersTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Origin path step
      step: new fields.StringField({
        required: true,
        initial: "homeWorld",
        choices: [
          "homeWorld", "birthright", "lureOfTheVoid",
          "trialsAndTravails", "motivation", "career"
        ]
      }),
      
      // Step order (for display)
      stepIndex: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true }),
      
      // Requirements to select this origin
      requirements: new fields.SchemaField({
        text: new fields.StringField({ required: false, blank: true }),
        previousSteps: new fields.ArrayField(
          new fields.StringField({ required: true }),
          { required: true, initial: [] }
        ),
        excludedSteps: new fields.ArrayField(
          new fields.StringField({ required: true }),
          { required: true, initial: [] }
        )
      }),
      
      // What this origin grants
      grants: new fields.SchemaField({
        // Characteristic modifiers (already in ModifiersTemplate)
        
        // Wound modifier
        wounds: new fields.NumberField({ required: true, initial: 0, integer: true }),
        
        // Fate threshold modifier
        fateThreshold: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        
        // Blessed by Emperor (fate points on critical success)
        blessedByEmperor: new fields.BooleanField({ required: true, initial: false }),
        
        // Skills granted (with training level)
        skills: new fields.ArrayField(
          new fields.SchemaField({
            name: new fields.StringField({ required: true }),
            specialization: new fields.StringField({ required: false, blank: true }),
            level: new fields.StringField({
              required: true,
              initial: "trained",
              choices: ["trained", "plus10", "plus20"]
            })
          }),
          { required: true, initial: [] }
        ),
        
        // Talents granted
        talents: new fields.ArrayField(
          new fields.SchemaField({
            name: new fields.StringField({ required: true }),
            specialization: new fields.StringField({ required: false, blank: true }),
            uuid: new fields.StringField({ required: false, blank: true })
          }),
          { required: true, initial: [] }
        ),
        
        // Traits granted
        traits: new fields.ArrayField(
          new fields.SchemaField({
            name: new fields.StringField({ required: true }),
            level: new fields.NumberField({ required: false, initial: null }),
            uuid: new fields.StringField({ required: false, blank: true })
          }),
          { required: true, initial: [] }
        ),
        
        // Aptitudes granted
        aptitudes: new fields.ArrayField(
          new fields.StringField({ required: true }),
          { required: true, initial: [] }
        ),
        
        // Starting equipment
        equipment: new fields.ArrayField(
          new fields.SchemaField({
            name: new fields.StringField({ required: true }),
            quantity: new fields.NumberField({ required: true, initial: 1 }),
            uuid: new fields.StringField({ required: false, blank: true })
          }),
          { required: true, initial: [] }
        ),
        
        // Special abilities (text descriptions)
        specialAbilities: new fields.ArrayField(
          new fields.SchemaField({
            name: new fields.StringField({ required: true }),
            description: new fields.HTMLField({ required: true })
          }),
          { required: true, initial: [] }
        ),
        
        // Choices the player must make
        choices: new fields.ArrayField(
          new fields.SchemaField({
            type: new fields.StringField({
              required: true,
              choices: ["skill", "talent", "characteristic", "equipment"]
            }),
            label: new fields.StringField({ required: true }),
            options: new fields.ArrayField(
              new fields.StringField({ required: true }),
              { required: true }
            ),
            count: new fields.NumberField({ required: true, initial: 1, min: 1 })
          }),
          { required: true, initial: [] }
        )
      }),
      
      // Effect/flavor text
      effectText: new fields.HTMLField({ required: false, blank: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true }),
      
      // Choice tracking - records player's selections for grants.choices
      selectedChoices: new fields.ObjectField({ 
        required: true, 
        initial: {} 
        // Structure: { "choiceLabel": ["selected option 1", "selected option 2"] }
      }),
      
      // Active modifiers from choices
      activeModifiers: new fields.ArrayField(
        new fields.SchemaField({
          source: new fields.StringField({ required: true }),  // Which choice this came from
          type: new fields.StringField({ required: true }),    // characteristic/skill/talent/equipment
          key: new fields.StringField({ required: true }),
          value: new fields.NumberField({ required: false })
        }),
        { required: true, initial: [] }
      )
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the step label.
   * @type {string}
   */
  get stepLabel() {
    return game.i18n.localize(`RT.OriginPath.${this.step.capitalize()}`);
  }

  /**
   * Does this origin have requirements?
   * @type {boolean}
   */
  get hasRequirements() {
    const reqs = this.requirements;
    return !!(reqs.text || reqs.previousSteps.length || reqs.excludedSteps.length);
  }

  /**
   * Does this origin have choices?
   * @type {boolean}
   */
  get hasChoices() {
    return this.grants.choices.length > 0;
  }

  /**
   * Get choices that still need selection.
   * @type {object[]}
   */
  get pendingChoices() {
    return this.grants.choices.filter(choice => {
      const selected = this.selectedChoices[choice.label] || [];
      return selected.length < choice.count;
    });
  }

  /**
   * Check if all choices have been made.
   * @type {boolean}
   */
  get choicesComplete() {
    return this.pendingChoices.length === 0;
  }

  /**
   * Get the active modifiers derived from selected choices.
   * @type {object[]}
   */
  get derivedModifiers() {
    return this.activeModifiers || [];
  }

  /**
   * Get a summary of grants.
   * @type {object}
   */
  get grantsSummary() {
    const grants = this.grants;
    const summary = [];
    
    // Characteristics from modifiers
    const charMods = this.modifiers.characteristics;
    for ( const [char, value] of Object.entries(charMods) ) {
      if ( value !== 0 ) {
        summary.push(`${char}: ${value >= 0 ? "+" : ""}${value}`);
      }
    }
    
    if ( grants.wounds !== 0 ) {
      summary.push(`Wounds: ${grants.wounds >= 0 ? "+" : ""}${grants.wounds}`);
    }
    
    if ( grants.fateThreshold > 0 ) {
      summary.push(`Fate: +${grants.fateThreshold}`);
    }
    
    if ( grants.skills.length ) {
      summary.push(`Skills: ${grants.skills.map(s => s.name).join(", ")}`);
    }
    
    if ( grants.talents.length ) {
      summary.push(`Talents: ${grants.talents.map(t => t.name).join(", ")}`);
    }
    
    if ( grants.traits.length ) {
      summary.push(`Traits: ${grants.traits.map(t => t.name).join(", ")}`);
    }
    
    if ( grants.aptitudes.length ) {
      summary.push(`Aptitudes: ${grants.aptitudes.join(", ")}`);
    }
    
    return summary;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    return [
      this.stepLabel,
      ...this.grantsSummary
    ];
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      step: this.stepLabel,
      stepIndex: this.stepIndex + 1
    };
  }
}
