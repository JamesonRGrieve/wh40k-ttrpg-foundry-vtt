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
      stepIndex: new fields.NumberField({ required: true, initial: 0, min: 0, max: 7, integer: true }),
      
      // Position in the step's row (1-8 for display ordering, some origins have multiple positions)
      position: new fields.NumberField({ required: true, initial: 0, min: 0, max: 8, integer: true }),
      
      // XP cost (for Into The Storm advanced origins)
      xpCost: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // Source book information
      source: new fields.SchemaField({
        book: new fields.StringField({ required: false, blank: true }),
        page: new fields.StringField({ required: false, blank: true }),
        custom: new fields.StringField({ required: false, blank: true })
      }),
      
      // Flags for alternate origins
      isAdvancedOrigin: new fields.BooleanField({ required: true, initial: false }),
      replacesOrigins: new fields.ArrayField(
        new fields.StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
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
        
        // Wound formula - supports dice notation like "2xTB+1d5+2"
        woundsFormula: new fields.StringField({ required: false, blank: true, initial: "" }),
        
        // Legacy wound modifier (kept for backward compatibility)
        wounds: new fields.NumberField({ required: true, initial: 0, integer: true }),
        
        // Fate formula - supports conditional notation like "(1-5|=2),(6-10|=3)"
        fateFormula: new fields.StringField({ required: false, blank: true, initial: "" }),
        
        // Legacy fate threshold modifier (kept for backward compatibility)
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
            type: new fields.StringField({ required: true }),
            label: new fields.StringField({ required: true }),
            options: new fields.ArrayField(
              new fields.ObjectField({ required: true }),
              { required: true }
            ),
            count: new fields.NumberField({ required: true, initial: 1, min: 1 }),
            xpCost: new fields.NumberField({ required: false, initial: 0, min: 0 })
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

      // Active modifiers from choices (calculated in prepareDerivedData)
      activeModifiers: new fields.ArrayField(
        new fields.SchemaField({
          source: new fields.StringField({ required: true }),  // Which choice this came from
          type: new fields.StringField({ required: true }),    // characteristic/skill/talent/equipment
          key: new fields.StringField({ required: true }),
          value: new fields.NumberField({ required: false }),
          itemUuid: new fields.StringField({ required: false, blank: true }) // For fetching item details
        }),
        { required: true, initial: [] }
      ),

      // Roll results storage for interactive rolling
      rollResults: new fields.SchemaField({
        wounds: new fields.SchemaField({
          formula: new fields.StringField({ required: false, blank: true }),
          rolled: new fields.NumberField({ required: false, initial: null }),
          breakdown: new fields.StringField({ required: false, blank: true }),
          timestamp: new fields.NumberField({ required: false, initial: null })
        }),
        fate: new fields.SchemaField({
          formula: new fields.StringField({ required: false, blank: true }),
          rolled: new fields.NumberField({ required: false, initial: null }),
          breakdown: new fields.StringField({ required: false, blank: true }),
          timestamp: new fields.NumberField({ required: false, initial: null })
        })
      }),

      // Navigation metadata for chart visualization
      navigation: new fields.SchemaField({
        // Which positions in next step this origin connects to
        connectsTo: new fields.ArrayField(
          new fields.NumberField({ required: true, min: 0, max: 8 }),
          { required: true, initial: [] }
        ),
        // Visual hints
        isEdgeLeft: new fields.BooleanField({ required: true, initial: false }),
        isEdgeRight: new fields.BooleanField({ required: true, initial: false })
      })
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
   * Is this an advanced origin from Into The Storm?
   * @type {boolean}
   */
  get isAdvanced() {
    return this.isAdvancedOrigin || this.xpCost > 0;
  }

  /**
   * Get display string for XP cost.
   * @type {string}
   */
  get xpCostLabel() {
    return this.xpCost > 0 ? `${this.xpCost} XP` : "—";
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
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData?.();
    this._calculateActiveModifiers();
    this._prepareNavigationData();
  }

  /**
   * Calculate active modifiers from selected choices.
   * This populates the activeModifiers array based on what the player has chosen.
   * @private
   */
  _calculateActiveModifiers() {
    const activeModifiers = [];

    for (const choice of this.grants.choices) {
      const selected = this.selectedChoices[choice.label] || [];

      for (const selectedValue of selected) {
        const option = choice.options.find(opt => opt.value === selectedValue);
        if (!option?.grants) continue;

        // Extract characteristic modifiers
        if (option.grants.characteristics) {
          for (const [char, value] of Object.entries(option.grants.characteristics)) {
            if (value !== 0) {
              activeModifiers.push({
                source: choice.label,
                type: "characteristic",
                key: char,
                value: value,
                itemUuid: null
              });
            }
          }
        }

        // Extract skill grants
        if (option.grants.skills) {
          for (const skill of option.grants.skills) {
            activeModifiers.push({
              source: choice.label,
              type: "skill",
              key: skill.name,
              value: null,
              itemUuid: null
            });
          }
        }

        // Extract talent grants
        if (option.grants.talents) {
          for (const talent of option.grants.talents) {
            activeModifiers.push({
              source: choice.label,
              type: "talent",
              key: talent.name,
              value: null,
              itemUuid: talent.uuid || null
            });
          }
        }

        // Extract trait grants
        if (option.grants.traits) {
          for (const trait of option.grants.traits) {
            activeModifiers.push({
              source: choice.label,
              type: "trait",
              key: trait.name,
              value: trait.level,
              itemUuid: trait.uuid || null
            });
          }
        }

        // Extract equipment grants
        if (option.grants.equipment) {
          for (const equip of option.grants.equipment) {
            activeModifiers.push({
              source: choice.label,
              type: "equipment",
              key: equip.name,
              value: equip.quantity,
              itemUuid: equip.uuid || null
            });
          }
        }
      }
    }

    // Store the calculated modifiers
    // Note: This is safe because prepareDerivedData is called after the item is initialized
    // and we're just updating a derived field, not modifying source data
    if (JSON.stringify(this.activeModifiers) !== JSON.stringify(activeModifiers)) {
      this.activeModifiers = activeModifiers;
    }
  }

  /**
   * Prepare navigation metadata for chart visualization.
   * Calculates which positions in the next step this origin connects to.
   * @private
   */
  _prepareNavigationData() {
    const position = this.position;

    // Calculate connections based on position
    // Rule: Each choice connects to position-1, position, and position+1 in next step
    // Edge cases: leftmost (0) and rightmost (7+) have only 2 connections
    let connectsTo = [];

    if (position === 0) {
      // Left edge - can only go to 0 and 1
      connectsTo = [0, 1];
      this.navigation.isEdgeLeft = true;
      this.navigation.isEdgeRight = false;
    } else if (position >= 7) {
      // Right edge - can only go to position-1 and position
      connectsTo = [position - 1, position];
      this.navigation.isEdgeLeft = false;
      this.navigation.isEdgeRight = true;
    } else {
      // Middle - connects to position-1, position, and position+1
      connectsTo = [position - 1, position, position + 1];
      this.navigation.isEdgeLeft = false;
      this.navigation.isEdgeRight = false;
    }

    // Only update if changed
    if (JSON.stringify(this.navigation.connectsTo) !== JSON.stringify(connectsTo)) {
      this.navigation.connectsTo = connectsTo;
    }
  }

  /* -------------------------------------------- */
  /*  Data Migration & Cleanup                    */
  /* -------------------------------------------- */

  /** @override */
  static migrateData(source) {
    // Let parent handle its migration first
    super.migrateData?.(source);
    
    const grants = source.grants || {};
    
    // Migration 1: Warn about legacy wounds/fate fields if formulas are missing
    if (grants.wounds && !grants.woundsFormula) {
      console.warn(
        `Origin Path "${source.name}" uses legacy grants.wounds field (${grants.wounds}). ` +
        `Consider adding a woundsFormula instead.`
      );
    }
    
    if (grants.fateThreshold && !grants.fateFormula) {
      console.warn(
        `Origin Path "${source.name}" uses legacy grants.fateThreshold field (${grants.fateThreshold}). ` +
        `Consider adding a fateFormula instead.`
      );
    }
    
    // Migration 2: Deprecate effectText field
    if (source.effectText && !source.description?.value) {
      console.warn(
        `Origin Path "${source.name}" has effectText but no description. ` +
        `Migrating effectText to description.`
      );
      // Convert plain text to HTML paragraph
      source.description = source.description || {};
      source.description.value = `<p>${source.effectText.replace(/\n/g, '<br>')}</p>`;
    }
    
    if (source.effectText && source.description?.value) {
      console.info(
        `Origin Path "${source.name}" has both effectText and description. ` +
        `effectText is deprecated and should be removed from JSON.`
      );
    }
    
    return source;
  }

  /** @override */
  static cleanData(source, options) {
    // Ensure numeric fields are properly typed
    if (source.grants) {
      if (typeof source.grants.wounds === 'string') {
        source.grants.wounds = parseInt(source.grants.wounds) || 0;
      }
      if (typeof source.grants.fateThreshold === 'string') {
        source.grants.fateThreshold = parseInt(source.grants.fateThreshold) || 0;
      }
    }
    
    return super.cleanData?.(source, options) || source;
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
