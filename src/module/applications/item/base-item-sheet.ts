/**
 * @file BaseItemSheet - Base item sheet built on ApplicationV2
 * Based on dnd5e's ItemSheet5e pattern for Foundry V13+
 */

import WH40K from '../../config.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import ExpandableTooltipMixin from '../api/expandable-tooltip-mixin.ts';
import PrimarySheetMixin from '../api/primary-sheet-mixin.ts';
import StatBreakdownMixin from '../api/stat-breakdown-mixin.ts';
import { getMaterializedItemSource, remapSubmitDataToVariantPaths } from '../../utils/item-variant-utils.ts';
import type { WH40KItem } from '../../documents/item.ts';

const { ItemSheetV2 } = foundry.applications.sheets;

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
export default class BaseItemSheet extends StatBreakdownMixin(ExpandableTooltipMixin(PrimarySheetMixin(ApplicationV2Mixin(ItemSheetV2 as any)))) {
    declare document: WH40KItem;

    constructor(options: Partial<ApplicationV2.Options> = {}) {
        super(options);
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
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

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-sheet-modern.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'description', group: 'primary', label: 'Description' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups: Record<string, string> = {
        primary: 'description',
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Convenience access to the item.
     */
    get item(): WH40KItem {
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
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        // Get parent context first
        const parentContext = await super._prepareContext(options);

        // Build our context
        const context: Record<string, unknown> = {
            item: this.item,
            data: this.item, // Legacy compatibility
            document: this.item, // Required for V13 {{editor}} helper
            system: this.item.system,
            source: this.isEditable ? getMaterializedItemSource(this.item) : this.item.system,
            fields: this.item.system.schema?.fields ?? {},
            effects: this.item.getEmbeddedCollection('ActiveEffect').contents,
            flags: this.item.flags,
            dh: CONFIG.wh40k || WH40K,
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
        const dh = context.dh as Record<string, unknown>;
        if (!dh.availabilities) {
            dh.availabilities = CONFIG.WH40K?.availabilities || WH40K.availabilities || {};
        }
        if (!dh.craftsmanships) {
            dh.craftsmanships = CONFIG.WH40K?.craftsmanships || WH40K.craftsmanships || {};
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
    _getTabs(): Record<string, Record<string, unknown>> {
        const tabs: Record<string, Record<string, unknown>> = {};
        const configTabs = (this.constructor as typeof BaseItemSheet).TABS;
        for (const { tab, group, label, condition } of configTabs as any) {
            if (condition && !condition(this.document)) continue;
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
    _prepareSubmitData(event: SubmitEvent, form: HTMLFormElement, formData: FormDataExtended): Record<string, unknown> {
        let submitData = super._prepareSubmitData(event, form, formData);

        // CRITICAL FIX: Clean img field if present to prevent validation errors
        // Foundry V13 has very strict validation on img field
        if ('img' in submitData) {
            const imgValue = submitData.img;

            // If img is invalid (empty, null, undefined, or no extension), remove it
            // This prevents validation errors and lets the document use its existing value
            if (!imgValue || imgValue === '' || typeof imgValue !== 'string' || imgValue.trim() === '') {
                delete submitData.img;
            } else {
                const validExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'];
                const imgStr = (imgValue as string).toLowerCase().trim();
                const hasValidExtension = validExtensions.some((ext) => imgStr.endsWith(ext));

                if (!hasValidExtension || imgStr.length < 5 || imgStr === 'null' || imgStr === 'undefined') {
                    // Invalid img - remove from submit data so it doesn't override existing valid value
                    delete submitData.img;
                }
            }
        }

        submitData = remapSubmitDataToVariantPaths(this.item, submitData);

        return submitData;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        // Handle delta inputs for numeric fields
        if (this.isEditable) {
            this.element
                .querySelectorAll('input[type="text"][data-dtype="Number"]')
                .forEach((i) => i.addEventListener('change', this._onChangeInputDelta.bind(this)));
        }

        // Auto-select number input values on focus for easy editing
        this.element.querySelectorAll('input[type="number"], input[data-dtype="Number"]').forEach((input) => {
            input.addEventListener('focus', (event) => {
                (event.target as HTMLInputElement).select();
            });
        });

        // Set up legacy effect handlers (V1 class-based handlers)
        this._setupLegacyEffectHandlers();
    }

    /* -------------------------------------------- */

    /**
     * Set up legacy effect handlers for V1-style templates using class-based selectors.
     * @protected
     */
    _setupLegacyEffectHandlers(): void {
        if (!this.isEditable) return;

        this.element.querySelectorAll('.effect-create').forEach((btn) => {
            btn.addEventListener('click', async () => {
                await this.item.createEmbeddedDocuments(
                    'ActiveEffect',
                    [
                        {
                            name: 'New Effect',
                            icon: 'icons/svg/aura.svg',
                            origin: this.item.uuid,
                            disabled: true,
                        },
                    ],
                    { renderSheet: true },
                );
            });
        });

        this.element.querySelectorAll('.effect-edit').forEach((btn) => {
            btn.addEventListener('click', () => {
                const effectId = (btn as HTMLElement).dataset.effectId;
                const effect = this.item.effects.get(effectId!);
                effect?.sheet.render(true);
            });
        });

        this.element.querySelectorAll('.effect-delete').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const effectId = (btn as HTMLElement).dataset.effectId;
                const effect = this.item.effects.get(effectId!);
                await effect?.delete();
            });
        });

        this.element.querySelectorAll('.effect-enable, .effect-disable').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const effectId = (btn as HTMLElement).dataset.effectId;
                const effect = this.item.effects.get(effectId!);
                await effect?.update({ disabled: !effect.disabled });
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

        const firstChar = value[0];
        if (firstChar === '=') {
            // Set absolute value
            const absolute = parseFloat(value.slice(1));
            if (!isNaN(absolute)) input.value = String(absolute);
        } else if (['+', '-'].includes(firstChar)) {
            // Add or subtract delta
            const current = (foundry.utils.getProperty(this.item, input.name) as number) ?? 0;
            const delta = parseFloat(value);
            if (!isNaN(delta)) input.value = String(current + delta);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an image via the file browser.
     */
    static async #onEditImage(this: BaseItemSheet, event: Event, target: HTMLElement): Promise<void> {
        const attr = target.dataset.edit ?? 'img';
        const current = foundry.utils.getProperty(this.document._source, attr);
        const fp = new CONFIG.ux.FilePicker({
            current,
            type: 'image',
            callback: (path: string) => this.document.update({ [attr]: path }),
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
        this.render();
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
                    icon: 'icons/svg/aura.svg',
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
        const effectId = (target.closest('[data-effect-id]') as HTMLElement | null)?.dataset.effectId;
        const effect = this.item.effects.get(effectId!);
        effect?.sheet.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting an effect.
     */
    static async #effectDelete(this: BaseItemSheet, event: Event, target: HTMLElement): Promise<void> {
        const effectId = (target.closest('[data-effect-id]') as HTMLElement | null)?.dataset.effectId;
        const effect = this.item.effects.get(effectId!);
        await effect?.delete();
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling an effect.
     */
    static async #effectToggle(this: BaseItemSheet, event: Event, target: HTMLElement): Promise<void> {
        const effectId = (target.closest('[data-effect-id]') as HTMLElement | null)?.dataset.effectId;
        const effect = this.item.effects.get(effectId!);
        await effect?.update({ disabled: !effect.disabled });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling section visibility.
     */
    static #toggleSection(this: BaseItemSheet, event: Event, target: HTMLElement): void {
        const sectionName = target.dataset.toggle;
        if (!sectionName) return;

        // Toggle section visibility in the DOM
        const section = this.element.querySelector(`.${sectionName}`);
        if (section) {
            section.classList.toggle('collapsed');
        }
    }
}
