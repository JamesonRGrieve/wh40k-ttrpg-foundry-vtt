import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import PhysicalItemTemplate from "../shared/physical-item-template.mjs";
import EquippableTemplate from "../shared/equippable-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Gear items (general equipment).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 */
export default class GearData extends ItemDataModel.mixin(
  DescriptionTemplate,
  PhysicalItemTemplate,
  EquippableTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Gear category
      category: new fields.StringField({
        required: true,
        initial: "general",
        choices: [
          "general", "tools", "drugs", "consumable", "clothing",
          "survival", "communications", "detection", "medical",
          "tech", "religious", "luxury", "contraband"
        ]
      }),
      
      // Is this consumable?
      consumable: new fields.BooleanField({ required: true, initial: false }),
      
      // Uses/charges (for consumables)
      uses: new fields.SchemaField({
        value: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0, integer: true }),
        max: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0, integer: true })
      }),
      
      // Effect when used
      effect: new fields.HTMLField({ required: false, blank: true }),
      
      // Duration of effect (for drugs, etc.)
      duration: new fields.StringField({ required: false, blank: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * Type → Category mapping for legacy pack data
   * @type {Object<string, string>}
   * @private
   */
  static #TYPE_TO_CATEGORY = {
    'Tool - Device': 'tools',
    'Tool - Handheld': 'tools',
    'Tool - Misc': 'tools',
    'Tool - Worn': 'tools',
    'Tool - Structure': 'tools',
    'Tool - Tome': 'tools',
    'Tool - Astartes': 'tools',
    'Tool - Infantry Gear': 'survival',
    'Consumable': 'consumable',
    'Drug': 'drugs',
    'Clothing': 'clothing',
    'Clothing (Astartes)': 'clothing',
    'Cybernetic': 'tech',
    'Service': 'general',
    'Medal': 'general',
    'Familiar': 'tech',
    'Poison': 'drugs',
    'Disease': 'consumable',
    'exotic': 'luxury',
    'xenos': 'luxury'
  };

  /**
   * Availability normalization for legacy pack data
   * @type {Object<string, string>}
   * @private
   */
  static #NORMALIZE_AVAILABILITY = {
    'Ubiquitous': 'ubiquitous',
    'Abundant': 'abundant',
    'Plentiful': 'plentiful',
    'Common': 'common',
    'Average': 'average',
    'Scarce': 'scarce',
    'Rare': 'rare',
    'Very Rare': 'very-rare',
    'Extremely Rare': 'extremely-rare',
    'Near Unique': 'near-unique',
    'Unique': 'unique',
    'Special': 'average',
    'Initiated': 'average'
  };

  /** @override */
  static migrateData(source) {
    const migrated = super.migrateData ? super.migrateData(source) : foundry.utils.deepClone(source);
    
    // Migrate old pack format: type → category
    if (source.type && !source.category) {
      migrated.category = this.#TYPE_TO_CATEGORY[source.type] || 'general';
      delete migrated.type;
    }
    
    // Migrate old pack format: effects (availability enum) → availability
    if (source.effects && !source.availability) {
      migrated.availability = this.#NORMALIZE_AVAILABILITY[source.effects] || 'average';
    }
    
    // Migrate old pack format: charges → uses
    if (source.charges && !source.uses) {
      migrated.uses = {
        value: parseInt(source.charges.value) || 0,
        max: parseInt(source.charges.max) || 0
      };
      delete migrated.charges;
    }
    
    // Migrate weight string → number
    if (typeof source.weight === 'string') {
      migrated.weight = this.#parseWeight(source.weight);
    }
    
    // Migrate old pack format: build description from scattered fields
    if (source.availability && String(source.availability).length > 50) {
      const parts = [];
      
      // Main effect description (was in availability field)
      parts.push(`<p>${source.availability}</p>`);
      
      // Requirements (was in cost field)
      if (source.cost && String(source.cost).length > 10) {
        parts.push(`<h3>Requirements</h3><p>${source.cost}</p>`);
      }
      
      // Existing description
      if (migrated.description?.value) {
        parts.push(migrated.description.value);
      }
      
      migrated.description = migrated.description || {};
      migrated.description.value = parts.join('\n');
      migrated.effect = source.availability;
    }
    
    // Migrate old pack format: parse cost from notes
    if (source.notes && !source.cost?.value) {
      const costMatch = String(source.notes).match(/(\d+(?:,\d+)?)\s*T(?:hrone)?/i);
      if (costMatch) {
        migrated.cost = {
          value: parseInt(costMatch[1].replace(/,/g, ''), 10),
          currency: 'throne'
        };
      }
    }
    
    return migrated;
  }

  /**
   * Parse weight string to number
   * @param {string} weightStr - Weight string like "1.5kg", "-", "?"
   * @returns {number}
   * @private
   */
  static #parseWeight(weightStr) {
    if (!weightStr || weightStr === '-' || weightStr === '?') return 0;
    
    const cleaned = String(weightStr).replace(/kg|g|\s/gi, '').trim();
    const num = parseFloat(cleaned);
    
    return isNaN(num) ? 0 : num;
  }

  /** @override */
  static cleanData(source, options) {
    // Ensure uses values are integers
    if (source.uses) {
      if (source.uses.value !== undefined) {
        source.uses.value = parseInt(source.uses.value) || 0;
      }
      if (source.uses.max !== undefined) {
        source.uses.max = parseInt(source.uses.max) || 0;
      }
    }
    
    return super.cleanData ? super.cleanData(source, options) : source;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the category label.
   * @type {string}
   */
  get categoryLabel() {
    const config = CONFIG.ROGUE_TRADER?.gearCategories?.[this.category];
    if (config?.label) return game.i18n.localize(config.label);
    return game.i18n.localize(`RT.GearCategory.${this.category.capitalize()}`);
  }

  /**
   * Get the category icon.
   * @type {string}
   */
  get categoryIcon() {
    const config = CONFIG.ROGUE_TRADER?.gearCategories?.[this.category];
    return config?.icon || 'fa-box';
  }

  /**
   * Does this item have limited uses?
   * @type {boolean}
   */
  get hasLimitedUses() {
    return this.uses.max > 0;
  }

  /**
   * Are uses exhausted?
   * @type {boolean}
   */
  get usesExhausted() {
    return this.hasLimitedUses && this.uses.value <= 0;
  }

  /**
   * Get uses display string (e.g., "5/10")
   * @type {string}
   */
  get usesDisplay() {
    if (!this.hasLimitedUses) return '';
    return `${this.uses.value}/${this.uses.max}`;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      ...PhysicalItemTemplate.prototype.chatProperties.call(this),
      this.categoryLabel
    ];
    
    if ( this.hasLimitedUses ) {
      props.push(game.i18n.format("RT.Gear.UsesRemaining", { uses: this.usesDisplay }));
    }
    
    if ( this.duration ) {
      props.push(game.i18n.format("RT.Gear.Duration", { duration: this.duration }));
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    const labels = [];
    
    // Category badge
    labels.push({
      label: this.categoryLabel,
      icon: `fa-solid ${this.categoryIcon}`,
      tooltip: game.i18n.localize("RT.Gear.Category")
    });
    
    // Uses indicator (if limited)
    if (this.hasLimitedUses) {
      labels.push({
        label: this.usesDisplay,
        icon: "fa-solid fa-battery-three-quarters",
        tooltip: game.i18n.localize("RT.Gear.Uses"),
        cssClass: this.usesExhausted ? 'exhausted' : ''
      });
    }
    
    return labels;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Consume one use.
   * @returns {Promise<Item>}
   */
  async consume() {
    if ( !this.hasLimitedUses ) {
      ui.notifications.warn(game.i18n.localize("RT.Gear.NoConsumableUses"));
      return this.parent;
    }
    
    if ( this.usesExhausted ) {
      ui.notifications.warn(game.i18n.localize("RT.Gear.UsesExhausted"));
      return this.parent;
    }
    
    const newValue = Math.max(0, this.uses.value - 1);
    await this.parent?.update({ "system.uses.value": newValue });
    
    // Notification
    ui.notifications.info(
      game.i18n.format("RT.Gear.ConsumedUse", {
        name: this.parent.name,
        remaining: `${newValue}/${this.uses.max}`
      })
    );
    
    return this.parent;
  }

  /**
   * Reset uses to maximum.
   * @returns {Promise<Item>}
   */
  async resetUses() {
    if ( !this.hasLimitedUses ) return this.parent;
    
    await this.parent?.update({ "system.uses.value": this.uses.max });
    
    ui.notifications.info(
      game.i18n.format("RT.Gear.UsesReset", {
        name: this.parent.name,
        max: this.uses.max
      })
    );
    
    return this.parent;
  }
}
