/**
 * @file NPCTemplateSheet - Item sheet for NPC templates
 * Phase 7: Template System
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Item sheet for npcTemplate type items.
 * Provides a template editor UI for creating reusable NPC configurations.
 * 
 * @extends {BaseItemSheet}
 */
export default class NPCTemplateSheet extends BaseItemSheet {

  /* -------------------------------------------- */
  /*  Static Configuration                        */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sheet", "rogue-trader", "npc-template-sheet"],
    position: {
      width: 700,
      height: 700
    },
    actions: {
      // Skill actions
      addSkill: NPCTemplateSheet.#addSkill,
      removeSkill: NPCTemplateSheet.#removeSkill,
      // Weapon actions
      addWeapon: NPCTemplateSheet.#addWeapon,
      removeWeapon: NPCTemplateSheet.#removeWeapon,
      // Trait/Talent actions
      addTrait: NPCTemplateSheet.#addTrait,
      removeTrait: NPCTemplateSheet.#removeTrait,
      addTalent: NPCTemplateSheet.#addTalent,
      removeTalent: NPCTemplateSheet.#removeTalent,
      // Variant actions
      addVariant: NPCTemplateSheet.#addVariant,
      removeVariant: NPCTemplateSheet.#removeVariant,
      // Preview
      updatePreview: NPCTemplateSheet.#updatePreview,
      // Instantiate
      createFromTemplate: NPCTemplateSheet.#createFromTemplate
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    header: {
      template: "systems/rogue-trader/templates/item/npc-template/header.hbs"
    },
    tabs: {
      template: "systems/rogue-trader/templates/item/npc-template/tabs.hbs"
    },
    basics: {
      template: "systems/rogue-trader/templates/item/npc-template/tab-basics.hbs",
      container: { classes: ["rt-body"], id: "tab-body" },
      scrollable: [""]
    },
    characteristics: {
      template: "systems/rogue-trader/templates/item/npc-template/tab-characteristics.hbs",
      container: { classes: ["rt-body"], id: "tab-body" },
      scrollable: [""]
    },
    equipment: {
      template: "systems/rogue-trader/templates/item/npc-template/tab-equipment.hbs",
      container: { classes: ["rt-body"], id: "tab-body" },
      scrollable: [""]
    },
    abilities: {
      template: "systems/rogue-trader/templates/item/npc-template/tab-abilities.hbs",
      container: { classes: ["rt-body"], id: "tab-body" },
      scrollable: [""]
    },
    preview: {
      template: "systems/rogue-trader/templates/item/npc-template/tab-preview.hbs",
      container: { classes: ["rt-body"], id: "tab-body" },
      scrollable: [""]
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static TABS = [
    { tab: "basics", group: "primary", icon: "fa-solid fa-user", label: "RT.NPC.Template.Tabs.Basics" },
    { tab: "characteristics", group: "primary", icon: "fa-solid fa-chart-bar", label: "RT.NPC.Template.Tabs.Characteristics" },
    { tab: "equipment", group: "primary", icon: "fa-solid fa-swords", label: "RT.NPC.Template.Tabs.Equipment" },
    { tab: "abilities", group: "primary", icon: "fa-solid fa-sparkles", label: "RT.NPC.Template.Tabs.Abilities" },
    { tab: "preview", group: "primary", icon: "fa-solid fa-eye", label: "RT.NPC.Template.Tabs.Preview" }
  ];

  /* -------------------------------------------- */

  /** @override */
  tabGroups = {
    primary: "basics"
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Preview threat level.
   * @type {number}
   */
  #previewThreat = 5;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Override _getTabs to include icons from TABS definition.
   * @returns {object} Tab configuration object.
   * @protected
   */
  _getTabs() {
    const tabs = super._getTabs();
    
    // Add icons from TABS definition
    for (const tabDef of this.constructor.TABS) {
      if (tabs[tabDef.tab] && tabDef.icon) {
        tabs[tabDef.tab].icon = tabDef.icon;
      }
    }
    
    return tabs;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.item.system;

    // Prepare categories
    const categories = [
      { key: "humanoid", label: "Humanoid" },
      { key: "xenos", label: "Xenos" },
      { key: "daemon", label: "Daemon" },
      { key: "creature", label: "Creature" },
      { key: "vehicle", label: "Vehicle" },
      { key: "custom", label: "Custom" }
    ].map(c => ({ ...c, selected: c.key === sys.category }));

    // Prepare roles
    const roles = [
      { key: "bruiser", name: "Bruiser" },
      { key: "sniper", name: "Sniper" },
      { key: "caster", name: "Caster" },
      { key: "support", name: "Support" },
      { key: "commander", name: "Commander" },
      { key: "specialist", name: "Specialist" }
    ].map(r => ({ ...r, selected: r.key === sys.role }));

    // Prepare types
    const types = [
      { key: "troop", name: "Troop" },
      { key: "elite", name: "Elite" },
      { key: "master", name: "Master" },
      { key: "horde", name: "Horde" },
      { key: "swarm", name: "Swarm" },
      { key: "creature", name: "Creature" },
      { key: "daemon", name: "Daemon" },
      { key: "xenos", name: "Xenos" }
    ].map(t => ({ ...t, selected: t.key === sys.type }));

    // Prepare equipment presets
    const presets = [
      { key: "melee", name: "Melee" },
      { key: "ranged", name: "Ranged" },
      { key: "mixed", name: "Mixed" },
      { key: "caster", name: "Caster" },
      { key: "support", name: "Support" },
      { key: "heavy", name: "Heavy" },
      { key: "unarmed", name: "Unarmed" },
      { key: "custom", name: "Custom" }
    ].map(p => ({ ...p, selected: p.key === sys.equipmentPreset }));

    // Prepare characteristics for display
    const characteristics = [
      { key: "weaponSkill", label: "Weapon Skill", short: "WS" },
      { key: "ballisticSkill", label: "Ballistic Skill", short: "BS" },
      { key: "strength", label: "Strength", short: "S" },
      { key: "toughness", label: "Toughness", short: "T" },
      { key: "agility", label: "Agility", short: "Ag" },
      { key: "intelligence", label: "Intelligence", short: "Int" },
      { key: "perception", label: "Perception", short: "Per" },
      { key: "willpower", label: "Willpower", short: "WP" },
      { key: "fellowship", label: "Fellowship", short: "Fel" },
      { key: "influence", label: "Influence", short: "Inf" }
    ].map(c => ({
      ...c,
      value: sys.baseCharacteristics[c.key] || 30,
      unnatural: sys.unnaturals[c.key] || 0
    }));

    // Generate preview data
    const preview = sys.previewAtThreat(this.#previewThreat);

    return {
      ...context,

      // Form options
      categories,
      roles,
      types,
      presets,
      characteristics,

      // Skills
      skills: sys.trainedSkills || [],
      hasSkills: (sys.trainedSkills?.length || 0) > 0,

      // Weapons
      weapons: sys.customWeapons || [],
      hasWeapons: (sys.customWeapons?.length || 0) > 0,
      isCustomPreset: sys.equipmentPreset === "custom",

      // Abilities
      traits: sys.traits || [],
      talents: sys.talents || [],
      hasTraits: (sys.traits?.length || 0) > 0,
      hasTalents: (sys.talents?.length || 0) > 0,

      // Variants
      variants: sys.variants || [],
      hasVariants: (sys.variants?.length || 0) > 0,

      // Preview
      previewThreat: this.#previewThreat,
      preview,

      // Scaling rules
      scaling: sys.scaling
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Preview threat slider
    const threatSlider = this.element.querySelector('[name="previewThreat"]');
    const threatValue = this.element.querySelector('.preview-threat-value');
    if (threatSlider) {
      threatSlider.addEventListener("input", () => {
        this.#previewThreat = parseInt(threatSlider.value, 10);
        if (threatValue) threatValue.textContent = this.#previewThreat;
        this._debounceRender();
      });
    }
  }

  /**
   * Debounced render for preview updates.
   * @private
   */
  _debounceRender() {
    if (this._renderTimeout) clearTimeout(this._renderTimeout);
    this._renderTimeout = setTimeout(() => {
      this.render({ parts: ["preview"] });
    }, 150);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Add a trained skill.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #addSkill(event, target) {
    event.preventDefault();

    const skills = foundry.utils.deepClone(this.item.system.trainedSkills || []);
    skills.push({
      key: "awareness",
      name: "Awareness",
      characteristic: "perception",
      level: "trained"
    });

    await this.item.update({ "system.trainedSkills": skills });
  }

  /**
   * Remove a trained skill.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #removeSkill(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index, 10);
    if (isNaN(index)) return;

    const skills = foundry.utils.deepClone(this.item.system.trainedSkills || []);
    skills.splice(index, 1);

    await this.item.update({ "system.trainedSkills": skills });
  }

  /**
   * Add a custom weapon.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #addWeapon(event, target) {
    event.preventDefault();

    const weapons = foundry.utils.deepClone(this.item.system.customWeapons || []);
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

    await this.item.update({ "system.customWeapons": weapons });
  }

  /**
   * Remove a custom weapon.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #removeWeapon(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index, 10);
    if (isNaN(index)) return;

    const weapons = foundry.utils.deepClone(this.item.system.customWeapons || []);
    weapons.splice(index, 1);

    await this.item.update({ "system.customWeapons": weapons });
  }

  /**
   * Add a trait.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #addTrait(event, target) {
    event.preventDefault();

    const traits = foundry.utils.deepClone(this.item.system.traits || []);
    traits.push({
      uuid: "",
      name: "New Trait",
      description: ""
    });

    await this.item.update({ "system.traits": traits });
  }

  /**
   * Remove a trait.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #removeTrait(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index, 10);
    if (isNaN(index)) return;

    const traits = foundry.utils.deepClone(this.item.system.traits || []);
    traits.splice(index, 1);

    await this.item.update({ "system.traits": traits });
  }

  /**
   * Add a talent.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #addTalent(event, target) {
    event.preventDefault();

    const talents = foundry.utils.deepClone(this.item.system.talents || []);
    talents.push({
      uuid: "",
      name: "New Talent",
      description: ""
    });

    await this.item.update({ "system.talents": talents });
  }

  /**
   * Remove a talent.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #removeTalent(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index, 10);
    if (isNaN(index)) return;

    const talents = foundry.utils.deepClone(this.item.system.talents || []);
    talents.splice(index, 1);

    await this.item.update({ "system.talents": talents });
  }

  /**
   * Add a variant.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #addVariant(event, target) {
    event.preventDefault();

    const variants = foundry.utils.deepClone(this.item.system.variants || []);
    variants.push({
      name: "New Variant",
      description: "",
      threatModifier: 0,
      characteristicModifiers: {},
      additionalEquipment: [],
      additionalTraits: [],
      additionalTalents: []
    });

    await this.item.update({ "system.variants": variants });
  }

  /**
   * Remove a variant.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #removeVariant(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index, 10);
    if (isNaN(index)) return;

    const variants = foundry.utils.deepClone(this.item.system.variants || []);
    variants.splice(index, 1);

    await this.item.update({ "system.variants": variants });
  }

  /**
   * Update preview.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #updatePreview(event, target) {
    this.render({ parts: ["preview"] });
  }

  /**
   * Create an NPC from this template.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #createFromTemplate(event, target) {
    event.preventDefault();

    const threatLevel = this.#previewThreat;
    const systemData = this.item.system.generateAtThreat(threatLevel);

    const actorData = {
      name: this.item.name,
      type: "npcV2",
      img: this.item.img || "icons/svg/mystery-man.svg",
      system: systemData
    };

    try {
      const actor = await Actor.create(actorData);

      if (actor) {
        // Create embedded traits and talents
        const itemsToCreate = [];

        for (const trait of this.item.system.traits || []) {
          if (trait.uuid) {
            const item = await fromUuid(trait.uuid);
            if (item) {
              itemsToCreate.push({
                name: item.name,
                type: item.type,
                img: item.img,
                system: foundry.utils.deepClone(item.system)
              });
            }
          }
        }

        for (const talent of this.item.system.talents || []) {
          if (talent.uuid) {
            const item = await fromUuid(talent.uuid);
            if (item) {
              itemsToCreate.push({
                name: item.name,
                type: item.type,
                img: item.img,
                system: foundry.utils.deepClone(item.system)
              });
            }
          }
        }

        if (itemsToCreate.length > 0) {
          await actor.createEmbeddedDocuments("Item", itemsToCreate);
        }

        ui.notifications.info(`Created NPC: ${actor.name}`);
        actor.sheet.render(true);
      }
    } catch (err) {
      console.error("Failed to create NPC from template:", err);
      ui.notifications.error("Failed to create NPC from template");
    }
  }
}
