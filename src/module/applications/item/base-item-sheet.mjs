/**
 * @file BaseItemSheet - Base item sheet built on ApplicationV2
 * Based on dnd5e's ItemSheet5e pattern for Foundry V13+
 */

import ApplicationV2Mixin from '../api/application-v2-mixin.mjs';
import PrimarySheetMixin from '../api/primary-sheet-mixin.mjs';
import ROGUE_TRADER from '../../config.mjs';

const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * Base item sheet built on ApplicationV2.
 * All item sheets should extend this class.
 */
export default class BaseItemSheet extends PrimarySheetMixin(ApplicationV2Mixin(ItemSheetV2)) {
    constructor(options = {}) {
        super(options);
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        actions: {
            editImage: BaseItemSheet.#onEditImage,
            effectCreate: BaseItemSheet.#effectCreate,
            effectEdit: BaseItemSheet.#effectEdit,
            effectDelete: BaseItemSheet.#effectDelete,
            effectToggle: BaseItemSheet.#effectToggle,
            toggleSection: BaseItemSheet.#toggleSection,
        },
        classes: ['rogue-trader', 'sheet', 'item', 'rt-item-sheet'],
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
            template: 'systems/rogue-trader/templates/item/item-sheet-modern.hbs',
            scrollable: ['.rt-tab-content'],
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
    tabGroups = {
        primary: 'description',
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Convenience access to the item.
     * @type {Item}
     */
    get item() {
        return this.document;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = {
            ...(await super._prepareContext(options)),
            item: this.item,
            data: this.item, // Legacy compatibility
            system: this.item.system,
            source: this.isEditable ? this.item.system._source : this.item.system,
            fields: this.item.system.schema?.fields ?? {},
            effects: this.item.getEmbeddedCollection('ActiveEffect').contents,
            flags: this.item.flags,
            dh: CONFIG.rt || ROGUE_TRADER,
            isEditable: this.isEditable,
            editable: this.isEditable, // Alias for template compatibility with {{editor}} helper
            owner: this.item.isOwner, // Required for {{editor}} helper
            rollableClass: this.isEditable ? 'rollable' : '',
            // Tab state
            tabs: this._getTabs(),
        };

        // Ensure dh has required config properties for selectOptions (safety measure)
        if (!context.dh.availabilities) {
            context.dh.availabilities = CONFIG.ROGUE_TRADER?.availabilities || ROGUE_TRADER.availabilities || {};
        }
        if (!context.dh.craftsmanships) {
            context.dh.craftsmanships = CONFIG.ROGUE_TRADER?.craftsmanships || ROGUE_TRADER.craftsmanships || {};
        }

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare the tabs for the sheet.
     * @returns {object[]}
     * @protected
     */
    _getTabs() {
        const tabs = {};
        for (const { tab, group, label, condition } of this.constructor.TABS) {
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
     * @param {FormDataExtended} formData - The form data
     * @param {Event} event - The form submission event
     * @returns {object} The prepared data object
     * @override
     * @protected
     */
    _prepareSubmitData(event, form, formData) {
        const submitData = super._prepareSubmitData(event, form, formData);

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
                const imgStr = imgValue.toLowerCase().trim();
                const hasValidExtension = validExtensions.some((ext) => imgStr.endsWith(ext));

                if (!hasValidExtension || imgStr.length < 5 || imgStr === 'null' || imgStr === 'undefined') {
                    // Invalid img - remove from submit data so it doesn't override existing valid value
                    delete submitData.img;
                }
            }
        }

        return submitData;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
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
                event.target.select();
            });
        });

        // Set up existing tab listeners (V1 compatibility)
        this._setupTabListeners();

        // Set up legacy effect handlers (V1 class-based handlers)
        this._setupLegacyEffectHandlers();
    }

    /* -------------------------------------------- */

    /**
     * Set up legacy effect handlers for V1-style templates using class-based selectors.
     * @protected
     */
    _setupLegacyEffectHandlers() {
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
                const effectId = btn.dataset.effectId;
                const effect = this.item.effects.get(effectId);
                effect?.sheet.render(true);
            });
        });

        this.element.querySelectorAll('.effect-delete').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const effectId = btn.dataset.effectId;
                const effect = this.item.effects.get(effectId);
                await effect?.delete();
            });
        });

        this.element.querySelectorAll('.effect-enable, .effect-disable').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const effectId = btn.dataset.effectId;
                const effect = this.item.effects.get(effectId);
                await effect?.update({ disabled: !effect.disabled });
            });
        });
    }

    /* -------------------------------------------- */

    /**
     * Set up tab click listeners for V1-style templates.
     * @protected
     */
    _setupTabListeners() {
        const tabs = this.element.querySelectorAll('.rt-tabs .rt-tab');
        tabs.forEach((tab) => {
            tab.addEventListener('click', this._onTabClick.bind(this));
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle tab click events for V1-style templates.
     * @param {Event} event  The click event.
     * @protected
     */
    _onTabClick(event) {
        const tab = event.currentTarget;
        const tabName = tab.dataset.tab;
        if (!tabName) return;

        // Update active tab
        const tabContainer = tab.closest('.rt-tabs');
        tabContainer.querySelectorAll('.rt-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        // Show/hide content
        const contentContainer = this.element.querySelector('.rt-tab-content');
        if (contentContainer) {
            contentContainer.querySelectorAll('.rt-tab-panel').forEach((panel) => {
                panel.classList.toggle('active', panel.dataset.tab === tabName);
            });
        }

        // Update tab group state
        this.tabGroups.primary = tabName;
    }

    /* -------------------------------------------- */

    /**
     * Handle input changes to numeric form fields, allowing them to accept delta-typed inputs.
     * Supports +N (add), -N (subtract), =N (set absolute value) notation.
     * @param {Event} event  Triggering event.
     * @protected
     */
    _onChangeInputDelta(event) {
        const input = event.target;
        const value = input.value.trim();
        if (!value) return;

        const firstChar = value[0];
        if (firstChar === '=') {
            // Set absolute value
            const absolute = parseFloat(value.slice(1));
            if (!isNaN(absolute)) input.value = absolute;
        } else if (['+', '-'].includes(firstChar)) {
            // Add or subtract delta
            const current = foundry.utils.getProperty(this.item, input.name) ?? 0;
            const delta = parseFloat(value);
            if (!isNaN(delta)) input.value = current + delta;
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an image via the file browser.
     * @this {BaseItemSheet}
     * @param {PointerEvent} event  The triggering event.
     * @param {HTMLElement} target  The action target.
     */
    static async #onEditImage(event, target) {
        const attr = target.dataset.edit ?? 'img';
        const current = foundry.utils.getProperty(this.document._source, attr);
        const fp = new CONFIG.ux.FilePicker({
            current,
            type: 'image',
            callback: (path) => this.document.update({ [attr]: path }),
            position: {
                top: this.position.top + 40,
                left: this.position.left + 10,
            },
        });
        await fp.browse();
    }

    /* -------------------------------------------- */

    /**
     * Handle creating an effect.
     * @this {BaseItemSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #effectCreate(event, target) {
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
     * @this {BaseItemSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #effectEdit(event, target) {
        const effectId = target.closest('[data-effect-id]')?.dataset.effectId;
        const effect = this.item.effects.get(effectId);
        effect?.sheet.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting an effect.
     * @this {BaseItemSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #effectDelete(event, target) {
        const effectId = target.closest('[data-effect-id]')?.dataset.effectId;
        const effect = this.item.effects.get(effectId);
        await effect?.delete();
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling an effect.
     * @this {BaseItemSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #effectToggle(event, target) {
        const effectId = target.closest('[data-effect-id]')?.dataset.effectId;
        const effect = this.item.effects.get(effectId);
        await effect?.update({ disabled: !effect.disabled });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling section visibility.
     * @this {BaseItemSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleSection(event, target) {
        const sectionName = target.dataset.toggle;
        if (!sectionName) return;

        // Toggle section visibility in the DOM
        const section = this.element.querySelector(`.${sectionName}`);
        if (section) {
            section.classList.toggle('collapsed');
        }
    }
}
