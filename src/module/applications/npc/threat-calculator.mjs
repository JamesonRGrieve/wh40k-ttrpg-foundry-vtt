/**
 * @file ThreatCalculator - Utility for generating NPC stats from threat level
 * Phase 3: Quick Create Dialog (USER PRIORITY)
 * 
 * Provides:
 * - Auto-generate characteristics from threat level
 * - Generate wounds, skills, weapons, armour based on threat
 * - Equipment presets for common NPC archetypes
 * - Scaling formulas for balanced NPC creation
 */

/**
 * Threat Calculator utility class.
 * All methods are static - no instantiation needed.
 */
export default class ThreatCalculator {

  /* -------------------------------------------- */
  /*  Static Configuration                        */
  /* -------------------------------------------- */

  /**
   * Threat tier definitions.
   * Each tier defines the characteristic range and multipliers.
   * @type {Object<string, Object>}
   */
  static THREAT_TIERS = {
    minor: {
      name: "Minor",
      minThreat: 1,
      maxThreat: 5,
      charMin: 20,
      charMax: 35,
      woundsBase: 8,
      woundsMult: 1,
      armourBase: 1,
      skillBonus: 0
    },
    standard: {
      name: "Standard",
      minThreat: 6,
      maxThreat: 10,
      charMin: 30,
      charMax: 45,
      woundsBase: 12,
      woundsMult: 1.5,
      armourBase: 3,
      skillBonus: 10
    },
    tough: {
      name: "Tough",
      minThreat: 11,
      maxThreat: 15,
      charMin: 40,
      charMax: 55,
      woundsBase: 18,
      woundsMult: 2,
      armourBase: 5,
      skillBonus: 20
    },
    elite: {
      name: "Elite",
      minThreat: 16,
      maxThreat: 20,
      charMin: 50,
      charMax: 65,
      woundsBase: 25,
      woundsMult: 2.5,
      armourBase: 7,
      skillBonus: 30
    },
    boss: {
      name: "Boss",
      minThreat: 21,
      maxThreat: 30,
      charMin: 60,
      charMax: 75,
      woundsBase: 35,
      woundsMult: 3,
      armourBase: 10,
      skillBonus: 40
    }
  };

  /**
   * Role definitions with characteristic focus and skill sets.
   * @type {Object<string, Object>}
   */
  static ROLE_PROFILES = {
    bruiser: {
      name: "Bruiser",
      description: "Close combat specialist",
      primaryStats: ["weaponSkill", "strength", "toughness"],
      secondaryStats: ["agility", "willpower"],
      skills: ["athletics", "intimidate", "parry"],
      weaponPreset: "melee"
    },
    sniper: {
      name: "Sniper",
      description: "Ranged combat specialist",
      primaryStats: ["ballisticSkill", "perception", "agility"],
      secondaryStats: ["intelligence", "willpower"],
      skills: ["awareness", "stealth", "dodge"],
      weaponPreset: "ranged"
    },
    caster: {
      name: "Caster",
      description: "Psychic/sorcerer",
      primaryStats: ["willpower", "perception", "intelligence"],
      secondaryStats: ["toughness", "fellowship"],
      skills: ["psyniscience", "forbiddenLore", "awareness"],
      weaponPreset: "caster"
    },
    support: {
      name: "Support",
      description: "Utility and buff/debuff",
      primaryStats: ["intelligence", "fellowship", "willpower"],
      secondaryStats: ["perception", "agility"],
      skills: ["medicae", "techUse", "command"],
      weaponPreset: "support"
    },
    commander: {
      name: "Commander",
      description: "Leader and tactician",
      primaryStats: ["fellowship", "willpower", "intelligence"],
      secondaryStats: ["weaponSkill", "ballisticSkill"],
      skills: ["command", "charm", "intimidate", "awareness"],
      weaponPreset: "mixed"
    },
    specialist: {
      name: "Specialist",
      description: "Balanced generalist",
      primaryStats: ["agility", "perception", "intelligence"],
      secondaryStats: ["ballisticSkill", "willpower"],
      skills: ["awareness", "dodge", "stealth"],
      weaponPreset: "mixed"
    }
  };

  /**
   * Equipment presets for weapon loadouts.
   * @type {Object<string, Object>}
   */
  static EQUIPMENT_PRESETS = {
    melee: {
      name: "Melee",
      description: "Melee weapons with medium armor",
      weapons: [
        { name: "Combat Blade", damage: "1d10+3", pen: 2, range: "Melee", rof: "S/-/-", clip: 0, reload: "-", special: "", class: "melee" }
      ],
      armour: 4
    },
    ranged: {
      name: "Ranged",
      description: "Ranged weapons with light armor",
      weapons: [
        { name: "Lasgun", damage: "1d10+3", pen: 0, range: "100m", rof: "S/3/-", clip: 60, reload: "Full", special: "Reliable", class: "basic" }
      ],
      armour: 2
    },
    mixed: {
      name: "Mixed",
      description: "Balanced loadout with medium armor",
      weapons: [
        { name: "Autopistol", damage: "1d10+2", pen: 0, range: "30m", rof: "S/-/6", clip: 18, reload: "Full", special: "", class: "pistol" },
        { name: "Sword", damage: "1d10+2", pen: 0, range: "Melee", rof: "S/-/-", clip: 0, reload: "-", special: "Balanced", class: "melee" }
      ],
      armour: 3
    },
    caster: {
      name: "Caster",
      description: "Staff and light armor",
      weapons: [
        { name: "Force Staff", damage: "1d10+2", pen: 2, range: "Melee", rof: "S/-/-", clip: 0, reload: "-", special: "Force", class: "melee" }
      ],
      armour: 2
    },
    support: {
      name: "Support",
      description: "Light weapons and armor",
      weapons: [
        { name: "Laspistol", damage: "1d10+2", pen: 0, range: "30m", rof: "S/-/-", clip: 30, reload: "Full", special: "Reliable", class: "pistol" }
      ],
      armour: 2
    },
    heavy: {
      name: "Heavy",
      description: "Heavy weapons with heavy armor",
      weapons: [
        { name: "Heavy Stubber", damage: "1d10+5", pen: 3, range: "100m", rof: "-/-/8", clip: 80, reload: "2Full", special: "", class: "heavy" }
      ],
      armour: 6
    },
    unarmed: {
      name: "Unarmed",
      description: "Natural weapons only",
      weapons: [
        { name: "Fists", damage: "1d10", pen: 0, range: "Melee", rof: "S/-/-", clip: 0, reload: "-", special: "Primitive", class: "melee" }
      ],
      armour: 0
    }
  };

  /* -------------------------------------------- */
  /*  Threat Tier Methods                         */
  /* -------------------------------------------- */

  /**
   * Get the threat tier for a given threat level.
   * @param {number} threatLevel - The threat level (1-30).
   * @returns {Object} The tier configuration.
   */
  static getTier(threatLevel) {
    for (const tier of Object.values(this.THREAT_TIERS)) {
      if (threatLevel >= tier.minThreat && threatLevel <= tier.maxThreat) {
        return tier;
      }
    }
    // Default to boss for anything above 30
    return this.THREAT_TIERS.boss;
  }

  /**
   * Get the tier name for a threat level.
   * @param {number} threatLevel - The threat level.
   * @returns {string} The tier name.
   */
  static getTierName(threatLevel) {
    return this.getTier(threatLevel).name;
  }

  /**
   * Get tier info with color for a threat level.
   * @param {number} threatLevel - The threat level.
   * @returns {Object} Object with label and color.
   */
  static getTierInfo(threatLevel) {
    const tier = this.getTier(threatLevel);
    const colors = {
      "Minor": "#4caf50",
      "Standard": "#2196f3",
      "Tough": "#ff9800",
      "Elite": "#f44336",
      "Boss": "#9c27b0"
    };
    return {
      label: tier.name,
      color: colors[tier.name] || "#666"
    };
  }

  /* -------------------------------------------- */
  /*  Stat Generation Methods                     */
  /* -------------------------------------------- */

  /**
   * Generate all characteristics from threat level and role.
   * @param {number} threatLevel - The threat level (1-30).
   * @param {string} role - The NPC role (bruiser, sniper, etc.).
   * @returns {Object} Characteristics object ready for NPC system data.
   */
  static generateCharacteristics(threatLevel, role = "specialist") {
    const tier = this.getTier(threatLevel);
    const profile = this.ROLE_PROFILES[role] || this.ROLE_PROFILES.specialist;
    
    // Calculate position within tier (0.0 to 1.0)
    const tierRange = tier.maxThreat - tier.minThreat;
    const positionInTier = tierRange > 0 ? (threatLevel - tier.minThreat) / tierRange : 0.5;
    
    // Base value interpolated between tier min and max
    const baseValue = Math.round(tier.charMin + (tier.charMax - tier.charMin) * positionInTier);
    
    const characteristics = {};
    const allStats = [
      "weaponSkill", "ballisticSkill", "strength", "toughness", "agility",
      "intelligence", "perception", "willpower", "fellowship", "influence"
    ];
    
    const labels = {
      weaponSkill: "Weapon Skill",
      ballisticSkill: "Ballistic Skill",
      strength: "Strength",
      toughness: "Toughness",
      agility: "Agility",
      intelligence: "Intelligence",
      perception: "Perception",
      willpower: "Willpower",
      fellowship: "Fellowship",
      influence: "Influence"
    };
    
    const shorts = {
      weaponSkill: "WS",
      ballisticSkill: "BS",
      strength: "S",
      toughness: "T",
      agility: "Ag",
      intelligence: "Int",
      perception: "Per",
      willpower: "WP",
      fellowship: "Fel",
      influence: "Inf"
    };
    
    for (const stat of allStats) {
      let value = baseValue;
      
      // Primary stats get a bonus
      if (profile.primaryStats.includes(stat)) {
        value += Math.round(5 + threatLevel * 0.5);
      }
      // Secondary stats get a smaller bonus
      else if (profile.secondaryStats.includes(stat)) {
        value += Math.round(2 + threatLevel * 0.2);
      }
      // Other stats get a small penalty
      else {
        value -= Math.round(3 + threatLevel * 0.1);
      }
      
      // Clamp to valid range
      value = Math.max(10, Math.min(99, value));
      
      characteristics[stat] = {
        label: labels[stat],
        short: shorts[stat],
        base: value,
        modifier: 0,
        unnatural: 0,
        total: value,
        bonus: Math.floor(value / 10)
      };
    }
    
    return characteristics;
  }

  /**
   * Generate wounds from threat level.
   * @param {number} threatLevel - The threat level (1-30).
   * @param {string} type - The NPC type (troop, elite, etc.).
   * @returns {Object} Wounds object for NPC system data.
   */
  static generateWounds(threatLevel, type = "troop") {
    const tier = this.getTier(threatLevel);
    
    // Base wounds from tier
    let wounds = tier.woundsBase;
    
    // Scale within tier
    const tierRange = tier.maxThreat - tier.minThreat;
    const positionInTier = tierRange > 0 ? (threatLevel - tier.minThreat) / tierRange : 0.5;
    wounds += Math.round(positionInTier * 5);
    
    // Adjust by type
    const typeMultipliers = {
      troop: 0.8,
      elite: 1.2,
      master: 1.5,
      horde: 2.0,
      swarm: 1.5,
      creature: 1.0,
      daemon: 1.3,
      xenos: 1.1
    };
    
    wounds = Math.round(wounds * (typeMultipliers[type] || 1.0));
    
    return {
      max: wounds,
      value: wounds,
      critical: 0
    };
  }

  /**
   * Generate trained skills from role and threat level.
   * @param {string} role - The NPC role.
   * @param {number} threatLevel - The threat level.
   * @returns {Object} Trained skills object for NPC system data.
   */
  static generateSkills(role, threatLevel) {
    const profile = this.ROLE_PROFILES[role] || this.ROLE_PROFILES.specialist;
    const tier = this.getTier(threatLevel);
    
    const skills = {};
    
    // Add role-specific skills
    for (const skillName of profile.skills) {
      // Determine skill level based on threat
      let level = "trained";
      if (threatLevel >= 11) level = "plus10";
      if (threatLevel >= 21) level = "plus20";
      
      const charMap = {
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
      
      skills[skillName] = {
        name: skillName,
        characteristic: charMap[skillName] || "perception",
        trained: true,
        plus10: level === "plus10" || level === "plus20",
        plus20: level === "plus20",
        bonus: tier.skillBonus
      };
    }
    
    // Add dodge for all NPCs
    if (!skills.dodge) {
      skills.dodge = {
        name: "dodge",
        characteristic: "agility",
        trained: threatLevel >= 6,
        plus10: threatLevel >= 16,
        plus20: threatLevel >= 26,
        bonus: 0
      };
    }
    
    // Add awareness for all NPCs
    if (!skills.awareness) {
      skills.awareness = {
        name: "awareness",
        characteristic: "perception",
        trained: true,
        plus10: threatLevel >= 11,
        plus20: threatLevel >= 21,
        bonus: 0
      };
    }
    
    return skills;
  }

  /**
   * Generate weapons from equipment preset and threat level.
   * @param {string} preset - The equipment preset key.
   * @param {number} threatLevel - The threat level.
   * @returns {Object} Weapons object for NPC system data.
   */
  static generateWeapons(preset, threatLevel) {
    const equipment = this.EQUIPMENT_PRESETS[preset] || this.EQUIPMENT_PRESETS.mixed;
    const tier = this.getTier(threatLevel);
    
    // Scale weapon damage based on threat
    const damageBonus = Math.floor(threatLevel / 5);
    const penBonus = Math.floor(threatLevel / 10);
    
    const weapons = equipment.weapons.map(w => ({
      ...w,
      damage: this._scaleDamage(w.damage, damageBonus),
      pen: w.pen + penBonus
    }));
    
    return {
      mode: "simple",
      simple: weapons
    };
  }

  /**
   * Generate armour from equipment preset and threat level.
   * @param {string} preset - The equipment preset key.
   * @param {number} threatLevel - The threat level.
   * @returns {Object} Armour object for NPC system data.
   */
  static generateArmour(preset, threatLevel) {
    const equipment = this.EQUIPMENT_PRESETS[preset] || this.EQUIPMENT_PRESETS.mixed;
    const tier = this.getTier(threatLevel);
    
    // Scale armour based on threat
    const armourBonus = Math.floor(threatLevel / 5);
    const totalArmour = Math.min(15, equipment.armour + armourBonus);
    
    return {
      mode: "simple",
      total: totalArmour,
      locations: {
        head: totalArmour,
        body: totalArmour,
        leftArm: totalArmour,
        rightArm: totalArmour,
        leftLeg: totalArmour,
        rightLeg: totalArmour
      }
    };
  }

  /**
   * Generate movement values from threat level.
   * @param {number} threatLevel - The threat level.
   * @returns {Object} Movement object for NPC system data.
   */
  static generateMovement(threatLevel) {
    // Base movement increases slightly with threat
    const base = 3 + Math.floor(threatLevel / 10);
    
    return {
      half: base,
      full: base * 2,
      charge: base * 3,
      run: base * 6
    };
  }

  /**
   * Generate horde configuration.
   * @param {boolean} isHorde - Whether this is a horde-type NPC.
   * @param {number} threatLevel - The threat level.
   * @returns {Object} Horde object for NPC system data.
   */
  static generateHorde(isHorde, threatLevel) {
    if (!isHorde) {
      return {
        enabled: false,
        magnitude: {
          max: 100,
          current: 100
        },
        magnitudeDamage: [],
        traits: [],
        damageMultiplier: 1,
        sizeModifier: 0
      };
    }
    
    // Horde magnitude scales with threat
    const magnitude = 30 + (threatLevel * 5);
    
    return {
      enabled: true,
      magnitude: {
        max: magnitude,
        current: magnitude
      },
      magnitudeDamage: [],
      traits: [],
      damageMultiplier: 1,
      sizeModifier: 0
    };
  }

  /* -------------------------------------------- */
  /*  Complete Generation                         */
  /* -------------------------------------------- */

  /**
   * Generate a complete NPC system data object from configuration.
   * @param {Object} config - Generation configuration.
   * @param {number} config.threatLevel - The threat level (1-30).
   * @param {string} config.role - The NPC role.
   * @param {string} config.type - The NPC type.
   * @param {string} config.preset - The equipment preset.
   * @param {string} [config.faction] - The faction.
   * @param {boolean} [config.isHorde] - Whether this is a horde.
   * @returns {Object} Complete system data object.
   */
  static generateNPCData(config) {
    const {
      threatLevel = 5,
      role = "specialist",
      type = "troop",
      preset = "mixed",
      faction = "",
      isHorde = false
    } = config;
    
    const actualType = isHorde ? "horde" : type;
    
    return {
      faction: faction,
      subfaction: "",
      allegiance: "",
      role: role,
      type: actualType,
      threatLevel: threatLevel,
      characteristics: this.generateCharacteristics(threatLevel, role),
      wounds: this.generateWounds(threatLevel, actualType),
      movement: this.generateMovement(threatLevel),
      size: 4,
      initiative: {
        characteristic: "agility",
        base: "1d10",
        bonus: 0
      },
      trainedSkills: this.generateSkills(role, threatLevel),
      weapons: this.generateWeapons(preset, threatLevel),
      armour: this.generateArmour(preset, threatLevel),
      specialAbilities: "",
      customStats: {
        enabled: false,
        characteristics: {},
        skills: {},
        combat: {
          initiative: null,
          dodge: null,
          parry: null
        },
        wounds: null,
        movement: null
      },
      pinnedAbilities: [],
      template: "",
      quickNotes: "",
      tags: [],
      description: "",
      tactics: "",
      source: "",
      horde: this.generateHorde(isHorde || actualType === "horde" || actualType === "swarm", threatLevel)
    };
  }

  /* -------------------------------------------- */
  /*  Scaling Methods                             */
  /* -------------------------------------------- */

  /**
   * Scale existing NPC data to a new threat level.
   * @param {Object} currentData - Current NPC system data.
   * @param {number} currentThreat - Current threat level.
   * @param {number} newThreat - New threat level.
   * @param {Object} options - Scaling options.
   * @param {boolean} options.scaleCharacteristics - Scale characteristics.
   * @param {boolean} options.scaleWounds - Scale wounds.
   * @param {boolean} options.scaleSkills - Scale skill bonuses.
   * @param {boolean} options.scaleWeapons - Scale weapon damage.
   * @param {boolean} options.scaleArmour - Scale armour values.
   * @returns {Object} Updated system data with scaled values.
   */
  static scaleToThreat(currentData, currentThreat, newThreat, options = {}) {
    const {
      scaleCharacteristics = true,
      scaleWounds = true,
      scaleSkills = true,
      scaleWeapons = true,
      scaleArmour = true
    } = options;
    
    // Calculate scaling factor (5% per threat level difference)
    const diff = newThreat - currentThreat;
    const scaleFactor = 1 + (diff * 0.05);
    
    const updates = {};
    
    // Scale characteristics
    if (scaleCharacteristics) {
      for (const [key, char] of Object.entries(currentData.characteristics)) {
        const newBase = Math.round(char.base * scaleFactor);
        updates[`characteristics.${key}.base`] = Math.max(10, Math.min(99, newBase));
      }
    }
    
    // Scale wounds
    if (scaleWounds) {
      const newMax = Math.round(currentData.wounds.max * scaleFactor);
      updates["wounds.max"] = Math.max(1, newMax);
      updates["wounds.value"] = Math.max(1, newMax);
    }
    
    // Scale skill bonuses
    if (scaleSkills) {
      for (const [key, skill] of Object.entries(currentData.trainedSkills)) {
        const newBonus = Math.round((skill.bonus || 0) + (diff * 2));
        updates[`trainedSkills.${key}.bonus`] = Math.max(0, newBonus);
      }
    }
    
    // Scale weapon damage
    if (scaleWeapons && currentData.weapons?.simple) {
      const damageBonus = Math.floor(diff / 2);
      const penBonus = Math.floor(diff / 5);
      
      const scaledWeapons = currentData.weapons.simple.map(w => ({
        ...w,
        damage: this._scaleDamage(w.damage, damageBonus),
        pen: Math.max(0, w.pen + penBonus)
      }));
      
      updates["weapons.simple"] = scaledWeapons;
    }
    
    // Scale armour
    if (scaleArmour) {
      if (currentData.armour.mode === "simple") {
        const newArmour = Math.round(currentData.armour.total * scaleFactor);
        updates["armour.total"] = Math.max(0, Math.min(15, newArmour));
      } else {
        for (const [loc, value] of Object.entries(currentData.armour.locations)) {
          const newArmour = Math.round(value * scaleFactor);
          updates[`armour.locations.${loc}`] = Math.max(0, Math.min(15, newArmour));
        }
      }
    }
    
    // Update threat level
    updates["threatLevel"] = Math.max(1, Math.min(30, newThreat));
    
    // Scale horde magnitude if applicable
    if (currentData.horde?.enabled) {
      const newMag = Math.round(currentData.horde.magnitude.max * scaleFactor);
      updates["horde.magnitude.max"] = Math.max(10, newMag);
      updates["horde.magnitude.current"] = Math.max(10, newMag);
    }
    
    return updates;
  }

  /**
   * Preview scaled stats without applying changes.
   * @param {Object} currentData - Current NPC system data.
   * @param {number} currentThreat - Current threat level.
   * @param {number} newThreat - New threat level.
   * @param {Object} options - Scaling options.
   * @returns {Object} Preview object with current and new values.
   */
  static previewScaling(currentData, currentThreat, newThreat, options = {}) {
    const updates = this.scaleToThreat(currentData, currentThreat, newThreat, options);
    
    const preview = {
      threatLevel: {
        current: currentThreat,
        new: newThreat,
        change: newThreat - currentThreat
      },
      characteristics: {},
      wounds: {
        current: currentData.wounds.max,
        new: updates["wounds.max"] ?? currentData.wounds.max
      },
      armour: {
        current: currentData.armour.mode === "simple" ? currentData.armour.total : "By Location",
        new: updates["armour.total"] ?? (currentData.armour.mode === "simple" ? currentData.armour.total : "By Location")
      }
    };
    
    // Add characteristic previews
    for (const [key, char] of Object.entries(currentData.characteristics)) {
      const newBase = updates[`characteristics.${key}.base`] ?? char.base;
      preview.characteristics[key] = {
        label: char.label,
        short: char.short,
        current: char.base,
        new: newBase,
        change: newBase - char.base
      };
    }
    
    return preview;
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Scale a damage string by adding a bonus.
   * @param {string} damage - Original damage string (e.g., "1d10+3").
   * @param {number} bonus - Bonus to add.
   * @returns {string} Scaled damage string.
   * @private
   */
  static _scaleDamage(damage, bonus) {
    if (bonus === 0) return damage;
    
    // Parse existing damage string
    const match = damage.match(/^(\d+d\d+)([+-]\d+)?$/);
    if (!match) return damage;
    
    const dice = match[1];
    const existingBonus = parseInt(match[2] || "0", 10);
    const newBonus = existingBonus + bonus;
    
    if (newBonus === 0) return dice;
    if (newBonus > 0) return `${dice}+${newBonus}`;
    return `${dice}${newBonus}`;
  }

  /**
   * Get all available roles.
   * @returns {Array<{key: string, name: string, description: string}>}
   */
  static getRoles() {
    return Object.entries(this.ROLE_PROFILES).map(([key, profile]) => ({
      key,
      name: profile.name,
      description: profile.description
    }));
  }

  /**
   * Get all available equipment presets.
   * @returns {Array<{key: string, name: string, description: string}>}
   */
  static getPresets() {
    return Object.entries(this.EQUIPMENT_PRESETS).map(([key, preset]) => ({
      key,
      name: preset.name,
      description: preset.description
    }));
  }

  /**
   * Get all NPC types.
   * @returns {Array<{key: string, name: string}>}
   */
  static getTypes() {
    return [
      { key: "troop", name: "Troop" },
      { key: "elite", name: "Elite" },
      { key: "master", name: "Master" },
      { key: "horde", name: "Horde" },
      { key: "swarm", name: "Swarm" },
      { key: "creature", name: "Creature" },
      { key: "daemon", name: "Daemon" },
      { key: "xenos", name: "Xenos" }
    ];
  }
}
