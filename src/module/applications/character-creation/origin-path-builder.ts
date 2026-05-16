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
import type { GameSystemId, OriginStepConfig, OriginStepDef } from '../../config/game-systems/types.ts';
import WH40K from '../../config.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { GrantsManager, generateDeterministicId } from '../../managers/grants-manager.ts';
import type { WH40KCharacteristic, WH40KItemModifiers } from '../../types/global.d.ts';
import { OriginChartLayout } from '../../utils/origin-chart-layout.ts';
import { getCharacteristicDisplayInfo, getChoiceTypeLabel, getTrainingLabel } from '../../utils/origin-ui-labels.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import AdvancementDialog from '../dialogs/advancement-dialog.ts';
import ConfirmationDialog from '../dialogs/confirmation-dialog.ts';
import { type NormalizedChoice, type NormalizedChoiceOption, type NormalizedOrigin, normalizeOrigin } from './normalized-origin.ts';
import OriginDetailDialog from './origin-detail-dialog.ts';
import OriginPathChoiceDialog from './origin-path-choice-dialog.ts';
import OriginRollDialog from './origin-roll-dialog.ts';
import type {
    ActiveModifier,
    BuilderFlagState,
    CharacterGenerationSlice,
    CoreFlags,
    EquipmentEntry,
    ItemDataLike,
    ItemSystemLike,
    PreviewGrantEntry,
    PreviewSummary,
} from './types.ts';

interface FoundryApplicationsApi {
    api: {
        ApplicationV2: ApplicationV2Ctor;
        HandlebarsApplicationMixin: <T extends ApplicationV2Ctor>(base: T) => T;
    };
}
// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is Foundry's untyped namespace; FoundryApplicationsApi describes the shape this file uses
const { ApplicationV2, HandlebarsApplicationMixin } = (foundry.applications as unknown as FoundryApplicationsApi).api;

/**
 * Union view covering all shapes this builder reads from system data:
 *   - origin-path item system fields  (item.system)
 *   - actor system fields             (actor.system)
 *   - compendium index entry fields   (entry.system)
 *
 * Defined as a plain interface with an index signature so it is structurally
 * compatible with both WH40KItemSystemData and WH40KActorSystemData — both of
 * which the builder casts to this type at various call sites. Without the index
 * signature the compiler rejects the cast because the two DataModel base classes
 * (ItemDataModel vs ActorDataModel) are otherwise structurally incompatible.
 */
interface OriginPathSystemData {
    // Index signature kept loose for cross-DataModel structural compatibility.
    // The named fields below carry the actual typings the builder relies on.
    // eslint-disable-next-line no-restricted-syntax -- boundary: union view over heterogeneous DataModels (item vs actor vs compendium index)
    [key: string]: unknown;
    // Origin-path item fields
    step?: string;
    identifier?: string;
    availability?: string;
    clip?: { current?: number; max?: number };
    weaponTypes?: string[];
    description?: { value?: string; chat?: string; summary?: string };
    requirements?: { text?: string };
    activeModifiers?: ActiveModifier[];
    homebrew?: { throneGelt?: string; thrones?: string };
    modifiers?: WH40KItemModifiers;
    selectedChoices?: Record<string, string[]>;
    rollResults?: Record<string, { rolled?: number; breakdown?: string } | undefined>;
    grants?: {
        characteristics?: Record<string, number>;
        skills?: GrantItemRaw[];
        talents?: GrantItemRaw[];
        traits?: GrantItemRaw[];
        choices?: GrantChoiceRaw[];
        equipment?: GrantItemRaw[];
        woundsFormula?: string;
        fateFormula?: string;
    };
    // Actor-system shaped fields (also read via `actor.system as OriginPathSystemData`)
    originPath?: { divination?: string };
    throneGelt?: number;
    influence?: number;
    characteristics?: Record<string, WH40KCharacteristic>;
    skills?: Record<string, SkillSlice>;
    characterGeneration?: CharacterGenerationSlice;
    // Compendium index-entry shape (also read via `entry.system as OriginPathSystemData`)
    cost?: { dh2?: { homebrew?: { requisition?: number; throneGelt?: number } } };
}

/**
 * Per-skill slice on actor.system.skills.* — the builder reads `entries` for
 * the specialist-skill flatten and resets `advance` to zero on commit.
 */
interface SkillSlice {
    advance?: number;
    entries?: SkillEntry[];
}

/**
 * One specialist-skill entry. Beyond `advance` the builder treats the entry
 * as a passthrough, so unknown extra fields are tolerated via a loose value
 * type rather than `unknown`.
 */
interface SkillEntry {
    advance?: number;
    specialization?: string;
    [extra: string]: string | number | boolean | null | undefined | string[];
}

/**
 * NormalizedOrigin augmented with runtime metadata fields set by _itemToSelectionData.
 * `_id` and `_sourceUuid` are not part of the normalized schema but are attached to
 * selection objects at runtime for compendium source tracking.
 */
type NormalizedOriginWithMeta = NormalizedOrigin & {
    _id?: string;
    _sourceUuid?: string | null;
    _actorItemId?: string | null;
};

function hasToObject(item: WH40KItem | NormalizedOrigin): item is WH40KItem {
    return 'toObject' in item && typeof item.toObject === 'function';
}

/**
 * Shape of a single card inside a step layout produced by OriginChartLayout.
 */
interface StepLayoutCard {
    origin: NormalizedOrigin;
    isSelected: boolean;
    isDisabled: boolean;
    isValidNext: boolean;
    isAdvanced: boolean;
    xpCost: number;
    hasChoices: boolean;
}

/**
 * Shape of one step entry returned by OriginChartLayout.computeFullChart().
 */
interface StepLayout {
    stepKey: string;
    stepIndex: number;
    cards: StepLayoutCard[];
    maxPosition: number;
    hasSelection: boolean;
}

/**
 * Minimal shape of a raw grant skill/talent/trait entry from system.grants.*.
 * This mirrors the raw compendium data before normalization.
 */
interface GrantItemRaw {
    name?: string;
    specialization?: string;
    level?: string;
    uuid?: string;
}

/**
 * Minimal shape of a raw grant choice entry from system.grants.choices.
 * This mirrors the raw compendium data before normalization.
 */
interface GrantChoiceRaw {
    label?: string;
    name?: string;
    type?: string;
    count?: number;
    options?: Array<{ value?: string; name?: string; label?: string; grants?: WH40KItemModifiers }>;
}

/**
 * Resolved talent entry ready for display in the selected-origin preview.
 */
interface PreparedTalent {
    name?: string;
    specialization: string | null;
    uuid: string | null;
    tooltip?: string;
    tooltipData: string;
    hasItem: boolean;
}

/**
 * Resolved trait entry ready for display in the selected-origin preview.
 */
interface PreparedTrait {
    name?: string;
    level: string | null;
    uuid: string | null;
    tooltip?: string;
    tooltipData: string;
    hasItem: boolean;
}

/**
 * Shape of an equipment item entry stored in equipmentItems and equipmentSelections.
 * These entries are constructed in _loadEquipmentItems and _toggleEquipmentByUuid and
 * keyed off compendium index data; all fields are nullable because they come from optional
 * system sub-documents.
 */
interface EquipmentItemEntry {
    uuid: string;
    id: string;
    name: string | undefined;
    img: string | undefined;
    type: string | undefined;
    identifier: string | null;
    clipMax: number | null;
    weaponTypes: string[];
    availability: string;
    availabilityLabel: string;
    availabilityOrder: number;
    requisition: number | null;
    throneGelt: number | null;
}

/**
 * Local alias for the internal OriginLike type accepted by OriginChartLayout.
 * NormalizedOrigin is structurally compatible; this alias lets us cast without
 * `as any` at each call site.
 */
type OriginLikeParam = Parameters<typeof OriginChartLayout.computeFullChart>[0][number];

/**
 * Cast helpers from `NormalizedOrigin` to the structurally-compatible
 * `OriginLikeParam` accepted by OriginChartLayout. The cast cannot be expressed
 * without `unknown` because the two types live in separate files and the
 * compiler cannot see the structural overlap.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: NormalizedOrigin is structurally compatible with OriginLikeParam; OriginChartLayout owns the parameter type
const asOriginLike = (origin: NormalizedOrigin): OriginLikeParam => origin as unknown as OriginLikeParam;
// eslint-disable-next-line no-restricted-syntax -- boundary: same as asOriginLike, nullable variant
const asOriginLikeOrNull = (origin: NormalizedOrigin | null): OriginLikeParam | null => origin as unknown as OriginLikeParam | null;
// eslint-disable-next-line no-restricted-syntax -- boundary: NormalizedOrigin[] is structurally compatible with OriginLikeParam[]
const asOriginLikeArray = (origins: NormalizedOrigin[]): OriginLikeParam[] => origins as unknown as OriginLikeParam[];
// eslint-disable-next-line no-restricted-syntax -- boundary: Map<string, NormalizedOrigin> is structurally compatible with Map<string, OriginLikeParam>
const asOriginLikeMap = (selections: Map<string, NormalizedOrigin>): Map<string, OriginLikeParam> => selections as unknown as Map<string, OriginLikeParam>;

/**
 * Minimal shape of a document resolved via fromUuid().
 * Only the fields actually accessed in this file are declared.
 */
interface ResolvedDocument {
    system?: {
        description?: { value?: string };
        grants?: { skills?: GrantItemRaw[]; talents?: GrantItemRaw[] };
        modifiers?: { characteristics?: Record<string, number | string | undefined> };
    };
    sheet?: { render: (force?: boolean) => void };
}

/**
 * Direction modes for origin path creation
 */
const DIRECTION = {
    FORWARD: 'forward', // Start at Home World, end at Career
    BACKWARD: 'backward', // Start at Career, end at Home World
};

// eslint-disable-next-line no-restricted-syntax -- boundary: options is an ApplicationV2 options bag; no typed schema available
function resolveBuilderGameSystem(actor: WH40KBaseActor, options: Record<string, unknown>): GameSystemId {
    const requested = typeof options['gameSystem'] === 'string' && options['gameSystem'] !== '' ? options['gameSystem'] : actor.system.gameSystem;
    if (typeof requested === 'string' && requested !== '' && SystemConfigRegistry.has(requested)) {
        return requested as GameSystemId;
    }
    throw new Error('Unable to resolve a game system for OriginPathBuilder');
}

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
    declare _charRolls: number[];
    declare _charAssignments: Record<string, number | null>;
    declare _charCustomBases: Record<string, number>;
    declare _charAdvancedMode: boolean;
    declare _charGenMode: 'point-buy' | 'roll' | 'roll-pool-hb';
    declare _charDragData: { type: string; index: number; characteristic: string | null } | null;
    declare _divination: string;
    declare _thronesRolled: number;
    declare _influenceRolled: number;
    declare _savedScrollTop: number;
    declare _originsLoaded: boolean;
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
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            randomize: OriginPathBuilder.#randomize,
            reset: OriginPathBuilder.#reset,
            export: OriginPathBuilder.#export,
            import: OriginPathBuilder.#import,
            setMode: OriginPathBuilder.#setMode,
            setDirection: OriginPathBuilder.#setDirection,
            goToStep: OriginPathBuilder.#goToStep,
            selectOriginCard: OriginPathBuilder.#previewOriginCard, // Changed: preview instead of select
            viewOriginCard: OriginPathBuilder.#viewOriginCard,
            viewOrigin: OriginPathBuilder.#viewOrigin,
            confirmSelection: OriginPathBuilder.#confirmSelection, // New: confirm and advance
            clearOrigin: OriginPathBuilder.#clearOrigin,
            editChoice: OriginPathBuilder.#editChoice,
            rollStat: OriginPathBuilder.#rollStat,
            manualStat: OriginPathBuilder.#manualStat,
            goToLineage: OriginPathBuilder.#goToLineage,
            skipLineage: OriginPathBuilder.#skipLineage,
            goToCharacteristics: OriginPathBuilder.#goToCharacteristics,
            rollCharacteristicsBank: OriginPathBuilder.#rollCharacteristicsBank,
            charReset: OriginPathBuilder.#charReset,
            charToggleAdvanced: OriginPathBuilder.#charToggleAdvanced,
            setCharGenMode: OriginPathBuilder.#setCharGenMode,
            rollDivination: OriginPathBuilder.#rollDivination,
            manualDivination: OriginPathBuilder.#manualDivination,
            rollThrones: OriginPathBuilder.#rollThrones,
            manualThrones: OriginPathBuilder.#manualThrones,
            rollInfluence: OriginPathBuilder.#rollInfluence,
            manualInfluence: OriginPathBuilder.#manualInfluence,
            commit: OriginPathBuilder.#commit,
            openItem: OriginPathBuilder.#openItem,
            goToEquipment: OriginPathBuilder.#goToEquipment,
            toggleEquipmentItem: OriginPathBuilder.#toggleEquipmentItem,
            clearEquipment: OriginPathBuilder.#clearEquipment,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
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

        // Characteristic generation state
        this._charRolls = Array<number>(9).fill(0);
        this._charAssignments = {};
        this._charCustomBases = {};
        this._charAdvancedMode = false;
        this._charGenMode = 'roll-pool-hb';
        this._charDragData = null;
        const actorSys = this._actorSys();
        this._divination = actorSys.originPath?.divination ?? '';
        const isDH2Homebrew = this.gameSystem === 'dh2e' && WH40KSettings.isHomebrew();
        this._thronesRolled = isDH2Homebrew ? 0 : actorSys.throneGelt ?? 0;
        this._influenceRolled = isDH2Homebrew ? 0 : actorSys.influence ?? 0;
        this._savedScrollTop = 0;
        this._initCharacteristicState();

        // Initialize from actor's existing origin paths
        this._initializeFromActor();
    }

    /* -------------------------------------------- */

    static GENERATION_CHARACTERISTICS = [
        'weaponSkill',
        'ballisticSkill',
        'strength',
        'toughness',
        'agility',
        'intelligence',
        'perception',
        'willpower',
        'fellowship',
    ];

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

        const assignments = genData.assignments ?? {};
        const customBases = genData.customBases ?? {};
        const defaultBase = WH40KSettings.getCharacteristicBase();

        for (const key of CHARS) {
            this._charAssignments[key] = assignments[key] ?? null;
            this._charCustomBases[key] = customBases[key] ?? defaultBase;
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
        const data = hasToObject(item)
            ? (item.toObject() as ItemDataLike & { uuid?: string })
            : (foundry.utils.deepClone(item) as ItemDataLike & { uuid?: string });

        if (hasToObject(item)) {
            // Store original uuid for reference to compendium item
            const flagsCore = (item.flags as { core?: CoreFlags }).core;
            const flagSourceId = typeof flagsCore?.sourceId === 'string' ? flagsCore.sourceId : undefined;
            data._sourceUuid = (item.parent === this.actor ? flagSourceId ?? data._sourceUuid ?? item.uuid : item.uuid ?? data._sourceUuid) ?? null;
            // Store actor item id if this is an existing actor item
            data._actorItemId = item.parent === this.actor ? item.id : null;
        } else {
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

        // Load from all configured packs for this game system
        const packNames = this.systemConfig.packs;
        const optionalStepIndex = this.systemConfig.optionalStep?.stepIndex;
        const allOriginPaths: NormalizedOrigin[] = [];

        for (const packName of packNames) {
            // Try fully qualified ID first, then metadata.name fallback
            const pack =
                game.packs.get(`wh40k-rpg.${packName}`) ?? game.packs.find((p) => p.metadata.name === packName || p.metadata.id === `wh40k-rpg.${packName}`);
            if (!pack) {
                console.warn(`Origin path compendium '${packName}' not found`);
                continue;
            }
            // eslint-disable-next-line no-await-in-loop -- sequential: walks packs in priority order
            const documents = await pack.getDocuments();
            // Filter and normalize
            allOriginPaths.push(
                ...documents
                    .filter((d): d is typeof d & { type: string } => (d as { type?: string }).type === 'originPath')
                    // eslint-disable-next-line no-restricted-syntax -- boundary: normalizeOrigin accepts the raw compendium document shape and validates structurally
                    .map((d) => normalizeOrigin(d as unknown as Record<string, unknown>)),
            );
        }

        if (allOriginPaths.length === 0) {
            console.warn('No origin path items found in configured compendiums');
            return;
        }

        // Separate optional step origins from core origins
        this.allOrigins = allOriginPaths.filter((o) => o.stepIndex !== optionalStepIndex);
        this.lineageOrigins = allOriginPaths.filter((o) => o.stepIndex === optionalStepIndex);
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext signature accepts and returns Record<string,unknown>; Foundry framework type
    override async _prepareContext(_options: Record<string, unknown>): Promise<Record<string, unknown>> {
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
                asOriginLikeArray(this.allOrigins),
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

        const isDH2 = this.gameSystem === 'dh2e';
        const ruleset = WH40KSettings.getRuleset();
        const isHomebrew = isDH2 && ruleset === 'homebrew';
        const isRaw = isDH2 && ruleset === 'raw';
        return {
            actor: this.actor,
            gameSystem: this.gameSystem,
            guidedMode: this.guidedMode,
            isForward: this.direction === DIRECTION.FORWARD,
            isBackward: this.direction === DIRECTION.BACKWARD,
            hasDirectionToggle: this.gameSystem === 'rt',
            showLineage: this.showLineage,
            showCharacteristics: this.showCharacteristics,
            showEquipment: this.showEquipment,
            hasEquipmentStep: !!this.systemConfig.equipmentStep,
            isDH2,
            isHomebrew,
            isRaw,
            hideThroneGelt: isRaw,

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
        const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
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
        const DEFAULT_BASE = WH40KSettings.getCharacteristicBase();
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
            const base = this._charAdvancedMode ? this._charCustomBases[key] ?? DEFAULT_BASE : DEFAULT_BASE;
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

        return {
            rollsBank,
            characteristicRows,
            characteristics,
            preview,
            advancedMode: this._charAdvancedMode,
            allAssigned,
            anyRolls,
            canApply: isModeRollPoolHB && allAssigned && anyRolls,
            divination: this._divination,
            mode: this._charGenMode,
            isModePointBuy: this._charGenMode === 'point-buy',
            isModeRoll: this._charGenMode === 'roll',
            isModeRollPoolHB,
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
            const choices = selection.grants.choices;
            const labelCounts: Record<string, number> = {};

            for (const choice of choices as Array<NormalizedChoice & { name?: string }>) {
                const baseLabel = choice.label !== '' ? choice.label : choice.name ?? 'choice';
                labelCounts[baseLabel] = (labelCounts[baseLabel] ?? 0) + 1;
                const suffix = labelCounts[baseLabel] > 1 ? ` (${labelCounts[baseLabel]})` : '';
                const choiceKey = `${baseLabel}${suffix}`;
                const selectedValues = selectedChoices[choiceKey] ?? [];

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
            title: 'Origin Bonus',
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
     * Whether the characteristic step is in a committable state. Only the
     * `roll-pool-hb` mode is implemented today — point-buy and roll are
     * stubs and never report ready, blocking commit until they ship.
     * @private
     */
    _hasAssignedCharacteristics(): boolean {
        if (this._charGenMode !== 'roll-pool-hb') return false;
        return OriginPathBuilder.GENERATION_CHARACTERISTICS.every((key) => {
            const assignedIdx = this._charAssignments[key];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: _charAssignments values may be null (unassigned) or undefined (key absent)
            return assignedIdx !== null && assignedIdx !== undefined && (this._charRolls[assignedIdx] ?? 0) > 0;
        });
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
        return this._dedupeOriginsByIdentity(this.lineageOrigins).map((origin) => {
            return {
                id: origin.id,
                uuid: origin.uuid,
                name: origin.name,
                img: origin.img,
                shortDescription: origin.shortDescription,
                fullDescription: this._stripHtml(typeof origin.description === 'string' ? origin.description : ''),
                isSelected:
                    activeLineageIds.has(origin.id) ||
                    (origin.uuid !== null && activeLineageIds.has(origin.uuid)) ||
                    activeLineageIds.has(typeof origin.system['identifier'] === 'string' ? origin.system['identifier'] : ''),
                isDisabled: false,
                isValidNext: true,
                hasChoices: origin.hasChoices,
                isAdvanced: origin.isAdvanced,
                xpCost: origin.xpCost,
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender signature accepts Record<string,unknown>; Foundry framework types
    override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);
        this._restoreScrollPosition();

        if (this.showEquipment) {
            const equipRoot = this.element;
            const search = equipRoot.querySelector('.equip-search');
            if (search) {
                search.addEventListener('input', (e) => {
                    this._equipmentFilter.search = (e.currentTarget as HTMLInputElement).value;
                    this._saveScrollPosition();
                    void this.render();
                });
            }
            const typeSelect = equipRoot.querySelector('.equip-type-filter');
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
            equipRoot.querySelectorAll('.equip-row').forEach((row) => {
                const rowEl = row as HTMLElement;
                const uuid = rowEl.dataset['uuid'];
                const checkbox = rowEl.querySelector('.equip-check');
                if (!checkbox || uuid === undefined || uuid === '') return;
                checkbox.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this._toggleEquipmentByUuid(uuid);
                });
            });
            return;
        }

        if (!this.showCharacteristics) return;

        const html = this.element;

        // Roll chip click-to-edit and drag
        html.querySelectorAll('.csd-roll-chip').forEach((chip) => {
            chip.addEventListener('click', this._onCharRollChipClick.bind(this));
            chip.addEventListener('dragstart', this._onCharDragStart.bind(this));
            chip.addEventListener('dragend', this._onCharDragEnd.bind(this));
        });

        // Characteristic slots as drop targets
        html.querySelectorAll('.csd-char-slot').forEach((slot) => {
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).classList.add('drop-valid', 'drop-hover');
            });
            slot.addEventListener('dragleave', (e) => {
                (e.currentTarget as HTMLElement).classList.remove('drop-hover');
            });
            slot.addEventListener('drop', this._onCharDrop.bind(this));
            const rollChip = slot.querySelector('.csd-assigned-roll');
            if (rollChip) {
                rollChip.addEventListener('dragstart', this._onCharDragStart.bind(this));
                rollChip.addEventListener('dragend', this._onCharDragEnd.bind(this));
            }
        });

        // Rolls bank as drop target
        const rollsBank = html.querySelector('.csd-rolls-bank');
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
        html.querySelectorAll('.csd-base-input').forEach((input) => {
            input.addEventListener('change', (e) => {
                const el = e.currentTarget as HTMLInputElement;
                const key = el.dataset['characteristic'];
                if (key === undefined || key === '') return;
                let value = parseInt(el.value, 10);
                if (Number.isNaN(value) || value < 0) value = 0;
                this._charCustomBases[key] = value;
                void this.render();
            });
        });

        const divinationInput = html.querySelector('.csd-divination-input');
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

        const valueEl = chip.querySelector<HTMLElement>('.csd-roll-value');
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
                isComplete: hasSelection,
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
                isDisabled: this.guidedMode && this.selections.size < this.systemConfig.coreSteps.length,
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
            isDisabled: this.guidedMode && this.selections.size < this.systemConfig.coreSteps.length,
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
     * Influence bonus (tens digit of Influence) — used to cap starting equipment selections per DH2e core pg 80.
     * @private
     */
    _getInfluenceBonus(): number {
        // Homebrew grants 3 starting Armoury acquisitions regardless of Influence; RAW uses the DH2e core pg 80 rule (floor(Influence/10)).
        if (this.gameSystem === 'dh2e' && WH40KSettings.isHomebrew()) return 3;
        const rolled = this._influenceRolled;
        const stored = Number(this._actorSys().influence ?? 0);
        const influence = rolled > 0 ? rolled : stored;
        return Math.floor(influence / 10);
    }

    /**
     * Load Armoury items (Chapter V) for the Equip Acolyte step, filtering to Scarce (-10) or better.
     * @private
     */
    async _loadEquipmentItems(): Promise<void> {
        if (this._equipmentLoaded) return;

        const packNames = this.systemConfig.equipmentPacks ?? [];
        if (packNames.length === 0) {
            this._equipmentLoaded = true;
            return;
        }

        const configWh40k = (CONFIG as { wh40k?: { availabilities?: Record<string, { label: string; modifier: number }> } }).wh40k;
        const availabilityConfig = configWh40k?.availabilities ?? WH40K.availabilities;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: availabilityConfig['scarce'] may be absent; modifier may be absent
        const scarceModifier = availabilityConfig['scarce']?.modifier ?? 0;
        const packLoadResults = await Promise.all(
            packNames.map(async (packName): Promise<EquipmentEntry[]> => {
                const pack =
                    game.packs.get(`wh40k-rpg.${packName}`) ??
                    game.packs.find((p) => p.metadata.name === packName || p.metadata.id === `wh40k-rpg.${packName}`);
                if (!pack) return [];

                const index = await pack.getIndex({
                    fields: [
                        'system.availability',
                        'system.identifier',
                        'system.clip.max',
                        'system.weaponTypes',
                        'system.cost.dh2.homebrew.requisition',
                        'system.cost.dh2.homebrew.throneGelt',
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
                    const availabilityEntry = availabilityConfig[availability] as { label: string; modifier: number } | undefined;
                    if (availabilityEntry === undefined) continue;
                    const modifier = availabilityEntry.modifier;
                    if (modifier < scarceModifier) continue;
                    if (entry.name?.startsWith('! Default') === true) continue;
                    const homebrewCost = entrySys?.cost?.dh2?.homebrew;
                    const equipEntry: EquipmentEntry = {
                        uuid: `Compendium.${pack.metadata.id}.${entry._id}`,
                        id: entry._id,
                        identifier: entrySys?.identifier ?? null,
                        clipMax: entrySys?.clip?.max ?? null,
                        weaponTypes: entrySys?.weaponTypes ?? [],
                        availability,
                        availabilityLabel: game.i18n.localize(availabilityEntry.label),
                        availabilityOrder: modifier,
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
            isHomebrew: WH40KSettings.isHomebrew(),
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
        return this.selections.has(prevStep.step);
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

        // Per-origin throne gelt roll (homebrew only, homeworld and background steps each roll their own formula).
        const thronesFormulaForItem = this._getSelectionThronesFormula(item);
        const itemSys = item.system as OriginPathSystemData;
        const thronesEligibleStep = itemSys.step === 'homeWorld' || itemSys.step === 'background';
        const thronesAllowedByRuleset = this.gameSystem === 'dh2e' && WH40KSettings.isHomebrew();
        if (thronesFormulaForItem !== '' && thronesEligibleStep && thronesAllowedByRuleset) {
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

        const isDH2Homebrew = this.gameSystem === 'dh2e' && WH40KSettings.isHomebrew();
        // Influence is RAW-only: in homebrew it's not rolled at creation, so hide the block entirely.
        const showInfluence = currentStep.key === 'background' && !isDH2Homebrew;
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
                let tooltipText = talent.name;
                let hasItem = false;

                if (talent.uuid !== undefined && talent.uuid !== '') {
                    try {
                        const item = (await fromUuid(talent.uuid)) as ResolvedDocument | null;
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
                let tooltipText = trait.name;
                let hasItem = false;

                if (trait.uuid !== undefined && trait.uuid !== '') {
                    try {
                        const item = (await fromUuid(trait.uuid)) as ResolvedDocument | null;
                        if (item) {
                            hasItem = true;
                            const desc = item.system?.description?.value;
                            if (desc !== undefined && desc !== '') {
                                tooltipText = this._stripHtml(desc).substring(0, 200);
                                if (tooltipText.length >= 200) tooltipText += '...';
                            }
                        }
                    } catch {
                        // Item not found
                    }
                }

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
        preview.aptitudes = Array.from(aptitudeSet).sort((a, b) => a.localeCompare(b));

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
            const skillPack = game.packs.find((p) => p.metadata.name === 'dh2-core-stats-skills');
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
     * Add aptitude names from a resolved aptitude-typed choice into the running
     * aptitude set. Extracted from _calculatePreview to flatten its loop depth.
     * @private
     */
    _collectAptitudeChoices(choice: GrantChoiceRaw, selectedValues: string[], aptitudeSet: Set<string>): void {
        for (const selectedValue of selectedValues) {
            const option = choice.options?.find((o) => o.value === selectedValue || o.name === selectedValue);
            const aptName = (option?.value !== undefined && option.value !== '' ? option.value : option?.name) ?? selectedValue;
            if (aptName !== '') aptitudeSet.add(aptName);
        }
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
        const totalSteps = this.systemConfig.coreSteps.length + (this.systemConfig.optionalStep ? 1 : 0) + 1;
        const stepsCount = this.selections.size + (this.lineageSelection ? 1 : 0) + (this._hasAssignedCharacteristics() ? 1 : 0);
        const coreStepsComplete = this.selections.size >= this.systemConfig.coreSteps.length;
        // DH2e Stage 4 Armory step (core p.81) surfaces a cap of
        // floor(Influence/10) Scarce-or-better picks. The campaign also runs
        // a homebrew interpretation in which the Armory step is skipped
        // entirely (Influence is spent in play instead), so the cap is for
        // display only and commit is never gated on it. The equipment step
        // UI continues to enforce per-toggle caps via _toggleEquipmentByUuid.
        const equipmentAvailable = this.systemConfig.equipmentStep !== undefined;
        const equipmentMaxPicks = equipmentAvailable ? this._getInfluenceBonus() : 0;
        const equipmentRequired = false;
        const equipmentComplete = true;
        let pendingChoices = 0;
        let pendingRolls = 0;

        for (const [, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            const grants: NonNullable<OriginPathSystemData['grants']> = system.grants ?? {};
            const selectedChoices: Record<string, string[]> = system.selectedChoices ?? {};
            const rollResults: Record<string, { rolled?: number; breakdown?: string } | undefined> = system.rollResults ?? {};

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

            // Count pending rolls
            if (grants.woundsFormula !== undefined && grants.woundsFormula !== '' && rollResults['wounds']?.rolled === undefined) {
                pendingRolls++;
            }
            if (grants.fateFormula !== undefined && grants.fateFormula !== '' && rollResults['fate']?.rolled === undefined) {
                pendingRolls++;
            }
        }

        return {
            stepsCount: stepsCount,
            totalSteps: totalSteps,
            stepsComplete: coreStepsComplete,
            choicesComplete: pendingChoices === 0,
            equipmentRequired,
            equipmentComplete,
            equipmentMaxPicks,
            pendingChoices: pendingChoices,
            pendingRolls: pendingRolls,
            canCommit: coreStepsComplete && pendingChoices === 0 && equipmentComplete,
        };
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Randomize all selections
     */
    static async #randomize(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        const confirmed = await ConfirmationDialog.confirm({
            title: game.i18n.localize('WH40K.OriginPath.Randomize'),
            content: game.i18n.localize('WH40K.OriginPath.RandomizeConfirm'),
        });

        if (!confirmed) return;

        // Clear and randomize
        this.selections.clear();

        const coreStepKeys = this.systemConfig.coreSteps.map((s) => s.key);
        const rawChartLayout = OriginChartLayout.computeFullChart(
            asOriginLikeArray(this.allOrigins),
            asOriginLikeMap(this.selections),
            false,
            'forward',
            coreStepKeys,
        );
        // eslint-disable-next-line no-restricted-syntax -- boundary: OriginChartLayout's ChartLayout/OriginCard types are structurally compatible with our StepLayout view
        const chartLayout = rawChartLayout as unknown as { steps: StepLayout[] };

        const coreSteps = this.systemConfig.coreSteps;
        for (let i = 0; i < coreSteps.length; i++) {
            const stepLayout = chartLayout.steps[i];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: chartLayout.steps is an array; index may be out of bounds
            if (stepLayout === undefined) continue;
            const validOrigins = stepLayout.cards.filter((c) => (c as StepLayoutCard & { isSelectable?: boolean }).isSelectable === true);

            if (validOrigins.length > 0) {
                const randomIndex = Math.floor(Math.random() * validOrigins.length);
                const selected = validOrigins[randomIndex];
                const coreStep = coreSteps[i];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: validOrigins/coreSteps are arrays; indices may be out of bounds
                if (selected === undefined || coreStep === undefined) continue;

                // Store as plain data object (not Item instance)
                const originData = this._itemToSelectionData(selected.origin);
                this.selections.set(coreStep.step, originData);
            }
        }

        this._refreshPathPositions();

        this.currentStepIndex = 0;
        void this.render();
    }

    /**
     * Reset all selections
     */
    static async #reset(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        const confirmed = await ConfirmationDialog.confirm({
            title: game.i18n.localize('WH40K.OriginPath.Reset'),
            content: game.i18n.localize('WH40K.OriginPath.ConfirmReset'),
        });

        if (!confirmed) return;

        // Reverse any previously applied grants from this character's origin path
        const reverseResult = await GrantsManager.reverseAllAppliedGrants(this.actor);
        if (reverseResult.errors.length > 0) {
            console.warn('Some grants failed to reverse during reset:', reverseResult.errors);
        }

        // Delete origin path items from actor
        const originPathItems = this.actor.items.filter((i) => i.type === 'originPath');
        if (originPathItems.length > 0) {
            const ids = originPathItems.map((i) => i.id).filter((id): id is string => typeof id === 'string');
            await this.actor.deleteEmbeddedDocuments('Item', ids);
        }

        // Clear UI state
        this.selections.clear();
        this.currentStepIndex = 0;
        void this.render();
    }

    /**
     * Export path configuration
     */
    static #export(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: selections export shape is an untyped serialization payload
        const data: { version: number; selections: Record<string, unknown> } = {
            version: 1,
            selections: {},
        };

        for (const [step, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            const selWithMeta = selection as NormalizedOriginWithMeta;
            data.selections[step] = {
                uuid: selection.uuid ?? selWithMeta._sourceUuid,
                name: selection.name,
                selectedChoices: system.selectedChoices ?? {},
                rollResults: system.rollResults ?? {},
            };
        }

        const filename = `${this.actor.name}-origin-path.json`;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
        ui.notifications.info(game.i18n.localize('WH40K.OriginPath.ExportSuccess'));
    }

    /**
     * Import path configuration
     */
    static #import(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', (e) => {
            void (async () => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    interface ImportSelectionEntry {
                        uuid?: string;
                        selectedChoices?: Record<string, string[]>;
                        rollResults?: Record<string, { rolled?: number; breakdown?: string } | undefined>;
                    }
                    interface ImportPayload {
                        version?: number;
                        selections?: Record<string, ImportSelectionEntry>;
                    }
                    const data = JSON.parse(text) as ImportPayload;

                    if (data.version !== 1) {
                        throw new Error('Unsupported version');
                    }

                    this.selections.clear();

                    for (const [step, selData] of Object.entries(data.selections ?? {})) {
                        if (selData.uuid === undefined) continue;
                        // eslint-disable-next-line no-await-in-loop -- sequential: each selection resolves a different compendium uuid
                        const origin = await fromUuid(selData.uuid);
                        if (origin) {
                            // Store as plain data object (not Item instance)
                            const originData = this._itemToSelectionData(origin as WH40KItem | NormalizedOrigin);
                            if (selData.selectedChoices) originData.system['selectedChoices'] = selData.selectedChoices;
                            if (selData.rollResults) originData.system['rollResults'] = selData.rollResults;
                            this.selections.set(step, originData);
                        }
                    }

                    this._refreshPathPositions();

                    this.currentStepIndex = 0;
                    void this.render();
                    ui.notifications.info(game.i18n.localize('WH40K.OriginPath.ImportSuccess'));
                } catch (err) {
                    console.error('Import failed:', err);
                    ui.notifications.error(game.i18n.localize('WH40K.OriginPath.ImportFailed'));
                }
            })();
        });

        input.click();
    }

    /**
     * Set guided/free mode
     */
    static #setMode(this: OriginPathBuilder, _event: Event, target: HTMLElement): void {
        const value = (target as HTMLInputElement).value || target.closest('[data-action]')?.querySelector('input')?.value;
        this.guidedMode = value === 'guided';
        void this.render();
    }

    /**
     * Set direction (forward/backward)
     */
    static async #setDirection(this: OriginPathBuilder, _event: Event, target: HTMLElement): Promise<void> {
        const value = (target as HTMLInputElement).value || target.dataset['direction'];
        if (value === 'forward' || value === 'backward') {
            const oldDirection = this.direction;
            this.direction = value;
            this.showLineage = false;
            this.showCharacteristics = false;
            this._clearPreviewedOrigin();

            // If direction changed and we have selections, warn about reset
            if (oldDirection !== this.direction && this.selections.size > 0) {
                const confirmed = await ConfirmationDialog.confirm({
                    title: game.i18n.localize('WH40K.OriginPath.DirectionChange'),
                    content: game.i18n.localize('WH40K.OriginPath.DirectionChangeWarning'),
                });

                if (!confirmed) {
                    this.direction = oldDirection;
                    void this.render();
                    return;
                }

                // Reset selections when changing direction
                this.selections.clear();
                this.currentStepIndex = 0;
            }

            void this.render();
        }
    }

    /**
     * Navigate to a step
     */
    static #goToStep(this: OriginPathBuilder, _event: Event, target: HTMLElement): void {
        const stepKey = target.dataset['stepKey'];
        const stepIndex = parseInt(target.dataset['stepIndex'] ?? '', 10);
        if ((stepKey === undefined || stepKey === '') && Number.isNaN(stepIndex)) return;

        if (stepKey === 'characteristics') {
            if (this.guidedMode && this.selections.size < this.systemConfig.coreSteps.length) {
                ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompleteAllSteps'));
                return;
            }

            this.showLineage = false;
            this.showCharacteristics = true;
            this.showEquipment = false;
            this._clearPreviewedOrigin();
            void this.render();
            return;
        }

        if (this.systemConfig.equipmentStep && stepKey === this.systemConfig.equipmentStep.key) {
            if (this.guidedMode && !this._hasAssignedCharacteristics()) {
                ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.EquipmentNeedsCharacteristics'));
                return;
            }
            this.showLineage = false;
            this.showCharacteristics = false;
            this.showEquipment = true;
            this._clearPreviewedOrigin();
            void this.render();
            return;
        }

        if (stepKey === this.systemConfig.optionalStep?.key) {
            if (this.guidedMode && this.selections.size < this.systemConfig.coreSteps.length) {
                ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompleteAllSteps'));
                return;
            }

            this.showLineage = true;
            this.showCharacteristics = false;
            this.showEquipment = false;
            this._clearPreviewedOrigin();
            void this.render();
            return;
        }

        if (Number.isNaN(stepIndex)) return;

        this.showLineage = false;
        this.showCharacteristics = false;
        this.showEquipment = false;
        this._clearPreviewedOrigin();

        if (this.guidedMode && !this._isStepAccessible(stepIndex)) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompletePreviousStep'));
            return;
        }

        this.currentStepIndex = stepIndex;
        void this.render();
    }

    /**
     * Preview origin card (NEW behavior - single click shows in panel, doesn't select)
     * This is the new primary preview method - clicking a card just shows it in the panel
     */
    static #previewOriginCard(this: OriginPathBuilder, _event: Event, target: HTMLElement): void {
        const originId = target.dataset['originId'];
        const originUuid = target.dataset['originUuid'];

        if ((originId === undefined || originId === '') && (originUuid === undefined || originUuid === '')) return;

        // Check if disabled
        if (target.classList.contains('disabled')) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.OriginNotAvailable'));
            return;
        }

        // Find the origin (check both main and lineage origins)
        let origin = this.allOrigins.find((o) => o.id === originId);
        // eslint-disable-next-line no-restricted-syntax -- dialog state: origin is a local variable; ??= falls back to lineage search when not found in core origins
        origin ??= this.lineageOrigins.find((o) => o.id === originId);
        if (origin === undefined) return;

        // If this origin is already the confirmed selection for its step, reuse the stored
        // selection data so previously made choices and rolls stay populated when the user
        // re-clicks the card. Otherwise the preview would load fresh compendium data.
        const confirmed = this._findConfirmedSelectionMatching(origin);
        this.previewedOrigin = confirmed ?? this._itemToSelectionData(origin);

        // Re-render to show in selection panel
        void this.render();
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

    /**
     * Confirm the currently previewed selection and advance to next step
     */
    static async #confirmSelection(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        const currentStep = this.currentStep;

        // Use previewed origin, or fall back to already-confirmed selection for this step
        if (!this.previewedOrigin) {
            const existing = this.selections.get(currentStep.step);
            if (existing) {
                // Already confirmed — nothing to do, just advance
                void this.render();
                return;
            }
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.NoPreviewedOrigin'));
            return;
        }

        // Check if we're changing an existing selection in guided mode
        if (this.guidedMode && this.selections.has(currentStep.step)) {
            // Find steps that would be reset
            const currentIndex = this.orderedSteps.findIndex((s) => s.key === currentStep.key);
            const stepsToReset = this.orderedSteps.slice(currentIndex + 1);
            const hasSelections = stepsToReset.some((s) => this.selections.has(s.step));

            if (hasSelections) {
                // Build list of steps that will be reset
                const stepNames = stepsToReset
                    .filter((s) => this.selections.has(s.step))
                    .map((s) => this._getLocalizedStepLabel(s.key))
                    .join(', ');

                const confirmed = await ConfirmationDialog.confirm({
                    title: game.i18n.localize('WH40K.OriginPath.ChangeSelection'),
                    content: game.i18n.format('WH40K.OriginPath.ChangeSelectionWarning', { steps: stepNames }),
                });

                if (!confirmed) {
                    return; // User cancelled
                }
            }
        }

        // Now actually select and confirm
        this._selectOrigin(this.previewedOrigin);

        // Clear preview
        this.previewedOrigin = null;

        // Re-render
        void this.render();
    }

    /**
     * View origin card details (eye icon button - preview only)
     * This is now the preview/detail view - does NOT select
     */
    static async #viewOriginCard(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        // Stop propagation so parent card click doesn't fire
        event.stopPropagation();

        const originId = target.dataset['originId'];
        const originUuid = target.dataset['originUuid'];

        if ((originId === undefined || originId === '') && (originUuid === undefined || originUuid === '')) return;

        // Find the origin (check both main and lineage origins)
        let origin = this.allOrigins.find((o) => o.id === originId);
        // eslint-disable-next-line no-restricted-syntax -- dialog state: origin is a local variable; ??= falls back to lineage search when not found in core origins
        origin ??= this.lineageOrigins.find((o) => o.id === originId);
        if (origin === undefined) return;

        // Get current selection to check if already selected
        const currentStep = this.currentStep;
        let isSelected = false;
        if (this.showLineage) {
            isSelected = this.lineageSelection?.id === originId;
        } else {
            const sel = this.selections.get(currentStep.step);
            isSelected = sel?.id === originId;
        }

        // Show detail dialog for PREVIEW ONLY (no selection)
        // eslint-disable-next-line no-restricted-syntax -- boundary: OriginDetailDialog accepts the structurally-compatible NormalizedOrigin shape
        await OriginDetailDialog.show(origin as unknown as WH40KItem, {
            allowSelection: false, // Changed to false - preview only
            isSelected: isSelected,
        });
    }

    /**
     * Internal method to select an origin after confirmation
     * @param {Item|object} origin - The origin to select (Item or plain data object)
     * @private
     */
    _selectOrigin(origin: WH40KItem | NormalizedOrigin): void {
        const currentStep = this.currentStep;

        // Convert to plain data object if it's an Item
        const originData: NormalizedOriginWithMeta =
            'toObject' in origin && typeof origin.toObject === 'function'
                ? this._itemToSelectionData(origin)
                : foundry.utils.deepClone(origin as NormalizedOrigin);

        if (this.showLineage) {
            // Lineage selection
            this.lineageSelection = originData;
        } else {
            const currentIndex = this.orderedSteps.findIndex((s) => s.key === currentStep.key);

            // Check if changing selection - need to reset subsequent steps
            if (this.guidedMode && this.selections.has(currentStep.step)) {
                // Clear subsequent steps when changing a selection
                const stepsToReset = this.orderedSteps.slice(currentIndex + 1);
                for (const step of stepsToReset) {
                    this.selections.delete(step.step);
                }
            }

            const lastSelection = this._getLastConfirmedSelection(currentIndex) as NormalizedOrigin | null;
            originData.system['pathPositions'] = OriginChartLayout.resolvePathPositions(asOriginLike(originData), asOriginLikeOrNull(lastSelection));

            // Store selection as plain data object
            this.selections.set(currentStep.step, originData);

            // Auto-advance to next step if in guided mode
            if (this.guidedMode && this.currentStepIndex < this.systemConfig.coreSteps.length - 1) {
                this.currentStepIndex++;
            }
        }

        void this.render();
    }

    /**
     * View origin sheet (for selected origin in detail panel)
     */
    static async #viewOrigin(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        const currentStep = this.currentStep;
        let selection = null;

        if (this.showLineage) {
            // eslint-disable-next-line no-restricted-syntax -- dialog state: lineageSelection/previewedOrigin are application state fields; ?? selects first non-null
            selection = this.lineageSelection ?? this.previewedOrigin;
        } else {
            // Check confirmed selection first, then previewed
            selection = this.selections.get(currentStep.step) ?? this.previewedOrigin;
        }

        if (selection) {
            // For plain data objects, we need to get the original item from compendium
            const uuid = selection.uuid ?? (selection as NormalizedOriginWithMeta)._sourceUuid;
            // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns Document typed as unknown; narrowed below
            let originItem: unknown = uuid !== undefined && uuid !== null && uuid !== '' ? await fromUuid(uuid) : null;

            // If we can't find the original, create a temporary display item
            if (originItem === null) {
                originItem = {
                    name: selection.name,
                    img: selection.img,
                    system: this._getSelectionSystem(selection),
                    uuid: uuid,
                };
            }

            // Open the detail dialog
            await OriginDetailDialog.show(originItem as WH40KItem, {
                allowSelection: false,
                isSelected: this.selections.get(currentStep.step) !== undefined,
            });
        }
    }

    /**
     * Clear current origin selection
     */
    static #clearOrigin(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
        if (this.showLineage) {
            this.lineageSelection = null;
        } else {
            const currentStep = this.currentStep;

            // In guided mode, also clear subsequent steps
            if (this.guidedMode) {
                const currentIndex = this.orderedSteps.findIndex((s) => s.key === currentStep.key);
                const stepsToReset = this.orderedSteps.slice(currentIndex);
                for (const step of stepsToReset) {
                    this.selections.delete(step.step);
                }
            } else {
                this.selections.delete(currentStep.step);
            }
        }
        void this.render();
    }

    /**
     * Edit a choice - properly invoke OriginPathChoiceDialog
     */
    static async #editChoice(this: OriginPathBuilder, _event: Event, target: HTMLElement): Promise<void> {
        const choiceLabel = target.dataset['choiceLabel'];
        let selection = null;

        if (this.showLineage) {
            // eslint-disable-next-line no-restricted-syntax -- dialog state: lineageSelection/previewedOrigin are application state fields; ?? selects first non-null
            selection = this.lineageSelection ?? this.previewedOrigin;
        } else {
            const currentStep = this.currentStep;
            // Check previewed origin first, then confirmed selection
            // eslint-disable-next-line no-restricted-syntax -- dialog state: previewedOrigin is application state; ?? falls back to confirmed selection
            selection = this.previewedOrigin ?? this.selections.get(currentStep.step);
        }

        if (selection === null || selection === undefined || choiceLabel === undefined || choiceLabel === '') return;

        const system = this._getSelectionSystem(selection);
        const choices: GrantChoiceRaw[] = system.grants?.choices ?? [];
        const choice = choices.find((c) => (c.label ?? c.name) === choiceLabel);
        if (!choice) return;

        // Create a temporary wrapper for the dialog that behaves like an Item
        const itemLike = {
            name: selection.name,
            img: selection.img,
            system: system,
            uuid: selection.uuid ?? (selection as NormalizedOriginWithMeta)._sourceUuid,
        };

        const result = await OriginPathChoiceDialog.show(itemLike as WH40KItem, this.actor);

        if (result !== null) {
            // Always directly mutate the plain data object
            const selSys = selection.system as OriginPathSystemData;
            // eslint-disable-next-line no-restricted-syntax -- dialog state: selSys.selectedChoices is a compendium payload field; ??= initializes when absent
            selSys.selectedChoices ??= {};
            for (const [label, selections] of Object.entries(result)) {
                selSys.selectedChoices[label] = selections;
            }

            void this.render();
        }
    }

    /**
     * Roll a stat using the roll dialog
     */
    static async #rollStat(this: OriginPathBuilder, _event: Event, target: HTMLElement): Promise<void> {
        const statType = target.dataset['statType'];
        let selection = null;

        if (this.showLineage) {
            // eslint-disable-next-line no-restricted-syntax -- dialog state: lineageSelection/previewedOrigin are application state fields; ?? selects first non-null
            selection = this.lineageSelection ?? this.previewedOrigin;
        } else {
            const currentStep = this.currentStep;
            // eslint-disable-next-line no-restricted-syntax -- dialog state: previewedOrigin is application state; ?? falls back to confirmed selection
            selection = this.previewedOrigin ?? this.selections.get(currentStep.step);
        }

        if (selection === null || selection === undefined || statType === undefined || statType === '') return;

        const system = this._getSelectionSystem(selection);
        const grants: NonNullable<OriginPathSystemData['grants']> = system.grants ?? {};
        let formula: string | undefined;
        if (statType === 'wounds') formula = grants.woundsFormula ?? undefined;
        else if (statType === 'fate') formula = grants.fateFormula ?? undefined;
        else if (statType === 'thrones') formula = this._getSelectionThronesFormula(selection);

        if (formula === undefined || formula === '') return;

        // Create a wrapper for the roll dialog
        const itemLike = {
            name: selection.name,
            img: selection.img,
            system: system,
            uuid: selection.uuid ?? (selection as NormalizedOriginWithMeta)._sourceUuid,
        };

        // eslint-disable-next-line no-restricted-syntax -- boundary: OriginRollDialog accepts a structurally narrowed actor view, not the full WH40KBaseActor
        const actorLike = this.actor as unknown as {
            name: string;
            img: string;
            system: { characteristics?: Record<string, { bonus?: number } | undefined> };
        };
        const result = await OriginRollDialog.show(statType, formula, {
            actor: actorLike,
            originItem: itemLike,
        });

        if (result) {
            const rollData = {
                formula: formula,
                rolled: result.total,
                breakdown: result.breakdown,
                timestamp: Date.now(),
            };

            // Always directly mutate the plain data object
            const selSysRoll = selection.system as OriginPathSystemData;
            // eslint-disable-next-line no-restricted-syntax -- dialog state: selSysRoll.rollResults is a compendium payload field; ??= initializes when absent
            selSysRoll.rollResults ??= {};
            selSysRoll.rollResults[statType] = rollData;

            void this.render();
        }
    }

    /**
     * Manually set a stat value (alternative to rolling)
     */
    static async #manualStat(this: OriginPathBuilder, _event: Event, target: HTMLElement): Promise<void> {
        const statType = target.dataset['statType'];
        let selection = null;

        if (this.showLineage) {
            // eslint-disable-next-line no-restricted-syntax -- dialog state: lineageSelection/previewedOrigin are application state fields; ?? selects first non-null
            selection = this.lineageSelection ?? this.previewedOrigin;
        } else {
            const currentStep = this.currentStep;
            // eslint-disable-next-line no-restricted-syntax -- dialog state: previewedOrigin is application state; ?? falls back to confirmed selection
            selection = this.previewedOrigin ?? this.selections.get(currentStep.step);
        }

        if (selection === null || selection === undefined || statType === undefined || statType === '') return;

        const system = this._getSelectionSystem(selection);
        const grants: NonNullable<OriginPathSystemData['grants']> = system.grants ?? {};
        let formula: string | undefined;
        if (statType === 'wounds') formula = grants.woundsFormula ?? undefined;
        else if (statType === 'fate') formula = grants.fateFormula ?? undefined;
        else if (statType === 'thrones') formula = this._getSelectionThronesFormula(selection);

        if (formula === undefined || formula === '') return;

        // Show a simple input dialog
        const result = await foundry.applications.api.DialogV2.prompt({
            window: {
                title: game.i18n.localize(`WH40K.OriginPath.Enter${statType.charAt(0).toUpperCase() + statType.slice(1)}`),
            },
            content: `
                <div class="form-group">
                    <label>${game.i18n.localize('WH40K.OriginPath.ManualValue')}</label>
                    <input type="number" name="value" value="" min="1" autofocus />
                    <p class="notes">${game.i18n.localize('WH40K.OriginPath.FormulaHint')}: ${formula}</p>
                </div>
            `,
            ok: {
                callback: (_cbEvent: Event, button: HTMLButtonElement) => {
                    const input = button.form?.elements.namedItem('value') as HTMLInputElement | null;
                    return parseInt(input?.value ?? '', 10) || null;
                },
            },
            rejectClose: false,
        });

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: DialogV2.prompt resolves with unknown; null check guards the no-input path
        if (result !== null && result !== undefined) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: confirmation-dialog returns unknown until the call sites narrow; here the result is a number
            const rolledValue = result as unknown as number;
            const rollData = {
                formula: formula,
                rolled: rolledValue,
                breakdown: `Manual: ${rolledValue}`,
                timestamp: Date.now(),
            };

            // Always directly mutate the plain data object
            const selSysManual = selection.system as OriginPathSystemData;
            // eslint-disable-next-line no-restricted-syntax -- dialog state: selSysManual.rollResults is a compendium payload field; ??= initializes when absent
            selSysManual.rollResults ??= {};
            selSysManual.rollResults[statType] = rollData;

            void this.render();
        }
    }

    /**
     * Go to lineage selection
     */
    static #goToLineage(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
        this.showLineage = true;
        this.showCharacteristics = false;
        this.showEquipment = false;
        this._clearPreviewedOrigin();
        void this.render();
    }

    /**
     * Skip lineage selection
     */
    static #skipLineage(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
        this.lineageSelection = null;
        this.showLineage = false;
        this.showCharacteristics = true;
        this.showEquipment = false;
        this._clearPreviewedOrigin();
        void this.render();
    }

    /**
     * Navigate to the characteristics step.
     */
    static #goToCharacteristics(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
        this.showLineage = false;
        this.showCharacteristics = true;
        this.showEquipment = false;
        this._clearPreviewedOrigin();
        void this.render();
    }

    /**
     * Navigate to the Equip Acolyte step.
     */
    static #goToEquipment(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
        if (this.guidedMode && !this._hasAssignedCharacteristics()) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.EquipmentNeedsCharacteristics'));
            return;
        }
        this.showLineage = false;
        this.showCharacteristics = false;
        this.showEquipment = true;
        this._clearPreviewedOrigin();
        void this.render();
    }

    /**
     * Toggle selection of an Armoury item for the Equip Acolyte step.
     */
    static #toggleEquipmentItem(this: OriginPathBuilder, _event: Event, target: HTMLElement): void {
        const uuid = target.dataset['uuid'];
        if (uuid === undefined || uuid === '') return;
        this._toggleEquipmentByUuid(uuid);
    }

    /**
     * Core toggle logic for an Equip Acolyte selection, reused by both the row-level
     * data-action handler and the checkbox click listener bound in _onRender.
     */
    _toggleEquipmentByUuid(uuid: string): void {
        if (this.equipmentSelections.has(uuid)) {
            this.equipmentSelections.delete(uuid);
            void this.render();
            return;
        }

        const max = this._getInfluenceBonus();
        if (max <= 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.EquipmentNoInfluence'));
            return;
        }
        if (this.equipmentSelections.size >= max) {
            ui.notifications.warn(game.i18n.format('WH40K.OriginPath.EquipmentLimitReached', { max: String(max) }));
            return;
        }

        const item = this.equipmentItems.find((entry) => entry.uuid === uuid) as EquipmentItemEntry | undefined;
        if (!item) return;
        const selectionEntry: EquipmentEntry = {
            uuid: item.uuid,
            availability: item.availability,
            availabilityLabel: item.availabilityLabel,
            requisition: item.requisition ?? null,
            throneGelt: item.throneGelt ?? null,
            identifier: item.identifier ?? null,
            clipMax: item.clipMax ?? null,
            weaponTypes: Array.isArray(item.weaponTypes) ? [...item.weaponTypes] : [],
        };
        if (item.name !== undefined) selectionEntry.name = item.name;
        if (item.img !== undefined) selectionEntry.img = item.img;
        if (item.type !== undefined) selectionEntry.type = item.type;
        this.equipmentSelections.set(uuid, selectionEntry);
        void this.render();
    }

    /**
     * Clear all Equip Acolyte selections.
     */
    static #clearEquipment(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
        this.equipmentSelections.clear();
        void this.render();
    }

    /**
     * Roll the full characteristic bank using 2d10 per slot.
     */
    static async #rollCharacteristicsBank(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        const rollInstances = Array.from({ length: OriginPathBuilder.GENERATION_CHARACTERISTICS.length }, () => new Roll('2d10'));
        await Promise.all(rollInstances.map(async (roll) => roll.evaluate()));
        const rolls: number[] = rollInstances.map((roll) => roll.total ?? 0);

        this._charRolls = rolls;
        void this.render();
    }

    /**
     * Reset all characteristic assignments.
     */
    static #charReset(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
        const CHARS = OriginPathBuilder.GENERATION_CHARACTERISTICS;
        for (const key of CHARS) {
            this._charAssignments[key] = null;
        }
        void this.render();
    }

    /**
     * Toggle advanced mode for characteristics.
     */
    static #charToggleAdvanced(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
        this._charAdvancedMode = !this._charAdvancedMode;
        void this.render();
    }

    /**
     * Switch the character-generation mode. Only `roll-pool-hb` has a working
     * implementation today; `point-buy` and `roll` are stub placeholders.
     */
    static #setCharGenMode(this: OriginPathBuilder, _event: Event, target: HTMLElement): void {
        const mode = target.dataset['mode'];
        if (mode === 'point-buy' || mode === 'roll' || mode === 'roll-pool-hb') {
            this._charGenMode = mode;
            void this.render();
        }
    }

    /**
     * Roll on the Divination compendium RollTable (DH2 Core Rulebook Table 2-9).
     * The table text lives in the private packs submodule (GW-copyrighted); if
     * the pack isn't installed, fall back to a bare 1d100 so the player at
     * least records a roll result and can fill in the maxim by hand.
     */
    static async #rollDivination(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        const table = await OriginPathBuilder.#getDivinationTable();
        if (table !== null) {
            try {
                const rollTable = table as RollTable;
                const draw = await rollTable.draw({ displayChat: true });
                const [result] = draw.results ?? [];
                const resultText =
                    result !== undefined && typeof (result as Record<string, unknown>)['text'] === 'string'
                        ? ((result as Record<string, unknown>)['text'] as string)
                        : null;
                this._divination = resultText ?? 'This character likes to flip tables, especially rollable ones.';
            } catch (error) {
                console.error('[wh40k-rpg] Failed to draw Divination RollTable.', error);
                this._divination = 'This character likes to flip tables, especially rollable ones.';
            }
        } else {
            this._divination = 'This character likes to flip tables, especially rollable ones.';
        }
        this._saveScrollPosition();
        void this.render();
    }

    /**
     * Resolve the Divination RollTable, preferring a world-local copy (which
     * a GM may have edited) and falling back to the compendium entry.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: RollTable is an untyped Foundry document; caller casts to structural type before use
    static async #getDivinationTable(): Promise<unknown> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: game.tables.getName returns an untyped Foundry document; narrowed by caller
        const worldTable = (game.tables as { getName?: (name: string) => unknown } | undefined)?.getName?.('Divination');
        if (worldTable !== undefined && worldTable !== null) return worldTable;

        const expectedPackId = 'wh40k-rpg.dh2-core-rolltables';
        const pack =
            game.packs.get(expectedPackId) ??
            game.packs.find((candidate) => candidate.metadata.id === expectedPackId || candidate.metadata.name === 'dh2-core-rolltables');

        if (!pack) {
            const availableRollTablePacks = Array.from(game.packs)
                .filter((candidate) => candidate.documentName === 'RollTable')
                .map((candidate) => candidate.metadata.id)
                .sort();
            console.warn('[wh40k-rpg] Divination RollTable pack not found.', {
                expectedPackId,
                availableRollTablePacks,
            });
            return null;
        }

        const index = await pack.getIndex({ fields: ['name'] });
        const entry = index.find((candidate) => candidate.name === 'Divination');
        if (!entry?._id) {
            const availableTableNames = index
                .map((candidate) => candidate.name)
                .filter((name): name is string => typeof name === 'string')
                .sort();
            console.warn('[wh40k-rpg] Divination RollTable entry not found in pack.', {
                packId: pack.metadata.id,
                availableTableNames,
            });
            return null;
        }

        const document = await pack.getDocument(entry._id);
        if (document == null) {
            console.warn('[wh40k-rpg] Divination RollTable document failed to load from pack.', {
                packId: pack.metadata.id,
                tableId: entry._id,
            });
            return null;
        }

        return document;
    }

    /**
     * Manually enter a divination.
     */
    static async #manualDivination(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        const text = await foundry.applications.api.DialogV2.prompt({
            window: { title: 'Enter Divination' },
            content: '<div class="form-group"><label>Divination:</label><input type="text" name="divination" autofocus /></div>',
            ok: {
                callback: (_cbEvent: Event, button: HTMLButtonElement) => {
                    const input = button.form?.elements.namedItem('divination') as HTMLInputElement | null;
                    return input?.value ?? '';
                },
            },
            rejectClose: false,
        });
        if (typeof text === 'string' && text !== '') {
            this._divination = text;
            this._saveScrollPosition();
            void this.render();
        }
    }

    /**
     * Roll starting throne gelt from combined homeworld + background formulas.
     */
    static async #rollThrones(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        const formula = this._getContextualThronesFormula();
        if (formula === '') {
            // eslint-disable-next-line no-restricted-syntax -- i18n: thrones formula warning; key not yet in langpack
            ui.notifications.warn('No thrones formula available yet — select an origin with a throne gelt formula.');
            return;
        }
        const roll = new Roll(formula);
        await roll.evaluate();
        this._thronesRolled = roll.total ?? 0;
        this._saveScrollPosition();
        void this.render();
    }

    static async #manualThrones(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        const val = await foundry.applications.api.DialogV2.prompt({
            window: { title: 'Enter Starting Throne Gelt' },
            content: '<div class="form-group"><label>Thrones:</label><input type="number" name="value" min="0" autofocus /></div>',
            ok: {
                callback: (_cbEvent: Event, button: HTMLButtonElement) => {
                    const input = button.form?.elements.namedItem('value') as HTMLInputElement | null;
                    return parseInt(input?.value ?? '', 10);
                },
            },
            rejectClose: false,
        });
        if (typeof val === 'number' && !Number.isNaN(val)) {
            this._thronesRolled = val;
            this._saveScrollPosition();
            void this.render();
        }
    }

    /**
     * Roll starting influence (1d5 + Fellowship Bonus + homeworld modifier).
     */
    static async #rollInfluence(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        if (this.gameSystem === 'dh2e' && WH40KSettings.isHomebrew()) {
            ui.notifications.info(game.i18n.localize('WH40K.OriginPath.HomebrewInfluenceNoRoll'));
            this._influenceRolled = 0;
            this._saveScrollPosition();
            void this.render();
            return;
        }
        const felBonus = this._actorSys().characteristics?.['fellowship']?.bonus ?? 0;
        const mod = this._getContextualInfluenceMod();
        const roll = new Roll('1d5');
        await roll.evaluate();
        this._influenceRolled = Math.max(0, (roll.total ?? 0) + felBonus + mod);
        this._saveScrollPosition();
        void this.render();
    }

    static async #manualInfluence(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        const val = await foundry.applications.api.DialogV2.prompt({
            window: { title: 'Enter Starting Influence' },
            content: '<div class="form-group"><label>Influence:</label><input type="number" name="value" min="0" autofocus /></div>',
            ok: {
                callback: (_cbEvent: Event, button: HTMLButtonElement) => {
                    const input = button.form?.elements.namedItem('value') as HTMLInputElement | null;
                    return parseInt(input?.value ?? '', 10);
                },
            },
            rejectClose: false,
        });
        if (typeof val === 'number' && !Number.isNaN(val)) {
            this._influenceRolled = val;
            this._saveScrollPosition();
            void this.render();
        }
    }

    /**
     * Open an item sheet (for talents, skills, etc.)
     */
    static async #openItem(this: OriginPathBuilder, _event: Event, target: HTMLElement): Promise<void> {
        const uuid = target.dataset['uuid'];
        if (uuid === undefined || uuid === '') return;

        try {
            const item = (await fromUuid(uuid)) as ResolvedDocument | null;
            if (item?.sheet) {
                item.sheet.render(true);
            }
        } catch {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.ItemNotFound'));
        }
    }

    /**
     * Commit path to character
     */
    // eslint-disable-next-line complexity -- commit flow applies many grant types sequentially; extracting sub-methods would scatter the guard-and-update sequence
    static async #commit(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        const status = this._calculateStatus();

        if (status['canCommit'] !== true) {
            if (status['stepsComplete'] !== true) {
                ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompleteAllSteps'));
            } else if (status['choicesComplete'] !== true) {
                ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompleteAllChoices'));
            }
            return;
        }

        // Confirm — offer reset options. Base stats are always overridden.
        const resetChoices = (await foundry.applications.api.DialogV2.prompt({
            window: { title: game.i18n.localize('WH40K.OriginPath.CommitToCharacter') },
            content: `
                <p>${game.i18n.localize('WH40K.OriginPath.ConfirmCommit')}</p>
                <p class="notes"><em>${game.i18n.localize('WH40K.OriginPath.ResetBaseStatsNote')}</em></p>
                <div class="form-group"><label><input type="checkbox" name="resetInventory" checked /> ${game.i18n.localize(
                    'WH40K.OriginPath.ResetInventory',
                )}</label></div>
                <div class="form-group"><label><input type="checkbox" name="resetExperience" checked /> ${game.i18n.localize(
                    'WH40K.OriginPath.ResetExperience',
                )}</label></div>
                <div class="form-group"><label><input type="checkbox" name="resetInjuries" checked /> ${game.i18n.localize(
                    'WH40K.OriginPath.ResetInjuries',
                )}</label></div>
                <div class="form-group"><label><input type="checkbox" name="resetCurrency" checked /> ${game.i18n.localize(
                    'WH40K.OriginPath.ResetCurrency',
                )}</label></div>
            `,
            ok: {
                label: game.i18n.localize('WH40K.OriginPath.CommitToCharacter'),
                callback: (_cbEvent: Event, button: HTMLButtonElement) => {
                    const form = button.form;
                    const read = (name: string): boolean => (form?.elements.namedItem(name) as HTMLInputElement | null)?.checked ?? false;
                    return {
                        resetInventory: read('resetInventory'),
                        resetExperience: read('resetExperience'),
                        resetInjuries: read('resetInjuries'),
                        resetCurrency: read('resetCurrency'),
                    };
                },
            },
            rejectClose: false,
        })) as { resetInventory: boolean; resetExperience: boolean; resetInjuries: boolean; resetCurrency: boolean } | null;

        if (!resetChoices) return;

        try {
            // Build array of origin items from selections
            const originItems = [];
            for (const [, selection] of this.selections) {
                // Create an item-like object with proper system data
                const maybeDoc = selection as { toObject?: () => Partial<NormalizedOrigin> };
                const itemData: Partial<NormalizedOrigin> = typeof maybeDoc.toObject === 'function' ? maybeDoc.toObject() : foundry.utils.deepClone(selection);
                // Ensure system data is present
                /* eslint-disable @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: Partial<NormalizedOrigin>.system may be absent; ??= is banned by no-restricted-syntax */
                if (itemData.system === undefined || itemData.system === null) itemData.system = selection.system;
                /* eslint-enable @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-condition */
                // selectedChoices and rollResults are already on selection.system
                // from the choice dialogs and roll dialogs
                originItems.push(itemData);
            }

            // Delete existing origin path items before applying new ones.
            // Without this, re-committing would accumulate duplicate origin items
            // and _getOriginPathCharacteristicModifier() would double-count modifiers.
            const existingOriginItems = this.actor.items.filter((i) => i.type === 'originPath');
            if (existingOriginItems.length > 0) {
                const idsToDelete = existingOriginItems.map((i) => i.id).filter((id): id is string => typeof id === 'string');
                await this.actor.deleteEmbeddedDocuments('Item', idsToDelete);
            }

            // Also reverse any items we previously materialized from origin
            // grants (talents stamped with flags.wh40k-rpg.originPathGranted),
            // so re-applying the builder is idempotent and doesn't stack
            // duplicate "Weapon Training (Chain)" + "Weapon Training (Chain)".
            const grantedItems = this.actor.items.filter((i) => {
                const flags = i.flags as { 'wh40k-rpg'?: { originPathGranted?: boolean } } | undefined;
                return flags?.['wh40k-rpg']?.originPathGranted === true;
            });
            if (grantedItems.length > 0) {
                const grantedIds = grantedItems.map((i) => i.id).filter((id): id is string => typeof id === 'string');
                await this.actor.deleteEmbeddedDocuments('Item', grantedIds);
            }

            // Optional resets requested from the commit confirmation dialog
            if (resetChoices.resetInventory) {
                await this._resetInventoryItems();
            }
            if (resetChoices.resetInjuries) {
                await this._resetInjuriesAndEffects();
            }
            if (resetChoices.resetExperience) {
                await this._resetExperienceAndAdvancements();
            }
            if (resetChoices.resetCurrency) {
                await this._resetCurrencyResources();
            }

            // Use GrantsManager to apply all grants in batch
            // This handles characteristics, skills, talents, traits, wounds, fate, etc.
            // reverseExisting ensures old grants are reversed before applying new ones
            const itemLikeRecords = originItems.map((data) => ({
                name: data.name,
                type: 'originPath',
                system: data.system,
                toObject: () => data,
            }));
            // eslint-disable-next-line no-restricted-syntax -- boundary: GrantsManager.applyBatchGrants accepts a structurally-compatible item-like shape, not full WH40KItem instances
            const itemLikes = itemLikeRecords as unknown as WH40KItem[];
            const result = await GrantsManager.applyBatchGrants(itemLikes, this.actor, {
                selections: this._buildGrantSelections(),
                rolledValues: this._buildRolledValues(),
                showNotification: false,
                reverseExisting: true, // Reverse any previously applied grants first
            });

            if (!result.success && result.errors.length > 0) {
                console.warn('Grant application had errors:', result.errors);
            }

            // Create origin path items on actor (for reference/display)
            const cleanOriginItems: ItemDataLike[] = [];
            for (const [, selection] of this.selections) {
                const selWithToObject = selection as { toObject?: () => ItemDataLike };
                const itemData: ItemDataLike = selWithToObject.toObject ? selWithToObject.toObject() : (foundry.utils.deepClone(selection) as ItemDataLike);
                const sourceUuid = itemData.uuid ?? itemData._sourceUuid;
                // Remove internal tracking properties
                delete itemData._sourceUuid;
                delete itemData._actorItemId;
                // Ensure it's marked as an origin path item
                itemData.type = 'originPath';
                if (sourceUuid !== undefined && sourceUuid !== null && sourceUuid !== '') {
                    const flags: { core?: CoreFlags } & Record<string, CoreFlags | undefined> = itemData.flags ?? {};
                    const core: CoreFlags = flags.core ?? {};
                    core.sourceId = sourceUuid;
                    flags.core = core;
                    itemData.flags = flags;
                }
                cleanOriginItems.push(itemData);
            }
            await this.actor.createEmbeddedDocuments('Item', cleanOriginItems as Parameters<typeof this.actor.createEmbeddedDocuments>[1]);

            // Materialize granted talents on the actor so picks like
            // "Weapon Training (Chain)" appear in the Talents tab with the
            // chosen specialization stamped onto the item — instead of the
            // generic "Weapon Training (any)" the source compendium entry
            // carries. Choice-driven grants resolve through activeModifiers
            // (see OriginPathData._calculateActiveModifiers).
            await this._applyTalentGrantsFromOrigins();

            // Apply characteristic rolls if any are assigned
            const CHARS = OriginPathBuilder.GENERATION_CHARACTERISTICS;
            const charRolls = this._charRolls;
            const charAssignments = this._charAssignments;
            const hasCharRolls = charRolls.some((r) => r > 0) && CHARS.some((k) => charAssignments[k] !== null);
            if (hasCharRolls) {
                // Sum origin-path characteristic bonuses across every committed selection, so
                // baked-in bonuses like Imperial World's +5 Fellowship land directly in the
                // base characteristic instead of being re-computed at runtime every render.
                const originModSums = this._collectOriginCharacteristicBonuses();

                // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() accepts an untyped path-keyed payload; Record<string,unknown> is the documented pattern
                const charUpdate: Record<string, unknown> = {
                    'system.characterGeneration.rolls': charRolls,
                    'system.characterGeneration.assignments': charAssignments,
                    'system.characterGeneration.customBases.enabled': this._charAdvancedMode,
                    'system.characterGeneration.mode': this._charGenMode,
                };
                // Reset every base characteristic to (baseline + assigned roll + origin bonuses).
                // Rolls and origin bonuses are ALWAYS applied on origin commit (no override
                // checkbox), so a re-commit must rewrite each characteristic even if the
                // assignment or origin selection moved off of it.
                const settingDefaultBase = WH40KSettings.getCharacteristicBase();
                for (const key of CHARS) {
                    charUpdate[`system.characterGeneration.customBases.${key}`] = this._charCustomBases[key];
                    const baseDefault = this._charAdvancedMode ? this._charCustomBases[key] ?? settingDefaultBase : settingDefaultBase;
                    const rollIndex = charAssignments[key] ?? null;
                    const rolled = rollIndex !== null && (charRolls[rollIndex] ?? 0) > 0 ? charRolls[rollIndex] ?? 0 : 0;
                    const originBonus = originModSums[key] ?? 0;
                    charUpdate[`system.characteristics.${key}.base`] = baseDefault + rolled + originBonus;
                }
                await this.actor.update(charUpdate);
            }

            // Apply divination, thrones, influence, wounds and fate.
            // These are ABSOLUTE writes (not additive) so re-committing the
            // builder doesn't stack +10 wounds / +3 fate on top of values the
            // player already had: each commit re-derives the final from the
            // current selections + rolled values, replacing whatever the
            // previous commit (or a manual edit) had written.
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() accepts an untyped path-keyed payload; Record<string,unknown> is the documented pattern
            const resourceUpdate: Record<string, unknown> = {};
            if (this._divination !== '') resourceUpdate['system.originPath.divination'] = this._divination;
            const thronesTotal = this._getTotalThronesRolled();
            if (thronesTotal > 0) resourceUpdate['system.throneGelt'] = thronesTotal;
            if (this._influenceRolled !== 0) resourceUpdate['system.influence'] = this._influenceRolled;

            // Sum rolled wounds + rolled fate across every committed origin so
            // the totals match what the builder previewed at confirm time.
            let woundsRolled = 0;
            let fateRolled = 0;
            for (const [, selection] of this.selections) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: selection.system shape is OriginPathSystemData | undefined per the open-ended selection map
                const selSys = selection.system as OriginPathSystemData | undefined;
                // eslint-disable-next-line no-restricted-syntax -- boundary: rollResults is a runtime-built per-origin Record we read structurally
                const rollResults = (selSys?.rollResults ?? {}) as Record<string, { rolled?: number } | undefined>;
                const wRolled = rollResults['wounds']?.rolled;
                const fRolled = rollResults['fate']?.rolled;
                if (typeof wRolled === 'number') woundsRolled += wRolled;
                if (typeof fRolled === 'number') fateRolled += fRolled;
            }
            if (woundsRolled > 0) {
                resourceUpdate['system.wounds.max'] = woundsRolled;
                resourceUpdate['system.wounds.value'] = woundsRolled;
            }
            if (fateRolled > 0) {
                resourceUpdate['system.fate.total'] = fateRolled;
                resourceUpdate['system.fate.value'] = fateRolled;
            }
            if (Object.keys(resourceUpdate).length > 0) {
                await this.actor.update(resourceUpdate);
            }

            // Equip Acolyte: create the selected Armoury items on the actor (plus 2 clips for weapons)
            if (this.systemConfig.equipmentStep && this.equipmentSelections.size > 0) {
                await this._applyEquipmentSelections();
            }

            // Snapshot builder-specific state (equipment picks, characteristic rolls) so a later
            // builder open can re-hydrate the UI to what was last committed.
            await this._persistBuilderFlagState();

            // Stage 4 XP spend (DH2e Core p.78): if the actor has unspent
            // starting XP (which _resetExperienceAndAdvancements set to the
            // system's startingXP, e.g. 1000 for DH2e), offer to open the
            // Advancement dialog so the player can spend it now instead of
            // having to discover it later. Skipped when the actor has no
            // available XP — re-commits without a reset land here.
            const xpData = (this.actor.system as { experience?: { total?: number; used?: number } } | undefined)?.experience;
            const availableXP = (xpData?.total ?? 0) - (xpData?.used ?? 0);
            if (availableXP > 0) {
                const openAdvancement = await foundry.applications.api.DialogV2.confirm({
                    window: { title: game.i18n.localize('WH40K.OriginPath.OpenAdvancementTitle') },
                    content: `<p>${game.i18n.format('WH40K.OriginPath.OpenAdvancementPrompt', { xp: String(availableXP) })}</p>`,
                    rejectClose: false,
                });
                if (openAdvancement) {
                    AdvancementDialog.open(this.actor);
                }
            }

            // Success
            ui.notifications.info(game.i18n.localize('WH40K.OriginPath.CommitSuccess'));
            void this.close();
        } catch (err) {
            console.error('Failed to commit origin path:', err);
            ui.notifications.error(game.i18n.localize('WH40K.OriginPath.CommitFailed'));
        }
    }

    /**
     * Build grant selections from choice selections stored on each origin.
     * @returns {object}
     * @private
     */
    _buildGrantSelections(): Record<string, { selected: string[] }> {
        const selections: Record<string, { selected: string[] }> = {};
        for (const [, selection] of this.selections) {
            const selSys = selection.system as OriginPathSystemData;
            const choices = selSys.grants?.choices ?? [];
            const selectedChoices = selSys.selectedChoices ?? {};
            // Deduplicate labels the same way the choice dialog does,
            // so we look up the right key in selectedChoices.
            const labelCounts: Record<string, number> = {};
            for (let i = 0; i < choices.length; i++) {
                const choiceRaw = choices[i];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: choices is an array; index may be out of bounds
                if (choiceRaw === undefined) continue;
                const rawLabel = choiceRaw.label;
                const rawName = choiceRaw.name;
                const baseLabel =
                    typeof rawLabel === 'string' && rawLabel !== '' ? rawLabel : typeof rawName === 'string' && rawName !== '' ? rawName : 'choice';
                labelCounts[baseLabel] = (labelCounts[baseLabel] ?? 0) + 1;
                const suffix = labelCounts[baseLabel] > 1 ? ` (${labelCounts[baseLabel]})` : '';
                const choiceKey = `${baseLabel}${suffix}`;
                const selected = selectedChoices[choiceKey];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: selectedChoices is a Record; key may be absent
                if (selected !== undefined && selected !== null) {
                    const grantId = generateDeterministicId(`choice-${i}-${baseLabel}`);
                    selections[grantId] = {
                        selected: Array.isArray(selected) ? selected : [selected],
                    };
                }
            }
        }
        return selections;
    }

    /**
     * Build rolled values from roll results stored on each origin.
     * @returns {object}
     * @private
     */
    _buildRolledValues(): { wounds?: number; fate?: number } {
        const values: { wounds?: number; fate?: number } = {};
        for (const [, selection] of this.selections) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: selection.system is a compendium payload cast; rollResults is optional and ?? provides the safe default
            const rollResults = (selection.system as OriginPathSystemData).rollResults ?? {};
            const woundsResult = rollResults['wounds'];
            const fateResult = rollResults['fate'];
            if (woundsResult?.rolled !== undefined) {
                values.wounds = (values.wounds ?? 0) + woundsResult.rolled;
            }
            if (fateResult?.rolled !== undefined) {
                values.fate = (values.fate ?? 0) + fateResult.rolled;
            }
        }
        return values;
    }

    /**
     * Sum origin-path characteristic bonuses across every committed origin so the final
     * values can be written directly into `system.characteristics.*.base` at commit time,
     * with no runtime re-computation needed.
     *
     * Sources per origin:
     * - `system.modifiers.characteristics[key]` — base bonuses authored on the origin
     * - `system.activeModifiers[]` with `type === 'characteristic'` — bonuses resolved
     *    from choice selections (e.g. "pick a +5 bonus from three options")
     *
     * @private
     */
    _collectOriginCharacteristicBonuses(): Record<string, number> {
        const sums: Record<string, number> = {};
        const addToSum = (key: string, value: number | string | undefined | null): void => {
            const n = Number(value);
            if (!Number.isFinite(n) || n === 0) return;
            sums[key] = (sums[key] ?? 0) + n;
        };

        const collectFromSelection = (selection: NormalizedOrigin | null): void => {
            if (selection === null) return;
            const system = this._getSelectionSystem(selection);
            const sys = system;
            const charMods = sys.modifiers?.characteristics as Record<string, number | undefined> | undefined;
            if (charMods) {
                for (const [key, value] of Object.entries(charMods)) addToSum(key, value);
            }
            const activeMods = sys.activeModifiers;
            if (Array.isArray(activeMods)) {
                for (const mod of activeMods) {
                    if (mod.type === 'characteristic' && typeof mod.key === 'string') {
                        addToSum(mod.key, mod.value);
                    }
                }
            }
        };

        for (const [, selection] of this.selections) collectFromSelection(selection);
        collectFromSelection(this.lineageSelection);
        return sums;
    }

    /** Item types considered "inventory" — wiped on a Reset Inventory commit. */
    static INVENTORY_ITEM_TYPES = new Set([
        'weapon',
        'armour',
        'armourModification',
        'ammunition',
        'consumable',
        'cybernetic',
        'drug',
        'forceField',
        'gear',
        'tool',
        'backpack',
        'weaponModification',
    ]);

    /** Item types considered "injuries/conditions" — wiped on a Reset Injuries and Effects commit. */
    static INJURY_ITEM_TYPES = new Set(['criticalInjury', 'mentalDisorder', 'malignancy', 'mutation']);

    /**
     * Delete all inventory-category items from the actor. Grants from the origin path
     * re-add anything tracked via grants; Equip Acolyte selections are applied after this.
     * @private
     */
    async _resetInventoryItems(): Promise<void> {
        const inventoryIds = this.actor.items
            .filter((i) => OriginPathBuilder.INVENTORY_ITEM_TYPES.has(i.type as string))
            .map((i) => i.id)
            .filter((id): id is string => typeof id === 'string');
        if (inventoryIds.length > 0) {
            await this.actor.deleteEmbeddedDocuments('Item', inventoryIds);
        }
    }

    /**
     * Delete all ActiveEffects and injury/condition items from the actor.
     * @private
     */
    async _resetInjuriesAndEffects(): Promise<void> {
        const injuryIds = this.actor.items
            .filter((i) => OriginPathBuilder.INJURY_ITEM_TYPES.has(i.type as string))
            .map((i) => i.id)
            .filter((id): id is string => typeof id === 'string');
        if (injuryIds.length > 0) {
            await this.actor.deleteEmbeddedDocuments('Item', injuryIds);
        }
        const effectIds = this.actor.effects.map((e) => e.id).filter((id): id is string => typeof id === 'string');
        if (effectIds.length > 0) {
            await this.actor.deleteEmbeddedDocuments('ActiveEffect', effectIds);
        }
    }

    /**
     * Reset XP to the system's starting value and zero out all characteristic/skill advances.
     * @private
     */
    async _resetExperienceAndAdvancements(): Promise<void> {
        // startingXP lives on the full system config (registryConfig), not the
        // OriginStepConfig slice stored in systemConfig. Reading from
        // systemConfig here always resolved to `undefined`, which silently
        // zeroed the reset.
        const startingXP = this.registryConfig.startingXP;
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() accepts an untyped path-keyed payload; Record<string,unknown> is the documented pattern
        const update: Record<string, unknown> = {
            'system.experience.total': startingXP,
            'system.experience.used': 0,
        };
        const CHARS = OriginPathBuilder.GENERATION_CHARACTERISTICS;
        for (const key of CHARS) {
            update[`system.characteristics.${key}.advance`] = 0;
        }
        const skills = this._actorSys().skills ?? {};
        for (const skillKey of Object.keys(skills)) {
            update[`system.skills.${skillKey}.advance`] = 0;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: skills is a Record; key may be absent at runtime
            const entries = skills[skillKey]?.entries;
            if (Array.isArray(entries)) {
                const resetEntries = entries.map((entry) => ({ ...entry, advance: 0 }));
                update[`system.skills.${skillKey}.entries`] = resetEntries;
            }
        }
        await this.actor.update(update);
    }

    /**
     * Reset the character's influence, requisition, and throne gelt totals to zero.
     * The commit path then applies any values rolled on origins after this reset.
     * @private
     */
    async _resetCurrencyResources(): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() accepts an untyped path-keyed payload; Record<string,unknown> is the documented pattern
        const currencyUpdate: Record<string, unknown> = {
            'system.influence': 0,
            'system.requisition': 0,
            'system.throneGelt': 0,
        };
        await this.actor.update(currencyUpdate);
    }

    /**
     * Create embedded items on the actor for the Equip Acolyte selections.
     * Per DH2e core pg 80, each acquired weapon comes with two clips of standard ammunition.
     * @private
     */
    async _applyEquipmentSelections(): Promise<void> {
        const availableWeapons = this._getAvailableWeaponsForAmmo();
        const creations: ItemDataLike[] = [];
        for (const entry of this.equipmentSelections.values()) {
            const equipEntry = entry;
            const uuid = equipEntry.uuid;
            // eslint-disable-next-line no-await-in-loop -- sequential: each item needs its own compendium lookup and clone
            const source = await fromUuid(uuid);
            if (!source) continue;
            const sourceDoc = source as { toObject?: () => ItemDataLike };
            const itemData: ItemDataLike = sourceDoc.toObject ? sourceDoc.toObject() : (foundry.utils.deepClone(source) as ItemDataLike);
            delete itemData._id;
            const flags: { core?: CoreFlags } & Record<string, CoreFlags | undefined> = itemData.flags ?? {};
            const core: CoreFlags = flags.core ?? {};
            core.sourceId = uuid;
            flags.core = core;
            itemData.flags = flags;

            if (equipEntry.type === 'ammunition') {
                // Size user-picked ammo to one clip of the primary ranged weapon that supports it.
                // Prefer origin-granted weapons over weapons the player also picked.
                const types = Array.isArray(equipEntry.weaponTypes) ? equipEntry.weaponTypes : [];
                const compatible =
                    availableWeapons.find((w) => types.includes(w.identifier) && w.source === 'granted') ??
                    availableWeapons.find((w) => types.includes(w.identifier));
                if (compatible && compatible.clipMax > 0) {
                    /* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- noUncheckedIndexedAccess: ??= is banned by no-restricted-syntax; explicit undefined check used instead */
                    if (itemData.system === undefined) itemData.system = {};
                    itemData.system.quantity = compatible.clipMax;
                }
            }

            creations.push(itemData);

            if (equipEntry.type === 'weapon') {
                // eslint-disable-next-line no-await-in-loop -- sequential: ammo lookup depends on the same weapon's identifier
                const ammoData = await this._resolveStandardAmmoItem(source as WH40KItem);
                if (ammoData) {
                    const cloneA = foundry.utils.deepClone(ammoData);
                    const cloneB = foundry.utils.deepClone(ammoData);
                    delete cloneA._id;
                    delete cloneB._id;
                    creations.push(cloneA, cloneB);
                }
            }
        }

        if (creations.length > 0) {
            await this.actor.createEmbeddedDocuments('Item', creations as Parameters<typeof this.actor.createEmbeddedDocuments>[1]);
        }
    }

    /**
     * Walk every committed origin's fixed talent grants AND its resolved
     * choice-driven activeModifiers, fetch the source talent compendium item
     * by UUID, stamp the player's chosen specialization onto the clone, and
     * create it on the actor. Duplicates (same name + same specialization,
     * case-insensitive) are skipped so a re-commit doesn't pile up identical
     * talents.
     * @private
     */
    async _applyTalentGrantsFromOrigins(): Promise<void> {
        interface TalentPlan {
            uuid: string;
            specialization?: string;
        }
        const plans: TalentPlan[] = [];

        const pushPlan = (uuid: string | null | undefined, specialization: string | undefined): void => {
            if (typeof uuid !== 'string' || uuid === '') return;
            const cleanSpec = specialization === '' ? undefined : specialization;
            plans.push(cleanSpec === undefined ? { uuid } : { uuid, specialization: cleanSpec });
        };

        for (const [, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            // Fixed talents written into grants.talents
            const fixedTalents = system.grants?.talents ?? [];
            for (const t of fixedTalents) {
                pushPlan(t.uuid, t.specialization);
            }
            // Choice-resolved talents in activeModifiers (type === 'talent')
            const activeMods = system.activeModifiers;
            if (Array.isArray(activeMods)) {
                for (const mod of activeMods) {
                    if (mod.type !== 'talent') continue;
                    pushPlan(
                        typeof mod['itemUuid'] === 'string' ? mod['itemUuid'] : null,
                        typeof mod['specialization'] === 'string' ? mod['specialization'] : undefined,
                    );
                }
            }
        }

        if (plans.length === 0) return;

        const toCreate: ItemDataLike[] = [];
        const seenKeys = new Set<string>();

        const normSpec = (s: string | undefined): string => (s ?? '').toLowerCase().trim();
        const actorHasTalent = (name: string, specialization: string | undefined): boolean =>
            this.actor.items.some((i) => {
                if (i.type !== 'talent' || i.name !== name) return false;
                const actorSpec = normSpec((i.system as { specialization?: string } | undefined)?.specialization);
                return actorSpec === normSpec(specialization);
            });

        for (const plan of plans) {
            // eslint-disable-next-line no-await-in-loop -- sequential: each UUID resolves to a distinct source item before we can stamp specialization and dedupe
            const source = await fromUuid(plan.uuid);
            if (!source) continue;
            const sourceDoc = source as { name?: string; type?: string; toObject?: () => ItemDataLike };
            if (sourceDoc.type !== 'talent') continue;
            const itemData: ItemDataLike = sourceDoc.toObject ? sourceDoc.toObject() : (foundry.utils.deepClone(source) as ItemDataLike);
            delete itemData._id;
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- `.system ?? {}` is banned by the repo's no-restricted-syntax rule for DataModel-backed fields
            const itemSystem: ItemSystemLike & { specialization?: string } = itemData.system === undefined ? {} : itemData.system;
            itemData.system = itemSystem;
            if (plan.specialization !== undefined && plan.specialization !== '') {
                itemSystem.specialization = plan.specialization;
            }
            const name = typeof itemData.name === 'string' ? itemData.name : sourceDoc.name ?? '';
            const dedupKey = `${name}::${normSpec(plan.specialization)}`;
            if (seenKeys.has(dedupKey)) continue;
            seenKeys.add(dedupKey);
            if (actorHasTalent(name, plan.specialization)) continue;

            const itemFlags: { 'core'?: CoreFlags; 'wh40k-rpg'?: { originPathGranted?: boolean } } & ItemDataLike['flags'] = itemData.flags ?? {};
            itemFlags.core = itemFlags.core ?? {};
            itemFlags.core.sourceId = plan.uuid;
            itemFlags['wh40k-rpg'] = itemFlags['wh40k-rpg'] ?? {};
            itemFlags['wh40k-rpg'].originPathGranted = true;
            itemData.flags = itemFlags;

            toCreate.push(itemData);
        }

        if (toCreate.length > 0) {
            await this.actor.createEmbeddedDocuments('Item', toCreate as Parameters<typeof this.actor.createEmbeddedDocuments>[1]);
        }
    }

    /**
     * Resolve a standard ammunition item for a given weapon, matching by weaponTypes.
     * @private
     */
    async _resolveStandardAmmoItem(weapon: WH40KItem): Promise<ItemDataLike | null> {
        const packNames = this.systemConfig.equipmentPacks ?? [];
        const weaponIdentifier = (weapon.system as OriginPathSystemData).identifier;
        if (weaponIdentifier === undefined || weaponIdentifier === '') return null;

        for (const packName of packNames) {
            if (!packName.includes('ammo')) continue;
            const pack =
                game.packs.get(`wh40k-rpg.${packName}`) ?? game.packs.find((p) => p.metadata.name === packName || p.metadata.id === `wh40k-rpg.${packName}`);
            if (!pack) continue;

            // eslint-disable-next-line no-await-in-loop -- sequential: search packs in priority order, stop at first match
            const index = await pack.getIndex({ fields: ['system.weaponTypes', 'system.identifier', 'name', 'type'] });
            const match = index.find((rawEntry) => {
                const entry = rawEntry as { type?: string; system?: OriginPathSystemData };
                if (entry.type !== 'ammunition') return false;
                const types = entry.system?.weaponTypes ?? [];
                return Array.isArray(types) && types.includes(weaponIdentifier);
            });
            if (!match) continue;
            // eslint-disable-next-line no-await-in-loop -- sequential: doc lookup only runs once after a match is found
            const doc = await pack.getDocument(match._id);
            if (!doc) continue;
            const docWithToObject = doc as { toObject?: () => ItemDataLike };
            const data: ItemDataLike = docWithToObject.toObject ? docWithToObject.toObject() : (foundry.utils.deepClone(doc) as ItemDataLike);
            const flags: { core?: CoreFlags } & Record<string, CoreFlags | undefined> = data.flags ?? {};
            const core: CoreFlags = flags.core ?? {};
            core.sourceId = `Compendium.${pack.metadata.id}.${match._id}`;
            flags.core = core;
            data.flags = flags;
            return data;
        }
        return null;
    }
}
