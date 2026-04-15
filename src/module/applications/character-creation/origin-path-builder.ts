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

import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import { GrantsManager, generateDeterministicId } from '../../managers/grants-manager.ts';
import { OriginChartLayout } from '../../utils/origin-chart-layout.ts';
import { getCharacteristicDisplayInfo, getTrainingLabel, getChoiceTypeLabel } from '../../utils/origin-ui-labels.ts';
import { normalizeOrigin } from './normalized-origin.ts';
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
    [key: string]: any;
    declare render: any;
    declare close: any;

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
        },
    };

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    /**
     * @param {Actor} actor - The character actor
     * @param {object} options - Application options
     */
    constructor(actor, options: Record<string, any> = {}) {
        super(options);
        this.actor = actor;
        this.gameSystem = options.gameSystem || 'rt';
        // System config from registry — used for labels, ranks, and step config
        this.registryConfig = SystemConfigRegistry.get(this.gameSystem);
        this.systemConfig = this.registryConfig.getOriginStepConfig();
        this.currentStepIndex = 0;
        this.guidedMode = true;
        this.direction = DIRECTION.FORWARD; // Forward or backward
        this.showLineage = false; // Whether we're on the optional step
        this.showCharacteristics = false; // Whether we're on the characteristics step
        this.selections = new Map(); // step -> Item (confirmed selections)
        this.previewedOrigin = null; // Currently previewed origin (unconfirmed)
        this.lineageSelection = null; // Separate storage for optional step
        this.allOrigins = []; // All origins from compendium (excluding optional)
        this.lineageOrigins = []; // Optional step origins

        // Characteristic generation state
        this._charRolls = Array(9).fill(0);
        this._charAssignments = {};
        this._charCustomBases = {};
        this._charAdvancedMode = false;
        this._charDragData = null;
        this._divination = this.actor.system?.originPath?.divination || '';
        this._thronesRolled = this.actor.system?.throneGelt || 0;
        this._influenceRolled = this.actor.system?.influence || 0;
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
     * Initialize characteristic generation state from actor data.
     * @private
     */
    _initCharacteristicState(): void {
        const genData = this.actor?.system?.characterGeneration || {};
        const CHARS = (this.constructor as any).GENERATION_CHARACTERISTICS;
        this._charRolls = Array.isArray(genData.rolls) && genData.rolls.length === 9 ? [...genData.rolls] : Array(9).fill(0);
        this._charAssignments = {};
        this._charCustomBases = {};
        for (const key of CHARS) {
            this._charAssignments[key] = genData.assignments?.[key] ?? null;
            this._charCustomBases[key] = genData.customBases?.[key] ?? 25;
        }
        this._charAdvancedMode = genData.customBases?.enabled ?? false;
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
            return { key: 'characteristics', step: 'characteristics', icon: 'fa-dice-d20', descKey: 'CharacteristicsDesc' };
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
    static show(actor: any, options: Record<string, unknown> = {}): any {
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
     * Get the last confirmed selection before a step index.
     * @param {number} stepIndex
     * @returns {object|null}
     * @private
     */
    _getLastConfirmedSelection(stepIndex: number): any {
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
    _itemToSelectionData(item: any): any {
        const data = item.toObject ? item.toObject() : foundry.utils.deepClone(item);
        // Store original uuid for reference to compendium item
        data._sourceUuid = item.uuid || data._sourceUuid;
        // Store actor item id if this is an existing actor item
        data._actorItemId = item.parent === this.actor ? item.id : null;
        // Ensure we have the system data in a mutable form
        if (!data.system) data.system = {};
        if (!data.system.selectedChoices) data.system.selectedChoices = {};
        if (!data.system.rollResults) data.system.rollResults = {};
        return data;
    }

    /**
     * Get system data from a selection (handles both Item and plain object)
     * @param {Item|object} selection - The selection (Item or data object)
     * @returns {object} - The system data
     * @private
     */
    _getSelectionSystem(selection: any): any {
        if (!selection) return {};
        // For Item instances
        if (selection.system) return selection.system;
        // For plain data objects
        return selection.system || {};
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
        const allOriginPaths: any[] = [];

        for (const packName of packNames) {
            // Try fully qualified ID first, then metadata.name fallback
            const pack = (game.packs.get(`wh40k-rpg.${packName}`) ??
                game.packs.find((p) => p.metadata.name === packName || p.metadata.id === `wh40k-rpg.${packName}`)) as any;
            if (!pack) {
                console.warn(`Origin path compendium '${packName}' not found`);
                continue;
            }
            const documents = await pack.getDocuments();
            allOriginPaths.push(...documents.filter((d: any) => d.type === 'originPath'));
        }

        if (allOriginPaths.length === 0) {
            console.warn('No origin path items found in configured compendiums');
            return;
        }

        // Normalize all origins at load time — guarantees non-null IDs, sorted positions, normalized choices
        const normalized = allOriginPaths.map(normalizeOrigin);

        // Separate optional step origins from core origins
        this.allOrigins = normalized.filter((o) => o.stepIndex !== optionalStepIndex);
        this.lineageOrigins = normalized.filter((o) => o.stepIndex === optionalStepIndex);
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: any): Promise<any> {
        await this._loadOrigins();

        const currentStep = this.currentStep;
        // Get origins for current step
        let currentOrigins = [];
        let selectedItem = null;

        if (this.showCharacteristics) {
            // No origins to show on characteristics step
            currentOrigins = [];
            selectedItem = null;
        } else if (this.showLineage) {
            // Show all lineage options (they can pick any regardless of path)
            currentOrigins = this._prepareLineageOrigins();
            selectedItem = this.lineageSelection;
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

        return {
            actor: this.actor,
            gameSystem: this.gameSystem,
            guidedMode: this.guidedMode,
            isForward: this.direction === DIRECTION.FORWARD,
            isBackward: this.direction === DIRECTION.BACKWARD,
            hasDirectionToggle: this.gameSystem === 'rt',
            showLineage: this.showLineage,
            showCharacteristics: this.showCharacteristics,

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
                index: this.currentStepIndex,
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

            // Selected origin details
            selectedOrigin: selectedOrigin,

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
    _prepareCharGenContext(): any {
        const CHARS = (this.constructor as any).GENERATION_CHARACTERISTICS;
        const DEFAULT_BASE = 25;

        const rollsBank = this._charRolls.map((value, index) => ({
            index,
            displayIndex: index + 1,
            value: value || 0,
            isEmpty: !value || value === 0,
            isAssigned: Object.values(this._charAssignments).includes(index),
        }));

        const characteristics = CHARS.map((key) => {
            const charData = this.actor.system.characteristics?.[key] || {};
            const assignedIndex = this._charAssignments[key] ?? null;
            const rollValue = assignedIndex !== null && this._charRolls[assignedIndex] ? this._charRolls[assignedIndex] : null;
            const base = this._charAdvancedMode ? this._charCustomBases[key] ?? DEFAULT_BASE : DEFAULT_BASE;
            const total = rollValue !== null ? base + rollValue : null;

            return {
                key,
                label: charData.label || key,
                short: charData.short || key.substring(0, 2).toUpperCase(),
                base,
                rollValue,
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
            // Starting resources
            thronesFormula: this._getThronesFormula(),
            thronesRolled: this._thronesRolled || 0,
            influenceMod: this._getInfluenceMod(),
            influenceRolled: this._influenceRolled || 0,
        };
    }

    /**
     * Compute combined thrones formula from selected homeworld + background.
     * @private
     */
    _getThronesFormula(): string {
        const parts: string[] = [];
        for (const [_step, selection] of this.selections) {
            const sys = this._getSelectionSystem(selection);
            const formula = sys?.homebrew?.throneGelt || sys?.homebrew?.thrones;
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
        for (const [_step, selection] of this.selections) {
            const sys = this._getSelectionSystem(selection);
            const others = sys?.modifiers?.other || [];
            for (const m of others) {
                if (m.name === 'Influence') mod += (m.value || 0);
            }
        }
        return mod;
    }

    /**
     * Prepare lineage origins (no position restrictions)
     * @returns {Array}
     * @private
     */
    _prepareLineageOrigins(): any {
        return this.lineageOrigins.map((origin) => {
            return {
                id: origin.id,
                uuid: origin.uuid,
                name: origin.name,
                img: origin.img,
                shortDescription: origin.shortDescription,
                isSelected: (this.lineageSelection?.id || this.lineageSelection?._id) === origin.id,
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
    _onRender(context: any, options: any): void {
        super._onRender(context, options);
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
                (e.currentTarget as any).classList.add('drop-valid', 'drop-hover');
            });
            slot.addEventListener('dragleave', (e) => {
                (e.currentTarget as any).classList.remove('drop-hover');
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
                (e.currentTarget as any).classList.add('drop-valid', 'drop-hover');
            });
            rollsBank.addEventListener('dragleave', (e) => {
                (e.currentTarget as any).classList.remove('drop-hover');
            });
            rollsBank.addEventListener('drop', this._onCharBankDrop.bind(this));
        }

        // Base value inputs (advanced mode)
        html.querySelectorAll('.csd-base-input').forEach((input) => {
            input.addEventListener('change', (e) => {
                const el = e.currentTarget as any;
                const key = el.dataset.characteristic;
                let value = parseInt(el.value);
                if (isNaN(value) || value < 0) value = 0;
                this._charCustomBases[key] = value;
                this.render();
            });
        });
    }

    _onCharRollChipClick(event: Event): void {
        const chip = event.currentTarget as any;
        const index = parseInt(chip.dataset.rollIndex);
        if (chip.querySelector('.csd-roll-input')) return;

        const currentValue = this._charRolls[index] || '';
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'csd-roll-input';
        (input as any).min = 2;
        (input as any).max = 40;
        input.value = currentValue || '';
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

        const valueEl = chip.querySelector('.csd-roll-value');
        if (valueEl) valueEl.style.display = 'none';
        chip.appendChild(input);
        input.focus();
        input.select();
    }

    _onCharDragStart(event: Event): void {
        const target = event.currentTarget as any;
        const rollIndex = parseInt(target.dataset.rollIndex);
        const fromChar = target.dataset.characteristic || null;
        if (this._charRolls[rollIndex] === 0) {
            event.preventDefault();
            return;
        }
        this._charDragData = { type: fromChar ? 'assigned' : 'bank', index: rollIndex, characteristic: fromChar };
        target.classList.add('dragging');
        (event as any).dataTransfer.effectAllowed = 'move';
        (event as any).dataTransfer.setData('text/plain', '');
    }

    _onCharDragEnd(event: Event): void {
        (event.currentTarget as any).classList.remove('dragging');
        this.element?.querySelectorAll('.drop-valid, .drop-hover').forEach((el) => el.classList.remove('drop-valid', 'drop-hover'));
        this._charDragData = null;
    }

    _onCharDrop(event: Event): void {
        event.preventDefault();
        if (!this._charDragData) return;
        const slot = event.currentTarget as any;
        const targetChar = slot.dataset.characteristic;
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
        this._charAssignments[this._charDragData.characteristic] = null;
        this.render();
    }

    _prepareStepNavigation(): any {
        const orderedSteps = this.orderedSteps;

        return orderedSteps.map((step, index) => {
            const hasSelection = this.selections.has(step.step);
            const isAccessible = this._isStepAccessible(index);
            const selection = hasSelection ? this.selections.get(step.step) : null;

            return {
                index: index,
                key: step.key,
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
    _prepareOriginsForStep(stepLayout: any): any {
        if (!stepLayout?.cards) return [];

        return stepLayout.cards.map((card) => {
            const origin = card.origin;

            return {
                id: origin.id,
                uuid: origin.uuid,
                name: origin.name,
                img: origin.img,
                shortDescription: origin.shortDescription || '',
                isSelected: card.isSelected,
                isDisabled: card.isDisabled,
                isValidNext: card.isValidNext && !card.isSelected,
                hasChoices: origin.hasChoices || card.hasChoices,
                isAdvanced: card.isAdvanced,
                xpCost: card.xpCost,
                badges: card.hasChoices || origin.hasChoices || card.isAdvanced || card.xpCost > 0,
            };
        });
    }

    /**
     * Prepare selected origin for detail panel
     * @param {Item|object} item - Item instance or plain data object
     * @returns {Promise<object>}
     * @private
     */
    async _prepareSelectedOrigin(item: any): Promise<any> {
        // Handle both Item instances and plain data objects
        const system = this._getSelectionSystem(item);
        const grants = system?.grants || {};
        const modifiers = system?.modifiers?.characteristics || {};

        // Prepare characteristics with proper labels
        const characteristics = [];
        for (const [key, value] of Object.entries(modifiers)) {
            if (value !== 0) {
                const info = getCharacteristicDisplayInfo(key);
                characteristics.push({
                    key: key,
                    label: info.label,
                    short: info.short,
                    value: value,
                    positive: value > 0,
                });
            }
        }

        // Prepare choices with detailed info
        const choices = [];
        const selectedChoices = system?.selectedChoices || {};
        const choiceLabelCounts: Record<string, number> = {};
        if (grants.choices?.length > 0) {
            for (const choice of grants.choices) {
                const baseLabel = choice.label || choice.name || '';
                choiceLabelCounts[baseLabel] = (choiceLabelCounts[baseLabel] || 0) + 1;
                const suffix = choiceLabelCounts[baseLabel] > 1 ? ` (${choiceLabelCounts[baseLabel]})` : '';
                const choiceKey = `${baseLabel}${suffix}`;
                const selection = selectedChoices[choiceKey];
                const selectedLabels = [];
                if (selection && Array.isArray(selection)) {
                    for (const sel of selection) {
                        const option = choice.options?.find((o) => o.value === sel || o.name === sel);
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

        // Prepare rolls with manual input support
        const rolls: any = {};
        const rollResults = system?.rollResults || {};

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

        // Prepare skills with tooltips and UUIDs
        const skills = [];
        for (const skill of grants.skills || []) {
            const displayName = skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name;
            skills.push({
                name: skill.name,
                specialization: skill.specialization || null,
                displayName: displayName,
                level: skill.level || 'trained',
                levelLabel: this._getTrainingLabel(skill.level),
                uuid: await this._findSkillUuid(skill.name, skill.specialization),
            });
        }

        // Prepare talents with item lookup for tooltips
        const talents = await this._prepareTalentsWithTooltips(grants.talents || []);

        // Prepare traits with item lookup
        const traits = await this._prepareTraitsWithTooltips(grants.traits || []);

        // Check if this is a confirmed selection or just previewed
        // Handle both Item instances and plain data objects
        const currentStep = this.currentStep;
        const itemId = item._id || item.id;
        let isConfirmed = false;
        if (this.showLineage) {
            const lineageId = this.lineageSelection?._id || this.lineageSelection?.id;
            isConfirmed = lineageId === itemId;
        } else {
            const selection = this.selections.get(currentStep.step);
            const selectionId = selection?._id || selection?.id;
            isConfirmed = selectionId === itemId;
        }

        return {
            id: itemId,
            uuid: item.uuid || item._sourceUuid,
            name: item.name,
            img: item.img,
            description: system?.description?.value || '',
            isConfirmed: isConfirmed, // Track if confirmed vs previewed
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
        };
    }

    /**
     * Prepare talents with tooltip information
     * @param {Array} talents
     * @returns {Promise<Array>}
     * @private
     */
    async _prepareTalentsWithTooltips(talents: any[]): Promise<any[]> {
        const prepared = [];
        for (const talent of talents) {
            let tooltipText = talent.name;
            let hasItem = false;

            if (talent.uuid) {
                try {
                    const item = (await fromUuid(talent.uuid)) as any;
                    if (item) {
                        hasItem = true;
                        const desc = item.system?.description?.value;
                        if (desc) {
                            tooltipText = this._stripHtml(desc).substring(0, 200);
                            if (tooltipText.length >= 200) tooltipText += '...';
                        }
                    }
                } catch (e) {
                    // Item not found, use name
                }
            }

            prepared.push({
                name: talent.name,
                specialization: talent.specialization || null,
                uuid: talent.uuid || null,
                tooltip: tooltipText,
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
    async _prepareTraitsWithTooltips(traits: any[]): Promise<any[]> {
        const prepared = [];
        for (const trait of traits) {
            let tooltipText = trait.name;
            let hasItem = false;

            if (trait.uuid) {
                try {
                    const item = (await fromUuid(trait.uuid)) as any;
                    if (item) {
                        hasItem = true;
                        const desc = item.system?.description?.value;
                        if (desc) {
                            tooltipText = this._stripHtml(desc).substring(0, 200);
                            if (tooltipText.length >= 200) tooltipText += '...';
                        }
                    }
                } catch (e) {
                    // Item not found
                }
            }

            prepared.push({
                name: trait.name,
                level: trait.level || null,
                uuid: trait.uuid || null,
                tooltip: tooltipText,
                hasItem: hasItem,
            });
        }
        return prepared;
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
    async _calculatePreview(): Promise<any> {
        const preview = {
            characteristics: [],
            skills: [],
            talents: [],
            traits: [],
            equipment: [],
            wounds: null,
            fate: null,
        };

        const charTotals = {};
        const skillMap = new Map(); // name -> {name, uuid}
        const talentMap = new Map(); // name -> {name, uuid}
        const traitMap = new Map(); // name -> {name, uuid}
        const equipmentList = [];

        for (const [step, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            const grants = system?.grants || {};
            const modifiers = system?.modifiers?.characteristics || {};
            const selectedChoices = system?.selectedChoices || {};

            // Accumulate base characteristics from modifiers
            for (const [key, value] of Object.entries(modifiers)) {
                if (value !== 0) {
                    charTotals[key] = (charTotals[key] || 0) + value;
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
                    const talentName = talent.name || talent;
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
                                    charTotals[key] = (charTotals[key] || 0) + value;
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
                                const talentName = talent.name || talent;
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
        preview.skills = Array.from(skillMap.values());
        preview.talents = Array.from(talentMap.values());
        preview.traits = Array.from(traitMap.values());
        preview.equipment = equipmentList.map((name) => ({ name }));

        return preview;
    }

    /**
     * Find skill UUID by looking up in compendium
     * @param {string} skillName
     * @param {string} specialization
     * @returns {Promise<string|null>}
     * @private
     */
    async _findSkillUuid(skillName: string, specialization: any = null): Promise<any> {
        try {
            const skillPack = game.packs.find((p) => p.metadata.name === 'wh40k-items-skills');
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
        } catch (error) {
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
    async _addTalentModifiers(uuid: string, charTotals: Record<string, number>, skillMap: Record<string, any>): Promise<void> {
        try {
            const talent = (await fromUuid(uuid)) as any;
            if (!talent) return;

            const talentSystem = talent.system;

            // Add characteristic modifiers from talent
            const charMods = talentSystem?.modifiers?.characteristics || {};
            for (const [key, value] of Object.entries(charMods)) {
                if (value !== 0) {
                    charTotals[key] = (charTotals[key] || 0) + value;
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
    _calculateStatus(): any {
        const totalSteps = this.systemConfig.coreSteps.length;
        const stepsCount = this.selections.size;
        let pendingChoices = 0;
        let pendingRolls = 0;

        for (const [step, selection] of this.selections) {
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
            stepsComplete: stepsCount >= totalSteps,
            choicesComplete: pendingChoices === 0,
            pendingChoices: pendingChoices,
            pendingRolls: pendingRolls,
            canCommit: stepsCount >= totalSteps && pendingChoices === 0,
        };
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Randomize all selections
     */
    static async #randomize(event: Event, target: HTMLElement): Promise<void> {
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.OriginPath.Randomize'),
            content: game.i18n.localize('WH40K.OriginPath.RandomizeConfirm'),
        });

        if (!confirmed) return;

        // Clear and randomize
        (this as any).selections.clear();

        const coreStepKeys = (this as any).systemConfig.coreSteps.map((s) => s.key || s.step);
        const chartLayout = OriginChartLayout.computeFullChart((this as any).allOrigins, (this as any).selections, false, 'forward', coreStepKeys);

        const coreSteps = (this as any).systemConfig.coreSteps;
        for (let i = 0; i < coreSteps.length; i++) {
            const stepLayout = chartLayout.steps[i];
            const validOrigins = stepLayout.cards.filter((c) => c.isSelectable);

            if (validOrigins.length > 0) {
                const randomIndex = Math.floor(Math.random() * validOrigins.length);
                const selected = validOrigins[randomIndex];

                // Store as plain data object (not Item instance)
                const originData = (this as any)._itemToSelectionData(selected.origin);
                (this as any).selections.set(coreSteps[i].step, originData);
            }
        }

        (this as any)._refreshPathPositions();

        (this as any).currentStepIndex = 0;
        (this as any).render();
    }

    /**
     * Reset all selections
     */
    static async #reset(event: Event, target: HTMLElement): Promise<void> {
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.OriginPath.Reset'),
            content: game.i18n.localize('WH40K.OriginPath.ConfirmReset'),
        });

        if (!confirmed) return;

        // Reverse any previously applied grants from this character's origin path
        const reverseResult = await GrantsManager.reverseAllAppliedGrants((this as any).actor);
        if (reverseResult.errors.length > 0) {
            console.warn('Some grants failed to reverse during reset:', reverseResult.errors);
        }

        // Delete origin path items from actor
        const originPathItems = (this as any).actor.items.filter((i) => i.type === 'originPath');
        if (originPathItems.length > 0) {
            const ids = originPathItems.map((i) => i.id);
            await (this as any).actor.deleteEmbeddedDocuments('Item', ids);
        }

        // Clear UI state
        (this as any).selections.clear();
        (this as any).currentStepIndex = 0;
        (this as any).render();
    }

    /**
     * Export path configuration
     */
    static async #export(event: Event, target: HTMLElement): Promise<void> {
        const data = {
            version: 1,
            selections: {},
        };

        for (const [step, selection] of (this as any).selections) {
            const system = (this as any)._getSelectionSystem(selection);
            data.selections[step] = {
                uuid: selection.uuid || selection._sourceUuid,
                name: selection.name,
                selectedChoices: system?.selectedChoices || {},
                rollResults: system?.rollResults || {},
            };
        }

        const filename = `${(this as any).actor.name}-origin-path.json`;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
        (ui.notifications as any).info(game.i18n.localize('WH40K.OriginPath.ExportSuccess'));
    }

    /**
     * Import path configuration
     */
    static async #import(event: Event, target: HTMLElement): Promise<void> {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                if (data.version !== 1) {
                    throw new Error('Unsupported version');
                }

                (this as any).selections.clear();

                for (const [step, selData] of Object.entries(data.selections)) {
                    const origin = (await fromUuid((selData as any).uuid)) as any;
                    if (origin) {
                        // Store as plain data object (not Item instance)
                        const originData = (this as any)._itemToSelectionData(origin);
                        originData.system.selectedChoices = (selData as any).selectedChoices;
                        originData.system.rollResults = (selData as any).rollResults;
                        (this as any).selections.set(step, originData);
                    }
                }

                (this as any)._refreshPathPositions();

                (this as any).currentStepIndex = 0;
                (this as any).render();
                (ui.notifications as any).info(game.i18n.localize('WH40K.OriginPath.ImportSuccess'));
            } catch (err) {
                console.error('Import failed:', err);
                (ui.notifications as any).error(game.i18n.localize('WH40K.OriginPath.ImportFailed'));
            }
        });

        input.click();
    }

    /**
     * Set guided/free mode
     */
    static async #setMode(event: Event, target: HTMLElement): Promise<void> {
        const value = (target as HTMLInputElement).value || target.closest('[data-action]')?.querySelector('input')?.value;
        (this as any).guidedMode = value === 'guided';
        (this as any).render();
    }

    /**
     * Set direction (forward/backward)
     */
    static async #setDirection(event: Event, target: HTMLElement): Promise<void> {
        const value = (target as HTMLInputElement).value || target.dataset.direction;
        if (value === 'forward' || value === 'backward') {
            const oldDirection = (this as any).direction;
            (this as any).direction = value;

            // If direction changed and we have selections, warn about reset
            if (oldDirection !== (this as any).direction && (this as any).selections.size > 0) {
                const confirmed = await Dialog.confirm({
                    title: game.i18n.localize('WH40K.OriginPath.DirectionChange'),
                    content: game.i18n.localize('WH40K.OriginPath.DirectionChangeWarning'),
                });

                if (!confirmed) {
                    (this as any).direction = oldDirection;
                    (this as any).render();
                    return;
                }

                // Reset selections when changing direction
                (this as any).selections.clear();
                (this as any).currentStepIndex = 0;
            }

            (this as any).render();
        }
    }

    /**
     * Navigate to a step
     */
    static async #goToStep(event: Event, target: HTMLElement): Promise<void> {
        const stepIndex = parseInt(target.dataset.stepIndex);
        if (isNaN(stepIndex)) return;

        // Turn off lineage mode when navigating to main steps
        (this as any).showLineage = false;

        // Check if accessible in guided mode
        if ((this as any).guidedMode && !(this as any)._isStepAccessible(stepIndex)) {
            (ui.notifications as any).warn(game.i18n.localize('WH40K.OriginPath.CompletePreviousStep'));
            return;
        }

        // NOTE: No warning when navigating to steps - warning happens on confirmation instead
        (this as any).currentStepIndex = stepIndex;
        (this as any).render();
    }

    /**
     * Preview origin card (NEW behavior - single click shows in panel, doesn't select)
     * This is the new primary preview method - clicking a card just shows it in the panel
     */
    static async #previewOriginCard(event: Event, target: HTMLElement): Promise<void> {
        const originId = target.dataset.originId;
        const originUuid = target.dataset.originUuid;

        if (!originId && !originUuid) return;

        // Check if disabled
        if (target.classList.contains('disabled')) {
            (ui.notifications as any).warn(game.i18n.localize('WH40K.OriginPath.OriginNotAvailable'));
            return;
        }

        // Find the origin (check both main and lineage origins)
        let origin = (this as any).allOrigins.find((o) => o.id === originId);
        if (!origin) {
            origin = (this as any).lineageOrigins.find((o) => o.id === originId);
        }
        if (!origin) return;

        // Store as plain data object (not Item instance)
        (this as any).previewedOrigin = (this as any)._itemToSelectionData(origin);

        // Re-render to show in selection panel
        (this as any).render();
    }

    /**
     * Confirm the currently previewed selection and advance to next step
     */
    static async #confirmSelection(event: Event, target: HTMLElement): Promise<void> {
        const currentStep = (this as any).currentStep;

        // Use previewed origin, or fall back to already-confirmed selection for this step
        if (!(this as any).previewedOrigin) {
            const existing = (this as any).selections.get(currentStep.step);
            if (existing) {
                // Already confirmed — nothing to do, just advance
                (this as any).render();
                return;
            }
            (ui.notifications as any).warn(game.i18n.localize('WH40K.OriginPath.NoPreviewedOrigin'));
            return;
        }

        // Check if we're changing an existing selection in guided mode
        if ((this as any).guidedMode && (this as any).selections.has(currentStep.step)) {
            // Find steps that would be reset
            const currentIndex = (this as any).orderedSteps.findIndex((s) => s.key === currentStep.key);
            const stepsToReset = (this as any).orderedSteps.slice(currentIndex + 1);
            const hasSelections = stepsToReset.some((s) => (this as any).selections.has(s.step));

            if (hasSelections) {
                // Build list of steps that will be reset
                const stepNames = stepsToReset
                    .filter((s) => (this as any).selections.has(s.step))
                    .map((s) => game.i18n.localize(`WH40K.OriginPath.Step${s.key.charAt(0).toUpperCase() + s.key.slice(1)}`))
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
        await (this as any)._selectOrigin((this as any).previewedOrigin);

        // Clear preview
        (this as any).previewedOrigin = null;

        // Re-render
        (this as any).render();
    }

    /**
     * View origin card details (eye icon button - preview only)
     * This is now the preview/detail view - does NOT select
     */
    static async #viewOriginCard(event: Event, target: HTMLElement): Promise<void> {
        // Stop propagation so parent card click doesn't fire
        event.stopPropagation();

        const originId = target.dataset.originId;
        const originUuid = target.dataset.originUuid;

        if (!originId && !originUuid) return;

        // Find the origin (check both main and lineage origins)
        let origin = (this as any).allOrigins.find((o) => o.id === originId);
        if (!origin) {
            origin = (this as any).lineageOrigins.find((o) => o.id === originId);
        }
        if (!origin) return;

        // Get current selection to check if already selected
        const currentStep = (this as any).currentStep;
        let isSelected = false;
        if ((this as any).showLineage) {
            isSelected = ((this as any).lineageSelection?.id || (this as any).lineageSelection?._id) === originId;
        } else {
            const sel = (this as any).selections.get(currentStep.step);
            isSelected = (sel?.id || sel?._id) === originId;
        }

        // Show detail dialog for PREVIEW ONLY (no selection)
        await OriginDetailDialog.show(origin, {
            allowSelection: false, // Changed to false - preview only
            isSelected: isSelected,
        });
    }

    /**
     * Internal method to select an origin after confirmation
     * @param {Item|object} origin - The origin to select (Item or plain data object)
     * @private
     */
    async _selectOrigin(origin: any): Promise<void> {
        const currentStep = this.currentStep;

        // Convert to plain data object if it's an Item
        const originData = origin.toObject ? this._itemToSelectionData(origin) : foundry.utils.deepClone(origin);

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
    static async #viewOrigin(event: Event, target: HTMLElement): Promise<void> {
        const currentStep = (this as any).currentStep;
        let selection = null;

        if ((this as any).showLineage) {
            selection = (this as any).lineageSelection || (this as any).previewedOrigin;
        } else {
            // Check confirmed selection first, then previewed
            selection = (this as any).selections.get(currentStep.step) || (this as any).previewedOrigin;
        }

        if (selection) {
            // For plain data objects, we need to get the original item from compendium
            const uuid = selection.uuid || selection._sourceUuid;
            let originItem: any = uuid ? await fromUuid(uuid) : null;

            // If we can't find the original, create a temporary display item
            if (!originItem) {
                originItem = {
                    name: selection.name,
                    img: selection.img,
                    system: (this as any)._getSelectionSystem(selection),
                    uuid: uuid,
                };
            }

            // Open the detail dialog
            await OriginDetailDialog.show(originItem, {
                allowSelection: false,
                isSelected: !!(this as any).selections.get(currentStep.step),
            });
        }
    }

    /**
     * Clear current origin selection
     */
    static async #clearOrigin(event: Event, target: HTMLElement): Promise<void> {
        if ((this as any).showLineage) {
            (this as any).lineageSelection = null;
        } else {
            const currentStep = (this as any).currentStep;

            // In guided mode, also clear subsequent steps
            if ((this as any).guidedMode) {
                const currentIndex = (this as any).orderedSteps.findIndex((s) => s.key === currentStep.key);
                const stepsToReset = (this as any).orderedSteps.slice(currentIndex);
                for (const step of stepsToReset) {
                    (this as any).selections.delete(step.step);
                }
            } else {
                (this as any).selections.delete(currentStep.step);
            }
        }
        (this as any).render();
    }

    /**
     * Edit a choice - properly invoke OriginPathChoiceDialog
     */
    static async #editChoice(event: Event, target: HTMLElement): Promise<void> {
        const choiceLabel = target.dataset.choiceLabel;
        let selection = null;

        if ((this as any).showLineage) {
            selection = (this as any).lineageSelection || (this as any).previewedOrigin;
        } else {
            const currentStep = (this as any).currentStep;
            // Check previewed origin first, then confirmed selection
            selection = (this as any).previewedOrigin || (this as any).selections.get(currentStep.step);
        }

        if (!selection || !choiceLabel) return;

        const system = (this as any)._getSelectionSystem(selection);
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

        const result = await OriginPathChoiceDialog.show(itemLike, (this as any).actor);

        if (result) {
            // Always directly mutate the plain data object
            if (!selection.system) selection.system = {};
            if (!selection.system.selectedChoices) selection.system.selectedChoices = {};
            for (const [label, selections] of Object.entries(result)) {
                selection.system.selectedChoices[label] = selections;
            }

            (this as any).render();
        }
    }

    /**
     * Roll a stat using the roll dialog
     */
    static async #rollStat(event: Event, target: HTMLElement): Promise<void> {
        const statType = target.dataset.statType;
        let selection = null;

        if ((this as any).showLineage) {
            selection = (this as any).lineageSelection || (this as any).previewedOrigin;
        } else {
            const currentStep = (this as any).currentStep;
            selection = (this as any).previewedOrigin || (this as any).selections.get(currentStep.step);
        }

        if (!selection || !statType) return;

        const system = (this as any)._getSelectionSystem(selection);
        const grants = system?.grants || {};
        const formula = statType === 'wounds' ? grants.woundsFormula : grants.fateFormula;

        if (!formula) return;

        // Create a wrapper for the roll dialog
        const itemLike = {
            name: selection.name,
            img: selection.img,
            system: system,
            uuid: selection.uuid || selection._sourceUuid,
        };

        const result = await OriginRollDialog.show(statType, formula, {
            actor: (this as any).actor,
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
            if (!selection.system) selection.system = {};
            if (!selection.system.rollResults) selection.system.rollResults = {};
            selection.system.rollResults[statType] = rollData;

            (this as any).render();
        }
    }

    /**
     * Manually set a stat value (alternative to rolling)
     */
    static async #manualStat(event: Event, target: HTMLElement): Promise<void> {
        const statType = target.dataset.statType;
        let selection = null;

        if ((this as any).showLineage) {
            selection = (this as any).lineageSelection || (this as any).previewedOrigin;
        } else {
            const currentStep = (this as any).currentStep;
            selection = (this as any).previewedOrigin || (this as any).selections.get(currentStep.step);
        }

        if (!selection || !statType) return;

        const system = (this as any)._getSelectionSystem(selection);
        const grants = system?.grants || {};
        const formula = statType === 'wounds' ? grants.woundsFormula : grants.fateFormula;

        if (!formula) return;

        // Show a simple input dialog
        const result = await Dialog.prompt({
            title: game.i18n.localize(`WH40K.OriginPath.Enter${statType.charAt(0).toUpperCase() + statType.slice(1)}`),
            content: `
                <form>
                    <div class="form-group">
                        <label>${game.i18n.localize('WH40K.OriginPath.ManualValue')}</label>
                        <input type="number" name="value" value="" min="1" autofocus />
                        <p class="notes">${game.i18n.localize('WH40K.OriginPath.FormulaHint')}: ${formula}</p>
                    </div>
                </form>
            `,
            callback: (html) => {
                const form = html[0]?.querySelector('form') || html.querySelector?.('form');
                return parseInt(form?.value?.value || form?.querySelector('[name=value]')?.value) || null;
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

            (this as any).render();
        }
    }

    /**
     * Go to lineage selection
     */
    static async #goToLineage(event: Event, target: HTMLElement): Promise<void> {
        (this as any).showLineage = true;
        (this as any).render();
    }

    /**
     * Skip lineage selection
     */
    static async #skipLineage(event: Event, target: HTMLElement): Promise<void> {
        (this as any).lineageSelection = null;
        (this as any).showLineage = false;
        (this as any).render();
    }

    /**
     * Navigate to the characteristics step.
     */
    static async #goToCharacteristics(event: Event, target: HTMLElement): Promise<void> {
        (this as any).showLineage = false;
        (this as any).showCharacteristics = true;
        (this as any).previewedOrigin = null;
        (this as any).render();
    }

    /**
     * Reset all characteristic assignments.
     */
    static async #charReset(event: Event, target: HTMLElement): Promise<void> {
        const CHARS = OriginPathBuilder.GENERATION_CHARACTERISTICS;
        for (const key of CHARS) {
            (this as any)._charAssignments[key] = null;
        }
        (this as any).render();
    }

    /**
     * Toggle advanced mode for characteristics.
     */
    static async #charToggleAdvanced(event: Event, target: HTMLElement): Promise<void> {
        (this as any)._charAdvancedMode = !(this as any)._charAdvancedMode;
        (this as any).render();
    }

    /** DH2e Divination Table (Core Rulebook Table 2-9) */
    static DIVINATION_TABLE = [
        { min: 1, max: 5, text: 'Mutation without, corruption within.' },
        { min: 6, max: 9, text: 'Trust in your fear.' },
        { min: 10, max: 13, text: 'Humans must die so that humanity can endure.' },
        { min: 14, max: 17, text: 'The pain of the bullet is ecstasy compared to damnation.' },
        { min: 18, max: 21, text: 'Be a boon to your allies and a bane to your enemies.' },
        { min: 22, max: 25, text: 'The wise man learns from the deaths of others.' },
        { min: 26, max: 30, text: 'Kill the alien before it can speak its lies.' },
        { min: 31, max: 35, text: 'Truth is subjective.' },
        { min: 36, max: 40, text: 'Thought begets Heresy; Heresy begets Retribution.' },
        { min: 41, max: 45, text: 'The only true fear is dying without your duty done.' },
        { min: 46, max: 50, text: 'Only in death does duty end.' },
        { min: 51, max: 55, text: 'A mind without purpose will wander in dark places.' },
        { min: 56, max: 60, text: "No man died in the Emperor's service that died in vain." },
        { min: 61, max: 65, text: 'To war is human.' },
        { min: 66, max: 70, text: 'There are no civilians in the battle for survival.' },
        { min: 71, max: 75, text: 'Violence solves everything.' },
        { min: 76, max: 80, text: 'Even a man who has nothing can still offer his life.' },
        { min: 81, max: 85, text: 'Do not ask why you serve. Only ask how.' },
        { min: 86, max: 90, text: 'The gun is mightier than the sword.' },
        { min: 91, max: 93, text: 'In the darkness, follow the light of Terra.' },
        { min: 94, max: 96, text: 'There is nothing to fear but failure.' },
        { min: 97, max: 100, text: "To stand in the presence of the Emperor's chosen is reward enough." },
    ];

    /**
     * Roll on the divination table.
     */
    static async #rollDivination(event: Event, target: HTMLElement): Promise<void> {
        const roll = new Roll('1d100');
        await roll.evaluate();
        const result = roll.total;
        const entry = OriginPathBuilder.DIVINATION_TABLE.find((e) => result >= e.min && result <= e.max);
        (this as any)._divination = entry ? entry.text : 'The Emperor protects.';
        (this as any)._saveScrollPosition?.();
        (this as any).render();
    }

    /**
     * Manually enter a divination.
     */
    static async #manualDivination(event: Event, target: HTMLElement): Promise<void> {
        const text = await Dialog.prompt({
            title: 'Enter Divination',
            content: '<form><div class="form-group"><label>Divination:</label><input type="text" name="divination" autofocus /></div></form>',
            callback: (html) => (html as any).find('input[name="divination"]').val(),
            rejectClose: false,
        });
        if (text) {
            (this as any)._divination = text;
            (this as any)._saveScrollPosition?.();
            (this as any).render();
        }
    }

    /**
     * Roll starting throne gelt from combined homeworld + background formulas.
     */
    static async #rollThrones(event: Event, target: HTMLElement): Promise<void> {
        const formula = (this as any)._getThronesFormula();
        if (!formula) { (ui.notifications as any).warn('No thrones formula — select a homeworld and background first.'); return; }
        const roll = new Roll(formula);
        await roll.evaluate();
        (this as any)._thronesRolled = roll.total;
        (this as any)._saveScrollPosition?.();
        (this as any).render();
    }

    static async #manualThrones(event: Event, target: HTMLElement): Promise<void> {
        const val = await Dialog.prompt({
            title: 'Enter Starting Throne Gelt',
            content: '<form><div class="form-group"><label>Thrones:</label><input type="number" name="value" min="0" autofocus /></div></form>',
            callback: (html) => parseInt((html as any).find('input[name="value"]').val()),
            rejectClose: false,
        });
        if (val && !isNaN(val)) {
            (this as any)._thronesRolled = val;
            (this as any)._saveScrollPosition?.();
            (this as any).render();
        }
    }

    /**
     * Roll starting influence (1d5 + Fellowship Bonus + homeworld modifier).
     */
    static async #rollInfluence(event: Event, target: HTMLElement): Promise<void> {
        const felBonus = (this as any).actor.system.characteristics?.fellowship?.bonus || 0;
        const mod = (this as any)._getInfluenceMod();
        const roll = new Roll('1d5');
        await roll.evaluate();
        (this as any)._influenceRolled = Math.max(0, roll.total + felBonus + mod);
        (this as any)._saveScrollPosition?.();
        (this as any).render();
    }

    static async #manualInfluence(event: Event, target: HTMLElement): Promise<void> {
        const val = await Dialog.prompt({
            title: 'Enter Starting Influence',
            content: '<form><div class="form-group"><label>Influence:</label><input type="number" name="value" min="0" autofocus /></div></form>',
            callback: (html) => parseInt((html as any).find('input[name="value"]').val()),
            rejectClose: false,
        });
        if (val != null && !isNaN(val)) {
            (this as any)._influenceRolled = val;
            (this as any)._saveScrollPosition?.();
            (this as any).render();
        }
    }

    /**
     * Open an item sheet (for talents, skills, etc.)
     */
    static async #openItem(event: Event, target: HTMLElement): Promise<void> {
        const uuid = target.dataset.uuid;
        if (!uuid) return;

        try {
            const item = (await fromUuid(uuid)) as any;
            if (item?.sheet) {
                item.sheet.render(true);
            }
        } catch (e) {
            (ui.notifications as any).warn(game.i18n.localize('WH40K.OriginPath.ItemNotFound'));
        }
    }

    /**
     * Commit path to character
     */
    static async #commit(event: Event, target: HTMLElement): Promise<void> {
        const status = (this as any)._calculateStatus();

        if (!status.canCommit) {
            if (!status.stepsComplete) {
                (ui.notifications as any).warn(game.i18n.localize('WH40K.OriginPath.CompleteAllSteps'));
            } else if (!status.choicesComplete) {
                (ui.notifications as any).warn(game.i18n.localize('WH40K.OriginPath.CompleteAllChoices'));
            }
            return;
        }

        // Confirm
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.OriginPath.CommitToCharacter'),
            content: game.i18n.localize('WH40K.OriginPath.ConfirmCommit'),
        });

        if (!confirmed) return;

        try {
            // Build array of origin items from selections
            const originItems = [];
            for (const [step, selection] of (this as any).selections) {
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
            const existingOriginItems = (this as any).actor.items.filter((i) => i.type === 'originPath');
            if (existingOriginItems.length > 0) {
                const idsToDelete = existingOriginItems.map((i) => i.id);
                await (this as any).actor.deleteEmbeddedDocuments('Item', idsToDelete);
            }

            // Use GrantsManager to apply all grants in batch
            // This handles characteristics, skills, talents, traits, wounds, fate, etc.
            // reverseExisting ensures old grants are reversed before applying new ones
            const result = await GrantsManager.applyBatchGrants(
                originItems.map((data) => ({
                    name: data.name,
                    type: 'originPath',
                    system: data.system || (this as any)._getSelectionSystem(data),
                    toObject: () => data,
                })),
                (this as any).actor,
                {
                    selections: (this as any)._buildGrantSelections(),
                    rolledValues: (this as any)._buildRolledValues(),
                    showNotification: false,
                    reverseExisting: true, // Reverse any previously applied grants first
                },
            );

            if (!result.success && result.errors.length > 0) {
                console.warn('Grant application had errors:', result.errors);
            }

            // Create origin path items on actor (for reference/display)
            const cleanOriginItems = [];
            for (const [step, selection] of (this as any).selections) {
                const itemData = selection.toObject ? selection.toObject() : foundry.utils.deepClone(selection);
                // Remove internal tracking properties
                delete itemData._sourceUuid;
                delete itemData._actorItemId;
                // Ensure it's marked as an origin path item
                itemData.type = 'originPath';
                cleanOriginItems.push(itemData);
            }
            await (this as any).actor.createEmbeddedDocuments('Item', cleanOriginItems);

            // Apply characteristic rolls if any are assigned
            const CHARS = OriginPathBuilder.GENERATION_CHARACTERISTICS;
            const charRolls = (this as any)._charRolls;
            const charAssignments = (this as any)._charAssignments;
            const hasCharRolls = charRolls.some((r) => r > 0) && CHARS.some((k) => charAssignments[k] !== null);
            if (hasCharRolls) {
                const charUpdate: Record<string, any> = {
                    'system.characterGeneration.rolls': charRolls,
                    'system.characterGeneration.assignments': charAssignments,
                    'system.characterGeneration.customBases.enabled': (this as any)._charAdvancedMode,
                };
                for (const key of CHARS) {
                    charUpdate[`system.characterGeneration.customBases.${key}`] = (this as any)._charCustomBases[key];
                    const rollIndex = charAssignments[key];
                    if (rollIndex !== null && charRolls[rollIndex] > 0) {
                        const base = (this as any)._charAdvancedMode ? (this as any)._charCustomBases[key] ?? 25 : 25;
                        charUpdate[`system.characteristics.${key}.base`] = base + charRolls[rollIndex];
                    }
                }
                await (this as any).actor.update(charUpdate);
            }

            // Apply divination, thrones, and influence
            const resourceUpdate: Record<string, any> = {};
            if ((this as any)._divination) resourceUpdate['system.originPath.divination'] = (this as any)._divination;
            if ((this as any)._thronesRolled) resourceUpdate['system.throneGelt'] = (this as any)._thronesRolled;
            if ((this as any)._influenceRolled) resourceUpdate['system.influence'] = (this as any)._influenceRolled;
            if (Object.keys(resourceUpdate).length > 0) {
                await (this as any).actor.update(resourceUpdate);
            }

            // Success
            (ui.notifications as any).info(game.i18n.localize('WH40K.OriginPath.CommitSuccess'));
            (this as any).close();
        } catch (err) {
            console.error('Failed to commit origin path:', err);
            (ui.notifications as any).error(game.i18n.localize('WH40K.OriginPath.CommitFailed'));
        }
    }

    /**
     * Build grant selections from choice selections stored on each origin.
     * @returns {object}
     * @private
     */
    _buildGrantSelections(): any {
        const selections = {};
        for (const [_step, selection] of this.selections) {
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
    _buildRolledValues(): any {
        const values: any = {};
        for (const [step, selection] of this.selections) {
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
}
