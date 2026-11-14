/**
 * Origin Path Builder: navigation, selection and file actions (randomise, reset, export / import, step and direction changes, picking and confirming origins).
 *
 * Split out of `origin-path-builder.ts` (#717): `this`-typed functions; the class calls
 * them with itself as `this` (`fn.call(app, …)`), and binds any handlers in
 * `DEFAULT_OPTIONS.actions`.
 */
import type { WH40KItem } from '../../../documents/item.ts';
import { GrantsManager } from '../../../managers/grants-manager.ts';
import { OriginChartLayout } from '../../../utils/origin-chart-layout.ts';
import ConfirmationDialog from '../../dialogs/confirmation-dialog.ts';
import type { NormalizedOrigin } from '../normalized-origin.ts';
import OriginDetailDialog from '../origin-detail-dialog.ts';
import type OriginPathBuilder from '../origin-path-builder.ts';
import OriginPathChoiceDialog from '../origin-path-choice-dialog.ts';
import {
    asOriginLike,
    asOriginLikeOrNull,
    asOriginLikeArray,
    asOriginLikeMap,
    type OriginPathSystemData,
    type NormalizedOriginWithMeta,
    type StepLayoutCard,
    type StepLayout,
    type GrantChoiceRaw,
    type ResolvedDocument,
} from './builder-support.ts';

/**
 * Internal method to select an origin after confirmation
 * @param {Item|object} origin - The origin to select (Item or plain data object)
 * @private
 */
function selectOrigin(this: OriginPathBuilder, origin: WH40KItem | NormalizedOrigin): void {
    const currentStep = this.currentStep;

    // Convert to plain data object if it's an Item
    const originData: NormalizedOriginWithMeta =
        'toObject' in origin && typeof origin.toObject === 'function' ? this._itemToSelectionData(origin) : foundry.utils.deepClone(origin as NormalizedOrigin);

    if (this.showLineage) {
        // An elite the character cannot take is never confirmed, however it was previewed.
        const unmet = this._eliteUnmet(originData);
        if (unmet.length > 0) {
            ui.notifications.warn(game.i18n.format('WH40K.OriginPath.EliteNotAvailable', { reasons: unmet.join(' · ') }));
            return;
        }
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

        // Auto-advance to next step if in guided mode — but only once this origin's
        // rolls are made; otherwise stay so the player rolls them here.
        const pending = this._pendingRolls(originData);
        if (pending.length > 0) {
            ui.notifications.info(game.i18n.format('WH40K.OriginPath.RollsRequired', { rolls: this._rollLabels(pending) }));
        } else if (this.guidedMode && this.currentStepIndex < this.systemConfig.coreSteps.length - 1) {
            this.currentStepIndex++;
        }
    }

    void this.render();
}

/**
 * Randomize all selections
 */
export async function randomize(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
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
export async function reset(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
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
export function exportPath(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
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
export function importPath(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
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
export function setMode(this: OriginPathBuilder, _event: Event, target: HTMLElement): void {
    const value = (target as HTMLInputElement).value || target.closest('[data-action]')?.querySelector('input')?.value;
    this.guidedMode = value === 'guided';
    void this.render();
}

/**
 * Toggle a provenance filter category (#295). Each chip carries
 * data-category="raw|adapted|homebrew"; toggling re-renders the page with the
 * origins filtered to the enabled categories (all enabled = show everything).
 */
export function toggleProvenanceFilter(this: OriginPathBuilder, _event: Event, target: HTMLElement): void {
    const category = target.dataset['category'];
    if (category === 'raw' || category === 'adapted' || category === 'homebrew') {
        this._provenanceFilter[category] = !this._provenanceFilter[category];
        void this.render();
    }
}

/**
 * Set direction (forward/backward)
 */
export async function setDirection(this: OriginPathBuilder, _event: Event, target: HTMLElement): Promise<void> {
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
export function goToStep(this: OriginPathBuilder, _event: Event, target: HTMLElement): void {
    const stepKey = target.dataset['stepKey'];
    const stepIndex = parseInt(target.dataset['stepIndex'] ?? '', 10);
    if ((stepKey === undefined || stepKey === '') && Number.isNaN(stepIndex)) return;

    if (stepKey === 'characteristics') {
        if (this.guidedMode && !this._coreStepsDone()) {
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
        if (this.guidedMode && !this._coreStepsDone()) {
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
export function previewOriginCard(this: OriginPathBuilder, _event: Event, target: HTMLElement): void {
    const originId = target.dataset['originId'];
    const originUuid = target.dataset['originUuid'];

    if ((originId === undefined || originId === '') && (originUuid === undefined || originUuid === '')) return;

    // A card the character cannot take carries data-disabled (an elite it cannot
    // afford or whose prerequisites it misses); its tooltip already says why.
    if (target.dataset['disabled'] === 'true') {
        ui.notifications.warn(game.i18n.format('WH40K.OriginPath.EliteNotAvailable', { reasons: target.dataset['tooltip'] ?? '' }));
        return;
    }
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
 * Confirm the currently previewed selection and advance to next step
 */
export async function confirmSelection(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
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
    selectOrigin.call(this, this.previewedOrigin);

    // Clear preview
    this.previewedOrigin = null;

    // Re-render
    void this.render();
}

/**
 * View origin card details (eye icon button - preview only)
 * This is now the preview/detail view - does NOT select
 */
export async function viewOriginCard(this: OriginPathBuilder, event: Event, target: HTMLElement): Promise<void> {
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
 * View origin sheet (for selected origin in detail panel)
 */
export async function viewOrigin(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
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
export function clearOrigin(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
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
export async function editChoice(this: OriginPathBuilder, _event: Event, target: HTMLElement): Promise<void> {
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
 * Go to lineage selection
 */
export function goToLineage(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
    if (this.guidedMode && !this._coreStepsDone()) {
        ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompleteAllSteps'));
        return;
    }
    this.showLineage = true;
    this.showCharacteristics = false;
    this.showEquipment = false;
    this._clearPreviewedOrigin();
    void this.render();
}

/**
 * Skip lineage selection
 */
export function skipLineage(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
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
export function goToCharacteristics(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
    if (this.guidedMode && !this._coreStepsDone()) {
        ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompleteAllSteps'));
        return;
    }
    this.showLineage = false;
    this.showCharacteristics = true;
    this.showEquipment = false;
    this._clearPreviewedOrigin();
    void this.render();
}

/**
 * Navigate to the Equip Acolyte step.
 */
export function goToEquipment(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
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
 * Open an item sheet (for talents, skills, etc.)
 */
export async function openItem(this: OriginPathBuilder, _event: Event, target: HTMLElement): Promise<void> {
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
