/**
 * @file GearSheet - ApplicationV2 sheet for gear/consumable/drug/tool items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for gear items (consumables, drugs, tools, etc.).
 */
export default class GearSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["gear"],
        actions: {
            resetUses: GearSheet.#onResetUses,
            consumeUse: GearSheet.#onConsumeUse
        },
        position: {
            width: 600,
            height: 700
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-gear-sheet-v2.hbs",
            scrollable: [".rt-gear-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "details", group: "primary", label: "Details" },
        { tab: "description", group: "primary", label: "Info" },
        { tab: "effects", group: "primary", label: "Effects" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "details"
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        this._setupGearTabs();
    }

    /* -------------------------------------------- */

    /**
     * Set up tab click listeners for gear sheet tabs.
     * @protected
     */
    _setupGearTabs() {
        const tabs = this.element.querySelectorAll(".rt-gear-tabs .rt-gear-tab");
        tabs.forEach(tab => {
            tab.addEventListener("click", (event) => {
                event.preventDefault();
                const tabName = tab.dataset.tab;
                if (!tabName) return;

                // Update active tab button
                tabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");

                // Show/hide panels
                const panels = this.element.querySelectorAll(".rt-gear-panel");
                panels.forEach(panel => {
                    panel.classList.toggle("active", panel.dataset.tab === tabName);
                });

                // Update tab group state
                this.tabGroups.primary = tabName;
            });
        });
    }

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Add gear-specific computed properties to context
        context.categoryLabel = this.item.system.categoryLabel;
        context.categoryIcon = this.item.system.categoryIcon;
        context.hasLimitedUses = this.item.system.hasLimitedUses;
        context.usesExhausted = this.item.system.usesExhausted;
        context.usesDisplay = this.item.system.usesDisplay;
        
        return context;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle reset uses action
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #onResetUses(event, target) {
        await this.item.system.resetUses();
    }

    /**
     * Handle consume use action
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #onConsumeUse(event, target) {
        await this.item.system.consume();
    }
}
