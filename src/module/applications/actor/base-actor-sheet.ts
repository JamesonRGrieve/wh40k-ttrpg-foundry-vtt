/**
 * @file BaseActorSheet - Base actor sheet built on ApplicationV2
 * Based on dnd5e's BaseActorSheet pattern for Foundry V13+
 */

import WH40K from '../../config.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { toCamelCase } from '../../handlebars/handlebars-helpers.ts';
import type { WH40KBaseActorDocument, WH40KCharacteristic, WH40KSkill, WH40KWounds, WH40KInitiative, WH40KMovement } from '../../types/global.d.ts';
import type { ApplicationV2Ctor, DialogV2Like } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import CollapsiblePanelMixin from '../api/collapsible-panel-mixin.ts';
import ContextMenuMixin from '../api/context-menu-mixin.ts';
import EnhancedDragDropMixin from '../api/drag-drop-visual-mixin.ts';
import EnhancedAnimationsMixin from '../api/enhanced-animations-mixin.ts';
import PrimarySheetMixin from '../api/primary-sheet-mixin.ts';
import type { BaseActorSheetMixins } from '../api/sheet-mixin-types.ts';
import StatBreakdownMixin from '../api/stat-breakdown-mixin.ts';
import TooltipMixin from '../api/tooltip-mixin.ts';
import VisualFeedbackMixin from '../api/visual-feedback-mixin.ts';
import WhatIfMixin from '../api/what-if-mixin.ts';
import { ActiveModifiersMixin, ItemPreviewMixin } from '../components/_module.ts';
import ConfirmationDialog from '../dialogs/confirmation-dialog.ts';
// import EffectCreationDialog from '../prompts/effect-creation-dialog.ts';

type AnyApplicationV2Ctor = ApplicationV2Ctor;
/* eslint-disable no-restricted-syntax -- boundary: Foundry V14 type-erasure; foundry.applications shape is not statically typed for ActorSheetV2/DialogV2 access. */
const applications = foundry.applications as unknown as typeof foundry.applications & {
    sheets: { ActorSheetV2: AnyApplicationV2Ctor };
};
const dialogV2 = (foundry.applications as unknown as { api: { DialogV2: DialogV2Like } }).api.DialogV2;
/* eslint-enable no-restricted-syntax */
const { ActorSheetV2 } = applications.sheets;
/* eslint-disable no-restricted-syntax -- boundary: sheet→DataModel payload; these types describe values whose concrete shape comes from Foundry's untyped DataModel fields and Handlebars template context. */
type BaseActorSheetSystem = WH40KBaseActorDocument['system'] & {
    characteristics: Record<string, WH40KCharacteristic>;
    skills: Record<string, WH40KSkill>;
    wounds?: WH40KWounds;
    initiative?: WH40KInitiative;
    movement?: WH40KMovement;
    experience?: { total?: number; used?: number; available?: number; spent?: number };
    schema?: { fields?: Record<string, unknown> };
    _source?: Record<string, unknown>;
};

type BaseActorSheetActor = WH40KBaseActor & { system: BaseActorSheetSystem };
export type SkillLike = Partial<
    WH40KSkill & {
        hidden: boolean;
        trainingLevel: number;
        charShort: string;
        breakdown: string;
        tooltipData: string;
        isFavorite: boolean;
        showFavorite: boolean;
        isGranted: boolean;
    }
> &
    Record<string, unknown>;
export type CharacteristicLike = WH40KCharacteristic;
type TalentLike = WH40KItem & {
    system: WH40KItem['system'] & {
        tier?: number | string;
        tierLabel?: string;
        category?: string;
        categoryLabel?: string;
        fullName?: string;
        aptitudes?: string[];
        prerequisitesLabel?: string;
        hasPrerequisites?: boolean;
        cost?: number;
        benefit: unknown;
        description: unknown;
        [key: string]: unknown;
    };
    [key: string]: unknown;
};
type TraitLike = WH40KItem & {
    system: WH40KItem['system'] & {
        fullName?: string;
        category?: string;
        categoryLabel?: string;
        hasLevel?: boolean;
        level?: number;
        isVariable?: boolean;
        [key: string]: unknown;
    };
    [key: string]: unknown;
};
type TraitGroup = { category: string; categoryLabel: string; traits: Record<string, unknown>[] };
type TalentDisplay = Record<string, unknown> & {
    system: { tier?: number | string };
    tierLabel?: string;
};
type TraitDisplay = Record<string, unknown> & {
    name: string;
    system: { category?: string; hasLevel?: boolean };
};
type TraitCategoryKey = 'creature' | 'character' | 'elite' | 'unique' | 'origin' | 'general';
// HUD characteristic: WH40KCharacteristic plus the display-only fields written by
// _prepareCharacteristicsHUD. Tooltip helpers expect Record<string, unknown>, so this
// extension satisfies that boundary without losing the strong field types.
interface HudCharacteristic extends WH40KCharacteristic, Record<string, unknown> {
    progressCircumference?: number;
    progressOffset?: number;
    advanceProgress?: number;
    nextAdvanceCost?: number;
    tooltipData?: string;
    hudMod?: number;
    hudTotal?: number;
    hasBonus?: boolean;
    hasPenalty?: boolean;
    isMaxed?: boolean;
    unnaturalBonus?: number;
}
type PreviousSheetState = {
    wounds?: number;
    experience?: number;
    characteristics?: Record<string, { total?: number }>;
};
function getFlag<T>(actor: { getFlag(scope: string, key: string): unknown }, key: string): T | undefined {
    return actor.getFlag('wh40k-rpg', key) as T | undefined;
}

const ApplicationV2Base = ApplicationV2Mixin(ActorSheetV2) as unknown as AnyApplicationV2Ctor;
const PrimarySheetBase = PrimarySheetMixin(ApplicationV2Base) as unknown as AnyApplicationV2Ctor;
const TooltipBase = TooltipMixin(PrimarySheetBase);
const VisualFeedbackBase = VisualFeedbackMixin(TooltipBase) as unknown as AnyApplicationV2Ctor;
const AnimatedBase = EnhancedAnimationsMixin(VisualFeedbackBase) as unknown as AnyApplicationV2Ctor;
const CollapsibleBase = CollapsiblePanelMixin(AnimatedBase);
const ContextMenuBase = ContextMenuMixin(CollapsibleBase);
const DragDropBase = EnhancedDragDropMixin(ContextMenuBase);
const WhatIfBase = WhatIfMixin(DragDropBase) as unknown as AnyApplicationV2Ctor;
const StatBreakdownBase = StatBreakdownMixin(WhatIfBase);
const ItemPreviewBase = ItemPreviewMixin(
    StatBreakdownBase as unknown as new (...args: unknown[]) => foundry.appv1.sheets.ActorSheet,
) as unknown as AnyApplicationV2Ctor;
const BaseActorSheetBase = ActiveModifiersMixin(
    ItemPreviewBase as unknown as new (...args: unknown[]) => foundry.appv1.sheets.ActorSheet,
) as unknown as AnyApplicationV2Ctor;
/* eslint-enable no-restricted-syntax */

/**
 * Base actor sheet built on ApplicationV2.
 * All actor sheets should extend this class.
 */
export default class BaseActorSheet extends BaseActorSheetBase {
    // ---- Typed declarations from mixin chain (see sheet-mixin-types.ts) ----
    // The mixin chain casts to AnyApplicationV2Ctor at each step (any-erased),
    // so subclasses must re-`declare` every mixin-provided member to surface
    // its typed contract. This block is functionally a boundary surface — every
    // `unknown` / `Record<string, unknown>` mirrors a member of the boundary-
    // disabled BaseActorSheetMixins interface in sheet-mixin-types.ts.
    /* eslint-disable no-restricted-syntax -- mirrors the boundary-disabled BaseActorSheetMixins contract; see header */
    // Foundry base properties
    declare actor: BaseActorSheetActor;
    declare document: WH40KBaseActorDocument & { system: BaseActorSheetSystem };
    declare isEditable: boolean;
    declare tabGroups: Record<string, string>;

    // EnhancedAnimationsMixin
    declare _previousState: unknown;
    declare _mutationObserver: MutationObserver | null;
    declare _runningAnimations: Map<string, number>;
    declare _animationConfig: BaseActorSheetMixins['_animationConfig'];

    // VisualFeedbackMixin
    declare _previousValues: Map<string, unknown>;
    declare _lastSubmitTime: number;
    declare visualizeChanges: (changes: Record<string, unknown>) => void;

    // EnhancedAnimationsMixin public methods
    declare animateWoundsChange: (oldValue: number, newValue: number) => void;
    declare animateXPGain: (oldXP: number, newXP: number) => void;
    declare animateCharacteristicChange: (charKey: string, oldValue: number, newValue: number) => void;
    declare animateCharacteristicBonus: (charKey: string, oldBonus: number, newBonus: number) => void;
    declare animateCounter: (element: HTMLElement, fromValue: number, toValue: number, options?: Record<string, unknown>) => void;

    // TooltipMixin
    declare prepareCharacteristicTooltip: (key: string, characteristic: Record<string, unknown>, modifierSources?: Record<string, unknown>) => string;
    declare prepareSkillTooltip: (key: string, skill: Record<string, unknown>, characteristics: Record<string, unknown>) => string;
    declare prepareArmorTooltip: (location: string, armorData: Record<string, unknown>, equipped?: unknown[]) => string;
    declare prepareWeaponTooltip: (weapon: Record<string, unknown>) => string;
    declare prepareModifierTooltip: (title: string, sources: unknown[]) => string;
    declare prepareQualityTooltip: (identifier: string, level?: number | null) => string;

    // PrimarySheetMixin
    declare _filters: Record<string, Record<string, unknown>>;
    declare _mode: number | null;
    declare animateStatChange: (element: HTMLElement, type?: string) => void;
    declare animateValueChange: (element: HTMLElement, oldValue: number, newValue: number) => void;

    // CollapsiblePanelMixin
    declare expandedSections: Map<string, boolean>;
    declare togglePanel: (panelId: string, forceState?: boolean) => Promise<void>;
    declare expandAllPanels: () => Promise<void>;
    declare collapseAllPanels: () => Promise<void>;
    declare applyPanelPreset: (presetName: string) => Promise<void>;
    declare collapseAllExcept: (exceptPanelId: string) => Promise<void>;

    // WhatIfMixin
    declare _whatIfActive: boolean;
    declare _whatIfChanges: Record<string, unknown>;
    declare _whatIfPreview: WH40KBaseActorDocument | null;
    declare _whatIfImpacts: Array<{ type: string; message: string }>;
    declare enterWhatIfMode: () => Promise<void>;
    declare commitWhatIfChanges: () => Promise<void>;
    declare cancelWhatIfChanges: () => Promise<void>;
    declare exitWhatIfMode: () => Promise<void>;
    declare previewChange: (path: string, value: unknown) => Promise<void>;
    declare isWhatIfActive: () => boolean;
    declare getWhatIfState: () => { active: boolean; changes: Record<string, unknown>; impacts: Array<{ type: string; message: string }>; changeCount: number };

    // EnhancedDragDropMixin
    declare _draggedItem: { id: string; item: WH40KItem; element: HTMLElement } | null;
    declare _dragStartPos: { x: number; y: number } | null;
    declare _splitResult: { quantity: number } | null;
    declare removeFromFavorites: (itemId: string) => Promise<void>;
    declare clearFavorites: () => Promise<void>;
    declare getFavoriteItems: () => unknown[];

    // ActiveModifiersMixin
    declare prepareActiveModifiers: () => unknown;

    // Instance properties used by BaseActorSheet itself
    declare _updateListener:
        | ((document: WH40KBaseActorDocument, changes: Record<string, unknown>, options: Record<string, unknown>, userId: string) => void)
        | null;
    declare _clickOutsideHandler: ((event: Event) => void) | null;
    declare _resizeObserver: ResizeObserver | null;
    declare _traitsFilter: Record<string, unknown>;

    // Foundry base methods
    declare render: (options?: Record<string, unknown> | boolean) => Promise<this>;
    declare submit: () => Promise<void>;
    declare setPosition: (pos: Partial<{ top: number; left: number; width: number; height: number }>) => void;
    /* eslint-enable no-restricted-syntax */
    // These are declared as methods (not properties) so subclasses can override them
    // and call super. The actual implementation lives in Foundry's ApplicationV2 base,
    // which is erased by the mixin chain cast. These stubs restore type visibility by
    // delegating through the erased prototype chain via the AnyApplicationV2Ctor base.
    override _getHeaderControls(): foundry.applications.api.ApplicationV2.HeaderControlsEntry[] {
        const proto = Object.getPrototypeOf(BaseActorSheet.prototype) as {
            _getHeaderControls?: (this: BaseActorSheet) => foundry.applications.api.ApplicationV2.HeaderControlsEntry[];
        };
        return proto._getHeaderControls?.call(this) ?? [];
    }
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._onFirstRender signature uses Record<string,unknown> for context/options per Foundry's mixin-erased contract.
    override async _onFirstRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        const proto = Object.getPrototypeOf(BaseActorSheet.prototype) as {
            // eslint-disable-next-line no-restricted-syntax -- boundary: same mixin-erased proto shape
            _onFirstRender?: (this: BaseActorSheet, context: Record<string, unknown>, options: Record<string, unknown>) => Promise<void>;
        };
        await proto._onFirstRender?.call(this, context, options);
    }
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._preparePartContext signature uses Record<string,unknown> per Foundry's mixin-erased contract.
    async _preparePartContext(partId: string, context: Record<string, unknown>, options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const proto = Object.getPrototypeOf(BaseActorSheet.prototype) as {
            _preparePartContext?: (
                this: BaseActorSheet,
                partId: string,
                // eslint-disable-next-line no-restricted-syntax -- boundary: same mixin-erased proto shape
                context: Record<string, unknown>,
                // eslint-disable-next-line no-restricted-syntax -- boundary: same mixin-erased proto shape
                options: Record<string, unknown>,
                // eslint-disable-next-line no-restricted-syntax -- boundary: same mixin-erased proto shape (return type)
            ) => Promise<Record<string, unknown>>;
        };
        return (await proto._preparePartContext?.call(this, partId, context, options)) ?? {};
    }

    // CollapsiblePanelMixin static action handlers
    static _onTogglePanel: (event: Event, target: HTMLElement) => Promise<void>;
    static _onApplyPreset: (event: Event, target: HTMLElement) => Promise<void>;

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        /* eslint-disable @typescript-eslint/unbound-method -- Foundry's action dispatcher binds `this` to the sheet instance at invocation time. */
        actions: {
            editImage: BaseActorSheet.#onEditImage,
            roll: BaseActorSheet.#roll,
            itemRoll: BaseActorSheet.#itemRoll,
            itemEdit: BaseActorSheet.#itemEdit,
            itemDelete: BaseActorSheet.#itemDelete,
            itemVocalize: BaseActorSheet.#itemVocalize,
            itemCreate: BaseActorSheet.#itemCreate,
            // effectCreate: BaseActorSheet.#effectCreate,
            effectEdit: BaseActorSheet.#effectEdit,
            effectDelete: BaseActorSheet.#effectDelete,
            effectToggle: BaseActorSheet.#effectToggle,
            toggleSection: BaseActorSheet.#toggleSection,
            toggleTraining: BaseActorSheet.#toggleTraining,
            addSpecialistSkill: BaseActorSheet.#addSpecialistSkill,
            deleteSpecialization: BaseActorSheet.#deleteSpecialization,
            viewSkillInfo: BaseActorSheet.#viewSkillInfo,
            // eslint-disable-next-line no-restricted-syntax -- boundary: CollapsiblePanelMixin static methods are erased by the mixin-chain cast; runtime shape is accessed via unknown cast.
            togglePanel: (BaseActorSheet as unknown as { _onTogglePanel: (event: Event, target: HTMLElement) => Promise<void> })._onTogglePanel,
            // eslint-disable-next-line no-restricted-syntax -- boundary: same mixin-erased static method access
            applyPreset: (BaseActorSheet as unknown as { _onApplyPreset: (event: Event, target: HTMLElement) => Promise<void> })._onApplyPreset,
            spendXPAdvance: BaseActorSheet.#spendXPAdvance,
            editCharacteristic: BaseActorSheet.#editCharacteristic,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
        classes: ['wh40k-rpg', 'sheet', 'actor'],
        tag: 'form',
        form: {
            submitOnChange: false,
        },
        position: {
            width: 1050,
            height: 800,
        },
        window: {
            resizable: true,
        },
    };

    /* -------------------------------------------- */

    /**
     * A set of item types that should be prevented from being dropped on this type of actor sheet.
     * @type {Set<string>}
     */
    static unsupportedItemTypes = new Set();

    /* -------------------------------------------- */
    /*  Instance Properties                         */
    /* -------------------------------------------- */

    /**
     * Filter state for equipment panel.
     * @type {{ search: string, type: string, status: string }}
     */
    _equipmentFilter = { search: '', type: '', status: '' };

    /**
     * Filter state for skills panel.
     * @type {{ search: string, characteristic: string, training: string }}
     */
    _skillsFilter = { search: '', characteristic: '', training: '' };

    /**
     * Scroll positions for scrollable containers.
     * @type {Map<string, number>}
     */
    _scrollPositions = new Map<string, number>();

    /**
     * Whether state has been restored for this sheet instance.
     * @type {boolean}
     * @private
     */
    _stateRestored = false;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._prepareContext returns Record<string,unknown>; concrete fields declared below in the intersection type.
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        /* eslint-disable no-restricted-syntax -- boundary: sheet→template context; fields whose runtime shape comes from Foundry's untyped template payload are typed as unknown here. */
        const context: Record<string, unknown> & {
            actor: BaseActorSheetActor;
            system: BaseActorSheetSystem;
            fields: Record<string, unknown>;
            effects: unknown[];
            items: unknown[];
            rollableClass: string;
            source?: unknown;
            skillTrainingConfig?: unknown;
        } = {
            ...(await super._prepareContext(options as never)),
            actor: this.actor,
            system: this.actor.system,
            fields: this.actor.system.schema?.fields ?? {},
            effects: this.actor.getEmbeddedCollection('ActiveEffect').contents,
            items: Array.from(this.actor.items),
            rollableClass: this.isEditable ? 'rollable' : '',
        };
        // Use raw source data for form fields. DocumentSheetV2 expects source context to reflect
        // persisted data, while `system` may contain derived/prepared values used only for display.
        context.source = this.isEditable ? this.actor.system._source : this.actor.system;

        // Universal context flags every actor sheet wants (isGM, dh config). PC/NPC/ruleset
        // state lives on CharacterSheet because it's character-specific.
        this._prepareCommonContext(context);

        // Prepare characteristics with HUD data
        this._prepareCharacteristicsHUD(context);

        // Skill training rank config (system-specific)
        context.skillTrainingConfig = this._getSkillTrainingConfig();

        // Prepare skills
        this._prepareSkills(context);

        // Prepare items by category
        this._prepareItems(context);

        return context;
    }
    /* eslint-enable no-restricted-syntax */

    /* -------------------------------------------- */

    /**
     * Augment context with the universal flags every actor sheet relies on.
     * Subclasses must NOT redeclare these — let inheritance do the work. If a
     * subclass needs to overlay ruleset / edit-mode / NPC flags, it should do
     * so in its own `_prepareContext` after the super call returns.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context is the mixin-erased sheet→template payload Record<string,unknown>.
    protected _prepareCommonContext(context: Record<string, unknown>): void {
        context['isGM'] = game.user.isGM;
        context['dh'] = CONFIG.wh40k ?? WH40K;
    }

    /* -------------------------------------------- */

    /**
     * Prepare characteristics with progress ring calculations.
     * @param {object} context  Context being prepared.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _context is the mixin-erased sheet→template payload Record<string,unknown>.
    _prepareCharacteristicsHUD(_context: Record<string, unknown>): void {
        const characteristics = this.actor.system.characteristics as Record<string, HudCharacteristic>;

        for (const [key, char] of Object.entries(characteristics)) {
            // Calculate advancement progress (0-5)
            const advanceProgress = char.advance / 5; // 0.0 to 1.0

            // SVG circle calculations (circumference = 2 * π * r, where r=52)
            const radius = 52;
            const circumference = 2 * Math.PI * radius; // ≈ 327
            char.progressCircumference = circumference;
            char.progressOffset = circumference * (1 - advanceProgress);
            char.advanceProgress = Math.round(advanceProgress * 100); // Percentage

            // Calculate XP cost for next advance (follows WH40K progression)
            // Simple: 100, Intermediate: 250, Trained: 500, Proficient: 750, Expert: 1000
            const advanceCosts = [100, 250, 500, 750, 1000];
            const nextAdvance = char.advance;
            char.nextAdvanceCost = (nextAdvance < 5 ? advanceCosts[nextAdvance] : 0) ?? 0;

            // Prepare tooltip data if not already present
            if (typeof char.tooltipData !== 'string' || char.tooltipData === '') {
                char.tooltipData = this.prepareCharacteristicTooltip(key, char);
            }

            // HUD display formatting - hudMod is the characteristic bonus (tens digit)
            char.hudMod = char.bonus !== 0 ? char.bonus : Math.floor(char.total / 10);
            char.hudTotal = char.total;

            // HUD State flags for visual styling (used by V1 HUD)
            char.hasBonus = char.modifier > 0;
            char.hasPenalty = char.modifier < 0;
            char.isMaxed = char.advance >= 5;

            // Calculate unnatural bonus if applicable
            const unnaturalMult = char.unnatural || 1;
            if (unnaturalMult > 1) {
                const baseBonus = Math.floor(char.total / 10);
                char.unnaturalBonus = baseBonus * unnaturalMult;
            }
        }
    }

    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._onClose signature uses Record<string,unknown> per Foundry's mixin-erased contract.
    override _onClose(options: Record<string, unknown>): void {
        // Save state before closing
        this._saveSheetState();

        super._onClose(options);

        // Clean up hook listener
        if (this._updateListener) {
            Hooks.off('updateActor', this._updateListener);
            this._updateListener = null;
        }

        // Clean up click-outside handler
        if (this._clickOutsideHandler) {
            document.removeEventListener('click', this._clickOutsideHandler);
            this._clickOutsideHandler = null;
        }

        // Clean up resize observer
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
    }

    /* -------------------------------------------- */
    /*  State Persistence                           */
    /* -------------------------------------------- */

    /**
     * Save current sheet state to actor flags.
     * Captures scroll positions, filter states, search terms, and window size.
     * @protected
     */
    _saveSheetState(): void {
        // Capture scroll positions before saving
        this._captureScrollPositions();

        const scrollPositions: Record<string, number> = Object.fromEntries(this._scrollPositions);
        const state = {
            scrollPositions,
            windowSize: {
                width: this.position.width,
                height: this.position.height,
            },
        };

        // Use setFlag - this is async but we don't await it on close
        void this.actor.setFlag('wh40k-rpg', 'sheetState', state);
    }

    /**
     * Restore sheet state from actor flags.
     * Called after first render to restore previous state.
     * @returns {Promise<void>}
     * @protected
     */
    _restoreSheetState(): void {
        if (this._stateRestored) return;
        this._stateRestored = true;

        const state = getFlag<{
            scrollPositions?: Record<string, number>;
            windowSize?: { width?: number; height?: number };
        }>(this.actor, 'sheetState');
        if (!state) return;

        // Restore scroll positions
        if (state.scrollPositions) {
            this._scrollPositions = new Map(Object.entries(state.scrollPositions));
        }

        // Restore window size if different from default
        const winSize = state.windowSize;
        if (winSize?.width !== undefined && winSize.height !== undefined) {
            const ctor = this.constructor as typeof BaseActorSheet;
            const defaultPos = ctor.DEFAULT_OPTIONS.position;
            if (winSize.width !== defaultPos?.width || winSize.height !== defaultPos.height) {
                this.setPosition({
                    width: winSize.width,
                    height: winSize.height,
                });
            }
        }

        // Apply filter states to DOM after a brief delay to ensure elements exist
        setTimeout(() => this._applyRestoredState(), 50);
    }

    /**
     * Apply restored state to DOM elements.
     * @protected
     */
    _applyRestoredState(): void {
        const root = this.element;
        // Apply equipment filters
        {
            const eqFilter = this._equipmentFilter;
            const searchInput = root.querySelector<HTMLInputElement>('.wh40k-equipment-search');
            const typeFilter = root.querySelector<HTMLSelectElement>('.wh40k-equipment-type-filter');
            const statusFilter = root.querySelector<HTMLSelectElement>('.wh40k-equipment-status-filter');

            if (searchInput !== null && eqFilter.search !== '') {
                searchInput.value = eqFilter.search;
            }
            if (typeFilter !== null && eqFilter.type !== '') {
                typeFilter.value = eqFilter.type;
            }
            if (statusFilter !== null && eqFilter.status !== '') {
                statusFilter.value = eqFilter.status;
            }

            // Trigger filter if any values are set
            if (eqFilter.search !== '' || eqFilter.type !== '' || eqFilter.status !== '') {
                searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

        // Apply skills filters
        {
            const skFilter = this._skillsFilter;
            const searchInput = root.querySelector<HTMLInputElement>('.wh40k-skills-search');
            const charFilter = root.querySelector<HTMLSelectElement>('.wh40k-skills-char-filter');
            const trainingFilter = root.querySelector<HTMLSelectElement>('.wh40k-skills-training-filter');

            if (searchInput !== null && skFilter.search !== '') {
                searchInput.value = skFilter.search;
            }
            if (charFilter !== null && skFilter.characteristic !== '') {
                charFilter.value = skFilter.characteristic;
            }
            if (trainingFilter !== null && skFilter.training !== '') {
                trainingFilter.value = skFilter.training;
            }

            // Trigger filter if any values are set
            if (skFilter.search !== '' || skFilter.characteristic !== '' || skFilter.training !== '') {
                searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

        // Apply scroll positions
        this._applyScrollPositions();
    }

    /**
     * Capture current scroll positions of scrollable containers.
     * @protected
     */
    _captureScrollPositions(): void {
        // Common scrollable containers
        const scrollableSelectors = [
            '.wh40k-body',
            '.wh40k-skills-columns',
            '.wh40k-all-items-grid',
            '.wh40k-talents-grid',
            '.scrollable',
            '[data-scrollable]',
        ];

        scrollableSelectors.forEach((selector) => {
            const elements = this.element.querySelectorAll<HTMLElement>(selector);
            elements.forEach((el, index) => {
                const key = `${selector}-${index}`;
                if (el.scrollTop > 0) {
                    this._scrollPositions.set(key, el.scrollTop);
                }
            });
        });
    }

    /**
     * Apply saved scroll positions to scrollable containers.
     * @protected
     */
    _applyScrollPositions(): void {
        if (this._scrollPositions.size === 0) return;

        const scrollableSelectors = [
            '.wh40k-body',
            '.wh40k-skills-columns',
            '.wh40k-all-items-grid',
            '.wh40k-talents-grid',
            '.scrollable',
            '[data-scrollable]',
        ];

        scrollableSelectors.forEach((selector) => {
            const elements = this.element.querySelectorAll<HTMLElement>(selector);
            elements.forEach((el, index) => {
                const key = `${selector}-${index}`;
                const savedPosition = this._scrollPositions.get(key);
                if (savedPosition !== undefined) {
                    el.scrollTop = savedPosition;
                }
            });
        });
    }

    /* -------------------------------------------- */

    /**
     * Prepare skills context for rendering.
     * @param {object} context  Context being prepared.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context is the mixin-erased sheet→template payload Record<string,unknown>.
    _prepareSkills(context: Record<string, unknown>): void {
        const skills = this.actor.system.skills;
        const characteristics = this.actor.system.characteristics;

        // Apply filters
        const filters = this._skillsFilter;
        const filterSearch = typeof filters.search === 'string' ? filters.search : '';
        const filterCharacteristic = typeof filters.characteristic === 'string' ? filters.characteristic : '';
        const filterTraining = typeof filters.training === 'string' ? filters.training : '';
        const visibleSkills = (Object.entries(skills) as Array<[string, SkillLike]>).filter(([key, data]) => {
            if (data.hidden === true) return false;

            // Search filter
            if (filterSearch !== '') {
                const searchLower = filterSearch.toLowerCase();
                const labelRaw = typeof data.label === 'string' && data.label !== '' ? data.label : key;
                const label = labelRaw.toLowerCase();
                if (!label.includes(searchLower)) return false;
            }

            // Characteristic filter
            if (filterCharacteristic !== '' && data.characteristic !== filterCharacteristic) {
                return false;
            }

            // Training filter
            if (filterTraining !== '') {
                const level = this._getTrainingLevel(data);
                if (filterTraining === 'trained' && level < 1) return false;
                if (filterTraining === 'untrained' && level > 0) return false;
            }

            return true;
        });

        // Sort by label
        visibleSkills.sort((a, b) => {
            const labelA = typeof a[1].label === 'string' && a[1].label !== '' ? a[1].label : a[0];
            const labelB = typeof b[1].label === 'string' && b[1].label !== '' ? b[1].label : b[0];
            return labelA.localeCompare(labelB, game.i18n.lang);
        });

        // Split into categories
        const standard: Array<[string, SkillLike]> = [];
        const specialist: Array<[string, SkillLike]> = [];

        for (const [key, data] of visibleSkills) {
            // Augment with computed properties
            this._augmentSkillData(key, data, characteristics);

            if (data.entries !== undefined) {
                // Specialist skill - process entries
                // eslint-disable-next-line no-restricted-syntax -- boundary: DataModel skill entries field is untyped; narrowed below via Array.isArray guard.
                const rawEntries: unknown = data.entries;
                const entryList: SkillLike[] = Array.isArray(rawEntries)
                    ? (rawEntries as SkillLike[])
                    : typeof rawEntries === 'object' && rawEntries !== null
                    ? (Object.values(rawEntries) as SkillLike[])
                    : [];
                const plainEntries: SkillLike[] = entryList.map((entry, entryIndex) => {
                    if (typeof entry === 'string') {
                        const stringEntry: SkillLike = {
                            name: entry,
                            slug: toCamelCase(entry),
                            basic: data.advanced !== true,
                            trained: false,
                            plus10: false,
                            plus20: false,
                            bonus: 0,
                            notes: '',
                            cost: 0,
                            current: 0,
                            skillKey: key, // Store skill key for template access
                            entryIndex: entryIndex, // Store index for template access
                        };
                        if (data.characteristic !== undefined) stringEntry.characteristic = data.characteristic;
                        if (data.advanced !== undefined) stringEntry.advanced = data.advanced;
                        return stringEntry;
                    }

                    const normalized: SkillLike = { ...entry };
                    const candidateName =
                        typeof normalized['name'] === 'string' && normalized['name'] !== ''
                            ? normalized['name']
                            : typeof normalized.label === 'string' && normalized.label !== ''
                            ? normalized.label
                            : typeof normalized['slug'] === 'string'
                            ? normalized['slug']
                            : '';
                    normalized['name'] = candidateName;
                    if ((typeof normalized['slug'] !== 'string' || normalized['slug'] === '') && candidateName !== '') {
                        normalized['slug'] = toCamelCase(candidateName);
                    }
                    if (normalized.characteristic === undefined || normalized.characteristic === '') {
                        if (data.characteristic !== undefined) normalized.characteristic = data.characteristic;
                    }
                    if (normalized.advanced === undefined) {
                        if (data.advanced !== undefined) normalized.advanced = data.advanced;
                    }
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- ??= blocked by no-restricted-syntax; explicit if-assignment is correct here.
                    if (normalized.basic === undefined) {
                        normalized.basic = data.advanced !== true;
                    }
                    // Store skill key and index for template access
                    normalized['skillKey'] = key;
                    normalized['entryIndex'] = entryIndex;
                    return normalized;
                });

                // Check favorite status for specialist skills
                const specialistFavorites = getFlag<string[]>(this.actor, 'favoriteSpecialistSkills') ?? [];

                plainEntries.forEach((entry) => {
                    this._augmentSkillData(key, entry, characteristics, data);
                    // Check if this specialist entry is a favorite
                    const favoriteKey = `${String(entry['skillKey'])}:${String(entry['entryIndex'])}`;
                    entry.isFavorite = specialistFavorites.includes(favoriteKey);
                });

                // // Get suggested specializations from compendium for autocomplete
                // data.suggestedSpecializations = this._getSkillSuggestions(key);

                // Create plain object with converted entries
                // eslint-disable-next-line no-restricted-syntax -- boundary: mixin-chain type-erasure forces double cast to satisfy SkillLike index signature.
                specialist.push([key, { ...data, entries: plainEntries } as unknown as SkillLike]);
            } else {
                // Standard skill
                standard.push([key, data]);
            }
        }

        // DH2e (and the other d100 lines in this codebase) have no separate "Advanced Skills"
        // tier — every skill rolls on its characteristic with the usual untrained penalty.
        // Render all standard skills in the same alphabetised two-column grid; the previously
        // separate `advancedUntrained` slice is retained as an empty array so consumers that
        // still read it don't break. See issue #2.
        const splitIndex = Math.ceil(standard.length / 2);
        const standardColumns = [standard.slice(0, splitIndex), standard.slice(splitIndex)];
        const advancedUntrained: typeof standard = [];

        // Check if any specialist skill has entries (for empty state display)
        const hasSpecialistEntries = specialist.some(([_, skillData]) => {
            const entries = skillData.entries;
            return Array.isArray(entries) && entries.length > 0;
        });

        context['skillLists'] = { standard, trainedStandard: standard, advancedUntrained, specialist, standardColumns, hasSpecialistEntries };
    }

    /**
     * Map characteristic short names to full keys.
     * @param {string} short  Short name (e.g., "Ag", "WS")
     * @returns {string}  Full characteristic key (e.g., "agility", "weaponSkill")
     * @private
     */
    _charShortToKey(short: string): string {
        // Use the same map as CommonTemplate for consistency
        const map: Record<string, string> = {
            WS: 'weaponSkill',
            BS: 'ballisticSkill',
            S: 'strength',
            T: 'toughness',
            Ag: 'agility',
            Int: 'intelligence',
            Per: 'perception',
            WP: 'willpower',
            Fel: 'fellowship',
            Inf: 'influence',
        };
        return map[short] || short.toLowerCase();
    }

    /**
     * Augment skill data with computed display properties.
     * @param {string} key  Skill key
     * @param {object} data  Skill or entry data
     * @param {object} characteristics  Actor characteristics
     * @param {object} [parentSkill]  Parent skill for specialist entries
     * @protected
     */
    _augmentSkillData(key: string, data: SkillLike, characteristics: Record<string, CharacteristicLike>, parentSkill: SkillLike | null = null): void {
        const charShort = String(data.characteristic ?? parentSkill?.characteristic ?? 'S');
        const charKey = this._charShortToKey(charShort);
        const char = characteristics[charKey];

        // Training level (0-4)
        data.trainingLevel = this._getTrainingLevel(data);

        // Training indicators for template iteration
        const config = this._getSkillTrainingConfig();
        data['trainingIndicators'] = config.map((rank) => ({
            label: rank.label,
            tooltip: rank.tooltip,
            active: (data.trainingLevel ?? 0) >= rank.level,
        }));

        // Characteristic short name
        data.charShort = char !== undefined && char.short !== '' ? char.short : charKey;

        // Breakdown string for tooltip/title
        data.breakdown = char !== undefined ? this._getSkillBreakdown(data, char) : '';

        // Tooltip data (JSON string)
        data.tooltipData = this.prepareSkillTooltip(key, data, characteristics);

        // Check if skill is favorite (auto-remove if untrained advanced)
        const favorites = getFlag<string[]>(this.actor, 'favoriteSkills') ?? [];
        const isUntrainedAdvanced = data.advanced === true && (data.trainingLevel ?? 0) === 0;
        if (isUntrainedAdvanced && favorites.includes(key)) {
            // Auto-unfavourite untrained advanced skills
            const updated = favorites.filter((f: string) => f !== key);
            void this.actor.setFlag('wh40k-rpg', 'favoriteSkills', updated);
            data.isFavorite = false;
        } else {
            data.isFavorite = favorites.includes(key);
        }
        data.showFavorite = !isUntrainedAdvanced;

        // Check if advanced skill is granted (for locking)
        data.isGranted = this._isSkillGranted(key, data);
    }

    /**
     * Get skill training rank definitions for the current game system.
     * Override in subclasses for system-specific ranks.
     * Each rank maps a training level (1+) to its display label, tooltip, and bonus.
     * @returns {Array<{level: number, key: string, label: string, tooltip: string, bonus: number}>}
     * @protected
     */
    _getSkillTrainingConfig(): Array<{ level: number; key: string; label: string; tooltip: string; bonus: number }> {
        // Default: Rogue Trader style (T / +10 / +20)
        return [
            { level: 1, key: 'trained', label: 'T', tooltip: 'Trained', bonus: 0 },
            { level: 2, key: 'plus10', label: '+10', tooltip: '+10', bonus: 10 },
            { level: 3, key: 'plus20', label: '+20', tooltip: '+20', bonus: 20 },
        ];
    }

    /**
     * Get training level from skill data.
     * @param {object} skill  Skill or entry data
     * @returns {number}  Training level (0-4)
     * @protected
     */
    _getTrainingLevel(skill: SkillLike): number {
        if (skill.plus30 === true) return 4;
        if (skill.plus20 === true) return 3;
        if (skill.plus10 === true) return 2;
        if (skill.trained === true) return 1;
        return 0;
    }

    /**
     * Get skill breakdown string for display.
     * @param {object} skill  Skill data
     * @param {object} char  Characteristic data
     * @returns {string}  Breakdown string
     * @protected
     */
    _getSkillBreakdown(skill: SkillLike, char: CharacteristicLike | undefined): string {
        const charTotal = char?.total ?? 0;
        const level = this._getTrainingLevel(skill);
        const baseValue = level > 0 ? charTotal : Math.floor(charTotal / 2);
        const trainingBonus = level >= 4 ? 30 : level >= 3 ? 20 : level >= 2 ? 10 : 0;
        const bonus = skill.bonus ?? 0;
        const charLabel = char?.short !== undefined && char.short !== '' ? char.short : skill.characteristic ?? '';

        const parts: string[] = [];
        if (level > 0) {
            parts.push(`${charLabel}: ${charTotal}`);
        } else {
            parts.push(`${charLabel}: ${charTotal}/2 = ${baseValue}`);
        }
        if (trainingBonus > 0) parts.push(`Training: +${trainingBonus}`);
        if (bonus !== 0) parts.push(`Bonus: ${bonus >= 0 ? '+' : ''}${bonus}`);

        return parts.join(', ');
    }

    // /**
    //  * Get suggested specializations for a skill from the compendium.
    //  * @param {string} skillKey  Skill key (e.g., "commonLore", "trade")
    //  * @returns {string[]}  Array of suggested specialization names
    //  * @protected
    //  */
    // _getSkillSuggestions(skillKey) {
    //     // Access the tooltip system's cached skill descriptions
    //     const tooltips = game.wh40k?.tooltips;
    //     if (!tooltips) return [];
    //
    //     // Get skill description from compendium cache
    //     const skillDesc = tooltips.getSkillDescription(skillKey);
    //     if (!skillDesc) return [];
    //
    //     // Return specializations array if it exists
    //     return skillDesc.specializations || [];
    // }

    /**
     * Check if skill is granted by talents, traits, or origin paths.
     * Basic skills are always granted. Advanced skills need explicit grants.
     * @param {string} skillKey  Skill key
     * @param {object} skillData  Skill data object
     * @returns {boolean}  True if skill is granted (or is basic)
     * @protected
     */
    _isSkillGranted(_skillKey: string, skillData: SkillLike): boolean {
        // Basic skills are always granted
        if (skillData.advanced !== true) return true;

        // Advanced skills need to check for grants
        // Check if any training level is set (means granted at some point)
        if (skillData.trained === true || skillData.plus10 === true || skillData.plus20 === true) return true;

        // Check if granted by talents/traits/origin paths
        // This is a simplified check - a more complete implementation would scan
        // all talents, traits, and origin paths for skill grants
        const skillLabel = typeof skillData.label === 'string' ? skillData.label.toLowerCase() : '';
        if (skillLabel === '') return false;
        type SkillGrantsBearing = { grants?: { skills?: Array<{ name?: string } | string> } };
        const items = this.actor.items;
        for (const item of items) {
            const sys: SkillGrantsBearing = item.system as SkillGrantsBearing;
            const skillGrants = sys.grants?.skills;
            if (skillGrants === undefined) continue;
            for (const grant of skillGrants) {
                const grantName = typeof grant === 'string' ? grant : grant.name;
                if (grantName === undefined || grantName === '') continue;
                if (grantName.toLowerCase() === skillLabel) {
                    return true;
                }
            }
        }

        return false;
    }

    /* -------------------------------------------- */
    /*  Talents Preparation                         */
    /* -------------------------------------------- */

    /**
     * Prepare talents context for rendering.
     * @returns {Object} Talents data with grouping
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns sheet→template payload Record<string,unknown> consumed by Handlebars.
    _prepareTalentsContext(): Record<string, unknown> {
        const talents = this.actor.items.filter((i) => (i.type as string) === 'talent');
        const traits = this.actor.items.filter((i) => (i.type as string) === 'trait');

        // Augment with display properties
        const augmentedTalents = talents.map((t) => this._augmentTalentData(t as TalentLike));
        const augmentedTraits = traits.map((t) => this._augmentTraitData(t as TraitLike));

        // Group by tier
        const groupedByTier = this._groupTalentsByTier(augmentedTalents);

        // Extract unique categories
        const categories = this._getTalentCategories(talents as TalentLike[]);

        return {
            talents: augmentedTalents,
            traits: augmentedTraits,
            groupedByTier,
            categories,
            tiers: [1, 2, 3],
            talentsCount: talents.length,
            traitsCount: traits.length,
        };
    }

    /**
     * Augment talent with display properties.
     * @param {TalentData} talent  Talent item
     * @returns {Object} Augmented talent data
     * @protected
     */
    _augmentTalentData(talent: TalentLike): TalentDisplay {
        // Check if this talent is favorited
        const favorites = getFlag<string[]>(this.actor, 'favoriteTalents') ?? [];
        const isFavorite = talent.id !== null && talent.id !== '' ? favorites.includes(talent.id) : false;

        // Build tooltip text from description/benefit
        // Handle cases where these might be objects (ProseMirror) or undefined
        const rawBenefit = talent.system.benefit;
        const rawDescription = talent.system.description;
        const benefit = typeof rawBenefit === 'string' ? rawBenefit : '';
        const description = typeof rawDescription === 'string' ? rawDescription : '';

        let tooltipText = talent.name;
        if (benefit !== '') {
            // Strip HTML tags for tooltip
            tooltipText = benefit.replace(/<[^>]*>/g, '').trim();
        } else if (description !== '') {
            tooltipText = description.replace(/<[^>]*>/g, '').trim();
        }
        // Truncate if too long
        if (tooltipText.length > 200) {
            tooltipText = `${tooltipText.substring(0, 197)}...`;
        }

        const sys = talent.system;
        const tier = sys.tier ?? 0;
        const cost = sys.cost ?? 0;
        return {
            id: talent.id,
            _id: talent._id,
            name: talent.name,
            img: talent.img,
            type: talent.type,
            system: sys,
            tierLabel: sys.tierLabel ?? `Tier ${tier}`,
            categoryLabel: sys.categoryLabel ?? '',
            fullName: sys.fullName ?? talent.name,
            aptitudesLabel: this._formatAptitudes(sys.aptitudes ?? []),
            prerequisitesLabel: sys.prerequisitesLabel ?? '',
            hasPrerequisites: sys.hasPrerequisites ?? false,
            costLabel: cost > 0 ? `${cost} XP` : '—',
            isFavorite: isFavorite,
            flags: talent.flags,
            tooltipText: tooltipText,
        };
    }

    /**
     * Augment trait with display properties.
     * @param {Item} trait  Trait item
     * @returns {Object} Augmented trait data
     * @protected
     */
    _augmentTraitData(trait: TraitLike): TraitDisplay {
        const sys = trait.system;
        const level = sys.level ?? 0;
        const category = sys.category ?? 'general';
        return {
            id: trait.id,
            _id: trait._id,
            name: trait.name,
            img: trait.img,
            type: trait.type,
            system: sys,
            fullName: sys.fullName ?? trait.name,
            categoryLabel: sys.categoryLabel ?? '',
            hasLevel: sys.hasLevel ?? false,
            levelLabel: level > 0 ? `(${level})` : '',
            isVariable: sys.isVariable ?? false,
            categoryIcon: this._getTraitIcon(category),
            categoryColor: this._getTraitCategoryColor(category),
        };
    }

    /**
     * Group talents by tier for display.
     * @param {Object[]} talents  Array of talent objects
     * @returns {Object[]} Array of tier groups
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns sheet→template payload where talent group shape is untyped Handlebars data.
    _groupTalentsByTier(talents: TalentDisplay[]): Record<string, unknown>[] {
        // eslint-disable-next-line no-restricted-syntax -- boundary: same template-payload shape for talent groups.
        type TalentGroup = { tier: number; tierLabel: string; talents: Array<Record<string, unknown>> };
        const groups: Map<number, TalentGroup> = new Map();

        for (const talent of talents) {
            const sys = talent.system;
            const tier = Number(sys.tier ?? 0);
            let group = groups.get(tier);
            if (group === undefined) {
                group = {
                    tier,
                    tierLabel: talent.tierLabel !== undefined && talent.tierLabel !== '' ? talent.tierLabel : `Tier ${tier}`,
                    talents: [],
                };
                groups.set(tier, group);
            }
            group.talents.push(talent);
        }

        // Convert to sorted array
        return Array.from(groups.values()).sort((a, b) => a.tier - b.tier);
    }

    /**
     * Extract unique categories from talents.
     * @param {Item[]} talents  Array of talent items
     * @returns {string[]} Sorted unique categories
     * @protected
     */
    _getTalentCategories(talents: TalentLike[]): string[] {
        const categories = new Set<string>();
        for (const talent of talents) {
            const cat = talent.system.category;
            if (cat !== undefined && cat !== '') {
                categories.add(cat);
            }
        }
        return Array.from(categories).sort();
    }

    /**
     * Format aptitudes array as readable string.
     * @param {string[]} aptitudes  Array of aptitude names
     * @returns {string} Formatted string
     * @protected
     */
    _formatAptitudes(aptitudes: string[]): string {
        if (aptitudes.length === 0) return '—';
        return aptitudes.join(', ');
    }

    /* -------------------------------------------- */
    /*  Traits Preparation Methods                  */
    /* -------------------------------------------- */

    /**
     * Prepare context data for traits tab/panel.
     * @param {object} context  Base context
     * @returns {object} Augmented context with traits data
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context and return value are the mixin-erased sheet→template payload Record<string,unknown>.
    _prepareTraitsContext(context: Record<string, unknown>): Record<string, unknown> {
        const traits = (context['items'] as TraitLike[]).filter((i) => i.type === 'trait');

        // Apply filters if present
        let filteredTraits = traits;
        const filter = this._traitsFilter as {
            search?: string;
            category?: string;
            hasLevel?: boolean;
        };

        const filterSearch = typeof filter.search === 'string' ? filter.search : '';
        if (filterSearch !== '') {
            const search = filterSearch.toLowerCase();
            filteredTraits = filteredTraits.filter((t) => t.name.toLowerCase().includes(search));
        }

        const filterCategory = typeof filter.category === 'string' ? filter.category : '';
        if (filterCategory !== '' && filterCategory !== 'all') {
            filteredTraits = filteredTraits.filter((t) => t.system.category === filterCategory);
        }

        if (filter.hasLevel === true) {
            filteredTraits = filteredTraits.filter((t) => t.system.hasLevel === true);
        }

        // Augment with display properties
        const augmentedTraits = filteredTraits.map((t) => this._augmentTraitData(t));

        // Group by category
        const groupedByCategory = this._groupTraitsByCategory(augmentedTraits);

        // Extract unique categories
        const categories = this._getTraitCategories(traits);

        return {
            ...context,
            traits: augmentedTraits,
            groupedByCategory,
            categories,
            traitsCount: traits.length,
            filter: filter,
        };
    }

    /**
     * Group traits by category for display.
     * @param {Object[]} traits  Array of trait objects
     * @returns {Object[]} Array of category groups
     * @protected
     */
    _groupTraitsByCategory(traits: TraitDisplay[]): TraitGroup[] {
        const groups: Record<TraitCategoryKey, TraitGroup> = {
            creature: { category: 'creature', categoryLabel: 'Creature', traits: [] },
            character: { category: 'character', categoryLabel: 'Character', traits: [] },
            elite: { category: 'elite', categoryLabel: 'Elite', traits: [] },
            unique: { category: 'unique', categoryLabel: 'Unique', traits: [] },
            origin: { category: 'origin', categoryLabel: 'Origin Path', traits: [] },
            general: { category: 'general', categoryLabel: 'General', traits: [] },
        };

        const validCategories: ReadonlySet<TraitCategoryKey> = new Set(Object.keys(groups) as TraitCategoryKey[]);
        for (const trait of traits) {
            const raw = trait.system.category;
            const category: TraitCategoryKey =
                typeof raw === 'string' && raw !== '' && validCategories.has(raw as TraitCategoryKey) ? (raw as TraitCategoryKey) : 'general';
            groups[category].traits.push(trait);
        }

        // Convert to array and filter out empty groups
        return Object.values(groups).filter((group) => group.traits.length > 0);
    }

    /**
     * Get unique trait categories from traits list.
     * @param {Array<Item>} traits  Trait items
     * @returns {Array<Object>} Category options
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: traits and return value use Record<string,unknown> to satisfy Handlebars template-payload shape.
    _getTraitCategories(traits: Array<Record<string, unknown> & { system: { category?: string } }>): Record<string, unknown>[] {
        const categories = new Set<string>();
        for (const trait of traits) {
            const cat = trait.system.category;
            categories.add(cat !== undefined && cat !== '' ? cat : 'general');
        }

        return Array.from(categories)
            .sort()
            .map((cat: string) => ({
                value: cat,
                label: this._getCategoryLabel(cat),
            }));
    }

    /**
     * Get icon for trait category.
     * @param {string} category  Trait category
     * @returns {string} Font Awesome icon class
     * @protected
     */
    _getTraitIcon(category: string): string {
        const icons: Record<TraitCategoryKey, string> = {
            creature: 'fa-paw',
            character: 'fa-user-shield',
            elite: 'fa-star',
            unique: 'fa-gem',
            origin: 'fa-route',
            general: 'fa-shield-alt',
        };
        return icons[category as TraitCategoryKey] || 'fa-shield-alt';
    }

    /**
     * Get color class for trait category.
     * @param {string} category  Trait category
     * @returns {string} CSS class
     * @protected
     */
    _getTraitCategoryColor(category: string): string {
        const colors: Record<TraitCategoryKey, string> = {
            creature: 'trait-creature',
            character: 'trait-character',
            elite: 'trait-elite',
            unique: 'trait-unique',
            origin: 'trait-origin',
            general: 'trait-general',
        };
        return colors[category as TraitCategoryKey] || 'trait-general';
    }

    /**
     * Get label for category.
     * @param {string} category  Category key
     * @returns {string} Human-readable label
     * @protected
     */
    _getCategoryLabel(category: string): string {
        const labels: Record<TraitCategoryKey, string> = {
            creature: 'Creature',
            character: 'Character',
            elite: 'Elite',
            unique: 'Unique',
            origin: 'Origin Path',
            general: 'General',
        };
        return labels[category as TraitCategoryKey] || 'General';
    }

    /* -------------------------------------------- */

    /**
     * Prepare items display across the sheet.
     * @param {object} context  Context being prepared.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context is the mixin-erased sheet→template payload Record<string,unknown>.
    _prepareItems(context: Record<string, unknown>): void {
        const itemsByType: Record<string, WH40KItem[] | undefined> = {};

        for (const item of this.actor.items) {
            const type = item.type;
            const bucket = itemsByType[type];
            if (bucket === undefined) {
                itemsByType[type] = [item];
            } else {
                bucket.push(item);
            }
        }

        // Sort each category
        for (const items of Object.values(itemsByType)) {
            items?.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
        }

        context['itemsByType'] = itemsByType;

        // Create common item categories
        context['weapons'] = itemsByType['weapon'] ?? [];
        context['armourItems'] = itemsByType['armour'] ?? [];
        context['talents'] = itemsByType['talent'] ?? [];
        context['traits'] = itemsByType['trait'] ?? [];
        context['gearItems'] = itemsByType['gear'] ?? [];
        context['psychicPowers'] = itemsByType['psychicPower'] ?? [];
        context['cybernetics'] = itemsByType['cybernetic'] ?? [];
        context['conditions'] = itemsByType['condition'] ?? [];
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    // /**
    //  * Handle form submission - override from ApplicationV2.
    //  * @param {FormDataExtended} formData   The parsed form data
    //  * @param {SubmitEvent} event           The form submission event
    //  * @returns {Promise<void>}
    //  * @override
    //  * @protected
    //  */
    // async #onSubmitForm(formData, event) {
    //     // Update the actor with the form data
    //     await this.document.update(formData.object);
    // }

    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._onRender signature uses Record<string,unknown> per Foundry's mixin-erased contract.
    override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);

        // Restore sheet state on first render
        if (!this._stateRestored) {
            this._restoreSheetState();
        }

        // Add wh40k-sheet class to the form element for CSS styling
        this.element.classList.add('wh40k-sheet');

        // Prevent browser/full-form submit. Actor sheets update fields directly.
        this.element.addEventListener('submit', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        this._bindDirectFormUpdates();

        // Attach direct-update listeners for characteristic fields (bypasses form submission)
        this.element.querySelectorAll('.wh40k-char-direct-input').forEach((el) => {
            el.addEventListener('change', (event) => {
                const target = event.target as HTMLInputElement;
                const { characteristic, field, dtype } = target.dataset;
                if (characteristic === undefined || characteristic === '' || field === undefined || field === '') return;
                let value: string | number = target.value;
                if (dtype === 'Number') value = Number(value) || 0;
                void this.actor.update({ [`system.characteristics.${characteristic}.${field}`]: value });
            });
        });

        // Setup document update listener for visual feedback
        if (!this._updateListener) {
            this._updateListener = (document, changes, _, userId) => {
                // Only animate changes from other users or from form submission
                if (document.id === this.actor.id && userId !== game.userId) {
                    this.visualizeChanges(changes);
                }
            };
            Hooks.on('updateActor', this._updateListener);
        }

        // Detect stat changes and trigger animations
        this._detectAndAnimateChanges();

        // Handle delta inputs for numeric fields
        if (this.isEditable) {
            this.element.querySelectorAll('input[type="text"][data-dtype="Number"]').forEach((i) => {
                i.addEventListener('change', this._onChangeInputDelta.bind(this));
            });
        }

        // Auto-select number input values on focus for easy editing
        this.element.querySelectorAll('input[type="number"], input[data-dtype="Number"]').forEach((input) => {
            input.addEventListener('focus', (event) => {
                (event.target as HTMLInputElement).select();
            });
        });

        // Inline-edit: dblclick text to edit, save button to commit
        this.element.querySelectorAll<HTMLElement>('[data-inline-edit]').forEach((wrap) => {
            const input = wrap.querySelector<HTMLInputElement>('.wh40k-inline-edit-input');
            const textEl = wrap.querySelector<HTMLElement>('.wh40k-inline-edit-text');
            const saveBtn = wrap.querySelector<HTMLButtonElement>('[data-inline-edit-save]');
            if (!input || !saveBtn) return;

            const enterEdit = (): void => {
                input.removeAttribute('readonly');
                wrap.classList.add('is-editing');
                input.focus();
                input.select();
            };
            const exitEdit = (): void => {
                input.setAttribute('readonly', 'readonly');
                wrap.classList.remove('is-editing');
            };

            // Double-click on text span or the wrapper enters edit mode
            if (textEl) textEl.addEventListener('dblclick', enterEdit);
            wrap.addEventListener('dblclick', enterEdit);
            // dblclick on the input itself (for inline-edits without text span)
            input.addEventListener('dblclick', enterEdit);

            input.addEventListener('blur', (event) => {
                window.setTimeout(() => {
                    if (document.activeElement !== input && !wrap.contains(document.activeElement)) {
                        exitEdit();
                    }
                }, 0);
                void event;
            });
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    input.blur();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    exitEdit();
                }
            });
            saveBtn.addEventListener('mousedown', (event) => event.preventDefault());
            saveBtn.addEventListener('click', () => {
                input.blur();
            });

            // Auto-enter edit mode if data-inline-edit-start is set (blank fields)
            if (wrap.hasAttribute('data-inline-edit-start')) enterEdit();
        });

        // Set up drag handlers for items
        // Note: Talent panel rows (wh40k-tp_row) are excluded by EnhancedDragDropMixin
        this.element.querySelectorAll('[data-item-id]').forEach((el: Element) => {
            const datasetItemId = (el as HTMLElement).dataset['itemId'];
            if (datasetItemId !== undefined && datasetItemId !== '') {
                // Skip if this element or any ancestor is a talent row
                if (el.closest('.wh40k-tp_row') !== null || el.closest('.wh40k-talent-row') !== null) return;
                if (el.closest('[data-disable-drag="true"]') !== null || el.closest('.wh40k-panel-backpack-split') !== null) return;

                el.setAttribute('draggable', 'true');
                el.addEventListener('dragstart', (event) => this._onDragItem(event as DragEvent), false);
            }
        });

        // Item action handlers
        // These use .item-edit, .item-delete, .item-vocalize classes
        this.element.querySelectorAll('.item-edit').forEach((el) => {
            el.addEventListener('click', (event) => {
                const ct = event.currentTarget as HTMLElement;
                const itemId = ct.dataset['itemId'] ?? ct.closest('[data-item-id]')?.getAttribute('data-item-id');
                if (itemId !== null && itemId !== undefined && itemId !== '') BaseActorSheet.#itemEdit.call(this, event, ct);
            });
        });

        this.element.querySelectorAll('.item-delete').forEach((el) => {
            el.addEventListener('click', (event) => {
                const ct = event.currentTarget as HTMLElement;
                const itemId = ct.dataset['itemId'] ?? ct.closest('[data-item-id]')?.getAttribute('data-item-id');
                if (itemId !== null && itemId !== undefined && itemId !== '') void BaseActorSheet.#itemDelete.call(this, event, ct);
            });
        });

        this.element.querySelectorAll('.item-vocalize').forEach((el) => {
            el.addEventListener('click', (event) => {
                const ct = event.currentTarget as HTMLElement;
                const itemId = ct.dataset['itemId'] ?? ct.closest('[data-item-id]')?.getAttribute('data-item-id');
                if (itemId !== null && itemId !== undefined && itemId !== '') void BaseActorSheet.#itemVocalize.call(this, event, ct);
            });
        });

        // Panel toggle handlers
        // These use .sheet-control__hide-control class with data-toggle attribute
        this.element.querySelectorAll('.sheet-control__hide-control').forEach((el) => {
            el.addEventListener('click', (event) => {
                void this._onPanelToggle(event);
            });
        });

        // Click-outside handler to close characteristic HUD dropdowns
        this._setupClickOutsideHandler();

        // Setup responsive column management via ResizeObserver
        this._setupResponsiveColumns();
    }

    /* -------------------------------------------- */

    /**
     * Setup responsive column management using ResizeObserver.
     * Adjusts --wh40k-columns CSS variable based on sheet width.
     * @protected
     */
    _setupResponsiveColumns(): void {
        // Only setup once per sheet instance
        if (this._resizeObserver !== null) return;

        this._resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                const columns = width < 700 ? 1 : width < 900 ? 2 : 3;
                this.element.style.setProperty('--wh40k-columns', String(columns));
            }
        });

        this._resizeObserver.observe(this.element);
    }

    /* -------------------------------------------- */

    /**
     * Setup click-outside handler to close characteristic HUD dropdowns.
     * @protected
     */
    _setupClickOutsideHandler(): void {
        // Remove any existing handler to avoid duplicates
        if (this._clickOutsideHandler !== null) {
            document.removeEventListener('click', this._clickOutsideHandler);
        }

        this._clickOutsideHandler = (event) => {
            // Check if click was outside any dropdown or toggle button
            const eventTarget = event.target;
            if (!(eventTarget instanceof HTMLElement)) return;
            const clickedDropdown = eventTarget.closest('.wh40k-char-hud-details');
            const clickedToggle = eventTarget.closest('.wh40k-char-hud-toggle');

            // If clicked outside dropdowns and toggle buttons, close all dropdowns
            if (clickedDropdown === null && clickedToggle === null) {
                this.element.querySelectorAll('.wh40k-char-hud-details.expanded').forEach((el) => {
                    el.classList.remove('expanded');
                    const toggleIcon = el.closest('.wh40k-char-hud-item')?.querySelector('.wh40k-char-hud-toggle-icon');
                    if (toggleIcon !== null && toggleIcon !== undefined) toggleIcon.classList.remove('active');
                });
            }
        };

        document.addEventListener('click', this._clickOutsideHandler);
    }

    /* -------------------------------------------- */

    /**
     * Detect stat changes and trigger appropriate animations.
     * Compares current state with previous state captured during last render.
     * @protected
     */
    _detectAndAnimateChanges(): void {
        if (this._previousState === undefined) return;

        const current = this.document.system;
        const previous = this._previousState as PreviousSheetState;

        // Check wounds
        const currentWounds = current.wounds;
        if (currentWounds !== undefined && currentWounds.value !== previous.wounds) {
            this.animateWoundsChange(previous.wounds ?? 0, currentWounds.value);
        }

        // Check XP
        const currentExperienceTotal = current.experience?.total;
        if (currentExperienceTotal !== previous.experience) {
            this.animateXPGain(previous.experience ?? 0, currentExperienceTotal ?? 0);
        }

        // Check characteristics
        const characteristics = current.characteristics;
        for (const [key, char] of Object.entries(characteristics)) {
            const prevChar = previous.characteristics?.[key];
            if (prevChar === undefined) continue;

            // Check total change
            if (char.total !== prevChar.total) {
                this.animateCharacteristicChange(key, prevChar.total ?? 0, char.total);
            }
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle panel toggle clicks.
     * Uses the data-toggle attribute to identify which section to expand/collapse.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onPanelToggle(event: Event): Promise<void> {
        event.preventDefault();
        const target = (event.currentTarget as HTMLElement).dataset['toggle'];
        if (target === undefined || target === '') return;

        // Get current expanded state from actor flags
        const expanded = getFlag<string[]>(this.actor, 'ui.expanded') ?? [];
        const isCurrentlyExpanded = expanded.includes(target);

        // Toggle the state
        const newExpanded = isCurrentlyExpanded ? expanded.filter((name: string) => name !== target) : [...expanded, target];

        // Update actor flags - this will trigger a re-render
        await this.actor.setFlag('wh40k-rpg', 'ui.expanded', newExpanded);
    }

    /* -------------------------------------------- */

    /**
     * Handle input changes to numeric form fields, allowing them to accept delta-typed inputs.
     * Supports +N (add), -N (subtract), =N (set absolute value) notation.
     * @param {Event} event  Triggering event.
     * @protected
     */
    _onChangeInputDelta(event: Event): void {
        const input = event.target as HTMLInputElement;
        const value = input.value.trim();
        if (!value) return;

        const firstChar = value[0];
        if (firstChar === '=') {
            // Set absolute value
            const absolute = parseFloat(value.slice(1));
            if (!Number.isNaN(absolute)) input.value = String(absolute);
        } else if (firstChar !== undefined && ['+', '-'].includes(firstChar)) {
            // Add or subtract delta
            const current = foundry.utils.getProperty(this.actor, input.name) ?? 0;
            const delta = parseFloat(value);
            if (!Number.isNaN(delta)) input.value = String((current as number) + delta);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle beginning a drag-drop operation on an Item.
     * @param {DragEvent} event  The originating drag event.
     * @protected
     */
    _onDragItem(event: DragEvent): void {
        const itemId = (event.currentTarget as HTMLElement).dataset['itemId'];
        if (itemId === undefined || itemId === '') return;
        const item = this.actor.items.get(itemId);
        if (item !== undefined) {
            event.dataTransfer?.setData('text/plain', JSON.stringify(item.toDragData()));
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an image via the file browser.
     * @this {BaseActorSheet}
     * @param {PointerEvent} event  The triggering event.
     * @param {HTMLElement} target  The action target.
     */
    static async #onEditImage(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
        const attr = target.dataset['edit'] ?? 'img';
        const docSource = this.document.toObject(true);
        const current = foundry.utils.getProperty(docSource, attr);
        // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.ux.FilePicker is untyped in Foundry V14; constructor options shape is opaque Record.
        const FilePickerCtor = CONFIG.ux.FilePicker as unknown as new (options: Record<string, unknown>) => { browse(): Promise<void> };
        const fp = new FilePickerCtor({
            current,
            type: 'image',
            callback: async (path: string): Promise<void> => {
                await this.document.update({ [attr]: path });
            },
            position: {
                top: this.position.top + 40,
                left: this.position.left + 10,
            },
        });
        await fp.browse();
    }

    /* -------------------------------------------- */

    /**
     * Bind direct field updates for standard actor-sheet controls.
     * @protected
     */
    _bindDirectFormUpdates(): void {
        if (!this.isEditable) return;

        const selector = 'input[name], select[name], textarea[name]';
        this.element.querySelectorAll(selector).forEach((field: Element) => {
            const formField = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
            // Skip action buttons and non-data controls.
            if (formField.name === '' || formField.disabled) return;

            formField.addEventListener('change', (event) => {
                const input = event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
                const update = this._getFieldUpdate(input);
                if (update === null) return;
                void this.document.update(update);
            });
        });
    }

    /* -------------------------------------------- */

    /**
     * Build a single-field update payload from a form control.
     * @param {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} input
     * @returns {object|null}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns a Foundry document update payload whose shape is Record<string,unknown>.
    _getFieldUpdate(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): Record<string, unknown> | null {
        if (input.name === '') return null;

        let value: boolean | number | string;
        if (input.type === 'checkbox') value = (input as HTMLInputElement).checked;
        else if (input.type === 'number' || input.dataset['dtype'] === 'Number') value = Number(input.value) || 0;
        else value = input.value;

        const path = input.name;
        const segments = path.split('.');

        // Array element updates need to send the full array since Foundry doesn't support
        // dotted-path updates into array indices.
        const numericIndex = segments.findIndex((s) => /^\d+$/.test(s));
        if (numericIndex >= 0) {
            const arrayPath = segments.slice(0, numericIndex).join('.');
            const sourceArrayPath = arrayPath.startsWith('system.') ? arrayPath.slice(7) : arrayPath;
            const itemIndex = Number(segments[numericIndex]);
            const childPath = segments.slice(numericIndex + 1).join('.');
            // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.getProperty returns unknown; array element shape is untyped DataModel source.
            const rawCurrent: unknown = foundry.utils.getProperty(this.document.system._source, sourceArrayPath) ?? [];
            // eslint-disable-next-line no-restricted-syntax -- boundary: deepClone of unknown source array; narrowed by Array.isArray below.
            const currentArray = foundry.utils.deepClone(rawCurrent) as unknown[];
            if (!Array.isArray(currentArray)) return { [path]: value };
            // eslint-disable-next-line no-restricted-syntax -- boundary: array element shape comes from untyped DataModel source.
            const rawItem: unknown = currentArray[itemIndex] ?? {};
            const currentItem = foundry.utils.deepClone(rawItem) as object;
            if (childPath !== '') foundry.utils.setProperty(currentItem, childPath, value);
            else currentArray[itemIndex] = value;
            if (childPath !== '') currentArray[itemIndex] = currentItem;
            return { [arrayPath]: currentArray };
        }

        return { [path]: value };
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling from the sheet.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #roll(this: BaseActorSheet, _event: Event, target: HTMLElement): void {
        const rollType = target.dataset['rollType'];
        const rollTarget = target.dataset['rollTarget'];
        const specialty = target.dataset['specialty'];

        // Add rolling animation for characteristic rolls
        if (rollType === 'characteristic') {
            target.classList.add('tw-animate-wh40k-char-roll');
            target.addEventListener(
                'animationend',
                () => {
                    target.classList.remove('tw-animate-wh40k-char-roll');
                },
                { once: true },
            );
        }

        const actor = this.actor as BaseActorSheetActor & {
            rollCharacteristic: (key: string | undefined, override?: string) => void;
            rollSkill: (key: string | undefined, specialty: string | undefined) => void;
        };
        switch (rollType) {
            case 'characteristic':
                actor.rollCharacteristic(rollTarget);
                break;
            case 'skill':
                actor.rollSkill(rollTarget, specialty);
                break;
            case undefined:
            default:
                break;
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling an item.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #itemRoll(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset['itemId'] ?? target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        if (itemId !== undefined && itemId !== '') await this.actor.rollItem(itemId);
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an item.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #itemEdit(this: BaseActorSheet, _event: Event, target: HTMLElement): void {
        const itemId = target.dataset['itemId'] ?? target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        if (itemId === undefined || itemId === '') {
            console.warn('WH40K | itemEdit: No itemId found', target);
            return;
        }
        const item = this.actor.items.get(itemId);
        if (item === undefined) {
            console.warn('WH40K | itemEdit: Item not found with ID', itemId);
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- render(true) is the V14-compatible force-open idiom; render({ force: true }) fails the overloaded type.
        void item.sheet?.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting an item.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #itemDelete(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset['itemId'] ?? target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        if (itemId === undefined || itemId === '') {
            console.warn('WH40K | itemDelete: No itemId found', target);
            return;
        }

        const item = this.actor.items.get(itemId);
        if (item === undefined) {
            console.warn('WH40K | itemDelete: Item not found with ID', itemId);
            return;
        }

        const confirmed = await ConfirmationDialog.confirm({
            title: 'Confirm Delete',
            content: `Are you sure you want to delete ${item.name}?`,
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
        });

        if (confirmed) {
            try {
                await this.actor.deleteEmbeddedDocuments('Item', [itemId]);
            } catch (err) {
                console.error('WH40K | itemDelete: Error deleting item', err);
                ui.notifications.error(`Failed to delete ${item.name}`);
            }
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle sending an item to chat (vocalize/display).
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #itemVocalize(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset['itemId'] ?? target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        if (itemId === undefined || itemId === '') {
            console.warn('WH40K | itemVocalize: No item ID found', target);
            return;
        }

        const item = this.actor.items.get(itemId);
        if (item === undefined) {
            console.warn(`WH40K | itemVocalize: Item ${itemId} not found on actor`);
            return;
        }

        try {
            await item.sendToChat();
        } catch (err) {
            console.error('WH40K | itemVocalize: Error sending item to chat', err);
            ui.notifications.error(`Failed to send ${item.name} to chat`);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle creating an item.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #itemCreate(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemType = target.dataset['type'] ?? 'gear';
        // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments expects opaque Record shape; typed via Parameters cast below.
        const data: Record<string, unknown> = {
            name: `New ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`,
            type: itemType,
        };

        // Add type-specific defaults for array/Set fields to prevent validation errors
        if (itemType === 'armour') {
            data['system'] = {
                coverage: ['body'], // Default array for SetField
                properties: [], // Default empty array for SetField
            };
        } else if (itemType === 'cybernetic') {
            data['system'] = {
                locations: ['internal'], // Default for cybernetics
            };
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry createEmbeddedDocuments generic parameter requires double-cast to satisfy the overload's type constraint.
        await this.actor.createEmbeddedDocuments('Item', [data] as unknown as Parameters<typeof this.actor.createEmbeddedDocuments<'Item'>>[1], {
            renderSheet: true,
        });
    }

    /* -------------------------------------------- */

    // /**
    //  * Handle creating an effect.
    //  * Opens a streamlined, thematic effect creation dialog.
    //  * @this {BaseActorSheet}
    //  * @param {Event} event         Triggering click event.
    //  * @param {HTMLElement} target  Button that was clicked.
    //  */
    // static async #effectCreate(event, target) {
    //     const effect = await EffectCreationDialog.show(this.actor);
    //     if (effect) {
    //         ui.notifications.info(`Created effect: ${effect.name}`);
    //     }
    // }

    /* -------------------------------------------- */

    /**
     * Handle editing an effect.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #effectEdit(this: BaseActorSheet, _event: Event, target: HTMLElement): void {
        const effectId = target.closest<HTMLElement>('[data-effect-id]')?.dataset['effectId'];
        if (effectId === undefined || effectId === '') return;
        const effect = this.actor.effects.get(effectId) as { sheet?: { render(force?: boolean): void } } | undefined;
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- render(true) is the V14-compatible force-open idiom; render({ force: true }) fails the overloaded type.
        effect?.sheet?.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting an effect.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #effectDelete(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
        const effectId = target.closest<HTMLElement>('[data-effect-id]')?.dataset['effectId'];
        if (effectId === undefined || effectId === '') return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: ActiveEffect delete() returns Promise<unknown> per Foundry's Document API.
        const effect = this.actor.effects.get(effectId) as { delete(): Promise<unknown> } | undefined;
        await effect?.delete();
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling an effect.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #effectToggle(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
        const effectId = target.closest<HTMLElement>('[data-effect-id]')?.dataset['effectId'];
        if (effectId === undefined || effectId === '') return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: ActiveEffect update() takes opaque Record payload per Foundry's Document API.
        const effect = this.actor.effects.get(effectId) as { disabled: boolean; update(data: Record<string, unknown>): Promise<unknown> } | undefined;
        if (effect === undefined) return;
        await effect.update({ disabled: !effect.disabled });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling section visibility (characteristic HUD dropdowns).
     * Uses CSS class toggling for immediate feedback without re-render.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #toggleSection(this: BaseActorSheet, event: Event, target: HTMLElement): void {
        event.stopPropagation();
        const sectionName = target.dataset['toggle'];
        if (sectionName === undefined || sectionName === '') return;

        // Find the dropdown panel element
        const dropdown = this.element.querySelector(`.wh40k-char-hud-details.${sectionName}`);
        if (dropdown === null) return;

        // Close all other dropdowns first
        this.element.querySelectorAll('.wh40k-char-hud-details.expanded').forEach((el: Element) => {
            if (el !== dropdown) {
                el.classList.remove('expanded');
                // Also remove active class from the toggle icon
                const toggleSelectionIcon = el.closest('.wh40k-char-hud-item')?.querySelector('.wh40k-char-hud-toggle-icon');
                if (toggleSelectionIcon) toggleSelectionIcon.classList.remove('active');
            }
        });

        // Toggle this dropdown
        const isExpanded = dropdown.classList.toggle('expanded');

        // Toggle the chevron icon
        const toggleIcon = target.querySelector('.wh40k-char-hud-toggle-icon');
        if (toggleIcon) {
            toggleIcon.classList.toggle('active', isExpanded);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle skill training button clicks.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleTraining(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
        const field = target.dataset['field'];
        const skillKey = target.dataset['skill'];
        const levelRaw = target.dataset['level'];
        const level = levelRaw !== undefined && levelRaw !== '' ? parseInt(levelRaw) : null;
        const specialty = target.dataset['specialty'] ?? target.dataset['index'];

        // Pattern 1: Simple field toggle
        if (field !== undefined && field !== '') {
            const currentValue = target.dataset['value'] === 'true';
            await this.actor.update({ [field]: !currentValue });
            return;
        }

        // Pattern 2: Level-based training
        if (skillKey !== undefined && skillKey !== '' && level !== null) {
            const basePath = specialty !== undefined ? `system.skills.${skillKey}.entries.${specialty}` : `system.skills.${skillKey}`;

            // Get current training level
            const skills = this.actor.system.skills;
            const skill = specialty !== undefined ? skills[skillKey]?.entries?.[Number(specialty)] : skills[skillKey];

            const currentLevel = skill?.plus20 === true ? 3 : skill?.plus10 === true ? 2 : skill?.trained === true ? 1 : 0;

            // Toggle logic: if clicking the current level, reduce by 1; otherwise set to clicked level
            const newLevel = level === currentLevel ? level - 1 : level;

            const updateData = {
                [`${basePath}.trained`]: newLevel >= 1,
                [`${basePath}.plus10`]: newLevel >= 2,
                [`${basePath}.plus20`]: newLevel >= 3,
            };

            await this.actor.update(updateData);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle adding a specialist skill.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #addSpecialistSkill(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
        const skillKey = target.dataset['skill'];
        if (skillKey === undefined || skillKey === '') return;
        const skill = this.actor.system.skills[skillKey];
        if (skill === undefined) {
            ui.notifications.warn(game.i18n.localize('WH40K.Warning.SkillNotSpecified'));
            return;
        }

        // Check if skill is specialist type
        if (!Array.isArray(skill.entries)) {
            ui.notifications.error(`${skill.label} is not a specialist skill.`);
            return;
        }

        // Get name from dropdown value or prompt user
        let name = '';
        if (target instanceof HTMLSelectElement) {
            name = target.value;
            if (name === '') return; // "-- Add Specialization --" selected

            // Reset dropdown
            target.selectedIndex = 0;
        } else {
            const { prepareCreateSpecialistSkillPrompt } = await import('../prompts/specialist-skill-dialog.ts');
            prepareCreateSpecialistSkillPrompt({
                actor: this.actor,
                skillName: skillKey,
            });
            return;
        }

        // For dropdown selection, add directly
        // Check if specialization already exists
        const existing = skill.entries.find((e: { name?: string }) => e.name?.toLowerCase() === name.toLowerCase());
        if (existing) {
            ui.notifications.warn(`${skill.label} (${name}) already exists.`);
            return;
        }

        // Add new entry
        const entries = foundry.utils.deepClone(skill.entries);
        entries.push({
            name: name,
            slug: name.slugify(),
            characteristic: skill.characteristic,
            trained: false,
            plus10: false,
            plus20: false,
            basic: false,
            advanced: true,
            bonus: 0,
            notes: '',
            cost: 0,
            current: 0,
        });

        await this.actor.update({
            [`system.skills.${skillKey}.entries`]: entries,
        });

        ui.notifications.info(`Added ${skill.label} (${name}) specialization.`);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting a skill specialization.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #deleteSpecialization(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
        const skillName = target.dataset['skill'];
        const index = parseInt(target.dataset['index'] ?? '');
        if (skillName === undefined || skillName === '') return;

        const skill = this.actor.system.skills[skillName];
        if (skill === undefined || !Array.isArray(skill.entries)) return;

        const entries = [...skill.entries];
        const entryName = entries[index]?.name;
        const deletedName = entryName !== undefined && entryName !== '' ? entryName : 'this specialization';

        const confirmed = await ConfirmationDialog.confirm({
            title: 'Delete Specialization',
            content: `Delete "${deletedName}"?`,
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
        });

        if (confirmed) {
            entries.splice(index, 1);
            await this.actor.update({ [`system.skills.${skillName}.entries`]: entries });
        }
    }

    /**
     * View skill information from compendium.
     * Opens the skill item sheet from the skills compendium in read-only mode.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Element that was clicked.
     */
    static async #viewSkillInfo(this: BaseActorSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

        const skillKey = target.dataset['skill'] ?? target.dataset['rollTarget'];
        // const specialty = target.dataset['specialty'];

        if (skillKey === undefined || skillKey === '') {
            console.warn('WH40K | viewSkillInfo: No skill key found');
            return;
        }

        const skill = this.actor.system.skills[skillKey];
        if (skill === undefined) {
            console.warn(`WH40K | viewSkillInfo: Skill ${skillKey} not found`);
            return;
        }

        // Try to find the skill item in the compendium (check all game-line packs)
        const skillPackNames = ['wh40k-rpg.dh2-core-stats-skills', 'wh40k-rpg.rt-core-items-skills', 'wh40k-rpg.dw-core-items-skills'];
        const pack = skillPackNames.map((n) => game.packs.get(n)).find((p) => p !== undefined);
        if (pack === undefined) {
            ui.notifications.warn(game.i18n.localize('WH40K.Warning.SkillsCompendiumNotFound'));
            return;
        }

        // Search for the skill by label
        const searchLabel = (skill.label ?? skillKey).toLowerCase().replace(/[^a-z0-9]/g, '');
        const index = await pack.getIndex();
        const entry = index.find((i: { name?: string }) => {
            const indexName = (i.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return indexName === searchLabel;
        });

        if (entry === undefined) {
            ui.notifications.info(`No compendium entry found for ${skill.label ?? skillKey}.`);
            return;
        }

        // Load and render the skill item sheet
        const skillItem = await pack.getDocument(entry._id);
        if (skillItem?.sheet !== undefined && skillItem.sheet !== null) {
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- render(true) is the V14-compatible force-open idiom; render({ force: true }) fails the overloaded type.
            void skillItem.sheet.render(true);
        }
    }

    /* -------------------------------------------- */
    /*  Drag & Drop                                 */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's _onDropItem returns Promise<unknown>; the concrete return is Document[] or undefined.
    async _onDropItem(event: DragEvent, item: WH40KItem): Promise<unknown> {
        if (!this.actor.isOwner) return undefined;

        // Check if this item type is supported
        const ctor = this.constructor as typeof BaseActorSheet;
        if (ctor.unsupportedItemTypes.has(item.type)) {
            ui.notifications.warn(
                game.i18n.format('WH40K.Warning.InvalidItem', {
                    itemType: game.i18n.localize(CONFIG.Item.typeLabels[item.type] ?? item.type),
                    actorType: game.i18n.localize(CONFIG.Actor.typeLabels[this.actor.type] ?? this.actor.type),
                }),
            );
            return false;
        }

        // Check if item already exists on actor (for move operations)
        if (item.id === null || item.id === '') return false;
        if (this.actor.items.get(item.id) !== undefined) {
            return this._onSortItem(event, item);
        }

        // Create the item
        return this.actor.createEmbeddedDocuments('Item', [item.toObject()]);
    }

    /* -------------------------------------------- */

    /**
     * Handle sorting an item within the actor's inventory.
     * @param {DragEvent} event  The drop event.
     * @param {Item} item        The item being sorted.
     * @returns {Promise}
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's _onSortItem returns Promise<unknown>; the concrete return is EmbeddedDocumentCollection or undefined.
    _onSortItem(event: DragEvent, item: WH40KItem): Promise<unknown> | undefined {
        const items = this.actor.items;
        if (item.id === null || item.id === '') return undefined;
        const source = items.get(item.id);

        // Confirm the drop target
        const dropTarget = (event.target as HTMLElement).closest<HTMLElement>('[data-item-id]');
        if (dropTarget === null) return undefined;
        const targetId = dropTarget.dataset['itemId'];
        if (source === undefined || targetId === undefined || targetId === '') return undefined;
        const target = items.get(targetId);
        if (target === undefined || source.id === target.id) return undefined;

        // Identify sibling items based on adjacent HTML elements
        const siblings: WH40KItem[] = [];
        const parentChildren = dropTarget.parentElement?.children;
        if (parentChildren !== undefined) {
            for (const element of parentChildren) {
                const siblingId = (element as HTMLElement).dataset['itemId'];
                if (siblingId !== undefined && siblingId !== '' && siblingId !== source.id) {
                    const sibling = items.get(siblingId);
                    if (sibling !== undefined) siblings.push(sibling);
                }
            }
        }

        // Perform the sort
        const sortUpdates = foundry.utils.performIntegerSort(source, { target, siblings });
        // eslint-disable-next-line no-restricted-syntax -- boundary: performIntegerSort returns opaque update payloads whose shape is Record<string,unknown>.
        type SortUpdate = { update: Record<string, unknown>; target: { _id: string } };
        const updateData = (sortUpdates as SortUpdate[]).map((u) => {
            const update = u.update;
            update['_id'] = u.target._id;
            return update;
        });

        return this.actor.updateEmbeddedDocuments('Item', updateData);
    }

    /* -------------------------------------------- */

    /**
     * Handle spending XP to advance a characteristic.
     * @param {Event} event         Triggering click event
     * @param {HTMLElement} target  The button element clicked
     * @protected
     */
    static async #spendXPAdvance(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
        const charKey = target.dataset['characteristic'];
        if (charKey === undefined || charKey === '') return;
        const char = this.actor.system.characteristics[charKey] as (WH40KCharacteristic & { nextAdvanceCost: number; advance: number }) | undefined;

        if (char === undefined) {
            ui.notifications.error(game.i18n.localize('WH40K.Warning.InvalidCharacteristic'));
            return;
        }

        const cost = char.nextAdvanceCost;
        const xp = this.actor.system.experience;
        const available = xp?.available ?? 0;

        // Check if enough XP
        if (available < cost) {
            ui.notifications.warn(`Not enough XP! Need ${cost}, have ${available}.`);
            return;
        }

        // Check if already maxed
        if (char.advance >= 5) {
            ui.notifications.warn(`${char.label} is already at maximum advancement!`);
            return;
        }

        // Confirm spending
        const confirmed = await ConfirmationDialog.confirm({
            title: `Advance ${char.label}?`,
            content: `<p>Spend <strong>${cost} XP</strong> to advance ${char.label} from ${char.total} to ${char.total + 5}?</p>
                     <p><em>Available XP: ${available}</em></p>`,
            confirmLabel: 'Advance',
            cancelLabel: 'Cancel',
        });

        if (!confirmed) return;

        // Capture old values for animation
        const oldTotal = char.total;
        const oldBonus = char.bonus;
        const oldAdvance = char.advance;

        // Update actor
        const newAdvance = oldAdvance + 1;
        const newSpent = (xp?.spent ?? 0) + cost;

        await this.actor.update({
            [`system.characteristics.${charKey}.advance`]: newAdvance,
            'system.experience.spent': newSpent,
        });

        // Calculate new values
        const newTotal = char.base + newAdvance * 5 + char.modifier;
        const newBonus = Math.floor(newTotal / 10) * (char.unnatural || 1);

        // Success notification
        ui.notifications.info(`${char.label} advanced to ${newTotal}! (−${cost} XP)`);

        // Trigger characteristic change animation
        this.animateCharacteristicChange(charKey, oldTotal, newTotal);

        // Trigger bonus change animation if bonus changed
        if (oldBonus !== newBonus) {
            this.animateCharacteristicBonus(charKey, oldBonus, newBonus);
        }

        // Animate circle for V1 HUD (bonus display)
        const circleElement = this.element.querySelector<HTMLElement>(`[data-characteristic="${charKey}"] .wh40k-char-hud-circle`);
        if (circleElement) {
            circleElement.classList.add('value-changed');
            setTimeout(() => circleElement.classList.remove('value-changed'), 500);
        }

        // Add value-changed animation to mod display for V1 HUD
        const modElement = this.element.querySelector<HTMLElement>(`[data-characteristic="${charKey}"] .wh40k-char-hud-mod`);
        if (modElement) {
            modElement.classList.add('tw-animate-wh40k-value-flash');
            setTimeout(() => modElement.classList.remove('tw-animate-wh40k-value-flash'), 500);
        }

        // Update the border progress indicator
        const charBox = this.element.querySelector<HTMLElement>(`[data-characteristic="${charKey}"]`);
        if (charBox) {
            charBox.style.setProperty('--advance-progress', String(newAdvance / 5));
            charBox.dataset['advance'] = String(newAdvance);
        }
    }

    /* -------------------------------------------- */

    /**
     * Open edit dialog for a characteristic.
     * @param {Event} event         Triggering event
     * @param {HTMLElement} target  Button clicked
     * @protected
     */
    static async #editCharacteristic(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
        const charKey = target.closest<HTMLElement>('[data-characteristic]')?.dataset['characteristic'];
        if (charKey === undefined || charKey === '') return;

        const char = this.actor.system.characteristics[charKey] as WH40KCharacteristic | undefined;
        if (char === undefined) {
            ui.notifications.error(game.i18n.localize('WH40K.Warning.InvalidCharacteristic'));
            return;
        }

        // Calculate current values
        const currentBase = char.base;
        const currentAdvance = char.advance;
        const currentModifier = char.modifier;
        const currentUnnatural = char.unnatural || 1;

        // Create edit dialog using DialogV2
        const result = (await dialogV2.wait({
            window: {
                title: `Edit ${char.label}`,
                icon: 'fas fa-edit',
            },
            content: `
                <div class="wh40k-char-edit-dialog">
                    <div class="form-group">
                        <label>Base Value</label>
                        <input type="number" name="base" value="${currentBase}" min="0" max="100" />
                    </div>
                    <div class="form-group">
                        <label>Advances (0-5)</label>
                        <input type="number" name="advance" value="${currentAdvance}" min="0" max="5" />
                    </div>
                    <div class="form-group">
                        <label>Modifier</label>
                        <input type="number" name="modifier" value="${currentModifier}" min="-100" max="100" />
                    </div>
                    <div class="form-group">
                        <label>Unnatural Multiplier</label>
                        <input type="number" name="unnatural" value="${currentUnnatural}" min="1" max="10" />
                    </div>
                    <hr/>
                    <div class="wh40k-char-preview">
                        <p><strong>Total:</strong> <span class="preview-total">${char.total}</span></p>
                        <p><strong>Bonus:</strong> <span class="preview-bonus">${char.bonus}</span></p>
                    </div>
                </div>
            `,
            buttons: [
                {
                    action: 'save',
                    label: 'Save',
                    icon: 'fas fa-save',
                    default: true,
                    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2 callback parameters include opaque _dialog unknown per Foundry API; return value is FormDataExtended.object which is Record<string,unknown>.
                    callback: (_evt: Event, button: { form: HTMLFormElement }, _dialog: unknown): Record<string, unknown> => {
                        return new FormDataExtended(button.form).object;
                    },
                },
                {
                    action: 'cancel',
                    label: 'Cancel',
                    icon: 'fas fa-times',
                },
            ],
            close: (): null => null,
        })) as { base: string; advance: string; modifier: string; unnatural: string } | null;

        // Update actor with new values if saved
        if (result) {
            await this.actor.update({
                [`system.characteristics.${charKey}.base`]: parseInt(result.base) || 0,
                [`system.characteristics.${charKey}.advance`]: parseInt(result.advance) || 0,
                [`system.characteristics.${charKey}.modifier`]: parseInt(result.modifier) || 0,
                [`system.characteristics.${charKey}.unnatural`]: parseInt(result.unnatural) || 1,
            });

            ui.notifications.info(`${char.label} updated successfully!`);
        }
    }
}
