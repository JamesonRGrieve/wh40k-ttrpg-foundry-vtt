/**
 * @file CharacterSheet - Character sheet for acolyte/character actors using ApplicationV2
 * This is the main player character sheet for WH40K RPG
 */

import { DHBasicActionManager } from '../../actions/basic-action-manager.ts';
import { bcAscend } from '../../actions/bc-daemon-prince-actions.ts';
import { bcPsychicTest } from '../../actions/bc-psychic-actions.ts';
import { bcPerformRitual } from '../../actions/bc-ritual-actions.ts';
import { bcToggleQuickAndTheDead } from '../../actions/bc-supplements-actions.ts';
import { dwSelectAmmo } from '../../actions/dw-ammo-actions.ts';
import { dwAstartesToggleImplant } from '../../actions/dw-astartes-actions.ts';
import { dwCohesionChallenge, dwCohesionRally, dwCohesionRecoverObjective } from '../../actions/dw-cohesion-actions.ts';
import { dwToggleDistinction, dwToggleMark } from '../../actions/dw-distinction-actions.ts';
import { dwCompleteMission, dwToggleComplication, dwToggleObjective } from '../../actions/dw-mission-actions.ts';
import { dwEnterSquadMode, dwLeaveSquadMode } from '../../actions/dw-mode-actions.ts';
import { dwReleaseOath, dwSwearOath } from '../../actions/dw-oath-actions.ts';
import { dwRenownAward, dwRenownLoss } from '../../actions/dw-renown-actions.ts';
import { dwRequisitionItem, dwRequisitionPool } from '../../actions/dw-requisition-actions.ts';
import { dwVehicleRepair, dwVehicleRollCrit } from '../../actions/dw-vehicle-actions.ts';
import { owRequestSupport, owToggleAward } from '../../actions/ow-battlefield-actions.ts';
import { owComradeHeal, owComradeReplace, owComradeWound } from '../../actions/ow-comrade-actions.ts';
import { owComradeMedicae, owComradeReplace2, owComradeTickDay } from '../../actions/ow-comrade-healing-actions.ts';
import { owAddComrade, owRemoveComrade, owToggleDrawback } from '../../actions/ow-drawback-actions.ts';
import { owAdjustSituational, owLogisticsTest, owToggleMunitorum } from '../../actions/ow-logistics-actions.ts';
import { owRequestGear } from '../../actions/ow-mission-gear-actions.ts';
import { owMountedAction } from '../../actions/ow-mount-actions.ts';
import { owIssueOrder } from '../../actions/ow-orders-actions.ts';
import { owRegimentEdit } from '../../actions/ow-regiment-actions.ts';
import { owVehicleAction } from '../../actions/ow-vehicle-actions.ts';
import { DHTargetedActionManager } from '../../actions/targeted-action-manager.ts';
import { AptitudeBasedSystemConfig } from '../../config/game-systems/aptitude-based-system-config.ts';
import { BC_INFAMY_ADVANCE_CAP, BC_INFAMY_INCREMENT, infamyAdvanceCost } from '../../config/game-systems/bc-advancement-config.ts';
import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import type { ChaosAlignment, GameSystemId, SidebarHeaderField } from '../../config/game-systems/types.ts';
import { DW_SELECTED_AMMO_CHOICES, type DwSelectedAmmoId } from '../../data/actor/mixins/dw-ammo-template.ts';
import { buildOwCraftsmanshipPanel } from '../../data/actor/mixins/ow-craftsmanship-template.ts';
import type { WH40KAcolyte } from '../../documents/acolyte.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { summarizeChanges, type EffectChangeRaw } from '../../helpers/effects.ts';
import { AssignDamageData, type ActorLike } from '../../rolls/assign-damage-data.ts';
import { Hit } from '../../rolls/damage-data.ts';
import {
    deriveAlignmentFromTally,
    nextAlignmentCheckpoint,
    psykerLockedByAlignment,
    shouldRecheckAlignment,
    tallyAdvancesByAlignment,
    type ChaosAdvanceEntry,
} from '../../rules/bc-alignment-derivation.ts';
import {
    DAEMON_PRINCE_CORRUPTION_THRESHOLD,
    DAEMON_PRINCE_INFAMY_THRESHOLD,
    getDaemonPrinceBoost,
    isAscended,
    type DaemonPrinceAlignment,
    type DaemonPrinceStatBoost,
} from '../../rules/bc-daemon-prince.ts';
import { maxPushLevel, resolvePsychicTest, type PsyMode } from '../../rules/bc-psychic-strength.ts';
import {
    daemonEngineRageBonus,
    QUICK_AND_THE_DEAD_BONUS_BY_ALIGNMENT,
    quickAndTheDeadInitiativeBonus,
    type QuickAndTheDeadAlignment,
} from '../../rules/bc-supplement-mechanics.ts';
import { DEATH_TO_OPPOSE_DURATION_ROUNDS, MORTIFICATION_OF_THE_FLESH } from '../../rules/chaos-backgrounds.ts';
import { SMITE_THE_UNHOLY_FATE_COST, hasCrusaderRole, resolveSmiteTheUnholyDoS } from '../../rules/crusader.ts';
import { adjustPactDisposition, type PactDisposition } from '../../rules/dark-pact.ts';
import {
    ASTARTES_IMPLANTS,
    astartesStrengthBonus,
    astartesToughnessBonus,
    hasBlackCarapace,
    IMPLANT_EFFECTS,
    type AstartesImplantId,
} from '../../rules/dw-astartes.ts';
import { isOathActive } from '../../rules/dw-oath.ts';
import { getRenownRank, RENOWN_RANK_ORDER, RENOWN_THRESHOLDS, type RenownRank } from '../../rules/dw-renown.ts';
import { DW_SPECIAL_AMMO_EFFECTS, type AmmoEffect } from '../../rules/dw-special-ammo.ts';
import { getSupportRange } from '../../rules/dw-squad-mode.ts';
import {
    resolveBreakGrapple,
    resolveDamageOpponent,
    resolveMoveWhileGrappling,
    resolveStandUpInGrapple,
    resolveThrowDownOpponent,
    type GrappleResolution,
    type GrappleState,
    type OpposedStrengthInput,
} from '../../rules/grapple.ts';
import { applyManaclesCondition, liftManaclesCondition } from '../../rules/manacles.ts';
import { OW_DEFAULT_LOGISTICS_RATING } from '../../rules/ow-logistics.ts';
import { canIssueOrder, GENERIC_ORDERS } from '../../rules/ow-orders.ts';
import {
    applyMismanifest,
    canUnleashDaemon,
    resetSessionUnleash,
    resolveFrenzyTest,
    resolveMismanifestPossession,
    spendUnleashDaemon,
    type PossessionSlot,
} from '../../rules/possession.ts';
import { TransactionManager } from '../../transactions/transaction-manager.ts';
import type { WH40KActorSystemData, WH40KItemSystemData } from '../../types/global.d.ts';
import { errorMessage } from '../../utils/error-message.ts';
import { formatSigned } from '../../utils/format.ts';
import { gameSystemPackPrefix } from '../../utils/game-system-pack-prefix.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import type { DialogV2Like, TextEditorImplementationLike } from '../api/application-types.ts';
import * as EffectActions from '../api/effect-actions.ts';
import * as StatActions from '../api/stat-adjustment-actions.ts';
import AcquisitionDialog from '../dialogs/acquisition-dialog.ts';
import AdvancementDialog from '../dialogs/advancement-dialog.ts';
import CharacteristicSetupDialog from '../dialogs/characteristic-setup-dialog.ts';
import ConfirmationDialog from '../dialogs/confirmation-dialog.ts';
import FateUsesDialog from '../dialogs/fate-uses-dialog.ts';
import TransactionRequestDialog from '../dialogs/transaction-request-dialog.ts';
import { prepareAssignDamageRoll } from '../prompts/assign-damage-dialog.ts';
import ColonyGrowthDialog from '../prompts/colony-growth-dialog.ts';
import { openRightStuffDialog } from '../prompts/right-stuff-dialog.ts';
import BaseActorSheet, { ADVANCE_XP_COSTS, type SkillLike, type CharacteristicLike } from './base-actor-sheet.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is untyped V14 API; double-cast is the only way to extract the TextEditor implementation
const TextEditor = (foundry.applications as unknown as { ux: { TextEditor: { implementation: TextEditorImplementationLike } } }).ux.TextEditor.implementation;
// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is untyped V14 API; double-cast is the only way to extract DialogV2
const dialogV2 = (foundry.applications as unknown as { api: { DialogV2: DialogV2Like } }).api.DialogV2;
// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is untyped V14 API; Toast is an optional extension with no shipped types
const toast = (foundry.applications as unknown as { api?: { Toast?: Record<string, (...args: unknown[]) => void> } }).api?.Toast;

/**
 * Convert a kebab-case (or bare) id to PascalCase for building langpack keys —
 * e.g. `squad-mode` → `SquadMode`. Single source for the (formerly six)
 * identical inline definitions across the engine-panel context builders (#284).
 */
function titleCase(s: string): string {
    return s.replace(/(^|-)([a-z])/g, (_m, _p, c: string) => c.toUpperCase());
}

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
    tooltip?: string;
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
    isBC?: boolean;
    isOW?: boolean;
    isDW?: boolean;
    isHomebrew?: boolean;
    isRaw?: boolean;
    alignmentPanel?: BcAlignmentPanelContext;
    psychicPanel?: BcPsychicPanelContext;
    astartesPanel?: DwAstartesPanelContext;
    cohesionPanel?: DwCohesionPanelContext;
    modePanel?: DwModePanelContext;
    renownPanel?: DwRenownPanelContext;
    requisitionPanel?: DwRequisitionPanelContext;
    regimentPanel?: OwRegimentPanelContext;
    comradePanel?: OwComradePanelContext;
    logisticsPanel?: OwLogisticsPanelContext;
    ordersPanel?: OwOrdersPanelContext;
    // Batch-2 panel contexts.
    ritualPanel?: BcRitualPanelContext;
    giftsPanel?: BcGiftsPanelContext;
    supplementsPanel?: BcSupplementsPanelContext;
    daemonPrincePanel?: BcDaemonPrincePanelContext;
    distinctionPanel?: DwDistinctionPanelContext;
    ammoPanel?: DwAmmoPanelContext;
    oathPanel?: DwOathPanelContext;
    missionPanel?: DwMissionPanelContext;
    vehiclePanel?: DwVehiclePanelContext;
    missionGearPanel?: OwMissionGearPanelContext;
    vehicleMovementPanel?: OwVehicleMovementPanelContext;
    comradeHealingPanel?: OwComradeHealingPanelContext;
    craftsmanshipPanel?: OwCraftsmanshipPanelContext;
    mountPanel?: Record<string, unknown>;
    drawbackPanel?: Record<string, unknown>;
    battlefieldPanel?: Record<string, unknown>;
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
    hasPenitent?: boolean;
    hasFanatic?: boolean;
    hasCrusader?: boolean;
    grappleState?: GrappleState;
};

/**
 * Render payload for the BC Alignment / Infamy panel (#173). The fields
 * are read by `src/templates/actor/panel/bc-alignment-panel.hbs` and
 * documented in its header comment. Built by `_prepareBcAlignmentPanel`
 * only when the active game system is BC.
 */
type BcAlignmentPanelContext = {
    current: ChaosAlignment;
    derived: ChaosAlignment;
    tally: { khorne: number; nurgle: number; slaanesh: number; tzeentch: number };
    pendingFlip: boolean;
    checkpoint: number;
    corruption: number;
    nextCheckpoint: number;
    recheckDue: boolean;
    psykerLocked: boolean;
    infamy: number;
    infamyCost: number | null;
    infamyCap: number;
    infamyIncrement: number;
};

/* -------------------------------------------------------------------- */
/*  Per-engine panel context shapes (batch-1 integration)               */
/* -------------------------------------------------------------------- */

/** BC Psychic Strength panel (#178). */
type BcPsychicPanelContext = {
    psykerClass: string;
    psyRating: number;
    sustainedPowerCount: number;
    mode: PsyMode;
    pushLevel: number;
    maxPushLevel: number;
    effectivePR: number;
    sustainPenalty: number;
    phenomenaRolls: number;
};

/** DW Astartes implants panel (#167). */
type DwAstartesPanelContext = {
    implants: Array<{ id: AstartesImplantId; nameKey: string; categoryKey: string; has: boolean }>;
    strengthBonus: number;
    toughnessBonus: number;
    hasBlackCarapace: boolean;
};

/** DW Kill-team Cohesion panel (#162). */
type DwCohesionPanelContext = {
    current: number;
    max: number;
    lostThisTurn: number;
    rallied: boolean;
    canRally: boolean;
    canRecover: boolean;
};

/** DW Squad Mode panel (#163). */
type DwModePanelContext = {
    mode: string;
    renownRank: string;
    renownRankKey: string;
    supportRange: { visual: number; vocal: number };
    sustainedAbilities: Array<{ id: string; label: string }>;
};

/** DW Renown panel (#164). */
type DwRenownPanelContext = {
    value: number;
    rank: string;
    rankLabel: string;
    nextRank: string | null;
    nextRankLabel: string | null;
    rankMin: number;
    nextRankMin: number | null;
    progressPercent: number;
};

/** DW Requisition panel (#165). */
type DwRequisitionPanelContext = {
    rp: number;
    missionRating: string;
    renownRank: string;
};

/** OW Regiment panel (#151). */
type OwRegimentPanelContext = {
    selection: unknown;
    kit: ReadonlyArray<{ id: string; cost: number }>;
};

/** OW Comrade panel (#152). */
type OwComradePanelContext = {
    comrade: unknown;
};

/** OW Logistics panel (#154). */
type OwLogisticsPanelContext = {
    rating: number;
    munitorum: boolean;
    situational: number;
};

/** OW Orders panel (#153). */
type OwOrdersPanelContext = {
    available: Array<{
        orderId: string;
        nameKey: string;
        effectKey: string;
        actionCostKey: string;
        actionCost: string;
        canIssue: boolean;
        blockReasonKey: string | null;
    }>;
    sweepingActive: Array<{ orderId: string; appliedCount: number }>;
};

/* -------------------------------------------------------------------- */
/*  Per-engine panel context shapes (batch-2 integration)               */
/* -------------------------------------------------------------------- */

/** BC Chaos Ritual panel (#179). */
type BcRitualPanelContext = {
    ritualMastery: number;
};

/** BC Gifts of the Gods panel (#180). The full gift catalogue lives in
 *  compendium (Direction #7); without a live catalogue lookup at sheet
 *  render time we surface the persisted ids plus the current alignment
 *  and let the panel's empty-state path handle missing display data. */
type BcGiftsPanelContext = {
    currentAlignment: 'unaligned' | 'khorne' | 'nurgle' | 'slaanesh' | 'tzeentch';
    gifts: Array<{
        id: string;
        name: string;
        baseDescription: string;
        riderDescription: string;
        appliedAlignment: string;
        subTableLabel: string;
        characteristicDelta: Array<{ key: string; value: number }>;
        traits: string[];
        activeEffects: string[];
    }>;
    mergedDelta: Array<{ key: string; value: number }>;
};

/** BC Supplement Mechanics panel (#181). */
type BcSupplementsPanelContext = {
    daemonEngineRating: number;
    daemonEngineActive: boolean;
    turnsSinceLastDamage: number;
    daemonEngineRageBonus: number;
    quickAndTheDeadActive: boolean;
    chaosAlignment: QuickAndTheDeadAlignment;
    baseInitiative: number;
    quickAndTheDeadBonus: number;
    quickAndTheDeadInitiative: number;
};

/** BC Daemon Prince ascension panel (#182). */
type BcDaemonPrincePanelContext = {
    ascended: boolean;
    ascendedAt: number | null;
    alignmentAtAscension: DaemonPrinceAlignment;
    infamy: number;
    corruption: number;
    infamyThreshold: number;
    corruptionThreshold: number;
    canAscend: boolean;
    boost: DaemonPrinceStatBoost | null;
};

/** DW Distinctions panel (#171). Catalogue resolution is compendium-driven;
 *  without a live catalogue lookup the orchestrator-built context surfaces
 *  the persisted id lists and a stub merged-grant readout the engine
 *  produces from an empty MarkOfDistinction set. */
type DwDistinctionPanelContext = {
    distinctions: Array<{
        id: string;
        name: string;
        renownReward: number;
        renownRequired: string;
        earned: boolean;
        rankTooLow: boolean;
    }>;
    marks: Array<{
        id: string;
        name: string;
        description: string;
        borne: boolean;
    }>;
    merged: {
        characteristicDelta: Array<{ key: string; value: number; displayValue: string }>;
        traits: string[];
    };
};

/** DW Special-Issue Ammo panel (#172). */
type DwAmmoPanelContext = {
    selected: DwSelectedAmmoId;
    selectedLabel: string;
    options: Array<{
        id: DwSelectedAmmoId;
        label: string;
        selected: boolean;
        summary: string;
    }>;
    effect: AmmoEffect | null;
};

/** DW Mission Oath panel (#168). */
type DwOathPanelContext = {
    isLeader: boolean;
    active: boolean;
    activeOathId: string | null;
    activeLabel: string | null;
    canSwear: boolean;
    canRelease: boolean;
};

/** DW Mission framework panel (#169). */
type DwMissionPanelContext = {
    hasMission: boolean;
    mission: {
        id: string;
        name: string;
        rating: 'standard' | 'extended' | 'priority' | 'critical';
        ratingLabel: string;
        objectives: Array<{
            id: string;
            description: string;
            renownReward: number;
            xpReward: number;
            status: 'pending' | 'complete' | 'failed';
            statusLabel: string;
        }>;
        complications: Array<{
            id: string;
            description: string;
            renownPenalty: number;
            triggered: boolean;
        }>;
    } | null;
};

/** DW Vehicle Critical Hit / Repair panel (#170). */
type DwVehiclePanelContext = {
    integrity: number;
    overIntegrity: number;
    canRollCrit: boolean;
    canRepair: boolean;
};

/** OW Mission Assignment Gear panel (#155). */
type OwMissionGearPanelContext = {
    hasOutcome: boolean;
    outcomeKey: string | null;
};

type OwVehicleMovementPanelContext = {
    actions: Array<{ id: string; nameKey: string; timingKey: string; descriptionKey: string }>;
    chase: { active: boolean; pursuerDistance: number; dangerZone: boolean; turnCount: number };
};

type OwComradeHealingPanelContext = {
    recoveryDays: number;
    refitAvailable: boolean;
    canTick: boolean;
    canMedicae: boolean;
    canReplace: boolean;
    statusKey: string;
};

type OwCraftsmanshipPanelContext = ReturnType<typeof buildOwCraftsmanshipPanel>;

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
        state: { equipped: boolean; activated: boolean };
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
 * Per-system overview-panel registry (#282). Replaces the three copy-pasted
 * `if (isBC)/if (isDW)/if (isOW)` dispatch blocks with one table: the active
 * system's entries are looped and each `build` result written into the context
 * under its `key`. Adding a system's panel is now a one-row edit. The exact
 * context-key names the `.hbs` partials read are preserved verbatim.
 */
interface PanelBuilder {
    key: string;
    build: (sheet: CharacterSheet) => object;
}

/** OW pass-through panels read `system.*` by string key (no dedicated _prepare method yet). */
function owSystemRecord(sheet: CharacterSheet): Record<string, unknown> {
    return sheet.actor.system;
}

const PANEL_BUILDERS: Partial<Record<GameSystemId, readonly PanelBuilder[]>> = {
    bc: [
        { key: 'alignmentPanel', build: (s) => s._prepareBcAlignmentPanel() },
        { key: 'psychicPanel', build: (s) => s._prepareBcPsychicPanel() },
        { key: 'ritualPanel', build: (s) => s._prepareBcRitualPanel() },
        { key: 'giftsPanel', build: (s) => s._prepareBcGiftsPanel() },
        { key: 'supplementsPanel', build: (s) => s._prepareBcSupplementsPanel() },
        { key: 'daemonPrincePanel', build: (s) => s._prepareBcDaemonPrincePanel() },
    ],
    dw: [
        { key: 'cohesionPanel', build: (s) => s._prepareDwCohesionPanel() },
        { key: 'modePanel', build: (s) => s._prepareDwModePanel() },
        { key: 'renownPanel', build: (s) => s._prepareDwRenownPanel() },
        { key: 'requisitionPanel', build: (s) => s._prepareDwRequisitionPanel() },
        { key: 'astartesPanel', build: (s) => s._prepareDwAstartesPanel() },
        { key: 'oathPanel', build: (s) => s._prepareDwOathPanel() },
        { key: 'missionPanel', build: (s) => s._prepareDwMissionPanel() },
        { key: 'vehiclePanel', build: (s) => s._prepareDwVehiclePanel() },
        { key: 'distinctionPanel', build: (s) => s._prepareDwDistinctionPanel() },
        { key: 'ammoPanel', build: (s) => s._prepareDwAmmoPanel() },
    ],
    ow: [
        { key: 'regimentPanel', build: (s) => s._prepareOwRegimentPanel() },
        { key: 'comradePanel', build: (s) => s._prepareOwComradePanel() },
        { key: 'ordersPanel', build: (s) => s._prepareOwOrdersPanel() },
        { key: 'logisticsPanel', build: (s) => s._prepareOwLogisticsPanel() },
        { key: 'missionGearPanel', build: (s) => s._prepareOwMissionGearPanel() },
        { key: 'vehicleMovementPanel', build: (s) => s._prepareOwVehicleMovementPanel() },
        { key: 'comradeHealingPanel', build: (s) => s._prepareOwComradeHealingPanel() },
        { key: 'craftsmanshipPanel', build: (s) => buildOwCraftsmanshipPanel(Array.from(s.actor.items.values())) },
        { key: 'mountPanel', build: (s) => ({ mountedOn: owSystemRecord(s)['mountedOn'] ?? null }) },
        {
            key: 'drawbackPanel',
            build: (s) => ({ drawbacks: owSystemRecord(s)['regimentDrawbacks'] ?? [], multiComradeRoster: owSystemRecord(s)['multiComradeRoster'] ?? null }),
        },
        {
            key: 'battlefieldPanel',
            build: (s) => ({ supportCooldown: owSystemRecord(s)['supportCooldown'] ?? 0, awards: owSystemRecord(s)['regimentalAwards'] ?? [] }),
        },
    ],
};

/**
 * Actor sheet for Acolyte/Character type actors.
 */
export default class CharacterSheet extends BaseActorSheet {
    declare actor: WH40KAcolyte;
    declare document: WH40KAcolyte & BaseActorSheet['document'];
    declare isEditable: boolean;
    _powersFilter: { discipline: string; orderCategory: string } = { discipline: '', orderCategory: '' };
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
    private readonly _gameSystemId?: GameSystemId;

    /** Origin-path option cache keyed by game system id (packs don't change at runtime). */
    readonly #originOptionsCache = new Map<GameSystemId, Record<string, string[]>>();

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
            'viewFateUses': CharacterSheet.#viewFateUses,
            // Combat actions
            'attack': CharacterSheet.#attack,
            'dodge': CharacterSheet.#dodge,
            'parry': CharacterSheet.#parry,
            'initiative': CharacterSheet.#rollInitiative,
            'assign-damage': CharacterSheet.#assignDamage,
            'toggleFavoriteAction': CharacterSheet.#toggleFavoriteAction,
            'combatAction': CharacterSheet.#combatAction,
            'vocalizeCombatAction': CharacterSheet.#vocalizeCombatAction,
            'combatTalentDescribe': CharacterSheet.#combatTalentDescribe,
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

            // Possession track (#82 — beyond.md p.69)
            'unleashDaemon': CharacterSheet.#unleashDaemon,
            'resetPossessionSession': CharacterSheet.#resetPossessionSession,
            'possessionFrenzyTest': CharacterSheet.#possessionFrenzyTest,
            'possessionMismanifest': CharacterSheet.#possessionMismanifest,

            // Penitent role: Mortification of the Flesh (#94 — within.md p.36)
            'applyMortification': CharacterSheet.#applyMortification,

            // Shock / Snap-Out-Of-It (#66 — core.md §"Shock And Snapping Out Of It")
            'snapOutOfShock': CharacterSheet.#snapOutOfShock,

            // Fanatic role: Death to All Who Oppose Me (#93 — within.md p.34)
            'deathToAllWhoOpposeMe': CharacterSheet.#deathToAllWhoOpposeMe,

            // Crusader role: Smite the Unholy (#141 — beyond.md p.34)
            'smiteTheUnholy': CharacterSheet.#smiteTheUnholy,

            // Manacles condition (#105 — errata p.176)
            'applyManacles': CharacterSheet.#applyManacles,
            'liftManacles': CharacterSheet.#liftManacles,

            // Ace role: Right Stuff Fate-spend (#100 — without.md p.39)
            'openRightStuff': CharacterSheet.#openRightStuff,

            // Grapple controller actions (#120 — core.md L10155-10180)
            'grappleDamageOpponent': CharacterSheet.#grappleDamageOpponent,
            'grappleThrowDownOpponent': CharacterSheet.#grappleThrowDownOpponent,
            'grappleBreakFree': CharacterSheet.#grappleBreakFree,
            'grappleStandUp': CharacterSheet.#grappleStandUp,
            'grappleMove': CharacterSheet.#grappleMove,

            // Subtlety panel (#87) — DH2 warband-subtlety stepper + breakdown popout.
            'adjustSubtletyManually': CharacterSheet.#adjustSubtletyManually,
            'viewSubtletyBreakdown': CharacterSheet.#viewSubtletyBreakdown,

            // BC Alignment / Infamy advancement panel (#173).
            'recheckBcAlignment': CharacterSheet.#recheckBcAlignment,
            'buyBcInfamyAdvance': CharacterSheet.#buyBcInfamyAdvance,

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
            'owIssueOrder': owIssueOrder,
            'owLogisticsTest': owLogisticsTest,
            'owToggleMunitorum': owToggleMunitorum,
            'owAdjustSituational': owAdjustSituational,

            // Batch-2 engines:
            //   BC Ritual (#179), Supplements (#181), Daemon Prince (#182).
            //   (BC Gifts #180 is a passive readout — no action.)
            //   DW Special Ammo (#172), Distinctions (#171), Oath (#168),
            //   Mission (#169), Vehicle Crit (#170).
            //   OW Mission Gear (#155).
            'bcPerformRitual': bcPerformRitual,
            'bcToggleQuickAndTheDead': bcToggleQuickAndTheDead,
            'bcAscend': bcAscend,
            'dwSelectAmmo': dwSelectAmmo,
            'dwToggleDistinction': dwToggleDistinction,
            'dwToggleMark': dwToggleMark,
            'dwSwearOath': dwSwearOath,
            'dwReleaseOath': dwReleaseOath,
            'dwToggleObjective': dwToggleObjective,
            'dwToggleComplication': dwToggleComplication,
            'dwCompleteMission': dwCompleteMission,
            'dwVehicleRollCrit': dwVehicleRollCrit,
            'dwVehicleRepair': dwVehicleRepair,
            'owRequestGear': owRequestGear,
            // Batch-3 actions
            'owVehicleAction': owVehicleAction,
            'owComradeTickDay': owComradeTickDay,
            'owComradeMedicae': owComradeMedicae,
            'owComradeReplace2': owComradeReplace2,
            // Batch-4 actions (#159, #160, #161)
            'owMountedAction': owMountedAction,
            'owToggleDrawback': owToggleDrawback,
            'owAddComrade': owAddComrade,
            'owRemoveComrade': owRemoveComrade,
            'owRequestSupport': owRequestSupport,
            'owToggleAward': owToggleAward,

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

            // Dark Pact actions (Enemies Beyond p. 72, #84)
            'adjustPactDisposition': CharacterSheet.#adjustPactDisposition,
            'togglePactDiscovered': CharacterSheet.#togglePactDiscovered,
            'togglePactPayment': CharacterSheet.#togglePactPayment,

            // Endeavour actions (Rogue Trader)
            'completeObjective': CharacterSheet.#completeObjective,
            'completeEndeavour': CharacterSheet.#completeEndeavour,

            // Colony actions (Rogue Trader, Stars of Inequity #195)
            'openColonyGrowthDialog': CharacterSheet.#openColonyGrowthDialog,

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
        { tab: 'overview', label: 'WH40K.Tabs.Overview', tooltip: 'WH40K.Tabs.Tooltip.Overview', group: 'primary', cssClass: 'tab-overview' },
        // Status tab removed (#263) — its panels were consolidated into Overview.
        { tab: 'skills', label: 'WH40K.Tabs.Statistics', tooltip: 'WH40K.Tabs.Tooltip.Skills', group: 'primary', cssClass: 'tab-skills' },
        // talents tab removed — content moved to overview and skills tabs
        { tab: 'combat', label: 'WH40K.Tabs.Combat', tooltip: 'WH40K.Tabs.Tooltip.Combat', group: 'primary', cssClass: 'tab-combat' },
        { tab: 'equipment', label: 'WH40K.Tabs.Equipment', tooltip: 'WH40K.Tabs.Tooltip.Equipment', group: 'primary', cssClass: 'tab-equipment' },
        // { tab: 'powers', label: 'WH40K.Tabs.Powers', group: 'primary', cssClass: 'tab-powers' },
        { tab: 'biography', label: 'WH40K.Tabs.Biography', tooltip: 'WH40K.Tabs.Tooltip.Biography', group: 'primary', cssClass: 'tab-biography' },
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
        const isDH2 = activeGameSystem === 'dh2';
        const isBC = activeGameSystem === 'bc';
        const isOW = activeGameSystem === 'ow';
        const isDW = activeGameSystem === 'dw';
        const ruleset = WH40KSettings.getRuleset();
        context.ruleset = ruleset;
        context.isDH2 = isDH2;
        context.isBC = isBC;
        context.isOW = isOW;
        context.isDW = isDW;

        // Per-system overview panels — table-driven (#282). Each system's entries
        // (see PANEL_BUILDERS above) are written into the context under their exact
        // partial-facing keys; non-listed systems (DH2/DH1/RT/IM) build no panels,
        // and the `{{#if isBC}}`/etc. tab gates keep their include sites no-op.
        if (activeGameSystem !== null) {
            for (const { key, build } of PANEL_BUILDERS[activeGameSystem] ?? []) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic panel-context key written into the free-form CharacterSheetContext
                (context as Record<string, unknown>)[key] = build(this);
            }
        }

        // Subtlety adjusters (#87) — surfaced for the DH2 Subtlety panel template
        // (`src/templates/actor/panel/subtlety-panel.hbs`). Collected on the
        // active actor via `WH40KBaseActor.collectSubtletyAdjusters()`; safe to
        // compute on every render because it's a thin tree-walk of owned items.
        if (isDH2) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: sheet→template payload; the typed `CollectedAdjuster[]` is widened to fit the free-form CharacterSheetContext shape.
            (context as Record<string, unknown>)['subtletyAdjusters'] = this.actor.collectSubtletyAdjusters();
        }
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

        // Prepare Endeavours (Rogue Trader) — embedded `endeavour` items the
        // Dynasty is currently pursuing. The panel partial reads this hash.
        // eslint-disable-next-line no-restricted-syntax -- boundary: context is the Foundry render payload, a free-form record under fvtt-types
        (context as Record<string, unknown>)['endeavours'] = this.actor.items.filter((item) => (item.type as string) === 'endeavour');

        // Prepare active modifiers panel (Phase 5 Integration)
        context.activeModifiers = this.prepareActiveModifiers();

        // Penitent role detection (#94 — within.md p.36).
        // A Penitent is identified by the presence of a talent/trait/role
        // item whose name matches "Penitent" or "Mortification of the Flesh"
        // (case-insensitive). This is intentionally name-based rather than
        // UUID-based so it works for hand-authored / dropped-in talents in
        // addition to compendium items.
        context.hasPenitent = this.actor.items.some((item) => {
            const itemName = item.name.toLowerCase();
            return itemName.includes('penitent') || itemName.includes('mortification of the flesh');
        });

        // Fanatic role detection (#93 — within.md p.34).
        // A Fanatic is identified by the presence of a talent/trait/role
        // item whose name matches "Fanatic" or "Death to All Who Oppose Me"
        // (case-insensitive). Name-based so it works for hand-authored /
        // dropped-in talents in addition to compendium items.
        context.hasFanatic = this.actor.items.some((item) => {
            const itemName = item.name.toLowerCase();
            return itemName.includes('fanatic') || itemName.includes('death to all who oppose me');
        });

        // Crusader role detection (#141 — beyond.md p.34). Same name-based
        // pattern as Penitent/Fanatic above; matches "Crusader" or "Smite
        // the Unholy".
        context.hasCrusader = hasCrusaderRole(Array.from(this.actor.items));

        // Grapple state (#120 — core.md L10155-10180). The flag is set by
        // combat tooling (Charge / Standard Attack workflow) and read by
        // the Status tab to surface the controller-actions panel.
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry flag bag is keyed by namespace at runtime
        const grappleFlag = (this.actor.flags as { wh40k?: { grapple?: { state?: GrappleState } } } | undefined)?.wh40k?.grapple;
        context.grappleState = grappleFlag?.state ?? 'none';

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

        if (partId === 'header') return this._prepareHeaderContext(partContext, options);
        if (partId === 'tabs') return this._prepareTabsContext(partContext, options);
        if (partId === 'biography') return this._prepareBiographyContext(partContext, options);
        if (partId === 'overview') return this._prepareOverviewDashboardContext(partContext, options);
        if (partId === 'combat' || partId === 'skills' || partId === 'equipment' || partId === 'powers' || partId === 'dynasty') {
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
            sheetContext.aptitudePills = this._prepareAptitudePills();
        }

        // Add powers context for powers tab
        if (partId === 'powers') {
            const powersData = this._preparePowersContext();
            Object.assign(context, powersData);
        }

        // Loadout/combat-station data does not survive into the isolated part
        // context, so re-prepare it for the tabs that render inventory and the
        // combat station (mirrors the skills/powers re-prep above). Without this
        // the Equipment tab renders an empty inventory even though the actor
        // carries items.
        if (partId === 'equipment' || partId === 'combat') {
            const categorized = this._getCategorizedItems();
            this._prepareLoadoutData(context, categorized);
            this._prepareCombatData(context, categorized);
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
     * @param {string} gameSystem - The game system ID (e.g. 'dh2', 'rt')
     * @returns {Promise<Record<string, string[]>>}
     * @private
     */
    async _getOriginPathOptions(gameSystem: GameSystemId): Promise<Record<string, string[]>> {
        // Use cached options if available (packs don't change at runtime)
        const cached = this.#originOptionsCache.get(gameSystem);
        if (cached !== undefined) return cached;

        const stepNames: Record<string, Set<string>> = {};

        const prefix = gameSystemPackPrefix(gameSystem);
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
            tooltip: game.i18n.localize(tab.tooltip ?? tab.label),
        }));
        return context;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 _onFirstRender signature uses Record<string, unknown>
    override async _onFirstRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onFirstRender(context, options);

        // Nudge the user to build an unfinished character via the origin-path
        // builder (the d20 on the portrait isn't obvious enough). Fire-and-forget
        // so the dialog doesn't block the sheet's first render.
        void this.#maybePromptOriginPathIncomplete();

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

    /**
     * Build the BC Alignment / Infamy panel context (#173).
     *
     * Tally + derived-alignment + recheck-due + psyker-lock all come from
     * `bc-alignment-derivation.ts`; the Infamy cost / cap / increment come
     * from `bc-advancement-config.ts`. The partial reads the returned
     * object as `alignmentPanel.*`.
     */
    _prepareBcAlignmentPanel(): BcAlignmentPanelContext {
        const system = this.actor.system;
        const advances: ReadonlyArray<ChaosAdvanceEntry> = system.chaosAdvancements;
        const tally = tallyAdvancesByAlignment(advances);
        const derived = deriveAlignmentFromTally(tally);
        const current = system.chaosAlignment;
        const checkpoint = system.alignmentCheckpoint;
        const corruption = system.corruption;
        const infamy = system.infamy;
        return {
            current,
            derived,
            tally,
            pendingFlip: current !== derived,
            checkpoint,
            corruption,
            nextCheckpoint: nextAlignmentCheckpoint(corruption),
            recheckDue: shouldRecheckAlignment(corruption, checkpoint),
            psykerLocked: psykerLockedByAlignment(current),
            infamy,
            infamyCost: infamyAdvanceCost(infamy),
            infamyCap: BC_INFAMY_ADVANCE_CAP,
            infamyIncrement: BC_INFAMY_INCREMENT,
        };
    }

    /* -------------------------------------------- */

    /**
     * BC Psychic Strength panel (#178). Resolver inputs come from the
     * persisted DataModel fields (psykerClass / psyRating / sustainedPowerCount);
     * the panel's mode + push level are ephemeral UI state owned by the
     * sheet instance (_bcPsyMode / _bcPsyPushLevel).
     */
    _prepareBcPsychicPanel(): BcPsychicPanelContext {
        const sys = this.actor.system;
        const psykerClass = sys.psykerClass;
        const psyRating = sys.psyRating;
        const sustainedPowerCount = sys.sustainedPowerCount;
        const mode = this._bcPsyMode;
        const pushLevel = this._bcPsyPushLevel;
        const resolved = resolvePsychicTest({ psykerClass, basePR: psyRating, mode, pushLevel, sustainedPowerCount });
        return {
            psykerClass,
            psyRating,
            sustainedPowerCount,
            mode,
            pushLevel,
            maxPushLevel: maxPushLevel(psykerClass),
            effectivePR: resolved.effectivePR,
            sustainPenalty: resolved.sustainPenalty,
            phenomenaRolls: resolved.phenomenaRolls,
        };
    }

    /* -------------------------------------------- */

    /**
     * DW Astartes implants panel (#167). Iterates the canonical implant
     * inventory and reports per-id presence + the derived Unnatural
     * Strength/Toughness bonuses and Black-Carapace flag.
     */
    _prepareDwAstartesPanel(): DwAstartesPanelContext {
        const sys = this.actor.system;
        const implants = sys.implants;
        const sb = sys.characteristics.strength.bonus;
        const tb = sys.characteristics.toughness.bonus;
        const implantSet = new Set<AstartesImplantId>(implants);
        return {
            implants: ASTARTES_IMPLANTS.map((id) => {
                // The implant's `mechanic` (kebab-case) maps directly onto the
                // `WH40K.DW.Astartes.Category.*` langpack keys (PascalCase).
                // Implants with no discrete mechanic (Ossmodula, Biscopea,
                // Haemastamen) feed the Unnatural Str/Tgh baselines → Baseline.
                const mechanic = IMPLANT_EFFECTS[id].mechanic;
                return {
                    id,
                    // The langpack name lives at `…Implant.<Id>.Name` — the
                    // trailing `.Name` segment is required or `localize` falls
                    // back to the raw key (the overflowing-text regression).
                    nameKey: `WH40K.DW.Astartes.Implant.${titleCase(id)}.Name`,
                    categoryKey: mechanic === undefined ? `WH40K.DW.Astartes.Category.Baseline` : `WH40K.DW.Astartes.Category.${titleCase(mechanic)}`,
                    has: implantSet.has(id),
                };
            }),
            strengthBonus: astartesStrengthBonus(sb),
            toughnessBonus: astartesToughnessBonus(tb),
            hasBlackCarapace: hasBlackCarapace(implants),
        };
    }

    /* -------------------------------------------- */

    /**
     * DW Kill-team Cohesion panel (#162). Reads the four schema slots
     * (`cohesionCurrent`, `cohesionMax`, `cohesionLostThisTurn`,
     * `rallied`) and computes the action-availability gates.
     */
    _prepareDwCohesionPanel(): DwCohesionPanelContext {
        const sys = this.actor.system;
        const current = sys.cohesionCurrent;
        const max = sys.cohesionMax;
        const rallied = sys.rallied;
        return {
            current,
            max,
            lostThisTurn: sys.cohesionLostThisTurn,
            rallied,
            canRally: !rallied,
            canRecover: current < max && max > 0,
        };
    }

    /* -------------------------------------------- */

    /**
     * DW Squad Mode panel (#163). Surfaces the current combat mode,
     * Renown-derived support range, and the labels of any
     * currently-sustained Squad-mode abilities.
     */
    _prepareDwModePanel(): DwModePanelContext {
        const sys = this.actor.system;
        const mode = sys.combatMode;
        const renownRank = getRenownRank(sys.renown);
        const renownRankKey = renownRank.charAt(0).toUpperCase() + renownRank.slice(1);
        const supportRange = getSupportRange(renownRank);
        const sustainedAbilities = sys.sustainedAbilities.map((id) => ({ id, label: id }));
        return {
            mode,
            renownRank,
            renownRankKey,
            supportRange,
            sustainedAbilities,
        };
    }

    /* -------------------------------------------- */

    /**
     * DW Renown panel (#164). Computes the current rank, the next rank's
     * threshold (if any), and a 0-100% progress percentage.
     */
    _prepareDwRenownPanel(): DwRenownPanelContext {
        const sys = this.actor.system;
        const value = sys.renown;
        const rank = getRenownRank(value);
        const rankRange = RENOWN_THRESHOLDS[rank];
        const rankIdx = RENOWN_RANK_ORDER.indexOf(rank);
        const nextRank: RenownRank | null = RENOWN_RANK_ORDER[rankIdx + 1] ?? null;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test parser narrows nextRank to RenownRank by missing the union; strict tsconfig retains the | null branch
        const nextRankMin = nextRank != null ? RENOWN_THRESHOLDS[nextRank].min : null;
        const rankLabel = game.i18n.localize(`WH40K.DW.Renown.Rank.${rank.charAt(0).toUpperCase()}${rank.slice(1)}`);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test parser narrows nextRank to RenownRank by missing the union; strict tsconfig retains the | null branch
        const nextRankLabel = nextRank != null ? game.i18n.localize(`WH40K.DW.Renown.Rank.${nextRank.charAt(0).toUpperCase()}${nextRank.slice(1)}`) : null;
        const progressPercent =
            nextRankMin === null ? 100 : Math.max(0, Math.min(100, Math.round(((value - rankRange.min) / (nextRankMin - rankRange.min)) * 100)));
        return {
            value,
            rank,
            rankLabel,
            nextRank,
            nextRankLabel,
            rankMin: rankRange.min,
            nextRankMin,
            progressPercent,
        };
    }

    /* -------------------------------------------- */

    /**
     * DW Requisition panel (#165). Surfaces the RP balance, the current
     * mission rating, and the Renown-derived rank gate the requisition
     * dialog will enforce.
     */
    _prepareDwRequisitionPanel(): DwRequisitionPanelContext {
        const sys = this.actor.system;
        return {
            rp: sys.requisitionPoints,
            missionRating: sys.missionRating,
            renownRank: getRenownRank(sys.renown),
        };
    }

    /* -------------------------------------------- */

    /**
     * OW Regiment Creation panel (#151). Surfaces the persisted regiment
     * selection + kit budget for the panel partial.
     */
    _prepareOwRegimentPanel(): OwRegimentPanelContext {
        const sys = this.actor.system;
        return {
            selection: sys.regimentSelection,
            kit: sys.regimentKit,
        };
    }

    /* -------------------------------------------- */

    /**
     * OW Comrade panel (#152). Surfaces the comrade's persisted state
     * (name / state / distance / line-of-sight) for the panel partial.
     */
    _prepareOwComradePanel(): OwComradePanelContext {
        const sys = this.actor.system;
        return {
            comrade: sys.comrade,
        };
    }

    /* -------------------------------------------- */

    /**
     * OW Orders panel (#153). Two arrays: the three GENERIC_ORDERS with
     * resolved issue-availability + i18n keys, and any currently-active
     * sweeping Orders with their applied-member counts.
     */
    _prepareOwOrdersPanel(): OwOrdersPanelContext {
        const sys = this.actor.system;
        // Conservative defaults — the actor sheet has no live action-economy
        // state yet, so assume full action + half action remain and let
        // the issue dialog refine. Cohesion gate uses the live pool.
        const cohesionAvailable = sys.cohesionCurrent > 0;
        const available = GENERIC_ORDERS.map((order) => {
            const check = canIssueOrder({ order, hasFullAction: true, hasHalfAction: true, cohesionAvailable });
            return {
                orderId: order.id,
                nameKey: `WH40K.OW.Orders.Generic.${titleCase(order.id)}.Name`,
                effectKey: `WH40K.OW.Orders.Generic.${titleCase(order.id)}.Effect`,
                actionCostKey: `WH40K.OW.Orders.ActionCost.${titleCase(order.actionCost)}`,
                actionCost: order.actionCost,
                canIssue: check.allowed,
                blockReasonKey: check.reason === undefined ? null : `WH40K.OW.Orders.BlockReason.${titleCase(check.reason)}`,
            };
        });
        const sweepingActive = sys.activeOrders
            .filter((o) => o.sweeping)
            .map((o) => ({
                orderId: o.orderId,
                appliedCount: o.appliedToMemberIds.length,
            }));
        return { available, sweepingActive };
    }

    /* -------------------------------------------- */

    /**
     * OW Logistics panel (#154). Surfaces the Squad Logistics Rating
     * baseline + Munitorum flag + GM situational modifier.
     */
    _prepareOwLogisticsPanel(): OwLogisticsPanelContext {
        const sys = this.actor.system;
        return {
            rating: sys.logisticsRating === 0 ? OW_DEFAULT_LOGISTICS_RATING : sys.logisticsRating,
            munitorum: sys.munitorum,
            situational: sys.situational,
        };
    }

    /* -------------------------------------------- */

    /**
     * BC Chaos Ritual panel (#179). The only persisted slot is the
     * ritualist's Daemonic Mastery rating; per-ritual selections are
     * dialog-scoped state and never leak to the panel.
     */
    _prepareBcRitualPanel(): BcRitualPanelContext {
        return { ritualMastery: this.actor.system.ritualMastery };
    }

    /* -------------------------------------------- */

    /**
     * BC Gifts of the Gods panel (#180). The catalogue + per-alignment
     * riders live in compendium content (Direction #7); without a live
     * lookup at sheet render time we surface the persisted ids and the
     * actor's current alignment so the panel's empty-state path renders
     * cleanly. A future enhancement will resolve gift catalogue entries
     * via `uuidNameCache` and apply `resolveGiftForAlignment` +
     * `mergeGiftDeltas` here.
     */
    _prepareBcGiftsPanel(): BcGiftsPanelContext {
        const sys = this.actor.system;
        return {
            currentAlignment: sys.chaosAlignment,
            gifts: sys.gifts.map((id) => ({
                id,
                name: id,
                baseDescription: '',
                riderDescription: '',
                appliedAlignment: sys.chaosAlignment,
                subTableLabel: '',
                characteristicDelta: [],
                traits: [],
                activeEffects: [],
            })),
            mergedDelta: [],
        };
    }

    /* -------------------------------------------- */

    /**
     * BC Supplement Mechanics panel (#181). Surfaces the Daemon Engine
     * rage bonus (computed against a conservative `turnsSinceLastDamage`
     * baseline of 0 — the actual delta is dialog-scoped per encounter)
     * and the Quick-and-the-Dead initiative shift folded against the
     * actor's chaos alignment.
     */
    _prepareBcSupplementsPanel(): BcSupplementsPanelContext {
        const sys = this.actor.system;
        const rating = sys.daemonEngineRating;
        const daemonEngineActive = rating > 0;
        const turnsSinceLastDamage = 0;
        const rageBonus = daemonEngineActive ? daemonEngineRageBonus({ rating, turnsSinceLastDamage }) : 0;
        const alignment: QuickAndTheDeadAlignment = sys.chaosAlignment;
        const baseInitiative = sys.characteristics.agility.bonus;
        const qatdActive = sys.quickAndTheDeadActive;
        const qatdBonus = QUICK_AND_THE_DEAD_BONUS_BY_ALIGNMENT[alignment];
        return {
            daemonEngineRating: rating,
            daemonEngineActive,
            turnsSinceLastDamage,
            daemonEngineRageBonus: rageBonus,
            quickAndTheDeadActive: qatdActive,
            chaosAlignment: alignment,
            baseInitiative,
            quickAndTheDeadBonus: qatdBonus,
            quickAndTheDeadInitiative: qatdActive ? quickAndTheDeadInitiativeBonus(baseInitiative, alignment) : baseInitiative,
        };
    }

    /* -------------------------------------------- */

    /**
     * BC Daemon Prince ascension panel (#182). Reads the persisted
     * ascension record off `system.daemonPrinceAscension` and reports
     * threshold progress + the unlocked boost when apotheosis has fired.
     */
    _prepareBcDaemonPrincePanel(): BcDaemonPrincePanelContext {
        const sys = this.actor.system;
        const record = sys.daemonPrinceAscension;
        const ascendedAt = record.ascendedAt;
        // Build a non-null ascension record for the engine when one exists; isAscended treats a
        // non-null record as ascended and the boost is derived from the same record.
        const ascension = ascendedAt === null ? null : { ascendedAt, alignmentAtAscension: record.alignmentAtAscension };
        const ascended = isAscended(ascension);
        const infamy = sys.infamy;
        const corruption = sys.corruption;
        const canAscend = !ascended && infamy >= DAEMON_PRINCE_INFAMY_THRESHOLD && corruption >= DAEMON_PRINCE_CORRUPTION_THRESHOLD;
        const boost = ascension === null ? null : getDaemonPrinceBoost(ascension);
        return {
            ascended,
            ascendedAt,
            alignmentAtAscension: record.alignmentAtAscension,
            infamy,
            corruption,
            infamyThreshold: DAEMON_PRINCE_INFAMY_THRESHOLD,
            corruptionThreshold: DAEMON_PRINCE_CORRUPTION_THRESHOLD,
            canAscend,
            boost,
        };
    }

    /* -------------------------------------------- */

    /**
     * DW Distinctions panel (#171). The catalogue itself is compendium
     * content; without a runtime catalogue lookup we surface the
     * persisted id arrays and let `mergeMarkGrants(empty)` produce the
     * stub merged-grant readout. The panel's empty-state paths handle
     * missing catalogue entries cleanly.
     */
    _prepareDwDistinctionPanel(): DwDistinctionPanelContext {
        const sys = this.actor.system;
        const earned = new Set(sys.distinctions);
        const borne = new Set(sys.marksOfDistinction);
        return {
            distinctions: sys.distinctions.map((id) => ({
                id,
                name: id,
                renownReward: 0,
                renownRequired: '',
                earned: earned.has(id),
                rankTooLow: false,
            })),
            marks: sys.marksOfDistinction.map((id) => ({
                id,
                name: id,
                description: '',
                borne: borne.has(id),
            })),
            merged: {
                characteristicDelta: [],
                traits: [],
            },
        };
    }

    /* -------------------------------------------- */

    /**
     * DW Special-Issue Ammunition panel (#172). Reads the actor-level
     * selected ammo id and builds the option list against the canonical
     * `DW_SELECTED_AMMO_CHOICES`. The detail readout consumes
     * `DW_SPECIAL_AMMO_EFFECTS` directly; `'standard'` yields `null`.
     */
    _prepareDwAmmoPanel(): DwAmmoPanelContext {
        const sys = this.actor.system;
        const selected: DwSelectedAmmoId = sys.selectedAmmo;
        const labelFor = (id: DwSelectedAmmoId): string => game.i18n.localize(`WH40K.DW.SpecialAmmo.Kind.${titleCase(id)}`);
        const effect = selected === 'standard' ? null : DW_SPECIAL_AMMO_EFFECTS[selected];
        return {
            selected,
            selectedLabel: labelFor(selected),
            options: DW_SELECTED_AMMO_CHOICES.map((id) => ({
                id,
                label: labelFor(id),
                selected: id === selected,
                summary:
                    id === 'standard'
                        ? game.i18n.localize('WH40K.DW.SpecialAmmo.NoSelection')
                        : game.i18n.localize(`WH40K.DW.SpecialAmmo.Summary.${titleCase(id)}`),
            })),
            effect,
        };
    }

    /* -------------------------------------------- */

    /**
     * DW Mission Oath panel (#168). Surfaces the leader marker, the
     * active oath id (or null), and the swear/release gates. The active
     * oath display label resolves from the compendium UUID cache at
     * panel render time; without a sync lookup we fall back to the id
     * string so the panel still renders a meaningful readout.
     */
    _prepareDwOathPanel(): DwOathPanelContext {
        const sys = this.actor.system;
        const activeOathId = sys.activeOathId;
        const active = isOathActive(activeOathId);
        return {
            isLeader: sys.isLeader,
            active,
            activeOathId,
            activeLabel: active && activeOathId !== null ? activeOathId : null,
            canSwear: sys.isLeader && !active,
            canRelease: active,
        };
    }

    /* -------------------------------------------- */

    /**
     * DW Mission framework panel (#169). When `activeMission === null`
     * the panel renders the empty-state placeholder; otherwise we map
     * the persisted record into the localized labels the template
     * consumes.
     */
    _prepareDwMissionPanel(): DwMissionPanelContext {
        const sys = this.actor.system;
        const active = sys.activeMission;
        if (active === null) {
            return { hasMission: false, mission: null };
        }
        return {
            hasMission: true,
            mission: {
                id: active.id,
                name: active.name,
                rating: active.rating,
                ratingLabel: game.i18n.localize(`WH40K.DW.Mission.Rating.${titleCase(active.rating)}`),
                objectives: active.objectives.map((o) => ({
                    id: o.id,
                    description: o.description,
                    renownReward: o.renownReward,
                    xpReward: o.xpReward,
                    status: o.status,
                    statusLabel: game.i18n.localize(`WH40K.DW.Mission.Objective.Status.${titleCase(o.status)}`),
                })),
                complications: active.complications.map((c) => ({
                    id: c.id,
                    description: c.description,
                    renownPenalty: c.renownPenalty,
                    triggered: c.triggered,
                })),
            },
        };
    }

    /* -------------------------------------------- */

    /**
     * DW Vehicle Critical Hit / Repair panel (#170). The crit-roll
     * button unlocks when over-Integrity has accumulated OR the vehicle
     * has just been pushed to zero Integrity (its first crit roll); the
     * repair button requires accumulated over-Integrity to act on.
     */
    _prepareDwVehiclePanel(): DwVehiclePanelContext {
        const sys = this.actor.system;
        const integrity = sys.vehicleIntegrity;
        const overIntegrity = sys.overIntegrity;
        return {
            integrity,
            overIntegrity,
            canRollCrit: overIntegrity > 0 || integrity <= 0,
            canRepair: overIntegrity > 0,
        };
    }

    /* -------------------------------------------- */

    /**
     * OW Mission Assignment Gear panel (#155). Stateless apart from the
     * "last outcome" readout; the request-gear action gathers Table 6-3
     * modifiers at click time via a DialogV2 prompt.
     */
    _prepareOwMissionGearPanel(): OwMissionGearPanelContext {
        const sys = this.actor.system;
        const last = sys.lastGearOutcome;
        if (last === null) {
            return { hasOutcome: false, outcomeKey: null };
        }
        return {
            hasOutcome: true,
            outcomeKey: `WH40K.OW.MissionGear.Outcome.${titleCase(last)}`,
        };
    }

    /* -------------------------------------------- */

    /** OW Vehicle Movement panel (#156). */
    _prepareOwVehicleMovementPanel(): OwVehicleMovementPanelContext {
        const sys = this.actor.system;
        const chase = sys.chaseState;
        const actions = [
            { id: 'evasive-manoeuvring', timing: 'half' },
            { id: 'floor-it', timing: 'full' },
            { id: 'hit-and-run', timing: 'full' },
            { id: 'jink', timing: 'reaction' },
            { id: 'tactical-manoeuvring', timing: 'half' },
        ].map((a) => ({
            id: a.id,
            nameKey: `WH40K.OW.VehicleMovement.Action.${titleCase(a.id)}`,
            timingKey: `WH40K.OW.VehicleMovement.Timing.${a.timing.charAt(0).toUpperCase()}${a.timing.slice(1)}`,
            descriptionKey: `WH40K.OW.VehicleMovement.Description.${titleCase(a.id)}`,
        }));
        return {
            actions,
            chase:
                chase === null
                    ? { active: false, pursuerDistance: 0, dangerZone: false, turnCount: 0 }
                    : { active: true, pursuerDistance: chase.pursuerDistance, dangerZone: chase.dangerZone, turnCount: chase.turnCount },
        };
    }

    /** OW Comrade Healing panel (#157). */
    _prepareOwComradeHealingPanel(): OwComradeHealingPanelContext {
        const sys = this.actor.system;
        const recoveryDays = sys.comradeRecoveryDays;
        const refitAvailable = sys.refitAvailable;
        const statusKey =
            recoveryDays > 0
                ? 'WH40K.OW.ComradeHealing.Status.Recovering'
                : refitAvailable
                ? 'WH40K.OW.ComradeHealing.Status.RefitAvailable'
                : 'WH40K.OW.ComradeHealing.Status.Ready';
        return {
            recoveryDays,
            refitAvailable,
            canTick: recoveryDays > 0,
            canMedicae: recoveryDays > 0,
            canReplace: refitAvailable,
            statusKey,
        };
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
            char.nextAdvanceCost = advance < 5 ? ADVANCE_XP_COSTS[advance] : 0;

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
                        const selectedValues = selectedChoices[choice.label as string] ?? [];
                        for (const selectedValue of selectedValues) {
                            const option = (choice.options as Array<{ value?: string; grants?: OriginGrants }> | undefined)?.find(
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
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system.state is Foundry DataModel; transient flags not on the typed schema yet; bracket access needs Record cast
            const sysState = (item.system as Record<string, unknown>)['state'] as Record<string, unknown> | undefined;
            const inShip = sysState?.['inShipStorage'] === true;

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
            if (sysState?.['equipped'] === true && !inShip) categories.equipped.push(item);
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

        this._prepareEncumbrancePercents(loadoutContext);
    }

    /**
     * Compute encumbrance + backpack fill percentages for the loadout bar.
     * Split out so NPCSheet (which inherits this whole loadout pipeline but
     * whose underlying WH40KNPC document has no `encumbrance` getter) can
     * skip it. The `'encumbrance' in this.actor` guard reflects the real
     * domain: only PC-like actors (WH40KAcolyte) track encumbrance.
     */
    protected _prepareEncumbrancePercents(loadoutContext: { encumbrancePercent?: number; backpackPercent?: number }): void {
        if (!('encumbrance' in this.actor)) return;
        const enc = (this.actor as { encumbrance: { max?: number; value?: number; backpack_max?: number; backpack_value?: number } }).encumbrance;
        const encMax = enc.max !== undefined && enc.max > 0 ? enc.max : 1;
        loadoutContext.encumbrancePercent = Math.min(100, Math.round(((enc.value ?? 0) / encMax) * 100));
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
        // NPCs don't carry the skills/characteristics shape that drives dodge
        // and parry targets — bail rather than dereferencing undefined.
        if (!('skills' in this.actor) || !('characteristics' in this.actor)) return;
        const skills = this.actor.skills;
        const chars = this.actor.characteristics;

        type SkillBits = { plus10?: boolean; plus20?: boolean; trained?: boolean; basic?: boolean };

        // Untrained-skill rules diverge by system. The aptitude/career family
        // (DH2 + BC/DW/OW/IM, and DH1 Errata which extended aptitudes) applies
        // a flat -20 penalty (DH2 core.md p.95 "Untrained Skill Use"). FFG
        // Rogue Trader is the halving outlier and lives on its own sheet class.
        // See wh40k-tooltip.ts for the same gate around the untrained-target
        // display.
        const systemId = this._resolveGameSystemId();
        const isAptitudeSystem = systemId === 'dh2' || systemId === 'dh1' || systemId === 'bc' || systemId === 'dw' || systemId === 'ow' || systemId === 'im';
        const adjustUntrained = (base: number): number => (isAptitudeSystem ? base - 20 : Math.floor(base / 2));

        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.skills is indexed by string; double-cast to SkillBits to access computed fields not on the schema
        const dodgeSkill = skills['dodge'] as unknown as SkillBits | undefined;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        let dodgeBase = chars['agility']?.total ?? 0;
        if (dodgeSkill?.plus20 === true) dodgeBase += 20;
        else if (dodgeSkill?.plus10 === true) dodgeBase += 10;
        else if (dodgeSkill?.trained !== true && dodgeSkill?.basic !== true) dodgeBase = adjustUntrained(dodgeBase);
        sheetContext.dodgeTarget = dodgeBase;

        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.skills is indexed by string; double-cast to SkillBits to access computed fields not on the schema
        const parrySkill = skills['parry'] as unknown as SkillBits | undefined;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        let parryBase = chars['weaponSkill']?.total ?? 0;
        if (parrySkill?.plus20 === true) parryBase += 20;
        else if (parrySkill?.plus10 === true) parryBase += 10;
        else if (parrySkill?.trained !== true && parrySkill?.basic !== true) parryBase = adjustUntrained(parryBase);
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
                return sys.state.equipped || sys.state.activated;
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
        const equippedWeapons = weapons.filter((w) => w.system.state.equipped);
        sheetContext.equippedWeapons = equippedWeapons;
        const rangedWeapons = equippedWeapons.filter((w) => w.system.class !== 'Melee');
        const meleeWeapons = equippedWeapons.filter((w) => w.system.class === 'Melee');

        // Primary weapon
        sheetContext.primaryWeapon =
            rangedWeapons.length > 0 ? rangedWeapons[0] : meleeWeapons.length > 0 ? meleeWeapons[0] : weapons.find((w) => w.system.state.equipped);

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

        // Attack actions are no longer surfaced on the combat panel — they live on the
        // per-weapon attack dialog (#227), so the panel no longer needs them partitioned.
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

        // Wounds/fatigue/fate live on Acolyte-shaped actors; NPCs (which
        // share this sheet's prepare pipeline) don't define those getters.
        // Skip the rollup for them rather than crashing the render.
        if ('wounds' in this.actor && 'fate' in this.actor && 'fatigue' in this.actor) {
            const a = this.actor as {
                wounds: { max: number; value: number; critical: number };
                fate: { max: number; value: number; threshold: number };
                fatigue: { value: number };
            };
            prepared.wounds = {
                total: a.wounds.max,
                current: a.wounds.value,
                critical: a.wounds.critical,
                fatigue: a.fatigue.value,
            };
            prepared.fate = {
                total: a.fate.max,
                current: a.fate.value,
                threshold: a.fate.threshold,
            };
        }

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
        const granted = actor.system.aptitudes as string[];

        // Universal aptitudes (General) are inherent to every character in an
        // aptitude system and carry no origin source; pull them from the system
        // config so the literal lives in one place (the aptitude RAW tables).
        const gameSystem = this._resolveGameSystemId();
        const sysConfig = gameSystem !== null ? SystemConfigRegistry.get(gameSystem) : null;
        const universal = sysConfig instanceof AptitudeBasedSystemConfig ? [...sysConfig.universalAptitudes] : [];

        const aptitudes = [...new Set([...granted, ...universal])];
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

        // Seed the universal aptitudes with their inherent (non-origin) source.
        const universalSource = game.i18n.localize('WH40K.AptitudeUniversalSource');
        for (const apt of universal) addSource(apt, universalSource);

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
                const label: string = skill.label !== undefined && skill.label !== '' ? skill.label : key;
                // Route favourites through the same prepareSkillTooltip(...) path the
                // Statistics tab uses (issue #36) so the per-system rank labels (Known/
                // Trained/Experienced/Veteran vs Trained/+10/+20) resolve identically.
                // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics map is a Record<string, CharacteristicLike>; the mixin signature takes Record<string, unknown>.
                const tooltipData = this.prepareSkillTooltip(key, { ...skill, label }, characteristics);
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
                const tooltipData = this.prepareSkillTooltip(compositeKey, synthesizedSkill, characteristics);
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
        return merged;
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
                formulaLabel += ` ${formatSigned(modifier)}`;
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
        if (actionKey === 'dodge') {
            await CharacterSheet.#dodge.call(this, event, target);
            return;
        }
        if (actionKey === 'parry') {
            await CharacterSheet.#parry.call(this, event, target);
            return;
        }
        if (actionKey === 'assignDamage') {
            CharacterSheet.#assignDamage.call(this, event, target);
            return;
        }
        if (actionKey === 'initiative') {
            await CharacterSheet.#rollInitiative.call(this, event, target);
            return;
        }
        this._notify('warning', `Unknown combat action: ${actionKey}`, {
            duration: 3000,
        });
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
        const tooltipManager = (
            game as foundry.Game & {
                tooltip?: { activate?: (element: HTMLElement, options?: { text?: string; direction?: string; cssClass?: string }) => void };
            }
        ).tooltip;
        if (tooltipManager?.activate !== undefined) {
            tooltipManager.activate(target, { text: tooltipText, direction: 'UP', cssClass: 'wh40k-action-description' });
        } else {
            // Fallback for environments without the tooltip manager (e.g., tests).
            target.setAttribute('data-tooltip', `${actionName}${actionSubtypes}: ${actionDescription}`);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle clicks on combat-talent buttons in the Actions tab.
     *
     * Default behavior (plain click): show the talent's name + description
     * as a local in-sheet tooltip on the clicked button. This matches the
     * default for {@link #vocalizeCombatAction} and the Reactions block —
     * a plain click never auto-posts to chat (issue #19).
     *
     * Modifier behavior (Shift+Click): explicit opt-in to post the talent
     * card to chat via the item's normal {@link sendToChat} path.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #combatTalentDescribe(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset['itemId'] ?? target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        if (itemId === undefined || itemId === '') {
            console.warn('WH40K | combatTalentDescribe: No item ID found', target);
            return;
        }

        const item = this.actor.items.get(itemId);
        if (item === undefined) {
            console.warn(`WH40K | combatTalentDescribe: Item ${itemId} not found on actor`);
            return;
        }

        // Shift+Click is the explicit opt-in to post to chat.
        const isShiftClick = event instanceof MouseEvent && event.shiftKey;
        if (isShiftClick) {
            try {
                await item.sendToChat();
            } catch (err) {
                console.error('WH40K | combatTalentDescribe: Error sending item to chat', err);
                ui.notifications.error(game.i18n.format('WH40K.Combat.Actions.TalentChatFailed', { name: item.name }));
            }
            return;
        }

        // Default: show the talent description as a local in-sheet tooltip.
        const itemSystem = item.system as { description?: { value?: string } } | undefined;
        const rawDescription = itemSystem?.description?.value ?? '';
        const descriptionText = rawDescription !== '' ? rawDescription : game.i18n.localize('WH40K.Combat.Actions.TalentNoDescription');
        const tooltipText = `<strong>${item.name}</strong><br/>${descriptionText}`;
        const tooltipManager = (
            game as foundry.Game & {
                tooltip?: { activate?: (element: HTMLElement, options?: { text?: string; direction?: string; cssClass?: string }) => void };
            }
        ).tooltip;
        if (tooltipManager?.activate !== undefined) {
            tooltipManager.activate(target, { text: tooltipText, direction: 'UP', cssClass: 'wh40k-action-description' });
        } else {
            // Fallback for environments without the tooltip manager (e.g., tests).
            // Strip HTML tags so the title/data-tooltip attribute reads cleanly.
            const plain = descriptionText.replace(/<[^>]*>/g, '').trim();
            target.setAttribute('data-tooltip', `${item.name}: ${plain}`);
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
        const item = this._resolveItemFromTarget(target);
        if (!item) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system.state is Foundry DataModel; equipped not on base type; bracket access needs Record cast
        await item.update({ 'system.state.equipped': ((item.system as Record<string, unknown>)['state'] as Record<string, unknown>)['equipped'] !== true });
    }

    /* -------------------------------------------- */

    /**
     * Apply a stow-state patch to the item a clicked control refers to. The four
     * stow/ship-storage actions differ only by their `system.state.*` patch.
     * @this {CharacterSheet}
     * @param {HTMLElement} target              Button that was clicked.
     * @param {Record<string, boolean>} patch   Dotted `system.state.*` writes.
     */
    async #setStowState(target: HTMLElement, patch: Record<string, boolean>): Promise<void> {
        const item = this._resolveItemFromTarget(target);
        if (!item) return;
        await item.update(patch);
    }

    /* -------------------------------------------- */

    /**
     * Handle stowing an item.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #stowItem(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        await this.#setStowState(target, {
            'system.state.equipped': false,
            'system.state.inBackpack': true,
            'system.state.inShipStorage': false,
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
        await this.#setStowState(target, { 'system.state.inBackpack': false });
    }

    /* -------------------------------------------- */

    /**
     * Handle stowing an item in ship storage.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #stowToShip(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        await this.#setStowState(target, {
            'system.state.equipped': false,
            'system.state.inBackpack': false,
            'system.state.inShipStorage': true,
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
        await this.#setStowState(target, { 'system.state.inShipStorage': false });
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
                    'system.state.equipped': false,
                    'system.state.inBackpack': false,
                    'system.state.inShipStorage': true,
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
                    'system.state.inShipStorage': false,
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
                    system?: Record<string, unknown> & { state?: { equipped?: unknown; inBackpack?: unknown; inShipStorage?: unknown } };
                    _id?: string;
                };
                /* eslint-enable no-restricted-syntax */
                if (data.system) {
                    data.system.state = { ...data.system.state, equipped: false, inBackpack: true, inShipStorage: false };
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
        const item = this._resolveItemFromTarget(target);
        if (!item) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system.state is Foundry DataModel; activated not on base type; bracket access needs Record cast
        await item.update({ 'system.state.activated': ((item.system as Record<string, unknown>)['state'] as Record<string, unknown>)['activated'] !== true });
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

            if (action === undefined) {
                // no-op
            } else if (action === 'equip-armour') {
                const armourItems = items.filter((i: WH40KItem & { isArmour?: boolean }) => i.type === 'armour' || i.isArmour);
                const toEquip = armourItems.filter((item) => item.system.state.equipped !== true);
                await Promise.all(toEquip.map(async (item) => item.update({ 'system.state.equipped': true })));
                count = toEquip.length;
                this._notify('info', `Equipped ${count} armour piece${count !== 1 ? 's' : ''}`, {
                    duration: 3000,
                });
            } else if (action === 'unequip-all') {
                const equippedItems = items.filter((i: WH40KItem) => (i.system as { state?: { equipped?: boolean } }).state?.equipped === true);
                await Promise.all(equippedItems.map(async (item) => item.update({ 'system.state.equipped': false })));
                count = equippedItems.length;
                this._notify('info', `Unequipped ${count} item${count !== 1 ? 's' : ''}`, {
                    duration: 3000,
                });
            } else if (action === 'stow-gear') {
                const gearItems = items.filter(
                    (i: WH40KItem & { isGear?: boolean; system: WH40KItem['system'] & { state?: { inBackpack?: boolean } } }) =>
                        (i.type === 'gear' || i.isGear) && i.system.state.inBackpack !== true,
                );
                await Promise.all(
                    gearItems.map(async (item) =>
                        item.update({
                            'system.state.inBackpack': true,
                            'system.state.equipped': false,
                        }),
                    ),
                );
                count = gearItems.length;
                this._notify('info', `Stowed ${count} gear item${count !== 1 ? 's' : ''} in backpack`, {
                    duration: 3000,
                });
            } else {
                this._notify('warning', `Unknown bulk action: ${action}`, {
                    duration: 3000,
                });
            }
        } catch (error) {
            this._notify('error', `Bulk operation failed: ${errorMessage(error)}`, {
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
    /*  Event Handlers - Dark Pacts (#84)           */
    /* -------------------------------------------- */

    /**
     * Shift the per-pact disposition by ±n, clamped to [-3..+3] via the
     * canonical helper in `src/module/rules/dark-pact.ts`. The target button
     * carries `data-pact-index` (numeric index into `system.pacts`) and
     * `data-delta` (signed integer).
     */
    static async #adjustPactDisposition(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset['pactIndex'] ?? '-1', 10);
        const delta = parseInt(target.dataset['delta'] ?? '0', 10);
        if (Number.isNaN(index) || index < 0 || Number.isNaN(delta) || delta === 0) return;

        const pacts = this.actor.system.pacts;
        if (!Array.isArray(pacts) || index >= pacts.length) return;

        const updated = structuredClone(pacts);
        const entry = updated[index];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test parser lacks noUncheckedIndexedAccess; strict tsconfig sees indexed access as possibly undefined
        if (entry === undefined) return;
        const current = entry.disposition as PactDisposition;
        entry.disposition = adjustPactDisposition(current, delta);
        await this.actor.update({ 'system.pacts': updated });
    }

    /* -------------------------------------------- */

    /**
     * Toggle the `discovered` flag for a pact. When flipping from
     * `false → true`, fire the canonical Subtlety hit through the actor's
     * `applySubtletyFromSource(pactUuid)` — this is the same path used by
     * compendium-driven Subtlety adjusters and ensures the
     * `lastSubtletySource` flag and discovery audit trail are populated
     * consistently.
     */
    static async #togglePactDiscovered(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset['pactIndex'] ?? '-1', 10);
        if (Number.isNaN(index) || index < 0) return;

        const pacts = this.actor.system.pacts;
        if (!Array.isArray(pacts) || index >= pacts.length) return;

        const updated = structuredClone(pacts);
        const entry = updated[index];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test parser lacks noUncheckedIndexedAccess; strict tsconfig sees indexed access as possibly undefined
        if (entry === undefined) return;
        const wasDiscovered = entry.discovered;
        entry.discovered = !wasDiscovered;
        await this.actor.update({ 'system.pacts': updated });

        // Apply the canonical Subtlety hit only on the false → true edge.
        if (!wasDiscovered && entry.pactUuid) {
            await this.actor.applySubtletyFromSource(entry.pactUuid);
        }
    }

    /* -------------------------------------------- */

    /**
     * Toggle the `paymentCurrent` flag for a pact. Disposition consequences
     * of missed payments are GM-driven via the disposition stepper; this
     * handler only flips the bookkeeping flag.
     */
    static async #togglePactPayment(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset['pactIndex'] ?? '-1', 10);
        if (Number.isNaN(index) || index < 0) return;

        const pacts = this.actor.system.pacts;
        if (!Array.isArray(pacts) || index >= pacts.length) return;

        const updated = structuredClone(pacts);
        const entry = updated[index];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test parser lacks noUncheckedIndexedAccess; strict tsconfig sees indexed access as possibly undefined
        if (entry === undefined) return;
        entry.paymentCurrent = !entry.paymentCurrent;
        await this.actor.update({ 'system.pacts': updated });
    }

    /* -------------------------------------------- */

    /**
     * Toggle the `complete` flag on an Endeavour's Objective. Updates the
     * parent Endeavour item's `apEarned` total in lockstep — when an
     * objective is checked, its AP contribution is added; when unchecked, it
     * is reversed. Once `apEarned >= apRequired`, the actor sheet renders a
     * "grant reward" button which calls `completeEndeavour`.
     *
     * The action's button carries:
     *   - data-endeavour-id  → the parent Endeavour item id on the actor
     *   - data-objective-index → numeric index into `system.objectives`
     */
    static async #completeObjective(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const endeavourId = target.dataset['endeavourId'];
        const idxStr = target.dataset['objectiveIndex'];
        if (endeavourId === undefined || idxStr === undefined) return;
        const idx = Number.parseInt(idxStr, 10);
        if (!Number.isFinite(idx)) return;
        const item = this.actor.items.get(endeavourId);
        if (item?.type !== 'endeavour') return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: ItemDataModel index signature widens; narrow to endeavour-specific surface via unknown
        const sys = item.system as unknown as {
            apEarned: number;
            apRequired: number;
            objectives: Array<{ name: string; description: string; complete: boolean; ap: number }>;
        };
        if (idx < 0 || idx >= sys.objectives.length) return;
        const objective = sys.objectives[idx];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test parser lacks noUncheckedIndexedAccess; strict tsconfig sees indexed access as possibly undefined
        if (objective === undefined) return;
        const nextObjectives = sys.objectives.map((o, i) => (i === idx ? { ...o, complete: !o.complete } : o));
        const delta = objective.complete ? -objective.ap : objective.ap;
        const nextApEarned = Math.max(0, sys.apEarned + delta);
        await item.update({
            'system.objectives': nextObjectives,
            'system.apEarned': nextApEarned,
        });
    }

    /* -------------------------------------------- */

    /**
     * Grant the reward for a completed Endeavour: add the Endeavour's
     * `reward.profitFactor` to `actor.system.rogueTrader.profitFactor.current`
     * and post a chat card summarising the reward. The Endeavour item is
     * left in place (with `apEarned >= apRequired`) so the GM still sees
     * the historical record on the sheet.
     *
     * Guarded against double-spending: refuses to act unless
     * `system.isComplete` evaluates to true on the embedded Endeavour.
     */
    static async #completeEndeavour(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        const endeavourId = target.dataset['endeavourId'];
        if (endeavourId === undefined) return;
        const item = this.actor.items.get(endeavourId);
        if (item?.type !== 'endeavour') return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: ItemDataModel index signature widens; narrow to endeavour-specific surface via unknown
        const sys = item.system as unknown as {
            apEarned: number;
            apRequired: number;
            isComplete: boolean;
            reward: { profitFactor: number; narrative: string };
        };
        if (!sys.isComplete) return;
        const award = Math.max(0, sys.reward.profitFactor);
        // eslint-disable-next-line no-restricted-syntax -- boundary: rogueTrader.profitFactor.current is a per-system actor schema field not exposed on the abstract WH40KBaseActor system surface
        const currentPF = (this.actor.system as { rogueTrader?: { profitFactor?: { current?: number } } }).rogueTrader?.profitFactor?.current ?? 0;
        if (award > 0) {
            await this.actor.update({ 'system.rogueTrader.profitFactor.current': currentPF + award });
        }
        const headerLabel = game.i18n.localize('WH40K.Endeavours.RewardGrantedHeader');
        const apLabel = game.i18n.localize('WH40K.Endeavours.APShort');
        const pfLabel = game.i18n.localize('WH40K.Endeavours.RewardProfitFactor');
        const narrative = sys.reward.narrative === '' ? '' : `<p>${foundry.utils.escapeHTML(sys.reward.narrative)}</p>`;
        const content = `
            <div class="endeavour-chat-card">
                <h3>${headerLabel}: ${foundry.utils.escapeHTML(item.name)}</h3>
                <p><strong>${apLabel}:</strong> ${sys.apEarned}/${sys.apRequired}</p>
                ${award > 0 ? `<p><strong>${pfLabel}:</strong> +${award}</p>` : ''}
                ${narrative}
            </div>
        `;
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content,
            flags: {
                'wh40k-rpg': {
                    type: 'endeavour-reward',
                    endeavourId,
                },
            },
        });
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
     * Open the Colony Growth Dialog for resolving a 90-day Colony growth
     * cycle (Stars of Inequity, #195). RT-gated — the Dynasty tab where
     * this button lives is only rendered for RT characters, so the
     * runtime guard is defensive against accidental invocation on other
     * systems.
     * @this {CharacterSheet}
     * @param {Event} event Triggering click event.
     * @param {HTMLElement} target Button that was clicked.
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- ApplicationV2 action handlers expect Promise<void>; concrete impl is synchronous
    static async #openColonyGrowthDialog(this: CharacterSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        if (this._resolveGameSystemId() !== 'rt') return;
        ColonyGrowthDialog.show(this.actor);
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
            this._notify('error', `Failed to vocalize bonus: ${errorMessage(error)}`, {
                duration: 5000,
            });
            console.error('Bonus vocalize error:', error);
        }
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
     * Spend one Unleash Daemon charge for the current session. Routes
     * through the pure `spendUnleashDaemon` helper to keep parity with the
     * engine; no-ops with a warning when the actor is in the `none` state
     * or has exhausted their per-session uses.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #unleashDaemon(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            const slot = this._readPossessionSlot();
            if (!canUnleashDaemon(slot)) {
                this._notify('warning', game.i18n.localize('WH40K.Possession.UnleashUnavailable'), { duration: 3000 });
                return;
            }
            const next = spendUnleashDaemon(slot);
            await this._updateSystemField('system.possession.unleashUsed', next.unleashUsed);
            this._notify('info', game.i18n.localize('WH40K.Possession.UnleashSpent'), { duration: 2500 });
        } catch (error) {
            this._notify('error', `Failed to unleash daemon: ${errorMessage(error)}`, { duration: 5000 });
            console.error('Unleash daemon error:', error);
        }
    }

    /**
     * Reset the per-session Unleash Daemon counter to zero. GM-only — the
     * button only renders for GM users in the template, but we still gate
     * server-side in case the action is dispatched via console.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #resetPossessionSession(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            if (!game.user.isGM) {
                this._notify('warning', game.i18n.localize('WH40K.Possession.ResetGmOnly'), { duration: 3000 });
                return;
            }
            const slot = this._readPossessionSlot();
            const next = resetSessionUnleash(slot);
            await this._updateSystemField('system.possession.unleashUsed', next.unleashUsed);
            this._notify('info', game.i18n.localize('WH40K.Possession.ResetDone'), { duration: 2500 });
        } catch (error) {
            this._notify('error', `Failed to reset possession session: ${errorMessage(error)}`, { duration: 5000 });
            console.error('Reset possession session error:', error);
        }
    }

    /**
     * Post a possession Frenzy/Mismanifest chat card. Mirrors the
     * disorder-roll-dialog render+create pattern (chat templates render
     * outside the sheet root; the renderChatMessageHTML hook supplies the
     * `.wh40k-rpg` ancestor).
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: data is passed straight into foundry.applications.handlebars.renderTemplate which accepts an arbitrary template context
    async _postPossessionChat(data: Record<string, unknown>): Promise<void> {
        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/possession-frenzy-chat.hbs', data);
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: game.user.id, content: html, speaker: { alias: this.actor.name } } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
    }

    /**
     * Per-round Challenging (+0) Willpower test while the Possession power
     * is sustained (#132 — beyond.md L2095-2116). Failure inflicts Frenzy
     * this round; the power must still be sustained.
     * @this {CharacterSheet}
     */
    static async #possessionFrenzyTest(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            const slot = this._readPossessionSlot();
            if (slot.state !== 'latent') {
                this._notify('warning', game.i18n.localize('WH40K.Possession.FrenzyLoopUnavailable'), { duration: 3000 });
                return;
            }
            const wp = Math.trunc(Number(this.actor.system.characteristics.willpower.total));
            const rollResult = await new Roll('1d100').evaluate();
            const roll = Number(rollResult.total);
            const result = resolveFrenzyTest(roll, wp);
            await this._postPossessionChat({
                mode: 'frenzy',
                actorName: this.actor.name,
                roll,
                target: result.target,
                success: result.passed,
                stateBefore: 'latent',
                stateAfter: 'latent',
            });
            this._notify(
                result.passed ? 'info' : 'warning',
                game.i18n.localize(result.passed ? 'WH40K.Possession.FrenzyResistedNotify' : 'WH40K.Possession.FrenzyEnteredNotify'),
                { duration: 3000 },
            );
        } catch (error) {
            this._notify('error', `Frenzy test failed: ${errorMessage(error)}`, { duration: 5000 });
            console.error('Possession frenzy test error:', error);
        }
    }

    /**
     * Opposed-Willpower Mismanifest contest following a Psychic Phenomena
     * result on Possession (#132). A loss escalates to full possession.
     * The daemon's Willpower mirrors the actor's until combat targeting is
     * wired (same placeholder convention as the grapple opposed roller).
     * @this {CharacterSheet}
     */
    static async #possessionMismanifest(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            const slot = this._readPossessionSlot();
            if (slot.state !== 'latent') {
                this._notify('warning', game.i18n.localize('WH40K.Possession.FrenzyLoopUnavailable'), { duration: 3000 });
                return;
            }
            const wp = Math.trunc(Number(this.actor.system.characteristics.willpower.total));
            const psykerRollResult = await new Roll('1d100').evaluate();
            const daemonRollResult = await new Roll('1d100').evaluate();
            const psykerRoll = Number(psykerRollResult.total);
            const daemonRoll = Number(daemonRollResult.total);
            const resolution = resolveMismanifestPossession(psykerRoll, wp, daemonRoll, wp, slot.state);
            const next = applyMismanifest(slot, resolution);
            await this._updateSystemField('system.possession.state', next.state);
            await this._postPossessionChat({
                mode: 'mismanifest',
                actorName: this.actor.name,
                roll: psykerRoll,
                target: wp,
                daemonRoll,
                daemonTarget: wp,
                psykerDoS: resolution.psykerDoS,
                daemonDoS: resolution.daemonDoS,
                success: resolution.psykerWon,
                stateBefore: slot.state,
                stateAfter: next.state,
            });
            this._notify(
                resolution.psykerWon ? 'info' : 'error',
                game.i18n.localize(resolution.psykerWon ? 'WH40K.Possession.MismanifestHeldNotify' : 'WH40K.Possession.MismanifestEscalated'),
                { duration: 3500 },
            );
        } catch (error) {
            this._notify('error', `Mismanifest contest failed: ${errorMessage(error)}`, { duration: 5000 });
            console.error('Possession mismanifest error:', error);
        }
    }

    /**
     * Penitent role — Mortification of the Flesh (#94, within.md p.36).
     *
     * Applies the {@link MORTIFICATION_OF_THE_FLESH} effect:
     *   - +N Fatigue via `actor.applyFatigue(fatigueCost)`
     *   - temporary ActiveEffect granting +WP modifier for durationRounds rounds
     *   - chat card narrating the action
     *
     * Errors surface as in-sheet notifications; the sheet re-renders on the
     * subsequent fatigue mutation.
     * @this {CharacterSheet}
     */
    static async #applyMortification(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            await this.actor.applyFatigue(MORTIFICATION_OF_THE_FLESH.fatigueCost);

            const effectData = {
                name: game.i18n.localize('WH40K.Mortification.ChatTitle'),
                icon: 'icons/svg/aura.svg',
                changes: [
                    {
                        key: 'system.characteristics.willpower.modifier',
                        mode: 2,
                        value: String(MORTIFICATION_OF_THE_FLESH.wpBonus),
                        priority: 20,
                    },
                ],
                duration: { rounds: MORTIFICATION_OF_THE_FLESH.durationRounds },
                flags: { wh40k: { source: 'mortification' } },
            };
            // @ts-expect-error -- boundary: Foundry V14 ActiveEffect CreateData type omits name/icon/changes/duration; the structure matches runtime
            await this.actor.createEmbeddedDocuments('ActiveEffect', [effectData]);

            const gameSystem = this._resolveGameSystemId() ?? '';
            const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/mortification-chat.hbs', {
                actorName: this.actor.name,
                wpBonus: MORTIFICATION_OF_THE_FLESH.wpBonus,
                durationRounds: MORTIFICATION_OF_THE_FLESH.durationRounds,
                gameSystem,
            });
            await ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content,
            });
        } catch (error) {
            this._notify('error', `Failed to apply Mortification of the Flesh: ${errorMessage(error)}`, { duration: 5000 });
            console.error('Mortification of the Flesh error:', error);
        }
    }

    /**
     * Fanatic role — Death to All Who Oppose Me (#93, within.md p.34/967).
     *
     * RAW: the Fanatic spends a Fate point to count as having Hatred against
     * their current foe for the duration of the encounter. We model the
     * encounter window as {@link DEATH_TO_OPPOSE_DURATION_ROUNDS} rounds and
     * surface the Hatred bonus mechanically as +10 WS / +10 BS via an
     * ActiveEffect on the actor's characteristic modifiers.
     *
     * Pipeline:
     *   - refuse if `system.fate.value` is 0 (in-sheet notification)
     *   - decrement `system.fate.value` by 1
     *   - create a temporary ActiveEffect granting +10 to both WS and BS
     *     `.modifier` for DEATH_TO_OPPOSE_DURATION_ROUNDS rounds
     *   - emit a chat card narrating the spend
     *
     * Errors surface as in-sheet notifications.
     * @this {CharacterSheet}
     */
    static async #deathToAllWhoOpposeMe(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            const fateValue = this.actor.system.fate.value;
            if (fateValue <= 0) {
                this._notify('warning', game.i18n.localize('WH40K.Fanatic.NoFatePoints'), { duration: 3000 });
                return;
            }

            await this._updateSystemField('system.fate.value', fateValue - 1);

            const wsBonus = 10;
            const bsBonus = 10;
            const effectData = {
                name: game.i18n.localize('WH40K.Fanatic.ChatTitle'),
                icon: 'icons/svg/sword.svg',
                changes: [
                    {
                        key: 'system.characteristics.weaponSkill.modifier',
                        mode: 2,
                        value: String(wsBonus),
                        priority: 20,
                    },
                    {
                        key: 'system.characteristics.ballisticSkill.modifier',
                        mode: 2,
                        value: String(bsBonus),
                        priority: 20,
                    },
                ],
                duration: { rounds: DEATH_TO_OPPOSE_DURATION_ROUNDS },
                flags: { wh40k: { source: 'fanatic-death-to-oppose' } },
            };
            // @ts-expect-error -- boundary: Foundry V14 ActiveEffect CreateData type omits name/icon/changes/duration; the structure matches runtime
            await this.actor.createEmbeddedDocuments('ActiveEffect', [effectData]);

            const gameSystem = this._resolveGameSystemId() ?? '';
            const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/fanatic-chat.hbs', {
                actorName: this.actor.name,
                wsBonus,
                bsBonus,
                durationRounds: DEATH_TO_OPPOSE_DURATION_ROUNDS,
                gameSystem,
            });
            await ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content,
            });
        } catch (error) {
            this._notify('error', `Failed to apply Death to All Who Oppose Me: ${errorMessage(error)}`, { duration: 5000 });
            console.error('Death to All Who Oppose Me error:', error);
        }
    }

    /**
     * Crusader role — Smite the Unholy (#141, beyond.md p.34).
     * Spend 1 Fate to auto-pass a Fear test with DoS = WPB.
     */
    static async #smiteTheUnholy(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            const fateValue = this.actor.system.fate.value;
            if (fateValue < SMITE_THE_UNHOLY_FATE_COST) {
                this._notify('warning', game.i18n.localize('WH40K.Crusader.NoFatePoints'), { duration: 3000 });
                return;
            }
            await this._updateSystemField('system.fate.value', fateValue - SMITE_THE_UNHOLY_FATE_COST);
            const wp = this.actor.system.characteristics.willpower.total;
            const dos = resolveSmiteTheUnholyDoS(wp);
            const gameSystem = this._resolveGameSystemId() ?? '';
            const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/crusader-chat.hbs', {
                actorName: this.actor.name,
                willpowerBonus: dos,
                gameSystem,
            });
            await ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content,
            });
        } catch (error) {
            this._notify('error', `Smite the Unholy failed: ${errorMessage(error)}`, { duration: 5000 });
            console.error('Smite the Unholy error:', error);
        }
    }

    /** Manacles condition — apply (#105, errata p.176). */
    static async #applyManacles(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            await applyManaclesCondition(this.actor);
            this._notify('info', game.i18n.localize('WH40K.Condition.Manacles.AppliedNotification'), { duration: 2500 });
        } catch (error) {
            this._notify('error', `Failed to apply Manacled: ${errorMessage(error)}`, { duration: 5000 });
            console.error('applyManacles error:', error);
        }
    }

    /** Manacles condition — lift (#105). */
    static async #liftManacles(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            const removed = await liftManaclesCondition(this.actor);
            if (removed > 0) {
                this._notify('info', game.i18n.localize('WH40K.Condition.Manacles.LiftedNotification'), { duration: 2500 });
            }
        } catch (error) {
            this._notify('error', `Failed to lift Manacled: ${errorMessage(error)}`, { duration: 5000 });
            console.error('liftManacles error:', error);
        }
    }

    /** Ace role — Right Stuff Fate-spend (#100, without.md p.39). */
    static #openRightStuff(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
        try {
            openRightStuffDialog({ actor: this.actor });
        } catch (error) {
            this._notify('error', `Right Stuff dialog failed: ${errorMessage(error)}`, { duration: 5000 });
            console.error('openRightStuff error:', error);
        }
    }

    /**
     * Shared roller for the five grapple actions (#120 — core.md L10155-10180).
     *
     * Rolls 1d100 for the actor against their Strength total, rolls 1d100
     * against a placeholder opponent Strength (the opponent is supplied
     * through targeting in the live combat flow; for now the controller
     * actions roll an unopposed test echoed through the resolver so the
     * DoS math stays canonical), and dispatches the result through the
     * requested resolver. Returns the resolution so the caller can decide
     * follow-up (chat card, state flag flip).
     */
    private async _rollGrappleOpposed(resolver: (input: OpposedStrengthInput) => GrappleResolution): Promise<GrappleResolution | null> {
        try {
            // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics is keyed by characteristic slug
            const characteristics = (this.actor.system as { characteristics?: Record<string, { total?: number } | undefined> }).characteristics;
            const strengthTotal = characteristics?.['strength']?.total ?? 30;
            const actorRollObj = await new Roll('1d100').evaluate();
            const opponentRollObj = await new Roll('1d100').evaluate();
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Roll.total is typed loosely; we know it's a number after evaluate()
            const actorRoll = Math.trunc(Number((actorRollObj as unknown as { total?: number }).total ?? 0));
            // eslint-disable-next-line no-restricted-syntax -- boundary: same as above
            const opponentRoll = Math.trunc(Number((opponentRollObj as unknown as { total?: number }).total ?? 0));
            return resolver({
                actorRoll,
                actorStrength: strengthTotal,
                opponentRoll,
                opponentStrength: strengthTotal,
            });
        } catch (error) {
            this._notify('error', `Grapple action failed: ${errorMessage(error)}`, { duration: 5000 });
            console.error('Grapple action error:', error);
            return null;
        }
    }

    /** Grapple controller — Damage Opponent (#120, opposed Strength). */
    static async #grappleDamageOpponent(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        await this._rollGrappleOpposed(resolveDamageOpponent);
    }

    /** Grapple controller — Throw Down Opponent (#120, opposed Strength). */
    static async #grappleThrowDownOpponent(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        await this._rollGrappleOpposed(resolveThrowDownOpponent);
    }

    /** Grapple controlled — Break Free (#120, opposed Strength). */
    static async #grappleBreakFree(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        const result = await this._rollGrappleOpposed(resolveBreakGrapple);
        if (result?.success === true) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry flag bag is keyed by namespace at runtime
            await (this.actor as unknown as { setFlag: (scope: string, key: string, value: unknown) => Promise<unknown> }).setFlag('wh40k-rpg', 'grapple', {
                state: 'none',
            });
        }
    }

    /** Grapple controlled — Stand Up while gripped (#120, opposed Strength). */
    static async #grappleStandUp(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        await this._rollGrappleOpposed(resolveStandUpInGrapple);
    }

    /** Grapple controlled — Move while grappling (#120, opposed Strength). */
    static async #grappleMove(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        await this._rollGrappleOpposed(resolveMoveWhileGrappling);
    }

    /**
     * Shock — Snap Out of It (#66, core.md §"Shock And Snapping Out Of It").
     *
     * Rolls a d100 Willpower test (Challenging +0 — target equals the
     * actor's Willpower total). On success, decrements `system.shock.value`
     * by 1 via `actor.applyShock(-1)`. Either outcome is narrated to chat
     * via the shock-snap-chat template.
     *
     * Errors surface as in-sheet notifications.
     * @this {CharacterSheet}
     */
    static async #snapOutOfShock(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        try {
            // eslint-disable-next-line no-restricted-syntax -- boundary: shock slot is optional on the typed system union; cast through unknown is necessary
            const shock = (this.actor.system as { shock?: { value: number; max: number } }).shock;
            const shockBefore = shock?.value ?? 0;
            if (shockBefore <= 0) {
                this._notify('info', game.i18n.localize('WH40K.Shock.Header'), { duration: 2500 });
                return;
            }

            // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics is keyed by characteristic slug
            const characteristics = (this.actor.system as { characteristics?: Record<string, { total?: number } | undefined> }).characteristics;
            const willpower = characteristics?.['willpower']?.total ?? 0;

            // Challenging +0 — target equals the unmodified Willpower total.
            const roll = await new Roll('1d100').evaluate();
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Roll.total is typed loosely; we know it's a number after evaluate()
            const rollValue = Math.trunc(Number((roll as unknown as { total?: number }).total ?? 0));
            const success = rollValue <= willpower;

            if (success) {
                await this.actor.applyShock(-1);
            }
            const shockAfter = Math.max(0, shockBefore - (success ? 1 : 0));

            const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/shock-snap-chat.hbs', {
                actorName: this.actor.name,
                willpower,
                roll: rollValue,
                success,
                shockBefore,
                shockAfter,
            });
            await ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content,
            });
        } catch (error) {
            this._notify('error', `Failed to snap out of shock: ${errorMessage(error)}`, { duration: 5000 });
            console.error('Snap Out of It error:', error);
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
            this._notify('error', `Failed to open Origin Path Builder: ${errorMessage(error)}`, {
                duration: 5000,
            });
            console.error('Origin Path Builder error:', error);
        }
    }

    /**
     * On first open of an unbuilt character/NPC, prompt to run the origin-path
     * builder — the d20 on the portrait isn't obvious enough. A completed origin
     * path (all three core steps set) never prompts; "don't show again" sets a
     * per-actor flag so it stops nagging. The d20 stays the always-on entry point.
     */
    async #maybePromptOriginPathIncomplete(): Promise<void> {
        if (!this.actor.isOwner) return;
        if (!WH40KSettings.isOriginPathPromptEnabled()) return;
        const op = this.actor.system.originPath;
        const built = op.homeWorld !== '' && op.background !== '' && op.role !== '';
        if (built) return;
        if (this.actor.getFlag('wh40k-rpg', 'originPromptDismissed') === true) return;

        const message = game.i18n.localize('WH40K.OriginPath.IncompletePrompt.Message');
        const dontShow = game.i18n.localize('WH40K.OriginPath.IncompletePrompt.DontShowAgain');
        const content = `<div class="wh40k-rpg"><p>${message}</p><label class="tw-flex tw-items-center tw-gap-2 tw-mt-2"><input type="checkbox" name="dontShowAgain" /> <span>${dontShow}</span></label></div>`;

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
            await this.actor.setFlag('wh40k-rpg', 'originPromptDismissed', true);
        }
        if (choice === 'build') {
            await this._openOriginPathBuilder();
        }
    }

    /* -------------------------------------------- */

    /**
     * Open the Fate Point uses reference dialog. Triggered by clicking the
     * Fate Point icon / label on the character sheet (issue #35).
     * @this {CharacterSheet}
     */
    static #viewFateUses(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
        FateUsesDialog.open({
            gameSystem: this._resolveGameSystemId(),
        });
    }

    /**
     * GM-only manual stepper for the Warband Subtlety pool (#87).
     * Reads `data-delta` (±1) from the clicked button and routes the
     * adjustment through `WH40KBaseActor.applySubtlety(delta, 'manual')`
     * so the loss-clamp adjusters discovered by
     * `collectSubtletyAdjusters()` are honoured uniformly.
     */
    static async #adjustSubtletyManually(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        if (!game.user.isGM) return;
        const deltaAttr = target.dataset['delta'];
        if (deltaAttr === undefined || deltaAttr === '') return;
        const delta = Number.parseInt(deltaAttr, 10);
        if (!Number.isFinite(delta) || delta === 0) return;
        await this.actor.applySubtlety(delta, 'manual');
    }

    /**
     * Open a read-only popout listing every Subtlety adjuster currently
     * collected on this actor (#87). Uses Foundry's DialogV2 directly to
     * keep the surface minimal — the list is computed inline from
     * `collectSubtletyAdjusters()`.
     */
    static #viewSubtletyBreakdown(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
        const adjusters = this.actor.collectSubtletyAdjusters();
        const rows = adjusters.length
            ? adjusters
                  .map((adj) => {
                      const right =
                          adj.kind === 'clamp'
                              ? game.i18n.format('WH40K.SubtletyPanel.Clamped', { value: String(adj.minAbsoluteDelta) })
                              : `${adj.delta > 0 ? '+' : ''}${adj.delta}`;
                      return `<li><strong>${foundry.utils.escapeHTML(adj.label)}</strong> — <span>${foundry.utils.escapeHTML(right)}</span></li>`;
                  })
                  .join('')
            : `<li><em>${game.i18n.localize('WH40K.SubtletyPanel.EmptyAdjusters')}</em></li>`;
        const content = `<ul class="wh40k-subtlety-breakdown-list">${rows}</ul>`;
        void dialogV2.prompt({
            window: { title: game.i18n.localize('WH40K.SubtletyPanel.BreakdownTitle') },
            content,
            ok: { label: 'OK' },
        });
    }

    /**
     * Re-evaluate the BC Alignment at the next 10-CP threshold (#173).
     *
     * Walks the actor's chaos-advance log via `tallyAdvancesByAlignment`
     * and `deriveAlignmentFromTally`, persists the new `chaosAlignment`
     * and `alignmentCheckpoint` in a single update, then posts a chat
     * card reporting the outcome. The button is only rendered by the
     * panel when `recheckDue` is true, but we still guard against a
     * stale click here by no-op-ing if `shouldRecheckAlignment` returns
     * false. Naming matches the partial's `data-action="recheckBcAlignment"`
     * — the BC-prefixed name disambiguates it from a generic re-check
     * that may exist for other systems in the future.
     */
    static async #recheckBcAlignment(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        if (this._resolveGameSystemId() !== 'bc') return;
        const system = this.actor.system;
        const corruption = system.corruption;
        const previousCheckpoint = system.alignmentCheckpoint;
        if (!shouldRecheckAlignment(corruption, previousCheckpoint)) return;
        const previous = system.chaosAlignment;
        const tally = tallyAdvancesByAlignment(system.chaosAdvancements);
        const next = deriveAlignmentFromTally(tally);
        const newCheckpoint = nextAlignmentCheckpoint(corruption);
        try {
            await this.actor.update({
                'system.chaosAlignment': next,
                'system.alignmentCheckpoint': newCheckpoint,
            });
            const flipped = previous !== next;
            const messageKey = flipped ? 'WH40K.BC.Advancement.RecheckFlippedTo' : 'WH40K.BC.Advancement.RecheckUnchanged';
            const formatted = flipped
                ? game.i18n.format(messageKey, {
                      previous: game.i18n.localize(`WH40K.BC.Advancement.Alignment.${this.#capitalizeAlignment(previous)}`),
                      next: game.i18n.localize(`WH40K.BC.Advancement.Alignment.${this.#capitalizeAlignment(next)}`),
                  })
                : game.i18n.localize(messageKey);
            await ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: `<p><strong>${game.i18n.localize('WH40K.BC.Advancement.RecheckChatTitle')}</strong></p><p>${formatted}</p>`,
            });
        } catch (error) {
            this._notify('error', `Failed to re-check BC alignment: ${errorMessage(error)}`, { duration: 5000 });
            console.error('BC alignment recheck error:', error);
        }
    }

    /**
     * Purchase an Infamy advance for a BC actor per Table 2-9 (#173).
     *
     * Pulls cost and increment from `bc-advancement-config.ts`, confirms
     * the spend via DialogV2.prompt (matching the prompt-driven XP-spend
     * style used elsewhere in the sheet), and writes the new
     * `experience.used` + `infamy` value in a single update. The cap is
     * enforced in two places defensively: `infamyAdvanceCost` returns
     * null when at/over the cap, and the partial collapses the button to
     * the "InfamyCapped" notice.
     */
    static async #buyBcInfamyAdvance(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
        if (this._resolveGameSystemId() !== 'bc') return;
        const system = this.actor.system;
        const currentInfamy = system.infamy;
        const cost = infamyAdvanceCost(currentInfamy);
        if (cost === null) {
            this._notify('warning', game.i18n.format('WH40K.BC.Advancement.BuyInfamyCapped', { cap: String(BC_INFAMY_ADVANCE_CAP) }), {
                duration: 4000,
            });
            return;
        }
        const available = system.experience.available;
        if (available < cost) {
            this._notify(
                'warning',
                game.i18n.format('WH40K.BC.Advancement.BuyInfamyInsufficientXP', {
                    cost: String(cost),
                    available: String(available),
                }),
                { duration: 4000 },
            );
            return;
        }
        const nextInfamy = Math.min(currentInfamy + BC_INFAMY_INCREMENT, BC_INFAMY_ADVANCE_CAP);
        const confirmContent = `<p>${game.i18n.format('WH40K.BC.Advancement.BuyInfamyConfirmBody', {
            xp: String(cost),
            step: String(BC_INFAMY_INCREMENT),
            next: String(nextInfamy),
        })}</p>`;
        const confirmed = await dialogV2.confirm({
            window: { title: game.i18n.localize('WH40K.BC.Advancement.BuyInfamyConfirmTitle') },
            content: confirmContent,
            rejectClose: false,
        });
        if (!confirmed) return;
        try {
            await this.actor.update({
                'system.infamy': nextInfamy,
                'system.experience.used': system.experience.used + cost,
                'system.chaosAdvancements': [
                    ...system.chaosAdvancements,
                    {
                        category: 'infamy',
                        key: `infamy:${nextInfamy}`,
                        xpCost: cost,
                        alignment: 'unaligned',
                        fromArchetype: false,
                    },
                ],
            });
        } catch (error) {
            this._notify('error', `Failed to purchase Infamy advance: ${errorMessage(error)}`, { duration: 5000 });
            console.error('BC infamy advance purchase error:', error);
        }
    }

    /** Capitalize a ChaosAlignment string for use in the langpack key suffix. */
    #capitalizeAlignment(alignment: ChaosAlignment): string {
        return alignment.charAt(0).toUpperCase() + alignment.slice(1);
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
            ui.notifications.error(`${game.i18n.localize('WH40K.Utility.OriginPathError')}: ${errorMessage(error)}`);
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
        await this._toggleFavorite('favoriteSkills', skillKey, ['skills', 'overview']);
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
        await this._toggleFavorite('favoriteSpecialistSkills', favoriteKey, ['skills']);
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
        await this._toggleFavorite('favoriteTalents', itemId, ['overview', 'skills']);
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
            await EffectActions.createEffect(this.effectsOwner, { disabled: false, duration: {}, changes: [] });

            this._notify('info', 'New effect created', {
                duration: 2000,
            });
        } catch (error) {
            this._notify('error', `Failed to create effect: ${errorMessage(error)}`, {
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
            const effect = EffectActions.resolveEffect(this.effectsOwner, target);

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
            this._notify('error', `Failed to toggle effect: ${errorMessage(error)}`, {
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
            const effect = EffectActions.resolveEffect(this.effectsOwner, target);

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
            this._notify('error', `Failed to delete effect: ${errorMessage(error)}`, {
                duration: 5000,
            });
            console.error('Delete effect error:', error);
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Powers Actions             */
    /* -------------------------------------------- */

    /**
     * Shared roll handler for power / ritual / order list controls. They
     * differed only by the notify label and console tag; homologated to all
     * surface a "<label> not found" warning.
     */
    static async #rollItemAction(sheet: CharacterSheet, target: HTMLElement, label: string): Promise<void> {
        try {
            const itemId = target.dataset['itemId'];
            if (itemId === undefined || itemId === '') return;
            const item = sheet.actor.items.get(itemId);
            if (item === undefined) {
                sheet._notify('warning', `${label} not found`, { duration: 3000 });
                return;
            }
            await sheet.actor.rollItem(itemId);
        } catch (error) {
            sheet._notify('error', `${label} roll failed: ${errorMessage(error)}`, { duration: 5000 });
            console.error(`${label} roll error:`, error);
        }
    }

    /**
     * Shared vocalize-to-chat handler for power / ritual / order controls.
     * Differed only by the chat-card CSS class and notify label.
     */
    static async #vocalizeItemAction(sheet: CharacterSheet, target: HTMLElement, label: string, cssClass: string): Promise<void> {
        try {
            const itemId = target.dataset['itemId'];
            if (itemId === undefined || itemId === '') return;
            const item = sheet.actor.items.get(itemId);
            if (item === undefined) {
                sheet._notify('warning', `${label} not found`, { duration: 3000 });
                return;
            }

            if (typeof item.toChat === 'function') {
                await item.toChat();
            } else {
                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
                    content: `<div class="${cssClass}"><h3>${item.name}</h3><p>${item.system.description.value}</p></div>`,
                });
            }
        } catch (error) {
            sheet._notify('error', `Failed to post ${label.toLowerCase()}: ${errorMessage(error)}`, { duration: 5000 });
            console.error(`Vocalize ${label.toLowerCase()} error:`, error);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling a psychic or navigator power.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollPower(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        await CharacterSheet.#rollItemAction(this, target, 'Power');
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
            this._notify('error', `Damage roll failed: ${errorMessage(error)}`, { duration: 5000 });
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
        await CharacterSheet.#vocalizeItemAction(this, target, 'Power', 'wh40k-power-chat');
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
        await CharacterSheet.#rollItemAction(this, target, 'Ritual');
    }

    /* -------------------------------------------- */

    /**
     * Handle vocalizing a ritual to chat.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizeRitual(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        await CharacterSheet.#vocalizeItemAction(this, target, 'Ritual', 'wh40k-ritual-chat');
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling an order.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollOrder(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        await CharacterSheet.#rollItemAction(this, target, 'Order');
    }

    /* -------------------------------------------- */

    /**
     * Handle vocalizing an order to chat.
     * @this {CharacterSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #vocalizeOrder(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
        await CharacterSheet.#vocalizeItemAction(this, target, 'Order', 'wh40k-order-chat');
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
                    | { draw: () => Promise<unknown> }
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
            this._notify('error', `Phenomena roll failed: ${errorMessage(error)}`, { duration: 5000 });
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
                    | { draw: () => Promise<unknown> }
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
            this._notify('error', `Perils roll failed: ${errorMessage(error)}`, { duration: 5000 });
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
