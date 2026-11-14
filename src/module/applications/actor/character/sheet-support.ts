/**
 * Module-level support for the character sheet (#716): the Foundry handles it
 * binds once, small helpers, the context and panel types, and the per-line panel
 * table. They lived above the class in `character-sheet.ts`; the sheet and the
 * per-panel modules beside this one both import them from here.
 */
import type { OrderPanelRow } from '../../../actions/ow-orders-actions.ts';
import type { CharacterSheetCapabilities, ChaosAlignment, GameSystemId } from '../../../config/game-systems/types.ts';
import type { WH40KItem } from '../../../documents/item.ts';
import type { SimpleSkillData } from '../../../rolls/action-data.ts';
import type { ResourceRow } from '../../../rules/acquisition-resources.ts';
import type { DaemonPrinceAlignment } from '../../../rules/bc-daemon-prince.ts';
import type { PsyMode } from '../../../rules/bc-psychic-strength.ts';
import type { AstartesImplantId } from '../../../rules/dw-astartes.ts';
import type { SpecialAbilityCategory } from '../../../rules/dw-distinction.ts';
import type { AmmoEffect, DwSelectedAmmoId } from '../../../rules/dw-special-ammo.ts';
import type { GrapplePanelSection, GrappleState } from '../../../rules/grapple.ts';
import type { HandBudget } from '../../../rules/hand-budget.ts';
import type { ComradeHealingPanelView } from '../../../rules/ow-comrade-healing.ts';
import type { ComradePanelView } from '../../../rules/ow-comrade.ts';
import type { buildOwCraftsmanshipPanel } from '../../../rules/ow-craftsmanship-panel.ts';
import type { RegimentPanelSummary } from '../../../rules/ow-regiment-creation.ts';
import { contentRefName, documentRefName } from '../../../utils/content-ref-name.ts';
import { uuidNameCache } from '../../../utils/uuid-name-cache.ts';
import type { DialogV2Like, TextEditorImplementationLike } from '../../api/application-types.ts';
import type { BcGiftsPanelContext } from '../bc-gifts-panel-context.ts';
import type CharacterSheet from '../character-sheet.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is untyped V14 API; double-cast is the only way to extract the TextEditor implementation
export const TextEditor = (foundry.applications as unknown as { ux: { TextEditor: { implementation: TextEditorImplementationLike } } }).ux.TextEditor
    .implementation;
// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is untyped V14 API; double-cast is the only way to extract DialogV2
export const dialogV2 = (foundry.applications as unknown as { api: { DialogV2: DialogV2Like } }).api.DialogV2;
// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is untyped V14 API; Toast is an optional extension with no shipped types
export const toast = (foundry.applications as unknown as { api?: { Toast?: Record<string, (...args: unknown[]) => void> } }).api?.Toast;

/**
 * Convert a kebab-case (or bare) id to PascalCase for building langpack keys —
 * e.g. `squad-mode` → `SquadMode`. Single source for the (formerly six)
 * identical inline definitions across the engine-panel context builders (#284).
 */
/** An actor that opens its own skill tests (characters and NPCs). */
export interface SkillRoller {
    rollSkill: (skill: string, speciality: undefined, options: { instance: SimpleSkillData }) => Promise<void> | void;
}

/** Whether an actor document opens its own skill tests. */
export function isSkillRoller(actor: object): actor is SkillRoller {
    return 'rollSkill' in actor && typeof actor.rollSkill === 'function';
}

export function titleCase(s: string): string {
    return s.replace(/(^|-)([a-z])/g, (_m, _p, c: string) => c.toUpperCase());
}

/** The name to show for a stored content reference: a document UUID's name, or the value as stored (#160, #161). */
export function cachedRefName(ref: string): string {
    return contentRefName(ref, (uuid) => uuidNameCache.getName(uuid));
}

/** The name to show for a conferred award: its medal's name, never a stored id (#699). */
export function awardRefName(ref: string): string {
    return documentRefName(ref, (uuid) => uuidNameCache.getName(uuid), game.i18n.localize('WH40K.OW.RegimentalAward.Unknown'));
}

/** Currency wallets another sheet panel already edits (RT Dynasty tab, OW Logistics panel), so the Resources panel skips them. */
export const RESOURCE_WALLETS_EDITED_ELSEWHERE: ReadonlySet<string> = new Set(['system.rogueTrader.profitFactor.current', 'system.logisticsRating']);

export type SheetTabConfig = {
    tab: string;
    label: string;
    group: string;
    cssClass?: string;
    tooltip?: string;
};

/* eslint-disable no-restricted-syntax -- boundary: sheet→template payload; the types below describe untyped values passed to Handlebars, where a concrete TS shape doesn't propagate. */
export type CharacterSheetContext = Record<string, unknown> & {
    actor?: Record<string, unknown> & { characteristics?: Record<string, Record<string, unknown>> };
    system?: Record<string, unknown> & {
        rogueTrader?: Record<string, unknown>;
        modifierSources?: { characteristics?: Record<string, unknown> };
        wounds?: { value?: number; max?: number };
        fatigue?: { value?: number; max?: number };
        armour?: Record<string, unknown>;
    };
    dh?: Record<string, unknown> & { combatActions?: { attacks?: Array<{ subtypes?: string[] }> } };
    /** Combat move-mode cluster state (#235) — drives the movement panel toggles. */
    combatMovement?: { inCombat: boolean; disabled: boolean; selectedMode: string | undefined; remaining: number };
    /** Per-turn action-economy readout (#264) — null when this actor is not in combat. */
    actionBudget?: {
        fullAvailable: boolean;
        halfRemaining: number;
        reactionRemaining: number;
        freeSpent: number;
        usedPoints: number;
    } | null;
    // Explicit declarations to avoid TS4111 (noPropertyAccessFromIndexSignature) on the
    // intersected Record<string, unknown> for all known sheet-context fields written by
    // _prepareContext / _preparePartContext / _prepareCombatData / _prepareLoadoutData / ...
} & CharacterSheetContextDeclaredFields;
type CharacterSheetContextDeclaredFields = {
    inEditMode?: boolean;
    ruleset?: unknown;
    /** The per-line sheet parts the active line shows (#715); templates gate on these, not the line id. */
    capabilities?: CharacterSheetCapabilities;
    isHomebrew?: boolean;
    isRaw?: boolean;
    /** Malignancy Tests owed by Corruption gains; 0 on lines without a Corruption Track. */
    malignancyTestsDue?: number;
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
    missionGearPanel?: OwMissionGearPanelContext;
    vehicleMovementPanel?: OwVehicleMovementPanelContext;
    comradeHealingPanel?: OwComradeHealingPanelContext;
    craftsmanshipPanel?: OwCraftsmanshipPanelContext;
    mountPanel?: OwMountPanelContext;
    drawbackPanel?: Record<string, unknown>;
    battlefieldPanel?: Record<string, unknown>;
    hideThroneGelt?: boolean;
    resourceRows?: Array<ResourceRow & { value: number | undefined }>;
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
    tab?: { id: string; group: string; cssClass: string; label: string; active: boolean };
    tabs?: unknown;
    skillsFilter?: unknown;
    skillLists?: unknown;
    biography?: unknown;
    /** The owned journal-entry items the Biography tab's journal panel lists (#613). */
    journalEntries?: WH40KItem[];
    aptitudePills?: unknown;
    aptitudes?: unknown;
    favoriteSkills?: unknown;
    favoriteTalents?: unknown;
    effects?: unknown[];
    combatTalents?: unknown[];
    woundsPercent?: number;
    fatiguePercent?: number;
    criticalInjuries?: unknown[];
    forceField?: unknown;
    hasForceField?: boolean;
    armourDisplayLocations?: unknown;
    armourDisplay?: Record<string, unknown>;
    equippedGear?: Array<{ id: string | null; name: string; img: string | null }>;
    equippedWeapons?: unknown[];
    handBudget?: HandBudget;
    psychicPowers?: PsychicPowerRow[];
    showPsychicPanel?: boolean;
    psyRating?: number;
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
    tracksEncumbrance?: boolean;
    encumbrancePercent?: number;
    hasFanatic?: boolean;
    hasCrusader?: boolean;
    grappleState?: GrappleState;
    grappleSections?: GrapplePanelSection[];
};

/**
 * Render payload for the BC Alignment / Infamy panel (#173). The fields
 * are read by `src/templates/actor/panel/bc-alignment-panel.hbs` and
 * documented in its header comment. Built by `_prepareBcAlignmentPanel`
 * only when the active game system is BC.
 */
export type BcAlignmentPanelContext = {
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
export type BcPsychicPanelContext = {
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
export type DwAstartesPanelContext = {
    implants: Array<{ id: AstartesImplantId; nameKey: string; categoryKey: string; has: boolean }>;
    strengthBonus: number;
    toughnessBonus: number;
    hasBlackCarapace: boolean;
};

/** DW Kill-team Cohesion panel (#162). */
export type DwCohesionPanelContext = {
    current: number;
    max: number;
    lostThisTurn: number;
    rallied: boolean;
    canRally: boolean;
    canRecover: boolean;
};

/** DW Squad Mode panel (#163). */
export type DwModePanelContext = {
    mode: string;
    renownRank: string;
    renownRankKey: string;
    supportRange: { visual: number; vocal: number };
    sustainedAbilities: Array<{ id: string; label: string }>;
};

/** DW Renown panel (#164). */
export type DwRenownPanelContext = {
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
export type DwRequisitionPanelContext = {
    rp: number;
    missionRating: string;
    renownRank: string;
};

/** OW Regiment panel (#151). */
export type OwRegimentPanelContext = RegimentPanelSummary;

/** The OW "Comrade in Combat" panel context: the rules layer's view (#152). */
export type OwComradePanelContext = ComradePanelView;

/** OW Logistics panel (#154). */
export type OwLogisticsPanelContext = {
    rating: number;
    munitorum: boolean;
    situational: number;
};

/** OW Orders panel (#153). */
export type OwOrdersPanelContext = {
    available: OrderPanelRow[];
    sweepingActive: Array<{ orderId: string; appliedCount: number }>;
};

/* -------------------------------------------------------------------- */
/*  Per-engine panel context shapes (batch-2 integration)               */
/* -------------------------------------------------------------------- */

/** BC Chaos Ritual panel (#179). */
export type BcRitualPanelContext = {
    ritualMastery: number;
};

/** BC Supplement Mechanics panel (#181). */
export type BcSupplementsPanelContext = {
    daemonEngineRating: number;
    daemonEngineActive: boolean;
    turnsSinceLastDamage: number;
    daemonEngineRageBonus: number;
};

/** BC apotheosis panel (#182). */
export type BcDaemonPrincePanelContext = {
    ascended: boolean;
    ascendedAt: number | null;
    alignmentAtAscension: DaemonPrinceAlignment;
    infamy: number;
    corruption: number;
    infamyThreshold: number;
    corruptionThreshold: number;
    canAscend: boolean;
    /** The recorded fate once claimed, else the fate the champion would meet now. */
    isDaemonPrince: boolean;
};

/** DW Distinctions panel (#171): the actor's owned special-ability items with
 *  their category, Renown gate, Renown reward and XP cost, plus the merged
 *  grant of every Mark of Distinction they bear. */
export type DwDistinctionPanelContext = {
    abilities: Array<{
        id: string;
        name: string;
        category: SpecialAbilityCategory;
        categoryLabel: string;
        /** Localised required Renown rank; blank when the ability has none. */
        renownRequired: string;
        renownReward: number;
        cost: number;
        /** The bearer's Renown rank is now below the ability's requirement. */
        rankTooLow: boolean;
    }>;
    merged: {
        characteristicDelta: Array<{ key: string; value: number; displayValue: string }>;
        traits: string[];
    };
};

/** DW Special-Issue Ammo panel (#172). */
export type DwAmmoPanelContext = {
    selected: DwSelectedAmmoId;
    selectedLabel: string;
    options: Array<{
        id: DwSelectedAmmoId;
        label: string;
        selected: boolean;
    }>;
    effect: AmmoEffect | null;
};

/** DW Mission Oath panel (#168). */
export type DwOathPanelContext = {
    isLeader: boolean;
    active: boolean;
    activeOathId: string | null;
    activeLabel: string | null;
    canSwear: boolean;
    canRelease: boolean;
};

/** DW Mission framework panel (#169). */
export type DwMissionPanelContext = {
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

/** OW Mission Assignment Gear panel (#155). */
export type OwMissionGearPanelContext = {
    hasOutcome: boolean;
    outcomeKey: string | null;
};

export type OwVehicleMovementPanelContext = {
    actions: Array<{ actionId: string; timing: string; nameKey: string; timingKey: string; descriptionKey: string }>;
    chaseState: { pursuerDistance: number; dangerZone: boolean; turnCount: number } | null;
};

export type OwMountPanelContext = {
    mount: { mountId: string; mountName: string; traits: Array<{ id: string; labelKey: string }> } | null;
    actions: Array<{ actionId: string; timing: string; nameKey: string; descriptionKey: string; timingKey: string }>;
};

/** The OW "Healing Comrades" panel context: the rules layer's view (#157). */
export type OwComradeHealingPanelContext = ComradeHealingPanelView;

type OwCraftsmanshipPanelContext = ReturnType<typeof buildOwCraftsmanshipPanel>;

export type OriginSummary = {
    steps: Record<string, unknown>[];
    completedSteps: number;
    totalSteps: number;
    isComplete: boolean;
    characteristics: Array<{ key: string; short: string; value: number; positive: boolean }>;
    skills: string[];
    talents: string[];
    traits: string[];
};

export type CategorizedItems = {
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

export type WeaponLike = WH40KItem & {
    system: WH40KItem['system'] & {
        state: { equipped: boolean; activated: boolean };
        class: string;
        type: string;
        clip: { max: number; value: number };
        ammoPercentage: number;
        effectiveClipMax: number;
        isTwoHanded: boolean;
        [key: string]: unknown;
    };
    ammoPercent: number;
    [key: string]: unknown;
};

/** One psychic-power row rendered on the combat-station panel (#412). */
type PsychicPowerRow = {
    id: string | null;
    name: string;
    img: string | null;
    disciplineLabel: string;
    focusTestLabel: string;
    prCost: number;
    isAttack: boolean;
    identified: boolean;
};

export type TalentLike = WH40KItem & {
    system: WH40KItem['system'] & {
        tier: number | string;
        category: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
};

export type UtilityMenuOption = {
    name: string;
    icon: string;
    callback: () => void | Promise<void>;
    condition?: () => boolean;
};

/**
 * Per-system overview-panel registry (#282). Replaces the three copy-pasted
 * per-line dispatch blocks with one table: the active
 * system's entries are looped and each `build` result written into the context
 * under its `key`. Adding a system's panel is now a one-row edit. The exact
 * context-key names the `.hbs` partials read are preserved verbatim.
 */
interface PanelBuilder {
    key: string;
    build: (sheet: CharacterSheet) => object;
}

/** The per-system panels a sheet class builds into its render context. */
export type SystemPanels = Partial<Record<GameSystemId, readonly PanelBuilder[]>>;

/** OW pass-through panels read `system.*` by string key (no dedicated _prepare method yet). */
export function owSystemRecord(sheet: CharacterSheet): Record<string, unknown> {
    return sheet.actor.system;
}

/** The render context and options ApplicationV2 hands a part's context builder. */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2's part-context and render-options signatures use Record<string, unknown>
export type PartContext = Record<string, unknown>;
