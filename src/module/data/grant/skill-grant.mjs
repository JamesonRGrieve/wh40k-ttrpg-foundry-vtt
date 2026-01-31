import BaseGrantData from "./base-grant.mjs";

/**
 * Grant that provides skill training to an actor.
 * Can grant new skills or upgrade existing skill levels.
 * 
 * @extends BaseGrantData
 */
export default class SkillGrantData extends BaseGrantData {

  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static TYPE = "skill";
  static ICON = "icons/svg/book.svg";

  /**
   * Valid skill training levels.
   * @type {object}
   */
  static TRAINING_LEVELS = {
    known: { order: 0, label: "RT.Skill.Level.Known" },
    trained: { order: 1, label: "RT.Skill.Level.Trained", bonus: 0 },
    plus10: { order: 2, label: "RT.Skill.Level.Plus10", bonus: 10 },
    plus20: { order: 3, label: "RT.Skill.Level.Plus20", bonus: 20 }
  };

  /* -------------------------------------------- */
  /*  Schema Definition                           */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      // Skills to grant
      skills: new fields.ArrayField(
        new fields.SchemaField({
          // Skill key (e.g., "athletics", "commonLore")
          key: new fields.StringField({ required: true }),
          // Specialization for specialist skills
          specialization: new fields.StringField({ required: false, blank: true }),
          // Training level to grant
          level: new fields.StringField({
            required: true,
            initial: "trained",
            choices: Object.keys(SkillGrantData.TRAINING_LEVELS)
          }),
          // Can player skip this skill?
          optional: new fields.BooleanField({ initial: false })
        }),
        { required: true, initial: [] }
      ),
      
      // Applied state - tracks what was granted
      // Format: { "skillKey:specialization": { itemId, previousLevel } }
      applied: new fields.ObjectField({ required: true, initial: {} })
    };
  }

  /* -------------------------------------------- */
  /*  Grant Application Methods                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async apply(actor, data = {}, options = {}) {
    const result = {
      success: true,
      applied: {},
      notifications: [],
      errors: []
    };

    if (!actor) {
      result.success = false;
      result.errors.push("No actor provided");
      return result;
    }

    const selectedSkills = data.selected ?? this.skills.map(s => this._getSkillKey(s));
    const updates = {};

    for (const skillConfig of this.skills) {
      const skillKey = this._getSkillKey(skillConfig);
      
      // Skip if not selected
      if (!selectedSkills.includes(skillKey)) {
        if (!skillConfig.optional && !this.optional) {
          result.errors.push(`Required skill ${skillKey} not selected`);
        }
        continue;
      }

      // Get the schema skill key and current state
      const schemaKey = this._getSchemaSkillKey(skillConfig.key);
      const specialization = skillConfig.specialization;
      
      if (!schemaKey) {
        result.errors.push(`Unknown skill: ${skillConfig.key}`);
        continue;
      }

      // Check current skill level and calculate upgrade
      const currentSkill = actor.system.skills[schemaKey];
      if (!currentSkill) {
        result.errors.push(`Skill not found on actor: ${schemaKey}`);
        continue;
      }

      // Handle specialist skills (ones with entries array)
      if (specialization && Array.isArray(currentSkill.entries)) {
        const upgradeResult = this._applySpecialistSkillUpgrade(
          actor, schemaKey, specialization, skillConfig.level, updates, result
        );
        if (upgradeResult) {
          result.applied[skillKey] = upgradeResult;
        }
      } else {
        // Standard skill - upgrade the training level
        const upgradeResult = this._applyStandardSkillUpgrade(
          actor, schemaKey, skillConfig.level, updates, result
        );
        if (upgradeResult) {
          result.applied[skillKey] = upgradeResult;
        }
      }
    }

    // Apply updates if not dry run
    if (!options.dryRun && Object.keys(updates).length > 0) {
      await actor.update(updates);
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * Apply upgrade to a standard (non-specialist) skill.
   * @private
   */
  _applyStandardSkillUpgrade(actor, schemaKey, targetLevel, updates, result) {
    const currentSkill = actor.system.skills[schemaKey];
    const currentLevel = this._getSchemaSkillLevel(currentSkill);
    const currentOrder = this.constructor.TRAINING_LEVELS[currentLevel]?.order ?? 0;
    const targetOrder = this.constructor.TRAINING_LEVELS[targetLevel]?.order ?? 0;

    if (targetOrder <= currentOrder) {
      result.notifications.push(`${currentSkill.label || schemaKey} already at or above ${targetLevel}`);
      return null;
    }

    // Apply the upgrade
    const levelUpdates = this._getLevelUpdates(targetLevel);
    for (const [field, value] of Object.entries(levelUpdates)) {
      updates[`system.skills.${schemaKey}.${field.replace('system.', '')}`] = value;
    }

    const levelLabel = game.i18n.localize(this.constructor.TRAINING_LEVELS[targetLevel].label);
    result.notifications.push(`${currentSkill.label || schemaKey}: ${levelLabel}`);

    return {
      schemaKey,
      previousLevel: currentLevel,
      newLevel: targetLevel,
      upgraded: true
    };
  }

  /**
   * Apply upgrade to a specialist skill entry.
   * @private
   */
  _applySpecialistSkillUpgrade(actor, schemaKey, specialization, targetLevel, updates, result) {
    const currentSkill = actor.system.skills[schemaKey];
    const entries = currentSkill.entries || [];
    
    // Find existing entry with this specialization
    const entryIndex = entries.findIndex(e => 
      (e.name || "").toLowerCase() === specialization.toLowerCase() ||
      (e.specialization || "").toLowerCase() === specialization.toLowerCase()
    );

    if (entryIndex >= 0) {
      // Upgrade existing entry
      const entry = entries[entryIndex];
      const currentLevel = this._getSchemaSkillLevel(entry);
      const currentOrder = this.constructor.TRAINING_LEVELS[currentLevel]?.order ?? 0;
      const targetOrder = this.constructor.TRAINING_LEVELS[targetLevel]?.order ?? 0;

      if (targetOrder <= currentOrder) {
        result.notifications.push(`${currentSkill.label || schemaKey} (${specialization}) already at or above ${targetLevel}`);
        return null;
      }

      // Update the entry
      const levelUpdates = this._getLevelUpdates(targetLevel);
      for (const [field, value] of Object.entries(levelUpdates)) {
        const cleanField = field.replace('system.', '');
        updates[`system.skills.${schemaKey}.entries.${entryIndex}.${cleanField}`] = value;
      }

      const levelLabel = game.i18n.localize(this.constructor.TRAINING_LEVELS[targetLevel].label);
      result.notifications.push(`${currentSkill.label || schemaKey} (${specialization}): ${levelLabel}`);

      return {
        schemaKey,
        specialization,
        entryIndex,
        previousLevel: currentLevel,
        newLevel: targetLevel,
        upgraded: true
      };
    } else {
      // Create new entry
      const newEntry = {
        name: specialization,
        specialization: specialization,
        trained: targetLevel !== "known",
        plus10: targetLevel === "plus10" || targetLevel === "plus20",
        plus20: targetLevel === "plus20",
        bonus: 0
      };

      // Add to entries array
      const newEntries = [...entries, newEntry];
      updates[`system.skills.${schemaKey}.entries`] = newEntries;

      const levelLabel = game.i18n.localize(this.constructor.TRAINING_LEVELS[targetLevel].label);
      result.notifications.push(`${currentSkill.label || schemaKey} (${specialization}): ${levelLabel} (new)`);

      return {
        schemaKey,
        specialization,
        entryIndex: newEntries.length - 1,
        previousLevel: null,
        newLevel: targetLevel,
        created: true
      };
    }
  }

  /**
   * Get the schema skill key from various input formats.
   * @private
   */
  _getSchemaSkillKey(key) {
    if (!key) return null;
    
    // Normalize the key
    const normalized = key.toLowerCase().replace(/[\s-]/g, "");
    
    // Map of common variants to schema keys
    const keyMap = {
      // Standard skills
      "acrobatics": "acrobatics",
      "awareness": "awareness",
      "barter": "barter",
      "blather": "blather",
      "carouse": "carouse",
      "charm": "charm",
      "chemuse": "chemUse",
      "chem-use": "chemUse",
      "climb": "climb",
      "command": "command",
      "commerce": "commerce",
      "concealment": "concealment",
      "contortionist": "contortionist",
      "deceive": "deceive",
      "demolition": "demolition",
      "disguise": "disguise",
      "dodge": "dodge",
      "evaluate": "evaluate",
      "gamble": "gamble",
      "inquiry": "inquiry",
      "interrogation": "interrogation",
      "intimidate": "intimidate",
      "invocation": "invocation",
      "literacy": "literacy",
      "logic": "logic",
      "medicae": "medicae",
      "psyniscience": "psyniscience",
      "scrutiny": "scrutiny",
      "search": "search",
      "security": "security",
      "shadowing": "shadowing",
      "silentmove": "silentMove",
      "silent move": "silentMove",
      "sleightofhand": "sleightOfHand",
      "sleight of hand": "sleightOfHand",
      "survival": "survival",
      "swim": "swim",
      "tracking": "tracking",
      "wrangling": "wrangling",
      // Specialist skills
      "ciphers": "ciphers",
      "cipher": "ciphers",
      "commonlore": "commonLore",
      "common lore": "commonLore",
      "drive": "drive",
      "forbiddenlore": "forbiddenLore",
      "forbidden lore": "forbiddenLore",
      "navigation": "navigation",
      "performer": "performer",
      "pilot": "pilot",
      "scholasticlore": "scholasticLore",
      "scholastic lore": "scholasticLore",
      "secrettongue": "secretTongue",
      "secret tongue": "secretTongue",
      "speaklanguage": "speakLanguage",
      "speak language": "speakLanguage",
      "techuse": "techUse",
      "tech-use": "techUse",
      "trade": "trade"
    };

    return keyMap[normalized] || keyMap[key.toLowerCase()] || null;
  }

  /**
   * Get current training level from a schema skill object.
   * @private
   */
  _getSchemaSkillLevel(skill) {
    if (skill?.plus20) return "plus20";
    if (skill?.plus10) return "plus10";
    if (skill?.trained) return "trained";
    return "known";
  }

  /** @inheritDoc */
  async reverse(actor, appliedState) {
    const restoreData = { skills: [] };
    const updates = {};

    for (const [key, state] of Object.entries(appliedState)) {
      if (!state.schemaKey) continue;

      if (state.created && state.specialization !== undefined) {
        // Remove created specialist entry
        const currentSkill = actor.system.skills[state.schemaKey];
        if (currentSkill?.entries && state.entryIndex !== undefined) {
          const newEntries = [...currentSkill.entries];
          newEntries.splice(state.entryIndex, 1);
          updates[`system.skills.${state.schemaKey}.entries`] = newEntries;
          restoreData.skills.push({ key, removed: true, specialization: state.specialization });
        }
      } else if (state.upgraded && state.previousLevel) {
        // Revert to previous level
        const levelUpdates = this._getLevelUpdates(state.previousLevel || "known");
        
        if (state.specialization !== undefined && state.entryIndex !== undefined) {
          // Specialist skill entry
          for (const [field, value] of Object.entries(levelUpdates)) {
            const cleanField = field.replace('system.', '');
            updates[`system.skills.${state.schemaKey}.entries.${state.entryIndex}.${cleanField}`] = value;
          }
        } else {
          // Standard skill
          for (const [field, value] of Object.entries(levelUpdates)) {
            updates[`system.skills.${state.schemaKey}.${field.replace('system.', '')}`] = value;
          }
        }
        restoreData.skills.push({ key, reverted: true, previousLevel: state.previousLevel });
      }
    }

    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }

    return restoreData;
  }

  /** @inheritDoc */
  getAutomaticValue() {
    if (this.optional) return false;
    if (this.skills.some(s => s.optional)) return false;
    return { selected: this.skills.map(s => this._getSkillKey(s)) };
  }

  /** @inheritDoc */
  async getSummary() {
    const summary = await super.getSummary();
    summary.icon = this.constructor.ICON;

    for (const skillConfig of this.skills) {
      const levelLabel = game.i18n.localize(
        this.constructor.TRAINING_LEVELS[skillConfig.level]?.label ?? skillConfig.level
      );
      
      let skillLabel = skillConfig.key;
      if (skillConfig.specialization) {
        skillLabel = `${skillConfig.key} (${skillConfig.specialization})`;
      }

      summary.details.push({
        label: skillLabel,
        value: levelLabel,
        optional: skillConfig.optional
      });
    }

    return summary;
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Get a unique key for a skill config.
   * @param {object} skillConfig 
   * @returns {string}
   * @private
   */
  _getSkillKey(skillConfig) {
    if (skillConfig.specialization) {
      return `${skillConfig.key}:${skillConfig.specialization}`;
    }
    return skillConfig.key;
  }

  /**
   * Get update data for a training level.
   * @param {string} level 
   * @returns {object}
   * @private
   */
  _getLevelUpdates(level) {
    const updates = {
      "trained": false,
      "plus10": false,
      "plus20": false
    };

    switch (level) {
      case "plus20":
        updates["plus20"] = true;
        updates["plus10"] = true;
        updates["trained"] = true;
        break;
      case "plus10":
        updates["plus10"] = true;
        updates["trained"] = true;
        break;
      case "trained":
        updates["trained"] = true;
        break;
    }

    return updates;
  }

  /** @inheritDoc */
  validateGrant() {
    const errors = super.validateGrant();
    
    if (!this.skills || this.skills.length === 0) {
      errors.push("Skill grant has no skills configured");
    }

    for (const skill of (this.skills || [])) {
      if (!skill.key) {
        errors.push("Skill grant entry missing key");
      }
      if (!this.constructor.TRAINING_LEVELS[skill.level]) {
        errors.push(`Invalid training level: ${skill.level}`);
      }
    }

    return errors;
  }
}
