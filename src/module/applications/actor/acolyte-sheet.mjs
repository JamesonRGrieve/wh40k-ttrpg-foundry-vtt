/**
 * @file AcolyteSheet - Character sheet for acolyte/character actors using ApplicationV2
 * This is the main player character sheet for Rogue Trader
 */

import BaseActorSheet from "./base-actor-sheet.mjs";
import { DHBasicActionManager } from "../../actions/basic-action-manager.mjs";
import { DHTargetedActionManager } from "../../actions/targeted-action-manager.mjs";
import { Hit } from "../../rolls/damage-data.mjs";
import { AssignDamageData } from "../../rolls/assign-damage-data.mjs";
import ROGUE_TRADER from "../../config.mjs";
import { prepareAssignDamageRoll } from "../prompts/assign-damage-dialog.mjs";
import { HandlebarManager } from "../../handlebars/handlebars-manager.mjs";
import LoadoutPresetDialog from "../dialogs/loadout-preset-dialog.mjs";
import AcquisitionDialog from "../dialogs/acquisition-dialog.mjs";
import ConfirmationDialog from "../dialogs/confirmation-dialog.mjs";

const TextEditor = foundry.applications.ux.TextEditor.implementation;

/**
 * Actor sheet for Acolyte/Character type actors.
 */
export default class AcolyteSheet extends BaseActorSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        actions: {
            // Combat actions
            combatAction: AcolyteSheet.#combatAction,
            rollInitiative: AcolyteSheet.#rollInitiative,
            
            // Stat adjustment actions
            adjustStat: AcolyteSheet.#adjustStat,
            increment: AcolyteSheet.#increment,
            decrement: AcolyteSheet.#decrement,
            setCriticalPip: AcolyteSheet.#setCriticalPip,
            setFateStar: AcolyteSheet.#setFateStar,
            setCorruption: AcolyteSheet.#setCorruption,
            setInsanity: AcolyteSheet.#setInsanity,
            restoreFate: AcolyteSheet.#restoreFate,
            spendFate: AcolyteSheet.#spendFate,
            
            // Equipment actions
            toggleEquip: AcolyteSheet.#toggleEquip,
            stowItem: AcolyteSheet.#stowItem,
            unstowItem: AcolyteSheet.#unstowItem,
            toggleActivate: AcolyteSheet.#toggleActivate,
            filterEquipment: AcolyteSheet.#filterEquipment,
            clearEquipmentSearch: AcolyteSheet.#clearEquipmentSearch,
            bulkEquip: AcolyteSheet.#bulkEquip,
            managePresets: AcolyteSheet.#managePresets,

            // Skills actions
            filterSkills: AcolyteSheet.#filterSkills,
            clearSkillsSearch: AcolyteSheet.#clearSkillsSearch,
            
            // Talents actions
            filterTalents: AcolyteSheet.#filterTalents,
            clearTalentsFilter: AcolyteSheet.#clearTalentsFilter,
            filterTraits: AcolyteSheet.#filterTraits,
            clearTraitsFilter: AcolyteSheet.#clearTraitsFilter,
            adjustTraitLevel: AcolyteSheet.#adjustTraitLevel,

            // Acquisition actions
            addAcquisition: AcolyteSheet.#addAcquisition,
            removeAcquisition: AcolyteSheet.#removeAcquisition,
            openAcquisitionDialog: AcolyteSheet.#openAcquisitionDialog,
            
            // Experience actions
            customXP: AcolyteSheet.#customXP,
            
            // Active Effect actions
            createEffect: AcolyteSheet.#createEffect,
            toggleEffect: AcolyteSheet.#toggleEffect,
            deleteEffect: AcolyteSheet.#deleteEffect,
            
            // Misc actions
            bonusVocalize: AcolyteSheet.#bonusVocalize
        },
        classes: ["acolyte"],
        position: {
            width: 1050,
            height: 800
        },
        // Tab configuration - uses ApplicationV2 tab handling
        tabs: [
            { navSelector: "nav.rt-navigation", contentSelector: "#tab-body", initial: "overview", group: "primary" }
        ]
    };

    /* -------------------------------------------- */

    /**
     * Template parts for the Acolyte sheet.
     * Each tab part shares the same container so they stack in one place.
     * Foundry V13 ApplicationV2 handles tab visibility automatically.
     * @override
     */
    static PARTS = {
        header: {
            template: "systems/rogue-trader/templates/actor/acolyte/header.hbs"
        },
        tabs: {
            template: "systems/rogue-trader/templates/actor/acolyte/tabs.hbs"
        },
        overview: {
            template: "systems/rogue-trader/templates/actor/acolyte/tab-overview.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        status: {
            template: "systems/rogue-trader/templates/actor/acolyte/tab-status.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        combat: {
            template: "systems/rogue-trader/templates/actor/acolyte/tab-combat.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        skills: {
            template: "systems/rogue-trader/templates/actor/acolyte/tab-skills.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        talents: {
            template: "systems/rogue-trader/templates/actor/acolyte/tab-talents.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        equipment: {
            template: "systems/rogue-trader/templates/actor/acolyte/tab-equipment.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        powers: {
            template: "systems/rogue-trader/templates/actor/acolyte/tab-powers.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        dynasty: {
            template: "systems/rogue-trader/templates/actor/acolyte/tab-dynasty.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        biography: {
            template: "systems/rogue-trader/templates/actor/acolyte/tab-biography.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        }
    };

    /* -------------------------------------------- */

    /**
     * Tab configuration for the primary tab group.
     * @override
     */
    static TABS = [
        { tab: "overview", label: "RT.Tabs.Overview", group: "primary", cssClass: "tab-overview" },
        { tab: "status", label: "RT.Tabs.Status", group: "primary", cssClass: "tab-status" },
        { tab: "combat", label: "RT.Tabs.Combat", group: "primary", cssClass: "tab-combat" },
        { tab: "skills", label: "RT.Tabs.Skills", group: "primary", cssClass: "tab-skills" },
        { tab: "talents", label: "RT.Tabs.Talents", group: "primary", cssClass: "tab-talents" },
        { tab: "equipment", label: "RT.Tabs.Equipment", group: "primary", cssClass: "tab-equipment" },
        { tab: "powers", label: "RT.Tabs.Powers", group: "primary", cssClass: "tab-powers" },
        { tab: "dynasty", label: "RT.Tabs.Dynasty", group: "primary", cssClass: "tab-dynasty" },
        { tab: "biography", label: "RT.Tabs.Biography", group: "primary", cssClass: "tab-biography" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "overview"
    };

    /* -------------------------------------------- */
    /*  Data Cache                                  */
    /* -------------------------------------------- */

    /**
     * Cached categorized items. Invalidated when items change.
     * @type {object|null}
     * @private
     */
    _cachedItems = null;

    /**
     * Cached origin path steps. Invalidated when items change.
     * @type {Array|null}
     * @private
     */
    _cachedOriginPath = null;

    /**
     * Cache version number. Incremented on each actor update to invalidate caches.
     * @type {number}
     * @private
     */
    _cacheVersion = 0;

    /**
     * Last known actor update timestamp for cache invalidation.
     * @type {number}
     * @private
     */
    _lastActorUpdate = 0;

    /* -------------------------------------------- */
    /*  Utility Methods                             */
    /* -------------------------------------------- */

    /**
     * Invalidate all cached data. Called when actor data changes.
     * @private
     */
    _invalidateCache() {
        this._cachedItems = null;
        this._cachedOriginPath = null;
        this._cacheVersion++;
    }

    /**
     * Check if cache needs invalidation based on actor update time.
     * @returns {boolean} True if cache was invalidated
     * @private
     */
    _checkCacheValidity() {
        const actorUpdate = this.actor?._stats?.modifiedTime ?? 0;
        if (actorUpdate > this._lastActorUpdate) {
            this._lastActorUpdate = actorUpdate;
            this._invalidateCache();
            return true;
        }
        return false;
    }

    /**
     * Throttle wrapper to prevent rapid-fire clicks on action buttons.
     * Ensures a function can only execute once per time window.
     * @param {string} key          Unique key for this throttled action.
     * @param {number} wait         Minimum wait time in milliseconds between executions.
     * @param {Function} func       The function to throttle.
     * @param {Object} context      The context (this) to apply.
     * @param {Array} args          Arguments to pass to the function.
     * @returns {Promise}
     * @private
     */
    async _throttle(key, wait, func, context, args) {
        // Initialize throttle tracking map if it doesn't exist
        if (!this._throttleTimers) this._throttleTimers = new Map();

        const now = Date.now();
        const lastRun = this._throttleTimers.get(key) || 0;

        // If not enough time has passed, ignore this call
        if (now - lastRun < wait) {
            return;
        }

        // Update last run time and execute
        this._throttleTimers.set(key, now);
        return await func.apply(context, args);
    }

    /* -------------------------------------------- */
    /*  Notifications                               */
    /* -------------------------------------------- */

    /**
     * Display a notification with a fallback between Toast and ui.notifications.
     * @param {"info"|"warning"|"error"} type  Notification type.
     * @param {string} message                 Message to display.
     * @param {object} options                 Notification options.
     * @private
     */
    _notify(type, message, options = {}) {
        const toast = foundry.applications?.api?.Toast;
        if (toast && typeof toast[type] === "function") {
            return toast[type](message, options);
        }
        const notifications = ui?.notifications;
        if (!notifications) return;
        const method = type === "warning" ? "warn" : type;
        if (typeof notifications[method] === "function") {
            return notifications[method](message, options);
        }
    }

    /* -------------------------------------------- */
    /*  Update Helpers                              */
    /* -------------------------------------------- */

    /**
     * Update a nested system field.
     * Always updates just the specific field to avoid overwriting derived/calculated values.
     * @param {string} field     The dot-notation field path (e.g., "system.wounds.value").
     * @param {*} value          The new value to set.
     * @returns {Promise<void>}
     * @private
     */
    async _updateSystemField(field, value) {
        // Direct field update to avoid overwriting calculated properties
        console.log(`[RT DEBUG] _updateSystemField:`, { field, value, updateData: { [field]: value } });
        await this.actor.update({ [field]: value });
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        // Check if caches need invalidation due to actor changes
        this._checkCacheValidity();

        const context = await super._prepareContext(options);
        
        // RT-specific configuration
        context.dh = CONFIG.rt || ROGUE_TRADER;

        // Prepare characteristic HUD data
        this._prepareCharacteristicHUD(context);

        // Prepare origin path (cached)
        context.originPathSteps = this._prepareOriginPathSteps();

        // Prepare navigator powers and ship roles (use cached items)
        const categorized = this._getCategorizedItems();
        context.navigatorPowers = this.actor.items.filter(
            item => item.type === "navigatorPower" || item.isNavigatorPower
        );
        context.shipRoles = this.actor.items.filter(
            item => item.type === "shipRole" || item.isShipRole
        );

        // Prepare item counts for panel headers
        context.talentsCount = this.actor.items.filter(item => item.isTalent).length;
        context.traitsCount = this.actor.items.filter(item => item.isTrait).length;

        // Prepare loadout/equipment data (uses cached categorized items)
        this._prepareLoadoutData(context, categorized);

        // Prepare combat station data (uses cached categorized items)
        this._prepareCombatData(context, categorized);

        // Prepare Rogue Trader specific fields
        if (context.system) {
            context.system.rogueTrader = this._prepareRogueTraderFields(
                context.system.rogueTrader ?? {}
            );
        }

        // Prepare dynasty tab data
        context.dynastyData = this._prepareDynastyData();

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare context data for a specific part.
     * This enables targeted re-rendering of individual parts for better performance.
     * @param {string} partId   The ID of the part being rendered.
     * @param {object} context  The base context from _prepareContext.
     * @param {object} options  Rendering options.
     * @returns {Promise<object>}
     * @override
     * @protected
     */
    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        
        switch (partId) {
            case "header":
                return this._prepareHeaderContext(context, options);
            case "tabs":
                return this._prepareTabsContext(context, options);
            case "biography":
                return await this._prepareBiographyContext(context, options);
            case "overview":
                return await this._prepareOverviewDashboardContext(context, options);
            case "status":
            case "combat":
            case "skills":
            case "talents":
            case "equipment":
            case "powers":
            case "dynasty":
                // Provide tab object for the template
                return this._prepareTabPartContext(partId, context, options);
            default:
                return context;
        }
    }

    /* -------------------------------------------- */

    /**
     * Prepare context for a tab content part.
     * Lazy loads templates for non-overview tabs on first access.
     * @param {string} partId   The part ID (which matches the tab ID).
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {Promise<object>}
     * @protected
     */
    async _prepareTabPartContext(partId, context, options) {
        // Lazy load templates for non-overview tabs
        if (partId !== "overview") {
            await HandlebarManager.loadAcolyteTabTemplates(partId);
        }

        // Find the tab configuration
        const tabConfig = this.constructor.TABS.find(t => t.tab === partId);
        if (tabConfig) {
            context.tab = {
                id: tabConfig.tab,
                group: tabConfig.group,
                cssClass: tabConfig.cssClass,
                label: game.i18n.localize(tabConfig.label),
                active: this.tabGroups[tabConfig.group] === tabConfig.tab
            };
        }
        
        // Add filter state for skills tab
        if (partId === "skills") {
            context.skillsFilter = this._skillsFilter;
        }
        
        // Add talents context for talents tab
        if (partId === "talents") {
            const talentsData = this._prepareTalentsContext();
            Object.assign(context, talentsData);
            const traitsData = this._prepareTraitsContext(context);
            Object.assign(context, traitsData);
        }
        
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare biography tab context with ProseMirror enriched content.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {Promise<object>}
     * @protected
     */
    async _prepareBiographyContext(context, options) {
        // First prepare the standard tab context
        await this._prepareTabPartContext("biography", context, options);

        // Prepare biography data with enriched HTML for ProseMirror
        const rawNotes = this.actor.system.bio?.notes ?? "";
        
        context.biography = {
            source: {
                notes: rawNotes
            },
            enriched: {
                notes: await TextEditor.enrichHTML(rawNotes, {
                    relativeTo: this.actor,
                    secrets: this.actor.isOwner,
                    rollData: this.actor.getRollData()
                })
            }
        };

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare header part context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareHeaderContext(context, options) {
        // Header-specific preparation (characteristics HUD is already prepared)
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare tabs part context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareTabsContext(context, options) {
        // Tabs use the static TABS configuration
        context.tabs = this.constructor.TABS.map(tab => ({
            ...tab,
            active: this.tabGroups[tab.group] === tab.tab,
            label: game.i18n.localize(tab.label)
        }));
        return context;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onFirstRender(context, options) {
        super._onFirstRender(context, options);
        
        // Ensure initial tab is active
        const activeTab = this.tabGroups.primary || "overview";
        
        // Add active class to the initial tab content
        const tabContent = this.element.querySelector(`section.tab[data-tab="${activeTab}"]`);
        if (tabContent) {
            tabContent.classList.add("active");
        }
        
        // Add active class to the initial nav item
        const navItem = this.element.querySelector(`nav.rt-navigation a[data-tab="${activeTab}"]`);
        if (navItem) {
            navItem.classList.add("active");
        }
    }

    /* -------------------------------------------- */

    /**
     * Prepare body part context (all tabs).
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareBodyContext(context, options) {
        // All tab data is already prepared in _prepareContext
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare characteristic HUD data and tooltip data.
     * @param {object} context  Context being prepared.
     * @protected
     */
    _prepareCharacteristicHUD(context) {
        const hudCharacteristics = context.actor?.characteristics ?? {};
        const modifierSources = context.system?.modifierSources?.characteristics ?? {};
        
        // SVG circle parameters for progress ring
        const radius = 52;
        const circumference = 2 * Math.PI * radius; // ~326.7
        
        Object.entries(hudCharacteristics).forEach(([key, char]) => {
            const total = Number(char?.total ?? 0);
            const advance = Number(char?.advance ?? 0);
            
            // Use the calculated bonus (accounts for unnatural), fallback to tens digit
            char.hudMod = char.bonus ?? Math.floor(total / 10);
            char.hudTotal = total;
            
            // Progress ring data (advancement 0-5 maps to 0-100%)
            char.advanceProgress = (advance / 5) * 100;
            char.progressCircumference = circumference;
            char.progressOffset = circumference * (1 - (advance / 5));
            
            // XP cost for next advancement (using RT/DH2e progression)
            const xpCosts = [100, 250, 500, 750, 1000]; // Simple to Expert
            char.nextAdvanceCost = advance < 5 ? xpCosts[advance] : 0;
            
            // Prepare tooltip data using the mixin helper
            char.tooltipData = this.prepareCharacteristicTooltip(key, char, modifierSources);
        });
    }

    /* -------------------------------------------- */

    /**
     * Prepare origin path step data (cached).
     * @returns {Array<object>}
     * @protected
     */
    _prepareOriginPathSteps() {
        // Return cached version if available
        if (this._cachedOriginPath) return this._cachedOriginPath;

        const steps = CONFIG.rt.originPath?.steps || [
            { key: "homeWorld", label: "Home World", choiceGroup: "origin.home-world" },
            { key: "birthright", label: "Birthright", choiceGroup: "origin.birthright" },
            { key: "lureOfTheVoid", label: "Lure of the Void", choiceGroup: "origin.lure-of-the-void" },
            { key: "trialsAndTravails", label: "Trials and Travails", choiceGroup: "origin.trials-and-travails" },
            { key: "motivation", label: "Motivation", choiceGroup: "origin.motivation" },
            { key: "career", label: "Career", choiceGroup: "origin.career" }
        ];

        const originItems = this.actor.items.filter(
            item => item.isOriginPath || (item.type === "trait" && item.flags?.rt?.kind === "origin")
        );

        this._cachedOriginPath = steps.map(step => {
            const item = originItems.find(i => {
                const itemStep = i.flags?.rt?.step || i.system?.step || "";
                return itemStep === step.label || i.flags?.rt?.choiceGroup === step.choiceGroup;
            });

            return {
                ...step,
                item: item ? {
                    _id: item.id,
                    name: item.name,
                    img: item.img,
                    system: item.system
                } : null
            };
        });

        return this._cachedOriginPath;
    }

    /* -------------------------------------------- */

    /**
     * Get cached categorized items, computing only if cache is invalid.
     * @returns {object} Categorized items
     * @protected
     */
    _getCategorizedItems() {
        if (this._cachedItems) return this._cachedItems;
        
        const categories = {
            all: [],
            weapons: [],
            armour: [],
            forceField: [],
            cybernetic: [],
            gear: [],
            storageLocation: [],
            criticalInjury: [],
            equipped: []
        };

        // Equipment item types that should appear in backpack
        const equipmentTypes = ["weapon", "armour", "forceField", "cybernetic", "gear", "storageLocation", "ammunition", "drugOrConsumable"];

        for (const item of this.actor.items) {
            // Only add equipment-type items to "all" for backpack display
            if (equipmentTypes.includes(item.type)) {
                categories.all.push(item);
            }

            // Categorize by type
            if (item.type === "weapon" || item.isWeapon) categories.weapons.push(item);
            else if (item.type === "armour" || item.isArmour) categories.armour.push(item);
            else if (item.type === "forceField" || item.isForceField) categories.forceField.push(item);
            else if (item.type === "cybernetic" || item.isCybernetic) categories.cybernetic.push(item);
            else if (item.type === "gear" || item.isGear) categories.gear.push(item);
            else if (item.type === "storageLocation") categories.storageLocation.push(item);
            else if (item.type === "criticalInjury" || item.isCriticalInjury) categories.criticalInjury.push(item);

            // Track equipped items
            if (item.system?.equipped === true) categories.equipped.push(item);
        }

        this._cachedItems = categories;
        return categories;
    }

    /* -------------------------------------------- */

    /**
     * Prepare loadout/equipment data for the template.
     * @param {object} context      The template render context.
     * @param {object} [categorized]  Pre-computed categorized items (optional).
     * @protected
     */
    _prepareLoadoutData(context, categorized = null) {
        categorized = categorized ?? this._getCategorizedItems();

        // Add all items to context for the Backpack panel
        context.allItems = categorized.all;

        // Filter items by type
        context.armourItems = categorized.armour;
        context.forceFieldItems = categorized.forceField;
        context.cyberneticItems = categorized.cybernetic;
        context.gearItems = categorized.gear;
        context.storageLocations = categorized.storageLocation;

        // Equipped items (all types that are equipped)
        context.equippedItems = categorized.equipped;

        // Counts for section headers
        context.armourCount = context.armourItems.length;
        context.forceFieldCount = context.forceFieldItems.length;
        context.cyberneticCount = context.cyberneticItems.length;
        context.gearCount = context.gearItems.length;
        context.equippedCount = context.equippedItems.length;

        // Encumbrance percentage for bar
        const enc = this.actor.encumbrance ?? {};
        const encMax = enc.max || 1;
        context.encumbrancePercent = Math.min(100, Math.round((enc.value / encMax) * 100));

        // Backpack fill percentage
        const backpackMax = enc.backpack_max || 1;
        context.backpackPercent = Math.min(100, Math.round((enc.backpack_value / backpackMax) * 100));
    }

    /* -------------------------------------------- */

    /**
     * Prepare combat station data for the template.
     * @param {object} context      The template render context.
     * @param {object} [categorized]  Pre-computed categorized items (optional).
     * @protected
     */
    _prepareCombatData(context, categorized = null) {
        categorized = categorized ?? this._getCategorizedItems();
        const weapons = categorized.weapons;
        const system = context.system ?? this.actor.system ?? {};

        // Calculate vitals percentages
        const woundsMax = system.wounds?.max || 1;
        context.woundsPercent = Math.min(100, Math.round(((system.wounds?.value ?? 0) / woundsMax) * 100));

        const fatigueMax = system.fatigue?.max || 1;
        context.fatiguePercent = Math.min(100, Math.round(((system.fatigue?.value ?? 0) / fatigueMax) * 100));

        // Calculate reaction targets
        const skills = this.actor.skills ?? {};
        const chars = this.actor.characteristics ?? {};

        // Dodge target: Ag + Dodge training
        const dodgeSkill = skills.dodge ?? {};
        let dodgeBase = chars.agility?.total ?? 30;
        if (dodgeSkill.plus20) dodgeBase += 20;
        else if (dodgeSkill.plus10) dodgeBase += 10;
        else if (!dodgeSkill.trained && !dodgeSkill.basic) dodgeBase = Math.floor(dodgeBase / 2);
        context.dodgeTarget = dodgeBase;

        // Parry target: WS + Parry training
        const parrySkill = skills.parry ?? {};
        let parryBase = chars.weaponSkill?.total ?? 30;
        if (parrySkill.plus20) parryBase += 20;
        else if (parrySkill.plus10) parryBase += 10;
        else if (!parrySkill.trained && !parrySkill.basic) parryBase = Math.floor(parryBase / 2);
        context.parryTarget = parryBase;

        // Critical injuries
        context.criticalInjuries = categorized.criticalInjury;

        // Force field (first active/equipped one)
        const forceFields = categorized.forceField;
        context.forceField = forceFields.find(ff => ff.system?.equipped || ff.system?.activated) || forceFields[0];
        context.hasForceField = !!context.forceField;

        // Weapon slots - categorize by class and equipped status
        const equippedWeapons = weapons.filter(w => w.system?.equipped);
        const rangedWeapons = equippedWeapons.filter(w => w.system?.class !== "Melee");
        const meleeWeapons = equippedWeapons.filter(w => w.system?.class === "Melee");

        // Primary weapon
        context.primaryWeapon = rangedWeapons[0] || meleeWeapons[0] || weapons.find(w => w.system?.equipped);

        // Secondary weapon
        if (context.primaryWeapon) {
            if (rangedWeapons[0] && meleeWeapons[0]) {
                context.secondaryWeapon = meleeWeapons[0];
            } else if (rangedWeapons.length > 1) {
                context.secondaryWeapon = rangedWeapons[1];
            } else if (meleeWeapons.length > 1) {
                context.secondaryWeapon = meleeWeapons[1];
            }
        }

        // Sidearm: Pistol class weapon
        context.sidearm = weapons.find(
            w => w.system?.class === "Pistol" && w !== context.primaryWeapon && w !== context.secondaryWeapon
        );

        // Grenades: Thrown class weapons
        context.grenades = weapons.filter(w => w.system?.class === "Thrown" || w.system?.type === "grenade");

        // Other weapons (not in slots)
        const slotWeapons = [context.primaryWeapon, context.secondaryWeapon, context.sidearm, ...context.grenades].filter(Boolean);
        context.otherWeapons = weapons.filter(w => !slotWeapons.includes(w));

        // Add ammo percentage to weapons
        [context.primaryWeapon, context.secondaryWeapon, context.sidearm].filter(Boolean).forEach(w => {
            if (w.system?.clip?.max) {
                w.ammoPercent = Math.round((w.system.clip.value / w.system.clip.max) * 100);
            }
        });
    }

    /* -------------------------------------------- */

    /**
     * Prepare Rogue Trader specific fields.
     * @param {object} rogueTraderData  The rogueTrader data object.
     * @returns {object}
     * @protected
     */
    _prepareRogueTraderFields(rogueTraderData) {
        const prepared = rogueTraderData ?? {};
        prepared.armour = prepared.armour ?? {
            head: 0, rightArm: 0, leftArm: 0, body: 0, rightLeg: 0, leftLeg: 0
        };
        prepared.weight = prepared.weight ?? { total: 0, current: 0 };

        const acquisitions = Array.isArray(prepared.acquisitions)
            ? prepared.acquisitions
            : (prepared.acquisitions
                ? [{ name: "", availability: "", modifier: 0, notes: prepared.acquisitions, acquired: false }]
                : []);
        prepared.acquisitions = acquisitions;

        prepared.wounds = {
            total: this.actor.wounds?.max ?? 0,
            current: this.actor.wounds?.value ?? 0,
            critical: this.actor.wounds?.critical ?? 0,
            fatigue: this.actor.fatigue?.value ?? 0
        };
        prepared.fate = {
            total: this.actor.fate?.max ?? 0,
            current: this.actor.fate?.value ?? 0
        };

        return prepared;
    }

    /* -------------------------------------------- */

    /**
     * Prepare dynasty tab data including wealth tiers and gauge positioning.
     * @returns {object} Dynasty display data
     * @protected
     */
    _prepareDynastyData() {
        const pf = this.actor.system?.rogueTrader?.profitFactor ?? {};
        const currentPF = pf.current ?? 0;
        const startingPF = pf.starting ?? 0;
        const modifier = pf.modifier ?? 0;
        const effectivePF = currentPF + modifier;

        // Determine wealth tier (Rogue Trader wealth categories)
        let wealthTier;
        if (effectivePF >= 100) {
            wealthTier = { key: "legendary", label: "Legendary Wealth", min: 100 };
        } else if (effectivePF >= 75) {
            wealthTier = { key: "mighty", label: "Mighty Empire", min: 75 };
        } else if (effectivePF >= 50) {
            wealthTier = { key: "notable", label: "Notable Dynasty", min: 50 };
        } else if (effectivePF >= 25) {
            wealthTier = { key: "modest", label: "Modest Wealth", min: 25 };
        } else {
            wealthTier = { key: "poor", label: "Poor Resources", min: 0 };
        }

        // Calculate percentage for gauge (cap at 100 for display, but allow >100 PF)
        const pfPercentage = Math.min(Math.max((effectivePF / 100) * 100, 0), 100);

        return {
            currentPF,
            startingPF,
            modifier,
            effectivePF,
            wealthTier,
            pfPercentage
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare overview tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareOverviewContext(context, options) {
        // Add Active Effects data
        context.effects = this.actor.effects.map(effect => ({
            id: effect.id,
            name: effect.name,
            icon: effect.icon,
            document: effect
        }));
        
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare overview dashboard context for the new ultra-dense dashboard.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {Promise<object>}
     * @protected
     */
    async _prepareOverviewDashboardContext(context, options) {
        // First prepare standard tab context
        await this._prepareTabPartContext("overview", context, options);
        
        // Add Active Effects data for dashboard preview
        context.effects = this.actor.effects.map(effect => ({
            id: effect.id,
            name: effect.name,
            icon: effect.icon,
            disabled: effect.disabled,
            document: effect
        }));
        
        // Ensure combat data is available (for primaryWeapon, dodgeTarget, parryTarget)
        // This is already prepared in _prepareContext via _prepareCombatData
        
        // Ensure characteristics data is available in the format expected by dashboard
        // This is already prepared in _prepareContext
        
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare combat tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareCombatTabContext(context, options) {
        // Combat data already prepared in _prepareCombatData
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare equipment tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareEquipmentContext(context, options) {
        // Equipment data already prepared in _prepareLoadoutData
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare abilities tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareAbilitiesContext(context, options) {
        // Talents and traits already prepared in _prepareItems
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare notes tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareNotesContext(context, options) {
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare effects tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareEffectsContext(context, options) {
        return context;
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Combat Actions             */
    /* -------------------------------------------- */

    /**
     * Handle combat control actions.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #combatAction(event, target) {
        try {
            const action = target.dataset.combatAction;

            switch (action) {
                case "attack":
                    await DHTargetedActionManager.performWeaponAttack(this.actor);
                    break;
                case "assign-damage":
                    const hitData = new Hit();
                    const assignData = new AssignDamageData(this.actor, hitData);
                    await prepareAssignDamageRoll(assignData);
                    break;
                case "dodge":
                    await this.actor.rollSkill?.("dodge");
                    break;
                case "parry":
                    await this.actor.rollSkill?.("parry");
                    break;
            }
        } catch (error) {
            this._notify("error", `Combat action failed: ${error.message}`, {
                duration: 5000
            });
            console.error("Combat action error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle initiative roll.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollInitiative(event, target) {
        try {
            const agBonus = this.actor.characteristics?.agility?.bonus ?? 0;
            const roll = await new Roll("1d10 + @ab", { ab: agBonus }).evaluate();

            const content = `
                <div class="rt-hit-location-result">
                    <h3><i class="fas fa-bolt"></i> Initiative Roll</h3>
                    <div class="rt-hit-roll">
                        <span class="rt-roll-result">${roll.total}</span>
                    </div>
                    <div class="rt-hit-location">
                        <span class="rt-location-armour">1d10 + Agility Bonus (${agBonus})</span>
                    </div>
                </div>
            `;

            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content,
                rolls: [roll],
                flags: {
                    "rogue-trader": {
                        type: "initiative"
                    }
                }
            });
        } catch (error) {
            this._notify("error", `Initiative roll failed: ${error.message}`, {
                duration: 5000
            });
            console.error("Initiative roll error:", error);
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Stat Adjustments           */
    /* -------------------------------------------- */

    /**
     * Handle stat adjustment button clicks.
     * Throttled to prevent spam clicks.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #adjustStat(event, target) {
        const field = target.dataset.field;
        const throttleKey = `adjustStat-${field}-${this.actor.id}`;
        return await this._throttle(throttleKey, 200, this.#adjustStatImpl, this, [event, target]);
    }

    /**
     * Implementation of stat adjustment (used by throttled wrapper).
     * @private
     */
    async #adjustStatImpl(event, target) {
        const field = target.dataset.field;
        const action = target.dataset.statAction;
        
        // DEBUG: Log before update
        console.log(`[RT DEBUG] adjustStat BEFORE:`, {
            field,
            action,
            woundsMax: this.actor.system.wounds?.max,
            woundsValue: this.actor.system.wounds?.value,
            fateMax: this.actor.system.fate?.max,
            fateValue: this.actor.system.fate?.value
        });
        
        // Handle special actions
        if (action === "clear-fatigue") {
            await this._updateSystemField("system.fatigue.value", 0);
            return;
        }

        // Get current value
        const currentValue = foundry.utils.getProperty(this.actor, field) || 0;
        
        // Smart min/max derivation: if field ends with .value, check for .max/.min siblings
        let min = target.dataset.min !== undefined ? parseInt(target.dataset.min) : null;
        let max = target.dataset.max !== undefined ? parseInt(target.dataset.max) : null;
        
        // Auto-derive max from field structure (e.g., system.wounds.value -> system.wounds.max)
        if (max === null && field.endsWith('.value')) {
            const basePath = field.substring(0, field.lastIndexOf('.value'));
            const maxPath = `${basePath}.max`;
            const derivedMax = foundry.utils.getProperty(this.actor, maxPath);
            if (derivedMax !== undefined && derivedMax !== null) {
                max = derivedMax;
            }
        }
        
        let newValue = currentValue;

        if (action === "increment") {
            newValue = currentValue + 1;
            if (max !== null && newValue > max) newValue = max;
        } else if (action === "decrement") {
            newValue = currentValue - 1;
            if (min !== null && newValue < min) newValue = min;
        }

        console.log(`[RT DEBUG] adjustStat update:`, { field, currentValue, newValue, min, max });

        if (newValue !== currentValue) {
            await this._updateSystemField(field, newValue);
            
            // DEBUG: Log after update
            console.log(`[RT DEBUG] adjustStat AFTER:`, {
                woundsMax: this.actor.system.wounds?.max,
                woundsValue: this.actor.system.wounds?.value,
                fateMax: this.actor.system.fate?.max,
                fateValue: this.actor.system.fate?.value
            });
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle increment action (convenience wrapper for adjustStat).
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #increment(event, target) {
        target.dataset.statAction = "increment";
        return AcolyteSheet.#adjustStat.call(this, event, target);
    }

    /**
     * Handle decrement action (convenience wrapper for adjustStat).
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #decrement(event, target) {
        target.dataset.statAction = "decrement";
        return AcolyteSheet.#adjustStat.call(this, event, target);
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on a critical damage pip.
     * Throttled to prevent spam clicks.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setCriticalPip(event, target) {
        const throttleKey = `setCriticalPip-${this.actor.id}`;
        return await this._throttle(throttleKey, 200, this.#setCriticalPipImpl, this, [event, target]);
    }

    /**
     * Implementation of critical pip setting (used by throttled wrapper).
     * @private
     */
    async #setCriticalPipImpl(event, target) {
        const level = parseInt(target.dataset.critLevel);
        const currentCrit = this.actor.system.wounds?.critical || 0;
        const newValue = (level === currentCrit) ? level - 1 : level;
        const clampedValue = Math.min(Math.max(newValue, 0), 10);
        await this._updateSystemField("system.wounds.critical", clampedValue);
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on a fate star pip.
     * Throttled to prevent spam clicks.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setFateStar(event, target) {
        const throttleKey = `setFateStar-${this.actor.id}`;
        return await this._throttle(throttleKey, 200, this.#setFateStarImpl, this, [event, target]);
    }

    /**
     * Implementation of fate star setting (used by throttled wrapper).
     * @private
     */
    async #setFateStarImpl(event, target) {
        const index = parseInt(target.dataset.fateIndex);
        const currentFate = this.actor.system.fate?.value || 0;
        const newValue = (index === currentFate) ? index - 1 : index;
        const maxFate = this.actor.system.fate?.max || 0;
        const clampedValue = Math.min(Math.max(newValue, 0), maxFate);
        await this._updateSystemField("system.fate.value", clampedValue);
    }

    /* -------------------------------------------- */

    /**
     * Handle quick-set corruption.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setCorruption(event, target) {
        const throttleKey = `setCorruption-${this.actor.id}`;
        return await this._throttle(throttleKey, 200, this.#setCorruptionImpl, this, [event, target]);
    }

    /**
     * Implementation of corruption setting (used by throttled wrapper).
     * @private
     */
    async #setCorruptionImpl(event, target) {
        const targetValue = parseInt(target.dataset.value);
        if (isNaN(targetValue) || targetValue < 0 || targetValue > 100) {
            this._notify("error", "Invalid corruption value", {
                duration: 3000
            });
            return;
        }
        await this.actor.update({ "system.corruption": targetValue });
    }

    /* -------------------------------------------- */

    /**
     * Handle quick-set insanity.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setInsanity(event, target) {
        const throttleKey = `setInsanity-${this.actor.id}`;
        return await this._throttle(throttleKey, 200, this.#setInsanityImpl, this, [event, target]);
    }

    /**
     * Implementation of insanity setting (used by throttled wrapper).
     * @private
     */
    async #setInsanityImpl(event, target) {
        const targetValue = parseInt(target.dataset.value);
        if (isNaN(targetValue) || targetValue < 0 || targetValue > 100) {
            this._notify("error", "Invalid insanity value", {
                duration: 3000
            });
            return;
        }
        await this.actor.update({ "system.insanity": targetValue });
    }

    /* -------------------------------------------- */

    /**
     * Handle restoring all fate points.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #restoreFate(event, target) {
        const throttleKey = `restoreFate-${this.actor.id}`;
        return await this._throttle(throttleKey, 500, this.#restoreFateImpl, this, [event, target]);
    }

    /**
     * Implementation of fate restoration (used by throttled wrapper).
     * @private
     */
    async #restoreFateImpl(event, target) {
        const maxFate = this.actor.system.fate?.max || 0;
        await this._updateSystemField("system.fate.value", maxFate);
        this._notify("info", `Restored all fate points to ${maxFate}`, {
            duration: 3000
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle fate spending actions.
     * Throttled to prevent accidental double-spending.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #spendFate(event, target) {
        const action = target.dataset.fateAction;
        const throttleKey = `spendFate-${action}-${this.actor.id}`;
        return await this._throttle(throttleKey, 500, this.#spendFateImpl, this, [event, target]);
    }

    /**
     * Implementation of fate spending (used by throttled wrapper).
     * @private
     */
    async #spendFateImpl(event, target) {
        const action = target.dataset.fateAction;
        const currentFate = this.actor.system.fate?.value || 0;

        if (currentFate <= 0) {
            this._notify("warning", "No fate points available to spend!", {
                duration: 3000
            });
            return;
        }

        let message = "";
        switch (action) {
            case "reroll":
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to <strong>re-roll</strong> a test!`;
                break;
            case "bonus":
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to gain <strong>+10 bonus</strong> to a test!`;
                break;
            case "dos":
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to add <strong>+1 Degree of Success</strong>!`;
                break;
            case "heal":
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to <strong>heal damage</strong>!`;
                break;
            case "avoid":
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to <strong>avoid death</strong>!`;
                break;
            case "burn":
                const confirm = await ConfirmationDialog.confirm({
                    title: "Burn Fate Point?",
                    content: "Are you sure you want to <strong>permanently burn</strong> a Fate Point?",
                    confirmLabel: "Burn",
                    cancelLabel: "Cancel"
                });
                if (!confirm) return;
                message = `<strong>${this.actor.name}</strong> <strong style="color: #b63a2b;">BURNS</strong> a Fate Point!`;
                await this.actor.update({
                    "system.fate.max": Math.max(0, (this.actor.system.fate?.max || 0) - 1)
                });
                break;
            default:
                return;
        }

        await this._updateSystemField("system.fate.value", currentFate - 1);

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div class="rt-fate-spend-message">
                    <div style="display: flex; align-items: center; gap: 8px; padding: 12px; background: rgba(196, 135, 29, 0.1); border-left: 3px solid #c4871d; border-radius: 4px;">
                        <i class="fas fa-star" style="font-size: 1.5rem; color: #c4871d;"></i>
                        <div>${message}</div>
                    </div>
                </div>
            `
        });
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Equipment Actions          */
    /* -------------------------------------------- */

    /**
     * Handle toggling item equipped state.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleEquip(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await item.update({ "system.equipped": !item.system.equipped });
    }

    /* -------------------------------------------- */

    /**
     * Handle stowing an item.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #stowItem(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await item.update({
            "system.equipped": false,
            "system.inBackpack": true
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle unstowing an item.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #unstowItem(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await item.update({ "system.inBackpack": false });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling force field activation.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleActivate(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await item.update({ "system.activated": !item.system.activated });
    }

    /* -------------------------------------------- */

    /**
     * Handle bulk equipment operations.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #bulkEquip(event, target) {
        try {
            const action = target.dataset.bulkAction;
            const items = this.actor.items;
            let count = 0;

            switch (action) {
                case "equip-armour":
                    // Equip all armour items
                    const armourItems = items.filter(i => i.type === "armour" || i.isArmour);
                    for (const item of armourItems) {
                        if (!item.system.equipped) {
                            await item.update({ "system.equipped": true });
                            count++;
                        }
                    }
                    this._notify("info", `Equipped ${count} armour piece${count !== 1 ? 's' : ''}`, {
                        duration: 3000
                    });
                    break;

                case "unequip-all":
                    // Unequip all equipped items
                    const equippedItems = items.filter(i => i.system?.equipped === true);
                    for (const item of equippedItems) {
                        await item.update({ "system.equipped": false });
                        count++;
                    }
                    this._notify("info", `Unequipped ${count} item${count !== 1 ? 's' : ''}`, {
                        duration: 3000
                    });
                    break;

                case "stow-gear":
                    // Stow all gear items to backpack
                    const gearItems = items.filter(i =>
                        (i.type === "gear" || i.isGear) && !i.system.inBackpack
                    );
                    for (const item of gearItems) {
                        await item.update({
                            "system.inBackpack": true,
                            "system.equipped": false
                        });
                        count++;
                    }
                    this._notify("info", `Stowed ${count} gear item${count !== 1 ? 's' : ''} in backpack`, {
                        duration: 3000
                    });
                    break;

                default:
                    this._notify("warning", `Unknown bulk action: ${action}`, {
                        duration: 3000
                    });
            }
        } catch (error) {
            this._notify("error", `Bulk operation failed: ${error.message}`, {
                duration: 5000
            });
            console.error("Bulk equipment error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle opening the loadout preset management dialog.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #managePresets(event, target) {
        event.preventDefault();
        await LoadoutPresetDialog.show(this.actor);
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Acquisitions               */
    /* -------------------------------------------- */

    /**
     * Handle adding an acquisition.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #addAcquisition(event, target) {
        const acquisitions = this.actor.system?.rogueTrader?.acquisitions;
        const acquisitionList = Array.isArray(acquisitions) ? acquisitions : [];
        const updatedAcquisitions = structuredClone(acquisitionList);
        updatedAcquisitions.push({ name: "", availability: "", modifier: 0, notes: "", acquired: false });
        await this.actor.update({ "system.rogueTrader.acquisitions": updatedAcquisitions });
    }

    /* -------------------------------------------- */

    /**
     * Handle removing an acquisition.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #removeAcquisition(event, target) {
        const index = parseInt(target.dataset.index ?? "-1");
        if (isNaN(index) || index < 0) return;

        const acquisitions = this.actor.system?.rogueTrader?.acquisitions;
        if (!Array.isArray(acquisitions)) {
            await this.actor.update({ "system.rogueTrader.acquisitions": [] });
            return;
        }

        const updatedAcquisitions = structuredClone(acquisitions);
        updatedAcquisitions.splice(index, 1);
        await this.actor.update({ "system.rogueTrader.acquisitions": updatedAcquisitions });
    }

    /* -------------------------------------------- */

    /**
     * Open the Acquisition Dialog for rolling acquisition tests.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #openAcquisitionDialog(event, target) {
        event.preventDefault();
        await AcquisitionDialog.show(this.actor);
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Experience                 */
    /* -------------------------------------------- */

    /**
     * Handle custom XP addition/subtraction.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #customXP(event, target) {
        event.preventDefault();
        const { openAddXPDialog } = await import("../prompts/add-xp-dialog.mjs");
        await openAddXPDialog(this.actor);
    }

    /* -------------------------------------------- */

    /**
     * Handle bonus vocalize.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #bonusVocalize(event, target) {
        try {
            const bonusName = target.dataset.bonusName;
            const bonus = this.actor.backgroundEffects?.abilities?.find(a => a.name === bonusName);
            if (bonus) {
                await DHBasicActionManager.sendItemVocalizeChat({
                    actor: this.actor.name,
                    name: bonus.name,
                    type: bonus.source,
                    description: bonus.benefit
                });
            } else {
                this._notify("warning", `Bonus "${bonusName}" not found`, {
                    duration: 3000
                });
            }
        } catch (error) {
            this._notify("error", `Failed to vocalize bonus: ${error.message}`, {
                duration: 5000
            });
            console.error("Bonus vocalize error:", error);
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Equipment Filtering        */
    /* -------------------------------------------- */

    /**
     * Handle equipment filtering (search and type/status filters).
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static #filterEquipment(event, target) {
        const equipmentPanel = this.element.querySelector('.rt-all-items-grid');
        if (!equipmentPanel) return;

        // Get filter values
        const searchInput = this.element.querySelector('.rt-equipment-search');
        const typeFilter = this.element.querySelector('.rt-equipment-type-filter');
        const statusFilter = this.element.querySelector('.rt-equipment-status-filter');

        const searchTerm = searchInput?.value.toLowerCase() || '';
        const typeValue = typeFilter?.value || '';
        const statusValue = statusFilter?.value || '';

        // Store filter state for persistence
        this._equipmentFilter = {
            search: searchInput?.value || '',
            type: typeValue,
            status: statusValue
        };

        // Get all item cards
        const itemCards = equipmentPanel.querySelectorAll('.rt-inventory-card');

        let visibleCount = 0;

        itemCards.forEach(card => {
            const itemName = card.getAttribute('title')?.toLowerCase() || '';
            const itemType = card.getAttribute('data-item-type') || '';
            const isEquipped = card.querySelector('.rt-inv-equipped') !== null;

            // Check filters
            const matchesSearch = !searchTerm || itemName.includes(searchTerm);
            const matchesType = !typeValue || itemType === typeValue;
            const matchesStatus = !statusValue ||
                (statusValue === 'equipped' && isEquipped) ||
                (statusValue === 'unequipped' && !isEquipped);

            // Show/hide card
            if (matchesSearch && matchesType && matchesStatus) {
                card.style.display = '';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        // Toggle clear button visibility
        const clearBtn = this.element.querySelector('.rt-search-clear');
        if (clearBtn) {
            clearBtn.style.display = searchTerm ? 'flex' : 'none';
        }

        // Show message if no results
        const existingMsg = equipmentPanel.querySelector('.rt-no-results');
        if (existingMsg) existingMsg.remove();

        if (visibleCount === 0 && itemCards.length > 0) {
            const noResults = document.createElement('div');
            noResults.className = 'rt-no-results';
            noResults.innerHTML = '<i class="fas fa-search"></i><span>No items match your filters</span>';
            equipmentPanel.appendChild(noResults);
        }
    }

    /**
     * Handle clearing equipment search.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #clearEquipmentSearch(event, target) {
        const searchInput = this.element.querySelector('.rt-equipment-search');
        if (searchInput) {
            searchInput.value = '';
            // Clear stored filter state
            this._equipmentFilter = { search: '', type: '', status: '' };
            // Trigger filter update
            this.constructor.#filterEquipment.call(this, event, searchInput);
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Skills                     */
    /* -------------------------------------------- */

    /**
     * Handle filtering skills by search term, characteristic, and training level.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static async #filterSkills(event, target) {
        const input = event.currentTarget;
        const name = input.name || 'search';
        const value = input.value || '';
        
        // Update filter state
        this._skillsFilter[name] = value;
        
        // Re-render skills tab only
        await this.render({ parts: ['skills'] });
    }

    /* -------------------------------------------- */

    /**
     * Clear all skill filters.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static async #clearSkillsSearch(event, target) {
        // Reset all filters
        this._skillsFilter = { search: '', characteristic: '', training: '' };
        
        // Re-render skills tab
        await this.render({ parts: ['skills'] });
    }

    /* -------------------------------------------- */
    /*  Talents Actions                             */
    /* -------------------------------------------- */

    /**
     * Filter talents by search, category, and tier.
     * @param {Event} event     Triggering event.
     * @param {HTMLElement} target  The input/select element.
     * @this {AcolyteSheet}
     */
    static async #filterTalents(event, target) {
        const form = target.closest(".rt-talents-filters");
        if (!form) return;
        
        const search = form.querySelector("[name=talents-search]")?.value || "";
        const category = form.querySelector("[name=talents-category]")?.value || "";
        const tier = form.querySelector("[name=talents-tier]")?.value || "";
        
        this._talentsFilter = { search, category, tier };
        await this.render({ parts: ["talents"] });
    }

    /**
     * Clear talents filter.
     * @param {Event} event     Triggering event.
     * @param {HTMLElement} target  The button clicked.
     * @this {AcolyteSheet}
     */
    static async #clearTalentsFilter(event, target) {
        this._talentsFilter = { search: '', category: '', tier: '' };
        await this.render({ parts: ["talents"] });
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Traits                     */
    /* -------------------------------------------- */

    /**
     * Filter traits list.
     * @param {Event} event  Triggering event
     * @param {HTMLElement} target  The input/select element
     * @this {AcolyteSheet}
     * @private
     */
    static async #filterTraits(event, target) {
        const form = target.closest(".rt-traits-filters");
        if (!form) return;
        
        const search = form.querySelector("[name=traits-search]")?.value || "";
        const category = form.querySelector("[name=traits-category]")?.value || "";
        const hasLevel = form.querySelector("[name=traits-has-level]")?.checked || false;
        
        this._traitsFilter = { search, category, hasLevel };
        await this.render({ parts: ["talents"] }); // Talents tab contains trait panel
    }

    /**
     * Clear traits filter.
     * @param {Event} event  Triggering event
     * @param {HTMLElement} target  The button clicked
     * @this {AcolyteSheet}
     * @private
     */
    static async #clearTraitsFilter(event, target) {
        this._traitsFilter = { search: '', category: '', hasLevel: false };
        await this.render({ parts: ["talents"] }); // Talents tab contains trait panel
    }

    /**
     * Adjust trait level.
     * @param {Event} event  Triggering event
     * @param {HTMLElement} target  The button clicked
     * @this {AcolyteSheet}
     * @private
     */
    static async #adjustTraitLevel(event, target) {
        const itemId = target.dataset.itemId;
        const delta = parseInt(target.dataset.delta) || 0;
        
        const item = this.actor.items.get(itemId);
        if (!item) return;
        
        const newLevel = Math.max(0, (item.system.level || 0) + delta);
        await item.update({ "system.level": newLevel });
        
        // Provide visual feedback
        ui.notifications.info(`${item.name} level ${delta > 0 ? 'increased' : 'decreased'} to ${newLevel}`);
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Active Effects             */
    /* -------------------------------------------- */

    /**
     * Handle creating a new Active Effect.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #createEffect(event, target) {
        try {
            await this.actor.createEmbeddedDocuments("ActiveEffect", [{
                name: "New Effect",
                icon: "icons/svg/aura.svg",
                disabled: false,
                duration: {},
                changes: []
            }]);
            
            this._notify("info", "New effect created", {
                duration: 2000
            });
        } catch (error) {
            this._notify("error", `Failed to create effect: ${error.message}`, {
                duration: 5000
            });
            console.error("Create effect error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling an Active Effect's enabled/disabled state.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleEffect(event, target) {
        try {
            const effectId = target.dataset.effectId;
            const effect = this.actor.effects.get(effectId);
            
            if (!effect) {
                this._notify("warning", "Effect not found", {
                    duration: 3000
                });
                return;
            }
            
            await effect.update({ disabled: !effect.disabled });
            
            this._notify("info", `Effect ${effect.disabled ? 'disabled' : 'enabled'}`, {
                duration: 2000
            });
        } catch (error) {
            this._notify("error", `Failed to toggle effect: ${error.message}`, {
                duration: 5000
            });
            console.error("Toggle effect error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting an Active Effect.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #deleteEffect(event, target) {
        try {
            const effectId = target.dataset.effectId;
            const effect = this.actor.effects.get(effectId);
            
            if (!effect) {
                this._notify("warning", "Effect not found", {
                    duration: 3000
                });
                return;
            }
            
            const confirmed = await ConfirmationDialog.confirm({
                title: "Delete Active Effect",
                content: `Are you sure you want to delete <strong>${effect.name}</strong>?`,
                confirmLabel: "Delete",
                cancelLabel: "Cancel"
            });
            
            if (confirmed) {
                await effect.delete();
                this._notify("info", "Effect deleted", {
                    duration: 2000
                });
            }
        } catch (error) {
            this._notify("error", `Failed to delete effect: ${error.message}`, {
                duration: 5000
            });
            console.error("Delete effect error:", error);
        }
    }
}
