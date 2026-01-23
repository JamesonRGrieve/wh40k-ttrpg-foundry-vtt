import CreatureTemplate from "./templates/creature.mjs";

const { NumberField, SchemaField, StringField, BooleanField, ArrayField, ObjectField, HTMLField, SetField } = foundry.data.fields;

/**
 * List of characteristic keys used for character generation (excludes Influence).
 * @type {string[]}
 */
const GENERATION_CHARACTERISTICS = [
  'weaponSkill', 'ballisticSkill', 'strength', 'toughness',
  'agility', 'intelligence', 'perception', 'willpower', 'fellowship'
];

/**
 * Data model for Character (Acolyte) actors.
 * Extends CreatureTemplate with character-specific fields like bio, experience, origin path.
 * @extends {CreatureTemplate}
 */
export default class CharacterData extends CreatureTemplate {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      // ===== ROGUE TRADER SPECIFIC =====
      rogueTrader: new SchemaField({
        careerPath: new StringField({ required: false, blank: true }),
        rank: new StringField({ required: false, blank: true }),
        homeWorld: new StringField({ required: false, blank: true }),
        motivation: new StringField({ required: false, blank: true }),
        profitFactor: new SchemaField({
          starting: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          current: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          modifier: new NumberField({ required: true, initial: 0, integer: true }),
          misfortunes: new StringField({ required: false, blank: true })
        }),
        endeavour: new SchemaField({
          name: new StringField({ required: false, blank: true }),
          achievementCurrent: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          achievementRequired: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          reward: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          notes: new StringField({ required: false, blank: true })
        }),
        shipName: new StringField({ required: false, blank: true }),
        dynasty: new SchemaField({
          name: new StringField({ required: false, blank: true }),
          history: new HTMLField({ required: false, blank: true }),
          reputation: new NumberField({ required: true, initial: 0, integer: true })
        }),
        armour: new SchemaField({
          head: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          rightArm: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          leftArm: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          body: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          rightLeg: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          leftLeg: new NumberField({ required: true, initial: 0, min: 0, integer: true })
        }),
        lifting: new SchemaField({
          lift: new NumberField({ required: true, initial: 0, min: 0 }),
          carry: new NumberField({ required: true, initial: 0, min: 0 }),
          push: new NumberField({ required: true, initial: 0, min: 0 })
        }),
        armourWeight: new NumberField({ required: true, initial: 0, min: 0 }),
        weight: new SchemaField({
          total: new NumberField({ required: true, initial: 0, min: 0 }),
          current: new NumberField({ required: true, initial: 0, min: 0 })
        }),
        acquisitions: new ArrayField(
          new SchemaField({
            name: new StringField({ required: false, blank: true }),
            availability: new StringField({ required: false, blank: true }),
            modifier: new NumberField({ required: true, initial: 0, integer: true }),
            notes: new StringField({ required: false, blank: true }),
            acquired: new BooleanField({ required: true, initial: false })
          }),
          { required: true, initial: [] }
        ),
        mutations: new StringField({ required: false, blank: true })
      }),

      // ===== CHARACTER BIOGRAPHY =====
      bio: new SchemaField({
        playerName: new StringField({ required: false, blank: true }),
        gender: new StringField({ required: false, blank: true }),
        age: new StringField({ required: false, blank: true }),
        build: new StringField({ required: false, blank: true }),
        complexion: new StringField({ required: false, blank: true }),
        hair: new StringField({ required: false, blank: true }),
        eyes: new StringField({ required: false, blank: true }),
        quirks: new StringField({ required: false, blank: true }),
        superstition: new StringField({ required: false, blank: true }),
        mementos: new StringField({ required: false, blank: true }),
        notes: new HTMLField({ required: false, blank: true })
      }),

      // ===== ORIGIN PATH =====
      originPath: new SchemaField({
        homeWorld: new StringField({ required: false, blank: true }),
        birthright: new StringField({ required: false, blank: true }),
        lureOfTheVoid: new StringField({ required: false, blank: true }),
        trialsAndTravails: new StringField({ required: false, blank: true }),
        motivation: new StringField({ required: false, blank: true }),
        career: new StringField({ required: false, blank: true })
      }),

      // ===== EXPERIENCE =====
      experience: new SchemaField({
        used: new NumberField({ required: true, initial: 4500, min: 0, integer: true }),
        total: new NumberField({ required: true, initial: 5000, min: 0, integer: true }),
        // Derived
        available: new NumberField({ required: true, initial: 500, integer: true }),
        spentCharacteristics: new NumberField({ required: true, initial: 0, integer: true }),
        spentSkills: new NumberField({ required: true, initial: 0, integer: true }),
        spentTalents: new NumberField({ required: true, initial: 0, integer: true }),
        spentPsychicPowers: new NumberField({ required: true, initial: 0, integer: true }),
        calculatedTotal: new NumberField({ required: true, initial: 0, integer: true })
      }),

      // ===== MENTAL STATE =====
      insanity: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
      corruption: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
      insanityBonus: new NumberField({ required: true, initial: 0, integer: true }),
      corruptionBonus: new NumberField({ required: true, initial: 0, integer: true }),

      // ===== OTHER =====
      aptitudes: new ObjectField({ required: true, initial: {} }),

      backgroundEffects: new SchemaField({
        abilities: new ArrayField(
          new SchemaField({
            source: new StringField({ required: false }),
            name: new StringField({ required: false }),
            benefit: new StringField({ required: false })
          }),
          { required: true, initial: [] }
        )
      }),

      // Wounds modifier tracking
      totalWoundsModifier: new NumberField({ required: true, initial: 0, integer: true }),
      totalFateModifier: new NumberField({ required: true, initial: 0, integer: true }),

      // ===== CHARACTER GENERATION =====
      characterGeneration: new SchemaField({
        // Track raw dice rolls (2D20 summed for each characteristic)
        rolls: new ArrayField(
          new NumberField({ required: true, initial: 0, integer: true, min: 0, max: 40 }),
          { initial: [] }
        ),
        // Maps characteristic key to roll index (0-8), or null if unassigned
        assignments: new SchemaField(
          Object.fromEntries(
            GENERATION_CHARACTERISTICS.map(key => [
              key,
              new NumberField({ required: false, nullable: true, initial: null, integer: true, min: 0, max: 8 })
            ])
          )
        ),
        // Custom base values (for non-human races)
        customBases: new SchemaField({
          enabled: new BooleanField({ initial: false }),
          ...Object.fromEntries(
            GENERATION_CHARACTERISTICS.map(key => [
              key,
              new NumberField({ required: true, initial: 25, integer: true, min: 0 })
            ])
          )
        })
      })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /** @override */
  static migrateData(source) {
    // Handle old characteristic field names
    if (source.characteristics) {
      for (const char of Object.values(source.characteristics)) {
        if (char.starting !== undefined && char.base === undefined) {
          char.base = char.starting;
          delete char.starting;
        }
        if (char.advances !== undefined && char.advance === undefined) {
          char.advance = char.advances;
          delete char.advances;
        }
        if (char.abbreviation !== undefined && char.short === undefined) {
          char.short = char.abbreviation;
          delete char.abbreviation;
        }
      }
    }
    return super.migrateData(source);
  }

  /** @override */
  static cleanData(source, options = {}) {
    // Only clean properties that actually exist in the update
    if (source?.experience) {
      if (source.experience.used !== undefined) {
        source.experience.used = this._toInt(source.experience.used);
      }
      if (source.experience.total !== undefined) {
        source.experience.total = this._toInt(source.experience.total);
      }
      if (source.experience.available !== undefined) {
        source.experience.available = this._toInt(source.experience.available);
      }
      if (source.experience.spentCharacteristics !== undefined) {
        source.experience.spentCharacteristics = this._toInt(source.experience.spentCharacteristics);
      }
      if (source.experience.spentSkills !== undefined) {
        source.experience.spentSkills = this._toInt(source.experience.spentSkills);
      }
      if (source.experience.spentTalents !== undefined) {
        source.experience.spentTalents = this._toInt(source.experience.spentTalents);
      }
      if (source.experience.spentPsychicPowers !== undefined) {
        source.experience.spentPsychicPowers = this._toInt(source.experience.spentPsychicPowers);
      }
      if (source.experience.calculatedTotal !== undefined) {
        source.experience.calculatedTotal = this._toInt(source.experience.calculatedTotal);
      }
    }
    if (source?.insanity !== undefined) {
      source.insanity = this._toInt(source.insanity);
    }
    if (source?.corruption !== undefined) {
      source.corruption = this._toInt(source.corruption);
    }
    if (source?.insanityBonus !== undefined) {
      source.insanityBonus = this._toInt(source.insanityBonus);
    }
    if (source?.corruptionBonus !== undefined) {
      source.corruptionBonus = this._toInt(source.corruptionBonus);
    }
    return super.cleanData(source, options);
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this._prepareExperience();
    this._prepareMentalState();
  }

  /** @inheritDoc */
  prepareEmbeddedData() {
    super.prepareEmbeddedData();
    this._computeOriginPathEffects();
    this._computeExperienceSpent();
    this._updateWoundsFateModifiers();
  }

  /**
   * Prepare experience calculations.
   * @protected
   */
  _prepareExperience() {
    this.experience.available = this.experience.total - this.experience.used;
  }

  /**
   * Prepare insanity and corruption derived values.
   * @protected
   */
  _prepareMentalState() {
    this.insanityBonus = Math.floor(this.insanity / 10);
    this.corruptionBonus = Math.floor(this.corruption / 10);
  }

  /**
   * Compute origin path effects from items.
   * @protected
   */
  _computeOriginPathEffects() {
    const actor = this.parent;
    if (!actor?.items) return;

    const originItems = actor.items.filter((item) => item.isOriginPath);

    const stepMap = {
      'Home World': null,
      'Birthright': null,
      'Lure of the Void': null,
      'Trials and Travails': null,
      'Motivation': null,
      'Career': null
    };

    // Reset background abilities
    this.backgroundEffects.abilities = [];

    for (const item of originItems) {
      const step = item.flags?.rt?.step || item.system?.step || '';
      if (Object.prototype.hasOwnProperty.call(stepMap, step)) {
        stepMap[step] = item;
      }

      this.backgroundEffects.abilities.push({
        source: step || 'Origin Path',
        name: item.name,
        benefit: item.system?.effects || item.system?.descriptionText || item.system?.description?.value || '',
      });
    }

    // Store origin path selections
    this.backgroundEffects.originPath = stepMap;

    // Update the originPath system data with the names
    if (this.originPath) {
      this.originPath.homeWorld = stepMap['Home World']?.name || '';
      this.originPath.birthright = stepMap['Birthright']?.name || '';
      this.originPath.lureOfTheVoid = stepMap['Lure of the Void']?.name || '';
      this.originPath.trialsAndTravails = stepMap['Trials and Travails']?.name || '';
      this.originPath.motivation = stepMap['Motivation']?.name || '';
      this.originPath.career = stepMap['Career']?.name || '';
    }
  }

  /**
   * Compute experience spent from items and stats.
   * @protected
   */
  _computeExperienceSpent() {
    const actor = this.parent;
    if (!actor?.items || !this.experience) return;

    this.experience.spentCharacteristics = 0;
    this.experience.spentSkills = 0;
    this.experience.spentTalents = 0;
    this.experience.spentPsychicPowers = this.psy.cost;

    for (const characteristic of Object.values(this.characteristics)) {
      this.experience.spentCharacteristics += parseInt(characteristic.cost, 10);
    }

    for (const skill of Object.values(this.skills)) {
      if (Array.isArray(skill.entries)) {
        for (const speciality of skill.entries) {
          this.experience.spentSkills += parseInt(speciality.cost ?? 0, 10);
        }
      } else {
        this.experience.spentSkills += parseInt(skill.cost ?? 0, 10);
      }
    }

    for (const item of actor.items) {
      if (item.isTalent) {
        this.experience.spentTalents += parseInt(item.cost, 10);
      } else if (item.isPsychicPower) {
        this.experience.spentPsychicPowers += parseInt(item.cost, 10);
      }
    }

    this.experience.calculatedTotal =
      this.experience.spentCharacteristics + this.experience.spentSkills +
      this.experience.spentTalents + this.experience.spentPsychicPowers;
  }

  /**
   * Update wounds and fate modifier totals for display.
   * @protected
   */
  _updateWoundsFateModifiers() {
    const itemWounds = this.modifierSources?.wounds?.reduce((total, src) => total + (src.value || 0), 0) || 0;
    const itemFate = this.modifierSources?.fate?.reduce((total, src) => total + (src.value || 0), 0) || 0;

    this.totalWoundsModifier = itemWounds + this._getOriginPathWoundsModifier();
    this.totalFateModifier = itemFate + this._getOriginPathFateModifier();
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the effective profit factor.
   * @type {number}
   */
  get effectiveProfitFactor() {
    return this.rogueTrader.profitFactor.current + this.rogueTrader.profitFactor.modifier;
  }

  /**
   * Get corruption level.
   * @type {string}
   */
  get corruptionLevel() {
    const cp = this.corruption;
    if (cp < 30) return "none";
    if (cp < 60) return "tainted";
    if (cp < 90) return "corrupted";
    return "lost";
  }

  /**
   * Get insanity degrees.
   * @type {number}
   */
  get insanityDegrees() {
    return Math.floor(this.insanity / 10);
  }

  /* -------------------------------------------- */
  /*  Roll Data                                   */
  /* -------------------------------------------- */

  /** @override */
  getRollData() {
    const data = super.getRollData();
    data.pf = this.effectiveProfitFactor;
    return data;
  }
}
