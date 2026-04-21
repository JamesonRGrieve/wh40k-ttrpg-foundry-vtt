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

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import WH40K from '../../config.ts';
import { GrantsManager, generateDeterministicId } from '../../managers/grants-manager.ts';
import { OriginChartLayout } from '../../utils/origin-chart-layout.ts';
import { getCharacteristicDisplayInfo, getTrainingLabel, getChoiceTypeLabel } from '../../utils/origin-ui-labels.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import { normalizeOrigin, type NormalizedOrigin } from './normalized-origin.ts';
import OriginDetailDialog from './origin-detail-dialog.ts';
import OriginPathChoiceDialog from './origin-path-choice-dialog.ts';
import OriginRollDialog from './origin-roll-dialog.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Direction modes for origin path creation
 */
const DIRECTION = {
    FORWARD: 'forward', // Start at Home World, end at Career
    BACKWARD: 'backward', // Start at Career, end at Home World
};

export default class OriginPathBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
    declare render: (force?: boolean, options?: Record<string, unknown>) => unknown;
    declare close: () => Promise<void>;
    declare actor: WH40KBaseActor;
    declare gameSystem: string;
    declare registryConfig: Record<string, unknown>;
    declare systemConfig: Record<string, unknown>;
    declare currentStepIndex: number;
    declare guidedMode: boolean;
    declare direction: string;
    declare showLineage: boolean;
    declare showCharacteristics: boolean;
    declare showEquipment: boolean;
    declare selections: Map<string, NormalizedOrigin>;
    declare previewedOrigin: NormalizedOrigin | null;
    declare lineageSelection: NormalizedOrigin | null;
    declare allOrigins: NormalizedOrigin[];
    declare lineageOrigins: NormalizedOrigin[];
    declare equipmentItems: Array<Record<string, unknown>>;
    declare equipmentSelections: Map<string, Record<string, unknown>>;
    declare _equipmentLoaded: boolean;
    declare _equipmentFilter: { search: string; type: string };
    declare _charRolls: number[];
    declare _charAssignments: Record<string, number | null>;
    declare _charCustomBases: Record<string, number>;
    declare _charAdvancedMode: boolean;
    declare _charDragData: { type: string; index: number; characteristic: string | null } | null;
    declare _divination: string;
    declare _thronesRolled: number;
    declare _influenceRolled: number;
    declare _savedScrollTop: number;
    declare _originsLoaded: boolean;
    declare element: HTMLElement;

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
            rollDivination: OriginPathBuilder.#rollDivination,
            manualDivination: OriginPathBuilder.#manualDivination,
            rollThrones: OriginPathBuilder.#rollThrones,
            manualThrones: OriginPathBuilder.#manualThrones,
            rollInfluence: OriginPathBuilder.#rollInfluence,
            manualInfluence: OriginPathBuilder.#manualInfluence,
            commit: OriginPathBuilder.#commit,
            openItem: OriginPathBuilder.#openItem,
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
    constructor(actor: WH40KBaseActor, options: Record<string, unknown> = {}) {
        super(options);
        this.actor = actor;
        this.gameSystem = (options.gameSystem as string) || 'rt';
        // System config from registry — used for labels, ranks, and step config
        this.registryConfig = SystemConfigRegistry.get(this.gameSystem);
        this.systemConfig = this.registryConfig.getOriginStepConfig() as Record<string, unknown>;
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
        this._charRolls = Array(9).fill(0);
        this._charAssignments = {};
        this._charCustomBases = {};
        this._charAdvancedMode = false;
        this._charDragData = null;
        this._divination = (this.actor.system as any)?.originPath?.divination || '';
        const isDH2Homebrew = this.gameSystem === 'dh2e' && WH40KSettings.isHomebrew();
        this._thronesRolled = isDH2Homebrew ? 0 : (this.actor.system as any)?.throneGelt || 0;
        this._influenceRolled = isDH2Homebrew ? 0 : (this.actor.system as any)?.influence || 0;
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

    _initCharacteristicState(): void {
        const actorSystem = (this.actor?.system ?? {}) as Record<string, unknown>;
        const genData = (actorSystem.characterGeneration ?? {}) as Record<string, unknown>;
        const ctor = this.constructor as typeof OriginPathBuilder;
        const CHARS = ctor.GENERATION_CHARACTERISTICS;

        this._charRolls = Array.isArray(genData.rolls) && genData.rolls.length === 9 ? [...(genData.rolls as number[])] : Array(9).fill(0);
        this._charAssignments = {};
        this._charCustomBases = {};

        const assignments = (genData.assignments ?? {}) as Record<string, number>;
        const customBases = (genData.customBases ?? {}) as Record<string, number>;

        for (const key of CHARS) {
            this._charAssignments[key] = assignments[key] ?? null;
            this._charCustomBases[key] = customBases[key] ?? 25;
        }
        this._charAdvancedMode = (customBases.enabled as boolean) ?? false;
    }
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    get title() {
        return game.i18n.format('WH40K.OriginPath.BuilderTitle', { name: this.actor.name });
    }

    /**
     * Get the current ordered steps based on direction
     * @type {Array}
     */
    get orderedSteps() {
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
    get currentStep() {
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
            return this.systemConfig.optionalStep;
        }
        return this.orderedSteps[this.currentStepIndex];
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
    static show(actor: WH40KBaseActor, options: Record<string, unknown> = {}): OriginPathBuilder {
        const builder = new OriginPathBuilder(actor, options);
        builder.render(true);
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
            const step = item.system?.step;
            // Store as plain data objects with metadata for tracking
            const originData = this._itemToSelectionData(item);
            if (optionalStepKey && step === optionalStepKey) {
                this.lineageSelection = originData;
            } else if (step) {
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
            if (!this.selections.has(steps[i].step)) {
                this.currentStepIndex = i;
                break;
            }
        }
    }

    /**
     * Flag scope + key for serialized builder state (equipment picks, char gen inputs).
     */
    static FLAG_SCOPE = 'wh40k-rpg';
    static BUILDER_STATE_FLAG = 'originPathBuilderState';

    /**
     * Restore in-memory builder state from actor flags so equipment picks and
     * characteristic rolls survive across builder re-opens.
     * @private
     */
    _restoreBuilderFlagState(): void {
        const state = this.actor.getFlag(OriginPathBuilder.FLAG_SCOPE, OriginPathBuilder.BUILDER_STATE_FLAG) as Record<string, unknown> | undefined;
        if (!state) return;

        const equipment = (state.equipmentSelections as Record<string, unknown>) || {};
        for (const [uuid, entry] of Object.entries(equipment)) {
            this.equipmentSelections.set(uuid, entry as any);
        }

        if (state.charRolls && Array.isArray(state.charRolls)) this._charRolls = state.charRolls as number[];
        if (state.charAssignments) this._charAssignments = { ...(state.charAssignments as Record<string, number | null>) };
        if (state.charAdvancedMode !== undefined) this._charAdvancedMode = !!state.charAdvancedMode;
        if (state.charCustomBases) this._charCustomBases = { ...(state.charCustomBases as Record<string, number>) };
        if (typeof state.divination === 'string') this._divination = state.divination;
        if (typeof state.influenceRolled === 'number') this._influenceRolled = state.influenceRolled;
    }

    /**
     * Persist builder state (equipment picks, characteristic rolls) to actor flags
     * so a later builder open can re-hydrate these inputs.
     * @private
     */
    async _persistBuilderFlagState(): Promise<void> {
        const equipmentSelections: Record<string, unknown> = {};
        for (const [uuid, entry] of this.equipmentSelections) {
            equipmentSelections[uuid] = entry;
        }
        const payload = {
            equipmentSelections,
            charRolls: this._charRolls,
            charAssignments: this._charAssignments,
            charAdvancedMode: this._charAdvancedMode,
            charCustomBases: this._charCustomBases,
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
    _getLastConfirmedSelection(stepIndex: number): unknown {
        const orderedSteps = this.orderedSteps;

        for (let i = stepIndex - 1; i >= 0; i--) {
            const step = orderedSteps[i];
            if (this.selections.has(step.step)) {
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

            selection.system.pathPositions = OriginChartLayout.resolvePathPositions(selection, lastSelection);
            lastSelection = selection;
        }
    }

    /**
     * Convert an Item or compendium entry to a selection data object
     * @param {Item} item - The item to convert
     * @returns {object} - Plain data object for selection storage
     * @private
     */
    _itemToSelectionData(item: WH40KItem): NormalizedOrigin {
        const data = item.toObject ? item.toObject() : foundry.utils.deepClone(item);
        // Store original uuid for reference to compendium item
        data._sourceUuid = item.parent === this.actor ? item.flags?.core?.sourceId || data._sourceUuid || item.uuid : item.uuid || data._sourceUuid;
        // Store actor item id if this is an existing actor item
        (data as any)._actorItemId = item.parent === this.actor ? item.id : null;

        const normalized = normalizeOrigin(data);
        // Ensure choice and roll fields are available for builder state
        if (!normalized.system.selectedChoices) normalized.system.selectedChoices = {};
        if (!normalized.system.rollResults) normalized.system.rollResults = {};
        return normalized;
    }

    /**
     * Get system data from a selection (handles both Item and plain object)
     * @param {Item|object} selection - The selection (Item or data object)
     * @returns {object} - The system data
     * @private
     */
    _getSelectionSystem(selection: NormalizedOrigin): Record<string, unknown> {
        const selectionSystem = foundry.utils.deepClone(selection.system || {});
        const sourceOrigin = this._getSourceOriginForSelection(selection);
        const sourceSystem = foundry.utils.deepClone((sourceOrigin as NormalizedOrigin)?.system || {});
        return foundry.utils.mergeObject(sourceSystem, selectionSystem, { inplace: false, overwrite: true, insertKeys: true, recursive: true });
    }

    /**
     * Resolve a compendium/source origin for a persisted selection.
     * @private
     */
    _getSourceOriginForSelection(selection: NormalizedOrigin): NormalizedOrigin | null {
        const pool = [...this.allOrigins, ...this.lineageOrigins];
        if (!pool.length || !selection) return null;

        const identifier = selection.system.identifier;
        const step = selection.system.step;
        const name = selection.name;
        const uuid = (selection as any)._sourceUuid || selection.uuid;

        return (
            pool.find((origin) => uuid && (origin.uuid === uuid || origin.id === uuid)) ||
            pool.find((origin) => identifier && step && origin.system.identifier === identifier && origin.system.step === step) ||
            pool.find((origin) => identifier && origin.system.identifier === identifier) ||
            pool.find((origin) => step && name && origin.system.step === step && origin.name === name) ||
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
        const packNames = this.systemConfig.packs as string[];
        const optionalStepIndex = (this.systemConfig.optionalStep as any)?.stepIndex;
        const allOriginPaths: NormalizedOrigin[] = [];

        for (const packName of packNames) {
            // Try fully qualified ID first, then metadata.name fallback
            const pack =
                game.packs.get(`wh40k-rpg.${packName}`) ??
                game.packs.find((p: any) => p.metadata.name === packName || p.metadata.id === `wh40k-rpg.${packName}`);
            if (!pack) {
                console.warn(`Origin path compendium '${packName}' not found`);
                continue;
            }
            const documents = await (pack as any).getDocuments();
            // Filter and normalize
            allOriginPaths.push(...documents.filter((d: any) => d.type === 'originPath').map(normalizeOrigin));
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
    async _prepareContext(options: Record<string, unknown>): Promise<unknown> {
        await this._loadOrigins();

        const currentStep = this.currentStep;
        // Get origins for current step
        let currentOrigins = [];
        let selectedItem = null;

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
            selectedItem = this.previewedOrigin || this.lineageSelection;
        } else {
            // Use chart layout for core steps - pass direction and step keys for system support
            const stepKeys = this.systemConfig.coreSteps.map((s) => s.key || s.step);
            const chartLayout = OriginChartLayout.computeFullChart(this.allOrigins, this.selections, this.guidedMode, this.direction, stepKeys);

            // Find the step layout matching current step
            const stepIndex = this.systemConfig.coreSteps.findIndex((s) => s.key === currentStep.key);
            const stepLayout = chartLayout.steps[stepIndex];
            currentOrigins = this._prepareOriginsForStep(stepLayout);
            // Use previewed origin if available, otherwise use confirmed selection
            selectedItem = this.previewedOrigin || this.selections.get(currentStep.step);
        }

        const selectedOrigin = selectedItem ? await this._prepareSelectedOrigin(selectedItem) : null;

        // System-aware values for template
        const journeyTitleKey = `WH40K.OriginPath.JourneyTitle.${this.gameSystem}`;
        const journeyTitle = game.i18n.localize(journeyTitleKey);
        const hasOptionalStep = !!this.systemConfig.optionalStep;
        const optionalStepLabel = hasOptionalStep ? this._getLocalizedStepLabel(this.systemConfig.optionalStep.key) : '';
        const optionalStepIcon = this.systemConfig.optionalStep?.icon ?? 'fa-crown';

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
            optionalStepDesc: hasOptionalStep ? this._getLocalizedStepDescription(this.systemConfig.optionalStep.descKey) : '',
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
    _prepareCharGenContext(): Record<string, unknown> {
        const ctor = this.constructor as typeof OriginPathBuilder;
        const CHARS = ctor.GENERATION_CHARACTERISTICS;
        const DEFAULT_BASE = 25;
        const originBonuses = this._getOriginCharacteristicBonuses();

        const rollsBank = this._charRolls.map((value, index) => ({
            index,
            displayIndex: index + 1,
            value: value || 0,
            isEmpty: !value || value === 0,
            isAssigned: Object.values(this._charAssignments).includes(index),
        }));

        const characteristics = CHARS.map((key) => {
            const charData = (this.actor.system as any).characteristics?.[key] || {};
            const assignedIndex = this._charAssignments[key] ?? null;
            const rollValue = assignedIndex !== null && this._charRolls[assignedIndex] !== undefined ? this._charRolls[assignedIndex] : null;
            const base = this._charAdvancedMode ? this._charCustomBases[key] ?? DEFAULT_BASE : DEFAULT_BASE;
            const originBonus = originBonuses.totals[key] || 0;
            const total = rollValue !== null ? base + rollValue + originBonus : null;

            return {
                key,
                label: charData.label || key,
                short: charData.short || key.substring(0, 2).toUpperCase(),
                base,
                rollValue,
                originBonus,
                hasOriginBonus: originBonus !== 0,
                hasOriginBonusTooltip: !!(originBonuses.breakdowns[key] || []).length,
                originBonusTooltip: this._formatOriginBonusTooltip(originBonuses.breakdowns[key] || []),
                originBonusTooltipData: this._formatOriginBonusTooltipData(originBonuses.breakdowns[key] || []),
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

        return {
            rollsBank,
            characteristicRows,
            characteristics,
            preview,
            advancedMode: this._charAdvancedMode,
            allAssigned,
            anyRolls,
            canApply: allAssigned && anyRolls,
            divination: this._divination,
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
            const others = sys?.modifiers?.other || [];
            for (const m of others) {
                if (m.name === 'Influence') mod += m.value || 0;
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
        const scrollContainer = this.element?.closest('.application')?.querySelector('.window-content') || this.element?.closest('.window-content');
        this._savedScrollTop = scrollContainer?.scrollTop || 0;
    }

    /**
     * Restore the saved scroll position after re-render.
     * @private
     */
    _restoreScrollPosition(): void {
        if (!this._savedScrollTop) return;
        const scrollContainer = this.element?.closest('.application')?.querySelector('.window-content') || this.element?.closest('.window-content');
        if (scrollContainer) scrollContainer.scrollTop = this._savedScrollTop;
        this._savedScrollTop = 0;
    }

    /**
     * Get the current step selection or preview.
     * @private
     */
    _getCurrentSelection(): unknown {
        if (this.showLineage) {
            return this.previewedOrigin || this.lineageSelection;
        }

        if (this.showCharacteristics) {
            return null;
        }

        const currentStep = this.currentStep;
        return this.previewedOrigin || this.selections.get(currentStep.step) || null;
    }

    /**
     * Collect selections that should contribute to derived preview math.
     * Includes the current preview when it would replace the active step.
     * @private
     */
    _getSelectionsForDerivedCalculations(): NormalizedOrigin[] {
        const entries: NormalizedOrigin[] = [];

        for (const step of this.orderedSteps as any[]) {
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
            if (!value) return;
            totals[key] = (totals[key] || 0) + value;
            if (!breakdowns[key]) breakdowns[key] = [];
            breakdowns[key].push({ source, value });
        };

        const processSelection = (selection: NormalizedOrigin): void => {
            if (!selection) return;

            const system = this._getSelectionSystem(selection);
            const sourceName = selection.name || (system?.identifier as string) || this._getLocalizedStepLabel((system?.system as any)?.step || '');
            const modifiers = (system?.modifiers as any)?.characteristics || {};

            for (const [key, value] of Object.entries(modifiers)) {
                addBonus(key, Number(value) || 0, sourceName);
            }

            const selectedChoices = (system?.selectedChoices as Record<string, string[]>) || {};
            const choices = (selection.grants.choices || []) as any[];
            const labelCounts: Record<string, number> = {};

            for (const choice of choices) {
                const baseLabel = choice.label || choice.name || 'choice';
                labelCounts[baseLabel] = (labelCounts[baseLabel] || 0) + 1;
                const suffix = labelCounts[baseLabel] > 1 ? ` (${labelCounts[baseLabel]})` : '';
                const choiceKey = `${baseLabel}${suffix}`;
                const selectedValues = selectedChoices[choiceKey] || [];

                for (const selectedValue of selectedValues) {
                    const option = choice.options?.find((opt: any) => {
                        const optionValue = opt.value || opt.name;
                        return optionValue === selectedValue || selectedValue?.startsWith?.(`${optionValue} (`);
                    });
                    const choiceModifiers = (option?.grants as any)?.characteristics || {};

                    for (const [key, value] of Object.entries(choiceModifiers)) {
                        addBonus(key, Number(value) || 0, `${sourceName}: ${choiceKey}`);
                    }
                }
            }
        };

        for (const selection of this._getSelectionsForDerivedCalculations() as NormalizedOrigin[]) {
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
        return sys?.homebrew?.throneGelt || sys?.homebrew?.thrones || '';
    }

    /**
     * Sum per-origin throne gelt rolls (homeworld + background, each with its own formula, results ADDED).
     * @private
     */
    _getTotalThronesRolled(): number {
        let total = 0;
        for (const [, selection] of this.selections) {
            const rolled = (selection.system as any)?.rollResults?.thrones?.rolled;
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
            const others = sys?.modifiers?.other || [];
            for (const entry of others) {
                if (entry.name === 'Influence') mod += entry.value || 0;
            }
        }
        return mod;
    }

    /**
     * Whether all characteristic rolls have been assigned.
     * @private
     */
    _hasAssignedCharacteristics(): boolean {
        return OriginPathBuilder.GENERATION_CHARACTERISTICS.every(
            (key) => this._charAssignments[key] !== null && this._charRolls[this._charAssignments[key]] > 0,
        );
    }

    /**
     * Prepare lineage origins (no position restrictions)
     * @returns {Array}
     * @private
     */
    _prepareLineageOrigins(): Record<string, unknown>[] {
        const activeLineageIds = new Set(
            [
                this.previewedOrigin?.id,
                this.previewedOrigin?._id,
                this.previewedOrigin?.uuid,
                this.previewedOrigin?._sourceUuid,
                this.previewedOrigin?.system?.identifier,
                this.lineageSelection?.id,
                this.lineageSelection?._id,
                this.lineageSelection?.uuid,
                this.lineageSelection?._sourceUuid,
                this.lineageSelection?.system?.identifier,
            ].filter(Boolean),
        );
        return this._dedupeOriginsByIdentity(this.lineageOrigins).map((origin) => {
            return {
                id: origin.id,
                uuid: origin.uuid,
                name: origin.name,
                img: origin.img,
                shortDescription: origin.shortDescription,
                fullDescription: this._stripHtml(origin.description || ''),
                isSelected: activeLineageIds.has(origin.id) || activeLineageIds.has(origin.uuid) || activeLineageIds.has(origin.system?.identifier),
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
    async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);
        this._restoreScrollPosition();

        if (this.showEquipment) {
            const html = this.element;
            if (!html) return;
            const search = html.querySelector('.equip-search') as HTMLInputElement | null;
            if (search) {
                search.addEventListener('input', (e) => {
                    this._equipmentFilter.search = (e.currentTarget as HTMLInputElement).value || '';
                    this._saveScrollPosition();
                    this.render();
                });
            }
            const typeSelect = html.querySelector('.equip-type-filter') as HTMLSelectElement | null;
            if (typeSelect) {
                typeSelect.addEventListener('change', (e) => {
                    this._equipmentFilter.type = (e.currentTarget as HTMLSelectElement).value || 'all';
                    this._saveScrollPosition();
                    this.render();
                });
            }
            // Bind row and checkbox clicks directly. The data-action on the row already
            // triggers toggleEquipmentItem for clicks on row body, but clicks on the checkbox
            // input need to be intercepted before the browser's default toggle stomps our state.
            html.querySelectorAll('.equip-row').forEach((row) => {
                const rowEl = row as HTMLElement;
                const uuid = rowEl.dataset.uuid;
                const checkbox = rowEl.querySelector('.equip-check') as HTMLInputElement | null;
                if (!checkbox || !uuid) return;
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
        if (!html) return;

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
                if (!this._charDragData || this._charDragData.type !== 'assigned') return;
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
                const key = el.dataset.characteristic;
                if (!key) return;
                let value = parseInt(el.value);
                if (isNaN(value) || value < 0) value = 0;
                this._charCustomBases[key] = value;
                this.render();
            });
        });

        const divinationInput = html.querySelector('.csd-divination-input');
        if (divinationInput) {
            divinationInput.addEventListener('change', (e) => {
                this._divination = (e.currentTarget as HTMLInputElement).value || '';
            });
            divinationInput.addEventListener('input', (e) => {
                this._divination = (e.currentTarget as HTMLInputElement).value || '';
            });
        }
    }

    _onCharRollChipClick(event: Event): void {
        const chip = event.currentTarget as HTMLElement;
        const index = parseInt(chip.dataset.rollIndex || '');
        if (isNaN(index) || chip.querySelector('.csd-roll-input')) return;

        const currentValue = this._charRolls[index] || '';
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'csd-roll-input';
        input.min = '2';
        input.max = '40';
        input.value = String(currentValue) || '';
        input.placeholder = '2-40';
        input.dataset.rollIndex = String(index);

        input.addEventListener('blur', () => {
            let value = parseInt(input.value);
            if (isNaN(value) || value < 2) value = 0;
            if (value > 40) value = 40;
            this._charRolls[index] = value;
            this.render();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.render();
            }
        });

        const valueEl = chip.querySelector('.csd-roll-value') as HTMLElement;
        if (valueEl) valueEl.style.display = 'none';
        chip.appendChild(input);
        input.focus();
        input.select();
    }

    _onCharDragStart(event: Event): void {
        this._saveScrollPosition();
        const target = event.currentTarget as HTMLElement;
        const rollIndex = parseInt(target.dataset.rollIndex || '');
        const fromChar = target.dataset.characteristic || null;
        if (isNaN(rollIndex) || this._charRolls[rollIndex] === 0) {
            event.preventDefault();
            return;
        }
        this._charDragData = { type: fromChar ? 'assigned' : 'bank', index: rollIndex, characteristic: fromChar };
        target.classList.add('dragging');
        (event as DragEvent).dataTransfer!.effectAllowed = 'move';
        (event as DragEvent).dataTransfer!.setData('text/plain', '');
    }

    _onCharDragEnd(event: Event): void {
        (event.currentTarget as HTMLElement).classList.remove('dragging');
        this.element?.querySelectorAll('.drop-valid, .drop-hover').forEach((el) => el.classList.remove('drop-valid', 'drop-hover'));
        this._charDragData = null;
    }

    _onCharDrop(event: Event): void {
        event.preventDefault();
        if (!this._charDragData) return;
        this._saveScrollPosition();
        const slot = event.currentTarget as HTMLElement;
        const targetChar = slot.dataset.characteristic;
        if (!targetChar) return;
        const draggedIndex = this._charDragData.index;
        const sourceChar = this._charDragData.characteristic;
        const currentTargetIndex = this._charAssignments[targetChar];
        if (sourceChar) {
            this._charAssignments[sourceChar] = currentTargetIndex;
        }
        this._charAssignments[targetChar] = draggedIndex;
        this.render();
    }

    _onCharBankDrop(event: Event): void {
        event.preventDefault();
        if (!this._charDragData || !this._charDragData.characteristic) return;
        this._saveScrollPosition();
        this._charAssignments[this._charDragData.characteristic] = null;
        this.render();
    }

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
        const rolled = this._influenceRolled || 0;
        const stored = Number((this.actor.system as any)?.influence || 0);
        const influence = rolled > 0 ? rolled : stored;
        return Math.floor(influence / 10);
    }

    /**
     * Load Armoury items (Chapter V) for the Equip Acolyte step, filtering to Scarce (-10) or better.
     * @private
     */
    async _loadEquipmentItems(): Promise<void> {
        if (this._equipmentLoaded) return;

        const packNames = (this.systemConfig.equipmentPacks as string[]) || [];
        if (packNames.length === 0) {
            this._equipmentLoaded = true;
            return;
        }

        const availabilityConfig =
            ((CONFIG as any)?.wh40k?.availabilities as Record<string, { label: string; modifier: number }>) || WH40K.availabilities || {};
        const scarceModifier = availabilityConfig.scarce?.modifier ?? 0;
        const loaded: Array<Record<string, unknown>> = [];

        for (const packName of packNames) {
            const pack =
                game.packs.get(`wh40k-rpg.${packName}`) ??
                game.packs.find((p: any) => p.metadata.name === packName || p.metadata.id === `wh40k-rpg.${packName}`);
            if (!pack) continue;

            const index = await (pack as any).getIndex({
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
            for (const entry of index) {
                // Cybernetics enter play via grants, not equipment selection.
                if (entry.type === 'cybernetic') continue;
                const availability = (entry.system as any)?.availability;
                if (!availability) continue;
                const modifier = availabilityConfig[availability]?.modifier ?? null;
                if (modifier === null) continue;
                if (modifier < scarceModifier) continue;
                if (entry.name?.startsWith('! Default')) continue;
                const homebrewCost = (entry.system as any)?.cost?.dh2?.homebrew;
                loaded.push({
                    uuid: `Compendium.${(pack as any).metadata.id}.${entry._id}`,
                    id: entry._id,
                    name: entry.name,
                    img: entry.img,
                    type: entry.type,
                    identifier: (entry.system as any)?.identifier ?? null,
                    clipMax: (entry.system as any)?.clip?.max ?? null,
                    weaponTypes: (entry.system as any)?.weaponTypes ?? [],
                    availability,
                    availabilityLabel: game.i18n.localize(availabilityConfig[availability]?.label || availability),
                    availabilityOrder: modifier,
                    requisition: homebrewCost?.requisition ?? null,
                    throneGelt: homebrewCost?.throneGelt ?? null,
                });
            }
        }

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
            const grants = (system.grants as any) || {};
            for (const entry of (grants.equipment || []) as any[]) {
                const name = entry?.name;
                if (name) grantedNames.add(String(name));
            }
        }
        for (const name of grantedNames) {
            const weapon = weaponCatalog.find((w) => String(w.name) === name);
            if (!weapon || !weapon.identifier || typeof weapon.clipMax !== 'number') continue;
            result.push({
                identifier: String(weapon.identifier),
                clipMax: Number(weapon.clipMax),
                name: String(weapon.name),
                source: 'granted',
            });
        }

        // User-selected weapons from the Equip Acolyte table.
        for (const entry of this.equipmentSelections.values()) {
            if (entry.type !== 'weapon') continue;
            const identifier = (entry as any).identifier;
            const clipMax = (entry as any).clipMax;
            if (!identifier || typeof clipMax !== 'number') continue;
            result.push({
                identifier: String(identifier),
                clipMax: Number(clipMax),
                name: String(entry.name),
                source: 'selected',
            });
        }

        return result;
    }

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
            const types = Array.isArray((entry as any).weaponTypes) ? ((entry as any).weaponTypes as string[]) : [];
            if (!types.some((id) => availableWeaponIdentifiers.has(id))) {
                this.equipmentSelections.delete(uuid);
            }
        }

        const allTypes = new Set<string>();
        for (const item of this.equipmentItems) allTypes.add(String(item.type));

        const filtered = this.equipmentItems.filter((item) => {
            if (typeFilter !== 'all' && item.type !== typeFilter) return false;
            if (search && !String(item.name).toLowerCase().includes(search)) return false;
            // Hide ammunition rows unless at least one compatible weapon is granted or picked.
            if (item.type === 'ammunition') {
                const types = Array.isArray((item as any).weaponTypes) ? ((item as any).weaponTypes as string[]) : [];
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

        const typeOptions: Array<{ value: string; label: string }> = [
            { value: 'all', label: game.i18n.localize('WH40K.OriginPath.EquipmentTypeAll') || 'All' },
        ];
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
        return this.selections.has(prevStep.step);
    }

    /**
     * Get short label for step
     * @param {string} key
     * @returns {string}
     * @private
     */
    _getShortLabel(key: string): string {
        const labels = this.registryConfig?.getStepShortLabels?.() ?? {};
        return labels[key] || key;
    }

    /**
     * Prepare origins for current step
     * @param {object} stepLayout - Layout data from OriginChartLayout
     * @returns {Array}
     * @private
     */
    _prepareOriginsForStep(stepLayout: Record<string, unknown>): Record<string, unknown>[] {
        if (!stepLayout?.cards) return [];

        return this._dedupeOriginsByIdentity(stepLayout.cards.map((card) => card.origin))
            .map((origin) => {
                const card = stepLayout.cards.find((entry) => {
                    const candidate = entry.origin;
                    return candidate?.id === origin.id || candidate?.uuid === origin.uuid || candidate?.system?.identifier === origin.system?.identifier;
                });
                if (!card) return null;

                return {
                    id: origin.id,
                    uuid: origin.uuid,
                    name: origin.name,
                    img: origin.img,
                    shortDescription: origin.shortDescription || '',
                    fullDescription: this._stripHtml(origin.description || ''),
                    isSelected: card.isSelected,
                    isDisabled: card.isDisabled,
                    isValidNext: card.isValidNext && !card.isSelected,
                    hasChoices: origin.hasChoices || card.hasChoices,
                    isAdvanced: card.isAdvanced,
                    xpCost: card.xpCost,
                    badges: card.hasChoices || origin.hasChoices || card.isAdvanced || card.xpCost > 0,
                };
            })
            .filter(Boolean);
    }

    _dedupeOriginsByIdentity(origins: unknown[]): unknown[] {
        const seen = new Set<string>();
        return origins.filter((origin) => {
            const key = [
                origin?.uuid,
                origin?._sourceUuid,
                origin?.id,
                origin?.system?.step && origin?.system?.identifier ? `${origin.system.step}:${origin.system.identifier}` : null,
            ].find(Boolean);
            if (!key) return true;
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
    async _prepareSelectedOrigin(item: NormalizedOrigin): Promise<Record<string, unknown>> {
        const system = this._getSelectionSystem(item);
        const grants = (system.grants as any) || {};
        const modifiers = ((system.modifiers as any)?.characteristics as Record<string, number>) || {};

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
        const selectedChoices = (system.selectedChoices as Record<string, string[]>) || {};
        const choiceLabelCounts: Record<string, number> = {};
        const grantChoices = (grants.choices || []) as any[];

        if (grantChoices.length > 0) {
            for (const choice of grantChoices) {
                const baseLabel = choice.label || choice.name || '';
                choiceLabelCounts[baseLabel] = (choiceLabelCounts[baseLabel] || 0) + 1;
                const suffix = choiceLabelCounts[baseLabel] > 1 ? ` (${choiceLabelCounts[baseLabel]})` : '';
                const choiceKey = `${baseLabel}${suffix}`;
                const selection = selectedChoices[choiceKey];
                const selectedLabels: string[] = [];
                if (selection && Array.isArray(selection)) {
                    for (const sel of selection) {
                        const option = choice.options?.find((o: any) => o.value === sel || o.name === sel);
                        selectedLabels.push(option?.label || option?.name || sel);
                    }
                }
                choices.push({
                    type: choice.type,
                    typeLabel: this._getChoiceTypeLabel(choice.type),
                    label: choiceKey,
                    count: choice.count || 1,
                    options: choice.options || [],
                    isComplete: selection && selection.length >= (choice.count || 1),
                    selection: selectedLabels.length > 0 ? selectedLabels.join(', ') : null,
                });
            }
        }

        const rolls: Record<string, unknown> = {};
        const rollResults = (system.rollResults as Record<string, any>) || {};

        if (grants.woundsFormula) {
            const hasRolled = rollResults.wounds?.rolled !== undefined && rollResults.wounds?.rolled !== null;
            rolls.wounds = {
                formula: grants.woundsFormula,
                hasValue: hasRolled,
                value: rollResults.wounds?.rolled,
                breakdown: rollResults.wounds?.breakdown || '',
            };
        }

        if (grants.fateFormula) {
            const hasRolled = rollResults.fate?.rolled !== undefined && rollResults.fate?.rolled !== null;
            rolls.fate = {
                formula: grants.fateFormula,
                hasValue: hasRolled,
                value: rollResults.fate?.rolled,
                breakdown: rollResults.fate?.breakdown || '',
            };
        }

        // Per-origin throne gelt roll (homebrew only, homeworld and background steps each roll their own formula).
        const thronesFormulaForItem = this._getSelectionThronesFormula(item);
        const thronesEligibleStep = (item.system as any)?.step === 'homeWorld' || (item.system as any)?.step === 'background';
        const thronesAllowedByRuleset = this.gameSystem === 'dh2e' && WH40KSettings.isHomebrew();
        if (thronesFormulaForItem && thronesEligibleStep && thronesAllowedByRuleset) {
            const hasRolled = rollResults.thrones?.rolled !== undefined && rollResults.thrones?.rolled !== null;
            rolls.thrones = {
                formula: thronesFormulaForItem,
                hasValue: hasRolled,
                value: rollResults.thrones?.rolled,
                breakdown: rollResults.thrones?.breakdown || '',
            };
        }

        const skills = [];
        for (const skill of (grants.skills || []) as any[]) {
            const displayName = skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name;
            const uuid = await this._findSkillUuid(skill.name, skill.specialization);
            skills.push({
                name: skill.name,
                specialization: skill.specialization || null,
                displayName: displayName,
                level: skill.level || 'trained',
                levelLabel: this._getTrainingLabel(skill.level),
                uuid,
                tooltipData: await this._prepareGrantTooltipData(displayName, uuid, skill.level ? `Level: ${this._getTrainingLabel(skill.level)}` : ''),
            });
        }

        const talents = await this._prepareTalentsWithTooltips((grants.talents || []) as any[]);
        const traits = await this._prepareTraitsWithTooltips((grants.traits || []) as any[]);

        const currentStep = this.currentStep as any;
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
            description: (system.description as any)?.value || '',
            requirementsText: (system.requirements as any)?.text || '',
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
                equipment: grants.equipment || [],
                hasEquipment: (grants.equipment || []).length > 0,
            },
            resources: {
                showInfluence,
                influenceMod,
                influenceRolled: this._influenceRolled || null,
            },
        };
    }

    /**
     * Prepare talents with tooltip information
     * @param {Array} talents
     * @returns {Promise<Array>}
     * @private
     */
    async _prepareTalentsWithTooltips(talents: unknown[]): Promise<unknown[]> {
        const prepared = [];
        for (const talent of talents) {
            let tooltipText = talent.name;
            let hasItem = false;

            if (talent.uuid) {
                try {
                    const item = await fromUuid(talent.uuid);
                    if (item) {
                        hasItem = true;
                        const desc = item.system?.description?.value;
                        if (desc) {
                            tooltipText = this._stripHtml(desc).substring(0, 200);
                            if (tooltipText.length >= 200) tooltipText += '...';
                        }
                    }
                } catch {
                    // Item not found, use name
                }
            }

            prepared.push({
                name: talent.name,
                specialization: talent.specialization || null,
                uuid: talent.uuid || null,
                tooltip: tooltipText,
                tooltipData: await this._prepareGrantTooltipData(talent.name, talent.uuid || null, tooltipText === talent.name ? '' : tooltipText),
                hasItem: hasItem,
            });
        }
        return prepared;
    }

    /**
     * Prepare traits with tooltip information
     * @param {Array} traits
     * @returns {Promise<Array>}
     * @private
     */
    async _prepareTraitsWithTooltips(traits: unknown[]): Promise<unknown[]> {
        const prepared = [];
        for (const trait of traits) {
            let tooltipText = trait.name;
            let hasItem = false;

            if (trait.uuid) {
                try {
                    const item = await fromUuid(trait.uuid);
                    if (item) {
                        hasItem = true;
                        const desc = item.system?.description?.value;
                        if (desc) {
                            tooltipText = this._stripHtml(desc).substring(0, 200);
                            if (tooltipText.length >= 200) tooltipText += '...';
                        }
                    }
                } catch {
                    // Item not found
                }
            }

            prepared.push({
                name: trait.name,
                level: trait.level || null,
                uuid: trait.uuid || null,
                tooltip: tooltipText,
                tooltipData: await this._prepareGrantTooltipData(
                    trait.level ? `${trait.name} (${trait.level})` : trait.name,
                    trait.uuid || null,
                    tooltipText === trait.name ? '' : tooltipText,
                ),
                hasItem: hasItem,
            });
        }
        return prepared;
    }

    async _prepareGrantTooltipData(title: string, uuid: string | null, fallbackDescription = ''): Promise<string> {
        let description = fallbackDescription;

        if (uuid) {
            try {
                const item = await fromUuid(uuid);
                const itemDescription = item?.system?.description?.value;
                if (itemDescription) description = itemDescription;
            } catch {
                // Fall back to provided text.
            }
        }

        return JSON.stringify({
            title,
            content: description ? `<div class="wh40k-tooltip__description">${description}</div>` : '',
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

    /**
     * Calculate total preview of all selections
     * @returns {object}
     * @private
     */
    async _calculatePreview(): Promise<unknown> {
        const preview = {
            characteristics: [],
            skills: [],
            talents: [],
            traits: [],
            aptitudes: [],
            equipment: [],
            wounds: null,
            fate: null,
        };

        const charTotals = {};
        const skillMap = new Map(); // name -> {name, uuid}
        const talentMap = new Map(); // name -> {name, uuid}
        const traitMap = new Map(); // name -> {name, uuid}
        const aptitudeSet = new Set<string>();
        const equipmentList = [];

        for (const [, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            const grants = system?.grants || {};
            const modifiers = system?.modifiers?.characteristics || {};
            const selectedChoices = system?.selectedChoices || {};

            // Accumulate base characteristics from modifiers
            for (const [key, value] of Object.entries(modifiers)) {
                if (value !== 0) {
                    charTotals[key] = (charTotals[key] || 0) + Number(value);
                }
            }

            // Collect base skills with UUIDs
            if (grants.skills) {
                for (const skill of grants.skills) {
                    const skillName = skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name || skill;
                    if (!skillMap.has(skillName)) {
                        skillMap.set(skillName, {
                            name: skillName,
                            uuid: await this._findSkillUuid(skill.name, skill.specialization),
                        });
                    }
                }
            }

            // Collect base talents with UUIDs
            if (grants.talents) {
                for (const talent of grants.talents) {
                    const baseName = talent.name || talent;
                    const talentName = talent.specialization ? `${baseName} (${talent.specialization})` : baseName;
                    if (!talentMap.has(talentName)) {
                        talentMap.set(talentName, {
                            name: talentName,
                            uuid: talent.uuid || null,
                        });
                    }

                    // Look up talent modifiers from UUID if available
                    if (talent.uuid) {
                        await this._addTalentModifiers(talent.uuid, charTotals, skillMap);
                    }
                }
            }

            // Collect base traits with UUIDs
            if (grants.traits) {
                for (const trait of grants.traits) {
                    const traitName = trait.name || trait;
                    if (!traitMap.has(traitName)) {
                        traitMap.set(traitName, {
                            name: traitName,
                            uuid: trait.uuid || null,
                        });
                    }
                }
            }

            // Collect base equipment
            if (grants.equipment) {
                for (const item of grants.equipment) {
                    equipmentList.push(item.name || item);
                }
            }

            // Collect fixed aptitudes
            if (Array.isArray(grants.aptitudes)) {
                for (const apt of grants.aptitudes) {
                    if (apt) aptitudeSet.add(apt);
                }
            }

            // Process choice grants (deduplicate labels to match dialog keys)
            const previewLabelCounts: Record<string, number> = {};
            if (grants.choices && grants.choices.length > 0) {
                for (const choice of grants.choices) {
                    const base = choice.label || choice.name || '';
                    previewLabelCounts[base] = (previewLabelCounts[base] || 0) + 1;
                    const suffix = previewLabelCounts[base] > 1 ? ` (${previewLabelCounts[base]})` : '';
                    const choiceKey = `${base}${suffix}`;
                    const selectedValues = selectedChoices[choiceKey] || [];
                    for (const selectedValue of selectedValues) {
                        const option = choice.options?.find((o) => o.value === selectedValue);
                        if (!option?.grants) continue;

                        const choiceGrants = option.grants;

                        // Choice characteristic bonuses
                        if (choiceGrants.characteristics) {
                            for (const [key, value] of Object.entries(choiceGrants.characteristics)) {
                                if (value !== 0) {
                                    charTotals[key] = (charTotals[key] || 0) + Number(value);
                                }
                            }
                        }

                        // Choice skills with UUIDs
                        if (choiceGrants.skills) {
                            for (const skill of choiceGrants.skills) {
                                const skillName = skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name || skill;
                                if (!skillMap.has(skillName)) {
                                    skillMap.set(skillName, {
                                        name: skillName,
                                        uuid: await this._findSkillUuid(skill.name, skill.specialization),
                                        fromChoice: true,
                                    });
                                }
                            }
                        }

                        // Choice talents with UUIDs
                        if (choiceGrants.talents) {
                            for (const talent of choiceGrants.talents) {
                                const baseName = talent.name || talent;
                                const talentName = talent.specialization ? `${baseName} (${talent.specialization})` : baseName;
                                if (!talentMap.has(talentName)) {
                                    talentMap.set(talentName, {
                                        name: talentName,
                                        uuid: talent.uuid || null,
                                        fromChoice: true,
                                    });
                                }

                                // Look up talent modifiers from UUID if available
                                if (talent.uuid) {
                                    await this._addTalentModifiers(talent.uuid, charTotals, skillMap);
                                }
                            }
                        }

                        // Choice traits with UUIDs
                        if (choiceGrants.traits) {
                            for (const trait of choiceGrants.traits) {
                                const traitName = trait.name || trait;
                                if (!traitMap.has(traitName)) {
                                    traitMap.set(traitName, {
                                        name: traitName,
                                        uuid: trait.uuid || null,
                                        fromChoice: true,
                                    });
                                }
                            }
                        }

                        // Choice equipment
                        if (choiceGrants.equipment) {
                            for (const item of choiceGrants.equipment) {
                                equipmentList.push(item.name || item);
                            }
                        }
                    }

                    // Aptitude-typed choices: selected values ARE the aptitude names
                    if (choice.type === 'aptitude') {
                        for (const selectedValue of selectedValues) {
                            const option = choice.options?.find((o) => o.value === selectedValue || o.name === selectedValue);
                            const aptName = option?.value || option?.name || selectedValue;
                            if (aptName) aptitudeSet.add(aptName);
                        }
                    }
                }
            }

            // Get wounds/fate from roll results
            const rollResults = system?.rollResults || {};
            if (rollResults.wounds?.rolled !== undefined && rollResults.wounds?.rolled !== null) {
                preview.wounds = (preview.wounds || 0) + rollResults.wounds.rolled;
            }
            if (rollResults.fate?.rolled !== undefined && rollResults.fate?.rolled !== null) {
                preview.fate = (preview.fate || 0) + rollResults.fate.rolled;
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
            Array.from(skillMap.values()).map(async (skill: Record<string, unknown>) => ({
                ...skill,
                tooltipData: await this._prepareGrantTooltipData(skill.name, skill.uuid || null),
            })),
        );
        preview.talents = await Promise.all(
            Array.from(talentMap.values()).map(async (talent: Record<string, unknown>) => ({
                ...talent,
                tooltipData: await this._prepareGrantTooltipData(talent.name, talent.uuid || null),
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
    _findSkillUuid(skillName: string, specialization: string | null = null): string | null {
        try {
            const skillPack = game.packs.find((p) => p.metadata.name === 'dh2-core-stats-skills');
            if (!skillPack) return null;

            const index = skillPack.index;
            const searchName = specialization ? `${skillName} (${specialization})` : skillName;

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
     * Look up a talent by UUID and add its modifiers to the totals
     * @param {string} uuid - Compendium UUID for the talent
     * @param {object} charTotals - Characteristic totals accumulator
     * @param {Map} skillMap - Skill map accumulator (name -> {name, uuid})
     * @returns {Promise<void>}
     * @private
     */
    async _addTalentModifiers(uuid: string, charTotals: Record<string, number>, skillMap: Record<string, unknown>): Promise<void> {
        try {
            const talent = await fromUuid(uuid);
            if (!talent) return;

            const talentSystem = talent.system;

            // Add characteristic modifiers from talent
            const charMods = talentSystem?.modifiers?.characteristics || {};
            for (const [key, value] of Object.entries(charMods)) {
                const numericValue = Number(value) || 0;
                if (numericValue !== 0) {
                    charTotals[key] = (charTotals[key] || 0) + numericValue;
                }
            }

            // Add skill modifiers from talent grants (e.g., nested skills)
            const talentGrants = talentSystem?.grants || {};
            if (talentGrants.skills) {
                for (const skill of talentGrants.skills) {
                    const skillName = skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name || skill;
                    if (!skillMap.has(skillName)) {
                        skillMap.set(skillName, {
                            name: skillName,
                            uuid: await this._findSkillUuid(skill.name, skill.specialization),
                        });
                    }
                }
            }

            // Recursively process nested talents (e.g., Enemy grants from Hunted talent)
            if (talentGrants.talents) {
                for (const nestedTalent of talentGrants.talents) {
                    if (nestedTalent.uuid) {
                        await this._addTalentModifiers(nestedTalent.uuid, charTotals, skillMap);
                    }
                }
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
    _calculateStatus(): Record<string, unknown> {
        const totalSteps = this.systemConfig.coreSteps.length + (this.systemConfig.optionalStep ? 1 : 0) + 1;
        const stepsCount = this.selections.size + (this.lineageSelection ? 1 : 0) + (this._hasAssignedCharacteristics() ? 1 : 0);
        const coreStepsComplete = this.selections.size >= this.systemConfig.coreSteps.length;
        let pendingChoices = 0;
        let pendingRolls = 0;

        for (const [, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            const grants = system?.grants || {};
            const selectedChoices = system?.selectedChoices || {};
            const rollResults = system?.rollResults || {};

            // Count pending choices (deduplicate labels to match dialog keys)
            if (grants.choices?.length > 0) {
                const statusLabelCounts: Record<string, number> = {};
                for (const choice of grants.choices) {
                    const base = choice.label || choice.name || '';
                    statusLabelCounts[base] = (statusLabelCounts[base] || 0) + 1;
                    const suffix = statusLabelCounts[base] > 1 ? ` (${statusLabelCounts[base]})` : '';
                    const choiceKey = `${base}${suffix}`;
                    const sel = selectedChoices[choiceKey];
                    if (!sel || sel.length < (choice.count || 1)) {
                        pendingChoices++;
                    }
                }
            }

            // Count pending rolls
            if (grants.woundsFormula && (rollResults.wounds?.rolled === undefined || rollResults.wounds?.rolled === null)) {
                pendingRolls++;
            }
            if (grants.fateFormula && (rollResults.fate?.rolled === undefined || rollResults.fate?.rolled === null)) {
                pendingRolls++;
            }
        }

        return {
            stepsCount: stepsCount,
            totalSteps: totalSteps,
            stepsComplete: coreStepsComplete,
            choicesComplete: pendingChoices === 0,
            pendingChoices: pendingChoices,
            pendingRolls: pendingRolls,
            canCommit: coreStepsComplete && pendingChoices === 0,
        };
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Randomize all selections
     */
    static async #randomize(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.OriginPath.Randomize'),
            content: game.i18n.localize('WH40K.OriginPath.RandomizeConfirm'),
        });

        if (!confirmed) return;

        // Clear and randomize
        this.selections.clear();

        const coreStepKeys = this.systemConfig.coreSteps.map((s) => s.key || s.step);
        const chartLayout = OriginChartLayout.computeFullChart(this.allOrigins, this.selections, false, 'forward', coreStepKeys);

        const coreSteps = this.systemConfig.coreSteps;
        for (let i = 0; i < coreSteps.length; i++) {
            const stepLayout = chartLayout.steps[i];
            const validOrigins = stepLayout.cards.filter((c) => c.isSelectable);

            if (validOrigins.length > 0) {
                const randomIndex = Math.floor(Math.random() * validOrigins.length);
                const selected = validOrigins[randomIndex];

                // Store as plain data object (not Item instance)
                const originData = this._itemToSelectionData(selected.origin);
                this.selections.set(coreSteps[i].step, originData);
            }
        }

        this._refreshPathPositions();

        this.currentStepIndex = 0;
        this.render();
    }

    /**
     * Reset all selections
     */
    static async #reset(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const confirmed = await Dialog.confirm({
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
            const ids = originPathItems.map((i) => i.id);
            await this.actor.deleteEmbeddedDocuments('Item', ids);
        }

        // Clear UI state
        this.selections.clear();
        this.currentStepIndex = 0;
        this.render();
    }

    /**
     * Export path configuration
     */
    static #export(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
        const data = {
            version: 1,
            selections: {},
        };

        for (const [step, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            data.selections[step] = {
                uuid: selection.uuid || selection._sourceUuid,
                name: selection.name,
                selectedChoices: system?.selectedChoices || {},
                rollResults: system?.rollResults || {},
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
    static #import(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', (e) => {
            void (async () => {
                const file = (e.target as HTMLInputElement).files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const data = JSON.parse(text);

                    if (data.version !== 1) {
                        throw new Error('Unsupported version');
                    }

                    this.selections.clear();

                    for (const [step, selData] of Object.entries(data.selections)) {
                        const origin = await fromUuid((selData as Record<string, any>).uuid);
                        if (origin) {
                            // Store as plain data object (not Item instance)
                            const originData = this._itemToSelectionData(origin as any);
                            originData.system.selectedChoices = (selData as Record<string, any>).selectedChoices;
                            originData.system.rollResults = (selData as Record<string, any>).rollResults;
                            this.selections.set(step, originData);
                        }
                    }

                    this._refreshPathPositions();

                    this.currentStepIndex = 0;
                    this.render();
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
    static #setMode(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
        const value = (target as HTMLInputElement).value || target.closest('[data-action]')?.querySelector('input')?.value;
        this.guidedMode = value === 'guided';
        this.render();
    }

    /**
     * Set direction (forward/backward)
     */
    static async #setDirection(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const value = (target as HTMLInputElement).value || target.dataset.direction;
        if (value === 'forward' || value === 'backward') {
            const oldDirection = this.direction;
            this.direction = value;
            this.showLineage = false;
            this.showCharacteristics = false;
            this._clearPreviewedOrigin();

            // If direction changed and we have selections, warn about reset
            if (oldDirection !== this.direction && this.selections.size > 0) {
                const confirmed = await Dialog.confirm({
                    title: game.i18n.localize('WH40K.OriginPath.DirectionChange'),
                    content: game.i18n.localize('WH40K.OriginPath.DirectionChangeWarning'),
                });

                if (!confirmed) {
                    this.direction = oldDirection;
                    this.render();
                    return;
                }

                // Reset selections when changing direction
                this.selections.clear();
                this.currentStepIndex = 0;
            }

            this.render();
        }
    }

    /**
     * Navigate to a step
     */
    static #goToStep(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
        const stepKey = target.dataset.stepKey;
        const stepIndex = parseInt(target.dataset.stepIndex);
        if (!stepKey && isNaN(stepIndex)) return;

        if (stepKey === 'characteristics') {
            if (this.guidedMode && this.selections.size < this.systemConfig.coreSteps.length) {
                ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompleteAllSteps'));
                return;
            }

            this.showLineage = false;
            this.showCharacteristics = true;
            this.showEquipment = false;
            this._clearPreviewedOrigin();
            this.render();
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
            this.render();
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
            this.render();
            return;
        }

        if (isNaN(stepIndex)) return;

        this.showLineage = false;
        this.showCharacteristics = false;
        this.showEquipment = false;
        this._clearPreviewedOrigin();

        if (this.guidedMode && !this._isStepAccessible(stepIndex)) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompletePreviousStep'));
            return;
        }

        this.currentStepIndex = stepIndex;
        this.render();
    }

    /**
     * Preview origin card (NEW behavior - single click shows in panel, doesn't select)
     * This is the new primary preview method - clicking a card just shows it in the panel
     */
    static #previewOriginCard(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
        const originId = target.dataset.originId;
        const originUuid = target.dataset.originUuid;

        if (!originId && !originUuid) return;

        // Check if disabled
        if (target.classList.contains('disabled')) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.OriginNotAvailable'));
            return;
        }

        // Find the origin (check both main and lineage origins)
        let origin = this.allOrigins.find((o) => o.id === originId);
        if (!origin) {
            origin = this.lineageOrigins.find((o) => o.id === originId);
        }
        if (!origin) return;

        // If this origin is already the confirmed selection for its step, reuse the stored
        // selection data so previously made choices and rolls stay populated when the user
        // re-clicks the card. Otherwise the preview would load fresh compendium data.
        const confirmed = this._findConfirmedSelectionMatching(origin);
        this.previewedOrigin = confirmed ?? this._itemToSelectionData(origin as any);

        // Re-render to show in selection panel
        this.render();
    }

    /**
     * Return the confirmed selection (from this.selections or lineageSelection) that corresponds
     * to the given compendium origin, or null if no confirmed selection matches.
     * @private
     */
    _findConfirmedSelectionMatching(origin: NormalizedOrigin): NormalizedOrigin | null {
        const matches = (candidate: NormalizedOrigin | null): boolean => {
            if (!candidate) return false;
            const candidateUuid = (candidate as any)._sourceUuid || candidate.uuid;
            if (candidateUuid && (candidateUuid === origin.uuid || candidateUuid === origin.id)) return true;
            const candidateIdentifier = (candidate.system as any)?.identifier;
            const originIdentifier = (origin.system as any)?.identifier;
            if (candidateIdentifier && originIdentifier && candidateIdentifier === originIdentifier) {
                const candidateStep = (candidate.system as any)?.step;
                const originStep = (origin.system as any)?.step;
                if (!candidateStep || !originStep || candidateStep === originStep) return true;
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
    static async #confirmSelection(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const currentStep = this.currentStep;

        // Use previewed origin, or fall back to already-confirmed selection for this step
        if (!this.previewedOrigin) {
            const existing = this.selections.get(currentStep.step);
            if (existing) {
                // Already confirmed — nothing to do, just advance
                this.render();
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

                const confirmed = await Dialog.confirm({
                    title: game.i18n.localize('WH40K.OriginPath.ChangeSelection'),
                    content: game.i18n.format('WH40K.OriginPath.ChangeSelectionWarning', { steps: stepNames }),
                });

                if (!confirmed) {
                    return; // User cancelled
                }
            }
        }

        // Now actually select and confirm
        await this._selectOrigin(this.previewedOrigin);

        // Clear preview
        this.previewedOrigin = null;

        // Re-render
        this.render();
    }

    /**
     * View origin card details (eye icon button - preview only)
     * This is now the preview/detail view - does NOT select
     */
    static async #viewOriginCard(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        // Stop propagation so parent card click doesn't fire
        event.stopPropagation();

        const originId = target.dataset.originId;
        const originUuid = target.dataset.originUuid;

        if (!originId && !originUuid) return;

        // Find the origin (check both main and lineage origins)
        let origin = this.allOrigins.find((o) => o.id === originId);
        if (!origin) {
            origin = this.lineageOrigins.find((o) => o.id === originId);
        }
        if (!origin) return;

        // Get current selection to check if already selected
        const currentStep = this.currentStep;
        let isSelected = false;
        if (this.showLineage) {
            isSelected = (this.lineageSelection?.id || this.lineageSelection?._id) === originId;
        } else {
            const sel = this.selections.get(currentStep.step);
            isSelected = (sel?.id || sel?._id) === originId;
        }

        // Show detail dialog for PREVIEW ONLY (no selection)
        await OriginDetailDialog.show(origin as any, {
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
        const originData = origin.toObject ? this._itemToSelectionData(origin as any) : foundry.utils.deepClone(origin);

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

            const lastSelection = this._getLastConfirmedSelection(currentIndex);
            originData.system.pathPositions = OriginChartLayout.resolvePathPositions(originData, lastSelection);

            // Store selection as plain data object
            this.selections.set(currentStep.step, originData);

            // Auto-advance to next step if in guided mode
            if (this.guidedMode && this.currentStepIndex < this.systemConfig.coreSteps.length - 1) {
                this.currentStepIndex++;
            }
        }

        this.render();
    }

    /**
     * View origin sheet (for selected origin in detail panel)
     */
    static async #viewOrigin(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const currentStep = this.currentStep;
        let selection = null;

        if (this.showLineage) {
            selection = this.lineageSelection || this.previewedOrigin;
        } else {
            // Check confirmed selection first, then previewed
            selection = this.selections.get(currentStep.step) || this.previewedOrigin;
        }

        if (selection) {
            // For plain data objects, we need to get the original item from compendium
            const uuid = selection.uuid || selection._sourceUuid;
            let originItem: unknown = uuid ? await fromUuid(uuid) : null;

            // If we can't find the original, create a temporary display item
            if (!originItem) {
                originItem = {
                    name: selection.name,
                    img: selection.img,
                    system: this._getSelectionSystem(selection),
                    uuid: uuid,
                };
            }

            // Open the detail dialog
            await OriginDetailDialog.show(originItem as any, {
                allowSelection: false,
                isSelected: !!this.selections.get(currentStep.step),
            });
        }
    }

    /**
     * Clear current origin selection
     */
    static #clearOrigin(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
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
        this.render();
    }

    /**
     * Edit a choice - properly invoke OriginPathChoiceDialog
     */
    static async #editChoice(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const choiceLabel = target.dataset.choiceLabel;
        let selection = null;

        if (this.showLineage) {
            selection = this.lineageSelection || this.previewedOrigin;
        } else {
            const currentStep = this.currentStep;
            // Check previewed origin first, then confirmed selection
            selection = this.previewedOrigin || this.selections.get(currentStep.step);
        }

        if (!selection || !choiceLabel) return;

        const system = this._getSelectionSystem(selection);
        const choices = system?.grants?.choices || [];
        const choice = choices.find((c) => (c.label || c.name) === choiceLabel);
        if (!choice) return;

        // Create a temporary wrapper for the dialog that behaves like an Item
        const itemLike = {
            name: selection.name,
            img: selection.img,
            system: system,
            uuid: selection.uuid || selection._sourceUuid,
        };

        const result = await OriginPathChoiceDialog.show(itemLike as any, this.actor);

        if (result) {
            // Always directly mutate the plain data object
            if (!selection.system) selection.system = {};
            if (!selection.system.selectedChoices) selection.system.selectedChoices = {};
            for (const [label, selections] of Object.entries(result)) {
                selection.system.selectedChoices[label] = selections;
            }

            this.render();
        }
    }

    /**
     * Roll a stat using the roll dialog
     */
    static async #rollStat(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const statType = target.dataset.statType;
        let selection = null;

        if (this.showLineage) {
            selection = this.lineageSelection || this.previewedOrigin;
        } else {
            const currentStep = this.currentStep;
            selection = this.previewedOrigin || this.selections.get(currentStep.step);
        }

        if (!selection || !statType) return;

        const system = this._getSelectionSystem(selection);
        const grants = system?.grants || {};
        let formula: string | undefined;
        if (statType === 'wounds') formula = grants.woundsFormula;
        else if (statType === 'fate') formula = grants.fateFormula;
        else if (statType === 'thrones') formula = this._getSelectionThronesFormula(selection);

        if (!formula) return;

        // Create a wrapper for the roll dialog
        const itemLike = {
            name: selection.name,
            img: selection.img,
            system: system,
            uuid: selection.uuid || selection._sourceUuid,
        };

        const result = await OriginRollDialog.show(statType, formula, {
            actor: this.actor,
            originItem: itemLike as any,
        });

        if (result) {
            const rollData = {
                formula: formula,
                rolled: result.total,
                breakdown: result.breakdown,
                timestamp: Date.now(),
            };

            // Always directly mutate the plain data object
            if (!selection.system) selection.system = {};
            if (!selection.system.rollResults) selection.system.rollResults = {};
            selection.system.rollResults[statType] = rollData;

            this.render();
        }
    }

    /**
     * Manually set a stat value (alternative to rolling)
     */
    static async #manualStat(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const statType = target.dataset.statType;
        let selection = null;

        if (this.showLineage) {
            selection = this.lineageSelection || this.previewedOrigin;
        } else {
            const currentStep = this.currentStep;
            selection = this.previewedOrigin || this.selections.get(currentStep.step);
        }

        if (!selection || !statType) return;

        const system = this._getSelectionSystem(selection);
        const grants = system?.grants || {};
        let formula: string | undefined;
        if (statType === 'wounds') formula = grants.woundsFormula;
        else if (statType === 'fate') formula = grants.fateFormula;
        else if (statType === 'thrones') formula = this._getSelectionThronesFormula(selection);

        if (!formula) return;

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
                callback: (_event: Event, button: HTMLButtonElement) => {
                    const input = button.form?.elements.namedItem('value') as HTMLInputElement | null;
                    return parseInt(input?.value ?? '') || null;
                },
            },
            rejectClose: false,
        });

        if (result) {
            const rollData = {
                formula: formula,
                rolled: result,
                breakdown: `Manual: ${result}`,
                timestamp: Date.now(),
            };

            // Always directly mutate the plain data object
            if (!selection.system) selection.system = {};
            if (!selection.system.rollResults) selection.system.rollResults = {};
            selection.system.rollResults[statType] = rollData;

            this.render();
        }
    }

    /**
     * Go to lineage selection
     */
    static #goToLineage(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
        this.showLineage = true;
        this.showCharacteristics = false;
        this.showEquipment = false;
        this._clearPreviewedOrigin();
        this.render();
    }

    /**
     * Skip lineage selection
     */
    static #skipLineage(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
        this.lineageSelection = null;
        this.showLineage = false;
        this.showCharacteristics = true;
        this.showEquipment = false;
        this._clearPreviewedOrigin();
        this.render();
    }

    /**
     * Navigate to the characteristics step.
     */
    static #goToCharacteristics(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
        this.showLineage = false;
        this.showCharacteristics = true;
        this.showEquipment = false;
        this._clearPreviewedOrigin();
        this.render();
    }

    /**
     * Navigate to the Equip Acolyte step.
     */
    static async #goToEquipment(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        if (this.guidedMode && !this._hasAssignedCharacteristics()) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.EquipmentNeedsCharacteristics'));
            return;
        }
        this.showLineage = false;
        this.showCharacteristics = false;
        this.showEquipment = true;
        this._clearPreviewedOrigin();
        this.render();
    }

    /**
     * Toggle selection of an Armoury item for the Equip Acolyte step.
     */
    static #toggleEquipmentItem(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
        const uuid = target.dataset.uuid;
        if (!uuid) return;
        this._toggleEquipmentByUuid(uuid);
    }

    /**
     * Core toggle logic for an Equip Acolyte selection, reused by both the row-level
     * data-action handler and the checkbox click listener bound in _onRender.
     */
    _toggleEquipmentByUuid(uuid: string): void {
        if (this.equipmentSelections.has(uuid)) {
            this.equipmentSelections.delete(uuid);
            this.render();
            return;
        }

        const max = this._getInfluenceBonus();
        if (max <= 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.EquipmentNoInfluence'));
            return;
        }
        if (this.equipmentSelections.size >= max) {
            ui.notifications.warn(game.i18n.format('WH40K.OriginPath.EquipmentLimitReached', { max }));
            return;
        }

        const item = this.equipmentItems.find((entry) => entry.uuid === uuid);
        if (!item) return;
        this.equipmentSelections.set(uuid, {
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            type: item.type,
            availability: item.availability,
            availabilityLabel: item.availabilityLabel,
            requisition: (item as any).requisition ?? null,
            throneGelt: (item as any).throneGelt ?? null,
            identifier: (item as any).identifier ?? null,
            clipMax: (item as any).clipMax ?? null,
            weaponTypes: Array.isArray((item as any).weaponTypes) ? [...((item as any).weaponTypes as string[])] : [],
        });
        this.render();
    }

    /**
     * Clear all Equip Acolyte selections.
     */
    static #clearEquipment(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
        this.equipmentSelections.clear();
        this.render();
    }

    /**
     * Roll the full characteristic bank using 2d10 per slot.
     */
    static async #rollCharacteristicsBank(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const rolls: number[] = [];
        for (let i = 0; i < OriginPathBuilder.GENERATION_CHARACTERISTICS.length; i++) {
            const roll = new Roll('2d10');
            await roll.evaluate();
            rolls.push(roll.total);
        }

        this._charRolls = rolls;
        this.render();
    }

    /**
     * Reset all characteristic assignments.
     */
    static #charReset(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
        const CHARS = OriginPathBuilder.GENERATION_CHARACTERISTICS;
        for (const key of CHARS) {
            this._charAssignments[key] = null;
        }
        this.render();
    }

    /**
     * Toggle advanced mode for characteristics.
     */
    static #charToggleAdvanced(this: OriginPathBuilder, event: Event, target: HTMLElement): void {
        this._charAdvancedMode = !this._charAdvancedMode;
        this.render();
    }

    /**
     * Roll on the Divination compendium RollTable (DH2 Core Rulebook Table 2-9).
     * The table text lives in the private packs submodule (GW-copyrighted); if
     * the pack isn't installed, fall back to a bare 1d100 so the player at
     * least records a roll result and can fill in the maxim by hand.
     */
    static async #rollDivination(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const table = await OriginPathBuilder.#getDivinationTable();
        if (table) {
            const draw = await (table as any).draw({ displayChat: true });
            const result = draw?.results?.[0];
            this._divination = (result?.text as string) || '';
        } else {
            const roll = await new Roll('1d100').evaluate();
            ui.notifications?.warn?.(
                'Divination RollTable not installed — recorded the d100 result only. Enter the maxim manually or install the content pack.',
            );
            this._divination = `Roll: ${roll.total}`;
        }
        this._saveScrollPosition?.();
        this.render();
    }

    /**
     * Resolve the Divination RollTable, preferring a world-local copy (which
     * a GM may have edited) and falling back to the compendium entry.
     */
    static async #getDivinationTable(): Promise<unknown | null> {
        const worldTable = (game.tables as any)?.getName?.('Divination');
        if (worldTable) return worldTable;
        const pack = game.packs.get('wh40k-rpg.dh2-core-rolltables');
        if (!pack) return null;
        const docs = await pack.getDocuments();
        return (docs as unknown[]).find((d: any) => d?.name === 'Divination') ?? null;
    }

    /**
     * Manually enter a divination.
     */
    static async #manualDivination(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const text = await Dialog.prompt({
            title: 'Enter Divination',
            content: '<form><div class="form-group"><label>Divination:</label><input type="text" name="divination" autofocus /></div></form>',
            callback: (html) => {
                const form = html[0]?.querySelector?.('form') || html.querySelector?.('form');
                return (form as any)?.querySelector?.('[name="divination"]')?.value || '';
            },
            rejectClose: false,
        });
        if (text) {
            this._divination = text;
            this._saveScrollPosition?.();
            this.render();
        }
    }

    /**
     * Roll starting throne gelt from combined homeworld + background formulas.
     */
    static async #rollThrones(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const formula = this._getContextualThronesFormula();
        if (!formula) {
            ui.notifications.warn('No thrones formula available yet — select an origin with a throne gelt formula.');
            return;
        }
        const roll = new Roll(formula);
        await roll.evaluate();
        this._thronesRolled = roll.total;
        this._saveScrollPosition?.();
        this.render();
    }

    static async #manualThrones(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const val = await Dialog.prompt({
            title: 'Enter Starting Throne Gelt',
            content: '<form><div class="form-group"><label>Thrones:</label><input type="number" name="value" min="0" autofocus /></div></form>',
            callback: (html) => {
                const form = html[0]?.querySelector?.('form') || html.querySelector?.('form');
                return parseInt((form as any)?.querySelector?.('[name="value"]')?.value);
            },
            rejectClose: false,
        });
        if (val != null && !isNaN(val)) {
            this._thronesRolled = val;
            this._saveScrollPosition?.();
            this.render();
        }
    }

    /**
     * Roll starting influence (1d5 + Fellowship Bonus + homeworld modifier).
     */
    static async #rollInfluence(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        if (this.gameSystem === 'dh2e' && WH40KSettings.isHomebrew()) {
            ui.notifications.info(game.i18n.localize('WH40K.OriginPath.HomebrewInfluenceNoRoll'));
            this._influenceRolled = 0;
            this._saveScrollPosition?.();
            this.render();
            return;
        }
        const felBonus = (this.actor.system as any).characteristics?.fellowship?.bonus || 0;
        const mod = this._getContextualInfluenceMod();
        const roll = new Roll('1d5');
        await roll.evaluate();
        this._influenceRolled = Math.max(0, roll.total + felBonus + mod);
        this._saveScrollPosition?.();
        this.render();
    }

    static async #manualInfluence(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const val = await Dialog.prompt({
            title: 'Enter Starting Influence',
            content: '<form><div class="form-group"><label>Influence:</label><input type="number" name="value" min="0" autofocus /></div></form>',
            callback: (html) => {
                const form = html[0]?.querySelector?.('form') || html.querySelector?.('form');
                return parseInt((form as any)?.querySelector?.('[name="value"]')?.value);
            },
            rejectClose: false,
        });
        if (val != null && !isNaN(val)) {
            this._influenceRolled = val;
            this._saveScrollPosition?.();
            this.render();
        }
    }

    /**
     * Open an item sheet (for talents, skills, etc.)
     */
    static async #openItem(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const uuid = target.dataset.uuid;
        if (!uuid) return;

        try {
            const item = await fromUuid(uuid);
            if (item?.sheet) {
                (item.sheet as any).render(true);
            }
        } catch {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.ItemNotFound'));
        }
    }

    /**
     * Commit path to character
     */
    static async #commit(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
        const status = this._calculateStatus() as any;

        if (!status.canCommit) {
            if (!status.stepsComplete) {
                ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompleteAllSteps'));
            } else if (!status.choicesComplete) {
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
                callback: (_event: Event, button: HTMLButtonElement) => {
                    const form = button.form;
                    const read = (name: string) => (form?.elements.namedItem(name) as HTMLInputElement | null)?.checked ?? false;
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
                const itemData = selection.toObject ? selection.toObject() : foundry.utils.deepClone(selection);
                // Ensure system data is present
                if (!itemData.system && selection.system) {
                    itemData.system = selection.system;
                }
                // selectedChoices and rollResults are already on selection.system
                // from the choice dialogs and roll dialogs
                originItems.push(itemData);
            }

            // Delete existing origin path items before applying new ones.
            // Without this, re-committing would accumulate duplicate origin items
            // and _getOriginPathCharacteristicModifier() would double-count modifiers.
            const existingOriginItems = this.actor.items.filter((i) => i.type === 'originPath');
            if (existingOriginItems.length > 0) {
                const idsToDelete = existingOriginItems.map((i) => i.id);
                await this.actor.deleteEmbeddedDocuments('Item', idsToDelete);
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
            const result = await GrantsManager.applyBatchGrants(
                originItems.map((data) => ({
                    name: data.name,
                    type: 'originPath',
                    system: data.system || this._getSelectionSystem(data),
                    toObject: () => data,
                })) as any,
                this.actor,
                {
                    selections: this._buildGrantSelections(),
                    rolledValues: this._buildRolledValues(),
                    showNotification: false,
                    reverseExisting: true, // Reverse any previously applied grants first
                },
            );

            if (!result.success && result.errors.length > 0) {
                console.warn('Grant application had errors:', result.errors);
            }

            // Create origin path items on actor (for reference/display)
            const cleanOriginItems = [];
            for (const [, selection] of this.selections) {
                const itemData = selection.toObject ? selection.toObject() : foundry.utils.deepClone(selection);
                const sourceUuid = itemData.uuid || itemData._sourceUuid;
                // Remove internal tracking properties
                delete itemData._sourceUuid;
                delete itemData._actorItemId;
                // Ensure it's marked as an origin path item
                itemData.type = 'originPath';
                if (sourceUuid) {
                    itemData.flags ??= {};
                    itemData.flags.core ??= {};
                    itemData.flags.core.sourceId = sourceUuid;
                }
                cleanOriginItems.push(itemData);
            }
            await this.actor.createEmbeddedDocuments('Item', cleanOriginItems);

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

                const charUpdate: Record<string, unknown> = {
                    'system.characterGeneration.rolls': charRolls,
                    'system.characterGeneration.assignments': charAssignments,
                    'system.characterGeneration.customBases.enabled': this._charAdvancedMode,
                };
                // Reset every base characteristic to (baseline + assigned roll + origin bonuses).
                // Rolls and origin bonuses are ALWAYS applied on origin commit (no override
                // checkbox), so a re-commit must rewrite each characteristic even if the
                // assignment or origin selection moved off of it.
                for (const key of CHARS) {
                    charUpdate[`system.characterGeneration.customBases.${key}`] = this._charCustomBases[key];
                    const baseDefault = this._charAdvancedMode ? this._charCustomBases[key] ?? 25 : 25;
                    const rollIndex = charAssignments[key];
                    const rolled = rollIndex !== null && charRolls[rollIndex] > 0 ? charRolls[rollIndex] : 0;
                    const originBonus = originModSums[key] || 0;
                    charUpdate[`system.characteristics.${key}.base`] = baseDefault + rolled + originBonus;
                }
                await this.actor.update(charUpdate);
            }

            // Apply divination, thrones, and influence
            const resourceUpdate: Record<string, unknown> = {};
            if (this._divination) resourceUpdate['system.originPath.divination'] = this._divination;
            const thronesTotal = this._getTotalThronesRolled();
            if (thronesTotal > 0) resourceUpdate['system.throneGelt'] = thronesTotal;
            if (this._influenceRolled) resourceUpdate['system.influence'] = this._influenceRolled;
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

            // Success
            ui.notifications.info(game.i18n.localize('WH40K.OriginPath.CommitSuccess'));
            this.close();
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
    _buildGrantSelections(): Record<string, unknown> {
        const selections = {};
        for (const [, selection] of this.selections) {
            const choices = selection.system?.grants?.choices || [];
            const selectedChoices = selection.system?.selectedChoices || {};
            // Deduplicate labels the same way the choice dialog does,
            // so we look up the right key in selectedChoices.
            const labelCounts: Record<string, number> = {};
            for (let i = 0; i < choices.length; i++) {
                const baseLabel = choices[i].label || choices[i].name || 'choice';
                labelCounts[baseLabel] = (labelCounts[baseLabel] || 0) + 1;
                const suffix = labelCounts[baseLabel] > 1 ? ` (${labelCounts[baseLabel]})` : '';
                const choiceKey = `${baseLabel}${suffix}`;
                const selected = selectedChoices[choiceKey];
                if (selected) {
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
    _buildRolledValues(): Record<string, unknown> {
        const values: unknown = {};
        for (const [, selection] of this.selections) {
            const rollResults = selection.system?.rollResults || {};
            if (rollResults.wounds?.rolled != null) {
                values.wounds = (values.wounds || 0) + rollResults.wounds.rolled;
            }
            if (rollResults.fate?.rolled != null) {
                values.fate = (values.fate || 0) + rollResults.fate.rolled;
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
        const addToSum = (key: string, value: unknown) => {
            const n = Number(value);
            if (!Number.isFinite(n) || n === 0) return;
            sums[key] = (sums[key] || 0) + n;
        };

        const collectFromSelection = (selection: NormalizedOrigin | null) => {
            if (!selection) return;
            const system = this._getSelectionSystem(selection);
            const charMods = (system?.modifiers as any)?.characteristics as Record<string, unknown> | undefined;
            if (charMods) {
                for (const [key, value] of Object.entries(charMods)) addToSum(key, value);
            }
            const activeMods = (system as any)?.activeModifiers as Array<Record<string, unknown>> | undefined;
            if (Array.isArray(activeMods)) {
                for (const mod of activeMods) {
                    if (mod?.type === 'characteristic' && typeof mod?.key === 'string') {
                        addToSum(mod.key as string, mod.value);
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
        const inventoryIds = this.actor.items.filter((i) => OriginPathBuilder.INVENTORY_ITEM_TYPES.has(i.type as string)).map((i) => i.id as string);
        if (inventoryIds.length > 0) {
            await this.actor.deleteEmbeddedDocuments('Item', inventoryIds);
        }
    }

    /**
     * Delete all ActiveEffects and injury/condition items from the actor.
     * @private
     */
    async _resetInjuriesAndEffects(): Promise<void> {
        const injuryIds = this.actor.items.filter((i) => OriginPathBuilder.INJURY_ITEM_TYPES.has(i.type as string)).map((i) => i.id as string);
        if (injuryIds.length > 0) {
            await this.actor.deleteEmbeddedDocuments('Item', injuryIds);
        }
        const effectIds = (this.actor as any).effects?.map((e: any) => e.id) ?? [];
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
        const startingXP = (this.registryConfig?.startingXP as number) ?? 0;
        const update: Record<string, unknown> = {
            'system.experience.total': startingXP,
            'system.experience.used': 0,
        };
        const CHARS = OriginPathBuilder.GENERATION_CHARACTERISTICS;
        for (const key of CHARS) {
            update[`system.characteristics.${key}.advance`] = 0;
        }
        const skills = (this.actor.system as any)?.skills || {};
        for (const skillKey of Object.keys(skills)) {
            update[`system.skills.${skillKey}.advance`] = 0;
            const entries = skills[skillKey]?.entries;
            if (Array.isArray(entries)) {
                const resetEntries = entries.map((entry: any) => ({ ...entry, advance: 0 }));
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
        await this.actor.update({
            'system.influence': 0,
            'system.requisition': 0,
            'system.throneGelt': 0,
        });
    }

    /**
     * Create embedded items on the actor for the Equip Acolyte selections.
     * Per DH2e core pg 80, each acquired weapon comes with two clips of standard ammunition.
     * @private
     */
    async _applyEquipmentSelections(): Promise<void> {
        const availableWeapons = this._getAvailableWeaponsForAmmo();
        const creations: Record<string, unknown>[] = [];
        for (const entry of this.equipmentSelections.values()) {
            const uuid = entry.uuid as string;
            const source = await fromUuid(uuid);
            if (!source) continue;
            const itemData = (source as any).toObject ? (source as any).toObject() : foundry.utils.deepClone(source);
            delete itemData._id;
            itemData.flags ??= {};
            itemData.flags.core ??= {};
            itemData.flags.core.sourceId = uuid;

            if (entry.type === 'ammunition') {
                // Size user-picked ammo to one clip of the primary ranged weapon that supports it.
                // Prefer origin-granted weapons over weapons the player also picked.
                const types = Array.isArray((entry as any).weaponTypes) ? ((entry as any).weaponTypes as string[]) : [];
                const compatible =
                    availableWeapons.find((w) => types.includes(w.identifier) && w.source === 'granted') ??
                    availableWeapons.find((w) => types.includes(w.identifier));
                if (compatible && compatible.clipMax > 0) {
                    itemData.system = itemData.system || {};
                    itemData.system.quantity = compatible.clipMax;
                }
            }

            creations.push(itemData);

            if (entry.type === 'weapon') {
                const ammoData = await this._resolveStandardAmmoItem(source as any);
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
            await this.actor.createEmbeddedDocuments('Item', creations);
        }
    }

    /**
     * Resolve a standard ammunition item for a given weapon, matching by weaponTypes.
     * @private
     */
    async _resolveStandardAmmoItem(weapon: WH40KItem): Promise<Record<string, unknown> | null> {
        const packNames = (this.systemConfig.equipmentPacks as string[]) || [];
        const weaponIdentifier = (weapon.system as any)?.identifier;
        if (!weaponIdentifier) return null;

        for (const packName of packNames) {
            if (!packName.includes('ammo')) continue;
            const pack =
                game.packs.get(`wh40k-rpg.${packName}`) ??
                game.packs.find((p: any) => p.metadata.name === packName || p.metadata.id === `wh40k-rpg.${packName}`);
            if (!pack) continue;

            const index = await (pack as any).getIndex({ fields: ['system.weaponTypes', 'system.identifier', 'name', 'type'] });
            const match = index.find((entry: any) => {
                if (entry.type !== 'ammunition') return false;
                const types = (entry.system as any)?.weaponTypes || [];
                return Array.isArray(types) && types.includes(weaponIdentifier);
            });
            if (!match) continue;
            const doc = await (pack as any).getDocument(match._id);
            if (!doc) continue;
            const data = (doc as any).toObject ? (doc as any).toObject() : foundry.utils.deepClone(doc);
            data.flags ??= {};
            data.flags.core ??= {};
            data.flags.core.sourceId = `Compendium.${(pack as any).metadata.id}.${match._id}`;
            return data;
        }
        return null;
    }
}
