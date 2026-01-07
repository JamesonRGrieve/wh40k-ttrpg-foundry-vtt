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
   * @param {boolean} hasEntries - Whether skill has specialist entries
   * @returns {SchemaField}
   */
  static SkillField(label, charShort, hasEntries = false) {
    const schema = {
      label: new StringField({ required: true, initial: label }),
      characteristic: new StringField({ required: true, initial: charShort }),
      basic: new BooleanField({ required: true, initial: false }),
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
          basic: new BooleanField({ required: true, initial: false }),
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
        value: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        penaltyActive: new BooleanField({ required: true, initial: false }),
        penalty: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        manualMax: new BooleanField({ required: true, initial: false })
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

      // Skills
      skills: new SchemaField({
        acrobatics: this.SkillField("Acrobatics", "Ag"),
        awareness: this.SkillField("Awareness", "Per"),
        barter: this.SkillField("Barter", "Fel"),
        blather: this.SkillField("Blather", "Fel"),
        carouse: this.SkillField("Carouse", "T"),
        charm: this.SkillField("Charm", "Fel"),
        chemUse: this.SkillField("Chem-Use", "Int"),
        ciphers: this.SkillField("Ciphers", "Int"),
        climb: this.SkillField("Climb", "S"),
        command: this.SkillField("Command", "Fel"),
        commerce: this.SkillField("Commerce", "Fel"),
        concealment: this.SkillField("Concealment", "Ag"),
        contortionist: this.SkillField("Contortionist", "Ag"),
        deceive: this.SkillField("Deceive", "Fel"),
        demolition: this.SkillField("Demolition", "Int"),
        disguise: this.SkillField("Disguise", "Fel"),
        dodge: this.SkillField("Dodge", "Ag"),
        drive: this.SkillField("Drive", "Ag"),
        evaluate: this.SkillField("Evaluate", "Int"),
        gamble: this.SkillField("Gamble", "Int"),
        inquiry: this.SkillField("Inquiry", "Fel"),
        interrogation: this.SkillField("Interrogation", "WP"),
        intimidate: this.SkillField("Intimidate", "S"),
        invocation: this.SkillField("Invocation", "WP"),
        lipReading: this.SkillField("Lip Reading", "Per"),
        literacy: this.SkillField("Literacy", "Int"),
        logic: this.SkillField("Logic", "Int"),
        medicae: this.SkillField("Medicae", "Int"),
        navigation: this.SkillField("Navigation", "Int"),
        psyniscience: this.SkillField("Psyniscience", "Per"),
        scrutiny: this.SkillField("Scrutiny", "Per"),
        search: this.SkillField("Search", "Per"),
        security: this.SkillField("Security", "Ag"),
        shadowing: this.SkillField("Shadowing", "Ag"),
        silentMove: this.SkillField("Silent Move", "Ag"),
        sleightOfHand: this.SkillField("Sleight of Hand", "Ag"),
        survival: this.SkillField("Survival", "Int"),
        swim: this.SkillField("Swim", "S"),
        techUse: this.SkillField("Tech-Use", "Int"),
        tracking: this.SkillField("Tracking", "Int"),
        wrangling: this.SkillField("Wrangling", "Int"),
        // Specialist skills with entries
        commonLore: this.SkillField("Common Lore", "Int", true),
        forbiddenLore: this.SkillField("Forbidden Lore", "Int", true),
        scholasticLore: this.SkillField("Scholastic Lore", "Int", true),
        speakLanguage: this.SkillField("Speak Language", "Int", true),
        secretTongue: this.SkillField("Secret Tongue", "Int", true),
        trade: this.SkillField("Trade", "Int", true),
        performer: this.SkillField("Performer", "Fel", true),
        pilot: this.SkillField("Pilot", "Ag", true),
        // Hidden skills (from other game lines)
        athletics: this.SkillField("Athletics", "S"),
        parry: this.SkillField("Parry", "WS"),
        stealth: this.SkillField("Stealth", "Ag")
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
      })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /** @override */
  static migrateData(source) {
    // Migrate skills specializations -> entries
    if (source.skills) {
      for (const skill of Object.values(source.skills)) {
        if (skill.specializations !== undefined && skill.entries === undefined) {
          skill.entries = skill.specializations;
          delete skill.specializations;
        }
      }
    }
    
    // Ensure fate values are integers
    if (source.fate) {
      source.fate.max = this._toInt(source.fate.max);
      source.fate.value = this._toInt(source.fate.value);
    }
    
    // Ensure psy values are integers
    if (source.psy) {
      source.psy.rating = this._toInt(source.psy.rating);
      source.psy.sustained = this._toInt(source.psy.sustained);
      source.psy.defaultPR = this._toInt(source.psy.defaultPR);
    }
    
    return super.migrateData(source);
  }
  
  /** @override */
  static cleanData(source, options = {}) {
    // Clean integer fields before validation
    if (source?.fate) {
      source.fate.max = this._toInt(source.fate.max);
      source.fate.value = this._toInt(source.fate.value);
    }
    if (source?.psy) {
      source.psy.rating = this._toInt(source.psy.rating);
      source.psy.sustained = this._toInt(source.psy.sustained);
      source.psy.defaultPR = this._toInt(source.psy.defaultPR);
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
   * @protected
   */
  _initializeModifierTracking() {
    this.modifierSources = {
      characteristics: {},
      skills: {},
      combat: {
        toHit: [],
        damage: [],
        initiative: [],
        defence: []
      },
      wounds: [],
      fate: [],
      movement: []
    };
  }

  /**
   * Prepare characteristic totals and bonuses, including fatigue penalty.
   * @protected
   * @override
   */
  _prepareCharacteristics() {
    const fatigueValue = this.fatigue?.value ?? 0;

    for (const [key, char] of Object.entries(this.characteristics)) {
      // Calculate total: base + (advance * 5) + modifier
      char.total = char.base + (char.advance * 5) + char.modifier;

      // Base modifier is tens digit
      const baseModifier = Math.floor(char.total / 10);

      // Unnatural multiplies the modifier (0 = no unnatural, 2+ = multiplier)
      const unnaturalLevel = char.unnatural || 0;
      char.bonus = unnaturalLevel >= 2 ? baseModifier * unnaturalLevel : baseModifier;

      // Apply fatigue penalty if applicable
      if (fatigueValue > char.bonus) {
        char.total = Math.ceil(char.total / 2);
        const fatigueBaseModifier = Math.floor(char.total / 10);
        char.bonus = unnaturalLevel >= 2 ? fatigueBaseModifier * unnaturalLevel : fatigueBaseModifier;
      }
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
          const entryChar = entry.characteristic ? this.getCharacteristic(entry.characteristic) : char;
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
   * Prepare fatigue max.
   * Only auto-calculates if not manually overridden.
   * @protected
   */
  _prepareFatigue() {
    const toughness = this.characteristics.toughness;
    const willpower = this.characteristics.willpower;
    if (toughness && willpower && !this.fatigue.manualMax) {
      this.fatigue.max = toughness.bonus + willpower.bonus;
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

    // Wounds modifier
    if (mods.wounds && typeof mods.wounds === 'number') {
      this.modifierSources.wounds.push({ ...source, value: mods.wounds });
    }

    // Fate modifier
    if (mods.fate && typeof mods.fate === 'number') {
      this.modifierSources.fate.push({ ...source, value: mods.fate });
    }

    // Movement modifier
    if (mods.movement && typeof mods.movement === 'number') {
      this.modifierSources.movement.push({ ...source, value: mods.movement });
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
      toHit: this._getTotalCombatModifier('toHit'),
      damage: this._getTotalCombatModifier('damage'),
      initiative: initMod,
      defence: this._getTotalCombatModifier('defence')
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
