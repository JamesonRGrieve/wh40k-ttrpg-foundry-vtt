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
    const itemsToCreate = [];
    const itemsToUpdate = [];

    for (const skillConfig of this.skills) {
      const skillKey = this._getSkillKey(skillConfig);
      
      // Skip if not selected
      if (!selectedSkills.includes(skillKey)) {
        if (!skillConfig.optional && !this.optional) {
          result.errors.push(`Required skill ${skillKey} not selected`);
        }
        continue;
      }

      // Find existing skill on actor
      const existing = this._findExistingSkill(actor, skillConfig);

      if (existing) {
        // Upgrade existing skill
        const upgrade = this._calculateUpgrade(existing, skillConfig.level);
        if (upgrade) {
          itemsToUpdate.push({
            _id: existing.id,
            ...upgrade.updates
          });
          result.applied[skillKey] = {
            itemId: existing.id,
            previousLevel: upgrade.previousLevel,
            newLevel: skillConfig.level,
            upgraded: true
          };
          result.notifications.push(
            `Upgraded ${existing.name} to ${game.i18n.localize(this.constructor.TRAINING_LEVELS[skillConfig.level].label)}`
          );
        } else {
          result.notifications.push(`${existing.name} already at or above ${skillConfig.level}`);
        }
      } else {
        // Create new skill item
        const skillData = this._createSkillData(skillConfig);
        itemsToCreate.push({ key: skillKey, data: skillData });
      }
    }

    // Apply if not dry run
    if (!options.dryRun) {
      // Update existing skills
      if (itemsToUpdate.length > 0) {
        await actor.updateEmbeddedDocuments("Item", itemsToUpdate);
      }

      // Create new skills
      if (itemsToCreate.length > 0) {
        const created = await actor.createEmbeddedDocuments(
          "Item",
          itemsToCreate.map(i => i.data)
        );

        created.forEach((item, index) => {
          const key = itemsToCreate[index].key;
          result.applied[key] = {
            itemId: item.id,
            previousLevel: null,
            newLevel: this.skills.find(s => this._getSkillKey(s) === key)?.level,
            created: true
          };
          result.notifications.push(`Granted: ${item.name}`);
        });
      }
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /** @inheritDoc */
  async reverse(actor, appliedState) {
    const restoreData = { skills: [] };
    const idsToDelete = [];
    const itemsToUpdate = [];

    for (const [key, state] of Object.entries(appliedState)) {
      const item = actor.items.get(state.itemId);
      if (!item) continue;

      if (state.created) {
        // Delete created skill
        restoreData.skills.push({
          key,
          data: item.toObject(),
          created: true
        });
        idsToDelete.push(state.itemId);
      } else if (state.upgraded && state.previousLevel) {
        // Revert upgrade
        const revertUpdates = this._getLevelUpdates(state.previousLevel);
        itemsToUpdate.push({ _id: state.itemId, ...revertUpdates });
        restoreData.skills.push({
          key,
          previousLevel: state.previousLevel,
          newLevel: state.newLevel,
          upgraded: true
        });
      }
    }

    if (idsToDelete.length > 0) {
      await actor.deleteEmbeddedDocuments("Item", idsToDelete);
    }

    if (itemsToUpdate.length > 0) {
      await actor.updateEmbeddedDocuments("Item", itemsToUpdate);
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
   * Find an existing skill on the actor.
   * @param {RogueTraderActor} actor 
   * @param {object} skillConfig 
   * @returns {RogueTraderItem|null}
   * @private
   */
  _findExistingSkill(actor, skillConfig) {
    return actor.items.find(i => {
      if (i.type !== "skill") return false;
      
      // Match by key or name (normalize both)
      const itemKey = i.system?.key || i.name.toLowerCase().replace(/\s+/g, "");
      const configKey = skillConfig.key.toLowerCase();
      
      if (itemKey !== configKey && i.name.toLowerCase() !== skillConfig.key.toLowerCase()) {
        return false;
      }

      // Match specialization if present
      if (skillConfig.specialization) {
        return i.system?.specialization?.toLowerCase() === skillConfig.specialization.toLowerCase();
      }

      return true;
    });
  }

  /**
   * Calculate upgrade needed for existing skill.
   * @param {RogueTraderItem} existing 
   * @param {string} targetLevel 
   * @returns {object|null}
   * @private
   */
  _calculateUpgrade(existing, targetLevel) {
    const currentLevel = this._getCurrentLevel(existing);
    const currentOrder = this.constructor.TRAINING_LEVELS[currentLevel]?.order ?? 0;
    const targetOrder = this.constructor.TRAINING_LEVELS[targetLevel]?.order ?? 0;

    if (targetOrder <= currentOrder) return null;

    return {
      previousLevel: currentLevel,
      updates: this._getLevelUpdates(targetLevel)
    };
  }

  /**
   * Get the current training level of a skill.
   * @param {RogueTraderItem} skill 
   * @returns {string}
   * @private
   */
  _getCurrentLevel(skill) {
    if (skill.system?.plus20) return "plus20";
    if (skill.system?.plus10) return "plus10";
    if (skill.system?.trained) return "trained";
    return "known";
  }

  /**
   * Get update data for a training level.
   * @param {string} level 
   * @returns {object}
   * @private
   */
  _getLevelUpdates(level) {
    const updates = {
      "system.trained": false,
      "system.plus10": false,
      "system.plus20": false
    };

    switch (level) {
      case "plus20":
        updates["system.plus20"] = true;
        // Fall through
      case "plus10":
        updates["system.plus10"] = true;
        // Fall through
      case "trained":
        updates["system.trained"] = true;
        break;
    }

    return updates;
  }

  /**
   * Create skill item data.
   * @param {object} skillConfig 
   * @returns {object}
   * @private
   */
  _createSkillData(skillConfig) {
    const levelUpdates = this._getLevelUpdates(skillConfig.level);
    
    return {
      type: "skill",
      name: skillConfig.key,
      system: {
        key: skillConfig.key,
        specialization: skillConfig.specialization || "",
        trained: levelUpdates["system.trained"],
        plus10: levelUpdates["system.plus10"],
        plus20: levelUpdates["system.plus20"]
      },
      flags: this._createGrantFlags(null)
    };
  }
}
