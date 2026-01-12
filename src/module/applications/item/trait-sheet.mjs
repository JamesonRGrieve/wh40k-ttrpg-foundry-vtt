/**
 * @file TraitSheet - ApplicationV2 sheet for trait items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for trait items.
 */
export default class TraitSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["trait"],
        position: {
            width: 600,
            height: 720
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-trait-sheet-modern.hbs",
            scrollable: [".rt-trait-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "properties", group: "primary", label: "Properties" },
        { tab: "effects", group: "primary", label: "Effects" },
        { tab: "description", group: "primary", label: "Description" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "properties"
    };

    /* -------------------------------------------- */

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        this._setupTraitTabs();
    }

    /* -------------------------------------------- */

    /**
     * Set up tab click listeners for trait sheet tabs.
     * @protected
     */
    _setupTraitTabs() {
        const tabs = this.element.querySelectorAll(".rt-trait-tabs .rt-trait-tab");
        tabs.forEach(tab => {
            tab.addEventListener("click", (event) => {
                event.preventDefault();
                const tabName = tab.dataset.tab;
                if (!tabName) return;

                // Update active tab button
                tabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");

                // Show/hide panels
                const panels = this.element.querySelectorAll(".rt-trait-panel");
                panels.forEach(panel => {
                    panel.classList.toggle("active", panel.dataset.tab === tabName);
                });

                // Update tab group state
                this.tabGroups.primary = tabName;
            });
        });
    }
}
