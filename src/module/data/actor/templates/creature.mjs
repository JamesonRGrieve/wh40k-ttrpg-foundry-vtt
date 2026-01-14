import CommonTemplate from "./common.mjs";
import { computeArmour } from "../../../utils/armour-calculator.mjs";
import { computeEncumbrance } from "../../../utils/encumbrance-calculator.mjs";

const { NumberField, SchemaField, StringField, BooleanField, ArrayField, ObjectField, HTMLField } = foundry.data.fields;

/**
 * Creature template for actors that are living beings (Characters, NPCs).
 * Extends CommonTemplate with skills, fatigue, fate, psy, and item-based calculations.
 * @extends {CommonTemplate}
 */
export default class CreatureTemplate extends CommonTemplate {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /**
   * Skill schema factory for standard and specialist skills.
   * @param {string} label - Display label
   * @param {string} charShort - Characteristic short name
   * @param {boolean} advanced - Whether skill is Advanced (true) or Basic (false)
   * @param {boolean} hasEntries - Whether skill has specialist entries (skill group)
   * @returns {SchemaField}
   */
  static SkillField(label, charShort, advanced = false, hasEntries = false) {
    const schema = {
      label: new StringField({ required: true, initial: label }),
      characteristic: new StringField({ required: true, initial: charShort }),
      advanced: new BooleanField({ required: true, initial: advanced }),
      basic: new BooleanField({ required: true, initial: !advanced }),
      trained: new BooleanField({ required: true, initial: false }),
      plus10: new BooleanField({ required: true, initial: false }),
      plus20: new BooleanField({ required: true, initial: false }),
      bonus: new NumberField({ required: true, initial: 0, integer: true }),
      notes: new StringField({ required: false, blank: true }),
      hidden: new BooleanField({ required: true, initial: false }),
      cost: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
      // Derived
      current: new NumberField({ required: true, initial: 0, integer: true })
    };

    if (hasEntries) {
      schema.entries = new ArrayField(
        new SchemaField({
          name: new StringField({ required: true }),
          slug: new StringField({ required: false }),
          characteristic: new StringField({ required: false }),
          advanced: new BooleanField({ required: true, initial: advanced }),
          basic: new BooleanField({ required: true, initial: !advanced }),
          trained: new BooleanField({ required: true, initial: false }),
          plus10: new BooleanField({ required: true, initial: false }),
          plus20: new BooleanField({ required: true, initial: false }),
          bonus: new NumberField({ required: true, initial: 0, integer: true }),
          notes: new StringField({ required: false, blank: true }),
          cost: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          current: new NumberField({ required: true, initial: 0, integer: true })
        }),
        { required: true, initial: [] }
      );
    }

    return new SchemaField(schema);
  }

  /** @inheritDoc */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      fatigue: new SchemaField({
        max: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        value: new NumberField({ required: true, initial: 0, min: 0, integer: true })
      }),

      fate: new SchemaField({
        max: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        value: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        rolled: new BooleanField({ required: true, initial: false })
      }),

      psy: new SchemaField({
        rating: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        sustained: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        defaultPR: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        class: new StringField({ required: true, initial: "bound", choices: ["unbound", "bound", "ascended"] }),
        cost: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        hasFocus: new BooleanField({ required: true, initial: false }),
        // Derived
        currentRating: new NumberField({ required: true, initial: 0, integer: true })
      }),

      backpack: new SchemaField({
        hasBackpack: new BooleanField({ required: true, initial: false }),
        name: new StringField({ required: true, initial: "Backpack" }),
        isCombatVest: new BooleanField({ required: true, initial: false }),
        weight: new SchemaField({
          max: new NumberField({ required: true, initial: 30, min: 0 })
        })
      }),

      // Skills - Type: Basic=false, Advanced=true per SKILL_TABLE.md
      skills: new SchemaField({
        // Standard skills (non-specialist)
        acrobatics: this.SkillField("Acrobatics", "Ag", true),  // Advanced
        awareness: this.SkillField("Awareness", "Per", false),  // Basic
        barter: this.SkillField("Barter", "Fel", false),  // Basic
        blather: this.SkillField("Blather", "Fel", true),  // Advanced
        carouse: this.SkillField("Carouse", "T", false),  // Basic
        charm: this.SkillField("Charm", "Fel", false),  // Basic
        chemUse: this.SkillField("Chem-Use", "Int", true),  // Advanced
        climb: this.SkillField("Climb", "S", false),  // Basic
        command: this.SkillField("Command", "Fel", false),  // Basic
        commerce: this.SkillField("Commerce", "Fel", true),  // Advanced
        concealment: this.SkillField("Concealment", "Ag", false),  // Basic
        contortionist: this.SkillField("Contortionist", "Ag", false),  // Basic
        deceive: this.SkillField("Deceive", "Fel", false),  // Basic
        demolition: this.SkillField("Demolition", "Int", true),  // Advanced
        disguise: this.SkillField("Disguise", "Fel", false),  // Basic
        dodge: this.SkillField("Dodge", "Ag", false),  // Basic
        evaluate: this.SkillField("Evaluate", "Int", false),  // Basic
        gamble: this.SkillField("Gamble", "Int", false),  // Basic
        inquiry: this.SkillField("Inquiry", "Fel", false),  // Basic
        interrogation: this.SkillField("Interrogation", "WP", true),  // Advanced
        intimidate: this.SkillField("Intimidate", "S", false),  // Basic
        invocation: this.SkillField("Invocation", "WP", true),  // Advanced
        literacy: this.SkillField("Literacy", "Int", false),  // Basic
        logic: this.SkillField("Logic", "Int", false),  // Basic
        medicae: this.SkillField("Medicae", "Int", true),  // Advanced
        psyniscience: this.SkillField("Psyniscience", "Per", true),  // Advanced
        scrutiny: this.SkillField("Scrutiny", "Per", false),  // Basic
        search: this.SkillField("Search", "Per", false),  // Basic
        security: this.SkillField("Security", "Ag", true),  // Advanced
        shadowing: this.SkillField("Shadowing", "Ag", true),  // Advanced
        silentMove: this.SkillField("Silent Move", "Ag", false),  // Basic
        sleightOfHand: this.SkillField("Sleight of Hand", "Ag", true),  // Advanced
        survival: this.SkillField("Survival", "Int", false),  // Basic
        swim: this.SkillField("Swim", "S", false),  // Basic
        tracking: this.SkillField("Tracking", "Int", true),  // Advanced
        wrangling: this.SkillField("Wrangling", "Int", true),  // Advanced
        
        // Specialist skill groups (IsSkillGroup=true) - Advanced with entries
        ciphers: this.SkillField("Ciphers", "Int", true, true),  // Advanced, Group
        commonLore: this.SkillField("Common Lore", "Int", true, true),  // Advanced, Group
        drive: this.SkillField("Drive", "Ag", true, true),  // Advanced, Group
        forbiddenLore: this.SkillField("Forbidden Lore", "Int", true, true),  // Advanced, Group
        navigation: this.SkillField("Navigation", "Int", true, true),  // Advanced, Group
        performer: this.SkillField("Performer", "Fel", true, true),  // Advanced, Group
        pilot: this.SkillField("Pilot", "Ag", true, true),  // Advanced, Group
        scholasticLore: this.SkillField("Scholastic Lore", "Int", true, true),  // Advanced, Group
        secretTongue: this.SkillField("Secret Tongue", "Int", true, true),  // Advanced, Group
        speakLanguage: this.SkillField("Speak Language", "Int", true, true),  // Advanced, Group
        techUse: this.SkillField("Tech-Use", "Int", true, true),  // Advanced, Group
        trade: this.SkillField("Trade", "Int", true, true),  // Advanced, Group
        
        // Hidden skills (from other game lines - kept for compatibility)
        athletics: this.SkillField("Athletics", "S", false),
        parry: this.SkillField("Parry", "WS", false),
        stealth: this.SkillField("Stealth", "Ag", false)
      }),

      // Computed armour by location
      armour: new SchemaField({
        head: new SchemaField({
          total: new NumberField({ required: true, initial: 0, integer: true }),
          toughnessBonus: new NumberField({ required: true, initial: 0, integer: true }),
          traitBonus: new NumberField({ required: true, initial: 0, integer: true }),
          value: new NumberField({ required: true, initial: 0, integer: true })
        }),
        leftArm: new SchemaField({
          total: new NumberField({ required: true, initial: 0, integer: true }),
          toughnessBonus: new NumberField({ required: true, initial: 0, integer: true }),
          traitBonus: new NumberField({ required: true, initial: 0, integer: true }),
          value: new NumberField({ required: true, initial: 0, integer: true })
        }),
        rightArm: new SchemaField({
          total: new NumberField({ required: true, initial: 0, integer: true }),
          toughnessBonus: new NumberField({ required: true, initial: 0, integer: true }),
          traitBonus: new NumberField({ required: true, initial: 0, integer: true }),
          value: new NumberField({ required: true, initial: 0, integer: true })
        }),
        body: new SchemaField({
          total: new NumberField({ required: true, initial: 0, integer: true }),
          toughnessBonus: new NumberField({ required: true, initial: 0, integer: true }),
          traitBonus: new NumberField({ required: true, initial: 0, integer: true }),
          value: new NumberField({ required: true, initial: 0, integer: true })
        }),
        leftLeg: new SchemaField({
          total: new NumberField({ required: true, initial: 0, integer: true }),
          toughnessBonus: new NumberField({ required: true, initial: 0, integer: true }),
          traitBonus: new NumberField({ required: true, initial: 0, integer: true }),
          value: new NumberField({ required: true, initial: 0, integer: true })
        }),
        rightLeg: new SchemaField({
          total: new NumberField({ required: true, initial: 0, integer: true }),
          toughnessBonus: new NumberField({ required: true, initial: 0, integer: true }),
          traitBonus: new NumberField({ required: true, initial: 0, integer: true }),
          value: new NumberField({ required: true, initial: 0, integer: true })
        })
      }),

      // Encumbrance
      encumbrance: new SchemaField({
        max: new NumberField({ required: true, initial: 0, min: 0 }),
        value: new NumberField({ required: true, initial: 0, min: 0 }),
        encumbered: new BooleanField({ required: true, initial: false }),
        backpack_max: new NumberField({ required: true, initial: 0, min: 0 }),
        backpack_value: new NumberField({ required: true, initial: 0, min: 0 }),
        backpack_encumbered: new BooleanField({ required: true, initial: false })
      }),

      // Modifier tracking for transparency
      modifierSources: new SchemaField({
        characteristics: new ObjectField({ required: true, initial: {} }),
        skills: new ObjectField({ required: true, initial: {} }),
        combat: new SchemaField({
          toHit: new ArrayField(new ObjectField(), { required: true, initial: [] }),
          damage: new ArrayField(new ObjectField(), { required: true, initial: [] }),
          initiative: new ArrayField(new ObjectField(), { required: true, initial: [] }),
          defence: new ArrayField(new ObjectField(), { required: true, initial: [] })
        }),
        wounds: new ArrayField(new ObjectField(), { required: true, initial: [] }),
        fate: new ArrayField(new ObjectField(), { required: true, initial: [] }),
        movement: new ArrayField(new ObjectField(), { required: true, initial: [] })
      }),

      combatModifiers: new SchemaField({
        toHit: new NumberField({ required: true, initial: 0, integer: true }),
        damage: new NumberField({ required: true, initial: 0, integer: true }),
        initiative: new NumberField({ required: true, initial: 0, integer: true }),
        defence: new NumberField({ required: true, initial: 0, integer: true })
      }),

      // UI preferences
      favoriteCombatActions: new ArrayField(
        new StringField({ required: true }),
        { required: true, initial: ["dodge", "parry"] }
      )
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /** @override */
  static migrateData(source) {
    // Define canonical skill types from SKILL_TABLE.md
    const SKILL_TYPES = {
      // Standard skills - Advanced
      acrobatics: true, blather: true, chemUse: true, commerce: true, demolition: true,
      interrogation: true, invocation: true, medicae: true, psyniscience: true,
      security: true, shadowing: true, sleightOfHand: true, tracking: true, wrangling: true,
      
      // Standard skills - Basic
      awareness: false, barter: false, carouse: false, charm: false, climb: false,
      command: false, concealment: false, contortionist: false, deceive: false,
      disguise: false, dodge: false, evaluate: false, gamble: false, inquiry: false,
      intimidate: false, literacy: false, logic: false, scrutiny: false, search: false,
      silentMove: false, survival: false, swim: false,
      
      // Specialist skills - ALL Advanced
      ciphers: true, commonLore: true, drive: true, forbiddenLore: true, navigation: true,
      performer: true, pilot: true, scholasticLore: true, secretTongue: true,
      speakLanguage: true, techUse: true, trade: true,
      
      // Hidden compatibility skills - Basic
      athletics: false, parry: false, stealth: false
    };
    
    // Migrate skills specializations -> entries
    if (source.skills) {
      for (const [key, skill] of Object.entries(source.skills)) {
        if (skill.specializations !== undefined && skill.entries === undefined) {
          skill.entries = skill.specializations;
          delete skill.specializations;
        }
        
        // Force correct advanced/basic values based on canonical table
        if (SKILL_TYPES.hasOwnProperty(key)) {
          const isAdvanced = SKILL_TYPES[key];
          skill.advanced = isAdvanced;
          skill.basic = !isAdvanced;
        } else if (skill.advanced === undefined && skill.basic !== undefined) {
          // Fallback for unknown skills
          skill.advanced = !skill.basic;
        } else if (skill.advanced === undefined && skill.basic === undefined) {
          // Default to basic if both missing
          skill.advanced = false;
          skill.basic = true;
        }
        
        // Fix specialist skill entries - inherit characteristic and advanced/basic from parent
        if (Array.isArray(skill.entries)) {
          const parentChar = skill.characteristic;
          const parentIsAdvanced = SKILL_TYPES.hasOwnProperty(key) ? SKILL_TYPES[key] : skill.advanced;
          
          for (const entry of skill.entries) {
            // Inherit characteristic from parent if missing
            if (!entry.characteristic) {
              entry.characteristic = parentChar;
            }
            
            // Inherit advanced/basic from parent
            entry.advanced = parentIsAdvanced;
            entry.basic = !parentIsAdvanced;
          }
        }
      }
      
      // Remove deprecated lipReading skill
      if (source.skills.lipReading !== undefined) {
        delete source.skills.lipReading;
      }
    }
    
    // Ensure fate values are integers - only modify if property exists
    if (source.fate) {
      if (source.fate.max !== undefined) {
        source.fate.max = this._toInt(source.fate.max);
      }
      if (source.fate.value !== undefined) {
        source.fate.value = this._toInt(source.fate.value);
      }
    }
    
    // Ensure psy values are integers - only modify if property exists
    if (source.psy) {
      if (source.psy.rating !== undefined) {
        source.psy.rating = this._toInt(source.psy.rating);
      }
      if (source.psy.sustained !== undefined) {
        source.psy.sustained = this._toInt(source.psy.sustained);
      }
      if (source.psy.defaultPR !== undefined) {
        source.psy.defaultPR = this._toInt(source.psy.defaultPR);
      }
    }
    
    return super.migrateData(source);
  }
  
  /** @override */
  static cleanData(source, options = {}) {
    // Clean integer fields before validation
    if (source?.fate) {
      if (source.fate.max !== undefined) {
        source.fate.max = this._toInt(source.fate.max);
      }
      if (source.fate.value !== undefined) {
        source.fate.value = this._toInt(source.fate.value);
      }
    }
    if (source?.psy) {
      if (source.psy.rating !== undefined) {
        source.psy.rating = this._toInt(source.psy.rating);
      }
      if (source.psy.sustained !== undefined) {
        source.psy.sustained = this._toInt(source.psy.sustained);
      }
      if (source.psy.defaultPR !== undefined) {
        source.psy.defaultPR = this._toInt(source.psy.defaultPR);
      }
    }
    return super.cleanData(source, options);
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareBaseData() {
    super.prepareBaseData();
    this._initializeModifierTracking();
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this._prepareSkills();
    this._preparePsy();
    this._prepareFatigue();
  }

  /**
   * Second pass of derived data that requires items.
   * Called by the Document class after items are ready.
   */
  prepareEmbeddedData() {
    this._computeItemModifiers();
    this._applyModifiersToCharacteristics();
    this._applyModifiersToSkills();
    this._computeArmour();
    this._computeEncumbrance();
  }

  /**
   * Initialize tracking objects for modifiers from various sources.
   * Must match schema in modifiers-template.mjs
   * @protected
   */
  _initializeModifierTracking() {
    this.modifierSources = {
      characteristics: {},
      skills: {},
      combat: {
        attack: [],       // Matches schema: modifiers.combat.attack
        damage: [],       // Matches schema: modifiers.combat.damage
        penetration: [],  // Matches schema: modifiers.combat.penetration
        defense: [],      // Matches schema: modifiers.combat.defense (US spelling)
        initiative: [],   // Matches schema: modifiers.combat.initiative
        speed: []         // Matches schema: modifiers.combat.speed
      },
      wounds: [],
      fate: [],
      movement: []
    };
  }

  /**
   * Prepare characteristic totals and bonuses.
   * Fatigue does NOT affect characteristics - it only applies -10 to all Tests.
   * @protected
   * @override
   */
  _prepareCharacteristics() {
    for (const [key, char] of Object.entries(this.characteristics)) {
      // Calculate total: base + (advance * 5) + modifier
      char.total = char.base + (char.advance * 5) + char.modifier;

      // Base modifier is tens digit
      const baseModifier = Math.floor(char.total / 10);

      // Unnatural multiplies the modifier (0 = no unnatural, 2+ = multiplier)
      const unnaturalLevel = char.unnatural || 0;
      char.bonus = unnaturalLevel >= 2 ? baseModifier * unnaturalLevel : baseModifier;
    }

    // Update initiative bonus
    const initChar = this.characteristics[this.initiative.characteristic];
    if (initChar) {
      this.initiative.bonus = initChar.bonus;
    }
  }

  /**
   * Prepare skill totals.
   * @protected
   */
  _prepareSkills() {
    for (const [key, skill] of Object.entries(this.skills)) {
      const char = this.getCharacteristic(skill.characteristic);
      const charTotal = char?.total ?? 0;

      // Determine training level
      const level = skill.plus20 ? 3 : skill.plus10 ? 2 : skill.trained ? 1 : 0;

      // Base value: full characteristic if trained, half if not
      const baseValue = level > 0 ? charTotal : Math.floor(charTotal / 2);

      // Training bonus: +10 for plus10, +20 for plus20
      const trainingBonus = level >= 3 ? 20 : level >= 2 ? 10 : 0;

      // Calculate total
      skill.current = baseValue + trainingBonus + (skill.bonus || 0);

      // Process specialist entries
      if (Array.isArray(skill.entries)) {
        for (const entry of skill.entries) {
          // Use entry's characteristic if set, otherwise inherit from parent skill
          const entryCharKey = entry.characteristic || skill.characteristic;
          const entryChar = this.getCharacteristic(entryCharKey);
          const entryCharTotal = entryChar?.total ?? 0;
          
          const entryLevel = entry.plus20 ? 3 : entry.plus10 ? 2 : entry.trained ? 1 : 0;
          const entryBaseValue = entryLevel > 0 ? entryCharTotal : Math.floor(entryCharTotal / 2);
          const entryTrainingBonus = entryLevel >= 3 ? 20 : entryLevel >= 2 ? 10 : 0;
          entry.current = entryBaseValue + entryTrainingBonus + (entry.bonus || 0);
        }
      }
    }
  }

  /**
   * Prepare psy rating.
   * @protected
   */
  _preparePsy() {
    this.psy.currentRating = this.psy.rating - this.psy.sustained;
  }

  /**
   * Prepare fatigue threshold.
   * Per core rules: threshold = Toughness Bonus.
   * Characters can take TB levels of fatigue before collapsing.
   * Any fatigue imposes -10 to all Tests.
   * @protected
   */
  _prepareFatigue() {
    const toughness = this.characteristics.toughness;
    if (toughness) {
      this.fatigue.max = toughness.bonus;
    }
  }

  /**
   * Compute modifiers from ALL item types - talents, traits, conditions, equipment.
   * @protected
   */
  _computeItemModifiers() {
    const actor = this.parent;
    if (!actor?.items) return;

    const modifierItems = actor.items.filter(item =>
      item.isTalent ||
      item.isTrait ||
      item.isCondition ||
      (item.type === 'armour' && item.system.equipped) ||
      (item.type === 'cybernetic' && item.system.equipped) ||
      (item.type === 'gear' && item.system.equipped)
    );

    for (const item of modifierItems) {
      this._applyItemModifiers(item);
    }
  }

  /**
   * Apply modifiers from a single item.
   * @param {Item} item - The item to process modifiers from
   * @protected
   */
  _applyItemModifiers(item) {
    const mods = item.system?.modifiers;
    if (!mods) return;

    const source = {
      name: item.name,
      type: item.type,
      id: item.id
    };

    // Characteristic modifiers
    if (mods.characteristics) {
      for (const [charKey, value] of Object.entries(mods.characteristics)) {
        if (value && typeof value === 'number') {
          if (!this.modifierSources.characteristics[charKey]) {
            this.modifierSources.characteristics[charKey] = [];
          }
          this.modifierSources.characteristics[charKey].push({ ...source, value });
        }
      }
    }

    // Skill modifiers
    if (mods.skills) {
      for (const [skillKey, value] of Object.entries(mods.skills)) {
        if (value && typeof value === 'number') {
          if (!this.modifierSources.skills[skillKey]) {
            this.modifierSources.skills[skillKey] = [];
          }
          this.modifierSources.skills[skillKey].push({ ...source, value });
        }
      }
    }

    // Combat modifiers
    if (mods.combat) {
      for (const [combatKey, value] of Object.entries(mods.combat)) {
        if (value && typeof value === 'number' && this.modifierSources.combat[combatKey]) {
          this.modifierSources.combat[combatKey].push({ ...source, value });
        }
      }
    }

    // Resources modifiers (wounds, fate, insanity, corruption)
    if (mods.resources) {
      if (mods.resources.wounds && typeof mods.resources.wounds === 'number') {
        this.modifierSources.wounds.push({ ...source, value: mods.resources.wounds });
      }
      if (mods.resources.fate && typeof mods.resources.fate === 'number') {
        this.modifierSources.fate.push({ ...source, value: mods.resources.fate });
      }
      // Note: insanity and corruption modifiers are defined in schema but not yet implemented
    }

    // Movement modifier (from other modifiers array)
    if (mods.other && Array.isArray(mods.other)) {
      for (const mod of mods.other) {
        if (mod.key === 'movement' && typeof mod.value === 'number') {
          this.modifierSources.movement.push({ ...source, value: mod.value, label: mod.label });
        }
      }
    }
  }

  /**
   * Apply item modifiers to characteristics.
   * @protected
   */
  _applyModifiersToCharacteristics() {
    for (const [name, char] of Object.entries(this.characteristics)) {
      const originPathMod = this._getOriginPathCharacteristicModifier(name);
      const itemMod = this._getTotalCharacteristicModifier(name);
      const totalMod = originPathMod + itemMod;

      if (totalMod !== 0) {
        char.originPathModifier = originPathMod;
        char.itemModifier = itemMod;
        char.totalModifier = totalMod;
        char.total += totalMod;

        // Recalculate bonus with new total
        const baseModifier = Math.floor(char.total / 10);
        const unnaturalLevel = char.unnatural || 0;
        char.bonus = unnaturalLevel >= 2 ? baseModifier * unnaturalLevel : baseModifier;
      }
    }

    // Apply combat modifiers from items
    const initMod = this._getTotalCombatModifier('initiative');
    if (initMod !== 0) {
      this.initiative.bonus += initMod;
      this.initiative.itemModifier = initMod;
    }

    // Store combat modifiers for display
    this.combatModifiers = {
      attack: this._getTotalCombatModifier('attack'),     // Schema key: attack
      damage: this._getTotalCombatModifier('damage'),
      penetration: this._getTotalCombatModifier('penetration'),
      defense: this._getTotalCombatModifier('defense'),   // Schema key: defense (US spelling)
      initiative: initMod,
      speed: this._getTotalCombatModifier('speed')
    };
  }

  /**
   * Apply item modifiers to skills.
   * @protected
   */
  _applyModifiersToSkills() {
    for (const [skillKey, skill] of Object.entries(this.skills)) {
      const itemMod = this._getTotalSkillModifier(skillKey);
      if (itemMod !== 0) {
        skill.itemModifier = itemMod;
        skill.current += itemMod;

        if (Array.isArray(skill.entries)) {
          for (const entry of skill.entries) {
            entry.current += itemMod;
          }
        }
      }
    }
  }

  /**
   * Compute armour values for all body locations.
   * @protected
   */
  _computeArmour() {
    const actor = this.parent;
    if (!actor) return;
    Object.assign(this.armour, computeArmour(actor));
  }

  /**
   * Compute encumbrance from carried items.
   * @protected
   */
  _computeEncumbrance() {
    const actor = this.parent;
    if (!actor) return;
    Object.assign(this.encumbrance, computeEncumbrance(actor));
  }

  /* -------------------------------------------- */
  /*  Modifier Getters                            */
  /* -------------------------------------------- */

  /**
   * Get total characteristic modifier from all item sources.
   * @param {string} charKey - The characteristic key
   * @returns {number}
   */
  _getTotalCharacteristicModifier(charKey) {
    const sources = this.modifierSources?.characteristics?.[charKey] || [];
    return sources.reduce((total, src) => total + (src.value || 0), 0);
  }

  /**
   * Get total skill modifier from all item sources.
   * @param {string} skillKey - The skill key
   * @returns {number}
   */
  _getTotalSkillModifier(skillKey) {
    const sources = this.modifierSources?.skills?.[skillKey] || [];
    return sources.reduce((total, src) => total + (src.value || 0), 0);
  }

  /**
   * Get total combat modifier from all item sources.
   * @param {string} combatKey - The combat stat key
   * @returns {number}
   */
  _getTotalCombatModifier(combatKey) {
    const sources = this.modifierSources?.combat?.[combatKey] || [];
    return sources.reduce((total, src) => total + (src.value || 0), 0);
  }

  /**
   * Get total wounds modifier from origin path items.
   * @returns {number}
   */
  _getOriginPathWoundsModifier() {
    const actor = this.parent;
    if (!actor?.items) return 0;
    let total = 0;
    const originItems = actor.items.filter((item) => item.isOriginPath);
    for (const item of originItems) {
      if (item.system?.modifiers?.wounds) {
        total += item.system.modifiers.wounds;
      }
    }
    return total;
  }

  /**
   * Get total fate modifier from origin path items.
   * @returns {number}
   */
  _getOriginPathFateModifier() {
    const actor = this.parent;
    if (!actor?.items) return 0;
    let total = 0;
    const originItems = actor.items.filter((item) => item.isOriginPath);
    for (const item of originItems) {
      if (item.system?.modifiers?.fate) {
        total += item.system.modifiers.fate;
      }
    }
    return total;
  }

  /**
   * Get total characteristic modifier from origin path items.
   * @param {string} charKey - The characteristic key
   * @returns {number}
   */
  _getOriginPathCharacteristicModifier(charKey) {
    const actor = this.parent;
    if (!actor?.items) return 0;
    let total = 0;
    const originItems = actor.items.filter((item) => item.isOriginPath);
    for (const item of originItems) {
      const mods = item.system?.modifiers?.characteristics;
      if (mods && mods[charKey]) {
        total += mods[charKey];
      }
    }
    return total;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Is this creature a psyker?
   * @type {boolean}
   */
  get isPsyker() {
    return this.psy.rating > 0;
  }

  /**
   * Is creature encumbered?
   * @type {boolean}
   */
  get isEncumbered() {
    return this.encumbrance.value > this.encumbrance.max;
  }

  /* -------------------------------------------- */
  /*  Roll Data                                   */
  /* -------------------------------------------- */

  /** @override */
  getRollData() {
    const data = super.getRollData();
    data.pr = this.psy.rating;
    return data;
  }
}
