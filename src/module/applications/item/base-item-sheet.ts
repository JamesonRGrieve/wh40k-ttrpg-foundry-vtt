/**
 * @file BaseItemSheet - Base item sheet built on ApplicationV2
 * Based on dnd5e's ItemSheet5e pattern for Foundry V13+
 */

import WH40K from '../../config.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import { getMaterializedItemSource, remapSubmitDataToVariantPaths } from '../../utils/item-variant-utils.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import ExpandableTooltipMixin from '../api/expandable-tooltip-mixin.ts';
import PrimarySheetMixin from '../api/primary-sheet-mixin.ts';
import StatBreakdownMixin from '../api/stat-breakdown-mixin.ts';

const { ItemSheetV2 } = foundry.applications.sheets;

/** Tab label localization keys, hoisted so the static TABS entries reference identifiers. */
const TAB_LABEL_DESCRIPTION = 'WH40K.Tabs.Description';
const TAB_LABEL_EFFECTS = 'WH40K.Tabs.Effects';

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- boundary: Foundry V14 ItemSheetV2 mixin chain requires `any` to compose; full typing pending
export default class BaseItemSheet extends StatBreakdownMixin(ExpandableTooltipMixin(PrimarySheetMixin(ApplicationV2Mixin(ItemSheetV2 as any)))) {
    declare document: WH40KItemDocument;

    constructor(options: Partial<ApplicationV2Config.DefaultOptions> = {}) {
        super(options);
    }

    /* -------------------------------------------- */

    /** @override */
    /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
    static override DEFAULT_OPTIONS = {
        tag: 'form',
        actions: {
            editImage: BaseItemSheet.#onEditImage,
            toggleEditMode: BaseItemSheet.#toggleEditMode,
            effectCreate: BaseItemSheet.#effectCreate,
            effectEdit: BaseItemSheet.#effectEdit,
            effectDelete: BaseItemSheet.#effectDelete,
            effectToggle: BaseItemSheet.#effectToggle,
            toggleSection: BaseItemSheet.#toggleSection,
        },
        tabs: [
            {
                navSelector: '.wh40k-tabs',
                contentSelector: '.wh40k-tab-content',
                initial: 'description',
            },
        ],
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
     * Convenience access to the item.
     */
    get item(): WH40KItemDocument {
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
            // Tab state
            tabs: this._getTabs(),
        };

        // Ensure dh has required config properties for selectOptions (safety measure)
        // eslint-disable-next-line no-restricted-syntax -- boundary: dh is built from heterogeneous CONFIG sources; loose shape required
        const dh = context['dh'] as { availabilities?: unknown; craftsmanships?: unknown };
        // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.WH40K is untyped at the global Foundry CONFIG level
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
                label,
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
     * Prepare form data for submission.
     * Override to clean img field before validation (V13 strictness).
     * @override
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareSubmitData returns untyped record
    _prepareSubmitData(event: SubmitEvent, form: HTMLFormElement, formData: FormDataExtended): Record<string, unknown> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: super signature varies between V13/V14 typings
        type SuperWithPrepare = { _prepareSubmitData?: (e: SubmitEvent, f: HTMLFormElement, fd: FormDataExtended) => Record<string, unknown> };
        const proto = Object.getPrototypeOf(BaseItemSheet.prototype) as SuperWithPrepare;
        let submitData = proto._prepareSubmitData?.call(this, event, form, formData) ?? {};

        // CRITICAL FIX: Clean img field if present to prevent validation errors
        // Foundry V13 has very strict validation on img field
        if ('img' in submitData) {
            const imgValue = submitData['img'];

            // If img is invalid (empty, null, undefined, or no extension), remove it
            // This prevents validation errors and lets the document use its existing value
            if (typeof imgValue !== 'string' || imgValue.trim() === '') {
                delete submitData['img'];
            } else {
                const validExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'];
                const imgStr = imgValue.toLowerCase().trim();
                const hasValidExtension = validExtensions.some((ext) => imgStr.endsWith(ext));

                if (!hasValidExtension || imgStr.length < 5 || imgStr === 'null' || imgStr === 'undefined') {
                    // Invalid img - remove from submit data so it doesn't override existing valid value
                    delete submitData['img'];
                }
            }
        }

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
            this.element
                .querySelectorAll('input[type="text"][data-dtype="Number"]')
                .forEach((i) => i.addEventListener('change', (e) => this._onChangeInputDelta(e)));
        }

        // Auto-select number input values on focus for easy editing
        this.element.querySelectorAll('input[type="number"], input[data-dtype="Number"]').forEach((input) => {
            input.addEventListener('focus', (event) => {
                (event.target as HTMLInputElement).select();
            });
        });

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
            if (!isNaN(absolute)) input.value = String(absolute);
        } else if (firstChar === '+' || firstChar === '-') {
            // Add or subtract delta
            const current = Number(foundry.utils.getProperty(this.item, input.name)) || 0;
            const delta = parseFloat(value);
            if (!isNaN(delta)) input.value = String(current + delta);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an image via the file browser.
     */
    static async #onEditImage(this: BaseItemSheet, event: Event, target: HTMLElement): Promise<void> {
        const attr = target.dataset['edit'] ?? 'img';
        const current = foundry.utils.getProperty(this.document._source, attr);
        // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.ux.FilePicker is the V14 file-picker constructor; not in shipped types
        const FilePickerCtor = CONFIG.ux.FilePicker as unknown as new (options: Record<string, unknown>) => { browse(): Promise<void> };
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
    static #toggleEditMode(this: BaseItemSheet, event: Event, target: HTMLElement): void {
        if (!this.canEdit) return;
        this.#editMode = !this.#editMode;
        void this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle creating an effect.
     */
    static async #effectCreate(this: BaseItemSheet, event: Event, target: HTMLElement): Promise<void> {
        await this.item.createEmbeddedDocuments(
            'ActiveEffect',
            [
                {
                    name: 'New Effect',
                    img: 'icons/svg/aura.svg',
                    origin: this.item.uuid,
                    disabled: true,
                },
            ],
            { renderSheet: true },
        );
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an effect.
     */
    static #effectEdit(this: BaseItemSheet, event: Event, target: HTMLElement): void {
        const effectId = target.closest<HTMLElement>('[data-effect-id]')?.dataset['effectId'];
        const effect = effectId !== undefined ? this.item.effects.get(effectId) : null;
        void effect?.sheet?.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting an effect.
     */
    static async #effectDelete(this: BaseItemSheet, event: Event, target: HTMLElement): Promise<void> {
        const effectId = target.closest<HTMLElement>('[data-effect-id]')?.dataset['effectId'];
        const effect = effectId !== undefined ? this.item.effects.get(effectId) : null;
        await effect?.delete();
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling an effect.
     */
    static async #effectToggle(this: BaseItemSheet, event: Event, target: HTMLElement): Promise<void> {
        const effectId = target.closest<HTMLElement>('[data-effect-id]')?.dataset['effectId'];
        const effect = effectId !== undefined ? this.item.effects.get(effectId) : null;
        await effect?.update({ disabled: !effect.disabled });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling section visibility.
     */
    static #toggleSection(this: BaseItemSheet, event: Event, target: HTMLElement): void {
        const sectionName = target.dataset['toggle'];
        if (sectionName === undefined || sectionName === '') return;

        // Toggle section visibility in the DOM
        const section = this.element.querySelector(`.${sectionName}`);
        if (section) {
            section.classList.toggle('collapsed');
        }
    }
}
