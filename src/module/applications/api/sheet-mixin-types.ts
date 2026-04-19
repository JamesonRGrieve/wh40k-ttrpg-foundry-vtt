/**
 * @file Sheet Mixin Types - Combined type surface for the BaseActorSheet mixin chain
 *
 * The 12-deep mixin chain on BaseActorSheet erases all type information because each
 * mixin uses `new (...args: any[]) => any` as its base constraint. These interfaces
 * capture the public/protected API added by each mixin so that BaseActorSheet and its
 * subclasses can declare typed properties instead of `any`.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';

/* -------------------------------------------- */
/*  Individual Mixin Interfaces                 */
/* -------------------------------------------- */

/** API surface added by ApplicationV2Mixin */
export interface ApplicationV2MixinAPI {
    /** Expanded states for collapsible sections persisted between renders. */
    readonly expandedSections: Map<string, boolean>;
    /** Localized window subtitle. */
    readonly subtitle: string;

    // Protected rendering helpers
    _configureRenderOptions(options: Record<string, unknown>): void;
    _onFirstRender(context: Record<string, unknown>, options: Record<string, unknown>): void;
    _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>>;
    _preparePartContext(partId: string, context: Record<string, unknown>, options: Record<string, unknown>): Promise<Record<string, unknown>>;
    _renderContainers(context: Record<string, unknown>, options: Record<string, unknown>): void;
    _replaceHTML(result: Record<string, HTMLElement>, content: HTMLElement, options: Record<string, unknown>): void;
    _updateFrame(options: Record<string, unknown>): void;
    _onRender(context: Record<string, unknown>, options: Record<string, unknown>): void;
    _disableFields(): void;
}

/* -------------------------------------------- */

/** API surface added by DragDropMixin (drag-drop-api-mixin) */
export interface DragDropMixinAPI {
    _allowedDropBehaviors(event: DragEvent, data: Record<string, unknown>): Set<string>;
    _defaultDropBehavior(event: DragEvent, data: Record<string, unknown>): string;
    _dropBehavior(event: DragEvent): string;
    _onDragStart(event: DragEvent): Promise<void>;
}

/* -------------------------------------------- */

/** API surface added by PrimarySheetMixin */
export interface PrimarySheetMixinAPI extends DragDropMixinAPI {
    /** Filters for applied inventory sections. */
    _filters: Record<string, Record<string, unknown>>;
    /** The current sheet mode (PLAY=1, EDIT=2). */
    _mode: number | null;

    _configureRenderOptions(options: Record<string, unknown>): void;
    _configureRenderParts(options: Record<string, unknown>): Record<string, unknown>;
    _renderFrame(options: Record<string, unknown>): Promise<HTMLElement>;
    _renderModeToggle(): void;
    _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>>;
    _preparePartContext(partId: string, context: Record<string, unknown>, options: Record<string, unknown>): Promise<Record<string, unknown>>;
    _getTabs(): Record<string, Record<string, unknown>>;
    _onFirstRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void>;
    _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void>;
    _activateLegacyTabs(): void;
    _activateTab(tab: string, group: string, nav: HTMLElement, content: HTMLElement): void;
    animateStatChange(element: HTMLElement, type?: string): void;
    animateValueChange(element: HTMLElement, oldValue: number, newValue: number): void;
    _addDocument(event: Event, target: HTMLElement): void;
    changeTab(tab: string, group: string, options: Record<string, unknown>): void;
    _deleteDocument(event: Event, target: HTMLElement): Promise<any>;
    _onChangeSheetMode(event: Event): Promise<void>;
    _onClickAction(event: Event, target: HTMLElement): void;
    _showDocument(event: Event, target: HTMLElement): Promise<any>;
    _sortChildren(collection: string, mode: string): unknown[];
    _sortItems(items: unknown[], mode: string): unknown[];
}

/* -------------------------------------------- */

/** API surface added by TooltipMixin */
export interface TooltipMixinAPI {
    prepareCharacteristicTooltip(key: string, characteristic: Record<string, unknown>, modifierSources?: Record<string, unknown>): string;
    prepareSkillTooltip(key: string, skill: Record<string, unknown>, characteristics: Record<string, unknown>): string;
    prepareArmorTooltip(location: string, armorData: Record<string, unknown>, equipped?: unknown[]): string;
    prepareWeaponTooltip(weapon: Record<string, unknown>): string;
    prepareModifierTooltip(title: string, sources: unknown[]): string;
    prepareQualityTooltip(identifier: string, level?: number | null): string;
}

/* -------------------------------------------- */

/** API surface added by VisualFeedbackMixin */
export interface VisualFeedbackMixinAPI {
    /** Store previous values for comparison. */
    _previousValues: Map<string, any>;
    /** Track the last form submission time to prevent animation spam. */
    _lastSubmitTime: number;

    _captureCurrentValues(): void;
    _flashStatChange(fieldName: string, oldValue: number | string, newValue: number | string): void;
    _findFieldElement(fieldName: string): HTMLElement | null;
    _getAnimationClass(fieldName: string, oldValue: number | string, newValue: number | string): string;
    _applyAnimation(element: HTMLElement, animationClass: string): void;
    _animateDerivedStat(selector: string): void;
    _animateCounter(element: HTMLElement, fromValue: number, toValue: number, duration?: number): void;
    _showBriefNotification(element: HTMLElement, message: string, type?: string): void;
    animateStatChange(fieldName: string, animationType?: string): void;
    visualizeChanges(changes: Record<string, unknown>): void;
}

/* -------------------------------------------- */

/** API surface added by EnhancedAnimationsMixin */
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
    _previousState: any;
    /** MutationObserver for dynamic content. */
    _mutationObserver: MutationObserver | null;

    _captureAnimationState(): void;
    _setupMutationObserver(): void;
    animateCounter(element: HTMLElement, fromValue: number, toValue: number, options?: Record<string, unknown>): void;
    animateWoundsChange(oldValue: number, newValue: number): void;
    _animateWoundsBar(barElement: HTMLElement, fromPercent: number, toPercent: number): void;
    animateCharacteristicChange(charKey: string, oldValue: number, newValue: number): void;
    animateCharacteristicBonus(charKey: string, oldBonus: number, newBonus: number): void;
    animateXPGain(oldXP: number, newXP: number): void;
    _animateProgressBar(barElement: HTMLElement): void;
    _flashElement(element: HTMLElement, animClass: string, duration?: number): void;
    _shouldSkipAnimation(): boolean;
    close(options: Record<string, unknown>): any;
}

/* -------------------------------------------- */

/** API surface added by CollapsiblePanelMixin */
export interface CollapsiblePanelMixinAPI {
    _loadPanelStates(): void;
    _savePanelState(panelId: string, isExpanded: boolean): Promise<void>;
    _getPanelFlagKey(): string;
    _getPanelStates(): Record<string, boolean>;
    _applyPanelStates(): void;
    togglePanel(panelId: string, forceState?: boolean): Promise<void>;
    expandAllPanels(): Promise<void>;
    collapseAllPanels(): Promise<void>;
    applyPanelPreset(presetName: string): Promise<void>;
    collapseAllExcept(exceptPanelId: string): Promise<void>;
    _animatePanelToggle(panel: HTMLElement, willBeExpanded: boolean): Promise<void>;
    _setupPanelKeyboardShortcuts(): void;
}

/* -------------------------------------------- */

/** API surface added by ContextMenuMixin */
export interface ContextMenuMixinAPI {
    _createContextMenus(): void;
    _createCustomContextMenus(): void;
    _getCharacteristicContextOptions(target: HTMLElement): Record<string, unknown>[];
    _getSkillContextOptions(target: HTMLElement): Record<string, unknown>[];
    _getItemContextOptions(target: HTMLElement): Record<string, unknown>[];
    _getFatePointContextOptions(): Record<string, unknown>[];
    _onCharacteristicRoll(charKey: string): Promise<void>;
    _onCharacteristicRollWithModifier(charKey: string): Promise<void>;
    _showModifierSources(charKey: string): Promise<void>;
    _onAdvanceCharacteristic(charKey: string): Promise<void>;
    _postCharacteristicToChat(charKey: string, char: Record<string, unknown>): Promise<void>;
    _onEditCharacteristic(charKey: string): Promise<void>;
    _onSkillRoll(skillKey: string): Promise<void>;
    _onSkillRollWithModifier(skillKey: string): Promise<void>;
    _toggleSkillTraining(skillKey: string, level: string): Promise<void>;
    _showGoverningCharacteristic(skillKey: string, skill: Record<string, unknown>): void;
    _addSkillSpecialization(skillKey: string): Promise<void>;
    _duplicateItem(item: any): Promise<void>;
    _deleteItem(item: any): Promise<void>;
    _weaponAttack(item: any, mode: string): Promise<void>;
    _toggleEquipped(item: any): Promise<void>;
    _toggleActivated(item: any): Promise<void>;
    _spendFate(purpose: string): Promise<void>;
    _burnFatePoint(): Promise<void>;
}

/* -------------------------------------------- */

/** API surface added by EnhancedDragDropMixin (drag-drop-visual-mixin) */
export interface EnhancedDragDropMixinAPI {
    _draggedItem: Record<string, unknown> | null;
    _dragStartPos: { x: number; y: number } | null;
    _splitResult: { quantity: number } | null;

    _setupEnhancedDragDrop(): void;
    _setupDropZones(): void;
    _setupFavoritesBar(): void;
    _onEnhancedDragStart(event: DragEvent): Promise<void>;
    _createDragGhost(item: any, event: DragEvent): HTMLElement;
    _canSplitItem(item: any): boolean;
    _showSplitDialog(item: any): Promise<{ quantity: number } | null>;
    _highlightValidDropZones(item: any): void;
    _onEnhancedDragOver(event: DragEvent): void;
    _onEnhancedDragLeave(event: DragEvent): void;
    _onInventoryDragOver(event: DragEvent): void;
    _onFavoritesDragOver(event: DragEvent): void;
    _onEnhancedDrop(event: DragEvent): Promise<void>;
    _handleEquipmentDrop(item: any, slot: string): Promise<void>;
    _validateEquipmentSlot(item: any, slot: string): boolean;
    _handleGeneralDrop(item: any, event: DragEvent): Promise<void>;
    _handleSplitDrop(item: any, quantity: number): Promise<void>;
    _onInventoryDrop(event: DragEvent): Promise<void>;
    _reorderItems(sourceId: string, targetId: string, clientY: number): Promise<void>;
    _onFavoritesDrop(event: DragEvent): Promise<void>;
    _addToFavorites(item: any): Promise<void>;
    _onEnhancedDragEnd(event: DragEvent): void;
    _resetDrag(): void;
    _animateSnapToSlot(item: any): void;
    removeFromFavorites(itemId: string): Promise<void>;
    clearFavorites(): Promise<void>;
    getFavoriteItems(): unknown[];
}

/* -------------------------------------------- */

/** API surface added by WhatIfMixin */
export interface WhatIfMixinAPI {
    _whatIfActive: boolean;
    _whatIfChanges: Record<string, unknown>;
    _whatIfPreview: any;
    _whatIfImpacts: unknown[] | Record<string, unknown>;

    enterWhatIfMode(): Promise<void>;
    previewChange(path: string, value: any): Promise<void>;
    _updatePreview(): void;
    _calculateImpacts(): void;
    commitWhatIfChanges(): Promise<void>;
    cancelWhatIfChanges(): Promise<void>;
    exitWhatIfMode(): Promise<void>;
    _applyChange(path: string, value: any): Promise<void>;
    getWhatIfState(): { active: boolean; changes: Record<string, unknown>; impacts: any; changeCount: number };
    isWhatIfActive(): boolean;
    _renderWhatIfOverlay(): void;
    _createWhatIfToolbar(): HTMLElement;
    _updateComparisonDisplays(): void;
    _compareCharacteristics(current: any, preview: any): void;
    _compareSkills(current: any, preview: any): void;
    _compareDerivedStats(current: any, preview: any): void;
    _showComparison(selector: string, data: { current: number; preview: number; type: string }): void;
}

/* -------------------------------------------- */

/** API surface added by StatBreakdownMixin */
export interface StatBreakdownMixinAPI {
    close(options?: Record<string, unknown>): Promise<void>;
}

/* -------------------------------------------- */

/** API surface added by ActiveModifiersMixin */
export interface ActiveModifiersMixinAPI {
    prepareActiveModifiers(): any;
}

/* -------------------------------------------- */

/** API surface added by ItemPreviewMixin */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ItemPreviewMixinAPI {
    // All public methods are static action handlers or private (#) members.
    // No public instance API exposed beyond DEFAULT_OPTIONS actions.
}

/* -------------------------------------------- */
/*  Combined Interface                          */
/* -------------------------------------------- */

/**
 * Combined type surface for the full BaseActorSheet mixin chain.
 *
 * This captures the union of all public/protected members contributed by:
 *   ApplicationV2Mixin, PrimarySheetMixin (incl. DragDropMixin), TooltipMixin,
 *   VisualFeedbackMixin, EnhancedAnimationsMixin, CollapsiblePanelMixin,
 *   ContextMenuMixin, EnhancedDragDropMixin, WhatIfMixin, StatBreakdownMixin,
 *   ActiveModifiersMixin, ItemPreviewMixin
 *
 * Plus Foundry base ApplicationV2 / ActorSheetV2 properties.
 */
export interface BaseActorSheetMixins
    extends Omit<ApplicationV2MixinAPI, 'animateStatChange' | '_onFirstRender' | '_onRender'>,
        Omit<PrimarySheetMixinAPI, 'animateStatChange' | '_onFirstRender' | '_onRender'>,
        TooltipMixinAPI,
        Omit<VisualFeedbackMixinAPI, 'animateStatChange'>,
        Omit<EnhancedAnimationsMixinAPI, 'close'>,
        CollapsiblePanelMixinAPI,
        ContextMenuMixinAPI,
        EnhancedDragDropMixinAPI,
        WhatIfMixinAPI,
        Omit<StatBreakdownMixinAPI, 'close'>,
        ActiveModifiersMixinAPI,
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
    options: Record<string, unknown>;

    /** Render the application. */
    render(options?: Record<string, unknown> | boolean): any;
    /** Submit the application's form. */
    submit(): Promise<void>;
    /** Set the rendered position. */
    setPosition(pos: Partial<{ top: number; left: number; width: number; height: number }>): void;
}
