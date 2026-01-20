/**
 * @file NPCSheetV2 - NPC actor sheet for V2 NPC data model
 * Phases 0-4: Complete NPC sheet with quick create and threat scaling
 */

import BaseActorSheet from "./base-actor-sheet.mjs";
import NPCThreatScalerDialog from "../npc/threat-scaler-dialog.mjs";
import StatBlockExporter from "../npc/stat-block-exporter.mjs";
import DifficultyCalculatorDialog from "../npc/difficulty-calculator-dialog.mjs";
import CombatPresetDialog from "../npc/combat-preset-dialog.mjs";

/**
 * Actor sheet for npcV2 type actors.
 * Uses ApplicationV2 PARTS system with simplified NPC-focused UI.
 * 
 * @extends {BaseActorSheet}
 */
export default class NPCSheetV2 extends BaseActorSheet {
  
  /* -------------------------------------------- */
  /*  Static Configuration                        */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["rogue-trader", "sheet", "actor", "npc-v2"],
    position: {
      width: 900,
      height: 700
    },
    actions: {
      changeTab: NPCSheetV2.#onChangeTab,
      // Horde actions
      toggleHordeMode: NPCSheetV2.#toggleHordeMode,
      applyMagnitudeDamage: NPCSheetV2.#applyMagnitudeDamage,
      restoreMagnitude: NPCSheetV2.#restoreMagnitude,
      // Roll actions
      rollCharacteristic: NPCSheetV2.#rollCharacteristic,
      rollSkill: NPCSheetV2.#rollSkill,
      rollWeapon: NPCSheetV2.#rollWeapon,
      rollInitiative: NPCSheetV2.#rollInitiative,
      // Weapon actions
      addSimpleWeapon: NPCSheetV2.#addSimpleWeapon,
      removeSimpleWeapon: NPCSheetV2.#removeSimpleWeapon,
      toggleWeaponMode: NPCSheetV2.#toggleWeaponMode,
      promoteWeapon: NPCSheetV2.#promoteWeapon,
      // Armour actions
      toggleArmourMode: NPCSheetV2.#toggleArmourMode,
      // Skill actions
      addTrainedSkill: NPCSheetV2.#addTrainedSkill,
      removeTrainedSkill: NPCSheetV2.#removeTrainedSkill,
      toggleFavoriteSkill: NPCSheetV2.#toggleFavoriteSkill,
      setSkillLevel: NPCSheetV2.#setSkillLevel,
      // Ability actions
      pinAbility: NPCSheetV2.#pinAbility,
      unpinAbility: NPCSheetV2.#unpinAbility,
      toggleFavoriteTalent: NPCSheetV2.#toggleFavoriteTalent,
      // GM utility actions
      setupToken: NPCSheetV2.#setupToken,
      duplicateNPC: NPCSheetV2.#duplicateNPC,
      scaleToThreat: NPCSheetV2.#scaleToThreat,
      exportStatBlock: NPCSheetV2.#exportStatBlock,
      importStatBlock: NPCSheetV2.#importStatBlock,
      calculateDifficulty: NPCSheetV2.#calculateDifficulty,
      saveCombatPreset: NPCSheetV2.#saveCombatPreset,
      loadCombatPreset: NPCSheetV2.#loadCombatPreset,
      deleteNPC: NPCSheetV2.#deleteNPC,
      editImage: NPCSheetV2.#editImage,
      applyDamage: NPCSheetV2.#applyDamage,
      healWounds: NPCSheetV2.#healWounds,
      applyCustomDamage: NPCSheetV2.#applyCustomDamage,
      healCustomWounds: NPCSheetV2.#healCustomWounds,
      // Combat tracker actions
      rerollInitiative: NPCSheetV2.#rerollInitiative,
      addToCombat: NPCSheetV2.#addToCombat,
      removeFromCombat: NPCSheetV2.#removeFromCombat,
      // Tag actions
      addTag: NPCSheetV2.#addTag,
      removeTag: NPCSheetV2.#removeTag,
      // UI actions
      toggleEditSection: NPCSheetV2.#toggleEditSection
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    navigation: {
      template: "systems/rogue-trader/templates/actor/npc-v2/navigation.hbs"
    },
    overview: {
      template: "systems/rogue-trader/templates/actor/npc-v2/tab-overview.hbs",
      container: { classes: ["rt-body"], id: "tab-body" },
      scrollable: [""]
    },
    combat: {
      template: "systems/rogue-trader/templates/actor/npc-v2/tab-combat.hbs",
      container: { classes: ["rt-body"], id: "tab-body" },
      scrollable: [""]
    },
    abilities: {
      template: "systems/rogue-trader/templates/actor/npc-v2/tab-abilities.hbs",
      container: { classes: ["rt-body"], id: "tab-body" },
      scrollable: [""]
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static TABS = [
    { tab: "overview", label: "RT.NPC.Interaction", icon: "fa-solid fa-hand-pointer", group: "primary", cssClass: "tab-overview" },
    { tab: "combat", label: "RT.Tabs.Combat", icon: "fa-solid fa-swords", group: "primary", cssClass: "tab-combat" },
    { tab: "abilities", label: "RT.Tabs.Abilities", icon: "fa-solid fa-stars", group: "primary", cssClass: "tab-abilities" }
  ];

  /* -------------------------------------------- */

  /** @override */
  tabGroups = {
    primary: "overview"
  };

  /* -------------------------------------------- */
  /*  Context Preparation                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = {
      actor: this.actor,
      system: this.actor.system,
      source: this.isEditable ? this.actor.system._source : this.actor.system,
      fields: this.actor.system.schema?.fields ?? {},
      effects: this.actor.getEmbeddedCollection("ActiveEffect").contents,
      items: Array.from(this.actor.items),
      limited: this.actor.limited,
      rollableClass: this.isEditable ? "rollable" : "",
      isGM: game.user.isGM,
      editable: this.isEditable
    };

    // Prepare threat tier for header display
    context.threatTier = this.actor.system.threatTier;

    context.npcTypeOptions = {
      troop: "Troop",
      elite: "Elite",
      master: "Master",
      horde: "Horde",
      swarm: "Swarm",
      creature: "Creature",
      daemon: "Daemon",
      xenos: "Xenos"
    };

    context.npcRoleOptions = {
      bruiser: "Bruiser",
      sniper: "Sniper",
      caster: "Caster",
      support: "Support",
      commander: "Commander",
      specialist: "Specialist"
    };

    context.weaponClassOptions = {
      melee: "Melee",
      pistol: "Pistol",
      basic: "Basic",
      heavy: "Heavy",
      thrown: "Thrown"
    };

    // Prepare characteristics for display
    this._prepareCharacteristicsContext(context);

    // Prepare weapons
    this._prepareWeaponsContext(context);

    // Prepare horde data
    this._prepareHordeContext(context);

    // Prepare items (talents, traits)
    await this._prepareItems(context);

    // Prepare tabs
    context.tabs = this._prepareTabs();

    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare characteristics data for display.
   * Creates a 3x3 grid of 9 characteristics (excludes Influence for NPCs).
   * @param {object} context - The render context.
   * @protected
   */
  _prepareCharacteristicsContext(context) {
    const chars = context.system.characteristics || {};
    const charArray = [];

    // Define the 9 characteristics for NPCs (exclude Influence)
    const npcCharKeys = [
      "weaponSkill", "ballisticSkill", "strength",
      "toughness", "agility", "intelligence",
      "perception", "willpower", "fellowship"
    ];

    for (const key of npcCharKeys) {
      const char = chars[key];
      if (!char) continue;
      charArray.push({
        key,
        label: char.label,
        short: char.short,
        base: char.base,
        modifier: char.modifier,
        unnatural: char.unnatural,
        total: char.total,
        bonus: char.bonus,
        hasUnnatural: (char.unnatural || 0) >= 2
      });
    }

    context.characteristicsArray = charArray;
  }

  /* -------------------------------------------- */

  /**
   * Prepare weapons data for display.
   * @param {object} context - The render context.
   * @protected
   */
  _prepareWeaponsContext(context) {
    const weapons = context.system.weapons || {};
    
    // Simple mode weapons
    context.simpleWeapons = (weapons.simple || []).map((w, idx) => ({
      ...w,
      index: idx,
      isMelee: w.class === "melee",
      isRanged: ["pistol", "basic", "heavy", "thrown", "launcher"].includes(w.class)
    }));

    // Embedded mode weapons (from items)
    context.embeddedWeapons = context.items.filter(i => i.type === "weapon");

    context.weaponMode = weapons.mode || "simple";
    context.isSimpleMode = context.weaponMode === "simple";
    context.isEmbeddedMode = context.weaponMode === "embedded";
  }

  /* -------------------------------------------- */

  /**
   * Prepare horde data for display.
   * @param {object} context - The render context.
   * @protected
   */
  _prepareHordeContext(context) {
    const horde = context.system.horde || {};
    const isHorde = context.system.isHorde;

    context.horde = {
      enabled: horde.enabled,
      magnitude: horde.magnitude?.current ?? 30,
      magnitudeMax: horde.magnitude?.max ?? 30,
      magnitudePercent: context.system.magnitudePercent ?? 100,
      damageMultiplier: horde.damageMultiplier ?? 1,
      sizeModifier: horde.sizeModifier ?? 0,
      isHorde,
      destroyed: context.system.hordeDestroyed ?? false
    };

    // Magnitude bar styling
    const pct = context.horde.magnitudePercent;
    context.horde.barClass = pct > 66 ? "high" : pct > 33 ? "medium" : "low";
  }

  /* -------------------------------------------- */

  /**
   * Prepare tabs configuration.
   * @returns {Array} Tabs configuration array.
   * @protected
   */
  _prepareTabs() {
    return this.constructor.TABS.map(tab => ({
      id: tab.tab,
      tab: tab.tab,
      group: tab.group,
      label: game.i18n.localize(tab.label),
      icon: tab.icon,
      active: this.tabGroups[tab.group] === tab.tab,
      cssClass: tab.cssClass
    }));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    
    // Add tab metadata for all tab parts
    const tabParts = ["overview", "combat", "abilities"];
    if (tabParts.includes(partId)) {
      const tabConfig = this.constructor.TABS.find(t => t.tab === partId);
      context.tab = {
        id: partId,
        group: tabConfig?.group || "primary",
        active: this.tabGroups.primary === partId,
        cssClass: tabConfig?.cssClass || ""
      };
    }

    // Prepare tab-specific context
    switch (partId) {
      case "navigation":
        // Navigation part gets all context, no special prep needed
        break;
      case "overview":
        this._prepareOverviewContext(context);
        this._prepareSkillsContext(context); // Skills now part of overview
        this._prepareAbilitiesContext(context); // Talents/traits on overview
        this._prepareNotesContext(context);  // Notes now part of overview
        break;
      case "combat":
        this._prepareCombatContext(context);
        break;
      case "abilities":
        this._prepareAbilitiesContext(context);
        break;
    }
    
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare overview tab context.
   * @param {object} context - The render context.
   * @protected
   */
  _prepareOverviewContext(context) {
    // Pinned abilities for overview
    const pinnedIds = context.system.pinnedAbilities || [];
    context.pinnedAbilities = context.items.filter(i => 
      pinnedIds.includes(i.id) && (i.type === "talent" || i.type === "trait")
    );

    // Favorite Skills
    const favoriteSkillKeys = this.actor.getFlag("rogue-trader", "favoriteSkills") || [];
    context.favoriteSkills = favoriteSkillKeys.map(key => {
      const skillData = context.system.trainedSkills[key];
      if (!skillData) return null;

      // Get characteristic for this skill
      const charMap = {
        acrobatics: "agility", athletics: "strength", awareness: "perception",
        charm: "fellowship", command: "fellowship", commerce: "fellowship",
        deceive: "fellowship", dodge: "agility", inquiry: "fellowship",
        interrogation: "willpower", intimidate: "strength", logic: "intelligence",
        medicae: "intelligence", parry: "weaponSkill", psyniscience: "perception",
        scrutiny: "perception", security: "intelligence", sleightOfHand: "agility",
        stealth: "agility", survival: "perception", techUse: "intelligence"
      };
      const charKey = charMap[key] || "intelligence";
      const char = context.system.characteristics[charKey];
      const target = context.system.getSkillTarget ? context.system.getSkillTarget(key) : char.total;

      return {
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
        charShort: char.short,
        target,
        isFavorite: true
      };
    }).filter(s => s !== null);

    // Favorite Talents
    const favoriteTalentIds = this.actor.getFlag("rogue-trader", "favoriteTalents") || [];
    context.favoriteTalents = context.items.filter(i =>
      favoriteTalentIds.includes(i.id) && i.type === "talent"
    );

    // Armour data
    context.armour = {
      mode: context.system.armour.mode,
      isSimple: context.system.armour.mode === "simple",
      isLocations: context.system.armour.mode === "locations",
      total: context.system.armour.total,
      locations: context.system.armour.locations
    };

    // Hit locations for location-based armour
    context.hitLocations = [
      { key: "head", label: "Head", value: context.system.armour.locations?.head ?? 0 },
      { key: "body", label: "Body", value: context.system.armour.locations?.body ?? 0 },
      { key: "leftArm", label: "Left Arm", value: context.system.armour.locations?.leftArm ?? 0 },
      { key: "rightArm", label: "Right Arm", value: context.system.armour.locations?.rightArm ?? 0 },
      { key: "leftLeg", label: "Left Leg", value: context.system.armour.locations?.leftLeg ?? 0 },
      { key: "rightLeg", label: "Right Leg", value: context.system.armour.locations?.rightLeg ?? 0 }
    ];

    // Combat summary
    context.combatSummary = {
      initiative: context.system.initiative,
      dodge: context.system.getSkillTarget ? context.system.getSkillTarget("dodge") : "—",
      parry: context.system.getSkillTarget ? context.system.getSkillTarget("parry") : "—",
      armour: context.system.armour.mode === "simple" ? 
        context.system.armour.total : 
        "By Location"
    };

    // Toughness bonus for armor display
    context.toughnessBonus = context.system.characteristics?.toughness?.bonus ?? 0;

    // Threat tier
    context.threatTier = context.system.threatTier;
  }

  /* -------------------------------------------- */

  /**
   * Prepare combat tab context.
   * @param {object} context - The render context.
   * @protected
   */
  _prepareCombatContext(context) {
    // Armour data
    context.armour = {
      mode: context.system.armour.mode,
      isSimple: context.system.armour.mode === "simple",
      isLocations: context.system.armour.mode === "locations",
      total: context.system.armour.total,
      locations: context.system.armour.locations
    };

    // Hit locations for location-based armour
    context.hitLocations = [
      { key: "head", label: "Head", value: context.system.armour.locations?.head ?? 0 },
      { key: "body", label: "Body", value: context.system.armour.locations?.body ?? 0 },
      { key: "leftArm", label: "Left Arm", value: context.system.armour.locations?.leftArm ?? 0 },
      { key: "rightArm", label: "Right Arm", value: context.system.armour.locations?.rightArm ?? 0 },
      { key: "leftLeg", label: "Left Leg", value: context.system.armour.locations?.leftLeg ?? 0 },
      { key: "rightLeg", label: "Right Leg", value: context.system.armour.locations?.rightLeg ?? 0 }
    ];

    // Movement
    context.movement = context.system.movement;
    
    // Toughness bonus for armor display
    context.toughnessBonus = context.system.characteristics?.toughness?.bonus ?? 0;

    // Combat summary
    context.combatSummary = {
      dodge: context.system.getSkillTarget ? context.system.getSkillTarget("dodge") : "—",
      parry: context.system.getSkillTarget ? context.system.getSkillTarget("parry") : "—"
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare skills tab context.
   * @param {object} context - The render context.
   * @protected
   */
  _prepareSkillsContext(context) {
    // Get trained skills list from data model
    context.trainedSkillsList = context.system.trainedSkillsList || [];
    
    // Get favorite skills
    const favoriteSkillKeys = this.actor.getFlag("rogue-trader", "favoriteSkills") || [];

    // Define all basic skills with their characteristics
    const allBasicSkills = [
      { key: "acrobatics", name: "Acrobatics", char: "Ag", category: "stealth" },
      { key: "athletics", name: "Athletics", char: "S", category: "combat" },
      { key: "awareness", name: "Awareness", char: "Per", category: "stealth" },
      { key: "charm", name: "Charm", char: "Fel", category: "social" },
      { key: "command", name: "Command", char: "Fel", category: "social" },
      { key: "commerce", name: "Commerce", char: "Fel", category: "social" },
      { key: "deceive", name: "Deceive", char: "Fel", category: "social" },
      { key: "dodge", name: "Dodge", char: "Ag", category: "combat" },
      { key: "inquiry", name: "Inquiry", char: "Fel", category: "social" },
      { key: "interrogation", name: "Interrogation", char: "WP", category: "social" },
      { key: "intimidate", name: "Intimidate", char: "S", category: "social" },
      { key: "logic", name: "Logic", char: "Int", category: "technical" },
      { key: "medicae", name: "Medicae", char: "Int", category: "technical" },
      { key: "parry", name: "Parry", char: "WS", category: "combat" },
      { key: "psyniscience", name: "Psyniscience", char: "Per", category: "technical" },
      { key: "scrutiny", name: "Scrutiny", char: "Per", category: "social" },
      { key: "security", name: "Security", char: "Int", category: "technical" },
      { key: "sleightOfHand", name: "Sleight of Hand", char: "Ag", category: "stealth" },
      { key: "stealth", name: "Stealth", char: "Ag", category: "stealth" },
      { key: "survival", name: "Survival", char: "Per", category: "stealth" },
      { key: "techUse", name: "Tech-Use", char: "Int", category: "technical" }
    ];

    // Characteristic key mapping
    const charKeyMap = {
      "WS": "weaponSkill", "BS": "ballisticSkill", "S": "strength", "T": "toughness",
      "Ag": "agility", "Int": "intelligence", "Per": "perception", "WP": "willpower",
      "Fel": "fellowship", "Inf": "influence"
    };

    // Build basic skills list with training states
    context.basicSkillsList = allBasicSkills.map(skill => {
      const trainedData = context.system.trainedSkills?.[skill.key];
      const charKey = charKeyMap[skill.char] || "intelligence";
      const charData = context.system.characteristics[charKey];
      const isTrained = !!trainedData;
      
      // Calculate target
      let target = charData?.total ?? 30;
      if (isTrained) {
        if (trainedData.plus20) target += 20;
        else if (trainedData.plus10) target += 10;
        target += (trainedData.bonus || 0);
      } else {
        target -= 20; // Untrained penalty
      }

      return {
        ...skill,
        isTrained,
        trained: isTrained,
        plus10: trainedData?.plus10 || false,
        plus20: trainedData?.plus20 || false,
        target,
        isFavorite: favoriteSkillKeys.includes(skill.key)
      };
    });

    // Mark favorite status on trained skills list
    context.trainedSkillsList = context.trainedSkillsList.map(skill => ({
      ...skill,
      isFavorite: favoriteSkillKeys.includes(skill.key)
    }));

    // Skills by category for quick-add
    const trainedKeys = Object.keys(context.system.trainedSkills || {});
    
    context.combatSkills = allBasicSkills
      .filter(s => s.category === "combat")
      .map(s => ({ ...s, added: trainedKeys.includes(s.key) }));
    
    context.socialSkills = allBasicSkills
      .filter(s => s.category === "social")
      .map(s => ({ ...s, added: trainedKeys.includes(s.key) }));
    
    context.stealthSkills = allBasicSkills
      .filter(s => s.category === "stealth")
      .map(s => ({ ...s, added: trainedKeys.includes(s.key) }));
    
    context.technicalSkills = allBasicSkills
      .filter(s => s.category === "technical")
      .map(s => ({ ...s, added: trainedKeys.includes(s.key) }));

    // Legacy: available skills for dropdown (not yet trained)
    context.availableSkills = allBasicSkills.filter(s => !trainedKeys.includes(s.key));
  }

  /* -------------------------------------------- */

  /**
   * Prepare abilities tab context.
   * @param {object} context - The render context.
   * @protected
   */
  _prepareAbilitiesContext(context) {
    const pinnedIds = context.system.pinnedAbilities || [];

    // Talents
    context.talents = context.items.filter(i => i.type === "talent").map(t => ({
      ...t,
      isPinned: pinnedIds.includes(t.id)
    }));

    // Traits
    context.traits = context.items.filter(i => i.type === "trait").map(t => ({
      ...t,
      isPinned: pinnedIds.includes(t.id)
    }));

    // Psychic powers
    context.psychicPowers = context.items.filter(i => i.type === "psychicPower");

    // Other abilities (special abilities from HTML field)
    context.hasSpecialAbilities = !!context.system.specialAbilities;
  }

  /* -------------------------------------------- */

  /**
   * Prepare notes tab context.
   * @param {object} context - The render context.
   * @protected
   */
  _prepareNotesContext(context) {
    // Tags
    context.tags = context.system.tags || [];

    // Source reference
    context.source = context.system.source || "";

    // Template info
    context.templateUuid = context.system.template || "";
  }

  /* -------------------------------------------- */
  /*  Action Handlers                             */
  /* -------------------------------------------- */

  /**
   * Handle toggling horde mode.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #toggleHordeMode(event, target) {
    event.preventDefault();
    await this.actor.system.toggleHordeMode();
  }

  /* -------------------------------------------- */

  /**
   * Handle characteristic roll.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #rollCharacteristic(event, target) {
    event.preventDefault();
    const charKey = target.dataset.characteristic;
    if (!charKey) return;

    const char = this.actor.system.characteristics[charKey];
    if (!char) return;

    // Use the system's D100Roll for characteristic tests
    const { D100Roll } = game.rt.dice;
    const roll = new D100Roll(`1d100`, {}, {
      target: char.total,
      type: "characteristic",
      label: char.label
    });

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${char.label} Test`
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle weapon attack roll.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #rollWeapon(event, target) {
    event.preventDefault();
    const weaponIndex = parseInt(target.dataset.weaponIndex, 10);
    const weapons = this.actor.system.weapons?.simple || [];
    const weapon = weapons[weaponIndex];
    if (!weapon) return;

    // Determine attack characteristic
    const attackChar = weapon.class === "melee" ? "weaponSkill" : "ballisticSkill";
    const char = this.actor.system.characteristics[attackChar];
    if (!char) return;

    // Roll attack
    const { D100Roll } = game.rt.dice;
    const roll = new D100Roll(`1d100`, {}, {
      target: char.total,
      type: "attack",
      label: weapon.name
    });

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${weapon.name} Attack (${weapon.damage}, Pen ${weapon.pen})`
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle adding a simple weapon.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #addSimpleWeapon(event, target) {
    event.preventDefault();
    const weapons = foundry.utils.deepClone(this.actor.system.weapons?.simple || []);
    weapons.push({
      name: "New Weapon",
      damage: "1d10",
      pen: 0,
      range: "Melee",
      rof: "S/-/-",
      clip: 0,
      reload: "-",
      special: "",
      class: "melee"
    });
    await this.actor.update({ "system.weapons.simple": weapons });
  }

  /* -------------------------------------------- */

  /**
   * Handle removing a simple weapon.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #removeSimpleWeapon(event, target) {
    event.preventDefault();
    const weaponIndex = parseInt(target.dataset.weaponIndex, 10);
    const weapons = foundry.utils.deepClone(this.actor.system.weapons?.simple || []);
    weapons.splice(weaponIndex, 1);
    await this.actor.update({ "system.weapons.simple": weapons });
  }

  /* -------------------------------------------- */

  /**
   * Handle applying magnitude damage.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #applyMagnitudeDamage(event, target) {
    event.preventDefault();
    const amount = parseInt(target.dataset.amount || "1", 10);
    await this.actor.system.applyMagnitudeDamage(amount, "Manual");
  }

  /* -------------------------------------------- */

  /**
   * Handle restoring magnitude.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #restoreMagnitude(event, target) {
    event.preventDefault();
    const amount = parseInt(target.dataset.amount || "1", 10);
    await this.actor.system.restoreMagnitude(amount, "Manual");
  }

  /* -------------------------------------------- */

  /**
   * Handle skill roll.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #rollSkill(event, target) {
    event.preventDefault();
    const skillKey = target.dataset.skill;
    if (!skillKey) return;
    await this.actor.rollSkill(skillKey);
  }

  /* -------------------------------------------- */

  /**
   * Handle initiative roll.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #rollInitiative(event, target) {
    event.preventDefault();
    // Roll initiative using the system's initiative formula
    const initChar = this.actor.system.initiative.characteristic;
    const char = this.actor.system.characteristics[initChar];
    if (!char) return;

    const formula = `1d10 + ${char.bonus}`;
    const roll = new Roll(formula);
    await roll.evaluate();
    
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: "Initiative Roll"
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling weapon mode.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #toggleWeaponMode(event, target) {
    event.preventDefault();
    const currentMode = this.actor.system.weapons?.mode || "simple";
    const newMode = currentMode === "simple" ? "embedded" : "simple";
    await this.actor.system.switchWeaponMode(newMode);
  }

  /* -------------------------------------------- */

  /**
   * Handle promoting a simple weapon to embedded.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #promoteWeapon(event, target) {
    event.preventDefault();
    const weaponIndex = parseInt(target.dataset.weaponIndex, 10);
    await this.actor.system.promoteSimpleWeapon(weaponIndex);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling armour mode.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #toggleArmourMode(event, target) {
    event.preventDefault();
    const currentMode = this.actor.system.armour?.mode || "simple";
    const newMode = currentMode === "simple" ? "locations" : "simple";
    await this.actor.system.switchArmourMode(newMode);
  }

  /* -------------------------------------------- */

  /**
   * Handle adding a trained skill.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #addTrainedSkill(event, target) {
    event.preventDefault();
    const skillKey = target.dataset.skill;
    if (!skillKey) {
      // Show skill selection dialog
      const skills = [
        { key: "acrobatics", name: "Acrobatics" },
        { key: "athletics", name: "Athletics" },
        { key: "awareness", name: "Awareness" },
        { key: "charm", name: "Charm" },
        { key: "command", name: "Command" },
        { key: "commerce", name: "Commerce" },
        { key: "deceive", name: "Deceive" },
        { key: "dodge", name: "Dodge" },
        { key: "inquiry", name: "Inquiry" },
        { key: "interrogation", name: "Interrogation" },
        { key: "intimidate", name: "Intimidate" },
        { key: "logic", name: "Logic" },
        { key: "medicae", name: "Medicae" },
        { key: "parry", name: "Parry" },
        { key: "psyniscience", name: "Psyniscience" },
        { key: "scrutiny", name: "Scrutiny" },
        { key: "security", name: "Security" },
        { key: "sleightOfHand", name: "Sleight of Hand" },
        { key: "stealth", name: "Stealth" },
        { key: "survival", name: "Survival" },
        { key: "techUse", name: "Tech-Use" }
      ].filter(s => !this.actor.system.trainedSkills[s.key]);

      const options = skills.map(s => `<option value="${s.key}">${s.name}</option>`).join("");
      
      const content = `
        <form>
          <div class="form-group">
            <label>Skill</label>
            <select name="skill">${options}</select>
          </div>
          <div class="form-group">
            <label>Level</label>
            <select name="level">
              <option value="trained">Trained</option>
              <option value="plus10">+10</option>
              <option value="plus20">+20</option>
            </select>
          </div>
        </form>
      `;

      const dialog = new foundry.applications.api.DialogV2({
        window: { title: "Add Trained Skill" },
        content,
        buttons: [
          {
            action: "add",
            label: "Add",
            default: true,
            callback: async (event, button, dialog) => {
              const form = button.form;
              const skill = form.querySelector('[name="skill"]').value;
              const level = form.querySelector('[name="level"]').value;
              await this.actor.system.addTrainedSkill(skill, null, level);
            }
          },
          {
            action: "cancel",
            label: "Cancel"
          }
        ]
      });
      dialog.render(true);
      return;
    }
    await this.actor.system.addTrainedSkill(skillKey);
  }

  /* -------------------------------------------- */

  /**
   * Handle removing a trained skill.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #removeTrainedSkill(event, target) {
    event.preventDefault();
    const skillKey = target.dataset.skill;
    if (!skillKey) return;
    await this.actor.system.removeSkill(skillKey);
  }

  /* -------------------------------------------- */

  /**
   * Handle setting skill training level.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #setSkillLevel(event, target) {
    event.preventDefault();
    const skillKey = target.dataset.skill;
    const level = target.dataset.level;
    if (!skillKey || !level) return;

    const currentSkills = foundry.utils.deepClone(this.actor.system.trainedSkills) || {};
    const currentState = currentSkills[skillKey];
    
    // Skill characteristic mapping
    const skillCharMap = {
      acrobatics: "agility", athletics: "strength", awareness: "perception",
      charm: "fellowship", command: "fellowship", commerce: "fellowship",
      deceive: "fellowship", dodge: "agility", inquiry: "fellowship",
      interrogation: "willpower", intimidate: "strength", logic: "intelligence",
      medicae: "intelligence", parry: "weaponSkill", psyniscience: "perception",
      scrutiny: "perception", security: "intelligence", sleightOfHand: "agility",
      stealth: "agility", survival: "perception", techUse: "intelligence"
    };

    // Handle toggle logic
    switch (level) {
      case "untrained":
        // Remove the skill entirely
        delete currentSkills[skillKey];
        break;
      case "trained":
        // Add skill at trained level
        currentSkills[skillKey] = {
          name: skillKey,
          characteristic: skillCharMap[skillKey] || "perception",
          trained: true,
          plus10: false,
          plus20: false,
          bonus: 0
        };
        break;
      case "plus10":
        // Toggle +10: if already at +10 (and not +20), drop to trained; otherwise set to +10
        if (currentState?.plus10 && !currentState?.plus20) {
          currentSkills[skillKey] = {
            name: skillKey,
            characteristic: currentState.characteristic || skillCharMap[skillKey] || "perception",
            trained: true,
            plus10: false,
            plus20: false,
            bonus: currentState.bonus || 0
          };
        } else {
          currentSkills[skillKey] = {
            name: skillKey,
            characteristic: currentState?.characteristic || skillCharMap[skillKey] || "perception",
            trained: true,
            plus10: true,
            plus20: false,
            bonus: currentState?.bonus || 0
          };
        }
        break;
      case "plus20":
        // Toggle +20: if already at +20, drop to +10; otherwise set to +20
        if (currentState?.plus20) {
          currentSkills[skillKey] = {
            name: skillKey,
            characteristic: currentState.characteristic || skillCharMap[skillKey] || "perception",
            trained: true,
            plus10: true,
            plus20: false,
            bonus: currentState.bonus || 0
          };
        } else {
          currentSkills[skillKey] = {
            name: skillKey,
            characteristic: currentState?.characteristic || skillCharMap[skillKey] || "perception",
            trained: true,
            plus10: true,
            plus20: true,
            bonus: currentState?.bonus || 0
          };
        }
        break;
    }

    await this.actor.update({ "system.trainedSkills": currentSkills });
  }

  /* -------------------------------------------- */

  /**
   * Handle pinning an ability.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #pinAbility(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    if (!itemId) return;
    await this.actor.system.pinAbility(itemId);
  }

  /* -------------------------------------------- */

  /**
   * Handle unpinning an ability.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #unpinAbility(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    if (!itemId) return;
    await this.actor.system.unpinAbility(itemId);
  }

  /* -------------------------------------------- */

  /**
   * Handle editing the actor image.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #editImage(event, target) {
    event.preventDefault();
    const fp = new FilePicker({
      type: "image",
      current: this.actor.img,
      callback: path => {
        this.actor.update({ img: path });
      }
    });
    fp.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle setting up token configuration automatically.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #setupToken(event, target) {
    event.preventDefault();
    const npc = this.actor;
    const updates = {};

    // Size-based dimensions
    const sizeMap = {
      1: 0.5,  // Miniscule
      2: 0.75, // Tiny
      3: 1,    // Small
      4: 1,    // Average
      5: 2,    // Hulking
      6: 2,    // Enormous
      7: 3,    // Massive
      8: 3,    // Immense
      9: 4,    // Gargantuan
      10: 4    // Colossal
    };
    updates.width = sizeMap[npc.system.size] || 1;
    updates.height = sizeMap[npc.system.size] || 1;

    // Type-based vision/detection
    if (npc.system.type === "daemon" || npc.system.type === "xenos") {
      updates.sight = { enabled: true, range: 60, visionMode: "darkvision" };
    } else {
      updates.sight = { enabled: true, range: 30 };
    }

    // Bars
    updates.bar1 = { attribute: "wounds" };
    if (npc.system.horde?.enabled) {
      updates.bar2 = { attribute: "horde.magnitude" };
    }

    // Disposition - hostile by default
    updates.disposition = -1;

    // Display name mode
    updates.displayName = 20; // OWNER_HOVER

    await npc.update({ prototypeToken: updates });
    ui.notifications.info(`Token configured for ${npc.name}`);
  }

  /* -------------------------------------------- */

  /**
   * Handle duplicating the NPC.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #duplicateNPC(event, target) {
    event.preventDefault();
    await this.actor.duplicate();
    ui.notifications.info(`Created copy of ${this.actor.name}`);
  }

  /* -------------------------------------------- */

  /**
   * Handle scaling to threat level.
   * Opens the NPCThreatScalerDialog for full-featured scaling.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #scaleToThreat(event, target) {
    event.preventDefault();
    await NPCThreatScalerDialog.scale(this.actor);
  }

  /* -------------------------------------------- */

  /**
   * Handle calculating encounter difficulty.
   * Opens the DifficultyCalculatorDialog for full party-based calculation.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #calculateDifficulty(event, target) {
    event.preventDefault();
    const { DifficultyCalculatorDialog } = game.rt.applications;
    await DifficultyCalculatorDialog.show(this.actor);
  }

  /* -------------------------------------------- */

  /**
   * Handle saving a combat preset from current NPC.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #saveCombatPreset(event, target) {
    event.preventDefault();
    await CombatPresetDialog.savePreset(this.actor);
  }

  /* -------------------------------------------- */

  /**
   * Handle loading a combat preset to current NPC.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #loadCombatPreset(event, target) {
    event.preventDefault();
    await CombatPresetDialog.loadPreset(this.actor);
  }

  /* -------------------------------------------- */

  /**
   * Handle deleting the NPC.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #deleteNPC(event, target) {
    event.preventDefault();
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete NPC" },
      content: `<p>Are you sure you want to delete <strong>${this.actor.name}</strong>?</p>`,
      rejectClose: false
    });
    
    if (confirmed) {
      await this.actor.delete();
      ui.notifications.info(`Deleted ${this.actor.name}`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle exporting stat block.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #exportStatBlock(event, target) {
    event.preventDefault();
    
    // Open the full exporter dialog
    StatBlockExporter.show(this.actor);
  }

  /* -------------------------------------------- */

  /**
   * Handle importing from a stat block.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #importStatBlock(event, target) {
    event.preventDefault();
    
    // Import and show the stat block importer dialog
    const { StatBlockImporter } = await import("../dialogs/stat-block-importer.mjs");
    StatBlockImporter.show(this.actor);
  }

  /* -------------------------------------------- */

  /**
   * Handle applying damage.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #applyDamage(event, target) {
    event.preventDefault();
    const amount = parseInt(target.dataset.amount || "1", 10);
    const location = target.dataset.location || "body";
    await this.actor.applyDamage(amount, location);
  }

  /* -------------------------------------------- */

  /**
   * Handle healing wounds.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #healWounds(event, target) {
    event.preventDefault();
    const amount = parseInt(target.dataset.amount || "1", 10);
    await this.actor.healWounds(amount);
  }

  /* -------------------------------------------- */

  /**
   * Handle adding a tag.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #addTag(event, target) {
    event.preventDefault();
    const content = `
      <form>
        <div class="form-group">
          <label>Tag Name</label>
          <input type="text" name="tag" placeholder="e.g., Boss, Minion, Ranged" />
        </div>
      </form>
    `;

    const dialog = new foundry.applications.api.DialogV2({
      window: { title: "Add Tag" },
      content,
      buttons: [
        {
          action: "add",
          label: "Add",
          default: true,
          callback: async (event, button, dialog) => {
            const form = button.form;
            const tag = form.querySelector('[name="tag"]').value.trim();
            if (tag) {
              const tags = [...(this.actor.system.tags || []), tag];
              await this.actor.update({ "system.tags": tags });
            }
          }
        },
        {
          action: "cancel",
          label: "Cancel"
        }
      ]
    });
    dialog.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle removing a tag.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #removeTag(event, target) {
    event.preventDefault();
    const tag = target.dataset.tag;
    if (!tag) return;
    const tags = (this.actor.system.tags || []).filter(t => t !== tag);
    await this.actor.update({ "system.tags": tags });
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling edit section visibility.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static #toggleEditSection(event, target) {
    event.preventDefault();
    const sectionId = target.dataset.target;
    if (!sectionId) return;
    
    // Find the section to toggle
    const section = this.element.querySelector(`[data-section-id="${sectionId}"]`);
    if (!section) return;
    
    // Toggle hidden attribute
    section.hidden = !section.hidden;
    
    // Toggle button state
    target.classList.toggle("active");
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling favorite skill.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #toggleFavoriteSkill(event, target) {
    event.preventDefault();
    const skillKey = target.dataset.skill;
    if (!skillKey) return;

    const currentFavorites = this.actor.getFlag("rogue-trader", "favoriteSkills") || [];
    const isFavorite = currentFavorites.includes(skillKey);

    if (isFavorite) {
      await this.actor.setFlag("rogue-trader", "favoriteSkills", currentFavorites.filter(k => k !== skillKey));
    } else {
      await this.actor.setFlag("rogue-trader", "favoriteSkills", [...currentFavorites, skillKey]);
    }

    await this.render({ parts: ['overview', 'skills'] });
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling favorite talent.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #toggleFavoriteTalent(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    if (!itemId) return;

    const currentFavorites = this.actor.getFlag("rogue-trader", "favoriteTalents") || [];
    const isFavorite = currentFavorites.includes(itemId);

    if (isFavorite) {
      await this.actor.setFlag("rogue-trader", "favoriteTalents", currentFavorites.filter(id => id !== itemId));
    } else {
      await this.actor.setFlag("rogue-trader", "favoriteTalents", [...currentFavorites, itemId]);
    }

    await this.render({ parts: ['overview', 'abilities'] });
  }

  /* -------------------------------------------- */

  /**
   * Handle applying custom damage amount.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #applyCustomDamage(event, target) {
    event.preventDefault();
    const input = this.element.querySelector('[data-custom-damage]');
    const amount = parseInt(input?.value || "1", 10);
    await this.actor.applyDamage(amount, "body");
  }

  /* -------------------------------------------- */

  /**
   * Handle healing custom wounds amount.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #healCustomWounds(event, target) {
    event.preventDefault();
    const input = this.element.querySelector('[data-custom-damage]');
    const amount = parseInt(input?.value || "1", 10);
    await this.actor.healWounds(amount);
  }

  /* -------------------------------------------- */

  /**
   * Handle rerolling initiative.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #rerollInitiative(event, target) {
    event.preventDefault();
    const combatant = game.combat?.getCombatantByActor(this.actor.id);
    if (combatant) {
      await game.combat.rollInitiative([combatant.id]);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle adding to combat.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #addToCombat(event, target) {
    event.preventDefault();
    if (!game.combat) {
      ui.notifications.warn("No active combat encounter.");
      return;
    }
    await game.combat.createEmbeddedDocuments("Combatant", [{
      actorId: this.actor.id,
      tokenId: this.actor.token?.id
    }]);
  }

  /* -------------------------------------------- */

  /**
   * Handle removing from combat.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static async #removeFromCombat(event, target) {
    event.preventDefault();
    const combatant = game.combat?.getCombatantByActor(this.actor.id);
    if (combatant) {
      await game.combat.deleteEmbeddedDocuments("Combatant", [combatant.id]);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle tab change.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The target element.
   */
  static #onChangeTab(event, target) {
    event.preventDefault();
    const tab = target.dataset.tab;
    const group = target.dataset.group || "primary";
    if (!tab) return;
    
    // Update tab groups
    this.tabGroups[group] = tab;
    
    // Re-render the sheet with the new tab active
    this.render({ parts: ["overview", "combat", "abilities"] });
  }

  /* -------------------------------------------- */
  /*  Overrides                                   */
  /* -------------------------------------------- */

  /**
   * Override to skip acolyte-specific preparations.
   * @param {object} context - The render context.
   * @protected
   */
  _prepareCharacteristicsHUD(context) {
    // NPCSheetV2 uses its own characteristic preparation
    // Skip the parent implementation
  }

  /**
   * Override to skip acolyte-specific skill preparation.
   * @param {object} context - The render context.
   * @protected
   */
  async _prepareSkills(context) {
    // NPCSheetV2 uses sparse skill system
    // Will implement in later phases
    context.skills = {};
    context.trainedSkillsList = [];
  }

  /**
   * Override to skip acolyte-specific item preparation.
   * @param {object} context - The render context.
   * @protected
   */
  async _prepareItems(context) {
    // NPCSheetV2 uses simplified item system
    context.talents = context.items.filter(i => i.type === "talent");
    context.traits = context.items.filter(i => i.type === "trait");
  }
}
