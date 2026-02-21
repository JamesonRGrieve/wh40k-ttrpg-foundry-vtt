import ActorDataModel from "../abstract/actor-data-model.mjs";
import HordeTemplate from "./mixins/horde-template.mjs";

const { 
  NumberField, 
  SchemaField, 
  StringField, 
  BooleanField, 
  ArrayField, 
  ObjectField, 
  HTMLField 
} = foundry.data.fields;

/**
 * Data model for NPC V2 actors.
 * Independent model architecture - does NOT extend CreatureTemplate.
 * 
 * Designed for GM-centric workflow with:
 * - Minimal complexity (no XP, origin paths, acquisitions)
 * - Horde mechanics via mixin
 * - Manual stat overrides
 * - Simple weapon/armour modes
 * 
 * @extends {ActorDataModel}
 */
export default class NPCDataV2 extends HordeTemplate(ActorDataModel) {
  
  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /**
   * Characteristic schema factory.
   * @param {string} label - Display label
   * @param {string} short - Short name (e.g., "WS")
   * @returns {SchemaField}
   * @private
   */
  static _CharacteristicField(label, short) {
    return new SchemaField({
      label: new StringField({ required: true, initial: label }),
      short: new StringField({ required: true, initial: short }),
      base: new NumberField({ required: true, initial: 30, integer: true }),
      modifier: new NumberField({ required: true, initial: 0, integer: true }),
      unnatural: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
      // Derived values
      total: new NumberField({ required: true, initial: 30, integer: true }),
      bonus: new NumberField({ required: true, initial: 3, integer: true })
    });
  }

  /** @inheritDoc */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      
      // === CORE IDENTITY ===
      faction: new StringField({ required: false, initial: "", blank: true }),
      subfaction: new StringField({ required: false, initial: "", blank: true }),
      allegiance: new StringField({ required: false, initial: "", blank: true }),
      
      // Primary use: determines optimal sheet layout
      primaryUse: new StringField({
        required: true,
        initial: "npc",
        choices: ["npc", "vehicle", "ship"],
        label: "RT.NPC.PrimaryUse"
      }),
      
      role: new StringField({
        required: true,
        initial: "bruiser",
        choices: ["bruiser", "sniper", "caster", "support", "commander", "specialist"]
      }),
      
      type: new StringField({
        required: true,
        initial: "troop",
        choices: ["troop", "elite", "master", "horde", "swarm", "creature", "daemon", "xenos"]
      }),
      
      threatLevel: new NumberField({ 
        required: true, 
        initial: 5, 
        min: 1, 
        max: 30, 
        integer: true 
      }),
      
      // === CHARACTERISTICS ===
      characteristics: new SchemaField({
        weaponSkill: this._CharacteristicField("Weapon Skill", "WS"),
        ballisticSkill: this._CharacteristicField("Ballistic Skill", "BS"),
        strength: this._CharacteristicField("Strength", "S"),
        toughness: this._CharacteristicField("Toughness", "T"),
        agility: this._CharacteristicField("Agility", "Ag"),
        intelligence: this._CharacteristicField("Intelligence", "Int"),
        perception: this._CharacteristicField("Perception", "Per"),
        willpower: this._CharacteristicField("Willpower", "WP"),
        fellowship: this._CharacteristicField("Fellowship", "Fel"),
        influence: this._CharacteristicField("Influence", "Inf")
      }),
      
      // === WOUNDS ===
      wounds: new SchemaField({
        max: new NumberField({ required: true, initial: 10, min: 0, integer: true }),
        value: new NumberField({ required: true, initial: 10, min: 0, integer: true }),
        critical: new NumberField({ required: true, initial: 0, min: 0, integer: true })
      }),
      
      // === MOVEMENT ===
      movement: new SchemaField({
        half: new NumberField({ required: true, initial: 3, min: 0 }),
        full: new NumberField({ required: true, initial: 6, min: 0 }),
        charge: new NumberField({ required: true, initial: 9, min: 0 }),
        run: new NumberField({ required: true, initial: 18, min: 0 })
      }),
      
      size: new NumberField({ required: true, initial: 4, min: 1, max: 10, integer: true }),
      
      // === INITIATIVE ===
      initiative: new SchemaField({
        characteristic: new StringField({ required: true, initial: "agility" }),
        base: new StringField({ required: true, initial: "1d10" }),
        bonus: new NumberField({ required: true, initial: 0, integer: true })
      }),
      
      // === TRAINED SKILLS (SPARSE) ===
      // Only store skills the NPC actually has, not all 48
      trainedSkills: new ObjectField({
        required: true,
        initial: {}
        // Format: { "awareness": { trained: true, plus10: false, plus20: false, bonus: 10 } }
      }),
      
      // === WEAPONS (SIMPLE MODE) ===
      // NPCs use simple inline weapons, not full item-based weapons
      weapons: new SchemaField({
        mode: new StringField({
          required: true,
          initial: "simple",
          choices: ["simple", "embedded"]
        }),
        simple: new ArrayField(
          new SchemaField({
            name: new StringField({ required: true, initial: "" }),
            damage: new StringField({ required: true, initial: "1d10" }),
            pen: new NumberField({ required: true, initial: 0, integer: true }),
            range: new StringField({ required: true, initial: "Melee" }),
            rof: new StringField({ required: true, initial: "S/-/-" }),
            clip: new NumberField({ required: true, initial: 0, integer: true }),
            reload: new StringField({ required: true, initial: "-" }),
            special: new StringField({ required: false, initial: "", blank: true }),
            class: new StringField({
              required: true,
              initial: "melee",
              choices: ["melee", "pistol", "basic", "heavy", "thrown", "launcher"]
            })
          }),
          { required: true, initial: [] }
        )
      }),
      
      // === ARMOUR (SIMPLE MODE) ===
      armour: new SchemaField({
        mode: new StringField({
          required: true,
          initial: "simple",
          choices: ["simple", "locations"]
        }),
        total: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        // Location-based (if mode is "locations")
        locations: new SchemaField({
          head: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          body: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          leftArm: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          rightArm: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          leftLeg: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
          rightLeg: new NumberField({ required: true, initial: 0, min: 0, integer: true })
        })
      }),
      
      // === SPECIAL ABILITIES ===
      specialAbilities: new HTMLField({ required: false, initial: "", blank: true }),
      
      // === CUSTOM STATS (MANUAL OVERRIDES) ===
      // Allows GM to manually override any calculated value
      customStats: new SchemaField({
        enabled: new BooleanField({ required: true, initial: false }),
        characteristics: new ObjectField({ initial: {} }), // { "strength": 42 }
        skills: new ObjectField({ initial: {} }),          // { "awareness": 65 }
        combat: new SchemaField({
          initiative: new NumberField({ required: false, nullable: true }),
          dodge: new NumberField({ required: false, nullable: true }),
          parry: new NumberField({ required: false, nullable: true })
        }),
        wounds: new NumberField({ required: false, nullable: true }),
        movement: new NumberField({ required: false, nullable: true })
      }),
      
      // === PINNED ABILITIES ===
      // Track which abilities are pinned for overview display
      pinnedAbilities: new ArrayField(
        new StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
      // === GM UTILITIES ===
      template: new StringField({ required: false, initial: "", blank: true }), // UUID of source template
      quickNotes: new HTMLField({ required: false, initial: "", blank: true }), // GM-only tactical notes
      tags: new ArrayField(
        new StringField({ required: true }),
        { required: true, initial: [] }
      ),
      
      // === ROLEPLAY FIELDS ===
      personality: new SchemaField({
        demeanor: new StringField({ required: false, initial: "", blank: true }),
        goals: new StringField({ required: false, initial: "", blank: true }),
        fears: new StringField({ required: false, initial: "", blank: true }),
        quirks: new StringField({ required: false, initial: "", blank: true })
      }),
      
      // === NOTES ===
      description: new HTMLField({ required: false, initial: "", blank: true }),
      tactics: new HTMLField({ required: false, initial: "", blank: true }),
      source: new StringField({ required: false, initial: "", blank: true }) // Book reference
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the NPC type label.
   * @type {string}
   */
  get typeLabel() {
    const key = `RT.NPCType.${this.type.charAt(0).toUpperCase()}${this.type.slice(1)}`;
    return game.i18n.localize(key);
  }

  /**
   * Get threat level description.
   * @type {string}
   */
  get threatDescription() {
    if (this.threatLevel <= 5) return game.i18n.localize("RT.Threat.Low");
    if (this.threatLevel <= 10) return game.i18n.localize("RT.Threat.Moderate");
    if (this.threatLevel <= 15) return game.i18n.localize("RT.Threat.Dangerous");
    if (this.threatLevel <= 20) return game.i18n.localize("RT.Threat.Deadly");
    return game.i18n.localize("RT.Threat.Apocalyptic");
  }

  /**
   * Get a threat summary string.
   * @type {string}
   */
  get threatSummary() {
    return `${this.typeLabel} (Threat ${this.threatLevel})`;
  }

  /**
   * Is this a horde-type NPC?
   * @type {boolean}
   */
  get isHorde() {
    return this.type === "horde" || this.type === "swarm";
  }

  /**
   * Is this a significant threat (elite or above)?
   * @type {boolean}
   */
  get isElite() {
    return this.type === "elite" || this.type === "master";
  }

  /**
   * Get role label.
   * @type {string}
   */
  get roleLabel() {
    const key = `RT.NPCRole.${this.role.charAt(0).toUpperCase()}${this.role.slice(1)}`;
    return game.i18n.localize(key);
  }

  /**
   * Get toughness bonus.
   * @type {number}
   */
  get toughnessBonus() {
    return this.characteristics.toughness?.bonus ?? 0;
  }

  /**
   * Get threat tier info with color and label.
   * @type {Object}
   */
  get threatTier() {
    const t = this.threatLevel;
    if (t <= 5) return { key: "minor", label: "Hereticus Minoris", color: "#4caf50" };
    if (t <= 10) return { key: "standard", label: "Hereticus Medius", color: "#2196f3" };
    if (t <= 15) return { key: "tough", label: "Hereticus Gravis", color: "#ff9800" };
    if (t <= 20) return { key: "elite", label: "Hereticus Extremis", color: "#f44336" };
    return { key: "boss", label: "Hereticus Maximus", color: "#9c27b0" };
  }

  /**
   * Get effective stats with custom overrides applied.
   * @type {Object}
   */
  get effectiveStats() {
    const stats = {
      characteristics: {},
      skills: {},
      combat: {
        initiative: this.initiative.bonus,
        dodge: this.getSkillTarget("dodge"),
        parry: this.getSkillTarget("parry")
      },
      wounds: this.wounds.max,
      movement: this.movement.half
    };

    // Copy characteristics
    for (const [key, char] of Object.entries(this.characteristics)) {
      stats.characteristics[key] = char.total;
    }

    // Copy trained skills
    for (const [key, skill] of Object.entries(this.trainedSkills)) {
      stats.skills[key] = this.getSkillTarget(key);
    }

    // Apply custom overrides if enabled
    if (this.customStats?.enabled) {
      // Override characteristics
      for (const [key, value] of Object.entries(this.customStats.characteristics || {})) {
        if (value !== null && value !== undefined) {
          stats.characteristics[key] = value;
        }
      }
      // Override skills
      for (const [key, value] of Object.entries(this.customStats.skills || {})) {
        if (value !== null && value !== undefined) {
          stats.skills[key] = value;
        }
      }
      // Override combat stats
      if (this.customStats.combat?.initiative !== null && this.customStats.combat?.initiative !== undefined) {
        stats.combat.initiative = this.customStats.combat.initiative;
      }
      if (this.customStats.combat?.dodge !== null && this.customStats.combat?.dodge !== undefined) {
        stats.combat.dodge = this.customStats.combat.dodge;
      }
      if (this.customStats.combat?.parry !== null && this.customStats.combat?.parry !== undefined) {
        stats.combat.parry = this.customStats.combat.parry;
      }
      // Override wounds
      if (this.customStats.wounds !== null && this.customStats.wounds !== undefined) {
        stats.wounds = this.customStats.wounds;
      }
      // Override movement
      if (this.customStats.movement !== null && this.customStats.movement !== undefined) {
        stats.movement = this.customStats.movement;
      }
    }

    return stats;
  }

  /**
   * Get the list of trained skills as an array for display.
   * @type {Array<Object>}
   */
  get trainedSkillsList() {
    const list = [];
    for (const [key, skill] of Object.entries(this.trainedSkills)) {
      list.push({
        key,
        name: skill.name || key,
        characteristic: skill.characteristic || "Per",
        trained: skill.trained || false,
        plus10: skill.plus10 || false,
        plus20: skill.plus20 || false,
        bonus: skill.bonus || 0,
        target: this.getSkillTarget(key)
      });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  /* -------------------------------------------- */
  /*  Characteristic Mapping                      */
  /* -------------------------------------------- */

  /**
   * Map characteristic short names to full keys.
   * @type {Object<string, string>}
   */
  static CHARACTERISTIC_MAP = {
    "WS": "weaponSkill",
    "BS": "ballisticSkill",
    "S": "strength",
    "T": "toughness",
    "Ag": "agility",
    "Int": "intelligence",
    "Per": "perception",
    "WP": "willpower",
    "Fel": "fellowship",
    "Inf": "influence"
  };

  /**
   * Get a characteristic by its short name or full key.
   * @param {string} key - Short name (e.g., "Ag") or full key (e.g., "agility")
   * @returns {object|null}
   */
  getCharacteristic(key) {
    if (this.characteristics[key]) {
      return this.characteristics[key];
    }
    const fullKey = NPCDataV2.CHARACTERISTIC_MAP[key];
    if (fullKey && this.characteristics[fullKey]) {
      return this.characteristics[fullKey];
    }
    return null;
  }

  /* -------------------------------------------- */
  /*  Skill Methods                               */
  /* -------------------------------------------- */

  /**
   * Default skill-to-characteristic mapping.
   * @type {Object<string, string>}
   */
  static SKILL_CHARACTERISTIC_MAP = {
    acrobatics: "agility",
    athletics: "strength",
    awareness: "perception",
    charm: "fellowship",
    command: "fellowship",
    commerce: "fellowship",
    commonLore: "intelligence",
    deceive: "fellowship",
    dodge: "agility",
    evaluate: "intelligence",
    forbiddenLore: "intelligence",
    inquiry: "fellowship",
    interrogation: "willpower",
    intimidate: "strength",
    linguistics: "intelligence",
    logic: "intelligence",
    medicae: "intelligence",
    navigate: "intelligence",
    operate: "agility",
    parry: "weaponSkill",
    psyniscience: "perception",
    scholasticLore: "intelligence",
    scrutiny: "perception",
    security: "intelligence",
    sleightOfHand: "agility",
    stealth: "agility",
    survival: "perception",
    techUse: "intelligence",
    trade: "intelligence"
  };

  /**
   * Calculate the target number for a skill test.
   * @param {string} skillName - The skill key (e.g., "awareness", "dodge")
   * @returns {number} The target number for the skill test.
   */
  getSkillTarget(skillName) {
    const skill = this.trainedSkills[skillName];
    const charKey = skill?.characteristic || NPCDataV2.SKILL_CHARACTERISTIC_MAP[skillName] || "perception";
    const char = this.getCharacteristic(charKey);
    if (!char) return 0;

    let target = char.total;

    // Apply training bonuses
    if (skill) {
      if (skill.trained) target += 0; // Trained: no penalty (baseline)
      if (skill.plus10) target += 10;
      if (skill.plus20) target += 10; // +20 is cumulative with +10
      target += (skill.bonus || 0);
    } else {
      // Untrained skill: use half the characteristic value
      target = Math.floor(char.total / 2);
    }

    // Apply custom override if enabled
    if (this.customStats?.enabled && this.customStats.skills?.[skillName] !== null && this.customStats.skills?.[skillName] !== undefined) {
      return this.customStats.skills[skillName];
    }

    return target;
  }

  /**
   * Add a trained skill to this NPC.
   * @param {string} name - The skill key
   * @param {string} characteristic - The characteristic key
   * @param {string} level - Training level: "trained", "plus10", or "plus20"
   * @param {number} bonus - Additional bonus
   * @returns {Promise<Actor>}
   */
  async addTrainedSkill(name, characteristic = null, level = "trained", bonus = 0) {
    const skills = foundry.utils.deepClone(this.trainedSkills);
    
    const charKey = characteristic || NPCDataV2.SKILL_CHARACTERISTIC_MAP[name] || "perception";
    
    skills[name] = {
      name: name,
      characteristic: charKey,
      trained: true,
      plus10: level === "plus10" || level === "plus20",
      plus20: level === "plus20",
      bonus: bonus
    };

    return this.parent.update({ "system.trainedSkills": skills });
  }

  /**
   * Remove a trained skill from this NPC.
   * @param {string} name - The skill key
   * @returns {Promise<Actor>}
   */
  async removeSkill(name) {
    const skills = foundry.utils.deepClone(this.trainedSkills);
    delete skills[name];
    return this.parent.update({ "system.trainedSkills": skills });
  }

  /**
   * Update a trained skill's properties.
   * @param {string} name - The skill key
   * @param {Object} updates - Properties to update
   * @returns {Promise<Actor>}
   */
  async updateSkill(name, updates) {
    const skills = foundry.utils.deepClone(this.trainedSkills);
    if (!skills[name]) return this.parent;
    
    Object.assign(skills[name], updates);
    return this.parent.update({ "system.trainedSkills": skills });
  }

  /* -------------------------------------------- */
  /*  Weapon Methods                              */
  /* -------------------------------------------- */

  /**
   * Switch weapon mode between simple and embedded.
   * @param {string} mode - The mode to switch to: "simple" or "embedded"
   * @returns {Promise<Actor>}
   */
  async switchWeaponMode(mode) {
    if (!["simple", "embedded"].includes(mode)) return this.parent;
    return this.parent.update({ "system.weapons.mode": mode });
  }

  /**
   * Add a simple weapon.
   * @param {Object} data - Weapon data
   * @returns {Promise<Actor>}
   */
  async addSimpleWeapon(data = {}) {
    const weapons = foundry.utils.deepClone(this.weapons.simple || []);
    weapons.push({
      name: data.name || "New Weapon",
      damage: data.damage || "1d10",
      pen: data.pen || 0,
      range: data.range || "Melee",
      rof: data.rof || "S/-/-",
      clip: data.clip || 0,
      reload: data.reload || "-",
      special: data.special || "",
      class: data.class || "melee"
    });
    return this.parent.update({ "system.weapons.simple": weapons });
  }

  /**
   * Remove a simple weapon by index.
   * @param {number} index - The weapon index
   * @returns {Promise<Actor>}
   */
  async removeSimpleWeapon(index) {
    const weapons = foundry.utils.deepClone(this.weapons.simple || []);
    if (index < 0 || index >= weapons.length) return this.parent;
    weapons.splice(index, 1);
    return this.parent.update({ "system.weapons.simple": weapons });
  }

  /**
   * Promote a simple weapon to an embedded weapon item.
   * @param {number} index - The simple weapon index to promote
   * @returns {Promise<Item|null>} The created weapon item, or null on failure
   */
  async promoteSimpleWeapon(index) {
    const weapons = this.weapons.simple || [];
    const weapon = weapons[index];
    if (!weapon) return null;

    // Create the weapon item
    const itemData = {
      name: weapon.name,
      type: "weapon",
      system: {
        damage: weapon.damage,
        penetration: weapon.pen,
        range: weapon.range,
        rateOfFire: weapon.rof,
        clip: weapon.clip,
        reload: weapon.reload,
        special: weapon.special,
        class: weapon.class
      }
    };

    const [createdItem] = await this.parent.createEmbeddedDocuments("Item", [itemData]);

    // Remove from simple weapons
    if (createdItem) {
      await this.removeSimpleWeapon(index);
    }

    return createdItem;
  }

  /* -------------------------------------------- */
  /*  Armour Methods                              */
  /* -------------------------------------------- */

  /**
   * Switch armour mode between simple and locations.
   * @param {string} mode - The mode to switch to: "simple" or "locations"
   * @returns {Promise<Actor>}
   */
  async switchArmourMode(mode) {
    if (!["simple", "locations"].includes(mode)) return this.parent;
    return this.parent.update({ "system.armour.mode": mode });
  }

  /**
   * Get armour value for a specific location.
   * @param {string} location - The location key (head, body, leftArm, etc.)
   * @returns {number} The armour value
   */
  getArmourForLocation(location) {
    if (this.armour.mode === "simple") {
      return this.armour.total;
    }
    return this.armour.locations?.[location] ?? 0;
  }

  /* -------------------------------------------- */
  /*  Favorite Skills & Talents                   */
  /* -------------------------------------------- */

  /**
   * Toggle favorite status for a skill.
   * @param {string} skillKey - The skill key to toggle
   * @returns {Promise<Actor>}
   */
  async toggleFavoriteSkill(skillKey) {
    const favorites = [...(this.parent.getFlag("rogue-trader", "favoriteSkills") || [])];
    const index = favorites.indexOf(skillKey);
    if (index >= 0) favorites.splice(index, 1);
    else favorites.push(skillKey);
    return this.parent.setFlag("rogue-trader", "favoriteSkills", favorites);
  }

  /**
   * Toggle favorite status for a talent.
   * @param {string} itemId - The talent item ID to toggle
   * @returns {Promise<Actor>}
   */
  async toggleFavoriteTalent(itemId) {
    const favorites = [...(this.parent.getFlag("rogue-trader", "favoriteTalents") || [])];
    const index = favorites.indexOf(itemId);
    if (index >= 0) favorites.splice(index, 1);
    else favorites.push(itemId);
    return this.parent.setFlag("rogue-trader", "favoriteTalents", favorites);
  }

  /**
   * Get list of favorite skill keys.
   * @type {Array<string>}
   */
  get favoriteSkills() {
    return this.parent.getFlag("rogue-trader", "favoriteSkills") || [];
  }

  /**
   * Get list of favorite talent IDs.
   * @type {Array<string>}
   */
  get favoriteTalents() {
    return this.parent.getFlag("rogue-trader", "favoriteTalents") || [];
  }

  /* -------------------------------------------- */
  /*  Pinned Abilities                            */
  /* -------------------------------------------- */

  /**
   * Pin an ability (talent/trait) to show on overview.
   * @param {string} itemId - The item ID to pin
   * @returns {Promise<Actor>}
   */
  async pinAbility(itemId) {
    const pinned = foundry.utils.deepClone(this.pinnedAbilities || []);
    if (!pinned.includes(itemId)) {
      pinned.push(itemId);
      return this.parent.update({ "system.pinnedAbilities": pinned });
    }
    return this.parent;
  }

  /**
   * Unpin an ability from overview.
   * @param {string} itemId - The item ID to unpin
   * @returns {Promise<Actor>}
   */
  async unpinAbility(itemId) {
    const pinned = foundry.utils.deepClone(this.pinnedAbilities || []);
    const idx = pinned.indexOf(itemId);
    if (idx >= 0) {
      pinned.splice(idx, 1);
      return this.parent.update({ "system.pinnedAbilities": pinned });
    }
    return this.parent;
  }

  /**
   * Toggle pin state for an ability.
   * @param {string} itemId - The item ID to toggle
   * @returns {Promise<Actor>}
   */
  async togglePinAbility(itemId) {
    const pinned = this.pinnedAbilities || [];
    if (pinned.includes(itemId)) {
      return this.unpinAbility(itemId);
    }
    return this.pinAbility(itemId);
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareBaseData() {
    super.prepareBaseData();
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this._prepareCharacteristics();
    this._prepareMovement();
    this._prepareInitiative();
    
    // Auto-enable horde mode if NPC type is horde or swarm
    if (this.isHorde && !this.horde.enabled) {
      this.horde.enabled = true;
    }
  }

  /**
   * Prepare characteristic totals and bonuses.
   * @protected
   */
  _prepareCharacteristics() {
    for (const [key, char] of Object.entries(this.characteristics)) {
      // Total = base + modifier
      char.total = char.base + char.modifier;

      // Base bonus is tens digit
      const baseBonus = Math.floor(char.total / 10);

      // Unnatural multiplies the bonus (0 = no unnatural, 2+ = multiplier)
      const unnaturalLevel = char.unnatural || 0;
      char.bonus = unnaturalLevel >= 2 ? baseBonus * unnaturalLevel : baseBonus;
    }
  }

  /**
   * Prepare movement values based on agility bonus and size.
   * @protected
   */
  _prepareMovement() {
    const agility = this.characteristics?.agility;
    if (!agility) return;

    const ab = agility.bonus;
    const baseMove = ab + this.size - 4;
    
    this.movement.half = Math.max(1, baseMove);
    this.movement.full = Math.max(2, baseMove * 2);
    this.movement.charge = Math.max(3, baseMove * 3);
    this.movement.run = Math.max(6, baseMove * 6);
  }

  /**
   * Prepare initiative bonus.
   * @protected
   */
  _prepareInitiative() {
    const initChar = this.characteristics[this.initiative.characteristic];
    if (initChar) {
      this.initiative.bonus = initChar.bonus;
    }
  }

  /* -------------------------------------------- */
  /*  Roll Data                                   */
  /* -------------------------------------------- */

  /** @override */
  getRollData() {
    const data = super.getRollData ? super.getRollData() : {};

    // Add characteristic values and bonuses for formulas
    for (const [key, char] of Object.entries(this.characteristics)) {
      data[char.short] = char.total;
      data[`${char.short}B`] = char.bonus;
      data[key] = char.total;
    }

    // Add common roll data
    data.threatLevel = this.threatLevel;
    data.size = this.size;
    
    // Add horde data if enabled
    if (this.horde.enabled) {
      data.magnitude = this.horde.magnitude.current;
      data.magnitudeMax = this.horde.magnitude.max;
      data.magnitudePercent = this.magnitudePercent;
      data.hordeDamageMultiplier = this.hordeDamageMultiplier;
    }

    return data;
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * Convert a value to an integer, handling strings and edge cases.
   * @param {*} value - The value to convert
   * @param {number} fallback - Fallback value if conversion fails
   * @returns {number}
   * @private
   */
  static _toInt(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return Math.floor(num);
  }

  /** @inheritDoc */
  static _migrateData(source) {
    super._migrateData?.(source);
    NPCDataV2.#migrateSize(source);
    NPCDataV2.#migrateWounds(source);
    NPCDataV2.#migrateThreatLevel(source);
  }

  /**
   * Migrate size to integer.
   * @param {object} source - The source data
   */
  static #migrateSize(source) {
    if (source.size !== undefined) {
      source.size = this._toInt(source.size, 4);
      if (source.size < 1) source.size = 1;
      if (source.size > 10) source.size = 10;
    }
  }

  /**
   * Migrate wounds values to integers.
   * @param {object} source - The source data
   */
  static #migrateWounds(source) {
    if (source.wounds) {
      if (source.wounds.max !== undefined) {
        source.wounds.max = this._toInt(source.wounds.max, 10);
      }
      if (source.wounds.value !== undefined) {
        source.wounds.value = this._toInt(source.wounds.value, 10);
      }
      if (source.wounds.critical !== undefined) {
        source.wounds.critical = this._toInt(source.wounds.critical, 0);
      }
    }
  }

  /**
   * Migrate threat level to integer.
   * @param {object} source - The source data
   */
  static #migrateThreatLevel(source) {
    if (source.threatLevel !== undefined) {
      source.threatLevel = this._toInt(source.threatLevel, 5);
    }
  }
}
