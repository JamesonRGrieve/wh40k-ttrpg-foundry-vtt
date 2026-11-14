/**
 * @file CharacterSheet - Character sheet for acolyte/character actors using ApplicationV2
 * This is the main player character sheet for WH40K RPG
 */

import { bcAscend } from '../../actions/bc-daemon-prince-actions.ts';
import { bcRollGiftCharacteristic } from '../../actions/bc-gift-actions.ts';
import { bcPsychicTest } from '../../actions/bc-psychic-actions.ts';
import { bcPerformRitual } from '../../actions/bc-ritual-actions.ts';
import { daemonologyLoreTotal, findDaemonologyLore } from '../../actions/daemonology-actions.ts';
import { dwSelectAmmo } from '../../actions/dw-ammo-actions.ts';
import { dwAstartesToggleImplant } from '../../actions/dw-astartes-actions.ts';
import { dwCohesionChallenge, dwCohesionRally, dwCohesionRecoverObjective } from '../../actions/dw-cohesion-actions.ts';
import { dwCompleteMission, dwToggleComplication, dwToggleObjective } from '../../actions/dw-mission-actions.ts';
import { dwEnterSquadMode, dwLeaveSquadMode } from '../../actions/dw-mode-actions.ts';
import { dwReleaseOath, dwSwearOath } from '../../actions/dw-oath-actions.ts';
import { dwRenownAward, dwRenownLoss } from '../../actions/dw-renown-actions.ts';
import { dwRequisitionItem, dwRequisitionPool } from '../../actions/dw-requisition-actions.ts';
import { owRequestSupport, owToggleAward } from '../../actions/ow-battlefield-actions.ts';
import { owComradeHeal, owComradeMental, owComradeRecover, owComradeReplace, owComradeWound } from '../../actions/ow-comrade-actions.ts';
import { owComradeMedicae, owComradeReplace2, owComradeTickDay, owComradeToggleRefit } from '../../actions/ow-comrade-healing-actions.ts';
import { owAddComrade, owRemoveComrade, owToggleDrawback } from '../../actions/ow-drawback-actions.ts';
import { owAdjustSituational, owLogisticsTest, owToggleMunitorum } from '../../actions/ow-logistics-actions.ts';
import { owRequestGear } from '../../actions/ow-mission-gear-actions.ts';
import { owMountedAction } from '../../actions/ow-mount-actions.ts';
import { owIssueOrder } from '../../actions/ow-orders-actions.ts';
import { owRegimentEdit } from '../../actions/ow-regiment-actions.ts';
import { owVehicleAction } from '../../actions/ow-vehicle-actions.ts';
import { grappleRulesFor, inquestRulesFor, SystemConfigRegistry } from '../../config/game-systems/index.ts';
import type { GameSystemId, SidebarHeaderField } from '../../config/game-systems/types.ts';
import { SYSTEM_ID } from '../../constants.ts';
import type { WH40KAcolyte } from '../../documents/acolyte.ts';
import { WH40KBaseActor } from '../../documents/base-actor.ts';
import { type DarkPactItem, isDarkPactItem, strikeDarkPact } from '../../documents/dark-pacts.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { isMedal, resolveAwardDescriptors } from '../../documents/ow-awards.ts';
import { isRegimentalDrawback, resolveDrawbackDescriptors } from '../../documents/ow-drawbacks.ts';
import { lineResourceRows } from '../../rules/acquisition-resources.ts';
import type { PsyMode } from '../../rules/bc-psychic-strength.ts';
import { hasCrusaderRole } from '../../rules/crusader.ts';
import type { PactRecord } from '../../rules/dark-pact.ts';
import { hasFanaticRole } from '../../rules/fanatic.ts';
import { grapplePanelSections, readGrappleOpponentUuid, readGrappleState } from '../../rules/grapple.ts';
import type { RegimentDrawback } from '../../rules/ow-regiment-drawback.ts';
import type { RegimentalAward } from '../../rules/ow-regimental-award.ts';
import type { PossessionSlot } from '../../rules/possession.ts';
import { activeRulesetVariant } from '../../rules/ruleset-variant.ts';
import type { WH40KActorSystemData, WH40KArmourLocation } from '../../types/global.d.ts';
import { firstSystemId } from '../../utils/chat-system-id.ts';
import { errorMessage } from '../../utils/error-message.ts';
import { ORIGIN_PROMPT_DISMISSED_FLAG, originPathPromptContent, SHEET_SOURCE_FLAG, shouldPromptOriginPath } from '../../utils/origin-path-prompt.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import * as StatActions from '../api/stat-adjustment-actions.ts';
import AdvancementDialog from '../dialogs/advancement-dialog.ts';
import CharacteristicSetupDialog from '../dialogs/characteristic-setup-dialog.ts';
import { inquestPanelRows } from '../dialogs/inquest-view.ts';
import type { SchemaSheetLayout } from '../item/schema-sheet-layout.ts';
import { CHARACTER_EXTRA_LAYOUT } from './actor-schema-layouts.ts';
import BaseActorSheet, { type SkillLike, type CharacteristicLike } from './base-actor-sheet.ts';
import * as AcquisitionActions from './character/acquisition-actions.ts';
import * as ActiveEffectActions from './character/active-effect-actions.ts';
import * as BiographyActions from './character/biography-actions.ts';
import * as CombatActions from './character/combat-actions.ts';
import * as CombatContext from './character/combat-context.ts';
import * as DarkPactActions from './character/dark-pact-actions.ts';
import * as EquipmentActions from './character/equipment-actions.ts';
import * as EquipmentFilterActions from './character/equipment-filter-actions.ts';
import * as ExperienceActions from './character/experience-actions.ts';
import * as LinePanels from './character/line-panels.ts';
import * as OriginContext from './character/origin-context.ts';
import * as OverviewContext from './character/overview-context.ts';
import * as PossessionActions from './character/possession-actions.ts';
import * as PowerActions from './character/power-actions.ts';
import {
    dialogV2,
    toast,
    RESOURCE_WALLETS_EDITED_ELSEWHERE,
    type SheetTabConfig,
    type CharacterSheetContext,
    type OriginSummary,
    type UtilityMenuOption,
    type SystemPanels,
} from './character/sheet-support.ts';
import * as SkillActions from './character/skill-actions.ts';
import * as TalentActions from './character/talent-actions.ts';
import * as TraitActions from './character/trait-actions.ts';
import { SIDEBAR_CONTAINER } from './sidebar-container.ts';

/**
 * Actor sheet for Acolyte/Character type actors.
 */
export default class CharacterSheet extends BaseActorSheet {
    /** The elective aptitudes and mutations note the templates lack, edited through the shared schema rows (#738). */
    static override SCHEMA_LAYOUT: SchemaSheetLayout | null = CHARACTER_EXTRA_LAYOUT;

    declare actor: WH40KAcolyte;
    declare document: WH40KAcolyte & BaseActorSheet['document'];
    declare isEditable: boolean;
    /**
     * Memoised diff produced by `_prepareCombatData` within one render pass
     * (#507). Cleared at the top of `_prepareContext`; replayed by the second
     * call from `_prepareTabPartContext` so the preparation runs once, not twice.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: holds a slice of Foundry's untyped sheet-context payload
    _combatDataCache: Record<string, unknown> | null = null;
    /** The ship-orders panel's active category filter (`''` = all). */
    _orderCategoryFilter = '';
    /** This render's Regimental Drawback descriptors, by drawback UUID (#160). */
    _drawbackDescriptors = new Map<string, RegimentDrawback>();
    /** This render's conferred medal descriptors, by medal UUID (content#32). */
    _awardDescriptors = new Map<string, RegimentalAward>();
    /**
     * Ephemeral BC Psychic Strength selections (#178). Mode and push
     * level are render-only UI state — they are not persisted on the
     * actor. The panel reads these via `psychicPanel` each render.
     */
    _bcPsyMode: PsyMode = 'unfettered';
    _bcPsyPushLevel = 0;
    declare _equipmentFilter: { search: string; type: string; status: string };
    declare _skillsFilter: { search: string; characteristic: string; training: string; [key: string]: string };
    /* eslint-enable no-restricted-syntax */
    declare _throttleTimers?: Map<string, number>;
    declare _originPathSummary?: OriginSummary;
    /**
     * The line this sheet class renders, set on the PROTOTYPE by `makeSystemVariant()`
     * (game-system-sheets.ts). `declare` emits no own property: a plain class field
     * initialises to `undefined` on every instance and shadows the prototype value,
     * which left every per-line sheet resolving its line from the actor alone (#596).
     */
    declare readonly _gameSystemId?: GameSystemId;

    /** Origin-path option cache keyed by game system id (packs don't change at runtime). */
    readonly _originOptionsCache = new Map<GameSystemId, Record<string, string[]>>();

    /**
     * Resolve the active rules line for this sheet instance.
     * Shared parent logic must derive this from the concrete child/system state
     * rather than hardcoding a game-specific fallback.
     */
    protected _resolveGameSystemId(): GameSystemId | null {
        if (this._gameSystemId) return this._gameSystemId;
        // The actor-system read is the shared firstSystemId knowledge; this method
        // only layers registry validation on top (#461).
        const raw = firstSystemId(this.actor);
        return raw !== undefined && SystemConfigRegistry.has(raw) ? (raw as GameSystemId) : null;
    }

    /** @override */
    static override DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        ...BaseActorSheet.DEFAULT_OPTIONS,
        actions: {
            ...(BaseActorSheet.DEFAULT_OPTIONS.actions ?? {}),
            'viewFateUses': BiographyActions.viewFateUses,
            // Open a compendium/world document from a clicked reference (#389 —
            // divination line under the portrait; reusable for any data-uuid link).
            'openUuid': BiographyActions.openUuid,
            // Combat actions
            'attack': CombatActions.attack,
            'dodge': CombatActions.dodge,
            'parry': CombatActions.parry,
            'initiative': CombatActions.rollInitiative,
            'assign-damage': CombatActions.assignDamage,
            'toggleFavoriteAction': CombatActions.toggleFavoriteAction,
            'combatAction': CombatActions.combatAction,
            'vocalizeCombatAction': CombatActions.vocalizeCombatAction,
            'combatTalentDescribe': CombatActions.combatTalentDescribe,
            'vocalizeMovement': CombatActions.vocalizeMovement,
            'setMovementMode': CombatActions.setMovementMode,
            // Per-turn action economy (#264) — spend/reset from the combat tab readout.
            'spendAction': CombatActions.spendAction,
            'resetActions': CombatActions.resetActions,

            'toggleAgeMode': BiographyActions.toggleAgeMode,

            // Stat adjustment actions — extracted to api/stat-adjustment-actions.ts
            'adjustStat': StatActions.adjustStat,
            'applyCharacteristicDamage': PossessionActions.applyCharacteristicDamage,
            'increment': StatActions.increment,
            'decrement': StatActions.decrement,
            'setCriticalPip': StatActions.setCriticalPip,
            'setFateStar': StatActions.setFateStar,
            'setFatigueBolt': StatActions.setFatigueBolt,
            'setWoundPip': StatActions.setWoundPip,
            'setShockPip': StatActions.setShockPip,
            'setCorruption': StatActions.setCorruption,
            'setInsanity': StatActions.setInsanity,
            'restoreFate': StatActions.restoreFate,
            'spendFate': StatActions.spendFate,

            // Possession track (#82)
            'unleashDaemon': PossessionActions.unleashDaemon,
            'resetPossessionSession': PossessionActions.resetPossessionSession,
            'possessionFrenzyTest': PossessionActions.possessionFrenzyTest,
            'possessionMismanifest': PossessionActions.possessionMismanifest,
            // Daemonology rituals (DH2) — Exorcism (#83).
            'performExorcism': PossessionActions.performExorcism,
            // Daemonology rituals — Summoning (#80).
            'performSummoning': PossessionActions.performSummoning,

            // Shock / Snap-Out-Of-It (#66 — "Shock And Snapping Out Of It")
            'snapOutOfShock': PossessionActions.snapOutOfShock,

            // Pinning resist / escape ("Pinning") — route through the unified
            // roll so Willpower talents/traits surface as situational modifiers.
            'rollPinningTest': PossessionActions.rollPinningTest,
            'escapePinning': PossessionActions.escapePinning,

            // Fanatic role: Death to All Who Oppose Me (#93)
            'deathToAllWhoOpposeMe': PossessionActions.deathToAllWhoOpposeMe,

            // Crusader role: Smite the Unholy (#141)
            'smiteTheUnholy': PossessionActions.smiteTheUnholy,

            // Manacles condition (#105 — errata)
            'applyManacles': PossessionActions.applyManacles,
            'liftManacles': PossessionActions.liftManacles,

            // Ace role: Right Stuff Fate-spend (#100)
            'openRightStuff': PossessionActions.openRightStuff,

            // Grapple options (#120): each line's printed options, by role
            'grappleOption': PossessionActions.grappleOption,

            // Subtlety panel (#87) — DH2 warband-subtlety stepper + breakdown popout.
            'adjustSubtletyManually': BiographyActions.adjustSubtletyManually,
            'viewSubtletyBreakdown': BiographyActions.viewSubtletyBreakdown,
            // Inquest panel (#90) — GM opens the warband Inquest tracker.
            'openInquestTracker': BiographyActions.openInquestTracker,

            // Malignancy Test owed by a Corruption gain (Corruption Track lines).
            'rollMalignancyTest': BiographyActions.rollMalignancyTest,

            // BC Alignment / Infamy advancement panel (#173).
            'recheckBcAlignment': BiographyActions.recheckBcAlignment,
            'buyBcInfamyAdvance': BiographyActions.buyBcInfamyAdvance,

            // BC Psychic Strength panel (#178).
            'bcPsychicTest': bcPsychicTest,

            // DW engines: Cohesion (#162), Squad Mode (#163), Renown (#164),
            // Requisition (#165), Astartes implants (#167).
            'dwCohesionRally': dwCohesionRally,
            'dwCohesionRecoverObjective': dwCohesionRecoverObjective,
            'dwCohesionChallenge': dwCohesionChallenge,
            'dwEnterSquadMode': dwEnterSquadMode,
            'dwLeaveSquadMode': dwLeaveSquadMode,
            'dwRenownAward': dwRenownAward,
            'dwRenownLoss': dwRenownLoss,
            'dwRequisitionItem': dwRequisitionItem,
            'dwRequisitionPool': dwRequisitionPool,
            'dwAstartesToggleImplant': dwAstartesToggleImplant,

            // OW engines: Regiment (#151), Comrade (#152), Orders (#153),
            // Logistics (#154).
            'owRegimentEdit': owRegimentEdit,
            'owComradeWound': owComradeWound,
            'owComradeHeal': owComradeHeal,
            'owComradeReplace': owComradeReplace,
            'owComradeRecover': owComradeRecover,
            'owComradeMental': owComradeMental,
            'owIssueOrder': owIssueOrder,
            'owLogisticsTest': owLogisticsTest,
            'owToggleMunitorum': owToggleMunitorum,
            'owAdjustSituational': owAdjustSituational,

            // Batch-2 engines:
            //   BC Ritual (#179), Gifts (#180), Supplements (#181), Daemon Prince (#182).
            //   DW Special Ammo (#172), Distinctions (#171), Oath (#168),
            //   Mission (#169), Vehicle Crit (#170).
            //   OW Mission Gear (#155).
            'bcPerformRitual': bcPerformRitual,
            'bcRollGiftCharacteristic': bcRollGiftCharacteristic,
            'bcAscend': bcAscend,
            'dwSelectAmmo': dwSelectAmmo,
            'dwSwearOath': dwSwearOath,
            'dwReleaseOath': dwReleaseOath,
            'dwToggleObjective': dwToggleObjective,
            'dwToggleComplication': dwToggleComplication,
            'dwCompleteMission': dwCompleteMission,
            'owRequestGear': owRequestGear,
            // Batch-3 actions
            'owVehicleAction': owVehicleAction,
            'owComradeTickDay': owComradeTickDay,
            'owComradeMedicae': owComradeMedicae,
            'owComradeReplace2': owComradeReplace2,
            'owComradeToggleRefit': owComradeToggleRefit,
            // Batch-4 actions (#159, #160, #161)
            'owMountedAction': owMountedAction,
            'owToggleDrawback': owToggleDrawback,
            'owAddDrawback': LinePanels.owAddDrawback,
            'owAddAward': LinePanels.owAddAward,
            'owAddComrade': owAddComrade,
            'owRemoveComrade': owRemoveComrade,
            'owRequestSupport': owRequestSupport,
            'owToggleAward': owToggleAward,

            // Equipment actions
            'toggleEquip': EquipmentActions.toggleEquip,
            'useItem': EquipmentActions.useItem,
            'stowItem': EquipmentActions.stowItem,
            'unstowItem': EquipmentActions.unstowItem,
            'stowToShip': EquipmentActions.stowToShip,
            'unstowFromShip': EquipmentActions.unstowFromShip,
            'swapCheckedItems': EquipmentActions.swapCheckedItems,
            'giveCheckedItems': EquipmentActions.giveCheckedItems,
            'toggleActivate': EquipmentActions.toggleActivate,
            'filterEquipment': EquipmentFilterActions.filterEquipment,
            'clearEquipmentSearch': EquipmentFilterActions.clearEquipmentSearch,
            'bulkEquip': EquipmentActions.bulkEquip,

            // Skills actions
            'filterSkills': SkillActions.filterSkills,
            'clearSkillsSearch': SkillActions.clearSkillsSearch,
            'toggleFavoriteSkill': SkillActions.toggleFavoriteSkill,
            'toggleFavoriteSpecialistSkill': SkillActions.toggleFavoriteSpecialistSkill,
            // cycleSkillTraining/cycleSpecialistTraining removed — skill ranks are now
            // live-computed from origin path items + XP advances. Use Advancement Dialog.

            // Talents actions
            'toggleFavoriteTalent': TalentActions.toggleFavoriteTalent,
            'filterTraits': TraitActions.filterTraits,
            'clearTraitsFilter': TraitActions.clearTraitsFilter,
            'adjustTraitLevel': TraitActions.adjustTraitLevel,
            'openAddSpecialistDialog': SkillActions.openAddSpecialistDialog,

            // Powers actions
            'rollPower': PowerActions.rollPower,
            'rollPowerDamage': PowerActions.rollPowerDamage,
            'vocalizePower': PowerActions.vocalizePower,
            'togglePowerDetails': PowerActions.togglePowerDetails,
            'rollRitual': PowerActions.rollRitual,
            'vocalizeRitual': PowerActions.vocalizeRitual,
            'rollOrder': PowerActions.rollOrder,
            'vocalizeOrder': PowerActions.vocalizeOrder,
            'rollPhenomena': PowerActions.rollPhenomena,
            'rollPerils': PowerActions.rollPerils,
            'filterOrders': PowerActions.filterOrders,

            // Acquisition actions
            'addAcquisition': AcquisitionActions.addAcquisition,
            'openAcquisition': AcquisitionActions.openAcquisition,
            'removeAcquisition': AcquisitionActions.removeAcquisition,
            'openAcquisitionDialog': DarkPactActions.openAcquisitionDialog,

            // Dark Pact actions (#84)
            'adjustPactDisposition': DarkPactActions.adjustPactDisposition,
            'togglePactDiscovered': DarkPactActions.togglePactDiscovered,
            'togglePactPayment': DarkPactActions.togglePactPayment,
            'togglePactEntry': DarkPactActions.togglePactEntry,
            'addDarkPact': DarkPactActions.addDarkPact,
            'removeDarkPact': DarkPactActions.removeDarkPact,

            // Endeavour actions (Rogue Trader)
            'completeObjective': DarkPactActions.completeObjective,
            'completeEndeavour': DarkPactActions.completeEndeavour,

            // Colony actions (Rogue Trader, #195)
            'openColonyGrowthDialog': DarkPactActions.openColonyGrowthDialog,

            // Experience actions
            'customXP': ExperienceActions.customXP,
            'openAdvancement': ExperienceActions.openAdvancement,

            // Active Effect actions
            'createEffect': ActiveEffectActions.createEffect,
            'toggleEffect': ActiveEffectActions.toggleEffect,
            'deleteEffect': ActiveEffectActions.deleteEffect,

            // Biography actions
            'openOriginPathBuilder': BiographyActions.openOriginPathBuilder,

            // Characteristic setup
            'openCharacteristicSetup': BiographyActions.openCharacteristicSetup,

            // Utility menu
            'showUtilityMenu': BiographyActions.showUtilityMenu,

            // Window controls
            'resetWindowSize': BiographyActions.resetWindowSize,

            // Misc actions
            'bonusVocalize': ExperienceActions.bonusVocalize,
        },
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
     * The per-system panels this sheet builds, keyed by game system. The
     * character's are the Overview tab's panels, which read the character
     * DataModel's advancement ledgers; a subclass whose actor type lacks those
     * fields declares its own set.
     */
    static SYSTEM_PANELS: SystemPanels = LinePanels.PANEL_BUILDERS;

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
            container: SIDEBAR_CONTAINER,
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/player/tabs.hbs',
            container: SIDEBAR_CONTAINER,
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
        { tab: 'overview', label: 'WH40K.Tabs.Overview', tooltip: 'WH40K.Tabs.Tooltip.Overview', group: 'primary', cssClass: 'tab-overview' },
        // Status tab removed (#263) — its panels were consolidated into Overview.
        { tab: 'skills', label: 'WH40K.Tabs.Statistics', tooltip: 'WH40K.Tabs.Tooltip.Skills', group: 'primary', cssClass: 'tab-skills' },
        // talents tab removed — content moved to overview and skills tabs
        { tab: 'combat', label: 'WH40K.Tabs.Combat', tooltip: 'WH40K.Tabs.Tooltip.Combat', group: 'primary', cssClass: 'tab-combat' },
        { tab: 'equipment', label: 'WH40K.Tabs.Equipment', tooltip: 'WH40K.Tabs.Tooltip.Equipment', group: 'primary', cssClass: 'tab-equipment' },
        { tab: 'biography', label: 'WH40K.Tabs.Biography', tooltip: 'WH40K.Tabs.Tooltip.Biography', group: 'primary', cssClass: 'tab-biography' },
    ];

    /* -------------------------------------------- */

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
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<HandlebarsContext> {
        const context = (await super._prepareContext(options)) as CharacterSheetContext;

        // New render pass — drop the memoised combat-data diff (#507) so the
        // next `_prepareCombatData` recomputes from current actor state.
        this._combatDataCache = null;

        // isGM / dh / inEditMode come from BaseActorSheet._prepareCommonContext (called by super).
        // Ruleset state is character-specific.

        // Ruleset state (DH2e only) — controls Throne Gelt visibility
        const activeGameSystem = this._resolveGameSystemId();
        const capabilities = (activeGameSystem === null ? null : SystemConfigRegistry.getOrNull(activeGameSystem))?.characterSheet;
        const ruleset = WH40KSettings.getRuleset();
        context.ruleset = ruleset;
        if (capabilities !== undefined) context.capabilities = capabilities;
        const onlyWar = capabilities?.onlyWarPanels === true;
        context.malignancyTestsDue = this.actor.usesMalignancyTest ? this.actor.system.malignancyTestsPending : 0;

        // Per-system panels — table-driven (#282). The sheet class's SYSTEM_PANELS
        // entries for the active system are written into the context under their
        // exact partial-facing keys; non-listed systems (DH2/DH1/RT/IM) build no
        // panels, and the `{{#if capabilities.…}}` tab gates keep their include sites no-op.
        // The drawback panel's refunds come from each drawback item's Regiment Creation Points (#160).
        if (onlyWar) this._drawbackDescriptors = await resolveDrawbackDescriptors(LinePanels.regimentDrawbackIds.call(this));
        // The Battlefield panel's awards come from each conferred medal item (#161, content#32).
        if (onlyWar) this._awardDescriptors = await resolveAwardDescriptors(LinePanels.regimentalAwardIds.call(this));

        if (activeGameSystem !== null) {
            for (const { key, build } of (this.constructor as typeof CharacterSheet).SYSTEM_PANELS[activeGameSystem] ?? []) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic panel-context key written into the free-form CharacterSheetContext
                (context as Record<string, unknown>)[key] = build(this);
            }
        }

        // Daemonology rituals (DH2) — shown to a DH2 character that
        // carries a Forbidden Lore (Daemonology) row, the test every ritual opens with.
        if (capabilities?.daemonologyRituals === true && findDaemonologyLore(this.actor.system) !== undefined) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: sheet→template payload written into the free-form CharacterSheetContext
            (context as Record<string, unknown>)['daemonologyPanel'] = { loreTotal: daemonologyLoreTotal(this.actor.system) };
        }

        // Subtlety adjusters (#87) — surfaced for the DH2 Subtlety panel template
        // (`src/templates/actor/panel/subtlety-panel.hbs`). Collected on the
        // active actor via `WH40KBaseActor.collectSubtletyAdjusters()`; safe to
        // compute on every render because it's a thin tree-walk of owned items.
        if (capabilities?.subtletyPool === true) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: sheet→template payload; the typed `CollectedAdjuster[]` is widened to fit the free-form CharacterSheetContext shape.
            (context as Record<string, unknown>)['subtletyAdjusters'] = this.actor.collectSubtletyAdjusters();
        }
        // Warband Inquests (#90) — read-only progress for the Party Overview panel,
        // built only for a line whose config prints Inquest rules (DH2).
        const inquestRules = inquestRulesFor(activeGameSystem ?? undefined);
        if (inquestRules !== null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: sheet→template payload written into the free-form CharacterSheetContext
            (context as Record<string, unknown>)['inquestPanel'] = {
                canOpen: game.user.isGM,
                rows: inquestPanelRows(inquestRules, WH40KSettings.getWarbandInquests()),
            };
        }
        // The line's RAW / homebrew variant, for a line that has one (#715).
        const variant = activeRulesetVariant(activeGameSystem);
        context.isHomebrew = variant === 'homebrew';
        const isRaw = variant === 'raw';
        context.isRaw = isRaw;
        context.hideThroneGelt = isRaw;
        // A line without the ruleset-shaped Influence trio shows its own acquisition
        // currency + the gelt baseline (the trio itself is in the template).
        if (capabilities?.influenceResources !== true && activeGameSystem !== null) {
            context.resourceRows = lineResourceRows(activeGameSystem, CONFIG.wh40k.currencies, RESOURCE_WALLETS_EDITED_ELSEWHERE).map((row) => ({
                ...row,
                // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.getProperty returns unknown for a dynamic wallet path
                value: foundry.utils.getProperty(this.actor, row.field) as number | undefined,
            }));
        }

        // In DH2 RAW mode Influence is a percentile characteristic (testable for Requisition,
        // social, and Investigation rolls). Surface it on the characteristics map so the
        // Statistics panel iterates it alongside WS/BS/etc. without schema duplication.
        if (isRaw) {
            OverviewContext.injectInfluenceAsCharacteristic.call(this, context);
        }

        // Prepare characteristic HUD data
        OverviewContext.prepareCharacteristicHUD.call(this, context);

        // Prepare origin path
        context.originPathSteps = OriginContext.prepareOriginPathSteps.call(this);
        context.originPathSummary = OriginContext.getOriginPathSummary.call(this);

        // Prepare navigator powers and ship roles (compute fresh)
        const categorized = OverviewContext.getCategorizedItems.call(this);
        context.navigatorPowers = this.actor.items.filter((item) => (item.type as string) === 'navigatorPower' || (item as WH40KItem).isNavigatorPower);
        context.shipRoles = this.actor.items.filter((item) => (item.type as string) === 'shipRole' || (item as WH40KItem).isShipRole);

        // Prepare item counts for panel headers
        context.talentsCount = this.actor.items.filter((item) => (item as WH40KItem).isTalent).length;
        context.traitsCount = this.actor.items.filter((item) => (item as WH40KItem).isTrait).length;

        // Prepare loadout/equipment data (uses cached categorized items)
        OverviewContext.prepareLoadoutData.call(this, context, categorized);

        // Prepare combat station data (uses cached categorized items)
        CombatContext.prepareCombatData.call(this, context, categorized);

        // Prepare WH40K RPG specific fields
        if (context.system) {
            // eslint-disable-next-line no-restricted-syntax -- rogueTrader is an untyped sub-object on the sheet context; ?? {} is necessary to ensure a defined object is passed
            context.system.rogueTrader = OverviewContext.prepareWH40KFields.call(this, context.system.rogueTrader ?? {});
        }

        // Prepare dynasty tab data
        context.dynastyData = OverviewContext.prepareDynastyData.call(this);

        // Prepare Endeavours (Rogue Trader) — embedded `endeavour` items the
        // Dynasty is currently pursuing. The panel partial reads this hash.
        // eslint-disable-next-line no-restricted-syntax -- boundary: context is the Foundry render payload, a free-form record under fvtt-types
        (context as Record<string, unknown>)['endeavours'] = this.actor.items.filter((item) => (item.type as string) === 'endeavour');

        // Fanatic role detection (#93 — DH2): the actor
        // owns the role whose `system.identifier` is `fanatic`.
        context.hasFanatic = hasFanaticRole(this.actor.items);

        // Crusader role detection (#141); matches "Crusader"
        // or "Smite the Unholy".
        context.hasCrusader = hasCrusaderRole(Array.from(this.actor.items));

        // Grapple state (#120), read from the system-scoped flag, and the options the
        // line prints for this actor's role (the GM sees both roles' options).
        context.grappleState = readGrappleState(this.actor.flags, SYSTEM_ID);
        context.grappleSections = grapplePanelSections(
            grappleRulesFor(this._resolveGameSystemId() ?? undefined),
            context.grappleState,
            game.user.isGM,
            (skill) => this._grappleSkillLabel(skill),
        );

        return context;
    }

    /**
     * A skill's label on the grapple panel: the actor's own skill entry. An NPC
     * carries no `system.skills` (its skills are `trainedSkills`), so its sheet
     * overrides this with the line's catalog label (#420: a grappled NPC's sheet
     * threw here).
     */
    protected _grappleSkillLabel(skill: string): string {
        const skills: Readonly<Partial<Record<string, { label?: string }>>> = this.actor.system.skills;
        return skills[skill]?.label ?? skill;
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
    override async _preparePartContext(partId: string, context: HandlebarsContext, options: ApplicationRenderOptions): Promise<HandlebarsContext> {
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

        if (partId === 'header') return this._prepareHeaderContext(partContext, options);
        if (partId === 'tabs') return this._prepareTabsContext(partContext, options);
        if (partId === 'biography') return OriginContext.prepareBiographyContext.call(this, partContext, options);
        if (partId === 'overview') return OverviewContext.prepareOverviewDashboardContext.call(this, partContext, options);
        if (partId === 'combat' || partId === 'skills' || partId === 'equipment' || partId === 'dynasty') {
            // Provide tab object for the template
            return this._prepareTabPartContext(partId, partContext, options);
        }
        return partContext;
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
            // Aptitude pills (relocated here from the Overview dashboard) with
            // per-source attribution (DH2e/BC/OW). Empty on non-aptitude systems.
            sheetContext.aptitudePills = OriginContext.prepareAptitudePills.call(this);
        }

        // Navigator powers, rituals and ship orders live on the Combat tab (#194).
        if (partId === 'combat') {
            Object.assign(context, CombatContext.prepareCombatPowerPanelsContext.call(this));
        }

        // Loadout/combat-station data does not survive into the isolated part
        // context, so re-prepare it for the tabs that render inventory and the
        // combat station (mirrors the skills re-prep above). Without this
        // the Equipment tab renders an empty inventory even though the actor
        // carries items.
        if (partId === 'equipment' || partId === 'combat') {
            const categorized = OverviewContext.getCategorizedItems.call(this);
            OverviewContext.prepareLoadoutData.call(this, context, categorized);
            CombatContext.prepareCombatData.call(this, context, categorized);
        }

        return context;
    }

    /* -------------------------------------------- */

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
        const originOptions = gameSystem ? await OriginContext.getOriginPathOptions.call(this, gameSystem) : {};
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
            tooltip: game.i18n.localize(tab.tooltip ?? tab.label),
        }));
        return context;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _onFirstRender(context: HandlebarsContext, options: ApplicationRenderOptions): Promise<void> {
        await super._onFirstRender(context, options);

        // Nudge the user to build an unfinished character via the origin-path
        // builder (the d20 on the portrait isn't obvious enough). Fire-and-forget
        // so the dialog doesn't block the sheet's first render.
        void this._maybePromptOriginPathIncomplete();

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

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /** OW Mount panel (#155). Surfaces the rider's mount link (resolved name +
     *  trait badges) and the four RAW mounted special actions. The template gates
     *  the readout and the Issue buttons on `mount` being non-null. */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /**
     * The armour at one hit location, as the silhouette shows it (`total`
     * includes TB). A PC's creature model prepares one entry per location;
     * actor types whose armour has another shape override this (#611).
     * @protected
     */
    _armourAtLocation(system: WH40KActorSystemData, locationKey: string): WH40KArmourLocation {
        // eslint-disable-next-line no-restricted-syntax -- boundary: system.armour is typed loosely on WH40KActorSystemData; narrow per location key
        const rawArmour = system.armour?.[locationKey];
        return {
            value: rawArmour?.value ?? 0,
            total: rawArmour?.total ?? 0,
            toughnessBonus: rawArmour?.toughnessBonus ?? 0,
            traitBonus: rawArmour?.traitBonus ?? 0,
        };
    }

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /* -------------------------------------------- */

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
        parts.push(`${char?.label !== undefined && char.label !== '' ? char.label : game.i18n.localize('WH40K.Characteristic.SelectLabel')} ${charValue}`);

        // Training modifier
        if (!trained) {
            parts.push(game.i18n.localize('WH40K.Tooltip.Skill.UntrainedHalfBase'));
        } else if (plus20) {
            parts.push(game.i18n.localize('WH40K.Tooltip.Skill.TrainingPlus20'));
        } else if (plus10) {
            parts.push(game.i18n.localize('WH40K.Tooltip.Skill.TrainingPlus10'));
        } else {
            parts.push(game.i18n.localize('WH40K.Skills.Trained'));
        }

        // Bonus from items/effects
        if (bonus !== 0) {
            parts.push(game.i18n.format('WH40K.Tooltip.Skill.BonusValue', { bonus: `${bonus > 0 ? '+' : ''}${bonus}` }));
        }

        return parts.join(' | ');
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
        // Equipment data is prepared in _prepareLoadoutData; nothing further here.
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

    /* -------------------------------------------- */
    /*  Event Handlers - Equipment Actions          */
    /* -------------------------------------------- */

    /**
     * Handle toggling item equipped state.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */

    /* -------------------------------------------- */

    /**
     * Apply a stow-state patch to the item a clicked control refers to. The four
     * stow/ship-storage actions differ only by their `system.state.*` patch.
     * @this {CharacterSheet}
     * @param {HTMLElement} target              Button that was clicked.
     * @param {Record<string, boolean>} patch   Dotted `system.state.*` writes.
     */
    async _setStowState(target: HTMLElement, patch: Record<string, boolean>): Promise<void> {
        const item = this._resolveItemFromTarget(target);
        if (!item) return;
        await item.update(patch);
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Dark Pacts (#84)           */
    /* -------------------------------------------- */

    /** The `system.pacts` index a Dark Pacts control carries in `data-pact-index`, or `null`. */
    _pactIndex(target: HTMLElement): number | null {
        const index = parseInt(target.dataset['pactIndex'] ?? '-1', 10);
        return Number.isNaN(index) || index < 0 || index >= this.actor.system.pacts.length ? null : index;
    }

    /** Rewrite one pact record (the Daemon's Disposition and the GM's bookkeeping). */
    async _updatePact(index: number, change: (record: PactRecord) => PactRecord): Promise<void> {
        const pacts = this.actor.system.pacts.map((record, i) => (i === index ? change(record) : record));
        await this.actor.update({ 'system.pacts': pacts });
    }

    /* -------------------------------------------- */

    /** Strike a pact, or say the character already holds it. */
    async _strikeDarkPact(pact: DarkPactItem): Promise<void> {
        const struck = await strikeDarkPact(this.actor, pact);
        if (!struck) this._notify('warning', game.i18n.format('WH40K.DarkPact.AlreadyHeld', { pact: pact.name }));
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Possession Track (#82)     */
    /* -------------------------------------------- */

    /**
     * Read the actor's possession slot, defaulting any missing field so the
     * pure helpers in `module/rules/possession.ts` always see a complete
     * shape. Centralized so both action methods stay tight.
     * @returns {PossessionSlot}
     * @private
     */
    _readPossessionSlot(): PossessionSlot {
        const raw = (this.actor.system as { possession?: Partial<PossessionSlot> } | undefined)?.possession;
        const state = raw?.state ?? 'none';
        const unleashUsed = typeof raw?.unleashUsed === 'number' ? raw.unleashUsed : 0;
        const unleashMax = typeof raw?.unleashMax === 'number' ? raw.unleashMax : 0;
        return { state, unleashUsed, unleashMax };
    }

    /**
     * Post a possession Frenzy/Mismanifest chat card. Mirrors the
     * disorder-roll-dialog render+create pattern (chat templates render
     * outside the sheet root; the renderChatMessageHTML hook supplies the
     * `.wh40k-rpg` ancestor).
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: data is passed straight into foundry.applications.handlebars.renderTemplate which accepts an arbitrary template context
    async _postPossessionChat(data: Record<string, unknown>): Promise<void> {
        data['_gameSystemId'] = firstSystemId(this.actor);
        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/possession-frenzy-chat.hbs', data);
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: game.user.id, content: html, speaker: { alias: this.actor.name } } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
    }

    /**
     * Opposed-Willpower Mismanifest contest following a Psychic Phenomena
     * result on Possession (#132). A loss escalates to full possession.
     * The daemon's Willpower mirrors the actor's until combat targeting is
     * wired (same placeholder convention as the grapple opposed roller).
     * @this {CharacterSheet}
     */

    /**
     * The other participant of this actor's grapple: the one recorded on its
     * grapple flag, else the user's single targeted token's actor. Null when
     * neither names someone other than this actor.
     */
    async _grappleOpponent(): Promise<WH40KBaseActor | null> {
        const recorded = readGrappleOpponentUuid(this.actor.flags, SYSTEM_ID);
        const fromFlag = recorded === null ? null : await fromUuid(recorded);
        if (fromFlag instanceof WH40KBaseActor && fromFlag.id !== this.actor.id) return fromFlag;
        const targeted = Array.from(game.user.targets).flatMap((token) =>
            token.actor instanceof WH40KBaseActor && token.actor.id !== this.actor.id ? [token.actor] : [],
        );
        return targeted.length === 1 ? targeted.at(0) ?? null : null;
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Biography Actions          */
    /* -------------------------------------------- */

    /**
     * On first open of an unbuilt character, prompt to run the origin-path
     * builder — the d20 on the portrait isn't obvious enough. NPCs, a completed
     * origin path, an authored-build pregen (#541) and a "don't show again"
     * never prompt; see {@link shouldPromptOriginPath}. The d20 stays the
     * always-on entry point.
     */
    async _maybePromptOriginPathIncomplete(): Promise<void> {
        const sheetSource = this.actor.getFlag('wh40k-rpg', SHEET_SOURCE_FLAG);
        const prompt = shouldPromptOriginPath({
            isOwner: this.actor.isOwner,
            promptEnabled: WH40KSettings.isOriginPathPromptEnabled(),
            actorType: this.actor.type,
            originPath: this.actor.system.originPath,
            dismissed: this.actor.getFlag('wh40k-rpg', ORIGIN_PROMPT_DISMISSED_FLAG) === true,
            sheetSource: typeof sheetSource === 'string' ? sheetSource : undefined,
        });
        if (!prompt) return;

        const content = originPathPromptContent(
            game.i18n.localize('WH40K.OriginPath.IncompletePrompt.Message'),
            game.i18n.localize('WH40K.OriginPath.IncompletePrompt.DontShowAgain'),
        );

        const readDontShow = (button: HTMLElement): boolean => {
            const form = (button as HTMLElement & { form?: HTMLFormElement }).form;
            return (form?.elements.namedItem('dontShowAgain') as HTMLInputElement | null)?.checked === true;
        };

        // Mutable container: the flag is set inside the button callbacks, which
        // TS/ESLint control-flow can't see (a plain `let` would narrow to false).
        const promptState = { dismiss: false };
        const choice = await dialogV2.wait({
            // Modal so the dialog renders in the browser top layer (showModal) and
            // can't be covered by the character sheet it was opened from. Narrow +
            // taller so the long prompt message wraps comfortably instead of
            // stretching the auto-width dialog across the screen.
            modal: true,
            position: { width: 300, height: 320 },
            window: { title: game.i18n.localize('WH40K.OriginPath.IncompletePrompt.Title') },
            content,
            buttons: [
                {
                    action: 'build',
                    label: game.i18n.localize('WH40K.OriginPath.IncompletePrompt.Confirm'),
                    icon: 'fas fa-dice-d20',
                    default: true,
                    callback: (_event: Event, button: HTMLElement): string => {
                        promptState.dismiss = readDontShow(button);
                        return 'build';
                    },
                },
                {
                    action: 'later',
                    label: game.i18n.localize('WH40K.OriginPath.IncompletePrompt.Later'),
                    callback: (_event: Event, button: HTMLElement): string => {
                        promptState.dismiss = readDontShow(button);
                        return 'later';
                    },
                },
            ],
        });

        if (promptState.dismiss) {
            await this.actor.setFlag('wh40k-rpg', ORIGIN_PROMPT_DISMISSED_FLAG, true);
        }
        if (choice === 'build') {
            await this._openOriginPathBuilder();
        }
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
            ui.notifications.error(`${game.i18n.localize('WH40K.Utility.OriginPathError')}: ${errorMessage(error)}`);
            console.error('Origin Path Builder error:', error);
        }
    }

    /* -------------------------------------------- */
    /*  Drag & Drop Override                        */
    /* -------------------------------------------- */

    /**
     * After Foundry renders the sheet, wire HTML5 drag-and-drop reorder on the
     * favourite-skills / favourite-talents lists. Each row carries a
     * `data-favourite-key` and lives inside a parent `[data-favourite-list="skills|talents"]`
     * container. On drop, splice the flag array and persist. See issue #6.
     */
    override async _onRender(context: HandlebarsContext, options: ApplicationRenderOptions): Promise<void> {
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

    /**
     * Whether a dropped talent the actor lacks must be bought through the XP
     * Advancement dialog. True for player characters; sheets for actors that hold
     * talents without an XP economy (NPCs) override it.
     */
    protected _buysTalentsWithXp(): boolean {
        return true;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry BaseActorSheet _onDropItem returns unknown; overriding preserves the upstream return type
    override async _onDropItem(event: DragEvent, item: WH40KItem): Promise<unknown> {
        // Progression-eligible drops (talents) route through the AdvancementDialog rather
        // than landing on the actor directly — talents cost XP per RAW, so silently creating
        // them on drop bypasses the advancement economy. Already-owned talents fall through
        // to the normal sort path. See issue #17. Actors that don't buy talents with XP
        // (NPCs) opt out, so the talent lands on them like any other item.
        // A Dark Pact is struck, not owned: it becomes a `system.pacts` record (#84).
        if (isDarkPactItem(item)) {
            await this._strikeDarkPact(item);
            return false;
        }
        // A Regimental Drawback is recorded on an Only War character, not owned (#160).
        if (isRegimentalDrawback(item) && 'regimentDrawbacks' in this.actor.system) {
            await LinePanels.recordRegimentalDrawback.call(this, item.uuid ?? '', item.name);
            return false;
        }
        // So is a medal conferred on it (content#32).
        if (isMedal(item) && 'regimentalAwards' in this.actor.system) {
            await LinePanels.recordRegimentalAward.call(this, item.uuid ?? '', item.name);
            return false;
        }

        const isUnknownTalent = item.type === 'talent' && this.actor.items.get(item.id ?? '') === undefined && this._buysTalentsWithXp();
        if (isUnknownTalent) {
            const careerKey = (this.actor.system as { originPath?: { career?: string } }).originPath?.career ?? 'rogueTrader';
            AdvancementDialog.open(this.actor, { careerKey });
            this._notify('info', game.i18n.format('WH40K.Advancement.PurchaseTalentViaAdvancement', { name: item.name }), {
                duration: 5000,
            });
            return false;
        }

        // Origin paths are authored in compendiums and consumed through the
        // Origin Path Builder — dragging one onto an actor is not the supported
        // build flow. Reject it (with guidance) unless the world has opted into
        // freeform character building. See issue #219.
        const flags = item.flags as { rt?: { kind?: string } } | undefined;
        const isOriginPath = item.type === 'originPath' || (item.type === 'trait' && flags?.rt?.kind === 'origin');
        const alreadyOwned = item.id !== null && item.id !== '' && this.actor.items.get(item.id) !== undefined;

        if (isOriginPath && !alreadyOwned && !WH40KSettings.isFreeformCharactersEnabled()) {
            this._notify('warning', game.i18n.localize('WH40K.OriginPath.UseBuilderOnDrop'), { duration: 6000 });
            return false;
        }

        const result = await super._onDropItem(event, item);

        if (isOriginPath) {
            // Render only the biography part to update origin path panel
            await this.render({ parts: ['biography'] });
        }

        return result;
    }
}
