/**
 * @file RegimentBuilderDialog — Only War Regiment Creation walkthrough (#151).
 *
 * Thin UI shell over `computeRegimentBudget` /
 * `aggregateRegimentGrants` from
 * `src/module/rules/ow-regiment-creation.ts`. Each click on an option
 * tile toggles its selection; the live 12-point budget readout updates
 * via re-render. On commit the dialog writes
 * `system.regimentSelection` back to the owning actor (when bound).
 *
 * Per Direction #7 the dialog NEVER hardcodes specific Home Worlds,
 * Commanding Officers, Regiment Types, Training/Special Equipment
 * Doctrines, or Favoured Weapons — the caller supplies the
 * `RegimentOption` catalog, resolved from the OW compendium. Story /
 * probe instantiations pass an empty catalog and the dialog renders
 * with empty category lists.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import {
    REGIMENT_BUDGET,
    REGIMENT_CATEGORIES,
    type RegimentCategory,
    type RegimentOption,
    type RegimentSelection,
    computeRegimentBudget,
    emptyRegimentSelection,
} from '../../rules/ow-regiment-creation.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Map RegimentCategory → i18n label key. */
const CATEGORY_LABEL_KEYS: Readonly<Record<RegimentCategory, string>> = Object.freeze({
    homeWorld: 'WH40K.OW.Regiment.Category.HomeWorld',
    commandingOfficer: 'WH40K.OW.Regiment.Category.CommandingOfficer',
    regimentType: 'WH40K.OW.Regiment.Category.RegimentType',
    trainingDoctrine: 'WH40K.OW.Regiment.Category.TrainingDoctrine',
    specialEquipmentDoctrine: 'WH40K.OW.Regiment.Category.SpecialEquipmentDoctrine',
    favouredWeapons: 'WH40K.OW.Regiment.Category.FavouredWeapons',
});

interface OptionRow {
    readonly id: string;
    readonly label: string;
    readonly cost: number;
    readonly selected: boolean;
}

interface CategoryRow {
    readonly id: RegimentCategory;
    readonly labelKey: string;
    readonly spent: number;
    readonly options: ReadonlyArray<OptionRow>;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface RegimentBuilderContext extends Record<string, unknown> {
    readonly budget: { spent: number; total: number; valid: boolean; over: boolean };
    readonly categories: ReadonlyArray<CategoryRow>;
}

/** Multi-pick categories store their selection in an array slot. */
type SinglePickCategory = 'homeWorld' | 'commandingOfficer' | 'regimentType';

function isMultiPick(category: RegimentCategory): category is 'trainingDoctrine' | 'specialEquipmentDoctrine' {
    return category === 'trainingDoctrine' || category === 'specialEquipmentDoctrine';
}

/** Favoured-Weapons has paired close / ranged sub-slots. */
function isFavouredWeapons(category: RegimentCategory): category is 'favouredWeapons' {
    return category === 'favouredWeapons';
}

/**
 * Toggle one option id inside the selection. Single-pick categories
 * replace the current slot; multi-pick categories add/remove from the
 * array; favoured-weapons cycles close → ranged → off based on the
 * option's `favouredWeaponSlot` tag stored on its grants. Without that
 * tag we default to the close slot (callers can extend the option
 * catalog to disambiguate).
 */
function toggleSelection(selection: RegimentSelection, category: RegimentCategory, optionId: string): RegimentSelection {
    if (isFavouredWeapons(category)) {
        // Cycle: empty → close → ranged → none
        if (selection.favouredWeapons.close === optionId) {
            return { ...selection, favouredWeapons: { close: '', ranged: optionId } };
        }
        if (selection.favouredWeapons.ranged === optionId) {
            return { ...selection, favouredWeapons: { close: selection.favouredWeapons.close ?? '', ranged: '' } };
        }
        // First click: assign to close if vacant, otherwise to ranged.
        if (selection.favouredWeapons.close === undefined || selection.favouredWeapons.close === '') {
            return { ...selection, favouredWeapons: { close: optionId, ranged: selection.favouredWeapons.ranged ?? '' } };
        }
        return { ...selection, favouredWeapons: { close: selection.favouredWeapons.close, ranged: optionId } };
    }

    if (isMultiPick(category)) {
        const key = category === 'trainingDoctrine' ? 'trainingDoctrines' : 'specialEquipmentDoctrines';
        const current = selection[key];
        const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
        return { ...selection, [key]: next };
    }

    // Single-pick: clicking the active option clears it; otherwise replace.
    const slotKey = category as SinglePickCategory;
    const currentValue = selection[slotKey];
    return { ...selection, [slotKey]: currentValue === optionId ? '' : optionId };
}

function selectionContainsForCategory(selection: RegimentSelection, category: RegimentCategory, optionId: string): boolean {
    if (isFavouredWeapons(category)) {
        return selection.favouredWeapons.close === optionId || selection.favouredWeapons.ranged === optionId;
    }
    if (isMultiPick(category)) {
        const key = category === 'trainingDoctrine' ? 'trainingDoctrines' : 'specialEquipmentDoctrines';
        return selection[key].includes(optionId);
    }
    return selection[category as SinglePickCategory] === optionId;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern (matches colony-growth-dialog)
export default class RegimentBuilderDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare selection: RegimentSelection;
    declare catalog: ReadonlyArray<RegimentOption>;
    /** Owning actor whose `system.regimentSelection` is the source of truth. Null in story / probe contexts. */
    declare actor: WH40KBaseActor | null;

    constructor(
        options: ApplicationV2Config.DefaultOptions & {
            actor?: WH40KBaseActor | null;
            selection?: RegimentSelection;
            catalog?: ReadonlyArray<RegimentOption>;
        } = {},
    ) {
        super(options);
        this.actor = options.actor ?? null;
        this.selection = options.selection ?? readSelectionFromActor(this.actor) ?? emptyRegimentSelection();
        this.catalog = options.catalog ?? [];
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'regiment-builder-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            toggleOption: RegimentBuilderDialog.#onToggleOption,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            commitRegiment: RegimentBuilderDialog.#onCommit,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancelRegiment: RegimentBuilderDialog.#onCancel,
        },
        position: { width: 560 },
        window: {
            title: 'WH40K.OW.Regiment.DialogTitle',
            resizable: true,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/regiment-builder-dialog.hbs',
            classes: [],
            scrollable: ['.tw-flex-col'],
        },
    };

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<RegimentBuilderContext> {
        const baseCtx = (await super._prepareContext(options)) as RegimentBuilderContext;
        const budgetResult = computeRegimentBudget(this.selection, this.catalog);

        const categories: CategoryRow[] = REGIMENT_CATEGORIES.map((cat) => {
            const opts: OptionRow[] = this.catalog
                .filter((o) => o.category === cat)
                .map((o) => ({
                    id: o.id,
                    label: o.id, // caller-supplied catalog should pre-resolve display labels; default to the id
                    cost: o.cost,
                    selected: selectionContainsForCategory(this.selection, cat, o.id),
                }));
            return {
                id: cat,
                labelKey: CATEGORY_LABEL_KEYS[cat],
                spent: budgetResult.perCategory[cat],
                options: opts,
            };
        });

        return {
            ...baseCtx,
            budget: {
                spent: budgetResult.spent,
                total: REGIMENT_BUDGET,
                valid: budgetResult.valid,
                over: budgetResult.remaining < 0,
            },
            categories,
        };
    }

    static async #onToggleOption(this: RegimentBuilderDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const categoryStr = target.dataset['category'];
        const optionId = target.dataset['optionId'];
        if (typeof categoryStr !== 'string' || typeof optionId !== 'string' || optionId === '') return;
        if (!isRegimentCategory(categoryStr)) return;
        this.selection = toggleSelection(this.selection, categoryStr, optionId);
        await this.render();
    }

    static async #onCommit(this: RegimentBuilderDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const result = computeRegimentBudget(this.selection, this.catalog);
        if (!result.valid) return; // template also disables the button at !valid

        if (this.actor !== null) {
            await this.actor.update({
                'system.regimentSelection.homeWorld': this.selection.homeWorld ?? '',
                'system.regimentSelection.commandingOfficer': this.selection.commandingOfficer ?? '',
                'system.regimentSelection.regimentType': this.selection.regimentType ?? '',
                'system.regimentSelection.trainingDoctrines': [...this.selection.trainingDoctrines],
                'system.regimentSelection.specialEquipmentDoctrines': [...this.selection.specialEquipmentDoctrines],
                'system.regimentSelection.favouredWeapons.close': this.selection.favouredWeapons.close ?? '',
                'system.regimentSelection.favouredWeapons.ranged': this.selection.favouredWeapons.ranged ?? '',
            });
        }
        await this.close();
    }

    static async #onCancel(this: RegimentBuilderDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }

    /** Convenience opener, mirrors `ColonyGrowthDialog.show`. */
    static show(actor: WH40KBaseActor, catalog: ReadonlyArray<RegimentOption> = []): RegimentBuilderDialog {
        const dialog = new RegimentBuilderDialog({ actor, catalog });
        void dialog.render({ force: true });
        return dialog;
    }
}

function isRegimentCategory(value: string): value is RegimentCategory {
    return (
        value === 'homeWorld' ||
        value === 'commandingOfficer' ||
        value === 'regimentType' ||
        value === 'trainingDoctrine' ||
        value === 'specialEquipmentDoctrine' ||
        value === 'favouredWeapons'
    );
}

/**
 * Pull the persisted selection off an actor's `system.regimentSelection`
 * slot. Returns `undefined` when no actor is bound or when the slot is
 * absent (e.g. a non-OW actor opening the dialog from a probe).
 */
function readSelectionFromActor(actor: WH40KBaseActor | null): RegimentSelection | undefined {
    if (actor === null) return undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: regimentSelection lives on the per-system OW actor schema; not exposed on the abstract WH40KBaseActor system surface
    const slot = (actor.system as { regimentSelection?: RegimentSelection }).regimentSelection;
    if (slot === undefined) return undefined;
    return {
        homeWorld: slot.homeWorld ?? '',
        commandingOfficer: slot.commandingOfficer ?? '',
        regimentType: slot.regimentType ?? '',
        trainingDoctrines: [...(slot.trainingDoctrines ?? [])],
        specialEquipmentDoctrines: [...(slot.specialEquipmentDoctrines ?? [])],
        favouredWeapons: {
            close: slot.favouredWeapons.close ?? '',
            ranged: slot.favouredWeapons.ranged ?? '',
        },
    };
}

/** Convenience opener for sheets / chat-card buttons. */
export function openRegimentBuilderDialog(
    opts: {
        actor?: WH40KBaseActor | null;
        selection?: RegimentSelection;
        catalog?: ReadonlyArray<RegimentOption>;
    } = {},
): void {
    const dialog = new RegimentBuilderDialog(opts);
    void dialog.render({ force: true });
}
