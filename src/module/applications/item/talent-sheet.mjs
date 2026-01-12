/**
 * @file TalentSheet - ApplicationV2 sheet for talent items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for talent items.
 */
export default class TalentSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["talent"],
        position: {
            width: 600,
            height: 720
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-talent-sheet-modern.hbs",
            scrollable: [".rt-talent-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "properties", group: "primary", label: "Properties" },
        { tab: "prerequisites", group: "primary", label: "Prerequisites" },
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
        this._setupTalentTabs();
    }

    /* -------------------------------------------- */

    /**
     * Set up tab click listeners for talent sheet tabs.
     * @protected
     */
    _setupTalentTabs() {
        const tabs = this.element.querySelectorAll(".rt-talent-tabs .rt-talent-tab");
        tabs.forEach(tab => {
            tab.addEventListener("click", (event) => {
                event.preventDefault();
                const tabName = tab.dataset.tab;
                if (!tabName) return;

                // Update active tab button
                tabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");

                // Show/hide panels
                const panels = this.element.querySelectorAll(".rt-talent-panel");
                panels.forEach(panel => {
                    panel.classList.toggle("active", panel.dataset.tab === tabName);
                });

                // Update tab group state
                this.tabGroups.primary = tabName;
            });
        });
    }
}
