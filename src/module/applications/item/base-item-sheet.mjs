/**
 * @file BaseItemSheet - Base item sheet built on ApplicationV2
 * Based on dnd5e's ItemSheet5e pattern for Foundry V13+
 */

import ApplicationV2Mixin from "../api/application-v2-mixin.mjs";
import PrimarySheetMixin from "../api/primary-sheet-mixin.mjs";

const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * Base item sheet built on ApplicationV2.
 * All item sheets should extend this class.
 */
export default class BaseItemSheet extends PrimarySheetMixin(
    ApplicationV2Mixin(ItemSheetV2)
) {
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
            toggleSection: BaseItemSheet.#toggleSection
        },
        classes: ["rogue-trader", "sheet", "item", "rt-item-sheet"],
        form: {
            submitOnChange: true
        },
        position: {
            width: 550,
            height: 500
        },
        window: {
            resizable: true
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-sheet-modern.hbs",
            scrollable: [".rt-tab-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "description", group: "primary", label: "Description" },
        { tab: "effects", group: "primary", label: "Effects" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "description"
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
            ...await super._prepareContext(options),
            item: this.item,
            data: this.item, // Legacy compatibility
            system: this.item.system,
            source: this.isEditable ? this.item.system._source : this.item.system,
            fields: this.item.system.schema?.fields ?? {},
            effects: this.item.getEmbeddedCollection("ActiveEffect").contents,
            flags: this.item.flags,
            dh: CONFIG.rt,
            isEditable: this.isEditable,
            rollableClass: this.isEditable ? "rollable" : "",
            // Tab state
            tabs: this._getTabs()
        };

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
                cssClass: this.tabGroups[group] === tab ? "active" : ""
            };
        }
        return tabs;
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Handle delta inputs for numeric fields
        if (this.isEditable) {
            this.element.querySelectorAll('input[type="text"][data-dtype="Number"]')
                .forEach(i => i.addEventListener("change", this._onChangeInputDelta.bind(this)));
        }

        // Set up existing tab listeners (V1 compatibility)
        this._setupTabListeners();
    }

    /* -------------------------------------------- */

    /**
     * Set up tab click listeners for V1-style templates.
     * @protected
     */
    _setupTabListeners() {
        const tabs = this.element.querySelectorAll(".rt-tabs .rt-tab");
        tabs.forEach(tab => {
            tab.addEventListener("click", this._onTabClick.bind(this));
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
        const tabContainer = tab.closest(".rt-tabs");
        tabContainer.querySelectorAll(".rt-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        // Show/hide content
        const contentContainer = this.element.querySelector(".rt-tab-content");
        if (contentContainer) {
            contentContainer.querySelectorAll(".rt-tab-panel").forEach(panel => {
                panel.classList.toggle("active", panel.dataset.tab === tabName);
            });
        }

        // Update tab group state
        this.tabGroups.primary = tabName;
    }

    /* -------------------------------------------- */

    /**
     * Handle input changes to numeric form fields, allowing them to accept delta-typed inputs.
     * @param {Event} event  Triggering event.
     * @protected
     */
    _onChangeInputDelta(event) {
        const input = event.target;
        const value = input.value;
        if (["+", "-"].includes(value[0])) {
            const current = foundry.utils.getProperty(this.item, input.name) ?? 0;
            const delta = parseFloat(value);
            input.value = current + delta;
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
        const attr = target.dataset.edit ?? "img";
        const current = foundry.utils.getProperty(this.document._source, attr);
        const fp = new CONFIG.ux.FilePicker({
            current,
            type: "image",
            callback: path => this.document.update({ [attr]: path }),
            position: {
                top: this.position.top + 40,
                left: this.position.left + 10
            }
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
        await this.item.createEmbeddedDocuments("ActiveEffect", [{
            name: "New Effect",
            icon: "icons/svg/aura.svg",
            origin: this.item.uuid,
            disabled: true
        }], { renderSheet: true });
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an effect.
     * @this {BaseItemSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #effectEdit(event, target) {
        const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
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
        const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
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
        const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
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
            section.classList.toggle("collapsed");
        }
    }
}
