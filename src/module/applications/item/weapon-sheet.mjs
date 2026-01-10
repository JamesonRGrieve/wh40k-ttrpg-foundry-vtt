/**
 * @file WeaponSheet - ApplicationV2 sheet for weapon items
 */

import ContainerItemSheet from "./container-item-sheet.mjs";

/**
 * Sheet for weapon items with support for weapon modifications and ammunition.
 */
export default class WeaponSheet extends ContainerItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["weapon", "rt-weapon-sheet"],
        actions: {
            reload: WeaponSheet.#onReload,
            addModification: WeaponSheet.#onAddModification
        },
        position: {
            width: 560,
            height: 600
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-weapon-sheet-modern.hbs",
            scrollable: [".rt-weapon-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "stats", group: "primary", label: "Stats" },
        { tab: "qualities", group: "primary", label: "Qualities" },
        { tab: "description", group: "primary", label: "Info" },
        { tab: "effects", group: "primary", label: "Effects" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "stats"
    };

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Add CONFIG reference for templates
        context.CONFIG = CONFIG;
        
        // Add convenience flags
        context.hasActions = this.isEditable && this.item.actor;
        
        return context;
    }

    /* -------------------------------------------- */

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        
        // Set up tab listeners for the weapon-specific tabs
        this._setupWeaponTabs();
    }

    /* -------------------------------------------- */

    /**
     * Set up tab click listeners for weapon sheet tabs.
     * @protected
     */
    _setupWeaponTabs() {
        const tabs = this.element.querySelectorAll(".rt-weapon-tabs .rt-weapon-tab");
        tabs.forEach(tab => {
            tab.addEventListener("click", (event) => {
                event.preventDefault();
                const tabName = tab.dataset.tab;
                if (!tabName) return;

                // Update active tab button
                tabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");

                // Show/hide panels
                const panels = this.element.querySelectorAll(".rt-weapon-panel");
                panels.forEach(panel => {
                    panel.classList.toggle("active", panel.dataset.tab === tabName);
                });

                // Update tab group state
                this.tabGroups.primary = tabName;
            });
        });
    }

    /* -------------------------------------------- */

    /** @override */
    _canAddItem(item) {
        if (!super._canAddItem(item)) return false;

        // Each modification can only be added once
        if (this.item.items.some(i => i.name === item.name)) {
            ui.notifications.info(`Weapon can only hold one ${item.name}`);
            return false;
        }

        // Only one ammo type can be loaded
        if (item.type === "ammunition" && this.item.items.some(i => i.type === "ammunition")) {
            ui.notifications.info("Only one type of ammunition can be loaded.");
            return false;
        }

        return true;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle reload button click.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onReload(event, target) {
        await this.item.system.reload();
        ui.notifications.info(`${this.item.name} reloaded.`);
    }

    /* -------------------------------------------- */

    /**
     * Handle add modification button click.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onAddModification(event, target) {
        // Open a dialog or compendium browser to add modifications
        // For now, show a notification
        ui.notifications.info("Drag a weapon modification from a compendium to add it.");
    }
}
