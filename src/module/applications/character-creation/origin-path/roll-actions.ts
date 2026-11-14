/**
 * Origin Path Builder: rolled and entered values (characteristics, point-buy, divination, Thrones, Influence, aptitude doubles) and starting-equipment picks.
 *
 * Split out of `origin-path-builder.ts` (#717): `this`-typed functions; the class calls
 * them with itself as `this` (`fn.call(app, …)`), and binds any handlers in
 * `DEFAULT_OPTIONS.actions`.
 */
import { divinationMaxim } from '../../../rules/divination.ts';
import { isHomebrewVariant } from '../../../rules/ruleset-variant.ts';
import { capitalize } from '../../../utils/format.ts';
import { RollTableUtils } from '../../../utils/roll-table-utils.ts';
import type OriginPathBuilder from '../origin-path-builder.ts';
import OriginRollDialog from '../origin-roll-dialog.ts';
import type { EquipmentEntry } from '../types.ts';
import {
    CHARACTERISTIC_ROLL_FORMULA,
    GENERATION_CHARACTERISTICS,
    type EquipmentItemEntry,
    type NormalizedOriginWithMeta,
    type OriginPathSystemData,
} from './builder-support.ts';

/**
 * Prompt for a single value via DialogV2 (the four manual-entry handlers
 * share this one-field read). Returns the raw input string, or null when the
 * dialog is dismissed; callers parse/validate per field. `min` and `hint`
 * are emitted only when provided.
 */
async function promptForValue(
    this: OriginPathBuilder,
    opts: { title: string; label: string; name: string; type: 'number' | 'text'; min?: string; hint?: string },
): Promise<string | null> {
    const minAttr = opts.min !== undefined ? ` min="${opts.min}"` : '';
    const hintHtml = opts.hint !== undefined && opts.hint !== '' ? `<p class="notes">${opts.hint}</p>` : '';
    const result = await foundry.applications.api.DialogV2.prompt({
        window: { title: opts.title },
        content: `<div class="form-group"><label>${opts.label}</label><input type="${opts.type}" name="${opts.name}"${minAttr} autofocus />${hintHtml}</div>`,
        ok: {
            callback: (_cbEvent: Event, button: HTMLButtonElement) => {
                const input = button.form?.elements.namedItem(opts.name) as HTMLInputElement | null;
                return input?.value ?? '';
            },
        },
        rejectClose: false,
    });
    return typeof result === 'string' ? result : null;
}

/**
 * Core toggle logic for an Equip Acolyte selection, reused by both the row-level
 * data-action handler and the checkbox click listener bound in _onRender.
 */
export function toggleEquipmentByUuid(this: OriginPathBuilder, uuid: string): void {
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
 * Roll a stat using the roll dialog
 */
export async function rollStat(this: OriginPathBuilder, _event: Event, target: HTMLElement): Promise<void> {
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
export async function manualStat(this: OriginPathBuilder, _event: Event, target: HTMLElement): Promise<void> {
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

    const raw = await promptForValue.call(this, {
        title: game.i18n.localize(`WH40K.OriginPath.Enter${capitalize(statType)}`),
        label: game.i18n.localize('WH40K.OriginPath.ManualValue'),
        name: 'value',
        type: 'number',
        min: '1',
        hint: `${game.i18n.localize('WH40K.OriginPath.FormulaHint')}: ${formula}`,
    });

    const rolledValue = raw === null ? null : parseInt(raw, 10) || null;
    if (rolledValue !== null) {
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
 * Toggle selection of an Armoury item for the Equip Acolyte step.
 */
export function toggleEquipmentItem(this: OriginPathBuilder, _event: Event, target: HTMLElement): void {
    const uuid = target.dataset['uuid'];
    if (uuid === undefined || uuid === '') return;
    toggleEquipmentByUuid.call(this, uuid);
}

/**
 * Clear all Equip Acolyte selections.
 */
export function clearEquipment(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
    this.equipmentSelections.clear();
    void this.render();
}

/**
 * Roll the full characteristic bank (one {@link CHARACTERISTIC_ROLL_FORMULA}
 * roll per slot) for the homebrew shared-pool mode. The player then drags
 * each result onto a characteristic.
 */
export async function rollCharacteristicsBank(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
    const rollInstances = Array.from({ length: GENERATION_CHARACTERISTICS.length }, () => new Roll(CHARACTERISTIC_ROLL_FORMULA));
    await Promise.all(rollInstances.map(async (roll) => roll.evaluate()));
    const rolls: number[] = rollInstances.map((roll) => roll.total ?? 0);

    this._charRolls = rolls;
    void this.render();
}

/**
 * `roll` mode: roll one value per characteristic and lock it in order
 * (no bank, no drag). Delegates to the pure `_generateRollModeValues`.
 */
export async function rollCharacteristics(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
    await this._generateRollModeValues();
    void this.render();
}

/**
 * `point-buy` mode: adjust the points allocated to one characteristic by a
 * signed delta read from `data-delta`. Validation lives in the pure
 * `_adjustPointBuy` (caps at the remaining pool, floors at 0).
 */
export function adjustPointBuy(this: OriginPathBuilder, _event: Event, target: HTMLElement): void {
    const key = target.dataset['characteristic'];
    const delta = parseInt(target.dataset['delta'] ?? '', 10);
    if (key === undefined || key === '' || Number.isNaN(delta)) return;
    this._adjustPointBuy(key, delta);
    void this.render();
}

/**
 * Reset characteristic state for the active mode: clears dice assignments
 * for the roll modes, or zeroes every point-buy allocation in point-buy
 * mode (refunding the whole pool).
 */
export function charReset(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
    const CHARS = GENERATION_CHARACTERISTICS;
    if (this._charGenMode === 'point-buy') {
        for (const key of CHARS) {
            this._charPointBuy[key] = 0;
        }
    } else {
        for (const key of CHARS) {
            this._charAssignments[key] = null;
        }
    }
    void this.render();
}

/**
 * Toggle advanced mode for characteristics.
 */
export function charToggleAdvanced(this: OriginPathBuilder, _event: Event, _target: HTMLElement): void {
    this._charAdvancedMode = !this._charAdvancedMode;
    void this.render();
}

/**
 * Switch the character-generation mode (`point-buy`, `roll`, or the
 * homebrew shared-pool `roll-pool-hb`). Each mode keeps its own state, so
 * switching is non-destructive — flipping back restores the prior inputs.
 */
export function setCharGenMode(this: OriginPathBuilder, _event: Event, target: HTMLElement): void {
    const mode = target.dataset['mode'];
    if (mode === 'point-buy' || mode === 'roll' || mode === 'roll-pool-hb') {
        this._charGenMode = mode;
        void this.render();
    }
}

/**
 * Roll on the Divination compendium RollTable (the DH2 Divination table).
 * The table text lives in the private packs submodule (GW-copyrighted); if
 * the pack isn't installed, fall back to a bare 1d100 so the player at
 * least records a roll result and can fill in the maxim by hand.
 */
export async function rollDivination(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
    const table = await getDivinationTable();
    if (table !== null) {
        try {
            const rollTable = table as RollTable;
            const draw = await rollTable.draw({ displayChat: true });
            const [result] = draw.results;
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry TableResult `.text` is not in our shipped types; structural read narrowed via typeof guard below
            const resultRecord = result as { text?: unknown } | undefined;
            const resultText =
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: array destructure is T|undefined under main tsconfig; ESLint uses tsconfig.test.json where it's always T
                resultRecord !== undefined && typeof resultRecord.text === 'string' ? resultRecord.text : null;
            if (resultText !== null) {
                // The result is rich text (bold maxim + effect); the character keeps the maxim.
                this._divination = divinationMaxim(resultText);
                this._saveScrollPosition();
                void this.render();
                return;
            }
        } catch (error) {
            console.error('[wh40k-rpg] Failed to draw Divination RollTable.', error);
        }
    }
    // The Divination table text lives in the private packs submodule
    // (GW-copyrighted). When it is not installed #getDivinationTable
    // returns null, so no draw() is attempted and Foundry never raises
    // its "no available results" notification. Fall back to a bare 1d100
    // so the player records a roll and fills the maxim in by hand.
    const roll = new Roll('1d100');
    await roll.evaluate();
    this._divination = game.i18n.format('WH40K.OriginPath.DivinationTableUnavailable', {
        roll: String(roll.total ?? 0),
    });
    this._saveScrollPosition();
    void this.render();
}

/**
 * Resolve the Divination RollTable, preferring a world-local copy (which
 * a GM may have edited) and falling back to the compendium entry.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: RollTable is an untyped Foundry document; caller casts to structural type before use
async function getDivinationTable(): Promise<unknown> {
    // A RollTable with zero results makes Foundry's draw() raise a
    // user-facing "no available results" notification. Treat an
    // empty/absent table as unavailable so the caller can fall back
    // to a bare 1d100 instead.
    // eslint-disable-next-line no-restricted-syntax -- boundary: candidate is an untyped Foundry RollTable document; structural narrowing via typeof on the next line is the guard
    const hasResults = (candidate: unknown): boolean => {
        const size = (candidate as { results?: { size?: number } }).results?.size;
        return typeof size === 'number' && size > 0;
    };

    // eslint-disable-next-line no-restricted-syntax -- boundary: game.tables.getName returns an untyped Foundry document; narrowed by caller
    const worldTable = (game.tables as { getName?: (name: string) => unknown } | undefined)?.getName?.('Divination');
    if (worldTable !== undefined && worldTable !== null && hasResults(worldTable)) return worldTable;

    // The compendium copy lives in DH2's roll-table packs.
    const document = await RollTableUtils.findTableInCompendiums('Divination', 'dh2');
    if (document === null) {
        console.warn('[wh40k-rpg] Divination RollTable not found in the roll-table packs.');
        return null;
    }

    if (!hasResults(document)) {
        console.warn('[wh40k-rpg] Divination RollTable has no results; using 1d100 fallback.', { tableUuid: document.uuid });
        return null;
    }

    return document;
}

/**
 * Manually enter a divination.
 */
export async function manualDivination(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
    const text = await promptForValue.call(this, {
        title: game.i18n.localize('WH40K.CharGen.DivinationPlaceholder'),
        label: game.i18n.localize('WH40K.OriginPath.ManualDivinationLabel'),
        name: 'divination',
        type: 'text',
    });
    if (text !== null && text !== '') {
        this._divination = divinationMaxim(text);
        this._saveScrollPosition();
        void this.render();
    }
}

/**
 * Roll starting throne gelt from combined homeworld + background formulas.
 */
export async function rollThrones(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
    const formula = this._getContextualThronesFormula();
    if (formula === '') {
        ui.notifications.warn(game.i18n.localize('WH40K.Notify.OriginPath.NoThronesFormula'));
        return;
    }
    const roll = new Roll(formula);
    await roll.evaluate();
    this._thronesRolled = roll.total ?? 0;
    this._saveScrollPosition();
    void this.render();
}

export async function manualThrones(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
    const raw = await promptForValue.call(this, {
        title: game.i18n.localize('WH40K.OriginPath.ManualThronesPromptTitle'),
        label: game.i18n.localize('WH40K.OriginPath.ManualThronesLabel'),
        name: 'value',
        type: 'number',
        min: '0',
    });
    const val = raw === null ? NaN : parseInt(raw, 10);
    if (!Number.isNaN(val)) {
        this._thronesRolled = val;
        this._saveScrollPosition();
        void this.render();
    }
}

/**
 * Roll starting influence (1d5 + Fellowship Bonus + homeworld modifier).
 */
export async function rollInfluence(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
    if (isHomebrewVariant(this.gameSystem)) {
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

export async function manualInfluence(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
    const raw = await promptForValue.call(this, {
        title: game.i18n.localize('WH40K.OriginPath.ManualInfluencePromptTitle'),
        label: game.i18n.localize('WH40K.OriginPath.ManualInfluenceLabel'),
        name: 'value',
        type: 'number',
        min: '0',
    });
    const val = raw === null ? NaN : parseInt(raw, 10);
    if (!Number.isNaN(val)) {
        this._influenceRolled = val;
        this._saveScrollPosition();
        void this.render();
    }
}

/**
 * Resolve a duplicate-aptitude collision (#205). Opens a picker prompting
 * the player to swap the doubled aptitude for one their character does not
 * already have. Per DH2 RAW, when an origin step would grant an aptitude
 * the character already possesses, the player picks any aptitude they
 * don't currently have. The picker pool is mined from the loaded origin
 * compendium (Direction #7 — no hardcoded aptitude registry in `src/`).
 * A non-selection leaves the collision unresolved so the warning banner
 * stays visible until the player or GM acts.
 */
export async function resolveAptitudeDouble(this: OriginPathBuilder, _event: Event, target: HTMLElement): Promise<void> {
    const original = target.dataset['aptitude'];
    if (original === undefined || original === '') return;

    // Build the candidate pool: every aptitude name referenced in loaded
    // origin items, minus aptitudes the character already has (whether
    // pre-existing or freshly granted) and minus already-chosen
    // replacements so the player doesn't double-pick.
    const taken = new Set<string>(this._collectExistingAptitudes());
    for (const apt of this._collectAptitudeGrantCounts().keys()) taken.add(apt);
    for (const replacement of this.aptitudeOverrides.values()) {
        if (replacement !== '') taken.add(replacement);
    }
    const candidates = this._collectAvailableAptitudePool(taken);

    if (candidates.length === 0) {
        ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.AptitudeDouble.NoCandidates'));
        return;
    }

    const optionsHtml = candidates.map((apt) => `<option value="${apt}">${apt}</option>`).join('');
    const promptLabel = game.i18n.format('WH40K.OriginPath.AptitudeDouble.PromptBody', { aptitude: original });
    const pickerLabel = game.i18n.localize('WH40K.OriginPath.AptitudeDouble.PickerLabel');

    const picked = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize('WH40K.OriginPath.AptitudeDouble.DialogTitle') },
        content: `
            <p>${promptLabel}</p>
            <div class="form-group">
                <label>${pickerLabel}</label>
                <select name="replacement" class="origin-path-aptitude-replacement">${optionsHtml}</select>
            </div>
        `,
        ok: {
            label: game.i18n.localize('WH40K.OriginPath.AptitudeDouble.ConfirmLabel'),
            callback: (_cbEvent: Event, button: HTMLButtonElement) => {
                const form = button.form;
                const select = form?.elements.namedItem('replacement') as HTMLSelectElement | null;
                return select?.value ?? '';
            },
        },
        rejectClose: false,
    });

    if (picked === null || picked === '') return;
    this.aptitudeOverrides.set(original, picked);
    ui.notifications.info(game.i18n.format('WH40K.OriginPath.AptitudeDouble.Resolved', { from: original, to: picked }));
    void this.render();
}
