/**
 * @file TalentSheetV2 - Redesigned ApplicationV2 sheet for talent items
 * 
 * Features:
 * - Modern tabbed interface following origin-path-sheet patterns
 * - Edit mode toggle for character-owned talents
 * - Complete coverage of all TalentData model fields
 * - Font Awesome 6 Pro icons throughout
 * - Translucent gothic styling
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Redesigned sheet for talent items with modern ApplicationV2 patterns.
 * @extends BaseItemSheet
 */
export default class TalentSheetV2 extends BaseItemSheet {
    
    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["rogue-trader", "sheet", "item", "talent-sheet-v2"],
        actions: {
            ...super.DEFAULT_OPTIONS?.actions,
            toggleEditMode: TalentSheetV2.#toggleEditMode,
            rollTalent: TalentSheetV2.#rollTalent,
            postToChat: TalentSheetV2.#postToChat,
            viewGrantedItem: TalentSheetV2.#viewGrantedItem,
            adjustRank: TalentSheetV2.#adjustRank,
            openTalentEditor: TalentSheetV2.#openTalentEditor
        },
        position: {
            width: 650,
            height: 700
        },
        window: {
            resizable: true,
            icon: "fa-solid fa-star"
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/talent-sheet-v2.hbs",
            scrollable: [".rt-talent-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "overview", group: "primary", label: "RT.Tabs.Overview" },
        { tab: "effects", group: "primary", label: "RT.Tabs.Effects" },
        { tab: "properties", group: "primary", label: "RT.Tabs.Properties" },
        { tab: "description", group: "primary", label: "RT.Tabs.Description" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "overview"
    };

    /* -------------------------------------------- */
    /*  Instance Properties                         */
    /* -------------------------------------------- */

    /**
     * Whether the sheet is in edit mode (for character-owned talents).
     * Compendium items are always in view mode.
     * @type {boolean}
     */
    #editMode = false;

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Whether this talent is owned by a character (editable copy).
     * @type {boolean}
     */
    get isOwnedByActor() {
        return !!this.item.actor;
    }

    /**
     * Whether this talent is from a compendium (read-only).
     * @type {boolean}
     */
    get isCompendiumItem() {
        return this.item.pack !== null;
    }

    /**
     * Whether the sheet should show edit controls.
     * @type {boolean}
     */
    get canEdit() {
        // Compendium items are always read-only
        if (this.isCompendiumItem) return false;
        // Must be editable by user
        return this.isEditable;
    }

    /**
     * Whether the sheet is currently in edit mode.
     * @type {boolean}
     */
    get inEditMode() {
        // Compendium items are never in edit mode
        if (this.isCompendiumItem) return false;
        // For actor-owned items, use toggle state
        // For world items, always allow editing if editable
        if (!this.isOwnedByActor) return this.isEditable;
        return this.#editMode && this.isEditable;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const system = this.item.system;

        // Edit mode state
        context.canEdit = this.canEdit;
        context.inEditMode = this.inEditMode;
        context.isOwnedByActor = this.isOwnedByActor;
        context.isCompendiumItem = this.isCompendiumItem;

        // Tab state
        context.tabs = this._getTabs();
        context.activeTab = this.tabGroups.primary;

        // Prepare structured data for template
        context.talentData = this._prepareTalentData(system);
        context.prerequisitesData = this._preparePrerequisitesData(system);
        context.modifiersData = this._prepareModifiersData(system);
        context.grantsData = this._prepareGrantsData(system);
        context.situationalData = this._prepareSituationalData(system);
        context.rollConfigData = this._prepareRollConfigData(system);

        // Category options for select
        context.categoryOptions = this._getCategoryOptions(system.category);
        context.tierOptions = this._getTierOptions(system.tier);
        
        // Determine effects tab section order (sections with data first)
        context.effectsSectionOrder = this._getEffectsSectionOrder(
            context.modifiersData,
            context.situationalData,
            context.grantsData
        );

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare core talent data for display.
     * @param {object} system - The item's system data
     * @returns {object} Prepared talent data
     * @protected
     */
    _prepareTalentData(system) {
        // Get source reference properly (not the object)
        const sourceReference = system.sourceReference || "";
        const sourceBook = system.source?.book || "";
        const sourcePage = system.source?.page || "";
        
        return {
            identifier: system.identifier || "",
            category: system.category || "",
            categoryLabel: system.categoryLabel || "General",
            tier: system.tier || 0,
            tierLabel: system.tierLabel || "—",
            cost: system.cost || 0,
            isPassive: system.isPassive ?? true,
            isRollable: system.isRollable ?? false,
            stackable: system.stackable ?? false,
            rank: system.rank || 1,
            hasSpecialization: system.hasSpecialization ?? false,
            specialization: system.specialization || "",
            notes: system.notes || "",
            // Source fields
            source: sourceReference,
            sourceBook: sourceBook,
            sourcePage: sourcePage,
            // Benefit field
            aptitudes: system.aptitudes || [],
            hasAptitudes: (system.aptitudes?.length || 0) > 0,
            benefit: system.benefit || "",
            hasBenefit: !!(system.benefit && system.benefit.trim()),
            fullName: system.fullName || this.item.name
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare prerequisites data for display.
     * @param {object} system - The item's system data
     * @returns {object} Prepared prerequisites data
     * @protected
     */
    _preparePrerequisitesData(system) {
        const prereqs = system.prerequisites || {};
        const chars = prereqs.characteristics || {};
        const skills = prereqs.skills || [];
        const talents = prereqs.talents || [];

        // Format characteristics requirements
        const characteristicReqs = Object.entries(chars)
            .filter(([_, value]) => value > 0)
            .map(([key, value]) => ({
                key,
                label: this._getCharacteristicLabel(key),
                short: this._getCharacteristicShort(key),
                value
            }));

        return {
            text: prereqs.text || "",
            hasText: !!(prereqs.text && prereqs.text.trim()),
            characteristics: characteristicReqs,
            hasCharacteristics: characteristicReqs.length > 0,
            skills: skills.filter(s => s),
            hasSkills: skills.filter(s => s).length > 0,
            talents: talents.filter(t => t),
            hasTalents: talents.filter(t => t).length > 0,
            hasAny: system.hasPrerequisites ?? false,
            label: system.prerequisitesLabel || ""
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare modifiers data for display.
     * @param {object} system - The item's system data
     * @returns {object} Prepared modifiers data
     * @protected
     */
    _prepareModifiersData(system) {
        const mods = system.modifiers || {};

        // Characteristic modifiers
        const charMods = Object.entries(mods.characteristics || {})
            .filter(([_, value]) => value !== 0)
            .map(([key, value]) => ({
                key,
                label: this._getCharacteristicLabel(key),
                short: this._getCharacteristicShort(key),
                value,
                positive: value > 0
            }));

        // Skill modifiers
        const skillMods = Object.entries(mods.skills || {})
            .filter(([_, value]) => value !== 0)
            .map(([key, value]) => ({
                key,
                label: this._formatSkillLabel(key),
                value,
                positive: value > 0
            }));

        // Combat modifiers
        const combat = mods.combat || {};
        const combatMods = Object.entries(combat)
            .filter(([_, value]) => value !== 0)
            .map(([key, value]) => ({
                key,
                label: this._formatCombatLabel(key),
                value,
                positive: value > 0
            }));

        // Resource modifiers
        const resources = mods.resources || {};
        const resourceMods = Object.entries(resources)
            .filter(([_, value]) => value !== 0)
            .map(([key, value]) => ({
                key,
                label: this._formatResourceLabel(key),
                value,
                positive: value > 0
            }));

        // Other modifiers
        const otherMods = (mods.other || []).map(mod => ({
            ...mod,
            positive: mod.value > 0
        }));

        const hasAny = charMods.length > 0 || skillMods.length > 0 || 
                       combatMods.length > 0 || resourceMods.length > 0 || 
                       otherMods.length > 0;

        return {
            characteristics: charMods,
            hasCharacteristics: charMods.length > 0,
            skills: skillMods,
            hasSkills: skillMods.length > 0,
            combat: combatMods,
            hasCombat: combatMods.length > 0,
            resources: resourceMods,
            hasResources: resourceMods.length > 0,
            other: otherMods,
            hasOther: otherMods.length > 0,
            hasAny
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare grants data for display.
     * @param {object} system - The item's system data
     * @returns {object} Prepared grants data
     * @protected
     */
    _prepareGrantsData(system) {
        const grants = system.grants || {};

        const skills = (grants.skills || []).map(skill => ({
            name: skill.name,
            specialization: skill.specialization || null,
            level: skill.level || "trained",
            levelLabel: this._getTrainingLabel(skill.level),
            displayName: skill.specialization 
                ? `${skill.name} (${skill.specialization})`
                : skill.name
        }));

        const talents = (grants.talents || []).map(talent => ({
            name: talent.name,
            specialization: talent.specialization || null,
            uuid: talent.uuid || null,
            hasLink: !!talent.uuid
        }));

        const traits = (grants.traits || []).map(trait => ({
            name: trait.name,
            level: trait.level || null,
            uuid: trait.uuid || null,
            hasLink: !!trait.uuid
        }));

        const specialAbilities = (grants.specialAbilities || []).map(ability => ({
            name: ability.name,
            description: ability.description || ""
        }));

        const hasAny = skills.length > 0 || talents.length > 0 || 
                       traits.length > 0 || specialAbilities.length > 0;

        return {
            skills,
            hasSkills: skills.length > 0,
            talents,
            hasTalents: talents.length > 0,
            traits,
            hasTraits: traits.length > 0,
            specialAbilities,
            hasSpecialAbilities: specialAbilities.length > 0,
            hasAny
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare situational modifiers data for display.
     * @param {object} system - The item's system data
     * @returns {object} Prepared situational data
     * @protected
     */
    _prepareSituationalData(system) {
        const situational = system.modifiers?.situational || {};

        const characteristics = (situational.characteristics || []).map(mod => ({
            key: mod.key,
            label: this._getCharacteristicLabel(mod.key),
            value: mod.value,
            condition: mod.condition,
            icon: this._getCharacteristicIcon(mod.key),
            positive: mod.value > 0
        }));

        const skills = (situational.skills || []).map(mod => ({
            key: mod.key,
            label: this._formatSkillLabel(mod.key),
            value: mod.value,
            condition: mod.condition,
            icon: this._getSkillIcon(mod.key),
            positive: mod.value > 0
        }));

        const combat = (situational.combat || []).map(mod => ({
            key: mod.key,
            label: this._formatCombatLabel(mod.key),
            value: mod.value,
            condition: mod.condition,
            icon: this._getCombatIcon(mod.key),
            positive: mod.value > 0
        }));

        const hasAny = characteristics.length > 0 || skills.length > 0 || combat.length > 0;

        return {
            characteristics,
            hasCharacteristics: characteristics.length > 0,
            skills,
            hasSkills: skills.length > 0,
            combat,
            hasCombat: combat.length > 0,
            hasAny
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare roll configuration data for display.
     * @param {object} system - The item's system data
     * @returns {object} Prepared roll config data
     * @protected
     */
    _prepareRollConfigData(system) {
        const config = system.rollConfig || {};
        return {
            characteristic: config.characteristic || "",
            characteristicLabel: config.characteristic 
                ? this._getCharacteristicLabel(config.characteristic)
                : "",
            skill: config.skill || "",
            skillLabel: config.skill ? this._formatSkillLabel(config.skill) : "",
            modifier: config.modifier || 0,
            description: config.description || "",
            isConfigured: !!(config.characteristic || config.skill)
        };
    }

    /* -------------------------------------------- */

    /**
     * Get category select options.
     * @param {string} currentCategory - Current category value
     * @returns {object[]} Category options for select
     * @protected
     */
    _getCategoryOptions(currentCategory) {
        const categories = [
            { value: "", label: "General" },
            { value: "general", label: "General" },
            { value: "combat", label: "Combat" },
            { value: "social", label: "Social" },
            { value: "investigation", label: "Investigation" },
            { value: "psychic", label: "Psychic" },
            { value: "navigator", label: "Navigator" },
            { value: "tech", label: "Tech" },
            { value: "leadership", label: "Leadership" },
            { value: "career", label: "Career" },
            { value: "unique", label: "Unique" }
        ];

        return categories.map(cat => ({
            ...cat,
            selected: cat.value === currentCategory
        }));
    }

    /* -------------------------------------------- */

    /**
     * Get tier select options.
     * @param {number} currentTier - Current tier value
     * @returns {object[]} Tier options for select
     * @protected
     */
    _getTierOptions(currentTier) {
        return [
            { value: 0, label: "—", selected: currentTier === 0 },
            { value: 1, label: "Tier 1", selected: currentTier === 1 },
            { value: 2, label: "Tier 2", selected: currentTier === 2 },
            { value: 3, label: "Tier 3", selected: currentTier === 3 }
        ];
    }

    /* -------------------------------------------- */

    /**
     * Determine the order of sections in the Effects tab.
     * Sections with data appear first, empty sections last.
     * @param {object} modifiersData - Prepared modifiers data
     * @param {object} situationalData - Prepared situational data
     * @param {object} grantsData - Prepared grants data
     * @returns {string[]} Ordered array of section IDs
     * @protected
     */
    _getEffectsSectionOrder(modifiersData, situationalData, grantsData) {
        const sections = [
            { id: "modifiers", hasData: modifiersData.hasAny },
            { id: "situational", hasData: situationalData.hasAny },
            { id: "grants", hasData: grantsData.hasAny }
        ];
        
        // Sort: sections with data first, then empty sections
        sections.sort((a, b) => {
            if (a.hasData && !b.hasData) return -1;
            if (!a.hasData && b.hasData) return 1;
            return 0; // Maintain relative order for sections with same status
        });
        
        return sections.map(s => s.id);
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Get characteristic full label.
     * @param {string} key - Characteristic key
     * @returns {string} Full label
     * @protected
     */
    _getCharacteristicLabel(key) {
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
        return labels[key] || key;
    }

    /**
     * Get characteristic short label.
     * @param {string} key - Characteristic key
     * @returns {string} Short label
     * @protected
     */
    _getCharacteristicShort(key) {
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
        return shorts[key] || key.substring(0, 3).toUpperCase();
    }

    /**
     * Format skill key to label.
     * @param {string} key - Skill key
     * @returns {string} Formatted label
     * @protected
     */
    _formatSkillLabel(key) {
        // Convert camelCase to Title Case
        return key.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase()).trim();
    }

    /**
     * Format combat modifier key to label.
     * @param {string} key - Combat key
     * @returns {string} Formatted label
     * @protected
     */
    _formatCombatLabel(key) {
        const labels = {
            attack: "Attack Bonus",
            damage: "Damage Bonus",
            penetration: "Penetration",
            defense: "Defense Bonus",
            initiative: "Initiative",
            speed: "Movement Speed"
        };
        return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
    }

    /**
     * Format resource key to label.
     * @param {string} key - Resource key
     * @returns {string} Formatted label
     * @protected
     */
    _formatResourceLabel(key) {
        const labels = {
            wounds: "Wounds",
            fate: "Fate Points",
            insanity: "Insanity Threshold",
            corruption: "Corruption Threshold"
        };
        return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
    }

    /**
     * Get training level label.
     * @param {string} level - Training level
     * @returns {string} Formatted label
     * @protected
     */
    _getTrainingLabel(level) {
        const labels = {
            trained: "Trained",
            plus10: "+10",
            plus20: "+20"
        };
        return labels[level] || level;
    }

    /**
     * Get icon for a characteristic key.
     * @param {string} key - Characteristic key
     * @returns {string} Font Awesome icon class
     * @protected
     */
    _getCharacteristicIcon(key) {
        const icons = {
            weaponSkill: "fa-solid fa-sword",
            ballisticSkill: "fa-solid fa-crosshairs",
            strength: "fa-solid fa-dumbbell",
            toughness: "fa-solid fa-shield",
            agility: "fa-solid fa-person-running",
            intelligence: "fa-solid fa-brain",
            perception: "fa-solid fa-eye",
            willpower: "fa-solid fa-head-side-brain",
            fellowship: "fa-solid fa-people-group",
            influence: "fa-solid fa-crown"
        };
        return icons[key] || "fa-solid fa-star";
    }

    /**
     * Get icon for a skill key.
     * @param {string} key - Skill key
     * @returns {string} Font Awesome icon class
     * @protected
     */
    _getSkillIcon(key) {
        const icons = {
            // Combat skills
            dodge: "fa-solid fa-shield-halved",
            parry: "fa-solid fa-shield",
            
            // Physical skills
            acrobatics: "fa-solid fa-person-running",
            athletics: "fa-solid fa-dumbbell",
            climb: "fa-solid fa-mountain",
            swim: "fa-solid fa-person-swimming",
            contortionist: "fa-solid fa-user-tie",
            
            // Stealth/infiltration
            concealment: "fa-solid fa-user-ninja",
            disguise: "fa-solid fa-mask",
            shadowing: "fa-solid fa-user-secret",
            silentMove: "fa-solid fa-shoe-prints",
            sleightOfHand: "fa-solid fa-hand-sparkles",
            stealth: "fa-solid fa-user-ninja",
            
            // Social skills
            barter: "fa-solid fa-handshake",
            carouse: "fa-solid fa-champagne-glasses",
            charm: "fa-solid fa-face-smile-beam",
            command: "fa-solid fa-bullhorn",
            deceive: "fa-solid fa-mask",
            gamble: "fa-solid fa-dice",
            intimidate: "fa-solid fa-skull",
            interrogation: "fa-solid fa-gavel",
            blather: "fa-solid fa-comment-dots",
            
            // Knowledge skills
            awareness: "fa-solid fa-eye",
            scrutiny: "fa-solid fa-magnifying-glass",
            search: "fa-solid fa-magnifying-glass-plus",
            inquiry: "fa-solid fa-clipboard-question",
            literacy: "fa-solid fa-book",
            logic: "fa-solid fa-brain",
            commonLore: "fa-solid fa-book-open",
            forbiddenLore: "fa-solid fa-book-skull",
            scholasticLore: "fa-solid fa-graduation-cap",
            ciphers: "fa-solid fa-key",
            secretTongue: "fa-solid fa-lock",
            speakLanguage: "fa-solid fa-language",
            
            // Tech/craft skills
            techUse: "fa-solid fa-screwdriver-wrench",
            security: "fa-solid fa-lock-open",
            demolition: "fa-solid fa-bomb",
            chemUse: "fa-solid fa-flask",
            medicae: "fa-solid fa-kit-medical",
            trade: "fa-solid fa-hammer",
            
            // Vehicle skills
            drive: "fa-solid fa-car",
            pilot: "fa-solid fa-jet-fighter",
            
            // Misc skills
            evaluate: "fa-solid fa-scale-balanced",
            commerce: "fa-solid fa-coins",
            performer: "fa-solid fa-music",
            tracking: "fa-solid fa-paw",
            survival: "fa-solid fa-compass",
            wrangling: "fa-solid fa-horse",
            navigation: "fa-solid fa-compass",
            
            // Psychic skills
            psyniscience: "fa-solid fa-eye-evil",
            invocation: "fa-solid fa-hand-sparkles"
        };
        return icons[key] || "fa-solid fa-graduation-cap";
    }

    /**
     * Get icon for a combat modifier key.
     * @param {string} key - Combat key
     * @returns {string} Font Awesome icon class
     * @protected
     */
    _getCombatIcon(key) {
        const icons = {
            attack: "fa-solid fa-crosshairs",
            damage: "fa-solid fa-burst",
            penetration: "fa-solid fa-arrow-up-right-dots",
            defense: "fa-solid fa-shield-halved",
            initiative: "fa-solid fa-gauge-high",
            speed: "fa-solid fa-person-running"
        };
        return icons[key] || "fa-solid fa-swords";
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Set up custom tab handling
        this._setupTalentTabs();
    }

    /* -------------------------------------------- */

    /**
     * Set up tab click listeners.
     * @protected
     */
    _setupTalentTabs() {
        const tabs = this.element.querySelectorAll(".rt-talent-tabs .rt-talent-tab");
        tabs.forEach(tab => {
            tab.addEventListener("click", (event) => {
                event.preventDefault();
                const tabName = tab.dataset.tab;
                if (!tabName) return;

                // Update active tab button
                tabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");

                // Show/hide panels
                const panels = this.element.querySelectorAll(".rt-talent-panel");
                panels.forEach(panel => {
                    panel.classList.toggle("active", panel.dataset.tab === tabName);
                });

                // Update tab group state
                this.tabGroups.primary = tabName;
            });
        });
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Toggle edit mode for owned talents.
     * @this {TalentSheetV2}
     * @param {PointerEvent} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #toggleEditMode(event, target) {
        if (!this.canEdit) return;
        this.#editMode = !this.#editMode;
        this.render();
    }

    /* -------------------------------------------- */

    /**
     * Roll the talent if it has a roll configuration.
     * @this {TalentSheetV2}
     * @param {PointerEvent} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #rollTalent(event, target) {
        if (!this.item.system.isRollable) {
            ui.notifications.warn("This talent cannot be rolled.");
            return;
        }

        const actor = this.item.actor;
        if (!actor) {
            ui.notifications.warn("This talent must be on an actor to roll.");
            return;
        }

        const config = this.item.system.rollConfig;
        if (config.characteristic) {
            await actor.rollCharacteristic(config.characteristic, this.item.name);
        } else if (config.skill) {
            await actor.rollSkill(config.skill);
        }
    }

    /* -------------------------------------------- */

    /**
     * Post the talent to chat.
     * @this {TalentSheetV2}
     * @param {PointerEvent} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #postToChat(event, target) {
        await this.item.system.toChat?.() ?? this._postTalentToChat();
    }

    /* -------------------------------------------- */

    /**
     * View a granted item.
     * @this {TalentSheetV2}
     * @param {PointerEvent} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #viewGrantedItem(event, target) {
        const uuid = target.dataset.uuid;
        if (!uuid) return;

        try {
            const item = await fromUuid(uuid);
            if (item) {
                item.sheet.render(true);
            }
        } catch (err) {
            console.warn(`Could not load item from UUID: ${uuid}`, err);
        }
    }

    /* -------------------------------------------- */

    /**
     * Adjust talent rank for stackable talents.
     * @this {TalentSheetV2}
     * @param {PointerEvent} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #adjustRank(event, target) {
        if (!this.item.system.stackable) return;

        const delta = parseInt(target.dataset.delta, 10);
        if (isNaN(delta)) return;

        const currentRank = this.item.system.rank || 1;
        const newRank = Math.max(1, currentRank + delta);

        await this.item.update({ "system.rank": newRank });
    }

    /* -------------------------------------------- */

    /**
     * Open the talent editor dialog for complex field editing.
     * @this {TalentSheetV2}
     * @param {PointerEvent} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #openTalentEditor(event, target) {
        const section = target.dataset.section;
        if (!section) return;

        // Import and render the TalentEditorDialog
        const { TalentEditorDialog } = await import("./talent-editor-dialog.mjs");
        const dialog = new TalentEditorDialog({
            item: this.item,
            initialSection: section
        });
        await dialog.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Post a simple talent card to chat.
     * @protected
     */
    async _postTalentToChat() {
        const content = `
            <div class="talent-chat-card">
                <h3>${this.item.name}</h3>
                <p><strong>Type:</strong> ${this.item.system.isPassive ? "Passive" : "Active"}</p>
                ${this.item.system.tier ? `<p><strong>Tier:</strong> ${this.item.system.tier}</p>` : ""}
                ${this.item.system.cost ? `<p><strong>Cost:</strong> ${this.item.system.cost} XP</p>` : ""}
                <hr>
                <div>${this.item.system.benefit || this.item.system.description?.value || ""}</div>
            </div>
        `;

        await ChatMessage.create({
            content,
            speaker: ChatMessage.getSpeaker({ actor: this.item.actor })
        });
    }
}
