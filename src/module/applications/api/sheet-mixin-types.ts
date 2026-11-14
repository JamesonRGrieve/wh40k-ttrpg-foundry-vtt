/**
 * @file Sheet Mixin Types - Combined type surface for the BaseActorSheet mixin chain
 *
 * The 12-deep mixin chain on BaseActorSheet erases all type information because each
 * mixin uses `new (...args: any[]) => any` as its base constraint. These interfaces
 * capture the public/protected API added by each mixin so that BaseActorSheet and its
 * subclasses can declare typed properties instead of `any`.
 *
 * Members carry the concrete types their implementations use. Render options and
 * template context use the named boundaries `ApplicationRenderOptions` and
 * `HandlebarsContext` from `foundry-v14-overrides.d.ts`; the few members that mirror
 * an untyped Foundry API carry a single-line suppression naming it (#719).
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KArmourLocation, WH40KBaseActorDocument, WH40KCharacteristic, WH40KModifierEntry, WH40KSkill } from '../../types/global.d.ts';
import type { ModifierTooltipSource } from '../../utils/modifier-tooltip.ts';
import type { ArmorTooltipEquippedPiece } from '../components/wh40k-tooltip.ts';
import type { ContextMenuEntryLike } from './application-types.ts';
import type { AnimationSnapshot } from './enhanced-animations-mixin.ts';

/** One impact line the what-if preview reports. */
interface WhatIfImpact {
    type: string;
    message: string;
}

/**
 * Pending what-if edits, keyed by document update path (`system.characteristics.strength.advance`).
 * They become the payload of `actor.update(...)`, so they carry its untyped value shape.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Document.update payload (Foundry's untyped update data), keyed by dotted path
type WhatIfChanges = Record<string, unknown>;

/* -------------------------------------------- */
/*  Individual Mixin Interfaces                 */
/* -------------------------------------------- */

/** API surface added by ApplicationV2Mixin */
interface ApplicationV2MixinAPI {
    /** Expanded states for collapsible sections persisted between renders. */
    readonly expandedSections: Map<string, boolean>;
    /** Localized window subtitle. */
    readonly subtitle: string;

    // Protected rendering helpers
    _configureRenderOptions: (options: ApplicationRenderOptions) => void;
    _onFirstRender: (context: HandlebarsContext, options: ApplicationRenderOptions) => void;
    _prepareContext: (options: ApplicationRenderOptions) => Promise<HandlebarsContext>;
    _preparePartContext: (partId: string, context: HandlebarsContext, options: ApplicationRenderOptions) => Promise<HandlebarsContext>;
    _renderContainers: (context: HandlebarsContext, options: ApplicationRenderOptions) => void;
    _replaceHTML: (result: Record<string, HTMLElement>, content: HTMLElement, options: ApplicationRenderOptions) => void;
    _updateFrame: (options: ApplicationRenderOptions) => void;
    _onRender: (context: HandlebarsContext, options: ApplicationRenderOptions) => void;
    _disableFields: () => void;
}

/* -------------------------------------------- */

/** API surface added by DragDropMixin (drag-drop-api-mixin) */
export interface DragDropMixinAPI {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry drag payload (TextEditor.getDragEventData) is untyped JSON
    _allowedDropBehaviors: (event: DragEvent, data: Record<string, unknown>) => Set<string>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry drag payload (TextEditor.getDragEventData) is untyped JSON
    _defaultDropBehavior: (event: DragEvent, data: Record<string, unknown>) => string;
    _dropBehavior: (event: DragEvent) => string;
    _onDragStart: (event: DragEvent) => Promise<void>;
}

/* -------------------------------------------- */

/** API surface added by PrimarySheetMixin */
export interface PrimarySheetMixinAPI extends DragDropMixinAPI {
    /** Filters for applied inventory sections. */
    // eslint-disable-next-line no-restricted-syntax -- boundary: per-sheet filter state mirrors DocumentSheetV2's untyped _filters
    _filters: Record<string, Record<string, unknown>>;
    /** The current sheet mode (PLAY=1, EDIT=2). */
    _mode: number | null;

    _configureRenderOptions: (options: ApplicationRenderOptions) => void;
    _configureRenderParts: (options: ApplicationRenderOptions) => Record<string, ApplicationV2Config.PartConfiguration>;
    _renderFrame: (options: ApplicationRenderOptions) => Promise<HTMLElement>;
    _renderModeToggle: () => void;
    _prepareContext: (options: ApplicationRenderOptions) => Promise<HandlebarsContext>;
    _preparePartContext: (partId: string, context: HandlebarsContext, options: ApplicationRenderOptions) => Promise<HandlebarsContext>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._getTabs returns Foundry's untyped tab configuration
    _getTabs: () => Record<string, Record<string, unknown>>;
    _onFirstRender: (context: HandlebarsContext, options: ApplicationRenderOptions) => Promise<void>;
    _onRender: (context: HandlebarsContext, options: ApplicationRenderOptions) => Promise<void>;
    _activateTabs: () => void;
    _activateTab: (tab: string, group: string, nav: HTMLElement, content: HTMLElement) => void;
    animateStatChange: (element: HTMLElement, type?: string) => void;
    animateValueChange: (element: HTMLElement, oldValue: number, newValue: number) => void;
    _addDocument: (event: Event, target: HTMLElement) => void;
    changeTab: (tab: string, group: string, options: ApplicationRenderOptions) => void;
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors DocumentSheetV2._deleteDocument, which resolves to Foundry's untyped Document.delete result
    _deleteDocument: (event: Event, target: HTMLElement) => Promise<unknown>;
    _onChangeSheetMode: (event: Event) => Promise<void>;
    _onClickAction: (event: Event, target: HTMLElement) => void;
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors DocumentSheetV2._showDocument, which resolves to Foundry's untyped sheet render result
    _showDocument: (event: Event, target: HTMLElement) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors DocumentSheetV2._sortChildren over Foundry's untyped embedded collections
    _sortChildren: (collection: string, mode: string) => unknown[];
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors DocumentSheetV2._sortItems over Foundry's untyped embedded collections
    _sortItems: (items: unknown[], mode: string) => unknown[];
}

/* -------------------------------------------- */

/** API surface added by TooltipMixin */
interface TooltipMixinAPI {
    prepareCharacteristicTooltip: (key: string, characteristic: WH40KCharacteristic, modifierSources?: Record<string, WH40KModifierEntry[]>) => string;
    prepareSkillTooltip: (key: string, skill: WH40KSkill, characteristics: Record<string, WH40KCharacteristic>) => string;
    prepareArmorTooltip: (location: string, armorData: WH40KArmourLocation, equipped?: ArmorTooltipEquippedPiece[]) => string;
    prepareWeaponTooltip: (weapon: WH40KItem) => string;
    prepareModifierTooltip: (title: string, sources: ModifierTooltipSource[]) => string;
    prepareQualityTooltip: (identifier: string, level?: number | null) => string;
}

/* -------------------------------------------- */

/**
 * API surface added by EnhancedAnimationsMixin.
 *
 * Since #276 this is the single home of the sheet animation engine: it absorbed
 * the former VisualFeedbackMixin (now a thin alias — see `visual-feedback-mixin.ts`),
 * so this interface is the superset of both former surfaces. The change-tracking /
 * stat-flash members below were formerly declared on the now-removed
 * `VisualFeedbackMixinAPI` interface.
 */
export interface EnhancedAnimationsMixinAPI {
    /** Animation configuration settings. */
    _animationConfig: {
        counterDuration: number;
        barDuration: number;
        pulseDuration: number;
        enableSound: boolean;
        respectReducedMotion: boolean;
    };
    /** Track currently running animations. */
    _runningAnimations: Map<string, number>;
    /** Previous animation state snapshot. */
    _previousState: AnimationSnapshot | null;
    /** MutationObserver for dynamic content. */
    _mutationObserver: MutationObserver | null;
    /** Flat previous document values for change tracking (absorbed VisualFeedback API). */
    _previousValues: Map<string, number | string>;

    _captureAnimationState: () => void;
    _setupMutationObserver: () => void;
    animateCounter: (element: HTMLElement, fromValue: number, toValue: number, options?: ApplicationRenderOptions) => void;
    animateWoundsChange: (oldValue: number, newValue: number) => void;
    _animateWoundsBar: (barElement: HTMLElement, fromPercent: number, toPercent: number) => void;
    animateCharacteristicChange: (charKey: string, oldValue: number, newValue: number) => void;
    animateCharacteristicBonus: (charKey: string, oldBonus: number, newBonus: number) => void;
    animateXPGain: (oldXP: number, newXP: number) => void;
    _animateProgressBar: (barElement: HTMLElement) => void;
    _flashElement: (element: HTMLElement, animClass: string, duration?: number) => void;
    _shouldSkipAnimation: () => boolean;
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2.close resolves to Foundry's untyped close result
    close: (options: ApplicationRenderOptions) => Promise<unknown>;

    // ---- Absorbed VisualFeedback change-tracking / stat-flash surface (#276) ----
    _captureCurrentValues: () => void;
    _flashStatChange: (fieldName: string, oldValue: number | string, newValue: number | string) => void;
    _findFieldElement: (fieldName: string) => HTMLElement | null;
    _getAnimationClass: (fieldName: string, oldValue: number | string, newValue: number | string) => string;
    _applyAnimation: (element: HTMLElement, animationClass: string) => void;
    _animateDerivedStat: (selector: string) => void;
    _animateCounter: (element: HTMLElement, fromValue: number, toValue: number, duration?: number) => void;
    _showBriefNotification: (element: HTMLElement, message: string, type?: string) => void;
    animateStatChange: (fieldName: string, animationType?: string) => void;
    visualizeChanges: (changes: WhatIfChanges) => void;
}

/* -------------------------------------------- */

/** API surface added by CollapsiblePanelMixin */
interface CollapsiblePanelMixinAPI {
    _loadPanelStates: () => void;
    _savePanelState: (panelId: string, isExpanded: boolean) => Promise<void>;
    _getPanelFlagKey: () => string;
    _getPanelStates: () => Record<string, boolean>;
    _applyPanelStates: () => void;
    togglePanel: (panelId: string, forceState?: boolean) => Promise<void>;
    expandAllPanels: () => Promise<void>;
    collapseAllPanels: () => Promise<void>;
    applyPanelPreset: (presetName: string) => Promise<void>;
    collapseAllExcept: (exceptPanelId: string) => Promise<void>;
    _animatePanelToggle: (panel: HTMLElement, willBeExpanded: boolean) => Promise<void>;
    _setupPanelKeyboardShortcuts: () => void;
}

/* -------------------------------------------- */

/** API surface added by ContextMenuMixin */
interface ContextMenuMixinAPI {
    _createContextMenus: () => void;
    _createCustomContextMenus: () => void;
    _getCharacteristicContextOptions: (target: HTMLElement) => ContextMenuEntryLike[];
    _getSkillContextOptions: (target: HTMLElement) => ContextMenuEntryLike[];
    _getItemContextOptions: (target: HTMLElement) => ContextMenuEntryLike[];
    _getFatePointContextOptions: () => ContextMenuEntryLike[];
    _onCharacteristicRoll: (charKey: string) => Promise<void>;
    _onCharacteristicRollWithModifier: (charKey: string) => Promise<void>;
    _showModifierSources: (charKey: string) => Promise<void>;
    _onAdvanceCharacteristic: (charKey: string) => Promise<void>;
    _postCharacteristicToChat: (charKey: string, char: WH40KCharacteristic) => Promise<void>;
    _onEditCharacteristic: (charKey: string) => Promise<void>;
    _onSkillRoll: (skillKey: string) => Promise<void>;
    _onSkillRollWithModifier: (skillKey: string) => Promise<void>;
    _toggleSkillTraining: (skillKey: string, level: string) => Promise<void>;
    _showGoverningCharacteristic: (skillKey: string, skill: WH40KSkill) => void;
    _addSkillSpecialization: (skillKey: string) => Promise<void>;
    _duplicateItem: (item: WH40KItem) => Promise<void>;
    _deleteItem: (item: WH40KItem) => Promise<void>;
    _weaponAttack: (item: WH40KItem, mode: string) => Promise<void>;
    _toggleEquipped: (item: WH40KItem) => Promise<void>;
    _toggleActivated: (item: WH40KItem) => Promise<void>;
    _spendFate: (purpose: string) => Promise<void>;
    _burnFatePoint: () => Promise<void>;
}

/* -------------------------------------------- */

/** API surface added by EnhancedDragDropMixin (drag-drop-visual-mixin) */
export interface EnhancedDragDropMixinAPI {
    _draggedItem: { id: string; item: WH40KItem; element: HTMLElement } | null;
    _dragStartPos: { x: number; y: number } | null;
    _splitResult: { quantity: number } | null;

    _setupEnhancedDragDrop: () => void;
    _setupDropZones: () => void;
    _setupFavoritesBar: () => void;
    _onEnhancedDragStart: (event: DragEvent) => Promise<void>;
    _createDragGhost: (item: WH40KItem, event: DragEvent) => HTMLElement;
    _canSplitItem: (item: WH40KItem) => boolean;
    _showSplitDialog: (item: WH40KItem) => Promise<{ quantity: number } | null>;
    _highlightValidDropZones: (item: WH40KItem) => void;
    _onEnhancedDragOver: (event: DragEvent) => void;
    _onEnhancedDragLeave: (event: DragEvent) => void;
    _onInventoryDragOver: (event: DragEvent) => void;
    _onFavoritesDragOver: (event: DragEvent) => void;
    _onEnhancedDrop: (event: DragEvent) => Promise<void>;
    _handleEquipmentDrop: (item: WH40KItem, slot: string) => Promise<void>;
    _validateEquipmentSlot: (item: WH40KItem, slot: string) => boolean;
    _handleGeneralDrop: (item: WH40KItem, event: DragEvent) => Promise<void>;
    _handleSplitDrop: (item: WH40KItem, quantity: number) => Promise<void>;
    _onInventoryDrop: (event: DragEvent) => Promise<void>;
    _reorderItems: (sourceId: string, targetId: string, clientY: number) => Promise<void>;
    _onFavoritesDrop: (event: DragEvent) => Promise<void>;
    _addToFavorites: (item: WH40KItem) => Promise<void>;
    _onEnhancedDragEnd: (event: DragEvent) => void;
    _resetDrag: () => void;
    _animateSnapToSlot: (item: WH40KItem) => void;
    removeFromFavorites: (itemId: string) => Promise<void>;
    clearFavorites: () => Promise<void>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Item.Implementation values read back from the actor's untyped favorites flag (Document.getFlag)
    getFavoriteItems: () => unknown[];
}

/* -------------------------------------------- */

/** API surface added by WhatIfMixin */
interface WhatIfMixinAPI {
    _whatIfActive: boolean;
    _whatIfChanges: WhatIfChanges;
    _whatIfPreview: WH40KBaseActorDocument | null;
    _whatIfImpacts: WhatIfImpact[];

    enterWhatIfMode: () => Promise<void>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: value is a Document.update payload value (Foundry's untyped update data)
    previewChange: (path: string, value: unknown) => Promise<void>;
    _updatePreview: () => void;
    _calculateImpacts: () => void;
    commitWhatIfChanges: () => Promise<void>;
    cancelWhatIfChanges: () => Promise<void>;
    exitWhatIfMode: () => Promise<void>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: value is a Document.update payload value (Foundry's untyped update data)
    _applyChange: (path: string, value: unknown) => Promise<void>;
    getWhatIfState: () => { active: boolean; changes: WhatIfChanges; impacts: WhatIfImpact[]; changeCount: number };
    isWhatIfActive: () => boolean;
    _renderWhatIfOverlay: () => void;
    _createWhatIfToolbar: () => HTMLElement;
    _updateComparisonDisplays: () => void;
    _compareCharacteristics: (current: WH40KBaseActorDocument, preview: WH40KBaseActorDocument) => void;
    _compareSkills: (current: WH40KBaseActorDocument, preview: WH40KBaseActorDocument) => void;
    _compareDerivedStats: (current: WH40KBaseActorDocument, preview: WH40KBaseActorDocument) => void;
    _showComparison: (selector: string, data: { current: number; preview: number; type: string }) => void;
}

/* -------------------------------------------- */

/** API surface added by StatBreakdownMixin */
interface StatBreakdownMixinAPI {
    close: (options?: ApplicationRenderOptions) => Promise<void>;
}

/* -------------------------------------------- */

/** API surface added by ItemPreviewMixin — all methods are static action handlers or private (#) members; no public instance API beyond DEFAULT_OPTIONS actions */
type ItemPreviewMixinAPI = object;

/* -------------------------------------------- */

/**
 * API surface added by SetFieldActionsMixin.
 *
 * The mixin contributes the Set-backed list-field read/write/add/remove instance
 * helpers consumed by the ammunition / armour / armour-mod item sheets. Declared
 * here so the mixin's return type can intersect it and consuming sheets see the
 * methods on `this` without a cast.
 */
export interface SetFieldActionsMixinAPI {
    /** Read a (possibly nested) Set-backed field under `system` as a Set. */
    readSetField: (field: string) => Set<string>;
    /** Persist a Set-backed field as an array (Foundry's SetField storage form). */
    writeSetField: (field: string, set: Set<string>) => Promise<void>;
    /** Add a value to a Set-backed field and persist the result. */
    addToSetField: (field: string, value: string) => Promise<void>;
    /** Remove a value from a Set-backed field and persist the result. */
    removeFromSetField: (field: string, value: string | undefined) => Promise<void>;
    /** Project a config option map into `{ key, label, description, selected }` rows (#429). */
    projectSetOptions: (
        options: Record<string, { label: string; description?: string }>,
        filters?: { selected?: Set<string>; only?: Set<string>; exclude?: Set<string> },
    ) => Array<{ key: string; label: string; description: string; selected: boolean }>;
}

/* -------------------------------------------- */
/*  Combined Interface                          */
/* -------------------------------------------- */

/**
 * Combined type surface for the full BaseActorSheet mixin chain.
 *
 * This captures the union of all public/protected members contributed by:
 *   ApplicationV2Mixin, PrimarySheetMixin (incl. DragDropMixin), TooltipMixin,
 *   EnhancedAnimationsMixin (which absorbed VisualFeedbackMixin — #276),
 *   CollapsiblePanelMixin, ContextMenuMixin, EnhancedDragDropMixin, WhatIfMixin,
 *   StatBreakdownMixin, ItemPreviewMixin
 *
 * Plus Foundry base ApplicationV2 / ActorSheetV2 properties.
 */
export interface BaseActorSheetMixins
    extends Omit<ApplicationV2MixinAPI, 'animateStatChange' | '_onFirstRender' | '_onRender'>,
        Omit<PrimarySheetMixinAPI, 'animateStatChange' | '_onFirstRender' | '_onRender'>,
        TooltipMixinAPI,
        Omit<EnhancedAnimationsMixinAPI, 'close' | 'animateStatChange'>,
        CollapsiblePanelMixinAPI,
        ContextMenuMixinAPI,
        EnhancedDragDropMixinAPI,
        WhatIfMixinAPI,
        Omit<StatBreakdownMixinAPI, 'close'>,
        ItemPreviewMixinAPI {
    /* -------------------------------------------- */
    /*  Foundry Base Properties (ActorSheetV2)      */
    /* -------------------------------------------- */

    /** The Actor document this sheet displays. */
    actor: WH40KBaseActor;
    /** The Actor document (alias for actor on DocumentSheet). */
    document: WH40KBaseActor;
    /** The root HTML element of the application. */
    element: HTMLElement;
    /** The rendered position of the application. */
    position: { top: number; left: number; width: number; height: number };
    /** Whether the current user has edit permission for this document. */
    isEditable: boolean;
    /** Whether this application has a rendered window frame. */
    hasFrame: boolean;
    /** The application's unique ID. */
    id: string;
    /** Tab group tracking (group name -> active tab ID). */
    tabGroups: Record<string, string>;
    /** The application's options. */
    options: ApplicationRenderOptions;

    /** Render the application. */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2.render resolves to Foundry's untyped render result
    render: (options?: ApplicationRenderOptions | boolean) => Promise<unknown>;
    /** Submit the application's form. */
    submit: () => Promise<void>;
    /** Set the rendered position. */
    setPosition: (pos: Partial<{ top: number; left: number; width: number; height: number }>) => void;

    /* -------------------------------------------- */
    /*  ApplicationV2 Protected Methods             */
    /* -------------------------------------------- */

    /**
     * Retrieve header control button configuration from ApplicationV2 base.
     * Protected; declared here so subclasses can override and call super.
     */
    _getHeaderControls: () => { icon: string; label: string; action?: string; visible?: boolean }[];

    /**
     * Lifecycle hook called after the application is first rendered.
     * Protected; declared here so subclasses can override and call super.
     */
    _onFirstRender: (context: HandlebarsContext, options: ApplicationRenderOptions) => Promise<void>;
}
