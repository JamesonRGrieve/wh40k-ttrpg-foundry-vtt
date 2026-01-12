import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import ModifiersTemplate from "../shared/modifiers-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Talent items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class TalentData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ModifiersTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Category/type of talent
      category: new fields.StringField({
        required: false,
        initial: "",
        blank: true
      }),
      
      // Tier (1-3 typically, 0 for unset)
      tier: new fields.NumberField({ required: true, initial: 0, min: 0, max: 3, integer: true }),
      
      // Prerequisites (text description or structured)
      prerequisites: new fields.SchemaField({
        text: new fields.StringField({ required: false, blank: true }),
        characteristics: new fields.ObjectField({ required: true, initial: {} }),
        skills: new fields.ArrayField(
          new fields.StringField({ required: true }),
          { required: true, initial: [] }
        ),
        talents: new fields.ArrayField(
          new fields.StringField({ required: true }),
          { required: true, initial: [] }
        )
      }),
      
      // Associated aptitudes for advancement costs
      aptitudes: new fields.ArrayField(
        new fields.StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
      // Experience cost
      cost: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // Effect/benefit description
      benefit: new fields.HTMLField({ required: true, blank: true }),
      
      // Is this a passive talent or can it be activated?
      isPassive: new fields.BooleanField({ required: true, initial: true }),
      
      // Roll configuration (if rollable)
      rollConfig: new fields.SchemaField({
        characteristic: new fields.StringField({ required: false, blank: true }),
        skill: new fields.StringField({ required: false, blank: true }),
        modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
        description: new fields.StringField({ required: false, blank: true })
      }),
      
      // Can this talent be taken multiple times?
      stackable: new fields.BooleanField({ required: true, initial: false }),
      
      // How many times has it been taken (if stackable)
      rank: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),
      
      // Specialization (for talents like "Weapon Training")
      specialization: new fields.StringField({ required: false, blank: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true }),
      
      // What this talent grants (for talents that grant other abilities)
      grants: new fields.SchemaField({
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
        
        // Special abilities (text descriptions for non-item grants)
        specialAbilities: new fields.ArrayField(
          new fields.SchemaField({
            name: new fields.StringField({ required: true }),
            description: new fields.HTMLField({ required: true })
          }),
          { required: true, initial: [] }
        )
      })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * Migrate legacy talent data to new structure.
   * @inheritdoc
   */
  static migrateData(source) {
    // Migrate flat prerequisites string to structured object
    if ( typeof source.prerequisites === "string" ) {
      source.prerequisites = {
        text: source.prerequisites,
        characteristics: {},
        skills: [],
        talents: []
      };
    }
    
    // Migrate flat aptitudes string to array
    if ( typeof source.aptitudes === "string" && source.aptitudes ) {
      source.aptitudes = source.aptitudes.split(",").map(a => a.trim()).filter(Boolean);
    }
    
    return super.migrateData(source);
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Whether this talent can be rolled/activated.
   * @type {boolean}
   * @override
   */
  get isRollable() {
    return !this.isPassive && (!!this.rollConfig?.characteristic || !!this.rollConfig?.skill);
  }

  /**
   * Get the tier label.
   * @type {string}
   */
  get tierLabel() {
    return game.i18n.localize(`RT.Talent.Tier${this.tier}`);
  }

  /**
   * Get the category label.
   * @type {string}
   */
  get categoryLabel() {
    if (!this.category) return game.i18n.localize("RT.TalentCategory.General");
    const key = `RT.TalentCategory.${this.category.capitalize()}`;
    const localized = game.i18n.localize(key);
    return localized === key ? this.category : localized;
  }

  /**
   * Get the full name including specialization and rank.
   * @type {string}
   */
  get fullName() {
    let name = this.parent?.name ?? "";
    if ( this.specialization ) name += ` (${this.specialization})`;
    if ( this.stackable && this.rank > 1 ) name += ` x${this.rank}`;
    return name;
  }

  /**
   * Does this talent have prerequisites?
   * @type {boolean}
   */
  get hasPrerequisites() {
    const prereqs = this.prerequisites;
    if ( prereqs.text ) return true;
    if ( Object.keys(prereqs.characteristics).length ) return true;
    if ( prereqs.skills.length ) return true;
    if ( prereqs.talents.length ) return true;
    return false;
  }

  /**
   * Get a formatted prerequisites string.
   * @type {string}
   */
  get prerequisitesLabel() {
    if ( this.prerequisites.text ) return this.prerequisites.text;
    
    const parts = [];
    
    // Characteristics
    for ( const [char, value] of Object.entries(this.prerequisites.characteristics) ) {
      parts.push(`${char} ${value}+`);
    }
    
    // Skills
    for ( const skill of this.prerequisites.skills ) {
      parts.push(skill);
    }
    
    // Talents
    for ( const talent of this.prerequisites.talents ) {
      parts.push(talent);
    }
    
    return parts.join(", ");
  }

  /**
   * Does this talent grant anything?
   * @type {boolean}
   */
  get hasGrants() {
    const grants = this.grants;
    if ( grants.skills.length ) return true;
    if ( grants.talents.length ) return true;
    if ( grants.traits.length ) return true;
    if ( grants.specialAbilities.length ) return true;
    return false;
  }

  /**
   * Get a summary of what this talent grants.
   * @type {string[]}
   */
  get grantsSummary() {
    const grants = this.grants;
    const summary = [];
    
    if ( grants.skills.length ) {
      summary.push(`Skills: ${grants.skills.map(s => s.name + (s.specialization ? ` (${s.specialization})` : "")).join(", ")}`);
    }
    
    if ( grants.talents.length ) {
      summary.push(`Talents: ${grants.talents.map(t => t.name + (t.specialization ? ` (${t.specialization})` : "")).join(", ")}`);
    }
    
    if ( grants.traits.length ) {
      summary.push(`Traits: ${grants.traits.map(t => t.name).join(", ")}`);
    }
    
    if ( grants.specialAbilities.length ) {
      summary.push(`Special Abilities: ${grants.specialAbilities.map(a => a.name).join(", ")}`);
    }
    
    return summary;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      this.categoryLabel,
      this.tierLabel
    ];
    
    if ( this.aptitudes.length ) {
      props.push(`Aptitudes: ${this.aptitudes.join(", ")}`);
    }
    
    if ( this.hasPrerequisites ) {
      props.push(`Prerequisites: ${this.prerequisitesLabel}`);
    }
    
    if ( this.cost ) {
      props.push(`Cost: ${this.cost} XP`);
    }
    
    // Add grants summary
    if ( this.hasGrants ) {
      props.push(...this.grantsSummary);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      category: this.categoryLabel,
      tier: this.tierLabel,
      cost: `${this.cost} XP`
    };
  }

  /* -------------------------------------------- */
  /*  Vocalization                                */
  /* -------------------------------------------- */

  /**
   * Post this talent to chat with rich formatting.
   * @returns {Promise<ChatMessage>}
   */
  async toChat() {
    const templateData = {
      talent: {
        id: this.parent.id,
        name: this.parent.name,
        img: this.parent.img,
        type: "Talent",
        tier: this.tier,
        tierLabel: this.tierLabel,
        category: this.categoryLabel,
        aptitudes: this.aptitudes,
        aptitudesLabel: this.aptitudes.length > 0 ? this.aptitudes.join(", ") : "—",
        hasPrerequisites: this.hasPrerequisites,
        prerequisitesLabel: this.prerequisitesLabel,
        benefit: this.benefit || this.parent.system.description?.value || "",
        cost: this.cost,
        costLabel: this.cost > 0 ? `${this.cost} XP` : "—",
        isPassive: this.isPassive,
        specialization: this.specialization,
        rank: this.rank,
        stackable: this.stackable
      },
      timestamp: new Date().toLocaleString()
    };
    
    const html = await renderTemplate(
      "systems/rogue-trader/templates/chat/talent-card.hbs",
      templateData
    );
    
    return ChatMessage.create({
      content: html,
      speaker: ChatMessage.getSpeaker({ actor: this.parent.actor })
    });
  }
}
