/**
 * @file CharacterSheet - Character sheet for acolyte/character actors using ApplicationV2
 * This is the main player character sheet for WH40K RPG
 */

import { DHBasicActionManager } from '../../actions/basic-action-manager.ts';
import { DHTargetedActionManager } from '../../actions/targeted-action-manager.ts';
import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import type { GameSystemId, SidebarHeaderField } from '../../config/game-systems/types.ts';
import type { WH40KAcolyte } from '../../documents/acolyte.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { summarizeChanges, type EffectChangeRaw } from '../../helpers/effects.ts';
import { AssignDamageData, type ActorLike } from '../../rolls/assign-damage-data.ts';
import { Hit } from '../../rolls/damage-data.ts';
import { TransactionManager } from '../../transactions/transaction-manager.ts';
import type { WH40KActorSystemData, WH40KItemSystemData } from '../../types/global.d.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import type { DialogV2Like, TextEditorImplementationLike } from '../api/application-types.ts';
import * as StatActions from '../api/stat-adjustment-actions.ts';
import AcquisitionDialog from '../dialogs/acquisition-dialog.ts';
import AdvancementDialog from '../dialogs/advancement-dialog.ts';
import CharacteristicSetupDialog from '../dialogs/characteristic-setup-dialog.ts';
import ConfirmationDialog from '../dialogs/confirmation-dialog.ts';
import TransactionRequestDialog from '../dialogs/transaction-request-dialog.ts';
import { prepareAssignDamageRoll } from '../prompts/assign-damage-dialog.ts';
import BaseActorSheet, { type SkillLike, type CharacteristicLike } from './base-actor-sheet.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is untyped V14 API; double-cast is the only way to extract the TextEditor implementation
const TextEditor = (foundry.applications as unknown as { ux: { TextEditor: { implementation: TextEditorImplementationLike } } }).ux.TextEditor.implementation;
// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is untyped V14 API; double-cast is the only way to extract DialogV2
const dialogV2 = (foundry.applications as unknown as { api: { DialogV2: DialogV2Like } }).api.DialogV2;
// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is untyped V14 API; Toast is an optional extension with no shipped types
const toast = (foundry.applications as unknown as { api?: { Toast?: Record<string, (...args: unknown[]) => void> } }).api?.Toast;
const ARMOUR_DISPLAY_LOCATIONS = [
    { key: 'head', label: 'Head', shortLabel: 'Head', rollRange: '01-10' },
    { key: 'rightArm', label: 'Right Arm', shortLabel: 'R.Arm', rollRange: '11-20' },
    { key: 'leftArm', label: 'Left Arm', shortLabel: 'L.Arm', rollRange: '21-30' },
    { key: 'body', label: 'Body', shortLabel: 'Body', rollRange: '31-70' },
    { key: 'rightLeg', label: 'Right Leg', shortLabel: 'R.Leg', rollRange: '71-85' },
    { key: 'leftLeg', label: 'Left Leg', shortLabel: 'L.Leg', rollRange: '86-00' },
] as const;

type SheetTabConfig = {
    tab: string;
    label: string;
    group: string;
    cssClass?: string;
};

/* eslint-disable no-restricted-syntax -- boundary: sheet→template payload; the types below describe untyped values passed to Handlebars, where a concrete TS shape doesn't propagate. */
type CharacterSheetContext = Record<string, unknown> & {
    actor?: Record<string, unknown> & { characteristics?: Record<string, Record<string, unknown>> };
    system?: Record<string, unknown> & {
        rogueTrader?: Record<string, unknown>;
        modifierSources?: { characteristics?: Record<string, unknown> };
        wounds?: { value?: number; max?: number };
        fatigue?: { value?: number; max?: number };
        armour?: Record<string, unknown>;
    };
    dh?: Record<string, unknown> & { combatActions?: { attacks?: Array<{ subtypes?: string[] }> } };
    // Explicit declarations to avoid TS4111 (noPropertyAccessFromIndexSignature) on the
    // intersected Record<string, unknown> for all known sheet-context fields written by
    // _prepareContext / _preparePartContext / _prepareCombatData / _prepareLoadoutData / ...
} & CharacterSheetContextDeclaredFields;
type CharacterSheetContextDeclaredFields = {
    inEditMode?: boolean;
    ruleset?: unknown;
    isDH2?: boolean;
    isHomebrew?: boolean;
    isRaw?: boolean;
    hideThroneGelt?: boolean;
    originPathSteps?: unknown;
    originPathSummary?: unknown;
    originPathComplete?: boolean;
    originOptions?: Record<string, unknown>;
    headerFields?: unknown;
    navigatorPowers?: unknown[];
    shipRoles?: unknown[];
    talentsCount?: number;
    traitsCount?: number;
    dynastyData?: Record<string, unknown>;
    activeModifiers?: unknown;
    tab?: { id: string; group: string; cssClass: string; label: string; active: boolean };
    tabs?: unknown;
    skillsFilter?: unknown;
    skillLists?: unknown;
    biography?: unknown;
    aptitudePills?: unknown;
    aptitudes?: unknown;
    favoriteSkills?: unknown;
    favoriteTalents?: unknown;
    effects?: unknown[];
    combatTalents?: unknown[];
    meleeAttacks?: unknown[];
    rangedAttacks?: unknown[];
    generalAttacks?: unknown[];
    woundsPercent?: number;
    fatiguePercent?: number;
    dodgeTarget?: number;
    parryTarget?: number;
    criticalInjuries?: unknown[];
    forceField?: unknown;
    hasForceField?: boolean;
    armourDisplayLocations?: unknown;
    armourDisplay?: Record<string, unknown>;
    equippedWeapons?: unknown[];
    primaryWeapon?: unknown;
    secondaryWeapon?: unknown;
    sidearm?: unknown;
    grenades?: unknown[];
    otherWeapons?: unknown[];
    allItems?: unknown[];
    allCarriedItems?: unknown[];
    allShipItems?: unknown[];
    storageLocations?: unknown[];
    armourCount?: number;
    forceFieldCount?: number;
    cyberneticCount?: number;
    gearCount?: number;
    equippedCount?: number;
    encumbrancePercent?: number;
    backpackPercent?: number;
    transactionSourceCount?: number;
};

type OriginSummary = {
    steps: Record<string, unknown>[];
    completedSteps: number;
    totalSteps: number;
    isComplete: boolean;
    characteristics: Array<{ key: string; short: string; value: number; positive: boolean }>;
    skills: string[];
    talents: string[];
    traits: string[];
};

type CategorizedItems = {
    all: WH40KItem[];
    allCarried: WH40KItem[];
    allShip: WH40KItem[];
    weapons: WH40KItem[];
    armour: WH40KItem[];
    forceField: WH40KItem[];
    cybernetic: WH40KItem[];
    gear: WH40KItem[];
    storageLocation: WH40KItem[];
    criticalInjury: WH40KItem[];
    equipped: WH40KItem[];
};

type WeaponLike = WH40KItem & {
    system: WH40KItem['system'] & {
        equipped: boolean;
        activated: boolean;
        class: string;
        type: string;
        clip: { max: number; value: number };
        ammoPercentage: number;
        effectiveClipMax: number;
        [key: string]: unknown;
    };
    ammoPercent: number;
    [key: string]: unknown;
};

type TalentLike = WH40KItem & {
    system: WH40KItem['system'] & {
        tier: number | string;
        category: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
};

type UtilityMenuOption = {
    name: string;
    icon: string;
    callback: () => void | Promise<void>;
    condition?: () => boolean;
};

/**
 * Actor sheet for Acolyte/Character type actors.
 */
export default class CharacterSheet extends BaseActorSheet {
    declare actor: WH40KAcolyte;
    declare document: WH40KAcolyte & BaseActorSheet['document'];
    declare isEditable: boolean;
    _powersFilter: { discipline: string; orderCategory: string } = { discipline: '', orderCategory: '' };
    declare _equipmentFilter: { search: string; type: string; status: string };
    declare _skillsFilter: { search: string; characteristic: string; training: string; [key: string]: string };
    /* eslint-enable no-restricted-syntax */
    declare _throttleTimers?: Map<string, number>;
    declare _originPathSummary?: OriginSummary;
    private readonly _gameSystemId?: GameSystemId;

    /** Origin-path option cache keyed by game system id (packs don't change at runtime). */
    readonly #originOptionsCache = new Map<GameSystemId, Record<string, string[]>>();

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

    /**
     * Resolve the active rules line for this sheet instance.
     * Shared parent logic must derive this from the concrete child/system state
     * rather than hardcoding a game-specific fallback.
     */
    protected _resolveGameSystemId(): GameSystemId | null {
        if (this._gameSystemId) return this._gameSystemId;

        const actorGameSystem = this.actor.system.gameSystem;
        if (typeof actorGameSystem !== 'string') return null;

        const gameSystemId = actorGameSystem;
        return SystemConfigRegistry.has(gameSystemId) ? gameSystemId : null;
    }

    /** @override */
    static override DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        ...BaseActorSheet.DEFAULT_OPTIONS,
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            ...(BaseActorSheet.DEFAULT_OPTIONS.actions ?? {}),
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

            // Stat adjustment actions — extracted to api/stat-adjustment-actions.ts
            'adjustStat': StatActions.adjustStat,
            'increment': StatActions.increment,
            'decrement': StatActions.decrement,
            'setCriticalPip': StatActions.setCriticalPip,
            'setFateStar': StatActions.setFateStar,
            'setFatigueBolt': StatActions.setFatigueBolt,
            'setCorruption': StatActions.setCorruption,
            'setInsanity': StatActions.setInsanity,
            'restoreFate': StatActions.restoreFate,
            'spendFate': StatActions.spendFate,

            // Equipment actions
            'toggleEquip': CharacterSheet.#toggleEquip,
            'stowItem': CharacterSheet.#stowItem,
            'unstowItem': CharacterSheet.#unstowItem,
            'stowToShip': CharacterSheet.#stowToShip,
            'unstowFromShip': CharacterSheet.#unstowFromShip,
            'swapCheckedItems': CharacterSheet.#swapCheckedItems,
            'giveCheckedItems': CharacterSheet.#giveCheckedItems,
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
            'openTransactionDialog': CharacterSheet.#openTransactionDialog,

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

            // Window controls
            'resetWindowSize': CharacterSheet.#resetWindowSize,

            // Misc actions
            'bonusVocalize': CharacterSheet.#bonusVocalize,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
        classes: ['wh40k-rpg', 'sheet', 'actor', 'player'],
        position: {
            ...(BaseActorSheet.DEFAULT_OPTIONS.position ?? {}),
            width: 1050,
            height: 800,
        },
        // Tab configuration - uses ApplicationV2 tab handling
        tabs: [{ navSelector: 'nav.wh40k-navigation', contentSelector: '#tab-body', initial: 'overview', group: 'primary' }],
    };

    /**
     * Add a "Reset Window Size" entry to the window header menu.
     * Returned once per sheet instance — avoids the duplication that happens
     * when a control is declared in DEFAULT_OPTIONS.window.controls and
     * subclasses spread this class's DEFAULT_OPTIONS.
     * @override
     */
    override _getHeaderControls(): foundry.applications.api.ApplicationV2.HeaderControlsEntry[] {
        const controls = super._getHeaderControls();
        if (!controls.some((c: { action?: string }) => c.action === 'resetWindowSize')) {
            controls.push({
                icon: 'fa-solid fa-expand',
                label: 'WH40K.Sheet.ResetWindowSize',
                action: 'resetWindowSize',
            });
        }
        return controls;
    }

    /* -------------------------------------------- */

    /**
     * Template parts for the Acolyte sheet.
     * Each tab part shares the same container so they stack in one place.
     * Foundry V13 ApplicationV2 handles tab visibility automatically.
     * @override
     */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        header: {
            template: 'systems/wh40k-rpg/templates/actor/player/header-dh.hbs',
            container: {
                classes: [
                    'wh40k-sidebar',
                    'tw-flex',
                    'tw-flex-col',
                    'tw-h-full',
                    'tw-min-h-0',
                    'tw-min-w-0',
                    'tw-overflow-y-auto',
                    'tw-overflow-x-hidden',
                    'tw-bg-[var(--color-bg-secondary,#252525)]',
                    'tw-border-r-2',
                    'tw-border-solid',
                    'tw-border-[var(--wh40k-sidebar-accent,var(--wh40k-color-gold,#d4af37))]',
                ],
                id: 'sidebar',
            },
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/player/tabs.hbs',
            container: {
                classes: [
                    'wh40k-sidebar',
                    'tw-flex',
                    'tw-flex-col',
                    'tw-h-full',
                    'tw-min-h-0',
                    'tw-min-w-0',
                    'tw-overflow-y-auto',
                    'tw-overflow-x-hidden',
                    'tw-bg-[var(--color-bg-secondary,#252525)]',
                    'tw-border-r-2',
                    'tw-border-solid',
                    'tw-border-[var(--wh40k-sidebar-accent,var(--wh40k-color-gold,#d4af37))]',
                ],
                id: 'sidebar',
            },
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
    static TABS: SheetTabConfig[] = [
        { tab: 'overview', label: 'WH40K.Tabs.Overview', group: 'primary', cssClass: 'tab-overview' },
        { tab: 'skills', label: 'WH40K.Tabs.Statistics', group: 'primary', cssClass: 'tab-skills' },
        // talents tab removed — content moved to overview and skills tabs
        { tab: 'combat', label: 'WH40K.Tabs.Combat', group: 'primary', cssClass: 'tab-combat' },
        { tab: 'equipment', label: 'WH40K.Tabs.Equipment', group: 'primary', cssClass: 'tab-equipment' },
        // { tab: 'powers', label: 'WH40K.Tabs.Powers', group: 'primary', cssClass: 'tab-powers' },
        { tab: 'biography', label: 'WH40K.Tabs.Biography', group: 'primary', cssClass: 'tab-biography' },
    ];

    /* -------------------------------------------- */

    /** @override */
    override get title(): string {
        const actorType = String(this.document.type);
        const base = `${actorType.includes('character') ? 'Player Character' : actorType}: ${this.document.name}`;
        return `${base} — Drag and Drop from Compendium to Add`;
    }

    /** @override */
    override tabGroups = {
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: generic throttle utility; args/context types are caller-controlled, no concrete type available
    async _throttle(key: string, wait: number, func: (...args: unknown[]) => unknown, context: Record<string, unknown>, args: unknown[]): Promise<unknown> {
        // Initialize throttle tracking map if it doesn't exist
        // eslint-disable-next-line no-restricted-syntax -- ??= used here to lazily initialize a private map; schema doesn't own this field
        this._throttleTimers ??= new Map();

        const now = Date.now();
        const lastRun = this._throttleTimers.get(key) ?? 0;

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: notification options are forwarded to Foundry/Toast API with no fixed shape
    _notify(type: 'info' | 'warning' | 'error', message: string, options: Record<string, unknown> = {}): void {
        if (toast && typeof toast[type] === 'function') {
            toast[type](message, options);
            return;
        }
        const notifications = ui.notifications;
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: value is forwarded to actor.update() whose payload accepts unknown
    async _updateSystemField(field: string, value: unknown): Promise<void> {
        await this.actor.update({ [field]: value });
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 _prepareContext returns Record<string, unknown>; concrete sub-typing happens via CharacterSheetContext cast inside
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = (await super._prepareContext(options)) as CharacterSheetContext;

        // isGM / dh come from BaseActorSheet._prepareCommonContext (called by super).
        // Edit mode + ruleset state are character-specific.
        context.inEditMode = this.inEditMode;

        // Ruleset state (DH2e only) — controls Throne Gelt visibility
        const activeGameSystem = this._resolveGameSystemId();
        const isDH2 = activeGameSystem === 'dh2e';
        const ruleset = WH40KSettings.getRuleset();
        context.ruleset = ruleset;
        context.isDH2 = isDH2;
        context.isHomebrew = isDH2 && ruleset === 'homebrew';
        const isRaw = isDH2 && ruleset === 'raw';
        context.isRaw = isRaw;
        context.hideThroneGelt = isRaw;

        // In DH2 RAW mode Influence is a percentile characteristic (testable for Requisition,
        // social, and Investigation rolls). Surface it on the characteristics map so the
        // Statistics panel iterates it alongside WS/BS/etc. without schema duplication.
        if (isRaw) {
            this._injectInfluenceAsCharacteristic(context);
        }

        // Prepare characteristic HUD data
        this._prepareCharacteristicHUD(context);

        // Prepare origin path
        context.originPathSteps = this._prepareOriginPathSteps();
        context.originPathSummary = this._getOriginPathSummary();

        // Prepare navigator powers and ship roles (compute fresh)
        const categorized = this._getCategorizedItems();
        context.navigatorPowers = this.actor.items.filter((item) => (item.type as string) === 'navigatorPower' || (item as WH40KItem).isNavigatorPower);
        context.shipRoles = this.actor.items.filter((item) => (item.type as string) === 'shipRole' || (item as WH40KItem).isShipRole);

        // Prepare item counts for panel headers
        context.talentsCount = this.actor.items.filter((item) => (item as WH40KItem).isTalent).length;
        context.traitsCount = this.actor.items.filter((item) => (item as WH40KItem).isTrait).length;

        // Prepare loadout/equipment data (uses cached categorized items)
        this._prepareLoadoutData(context, categorized);

        // Prepare combat station data (uses cached categorized items)
        this._prepareCombatData(context, categorized);

        // Prepare WH40K RPG specific fields
        if (context.system) {
            // eslint-disable-next-line no-restricted-syntax -- rogueTrader is an untyped sub-object on the sheet context; ?? {} is necessary to ensure a defined object is passed
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 _preparePartContext signature uses Record<string, unknown>; prototype must match
    override async _preparePartContext(partId: string, context: Record<string, unknown>, options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const prototype = Object.getPrototypeOf(CharacterSheet.prototype) as {
            _preparePartContext?: (
                this: CharacterSheet,
                partId: string,
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 prototype shape; Record matches upstream signature
                context: Record<string, unknown>,
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 prototype shape; Record matches upstream signature
                options: Record<string, unknown>,
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 prototype shape; Record matches upstream signature
            ) => Promise<Record<string, unknown>>;
        };
        const partContext = (await prototype._preparePartContext?.call(this, partId, context, options)) ?? {};

        switch (partId) {
            case 'header':
                return this._prepareHeaderContext(partContext, options);
            case 'tabs':
                return this._prepareTabsContext(partContext, options);
            case 'biography':
                return this._prepareBiographyContext(partContext, options);
            case 'overview':
                return this._prepareOverviewDashboardContext(partContext, options);
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
    // eslint-disable-next-line @typescript-eslint/require-await, no-restricted-syntax -- require-await: override of async base method; concrete impl is synchronous; no-restricted-syntax: boundary: Foundry ApplicationV2 tab-part context signature uses Record<string, unknown>
    async _prepareTabPartContext(partId: string, context: Record<string, unknown>, _options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const sheetContext = context as CharacterSheetContext;
        // Find the tab configuration
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.constructor is untyped at runtime; double-cast to access static TABS
        const tabConfig = (this.constructor as unknown as { TABS: SheetTabConfig[] }).TABS.find((t: SheetTabConfig) => t.tab === partId);
        if (tabConfig) {
            const group = tabConfig.group;
            sheetContext.tab = {
                id: tabConfig.tab,
                group,
                cssClass: tabConfig.cssClass ?? '',
                label: game.i18n.localize(tabConfig.label),
                active: this.tabGroups[group as keyof typeof this.tabGroups] === tabConfig.tab,
            };
        }

        // Add filter state, specialist skills, talents, and traits for skills tab
        if (partId === 'skills') {
            sheetContext.skillsFilter = this._skillsFilter;
            // Add skillLists for specialist skills panel
            if (sheetContext.skillLists === undefined) {
                this._prepareSkills(context);
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 part-context signature uses Record<string, unknown>
    async _prepareBiographyContext(context: Record<string, unknown>, options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const ctx = context as CharacterSheetContext;
        // First prepare the standard tab context
        await this._prepareTabPartContext('biography', context, options);

        // Prepare biography data with enriched HTML for ProseMirror
        // eslint-disable-next-line no-restricted-syntax -- bio.notes may be undefined in migrated data; ?? '' is safe fallback until DataModel schema enforces the default
        const rawNotes = this.actor.system.bio.notes ?? '';

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 part-context signature uses Record<string, unknown>
    async _prepareHeaderContext(context: Record<string, unknown>, _options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const ctx = context as CharacterSheetContext;
        // Build dynamic origin path select options from compendium packs
        const gameSystem = this._resolveGameSystemId();
        const originOptions = gameSystem ? await this._getOriginPathOptions(gameSystem) : {};
        ctx.originOptions = originOptions;
        ctx.headerFields = this._getSidebarHeaderFields(gameSystem);

        // Check if origin path is complete (has at least homeWorld + background + role)
        const op = this.actor.system.originPath;
        ctx.originPathComplete = op.homeWorld !== '' && op.background !== '' && op.role !== '';

        return context;
    }

    protected _getSidebarHeaderFields(gameSystem: GameSystemId | null): SidebarHeaderField[] {
        if (!gameSystem) return [];
        return SystemConfigRegistry.get(gameSystem).getHeaderFields(this.actor);
    }

    /**
     * Fetch unique origin path names grouped by step from compendium packs.
     * @param {string} gameSystem - The game system ID (e.g. 'dh2e', 'rt')
     * @returns {Promise<Record<string, string[]>>}
     * @private
     */
    async _getOriginPathOptions(gameSystem: GameSystemId): Promise<Record<string, string[]>> {
        // Use cached options if available (packs don't change at runtime)
        const cached = this.#originOptionsCache.get(gameSystem);
        if (cached !== undefined) return cached;

        const stepNames: Record<string, Set<string>> = {};

        const prefix = gameSystem === 'dh2e' ? 'dh2' : gameSystem === 'dh1e' ? 'dh1' : gameSystem;
        const relevantPacks = [...game.packs].filter((pack) => {
            if (pack.documentName !== 'Item') return false;
            const packName = pack.metadata.name;
            return packName.startsWith(prefix) || packName.startsWith('homebrew');
        });

        const indexes = await Promise.all(
            relevantPacks.map(
                async (pack) =>
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry pack.getIndex() returns Collection with no typed item shape; double-cast to concrete interface
                    (await pack.getIndex({ fields: ['type', 'system.step'] })) as unknown as Array<{
                        _id: string;
                        name: string;
                        type?: string;
                        system?: { step?: string };
                    }>,
            ),
        );

        for (const index of indexes) {
            for (const entry of index) {
                if (entry.type !== 'originPath') continue;
                const step = entry.system?.step;
                if (step === undefined || step === '') continue;
                // eslint-disable-next-line no-restricted-syntax -- ??= used to lazily initialize per-step Set; stepNames is a local accumulator not owned by any DataModel
                stepNames[step] ??= new Set();
                stepNames[step].add(entry.name);
            }
        }

        // Convert Sets to sorted arrays
        const result: Record<string, string[]> = {};
        for (const [step, names] of Object.entries(stepNames)) {
            result[step] = [...names].sort();
        }

        this.#originOptionsCache.set(gameSystem, result);
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 part-context signature uses Record<string, unknown>
    _prepareTabsContext(context: Record<string, unknown>, _options: Record<string, unknown>): Record<string, unknown> {
        const ctx = context as CharacterSheetContext;
        // Tabs use the static TABS configuration
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.constructor is untyped at runtime; double-cast to access static TABS
        ctx.tabs = (this.constructor as unknown as { TABS: SheetTabConfig[] }).TABS.map((tab: SheetTabConfig) => ({
            ...tab,
            active: this.tabGroups[tab.group as keyof typeof this.tabGroups] === tab.tab,
            label: game.i18n.localize(tab.label),
        }));
        return context;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 _onFirstRender signature uses Record<string, unknown>
    override async _onFirstRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onFirstRender(context, options);

        // Ensure initial tab is active
        const activeTab = this.tabGroups.primary;

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 part-context signature uses Record<string, unknown>
    _prepareBodyContext(context: Record<string, unknown>, _options: Record<string, unknown>): Record<string, unknown> {
        // All tab data is already prepared in _prepareContext
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare characteristic HUD data and tooltip data.
     * @param {object} context  Context being prepared.
     * @protected
     */
    /**
     * Synthesize an `influence` entry on the characteristics map for DH2 RAW mode.
     * Mirrors the CharacteristicField shape so the panel template and HUD prep treat
     * it identically to WS/BS/etc. Influence has no `advance`/`unnatural`/`base`
     * mechanics in the data model — it's a flat 0-100 value — so the derived fields
     * are filled with zero/identity values that the template renders harmlessly.
     */
    _injectInfluenceAsCharacteristic(context: CharacterSheetContext): void {
        const actor = context.actor;
        if (!actor) return;
        const value = Number(this.actor.system.influence);
        const entry = {
            label: 'Influence',
            short: 'Inf',
            base: value,
            advance: 0,
            modifier: 0,
            unnatural: 0,
            bonus: Math.floor(value / 10),
            total: value,
        };
        const characteristics = actor.characteristics ?? {};
        characteristics['influence'] = entry;
        actor.characteristics = characteristics;
    }

    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: context comes from Foundry ApplicationV2; Record<string, unknown> matches upstream signature
    _prepareCharacteristicHUD(context: Record<string, unknown>): void {
        const sheetContext = context as CharacterSheetContext;
        const hudCharacteristics = sheetContext.actor?.characteristics ?? {};
        const modifierSources = sheetContext.system?.modifierSources?.characteristics ?? {};

        // SVG circle parameters for progress ring
        const radius = 52;
        const circumference = 2 * Math.PI * radius; // ~326.7

        /* eslint-disable no-restricted-syntax -- boundary: HUD characteristic shape mirrors Foundry's CharacteristicField runtime payload; concrete properties exist only to make property writes legal under noPropertyAccessFromIndexSignature. */
        type CharHud = {
            total?: unknown;
            advance?: unknown;
            bonus?: unknown;
            hudMod?: unknown;
            hudTotal?: unknown;
            advanceProgress?: unknown;
            progressCircumference?: unknown;
            progressOffset?: unknown;
            nextAdvanceCost?: unknown;
            tooltipData?: unknown;
            [key: string]: unknown;
        };
        /* eslint-enable no-restricted-syntax */

        Object.entries(hudCharacteristics).forEach(([key, rawChar]) => {
            const char = rawChar as CharHud;
            const total = Number(char.total ?? 0);
            const advance = Number(char.advance ?? 0);

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

    /** Accumulate grants from an origin-path choice option into the running accumulators. */
    /* eslint-disable no-restricted-syntax -- boundary: grants shape varies per game system; typed via local OriginGrants alias */
    #accumulateOriginGrants(
        grants: {
            characteristics?: unknown;
            skills?: unknown;
            talents?: unknown;
            traits?: unknown;
            [key: string]: unknown;
        },
        charTotals: Record<string, number>,
        skillSet: Set<string>,
        talentSet: Set<string>,
        traitSet: Set<string>,
    ): void {
        if (grants.characteristics !== undefined && grants.characteristics !== null) {
            for (const [key, value] of Object.entries(grants.characteristics as Record<string, unknown>)) {
                if (value !== 0) {
                    charTotals[key] = (charTotals[key] ?? 0) + Number(value);
                }
            }
        }
        if (Array.isArray(grants.skills)) {
            for (const skill of grants.skills as Array<{ name?: string; specialization?: string }>) {
                const skillName =
                    skill.specialization !== undefined && skill.specialization !== ''
                        ? `${String(skill.name ?? '')} (${skill.specialization})`
                        : skill.name ?? '';
                skillSet.add(skillName);
            }
        }
        if (Array.isArray(grants.talents)) {
            for (const talent of grants.talents as Array<{ name?: string }>) {
                talentSet.add(talent.name ?? '');
            }
        }
        if (Array.isArray(grants.traits)) {
            for (const trait of grants.traits as Array<{ name?: string }>) {
                traitSet.add(trait.name ?? '');
            }
        }
    }
    /* eslint-enable no-restricted-syntax */

    /* -------------------------------------------- */

    /**
     * Prepare origin path step data.
     * @returns {Array<object>}
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: steps are heterogeneous data passed to Handlebars templates where a concrete type doesn't propagate
    _prepareOriginPathSteps(): Record<string, unknown>[] {
        const gameSystem = this._resolveGameSystemId();
        if (!gameSystem) return [];

        const sysConfig = SystemConfigRegistry.get(gameSystem);
        const stepConfig = sysConfig.getOriginStepConfig();
        const shortLabels = sysConfig.getStepShortLabels();
        const allSteps = [...stepConfig.coreSteps];
        if (stepConfig.optionalStep) allSteps.push(stepConfig.optionalStep);

        const steps = allSteps.map((step) => {
            const labelKey = `WH40K.OriginPath.${step.key.charAt(0).toUpperCase()}${step.key.slice(1)}`;
            const label = game.i18n.localize(labelKey);
            return {
                key: step.key,
                label: label !== labelKey ? label : step.step,
                shortLabel: shortLabels[step.key] ?? step.key,
                icon: step.icon,
            };
        });

        const originItems = this.actor.items.filter((item) => item.type === 'originPath');

        // Calculate totals from all origins
        const charTotals: Record<string, number> = {};
        const skillSet = new Set<string>();
        const talentSet = new Set<string>();
        const traitSet = new Set<string>();
        let completedSteps = 0;

        const preparedSteps = steps.map((step) => {
            const item = originItems.find((i) => {
                const sys = i.system as WH40KItemSystemData & { step?: string };
                const itemStep = sys.step ?? '';
                return itemStep === step.key || itemStep === step.label;
            });

            if (item) {
                completedSteps++;
                /* eslint-disable no-restricted-syntax -- boundary: origin-path item.system grants/choices vary by game system; per-key fields exist to keep noPropertyAccessFromIndexSignature happy. */
                type OriginGrants = {
                    skills?: unknown;
                    talents?: unknown;
                    traits?: unknown;
                    choices?: unknown;
                    characteristics?: unknown;
                    [key: string]: unknown;
                };
                type OriginChoice = {
                    label?: unknown;
                    options?: unknown;
                    [key: string]: unknown;
                };
                const system = item.system as unknown as {
                    grants?: OriginGrants;
                    modifiers?: { characteristics?: Record<string, unknown> };
                    selectedChoices?: Record<string, unknown[]>;
                    [key: string]: unknown;
                };
                /* eslint-enable no-restricted-syntax */
                const grants: OriginGrants = system.grants ?? {};
                const modifiers = system.modifiers?.characteristics ?? {};
                const selectedChoices = system.selectedChoices ?? {};

                // Accumulate base characteristics from modifiers
                for (const [key, value] of Object.entries(modifiers)) {
                    if (value !== 0) {
                        charTotals[key] = (charTotals[key] ?? 0) + Number(value);
                    }
                }

                // Collect base skills, talents, and traits from grants
                this.#accumulateOriginGrants(grants, charTotals, skillSet, talentSet, traitSet);

                // Process choice grants
                if (Array.isArray(grants.choices)) {
                    for (const choice of grants.choices as Array<OriginChoice>) {
                        const selectedValues = selectedChoices[choice['label'] as string] ?? [];
                        for (const selectedValue of selectedValues) {
                            const option = (choice['options'] as Array<{ value?: string; grants?: OriginGrants }> | undefined)?.find(
                                (o) => o.value === selectedValue,
                            );
                            if (option?.grants !== undefined) {
                                this.#accumulateOriginGrants(option.grants, charTotals, skillSet, talentSet, traitSet);
                            }
                        }
                    }
                }
            }

            const tooltipData = item
                ? JSON.stringify({
                      title: `${step.label}: ${item.name}`,
                      // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is typed by Foundry DataModel; accessing description requires a cast until the DataModel exports description
                      content: (item.system as Record<string, unknown> & { description?: { value?: string } }).description?.value ?? '',
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
        const charShorts: Record<string, string> = {
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

        const characteristicBonuses: OriginSummary['characteristics'] = [];
        for (const [key, value] of Object.entries(charTotals)) {
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
    _getOriginPathSummary(): OriginSummary {
        return (
            // eslint-disable-next-line no-restricted-syntax -- _originPathSummary is lazily computed during render; ?? provides the empty-state default until it's populated
            this._originPathSummary ?? {
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
    _getCategorizedItems(): CategorizedItems {
        const categories: CategorizedItems = {
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
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is Foundry DataModel; inShipStorage is not on the typed schema yet; bracket access needs Record cast
            const sys = item.system as Record<string, unknown>;
            const inShip = sys['inShipStorage'] === true;

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
            if (itemType === 'weapon' || (item as WH40KItem).isWeapon) categories.weapons.push(item);
            else if ((itemType === 'armour' || (item as WH40KItem).isArmour) && !inShip) categories.armour.push(item);
            else if ((itemType === 'forceField' || (item as WH40KItem).isForceField) && !inShip) categories.forceField.push(item);
            else if ((itemType === 'cybernetic' || (item as WH40KItem).isCybernetic) && !inShip) categories.cybernetic.push(item);
            else if ((itemType === 'gear' || (item as WH40KItem).isGear) && !inShip) categories.gear.push(item);
            else if (itemType === 'storageLocation') categories.storageLocation.push(item);
            else if (itemType === 'criticalInjury' || (item as WH40KItem).isCriticalInjury) categories.criticalInjury.push(item);

            // Track equipped items (only non-ship items can be equipped)
            if (sys['equipped'] === true && !inShip) categories.equipped.push(item);
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: context comes from Foundry ApplicationV2; Record<string, unknown> matches upstream signature
    _prepareLoadoutData(context: Record<string, unknown>, categorized: CategorizedItems): void {
        const loadoutContext = context as CharacterSheetContext & {
            armourItems: WH40KItem[];
            forceFieldItems: WH40KItem[];
            cyberneticItems: WH40KItem[];
            gearItems: WH40KItem[];
            equippedItems: WH40KItem[];
        };
        // Add all items to context for the Backpack panel
        loadoutContext.allItems = categorized.all;
        loadoutContext.allCarriedItems = categorized.allCarried;
        loadoutContext.allShipItems = categorized.allShip;

        // Filter items by type
        loadoutContext.armourItems = categorized.armour;
        loadoutContext.forceFieldItems = categorized.forceField;
        loadoutContext.cyberneticItems = categorized.cybernetic;
        loadoutContext.gearItems = categorized.gear;
        loadoutContext.storageLocations = categorized.storageLocation;

        // Equipped items (all types that are equipped)
        loadoutContext.equippedItems = categorized.equipped;

        // Counts for section headers
        loadoutContext.armourCount = loadoutContext.armourItems.length;
        loadoutContext.forceFieldCount = loadoutContext.forceFieldItems.length;
        loadoutContext.cyberneticCount = loadoutContext.cyberneticItems.length;
        loadoutContext.gearCount = loadoutContext.gearItems.length;
        loadoutContext.equippedCount = loadoutContext.equippedItems.length;

        // Encumbrance percentage for bar
        const enc = this.actor.encumbrance;
        const encMax = enc.max || 1;
        loadoutContext.encumbrancePercent = Math.min(100, Math.round((enc.value / encMax) * 100));

        // Backpack fill percentage
        const backpackMax = enc.backpack_max ?? 1;
        loadoutContext.backpackPercent = Math.min(100, Math.round(((enc.backpack_value ?? 0) / backpackMax) * 100));
    }

    /* -------------------------------------------- */

    /** Calculate wounds and fatigue percentages for the combat vitals display. */
    #prepareCombatVitals(sheetContext: CharacterSheetContext, system: WH40KActorSystemData | NonNullable<CharacterSheetContext['system']>): void {
        const woundsValue = system.wounds?.value;
        const woundsMaxRaw = system.wounds?.max;
        const woundsMax = typeof woundsMaxRaw === 'number' && woundsMaxRaw > 0 ? woundsMaxRaw : 1;
        sheetContext.woundsPercent = Math.min(100, Math.round(((woundsValue ?? 0) / woundsMax) * 100));

        const fatigueValue = system.fatigue?.value;
        const fatigueMaxRaw = system.fatigue?.max;
        const fatigueMax = typeof fatigueMaxRaw === 'number' && fatigueMaxRaw > 0 ? fatigueMaxRaw : 1;
        sheetContext.fatiguePercent = Math.min(100, Math.round(((fatigueValue ?? 0) / fatigueMax) * 100));
    }

    /* -------------------------------------------- */

    /** Calculate dodge and parry reaction targets from skills and characteristics. */
    #prepareCombatReactionTargets(sheetContext: CharacterSheetContext): void {
        const skills = this.actor.skills;
        const chars = this.actor.characteristics;

        type SkillBits = { plus10?: boolean; plus20?: boolean; trained?: boolean; basic?: boolean };

        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.skills is indexed by string; double-cast to SkillBits to access computed fields not on the schema
        const dodgeSkill = skills['dodge'] as unknown as SkillBits | undefined;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        let dodgeBase = chars['agility']?.total ?? 0;
        if (dodgeSkill?.plus20 === true) dodgeBase += 20;
        else if (dodgeSkill?.plus10 === true) dodgeBase += 10;
        else if (dodgeSkill?.trained !== true && dodgeSkill?.basic !== true) dodgeBase = Math.floor(dodgeBase / 2);
        sheetContext.dodgeTarget = dodgeBase;

        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.skills is indexed by string; double-cast to SkillBits to access computed fields not on the schema
        const parrySkill = skills['parry'] as unknown as SkillBits | undefined;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        let parryBase = chars['weaponSkill']?.total ?? 0;
        if (parrySkill?.plus20 === true) parryBase += 20;
        else if (parrySkill?.plus10 === true) parryBase += 10;
        else if (parrySkill?.trained !== true && parrySkill?.basic !== true) parryBase = Math.floor(parryBase / 2);
        sheetContext.parryTarget = parryBase;
    }

    /* -------------------------------------------- */

    /**
     * Prepare combat tab data for the template.
     * @param {object} context      The template render context.
     * @param {object} categorized  Categorized items.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context comes from Foundry ApplicationV2; Record<string, unknown> matches upstream signature
    _prepareCombatData(context: Record<string, unknown>, categorized: CategorizedItems): void {
        const sheetContext = context as CharacterSheetContext;
        const weapons = categorized.weapons as WeaponLike[];
        // eslint-disable-next-line no-restricted-syntax -- sheetContext.system may be absent if context was freshly created; ?? fallback to actor.system is intentional
        const system = sheetContext.system ?? this.actor.system;

        this.#prepareCombatVitals(sheetContext, system);
        this.#prepareCombatReactionTargets(sheetContext);

        // Critical injuries
        sheetContext.criticalInjuries = categorized.criticalInjury;

        // Force field (first active/equipped one)
        const forceFields = categorized.forceField;
        sheetContext.forceField =
            forceFields.find((ff) => {
                const sys = ff.system as WeaponLike['system'];
                return sys.equipped || sys.activated;
            }) ?? forceFields[0];
        sheetContext.hasForceField = sheetContext.forceField !== undefined;
        sheetContext.armourDisplayLocations = this.#prepareArmourDisplayLocations(this.actor.system, categorized.armour);
        // eslint-disable-next-line no-restricted-syntax -- boundary: armourDisplayMap values are heterogeneous display objects passed to Handlebars; no concrete type
        const armourDisplayMap: Record<string, Record<string, unknown>> = {};
        // eslint-disable-next-line no-restricted-syntax -- boundary: armourDisplayLocations is typed as unknown[] on the context; cast needed to iterate key/value pairs
        for (const entry of sheetContext.armourDisplayLocations as Array<Record<string, unknown>>) {
            if (typeof entry['key'] === 'string') {
                armourDisplayMap[entry['key']] = entry;
            }
        }
        sheetContext.armourDisplay = armourDisplayMap;

        // Weapon slots - categorize by class and equipped status
        const equippedWeapons = weapons.filter((w) => w.system.equipped);
        sheetContext.equippedWeapons = equippedWeapons;
        const rangedWeapons = equippedWeapons.filter((w) => w.system.class !== 'Melee');
        const meleeWeapons = equippedWeapons.filter((w) => w.system.class === 'Melee');

        // Primary weapon
        sheetContext.primaryWeapon =
            rangedWeapons.length > 0 ? rangedWeapons[0] : meleeWeapons.length > 0 ? meleeWeapons[0] : weapons.find((w) => w.system.equipped);

        // Secondary weapon
        if (sheetContext.primaryWeapon !== undefined) {
            if (rangedWeapons.length > 0 && meleeWeapons.length > 0) {
                sheetContext.secondaryWeapon = meleeWeapons[0];
            } else if (rangedWeapons.length > 1) {
                sheetContext.secondaryWeapon = rangedWeapons[1];
            } else if (meleeWeapons.length > 1) {
                sheetContext.secondaryWeapon = meleeWeapons[1];
            }
        }

        // Sidearm: Pistol class weapon
        sheetContext.sidearm = weapons.find((w) => w.system.class === 'Pistol' && w !== sheetContext.primaryWeapon && w !== sheetContext.secondaryWeapon);

        // Grenades: Thrown class weapons
        sheetContext.grenades = weapons.filter((w) => {
            const sys = w.system;
            return sys.class === 'Thrown' || sys.type === 'grenade';
        });

        // Other weapons (not in slots)
        const slotWeapons = [sheetContext.primaryWeapon, sheetContext.secondaryWeapon, sheetContext.sidearm, ...(sheetContext.grenades as WeaponLike[])].filter(
            (w): w is WeaponLike => w !== undefined && w !== null,
        );
        sheetContext.otherWeapons = weapons.filter((w) => !slotWeapons.includes(w));

        // Add ammo percentage to weapons
        [sheetContext.primaryWeapon, sheetContext.secondaryWeapon, sheetContext.sidearm]
            .filter((w): w is WeaponLike => w !== undefined && w !== null)
            .forEach((w) => {
                const clip = w.system.clip;
                if (clip.max > 0 && w.system.effectiveClipMax > 0) {
                    // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-condition -- no-restricted-syntax: ammoPercentage may be absent on older data; no-unnecessary-condition: noUncheckedIndexedAccess makes ammoPercentage possibly-undefined despite WeaponLike typing it as number
                    w.ammoPercent = w.system.ammoPercentage ?? Math.round((clip.value / w.system.effectiveClipMax) * 100);
                }
            });

        // Prepare active effects data — emit the canonical {label, value}
        // change shape consumed by `effect-row.hbs`.
        sheetContext.effects = this.actor.effects.map((effect) => {
            return {
                id: effect.id,
                label: effect.name,
                // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy field still consumed by templates pending V14 migration
                icon: effect.icon,
                disabled: effect.disabled,
                sourceName: effect.sourceName,
                // eslint-disable-next-line no-restricted-syntax -- boundary: effect.changes is Foundry EffectChange[]; double-cast to EffectChangeRaw[] which is this codebase's typed wrapper
                changes: summarizeChanges(effect.changes as unknown as EffectChangeRaw[]),
                document: effect,
            };
        });

        // Extract combat talents for display in combat actions panel
        const talents = this.actor.items.filter((i) => i.type === 'talent') as TalentLike[];
        sheetContext.combatTalents = talents
            .filter((t) => t.system.category === 'combat')
            .map((t) => {
                return {
                    id: t.id,
                    name: t.name,
                    img: t.img,
                    system: {
                        tier: t.system.tier,
                        category: t.system.category,
                    },
                };
            });

        // Partition attack actions into melee, ranged, and general (both)
        const attacks = sheetContext.dh?.combatActions?.attacks ?? [];
        sheetContext.meleeAttacks = attacks.filter((a: { subtypes?: string[] }) => a.subtypes?.includes('Melee') ?? false);
        sheetContext.rangedAttacks = attacks.filter((a: { subtypes?: string[] }) => a.subtypes?.includes('Ranged') ?? false);
        sheetContext.generalAttacks = attacks.filter((a: { subtypes?: string[] }) => a.subtypes?.includes('Melee or Ranged') ?? false);
    }

    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: returns heterogeneous display objects passed to Handlebars; no concrete type possible
    #prepareArmourDisplayLocations(system: WH40KActorSystemData, armourItems: WH40KItem[]): Array<Record<string, unknown>> {
        const equippedArmour = armourItems.filter((item) => (item.system as { equipped?: boolean }).equipped === true);

        return ARMOUR_DISPLAY_LOCATIONS.map((locationConfig) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: system.armour is typed as unknown in WH40KActorSystemData; cast needed to bracket-access by location key
            const armourData = (system.armour as Record<string, Record<string, unknown>> | undefined)?.[locationConfig.key] ?? {};
            const coveringItems = equippedArmour
                .map((item) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is Foundry DataModel; AP helper methods are not on the schema type
                    const itemSystem = item.system as Record<string, unknown>;
                    const getEff = itemSystem['getEffectiveAPForLocation'];
                    const getAp = itemSystem['getAPForLocation'];
                    /* eslint-disable no-restricted-syntax -- boundary: getEff/getAp/armourPoints retrieved as unknown from DataModel; casts needed to invoke or access */
                    const ap =
                        typeof getEff === 'function'
                            ? Number((getEff as (k: string) => unknown)(locationConfig.key) ?? 0)
                            : typeof getAp === 'function'
                            ? Number((getAp as (k: string) => unknown)(locationConfig.key) ?? 0)
                            : Number((itemSystem['armourPoints'] as Record<string, unknown> | undefined)?.[locationConfig.key] ?? 0);
                    /* eslint-enable no-restricted-syntax */
                    if (ap <= 0) return null;

                    return {
                        id: item.id,
                        name: item.name,
                        img: item.img,
                        ap,
                        tooltipData: JSON.stringify({
                            title: item.name,
                            content: `
                                <div class="tw-flex tw-items-center tw-gap-2">
                                    <img src="${item.img}" alt="${item.name}" class="tw-h-8 tw-w-8 tw-rounded tw-border tw-border-[var(--wh40k-border-color)] tw-object-cover" />
                                    <div class="tw-flex tw-flex-col">
                                        <span class="tw-font-semibold">${item.name}</span>
                                        <span class="tw-text-xs tw-text-[var(--wh40k-text-muted)]">${locationConfig.label}: +${ap} AP</span>
                                    </div>
                                </div>
                            `,
                        }),
                    };
                })
                .filter(Boolean);

            return {
                ...locationConfig,
                total: Number(armourData['total'] ?? 0),
                tooltipData: this.prepareArmorTooltip(locationConfig.key, armourData, coveringItems),
                items: coveringItems,
            };
        });
    }

    /* -------------------------------------------- */

    /**
     * Prepare WH40K RPG specific fields.
     * @param {object} rogueTraderData  The rogueTrader data object.
     * @returns {object}
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: rogueTraderData is an untyped sub-object from the sheet context; fields vary by system
    _prepareWH40KFields(rogueTraderData: Record<string, unknown>): Record<string, unknown> {
        /* eslint-disable no-restricted-syntax -- boundary: prepared sub-fields are heterogeneous system data passed to Handlebars */
        const prepared = rogueTraderData as Record<string, unknown> & {
            armour?: unknown;
            weight?: unknown;
            acquisitions?: unknown;
            wounds?: unknown;
            fate?: unknown;
        };
        /* eslint-enable no-restricted-syntax */
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
            : prepared.acquisitions !== null && prepared.acquisitions !== undefined
            ? [{ name: '', availability: '', modifier: 0, notes: prepared.acquisitions, acquired: false }]
            : [];
        prepared.acquisitions = acquisitions;

        prepared.wounds = {
            total: this.actor.wounds.max,
            current: this.actor.wounds.value,
            critical: this.actor.wounds.critical,
            fatigue: this.actor.fatigue.value,
        };
        prepared.fate = {
            total: this.actor.fate.max,
            current: this.actor.fate.value,
        };

        return prepared;
    }

    /* -------------------------------------------- */

    /**
     * Prepare dynasty tab data including wealth tiers and gauge positioning.
     * @returns {object} Dynasty display data
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: dynasty data is a heterogeneous display object passed to Handlebars; no concrete exported type
    _prepareDynastyData(): Record<string, unknown> {
        const pf = (this.actor.system.rogueTrader?.profitFactor ?? {}) as {
            current?: number;
            starting?: number;
            modifier?: number;
        };
        const currentPF = pf.current ?? 0;
        const startingPF = pf.starting ?? 0;
        const modifier = pf.modifier ?? 0;
        const effectivePF = currentPF + modifier;

        // Determine wealth tier (WH40K RPG wealth categories)
        let wealthTier: { key: string; label: string; min: number };
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 part-context signature uses Record<string, unknown>
    _prepareOverviewContext(context: Record<string, unknown>, _options: Record<string, unknown>): Record<string, unknown> {
        const ctx = context as CharacterSheetContext;
        // Add Active Effects data
        ctx.effects = this.actor.effects.map((effect) => ({
            id: effect.id,
            name: effect.name,
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy field still consumed by templates pending V14 migration
            icon: effect.icon,
            document: effect,
        }));

        // Add favorite talents for display
        ctx.favoriteTalents = this._prepareFavoriteTalents();

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 part-context signature uses Record<string, unknown>
    async _prepareOverviewDashboardContext(context: Record<string, unknown>, options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const ctx = context as CharacterSheetContext;
        // First prepare standard tab context
        await this._prepareTabPartContext('overview', context, options);

        // Add Active Effects data for dashboard preview
        const effects = this.actor.effects.map((effect) => ({
            id: effect.id,
            name: effect.name,
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy field still consumed by templates pending V14 migration
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

        // Aptitude pills with per-source attribution (DH2e/BC/OW)
        ctx.aptitudePills = this._prepareAptitudePills();

        return ctx;
    }

    /**
     * Build per-aptitude display data with the origin path source(s) that granted it.
     * Aptitudes come from home world / background / role / elite advance grants or
     * resolved choices. (Characteristic-named aptitudes are NOT auto-granted per RAW.)
     * @protected
     */
    _prepareAptitudePills(): Array<{ aptitude: string; sources: string[] }> {
        const actor = this.actor;
        const aptitudes = actor.system.aptitudes as string[];
        if (aptitudes.length === 0) return [];

        const sourcesOf: Map<string, string[]> = new Map();
        const addSource = (apt: string, src: string): void => {
            let arr = sourcesOf.get(apt);
            if (arr === undefined) {
                arr = [];
                sourcesOf.set(apt, arr);
            }
            if (!arr.includes(src)) arr.push(src);
        };

        const stepLabels: Record<string, string> = {
            homeWorld: 'Home World',
            background: 'Background',
            role: 'Role',
            elite: 'Elite Advance',
            regiment: 'Regiment',
            speciality: 'Speciality',
            chapter: 'Chapter',
            archetype: 'Archetype',
            race: 'Race',
            pride: 'Pride',
            disgrace: 'Disgrace',
            career: 'Career',
            birthright: 'Birthright',
            lureOfTheVoid: 'Lure of the Void',
            trialsAndTravails: 'Trials and Travails',
            motivation: 'Motivation',
            lineage: 'Lineage',
            divination: 'Divination',
        };

        const originItems = actor.items.filter((i: WH40KItem) => i.isOriginPath);
        for (const item of originItems) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is Foundry DataModel; originPath fields (step, grants, selectedChoices) are not on the base type
            const itemSystem = item.system as Record<string, unknown> & { step?: string; grants?: unknown; selectedChoices?: Record<string, string[]> };
            const step = itemSystem.step ?? '';
            const src = `${stepLabels[step] ?? 'Origin'}: ${String(item.name)}`;
            // eslint-disable-next-line no-restricted-syntax -- boundary: grants is untyped JSON from the DataModel; shape varies by system
            const grants = (itemSystem.grants ?? {}) as { aptitudes?: unknown; choices?: unknown; [key: string]: unknown };

            // Fixed aptitudes
            if (Array.isArray(grants.aptitudes)) {
                for (const apt of grants.aptitudes as string[]) if (apt !== '') addSource(apt, src);
            }

            // Resolved aptitude choices (mirrors logic in character.ts._computeOriginPathEffects)
            /* eslint-disable no-restricted-syntax -- boundary: choice shape is heterogeneous JSON from DataModel; no concrete type */
            const choices = (Array.isArray(grants.choices) ? grants.choices : []) as Array<{
                label?: unknown;
                name?: unknown;
                type?: unknown;
                options?: unknown;
                [key: string]: unknown;
            }>;
            /* eslint-enable no-restricted-syntax */
            const selectedChoices = itemSystem.selectedChoices ?? {};
            const labelCounts: Record<string, number> = {};
            for (const choice of choices) {
                const baseLabel = (choice.label as string | undefined) ?? (choice.name as string | undefined) ?? '';
                labelCounts[baseLabel] = (labelCounts[baseLabel] ?? 0) + 1;
                const suffix = labelCounts[baseLabel] > 1 ? ` (${labelCounts[baseLabel]})` : '';
                const choiceKey = `${baseLabel}${suffix}`;
                if (choice.type !== 'aptitude') continue;
                const picks = selectedChoices[choiceKey];
                if (!Array.isArray(picks)) continue;
                for (const pick of picks) {
                    const option = (choice.options as Array<{ value?: string; name?: string }> | undefined)?.find((o) => o.value === pick || o.name === pick);
                    const value = option?.value ?? option?.name ?? pick;
                    if (value !== '') addSource(value, src);
                }
            }
        }

        return [...aptitudes]
            .sort((a, b) => a.localeCompare(b))
            .map((apt) => ({
                aptitude: apt,
                sources: sourcesOf.get(apt) ?? ['Unknown'],
            }));
    }

    /* -------------------------------------------- */

    /**
     * Prepare favorite skills for overview dashboard display.
     * @returns {Array<object>} Array of favorite skill display objects
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns display objects for Handlebars; no concrete exported type
    _prepareFavoriteSkills(): Record<string, unknown>[] {
        const favorites = (this.actor.getFlag('wh40k-rpg', 'favoriteSkills') as string[] | undefined) ?? [];
        const specialistFavorites = (this.actor.getFlag('wh40k-rpg', 'favoriteSpecialistSkills') as string[] | undefined) ?? [];
        const skills = this.actor.skills;
        const characteristics = this.actor.characteristics;

        // Standard skill favourites
        const standardFavourites = favorites
            .map((key) => {
                const skill = skills[key];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (skill === undefined) return null;
                const charShort = skill.characteristic !== '' ? skill.characteristic : 'S';
                const charKey = this._charShortToKey(charShort);
                const char = characteristics[charKey];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (char === undefined) return null;
                const label = skill.label !== '' ? skill.label : key;
                // Route favourites through the same prepareSkillTooltip(...) path the
                // Statistics tab uses (issue #36) so the per-system rank labels (Known/
                // Trained/Experienced/Veteran vs Trained/+10/+20) resolve identically.
                // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics map is a Record<string, CharacteristicLike>; the mixin signature takes Record<string, unknown>.
                const tooltipData = this.prepareSkillTooltip(key, { ...skill, label } as unknown as Record<string, unknown>, characteristics as unknown as Record<string, unknown>);
                return {
                    key,
                    label,
                    current: skill.current,
                    characteristic: charKey,
                    charShort: char.short !== '' ? char.short : charKey,
                    breakdown: this._getSkillBreakdown(skill as SkillLike, char),
                    tooltipData,
                };
            })
            .filter((row): row is NonNullable<typeof row> => row !== null);

        // Specialist favourites are stored as "skillKey:entryIndex"; resolve each to the
        // matching specialisation entry so they appear in the Overview favourites list
        // alongside standard skills (issue #5).
        const specialistFavouriteRows = specialistFavorites
            .map((compositeKey) => {
                const [skillKey, indexStr] = compositeKey.split(':');
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (skillKey === undefined || skillKey === '' || indexStr === undefined) return null;
                const index = Number.parseInt(indexStr, 10);
                if (Number.isNaN(index)) return null;
                // eslint-disable-next-line no-restricted-syntax -- boundary: actor.skills is indexed by string; specialist skill shape not on the top-level type
                const parent = skills[skillKey] as { entries?: unknown[]; characteristic?: string; label?: string } | undefined;
                const entries = parent?.entries;
                if (!Array.isArray(entries)) return null;
                // eslint-disable-next-line no-restricted-syntax -- boundary: entries[] is unknown[] from the DataModel; cast to access specialist entry fields
                const entry = entries[index] as Record<string, unknown> | undefined;
                if (entry === undefined) return null;
                const charShort = (entry['characteristic'] as string | undefined) ?? parent?.characteristic ?? 'S';
                const charKey = this._charShortToKey(charShort);
                const char = characteristics[charKey];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (char === undefined) return null;
                const entryName = (entry['name'] as string | undefined) ?? (entry['label'] as string | undefined) ?? skillKey;
                const parentLabel = parent?.label ?? skillKey;
                const composedLabel = `${parentLabel} (${entryName})`;
                // Specialist entries carry the same trained/plus10/plus20/plus30 flags as
                // standard skills (WH40KSkillEntry shape); route them through the shared
                // prepareSkillTooltip(...) path so per-system rank labels resolve via the
                // active GameSystemConfig (issue #36).
                const synthesizedSkill = { ...entry, characteristic: charShort, label: composedLabel };
                // eslint-disable-next-line no-restricted-syntax -- boundary: synthesised from the raw entries[] payload (Record<string, unknown>); the mixin signature takes Record<string, unknown>.
                const tooltipData = this.prepareSkillTooltip(compositeKey, synthesizedSkill as Record<string, unknown>, characteristics as unknown as Record<string, unknown>);
                return {
                    key: compositeKey,
                    label: composedLabel,
                    current: (entry['current'] as number | undefined) ?? 0,
                    characteristic: charKey,
                    charShort: char.short !== '' ? char.short : charKey,
                    breakdown: this._getSkillBreakdown(entry, char),
                    tooltipData,
                };
            })
            .filter((row) => row !== null);

        // Sort the rendered rows by their displayed label, locale-aware. This is the
        // single source of ordering for favourites (#6): the stored flag array's order
        // is ignored at render time so add / remove / re-add always produces the same
        // alphabetical sequence regardless of any historical insertion order drift.
        const lang = game.i18n.lang;
        const merged: { label: string }[] = [...standardFavourites, ...specialistFavouriteRows];
        merged.sort((a, b) => a.label.localeCompare(b.label, lang, { sensitivity: 'base' }));
        // eslint-disable-next-line no-restricted-syntax -- boundary: returned array is consumed by Handlebars; upcast to match declared return type
        return merged as Record<string, unknown>[];
    }

    /**
     * Generate skill breakdown string for tooltips.
     * @param {object} skill  Skill data
     * @param {object} char   Characteristic data
     * @returns {string}     Formatted breakdown string
     * @private
     */
    override _getSkillBreakdown(skill: SkillLike, char: CharacteristicLike | undefined): string {
        const parts = [];
        const charValue = Number(char?.total ?? 0);
        const trained = skill.trained ?? false;
        const plus10 = skill.plus10 ?? false;
        const plus20 = skill.plus20 ?? false;
        const bonus = Number(skill.bonus ?? 0);

        // Base characteristic
        parts.push(`${char?.label !== undefined && char.label !== '' ? char.label : 'Characteristic'} ${charValue}`);

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns display objects for Handlebars; no concrete exported type
    _prepareFavoriteTalents(): Record<string, unknown>[] {
        const favorites = (this.actor.getFlag('wh40k-rpg', 'favoriteTalents') as string[] | undefined) ?? [];
        const talents = this.actor.items.filter((i) => (i.type as string) === 'talent');

        // Render the favourite talents and sort by their displayed name unconditionally
        // (#6) — flag array order is ignored so add / remove / re-add is stable. Falls
        // back to talent.name when fullName isn't set; matches what the template shows.
        const rows = favorites
            .map((id: string) => {
                const talent = talents.find((t) => t.id === id);
                if (talent === undefined) return null;

                const sys = talent.system as WH40KItemSystemData & {
                    fullName?: string;
                    specialization?: string;
                    category?: string;
                };
                const fullName = sys.fullName !== undefined && sys.fullName !== '' ? sys.fullName : talent.name;
                return {
                    id: talent.id,
                    name: talent.name,
                    img: talent.img,
                    fullName,
                    specialization: sys.specialization ?? '',
                    system: {
                        tier: sys.tier ?? 0,
                        category: sys.category ?? '',
                    },
                };
            })
            .filter((talent) => talent !== null);
        const lang = game.i18n.lang;
        rows.sort((a, b) => a.fullName.localeCompare(b.fullName, lang, { sensitivity: 'base' }));
        return rows;
    }

    /* -------------------------------------------- */

    /**
     * Prepare combat tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 part-context signature uses Record<string, unknown>
    _prepareCombatTabContext(context: Record<string, unknown>, _options: Record<string, unknown>): Record<string, unknown> {
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 part-context signature uses Record<string, unknown>
    _prepareEquipmentContext(context: Record<string, unknown>, _options: Record<string, unknown>): Record<string, unknown> {
        const ctx = context as CharacterSheetContext;
        // Equipment data already prepared in _prepareLoadoutData
        ctx.transactionSourceCount = TransactionManager.listSourcesForBuyer(this.actor).length;
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 part-context signature uses Record<string, unknown>
    _prepareAbilitiesContext(context: Record<string, unknown>, _options: Record<string, unknown>): Record<string, unknown> {
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 part-context signature uses Record<string, unknown>
    _prepareNotesContext(context: Record<string, unknown>, _options: Record<string, unknown>): Record<string, unknown> {
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 part-context signature uses Record<string, unknown>
    _prepareEffectsContext(context: Record<string, unknown>, _options: Record<string, unknown>): Record<string, unknown> {
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare powers tab context.
     * Prepares psychic powers, navigator powers, rituals, and orders.
     * @returns {object} Powers context data
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns heterogeneous display data for Handlebars; no concrete exported type
    _preparePowersContext(): Record<string, unknown> {
        // Get all power items
        const psychicPowers = this.actor.items.filter((i) => (i.type as string) === 'psychicPower');
        const navigatorPowers = this.actor.items.filter((i) => (i.type as string) === 'navigatorPower');
        const rituals = this.actor.items.filter((i) => (i.type as string) === 'ritual');
        const orders = this.actor.items.filter((i) => (i.type as string) === 'order');

        // Extract unique disciplines for filtering
        const disciplines = new Map<string, { id: string; label: string }>();
        for (const power of psychicPowers) {
            const sys = power.system as WH40KItemSystemData & { discipline?: string; disciplineLabel?: string };
            const disc = sys.discipline;
            if (disc !== undefined && disc !== '' && !disciplines.has(disc)) {
                disciplines.set(disc, {
                    id: disc,
                    label: sys.disciplineLabel !== undefined && sys.disciplineLabel !== '' ? sys.disciplineLabel : disc.charAt(0).toUpperCase() + disc.slice(1),
                });
            }
        }
        const psychicDisciplines = Array.from(disciplines.values());

        // Extract unique order categories
        const categories = new Map<string, { id: string; label: string }>();
        for (const order of orders) {
            const sys = order.system as WH40KItemSystemData & { category?: string; categoryLabel?: string };
            const cat = sys.category;
            if (cat !== undefined && cat !== '' && !categories.has(cat)) {
                categories.set(cat, {
                    id: cat,
                    label: sys.categoryLabel !== undefined && sys.categoryLabel !== '' ? sys.categoryLabel : cat.charAt(0).toUpperCase() + cat.slice(1),
                });
            }
        }
        const orderCategories = Array.from(categories.values());

        // Get filter state
        const activeDiscipline = this._powersFilter.discipline;
        const activeOrderCategory = this._powersFilter.orderCategory;

        // Apply discipline filter to psychic powers
        let filteredPsychicPowers = psychicPowers;
        if (activeDiscipline !== '') {
            filteredPsychicPowers = psychicPowers.filter((p) => (p.system as WH40KItemSystemData & { discipline?: string }).discipline === activeDiscipline);
        }

        // Apply category filter to orders
        let filteredOrders = orders;
        if (activeOrderCategory !== '') {
            filteredOrders = orders.filter((o) => (o.system as WH40KItemSystemData & { category?: string }).category === activeOrderCategory);
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
    // eslint-disable-next-line @typescript-eslint/require-await -- ApplicationV2 action handlers expect Promise<void>
    static async #attack(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            DHTargetedActionManager.performWeaponAttack(this.actor);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this._notify('error', `Attack failed: ${message}`, {
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
    static async #dodge(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            await this.actor.rollSkill('dodge');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this._notify('error', `Dodge roll failed: ${message}`, {
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
    static async #parry(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            await this.actor.rollSkill('parry');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this._notify('error', `Parry roll failed: ${message}`, {
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
    static #assignDamage(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
        try {
            const hitData = new Hit();
            // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KAcolyte doesn't satisfy ActorLike structurally; double-cast to bridge the type gap
            const assignData = new AssignDamageData(this.actor as unknown as ActorLike, hitData);
            // eslint-disable-next-line no-restricted-syntax -- boundary: prepareAssignDamageRoll expects a generic Record; AssignDamageData is compatible at runtime
            prepareAssignDamageRoll(assignData as unknown as Record<string, unknown>);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this._notify('error', `Assign damage failed: ${message}`, {
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
    static async #rollInitiative(this: CharacterSheet, event: Event, _target: HTMLElement): Promise<void> {
        try {
            const agBonus = this.actor.system.characteristics.agility.bonus;

            // Shift-click rolls immediately with no modifier — matches the convention used
            // by characteristic rolls elsewhere in the sheet. Otherwise open a small prompt
            // for situational modifiers (Low-Gravity, Constant Vigilance swap, Fate burn, etc).
            // Issue #21.
            let modifier = 0;
            let formula = '1d10';
            let formulaLabel = `1d10 + Agility Bonus (${agBonus})`;
            const isShift = (event as MouseEvent).shiftKey;
            if (!isShift) {
                const DialogV2 = (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
                if (DialogV2) {
                    const result = await DialogV2.prompt({
                        window: { title: 'WH40K.Combat.InitiativeDialogTitle' },
                        content: `
                            <p>${game.i18n.localize('WH40K.Combat.InitiativeDialogHelp')}</p>
                            <div class="form-group">
                                <label>${game.i18n.localize('WH40K.Combat.InitiativeModifier')}</label>
                                <input type="number" name="modifier" value="0" />
                            </div>
                            <div class="form-group">
                                <label><input type="checkbox" name="fateBurn" /> ${game.i18n.localize('WH40K.Combat.InitiativeFateBurn')}</label>
                            </div>
                        `,
                        ok: {
                            label: 'WH40K.Common.Roll',
                            callback: (_evt: Event, button: HTMLButtonElement) => {
                                const form = button.form ?? null;
                                const mod = Number((form?.elements.namedItem('modifier') as HTMLInputElement | null)?.value ?? 0);
                                const burn = (form?.elements.namedItem('fateBurn') as HTMLInputElement | null)?.checked === true;
                                return { modifier: mod, fateBurn: burn };
                            },
                        },
                        rejectClose: false,
                    });
                    if (result === null) return;
                    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2 result is typed as unknown; double-cast to extract modal form values
                    modifier = (result as unknown as { modifier: number }).modifier;
                    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2 result is typed as unknown; double-cast to extract fateBurn flag
                    if ((result as unknown as { fateBurn: boolean }).fateBurn) {
                        formula = '10';
                        formulaLabel = `Fate burn (10) + Agility Bonus (${agBonus})`;
                    }
                }
            }

            const roll = await new Roll(`${formula} + @ab + @mod`, { ab: agBonus, mod: modifier }).evaluate();
            if (modifier !== 0) {
                formulaLabel += ` ${modifier >= 0 ? '+' : ''}${modifier}`;
            }

            const content = `
                <div class="wh40k-hit-location-result">
                    <h3><i class="fas fa-bolt"></i> Initiative Roll</h3>
                    <div class="wh40k-hit-roll">
                        <span class="wh40k-roll-result">${roll.total}</span>
                    </div>
                    <div class="wh40k-hit-location">
                        <span class="wh40k-location-armour">${formulaLabel}</span>
                    </div>
                </div>
            `;

            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content,
                rolls: [roll],
                flags: {
                    'wh40k-rpg': {
                        type: 'initiative',
                    },
                },
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this._notify('error', `Initiative roll failed: ${message}`, {
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
        const actionKey = target.dataset['actionKey'];
        if (actionKey === undefined || actionKey === '') return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system is typed by DataModel; favoriteCombatActions is a flag field not on the schema yet
        const currentFavorites = (this.actor.system as Record<string, unknown> & { favoriteCombatActions?: string[] }).favoriteCombatActions ?? [];
        const newFavorites = currentFavorites.includes(actionKey) ? currentFavorites.filter((k: string) => k !== actionKey) : [...currentFavorites, actionKey];

        await this.actor.update({ 'system.favoriteCombatActions': newFavorites });
    }

    /**
     * Handle generic combat action from favorites.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #combatAction(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const actionKey = target.dataset['combatAction'];
        if (actionKey === undefined || actionKey === '') return;

        // Route to specific handler based on action key
        switch (actionKey) {
            case 'dodge':
                await CharacterSheet.#dodge.call(this, event, target);
                break;
            case 'parry':
                await CharacterSheet.#parry.call(this, event, target);
                break;
            case 'assignDamage':
                CharacterSheet.#assignDamage.call(this, event, target);
                break;
            case 'initiative':
                await CharacterSheet.#rollInitiative.call(this, event, target);
                break;
            default:
                this._notify('warning', `Unknown combat action: ${actionKey}`, {
                    duration: 3000,
                });
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle clicks on combat action buttons.
     *
     * Default behavior (plain click): show the action's description as a
     * sticky in-sheet tooltip anchored to the clicked button — a "personal"
     * description for the player, not posted anywhere else. This matches the
     * reaction buttons (Dodge/Parry), which never auto-post a description.
     *
     * Modifier behavior (Shift+Click): explicit opt-in to post the action
     * to chat as a public combat-action card. Posting to chat is a deliberate
     * secondary action, never the default.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizeCombatAction(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const actionKey = target.dataset['actionKey'];
        if (actionKey === undefined || actionKey === '') return;

        // Find the action definition in config
        // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.wh40k is untyped Foundry config; cast to access combatActions structure
        const wh40kConfig = CONFIG.wh40k as { combatActions?: { attacks?: unknown[]; movement?: unknown[]; utility?: unknown[] } } | undefined;
        const allActions = [
            ...(wh40kConfig?.combatActions?.attacks ?? []),
            ...(wh40kConfig?.combatActions?.movement ?? []),
            ...(wh40kConfig?.combatActions?.utility ?? []),
        ] as Array<{ key: string; label: string; description: string; type?: string; icon?: string; subtypes?: string[] }>;

        const actionConfig = allActions.find((a) => a.key === actionKey);
        if (actionConfig === undefined) {
            this._notify('warning', `Unknown combat action: ${actionKey}`, { duration: 3000 });
            return;
        }

        const actionName = game.i18n.localize(actionConfig.label);
        const actionDescription = game.i18n.localize(actionConfig.description);
        const actionSubtypes = actionConfig.subtypes !== undefined && actionConfig.subtypes.length > 0 ? ` (${actionConfig.subtypes.join(', ')})` : '';

        // Shift+Click is the explicit opt-in to vocalize into chat.
        const isShiftClick = event instanceof MouseEvent && event.shiftKey;
        if (isShiftClick) {
            const chatData = {
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/combat-action-card.hbs', {
                    name: actionName,
                    actor: this.actor.name,
                    actionType: actionConfig.type ?? '',
                    description: actionDescription,
                    subtypes: actionConfig.subtypes?.join(', ') ?? '',
                    icon: actionConfig.icon ?? '',
                }),
            };
            await ChatMessage.create(chatData);
            return;
        }

        // Default: show the description as a sticky in-sheet tooltip on the
        // clicked button. No chat post, no global notification toast.
        const tooltipText = `<strong>${actionName}${actionSubtypes}</strong><br/>${actionDescription}`;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 TooltipManager (game.tooltip) is untyped in fvtt-types; minimal local shape
        const tooltipManager = (game as unknown as { tooltip?: { activate?: (element: HTMLElement, options?: { text?: string; direction?: string; cssClass?: string }) => void } }).tooltip;
        if (tooltipManager?.activate !== undefined) {
            tooltipManager.activate(target, { text: tooltipText, direction: 'UP', cssClass: 'wh40k-action-description' });
        } else {
            // Fallback for environments without the tooltip manager (e.g., tests).
            target.setAttribute('data-tooltip', `${actionName}${actionSubtypes}: ${actionDescription}`);
        }
    }

    /**
     * Handle vocalizing movement to chat.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizeMovement(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const movementType = target.dataset['movementType'] as 'half' | 'full' | 'charge' | 'run' | undefined;
        if (movementType === undefined) return;

        const movementData = {
            half: { label: 'Half Move', icon: 'fa-walking', description: 'Move and take other actions' },
            full: { label: 'Full Move', icon: 'fa-shoe-prints', description: 'Move with no other actions' },
            charge: { label: 'Charge', icon: 'fa-running', description: 'Move and attack with +20 bonus' },
            run: { label: 'Run', icon: 'fa-wind', description: 'Run at full speed (Agility test may be required)' },
        };

        const movement = movementData[movementType];

        const distance = this.actor.system.movement[movementType];

        // Prepare chat data
        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/movement-card.hbs', {
                actor: this.actor.name,
                movementType: movementType,
                movementLabel: movement.label,
                distance: distance,
                icon: movement.icon,
                description: movement.description,
            }),
        };

        // Create chat message
        await ChatMessage.create(chatData);
    }

    /**
     * Set the active movement mode on the actor's token.
     * Updates the token's movement action flag for ruler integration.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setMovementMode(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const movementType = target.dataset['movementType'];
        if (movementType === undefined || movementType === '') return;

        // Find the actor's active token on the canvas
        const token = this.actor.getActiveTokens()[0]?.document;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (token === null || token === undefined) {
            ui.notifications.info(`${game.i18n.localize('WH40K.MOVEMENT.Label')}: No active token on canvas.`);
            return;
        }

        // Store movement action on token flags
        // eslint-disable-next-line no-restricted-syntax -- boundary: token.update() accepts untyped data; cast needed to satisfy the overload
        await token.update({ 'flags.wh40k-rpg.movementAction': movementType } as Record<string, unknown>);

        // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG is untyped Foundry global; double-cast to access wh40k.movementTypes config
        const config = ((CONFIG as unknown as Record<string, unknown>)['wh40k'] as Record<string, unknown> | undefined)?.['movementTypes'] as
            | Record<string, { label?: string }>
            | undefined;
        const movementConfig = config?.[movementType];
        const label = movementConfig ? game.i18n.localize(movementConfig.label ?? movementType) : movementType;
        const speed = this.actor.system.movement[movementType as keyof typeof this.actor.system.movement];
        ui.notifications.info(`${label}: ${speed}m set as active movement mode.`);
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Stat Adjustments           */
    /*  (extracted to api/stat-adjustment-actions.ts; bound via DEFAULT_OPTIONS.actions) */
    /* -------------------------------------------- */

    /* -------------------------------------------- */
    /*  Event Handlers - Equipment Actions          */
    /* -------------------------------------------- */

    /**
     * Handle toggling item equipped state.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleEquip(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        const item = this.actor.items.get(itemId as string);
        if (!item) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is Foundry DataModel; equipped not on base type; bracket access needs Record cast
        await item.update({ 'system.equipped': (item.system as Record<string, unknown>)['equipped'] !== true });
    }

    /* -------------------------------------------- */

    /**
     * Handle stowing an item.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #stowItem(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        const item = this.actor.items.get(itemId as string);
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
    static async #unstowItem(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        const item = this.actor.items.get(itemId as string);
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
    static async #stowToShip(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        const item = this.actor.items.get(itemId as string);
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
    static async #unstowFromShip(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        const item = this.actor.items.get(itemId as string);
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
        const panel = target.closest('.wh40k-panel-backpack-split') ?? this.element.querySelector('.wh40k-panel-backpack-split');
        if (!panel) return;

        // Gather checked items from backpack (left) column
        const backpackChecks = panel.querySelectorAll('.wh40k-backpack-inventory .wh40k-transfer-check:checked');
        // Gather checked items from ship (right) column
        const shipChecks = panel.querySelectorAll('.wh40k-ship-storage .wh40k-transfer-check:checked');

        if (!backpackChecks.length && !shipChecks.length) {
            // eslint-disable-next-line no-restricted-syntax -- player-facing notification; TODO: migrate to i18n key when langpack stabilises
            ui.notifications.warn('No items selected to transfer.');
            return;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: transferOperations holds promises to Foundry update calls; no concrete result type
        const transferOperations: Promise<unknown>[] = [];

        // Backpack → Ship
        backpackChecks.forEach((cb: Element) => {
            const itemId = (cb as HTMLElement).dataset['itemId'];
            if (itemId === undefined || itemId === '') return;

            const item = this.actor.items.get(itemId);
            if (!item) return;

            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is Foundry DataModel; stowInShipStorage is a duck-typed method not on the schema
            const equippable = item.system as Record<string, unknown>;
            // eslint-disable-next-line no-restricted-syntax -- boundary: stowInShipStorage checked via typeof; cast to invocable signature for push
            if (typeof (equippable as { stowInShipStorage?: unknown }).stowInShipStorage === 'function') {
                // eslint-disable-next-line no-restricted-syntax -- boundary: method retrieved as unknown; cast to concrete call signature
                transferOperations.push((equippable as { stowInShipStorage: () => Promise<unknown> }).stowInShipStorage());
                return;
            }

            transferOperations.push(
                item.update({
                    'system.equipped': false,
                    'system.inBackpack': false,
                    'system.inShipStorage': true,
                }),
            );
        });

        // Ship → Backpack/Carried
        shipChecks.forEach((cb: Element) => {
            const itemId = (cb as HTMLElement).dataset['itemId'];
            if (itemId === undefined || itemId === '') return;

            const item = this.actor.items.get(itemId);
            if (!item) return;

            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is Foundry DataModel; removeFromShipStorage is a duck-typed method not on the schema
            const equippable = item.system as Record<string, unknown>;
            // eslint-disable-next-line no-restricted-syntax -- boundary: removeFromShipStorage checked via typeof; cast to invocable signature for push
            if (typeof (equippable as { removeFromShipStorage?: unknown }).removeFromShipStorage === 'function') {
                // eslint-disable-next-line no-restricted-syntax -- boundary: method retrieved as unknown; cast to concrete call signature
                transferOperations.push((equippable as { removeFromShipStorage: () => Promise<unknown> }).removeFromShipStorage());
                return;
            }

            transferOperations.push(
                item.update({
                    'system.inShipStorage': false,
                }),
            );
        });

        if (!transferOperations.length) return;

        await Promise.all(transferOperations);
    }

    /* -------------------------------------------- */

    /**
     * Give all checked items (from both backpack and ship columns) to another actor.
     * Opens an actor picker dialog and transfers each selected item.
     */
    static async #giveCheckedItems(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const panel = target.closest('.wh40k-panel-backpack-split') ?? this.element.querySelector('.wh40k-panel-backpack-split');
        if (!panel) return;

        const allChecks = panel.querySelectorAll('.wh40k-transfer-check:checked');
        if (!allChecks.length) {
            // eslint-disable-next-line no-restricted-syntax -- player-facing notification; TODO: migrate to i18n key when langpack stabilises
            ui.notifications.warn('No items selected to give.');
            return;
        }

        const itemIds: string[] = [];
        allChecks.forEach((cb: Element) => {
            const id = (cb as HTMLElement).dataset['itemId'];
            if (id !== undefined && id !== '') itemIds.push(id);
        });
        if (!itemIds.length) return;

        const sourceActor = this.actor;
        const targets = game.actors.filter((a) => a.id !== sourceActor.id && a.isOwner);

        if (!targets.length) {
            // eslint-disable-next-line no-restricted-syntax -- player-facing notification; TODO: migrate to i18n key when langpack stabilises
            ui.notifications.warn('No other actors available to give items to.');
            return;
        }

        const options = targets.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');
        const content = `<form><div class="form-group"><label>Give ${itemIds.length} item(s) to:</label><select name="targetActorId">${options}</select></div></form>`;

        const targetId = await dialogV2.prompt({
            window: { title: 'Give Items' },
            content,
            ok: {
                label: 'Give',
                icon: 'fas fa-hand-holding',
                callback: (_event: Event, button: HTMLElement) => {
                    return ((button as HTMLElement & { form: HTMLFormElement }).form.elements.namedItem('targetActorId') as HTMLInputElement | null)?.value;
                },
            },
        });

        if (targetId === null || targetId === undefined || typeof targetId !== 'string') return;
        const targetActor = game.actors.get(targetId);
        if (!targetActor) return;

        const itemsData = itemIds
            .map((id: string) => sourceActor.items.get(id))
            .filter(Boolean)
            .map((item) => {
                /* eslint-disable no-restricted-syntax -- boundary: item.toObject() returns Foundry document data with no typed shape; cast to access system fields for transfer */
                const data = (item as WH40KItem).toObject() as Record<string, unknown> & {
                    system?: Record<string, unknown> & { equipped?: unknown; inBackpack?: unknown; inShipStorage?: unknown };
                    _id?: string;
                };
                /* eslint-enable no-restricted-syntax */
                if (data.system) {
                    data.system.equipped = false;
                    data.system.inBackpack = true;
                    data.system.inShipStorage = false;
                }
                delete data._id;
                return data;
            });

        if (!itemsData.length) return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments data param type doesn't accept our Record shape; double-cast to satisfy the overload
        await targetActor.createEmbeddedDocuments('Item', itemsData as unknown as Parameters<typeof targetActor.createEmbeddedDocuments<'Item'>>[1]);
        await sourceActor.deleteEmbeddedDocuments('Item', itemIds);
        ui.notifications.info(`Gave ${itemsData.length} item(s) to ${targetActor.name}.`);
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling force field activation.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleActivate(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        const item = this.actor.items.get(itemId as string);
        if (!item) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is Foundry DataModel; activated not on base type; bracket access needs Record cast
        await item.update({ 'system.activated': (item.system as Record<string, unknown>)['activated'] !== true });
    }

    /* -------------------------------------------- */

    /**
     * Handle bulk equipment operations.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #bulkEquip(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        try {
            const action: string | undefined = target.dataset['bulkAction'];
            const items = this.actor.items;
            let count = 0;

            switch (action) {
                case undefined:
                    break;
                case 'equip-armour': {
                    const armourItems = items.filter((i: WH40KItem & { isArmour?: boolean }) => i.type === 'armour' || i.isArmour);
                    const toEquip = armourItems.filter((item) => item.system.equipped !== true);
                    await Promise.all(toEquip.map(async (item) => item.update({ 'system.equipped': true })));
                    count = toEquip.length;
                    this._notify('info', `Equipped ${count} armour piece${count !== 1 ? 's' : ''}`, {
                        duration: 3000,
                    });
                    break;
                }

                case 'unequip-all': {
                    const equippedItems = items.filter((i: WH40KItem) => (i.system as { equipped?: boolean }).equipped === true);
                    await Promise.all(equippedItems.map(async (item) => item.update({ 'system.equipped': false })));
                    count = equippedItems.length;
                    this._notify('info', `Unequipped ${count} item${count !== 1 ? 's' : ''}`, {
                        duration: 3000,
                    });
                    break;
                }

                case 'stow-gear': {
                    const gearItems = items.filter(
                        (i: WH40KItem & { isGear?: boolean; system: WH40KItem['system'] & { inBackpack?: boolean } }) =>
                            (i.type === 'gear' || i.isGear) && i.system.inBackpack !== true,
                    );
                    await Promise.all(
                        gearItems.map(async (item) =>
                            item.update({
                                'system.inBackpack': true,
                                'system.equipped': false,
                            }),
                        ),
                    );
                    count = gearItems.length;
                    this._notify('info', `Stowed ${count} gear item${count !== 1 ? 's' : ''} in backpack`, {
                        duration: 3000,
                    });
                    break;
                }

                default:
                    this._notify('warning', `Unknown bulk action: ${action}`, {
                        duration: 3000,
                    });
            }
        } catch (error) {
            this._notify('error', `Bulk operation failed: ${(error as Error).message}`, {
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
    static async #addAcquisition(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        const acquisitions = this.actor.system.rogueTrader?.acquisitions;
        const acquisitionList = Array.isArray(acquisitions) ? acquisitions : [];
        const updatedAcquisitions = structuredClone(acquisitionList);
        updatedAcquisitions.push({ name: '', availability: '', modifier: 0, notes: '', acquired: false });
        await this.actor.update({ 'system.rogueTrader.acquisitions': updatedAcquisitions });
    }

    /* -------------------------------------------- */

    /**
     * Handle removing an acquisition.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #removeAcquisition(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset['index'] ?? '-1', 10);
        if (Number.isNaN(index) || index < 0) return;

        const acquisitions = this.actor.system.rogueTrader?.acquisitions;
        if (!Array.isArray(acquisitions)) {
            await this.actor.update({ 'system.rogueTrader.acquisitions': [] });
            return;
        }

        const updatedAcquisitions = structuredClone(acquisitions);
        updatedAcquisitions.splice(index, 1);
        await this.actor.update({ 'system.rogueTrader.acquisitions': updatedAcquisitions });
    }

    /* -------------------------------------------- */

    /**
     * Open the Acquisition Dialog for rolling acquisition tests.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #openAcquisitionDialog(this: CharacterSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await AcquisitionDialog.show(this.actor);
    }

    /**
     * Open the barter / requisition dialog from the equipment page.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #openTransactionDialog(this: CharacterSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        const sourceCount = TransactionManager.listSourcesForBuyer(this.actor).length;
        if (!sourceCount) {
            this._notify('warning', 'No barter or requisition sources are currently available.', {
                duration: 4000,
            });
            return;
        }

        await TransactionRequestDialog.show(this.actor);
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
    static async #customXP(this: CharacterSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const { openAddXPDialog } = await import('../prompts/add-xp-dialog.ts');
        openAddXPDialog(this.actor);
    }

    /* -------------------------------------------- */

    /**
     * Open the advancement dialog for spending XP.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #openAdvancement(this: CharacterSheet, event: Event, _target: HTMLElement): void {
        event.preventDefault();
        // Default to rogueTrader career for now
        // TODO: Get career from actor.system.originPath.career or rogueTrader.careerPath
        const careerKey = this.actor.originPath['career'];
        AdvancementDialog.open(this.actor, { careerKey });
    }

    /* -------------------------------------------- */

    /**
     * Handle bonus vocalize.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #bonusVocalize(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        try {
            const bonusName = target.dataset['bonusName'];
            const bonus = (this.actor.backgroundEffects as Array<{ name?: string; source?: string; benefit?: string }> | undefined)?.find(
                (a) => a.name === bonusName,
            );
            if (bonus) {
                await DHBasicActionManager.sendItemVocalizeChat({
                    actor: this.actor.name,
                    name: bonus.name,
                    type: bonus.source,
                    description: bonus.benefit,
                });
            } else {
                this._notify('warning', `Bonus "${bonusName}" not found`, {
                    duration: 3000,
                });
            }
        } catch (error) {
            this._notify('error', `Failed to vocalize bonus: ${(error as Error).message}`, {
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
    static async #openOriginPathBuilder(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            if (typeof game.wh40k.openOriginPathBuilder === 'function') {
                const gameSystem = this._resolveGameSystemId();
                await game.wh40k.openOriginPathBuilder(this.actor, gameSystem ? { gameSystem } : {});
            } else {
                this._notify('warning', 'Origin Path Builder not available', {
                    duration: 3000,
                });
                console.warn('game.wh40k.openOriginPathBuilder not found');
            }
        } catch (error) {
            this._notify('error', `Failed to open Origin Path Builder: ${(error as Error).message}`, {
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
    static #toggleEditMode(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
        if (!this.isEditable) return;
        this.#editMode = !this.#editMode;
        void this.render();
    }

    /**
     * Open the characteristic setup dialog.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static async #openCharacteristicSetup(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        await CharacteristicSetupDialog.open(this.actor);
    }

    /**
     * Show the utility menu.
     * @param {Event} event     The originating click event
     * @param {HTMLElement} target  The capturing HTML element which defined a [data-action]
     */
    static #showUtilityMenu(this: CharacterSheet, event: Event, target: HTMLElement): void {
        event.preventDefault();
        event.stopPropagation();

        const options = this._getUtilityMenuOptions();
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
        options.forEach((option: UtilityMenuOption) => {
            if (option.condition && !option.condition()) return;

            const item = document.createElement('div');
            item.className = 'context-menu-item';
            item.innerHTML = `${option.icon} ${option.name}`;
            item.addEventListener('click', () => {
                void option.callback();
                menu.remove();
            });
            menu.appendChild(item);
        });

        // Add close listener
        const closeMenu = (e: Event): void => {
            if (!menu.contains(e.target as Node | null)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };

        document.body.appendChild(menu);
        document.addEventListener('click', closeMenu);
    }

    /**
     * Header control — reset the window to its default width and height.
     */
    static #resetWindowSize(this: CharacterSheet, event: Event, _target: HTMLElement): void {
        event.preventDefault();
        const defaults = (this.constructor as typeof CharacterSheet).DEFAULT_OPTIONS.position as { width?: number; height?: number };
        const pos: { width?: number; height?: number } = {};
        if (defaults.width !== undefined) pos.width = defaults.width;
        if (defaults.height !== undefined) pos.height = defaults.height;
        this.setPosition(pos);
    }

    /* -------------------------------------------- */
    /*  Context Menu Implementation                 */
    /* -------------------------------------------- */

    /** @override */
    _createCustomContextMenus(): void {
        // Note: Utility menu is now handled via action instead of context menu
    }

    /**
     * Get utility menu options.
     * @returns {ContextMenuEntry[]}
     * @protected
     */
    _getUtilityMenuOptions(): UtilityMenuOption[] {
        return [
            {
                name: game.i18n.localize('WH40K.Utility.SetupCharacteristics'),
                icon: '<i class="fa-solid fa-sliders"></i>',
                callback: async () => {
                    await CharacteristicSetupDialog.open(this.actor);
                },
            },
        ];
    }

    /**
     * Open the Origin Path Builder utility.
     * @protected
     */
    async _openOriginPathBuilder(): Promise<void> {
        try {
            if (typeof game.wh40k.openOriginPathBuilder === 'function') {
                const gameSystem = this._resolveGameSystemId();
                await game.wh40k.openOriginPathBuilder(this.actor, gameSystem !== null ? { gameSystem } : {});
            } else {
                ui.notifications.warn(game.i18n.localize('WH40K.Utility.OriginPathNotAvailable'));
            }
        } catch (error) {
            ui.notifications.error(`${game.i18n.localize('WH40K.Utility.OriginPathError')}: ${(error as Error).message}`);
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
    static #filterEquipment(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
        const equipmentPanel = this.element.querySelector('.wh40k-all-items-grid');
        if (!equipmentPanel) return;

        // Get filter values
        const searchInput = this.element.querySelector<HTMLInputElement>('.wh40k-equipment-search');
        const typeFilter = this.element.querySelector<HTMLInputElement>('.wh40k-equipment-type-filter');
        const statusFilter = this.element.querySelector<HTMLInputElement>('.wh40k-equipment-status-filter');

        const searchTerm = searchInput?.value.toLowerCase() ?? '';
        const typeValue = typeFilter?.value ?? '';
        const statusValue = statusFilter?.value ?? '';

        // Store filter state for persistence
        this._equipmentFilter = {
            search: searchInput?.value ?? '',
            type: typeValue,
            status: statusValue,
        };

        // Get all item cards
        const itemCards = equipmentPanel.querySelectorAll('.wh40k-inventory-card');

        let visibleCount = 0;

        itemCards.forEach((card: Element) => {
            const element = card as HTMLElement;
            const itemName = element.getAttribute('title')?.toLowerCase() ?? '';
            const itemType = element.getAttribute('data-item-type') ?? '';
            const isEquipped = element.querySelector('.wh40k-inv-equipped') !== null;

            // Check filters
            const matchesSearch = searchTerm === '' || itemName.includes(searchTerm);
            const matchesType = typeValue === '' || itemType === typeValue;
            const matchesStatus = statusValue === '' || (statusValue === 'equipped' && isEquipped) || (statusValue === 'unequipped' && !isEquipped);

            // Show/hide card
            if (matchesSearch && matchesType && matchesStatus) {
                element.style.display = '';
                visibleCount++;
            } else {
                element.style.display = 'none';
            }
        });

        // Toggle clear button visibility
        const clearBtn = this.element.querySelector<HTMLElement>('.wh40k-search-clear');
        if (clearBtn !== null) {
            clearBtn.style.display = searchTerm !== '' ? 'flex' : 'none';
        }

        // Show message if no results
        const existingMsg = equipmentPanel.querySelector('.wh40k-no-results');
        if (existingMsg) existingMsg.remove();

        if (visibleCount === 0 && itemCards.length > 0) {
            const noResults = document.createElement('div');
            noResults.className = 'wh40k-no-results';
            Object.assign(noResults.style, {
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--wh40k-space-sm, 0.5rem)',
                padding: 'var(--wh40k-space-lg, 1rem)',
                color: 'var(--color-text-tertiary)',
                fontStyle: 'italic',
                textAlign: 'center',
                pointerEvents: 'none',
            });
            noResults.innerHTML =
                '<i class="fas fa-search" style="font-size:2rem;opacity:0.5"></i><span style="font-size:var(--wh40k-font-size-base,0.9rem)">No items match your filters</span>';
            equipmentPanel.appendChild(noResults);
        }
    }

    /**
     * Handle clearing equipment search.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #clearEquipmentSearch(this: CharacterSheet, event: Event, _target: HTMLElement): void {
        const searchInput = this.element.querySelector<HTMLInputElement>('.wh40k-equipment-search');
        if (searchInput) {
            searchInput.value = '';
            // Clear stored filter state
            this._equipmentFilter = { search: '', type: '', status: '' };
            // Trigger filter update
            CharacterSheet.#filterEquipment.call(this, event, searchInput);
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
    static async #filterSkills(this: CharacterSheet, event: Event, _target: HTMLElement): Promise<void> {
        const input = event.currentTarget as HTMLInputElement;
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
     * @this {CharacterSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static async #clearSkillsSearch(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        // Reset all filters
        this._skillsFilter = { search: '', characteristic: '', training: '' };

        // Re-render skills tab
        await this.render({ parts: ['skills'] });
    }

    /**
     * Toggle favorite status for a skill.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the event.
     */
    static async #toggleFavoriteSkill(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const skillKey = target.dataset['skill'];
        if (skillKey === undefined || skillKey === '') return;

        // Get current favorite skills
        const favorites = (this.actor.getFlag('wh40k-rpg', 'favoriteSkills') as string[] | undefined) ?? [];
        const index = favorites.indexOf(skillKey);

        // Toggle. Storage order is irrelevant — _prepareFavoriteSkills sorts by display
        // label at render time (#6), so add / remove / re-add is stable alphabetically.
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(skillKey);
        }

        // Save
        await this.actor.setFlag('wh40k-rpg', 'favoriteSkills', favorites);

        // Re-render skills tab and overview tab
        await this.render({ parts: ['skills', 'overview'] });
    }

    /* -------------------------------------------- */

    /**
     * Toggle favorite status for a specialist skill entry.
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     * @this {CharacterSheet}
     */
    static async #toggleFavoriteSpecialistSkill(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const skillKey = target.dataset['skill'];
        const entryIndex = parseInt(target.dataset['index'] ?? '');
        if (skillKey === undefined || skillKey === '' || Number.isNaN(entryIndex)) return;

        // Create a unique key for this specialist skill entry
        const favoriteKey = `${skillKey}:${entryIndex}`;

        // Get current favorite specialist skills
        const favorites = (this.actor.getFlag('wh40k-rpg', 'favoriteSpecialistSkills') as string[] | undefined) ?? [];
        const index = favorites.indexOf(favoriteKey);

        // Storage order is irrelevant — render-time sort is authoritative (#6).
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(favoriteKey);
        }

        // Save
        await this.actor.setFlag('wh40k-rpg', 'favoriteSpecialistSkills', favorites);

        // Re-render skills tab (specialist skills live here now)
        await this.render({ parts: ['skills'] });
    }

    /* -------------------------------------------- */

    /**
     * Open dialog to add a new specialist skill.
     * Single-page dialog with cascading dropdowns populated from compendium indexes.
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     * @this {CharacterSheet}
     */
    static async #openAddSpecialistDialog(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        const { prepareCreateSpecialistSkillPrompt } = await import('../prompts/specialist-skill-dialog.ts');
        prepareCreateSpecialistSkillPrompt({
            actor: this.actor,
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
    static async #toggleFavoriteTalent(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;

        // Get current favorite talents
        const favorites = (this.actor.getFlag('wh40k-rpg', 'favoriteTalents') as string[] | undefined) ?? [];
        const index = favorites.indexOf(itemId);

        // Storage order is irrelevant — render-time sort is authoritative (#6).
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(itemId);
        }

        // Save
        await this.actor.setFlag('wh40k-rpg', 'favoriteTalents', favorites);

        // Re-render overview (favourite talents) and skills (full talent panel)
        await this.render({ parts: ['overview', 'skills'] });
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
    static async #filterTraits(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const form = target.closest('.wh40k-traits-filters');
        if (!form) return;

        const search = form.querySelector<HTMLInputElement>('[name=traits-search]')?.value ?? '';
        const category = form.querySelector<HTMLSelectElement>('[name=traits-category]')?.value ?? '';
        const hasLevel = form.querySelector<HTMLInputElement>('[name=traits-has-level]')?.checked ?? false;

        this._traitsFilter = { search, category, hasLevel };
        await this.render({ parts: ['skills'] }); // Trait panel is in skills tab
    }

    /**
     * Clear traits filter.
     * @param {Event} event  Triggering event
     * @param {HTMLElement} target  The button clicked
     * @this {CharacterSheet}
     * @private
     */
    static async #clearTraitsFilter(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        this._traitsFilter = { search: '', category: '', hasLevel: false };
        await this.render({ parts: ['skills'] }); // Trait panel is in skills tab
    }

    /**
     * Adjust trait level.
     * @param {Event} event  Triggering event
     * @param {HTMLElement} target  The button clicked
     * @this {CharacterSheet}
     * @private
     */
    static async #adjustTraitLevel(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset['itemId'];
        const parsedDelta = parseInt(target.dataset['delta'] ?? '');
        const delta = Number.isNaN(parsedDelta) ? 0 : parsedDelta;

        if (itemId === undefined || itemId === '') return;
        const item = this.actor.items.get(itemId);
        if (item === undefined) return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is Foundry DataModel; level not on base type; bracket access needs Record cast
        const levelNum = Number((item.system as Record<string, unknown>)['level']);
        const newLevel = Math.max(0, (Number.isNaN(levelNum) ? 0 : levelNum) + delta);
        await item.update({ 'system.level': newLevel });

        // Provide visual feedback
        ui.notifications.info(`${item.name} level ${delta > 0 ? 'increased' : 'decreased'} to ${newLevel}`);
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
    static async #createEffect(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            await this.actor.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'New Effect',
                    img: 'icons/svg/aura.svg',
                    disabled: false,
                    duration: {},
                    changes: [],
                },
            ]);

            this._notify('info', 'New effect created', {
                duration: 2000,
            });
        } catch (error) {
            this._notify('error', `Failed to create effect: ${(error as Error).message}`, {
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
    static async #toggleEffect(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        try {
            const effectId = target.dataset['effectId'];
            if (effectId === undefined || effectId === '') return;
            const effect = this.actor.effects.get(effectId);

            if (effect === undefined) {
                this._notify('warning', 'Effect not found', {
                    duration: 3000,
                });
                return;
            }

            await effect.update({ disabled: !effect.disabled });

            this._notify('info', `Effect ${effect.disabled ? 'disabled' : 'enabled'}`, {
                duration: 2000,
            });
        } catch (error) {
            this._notify('error', `Failed to toggle effect: ${(error as Error).message}`, {
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
    static async #deleteEffect(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        try {
            const effectId = target.dataset['effectId'];
            if (effectId === undefined || effectId === '') return;
            const effect = this.actor.effects.get(effectId);

            if (effect === undefined) {
                this._notify('warning', 'Effect not found', {
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
                this._notify('info', 'Effect deleted', {
                    duration: 2000,
                });
            }
        } catch (error) {
            this._notify('error', `Failed to delete effect: ${(error as Error).message}`, {
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
    static async #rollPower(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset['itemId'];
            if (itemId === undefined || itemId === '') return;
            const item = this.actor.items.get(itemId);
            if (item === undefined) {
                this._notify('warning', 'Power not found', { duration: 3000 });
                return;
            }

            // Use the actor's rollItem method for consistent handling
            await this.actor.rollItem(itemId);
        } catch (error) {
            this._notify('error', `Power roll failed: ${(error as Error).message}`, { duration: 5000 });
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
    static async #rollPowerDamage(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset['itemId'];
            if (itemId === undefined || itemId === '') return;
            const item = this.actor.items.get(itemId);
            if (item === undefined) {
                this._notify('warning', 'Power not found', { duration: 3000 });
                return;
            }

            // Use the actor's damageItem method
            await this.actor.damageItem(itemId);
        } catch (error) {
            this._notify('error', `Damage roll failed: ${(error as Error).message}`, { duration: 5000 });
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
    static async #vocalizePower(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset['itemId'];
            if (itemId === undefined || itemId === '') return;
            const item = this.actor.items.get(itemId);
            if (item === undefined) {
                this._notify('warning', 'Power not found', { duration: 3000 });
                return;
            }

            // Post to chat using the item's vocalize or toChat method
            if (typeof item.toChat === 'function') {
                await item.toChat();
            } else {
                // Fallback: create a simple chat message
                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    content: `<div class="wh40k-power-chat"><h3>${item.name}</h3><p>${item.system.description.value}</p></div>`,
                });
            }
        } catch (error) {
            this._notify('error', `Failed to post power: ${(error as Error).message}`, { duration: 5000 });
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
    static #togglePowerDetails(this: CharacterSheet, _event: Event, target: HTMLElement): void {
        const itemId = target.dataset['itemId'];
        const detailsEl = this.element.querySelector(`.wh40k-power-details[data-power-id="${itemId}"]`);

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
    static async #rollRitual(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset['itemId'];
            if (itemId === undefined || itemId === '') return;
            await this.actor.rollItem(itemId);
        } catch (error) {
            this._notify('error', `Ritual roll failed: ${(error as Error).message}`, { duration: 5000 });
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
    static async #vocalizeRitual(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset['itemId'];
            if (itemId === undefined || itemId === '') return;
            const item = this.actor.items.get(itemId);
            if (item === undefined) return;

            if (typeof item.toChat === 'function') {
                await item.toChat();
            } else {
                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    content: `<div class="wh40k-ritual-chat"><h3>${item.name}</h3><p>${item.system.description.value}</p></div>`,
                });
            }
        } catch (error) {
            this._notify('error', `Failed to post ritual: ${(error as Error).message}`, { duration: 5000 });
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
    static async #rollOrder(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset['itemId'];
            if (itemId === undefined || itemId === '') return;
            await this.actor.rollItem(itemId);
        } catch (error) {
            this._notify('error', `Order roll failed: ${(error as Error).message}`, { duration: 5000 });
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
    static async #vocalizeOrder(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        try {
            const itemId = target.dataset['itemId'];
            if (itemId === undefined || itemId === '') return;
            const item = this.actor.items.get(itemId);
            if (item === undefined) return;

            if (typeof item.toChat === 'function') {
                await item.toChat();
            } else {
                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    content: `<div class="wh40k-order-chat"><h3>${item.name}</h3><p>${item.system.description.value}</p></div>`,
                });
            }
        } catch (error) {
            this._notify('error', `Failed to post order: ${(error as Error).message}`, { duration: 5000 });
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
    static async #rollPhenomena(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            // Use the game.wh40k roll helper if available
            if (typeof game.wh40k.rollPsychicPhenomena === 'function') {
                await game.wh40k.rollPsychicPhenomena(this.actor);
            } else {
                // Fallback: roll on phenomena table
                /* eslint-disable no-restricted-syntax -- boundary: game.packs.getDocuments() returns untyped Foundry documents; cast to locate table by name and invoke draw() */
                const table = (game.tables.getName('Psychic Phenomena') ??
                    (await game.packs
                        .get('wh40k-rpg.wh40k-rolltables-psychic')
                        ?.getDocuments()
                        .then((docs: unknown[]) => docs.find((d: unknown) => (d as { name: string }).name.includes('Phenomena'))))) as
                    | { draw(): Promise<unknown> }
                    | undefined;
                /* eslint-enable no-restricted-syntax */

                if (table) {
                    await table.draw();
                } else {
                    // Simple d100 roll as last resort
                    const roll = await new Roll('1d100').evaluate();
                    await ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                        content: `<div class="wh40k-phenomena-roll"><h3>Psychic Phenomena</h3><p>Roll: ${roll.total}</p></div>`,
                        rolls: [roll],
                    });
                }
            }
        } catch (error) {
            this._notify('error', `Phenomena roll failed: ${(error as Error).message}`, { duration: 5000 });
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
    static async #rollPerils(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            // Use the game.wh40k roll helper if available
            if (typeof game.wh40k.rollPerilsOfTheWarp === 'function') {
                await game.wh40k.rollPerilsOfTheWarp(this.actor);
            } else {
                // Fallback: roll on perils table
                /* eslint-disable no-restricted-syntax -- boundary: game.packs.getDocuments() returns untyped Foundry documents; cast to locate table by name and invoke draw() */
                const table = (game.tables.getName('Perils of the Warp') ??
                    (await game.packs
                        .get('wh40k-rpg.wh40k-rolltables-psychic')
                        ?.getDocuments()
                        .then((docs: unknown[]) => docs.find((d: unknown) => (d as { name: string }).name.includes('Perils'))))) as
                    | { draw(): Promise<unknown> }
                    | undefined;

                /* eslint-enable no-restricted-syntax */
                if (table) {
                    await table.draw();
                } else {
                    // Simple d100 roll as last resort
                    const roll = await new Roll('1d100').evaluate();
                    await ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                        content: `<div class="wh40k-perils-roll"><h3>Perils of the Warp</h3><p>Roll: ${roll.total}</p></div>`,
                        rolls: [roll],
                    });
                }
            }
        } catch (error) {
            this._notify('error', `Perils roll failed: ${(error as Error).message}`, { duration: 5000 });
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
    static async #filterPowers(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const discipline = target.dataset['discipline'] ?? '';

        this._powersFilter.discipline = discipline;

        // Update active class on filter buttons
        const filterBtns = this.element.querySelectorAll('.wh40k-panel-psychic-powers .wh40k-filter-btn');
        filterBtns.forEach((btn: Element) => {
            btn.classList.toggle('active', (btn as HTMLElement).dataset['discipline'] === discipline);
        });

        // Re-render the powers part
        await this.render({ parts: ['powers'] });
    }

    /* -------------------------------------------- */

    /**
     * Handle filtering orders by category.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #filterOrders(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const category = target.dataset['category'] ?? '';

        this._powersFilter.orderCategory = category;

        // Update active class on filter buttons
        const filterBtns = this.element.querySelectorAll('.wh40k-panel-orders .wh40k-filter-btn');
        filterBtns.forEach((btn: Element) => {
            btn.classList.toggle('active', (btn as HTMLElement).dataset['category'] === category);
        });

        // Re-render the powers part
        await this.render({ parts: ['powers'] });
    }

    /* -------------------------------------------- */
    /*  Drag & Drop Override                        */
    /* -------------------------------------------- */

    /**
     * Override drop item to handle origin path updates.
     * @override
     */
    /**
     * After Foundry renders the sheet, wire HTML5 drag-and-drop reorder on the
     * favourite-skills / favourite-talents lists. Each row carries a
     * `data-favourite-key` and lives inside a parent `[data-favourite-list="skills|talents"]`
     * container. On drop, splice the flag array and persist. See issue #6.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 _onRender signature uses Record<string, unknown>
    override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);

        const lists = this.element.querySelectorAll('[data-favourite-list]');
        for (const list of Array.from(lists) as HTMLElement[]) {
            const kind = list.dataset['favouriteList'];
            if (kind !== 'skills' && kind !== 'talents') continue;
            const flagKey = kind === 'skills' ? 'favoriteSkills' : 'favoriteTalents';

            let dragKey: string | null = null;
            list.addEventListener('dragstart', (event) => {
                const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-favourite-key]');
                if (row === null || row === undefined) return;
                dragKey = row.dataset['favouriteKey'] ?? null;
                if (event.dataTransfer !== null) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', dragKey ?? '');
                }
                row.style.opacity = '0.4';
            });
            list.addEventListener('dragend', (event) => {
                const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-favourite-key]');
                if (row !== null && row !== undefined) row.style.opacity = '';
                dragKey = null;
            });
            list.addEventListener('dragover', (event) => {
                event.preventDefault();
                if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
            });
            list.addEventListener('drop', (event) => {
                event.preventDefault();
                const targetRow = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-favourite-key]');
                const dropKey = targetRow?.dataset['favouriteKey'] ?? null;
                if (dragKey === null || dropKey === null || dragKey === dropKey) return;
                const flag = (this.actor.getFlag('wh40k-rpg', flagKey) as string[] | undefined) ?? [];
                const next = flag.slice();
                const from = next.indexOf(dragKey);
                if (from === -1) return;
                next.splice(from, 1);
                let to = next.indexOf(dropKey);
                if (to === -1) to = next.length;
                next.splice(to, 0, dragKey);
                void this.actor.setFlag('wh40k-rpg', flagKey, next);
            });
        }
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry BaseActorSheet _onDropItem returns unknown; overriding preserves the upstream return type
    override async _onDropItem(event: DragEvent, item: WH40KItem): Promise<unknown> {
        // Progression-eligible drops (talents) route through the AdvancementDialog rather
        // than landing on the actor directly — talents cost XP per RAW, so silently creating
        // them on drop bypasses the advancement economy. Already-owned talents fall through
        // to the normal sort path. See issue #17.
        const isUnknownTalent = item.type === 'talent' && this.actor.items.get(item.id ?? '') === undefined;
        if (isUnknownTalent) {
            const careerKey = (this.actor.system as { originPath?: { career?: string } }).originPath?.career ?? 'rogueTrader';
            AdvancementDialog.open(this.actor, { careerKey });
            this._notify('info', game.i18n.format('WH40K.Advancement.PurchaseTalentViaAdvancement', { name: item.name }), {
                duration: 5000,
            });
            return false;
        }

        const result = await super._onDropItem(event, item);

        // If dropped item is an origin path (trait with origin flag), re-render biography part
        const flags = item.flags as { rt?: { kind?: string } } | undefined;
        const isOriginPath = item.type === 'originPath' || (item.type === 'trait' && flags?.rt?.kind === 'origin');

        if (isOriginPath) {
            // Render only the biography part to update origin path panel
            await this.render({ parts: ['biography'] });
        }

        return result;
    }
}
