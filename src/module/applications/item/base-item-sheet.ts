/**
 * @file BaseItemSheet - Base item sheet built on ApplicationV2
 * Based on dnd5e's ItemSheet5e pattern for Foundry V13+
 */

import { WH40K } from '../../config.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import { isValidImagePath } from '../../utils/image-path.ts';
import { getMaterializedItemSource, remapSubmitDataToVariantPaths } from '../../utils/item-variant-utils.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import ApplicationV2Mixin, { setupNumberInputAutoSelect } from '../api/application-v2-mixin.ts';
import * as EffectActions from '../api/effect-actions.ts';
import type { EffectsOwner } from '../api/effect-actions.ts';
import ExpandableTooltipMixin from '../api/expandable-tooltip-mixin.ts';
import PrimarySheetMixin from '../api/primary-sheet-mixin.ts';
import { ITEM_SHEET_TABS } from '../api/sheet-tabs.ts';
import StatBreakdownMixin from '../api/stat-breakdown-mixin.ts';
import EffectCreationDialog from '../prompts/effect-creation-dialog.ts';
import { type FormObject, isFormObject, isFormValue, mergeIndexedArrays } from './reference-list-edits.ts';

const { ItemSheetV2 } = foundry.applications.sheets;

/** Tab label localization keys, hoisted so the static TABS entries reference identifiers. */
const TAB_LABEL_DESCRIPTION = 'WH40K.Tabs.Description';
const TAB_LABEL_EFFECTS = 'WH40K.Tabs.Effects';

/** The modifiers editor's Basic / Situational / Advanced tab group, and the tab it opens on (#669). */
const MODIFIERS_TAB_GROUP = 'modifiers';
const MODIFIERS_INITIAL_TAB = 'basic';

/**
 * Base item sheet built on ApplicationV2.
 * All item sheets should extend this class.
 *
 * Mixin Stack (bottom to top):
 * - ItemSheetV2 (Foundry base)
 * - ApplicationV2Mixin (V2 patterns)
 * - PrimarySheetMixin (primary sheet management)
 * - ExpandableTooltipMixin (click-to-expand tooltips)
 * - StatBreakdownMixin (stat calculation breakdowns)
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- boundary: Foundry V14 ItemSheetV2 mixin chain requires `any` to compose; full typing pending */
export default class BaseItemSheet<TItem extends WH40KItemDocument = WH40KItemDocument> extends StatBreakdownMixin(
    // biome-ignore lint/suspicious/noExplicitAny: boundary - Foundry V14 ItemSheetV2 mixin chain requires `any` to compose; full typing pending
    ExpandableTooltipMixin(PrimarySheetMixin(ApplicationV2Mixin(ItemSheetV2 as any))),
) {
    /* eslint-enable @typescript-eslint/no-explicit-any */
    declare document: TItem;

    constructor(options: Partial<ApplicationV2Config.DefaultOptions> = {}) {
        super(options);
    }

    /* -------------------------------------------- */

    /**
     * Open the sheet of the document referenced by `uuid` — the
     * `fromUuid(uuid) → sheet.render(true)` idiom shared across the item sheets
     * (weapon/armour modifications, talent/container nested items, …) (#290).
     * Returns false (and optionally notifies) when the uuid no longer resolves.
     */
    async viewItemByUuid(uuid: string, notFoundMessage?: string): Promise<boolean> {
        if (uuid === '') return false;
        // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns the broad Foundry document union; we only need the sheet handle
        const doc = (await fromUuid(uuid)) as { sheet?: { render: (force: boolean) => unknown } | null } | null;
        if (doc === null) {
            if (notFoundMessage !== undefined && notFoundMessage !== '') ui.notifications.error(notFoundMessage);
            return false;
        }
        void doc.sheet?.render(true);
        return true;
    }

    /* -------------------------------------------- */

    /**
     * ItemSheetV2's own drop handling: a dropped Active Effect is copied onto the
     * item. A sheet that overrides `_onDrop` for its own drops (nested items,
     * references) passes every other drop here, so it never swallows one (#697).
     * The mixin chain erases ItemSheetV2's `_onDrop` from the static type, so it is
     * reached through the prototype.
     */
    async _onDropDefault(event: DragEvent): Promise<void> {
        const proto = Object.getPrototypeOf(BaseItemSheet.prototype) as { _onDrop?: (this: BaseItemSheet, e: DragEvent) => Promise<void> };
        await proto._onDrop?.call(this, event);
    }

    /* -------------------------------------------- */

    /** Section collapse stays usable on a locked item sheet (#629). */
    static override VIEW_ONLY_ACTIONS: readonly string[] = ['toggleSection'];

    /** @override */
    /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
    static override DEFAULT_OPTIONS = {
        tag: 'form',
        actions: {
            editImage: BaseItemSheet.#onEditImage,
            toggleEditMode: BaseItemSheet.#toggleEditMode,
            createEffect: BaseItemSheet.#createEffect,
            effectEdit: EffectActions.effectEdit,
            effectDelete: EffectActions.effectDelete,
            effectToggle: EffectActions.effectToggle,
            toggleSection: BaseItemSheet.#toggleSection,
        },
        tabs: ITEM_SHEET_TABS.map((config) => ({ ...config })),
        classes: ['wh40k-rpg', 'sheet', 'item', 'wh40k-item-sheet'],
        form: {
            submitOnChange: true,
        },
        position: {
            width: 550,
            height: 500,
        },
        window: {
            resizable: true,
        },
    };
    /* eslint-enable @typescript-eslint/unbound-method */

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override TABS = [
        { tab: 'description', group: 'primary', label: TAB_LABEL_DESCRIPTION },
        { tab: 'effects', group: 'primary', label: TAB_LABEL_EFFECTS },
    ];

    /* -------------------------------------------- */

    /** @override */
    override tabGroups: Record<string, string> = {
        primary: 'description',
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Convenience access to the item, typed to the concrete document type
     * supplied by each subclass via the `TItem` generic parameter.
     */
    get item(): TItem {
        return this.document;
    }

    /* -------------------------------------------- */

    /**
     * Whether the sheet is in edit mode.
     * Compendium items are always in view mode.
     * @private
     */
    #editMode = false;

    /**
     * Whether this item is from a compendium (read-only).
     */
    get isCompendiumItem(): boolean {
        return this.item.pack !== null;
    }

    /**
     * Whether this item is owned by an actor.
     */
    get isOwnedByActor(): boolean {
        return !!this.item.actor;
    }

    /**
     * Whether the sheet should show edit controls.
     */
    get canEdit(): boolean {
        if (this.isCompendiumItem) return false;
        return this.isEditable;
    }

    /**
     * Whether the sheet is currently in edit mode.
     */
    get inEditMode(): boolean {
        // Compendium items are never in edit mode
        if (this.isCompendiumItem) return false;
        // For actor-owned items, use toggle state
        // For world items, always allow editing if editable
        if (!this.isOwnedByActor) return this.isEditable;
        return this.#editMode && this.isEditable;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns untyped record
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        // Get parent context first
        const parentContext = await super._prepareContext(options);

        // Ruleset state (RAW vs Homebrew)
        const ruleset = WH40KSettings.getRuleset();

        // Build our context
        // eslint-disable-next-line no-restricted-syntax -- boundary: render context is untyped per ApplicationV2 contract
        const context: Record<string, unknown> = {
            item: this.item,
            document: this.item, // Required for V13 {{editor}} helper
            system: this.item.system,
            source: this.isEditable ? getMaterializedItemSource(this.item) : this.item.system,
            fields: this.item.system.schema.fields,
            effects: this.item.getEmbeddedCollection('ActiveEffect').contents,
            flags: this.item.flags,
            dh: CONFIG.wh40k,
            ruleset,
            isHomebrew: ruleset === 'homebrew',
            isRaw: ruleset === 'raw',
            hideThroneGelt: ruleset === 'raw',
            isEditable: this.isEditable,
            editable: this.isEditable, // Alias for template compatibility with {{editor}} helper
            owner: this.item.isOwner, // Required for {{editor}} helper
            rollableClass: this.isEditable ? 'rollable' : '',
            // Edit mode properties (available to all item sheets)
            canEdit: this.canEdit,
            inEditMode: this.inEditMode,
            isCompendiumItem: this.isCompendiumItem,
            isOwnedByActor: this.isOwnedByActor,
            // Tab state. `tabGroups` lets in-sheet tab groups render their open tab; sheets declare
            // their own tabGroups, so the modifiers editor's opening tab is supplied here.
            tabs: this._getTabs(),
            tabGroups: { [MODIFIERS_TAB_GROUP]: MODIFIERS_INITIAL_TAB, ...this.tabGroups },
        };

        // Ensure dh has required config properties for selectOptions (safety measure)
        // eslint-disable-next-line no-restricted-syntax -- boundary: dh is built from heterogeneous CONFIG sources; loose shape required
        const dh = context['dh'] as { availabilities?: unknown; craftsmanships?: unknown };
        // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.wh40k is untyped at the global Foundry CONFIG level
        const cfgWh = (CONFIG as { WH40K?: { availabilities?: unknown; craftsmanships?: unknown } }).WH40K;
        if (dh.availabilities === undefined) {
            dh.availabilities = cfgWh?.availabilities ?? WH40K.availabilities;
        }
        if (dh.craftsmanships === undefined) {
            dh.craftsmanships = cfgWh?.craftsmanships ?? WH40K.craftsmanships;
        }

        // Merge contexts: parent provides base, our values override
        // Use spread to avoid "object is not extensible" errors with frozen parentContext
        return { ...parentContext, ...context };
    }

    /* -------------------------------------------- */

    /**
     * Prepare the tabs for the sheet.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: tab descriptor map is untyped per ApplicationV2 contract
    override _getTabs(): Record<string, Record<string, unknown>> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: tab map is keyed by arbitrary tab id strings
        const tabs: Record<string, Record<string, unknown>> = {};
        interface TabDescriptor {
            tab: string;
            group: string;
            label?: string;
            // eslint-disable-next-line no-restricted-syntax -- boundary: predicate operates on heterogeneous documents
            condition?: (doc: unknown) => boolean;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: subclass TABS shape varies; narrowed locally to TabDescriptor
        const configTabs = (this.constructor as typeof BaseItemSheet).TABS as unknown as TabDescriptor[];
        for (const { tab, group, label, condition } of configTabs) {
            if (condition !== undefined && !condition(this.document)) continue;
            tabs[tab] = {
                id: tab,
                tab,
                group,
                // TABS declare langpack keys; the shared tab strip prints the label verbatim (#638).
                label: label === undefined ? undefined : game.i18n.localize(label),
                active: this.tabGroups[group] === tab,
                cssClass: this.tabGroups[group] === tab ? 'active' : '',
            };
        }
        return tabs;
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /**
     * Fold index-keyed array fields back onto the stored elements before
     * DocumentSheetV2 validates the submit. A form names an array element's inputs
     * by index (`system.trainedSkills.0.bonus`) and carries only the ones it
     * renders; an `ArrayField` is written whole, so without this every field the
     * row doesn't render (a skill's key and name) fell back to its default (#656).
     */
    _processFormData(event: SubmitEvent | null, form: HTMLFormElement, formData: FormDataExtended): FormObject {
        // The mixin chain erases DocumentSheetV2's `_processFormData` (expandObject of the form data) from the static type.
        const proto = Object.getPrototypeOf(BaseItemSheet.prototype) as {
            _processFormData: (this: BaseItemSheet, e: SubmitEvent | null, f: HTMLFormElement, fd: FormDataExtended) => FormObject;
        };
        const data = proto._processFormData.call(this, event, form, formData);
        const { system } = data;
        const source = getMaterializedItemSource(this.item);
        if (!isFormObject(system) || !isFormValue(source) || !isFormObject(source)) return data;
        return { ...data, system: mergeIndexedArrays(system, source) };
    }

    /* -------------------------------------------- */

    /**
     * Prepare form data for submission.
     * Override to clean img field before validation (V13 strictness).
     * @override
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareSubmitData returns untyped record
    _prepareSubmitData(event: SubmitEvent, form: HTMLFormElement, formData: FormDataExtended, updateData?: object): Record<string, unknown> {
        // `updateData` is core's FOURTH argument — the payload a programmatic
        // `sheet.submit({updateData})` carries, which core merges over the form
        // data. Omitting it here silently discarded every programmatic submit
        // against an item sheet (the form itself still worked, so it looked
        // fine); accept it and pass it straight through.
        type SuperWithPrepare = {
            // eslint-disable-next-line no-restricted-syntax -- boundary: super signature varies between V13/V14 typings
            _prepareSubmitData?: (e: SubmitEvent, f: HTMLFormElement, fd: FormDataExtended, ud?: object) => Record<string, unknown>;
        };
        const proto = Object.getPrototypeOf(BaseItemSheet.prototype) as SuperWithPrepare;
        let submitData = proto._prepareSubmitData?.call(this, event, form, formData, updateData) ?? {};

        // An unusable img is dropped so the document keeps its stored image (V13+ validation
        // rejects anything that is not an image path).
        if ('img' in submitData && !isValidImagePath(submitData['img'])) delete submitData['img'];

        submitData = remapSubmitDataToVariantPaths(this.item, submitData);

        return submitData;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender accepts untyped context record
    override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        // Handle delta inputs for numeric fields
        if (this.isEditable) {
            this.element.querySelectorAll('input[type="text"][data-dtype="Number"]').forEach((i) => {
                i.addEventListener('change', (e) => this._onChangeInputDelta(e));
            });
        }

        // Auto-select number input values on focus for easy editing
        setupNumberInputAutoSelect(this.element);

        // Equipped toggle: burst-pulse animation on check
        this.element.querySelectorAll<HTMLInputElement>('.wh40k-toggle-equipped input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
                if (!cb.checked) return;
                const icon = cb.closest<HTMLElement>('.wh40k-toggle-equipped')?.querySelector<HTMLElement>('.wh40k-toggle-equipped__indicator i');
                if (!icon) return;
                icon.classList.remove('tw-animate-[burst-pulse_0.4s_ease]');
                void icon.offsetWidth;
                icon.classList.add('tw-animate-[burst-pulse_0.4s_ease]');
                icon.addEventListener('animationend', () => icon.classList.remove('tw-animate-[burst-pulse_0.4s_ease]'), { once: true });
            });
        });
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

        const firstChar = value.charAt(0);
        if (firstChar === '=') {
            // Set absolute value
            const absolute = parseFloat(value.slice(1));
            if (!Number.isNaN(absolute)) input.value = String(absolute);
        } else if (firstChar === '+' || firstChar === '-') {
            // Add or subtract delta
            const current = Number(foundry.utils.getProperty(this.item, input.name)) || 0;
            const delta = parseFloat(value);
            if (!Number.isNaN(delta)) input.value = String(current + delta);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an image via the file browser.
     */
    static async #onEditImage(this: BaseItemSheet, _event: Event, target: HTMLElement): Promise<void> {
        const attr = target.dataset['edit'] ?? 'img';
        const current = foundry.utils.getProperty(this.document._source, attr);
        // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.ux.FilePicker is the V14 file-picker constructor; not in shipped types
        const FilePickerCtor = CONFIG.ux.FilePicker as unknown as new (options: Record<string, unknown>) => { browse: () => Promise<void> };
        const fp = new FilePickerCtor({
            current,
            type: 'image',
            callback: async (path: string) => this.document.update({ [attr]: path }),
            position: {
                top: this.position.top + 40,
                left: this.position.left + 10,
            },
        });
        await fp.browse();
    }

    /* -------------------------------------------- */

    /**
     * Toggle edit mode for actor-owned items.
     */
    static #toggleEditMode(this: BaseItemSheet, _event: Event, _target: HTMLElement): void {
        if (!this.canEdit) return;
        this.#editMode = !this.#editMode;
        void this.render();
    }

    /* -------------------------------------------- */

    /**
     * The ActiveEffect-owning document for this sheet. Consumed by the shared
     * `api/effect-actions.ts` handlers (effectEdit / effectDelete /
     * effectToggle) wired into DEFAULT_OPTIONS.actions.
     */
    get effectsOwner(): EffectsOwner {
        // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KItem structurally satisfies EffectsOwner; fvtt-types' ActiveEffect surface is narrower than the adapter
        return this.item as unknown as EffectsOwner;
    }

    /* -------------------------------------------- */

    /**
     * Handle creating an effect: open the same effect-creation dialog the actor
     * sheets use, on this item, with the item's `origin` back-reference laid under
     * the built effect. Dismissal creates nothing.
     */
    static async #createEffect(this: BaseItemSheet, _event: Event, _target: HTMLElement): Promise<void> {
        await EffectCreationDialog.show(this.effectsOwner, { origin: this.item.uuid });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling section visibility.
     */
    static #toggleSection(this: BaseItemSheet, _event: Event, target: HTMLElement): void {
        const sectionName = target.dataset['toggle'];
        if (sectionName === undefined || sectionName === '') return;

        // Toggle section visibility in the DOM
        const section = this.element.querySelector(`.${sectionName}`);
        if (section) {
            section.classList.toggle('collapsed');
        }
    }
}
