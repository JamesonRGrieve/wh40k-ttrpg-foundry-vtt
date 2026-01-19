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
            attack: AcolyteSheet.#attack,
            dodge: AcolyteSheet.#dodge,
            parry: AcolyteSheet.#parry,
            initiative: AcolyteSheet.#rollInitiative,
            "assign-damage": AcolyteSheet.#assignDamage,
            toggleFavoriteAction: AcolyteSheet.#toggleFavoriteAction,
            combatAction: AcolyteSheet.#combatAction,
            vocalizeCombatAction: AcolyteSheet.#vocalizeCombatAction,
            
            // Stat adjustment actions
            adjustStat: AcolyteSheet.#adjustStat,
            increment: AcolyteSheet.#increment,
            decrement: AcolyteSheet.#decrement,
            setCriticalPip: AcolyteSheet.#setCriticalPip,
            setFateStar: AcolyteSheet.#setFateStar,
            setFatigueBolt: AcolyteSheet.#setFatigueBolt,
            setCorruption: AcolyteSheet.#setCorruption,
            setInsanity: AcolyteSheet.#setInsanity,
            restoreFate: AcolyteSheet.#restoreFate,
            spendFate: AcolyteSheet.#spendFate,
            
            // Equipment actions
            toggleEquip: AcolyteSheet.#toggleEquip,
            stowItem: AcolyteSheet.#stowItem,
            unstowItem: AcolyteSheet.#unstowItem,
            stowToShip: AcolyteSheet.#stowToShip,
            unstowFromShip: AcolyteSheet.#unstowFromShip,
            toggleActivate: AcolyteSheet.#toggleActivate,
            filterEquipment: AcolyteSheet.#filterEquipment,
            clearEquipmentSearch: AcolyteSheet.#clearEquipmentSearch,
            bulkEquip: AcolyteSheet.#bulkEquip,
            managePresets: AcolyteSheet.#managePresets,

            // Skills actions
            filterSkills: AcolyteSheet.#filterSkills,
            clearSkillsSearch: AcolyteSheet.#clearSkillsSearch,
            toggleFavoriteSkill: AcolyteSheet.#toggleFavoriteSkill,
            
            // Talents actions
            filterTalents: AcolyteSheet.#filterTalents,
            clearTalentsFilter: AcolyteSheet.#clearTalentsFilter,
            toggleFavoriteTalent: AcolyteSheet.#toggleFavoriteTalent,
            filterTraits: AcolyteSheet.#filterTraits,
            clearTraitsFilter: AcolyteSheet.#clearTraitsFilter,
            adjustTraitLevel: AcolyteSheet.#adjustTraitLevel,

            // Powers actions
            rollPower: AcolyteSheet.#rollPower,
            rollPowerDamage: AcolyteSheet.#rollPowerDamage,
            vocalizePower: AcolyteSheet.#vocalizePower,
            togglePowerDetails: AcolyteSheet.#togglePowerDetails,
            rollRitual: AcolyteSheet.#rollRitual,
            vocalizeRitual: AcolyteSheet.#vocalizeRitual,
            rollOrder: AcolyteSheet.#rollOrder,
            vocalizeOrder: AcolyteSheet.#vocalizeOrder,
            rollPhenomena: AcolyteSheet.#rollPhenomena,
            rollPerils: AcolyteSheet.#rollPerils,
            filterPowers: AcolyteSheet.#filterPowers,
            filterOrders: AcolyteSheet.#filterOrders,

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
            
            // Biography actions
            openOriginPathBuilder: AcolyteSheet.#openOriginPathBuilder,
            
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
    /*  Utility Methods                             */
    /* -------------------------------------------- */

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
        const context = await super._prepareContext(options);
        
        // RT-specific configuration
        context.dh = CONFIG.rt || ROGUE_TRADER;

        // Prepare characteristic HUD data
        this._prepareCharacteristicHUD(context);

        // Prepare origin path
        context.originPathSteps = this._prepareOriginPathSteps();
        context.originPathSummary = this._getOriginPathSummary();

        // Prepare navigator powers and ship roles (compute fresh)
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
     * @param {string} partId   The part ID (which matches the tab ID).
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {Promise<object>}
     * @protected
     */
    async _prepareTabPartContext(partId, context, options) {
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
            // Map property names for template compatibility
            context.talentsFilter = talentsData.filter || {};
            context.talentCategories = talentsData.categories || [];
            
            const traitsData = this._prepareTraitsContext(context);
            Object.assign(context, traitsData);
        }
        
        // Add powers context for powers tab
        if (partId === "powers") {
            const powersData = this._preparePowersContext();
            Object.assign(context, powersData);
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
     * Prepare origin path step data.
     * @returns {Array<object>}
     * @protected
     */
    _prepareOriginPathSteps() {
        const steps = CONFIG.rt.originPath?.steps || [
            { key: "homeWorld", label: "Home World", shortLabel: "Home", choiceGroup: "origin.home-world", icon: "fa-globe" },
            { key: "birthright", label: "Birthright", shortLabel: "Birth", choiceGroup: "origin.birthright", icon: "fa-baby" },
            { key: "lureOfTheVoid", label: "Lure of the Void", shortLabel: "Lure", choiceGroup: "origin.lure-of-the-void", icon: "fa-meteor" },
            { key: "trialsAndTravails", label: "Trials and Travails", shortLabel: "Trials", choiceGroup: "origin.trials-and-travails", icon: "fa-skull" },
            { key: "motivation", label: "Motivation", shortLabel: "Drive", choiceGroup: "origin.motivation", icon: "fa-fire" },
            { key: "career", label: "Career", shortLabel: "Career", choiceGroup: "origin.career", icon: "fa-user-tie" }
        ];

        const originItems = this.actor.items.filter(
            item => item.isOriginPath || (item.type === "originPath")
        );

        // Calculate totals from all origins
        const charTotals = {};
        const skillSet = new Set();
        const talentSet = new Set();
        const traitSet = new Set();
        let completedSteps = 0;

        const preparedSteps = steps.map(step => {
            const item = originItems.find(i => {
                const itemStep = i.system?.step || "";
                return itemStep === step.key || itemStep === step.label;
            });

            if (item) {
                completedSteps++;
                const system = item.system;
                const grants = system?.grants || {};
                const modifiers = system?.modifiers?.characteristics || {};
                const selectedChoices = system?.selectedChoices || {};

                // Accumulate base characteristics
                for (const [key, value] of Object.entries(modifiers)) {
                    if (value !== 0) {
                        charTotals[key] = (charTotals[key] || 0) + value;
                    }
                }

                // Collect base skills
                if (grants.skills) {
                    for (const skill of grants.skills) {
                        const skillName = skill.specialization 
                            ? `${skill.name} (${skill.specialization})`
                            : (skill.name || skill);
                        skillSet.add(skillName);
                    }
                }

                // Collect base talents
                if (grants.talents) {
                    for (const talent of grants.talents) {
                        talentSet.add(talent.name || talent);
                    }
                }

                // Collect base traits
                if (grants.traits) {
                    for (const trait of grants.traits) {
                        traitSet.add(trait.name || trait);
                    }
                }

                // Process choice grants
                if (grants.choices) {
                    for (const choice of grants.choices) {
                        const selectedValues = selectedChoices[choice.label] || [];
                        for (const selectedValue of selectedValues) {
                            const option = choice.options?.find(o => o.value === selectedValue);
                            if (!option?.grants) continue;

                            const choiceGrants = option.grants;

                            if (choiceGrants.characteristics) {
                                for (const [key, value] of Object.entries(choiceGrants.characteristics)) {
                                    if (value !== 0) {
                                        charTotals[key] = (charTotals[key] || 0) + value;
                                    }
                                }
                            }

                            if (choiceGrants.skills) {
                                for (const skill of choiceGrants.skills) {
                                    const skillName = skill.specialization 
                                        ? `${skill.name} (${skill.specialization})`
                                        : (skill.name || skill);
                                    skillSet.add(skillName);
                                }
                            }

                            if (choiceGrants.talents) {
                                for (const talent of choiceGrants.talents) {
                                    talentSet.add(talent.name || talent);
                                }
                            }

                            if (choiceGrants.traits) {
                                for (const trait of choiceGrants.traits) {
                                    traitSet.add(trait.name || trait);
                                }
                            }
                        }
                    }
                }
            }

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

        // Build characteristic summary array
        const charShorts = {
            weaponSkill: "WS", ballisticSkill: "BS", strength: "S", toughness: "T",
            agility: "Ag", intelligence: "Int", perception: "Per", willpower: "WP",
            fellowship: "Fel", influence: "Inf"
        };

        const characteristicBonuses = [];
        for (const [key, value] of Object.entries(charTotals)) {
            if (value !== 0) {
                characteristicBonuses.push({
                    key: key,
                    short: charShorts[key] || key.substring(0, 3).toUpperCase(),
                    value: value,
                    positive: value > 0
                });
            }
        }

        // Store summary in context for the template
        this._originPathSummary = {
            steps: preparedSteps,
            completedSteps: completedSteps,
            totalSteps: 6,
            isComplete: completedSteps === 6,
            characteristics: characteristicBonuses,
            skills: Array.from(skillSet),
            talents: Array.from(talentSet),
            traits: Array.from(traitSet)
        };

        return preparedSteps;
    }

    /**
     * Get the origin path summary (call after _prepareOriginPathSteps)
     * @returns {object}
     */
    _getOriginPathSummary() {
        return this._originPathSummary || {
            steps: [],
            completedSteps: 0,
            totalSteps: 6,
            isComplete: false,
            characteristics: [],
            skills: [],
            talents: [],
            traits: []
        };
    }

    /* -------------------------------------------- */

    /**
     * Get categorized items. Called fresh each time (no caching).
     * @returns {object} Categorized items
     * @protected
     */
    _getCategorizedItems() {
        const categories = {
            all: [],
            allCarried: [], // Items on person or in backpack (not ship)
            allShip: [], // Items in ship storage
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
            const inShip = item.system?.inShipStorage === true;
            
            // Add all equipment to "all" for display
            if (equipmentTypes.includes(item.type)) {
                categories.all.push(item);
                
                // Split into carried vs ship storage
                if (inShip) {
                    categories.allShip.push(item);
                } else {
                    categories.allCarried.push(item);
                }
            }

            // Categorize by type (ONLY non-ship items for armour/forceField/gear panels)
            if (item.type === "weapon" || item.isWeapon) categories.weapons.push(item);
            else if ((item.type === "armour" || item.isArmour) && !inShip) categories.armour.push(item);
            else if ((item.type === "forceField" || item.isForceField) && !inShip) categories.forceField.push(item);
            else if ((item.type === "cybernetic" || item.isCybernetic) && !inShip) categories.cybernetic.push(item);
            else if ((item.type === "gear" || item.isGear) && !inShip) categories.gear.push(item);
            else if (item.type === "storageLocation") categories.storageLocation.push(item);
            else if (item.type === "criticalInjury" || item.isCriticalInjury) categories.criticalInjury.push(item);

            // Track equipped items (only non-ship items can be equipped)
            if (item.system?.equipped === true && !inShip) categories.equipped.push(item);
        }

        return categories;
    }

    /* -------------------------------------------- */

    /**
     * Prepare loadout/equipment data for the template.
     * @param {object} context      The template render context.
     * @param {object} categorized  Categorized items.
     * @protected
     */
    _prepareLoadoutData(context, categorized) {

        // Add all items to context for the Backpack panel
        context.allItems = categorized.all;
        context.allCarriedItems = categorized.allCarried; // Personal/backpack items
        context.allShipItems = categorized.allShip; // Ship storage items

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
     * Prepare combat tab data for the template.
     * @param {object} context      The template render context.
     * @param {object} categorized  Categorized items.
     * @protected
     */
    _prepareCombatData(context, categorized) {
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

        // Prepare active effects data
        context.effects = this.actor.effects.map(effect => ({
            id: effect.id,
            label: effect.label || effect.name,
            icon: effect.icon,
            disabled: effect.disabled,
            sourceName: effect.sourceName,
            changes: effect.changes || [],
            document: effect
        }));

        // Change mode lookup for display
        context.changeModeLookup = {
            0: "Custom",
            1: "Multiply",
            2: "Add",
            3: "Downgrade",
            4: "Upgrade",
            5: "Override"
        };
        
        // Extract combat talents for display in combat actions panel
        const talents = this.actor.items.filter(i => i.type === "talent");
        context.combatTalents = talents
            .filter(t => t.system?.category === "combat")
            .map(t => ({
                id: t.id,
                name: t.name,
                img: t.img,
                system: {
                    tier: t.system.tier,
                    category: t.system.category
                }
            }));
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
        
        // Add favorite talents for display
        context.favoriteTalents = this._prepareFavoriteTalents();
        
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
        
        // Prepare favorite skills for dashboard
        context.favoriteSkills = this._prepareFavoriteSkills();
        
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare favorite skills for overview dashboard display.
     * @returns {Array<object>} Array of favorite skill display objects
     * @protected
     */
    _prepareFavoriteSkills() {
        const favorites = this.actor.getFlag("rogue-trader", "favoriteSkills") || [];
        const skills = this.actor.skills ?? {};
        const characteristics = this.actor.characteristics ?? {};
        
        // Map favorite skill keys to full skill objects
        return favorites
            .map(key => {
                const skill = skills[key];
                if (!skill) return null;
                
                // Get characteristic data - convert short name to key
                const charShort = skill.characteristic || 'S';
                const charKey = this._charShortToKey(charShort);
                const char = characteristics[charKey];
                
                return {
                    key,
                    label: skill.label || key,
                    current: skill.current ?? 0,
                    characteristic: charKey,
                    charShort: char?.short || charKey,
                    breakdown: this._getSkillBreakdown(skill, char),
                    tooltipData: JSON.stringify({
                        name: skill.label || key,
                        value: skill.current ?? 0,
                        characteristic: char?.label || charKey,
                        charValue: char?.total ?? 0,
                        breakdown: this._getSkillBreakdown(skill, char)
                    })
                };
            })
            .filter(skill => skill !== null); // Remove any invalid skills
    }
    
    /**
     * Generate skill breakdown string for tooltips.
     * @param {object} skill  Skill data
     * @param {object} char   Characteristic data
     * @returns {string}     Formatted breakdown string
     * @private
     */
    _getSkillBreakdown(skill, char) {
        const parts = [];
        const charValue = char?.total ?? 0;
        const trained = skill.trained ?? false;
        const plus10 = skill.plus10 ?? false;
        const plus20 = skill.plus20 ?? false;
        const bonus = skill.bonus ?? 0;
        
        // Base characteristic
        parts.push(`${char?.label || 'Characteristic'} ${charValue}`);
        
        // Training modifier
        if (!trained) {
            parts.push('Untrained (÷2)');
        } else if (plus20) {
            parts.push('Training +20');
        } else if (plus10) {
            parts.push('Training +10');
        } else {
            parts.push('Trained');
        }
        
        // Bonus from items/effects
        if (bonus !== 0) {
            parts.push(`Bonus ${bonus > 0 ? '+' : ''}${bonus}`);
        }
        
        return parts.join(' | ');
    }
    
    /**
     * Prepare favorite talents for overview dashboard display.
     * @returns {Array<object>} Array of favorite talent display objects
     * @protected
     */
    _prepareFavoriteTalents() {
        const favorites = this.actor.getFlag("rogue-trader", "favoriteTalents") || [];
        const talents = this.actor.items.filter(i => i.type === "talent");
        
        // Map favorite talent IDs to full talent objects
        return favorites
            .map(id => {
                const talent = talents.find(t => t.id === id);
                if (!talent) return null;
                
                return {
                    id: talent.id,
                    name: talent.name,
                    img: talent.img,
                    fullName: talent.system.fullName || talent.name,
                    specialization: talent.system.specialization || "",
                    system: {
                        tier: talent.system.tier || 0,
                        category: talent.system.category || ""
                    }
                };
            })
            .filter(talent => talent !== null); // Remove any invalid talents
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

    /**
     * Prepare powers tab context.
     * Prepares psychic powers, navigator powers, rituals, and orders.
     * @returns {object} Powers context data
     * @protected
     */
    _preparePowersContext() {
        // Get all power items
        const psychicPowers = this.actor.items.filter(i => i.type === "psychicPower");
        const navigatorPowers = this.actor.items.filter(i => i.type === "navigatorPower");
        const rituals = this.actor.items.filter(i => i.type === "ritual");
        const orders = this.actor.items.filter(i => i.type === "order");
        
        // Extract unique disciplines for filtering
        const disciplines = new Map();
        for (const power of psychicPowers) {
            const disc = power.system.discipline;
            if (disc && !disciplines.has(disc)) {
                disciplines.set(disc, {
                    id: disc,
                    label: power.system.disciplineLabel || disc.charAt(0).toUpperCase() + disc.slice(1)
                });
            }
        }
        const psychicDisciplines = Array.from(disciplines.values());
        
        // Extract unique order categories
        const categories = new Map();
        for (const order of orders) {
            const cat = order.system.category;
            if (cat && !categories.has(cat)) {
                categories.set(cat, {
                    id: cat,
                    label: order.system.categoryLabel || cat.charAt(0).toUpperCase() + cat.slice(1)
                });
            }
        }
        const orderCategories = Array.from(categories.values());
        
        // Get filter state
        const activeDiscipline = this._powersFilter?.discipline || "";
        const activeOrderCategory = this._powersFilter?.orderCategory || "";
        
        // Apply discipline filter to psychic powers
        let filteredPsychicPowers = psychicPowers;
        if (activeDiscipline) {
            filteredPsychicPowers = psychicPowers.filter(p => p.system.discipline === activeDiscipline);
        }
        
        // Apply category filter to orders
        let filteredOrders = orders;
        if (activeOrderCategory) {
            filteredOrders = orders.filter(o => o.system.category === activeOrderCategory);
        }
        
        return {
            // Item arrays
            psychicPowers: filteredPsychicPowers,
            navigatorPowers,
            rituals,
            orders: filteredOrders,
            
            // Counts
            psychicPowersCount: psychicPowers.length,
            navigatorPowersCount: navigatorPowers.length,
            ritualsCount: rituals.length,
            ordersCount: orders.length,
            
            // Filter data
            psychicDisciplines,
            orderCategories,
            activeDiscipline,
            activeOrderCategory
        };
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Combat Actions             */
    /* -------------------------------------------- */

    /**
     * Handle weapon attack action.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #attack(event, target) {
        try {
            await DHTargetedActionManager.performWeaponAttack(this.actor);
        } catch (error) {
            this._notify("error", `Attack failed: ${error.message}`, {
                duration: 5000
            });
            console.error("Attack error:", error);
        }
    }

    /**
     * Handle dodge action.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #dodge(event, target) {
        try {
            await this.actor.rollSkill?.("dodge");
        } catch (error) {
            this._notify("error", `Dodge roll failed: ${error.message}`, {
                duration: 5000
            });
            console.error("Dodge error:", error);
        }
    }

    /**
     * Handle parry action.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #parry(event, target) {
        try {
            await this.actor.rollSkill?.("parry");
        } catch (error) {
            this._notify("error", `Parry roll failed: ${error.message}`, {
                duration: 5000
            });
            console.error("Parry error:", error);
        }
    }

    /**
     * Handle assign damage action.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #assignDamage(event, target) {
        try {
            const hitData = new Hit();
            const assignData = new AssignDamageData(this.actor, hitData);
            await prepareAssignDamageRoll(assignData);
        } catch (error) {
            this._notify("error", `Assign damage failed: ${error.message}`, {
                duration: 5000
            });
            console.error("Assign damage error:", error);
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

    /**
     * Handle toggling a combat action as favorite.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleFavoriteAction(event, target) {
        event.stopPropagation(); // Prevent parent action from triggering
        const actionKey = target.dataset.actionKey;
        if (!actionKey) return;

        const currentFavorites = this.actor.system.favoriteCombatActions || [];
        const newFavorites = currentFavorites.includes(actionKey)
            ? currentFavorites.filter(k => k !== actionKey)
            : [...currentFavorites, actionKey];

        await this.actor.update({ "system.favoriteCombatActions": newFavorites });
    }

    /**
     * Handle generic combat action from favorites.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #combatAction(event, target) {
        const actionKey = target.dataset.combatAction;
        if (!actionKey) return;

        // Route to specific handler based on action key
        switch (actionKey) {
            case "dodge":
                await this.#dodge.call(this, event, target);
                break;
            case "parry":
                await this.#parry.call(this, event, target);
                break;
            case "assignDamage":
                await this.#assignDamage.call(this, event, target);
                break;
            case "initiative":
                await this.#rollInitiative.call(this, event, target);
                break;
            default:
                this._notify("warning", `Unknown combat action: ${actionKey}`, {
                    duration: 3000
                });
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle vocalizing combat actions to chat.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizeCombatAction(event, target) {
        const actionKey = target.dataset.actionKey;
        if (!actionKey) return;

        // Find the action definition in config
        const allActions = [
            ...(CONFIG.rt.combatActions?.attacks || []),
            ...(CONFIG.rt.combatActions?.movement || []),
            ...(CONFIG.rt.combatActions?.utility || [])
        ];
        
        const actionConfig = allActions.find(a => a.key === actionKey);
        if (!actionConfig) {
            this._notify("warning", `Unknown combat action: ${actionKey}`, { duration: 3000 });
            return;
        }

        // Prepare chat data
        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: await renderTemplate(
                "systems/rogue-trader/templates/chat/combat-action-card.hbs",
                {
                    name: game.i18n.localize(actionConfig.label),
                    actor: this.actor.name,
                    actionType: actionConfig.type,
                    description: game.i18n.localize(actionConfig.description),
                    subtypes: actionConfig.subtypes?.join(", ") || "",
                    icon: actionConfig.icon
                }
            )
        };

        // Create chat message
        await ChatMessage.create(chatData);
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
        event.stopPropagation(); // Prevent header toggle
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
        event.stopPropagation(); // Prevent header toggle
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
        event.stopPropagation(); // Prevent panel toggle
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
        event.stopPropagation(); // Prevent panel toggle
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
     * Handle quick-set fatigue bolt.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setFatigueBolt(event, target) {
        event.stopPropagation(); // Prevent panel toggle
        const throttleKey = `setFatigueBolt-${this.actor.id}`;
        return await this._throttle(throttleKey, 200, this.#setFatigueBoltImpl, this, [event, target]);
    }

    /**
     * Implementation of fatigue bolt setting (used by throttled wrapper).
     * @private
     */
    async #setFatigueBoltImpl(event, target) {
        const index = parseInt(target.dataset.fatigueIndex);
        const currentFatigue = this.actor.system.fatigue?.value || 0;
        const newValue = (index === currentFatigue) ? index - 1 : index;
        const maxFatigue = this.actor.system.fatigue?.max || 0;
        const clampedValue = Math.min(Math.max(newValue, 0), maxFatigue);
        await this._updateSystemField("system.fatigue.value", clampedValue);
    }

    /* -------------------------------------------- */

    /**
     * Handle quick-set corruption.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setCorruption(event, target) {
        event.stopPropagation(); // Prevent panel toggle
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
        event.stopPropagation(); // Prevent panel toggle
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
        event.stopPropagation(); // Prevent panel toggle
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
        event.stopPropagation(); // Prevent panel toggle
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
            "system.inBackpack": true,
            "system.inShipStorage": false
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
     * Handle stowing an item in ship storage.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #stowToShip(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await item.update({
            "system.equipped": false,
            "system.inBackpack": false,
            "system.inShipStorage": true
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle unstowing an item from ship storage.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #unstowFromShip(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await item.update({ "system.inShipStorage": false });
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
    /*  Event Handlers - Biography Actions          */
    /* -------------------------------------------- */

    /**
     * Open the Origin Path Builder dialog for this character.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #openOriginPathBuilder(event, target) {
        try {
            if (game.rt?.openOriginPathBuilder) {
                await game.rt.openOriginPathBuilder(this.actor);
            } else {
                this._notify("warning", "Origin Path Builder not available", {
                    duration: 3000
                });
                console.warn("game.rt.openOriginPathBuilder not found");
            }
        } catch (error) {
            this._notify("error", `Failed to open Origin Path Builder: ${error.message}`, {
                duration: 5000
            });
            console.error("Origin Path Builder error:", error);
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
    
    /**
     * Toggle favorite status for a skill.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static async #toggleFavoriteSkill(event, target) {
        const skillKey = target.dataset.skill;
        if (!skillKey) return;
        
        // Get current favorite skills
        const favorites = this.actor.getFlag("rogue-trader", "favoriteSkills") || [];
        const index = favorites.indexOf(skillKey);
        
        // Toggle
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(skillKey);
        }
        
        // Save
        await this.actor.setFlag("rogue-trader", "favoriteSkills", favorites);
        
        // Re-render skills tab and overview tab
        await this.render({ parts: ['skills', 'overview'] });
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
    
    /**
     * Toggle favorite status for a talent.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static async #toggleFavoriteTalent(event, target) {
        const itemId = target.dataset.itemId;
        if (!itemId) return;
        
        // Get current favorite talents
        const favorites = this.actor.getFlag("rogue-trader", "favoriteTalents") || [];
        const index = favorites.indexOf(itemId);
        
        // Toggle
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(itemId);
        }
        
        // Save
        await this.actor.setFlag("rogue-trader", "favoriteTalents", favorites);
        
        // Re-render talents tab and overview tab
        await this.render({ parts: ['talents', 'overview'] });
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

    /* -------------------------------------------- */
    /*  Event Handlers - Powers Actions             */
    /* -------------------------------------------- */

    /**
     * Handle rolling a psychic or navigator power.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollPower(event, target) {
        try {
            const itemId = target.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (!item) {
                this._notify("warning", "Power not found", { duration: 3000 });
                return;
            }
            
            // Use the actor's rollItem method for consistent handling
            await this.actor.rollItem(itemId);
        } catch (error) {
            this._notify("error", `Power roll failed: ${error.message}`, { duration: 5000 });
            console.error("Power roll error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling damage for an attack power.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollPowerDamage(event, target) {
        try {
            const itemId = target.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (!item) {
                this._notify("warning", "Power not found", { duration: 3000 });
                return;
            }
            
            // Use the actor's damageItem method
            await this.actor.damageItem(itemId);
        } catch (error) {
            this._notify("error", `Damage roll failed: ${error.message}`, { duration: 5000 });
            console.error("Power damage error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle vocalizing a power to chat.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizePower(event, target) {
        try {
            const itemId = target.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (!item) {
                this._notify("warning", "Power not found", { duration: 3000 });
                return;
            }
            
            // Post to chat using the item's vocalize or toChat method
            if (typeof item.toChat === "function") {
                await item.toChat();
            } else {
                // Fallback: create a simple chat message
                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    content: `<div class="rt-power-chat"><h3>${item.name}</h3><p>${item.system.description || ""}</p></div>`
                });
            }
        } catch (error) {
            this._notify("error", `Failed to post power: ${error.message}`, { duration: 5000 });
            console.error("Vocalize power error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling power details expansion.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #togglePowerDetails(event, target) {
        const itemId = target.dataset.itemId;
        const detailsEl = this.element.querySelector(`.rt-power-details[data-power-id="${itemId}"]`);
        
        if (detailsEl) {
            const isHidden = detailsEl.hasAttribute("hidden");
            if (isHidden) {
                detailsEl.removeAttribute("hidden");
                target.classList.add("expanded");
            } else {
                detailsEl.setAttribute("hidden", "");
                target.classList.remove("expanded");
            }
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling a ritual.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollRitual(event, target) {
        try {
            const itemId = target.dataset.itemId;
            await this.actor.rollItem(itemId);
        } catch (error) {
            this._notify("error", `Ritual roll failed: ${error.message}`, { duration: 5000 });
            console.error("Ritual roll error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle vocalizing a ritual to chat.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizeRitual(event, target) {
        try {
            const itemId = target.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (!item) return;
            
            if (typeof item.toChat === "function") {
                await item.toChat();
            } else {
                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    content: `<div class="rt-ritual-chat"><h3>${item.name}</h3><p>${item.system.description || ""}</p></div>`
                });
            }
        } catch (error) {
            this._notify("error", `Failed to post ritual: ${error.message}`, { duration: 5000 });
            console.error("Vocalize ritual error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling an order.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollOrder(event, target) {
        try {
            const itemId = target.dataset.itemId;
            await this.actor.rollItem(itemId);
        } catch (error) {
            this._notify("error", `Order roll failed: ${error.message}`, { duration: 5000 });
            console.error("Order roll error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle vocalizing an order to chat.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizeOrder(event, target) {
        try {
            const itemId = target.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (!item) return;
            
            if (typeof item.toChat === "function") {
                await item.toChat();
            } else {
                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    content: `<div class="rt-order-chat"><h3>${item.name}</h3><p>${item.system.description || ""}</p></div>`
                });
            }
        } catch (error) {
            this._notify("error", `Failed to post order: ${error.message}`, { duration: 5000 });
            console.error("Vocalize order error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling psychic phenomena.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollPhenomena(event, target) {
        try {
            // Use the game.rt roll helper if available
            if (game.rt?.rollPsychicPhenomena) {
                await game.rt.rollPsychicPhenomena(this.actor);
            } else {
                // Fallback: roll on phenomena table
                const table = game.tables.getName("Psychic Phenomena") || 
                             await game.packs.get("rogue-trader.rt-rolltables-psychic")?.getDocuments()
                                 .then(docs => docs.find(d => d.name.includes("Phenomena")));
                
                if (table) {
                    await table.draw();
                } else {
                    // Simple d100 roll as last resort
                    const roll = await new Roll("1d100").evaluate();
                    await ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                        content: `<div class="rt-phenomena-roll"><h3>Psychic Phenomena</h3><p>Roll: ${roll.total}</p></div>`,
                        rolls: [roll]
                    });
                }
            }
        } catch (error) {
            this._notify("error", `Phenomena roll failed: ${error.message}`, { duration: 5000 });
            console.error("Phenomena roll error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling perils of the warp.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollPerils(event, target) {
        try {
            // Use the game.rt roll helper if available
            if (game.rt?.rollPerilsOfTheWarp) {
                await game.rt.rollPerilsOfTheWarp(this.actor);
            } else {
                // Fallback: roll on perils table
                const table = game.tables.getName("Perils of the Warp") || 
                             await game.packs.get("rogue-trader.rt-rolltables-psychic")?.getDocuments()
                                 .then(docs => docs.find(d => d.name.includes("Perils")));
                
                if (table) {
                    await table.draw();
                } else {
                    // Simple d100 roll as last resort
                    const roll = await new Roll("1d100").evaluate();
                    await ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                        content: `<div class="rt-perils-roll"><h3>Perils of the Warp</h3><p>Roll: ${roll.total}</p></div>`,
                        rolls: [roll]
                    });
                }
            }
        } catch (error) {
            this._notify("error", `Perils roll failed: ${error.message}`, { duration: 5000 });
            console.error("Perils roll error:", error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle filtering psychic powers by discipline.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #filterPowers(event, target) {
        const discipline = target.dataset.discipline || "";
        
        // Initialize filter state if needed
        if (!this._powersFilter) this._powersFilter = {};
        this._powersFilter.discipline = discipline;
        
        // Update active class on filter buttons
        const filterBtns = this.element.querySelectorAll(".rt-panel-psychic-powers .rt-filter-btn");
        filterBtns.forEach(btn => {
            btn.classList.toggle("active", btn.dataset.discipline === discipline);
        });
        
        // Re-render the powers part
        await this.render({ parts: ["powers"] });
    }

    /* -------------------------------------------- */

    /**
     * Handle filtering orders by category.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #filterOrders(event, target) {
        const category = target.dataset.category || "";
        
        // Initialize filter state if needed
        if (!this._powersFilter) this._powersFilter = {};
        this._powersFilter.orderCategory = category;
        
        // Update active class on filter buttons
        const filterBtns = this.element.querySelectorAll(".rt-panel-orders .rt-filter-btn");
        filterBtns.forEach(btn => {
            btn.classList.toggle("active", btn.dataset.category === category);
        });
        
        // Re-render the powers part
        await this.render({ parts: ["powers"] });
    }

    /* -------------------------------------------- */
    /*  Drag & Drop Override                        */
    /* -------------------------------------------- */

    /**
     * Override drop item to handle origin path updates.
     * @override
     */
    async _onDropItem(event, item) {
        const result = await super._onDropItem(event, item);
        
        // If dropped item is an origin path (trait with origin flag), re-render biography part
        const isOriginPath = item?.type === "originPath" || 
                           (item?.type === "trait" && item?.flags?.rt?.kind === "origin");
        
        if (isOriginPath) {
            // Render only the biography part to update origin path panel
            await this.render({ parts: ["biography"] });
        }
        
        return result;
    }
}
