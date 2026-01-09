import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import PhysicalItemTemplate from "../shared/physical-item-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Armour Modification items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 */
export default class ArmourModificationData extends ItemDataModel.mixin(
  DescriptionTemplate,
  PhysicalItemTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // What armour types this can be applied to
      restrictions: new fields.SchemaField({
        armourTypes: new fields.SetField(
          new fields.StringField({ required: true }),
          { required: true, initial: new Set() }
        )
      }),
      
      // Stat modifiers
      modifiers: new fields.SchemaField({
        armourPoints: new fields.NumberField({ required: true, initial: 0, integer: true }),
        maxAgility: new fields.NumberField({ required: true, initial: 0, integer: true }),
        weight: new fields.NumberField({ required: true, initial: 0 })
      }),
      
      // Properties added
      addedProperties: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: new Set() }
      ),
      
      // Properties removed
      removedProperties: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: new Set() }
      ),
      
      // Effect description
      effect: new fields.HTMLField({ required: false }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * Migrate legacy pack data to modern schema.
   * @override
   */
  static migrateData(source) {
    const migrated = super.migrateData?.(source) || { ...source };
    
    // Migrate armourTypes string → restrictions.armourTypes Set
    if (typeof source.armourTypes === 'string') {
      migrated.restrictions = migrated.restrictions || {};
      migrated.restrictions.armourTypes = this._parseArmourTypes(source.armourTypes);
      delete migrated.armourTypes;
    }
    
    // Migrate armourModifier → modifiers.armourPoints
    if (typeof source.armourModifier === 'number') {
      migrated.modifiers = migrated.modifiers || {};
      migrated.modifiers.armourPoints = source.armourModifier;
      delete migrated.armourModifier;
    }
    
    // Try to extract AP from effect if armourPoints is 0
    if ((!migrated.modifiers?.armourPoints || migrated.modifiers.armourPoints === 0) && source.effect) {
      const extracted = this._extractAPModifier(source.effect);
      if (extracted > 0) {
        migrated.modifiers = migrated.modifiers || {};
        migrated.modifiers.armourPoints = extracted;
      }
    }
    
    // Migrate maxDexBonus → modifiers.maxAgility
    if (typeof source.maxDexBonus === 'number') {
      migrated.modifiers = migrated.modifiers || {};
      migrated.modifiers.maxAgility = source.maxDexBonus;
      delete migrated.maxDexBonus;
    }
    
    // Try to extract Agility from effect if maxAgility is 0
    if ((!migrated.modifiers?.maxAgility || migrated.modifiers.maxAgility === 0) && source.effect) {
      const extracted = this._extractAgilityModifier(source.effect);
      if (extracted !== 0) {
        migrated.modifiers = migrated.modifiers || {};
        migrated.modifiers.maxAgility = extracted;
      }
    }
    
    // Migrate weight string → modifiers.weight number
    if (typeof source.weight === 'string') {
      migrated.modifiers = migrated.modifiers || {};
      migrated.modifiers.weight = this._parseWeight(source.weight);
      delete migrated.weight;
    }
    
    // Clean up unused modifiers object
    if (migrated.modifiers?.characteristics) {
      delete migrated.modifiers.characteristics;
    }
    if (migrated.modifiers?.skills) {
      delete migrated.modifiers.skills;
    }
    
    // Initialize empty Sets for properties if not present
    if (!migrated.addedProperties) {
      migrated.addedProperties = [];
    }
    if (!migrated.removedProperties) {
      migrated.removedProperties = [];
    }
    
    // Ensure restrictions exists
    if (!migrated.restrictions) {
      migrated.restrictions = { armourTypes: ['any'] };
    }
    
    return migrated;
  }

  /**
   * Clean data for storage (convert Sets → Arrays).
   * @override
   */
  static cleanData(source = {}, options = {}) {
    const cleaned = super.cleanData?.(source, options) || { ...source };
    
    // Convert SetFields to Arrays for storage
    if (cleaned.restrictions?.armourTypes instanceof Set) {
      cleaned.restrictions.armourTypes = Array.from(cleaned.restrictions.armourTypes);
    }
    if (cleaned.addedProperties instanceof Set) {
      cleaned.addedProperties = Array.from(cleaned.addedProperties);
    }
    if (cleaned.removedProperties instanceof Set) {
      cleaned.removedProperties = Array.from(cleaned.removedProperties);
    }
    
    return cleaned;
  }

  /**
   * Parse armour types string into Set of standardized keys.
   * @param {string} str - Raw armour types string from pack data
   * @returns {string[]} Array of standardized armour type keys
   * @private
   */
  static _parseArmourTypes(str) {
    if (!str) return ['any'];
    
    const normalized = str.toLowerCase();
    const types = [];
    
    // Check for "any" patterns
    if (normalized.includes('any armour') && !normalized.includes('except')) {
      return ['any'];
    }
    
    // Map common type names to standardized keys
    const typeMap = {
      'flak': 'flak',
      'mesh': 'mesh',
      'carapace': 'carapace',
      'power armour': 'power',
      'power': 'power',
      'light-power': 'light-power',
      'light power': 'light-power',
      'storm trooper': 'storm-trooper',
      'storm-trooper': 'storm-trooper',
      'feudal': 'feudal-world',
      'primitive': 'primitive',
      'xenos': 'xenos',
      'void': 'void',
      'enforcer': 'enforcer'
    };
    
    for (const [key, value] of Object.entries(typeMap)) {
      if (normalized.includes(key)) {
        if (!types.includes(value)) types.push(value);
      }
    }
    
    // Handle special cases
    if (normalized.includes('helmet')) {
      types.push('helmet');
    }
    if (normalized.includes('non-primitive')) {
      types.push('non-primitive');
    }
    
    return types.length > 0 ? types : ['any'];
  }

  /**
   * Parse weight string into numeric value.
   * @param {string|number} str - Weight string like "+1.5kg" or "0kg"
   * @returns {number} Numeric weight value
   * @private
   */
  static _parseWeight(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    
    // Handle special cases
    if (str.includes('wep')) return 0; // Variable weight (weapon weight)
    
    // Extract numeric value from strings like "+1.5kg", "0kg", "+15kg"
    const match = str.match(/[+-]?\d+\.?\d*/);
    return match ? parseFloat(match[0]) : 0;
  }

  /**
   * Extract AP modifier from effect text.
   * @param {string} effect - Effect description text
   * @returns {number} AP modifier value
   * @private
   */
  static _extractAPModifier(effect) {
    if (!effect) return 0;
    
    // Look for patterns like "+5 AP", "Gain +3 AP", "add +2 AP"
    const patterns = [
      /\+(\d+)\s*AP/i,
      /gain\s*\+(\d+)\s*AP/i,
      /adds?\s*\+(\d+)\s*AP/i
    ];
    
    for (const pattern of patterns) {
      const match = effect.match(pattern);
      if (match) return parseInt(match[1]);
    }
    
    return 0;
  }

  /**
   * Extract Agility modifier from effect text.
   * @param {string} effect - Effect description text
   * @returns {number} Agility modifier value
   * @private
   */
  static _extractAgilityModifier(effect) {
    if (!effect) return 0;
    
    // Look for "-5 max agility", "-10 to Agility", etc.
    const patterns = [
      /([+-]\d+)\s*max\s*ag/i,
      /([+-]\d+)\s*max\s*agility/i,
      /([+-]\d+)\s*to.*agility/i
    ];
    
    for (const pattern of patterns) {
      const match = effect.match(pattern);
      if (match) return parseInt(match[1]);
    }
    
    return 0;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get restrictions label.
   * @type {string}
   */
  get restrictionsLabel() {
    if ( this.restrictions.armourTypes.size ) {
      return `Types: ${Array.from(this.restrictions.armourTypes).join(", ")}`;
    }
    return game.i18n.localize("RT.Modification.NoRestrictions");
  }

  /**
   * Get formatted restrictions label with localized type names.
   * @type {string}
   */
  get restrictionsLabelEnhanced() {
    const types = Array.from(this.restrictions.armourTypes);
    if (!types.length) return game.i18n.localize("RT.Modification.NoRestrictions");
    if (types.includes('any')) return game.i18n.localize("RT.Modification.AnyArmour");
    
    const labels = types.map(type => {
      const config = CONFIG.rt?.armourTypes?.[type];
      return config ? game.i18n.localize(config.label) : type;
    });
    
    return labels.join(", ");
  }

  /**
   * Has any non-zero modifiers?
   * @type {boolean}
   */
  get hasModifiers() {
    const mods = this.modifiers;
    return mods.armourPoints !== 0 || mods.maxAgility !== 0 || mods.weight !== 0;
  }

  /**
   * Get modifier summary for display.
   * @type {string}
   */
  get modifierSummary() {
    const parts = [];
    const mods = this.modifiers;
    
    if (mods.armourPoints !== 0) {
      parts.push(`AP ${mods.armourPoints >= 0 ? '+' : ''}${mods.armourPoints}`);
    }
    if (mods.maxAgility !== 0) {
      parts.push(`Ag ${mods.maxAgility >= 0 ? '+' : ''}${mods.maxAgility}`);
    }
    if (mods.weight !== 0) {
      parts.push(`${mods.weight >= 0 ? '+' : ''}${mods.weight}kg`);
    }
    
    return parts.length ? parts.join(", ") : game.i18n.localize("RT.Modification.NoModifiers");
  }

  /**
   * Get properties summary.
   * @type {string}
   */
  get propertiesSummary() {
    const added = Array.from(this.addedProperties);
    const removed = Array.from(this.removedProperties);
    const parts = [];
    
    if (added.length) {
      parts.push(`+${added.length} ${game.i18n.localize("RT.Modification.Properties")}`);
    }
    if (removed.length) {
      parts.push(`-${removed.length} ${game.i18n.localize("RT.Modification.Properties")}`);
    }
    
    return parts.length ? parts.join(", ") : "";
  }

  /**
   * Get icon for modification type based on what it does.
   * @type {string}
   */
  get icon() {
    // Determine icon based on what this mod does
    if (this.modifiers.armourPoints > 0) return "fa-shield-halved";
    if (this.restrictions.armourTypes.has('power')) return "fa-bolt";
    if (this.addedProperties.has('sealed')) return "fa-shield-virus";
    if (this.addedProperties.has('hexagrammic')) return "fa-star-of-david";
    return "fa-wrench";
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      ...PhysicalItemTemplate.prototype.chatProperties.call(this)
    ];
    
    // Restrictions
    props.push(this.restrictionsLabelEnhanced);
    
    // Modifiers
    if (this.hasModifiers) {
      props.push(this.modifierSummary);
    }
    
    // Properties
    if (this.propertiesSummary) {
      props.push(this.propertiesSummary);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      restrictions: this.restrictionsLabelEnhanced,
      modifiers: this.modifierSummary,
      properties: this.propertiesSummary
    };
  }
}
