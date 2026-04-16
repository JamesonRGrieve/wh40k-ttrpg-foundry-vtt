/**
 * @file CharacterSheet - Character sheet for acolyte/character actors using ApplicationV2
 * This is the main player character sheet for WH40K RPG
 */

import { DHBasicActionManager } from '../../actions/basic-action-manager.ts';
import { DHTargetedActionManager } from '../../actions/targeted-action-manager.ts';
import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import WH40K from '../../config.ts';
import type { WH40KAcolyte } from '../../documents/acolyte.ts';
import { AssignDamageData } from '../../rolls/assign-damage-data.ts';
import { Hit } from '../../rolls/damage-data.ts';
import AcquisitionDialog from '../dialogs/acquisition-dialog.ts';
import AdvancementDialog from '../dialogs/advancement-dialog.ts';
import CharacteristicSetupDialog from '../dialogs/characteristic-setup-dialog.ts';
import ConfirmationDialog from '../dialogs/confirmation-dialog.ts';
import { prepareAssignDamageRoll } from '../prompts/assign-damage-dialog.ts';
import BaseActorSheet from './base-actor-sheet.ts';

const TextEditor = foundry.applications.ux.TextEditor.implementation;

/**
 * Actor sheet for Acolyte/Character type actors.
 */
export default class CharacterSheet extends (BaseActorSheet as any) {
    [key: string]: any;
    declare actor: WH40KAcolyte;
    declare document: WH40KAcolyte;
    declare element: HTMLElement;
    declare position: { top: number; left: number; width: number; height: number };
    declare isEditable: boolean;
    declare _powersFilter: Record<string, any>;
    declare _equipmentFilter: { search: string; type: string; status: string };
    declare _skillsFilter: { search: string; characteristic: string; training: string };
    declare _traitsFilter: Record<string, any>;
    declare render: (options?: Record<string, unknown> | boolean) => any;

    /**
     * Whether the sheet is in edit mode (showing inline stat fields).
     * @type {boolean}
     */
    #editMode = false;

    /**
     * Whether the sheet is currently in edit mode.
     * @type {boolean}
     */
    get inEditMode(): boolean {
        return this.#editMode && this.isEditable;
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        actions: {
            'toggleEditMode': CharacterSheet.#toggleEditMode,
            // Combat actions
            'attack': CharacterSheet.#attack,
            'dodge': CharacterSheet.#dodge,
            'parry': CharacterSheet.#parry,
            'initiative': CharacterSheet.#rollInitiative,
            'assign-damage': CharacterSheet.#assignDamage,
            'toggleFavoriteAction': CharacterSheet.#toggleFavoriteAction,
            'combatAction': CharacterSheet.#combatAction,
            'vocalizeCombatAction': CharacterSheet.#vocalizeCombatAction,
            'vocalizeMovement': CharacterSheet.#vocalizeMovement,
            'setMovementMode': CharacterSheet.#setMovementMode,

            // Stat adjustment actions
            'adjustStat': CharacterSheet.#adjustStat,
            'increment': CharacterSheet.#increment,
            'decrement': CharacterSheet.#decrement,
            'setCriticalPip': CharacterSheet.#setCriticalPip,
            'setFateStar': CharacterSheet.#setFateStar,
            'setFatigueBolt': CharacterSheet.#setFatigueBolt,
            'setCorruption': CharacterSheet.#setCorruption,
            'setInsanity': CharacterSheet.#setInsanity,
            'restoreFate': CharacterSheet.#restoreFate,
            'spendFate': CharacterSheet.#spendFate,

            // Equipment actions
            'toggleEquip': CharacterSheet.#toggleEquip,
            'stowItem': CharacterSheet.#stowItem,
            'unstowItem': CharacterSheet.#unstowItem,
            'stowToShip': CharacterSheet.#stowToShip,
            'unstowFromShip': CharacterSheet.#unstowFromShip,
            'swapCheckedItems': CharacterSheet.#swapCheckedItems,
            'toggleActivate': CharacterSheet.#toggleActivate,
            'filterEquipment': CharacterSheet.#filterEquipment,
            'clearEquipmentSearch': CharacterSheet.#clearEquipmentSearch,
            'bulkEquip': CharacterSheet.#bulkEquip,

            // Skills actions
            'filterSkills': CharacterSheet.#filterSkills,
            'clearSkillsSearch': CharacterSheet.#clearSkillsSearch,
            'toggleFavoriteSkill': CharacterSheet.#toggleFavoriteSkill,
            'toggleFavoriteSpecialistSkill': CharacterSheet.#toggleFavoriteSpecialistSkill,
            // cycleSkillTraining/cycleSpecialistTraining removed — skill ranks are now
            // live-computed from origin path items + XP advances. Use Advancement Dialog.

            // Talents actions
            'toggleFavoriteTalent': CharacterSheet.#toggleFavoriteTalent,
            'filterTraits': CharacterSheet.#filterTraits,
            'clearTraitsFilter': CharacterSheet.#clearTraitsFilter,
            'adjustTraitLevel': CharacterSheet.#adjustTraitLevel,
            'openAddSpecialistDialog': CharacterSheet.#openAddSpecialistDialog,

            // Powers actions
            'rollPower': CharacterSheet.#rollPower,
            'rollPowerDamage': CharacterSheet.#rollPowerDamage,
            'vocalizePower': CharacterSheet.#vocalizePower,
            'togglePowerDetails': CharacterSheet.#togglePowerDetails,
            'rollRitual': CharacterSheet.#rollRitual,
            'vocalizeRitual': CharacterSheet.#vocalizeRitual,
            'rollOrder': CharacterSheet.#rollOrder,
            'vocalizeOrder': CharacterSheet.#vocalizeOrder,
            'rollPhenomena': CharacterSheet.#rollPhenomena,
            'rollPerils': CharacterSheet.#rollPerils,
            'filterPowers': CharacterSheet.#filterPowers,
            'filterOrders': CharacterSheet.#filterOrders,

            // Acquisition actions
            'addAcquisition': CharacterSheet.#addAcquisition,
            'removeAcquisition': CharacterSheet.#removeAcquisition,
            'openAcquisitionDialog': CharacterSheet.#openAcquisitionDialog,

            // Experience actions
            'customXP': CharacterSheet.#customXP,
            'openAdvancement': CharacterSheet.#openAdvancement,

            // Active Effect actions
            'createEffect': CharacterSheet.#createEffect,
            'toggleEffect': CharacterSheet.#toggleEffect,
            'deleteEffect': CharacterSheet.#deleteEffect,

            // Biography actions
            'openOriginPathBuilder': CharacterSheet.#openOriginPathBuilder,

            // Characteristic setup
            'openCharacteristicSetup': CharacterSheet.#openCharacteristicSetup,

            // Utility menu
            'showUtilityMenu': CharacterSheet.#showUtilityMenu,

            // Misc actions
            'bonusVocalize': CharacterSheet.#bonusVocalize,
        },
        classes: ['wh40k-rpg', 'sheet', 'actor', 'player'],
        position: {
            width: 1050,
            height: 800,
        },
        // Tab configuration - uses ApplicationV2 tab handling
        tabs: [{ navSelector: 'nav.wh40k-navigation', contentSelector: '#tab-body', initial: 'overview', group: 'primary' }],
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
            template: 'systems/wh40k-rpg/templates/actor/player/header.hbs',
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/player/tabs.hbs',
        },
        overview: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-overview.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        combat: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-combat.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        skills: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-skills.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        // talents tab removed — talents/traits moved to overview, specialist skills to skills tab
        equipment: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-equipment.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        powers: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-powers.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        biography: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-biography.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */

    /**
     * Tab configuration for the primary tab group.
     * @override
     */
    static TABS = [
        { tab: 'overview', label: 'WH40K.Tabs.Overview', group: 'primary', cssClass: 'tab-overview' },
        { tab: 'skills', label: 'WH40K.Tabs.Skills', group: 'primary', cssClass: 'tab-skills' },
        // talents tab removed — content moved to overview and skills tabs
        { tab: 'combat', label: 'WH40K.Tabs.Combat', group: 'primary', cssClass: 'tab-combat' },
        { tab: 'equipment', label: 'WH40K.Tabs.Equipment', group: 'primary', cssClass: 'tab-equipment' },
        // { tab: 'powers', label: 'WH40K.Tabs.Powers', group: 'primary', cssClass: 'tab-powers' },
        { tab: 'biography', label: 'WH40K.Tabs.Biography', group: 'primary', cssClass: 'tab-biography' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'overview',
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
    async _throttle(key: string, wait: number, func: (...args: any[]) => any, context: any, args: any[]): Promise<any> {
        // Initialize throttle tracking map if it doesn't exist
        if (!this._throttleTimers) this._throttleTimers = new Map();

        const now = Date.now();
        const lastRun = this._throttleTimers.get(key) || 0;

        // If not enough time has passed, ignore this call
        if (now - lastRun < wait) {
            return undefined;
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
    _notify(type: 'info' | 'warning' | 'error', message: string, options: Record<string, any> = {}): void {
        const toast = (foundry.applications?.api as any)?.Toast;
        if (toast && typeof toast[type] === 'function') {
            toast[type](message, options);
            return;
        }
        const notifications = ui?.notifications;
        if (!notifications) return;
        const method = type === 'warning' ? 'warn' : type;
        if (typeof notifications[method] === 'function') {
            notifications[method](message, options);
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
    async _updateSystemField(field: string, value: any): Promise<void> {
        await this.actor.update({ [field]: value });
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options: Record<string, any>): Promise<Record<string, any>> {
        const context = await super._prepareContext(options);

        // Edit mode state
        context.inEditMode = this.inEditMode;

        // WH40K-specific configuration
        context.dh = CONFIG.wh40k || WH40K;

        // Prepare characteristic HUD data
        this._prepareCharacteristicHUD(context);

        // Prepare origin path
        context.originPathSteps = this._prepareOriginPathSteps();
        context.originPathSummary = this._getOriginPathSummary();

        // Prepare navigator powers and ship roles (compute fresh)
        const categorized = this._getCategorizedItems();
        context.navigatorPowers = this.actor.items.filter((item) => (item.type as string) === 'navigatorPower' || (item as any).isNavigatorPower);
        context.shipRoles = this.actor.items.filter((item) => (item.type as string) === 'shipRole' || (item as any).isShipRole);

        // Prepare item counts for panel headers
        context.talentsCount = this.actor.items.filter((item) => (item as any).isTalent).length;
        context.traitsCount = this.actor.items.filter((item) => (item as any).isTrait).length;

        // Prepare loadout/equipment data (uses cached categorized items)
        this._prepareLoadoutData(context, categorized);

        // Prepare combat station data (uses cached categorized items)
        this._prepareCombatData(context, categorized);

        // Prepare WH40K RPG specific fields
        if (context.system) {
            context.system.rogueTrader = this._prepareWH40KFields(context.system.rogueTrader ?? {});
        }

        // Prepare dynasty tab data
        context.dynastyData = this._prepareDynastyData();

        // Prepare active modifiers panel (Phase 5 Integration)
        context.activeModifiers = this.prepareActiveModifiers();

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
    async _preparePartContext(partId: string, context: Record<string, any>, options: Record<string, any>): Promise<Record<string, any>> {
        const partContext = await super._preparePartContext(partId, context, options);

        switch (partId) {
            case 'header':
                return this._prepareHeaderContext(partContext, options);
            case 'tabs':
                return this._prepareTabsContext(partContext, options);
            case 'biography':
                return await this._prepareBiographyContext(partContext, options);
            case 'overview':
                return await this._prepareOverviewDashboardContext(partContext, options);
            case 'status':
            case 'combat':
            case 'skills':
            case 'equipment':
            case 'powers':
            case 'dynasty':
                // Provide tab object for the template
                return this._prepareTabPartContext(partId, partContext, options);
            default:
                return partContext;
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
    async _prepareTabPartContext(partId: string, context: Record<string, any>, options: Record<string, any>): Promise<Record<string, any>> {
        // Find the tab configuration
        const tabConfig = (this.constructor as any).TABS.find((t) => t.tab === partId);
        if (tabConfig) {
            context.tab = {
                id: tabConfig.tab,
                group: tabConfig.group,
                cssClass: tabConfig.cssClass,
                label: game.i18n.localize(tabConfig.label),
                active: this.tabGroups[tabConfig.group] === tabConfig.tab,
            };
        }

        // Add filter state, specialist skills, talents, and traits for skills tab
        if (partId === 'skills') {
            context.skillsFilter = this._skillsFilter;
            // Add skillLists for specialist skills panel
            if (!context.skillLists) {
                await this._prepareSkills(context);
            }
            // Add talents and traits context
            const talentsData = this._prepareTalentsContext();
            Object.assign(context, talentsData);
            const traitsData = this._prepareTraitsContext(context);
            Object.assign(context, traitsData);
        }

        // Add powers context for powers tab
        if (partId === 'powers') {
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
    async _prepareBiographyContext(context: Record<string, any>, options: Record<string, any>): Promise<Record<string, any>> {
        const ctx = context;
        // First prepare the standard tab context
        await this._prepareTabPartContext('biography', ctx, options);

        // Prepare biography data with enriched HTML for ProseMirror
        const rawNotes = this.actor.system.bio?.notes ?? '';

        const enrichedNotes = await TextEditor.enrichHTML(rawNotes, {
            relativeTo: this.actor,
            secrets: this.actor.isOwner,
            rollData: this.actor.getRollData(),
        });
        ctx.biography = {
            source: {
                notes: rawNotes,
            },
            enriched: {
                notes: enrichedNotes,
            },
        };

        return ctx;
    }

    /* -------------------------------------------- */

    /**
     * Prepare header part context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareHeaderContext(context: Record<string, any>, options: Record<string, any>): Promise<Record<string, any>> {
        // Build dynamic origin path select options from compendium packs
        const gameSystem = (this as any)._gameSystemId || this.actor.system?.gameSystem || 'rt';
        const originOptions = await this._getOriginPathOptions(gameSystem);
        context.originOptions = originOptions;

        // Check if origin path is complete (has at least homeWorld + background + role)
        const op = this.actor.system?.originPath || {};
        context.originPathComplete = !!(op.homeWorld && op.background && op.role);

        return context;
    }

    /**
     * Fetch unique origin path names grouped by step from compendium packs.
     * @param {string} gameSystem - The game system ID (e.g. 'dh2e', 'rt')
     * @returns {Promise<Record<string, string[]>>}
     * @private
     */
    async _getOriginPathOptions(gameSystem: string): Promise<Record<string, string[]>> {
        // Use cached options if available (packs don't change at runtime)
        const cacheKey = `_originOptions_${gameSystem}`;
        if ((this as any)[cacheKey]) return (this as any)[cacheKey];

        const stepNames: Record<string, Set<string>> = {};

        for (const pack of game.packs) {
            if (pack.documentName !== 'Item') continue;
            // Only check packs that contain origin path items for this game system
            const packName = (pack.metadata.name as string) || '';
            const prefix = gameSystem === 'dh2e' ? 'dh2' : gameSystem === 'dh1e' ? 'dh1' : gameSystem;
            if (!packName.startsWith(prefix) && !packName.startsWith('homebrew')) continue;

            const index = await pack.getIndex({ fields: ['type', 'system.step'] });
            for (const entry of index) {
                if ((entry as any).type !== 'originPath') continue;
                const step = (entry as any).system?.step;
                if (!step) continue;
                if (!stepNames[step]) stepNames[step] = new Set();
                stepNames[step].add(entry.name);
            }
        }

        // Convert Sets to sorted arrays
        const result: Record<string, string[]> = {};
        for (const [step, names] of Object.entries(stepNames)) {
            result[step] = [...names].sort();
        }

        (this as any)[cacheKey] = result;
        return result;
    }

    /* -------------------------------------------- */

    /**
     * Prepare tabs part context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    _prepareTabsContext(context: Record<string, any>, options: Record<string, any>): Record<string, any> {
        // Tabs use the static TABS configuration
        context.tabs = (this.constructor as any).TABS.map((tab) => ({
            ...tab,
            active: this.tabGroups[tab.group] === tab.tab,
            label: game.i18n.localize(tab.label),
        }));
        return context;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onFirstRender(context: Record<string, any>, options: Record<string, any>): void {
        super._onFirstRender(context, options);

        // Ensure initial tab is active
        const activeTab = this.tabGroups.primary || 'overview';

        // Add active class to the initial tab content
        const tabContent = this.element.querySelector(`section.tab[data-tab="${activeTab}"]`);
        if (tabContent) {
            tabContent.classList.add('active');
        }

        // Add active class to the initial nav item
        const navItem = this.element.querySelector(`nav.wh40k-navigation a[data-tab="${activeTab}"]`);
        if (navItem) {
            navItem.classList.add('active');
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
    _prepareBodyContext(context: Record<string, any>, options: Record<string, any>): Record<string, any> {
        // All tab data is already prepared in _prepareContext
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare characteristic HUD data and tooltip data.
     * @param {object} context  Context being prepared.
     * @protected
     */
    _prepareCharacteristicHUD(context: Record<string, any>): void {
        const hudCharacteristics = context.actor?.characteristics ?? {};
        const modifierSources = context.system?.modifierSources?.characteristics ?? {};

        // SVG circle parameters for progress ring
        const radius = 52;
        const circumference = 2 * Math.PI * radius; // ~326.7

        (Object.entries(hudCharacteristics) as [string, any][]).forEach(([key, char]) => {
            const total = Number(char?.total ?? 0);
            const advance = Number(char?.advance ?? 0);

            // Use the calculated bonus (accounts for unnatural), fallback to tens digit
            char.hudMod = char.bonus ?? Math.floor(total / 10);
            char.hudTotal = total;

            // Progress ring data (advancement 0-5 maps to 0-100%)
            char.advanceProgress = (advance / 5) * 100;
            char.progressCircumference = circumference;
            char.progressOffset = circumference * (1 - advance / 5);

            // XP cost for next advancement (using WH40K progression)
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
    _prepareOriginPathSteps(): Record<string, unknown>[] {
        // Use system-specific step config when available
        const gameSystem = (this as any)._gameSystemId || this.actor.system?.gameSystem || 'rt';
        let steps;
        try {
            const sysConfig = SystemConfigRegistry.get(gameSystem);
            const stepConfig = sysConfig.getOriginStepConfig();
            const allSteps = [...(stepConfig.coreSteps || [])];
            if (stepConfig.optionalStep) allSteps.push(stepConfig.optionalStep);
            steps = allSteps.map((s) => ({
                key: s.key || s.step,
                label: s.key ? s.key.charAt(0).toUpperCase() + s.key.slice(1).replace(/([A-Z])/g, ' $1') : s.step,
                shortLabel: (s.key || s.step).substring(0, 5),
                icon: s.icon || 'fa-circle',
            }));
        } catch {
            steps = [
                { key: 'homeWorld', label: 'Home World', shortLabel: 'Home', icon: 'fa-globe' },
                { key: 'birthright', label: 'Birthright', shortLabel: 'Birth', icon: 'fa-baby' },
                { key: 'lureOfTheVoid', label: 'Lure of the Void', shortLabel: 'Lure', icon: 'fa-meteor' },
                { key: 'trialsAndTravails', label: 'Trials and Travails', shortLabel: 'Trials', icon: 'fa-skull' },
                { key: 'motivation', label: 'Motivation', shortLabel: 'Drive', icon: 'fa-fire' },
                { key: 'career', label: 'Career', shortLabel: 'Career', icon: 'fa-user-tie' },
            ];
        }

        const originItems = this.actor.items.filter((item) => (item as any).isOriginPath || (item.type as string) === 'originPath');

        // Calculate totals from all origins
        const charTotals = {};
        const skillSet = new Set();
        const talentSet = new Set();
        const traitSet = new Set();
        let completedSteps = 0;

        const preparedSteps = steps.map((step) => {
            const item = originItems.find((i) => {
                const itemStep = (i.system as any)?.step || '';
                return itemStep === step.key || itemStep === step.label;
            });

            if (item) {
                completedSteps++;
                const system = item.system as any;
                const grants = system?.grants || {};
                const modifiers = system?.modifiers?.characteristics || {};
                const selectedChoices = system?.selectedChoices || {};

                // Accumulate base characteristics
                for (const [key, value] of Object.entries(modifiers)) {
                    if (value !== 0) {
                        charTotals[key] = (charTotals[key] || 0) + Number(value);
                    }
                }

                // Collect base skills
                if (grants.skills) {
                    for (const skill of grants.skills) {
                        const skillName = skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name || skill;
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
                            const option = choice.options?.find((o) => o.value === selectedValue);
                            if (!option?.grants) continue;

                            const choiceGrants = option.grants;

                            if (choiceGrants.characteristics) {
                                for (const [key, value] of Object.entries(choiceGrants.characteristics)) {
                                    if (value !== 0) {
                                        charTotals[key] = (charTotals[key] || 0) + Number(value);
                                    }
                                }
                            }

                            if (choiceGrants.skills) {
                                for (const skill of choiceGrants.skills) {
                                    const skillName = skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name || skill;
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

            const tooltipData = item
                ? JSON.stringify({
                      title: `${step.label}: ${item.name}`,
                      content: (item.system as any)?.description?.value || '',
                  })
                : null;

            return {
                ...step,
                item: item
                    ? {
                          _id: item.id,
                          name: item.name,
                          img: item.img,
                          system: item.system,
                      }
                    : null,
                tooltipData,
            };
        });

        // Build characteristic summary array
        const charShorts = {
            weaponSkill: 'WS',
            ballisticSkill: 'BS',
            strength: 'S',
            toughness: 'T',
            agility: 'Ag',
            intelligence: 'Int',
            perception: 'Per',
            willpower: 'WP',
            fellowship: 'Fel',
            influence: 'Inf',
        };

        const characteristicBonuses = [];
        for (const [key, value] of Object.entries(charTotals) as [string, number][]) {
            if (value !== 0) {
                characteristicBonuses.push({
                    key: key,
                    short: charShorts[key] || key.substring(0, 3).toUpperCase(),
                    value: value,
                    positive: value > 0,
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
            traits: Array.from(traitSet),
        };

        return preparedSteps;
    }

    /**
     * Get the origin path summary (call after _prepareOriginPathSteps)
     * @returns {object}
     */
    _getOriginPathSummary(): Record<string, unknown> {
        return (
            this._originPathSummary || {
                steps: [],
                completedSteps: 0,
                totalSteps: 6,
                isComplete: false,
                characteristics: [],
                skills: [],
                talents: [],
                traits: [],
            }
        );
    }

    /* -------------------------------------------- */

    /**
     * Get categorized items. Called fresh each time (no caching).
     * @returns {object} Categorized items
     * @protected
     */
    _getCategorizedItems(): Record<string, any[]> {
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
            equipped: [],
        };

        // Equipment item types that should appear in backpack
        const equipmentTypes = ['weapon', 'armour', 'forceField', 'cybernetic', 'gear', 'storageLocation', 'ammunition', 'drugOrConsumable'];

        for (const item of this.actor.items) {
            const itemType = item.type as string;
            const sys = item.system as any;
            const inShip = sys?.inShipStorage === true;

            // Add all equipment to "all" for display
            if (equipmentTypes.includes(itemType)) {
                categories.all.push(item);

                // Split into carried vs ship storage
                if (inShip) {
                    categories.allShip.push(item);
                } else {
                    categories.allCarried.push(item);
                }
            }

            // Categorize by type (ONLY non-ship items for armour/forceField/gear panels)
            if (itemType === 'weapon' || (item as any).isWeapon) categories.weapons.push(item);
            else if ((itemType === 'armour' || (item as any).isArmour) && !inShip) categories.armour.push(item);
            else if ((itemType === 'forceField' || (item as any).isForceField) && !inShip) categories.forceField.push(item);
            else if ((itemType === 'cybernetic' || (item as any).isCybernetic) && !inShip) categories.cybernetic.push(item);
            else if ((itemType === 'gear' || (item as any).isGear) && !inShip) categories.gear.push(item);
            else if (itemType === 'storageLocation') categories.storageLocation.push(item);
            else if (itemType === 'criticalInjury' || (item as any).isCriticalInjury) categories.criticalInjury.push(item);

            // Track equipped items (only non-ship items can be equipped)
            if (sys?.equipped === true && !inShip) categories.equipped.push(item);
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
    _prepareLoadoutData(context: Record<string, any>, categorized: Record<string, any[]>): void {
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
        const enc = (this.actor as any).encumbrance ?? {};
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
    _prepareCombatData(context: Record<string, any>, categorized: Record<string, any[]>): void {
        const weapons = categorized.weapons;
        const system = context.system ?? this.actor.system ?? {};

        // Calculate vitals percentages
        const woundsMax = system.wounds?.max || 1;
        context.woundsPercent = Math.min(100, Math.round(((system.wounds?.value ?? 0) / woundsMax) * 100));

        const fatigueMax = system.fatigue?.max || 1;
        context.fatiguePercent = Math.min(100, Math.round(((system.fatigue?.value ?? 0) / fatigueMax) * 100));

        // Calculate reaction targets
        const skills = (this.actor as any).skills ?? {};
        const chars = (this.actor as any).characteristics ?? {};

        // Dodge target: Ag + Dodge training
        const dodgeSkill = skills.dodge ?? ({} as any);
        let dodgeBase = chars.agility?.total ?? 30;
        if (dodgeSkill.plus20) dodgeBase += 20;
        else if (dodgeSkill.plus10) dodgeBase += 10;
        else if (!dodgeSkill.trained && !dodgeSkill.basic) dodgeBase = Math.floor(dodgeBase / 2);
        context.dodgeTarget = dodgeBase;

        // Parry target: WS + Parry training
        const parrySkill = skills.parry ?? ({} as any);
        let parryBase = chars.weaponSkill?.total ?? 30;
        if (parrySkill.plus20) parryBase += 20;
        else if (parrySkill.plus10) parryBase += 10;
        else if (!parrySkill.trained && !parrySkill.basic) parryBase = Math.floor(parryBase / 2);
        context.parryTarget = parryBase;

        // Critical injuries
        context.criticalInjuries = categorized.criticalInjury;

        // Force field (first active/equipped one)
        const forceFields = categorized.forceField;
        context.forceField = forceFields.find((ff) => ff.system?.equipped || ff.system?.activated) || forceFields[0];
        context.hasForceField = !!context.forceField;

        // Weapon slots - categorize by class and equipped status
        const equippedWeapons = weapons.filter((w) => w.system?.equipped);
        context.equippedWeapons = equippedWeapons;
        const rangedWeapons = equippedWeapons.filter((w) => w.system?.class !== 'Melee');
        const meleeWeapons = equippedWeapons.filter((w) => w.system?.class === 'Melee');

        // Primary weapon
        context.primaryWeapon = rangedWeapons[0] || meleeWeapons[0] || weapons.find((w) => w.system?.equipped);

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
        context.sidearm = weapons.find((w) => w.system?.class === 'Pistol' && w !== context.primaryWeapon && w !== context.secondaryWeapon);

        // Grenades: Thrown class weapons
        context.grenades = weapons.filter((w) => w.system?.class === 'Thrown' || w.system?.type === 'grenade');

        // Other weapons (not in slots)
        const slotWeapons = [context.primaryWeapon, context.secondaryWeapon, context.sidearm, ...context.grenades].filter(Boolean);
        context.otherWeapons = weapons.filter((w) => !slotWeapons.includes(w));

        // Add ammo percentage to weapons
        [context.primaryWeapon, context.secondaryWeapon, context.sidearm].filter(Boolean).forEach((w) => {
            if (w.system?.clip?.max) {
                w.ammoPercent = Math.round((w.system.clip.value / w.system.clip.max) * 100);
            }
        });

        // Prepare active effects data
        context.effects = this.actor.effects.map((effect: any) => ({
            id: effect.id,
            label: effect.label || effect.name,
            icon: effect.icon,
            disabled: effect.disabled,
            sourceName: effect.sourceName,
            changes: effect.changes || [],
            document: effect,
        }));

        // Change mode lookup for display
        context.changeModeLookup = {
            0: 'Custom',
            1: 'Multiply',
            2: 'Add',
            3: 'Downgrade',
            4: 'Upgrade',
            5: 'Override',
        };

        // Extract combat talents for display in combat actions panel
        const talents = this.actor.items.filter((i) => (i.type as string) === 'talent');
        context.combatTalents = talents
            .filter((t) => (t.system as any)?.category === 'combat')
            .map((t) => ({
                id: t.id,
                name: t.name,
                img: t.img,
                system: {
                    tier: (t.system as any).tier,
                    category: (t.system as any).category,
                },
            }));

        // Partition attack actions into melee, ranged, and general (both)
        const attacks = context.dh?.combatActions?.attacks || [];
        context.meleeAttacks = attacks.filter((a) => a.subtypes?.includes('Melee'));
        context.rangedAttacks = attacks.filter((a) => a.subtypes?.includes('Ranged'));
        context.generalAttacks = attacks.filter((a) => a.subtypes?.includes('Melee or Ranged'));
    }

    /* -------------------------------------------- */

    /**
     * Prepare WH40K RPG specific fields.
     * @param {object} rogueTraderData  The rogueTrader data object.
     * @returns {object}
     * @protected
     */
    _prepareWH40KFields(rogueTraderData: Record<string, unknown>): Record<string, unknown> {
        const prepared = rogueTraderData ?? {};
        prepared.armour = prepared.armour ?? {
            head: 0,
            rightArm: 0,
            leftArm: 0,
            body: 0,
            rightLeg: 0,
            leftLeg: 0,
        };
        prepared.weight = prepared.weight ?? { total: 0, current: 0 };

        const acquisitions = Array.isArray(prepared.acquisitions)
            ? prepared.acquisitions
            : prepared.acquisitions
            ? [{ name: '', availability: '', modifier: 0, notes: prepared.acquisitions, acquired: false }]
            : [];
        prepared.acquisitions = acquisitions;

        prepared.wounds = {
            total: this.actor.wounds?.max ?? 0,
            current: this.actor.wounds?.value ?? 0,
            critical: this.actor.wounds?.critical ?? 0,
            fatigue: this.actor.fatigue?.value ?? 0,
        };
        prepared.fate = {
            total: this.actor.fate?.max ?? 0,
            current: this.actor.fate?.value ?? 0,
        };

        return prepared;
    }

    /* -------------------------------------------- */

    /**
     * Prepare dynasty tab data including wealth tiers and gauge positioning.
     * @returns {object} Dynasty display data
     * @protected
     */
    _prepareDynastyData(): Record<string, unknown> {
        const pf = this.actor.system?.rogueTrader?.profitFactor ?? {};
        const currentPF = pf.current ?? 0;
        const startingPF = pf.starting ?? 0;
        const modifier = pf.modifier ?? 0;
        const effectivePF = currentPF + modifier;

        // Determine wealth tier (WH40K RPG wealth categories)
        let wealthTier;
        if (effectivePF >= 100) {
            wealthTier = { key: 'legendary', label: 'Legendary Wealth', min: 100 };
        } else if (effectivePF >= 75) {
            wealthTier = { key: 'mighty', label: 'Mighty Empire', min: 75 };
        } else if (effectivePF >= 50) {
            wealthTier = { key: 'notable', label: 'Notable Dynasty', min: 50 };
        } else if (effectivePF >= 25) {
            wealthTier = { key: 'modest', label: 'Modest Wealth', min: 25 };
        } else {
            wealthTier = { key: 'poor', label: 'Poor Resources', min: 0 };
        }

        // Calculate percentage for gauge (cap at 100 for display, but allow >100 PF)
        const pfPercentage = Math.min(Math.max((effectivePF / 100) * 100, 0), 100);

        return {
            currentPF,
            startingPF,
            modifier,
            effectivePF,
            wealthTier,
            pfPercentage,
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
    _prepareOverviewContext(context: Record<string, any>, options: Record<string, any>): Record<string, any> {
        // Add Active Effects data
        context.effects = this.actor.effects.map((effect) => ({
            id: effect.id,
            name: effect.name,
            icon: effect.icon,
            document: effect,
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
    async _prepareOverviewDashboardContext(context: Record<string, any>, options: Record<string, any>): Promise<Record<string, any>> {
        const ctx = context;
        // First prepare standard tab context
        await this._prepareTabPartContext('overview', ctx, options);

        // Add Active Effects data for dashboard preview
        const effects = this.actor.effects.map((effect) => ({
            id: effect.id,
            name: effect.name,
            icon: effect.icon,
            disabled: effect.disabled,
            document: effect,
        }));
        ctx.effects = effects;

        // Ensure combat data is available (for primaryWeapon, dodgeTarget, parryTarget)
        // This is already prepared in _prepareContext via _prepareCombatData

        // Ensure characteristics data is available in the format expected by dashboard
        // This is already prepared in _prepareContext

        // Prepare favorite skills for dashboard
        const favoriteSkills = this._prepareFavoriteSkills();
        ctx.favoriteSkills = favoriteSkills;

        // Add favorite talents for display
        const favoriteTalents = this._prepareFavoriteTalents();
        ctx.favoriteTalents = favoriteTalents;

        return ctx;
    }

    /* -------------------------------------------- */

    /**
     * Prepare favorite skills for overview dashboard display.
     * @returns {Array<object>} Array of favorite skill display objects
     * @protected
     */
    _prepareFavoriteSkills(): Record<string, unknown>[] {
        const favorites = ((this.actor as any).getFlag('wh40k-rpg', 'favoriteSkills') as string[]) || [];
        const skills = (this.actor as any).skills ?? {};
        const characteristics = (this.actor as any).characteristics ?? {};

        // Map favorite skill keys to full skill objects
        return favorites
            .map((key) => {
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
                        breakdown: this._getSkillBreakdown(skill, char),
                    }),
                };
            })
            .filter((skill) => skill !== null); // Remove any invalid skills
    }

    /**
     * Generate skill breakdown string for tooltips.
     * @param {object} skill  Skill data
     * @param {object} char   Characteristic data
     * @returns {string}     Formatted breakdown string
     * @private
     */
    _getSkillBreakdown(skill: any, char: any): string {
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
    _prepareFavoriteTalents(): Record<string, unknown>[] {
        const favorites = ((this.actor as any).getFlag('wh40k-rpg', 'favoriteTalents') as string[]) || [];
        const talents = this.actor.items.filter((i) => (i.type as string) === 'talent');

        // Map favorite talent IDs to full talent objects
        return favorites
            .map((id: string) => {
                const talent = talents.find((t) => t.id === id);
                if (!talent) return null;

                const sys = talent.system as any;
                return {
                    id: talent.id,
                    name: talent.name,
                    img: talent.img,
                    fullName: sys.fullName || talent.name,
                    specialization: sys.specialization || '',
                    system: {
                        tier: sys.tier || 0,
                        category: sys.category || '',
                    },
                };
            })
            .filter((talent) => talent !== null); // Remove any invalid talents
    }

    /* -------------------------------------------- */

    /**
     * Prepare combat tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    _prepareCombatTabContext(context: Record<string, any>, options: Record<string, any>): Record<string, any> {
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
    _prepareEquipmentContext(context: Record<string, any>, options: Record<string, any>): Record<string, any> {
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
    _prepareAbilitiesContext(context: Record<string, any>, options: Record<string, any>): Record<string, any> {
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
    _prepareNotesContext(context: Record<string, any>, options: Record<string, any>): Record<string, any> {
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
    _prepareEffectsContext(context: Record<string, any>, options: Record<string, any>): Record<string, any> {
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare powers tab context.
     * Prepares psychic powers, navigator powers, rituals, and orders.
     * @returns {object} Powers context data
     * @protected
     */
    _preparePowersContext(): Record<string, unknown> {
        // Get all power items
        const psychicPowers = this.actor.items.filter((i) => (i.type as string) === 'psychicPower');
        const navigatorPowers = this.actor.items.filter((i) => (i.type as string) === 'navigatorPower');
        const rituals = this.actor.items.filter((i) => (i.type as string) === 'ritual');
        const orders = this.actor.items.filter((i) => (i.type as string) === 'order');

        // Extract unique disciplines for filtering
        const disciplines = new Map();
        for (const power of psychicPowers) {
            const disc = (power.system as any).discipline;
            if (disc && !disciplines.has(disc)) {
                disciplines.set(disc, {
                    id: disc,
                    label: (power.system as any).disciplineLabel || disc.charAt(0).toUpperCase() + disc.slice(1),
                });
            }
        }
        const psychicDisciplines = Array.from(disciplines.values());

        // Extract unique order categories
        const categories = new Map();
        for (const order of orders) {
            const cat = (order.system as any).category;
            if (cat && !categories.has(cat)) {
                categories.set(cat, {
                    id: cat,
                    label: (order.system as any).categoryLabel || cat.charAt(0).toUpperCase() + cat.slice(1),
                });
            }
        }
        const orderCategories = Array.from(categories.values());

        // Get filter state
        const activeDiscipline = this._powersFilter?.discipline || '';
        const activeOrderCategory = this._powersFilter?.orderCategory || '';

        // Apply discipline filter to psychic powers
        let filteredPsychicPowers = psychicPowers;
        if (activeDiscipline) {
            filteredPsychicPowers = psychicPowers.filter((p) => (p.system as any).discipline === activeDiscipline);
        }

        // Apply category filter to orders
        let filteredOrders = orders;
        if (activeOrderCategory) {
            filteredOrders = orders.filter((o) => (o.system as any).category === activeOrderCategory);
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
            activeOrderCategory,
        };
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Combat Actions             */
    /* -------------------------------------------- */

    /**
     * Handle weapon attack action.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #attack(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            await DHTargetedActionManager.performWeaponAttack((this as any).actor);
        } catch (error) {
            (this as any)._notify('error', `Attack failed: ${error.message}`, {
                duration: 5000,
            });
            console.error('Attack error:', error);
        }
    }

    /**
     * Handle dodge action.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #dodge(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            await (this as any).actor.rollSkill?.('dodge');
        } catch (error) {
            (this as any)._notify('error', `Dodge roll failed: ${error.message}`, {
                duration: 5000,
            });
            console.error('Dodge error:', error);
        }
    }

    /**
     * Handle parry action.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #parry(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            await (this as any).actor.rollSkill?.('parry');
        } catch (error) {
            (this as any)._notify('error', `Parry roll failed: ${error.message}`, {
                duration: 5000,
            });
            console.error('Parry error:', error);
        }
    }

    /**
     * Handle assign damage action.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #assignDamage(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const hitData = new Hit();
            const assignData = new AssignDamageData((this as any).actor, hitData);
            await prepareAssignDamageRoll(assignData);
        } catch (error) {
            (this as any)._notify('error', `Assign damage failed: ${error.message}`, {
                duration: 5000,
            });
            console.error('Assign damage error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle initiative roll.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollInitiative(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const agBonus = (this as any).actor.characteristics?.agility?.bonus ?? 0;
            const roll = await new Roll('1d10 + @ab', { ab: agBonus }).evaluate();

            const content = `
                <div class="wh40k-hit-location-result">
                    <h3><i class="fas fa-bolt"></i> Initiative Roll</h3>
                    <div class="wh40k-hit-roll">
                        <span class="wh40k-roll-result">${roll.total}</span>
                    </div>
                    <div class="wh40k-hit-location">
                        <span class="wh40k-location-armour">1d10 + Agility Bonus (${agBonus})</span>
                    </div>
                </div>
            `;

            await (ChatMessage as any).create({
                speaker: ChatMessage.getSpeaker({ actor: (this as any).actor }),
                content,
                rolls: [roll],
                flags: {
                    'wh40k-rpg': {
                        type: 'initiative',
                    },
                },
            } as any);
        } catch (error) {
            (this as any)._notify('error', `Initiative roll failed: ${error.message}`, {
                duration: 5000,
            });
            console.error('Initiative roll error:', error);
        }
    }

    /**
     * Handle toggling a combat action as favorite.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleFavoriteAction(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation(); // Prevent parent action from triggering
        const actionKey = target.dataset.actionKey;
        if (!actionKey) return;

        const currentFavorites = (this as any).actor.system.favoriteCombatActions || [];
        const newFavorites = currentFavorites.includes(actionKey) ? currentFavorites.filter((k) => k !== actionKey) : [...currentFavorites, actionKey];

        await (this as any).actor.update({ 'system.favoriteCombatActions': newFavorites });
    }

    /**
     * Handle generic combat action from favorites.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #combatAction(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const actionKey = target.dataset.combatAction;
        if (!actionKey) return;

        // Route to specific handler based on action key
        switch (actionKey) {
            case 'dodge':
                await (CharacterSheet as any).#dodge.call(this, event, target);
                break;
            case 'parry':
                await (CharacterSheet as any).#parry.call(this, event, target);
                break;
            case 'assignDamage':
                await (CharacterSheet as any).#assignDamage.call(this, event, target);
                break;
            case 'initiative':
                await (CharacterSheet as any).#rollInitiative.call(this, event, target);
                break;
            default:
                (this as any)._notify('warning', `Unknown combat action: ${actionKey}`, {
                    duration: 3000,
                });
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle vocalizing combat actions to chat.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizeCombatAction(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const actionKey = target.dataset.actionKey;
        if (!actionKey) return;

        // Find the action definition in config
        const allActions = [
            ...((CONFIG as any).wh40k?.combatActions?.attacks || []),
            ...((CONFIG as any).wh40k?.combatActions?.movement || []),
            ...((CONFIG as any).wh40k?.combatActions?.utility || []),
        ];

        const actionConfig = allActions.find((a) => a.key === actionKey);
        if (!actionConfig) {
            (this as any)._notify('warning', `Unknown combat action: ${actionKey}`, { duration: 3000 });
            return;
        }

        // Prepare chat data
        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: (this as any).actor }),
            content: await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/combat-action-card.hbs', {
                name: game.i18n.localize(actionConfig.label),
                actor: (this as any).actor.name,
                actionType: actionConfig.type,
                description: game.i18n.localize(actionConfig.description),
                subtypes: actionConfig.subtypes?.join(', ') || '',
                icon: actionConfig.icon,
            }),
        };

        // Create chat message
        await (ChatMessage as any).create(chatData);
    }

    /**
     * Handle vocalizing movement to chat.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizeMovement(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const movementType = target.dataset.movementType;
        if (!movementType) return;

        const movementData = {
            half: { label: 'Half Move', icon: 'fa-walking', description: 'Move and take other actions' },
            full: { label: 'Full Move', icon: 'fa-shoe-prints', description: 'Move with no other actions' },
            charge: { label: 'Charge', icon: 'fa-running', description: 'Move and attack with +20 bonus' },
            run: { label: 'Run', icon: 'fa-wind', description: 'Run at full speed (Agility test may be required)' },
        };

        const movement = movementData[movementType];
        if (!movement) return;

        const distance = (this as any).actor.system.movement[movementType];

        // Prepare chat data
        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: (this as any).actor }),
            content: await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/movement-card.hbs', {
                actor: (this as any).actor.name,
                movementType: movementType,
                movementLabel: movement.label,
                distance: distance,
                icon: movement.icon,
                description: movement.description,
            }),
        };

        // Create chat message
        await (ChatMessage as any).create(chatData);
    }

    /**
     * Set the active movement mode on the actor's token.
     * Updates the token's movement action flag for ruler integration.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setMovementMode(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const movementType = target.dataset.movementType;
        if (!movementType) return;

        // Find the actor's active token on the canvas
        const token = (this as any).actor.getActiveTokens()?.[0]?.document;
        if (!token) {
            (ui.notifications as any).info(`${game.i18n.localize('WH40K.MOVEMENT.Label')}: No active token on canvas.`);
            return;
        }

        // Store movement action on token flags
        await token.update({ 'flags.wh40k-rpg.movementAction': movementType });

        const config = CONFIG.wh40k.movementTypes[movementType];
        const label = config ? game.i18n.localize(config.label) : movementType;
        const speed = (this as any).actor.system.movement[movementType];
        (ui.notifications as any).info(`${label}: ${speed}m set as active movement mode.`);
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Stat Adjustments           */
    /* -------------------------------------------- */

    /**
     * Handle stat adjustment button clicks.
     * Throttled to prevent spam clicks.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #adjustStat(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const field = target.dataset.field;
        const throttleKey = `adjustStat-${field}-${(this as any).actor.id}`;
        return await (this as any)._throttle(throttleKey, 200, this.#adjustStatImpl, this, [event, target]);
    }

    /**
     * Implementation of stat adjustment (used by throttled wrapper).
     * @private
     */
    async #adjustStatImpl(event: Event, target: HTMLElement): Promise<void> {
        const field = target.dataset.field;
        const action = target.dataset.statAction;

        // Handle special actions
        if (action === 'clear-fatigue') {
            await this._updateSystemField('system.fatigue.value', 0);
            return;
        }

        // Get current value
        const currentValue = (foundry.utils.getProperty(this.actor, field) as number) || 0;

        // Smart min/max derivation: if field ends with .value, check for .max/.min siblings
        const min = target.dataset.min !== undefined ? parseInt(target.dataset.min) : null;
        let max: number | null = target.dataset.max !== undefined ? parseInt(target.dataset.max) : null;

        // Auto-derive max from field structure (e.g., system.wounds.value -> system.wounds.max)
        if (max === null && field.endsWith('.value')) {
            const basePath = field.substring(0, field.lastIndexOf('.value'));
            const maxPath = `${basePath}.max`;
            const derivedMax = foundry.utils.getProperty(this.actor, maxPath) as number | undefined;
            if (derivedMax !== undefined && derivedMax !== null) {
                max = derivedMax;
            }
        }

        let newValue = currentValue;

        if (action === 'increment') {
            newValue = currentValue + 1;
            if (max !== null && newValue > max) newValue = max;
        } else if (action === 'decrement') {
            newValue = currentValue - 1;
            if (min !== null && newValue < min) newValue = min;
        }

        if (newValue !== currentValue) {
            await this._updateSystemField(field, newValue);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle increment action (convenience wrapper for adjustStat).
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #increment(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation(); // Prevent header toggle
        target.dataset.statAction = 'increment';
        return CharacterSheet.#adjustStat.call(this, event, target);
    }

    /**
     * Handle decrement action (convenience wrapper for adjustStat).
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #decrement(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation(); // Prevent header toggle
        target.dataset.statAction = 'decrement';
        return CharacterSheet.#adjustStat.call(this, event, target);
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on a critical damage pip.
     * Throttled to prevent spam clicks.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setCriticalPip(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation(); // Prevent panel toggle
        const throttleKey = `setCriticalPip-${(this as any).actor.id}`;
        return await (this as any)._throttle(throttleKey, 200, this.#setCriticalPipImpl, this, [event, target]);
    }

    /**
     * Implementation of critical pip setting (used by throttled wrapper).
     * @private
     */
    async #setCriticalPipImpl(event: Event, target: HTMLElement): Promise<void> {
        const level = parseInt(target.dataset.critLevel);
        const currentCrit = this.actor.system.wounds?.critical || 0;
        const newValue = level === currentCrit ? level - 1 : level;
        const clampedValue = Math.min(Math.max(newValue, 0), 10);
        await this._updateSystemField('system.wounds.critical', clampedValue);
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on a fate star pip.
     * Throttled to prevent spam clicks.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setFateStar(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation(); // Prevent panel toggle
        const throttleKey = `setFateStar-${(this as any).actor.id}`;
        return await (this as any)._throttle(throttleKey, 200, this.#setFateStarImpl, this, [event, target]);
    }

    /**
     * Implementation of fate star setting (used by throttled wrapper).
     * @private
     */
    async #setFateStarImpl(event: Event, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset.fateIndex);
        const currentFate = this.actor.system.fate?.value || 0;
        const newValue = index === currentFate ? index - 1 : index;
        const maxFate = this.actor.system.fate?.max || 0;
        const clampedValue = Math.min(Math.max(newValue, 0), maxFate);
        await this._updateSystemField('system.fate.value', clampedValue);
    }

    /* -------------------------------------------- */

    /**
     * Handle quick-set fatigue bolt.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setFatigueBolt(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation(); // Prevent panel toggle
        const throttleKey = `setFatigueBolt-${(this as any).actor.id}`;
        return await (this as any)._throttle(throttleKey, 200, this.#setFatigueBoltImpl, this, [event, target]);
    }

    /**
     * Implementation of fatigue bolt setting (used by throttled wrapper).
     * @private
     */
    async #setFatigueBoltImpl(event: Event, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset.fatigueIndex);
        const currentFatigue = this.actor.system.fatigue?.value || 0;
        const newValue = index === currentFatigue ? index - 1 : index;
        const maxFatigue = this.actor.system.fatigue?.max || 0;
        const clampedValue = Math.min(Math.max(newValue, 0), maxFatigue);
        await this._updateSystemField('system.fatigue.value', clampedValue);
    }

    /* -------------------------------------------- */

    /**
     * Handle quick-set corruption.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setCorruption(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation(); // Prevent panel toggle
        const throttleKey = `setCorruption-${(this as any).actor.id}`;
        return await (this as any)._throttle(throttleKey, 200, this.#setCorruptionImpl, this, [event, target]);
    }

    /**
     * Implementation of corruption setting (used by throttled wrapper).
     * @private
     */
    async #setCorruptionImpl(event: Event, target: HTMLElement): Promise<void> {
        const targetValue = parseInt(target.dataset.value);
        if (isNaN(targetValue) || targetValue < 0 || targetValue > 100) {
            this._notify('error', 'Invalid corruption value', {
                duration: 3000,
            });
            return;
        }
        await this._updateSystemField('system.corruption', targetValue);
    }

    /* -------------------------------------------- */

    /**
     * Handle quick-set insanity.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setInsanity(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation(); // Prevent panel toggle
        const throttleKey = `setInsanity-${(this as any).actor.id}`;
        return await (this as any)._throttle(throttleKey, 200, this.#setInsanityImpl, this, [event, target]);
    }

    /**
     * Implementation of insanity setting (used by throttled wrapper).
     * @private
     */
    async #setInsanityImpl(event: Event, target: HTMLElement): Promise<void> {
        const targetValue = parseInt(target.dataset.value);
        if (isNaN(targetValue) || targetValue < 0 || targetValue > 100) {
            this._notify('error', 'Invalid insanity value', {
                duration: 3000,
            });
            return;
        }
        await this._updateSystemField('system.insanity', targetValue);
    }

    /* -------------------------------------------- */

    /**
     * Handle restoring all fate points.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #restoreFate(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation(); // Prevent panel toggle
        const throttleKey = `restoreFate-${(this as any).actor.id}`;
        return await (this as any)._throttle(throttleKey, 500, this.#restoreFateImpl, this, [event, target]);
    }

    /**
     * Implementation of fate restoration (used by throttled wrapper).
     * @private
     */
    async #restoreFateImpl(event: Event, target: HTMLElement): Promise<void> {
        const maxFate = this.actor.system.fate?.max || 0;
        await this._updateSystemField('system.fate.value', maxFate);
        this._notify('info', `Restored all fate points to ${maxFate}`, {
            duration: 3000,
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle fate spending actions.
     * Throttled to prevent accidental double-spending.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #spendFate(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation(); // Prevent panel toggle
        const action = target.dataset.fateAction;
        const throttleKey = `spendFate-${action}-${(this as any).actor.id}`;
        return await (this as any)._throttle(throttleKey, 500, this.#spendFateImpl, this, [event, target]);
    }

    /**
     * Implementation of fate spending (used by throttled wrapper).
     * @private
     */
    async #spendFateImpl(event: Event, target: HTMLElement): Promise<void> {
        const action = target.dataset.fateAction;
        const currentFate = this.actor.system.fate?.value || 0;

        if (currentFate <= 0) {
            this._notify('warning', 'No fate points available to spend!', {
                duration: 3000,
            });
            return;
        }

        let message = '';
        switch (action) {
            case 'reroll':
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to <strong>re-roll</strong> a test!`;
                break;
            case 'bonus':
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to gain <strong>+10 bonus</strong> to a test!`;
                break;
            case 'dos':
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to add <strong>+1 Degree of Success</strong>!`;
                break;
            case 'heal':
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to <strong>heal damage</strong>!`;
                break;
            case 'avoid':
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to <strong>avoid death</strong>!`;
                break;
            case 'burn': {
                const confirmBurn = await ConfirmationDialog.confirm({
                    title: 'Burn Fate Point?',
                    content: 'Are you sure you want to <strong>permanently burn</strong> a Fate Point?',
                    confirmLabel: 'Burn',
                    cancelLabel: 'Cancel',
                });
                if (!confirmBurn) return;
                message = `<strong>${this.actor.name}</strong> <strong style="color: #b63a2b;">BURNS</strong> a Fate Point!`;
                await (this.actor as any).update({
                    'system.fate.max': Math.max(0, (this.actor.system.fate?.max || 0) - 1),
                });
                break;
            }
            default:
                return;
        }

        await this._updateSystemField('system.fate.value', currentFate - 1);

        await (ChatMessage as any).create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div class="wh40k-fate-spend-message">
                    <div style="display: flex; align-items: center; gap: 8px; padding: 12px; background: rgba(196, 135, 29, 0.1); border-left: 3px solid #c4871d; border-radius: 4px;">
                        <i class="fas fa-star" style="font-size: 1.5rem; color: #c4871d;"></i>
                        <div>${message}</div>
                    </div>
                </div>
            `,
        });
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Equipment Actions          */
    /* -------------------------------------------- */

    /**
     * Handle toggling item equipped state.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleEquip(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const itemId = (target.closest('[data-item-id]') as HTMLElement | null)?.dataset.itemId;
        const item = (this as any).actor.items.get(itemId);
        if (!item) return;
        await item.update({ 'system.equipped': !item.system.equipped });
    }

    /* -------------------------------------------- */

    /**
     * Handle stowing an item.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #stowItem(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const itemId = (target.closest('[data-item-id]') as HTMLElement | null)?.dataset.itemId;
        const item = (this as any).actor.items.get(itemId);
        if (!item) return;
        await item.update({
            'system.equipped': false,
            'system.inBackpack': true,
            'system.inShipStorage': false,
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle unstowing an item.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #unstowItem(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const itemId = (target.closest('[data-item-id]') as HTMLElement | null)?.dataset.itemId;
        const item = (this as any).actor.items.get(itemId);
        if (!item) return;
        await item.update({ 'system.inBackpack': false });
    }

    /* -------------------------------------------- */

    /**
     * Handle stowing an item in ship storage.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #stowToShip(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const itemId = (target.closest('[data-item-id]') as HTMLElement | null)?.dataset.itemId;
        const item = (this as any).actor.items.get(itemId);
        if (!item) return;
        await item.update({
            'system.equipped': false,
            'system.inBackpack': false,
            'system.inShipStorage': true,
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle unstowing an item from ship storage.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #unstowFromShip(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const itemId = (target.closest('[data-item-id]') as HTMLElement | null)?.dataset.itemId;
        const item = (this as any).actor.items.get(itemId);
        if (!item) return;
        await item.update({ 'system.inShipStorage': false });
    }

    /* -------------------------------------------- */

    /**
     * Swap all checked items between backpack and ship storage.
     * Items checked in the backpack column move to ship; items checked in ship move to backpack.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #swapCheckedItems(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const panel = target.closest('.wh40k-panel-backpack-split') || this.element.querySelector('.wh40k-panel-backpack-split');
        if (!panel) return;

        // Gather checked items from backpack (left) column
        const backpackChecks = panel.querySelectorAll('.wh40k-backpack-inventory .wh40k-transfer-check:checked');
        // Gather checked items from ship (right) column
        const shipChecks = panel.querySelectorAll('.wh40k-ship-storage .wh40k-transfer-check:checked');

        if (!backpackChecks.length && !shipChecks.length) {
            (ui.notifications as any).warn('No items selected to transfer.');
            return;
        }

        const transferStates = new Map<string, { inShipStorage: boolean; inBackpack: boolean; equipped: boolean }>();

        // Backpack → Ship
        backpackChecks.forEach((cb: Element) => {
            const itemId = (cb as HTMLElement).dataset.itemId;
            if (itemId) {
                transferStates.set(itemId, {
                    inShipStorage: true,
                    inBackpack: false,
                    equipped: false,
                });
            }
        });

        // Ship → Backpack
        shipChecks.forEach((cb: Element) => {
            const itemId = (cb as HTMLElement).dataset.itemId;
            if (itemId) {
                transferStates.set(itemId, {
                    inShipStorage: false,
                    inBackpack: false,
                    equipped: false,
                });
            }
        });

        if (!transferStates.size) return;

        const updates = Array.from(transferStates.entries())
            .map(([itemId, nextState]) => {
                const item = (this as any).actor.items.get(itemId);
                if (!item) return null;

                const nextSystem = foundry.utils.deepClone(item.system ?? {});
                nextSystem.inShipStorage = nextState.inShipStorage;
                nextSystem.inBackpack = nextState.inBackpack;
                nextSystem.equipped = nextState.equipped;

                const forcedReplacement = new foundry.data.operators.ForcedReplacement();
                foundry.data.operators.DataFieldOperator.set(forcedReplacement, nextSystem);

                return {
                    _id: itemId,
                    system: forcedReplacement as any,
                };
            })
            .filter(Boolean);

        if (!updates.length) return;

        await (this as any).actor.updateEmbeddedDocuments('Item', updates as any[], {
            diff: false,
            recursive: false,
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling force field activation.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleActivate(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const itemId = (target.closest('[data-item-id]') as HTMLElement | null)?.dataset.itemId;
        const item = (this as any).actor.items.get(itemId);
        if (!item) return;
        await item.update({ 'system.activated': !item.system.activated });
    }

    /* -------------------------------------------- */

    /**
     * Handle bulk equipment operations.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #bulkEquip(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const action = target.dataset.bulkAction;
            const items = (this as any).actor.items;
            let count = 0;

            switch (action) {
                case 'equip-armour': {
                    const armourItems = items.filter((i) => i.type === 'armour' || i.isArmour);
                    for (const item of armourItems) {
                        if (!item.system.equipped) {
                            await item.update({ 'system.equipped': true });
                            count++;
                        }
                    }
                    (this as any)._notify('info', `Equipped ${count} armour piece${count !== 1 ? 's' : ''}`, {
                        duration: 3000,
                    });
                    break;
                }

                case 'unequip-all': {
                    const equippedItems = items.filter((i) => i.system?.equipped === true);
                    for (const item of equippedItems) {
                        await item.update({ 'system.equipped': false });
                        count++;
                    }
                    (this as any)._notify('info', `Unequipped ${count} item${count !== 1 ? 's' : ''}`, {
                        duration: 3000,
                    });
                    break;
                }

                case 'stow-gear': {
                    const gearItems = items.filter((i) => (i.type === 'gear' || i.isGear) && !i.system.inBackpack);
                    for (const item of gearItems) {
                        await item.update({
                            'system.inBackpack': true,
                            'system.equipped': false,
                        });
                        count++;
                    }
                    (this as any)._notify('info', `Stowed ${count} gear item${count !== 1 ? 's' : ''} in backpack`, {
                        duration: 3000,
                    });
                    break;
                }

                default:
                    (this as any)._notify('warning', `Unknown bulk action: ${action}`, {
                        duration: 3000,
                    });
            }
        } catch (error) {
            (this as any)._notify('error', `Bulk operation failed: ${error.message}`, {
                duration: 5000,
            });
            console.error('Bulk equipment error:', error);
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Acquisitions               */
    /* -------------------------------------------- */

    /**
     * Handle adding an acquisition.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #addAcquisition(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const acquisitions = (this as any).actor.system?.rogueTrader?.acquisitions;
        const acquisitionList = Array.isArray(acquisitions) ? acquisitions : [];
        const updatedAcquisitions = structuredClone(acquisitionList);
        updatedAcquisitions.push({ name: '', availability: '', modifier: 0, notes: '', acquired: false });
        await (this as any).actor.update({ 'system.rogueTrader.acquisitions': updatedAcquisitions });
    }

    /* -------------------------------------------- */

    /**
     * Handle removing an acquisition.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #removeAcquisition(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset.index ?? '-1');
        if (isNaN(index) || index < 0) return;

        const acquisitions = (this as any).actor.system?.rogueTrader?.acquisitions;
        if (!Array.isArray(acquisitions)) {
            await (this as any).actor.update({ 'system.rogueTrader.acquisitions': [] });
            return;
        }

        const updatedAcquisitions = structuredClone(acquisitions);
        updatedAcquisitions.splice(index, 1);
        await (this as any).actor.update({ 'system.rogueTrader.acquisitions': updatedAcquisitions });
    }

    /* -------------------------------------------- */

    /**
     * Open the Acquisition Dialog for rolling acquisition tests.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #openAcquisitionDialog(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        await AcquisitionDialog.show((this as any).actor);
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Experience                 */
    /* -------------------------------------------- */

    /**
     * Handle custom XP addition/subtraction.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #customXP(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const { openAddXPDialog } = await import('../prompts/add-xp-dialog.ts');
        await openAddXPDialog((this as any).actor);
    }

    /* -------------------------------------------- */

    /**
     * Open the advancement dialog for spending XP.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #openAdvancement(this: CharacterSheet, event: Event, target: HTMLElement): void {
        event.preventDefault();
        // Default to rogueTrader career for now
        // TODO: Get career from actor.system.originPath.career or rogueTrader.careerPath
        const careerKey = (this as any).actor.originPath.career;
        AdvancementDialog.open((this as any).actor, { careerKey });
    }

    /* -------------------------------------------- */

    /**
     * Handle bonus vocalize.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #bonusVocalize(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const bonusName = target.dataset.bonusName;
            const bonus = (this as any).actor.backgroundEffects?.abilities?.find((a) => a.name === bonusName);
            if (bonus) {
                await DHBasicActionManager.sendItemVocalizeChat({
                    actor: (this as any).actor.name,
                    name: bonus.name,
                    type: bonus.source,
                    description: bonus.benefit,
                });
            } else {
                (this as any)._notify('warning', `Bonus "${bonusName}" not found`, {
                    duration: 3000,
                });
            }
        } catch (error) {
            (this as any)._notify('error', `Failed to vocalize bonus: ${error.message}`, {
                duration: 5000,
            });
            console.error('Bonus vocalize error:', error);
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Biography Actions          */
    /* -------------------------------------------- */

    /**
     * Open the Origin Path Builder dialog for this character.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #openOriginPathBuilder(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            if (game.wh40k?.openOriginPathBuilder) {
                const gameSystem = (this as any)._gameSystemId || (this as any).actor.system?.gameSystem || 'rt';
                await game.wh40k.openOriginPathBuilder((this as any).actor, { gameSystem });
            } else {
                (this as any)._notify('warning', 'Origin Path Builder not available', {
                    duration: 3000,
                });
                console.warn('game.wh40k.openOriginPathBuilder not found');
            }
        } catch (error) {
            (this as any)._notify('error', `Failed to open Origin Path Builder: ${error.message}`, {
                duration: 5000,
            });
            console.error('Origin Path Builder error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Toggle edit mode for inline characteristic editing.
     * @this {CharacterSheet}
     * @param {PointerEvent} event  The triggering event.
     * @param {HTMLElement} target  The action target.
     */
    static #toggleEditMode(this: CharacterSheet, event: Event, target: HTMLElement): void {
        if (!(this as any).isEditable) return;
        this.#editMode = !this.#editMode;
        (this as any).render();
    }

    /**
     * Open the characteristic setup dialog.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static async #openCharacteristicSetup(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        await CharacteristicSetupDialog.open((this as any).actor);
    }

    /**
     * Show the utility menu.
     * @param {Event} event     The originating click event
     * @param {HTMLElement} target  The capturing HTML element which defined a [data-action]
     */
    static #showUtilityMenu(this: CharacterSheet, event: Event, target: HTMLElement): void {
        event.preventDefault();
        event.stopPropagation();

        const options = (this as any)._getUtilityMenuOptions();
        if (options.length === 0) return;

        // Create a simple context menu programmatically
        const menu = document.createElement('div');
        menu.className = 'wh40k-context-menu wh40k-utility-menu';
        menu.style.position = 'fixed';
        menu.style.zIndex = '1000';

        // Position the menu
        const rect = target.getBoundingClientRect();
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.bottom + 5}px`;

        // Add menu items
        options.forEach((option) => {
            if (option.condition && !option.condition()) return;

            const item = document.createElement('div');
            item.className = 'context-menu-item';
            item.innerHTML = `${option.icon} ${option.name}`;
            item.addEventListener('click', () => {
                option.callback();
                menu.remove();
            });
            menu.appendChild(item);
        });

        // Add close listener
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };

        document.body.appendChild(menu);
        document.addEventListener('click', closeMenu);
    }

    /* -------------------------------------------- */
    /*  Context Menu Implementation                 */
    /* -------------------------------------------- */

    /** @override */
    _createCustomContextMenus(): any {
        super._createCustomContextMenus();

        // Note: Utility menu is now handled via action instead of context menu
    }

    /**
     * Get utility menu options.
     * @returns {ContextMenuEntry[]}
     * @protected
     */
    _getUtilityMenuOptions(): Record<string, unknown>[] {
        return [
            {
                name: game.i18n.localize('WH40K.Utility.SetupCharacteristics'),
                icon: '<i class="fa-solid fa-sliders"></i>',
                callback: () => CharacteristicSetupDialog.open(this.actor),
            },
        ];
    }

    /**
     * Open the Origin Path Builder utility.
     * @protected
     */
    async _openOriginPathBuilder(): Promise<void> {
        try {
            if (game.wh40k?.openOriginPathBuilder) {
                const gameSystem = (this as any)._gameSystemId || this.actor.system?.gameSystem || 'rt';
                await game.wh40k.openOriginPathBuilder(this.actor, { gameSystem });
            } else {
                (ui.notifications as any).warn(game.i18n.localize('WH40K.Utility.OriginPathNotAvailable'));
            }
        } catch (error) {
            (ui.notifications as any).error(`${game.i18n.localize('WH40K.Utility.OriginPathError')}: ${error.message}`);
            console.error('Origin Path Builder error:', error);
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Equipment Filtering        */
    /* -------------------------------------------- */

    /**
     * Handle equipment filtering (search and type/status filters).
     * @this {CharacterSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static #filterEquipment(this: CharacterSheet, event: Event, target: HTMLElement): void {
        const equipmentPanel = (this as any).element.querySelector('.wh40k-all-items-grid');
        if (!equipmentPanel) return;

        // Get filter values
        const searchInput = (this as any).element.querySelector('.wh40k-equipment-search');
        const typeFilter = (this as any).element.querySelector('.wh40k-equipment-type-filter');
        const statusFilter = (this as any).element.querySelector('.wh40k-equipment-status-filter');

        const searchTerm = searchInput?.value.toLowerCase() || '';
        const typeValue = typeFilter?.value || '';
        const statusValue = statusFilter?.value || '';

        // Store filter state for persistence
        (this as any)._equipmentFilter = {
            search: searchInput?.value || '',
            type: typeValue,
            status: statusValue,
        };

        // Get all item cards
        const itemCards = equipmentPanel.querySelectorAll('.wh40k-inventory-card');

        let visibleCount = 0;

        itemCards.forEach((card) => {
            const itemName = card.getAttribute('title')?.toLowerCase() || '';
            const itemType = card.getAttribute('data-item-type') || '';
            const isEquipped = card.querySelector('.wh40k-inv-equipped') !== null;

            // Check filters
            const matchesSearch = !searchTerm || itemName.includes(searchTerm);
            const matchesType = !typeValue || itemType === typeValue;
            const matchesStatus = !statusValue || (statusValue === 'equipped' && isEquipped) || (statusValue === 'unequipped' && !isEquipped);

            // Show/hide card
            if (matchesSearch && matchesType && matchesStatus) {
                card.style.display = '';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        // Toggle clear button visibility
        const clearBtn = (this as any).element.querySelector('.wh40k-search-clear');
        if (clearBtn) {
            clearBtn.style.display = searchTerm ? 'flex' : 'none';
        }

        // Show message if no results
        const existingMsg = equipmentPanel.querySelector('.wh40k-no-results');
        if (existingMsg) existingMsg.remove();

        if (visibleCount === 0 && itemCards.length > 0) {
            const noResults = document.createElement('div');
            noResults.className = 'wh40k-no-results';
            noResults.innerHTML = '<i class="fas fa-search"></i><span>No items match your filters</span>';
            equipmentPanel.appendChild(noResults);
        }
    }

    /**
     * Handle clearing equipment search.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #clearEquipmentSearch(this: CharacterSheet, event: Event, target: HTMLElement): void {
        const searchInput = (this as any).element.querySelector('.wh40k-equipment-search');
        if (searchInput) {
            searchInput.value = '';
            // Clear stored filter state
            (this as any)._equipmentFilter = { search: '', type: '', status: '' };
            // Trigger filter update
            (CharacterSheet as any).#filterEquipment.call(this, event, searchInput);
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Skills                     */
    /* -------------------------------------------- */

    /**
     * Handle filtering skills by search term, characteristic, and training level.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static async #filterSkills(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const input = event.currentTarget as HTMLInputElement;
        const name = input.name || 'search';
        const value = input.value || '';

        // Update filter state
        (this as any)._skillsFilter[name] = value;

        // Re-render skills tab only
        await (this as any).render({ parts: ['skills'] });
    }

    /* -------------------------------------------- */

    /**
     * Clear all skill filters.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static async #clearSkillsSearch(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        // Reset all filters
        (this as any)._skillsFilter = { search: '', characteristic: '', training: '' };

        // Re-render skills tab
        await (this as any).render({ parts: ['skills'] });
    }

    /**
     * Toggle favorite status for a skill.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static async #toggleFavoriteSkill(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const skillKey = target.dataset.skill;
        if (!skillKey) return;

        // Get current favorite skills
        const favorites = (this as any).actor.getFlag('wh40k-rpg', 'favoriteSkills') || [];
        const index = favorites.indexOf(skillKey);

        // Toggle
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(skillKey);
        }

        // Save
        await (this as any).actor.setFlag('wh40k-rpg', 'favoriteSkills', favorites);

        // Re-render skills tab and overview tab
        await (this as any).render({ parts: ['skills', 'overview'] });
    }

    /* -------------------------------------------- */

    /**
     * Cycle a skill's training level: untrained → trained → +10 → +20 → untrained.
     * Right-click cycles backwards.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #cycleSkillTraining(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const row = target.closest('[data-skill]') as HTMLElement | null;
        const skillKey = row?.dataset.skill;
        if (!skillKey) return;

        const skill = (this as any).actor.system.skills?.[skillKey];
        if (!skill) return;

        // Max level from training config (3 for RT, 4 for DH2e)
        const config = (this as any)._getSkillTrainingConfig();
        const maxLevel = config.length;

        // Determine current level
        let level = 0;
        if (skill.plus30) level = 4;
        else if (skill.plus20) level = 3;
        else if (skill.plus10) level = 2;
        else if (skill.trained) level = 1;

        // Cycle: shift-click goes backwards
        if ((event as any).shiftKey) {
            level = level <= 0 ? maxLevel : level - 1;
        } else {
            level = level >= maxLevel ? 0 : level + 1;
        }

        // Update flags
        const update = {
            [`system.skills.${skillKey}.trained`]: level >= 1,
            [`system.skills.${skillKey}.plus10`]: level >= 2,
            [`system.skills.${skillKey}.plus20`]: level >= 3,
            [`system.skills.${skillKey}.plus30`]: level >= 4,
        };
        await (this as any).actor.update(update);
    }

    /* -------------------------------------------- */

    /**
     * Cycle a specialist skill entry's training level.
     * Shift-click cycles backwards.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #cycleSpecialistTraining(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const row = target.closest('[data-skill]') as HTMLElement | null;
        const skillKey = row?.dataset.skill;
        const entryIndex = parseInt(row?.dataset.index ?? '', 10);
        if (!skillKey || isNaN(entryIndex)) return;

        const skill = (this as any).actor.system.skills?.[skillKey];
        if (!skill) return;

        const entries = Array.isArray(skill.entries) ? [...skill.entries] : skill.entries ? Object.values(skill.entries) : [];
        const entry = entries[entryIndex];
        if (!entry) return;

        // Max level from training config (3 for RT, 4 for DH2e)
        const config = (this as any)._getSkillTrainingConfig();
        const maxLevel = config.length;

        // Determine current level
        let level = 0;
        if (entry.plus30) level = 4;
        else if (entry.plus20) level = 3;
        else if (entry.plus10) level = 2;
        else if (entry.trained) level = 1;

        // Cycle
        if ((event as any).shiftKey) {
            level = level <= 0 ? maxLevel : level - 1;
        } else {
            level = level >= maxLevel ? 0 : level + 1;
        }

        // Update entry
        entries[entryIndex] = {
            ...entry,
            trained: level >= 1,
            plus10: level >= 2,
            plus20: level >= 3,
            plus30: level >= 4,
        };

        await (this as any).actor.update({ [`system.skills.${skillKey}.entries`]: entries });
    }

    /* -------------------------------------------- */

    /**
     * Toggle favorite status for a specialist skill entry.
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     * @this {CharacterSheet}
     */
    static async #toggleFavoriteSpecialistSkill(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const skillKey = target.dataset.skill;
        const entryIndex = parseInt(target.dataset.index);
        if (!skillKey || isNaN(entryIndex)) return;

        // Create a unique key for this specialist skill entry
        const favoriteKey = `${skillKey}:${entryIndex}`;

        // Get current favorite specialist skills
        const favorites = (this as any).actor.getFlag('wh40k-rpg', 'favoriteSpecialistSkills') || [];
        const index = favorites.indexOf(favoriteKey);

        // Toggle
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(favoriteKey);
        }

        // Save
        await (this as any).actor.setFlag('wh40k-rpg', 'favoriteSpecialistSkills', favorites);

        // Re-render skills tab (specialist skills live here now)
        await (this as any).render({ parts: ['skills'] });
    }

    /* -------------------------------------------- */

    /**
     * Open dialog to add a new specialist skill.
     * Single-page dialog with cascading dropdowns populated from compendium indexes.
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     * @this {CharacterSheet}
     */
    static async #openAddSpecialistDialog(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const { prepareCreateSpecialistSkillPrompt } = await import('../prompts/specialist-skill-dialog.ts');
        await prepareCreateSpecialistSkillPrompt({
            actor: (this as any).actor,
        });
    }

    /* -------------------------------------------- */
    /*  Talents Actions                             */
    /* -------------------------------------------- */

    /**
     * Toggle favorite status for a talent.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static async #toggleFavoriteTalent(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        if (!itemId) return;

        // Get current favorite talents
        const favorites = (this as any).actor.getFlag('wh40k-rpg', 'favoriteTalents') || [];
        const index = favorites.indexOf(itemId);

        // Toggle
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(itemId);
        }

        // Save
        await (this as any).actor.setFlag('wh40k-rpg', 'favoriteTalents', favorites);

        // Re-render overview (favourite talents) and skills (full talent panel)
        await (this as any).render({ parts: ['overview', 'skills'] });
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Traits                     */
    /* -------------------------------------------- */

    /**
     * Filter traits list.
     * @param {Event} event  Triggering event
     * @param {HTMLElement} target  The input/select element
     * @this {CharacterSheet}
     * @private
     */
    static async #filterTraits(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const form = target.closest('.wh40k-traits-filters');
        if (!form) return;

        const search = (form.querySelector('[name=traits-search]') as HTMLInputElement | null)?.value || '';
        const category = (form.querySelector('[name=traits-category]') as HTMLSelectElement | null)?.value || '';
        const hasLevel = (form.querySelector('[name=traits-has-level]') as HTMLInputElement | null)?.checked || false;

        (this as any)._traitsFilter = { search, category, hasLevel };
        await (this as any).render({ parts: ['skills'] }); // Trait panel is in skills tab
    }

    /**
     * Clear traits filter.
     * @param {Event} event  Triggering event
     * @param {HTMLElement} target  The button clicked
     * @this {CharacterSheet}
     * @private
     */
    static async #clearTraitsFilter(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        (this as any)._traitsFilter = { search: '', category: '', hasLevel: false };
        await (this as any).render({ parts: ['skills'] }); // Trait panel is in skills tab
    }

    /**
     * Adjust trait level.
     * @param {Event} event  Triggering event
     * @param {HTMLElement} target  The button clicked
     * @this {CharacterSheet}
     * @private
     */
    static async #adjustTraitLevel(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        const delta = parseInt(target.dataset.delta) || 0;

        const item = (this as any).actor.items.get(itemId);
        if (!item) return;

        const newLevel = Math.max(0, (item.system.level || 0) + delta);
        await item.update({ 'system.level': newLevel });

        // Provide visual feedback
        (ui.notifications as any).info(`${item.name} level ${delta > 0 ? 'increased' : 'decreased'} to ${newLevel}`);
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Active Effects             */
    /* -------------------------------------------- */

    /**
     * Handle creating a new Active Effect.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #createEffect(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            await (this as any).actor.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'New Effect',
                    icon: 'icons/svg/aura.svg',
                    disabled: false,
                    duration: {},
                    changes: [],
                },
            ]);

            (this as any)._notify('info', 'New effect created', {
                duration: 2000,
            });
        } catch (error) {
            (this as any)._notify('error', `Failed to create effect: ${error.message}`, {
                duration: 5000,
            });
            console.error('Create effect error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling an Active Effect's enabled/disabled state.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleEffect(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const effectId = target.dataset.effectId;
            const effect = (this as any).actor.effects.get(effectId);

            if (!effect) {
                (this as any)._notify('warning', 'Effect not found', {
                    duration: 3000,
                });
                return;
            }

            await effect.update({ disabled: !effect.disabled });

            (this as any)._notify('info', `Effect ${effect.disabled ? 'disabled' : 'enabled'}`, {
                duration: 2000,
            });
        } catch (error) {
            (this as any)._notify('error', `Failed to toggle effect: ${error.message}`, {
                duration: 5000,
            });
            console.error('Toggle effect error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting an Active Effect.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #deleteEffect(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const effectId = target.dataset.effectId;
            const effect = (this as any).actor.effects.get(effectId);

            if (!effect) {
                (this as any)._notify('warning', 'Effect not found', {
                    duration: 3000,
                });
                return;
            }

            const confirmed = await ConfirmationDialog.confirm({
                title: 'Delete Active Effect',
                content: `Are you sure you want to delete <strong>${effect.name}</strong>?`,
                confirmLabel: 'Delete',
                cancelLabel: 'Cancel',
            });

            if (confirmed) {
                await effect.delete();
                (this as any)._notify('info', 'Effect deleted', {
                    duration: 2000,
                });
            }
        } catch (error) {
            (this as any)._notify('error', `Failed to delete effect: ${error.message}`, {
                duration: 5000,
            });
            console.error('Delete effect error:', error);
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Powers Actions             */
    /* -------------------------------------------- */

    /**
     * Handle rolling a psychic or navigator power.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollPower(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset.itemId;
            const item = (this as any).actor.items.get(itemId);
            if (!item) {
                (this as any)._notify('warning', 'Power not found', { duration: 3000 });
                return;
            }

            // Use the actor's rollItem method for consistent handling
            await (this as any).actor.rollItem(itemId);
        } catch (error) {
            (this as any)._notify('error', `Power roll failed: ${error.message}`, { duration: 5000 });
            console.error('Power roll error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling damage for an attack power.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollPowerDamage(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset.itemId;
            const item = (this as any).actor.items.get(itemId);
            if (!item) {
                (this as any)._notify('warning', 'Power not found', { duration: 3000 });
                return;
            }

            // Use the actor's damageItem method
            await (this as any).actor.damageItem(itemId);
        } catch (error) {
            (this as any)._notify('error', `Damage roll failed: ${error.message}`, { duration: 5000 });
            console.error('Power damage error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle vocalizing a power to chat.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizePower(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset.itemId;
            const item = (this as any).actor.items.get(itemId);
            if (!item) {
                (this as any)._notify('warning', 'Power not found', { duration: 3000 });
                return;
            }

            // Post to chat using the item's vocalize or toChat method
            if (typeof item.toChat === 'function') {
                await item.toChat();
            } else {
                // Fallback: create a simple chat message
                await (ChatMessage as any).create({
                    speaker: ChatMessage.getSpeaker({ actor: (this as any).actor }),
                    content: `<div class="wh40k-power-chat"><h3>${item.name}</h3><p>${item.system.description || ''}</p></div>`,
                });
            }
        } catch (error) {
            (this as any)._notify('error', `Failed to post power: ${error.message}`, { duration: 5000 });
            console.error('Vocalize power error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling power details expansion.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #togglePowerDetails(this: CharacterSheet, event: Event, target: HTMLElement): void {
        const itemId = target.dataset.itemId;
        const detailsEl = (this as any).element.querySelector(`.wh40k-power-details[data-power-id="${itemId}"]`);

        if (detailsEl) {
            const isHidden = detailsEl.hasAttribute('hidden');
            if (isHidden) {
                detailsEl.removeAttribute('hidden');
                target.classList.add('expanded');
            } else {
                detailsEl.setAttribute('hidden', '');
                target.classList.remove('expanded');
            }
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling a ritual.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollRitual(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset.itemId;
            await (this as any).actor.rollItem(itemId);
        } catch (error) {
            (this as any)._notify('error', `Ritual roll failed: ${error.message}`, { duration: 5000 });
            console.error('Ritual roll error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle vocalizing a ritual to chat.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizeRitual(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset.itemId;
            const item = (this as any).actor.items.get(itemId);
            if (!item) return;

            if (typeof item.toChat === 'function') {
                await item.toChat();
            } else {
                await (ChatMessage as any).create({
                    speaker: ChatMessage.getSpeaker({ actor: (this as any).actor }),
                    content: `<div class="wh40k-ritual-chat"><h3>${item.name}</h3><p>${item.system.description || ''}</p></div>`,
                });
            }
        } catch (error) {
            (this as any)._notify('error', `Failed to post ritual: ${error.message}`, { duration: 5000 });
            console.error('Vocalize ritual error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling an order.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollOrder(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset.itemId;
            await (this as any).actor.rollItem(itemId);
        } catch (error) {
            (this as any)._notify('error', `Order roll failed: ${error.message}`, { duration: 5000 });
            console.error('Order roll error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle vocalizing an order to chat.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizeOrder(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset.itemId;
            const item = (this as any).actor.items.get(itemId);
            if (!item) return;

            if (typeof item.toChat === 'function') {
                await item.toChat();
            } else {
                await (ChatMessage as any).create({
                    speaker: ChatMessage.getSpeaker({ actor: (this as any).actor }),
                    content: `<div class="wh40k-order-chat"><h3>${item.name}</h3><p>${item.system.description || ''}</p></div>`,
                });
            }
        } catch (error) {
            (this as any)._notify('error', `Failed to post order: ${error.message}`, { duration: 5000 });
            console.error('Vocalize order error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling psychic phenomena.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollPhenomena(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            // Use the game.wh40k roll helper if available
            if (game.wh40k?.rollPsychicPhenomena) {
                await game.wh40k.rollPsychicPhenomena((this as any).actor);
            } else {
                // Fallback: roll on phenomena table
                const table =
                    (game.tables as any).getName('Psychic Phenomena') ||
                    (await game.packs
                        .get('wh40k-rpg.wh40k-rolltables-psychic')
                        ?.getDocuments()
                        .then((docs: any[]) => docs.find((d: any) => d.name.includes('Phenomena'))));

                if (table) {
                    await table.draw();
                } else {
                    // Simple d100 roll as last resort
                    const roll = await new Roll('1d100').evaluate();
                    await (ChatMessage as any).create({
                        speaker: ChatMessage.getSpeaker({ actor: (this as any).actor }),
                        content: `<div class="wh40k-phenomena-roll"><h3>Psychic Phenomena</h3><p>Roll: ${roll.total}</p></div>`,
                        rolls: [roll],
                    });
                }
            }
        } catch (error) {
            (this as any)._notify('error', `Phenomena roll failed: ${error.message}`, { duration: 5000 });
            console.error('Phenomena roll error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling perils of the warp.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollPerils(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        try {
            // Use the game.wh40k roll helper if available
            if (game.wh40k?.rollPerilsOfTheWarp) {
                await game.wh40k.rollPerilsOfTheWarp((this as any).actor);
            } else {
                // Fallback: roll on perils table
                const table =
                    (game.tables as any).getName('Perils of the Warp') ||
                    (await game.packs
                        .get('wh40k-rpg.wh40k-rolltables-psychic')
                        ?.getDocuments()
                        .then((docs: any[]) => docs.find((d: any) => d.name.includes('Perils'))));

                if (table) {
                    await table.draw();
                } else {
                    // Simple d100 roll as last resort
                    const roll = await new Roll('1d100').evaluate();
                    await (ChatMessage as any).create({
                        speaker: ChatMessage.getSpeaker({ actor: (this as any).actor }),
                        content: `<div class="wh40k-perils-roll"><h3>Perils of the Warp</h3><p>Roll: ${roll.total}</p></div>`,
                        rolls: [roll],
                    });
                }
            }
        } catch (error) {
            (this as any)._notify('error', `Perils roll failed: ${error.message}`, { duration: 5000 });
            console.error('Perils roll error:', error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle filtering psychic powers by discipline.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #filterPowers(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const discipline = target.dataset.discipline || '';

        // Initialize filter state if needed
        if (!(this as any)._powersFilter) (this as any)._powersFilter = {};
        (this as any)._powersFilter.discipline = discipline;

        // Update active class on filter buttons
        const filterBtns = (this as any).element.querySelectorAll('.wh40k-panel-psychic-powers .wh40k-filter-btn');
        filterBtns.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.discipline === discipline);
        });

        // Re-render the powers part
        await (this as any).render({ parts: ['powers'] });
    }

    /* -------------------------------------------- */

    /**
     * Handle filtering orders by category.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #filterOrders(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const category = target.dataset.category || '';

        // Initialize filter state if needed
        if (!(this as any)._powersFilter) (this as any)._powersFilter = {};
        (this as any)._powersFilter.orderCategory = category;

        // Update active class on filter buttons
        const filterBtns = (this as any).element.querySelectorAll('.wh40k-panel-orders .wh40k-filter-btn');
        filterBtns.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });

        // Re-render the powers part
        await (this as any).render({ parts: ['powers'] });
    }

    /* -------------------------------------------- */
    /*  Drag & Drop Override                        */
    /* -------------------------------------------- */

    /**
     * Override drop item to handle origin path updates.
     * @override
     */
    async _onDropItem(event: DragEvent, item: any): Promise<any> {
        const result = await super._onDropItem(event, item);

        // If dropped item is an origin path (trait with origin flag), re-render biography part
        const isOriginPath = item?.type === 'originPath' || (item?.type === 'trait' && item?.flags?.rt?.kind === 'origin');

        if (isOriginPath) {
            // Render only the biography part to update origin path panel
            await this.render({ parts: ['biography'] });
        }

        return result;
    }
}
