/**
 * Origin Path Builder - Refactored Design
 *
 * Step-by-step character creation interface with:
 * - Click to view details, confirm to select
 * - Bidirectional navigation (Forward from Home World OR Backward from Career)
 * - Optional lineage step at the end
 * - Choice and roll management
 * - Live preview of accumulated bonuses
 */

import type { BaseSystemConfig } from '../../config/game-systems/base-system-config.ts';
import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import type { GameSystemId, OriginStepConfig, OriginStepDef, Prerequisite } from '../../config/game-systems/types.ts';
import type { AvailabilityConfig } from '../../config.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { AVAILABILITY_KEYS, normaliseAvailability } from '../../rules/acquisition-ladder.ts';
import { divinationMaxim } from '../../rules/divination.ts';
import { eliteCharge, grantedEliteSources } from '../../rules/elite-advances.ts';
import { activeRulesetVariant, isHomebrewVariant } from '../../rules/ruleset-variant.ts';
import type { WH40KCharacteristic, WH40KItemModifiers } from '../../types/global.d.ts';
import type { I18nKey } from '../../types/i18n-keys';
import { resolvePack } from '../../utils/compendium-query.ts';
import { capitalize } from '../../utils/format.ts';
import { builderPacks, lineCategoryPack } from '../../utils/line-packs.ts';
import { OriginChartLayout } from '../../utils/origin-chart-layout.ts';
import { iterateResolvedChoices } from '../../utils/origin-choices.ts';
import { getAllCharacteristicDisplayInfo, getCharacteristicDisplayInfo, getChoiceTypeLabel, getTrainingLabel } from '../../utils/origin-ui-labels.ts';
import { checkPrerequisites, type PrereqItemView } from '../../utils/prerequisite-validator.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import {
    aptitudeCollisions,
    aptitudeGrantCounts,
    collectAptitudeChoices,
    findAptitudeOverride,
    grantedAptitudes,
    normalizeAptitudeIdentity,
    referencedAptitudes,
    swapCandidates,
} from './aptitude-pool.ts';
import { characteristicGates, elitePrerequisites, offerGates, xpShortfall } from './elite-prerequisites.ts';
import { type NormalizedChoice, type NormalizedChoiceOption, type NormalizedOrigin, normalizeOrigin } from './normalized-origin.ts';
import {
    DISCOVERY_INDEX_FIELDS,
    type DiscoveryIndexEntry,
    discoverableEntries,
    discoveredOriginDocument,
    isDiscoveryIndexEntry,
    otherLineOriginPacks,
} from './origin-discovery.ts';
import { resolveCreationOverrides } from './origin-grant-plans.ts';
import {
    isGeneratedCharacteristic,
    hasToObject,
    asOriginLike,
    asOriginLikeOrNull,
    asOriginLikeArray,
    asOriginLikeMap,
    DIRECTION,
    resolveBuilderGameSystem,
    originProvenanceFlags,
    filterOriginsByProvenance,
    GENERATION_CHARACTERISTICS,
    CHARACTERISTIC_ROLL_FORMULA,
    type OriginPathSystemData,
    type NormalizedOriginWithMeta,
    type StepLayout,
    type GrantItemRaw,
    type GrantChoiceRaw,
    type PreparedTalent,
    type PreparedTrait,
    type EquipmentItemEntry,
    type ResolvedDocument,
} from './origin-path/builder-support.ts';
import * as CommitPath from './origin-path/commit.ts';
import * as NavigationActions from './origin-path/navigation-actions.ts';
import * as RollActions from './origin-path/roll-actions.ts';
import { stepProgress } from './origin-step-progress.ts';
import { adjustedAllocation, pointBuySpent, setAllocation, type PointBuyRules } from './point-buy.ts';
import type { BuilderFlagState, CharacterGenerationSlice, CoreFlags, EquipmentEntry, ItemDataLike, PreviewGrantEntry, PreviewSummary } from './types.ts';

interface FoundryApplicationsApi {
    api: {
        ApplicationV2: ApplicationV2Ctor;
        HandlebarsApplicationMixin: <T extends ApplicationV2Ctor>(base: T) => T;
    };
}
// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is Foundry's untyped namespace; FoundryApplicationsApi describes the shape this file uses
const { ApplicationV2, HandlebarsApplicationMixin } = (foundry.applications as unknown as FoundryApplicationsApi).api;

export default class OriginPathBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
    declare actor: WH40KBaseActor;
    declare gameSystem: GameSystemId;
    declare registryConfig: BaseSystemConfig;
    declare systemConfig: OriginStepConfig;
    declare currentStepIndex: number;
    declare guidedMode: boolean;
    declare direction: string;
    declare showLineage: boolean;
    declare showCharacteristics: boolean;
    declare showEquipment: boolean;
    declare selections: Map<string, NormalizedOrigin>;
    declare previewedOrigin: NormalizedOriginWithMeta | null;
    declare lineageSelection: NormalizedOriginWithMeta | null;
    declare allOrigins: NormalizedOrigin[];
    declare lineageOrigins: NormalizedOrigin[];
    declare equipmentItems: EquipmentEntry[];
    declare equipmentSelections: Map<string, EquipmentEntry>;
    declare _equipmentLoaded: boolean;
    declare _equipmentFilter: { search: string; type: string };
    /** Per-page provenance filter (#295): which RAW / Adapted / Homebrew categories
     *  are shown. All true = show everything (the default, no-op). */
    declare _provenanceFilter: { raw: boolean; adapted: boolean; homebrew: boolean };
    declare _charRolls: number[];
    declare _charAssignments: Record<string, number | null>;
    declare _charCustomBases: Record<string, number>;
    declare _charAdvancedMode: boolean;
    declare _charGenMode: 'point-buy' | 'roll' | 'roll-pool-hb';
    /**
     * Point-buy mode: points spent above base per characteristic. Kept separate
     * from `_charRolls` (dice) and `_charCustomBases` (race baseline) so the
     * three generation modes never clobber each other's state.
     */
    declare _charPointBuy: Record<string, number>;
    declare _charDragData: { type: string; index: number; characteristic: string | null } | null;
    declare _divination: string;
    /** Resolved divination origin-path doc for the chosen divination text (#316), or null when freeform/unmatched. Applied via the same commit machinery as the step selections, but kept OUT of `this.selections` so it never inflates the size/completion logic keyed off it. */
    declare _divinationSelection: NormalizedOrigin | null;
    declare _thronesRolled: number;
    declare _influenceRolled: number;
    declare _savedScrollTop: number;
    declare _originsLoaded: boolean;
    /**
     * Replacement aptitudes the player has picked to resolve a duplicate grant.
     * Key: the original (duplicated) aptitude name as it would have been granted.
     * Value: the replacement aptitude name the player selected (or '' if explicitly skipped).
     * Used by the preview pipeline to swap doubled aptitudes with the chosen replacement,
     * so the warning banner clears once the player makes a choice. (#205)
     */
    declare aptitudeOverrides: Map<string, string>;
    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'origin-path-builder',
        classes: ['wh40k-rpg', 'origin-path-builder'],
        tag: 'div',
        window: {
            title: 'WH40K.OriginPath.BuilderTitle',
            icon: 'fa-solid fa-route',
            resizable: true,
            minimizable: true,
        },
        position: {
            width: 1100,
            height: 800,
        },
        actions: {
            randomize: NavigationActions.randomize,
            reset: NavigationActions.reset,
            export: NavigationActions.exportPath,
            import: NavigationActions.importPath,
            setMode: NavigationActions.setMode,
            setDirection: NavigationActions.setDirection,
            toggleProvenanceFilter: NavigationActions.toggleProvenanceFilter,
            goToStep: NavigationActions.goToStep,
            selectOriginCard: NavigationActions.previewOriginCard, // Changed: preview instead of select
            viewOriginCard: NavigationActions.viewOriginCard,
            viewOrigin: NavigationActions.viewOrigin,
            confirmSelection: NavigationActions.confirmSelection, // New: confirm and advance
            clearOrigin: NavigationActions.clearOrigin,
            editChoice: NavigationActions.editChoice,
            rollStat: RollActions.rollStat,
            manualStat: RollActions.manualStat,
            goToLineage: NavigationActions.goToLineage,
            skipLineage: NavigationActions.skipLineage,
            goToCharacteristics: NavigationActions.goToCharacteristics,
            rollCharacteristicsBank: RollActions.rollCharacteristicsBank,
            rollCharacteristics: RollActions.rollCharacteristics,
            adjustPointBuy: RollActions.adjustPointBuy,
            charReset: RollActions.charReset,
            charToggleAdvanced: RollActions.charToggleAdvanced,
            setCharGenMode: RollActions.setCharGenMode,
            rollDivination: RollActions.rollDivination,
            manualDivination: RollActions.manualDivination,
            rollThrones: RollActions.rollThrones,
            manualThrones: RollActions.manualThrones,
            rollInfluence: RollActions.rollInfluence,
            manualInfluence: RollActions.manualInfluence,
            commit: CommitPath.commit,
            openItem: NavigationActions.openItem,
            goToEquipment: NavigationActions.goToEquipment,
            toggleEquipmentItem: RollActions.toggleEquipmentItem,
            clearEquipment: RollActions.clearEquipment,
            resolveAptitudeDouble: RollActions.resolveAptitudeDouble,
        },
    };

    /** @override */
    static PARTS = {
        main: {
            template: 'systems/wh40k-rpg/templates/character-creation/origin-path-builder.hbs',
            scrollable: ['', '.step-content', '.selection-panel', '.preview-panel'],
        },
    };

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    /**
     * @param {Actor} actor - The character actor
     * @param {object} options - Application options
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 constructor accepts an untyped options bag
    constructor(actor: WH40KBaseActor, options: Record<string, unknown> = {}) {
        super(options);
        this.actor = actor;
        this.gameSystem = resolveBuilderGameSystem(actor, options);
        // System config from registry — used for labels, ranks, and step config
        this.registryConfig = SystemConfigRegistry.get(this.gameSystem);
        this.systemConfig = this.registryConfig.getOriginStepConfig();
        this.currentStepIndex = 0;
        this.guidedMode = true;
        this.direction = DIRECTION.FORWARD; // Forward or backward
        this.showLineage = false; // Whether we're on the optional step
        this.showCharacteristics = false; // Whether we're on the characteristics step
        this.showEquipment = false; // Whether we're on the Equip Acolyte step
        this.selections = new Map(); // step -> Item (confirmed selections)
        this.previewedOrigin = null; // Currently previewed origin (unconfirmed)
        this.lineageSelection = null; // Separate storage for optional step
        this.allOrigins = []; // All origins from compendium (excluding optional)
        this.lineageOrigins = []; // Optional step origins
        this.equipmentItems = []; // Armoury items loaded for the Equip Acolyte step
        this.equipmentSelections = new Map(); // uuid -> compact item data
        this._equipmentLoaded = false;
        this._equipmentFilter = { search: '', type: 'all' };
        this._provenanceFilter = { raw: true, adapted: true, homebrew: true };

        // Characteristic generation state
        this._charRolls = Array<number>(9).fill(0);
        this._charAssignments = {};
        this._charCustomBases = {};
        this._charPointBuy = {};
        this._charAdvancedMode = false;
        this._charGenMode = 'roll-pool-hb';
        this._charDragData = null;
        const actorSys = this._actorSys();
        // A divination stored before #rollDivination kept only the maxim still holds the table's HTML.
        this._divination = divinationMaxim(actorSys.originPath?.divination ?? '');
        this._divinationSelection = null;
        const homebrew = isHomebrewVariant(this.gameSystem);
        this._thronesRolled = homebrew ? 0 : actorSys.throneGelt ?? 0;
        this._influenceRolled = homebrew ? 0 : actorSys.influence ?? 0;
        this._savedScrollTop = 0;
        this.aptitudeOverrides = new Map();
        this._initCharacteristicState();

        // Initialize from actor's existing origin paths
        this._initializeFromActor();
    }

    /* -------------------------------------------- */

    static GENERATION_CHARACTERISTICS = GENERATION_CHARACTERISTICS;

    /**
     * Maximum starting characteristic value (base + points spent) during
     * point-buy generation. DH2e caps a created characteristic at 40 before
     * advances/origin bonuses (#223). Origin-path bonuses are separate grants
     * and may legitimately push the displayed total above this.
     */
    static CHARACTERISTIC_GEN_MAX = 40;

    /**
     * Dice expression rolled for the bonus added on top of the characteristic
     * base in BOTH dice-driven modes (`roll-pool-hb` shared bank and per-slot
     * `roll`). The full characteristic is `base (settings) + this roll +
     * origin bonus`; this constant is the roll part only. Shared here so the
     * two modes stay in lock-step rather than each carrying its own literal
     * (DRY — was previously inlined in `#rollCharacteristicsBank`). The base
     * value itself is sourced from `WH40KSettings.getCharacteristicBase()`.
     */
    static CHARACTERISTIC_ROLL_FORMULA = CHARACTERISTIC_ROLL_FORMULA;

    /**
     * Narrow `this.actor.system` to the union view this builder reads.
     * Lives on the class so each call site reads as `this._actorSys()` instead
     * of repeating the cross-system cast inline.
     * @private
     */
    _actorSys(): OriginPathSystemData {
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system is a per-system DataModel; OriginPathSystemData is the union view used by this builder
        return this.actor.system as unknown as OriginPathSystemData;
    }

    _initCharacteristicState(): void {
        const genData: CharacterGenerationSlice = this._actorSys().characterGeneration ?? {};
        const ctor = this.constructor as typeof OriginPathBuilder;
        const CHARS = ctor.GENERATION_CHARACTERISTICS;

        this._charRolls = Array.isArray(genData.rolls) && genData.rolls.length === 9 ? [...genData.rolls] : Array<number>(9).fill(0);
        this._charAssignments = {};
        this._charCustomBases = {};
        this._charPointBuy = {};

        const assignments = genData.assignments ?? {};
        const customBases = genData.customBases ?? {};
        const pointBuy = genData.pointBuy ?? {};
        const defaultBase = WH40KSettings.getCharacteristicBase();

        for (const key of CHARS) {
            this._charAssignments[key] = assignments[key] ?? null;
            // `||` (not `??`) so any legacy persisted-as-0 custom base from
            // the pre-fix input handler is rescued on next open — a stored 0
            // is invalid for character generation, fall back to defaultBase.
            this._charCustomBases[key] = customBases[key] || defaultBase;
            // Point-buy spends are valid at 0 (nothing allocated), so `??` here
            // — unlike customBases above, a stored 0 is the legitimate default.
            this._charPointBuy[key] = Math.max(0, pointBuy[key] ?? 0);
        }
        this._charAdvancedMode = customBases.enabled === true;

        const persistedMode = genData.mode;
        this._charGenMode = persistedMode === 'point-buy' || persistedMode === 'roll' ? persistedMode : 'roll-pool-hb';
    }
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    override get title(): string {
        return game.i18n.format('WH40K.OriginPath.BuilderTitle', { name: this.actor.name });
    }

    /**
     * Get the current ordered steps based on direction
     * @type {Array}
     */
    get orderedSteps(): OriginStepDef[] {
        const steps = this.systemConfig.coreSteps;
        if (this.direction === DIRECTION.BACKWARD) {
            return [...steps].reverse();
        }
        return steps;
    }

    /**
     * Get the current step config
     * @type {object}
     */
    get currentStep(): OriginStepDef {
        if (this.showCharacteristics) {
            return {
                key: 'characteristics',
                step: 'characteristics',
                icon: 'fa-dice-d20',
                descKey: 'CharacteristicsDesc',
                stepIndex: this.systemConfig.coreSteps.length + (this.systemConfig.optionalStep ? 2 : 1),
            };
        }
        if (this.showLineage) {
            // showLineage is only set true when optionalStep exists (see #goToLineage guard)
            const optional = this.systemConfig.optionalStep;
            if (optional) return optional;
        }
        // currentStepIndex is always kept in bounds by the navigation logic
        const step = this.orderedSteps[this.currentStepIndex];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: orderedSteps is an array; element may be undefined at runtime
        if (step === undefined) throw new Error(`currentStepIndex ${this.currentStepIndex} out of bounds`);
        return step;
    }

    /* -------------------------------------------- */
    /*  Factory Method                              */
    /* -------------------------------------------- */

    /**
     * Show the Origin Path Builder for an actor
     * @param {Actor} actor - The actor to build origin path for
     * @param {object} options - Additional options
     * @returns {OriginPathBuilder} The builder instance
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: options is an ApplicationV2 options bag; no typed schema available
    static show(actor: WH40KBaseActor, options: Record<string, unknown> = {}): OriginPathBuilder {
        const builder = new OriginPathBuilder(actor, options);
        void builder.render({ force: true });
        return builder;
    }

    /* -------------------------------------------- */
    /*  Initialization                              */
    /* -------------------------------------------- */

    /**
     * Initialize selections from actor's existing origin paths
     * Converts Items to plain data objects for safe manipulation
     * @private
     */
    _initializeFromActor(): void {
        const originItems = this.actor.items.filter((i) => i.type === 'originPath');
        const optionalStepKey = this.systemConfig.optionalStep?.step ?? this.systemConfig.optionalStep?.key;
        for (const item of originItems) {
            const step = item.system.step;
            // Store as plain data objects with metadata for tracking
            const originData = this._itemToSelectionData(item);
            if (optionalStepKey !== undefined && optionalStepKey !== '' && step === optionalStepKey) {
                this.lineageSelection = originData;
            } else if (typeof step === 'string' && step !== '') {
                this.selections.set(step, originData);
            }
        }

        this._refreshPathPositions();

        // Restore builder-specific state from actor flags — things that don't live on
        // individual origin items (equipment selections, characteristic generation input).
        this._restoreBuilderFlagState();

        // Set current step to first incomplete based on direction
        const steps = this.orderedSteps;
        for (let i = 0; i < steps.length; i++) {
            const stepDef = steps[i];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: steps is an array; index may be out of bounds
            if (stepDef !== undefined && !this.selections.has(stepDef.step)) {
                this.currentStepIndex = i;
                break;
            }
        }
    }

    /**
     * Flag scope + key for serialized builder state (equipment picks, char gen inputs).
     */
    static FLAG_SCOPE = 'wh40k-rpg' as const;
    static BUILDER_STATE_FLAG = 'originPathBuilderState' as const;

    /**
     * Restore in-memory builder state from actor flags so equipment picks and
     * characteristic rolls survive across builder re-opens.
     * @private
     */
    _restoreBuilderFlagState(): void {
        const state = this.actor.getFlag(OriginPathBuilder.FLAG_SCOPE, OriginPathBuilder.BUILDER_STATE_FLAG) as BuilderFlagState | undefined;
        if (!state) return;

        const equipment = state.equipmentSelections ?? {};
        for (const [uuid, entry] of Object.entries(equipment)) {
            this.equipmentSelections.set(uuid, entry);
        }

        if (Array.isArray(state.charRolls)) this._charRolls = state.charRolls;
        if (state.charAssignments !== undefined && state.charAssignments !== null) this._charAssignments = { ...state.charAssignments };
        if (state.charAdvancedMode !== undefined && state.charAdvancedMode !== null) this._charAdvancedMode = state.charAdvancedMode;
        if (state.charCustomBases !== undefined && state.charCustomBases !== null) this._charCustomBases = { ...state.charCustomBases };
        if (state.charPointBuy !== undefined && state.charPointBuy !== null) this._charPointBuy = { ...state.charPointBuy };
        if (state.charGenMode === 'point-buy' || state.charGenMode === 'roll' || state.charGenMode === 'roll-pool-hb') {
            this._charGenMode = state.charGenMode;
        }
        if (typeof state.divination === 'string') this._divination = state.divination;
        if (typeof state.influenceRolled === 'number') this._influenceRolled = state.influenceRolled;
    }

    /**
     * Persist builder state (equipment picks, characteristic rolls) to actor flags
     * so a later builder open can re-hydrate these inputs.
     * @private
     */
    async _persistBuilderFlagState(): Promise<void> {
        const equipmentSelections: Record<string, EquipmentEntry> = {};
        for (const [uuid, entry] of this.equipmentSelections) {
            equipmentSelections[uuid] = entry;
        }
        const payload: BuilderFlagState = {
            equipmentSelections,
            charRolls: this._charRolls,
            charAssignments: this._charAssignments,
            charAdvancedMode: this._charAdvancedMode,
            charCustomBases: this._charCustomBases,
            charPointBuy: this._charPointBuy,
            charGenMode: this._charGenMode,
            divination: this._divination,
            influenceRolled: this._influenceRolled,
        };
        await this.actor.setFlag(OriginPathBuilder.FLAG_SCOPE, OriginPathBuilder.BUILDER_STATE_FLAG, payload);
    }

    /**
     * Get the last confirmed selection before a step index.
     * @param {number} stepIndex
     * @returns {object|null}
     * @private
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: confirmed selection is stored as Map<string, unknown>; caller is responsible for narrowing
    _getLastConfirmedSelection(stepIndex: number): unknown {
        const orderedSteps = this.orderedSteps;

        for (let i = stepIndex - 1; i >= 0; i--) {
            const step = orderedSteps[i];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: orderedSteps is an array; index may be out of bounds
            if (step !== undefined && this.selections.has(step.step)) {
                return this.selections.get(step.step);
            }
        }

        return null;
    }

    /**
     * Refresh resolved path positions for all selections.
     * @private
     */
    _refreshPathPositions(): void {
        let lastSelection = null;

        for (const step of this.orderedSteps) {
            const selection = this.selections.get(step.step);
            if (!selection) continue;

            selection.system['pathPositions'] = OriginChartLayout.resolvePathPositions(asOriginLike(selection), asOriginLikeOrNull(lastSelection));
            lastSelection = selection;
        }
    }

    /**
     * Convert an Item or compendium entry to a selection data object
     * @param {Item} item - The item to convert
     * @returns {object} - Plain data object for selection storage
     * @private
     */
    _itemToSelectionData(item: WH40KItem | NormalizedOrigin): NormalizedOriginWithMeta {
        // Two call shapes reach this method:
        //   1. A real Foundry Item document (compendium pack entry or owned actor item) — has `toObject()`.
        //   2. An already-normalized plain-object origin entry (e.g. from `this.allOrigins` / `this.lineageOrigins`)
        //      — no `toObject()`, the object IS the data we want to clone.
        // `hasToObject` narrows the type; the document branch extracts data via `toObject()` plus
        // document-only metadata (flags.core.sourceId, parent, id). The plain-object branch just
        // deep-clones the already-normalized shape and falls back to its own `uuid` for `_sourceUuid`.
        // Computing `data` and the metadata fields under a single narrowed branch keeps both shapes
        // in lockstep — no `?.toObject?.()` sprinkles, no double-narrowing.
        let data: ItemDataLike & { uuid?: string };
        if (hasToObject(item)) {
            data = item.toObject() as ItemDataLike & { uuid?: string };
            // Store original uuid for reference to compendium item
            const flagsCore = (item.flags as { core?: CoreFlags }).core;
            const flagSourceId = typeof flagsCore?.sourceId === 'string' ? flagsCore.sourceId : undefined;
            data._sourceUuid = (item.parent === this.actor ? flagSourceId ?? data._sourceUuid ?? item.uuid : item.uuid ?? data._sourceUuid) ?? null;
            // Store actor item id if this is an existing actor item
            data._actorItemId = item.parent === this.actor ? item.id : null;
        } else {
            data = foundry.utils.deepClone(item) as ItemDataLike & { uuid?: string };
            data._sourceUuid = data._sourceUuid ?? data.uuid ?? null;
            data._actorItemId = data._actorItemId ?? null;
        }

        // Capture the previously-persisted choice + roll state BEFORE normalize
        // runs (normalize replaces the system object reference). Without this,
        // re-opening the builder against an existing actor origin item showed
        // empty Choice Required selections and re-prompted for thrones/wounds
        // rolls — even though the data was sitting on the item.
        // eslint-disable-next-line no-restricted-syntax -- boundary: raw compendium document shape pre-normalize
        const sourceSystem = (data.system as Record<string, unknown> | undefined) ?? {};
        // eslint-disable-next-line no-restricted-syntax -- boundary: persisted snapshot is an open-ended Record we copy verbatim
        const persistedChoices = sourceSystem['selectedChoices'] as Record<string, unknown> | undefined;
        // eslint-disable-next-line no-restricted-syntax -- boundary: persisted snapshot is an open-ended Record we copy verbatim
        const persistedRolls = sourceSystem['rollResults'] as Record<string, unknown> | undefined;

        // eslint-disable-next-line no-restricted-syntax -- boundary: normalizeOrigin accepts the raw compendium document shape
        const normalized: NormalizedOriginWithMeta = normalizeOrigin(data as unknown as Record<string, unknown>);
        // Ensure choice and roll fields are available for builder state, and
        // explicitly seed them from the persisted snapshot if normalize dropped
        // the reference along the way.
        /* eslint-disable no-restricted-syntax -- dialog state: normalized.system is a compendium payload Record */
        if (normalized.system['selectedChoices'] === undefined) {
            normalized.system['selectedChoices'] = persistedChoices !== undefined ? foundry.utils.deepClone(persistedChoices) : {};
        }
        if (normalized.system['rollResults'] === undefined) {
            normalized.system['rollResults'] = persistedRolls !== undefined ? foundry.utils.deepClone(persistedRolls) : {};
        }
        /* eslint-enable no-restricted-syntax */
        normalized._sourceUuid = data._sourceUuid ?? normalized._sourceUuid ?? null;
        normalized._actorItemId = data._actorItemId ?? normalized._actorItemId ?? null;
        return normalized;
    }

    /**
     * Get system data from a selection (handles both Item and plain object)
     * @param {Item|object} selection - The selection (Item or data object)
     * @returns {object} - The system data
     * @private
     */
    _getSelectionSystem(selection: NormalizedOrigin): OriginPathSystemData {
        const selectionSystem = foundry.utils.deepClone(selection.system);
        const sourceOrigin = this._getSourceOriginForSelection(selection);
        const sourceSystem = foundry.utils.deepClone(sourceOrigin?.system ?? {});
        return foundry.utils.mergeObject(sourceSystem, selectionSystem, {
            inplace: false,
            overwrite: true,
            insertKeys: true,
            recursive: true,
        });
    }

    /** Every committed origin's merged system, in step order. */
    _selectionSystems(): OriginPathSystemData[] {
        return Array.from(this.selections.values(), (selection) => this._getSelectionSystem(selection));
    }

    /**
     * The base added to each characteristic roll: the chosen race's (BC Chaos
     * Space Marine: 30, #727) plus the world's offset, else the world setting
     * (25 + offset).
     */
    _characteristicBase(): number {
        const raceBase = resolveCreationOverrides(this._selectionSystems()).characteristicBase;
        return raceBase === null ? WH40KSettings.getCharacteristicBase() : raceBase + WH40KSettings.getCharacteristicOffset();
    }

    /** Starting XP: the chosen race's (BC Chaos Space Marine: 500, #727), else the line's. */
    _startingXP(): number {
        return resolveCreationOverrides(this._selectionSystems()).startingXP ?? this.registryConfig.startingXP;
    }

    /*
     * The commit's steps, each in `origin-path/commit.ts` (#717). The commit runs
     * them through these methods, so a step can be driven on its own (the Tier B
     * origin specs apply one step against a real actor).
     */

    /** Sum of the committed origins' characteristic modifiers, by characteristic. */
    _collectOriginCharacteristicBonuses(): Record<string, number> {
        return CommitPath.collectOriginCharacteristicBonuses.call(this);
    }

    /** Apply the chosen divination's effects to the actor. */
    async _resolveDivinationSelection(): Promise<void> {
        return CommitPath.resolveDivinationSelection.call(this);
    }

    /** Grant the talents, traits, skills and equipment the committed origins name. */
    async _applyItemGrantsFromOrigins(): Promise<void> {
        return CommitPath.applyItemGrantsFromOrigins.call(this);
    }

    /** Create the special abilities and other content items the committed origins grant. */
    async _applyContentItemGrantsFromOrigins(): Promise<void> {
        return CommitPath.applyContentItemGrantsFromOrigins.call(this);
    }

    /** Reset the actor's XP to the starting total and clear its advancements. */
    async _resetExperienceAndAdvancements(): Promise<void> {
        return CommitPath.resetExperienceAndAdvancements.call(this);
    }

    /**
     * Resolve a compendium/source origin for a persisted selection.
     * @private
     */
    _getSourceOriginForSelection(selection: NormalizedOrigin): NormalizedOrigin | null {
        const pool = [...this.allOrigins, ...this.lineageOrigins];
        if (pool.length === 0) return null;

        const identifier = selection.system['identifier'];
        const step = selection.system['step'];
        const name = selection.name;
        const uuid = (selection as NormalizedOriginWithMeta)._sourceUuid ?? selection.uuid;

        const hasUuid = uuid !== null && uuid !== '';
        const hasIdentifier = identifier !== '';
        const hasStep = step !== '';
        const hasName = name !== '';
        return (
            pool.find((origin) => hasUuid && (origin.uuid === uuid || origin.id === uuid)) ??
            pool.find((origin) => hasIdentifier && hasStep && origin.system['identifier'] === identifier && origin.system['step'] === step) ??
            pool.find((origin) => hasIdentifier && origin.system['identifier'] === identifier) ??
            pool.find((origin) => hasStep && hasName && origin.system['step'] === step && origin.name === name) ??
            null
        );
    }

    /**
     * Load all origins from compendium
     * @private
     */
    async _loadOrigins(): Promise<void> {
        if (this._originsLoaded) return;
        this._originsLoaded = true;

        // Load from the packs this line's builder reads, in the order their flags declare.
        const optionalStepIndex = this.systemConfig.optionalStep?.stepIndex;
        const allOriginPaths: NormalizedOrigin[] = [];
        // Canonical ids already listed, so a document reached through two packs lists once.
        const seen = new Set<string>();

        for (const pack of builderPacks(game.packs, this.gameSystem, 'originBuilder')) {
            // eslint-disable-next-line no-await-in-loop -- sequential: walks packs in priority order
            const documents = await pack.getDocuments();
            // Filter and normalize
            const origins = documents.filter((d): d is typeof d & { type: string } => (d as { type?: string }).type === 'originPath');
            for (const d of origins) if (typeof d.id === 'string') seen.add(d.id);
            // eslint-disable-next-line no-restricted-syntax -- boundary: normalizeOrigin accepts the raw compendium document shape and validates structurally
            allOriginPaths.push(...origins.map((d) => normalizeOrigin(d as unknown as Record<string, unknown>)));
        }

        // Homebrew conversions into this line live in their own line's packs, with no stub here (content#38).
        allOriginPaths.push(...(await this._discoverCrossLineOrigins(seen)));

        // Also surface world-created origin path Items. These are not backed by
        // a compendium source, so they are marked `fromWorld` and rendered with
        // a warning marker in the builder. Scope to the active game system when
        // the item declares one; otherwise include it. See issue #219.
        const worldOrigins = game.items.filter((i): i is typeof i & { type: string } => (i as { type?: string }).type === 'originPath');
        for (const doc of worldOrigins) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KItem.system is an untyped Foundry DataModel union; narrow to the originPath gameSystem fields we read, each guarded on the next lines
            const itemSystem = doc.system as { gameSystem?: unknown; gameSystems?: unknown };
            const declaredSystem = typeof itemSystem.gameSystem === 'string' ? itemSystem.gameSystem : null;
            const declaredSystems = Array.isArray(itemSystem.gameSystems) ? itemSystem.gameSystems : [];
            const matchesSystem =
                declaredSystem === null && declaredSystems.length === 0
                    ? true
                    : declaredSystem === this.gameSystem || declaredSystems.includes(this.gameSystem);
            if (!matchesSystem) continue;
            // eslint-disable-next-line no-restricted-syntax -- boundary: normalizeOrigin accepts the raw document shape and validates structurally
            const normalized = normalizeOrigin(doc as unknown as Record<string, unknown>);
            normalized.fromWorld = true;
            allOriginPaths.push(normalized);
        }

        if (allOriginPaths.length === 0) {
            console.warn('No origin path items found in configured compendiums');
            return;
        }

        // Separate optional step origins from core origins
        this.allOrigins = allOriginPaths.filter((o) => o.stepIndex !== optionalStepIndex);
        this.lineageOrigins = allOriginPaths.filter((o) => o.stepIndex === optionalStepIndex);
    }

    /**
     * The other lines' origins that carry a branch for this builder's line: the
     * homebrew conversions into it (content#38). They are read from each other
     * line's origin packs' index, which still holds the per-line containers, and
     * resolved for this line. `seen` dedupes by canonical id and grows as they are found.
     * @param seen  Canonical ids already listed.
     */
    async _discoverCrossLineOrigins(seen: Set<string>): Promise<NormalizedOrigin[]> {
        const packNames = otherLineOriginPacks(
            game.packs.map((p) => p.metadata),
            this.gameSystem,
        );
        const indexes = await Promise.all(
            packNames.map(async (name) => {
                const pack = resolvePack(name);
                if (!pack) return [];
                const index = await pack.getIndex({ fields: [...DISCOVERY_INDEX_FIELDS] });
                const entries: DiscoveryIndexEntry[] = [];
                for (const entry of index) if (isDiscoveryIndexEntry(entry)) entries.push(entry);
                return entries;
            }),
        );
        return indexes
            .flatMap((entries) => discoverableEntries(entries, this.gameSystem, seen))
            .map((entry) => normalizeOrigin(discoveredOriginDocument(entry, this.gameSystem)));
    }

    /**
     * Apply the per-page provenance filter (#295) to an origin list, using the
     * shared `originProvenanceFlags` classification (raw = neither flag, adapted =
     * isAdaptedHomebrew, pure = isPureHomebrew). All categories enabled is a no-op,
     * so the default state shows everything. Filtering at the source (before the
     * chart layout is computed) keeps the chart's per-step columns consistent.
     */
    _applyProvenanceFilter(origins: NormalizedOrigin[]): NormalizedOrigin[] {
        return filterOriginsByProvenance(origins, this.gameSystem, this._provenanceFilter);
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    override async _prepareContext(_options: ApplicationRenderOptions): Promise<HandlebarsContext> {
        await this._loadOrigins();

        const currentStep = this.currentStep;
        // Get origins for current step
        // eslint-disable-next-line no-restricted-syntax -- boundary: origins are normalized compendium payloads prepared for Handlebars rendering
        let currentOrigins: Record<string, unknown>[] = [];
        let selectedItem: NormalizedOriginWithMeta | null = null;

        if (this.showEquipment) {
            currentOrigins = [];
            selectedItem = null;
            await this._loadEquipmentItems();
        } else if (this.showCharacteristics) {
            // No origins to show on characteristics step
            currentOrigins = [];
            selectedItem = null;
        } else if (this.showLineage) {
            // Show all lineage options (they can pick any regardless of path)
            currentOrigins = this._prepareLineageOrigins();
            // eslint-disable-next-line no-restricted-syntax -- dialog state: previewedOrigin/lineageSelection are application state fields; ?? selects the first non-null confirmed selection
            selectedItem = this.previewedOrigin ?? this.lineageSelection;
        } else {
            // Use chart layout for core steps - pass direction and step keys for system support
            const stepKeys = this.systemConfig.coreSteps.map((s) => s.key);
            const chartLayout = OriginChartLayout.computeFullChart(
                asOriginLikeArray(this._applyProvenanceFilter(this.allOrigins)),
                asOriginLikeMap(this.selections),
                this.guidedMode,
                this.direction,
                stepKeys,
            );

            // Find the step layout matching current step
            const stepIndex = this.systemConfig.coreSteps.findIndex((s) => s.key === currentStep.key);
            // eslint-disable-next-line no-restricted-syntax -- boundary: OriginChartLayout's ChartLayout type is structurally compatible with our StepLayout view
            const chartLayoutTyped = chartLayout as unknown as { steps: StepLayout[] };
            const stepLayout = chartLayoutTyped.steps[stepIndex];
            currentOrigins = this._prepareOriginsForStep(stepLayout);
            // Use previewed origin if available, otherwise use confirmed selection
            // eslint-disable-next-line no-restricted-syntax -- dialog state: previewedOrigin is application state; ?? falls back to confirmed selection
            selectedItem = this.previewedOrigin ?? this.selections.get(currentStep.step) ?? null;
        }

        const selectedOrigin = selectedItem ? await this._prepareSelectedOrigin(selectedItem) : null;

        // System-aware values for template
        const journeyTitleKey = `WH40K.OriginPath.JourneyTitle.${this.gameSystem}`;
        const journeyTitle = game.i18n.localize(journeyTitleKey);
        const optionalStep = this.systemConfig.optionalStep;
        const hasOptionalStep = !!optionalStep;
        const optionalStepLabel = optionalStep ? this._getLocalizedStepLabel(optionalStep.key) : '';
        const optionalStepIcon = optionalStep?.icon ?? 'fa-crown';

        const variant = activeRulesetVariant(this.gameSystem);
        const isHomebrew = variant === 'homebrew';
        const isRaw = variant === 'raw';
        return {
            actor: this.actor,
            gameSystem: this.gameSystem,
            // #422: the `{{themeClassFor}}` helper reads `@root._gameSystemId`.
            _gameSystemId: this.gameSystem,
            guidedMode: this.guidedMode,
            isForward: this.direction === DIRECTION.FORWARD,
            isBackward: this.direction === DIRECTION.BACKWARD,
            hasDirectionToggle: this.registryConfig.creation.directionToggle,
            showLineage: this.showLineage,
            showCharacteristics: this.showCharacteristics,
            showEquipment: this.showEquipment,
            hasEquipmentStep: !!this.systemConfig.equipmentStep,
            isHomebrew,
            isRaw,
            hideThroneGelt: isRaw,
            provenanceFilter: this._provenanceFilter,

            // System-aware content
            journeyTitle: journeyTitle !== journeyTitleKey ? journeyTitle : game.i18n.localize('WH40K.OriginPath.YourJourney'),
            hasOptionalStep: hasOptionalStep,
            optionalStepLabel: optionalStepLabel,
            optionalStepDesc: optionalStep ? this._getLocalizedStepDescription(optionalStep.descKey) : '',
            optionalStepIcon: optionalStepIcon,

            // Step navigation
            steps: this._prepareStepNavigation(),

            // Current step content
            currentStep: {
                index: this._getNavigationIndex(currentStep.key),
                key: currentStep.key,
                label: this._getLocalizedStepLabel(currentStep.key),
                icon: currentStep.icon,
                description: this._getLocalizedStepDescription(currentStep.descKey),
                origins: currentOrigins,
                isLineage: this.showLineage,
                isCharacteristics: this.showCharacteristics,
            },

            // Characteristic generation data
            charGen: this.showCharacteristics ? this._prepareCharGenContext() : null,

            // Equip Acolyte step data (DH2e only)
            equipment: this.showEquipment ? this._prepareEquipmentContext() : null,

            // Selected origin details
            selectedOrigin: selectedOrigin,
            showSelectionPanel: !this.showCharacteristics && !this.showEquipment,

            // Lineage info
            hasLineageSelection: !!this.lineageSelection,
            lineageSelection: this.lineageSelection
                ? {
                      name: this.lineageSelection.name,
                      img: this.lineageSelection.img,
                  }
                : null,

            // Total preview
            preview: await this._calculatePreview(),

            // Status
            status: this._calculateStatus(),
        };
    }

    /**
     * Get localized step label
     * @param {string} key
     * @returns {string}
     * @private
     */
    _getLocalizedStepLabel(key: string): string {
        if (key === 'characteristics') {
            return game.i18n.localize('WH40K.CharacteristicSetup.Title');
        }
        const capitalizedKey = capitalize(key);
        return game.i18n.localize(`WH40K.OriginPath.${capitalizedKey}`);
    }

    /**
     * Get localized step description
     * @param {string} descKey
     * @returns {string}
     * @private
     */
    _getLocalizedStepDescription(descKey: string): string {
        if (!descKey) return '';
        return game.i18n.localize(`WH40K.OriginPath.${descKey}`);
    }

    /**
     * Prepare characteristic generation context for rendering.
     * @private
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _prepareCharGenContext builds context for Handlebars rendering; Record<string,unknown> is the shape consumed by the template
    _prepareCharGenContext(): Record<string, unknown> {
        const ctor = this.constructor as typeof OriginPathBuilder;
        const CHARS = ctor.GENERATION_CHARACTERISTICS;
        const DEFAULT_BASE = this._characteristicBase();
        const originBonuses = this._getOriginCharacteristicBonuses();

        const rollsBank = this._charRolls.map((value, index) => ({
            index,
            displayIndex: index + 1,
            value: value || 0,
            isEmpty: !value || value === 0,
            isAssigned: Object.values(this._charAssignments).includes(index),
        }));

        const characteristics = CHARS.map((key) => {
            const charData = (this._actorSys().characteristics?.[key] ?? {}) as Partial<WH40KCharacteristic>;
            const assignedIndex = this._charAssignments[key] ?? null;
            const rollValue = assignedIndex !== null ? this._charRolls[assignedIndex] ?? null : null;
            // `||` (not `??`) so a stored custom base of 0 (legacy bad data,
            // see fix in input handler) falls back to DEFAULT_BASE rather
            // than zero-out the rendered preview.
            const base = this._charAdvancedMode ? this._charCustomBases[key] || DEFAULT_BASE : DEFAULT_BASE;
            const originBonus = originBonuses.totals[key] ?? 0;
            const total = rollValue !== null ? base + rollValue + originBonus : null;

            return {
                key,
                label: charData.label !== undefined && charData.label !== '' ? charData.label : key,
                short: charData.short !== undefined && charData.short !== '' ? charData.short : key.substring(0, 2).toUpperCase(),
                base,
                rollValue,
                originBonus,
                hasOriginBonus: originBonus !== 0,
                hasOriginBonusTooltip: (originBonuses.breakdowns[key] ?? []).length > 0,
                originBonusTooltip: this._formatOriginBonusTooltip(originBonuses.breakdowns[key] ?? []),
                originBonusTooltipData: this._formatOriginBonusTooltipData(originBonuses.breakdowns[key] ?? []),
                assignedIndex,
                total,
                hasRoll: rollValue !== null,
            };
        });

        const characteristicRows = [];
        for (let i = 0; i < characteristics.length; i += 3) {
            characteristicRows.push(characteristics.slice(i, i + 3));
        }

        const preview = characteristics.map((c) => ({
            short: c.short,
            total: c.total,
            hasValue: c.total !== null,
        }));

        const allAssigned = characteristics.every((c) => c.hasRoll);
        const anyRolls = this._charRolls.some((r) => r > 0);

        const isModeRollPoolHB = this._charGenMode === 'roll-pool-hb';
        const isModeRoll = this._charGenMode === 'roll';
        const isModePointBuy = this._charGenMode === 'point-buy';

        // Point-buy view: base (settings/race) + points spent + origin bonus.
        // Computed independently of the dice state above so switching modes
        // never bleeds rolled values into the point-buy totals.
        const pointBuyPool = WH40KSettings.getCharacteristicPointBuyPool();
        const pointsSpent = this._pointBuySpent();
        const pointBuyRemaining = pointBuyPool - pointsSpent;
        const pointBuyCharacteristics = CHARS.map((key) => {
            const charData = (this._actorSys().characteristics?.[key] ?? {}) as Partial<WH40KCharacteristic>;
            const base = this._pointBuyBaseFor(key);
            const originBonus = originBonuses.totals[key] ?? 0;
            const points = Math.max(0, this._charPointBuy[key] ?? 0);
            return {
                key,
                label: charData.label !== undefined && charData.label !== '' ? charData.label : key,
                short: charData.short !== undefined && charData.short !== '' ? charData.short : key.substring(0, 2).toUpperCase(),
                base,
                points,
                originBonus,
                hasOriginBonus: originBonus !== 0,
                hasOriginBonusTooltip: (originBonuses.breakdowns[key] ?? []).length > 0,
                originBonusTooltip: this._formatOriginBonusTooltip(originBonuses.breakdowns[key] ?? []),
                originBonusTooltipData: this._formatOriginBonusTooltipData(originBonuses.breakdowns[key] ?? []),
                total: base + points + originBonus,
                // A +1 can only be added while the pool has headroom AND base+points
                // is still under the generation cap (DH2e: 40).
                canIncrease: pointBuyRemaining > 0 && base + points < OriginPathBuilder.CHARACTERISTIC_GEN_MAX,
                canDecrease: points > 0,
            };
        });
        const pointBuyRows = [];
        for (let i = 0; i < pointBuyCharacteristics.length; i += 3) {
            pointBuyRows.push(pointBuyCharacteristics.slice(i, i + 3));
        }

        // Roll mode shares the dice-driven characteristics + preview but uses a
        // fixed in-order assignment (no draggable bank), so the bank chrome is
        // hidden and the per-slot roll value is read straight off _charRolls.
        const canApply = (isModeRollPoolHB && allAssigned && anyRolls) || (isModeRoll && allAssigned && anyRolls) || (isModePointBuy && pointBuyRemaining >= 0);

        return {
            rollsBank,
            characteristicRows,
            characteristics,
            preview,
            advancedMode: this._charAdvancedMode,
            allAssigned,
            anyRolls,
            canApply,
            divination: this._divination,
            mode: this._charGenMode,
            isModePointBuy,
            isModeRoll,
            isModeRollPoolHB,
            // Point-buy specifics
            pointBuyCharacteristics,
            pointBuyRows,
            pointBuyPool,
            pointBuySpent,
            pointBuyRemaining,
            pointBuyOverspent: pointBuyRemaining < 0,
        };
    }

    /**
     * Compute combined thrones formula from selected homeworld + background.
     * @private
     */
    _getThronesFormula(): string {
        const parts: string[] = [];
        for (const [, selection] of this.selections) {
            const formula = this._getSelectionThronesFormula(selection);
            if (formula) parts.push(formula);
        }
        return parts.join(' + ') || '';
    }

    /**
     * Get influence modifier from selected origins.
     * @private
     */
    _getInfluenceMod(): number {
        let mod = 0;
        for (const [, selection] of this.selections) {
            const sys = this._getSelectionSystem(selection);
            const others = (sys.modifiers?.other ?? []) as Array<{ name?: string; key?: string; value?: number }>;
            for (const m of others) {
                if (m.name === 'Influence') mod += m.value ?? 0;
            }
        }
        return mod;
    }

    /**
     * Get the breadcrumb index for a step key.
     * @private
     */
    _getNavigationIndex(stepKey: string): number {
        const coreIndex = this.orderedSteps.findIndex((step) => step.key === stepKey);
        if (coreIndex >= 0) return coreIndex;
        if (this.systemConfig.optionalStep?.key === stepKey) return this.orderedSteps.length;
        if (stepKey === 'characteristics') return this.orderedSteps.length + (this.systemConfig.optionalStep ? 1 : 0);
        return 0;
    }

    /**
     * Clear any unconfirmed preview when changing screens.
     * @private
     */
    _clearPreviewedOrigin(): void {
        this.previewedOrigin = null;
    }

    /**
     * Save current scroll position for restoration after re-render.
     * @private
     */
    _saveScrollPosition(): void {
        const scrollContainer = this.element.closest('.application')?.querySelector('.window-content') ?? this.element.closest('.window-content');
        this._savedScrollTop = scrollContainer?.scrollTop ?? 0;
    }

    /**
     * Restore the saved scroll position after re-render.
     * @private
     */
    _restoreScrollPosition(): void {
        if (this._savedScrollTop === 0) return;
        const scrollContainer = this.element.closest('.application')?.querySelector('.window-content') ?? this.element.closest('.window-content');
        if (scrollContainer) scrollContainer.scrollTop = this._savedScrollTop;
        this._savedScrollTop = 0;
    }

    /**
     * Get the current step selection or preview.
     * @private
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _getCurrentSelection returns selection which is typed as unknown by the Map
    _getCurrentSelection(): unknown {
        if (this.showLineage) {
            // eslint-disable-next-line no-restricted-syntax -- dialog state: previewedOrigin/lineageSelection are application state fields; ?? selects first non-null
            return this.previewedOrigin ?? this.lineageSelection;
        }

        if (this.showCharacteristics) {
            return null;
        }

        const currentStep = this.currentStep;
        // eslint-disable-next-line no-restricted-syntax -- dialog state: previewedOrigin is application state; ?? falls back to confirmed selection
        return this.previewedOrigin ?? this.selections.get(currentStep.step) ?? null;
    }

    /**
     * Collect selections that should contribute to derived preview math.
     * Includes the current preview when it would replace the active step.
     * @private
     */
    _getSelectionsForDerivedCalculations(): NormalizedOrigin[] {
        const entries: NormalizedOrigin[] = [];

        for (const step of this.orderedSteps) {
            const selection = this.selections.get(step.step);
            if (selection) entries.push(selection);
        }

        if (this.systemConfig.optionalStep && this.lineageSelection) {
            entries.push(this.lineageSelection);
        }

        if (!this.showCharacteristics && this.previewedOrigin) {
            const current = this.currentStep;
            const currentSelection = this.showLineage ? this.lineageSelection : this.selections.get(current.step);
            const previewId = this.previewedOrigin.id;
            const currentId = currentSelection?.id;

            if (previewId !== currentId) {
                if (this.showLineage) {
                    if (this.lineageSelection) entries.pop();
                    entries.push(this.previewedOrigin);
                } else {
                    const replaceIndex = entries.findIndex((entry) => entry.id === currentId);
                    if (replaceIndex >= 0) entries.splice(replaceIndex, 1, this.previewedOrigin);
                    else entries.push(this.previewedOrigin);
                }
            }
        }

        return entries;
    }

    /**
     * Get cumulative characteristic bonuses from the selected origin path.
     * @private
     */
    _getOriginCharacteristicBonuses(): { totals: Record<string, number>; breakdowns: Record<string, { source: string; value: number }[]> } {
        const totals: Record<string, number> = {};
        const breakdowns: Record<string, { source: string; value: number }[]> = {};

        const addBonus = (key: string, value: number, source: string): void => {
            if (value === 0) return;
            /* eslint-disable no-restricted-syntax -- dialog state: totals/breakdowns are local accumulator Records; ??= initializes entries lazily */
            totals[key] = (totals[key] ?? 0) + value;
            breakdowns[key] ??= [];
            /* eslint-enable no-restricted-syntax */
            breakdowns[key].push({ source, value });
        };

        const processSelection = (selection: NormalizedOrigin): void => {
            const system = this._getSelectionSystem(selection);
            const sys = system;
            const identifierStr = typeof sys.identifier === 'string' ? sys.identifier : '';
            const innerSys = sys['system'] as OriginPathSystemData | undefined;
            const innerStep = typeof innerSys?.step === 'string' ? innerSys.step : '';
            const sourceName = selection.name !== '' ? selection.name : identifierStr !== '' ? identifierStr : this._getLocalizedStepLabel(innerStep);
            const modifiers = sys.modifiers?.characteristics ?? {};

            for (const [key, value] of Object.entries(modifiers)) {
                addBonus(key, Number(value) || 0, sourceName);
            }

            const selectedChoices = sys.selectedChoices ?? {};
            const choices = selection.grants.choices as Array<NormalizedChoice & { name?: string }>;

            // Keying is shared (#305); the composite-spec prefix matcher + option.grants read stay local to this site.
            for (const { choice, choiceKey, selectedValues } of iterateResolvedChoices(choices, selectedChoices)) {
                for (const selectedValue of selectedValues) {
                    const option = choice.options.find((opt) => {
                        const optionValue = opt.value !== '' ? opt.value : (opt as NormalizedChoiceOption & { name?: string }).name;
                        return (
                            optionValue === selectedValue ||
                            (typeof selectedValue === 'string' && optionValue !== undefined && selectedValue.startsWith(`${optionValue} (`))
                        );
                    });
                    const choiceModifiers = (option?.grants as WH40KItemModifiers | undefined)?.characteristics ?? {};

                    for (const [key, value] of Object.entries(choiceModifiers)) {
                        addBonus(key, Number(value) || 0, `${sourceName}: ${choiceKey}`);
                    }
                }
            }
        };

        for (const selection of this._getSelectionsForDerivedCalculations()) {
            processSelection(selection);
        }

        return { totals, breakdowns };
    }

    /**
     * Build the tooltip text for an origin bonus breakdown.
     * @private
     */
    _formatOriginBonusTooltip(entries: { source: string; value: number }[]): string {
        if (!entries.length) return '';
        const lines = entries.map(({ source, value }) => `${source}: ${value > 0 ? '+' : ''}${value}`);
        return lines.join('\n');
    }

    /**
     * Build rich tooltip payload for origin characteristic bonuses.
     * @private
     */
    _formatOriginBonusTooltipData(entries: { source: string; value: number }[]): string {
        if (!entries.length) return '';
        const content = `<div class="wh40k-tooltip__breakdown">${entries
            .map(
                ({ source, value }) => `
                    <div class="wh40k-tooltip__line">
                        <span class="wh40k-tooltip__label">${source}</span>
                        <span class="wh40k-tooltip__value">${value > 0 ? '+' : ''}${value}</span>
                    </div>`,
            )
            .join('')}</div>`;
        return JSON.stringify({
            title: game.i18n.localize('WH40K.OriginPath.OriginBonus'),
            content,
        });
    }

    /**
     * Get the currently available throne gelt formula.
     * @private
     */
    _getContextualThronesFormula(): string {
        const parts: string[] = [];
        for (const selection of this._getSelectionsForDerivedCalculations()) {
            const formula = this._getSelectionThronesFormula(selection);
            if (formula) parts.push(formula);
        }
        return parts.join(' + ');
    }

    /**
     * Read any supported throne gelt formula field from a selection.
     * @private
     */
    _getSelectionThronesFormula(selection: NormalizedOrigin): string {
        const sys = this._getSelectionSystem(selection);
        const homebrew = sys.homebrew;
        return homebrew?.throneGelt ?? homebrew?.thrones ?? '';
    }

    /**
     * The throne gelt formula a selection rolls, or '' when it rolls none. Throne gelt is
     * homebrew-only and rolls once, on the Home World step (#204); a formula authored on
     * any other step stays narrative.
     */
    _thronesRollFormula(selection: NormalizedOrigin): string {
        const formula = this._getSelectionThronesFormula(selection);
        const { step } = this._getSelectionSystem(selection);
        return formula !== '' && step === 'homeWorld' && isHomebrewVariant(this.gameSystem) ? formula : '';
    }

    /** Whether the step `stepKey` rolls Influence: the Background step, except under DH2 homebrew (Influence is not rolled there). */
    _rollsInfluence(stepKey: string | undefined): boolean {
        return stepKey === 'background' && !isHomebrewVariant(this.gameSystem);
    }

    /**
     * The rolls a selection still needs before its step counts as done: wounds and fate
     * where it carries a formula, throne gelt where it rolls one, and Influence on the
     * step that rolls it. The roll panel offers exactly these (`_prepareSelectedOrigin`),
     * so the stepper, step access, auto-advance and commit all gate on the same list.
     */
    _pendingRolls(selection: NormalizedOrigin): string[] {
        const system = this._getSelectionSystem(selection);
        const grants: NonNullable<OriginPathSystemData['grants']> = system.grants ?? {};
        const rolled: Record<string, { rolled?: number } | undefined> = system.rollResults ?? {};
        const pending: string[] = [];
        if (grants.woundsFormula !== undefined && grants.woundsFormula !== '' && rolled['wounds']?.rolled === undefined) pending.push('wounds');
        if (grants.fateFormula !== undefined && grants.fateFormula !== '' && rolled['fate']?.rolled === undefined) pending.push('fate');
        if (this._thronesRollFormula(selection) !== '' && rolled['thrones']?.rolled === undefined) pending.push('thrones');
        if (this._rollsInfluence(system.step) && this._influenceRolled <= 0) pending.push('influence');
        return pending;
    }

    /** Whether the step `step` has a confirmed selection with every roll made. */
    _isStepDone(step: string): boolean {
        const selection = this.selections.get(step);
        return selection !== undefined && this._pendingRolls(selection).length === 0;
    }

    /** The localized names of pending rolls (`_pendingRolls`), joined for a notification. */
    _rollLabels(rolls: readonly string[]): string {
        const keys = new Map<string, I18nKey>([
            ['wounds', 'WH40K.OriginPath.RollName.wounds'],
            ['fate', 'WH40K.OriginPath.RollName.fate'],
            ['thrones', 'WH40K.OriginPath.RollName.thrones'],
            ['influence', 'WH40K.OriginPath.RollName.influence'],
        ]);
        return rolls
            .map((roll) => {
                const key = keys.get(roll);
                return key === undefined ? roll : game.i18n.localize(key);
            })
            .join(', ');
    }

    /** Whether every core step (Home World, Background, Role …) is picked and rolled. */
    _coreStepsDone(): boolean {
        return this.systemConfig.coreSteps.every((step) => this._isStepDone(step.step));
    }

    /**
     * Sum per-origin throne gelt rolls (homeworld + background, each with its own formula, results ADDED).
     * @private
     */
    _getTotalThronesRolled(): number {
        let total = 0;
        for (const [, selection] of this.selections) {
            const rolled = (selection.system as OriginPathSystemData).rollResults?.['thrones']?.rolled;
            if (typeof rolled === 'number') total += rolled;
        }
        return total;
    }

    /**
     * Get the currently available influence modifier.
     * @private
     */
    _getContextualInfluenceMod(): number {
        let mod = 0;
        for (const selection of this._getSelectionsForDerivedCalculations()) {
            const sys = this._getSelectionSystem(selection);
            const others = (sys.modifiers?.other ?? []) as Array<{ name?: string; key?: string; value?: number }>;
            for (const entry of others) {
                if (entry.name === 'Influence') mod += entry.value ?? 0;
            }
        }
        return mod;
    }

    /**
     * Whether the characteristic step is in a committable state. The criterion
     * is mode-specific:
     *  - `roll-pool-hb` and `roll` both back onto `_charRolls`/`_charAssignments`
     *    (the bank-and-assign UX shares state with the fixed in-order roll UX),
     *    so both require every characteristic to have a positive rolled value
     *    assigned to it.
     *  - `point-buy` is committable whenever the spend is valid (never over the
     *    pool); spending nothing is a legitimate "all at base" build, so the
     *    only gate is that the player has not over-allocated.
     * @private
     */
    _hasAssignedCharacteristics(): boolean {
        if (this._charGenMode === 'point-buy') {
            return this._pointBuyRemaining() >= 0;
        }
        return OriginPathBuilder.GENERATION_CHARACTERISTICS.every((key) => {
            const assignedIdx = this._charAssignments[key];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: _charAssignments values may be null (unassigned) or undefined (key absent)
            return assignedIdx !== null && assignedIdx !== undefined && (this._charRolls[assignedIdx] ?? 0) > 0;
        });
    }

    /* -------------------------------------------- */
    /*  Point-buy pure logic                        */
    /* -------------------------------------------- */

    /**
     * Total points currently spent across all characteristics in point-buy
     * mode. Cost is a flat 1 point per +1 above base (content-agnostic linear
     * primitive — no per-characteristic cost table). Negative stored spends
     * (impossible via the UI, but defensive against bad flag data) are clamped
     * to 0 so the total never under-counts.
     * @private
     */
    _pointBuySpent(): number {
        return pointBuySpent(this._charPointBuy, OriginPathBuilder.GENERATION_CHARACTERISTICS);
    }

    /**
     * Points still available to spend in point-buy mode: pool − spent. May be
     * read negative by callers only after a forced overspend; the spend handler
     * clamps so this never goes below 0 in normal flow.
     * @private
     */
    _pointBuyRemaining(): number {
        return WH40KSettings.getCharacteristicPointBuyPool() - this._pointBuySpent();
    }

    /**
     * Apply a delta to the points allocated to one characteristic, validating
     * against the pool. Returns the clamped value actually stored. A positive
     * delta is capped at whatever the remaining pool allows; the spend can
     * never push the total over the pool, and an individual allocation can
     * never go negative. Pure logic — the action handler is a thin wrapper.
     *
     * @param key - characteristic key (must be a generation characteristic)
     * @param delta - signed change in allocated points
     * @returns the new allocation stored for `key` (always ≥ 0)
     * @private
     */
    _adjustPointBuy(key: string, delta: number): number {
        this._charPointBuy[key] = adjustedAllocation(this._pointBuyRules(), this._charPointBuy, key, delta);
        return this._charPointBuy[key];
    }

    /**
     * Base value for a generation characteristic in the current mode: the custom
     * race baseline in advanced mode, otherwise the world's setting default.
     */
    _pointBuyBaseFor(key: string): number {
        const defaultBase = this._characteristicBase();
        return this._charAdvancedMode ? this._charCustomBases[key] || defaultBase : defaultBase;
    }

    /**
     * Set the points allocated to one characteristic to an absolute value,
     * validating against the pool AND the per-characteristic generation cap.
     * Used by the numeric input. The requested value is floored at 0 and then
     * capped so the running total never exceeds the pool (excess is dropped, not
     * borrowed from other characteristics) and base + points never exceeds
     * CHARACTERISTIC_GEN_MAX (DH2e: 40). Returns the clamped value stored.
     * @private
     */
    _setPointBuy(key: string, value: number): number {
        this._charPointBuy[key] = setAllocation(this._pointBuyRules(), this._charPointBuy, key, value);
        return this._charPointBuy[key];
    }

    /** The point-buy pool, cap and bases for the pure rules in `point-buy.ts` (#717). */
    _pointBuyRules(): PointBuyRules {
        return {
            characteristics: OriginPathBuilder.GENERATION_CHARACTERISTICS,
            pool: WH40KSettings.getCharacteristicPointBuyPool(),
            cap: OriginPathBuilder.CHARACTERISTIC_GEN_MAX,
            baseFor: (key) => this._pointBuyBaseFor(key),
        };
    }

    /* -------------------------------------------- */
    /*  Roll-mode pure logic                        */
    /* -------------------------------------------- */

    /**
     * Roll one bonus value per characteristic for `roll` mode using the shared
     * {@link CHARACTERISTIC_ROLL_FORMULA}, writing each result into `_charRolls`
     * at its in-order index and assigning that index to the matching
     * characteristic. Unlike `roll-pool-hb` (a free bank the player drags), the
     * `roll` mode locks each rolled value to its characteristic in order.
     *
     * Pure-ish: the dice come from an injected `rollValues` array when provided
     * (deterministic tests), otherwise from live `Roll` evaluation. Returns the
     * generated bonus values in characteristic order.
     * @private
     */
    async _generateRollModeValues(rollValues?: number[]): Promise<number[]> {
        const CHARS = OriginPathBuilder.GENERATION_CHARACTERISTICS;
        let values: number[];
        if (rollValues !== undefined) {
            values = CHARS.map((_key, i) => Math.max(0, Math.trunc(rollValues[i] ?? 0)));
        } else {
            const rollInstances = CHARS.map(() => new Roll(OriginPathBuilder.CHARACTERISTIC_ROLL_FORMULA));
            await Promise.all(rollInstances.map(async (roll) => roll.evaluate()));
            values = rollInstances.map((roll) => roll.total ?? 0);
        }
        this._charRolls = [...values];
        CHARS.forEach((key, i) => {
            this._charAssignments[key] = i;
        });
        return values;
    }

    /** An elite's structured prerequisites (`system.prerequisites`), the well-formed entries only. */
    static _elitePrerequisites(origin: NormalizedOrigin): Prerequisite[] {
        return elitePrerequisites(origin.system);
    }

    /** The Influence the character has in the builder: the rolled value, else the stored one. */
    _builderInfluence(): number {
        return this._influenceRolled > 0 ? this._influenceRolled : Number(this._actorSys().influence ?? 0);
    }

    /** The compendium document a selection came from ('' when unknown). */
    static _selectionSource(selection: NormalizedOrigin): string {
        return (selection as NormalizedOriginWithMeta)._sourceUuid ?? selection.uuid ?? '';
    }

    /**
     * What the character would hold if it took an elite now, as the prerequisite
     * validator reads it: the origins confirmed at the other steps (not the elite step,
     * whose pick this elite replaces), the actor's talents, and the builder's Influence.
     * Characteristics are left empty — they are set at a later step and checked at commit.
     */
    _eliteCandidateView(): {
        system: { characteristics: Record<string, { total: number }>; skills: object; influence: number };
        items: { some: (predicate: (item: PrereqItemView) => boolean) => boolean };
    } {
        const origins: PrereqItemView[] = [...this.selections.values()].map((selection) => ({
            type: 'originPath',
            name: selection.name,
            _stats: { compendiumSource: OriginPathBuilder._selectionSource(selection) },
        }));
        const talents: PrereqItemView[] = this.actor.items.filter((item) => item.type === 'talent').map((item) => ({ type: item.type, name: item.name }));
        const items = [...origins, ...talents];
        return {
            system: { characteristics: {}, skills: this._actorSys().skills ?? {}, influence: this._builderInfluence() },
            items: { some: (predicate) => items.some(predicate) },
        };
    }

    /**
     * Why the character cannot take `origin` at the Elite Advance step, or [] when it can:
     * its XP cost beyond the starting XP (no cost when another chosen origin grants it, as
     * the Mystic role grants the Psyker elite), and its Influence / origin / skill / talent
     * prerequisites. Characteristic prerequisites wait for the characteristics step and are
     * checked at commit (`_eliteCharacteristicShortfall`).
     */
    _eliteUnmet(origin: NormalizedOrigin): string[] {
        const reasons: string[] = [];
        const source = OriginPathBuilder._selectionSource(origin);
        const granted = grantedEliteSources(this.selections.values());
        // An elite another chosen origin grants is the character's outright: no cost, no gates.
        if (source !== '' && granted.has(source)) return reasons;
        const shortfall = xpShortfall(eliteCharge(origin.system, source, granted), this._startingXP());
        if (shortfall !== null) {
            reasons.push(game.i18n.format('WH40K.Advancement.Prereq.XpCost', { cost: String(shortfall.cost), available: String(shortfall.available) }));
        }
        const gates = offerGates(OriginPathBuilder._elitePrerequisites(origin));
        if (gates.length > 0) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: the candidate view's skills are the actor's raw skill map, which the validator reads as WH40KSkill records
            reasons.push(...checkPrerequisites(this._eliteCandidateView() as Parameters<typeof checkPrerequisites>[0], gates).unmet);
        }
        return reasons;
    }

    /**
     * The chosen elite's characteristic prerequisites the generated characteristics miss,
     * or [] — checked at commit, once the characteristics step has set them.
     */
    _eliteCharacteristicShortfall(): string[] {
        if (this.lineageSelection === null) return [];
        const source = OriginPathBuilder._selectionSource(this.lineageSelection);
        if (source !== '' && grantedEliteSources(this.selections.values()).has(source)) return [];
        const gates = characteristicGates(OriginPathBuilder._elitePrerequisites(this.lineageSelection));
        if (gates.length === 0) return [];
        const context = this._prepareCharGenContext();
        const rows = context['isModePointBuy'] === true ? context['pointBuyCharacteristics'] : context['characteristics'];
        const generated = Array.isArray(rows) ? rows.filter(isGeneratedCharacteristic) : [];
        const characteristics = Object.fromEntries(generated.map((row) => [row.key, { total: row.total ?? 0 }]));
        const view = { system: { characteristics, skills: {} }, items: { some: (): boolean => false } };
        return checkPrerequisites(view, gates).unmet;
    }

    /**
     * Prepare lineage origins (no position restrictions)
     * @returns {Array}
     * @private
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns normalized compendium payloads prepared for Handlebars rendering
    _prepareLineageOrigins(): Record<string, unknown>[] {
        const activeLineageIds = new Set(
            [
                this.previewedOrigin?.id,
                this.previewedOrigin?._id,
                this.previewedOrigin?.uuid,
                this.previewedOrigin?._sourceUuid,
                this.previewedOrigin?.system['identifier'],
                this.lineageSelection?.id,
                this.lineageSelection?._id,
                this.lineageSelection?.uuid,
                this.lineageSelection?._sourceUuid,
                this.lineageSelection?.system['identifier'],
            ].filter((v): v is string => typeof v === 'string' && v !== ''),
        );
        return this._applyProvenanceFilter(this._dedupeOriginsByIdentity(this.lineageOrigins)).map((origin) => {
            const unmet = this._eliteUnmet(origin);
            return {
                id: origin.id,
                uuid: origin.uuid,
                name: origin.name,
                img: origin.img,
                // A card the character cannot take says why on hover.
                shortDescription: unmet.length > 0 ? unmet.join(' · ') : origin.shortDescription,
                fullDescription: this._stripHtml(typeof origin.description === 'string' ? origin.description : ''),
                isSelected:
                    activeLineageIds.has(origin.id) ||
                    (origin.uuid !== null && activeLineageIds.has(origin.uuid)) ||
                    activeLineageIds.has(typeof origin.system['identifier'] === 'string' ? origin.system['identifier'] : ''),
                isDisabled: unmet.length > 0,
                isValidNext: true,
                hasChoices: origin.hasChoices,
                isAdvanced: origin.isAdvanced,
                xpCost: origin.xpCost,
                fromWorld: origin.fromWorld,
                ...originProvenanceFlags(origin, this.gameSystem),
                badges: true,
            };
        });
    }

    /**
     * Strip HTML tags from text
     * @param {string} html
     * @returns {string}
     * @private
     */
    _stripHtml(html: string): string {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    /**
     * Prepare step navigation data
     * @returns {Array}
     * @private
     */
    /** @override */
    override async _onRender(context: HandlebarsContext, options: ApplicationRenderOptions): Promise<void> {
        await super._onRender(context, options);
        this._restoreScrollPosition();

        if (this.showEquipment) {
            const equipRoot = this.element;
            const search = equipRoot.querySelector('[data-wh40k-hook="equip-search"]');
            if (search) {
                search.addEventListener('input', (e) => {
                    this._equipmentFilter.search = (e.currentTarget as HTMLInputElement).value;
                    this._saveScrollPosition();
                    void this.render();
                });
            }
            const typeSelect = equipRoot.querySelector('[data-wh40k-hook="equip-type-filter"]');
            if (typeSelect) {
                typeSelect.addEventListener('change', (e) => {
                    const v = (e.currentTarget as HTMLSelectElement).value;
                    this._equipmentFilter.type = v !== '' ? v : 'all';
                    this._saveScrollPosition();
                    void this.render();
                });
            }
            // Bind row and checkbox clicks directly. The data-action on the row already
            // triggers toggleEquipmentItem for clicks on row body, but clicks on the checkbox
            // input need to be intercepted before the browser's default toggle stomps our state.
            equipRoot.querySelectorAll('[data-wh40k-hook="equip-row"]').forEach((row) => {
                const rowEl = row as HTMLElement;
                const uuid = rowEl.dataset['uuid'];
                const checkbox = rowEl.querySelector('[data-wh40k-hook="equip-check"]');
                if (!checkbox || uuid === undefined || uuid === '') return;
                checkbox.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    RollActions.toggleEquipmentByUuid.call(this, uuid);
                });
            });
            return;
        }

        if (!this.showCharacteristics) return;

        const html = this.element;

        // Roll chip click-to-edit and drag
        html.querySelectorAll('[data-wh40k-hook="csd-roll-chip"]').forEach((chip) => {
            chip.addEventListener('click', this._onCharRollChipClick.bind(this));
            chip.addEventListener('dragstart', this._onCharDragStart.bind(this));
            chip.addEventListener('dragend', this._onCharDragEnd.bind(this));
        });

        // Characteristic slots as drop targets
        html.querySelectorAll('[data-wh40k-hook="csd-char-slot"]').forEach((slot) => {
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).classList.add('drop-valid', 'drop-hover');
            });
            slot.addEventListener('dragleave', (e) => {
                (e.currentTarget as HTMLElement).classList.remove('drop-hover');
            });
            slot.addEventListener('drop', this._onCharDrop.bind(this));
            const rollChip = slot.querySelector('[data-wh40k-hook="csd-assigned-roll"]');
            if (rollChip) {
                rollChip.addEventListener('dragstart', this._onCharDragStart.bind(this));
                rollChip.addEventListener('dragend', this._onCharDragEnd.bind(this));
            }
        });

        // Rolls bank as drop target
        const rollsBank = html.querySelector('[data-wh40k-hook="csd-rolls-bank"]');
        if (rollsBank) {
            rollsBank.addEventListener('dragover', (e) => {
                if (this._charDragData?.type !== 'assigned') return;
                e.preventDefault();
                (e.currentTarget as HTMLElement).classList.add('drop-valid', 'drop-hover');
            });
            rollsBank.addEventListener('dragleave', (e) => {
                (e.currentTarget as HTMLElement).classList.remove('drop-hover');
            });
            rollsBank.addEventListener('drop', this._onCharBankDrop.bind(this));
        }

        // Base value inputs (advanced mode)
        html.querySelectorAll('[data-wh40k-hook="csd-base-input"]').forEach((input) => {
            input.addEventListener('change', (e) => {
                const el = e.currentTarget as HTMLInputElement;
                const key = el.dataset['characteristic'];
                if (key === undefined || key === '') return;
                let value = parseInt(el.value, 10);
                // Empty / invalid / negative input → fall back to the setting
                // default base (20 + offset), NOT 0. A custom base of 0 is
                // never meaningful for character generation, and previously
                // got persisted into customBases and re-loaded as 0, which
                // made every committed characteristic equal just its rolled
                // value (8/13/15…) — the "stats all <20" regression.
                if (Number.isNaN(value) || value <= 0) value = this._characteristicBase();
                this._charCustomBases[key] = value;
                void this.render();
            });
        });

        // Point-buy numeric inputs: type an absolute allocation per
        // characteristic. Validation (floor 0, cap at the remaining pool) lives
        // in the pure `_setPointBuy`; we re-render so the clamp is reflected.
        html.querySelectorAll('[data-wh40k-hook="csd-pointbuy-input"]').forEach((input) => {
            input.addEventListener('change', (e) => {
                const el = e.currentTarget as HTMLInputElement;
                const key = el.dataset['characteristic'];
                if (key === undefined || key === '') return;
                this._setPointBuy(key, parseInt(el.value, 10));
                this._saveScrollPosition();
                void this.render();
            });
        });

        const divinationInput = html.querySelector('[data-wh40k-hook="csd-divination-input"]');
        if (divinationInput) {
            divinationInput.addEventListener('change', (e) => {
                this._divination = (e.currentTarget as HTMLInputElement).value;
            });
            divinationInput.addEventListener('input', (e) => {
                this._divination = (e.currentTarget as HTMLInputElement).value;
            });
        }
    }

    _onCharRollChipClick(event: Event): void {
        const chip = event.currentTarget as HTMLElement;
        const index = parseInt(chip.dataset['rollIndex'] ?? '', 10);
        if (Number.isNaN(index) || chip.querySelector('.csd-roll-input') !== null) return;

        const currentValue = this._charRolls[index] !== 0 ? this._charRolls[index] : '';
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'csd-roll-input';
        input.min = '2';
        input.max = '40';
        input.value = String(currentValue);
        input.placeholder = '2-40';
        input.dataset['rollIndex'] = String(index);

        input.addEventListener('blur', () => {
            let value = parseInt(input.value, 10);
            if (Number.isNaN(value) || value < 2) value = 0;
            if (value > 40) value = 40;
            this._charRolls[index] = value;
            void this.render();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                void this.render();
            }
        });

        const valueEl = chip.querySelector<HTMLElement>('[data-wh40k-hook="csd-roll-value"]');
        if (valueEl) valueEl.style.display = 'none';
        chip.appendChild(input);
        input.focus();
        input.select();
    }

    _onCharDragStart(event: Event): void {
        this._saveScrollPosition();
        const target = event.currentTarget as HTMLElement;
        const rollIndex = parseInt(target.dataset['rollIndex'] ?? '', 10);
        const fromCharRaw = target.dataset['characteristic'];
        const fromChar = fromCharRaw !== undefined && fromCharRaw !== '' ? fromCharRaw : null;
        if (Number.isNaN(rollIndex) || this._charRolls[rollIndex] === 0) {
            event.preventDefault();
            return;
        }
        this._charDragData = { type: fromChar !== null ? 'assigned' : 'bank', index: rollIndex, characteristic: fromChar };
        target.classList.add('dragging');
        const dt = (event as DragEvent).dataTransfer;
        if (dt) {
            dt.effectAllowed = 'move';
            dt.setData('text/plain', '');
        }
    }

    _onCharDragEnd(event: Event): void {
        (event.currentTarget as HTMLElement).classList.remove('dragging');
        for (const el of this.element.querySelectorAll('.drop-valid, .drop-hover')) {
            el.classList.remove('drop-valid', 'drop-hover');
        }
        this._charDragData = null;
    }

    _onCharDrop(event: Event): void {
        event.preventDefault();
        if (this._charDragData === null) return;
        this._saveScrollPosition();
        const slot = event.currentTarget as HTMLElement;
        const targetChar = slot.dataset['characteristic'];
        if (targetChar === undefined || targetChar === '') return;
        const draggedIndex = this._charDragData.index;
        const sourceChar = this._charDragData.characteristic;
        const currentTargetIndex = this._charAssignments[targetChar] ?? null;
        if (sourceChar !== null) {
            this._charAssignments[sourceChar] = currentTargetIndex;
        }
        this._charAssignments[targetChar] = draggedIndex;
        void this.render();
    }

    _onCharBankDrop(event: Event): void {
        event.preventDefault();
        if (this._charDragData?.characteristic === undefined || this._charDragData.characteristic === null) return;
        this._saveScrollPosition();
        this._charAssignments[this._charDragData.characteristic] = null;
        void this.render();
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: step navigation items are plain objects prepared for Handlebars rendering
    _prepareStepNavigation(): Record<string, unknown>[] {
        const orderedSteps = this.orderedSteps;
        const steps = orderedSteps.map((step, index) => {
            const hasSelection = this.selections.has(step.step);
            const isAccessible = this._isStepAccessible(index);
            const selection = hasSelection ? this.selections.get(step.step) : null;

            return {
                index: index,
                key: step.key,
                step: step.step,
                label: this._getLocalizedStepLabel(step.key),
                shortLabel: this._getShortLabel(step.key),
                icon: step.icon,
                isActive: !this.showLineage && index === this.currentStepIndex,
                // Picked AND rolled: an origin whose wounds / fate / Influence are unrolled is not done.
                isComplete: this._isStepDone(step.step),
                isDisabled: this.guidedMode && !isAccessible,
                selection: selection
                    ? {
                          name: selection.name,
                          img: selection.img,
                      }
                    : null,
            };
        });

        if (this.systemConfig.optionalStep) {
            steps.push({
                index: steps.length,
                key: this.systemConfig.optionalStep.key,
                step: this.systemConfig.optionalStep.step,
                label: this._getLocalizedStepLabel(this.systemConfig.optionalStep.key),
                shortLabel: this._getShortLabel(this.systemConfig.optionalStep.key),
                icon: this.systemConfig.optionalStep.icon,
                isActive: this.showLineage,
                isComplete: !!this.lineageSelection,
                isDisabled: this.guidedMode && !this._coreStepsDone(),
                selection: this.lineageSelection
                    ? {
                          name: this.lineageSelection.name,
                          img: this.lineageSelection.img,
                      }
                    : null,
            });
        }

        steps.push({
            index: steps.length,
            key: 'characteristics',
            step: 'characteristics',
            label: this._getLocalizedStepLabel('characteristics'),
            shortLabel: game.i18n.localize('WH40K.OriginPath.Characteristics'),
            icon: 'fa-dice-d20',
            isActive: this.showCharacteristics,
            isComplete: this._hasAssignedCharacteristics(),
            isDisabled: this.guidedMode && !this._coreStepsDone(),
            selection: null,
        });

        if (this.systemConfig.equipmentStep) {
            steps.push({
                index: steps.length,
                key: this.systemConfig.equipmentStep.key,
                step: this.systemConfig.equipmentStep.step,
                label: this._getLocalizedStepLabel(this.systemConfig.equipmentStep.key),
                shortLabel: this._getShortLabel(this.systemConfig.equipmentStep.key),
                icon: this.systemConfig.equipmentStep.icon,
                isActive: this.showEquipment,
                isComplete: this.equipmentSelections.size > 0,
                isDisabled: this.guidedMode && !this._hasAssignedCharacteristics(),
                selection: null,
            });
        }

        return steps;
    }

    /**
     * Influence bonus (tens digit of Influence) — used to cap starting equipment selections per the DH2 rules.
     * @private
     */
    _getInfluenceBonus(): number {
        // Homebrew grants 3 starting Armoury acquisitions regardless of Influence; RAW uses the DH2 rule (floor(Influence/10)).
        if (isHomebrewVariant(this.gameSystem)) return 3;
        const rolled = this._influenceRolled;
        const stored = Number(this._actorSys().influence ?? 0);
        const influence = rolled > 0 ? rolled : stored;
        return Math.floor(influence / 10);
    }

    /**
     * Load Armoury items for the Equip Acolyte step, filtering to Scarce or better.
     * @private
     */
    async _loadEquipmentItems(): Promise<void> {
        if (this._equipmentLoaded) return;

        const equipmentPacks = builderPacks(game.packs, this.gameSystem, 'startingEquipment');
        if (equipmentPacks.length === 0) {
            this._equipmentLoaded = true;
            return;
        }

        const configWh40k = (CONFIG as { wh40k?: { availabilities?: Record<string, AvailabilityConfig> } }).wh40k;
        // CONFIG.wh40k is the system config set at init; reading it here (not the
        // config module) keeps this builder out of the config.ts import cycle.
        const availabilityConfig = configWh40k?.availabilities ?? {};
        const scarceRank = AVAILABILITY_KEYS.indexOf('scarce');
        const packLoadResults = await Promise.all(
            equipmentPacks.map(async (pack): Promise<EquipmentEntry[]> => {
                const index = await pack.getIndex({
                    fields: [
                        'system.availability',
                        'system.identifier',
                        'system.clip.max',
                        'system.weaponTypes',
                        'system.cost.dh2.homebrew.requisition',
                        'system.cost.dh2.homebrew.throneGelt',
                        'system.standard',
                        'type',
                    ],
                });
                const fromPack: EquipmentEntry[] = [];
                for (const rawEntry of index) {
                    const entry = rawEntry as { _id: string; name?: string; uuid?: string; img?: string; type?: string; system?: OriginPathSystemData };
                    // Cybernetics enter play via grants, not equipment selection.
                    if (entry.type === 'cybernetic') continue;
                    const entrySys = entry.system;
                    const availability = entrySys?.availability;
                    if (availability === undefined || availability === '') continue;
                    const availabilityEntry = availabilityConfig[availability] as AvailabilityConfig | undefined;
                    if (availabilityEntry === undefined) continue;
                    // Ratings outside the ordered scale (`uncommon`) cannot be shown to meet the Scarce floor.
                    const rating = normaliseAvailability(availability);
                    if (rating === null || AVAILABILITY_KEYS.indexOf(rating) > scarceRank) continue;
                    // A weapon's standard ammunition loads by default; it is not equipment to pick (#699).
                    if (entrySys?.standard === true) continue;
                    const homebrewCost = entrySys?.cost?.dh2?.homebrew;
                    const equipEntry: EquipmentEntry = {
                        uuid: `Compendium.${pack.metadata.id}.${entry._id}`,
                        id: entry._id,
                        identifier: entrySys?.identifier ?? null,
                        clipMax: entrySys?.clip?.max ?? null,
                        weaponTypes: entrySys?.weaponTypes ?? [],
                        availability,
                        availabilityLabel: game.i18n.localize(availabilityEntry.label),
                        requisition: homebrewCost?.requisition ?? null,
                        throneGelt: homebrewCost?.throneGelt ?? null,
                    };
                    if (entry.name !== undefined) equipEntry.name = entry.name;
                    if (entry.img !== undefined) equipEntry.img = entry.img;
                    if (entry.type !== undefined) equipEntry.type = entry.type;
                    fromPack.push(equipEntry);
                }
                return fromPack;
            }),
        );
        const loaded: EquipmentEntry[] = packLoadResults.flat();

        loaded.sort((a, b) => {
            const typeCmp = String(a.type).localeCompare(String(b.type));
            if (typeCmp !== 0) return typeCmp;
            return String(a.name).localeCompare(String(b.name));
        });
        this.equipmentItems = loaded;
        this._equipmentLoaded = true;
    }

    /**
     * Enumerate all weapons the acolyte has or will have access to: those granted via the
     * chosen origin paths (resolved by name against the equipment catalog), plus any weapons
     * the user has already ticked in the Equip Acolyte table. Used to filter the ammunition
     * list so the player only sees ammo compatible with a weapon they actually own.
     * @private
     */
    _getAvailableWeaponsForAmmo(): Array<{ identifier: string; clipMax: number; name: string; source: 'granted' | 'selected' }> {
        const result: Array<{ identifier: string; clipMax: number; name: string; source: 'granted' | 'selected' }> = [];
        const weaponCatalog = this.equipmentItems.filter((item) => item.type === 'weapon');

        // Origin-granted weapons: resolve grants.equipment entries against the equipment catalog by name.
        const grantedNames = new Set<string>();
        for (const [, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            const grants = system.grants ?? {};
            for (const entry of grants.equipment ?? []) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: grant entry is a compendium payload; name field may be absent
                const name = (entry as { name?: unknown }).name;
                if (typeof name === 'string' && name !== '') grantedNames.add(name);
            }
        }
        for (const name of grantedNames) {
            const weapon = weaponCatalog.find((w) => typeof w.name === 'string' && w.name === name);
            // eslint-disable-next-line no-restricted-syntax -- boundary: weaponCatalog entry is a compendium payload; identifier field may be absent
            const weaponIdentifier = (weapon as { identifier?: unknown } | undefined)?.identifier;
            if (typeof weaponIdentifier !== 'string' || weaponIdentifier === '' || typeof weapon?.clipMax !== 'number') continue;
            result.push({
                identifier: weaponIdentifier,
                clipMax: weapon.clipMax,
                name: typeof weapon.name === 'string' ? weapon.name : '',
                source: 'granted',
            });
        }

        // User-selected weapons from the Equip Acolyte table.
        for (const entry of this.equipmentSelections.values()) {
            if (entry.type !== 'weapon') continue;
            const identifier = (entry as EquipmentItemEntry).identifier;
            const clipMax = (entry as EquipmentItemEntry).clipMax;
            if (identifier === null || identifier === '' || clipMax === null) continue;
            result.push({
                identifier: identifier,
                clipMax: clipMax,
                name: String(entry.name),
                source: 'selected',
            });
        }

        return result;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: equipment context is a plain object prepared for Handlebars rendering
    _prepareEquipmentContext(): Record<string, unknown> {
        const maxSelections = this._getInfluenceBonus();
        const filter = this._equipmentFilter;
        const search = filter.search.trim().toLowerCase();
        const typeFilter = filter.type;

        const availableWeapons = this._getAvailableWeaponsForAmmo();
        const availableWeaponIdentifiers = new Set(availableWeapons.map((w) => w.identifier));

        // Prune any selected ammo that no longer has a compatible weapon — otherwise the row
        // is hidden from the table but still counts against the 3-item cap.
        for (const [uuid, entry] of Array.from(this.equipmentSelections.entries())) {
            if (entry.type !== 'ammunition') continue;
            const types = Array.isArray((entry as EquipmentItemEntry).weaponTypes) ? (entry as EquipmentItemEntry).weaponTypes : [];
            if (!types.some((id) => availableWeaponIdentifiers.has(id))) {
                this.equipmentSelections.delete(uuid);
            }
        }

        const allTypes = new Set<string>();
        for (const item of this.equipmentItems) allTypes.add(String(item.type));

        const filtered = this.equipmentItems.filter((item) => {
            if (typeFilter !== 'all' && item.type !== typeFilter) return false;
            if (search !== '' && !String(item.name).toLowerCase().includes(search)) return false;
            // Hide ammunition rows unless at least one compatible weapon is granted or picked.
            if (item.type === 'ammunition') {
                const types = Array.isArray((item as EquipmentItemEntry).weaponTypes) ? (item as EquipmentItemEntry).weaponTypes : [];
                if (!types.some((id) => availableWeaponIdentifiers.has(id))) return false;
            }
            return true;
        });

        const selectedCount = this.equipmentSelections.size;
        const atLimit = maxSelections > 0 && selectedCount >= maxSelections;

        const items = filtered.map((item) => {
            const isSelected = this.equipmentSelections.has(String(item.uuid));
            return {
                ...item,
                isSelected,
                isDisabled: !isSelected && atLimit,
            };
        });

        const selectedItems = Array.from(this.equipmentSelections.values());

        const typeOptions: Array<{ value: string; label: string }> = [{ value: 'all', label: game.i18n.localize('WH40K.OriginPath.EquipmentTypeAll') }];
        for (const type of Array.from(allTypes).sort()) {
            typeOptions.push({ value: type, label: type });
        }

        return {
            maxSelections,
            selectedCount,
            remaining: Math.max(0, maxSelections - selectedCount),
            atLimit,
            hasInfluence: maxSelections > 0,
            search: filter.search,
            typeFilter,
            typeOptions,
            items,
            selectedItems,
            totalAvailable: this.equipmentItems.length,
            isHomebrew: isHomebrewVariant(this.gameSystem),
        };
    }

    /**
     * Check if a step is accessible in guided mode
     * @param {number} stepIndex
     * @returns {boolean}
     * @private
     */
    _isStepAccessible(stepIndex: number): boolean {
        if (!this.guidedMode) return true;
        if (stepIndex === 0) return true;

        const orderedSteps = this.orderedSteps;
        const prevStep = orderedSteps[stepIndex - 1];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: orderedSteps is an array; index may be out of bounds
        if (prevStep === undefined) return false;
        // The previous step must be picked AND rolled before the next opens.
        return this._isStepDone(prevStep.step);
    }

    /**
     * Get short label for step
     * @param {string} key
     * @returns {string}
     * @private
     */
    _getShortLabel(key: string): string {
        const labels = this.registryConfig.getStepShortLabels();
        return labels[key] ?? key;
    }

    /**
     * Prepare origins for current step
     * @param {object} stepLayout - Layout data from OriginChartLayout
     * @returns {Array}
     * @private
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns normalized compendium payloads prepared for Handlebars rendering
    _prepareOriginsForStep(stepLayout: StepLayout | undefined): Record<string, unknown>[] {
        if (!stepLayout?.cards) return [];

        return this._dedupeOriginsByIdentity(stepLayout.cards.map((card) => card.origin))
            .map((origin) => {
                const card = stepLayout.cards.find((entry) => {
                    const candidate = entry.origin;
                    return candidate.id === origin.id || candidate.uuid === origin.uuid || candidate.system['identifier'] === origin.system['identifier'];
                });
                if (!card) return null;

                return {
                    id: origin.id,
                    uuid: origin.uuid,
                    name: origin.name,
                    img: origin.img,
                    shortDescription: origin.shortDescription,
                    fullDescription: this._stripHtml(origin.description),
                    isSelected: card.isSelected,
                    isDisabled: card.isDisabled,
                    isValidNext: card.isValidNext && !card.isSelected,
                    hasChoices: origin.hasChoices || card.hasChoices,
                    isAdvanced: card.isAdvanced,
                    xpCost: card.xpCost,
                    fromWorld: origin.fromWorld,
                    ...originProvenanceFlags(origin, this.gameSystem),
                    badges: card.hasChoices || origin.hasChoices || card.isAdvanced || card.xpCost > 0,
                };
            })
            .filter((v) => v !== null);
    }

    _dedupeOriginsByIdentity<T extends NormalizedOrigin>(origins: T[]): T[] {
        const seen = new Set<string>();
        return origins.filter((origin) => {
            const meta = origin as NormalizedOriginWithMeta;
            const sysStep = origin.system['step'];
            const sysIdent = origin.system['identifier'];
            const compound = typeof sysStep === 'string' && typeof sysIdent === 'string' ? `${sysStep}:${sysIdent}` : null;
            const candidates: Array<string | null> = [origin.uuid, meta._sourceUuid ?? null, origin.id, compound];
            const key = candidates.find((v): v is string => typeof v === 'string' && v !== '');
            if (key === undefined) return true;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Prepare selected origin for detail panel
     * @param {Item|object} item - Item instance or plain data object
     * @returns {Promise<object>}
     * @private
     */
    /* eslint-disable complexity -- origin detail panel has many grant types; extracting sub-methods would scatter the grant-rendering logic */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns compendium payload data prepared for Handlebars rendering
    async _prepareSelectedOrigin(item: NormalizedOrigin): Promise<Record<string, unknown>> {
        const system = this._getSelectionSystem(item);
        const grants = system.grants ?? {};
        const modifiers = system.modifiers?.characteristics ?? {};

        const characteristics = [];
        for (const [key, value] of Object.entries(modifiers)) {
            const numericValue = Number(value) || 0;
            if (numericValue !== 0) {
                const info = getCharacteristicDisplayInfo(key);
                characteristics.push({
                    key: key,
                    label: info.label,
                    short: info.short,
                    value: numericValue,
                    positive: numericValue > 0,
                });
            }
        }

        const choices = [];
        const selectedChoices = system.selectedChoices ?? {};
        const choiceLabelCounts: Record<string, number> = {};
        const grantChoices = grants.choices ?? [];

        for (const choice of grantChoices) {
            const baseLabel = choice.label ?? choice.name ?? '';
            choiceLabelCounts[baseLabel] = (choiceLabelCounts[baseLabel] ?? 0) + 1;
            const suffix = choiceLabelCounts[baseLabel] > 1 ? ` (${choiceLabelCounts[baseLabel]})` : '';
            const choiceKey = `${baseLabel}${suffix}`;
            const selection = selectedChoices[choiceKey];
            const selectedLabels: string[] = [];
            if (Array.isArray(selection)) {
                for (const sel of selection) {
                    const option = choice.options?.find((o) => o.value === sel || o.name === sel);
                    selectedLabels.push(option?.label ?? option?.name ?? sel);
                }
            }
            choices.push({
                type: choice.type,
                typeLabel: this._getChoiceTypeLabel(choice.type ?? ''),
                label: choiceKey,
                count: choice.count ?? 1,
                options: choice.options ?? [],
                isComplete: Array.isArray(selection) && selection.length >= (choice.count ?? 1),
                selection: selectedLabels.length > 0 ? selectedLabels.join(', ') : null,
            });
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: rolls collects compendium roll result data for Handlebars rendering
        const rolls: Record<string, unknown> = {};
        const rollResults = system.rollResults ?? {};

        if (grants.woundsFormula !== undefined && grants.woundsFormula !== '') {
            const woundsResult = rollResults['wounds'];
            const hasRolled = woundsResult?.rolled !== undefined;
            rolls['wounds'] = {
                formula: grants.woundsFormula,
                hasValue: hasRolled,
                value: woundsResult?.rolled,
                breakdown: woundsResult?.breakdown ?? '',
            };
        }

        if (grants.fateFormula !== undefined && grants.fateFormula !== '') {
            const fateResult = rollResults['fate'];
            const hasRolled = fateResult?.rolled !== undefined;
            rolls['fate'] = {
                formula: grants.fateFormula,
                hasValue: hasRolled,
                value: fateResult?.rolled,
                breakdown: fateResult?.breakdown ?? '',
            };
        }

        // Per-origin throne gelt roll. Throne Gelt is NOT a strict DH2 RAW rule;
        // it ships only on the homebrew track (`WH40KSettings.dh2Ruleset === 'homebrew'`)
        // and traditionally rolls exactly ONCE at character creation, against the
        // home world's formula. Issue #204: the previous implementation also exposed
        // a separate roll button on the Background step, doubling the player's starting
        // throne gelt. Restrict the rollable widget to the Home World step only; any
        // formula authored on a Background entry is ignored at the UI layer (its data
        // remains in the compendium for narrative reference but no separate roll fires).
        const thronesFormulaForItem = this._thronesRollFormula(item);
        if (thronesFormulaForItem !== '') {
            const thronesResult = rollResults['thrones'];
            const hasRolled = thronesResult?.rolled !== undefined;
            rolls['thrones'] = {
                formula: thronesFormulaForItem,
                hasValue: hasRolled,
                value: thronesResult?.rolled,
                breakdown: thronesResult?.breakdown ?? '',
            };
        }

        const skills = await Promise.all(
            (grants.skills ?? []).map(async (skill) => {
                const skillName = skill.name ?? '';
                const displayName = skill.specialization !== undefined && skill.specialization !== '' ? `${skillName} (${skill.specialization})` : skillName;
                const uuid = this._findSkillUuid(skill.name, skill.specialization);
                return {
                    name: skill.name,
                    specialization: skill.specialization ?? null,
                    displayName: displayName,
                    level: skill.level ?? 'trained',
                    levelLabel: this._getTrainingLabel(skill.level ?? ''),
                    uuid,
                    tooltipData: await this._prepareGrantTooltipData(
                        displayName,
                        uuid,
                        skill.level !== undefined && skill.level !== '' ? `Level: ${this._getTrainingLabel(skill.level)}` : '',
                    ),
                };
            }),
        );

        const talents = await this._prepareTalentsWithTooltips(grants.talents ?? []);
        const traits = await this._prepareTraitsWithTooltips(grants.traits ?? []);

        const currentStep = this.currentStep;
        const itemId = item.id;
        let isConfirmed = false;
        if (this.showLineage) {
            isConfirmed = this.lineageSelection?.id === itemId;
        } else {
            const selection = this.selections.get(currentStep.step);
            isConfirmed = selection?.id === itemId;
        }

        // Influence is RAW-only: in homebrew it's not rolled at creation, so hide the block entirely.
        const showInfluence = this._rollsInfluence(currentStep.key);
        const influenceMod = this._getContextualInfluenceMod();

        return {
            id: itemId,
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            description: system.description?.value ?? '',
            requirementsText: system.requirements?.text ?? '',
            isConfirmed: isConfirmed,
            hasChoices: choices.length > 0,
            choices: choices,
            hasRolls: Object.keys(rolls).length > 0,
            rolls: rolls,
            grants: {
                characteristics: characteristics,
                hasCharacteristics: characteristics.length > 0,
                skills: skills,
                hasSkills: skills.length > 0,
                talents: talents,
                hasTalents: talents.length > 0,
                traits: traits,
                hasTraits: traits.length > 0,
                equipment: grants.equipment ?? [],
                hasEquipment: (grants.equipment ?? []).length > 0,
            },
            resources: {
                showInfluence,
                influenceMod,
                influenceRolled: this._influenceRolled,
            },
        };
    }

    /**
     * Prepare talents with tooltip information
     * @param {Array} talents
     * @returns {Promise<Array>}
     * @private
     */
    async _prepareTalentsWithTooltips(talents: GrantItemRaw[]): Promise<PreparedTalent[]> {
        return Promise.all(
            talents.map(async (talent) => {
                const { hasItem, tooltipText } = await this._resolveGrantTooltip(talent.name, talent.uuid);

                const preparedTalent: PreparedTalent = {
                    specialization: talent.specialization ?? null,
                    uuid: talent.uuid ?? null,
                    tooltipData: await this._prepareGrantTooltipData(talent.name ?? null, talent.uuid ?? null, tooltipText === talent.name ? '' : tooltipText),
                    hasItem: hasItem,
                };
                if (talent.name !== undefined) preparedTalent.name = talent.name;
                if (tooltipText !== undefined) preparedTalent.tooltip = tooltipText;
                return preparedTalent;
            }),
        );
    }

    /**
     * Prepare traits with tooltip information
     * @param {Array} traits
     * @returns {Promise<Array>}
     * @private
     */
    async _prepareTraitsWithTooltips(traits: GrantItemRaw[]): Promise<PreparedTrait[]> {
        return Promise.all(
            traits.map(async (trait) => {
                const { hasItem, tooltipText } = await this._resolveGrantTooltip(trait.name, trait.uuid);

                const preparedTrait: PreparedTrait = {
                    level: trait.level ?? null,
                    uuid: trait.uuid ?? null,
                    tooltipData: await this._prepareGrantTooltipData(
                        trait.level !== undefined && trait.level !== '' ? `${trait.name ?? ''} (${trait.level})` : trait.name ?? null,
                        trait.uuid ?? null,
                        tooltipText === trait.name ? '' : tooltipText,
                    ),
                    hasItem: hasItem,
                };
                if (trait.name !== undefined) preparedTrait.name = trait.name;
                if (tooltipText !== undefined) preparedTrait.tooltip = tooltipText;
                return preparedTrait;
            }),
        );
    }

    /**
     * Resolve a grant's compendium UUID to a stripped 200-char tooltip preview.
     * Shared by talent and trait tooltip preparation; returns the entry name
     * when the item can't be resolved or carries no description.
     */
    async _resolveGrantTooltip(name: string | undefined, uuid: string | undefined): Promise<{ hasItem: boolean; tooltipText: string | undefined }> {
        let tooltipText = name;
        let hasItem = false;
        if (uuid !== undefined && uuid !== '') {
            try {
                const item = (await fromUuid(uuid)) as ResolvedDocument | null;
                if (item) {
                    hasItem = true;
                    const desc = item.system?.description?.value;
                    if (desc !== undefined && desc !== '') {
                        tooltipText = this._stripHtml(desc).substring(0, 200);
                        if (tooltipText.length >= 200) tooltipText += '...';
                    }
                }
            } catch {
                // Item not found, use name
            }
        }
        return { hasItem, tooltipText };
    }

    async _prepareGrantTooltipData(title: string | null, uuid: string | null, fallbackDescription = ''): Promise<string> {
        let description = fallbackDescription;

        if (uuid !== null && uuid !== '') {
            try {
                const item = (await fromUuid(uuid)) as ResolvedDocument | null;
                const itemDescription = item?.system?.description?.value;
                if (itemDescription !== undefined && itemDescription !== '') description = itemDescription;
            } catch {
                // Fall back to provided text.
            }
        }

        return JSON.stringify({
            title: title ?? '',
            content: description !== '' ? `<div class="wh40k-tooltip__description">${description}</div>` : '',
        });
    }

    /**
     * Get training level label
     * @param {string} level
     * @returns {string}
     * @private
     */
    _getTrainingLabel(level: string): string {
        return getTrainingLabel(level, this.registryConfig);
    }

    /**
     * Get choice type label
     * @param {string} type
     * @returns {string}
     * @private
     */
    _getChoiceTypeLabel(type: string): string {
        return getChoiceTypeLabel(type);
    }
    /* eslint-enable complexity */

    /**
     * Calculate total preview of all selections
     * @returns {object}
     * @private
     */
    // eslint-disable-next-line complexity -- preview calculation processes many grant types; extracting sub-methods would increase call overhead
    async _calculatePreview(): Promise<PreviewSummary> {
        const preview: PreviewSummary = {
            characteristics: [],
            skills: [],
            talents: [],
            traits: [],
            aptitudes: [],
            equipment: [],
            wounds: null,
            fate: null,
            aptitudeCollisions: [],
            hasUnresolvedAptitudeCollision: false,
            unresolvedAptitudeCollisions: [],
            resolvedAptitudeCollisions: [],
        };

        const charTotals: Record<string, number> = {};
        const skillMap = new Map<string, PreviewGrantEntry>(); // name -> {name, uuid}
        const talentMap = new Map<string, PreviewGrantEntry>(); // name -> {name, uuid}
        const traitMap = new Map<string, PreviewGrantEntry>(); // name -> {name, uuid}
        const aptitudeSet = new Set<string>();
        const equipmentList: string[] = [];

        for (const [, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            const grants: NonNullable<OriginPathSystemData['grants']> = system.grants ?? {};
            const modifiers: Record<string, number> = system.modifiers?.characteristics ?? {};
            const selectedChoices: Record<string, string[]> = system.selectedChoices ?? {};

            // Accumulate base characteristics from modifiers
            for (const [key, value] of Object.entries(modifiers)) {
                if (value !== 0) {
                    charTotals[key] = (charTotals[key] ?? 0) + Number(value);
                }
            }

            // Collect base skills with UUIDs
            if (grants.skills) {
                for (const skill of grants.skills) {
                    const skillName =
                        skill.specialization !== undefined && skill.specialization !== '' ? `${skill.name ?? ''} (${skill.specialization})` : skill.name ?? '';
                    if (!skillMap.has(skillName)) {
                        skillMap.set(skillName, {
                            name: skillName,
                            uuid: this._findSkillUuid(skill.name, skill.specialization),
                        });
                    }
                }
            }

            // Collect base talents with UUIDs
            if (grants.talents) {
                const talentUuidsToResolve: string[] = [];
                for (const talent of grants.talents) {
                    const baseName = talent.name ?? '';
                    const talentName =
                        talent.specialization !== undefined && talent.specialization !== '' ? `${baseName} (${talent.specialization})` : baseName;
                    if (!talentMap.has(talentName)) {
                        talentMap.set(talentName, {
                            name: talentName,
                            uuid: talent.uuid ?? null,
                        });
                    }
                    if (talent.uuid !== undefined && talent.uuid !== '') talentUuidsToResolve.push(talent.uuid);
                }
                // eslint-disable-next-line no-await-in-loop -- sequential: each selection's talent uuids resolve before the next selection accumulates onto the same maps
                await Promise.all(talentUuidsToResolve.map(async (uuid) => this._addTalentModifiers(uuid, charTotals, skillMap)));
            }

            // Collect base traits with UUIDs
            if (grants.traits) {
                for (const trait of grants.traits) {
                    const traitName = trait.name ?? '';
                    if (!traitMap.has(traitName)) {
                        traitMap.set(traitName, {
                            name: traitName,
                            uuid: trait.uuid ?? null,
                        });
                    }
                }
            }

            // Collect base equipment
            if (grants.equipment) {
                for (const item of grants.equipment) {
                    equipmentList.push(item.name ?? '');
                }
            }

            // Collect fixed aptitudes
            if (Array.isArray((grants as NonNullable<OriginPathSystemData['grants']> & { aptitudes?: string[] }).aptitudes)) {
                for (const apt of (grants as NonNullable<OriginPathSystemData['grants']> & { aptitudes?: string[] }).aptitudes ?? []) {
                    if (apt !== '') aptitudeSet.add(apt);
                }
            }

            // Process choice grants (deduplicate labels to match dialog keys)
            const previewLabelCounts: Record<string, number> = {};
            if (grants.choices && grants.choices.length > 0) {
                for (const choice of grants.choices) {
                    const base = choice.label ?? choice.name ?? '';
                    previewLabelCounts[base] = (previewLabelCounts[base] ?? 0) + 1;
                    const suffix = previewLabelCounts[base] > 1 ? ` (${previewLabelCounts[base]})` : '';
                    const choiceKey = `${base}${suffix}`;
                    const selectedValues = selectedChoices[choiceKey] ?? [];
                    for (const selectedValue of selectedValues) {
                        const option = choice.options?.find((o) => o.value === selectedValue);
                        if (!option?.grants) continue;
                        // eslint-disable-next-line no-await-in-loop -- sequential: each option may add talent UUIDs whose modifiers feed the next iteration's charTotals
                        await this._applyChoiceGrantsToPreview(option.grants, { charTotals, skillMap, talentMap, traitMap, equipmentList });
                    }

                    // Aptitude-typed choices: selected values ARE the aptitude names
                    if (choice.type === 'aptitude') this._collectAptitudeChoices(choice, selectedValues, aptitudeSet);
                }
            }

            // Get wounds/fate from roll results
            const rollResults: Record<string, { rolled?: number; breakdown?: string } | undefined> = system.rollResults ?? {};
            const woundsResult = rollResults['wounds'];
            if (woundsResult?.rolled !== undefined) {
                preview.wounds = (preview.wounds ?? 0) + woundsResult.rolled;
            }
            const fateResult = rollResults['fate'];
            if (fateResult?.rolled !== undefined) {
                preview.fate = (preview.fate ?? 0) + fateResult.rolled;
            }
        }

        // Convert char totals to array
        for (const [key, value] of Object.entries(charTotals)) {
            const info = getCharacteristicDisplayInfo(key);
            preview.characteristics.push({
                key: key,
                short: info.short,
                value: value,
            });
        }

        // Convert maps to arrays (preserving UUIDs)
        preview.skills = await Promise.all(
            Array.from(skillMap.values()).map(async (skill) => ({
                ...skill,
                tooltipData: await this._prepareGrantTooltipData(skill.name as string | null, (skill.uuid as string | null) ?? null),
            })),
        );
        preview.talents = await Promise.all(
            Array.from(talentMap.values()).map(async (talent) => ({
                ...talent,
                tooltipData: await this._prepareGrantTooltipData(talent.name as string | null, (talent.uuid as string | null) ?? null),
            })),
        );
        preview.traits = Array.from(traitMap.values());
        preview.equipment = equipmentList.map((name) => ({ name }));

        // (#205) Apply duplicate-aptitude overrides: for each collision the
        // player resolved via the chooser dialog, add the replacement aptitude
        // to the displayed set. The original aptitude name stays in the set
        // because the character still gets it once (from either an existing
        // grant or the first new-origin grant); the doubled instance is what
        // gets swapped. Unresolved collisions are surfaced via
        // `preview.aptitudeCollisions` so the template renders a warning.
        const collisions = this._getAptitudeCollisions();
        for (const { replacement } of collisions) {
            if (replacement !== null && replacement !== '') {
                aptitudeSet.add(replacement);
            }
        }
        preview.aptitudes = Array.from(aptitudeSet).sort((a, b) => a.localeCompare(b));
        preview.aptitudeCollisions = collisions;
        // (#216) Split the collision list into "still needs action" (drives the
        // warning banner) and "applied swap" (drives a neutral Change affordance
        // sub-section). Before this split the template rendered every entry in
        // `aptitudeCollisions` under the warning banner unconditionally, so a
        // collision the player had already resolved kept appearing as an
        // outstanding requirement until the builder closed.
        preview.unresolvedAptitudeCollisions = collisions.filter((c) => c.replacement === null || c.replacement === '');
        preview.resolvedAptitudeCollisions = collisions.filter(
            (c): c is { original: string; replacement: string } => typeof c.replacement === 'string' && c.replacement !== '',
        );
        preview.hasUnresolvedAptitudeCollision = preview.unresolvedAptitudeCollisions.length > 0;

        return preview;
    }

    /**
     * Find skill UUID by looking up in compendium
     * @param {string} skillName
     * @param {string} specialization
     * @returns {Promise<string|null>}
     * @private
     */
    _findSkillUuid(skillName: string | null | undefined, specialization: string | null | undefined = null): string | null {
        try {
            const skillPack = lineCategoryPack(game.packs, 'dh2', 'skills');
            if (!skillPack) return null;

            const index = skillPack.index;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: specialization typed string|null|undefined; TS may narrow null away but runtime callers may pass null
            const hasSpec = specialization !== null && specialization !== undefined && specialization !== '';
            const searchName = hasSpec ? `${skillName ?? ''} (${specialization})` : skillName ?? '';

            // Try exact match first
            for (const [id, entry] of index.entries()) {
                if (entry.name === searchName || entry.name === skillName) {
                    return `Compendium.${skillPack.metadata.id}.${id}`;
                }
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Canonical identity for an aptitude name. Aptitude grants are authored
     * across many independent compendium origin-path documents, so the same
     * aptitude can appear with incidental case / whitespace differences
     * ("Willpower", "willpower", " Willpower "). Duplicate detection compares
     * identity, not the literal display string: without canonicalisation two
     * grants of the same aptitude that differ only by case/spacing slip past
     * the doubling guard with no warning (#205). The display string is
     * preserved separately for the banner; only membership/equality uses this.
     * @private
     */
    static _normalizeAptitudeIdentity(name: string): string {
        return normalizeAptitudeIdentity(name);
    }

    /**
     * Set-membership / equality wrapper over {@link _normalizeAptitudeIdentity}
     * so call sites read intent rather than the regex. Instance-side for ergonomic
     * `this._aptitudeKey(...)` use; delegates to the static canonicaliser.
     * @private
     */
    _aptitudeKey(name: string): string {
        return OriginPathBuilder._normalizeAptitudeIdentity(name);
    }

    /**
     * Add aptitude names from a resolved aptitude-typed choice into the running
     * aptitude set. Extracted from _calculatePreview to flatten its loop depth.
     * @private
     */
    _collectAptitudeChoices(choice: GrantChoiceRaw, selectedValues: string[], aptitudeSet: Set<string>): void {
        collectAptitudeChoices(choice, selectedValues, aptitudeSet);
    }

    /**
     * Count how many selected origins grant each aptitude (deduplicated
     * within a single origin). An aptitude granted by more than one origin
     * is "doubled" — under DH2 the second instance is wasted unless swapped
     * for a characteristic aptitude, so the builder surfaces a soft warning
     * at commit time rather than silently discarding it. (#205)
     * @private
     */
    /**
     * The set of aptitude names a single selection would grant, deduplicated
     * within that origin (fixed `grants.aptitudes` + resolved aptitude-typed
     * choices). Extracted so the count aggregator and the self-source detector
     * in {@link _collectExistingAptitudes} share one definition of "what does
     * this selection grant". Returns literal names; canonicalisation is the
     * caller's job.
     * @private
     */
    _selectionGrantedAptitudes(selection: NormalizedOrigin): Set<string> {
        return grantedAptitudes(this._getSelectionSystem(selection));
    }

    _collectAptitudeGrantCounts(): Map<string, number> {
        return aptitudeGrantCounts([...this.selections.values()].map((selection) => this._selectionGrantedAptitudes(selection)));
    }

    /**
     * Read the aptitudes already on the actor that are *genuinely* pre-existing
     * relative to this builder's pending selections.
     *
     * The DH2e/BC/OW character DataModel derives `actor.system.aptitudes`
     * entirely from the actor's owned origin-path items. The builder seeds its
     * selections from those same committed origin items in
     * `_initializeFromActor()`, and on commit it deletes *every* origin-path
     * item and re-creates them from its selections. So an aptitude that appears
     * on `actor.system.aptitudes` *and* is granted by the builder's own loaded
     * selections is not a real collision — it is the same single grant seen
     * from two angles. Treating it as "existing" produced a phantom
     * "duplicate aptitude detected" the moment the builder opened on any
     * character that already had committed origin steps, with no way to clear
     * it but Reset All (#215).
     *
     * The true pre-existing set is therefore the actor's aptitudes minus every
     * aptitude the builder's current selections would themselves grant
     * (compared by canonical identity, not literal string, so case/whitespace
     * variants do not leak a phantom collision back in). What remains is only
     * aptitudes with no backing origin selection (e.g. GM-added directly on the
     * actor) — those are real collisions when a step would re-grant them.
     *
     * This set still drives the genuine doubling guard (#205): an aptitude a
     * step grants that is in this trimmed set, or one granted by two distinct
     * selections, is a real duplicate and warns.
     * @private
     */
    _collectExistingAptitudes(): Set<string> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system shape varies per system DataModel; aptitudes lives on dh2/bc/ow character DataModels
        const apts = (this.actor.system as unknown as { aptitudes?: unknown }).aptitudes;
        if (!Array.isArray(apts)) return new Set<string>();

        // Aptitudes attributable to origin items the builder LOADED FROM THE
        // ACTOR (selections carrying `_actorItemId`, set by
        // `_itemToSelectionData` for items already committed on the actor).
        // `actor.system.aptitudes` is derived from those same committed items,
        // so subtracting them removes the phantom self-collision (#215) — but
        // ONLY for already-committed steps. A freshly-picked step (no
        // `_actorItemId`) is NOT subtracted, so if it re-grants an aptitude the
        // actor genuinely already has (from a different committed step or a GM
        // hand-add) it still trips the real doubling guard (#205).
        const selfGranted = new Set<string>();
        for (const [, selection] of this.selections) {
            const actorItemId = (selection as NormalizedOriginWithMeta)._actorItemId;
            if (actorItemId === undefined || actorItemId === null || actorItemId === '') continue;
            for (const apt of this._selectionGrantedAptitudes(selection)) {
                selfGranted.add(this._aptitudeKey(apt));
            }
        }

        const out = new Set<string>();
        for (const apt of apts) {
            if (typeof apt !== 'string' || apt === '') continue;
            if (selfGranted.has(this._aptitudeKey(apt))) continue;
            out.add(apt);
        }
        return out;
    }

    /**
     * Build the candidate pool of replacement aptitudes for the duplicate-
     * resolution dialog. The pool is content-sourced: the union of every
     * aptitude name referenced across loaded origin items (fixed grants +
     * aptitude-choice options), minus aptitudes the character would already
     * receive after their builder selections.
     *
     * Per Direction #7 the system has no hardcoded aptitude registry — the
     * compendium origin path documents are the source of truth, so we mine
     * the loaded origins for their referenced aptitude names. (#205)
     * @private
     */
    _collectAvailableAptitudePool(taken: ReadonlySet<string>): string[] {
        const pool = [...this.allOrigins, ...this.lineageOrigins].flatMap((origin) => referencedAptitudes(this._getSelectionSystem(origin)));
        // (#216) Under DH2 RAW a duplicate is swapped for a characteristic aptitude only; the
        // characteristic display names are the engine's generation characteristics, not content.
        const charInfo = getAllCharacteristicDisplayInfo();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: charInfo is Record<string,…> so indexed access is T|undefined under main tsconfig
        const labels = OriginPathBuilder.GENERATION_CHARACTERISTICS.map((key) => charInfo[key]?.label ?? '');
        return swapCandidates(pool, labels, taken);
    }

    /**
     * Look up a player-chosen replacement for a colliding aptitude by canonical
     * identity, so a swap recorded under one casing/spacing still resolves the
     * collision when the same aptitude surfaces under another (#205). Returns
     * the stored replacement (which may be '' meaning "explicitly skipped") or
     * `undefined` if the player has not acted on this aptitude yet.
     * @private
     */
    _lookupAptitudeOverride(original: string): string | undefined {
        return findAptitudeOverride(this.aptitudeOverrides, original);
    }

    /**
     * Compute the unresolved aptitude collisions for the current builder state.
     * A collision is an aptitude that would be granted by the player's selected
     * origins but is either (a) duplicated across two selections, or (b)
     * genuinely already present on the actor independent of those selections
     * (see `_collectExistingAptitudes`). For each collision `replacement` is the
     * chosen swap, or null if the player has not yet picked one. Used by
     * `_calculatePreview` to feed the banner and by the `resolveAptitudeDouble`
     * action to drive the chooser dialog.
     *
     * Identity is canonical (case/whitespace-insensitive): two origins that
     * grant the same aptitude with incidental string differences are a real
     * duplicate and must warn (#205). The actor-existing check is fed by the
     * self-source-aware set so a freshly-opened builder on an existing
     * character does NOT report a phantom collision (#215). The first literal
     * spelling seen is preserved as `original` for the banner/dialog/override
     * key. (#205, #215)
     */
    _getAptitudeCollisions(): { original: string; replacement: string | null }[] {
        return aptitudeCollisions(this._collectAptitudeGrantCounts(), this._collectExistingAptitudes(), (original) => this._lookupAptitudeOverride(original));
    }

    /**
     * Fold one option.grants block into the preview accumulators. Extracted
     * from _calculatePreview so the nested choice loop stays under the
     * max-depth cap.
     * @private
     */
    // eslint-disable-next-line complexity -- choice grant application handles many grant types; branchy by design
    async _applyChoiceGrantsToPreview(
        grants: WH40KItemModifiers,
        acc: {
            charTotals: Record<string, number>;
            skillMap: Map<string, PreviewGrantEntry>;
            talentMap: Map<string, PreviewGrantEntry>;
            traitMap: Map<string, PreviewGrantEntry>;
            equipmentList: string[];
        },
    ): Promise<void> {
        const choiceGrants = grants as WH40KItemModifiers & {
            characteristics?: Record<string, number>;
            skills?: GrantItemRaw[];
            talents?: GrantItemRaw[];
            traits?: GrantItemRaw[];
            equipment?: GrantItemRaw[];
        };

        // Choice characteristic bonuses
        if (choiceGrants.characteristics) {
            for (const [key, value] of Object.entries(choiceGrants.characteristics)) {
                if (value !== 0) {
                    acc.charTotals[key] = (acc.charTotals[key] ?? 0) + Number(value);
                }
            }
        }

        // Choice skills with UUIDs
        if (choiceGrants.skills) {
            for (const skill of choiceGrants.skills) {
                const skillName =
                    skill.specialization !== undefined && skill.specialization !== '' ? `${skill.name ?? ''} (${skill.specialization})` : skill.name ?? '';
                if (!acc.skillMap.has(skillName)) {
                    acc.skillMap.set(skillName, {
                        name: skillName,
                        uuid: this._findSkillUuid(skill.name, skill.specialization),
                        fromChoice: true,
                    });
                }
            }
        }

        // Choice talents with UUIDs
        if (choiceGrants.talents) {
            const talentUuidsToResolve: string[] = [];
            for (const talent of choiceGrants.talents) {
                const baseName = talent.name ?? '';
                const talentName = talent.specialization !== undefined && talent.specialization !== '' ? `${baseName} (${talent.specialization})` : baseName;
                if (!acc.talentMap.has(talentName)) {
                    acc.talentMap.set(talentName, {
                        name: talentName,
                        uuid: talent.uuid ?? null,
                        fromChoice: true,
                    });
                }
                if (talent.uuid !== undefined && talent.uuid !== '') talentUuidsToResolve.push(talent.uuid);
            }
            await Promise.all(talentUuidsToResolve.map(async (uuid) => this._addTalentModifiers(uuid, acc.charTotals, acc.skillMap)));
        }

        // Choice traits with UUIDs
        if (choiceGrants.traits) {
            for (const trait of choiceGrants.traits) {
                const traitName = trait.name ?? '';
                if (!acc.traitMap.has(traitName)) {
                    acc.traitMap.set(traitName, {
                        name: traitName,
                        uuid: trait.uuid ?? null,
                        fromChoice: true,
                    });
                }
            }
        }

        // Choice equipment
        if (choiceGrants.equipment) {
            for (const item of choiceGrants.equipment) {
                acc.equipmentList.push(item.name ?? '');
            }
        }
    }

    /**
     * Look up a talent by UUID and add its modifiers to the totals
     * @param {string} uuid - Compendium UUID for the talent
     * @param {object} charTotals - Characteristic totals accumulator
     * @param {Map} skillMap - Skill map accumulator (name -> {name, uuid})
     * @returns {Promise<void>}
     * @private
     */
    async _addTalentModifiers(uuid: string, charTotals: Record<string, number>, skillMap: Map<string, PreviewGrantEntry>): Promise<void> {
        try {
            const talent = (await fromUuid(uuid)) as ResolvedDocument | null;
            if (!talent) return;

            const talentSystem = talent.system;

            // Add characteristic modifiers from talent
            const charMods = talentSystem?.modifiers?.characteristics ?? {};
            for (const [key, value] of Object.entries(charMods)) {
                const numericValue = Number(value) || 0;
                if (numericValue !== 0) {
                    charTotals[key] = (charTotals[key] ?? 0) + numericValue;
                }
            }

            // Add skill modifiers from talent grants (e.g., nested skills)
            const talentGrants = talentSystem?.grants ?? {};
            if (talentGrants.skills) {
                for (const skill of talentGrants.skills) {
                    const skillNameRaw = typeof skill.name === 'string' ? skill.name : '';
                    const skillSpec = typeof skill.specialization === 'string' ? skill.specialization : '';
                    const skillName = skillSpec !== '' ? `${skillNameRaw} (${skillSpec})` : skillNameRaw;
                    if (!skillMap.has(skillName)) {
                        skillMap.set(skillName, {
                            name: skillName,
                            uuid: this._findSkillUuid(skill.name, skill.specialization),
                        });
                    }
                }
            }

            // Recursively process nested talents (e.g., Enemy grants from Hunted talent)
            const nestedTalents = (talentGrants as { talents?: GrantItemRaw[] }).talents;
            if (nestedTalents) {
                const nestedUuids = nestedTalents
                    .map((nestedTalent) => nestedTalent.uuid)
                    .filter((nestedUuid): nestedUuid is string => typeof nestedUuid === 'string' && nestedUuid !== '');
                await Promise.all(nestedUuids.map(async (nestedUuid) => this._addTalentModifiers(nestedUuid, charTotals, skillMap)));
            }
        } catch (error) {
            console.warn(`OriginPathBuilder | Failed to resolve talent UUID ${uuid}:`, error);
        }
    }

    /**
     * Calculate status for footer
     * @returns {object}
     * @private
     */
    // eslint-disable-next-line complexity, no-restricted-syntax -- boundary: status data is prepared for Handlebars rendering; Record<string,unknown> is the template shape
    _calculateStatus(): Record<string, unknown> {
        // Counted over the stepper's own steps (#701), Equipment included, so the footer and the stepper agree.
        const progress = stepProgress(this._prepareStepNavigation().map((step) => ({ isComplete: step['isComplete'] === true })));
        const coreStepsComplete = this.selections.size >= this.systemConfig.coreSteps.length;
        // DH2e Stage 4 Armory step (core) surfaces a cap of
        // floor(Influence/10) Scarce-or-better picks. The campaign also runs
        // a homebrew interpretation in which the Armory step is skipped
        // entirely (Influence is spent in play instead), so the cap is for
        // display only and commit is never gated on it under homebrew. Under
        // RAW DH2e the Armory step IS required for commit so players don't
        // accidentally close the builder before picking starting gear (#206).
        // The equipment step UI continues to enforce per-toggle caps via
        // _toggleEquipmentByUuid.
        const equipmentAvailable = this.systemConfig.equipmentStep != null;
        const equipmentMaxPicks = equipmentAvailable ? this._getInfluenceBonus() : 0;
        const homebrewSkipsEquipment = isHomebrewVariant(this.gameSystem);
        const equipmentRequired = equipmentAvailable && !homebrewSkipsEquipment;
        const equipmentComplete = !equipmentRequired || this.equipmentSelections.size > 0;
        let pendingChoices = 0;
        let pendingRolls = 0;

        for (const [, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            const grants: NonNullable<OriginPathSystemData['grants']> = system.grants ?? {};
            const selectedChoices: Record<string, string[]> = system.selectedChoices ?? {};

            // Count pending choices (deduplicate labels to match dialog keys)
            if ((grants.choices?.length ?? 0) > 0) {
                const statusLabelCounts: Record<string, number> = {};
                for (const choice of grants.choices as GrantChoiceRaw[]) {
                    const base = choice.label ?? choice.name ?? '';
                    statusLabelCounts[base] = (statusLabelCounts[base] ?? 0) + 1;
                    const suffix = statusLabelCounts[base] > 1 ? ` (${statusLabelCounts[base]})` : '';
                    const choiceKey = `${base}${suffix}`;
                    const sel = selectedChoices[choiceKey];
                    if (!Array.isArray(sel) || sel.length < (choice.count ?? 1)) {
                        pendingChoices++;
                    }
                }
            }

            // Count pending rolls (wounds, fate, throne gelt, Influence) — the same list the stepper gates on.
            pendingRolls += this._pendingRolls(selection).length;
        }

        return {
            stepsCount: progress.done,
            totalSteps: progress.total,
            stepsComplete: coreStepsComplete,
            // The choices indicator speaks of picked origins; with none picked there are no choices to call complete (#701).
            hasSelections: this.selections.size > 0,
            choicesComplete: pendingChoices === 0,
            equipmentRequired,
            equipmentComplete,
            equipmentMaxPicks,
            pendingChoices: pendingChoices,
            pendingRolls: pendingRolls,
            rollsComplete: pendingRolls === 0,
            canCommit: coreStepsComplete && pendingChoices === 0 && pendingRolls === 0 && equipmentComplete,
        };
    }

    /**
     * Return the confirmed selection (from this.selections or lineageSelection) that corresponds
     * to the given compendium origin, or null if no confirmed selection matches.
     * @private
     */
    _findConfirmedSelectionMatching(origin: NormalizedOrigin): NormalizedOriginWithMeta | null {
        const matches = (candidate: NormalizedOrigin | null): boolean => {
            if (candidate === null) return false;
            const candidateUuid = (candidate as NormalizedOriginWithMeta)._sourceUuid ?? candidate.uuid;
            if (candidateUuid !== null && candidateUuid !== '' && (candidateUuid === origin.uuid || candidateUuid === origin.id)) return true;
            const candidateSys = candidate.system as OriginPathSystemData;
            const originSys = origin.system as OriginPathSystemData;
            const candidateIdentifier = candidateSys.identifier;
            const originIdentifier = originSys.identifier;
            if (
                typeof candidateIdentifier === 'string' &&
                candidateIdentifier !== '' &&
                typeof originIdentifier === 'string' &&
                originIdentifier !== '' &&
                candidateIdentifier === originIdentifier
            ) {
                const candidateStep = candidateSys.step;
                const originStep = originSys.step;
                if (candidateStep === undefined || candidateStep === '' || originStep === undefined || originStep === '' || candidateStep === originStep)
                    return true;
            }
            return false;
        };

        for (const [, selection] of this.selections) {
            if (matches(selection)) return selection;
        }
        if (matches(this.lineageSelection)) return this.lineageSelection;
        return null;
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */
}
