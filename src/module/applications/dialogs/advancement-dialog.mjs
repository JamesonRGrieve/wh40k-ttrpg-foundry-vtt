/**
 * Advancement Dialog
 * 
 * Interactive dialog for purchasing character advancements using XP.
 * Supports characteristic advances, skills, and talents based on career.
 */

import { checkPrerequisites } from '../../utils/prerequisite-validator.mjs';
import { getAvailableXP, spendXP, canAfford } from '../../utils/xp-transaction.mjs';
import { 
  getCareerAdvancements, 
  getNextCharacteristicCost,
  TIER_ORDER 
} from '../../config/advancements/index.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class AdvancementDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /* -------------------------------------------- */
  /*  Configuration                               */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'advancement-dialog-{id}',
    classes: ['rogue-trader', 'advancement-dialog'],
    tag: 'div',
    window: {
      title: 'RT.Advancement.Title',
      icon: 'fa-solid fa-chart-line',
      minimizable: true,
      resizable: true
    },
    position: {
      width: 700,
      height: 650
    },
    actions: {
      purchaseCharacteristic: AdvancementDialog.#purchaseCharacteristic,
      purchaseAdvance: AdvancementDialog.#purchaseAdvance,
      switchTab: AdvancementDialog.#switchTab,
      openCompendiumItem: AdvancementDialog.#openCompendiumItem
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    dialog: {
      template: 'systems/rogue-trader/templates/dialogs/advancement-dialog.hbs',
      scrollable: ['.rt-adv__content']
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @type {Actor} */
  actor = null;

  /** @type {string} */
  careerKey = 'rogueTrader';

  /** @type {string} */
  #activeTab = 'characteristics';

  /** @type {Set<string>} Track purchased advances this session for animation */
  #recentPurchases = new Set();

  /* -------------------------------------------- */
  /*  Construction                                */
  /* -------------------------------------------- */

  /**
   * @param {Actor} actor - The actor to advance
   * @param {object} options - Additional options
   * @param {string} [options.careerKey] - Career key for advancement options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.careerKey = options.careerKey ?? 'rogueTrader';
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    const careerLabel = game.i18n.localize(CONFIG.rt?.careers?.[this.careerKey]?.label ?? this.careerKey);
    return game.i18n.format('RT.Advancement.TitleWithCareer', { career: careerLabel });
  }

  /* -------------------------------------------- */
  /*  Static Factory                              */
  /* -------------------------------------------- */

  /**
   * Open the advancement dialog for an actor
   * @param {Actor} actor - The actor
   * @param {object} options - Options
   * @returns {AdvancementDialog}
   */
  static open(actor, options = {}) {
    const dialog = new this(actor, options);
    dialog.render(true);
    return dialog;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Check if character has completed origin path (has career selected)
    const originCareer = this.actor.system.originPath?.career;
    context.hasCareer = !!originCareer && originCareer.trim() !== '';
    context.originCareerName = originCareer || null;

    // If no career, show blocked state
    if (!context.hasCareer) {
      context.xp = {
        total: this.actor.system.experience?.total ?? 0,
        used: this.actor.system.experience?.used ?? 0,
        available: getAvailableXP(this.actor),
        usedPercent: 0
      };
      return context;
    }

    const career = getCareerAdvancements(this.careerKey);

    // XP Summary
    const total = this.actor.system.experience?.total ?? 0;
    const used = this.actor.system.experience?.used ?? 0;
    context.xp = {
      total,
      used,
      available: getAvailableXP(this.actor),
      usedPercent: total > 0 ? Math.round((used / total) * 100) : 0
    };

    // Active tab
    context.activeTab = this.#activeTab;

    // Prepare tabs
    context.tabs = [
      { id: 'characteristics', label: 'RT.Advancement.Tab.Characteristics', icon: 'fa-chart-bar', active: this.#activeTab === 'characteristics' },
      { id: 'skills', label: 'RT.Advancement.Tab.Skills', icon: 'fa-book', active: this.#activeTab === 'skills' },
      { id: 'talents', label: 'RT.Advancement.Tab.Talents', icon: 'fa-star', active: this.#activeTab === 'talents' }
    ];

    // Prepare characteristic advances
    context.characteristics = this.#prepareCharacteristics(career);

    // Prepare skill and talent advances
    const advances = career?.RANK_1_ADVANCES ?? [];
    context.skills = this.#prepareAdvances(advances.filter(a => a.type === 'skill'));
    context.talents = this.#prepareAdvances(advances.filter(a => a.type === 'talent'));

    // Recent purchases for animation
    context.recentPurchases = [...this.#recentPurchases];

    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare characteristic advancement data
   * @param {Object} career - Career advancement data
   * @returns {Array}
   */
  #prepareCharacteristics(career) {
    const costs = career?.CHARACTERISTIC_COSTS ?? {};
    const characteristics = this.actor.system.characteristics ?? {};
    const available = getAvailableXP(this.actor);

    return Object.entries(CONFIG.rt?.characteristics ?? {})
      .filter(([key]) => key !== 'influence') // Influence typically can't be advanced
      .map(([key, config]) => {
        const char = characteristics[key] ?? {};
        const currentAdvances = char.advance ?? 0;
        const nextCost = getNextCharacteristicCost(this.careerKey, key, currentAdvances);
        
        const isMaxed = currentAdvances >= TIER_ORDER.length;
        const canPurchase = !isMaxed && nextCost && available >= nextCost.cost;

        // Build tier display
        const tiers = TIER_ORDER.map((tier, index) => ({
          tier,
          label: game.i18n.localize(CONFIG.rt?.advancementTiers?.[tier]?.label ?? tier),
          purchased: index < currentAdvances,
          current: index === currentAdvances
        }));

        return {
          key,
          label: game.i18n.localize(config.label),
          abbreviation: config.abbreviation,
          currentValue: char.total ?? 0,
          currentAdvances,
          tiers,
          nextCost: nextCost?.cost ?? null,
          nextTier: nextCost?.tier ?? null,
          nextTierLabel: nextCost ? game.i18n.localize(CONFIG.rt?.advancementTiers?.[nextCost.tier]?.label ?? nextCost.tier) : null,
          isMaxed,
          canPurchase,
          cantAfford: !isMaxed && nextCost && available < nextCost.cost,
          recentlyPurchased: this.#recentPurchases.has(`char:${key}`)
        };
      });
  }

  /* -------------------------------------------- */

  /**
   * Prepare skill/talent advancement data
   * @param {Array} advances - Array of advancement definitions
   * @returns {Array}
   */
  #prepareAdvances(advances) {
    const available = getAvailableXP(this.actor);

    return advances.map((advance, index) => {
      const id = `${advance.type}:${advance.name}:${advance.specialization ?? ''}`;
      
      // Check if already owned
      const owned = this.#checkOwnership(advance);
      
      // Check prerequisites
      const prereqResult = checkPrerequisites(this.actor, advance.prerequisites ?? []);
      
      // Determine state
      const canPurchase = !owned && prereqResult.valid && available >= advance.cost;
      const cantAfford = !owned && prereqResult.valid && available < advance.cost;
      const blocked = !owned && !prereqResult.valid;

      // Display name
      const displayName = advance.specialization 
        ? `${advance.name} (${advance.specialization})`
        : advance.name;

      return {
        id,
        index,
        name: advance.name,
        specialization: advance.specialization ?? null,
        displayName,
        cost: advance.cost,
        type: advance.type,
        prerequisites: advance.prerequisites ?? [],
        prereqDisplay: prereqResult.unmet,
        owned,
        canPurchase,
        cantAfford,
        blocked,
        recentlyPurchased: this.#recentPurchases.has(id)
      };
    });
  }

  /* -------------------------------------------- */

  /**
   * Check if actor already owns an advancement
   * @param {Object} advance - Advancement definition
   * @returns {boolean}
   */
  #checkOwnership(advance) {
    if (advance.type === 'skill') {
      return this.#hasSkillTrained(advance.name, advance.specialization);
    } else if (advance.type === 'talent') {
      return this.#hasTalent(advance.name, advance.specialization);
    }
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Check if actor has a skill trained
   * @param {string} skillName - Skill name
   * @param {string} [specialization] - Optional specialization
   * @returns {boolean}
   */
  #hasSkillTrained(skillName, specialization) {
    const skills = this.actor.system.skills;
    if (!skills) return false;

    // Map skill names to keys
    const keyMap = {
      'awareness': 'awareness',
      'command': 'command',
      'commerce': 'commerce',
      'charm': 'charm',
      'ciphers': 'ciphers',
      'common lore': 'commonLore',
      'dodge': 'dodge',
      'evaluate': 'evaluate',
      'literacy': 'literacy',
      'pilot': 'pilot',
      'scholastic lore': 'scholasticLore',
      'secret tongue': 'secretTongue',
      'speak language': 'speakLanguage'
    };

    const skillKey = keyMap[skillName.toLowerCase()] ?? skillName.toLowerCase().replace(/\s+/g, '');
    const skill = skills[skillKey];
    
    if (!skill) return false;

    // Non-specialist skill
    if (!specialization) {
      return skill.trained === true;
    }

    // Specialist skill - check entries
    if (skill.entries) {
      return skill.entries.some(entry => 
        (entry.name?.toLowerCase() === specialization.toLowerCase() ||
         entry.slug?.toLowerCase() === specialization.toLowerCase()) &&
        entry.trained === true
      );
    }

    return false;
  }

  /* -------------------------------------------- */

  /**
   * Check if actor has a talent
   * @param {string} talentName - Talent name
   * @param {string} [specialization] - Optional specialization
   * @returns {boolean}
   */
  #hasTalent(talentName, specialization) {
    const searchName = specialization 
      ? `${talentName} (${specialization})`.toLowerCase()
      : talentName.toLowerCase();

    return this.actor.items.some(item => 
      item.type === 'talent' && 
      item.name.toLowerCase() === searchName
    );
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Switch active tab
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async #switchTab(event, target) {
    const tab = target.dataset.tab;
    if (tab) {
      this.#activeTab = tab;
      this.render();
    }
  }

  /* -------------------------------------------- */

  /**
   * Purchase a characteristic advance
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async #purchaseCharacteristic(event, target) {
    const charKey = target.dataset.characteristic;
    if (!charKey) return;

    const char = this.actor.system.characteristics?.[charKey];
    if (!char) return;

    const currentAdvances = char.advance ?? 0;
    const nextCost = getNextCharacteristicCost(this.careerKey, charKey, currentAdvances);
    
    if (!nextCost) {
      ui.notifications.warn(game.i18n.localize('RT.Advancement.Error.MaxedOut'));
      return;
    }

    if (!canAfford(this.actor, nextCost.cost)) {
      ui.notifications.warn(game.i18n.localize('RT.Advancement.Error.CannotAfford'));
      return;
    }

    // Get display info
    const charConfig = CONFIG.rt?.characteristics?.[charKey];
    const charLabel = charConfig ? game.i18n.localize(charConfig.label) : charKey;
    const tierLabel = game.i18n.localize(CONFIG.rt?.advancementTiers?.[nextCost.tier]?.label ?? nextCost.tier);

    // Spend XP
    const result = await spendXP(this.actor, nextCost.cost, `${charLabel} (${tierLabel})`);
    if (!result.success) {
      ui.notifications.error(result.error);
      return;
    }

    // Apply the characteristic advance
    const newAdvance = currentAdvances + 1;
    const currentCost = char.cost ?? 0;
    
    await this.actor.update({
      [`system.characteristics.${charKey}.advance`]: newAdvance,
      [`system.characteristics.${charKey}.cost`]: currentCost + nextCost.cost
    });

    // Mark as recently purchased for animation
    this.#recentPurchases.add(`char:${charKey}`);

    // Notify success
    ui.notifications.info(game.i18n.format('RT.Advancement.PurchasedCharacteristic', {
      char: charLabel,
      tier: tierLabel,
      cost: nextCost.cost
    }));

    // Re-render to show updated state
    this.render();

    // Clear animation flag after delay
    setTimeout(() => {
      this.#recentPurchases.delete(`char:${charKey}`);
    }, 2000);
  }

  /* -------------------------------------------- */

  /**
   * Purchase a skill or talent advance
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async #purchaseAdvance(event, target) {
    const advanceIndex = parseInt(target.dataset.index, 10);
    const advanceType = target.dataset.type;
    
    const career = getCareerAdvancements(this.careerKey);
    const advances = career?.RANK_1_ADVANCES ?? [];
    const typeAdvances = advances.filter(a => a.type === advanceType);
    const advance = typeAdvances[advanceIndex];
    
    if (!advance) return;

    // Validate
    if (!canAfford(this.actor, advance.cost)) {
      ui.notifications.warn(game.i18n.localize('RT.Advancement.Error.CannotAfford'));
      return;
    }

    const prereqResult = checkPrerequisites(this.actor, advance.prerequisites ?? []);
    if (!prereqResult.valid) {
      ui.notifications.warn(game.i18n.format('RT.Advancement.Error.PrerequisitesNotMet', {
        reasons: prereqResult.unmet.join(', ')
      }));
      return;
    }

    const displayName = advance.specialization 
      ? `${advance.name} (${advance.specialization})`
      : advance.name;

    // Spend XP
    const result = await spendXP(this.actor, advance.cost, displayName);
    if (!result.success) {
      ui.notifications.error(result.error);
      return;
    }

    // Apply the advance
    if (advance.type === 'skill') {
      await this.#applySkillAdvance(advance);
    } else if (advance.type === 'talent') {
      await this.#applyTalentAdvance(advance);
    }

    // Mark as recently purchased
    const id = `${advance.type}:${advance.name}:${advance.specialization ?? ''}`;
    this.#recentPurchases.add(id);

    // Notify
    ui.notifications.info(game.i18n.format('RT.Advancement.Purchased', {
      name: displayName,
      cost: advance.cost
    }));

    // Re-render
    this.render();

    // Clear animation
    setTimeout(() => {
      this.#recentPurchases.delete(id);
    }, 2000);
  }

  /* -------------------------------------------- */

  /**
   * Apply a skill advance to the actor
   * @param {Object} advance - Skill advance data
   */
  async #applySkillAdvance(advance) {
    const keyMap = {
      'awareness': 'awareness',
      'command': 'command',
      'commerce': 'commerce',
      'charm': 'charm',
      'ciphers': 'ciphers',
      'common lore': 'commonLore',
      'dodge': 'dodge',
      'evaluate': 'evaluate',
      'literacy': 'literacy',
      'pilot': 'pilot',
      'scholastic lore': 'scholasticLore',
      'secret tongue': 'secretTongue',
      'speak language': 'speakLanguage'
    };

    const skillKey = keyMap[advance.name.toLowerCase()] ?? advance.name.toLowerCase().replace(/\s+/g, '');
    
    if (advance.specialization) {
      // Specialist skill - add entry
      const currentEntries = this.actor.system.skills?.[skillKey]?.entries ?? [];
      const newEntry = {
        name: advance.specialization,
        slug: advance.specialization.toLowerCase().replace(/\s+/g, '-'),
        trained: true,
        plus10: false,
        plus20: false,
        bonus: 0,
        cost: advance.cost
      };

      await this.actor.update({
        [`system.skills.${skillKey}.entries`]: [...currentEntries, newEntry]
      });
    } else {
      // Standard skill
      await this.actor.update({
        [`system.skills.${skillKey}.trained`]: true,
        [`system.skills.${skillKey}.cost`]: advance.cost
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Apply a talent advance to the actor
   * @param {Object} advance - Talent advance data
   */
  async #applyTalentAdvance(advance) {
    const talentName = advance.specialization 
      ? `${advance.name} (${advance.specialization})`
      : advance.name;

    // Try to find talent in compendium
    let talentData = null;
    
    // Search in compendiums
    for (const pack of game.packs.filter(p => p.documentName === 'Item')) {
      const index = await pack.getIndex({ fields: ['name', 'type'] });
      const match = index.find(i => 
        i.type === 'talent' && 
        i.name.toLowerCase() === talentName.toLowerCase()
      );
      
      if (match) {
        const doc = await pack.getDocument(match._id);
        talentData = doc.toObject();
        break;
      }
    }

    // If not found, create basic talent
    if (!talentData) {
      talentData = {
        name: talentName,
        type: 'talent',
        system: {
          cost: advance.cost,
          description: ''
        }
      };
    }

    // Ensure cost is set
    talentData.system.cost = advance.cost;

    // Create the item on the actor
    await this.actor.createEmbeddedDocuments('Item', [talentData]);
  }

  /* -------------------------------------------- */

  /**
   * Open compendium item sheet for reference
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async #openCompendiumItem(event, target) {
    event.preventDefault();
    event.stopPropagation();
    
    const itemName = target.dataset.name;
    const itemType = target.dataset.type;
    
    if (!itemName) return;

    // Search for the item in compendiums
    for (const pack of game.packs.filter(p => p.documentName === 'Item')) {
      const index = await pack.getIndex({ fields: ['name', 'type'] });
      const match = index.find(i => 
        i.type === itemType && 
        i.name.toLowerCase() === itemName.toLowerCase()
      );
      
      if (match) {
        const doc = await pack.getDocument(match._id);
        doc.sheet.render(true);
        return;
      }
    }

    // If not found as exact type, try searching all items
    for (const pack of game.packs.filter(p => p.documentName === 'Item')) {
      const index = await pack.getIndex({ fields: ['name', 'type'] });
      const match = index.find(i => 
        i.name.toLowerCase() === itemName.toLowerCase()
      );
      
      if (match) {
        const doc = await pack.getDocument(match._id);
        doc.sheet.render(true);
        return;
      }
    }

    // Not found
    ui.notifications.warn(game.i18n.format('RT.Advancement.ItemNotFound', { name: itemName }));
  }
}
